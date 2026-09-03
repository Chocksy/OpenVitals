/// The server contract, and nothing else.
///
/// Two endpoints (`/api/sync/healthkit`, `/api/capture`), one better-auth
/// session cookie, and the one date format the server actually reads. Nothing
/// in this file knows about HealthKit or SwiftUI, so every shape below is
/// testable on its own.
import Foundation

enum Api {
    /// Where the app talks. Overridable on the Sync tab for a dev server.
    static let productionBase = "https://vitals.chocksy.com"

    private static let baseKey = "baseURL"

    static var base: String {
        get { UserDefaults.standard.string(forKey: baseKey) ?? productionBase }
        set {
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            UserDefaults.standard.set(
                trimmed.isEmpty ? productionBase : trimmed, forKey: baseKey)
        }
    }

    static var baseURL: URL {
        URL(string: base) ?? URL(string: productionBase)!
    }

    // MARK: - instants

    /// A formatter that writes the local offset and never `Z`.
    ///
    /// The server derives the day from the *date in the string*
    /// (`lib/healthkit.ts: dayOf`), so an instant sent as UTC moves a 23:10
    /// sample onto the wrong day for anyone east of Greenwich. Lowercase
    /// `xxxxx` writes `+03:00`, and unlike `XXXXX` or `ZZZZZ` it writes
    /// `+00:00` rather than `Z` at zero offset — so "never Z" holds in London
    /// in winter too.
    static func isoFormatter(_ zone: TimeZone) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ssxxxxx"
        f.timeZone = zone
        return f
    }

    private static let localISO = isoFormatter(.current)

    static func iso(_ date: Date) -> String { localISO.string(from: date) }

    /// The suffix the webview adds to its user agent. `app/(app)/layout.tsx`
    /// looks for `OpenVitalsiOS` and then renders no nav bar of its own, so
    /// the app's tab bar is the only navigation. Change one, change both.
    static let userAgentTag = "OpenVitalsiOS/1"

    // MARK: - the session cookie

    /// A better-auth session cookie is `better-auth.session_token`, or
    /// `__Secure-better-auth.session_token` once the site is on https. Match on
    /// the suffix so both spellings, and any future prefix, count.
    static func isSessionCookie(_ name: String) -> Bool {
        name.hasSuffix("session_token")
    }

    /// Everything the native side holds for the site. The webview is handed
    /// this list before it loads, which is the native→webview half of the
    /// bridge: sign in once in the form and the site is already signed in.
    static func cookies() -> [HTTPCookie] {
        HTTPCookieStorage.shared.cookies(for: baseURL) ?? []
    }

    /// Copy what the webview holds into the store `URLSession.shared` reads.
    /// This is the whole of "sign-in": no token flow, no keychain.
    @discardableResult
    static func adopt(_ cookies: [HTTPCookie]) -> Int {
        guard let host = baseURL.host else { return 0 }
        var taken = 0
        for cookie in cookies where host.hasSuffix(cookie.domain.hasPrefix(".")
            ? String(cookie.domain.dropFirst()) : cookie.domain) {
            HTTPCookieStorage.shared.setCookie(cookie)
            taken += 1
        }
        return taken
    }

    static var signedIn: Bool {
        (HTTPCookieStorage.shared.cookies(for: baseURL) ?? [])
            .contains { isSessionCookie($0.name) }
    }

    static func clearCookies() {
        for cookie in cookies() { HTTPCookieStorage.shared.deleteCookie(cookie) }
    }

    // MARK: - sign in

    struct Credentials: Encodable {
        let email: String
        let password: String
    }

    /// `POST /api/auth/sign-in/email`, better-auth's email+password route.
    /// Built apart from the call so a test can read the wire shape back.
    static func signInRequest(email: String, password: String) throws -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/auth/sign-in/email"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(
            Credentials(email: email, password: password))
        return req
    }

    /// better-auth answers `{"message":"Invalid email or password","code":…}`,
    /// spelling its errors `message` where our own routes say `error`.
    static func authError(_ data: Data, status: Int) -> Failure {
        let body = try? JSONDecoder().decode([String: JSON].self, from: data)
        let message = body?["message"]?.text ?? body?["error"]?.text
        return Failure(status: status, message: message ?? "sign-in failed")
    }

    /// Sign in and keep the cookie. `URLSession.shared` stores it on its own,
    /// and the response header is read as well so the one cookie that matters
    /// is in `HTTPCookieStorage` whatever the session's accept policy does.
    static func signIn(email: String, password: String) async throws {
        let request = try signInRequest(email: email, password: password)
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw authError(data, status: status)
        }
        if let fields = http?.allHeaderFields as? [String: String], let url = http?.url {
            adopt(HTTPCookie.cookies(withResponseHeaderFields: fields, for: url))
        }
        guard signedIn else {
            throw Failure(status: 0, message: "signed in, but no session cookie came back")
        }
    }

    /// `POST /api/auth/sign-out`, then forget the cookie locally either way:
    /// a server that cannot be reached must not leave the app looking signed in.
    static func signOut() async {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/auth/sign-out"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data("{}".utf8)
        _ = try? await URLSession.shared.data(for: req)
        clearCookies()
    }

    // MARK: - shapes

    /// One HealthKit sample, exactly as `lib/healthkit.ts` declares it.
    /// Sleep-stage category samples carry the stage name (`asleepCore`,
    /// `asleepDeep`, `asleepREM`, `awake`, `inBed`) in `unit`, because a
    /// category sample has no unit of its own.
    struct Sample: Codable, Equatable {
        let type: String
        let unit: String?
        let value: Double
        let start: String
        let end: String?
        let sourceBundle: String?
    }

    struct SyncBody: Encodable { let samples: [Sample] }

    struct SyncResult: Decodable {
        let ok: Bool?
        let samples: Int?
        let days: [String]?
        let readings: Int?
        let dailyLogs: Int?
        let facts: [String]?
        let habitTicks: Int?
        let dropped: Int?
        let skipped: [String]?
        /// Take all, use what we can, hide nothing: the Sync tab lists these.
        let seenNotUsed: [String]?
        let error: String?
    }

    /// A JSON value the server owns the meaning of. A chip's `value` is a
    /// number for nutrition and a string for a fact, so it round-trips as-is.
    enum JSON: Codable, Equatable {
        case string(String)
        case number(Double)
        case bool(Bool)
        case null

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if c.decodeNil() { self = .null }
            else if let d = try? c.decode(Double.self) { self = .number(d) }
            else if let b = try? c.decode(Bool.self) { self = .bool(b) }
            else { self = .string(try c.decode(String.self)) }
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.singleValueContainer()
            switch self {
            case .string(let s): try c.encode(s)
            case .number(let d): try c.encode(d)
            case .bool(let b): try c.encode(b)
            case .null: try c.encodeNil()
            }
        }

        var text: String {
            switch self {
            case .string(let s): return s
            case .number(let d):
                return d == d.rounded() ? String(Int(d)) : String(d)
            case .bool(let b): return b ? "true" : "false"
            case .null: return ""
            }
        }
    }

    /// `lib/compose.ts: Chip`, the shape the capture route returns and takes
    /// back. Sent back verbatim; the server re-checks every field anyway.
    /// Phase 24f: what the server holds for one metric.
    struct TypeTotal: Decodable, Equatable {
        let count: Int
        let first: String?
        let last: String?
        /// The HealthKit type that writes this metric, prefix stripped. The
        /// server names it so the phone needs no copy of the mapping table.
        let type: String?
    }

    /// The truth about a phone's sync, counted on the server rather than
    /// remembered by the app. A reinstall resets what the app remembers; the
    /// rows do not go anywhere.
    struct Totals: Decodable, Equatable {
        let readings: Int
        let days: Int
        let firstDay: String?
        let lastDay: String?
        let wearableDays: Int
        let perType: [String: TypeTotal]

        private static let grouped: NumberFormatter = {
            let f = NumberFormatter()
            f.numberStyle = .decimal
            return f
        }()

        static func count(_ n: Int) -> String {
            grouped.string(from: NSNumber(value: n)) ?? String(n)
        }

        /// "12,119 readings · 3,260 days · since 2022-05-29".
        var headline: String {
            guard readings > 0 || wearableDays > 0 else { return "nothing here yet" }
            var parts = ["\(Self.count(readings)) readings",
                         "\(Self.count(days)) days"]
            if wearableDays > 0 {
                parts.append("\(Self.count(wearableDays)) wearable days")
            }
            if let firstDay { parts.append("since \(firstDay)") }
            return parts.joined(separator: " · ")
        }

        /// The same rows, findable by the HealthKit type the Sync tab lists.
        var byType: [String: TypeTotal] {
            Dictionary(perType.values.compactMap { total in
                total.type.map { ($0, total) }
            }, uniquingKeysWith: { a, b in a.count >= b.count ? a : b })
        }
    }

    static func totals() async throws -> Totals {
        let req = URLRequest(
            url: baseURL.appendingPathComponent("api/sync/healthkit/totals"))
        return try await send(req)
    }

    struct Chip: Codable, Equatable, Identifiable {
        var kind: String
        var key: String
        var label: String
        var value: JSON
        var date: String
        var quote: String
        var confidence: Double
        var by: String
        var unit: String?

        var id: String { "\(kind)|\(key)|\(label)|\(date)" }
    }

    struct CaptureResult: Decodable {
        let ok: Bool?
        /// `meal`, `supplement_label`, `medication_label`, `lab_sheet`, ...
        let kind: String?
        let basis: String?
        let confidence: Double?
        let label: String?
        let chips: [Chip]?
        /// Food numbers are guesses and say so.
        let estimated: Bool?
        /// Set when the photo went to the lab/document pipeline instead.
        let routedTo: String?
        let uploadId: String?
        let count: Int?
        let note: String?
        let error: String?
    }

    struct ConfirmBody: Encodable {
        let chips: [Chip]
        let label: String?
        let at: String?
    }

    struct ConfirmResult: Decodable {
        let ok: Bool?
        let facts: [String]?
        let day: String?
        let error: String?
    }

    struct Failure: LocalizedError {
        let status: Int
        let message: String
        var errorDescription: String? {
            status > 0 ? "\(status): \(message)" : message
        }
    }

    // MARK: - calls

    /// `POST /api/sync/healthkit` with `{ samples: [...] }`.
    static func sync(_ samples: [Sample]) async throws -> SyncResult {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/sync/healthkit"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(SyncBody(samples: samples))
        return try await send(req)
    }

    /// `POST /api/capture` as multipart: a photo, chips back, nothing written.
    static func capture(photo: Data, fileName: String = "photo.jpg",
                        caption: String = "", takenAt: Date? = nil) async throws -> CaptureResult {
        let boundary = "ov-\(UUID().uuidString)"
        var fields = ["caption": caption]
        if let takenAt { fields["takenAt"] = iso(takenAt) }
        var req = URLRequest(url: baseURL.appendingPathComponent("api/capture"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)",
                     forHTTPHeaderField: "Content-Type")
        req.httpBody = multipart(boundary: boundary, photo: photo,
                                 fileName: fileName, fields: fields)
        return try await send(req)
    }

    /// `POST /api/capture` as JSON: the person confirmed, so it writes.
    static func confirm(chips: [Chip], label: String?, at: String?) async throws -> ConfirmResult {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/capture"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(
            ConfirmBody(chips: chips, label: label, at: at))
        return try await send(req)
    }

    /// The multipart body, built by hand because one photo and two strings do
    /// not need a library. Pure, so a test can read it back.
    static func multipart(boundary: String, photo: Data, fileName: String,
                          fields: [String: String]) -> Data {
        var body = Data()
        func add(_ s: String) { body.append(Data(s.utf8)) }
        for key in fields.keys.sorted() {
            add("--\(boundary)\r\n")
            add("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
            add("\(fields[key]!)\r\n")
        }
        add("--\(boundary)\r\n")
        add("Content-Disposition: form-data; name=\"photo\"; filename=\"\(fileName)\"\r\n")
        add("Content-Type: image/jpeg\r\n\r\n")
        body.append(photo)
        add("\r\n--\(boundary)--\r\n")
        return body
    }

    private static func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        // The routes answer JSON on every path they own, including 401 and 500,
        // so decode first and use the status only for the message.
        if let decoded = try? JSONDecoder().decode(T.self, from: data),
           (200..<300).contains(status) {
            return decoded
        }
        let message = (try? JSONDecoder().decode([String: JSON].self, from: data))?["error"]?.text
            ?? String(data: data.prefix(400), encoding: .utf8)
            ?? "no reply"
        throw Failure(status: status,
                      message: status == 401 ? "not signed in" : message)
    }
}

// MARK: - the contract (phase 32, section 6)
//
// One struct per endpoint, in the order the spec lists them. Dates are
// `YYYY-MM-DD`, times `HH:MM`, numbers are numbers, every number carries its
// unit, and every estimate carries its flag. Fields the server may not send
// yet are optional; nothing here invents a value.

extension Api {

    // MARK: GET /api/today

    struct Today: Codable, Equatable {
        struct Sentence: Codable, Equatable {
            let head: String
            let tail: String
            /// "ok" | "warn" | "bad" | "none"
            let tone: String
        }

        struct Status: Codable, Equatable {
            let off: Int
            let borderline: Int
            let optimal: Int
            let drawDate: String?
            let since: String?

            var counted: Int { off + borderline + optimal }
        }

        struct BodyCard: Codable, Equatable {
            let headline: String?
            let unit: String?
            let line: String
        }

        struct Code: Codable, Equatable, Identifiable {
            let code: String
            let name: String
            var id: String { code }
        }

        struct Draw: Codable, Equatable {
            let weeks: Int
            let codes: [Code]
        }

        struct BloodCard: Codable, Equatable {
            let off: Int
            let total: Int
            let nextDraw: Draw?
        }

        struct PlanCard: Codable, Equatable {
            let headline: String
            let todo: Int
        }

        struct System: Codable, Equatable, Identifiable {
            let id: String
            let name: String
            /// "off" | "borderline" | "good" | "never measured"
            let word: String
            let value: Double?
            let unit: String?
            let marker: String?

            /// "TPO 320 IU/mL", or nothing when nothing was ever measured.
            var reading: String? {
                guard let value, let marker else { return nil }
                let unit = unit.map { " \($0)" } ?? ""
                return "\(marker) \(Design.number(value))\(unit)"
            }
        }

        let sentence: Sentence
        let status: Status
        let body: BodyCard
        let blood: BloodCard
        let plan: PlanCard
        let systems: [System]
    }

    // MARK: GET /api/body

    struct BodyDay: Codable, Equatable {
        struct Synced: Codable, Equatable {
            let types: Int
            let lastAt: String?
        }

        struct Row: Codable, Equatable, Identifiable {
            let type: String
            let name: String
            let identifier: String
            let source: String
            let value: Double?
            let unit: String?
            let display: String
            let note: String
            let word: String
            let when: String

            var id: String { identifier }
            /// "StepCount · iPhone · Sep 2" — the type, the writer, the day.
            var provenance: String { "\(type) · \(source) · \(when)" }
        }

        let day: String
        let synced: Synced
        let rows: [Row]
    }

    // MARK: GET /api/plan/today

    struct PlanDay: Codable, Equatable {
        struct Row: Codable, Equatable, Identifiable {
            let itemId: String?
            let time: String?
            let slot: String?
            let title: String
            let why: String
            /// "protocol" | "goal" | "every day" | "suggested"
            let tag: String
            let done: Bool
            let adherence: Double?

            var id: String { itemId ?? "\(time ?? slot ?? "")|\(title)" }

            /// The right-hand word: the adherence when there is one, else the
            /// tag. Never both, never a number without its sign.
            var badge: String {
                guard let adherence else { return tag }
                return "\(Int((adherence * 100).rounded())) %"
            }
        }

        let day: String
        let done: Int
        let total: Int
        let rows: [Row]
    }

    /// `POST /api/habits`. The route answers with the habit row today; `ok` is
    /// what the contract promises, so both are optional and neither is needed.
    struct HabitAck: Codable, Equatable {
        let ok: Bool?
        let itemId: String?
        let day: String?
        let done: Bool?
    }

    // MARK: GET/POST /api/meals

    struct Macros: Codable, Equatable {
        let kcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
        /// The contract writes `true` on a photo's numbers. A meal that came
        /// off a scale or a barcode carries `false`, and wears no "est.".
        let estimated: Bool

        enum CodingKeys: String, CodingKey {
            case kcal
            case proteinG = "protein_g"
            case carbsG = "carbs_g"
            case fatG = "fat_g"
            case estimated
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            kcal = try c.decode(Double.self, forKey: .kcal)
            proteinG = try c.decode(Double.self, forKey: .proteinG)
            carbsG = try c.decode(Double.self, forKey: .carbsG)
            fatG = try c.decode(Double.self, forKey: .fatG)
            estimated = try c.decodeIfPresent(Bool.self, forKey: .estimated) ?? true
        }

        init(kcal: Double, proteinG: Double, carbsG: Double, fatG: Double,
             estimated: Bool) {
            self.kcal = kcal
            self.proteinG = proteinG
            self.carbsG = carbsG
            self.fatG = fatG
            self.estimated = estimated
        }

        /// "est." or nothing. One word, and it is never left off a guess.
        var mark: String { estimated ? " est." : "" }
    }

    struct MealItem: Codable, Equatable, Identifiable {
        let name: String
        let portion: String
        let kcal: Double
        let proteinG: Double
        let carbsG: Double
        let fatG: Double
        let estimated: Bool

        var id: String { "\(name)|\(portion)" }

        enum CodingKeys: String, CodingKey {
            case name, portion, kcal, estimated
            case proteinG = "protein_g"
            case carbsG = "carbs_g"
            case fatG = "fat_g"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            name = try c.decode(String.self, forKey: .name)
            portion = try c.decode(String.self, forKey: .portion)
            kcal = try c.decode(Double.self, forKey: .kcal)
            proteinG = try c.decode(Double.self, forKey: .proteinG)
            carbsG = try c.decode(Double.self, forKey: .carbsG)
            fatG = try c.decode(Double.self, forKey: .fatG)
            estimated = try c.decodeIfPresent(Bool.self, forKey: .estimated) ?? true
        }
    }

    struct MealMove: Codable, Equatable, Identifiable {
        let what: String
        let line: String
        var id: String { what }
    }

    struct Meal: Codable, Equatable, Identifiable {
        let id: String
        let time: String
        let photo: String?
        let label: String
        let items: [MealItem]
        let totals: Macros
        let moves: [MealMove]

        /// "from a photo · 13:05", or "logged in Health · 08:05".
        var basis: String {
            (photo == nil ? "logged in Health" : "from a photo") + " · \(time)"
        }
    }

    struct MealDay: Codable, Equatable {
        let day: String
        let meals: [Meal]
        let totals: Macros

        var fromPhoto: Int { meals.filter { $0.photo != nil }.count }
    }

    // MARK: GET /api/genome

    struct Genome: Codable, Equatable {
        struct File: Codable, Equatable {
            let name: String
            let readAt: String
        }

        struct Verdict: Codable, Equatable, Identifiable {
            let conditionId: String
            let name: String
            /// "up" | "down" | "none"
            let direction: String
            let factor: Double
            let grade: String
            let reason: String
            let testNeeded: Bool
            let absent: Bool
            var id: String { conditionId }
        }

        struct Gene: Codable, Equatable, Identifiable {
            let verdict: String
            let gene: String
            let call: String
            let grade: String
            let moved: String
            let source: String
            let rsids: [String]
            var id: String { gene }
        }

        let file: File?
        let verdicts: [Verdict]
        let genes: [Gene]
    }

    // MARK: GET /api/research

    struct Paper: Codable, Equatable, Identifiable {
        struct Moves: Codable, Equatable {
            let conclusionId: String
            let name: String
            /// "up" | "down" | "none"
            let direction: String
            let delta: Double
        }

        let id: String
        let conditionId: String
        let source: String
        let externalId: String
        let title: String
        let journal: String
        let publishedAt: String
        let grade: String
        let finding: String
        let abstract: String?
        let moves: Moves?
        let foundAt: String
        let seenAt: String?
        let dismissedAt: String?
    }

    struct ResearchList: Codable, Equatable {
        let rows: [Paper]
    }

    // MARK: - the calls

    /// Every GET goes through here so the user-agent tag, the cookie jar and
    /// the fixture seam are in one place.
    static func get(_ path: String, query: [String: String] = [:]) -> URLRequest {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            components?.queryItems = query.keys.sorted().map {
                URLQueryItem(name: $0, value: query[$0])
            }
        }
        var req = URLRequest(url: components?.url ?? baseURL.appendingPathComponent(path))
        req.setValue(userAgentTag, forHTTPHeaderField: "X-OpenVitals-Client")
        return req
    }

    static func today() async throws -> Today {
        if let canned: Today = Fixtures.canned("today") { return canned }
        return try await send(get("api/today"))
    }

    static func body(day: String? = nil) async throws -> BodyDay {
        if let canned: BodyDay = Fixtures.canned("body") { return canned }
        return try await send(get("api/body", query: day.map { ["d": $0] } ?? [:]))
    }

    static func planToday(day: String? = nil) async throws -> PlanDay {
        if let canned: PlanDay = Fixtures.canned("plan-today") { return canned }
        return try await send(get("api/plan/today", query: day.map { ["d": $0] } ?? [:]))
    }

    static func tick(itemId: String, day: String, done: Bool) async throws -> HabitAck {
        if let canned: HabitAck = Fixtures.canned("habits") { return canned }
        var req = URLRequest(url: baseURL.appendingPathComponent("api/habits"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(
            withJSONObject: ["itemId": itemId, "day": day, "done": done])
        return try await send(req)
    }

    static func meals(day: String? = nil) async throws -> MealDay {
        if let canned: MealDay = Fixtures.canned("meals") { return canned }
        return try await send(get("api/meals", query: day.map { ["d": $0] } ?? [:]))
    }

    /// `POST /api/meals` multipart. One photo in, one meal back.
    static func postMeal(photo: Data, fileName: String = "meal.jpg",
                         day: String? = nil, time: String? = nil) async throws -> Meal {
        if let canned: Meal = Fixtures.canned("meal") { return canned }
        let boundary = "ov-\(UUID().uuidString)"
        var fields: [String: String] = [:]
        if let day { fields["day"] = day }
        if let time { fields["time"] = time }
        var req = URLRequest(url: baseURL.appendingPathComponent("api/meals"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)",
                     forHTTPHeaderField: "Content-Type")
        req.httpBody = multipart(boundary: boundary, photo: photo,
                                 fileName: fileName, fields: fields)
        return try await send(req)
    }

    static func genome() async throws -> Genome {
        if let canned: Genome = Fixtures.canned("genome") { return canned }
        return try await send(get("api/genome"))
    }

    static func research(unseenOnly: Bool = false) async throws -> ResearchList {
        if let canned: ResearchList = Fixtures.canned("research") { return canned }
        return try await send(get("api/research",
                                  query: unseenOnly ? ["unseen": "1"] : [:]))
    }

    /// Today, as `YYYY-MM-DD`, in the phone's own zone.
    static func localDay(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
