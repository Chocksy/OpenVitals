import PhotosUI
import SwiftUI
import UIKit

// Phase 43C: the setup flow on the phone. The server decides every screen
// (`/api/setup`, `lib/setup-server.ts`); this only draws the JSON and posts
// the answers back. Spec: docs/plans/2026-09-29-phase43-setup-spec.md.

/// The pure pieces `SetupView` draws from, kept out of the view so the tests
/// can read them.
enum SetupFlow {

    /// One compiled fixture per screen kind, in the order the flow runs.
    static let fixtures = ["setup-intro", "setup-upload", "setup-basics", "setup-body",
                           "setup-question", "setup-treatments", "setup-data",
                           "setup-reveal", "setup-reveal-case"]

    /// Skip everywhere except the two screens the flow cannot go on without,
    /// and the reveal, which is the end.
    static func skippable(_ kind: String) -> Bool {
        !["intro", "basics", "reveal"].contains(kind)
    }

    /// The picture sits under these screens. Before sex and age it is empty
    /// by contract, and the reveal draws its own.
    static func showsPicture(_ kind: String) -> Bool {
        ["body", "question", "treatments", "data"].contains(kind)
    }

    /// Whole-point moves of two or more, per condition. A row that just
    /// arrived has none: "+47" on a population prior nobody moved misleads.
    static func deltas(from was: [Api.PictureRow], to now: [Api.PictureRow]) -> [String: Int] {
        let before = Dictionary(was.map { ($0.id, $0.p) }, uniquingKeysWith: { a, _ in a })
        var out: [String: Int] = [:]
        for row in now {
            guard let from = before[row.id] else { continue }
            let d = Int((row.p * 100).rounded()) - Int((from * 100).rounded())
            if abs(d) >= 2 { out[row.id] = d }
        }
        return out
    }

    /// "+19", "−7" (a real minus sign).
    static func deltaText(_ d: Int) -> String { d > 0 ? "+\(d)" : "−\(abs(d))" }

    /// "Yes moves Iron deficiency 12 → 31", the Home card's own words.
    static func movesLine(_ o: Api.SetupOption) -> String? {
        o.moves.map { "\(o.label) moves \($0.name) \($0.from) → \($0.to)" }
    }

    static func barLabel(_ p: Double) -> String { "\(Int((p * 100).rounded()))%" }

    /// `PROFILE_QUESTIONS.sex.options`. The basics screen does not carry
    /// them, so they live here; the server rejects anything else.
    static let sexes = ["Female", "Male"]
    static let chips = ["Iron", "Vitamin D", "B12", "Thyroid hormone", "Statin", "Metformin", "Other"]
    static let routes: [(label: String, value: String)] = [("Oral", "oral"), ("IV", "iv"),
                                                           ("Injection", "injection")]

    private static let monthFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM"
        return f
    }()

    static func date(_ month: String) -> Date? { monthFormat.date(from: month) }
    static func month(_ date: Date) -> String { monthFormat.string(from: date) }

    /// One row of the treatments screen as it is being filled in.
    struct TreatmentDraft: Identifiable {
        let id = UUID()
        var what = ""
        var other = ""
        var route = "oral"
        var started = Date()
        var still = true
        var stopped = Date()

        var name: String {
            (what == "Other" ? other : what).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        var ready: Bool { !name.isEmpty }

        /// `Treatment` on the server: months as `YYYY-MM`, no `stopped`
        /// while it is still taken.
        var posted: [String: Any] {
            var out: [String: Any] = ["what": name, "route": route,
                                      "started": SetupFlow.month(started)]
            if !still { out["stopped"] = SetupFlow.month(max(stopped, started)) }
            return out
        }
    }

    // MARK: fixtures

    static func canned(_ name: String) -> Api.SetupBody? {
        #if DEBUG
        guard let text = Fixtures.json[name] else { return nil }
        return try? JSONDecoder().decode(Api.SetupBody.self, from: Data(text.utf8))
        #else
        return nil
        #endif
    }

    /// The screen to open on: the server's, or under `-OVFixtures YES
    /// -OVScreen setup-<kind>` the canned one.
    static func load() async throws -> Api.SetupBody {
        #if DEBUG
        if Fixtures.on, let b = canned(Fixtures.screen ?? "setup-intro") { return b }
        #endif
        return try await Api.setup()
    }

    static func post(_ body: [String: Any]) async throws -> Api.SetupBody {
        #if DEBUG
        if Fixtures.on { return try walk(body) }
        #endif
        return try await Api.setupPost(body)
    }

    /// Offline: every post moves to the next canned screen, so the gallery
    /// and a fixture run can tap through the whole flow.
    static func walk(_ body: [String: Any]) throws -> Api.SetupBody {
        let order = Array(fixtures.dropLast())
        let at = order.firstIndex(of: "setup-\(body["screen"] as? String ?? "")") ?? 0
        guard let next = canned(order[min(at + 1, order.count - 1)]) else {
            throw Api.Failure(status: 0, message: "no fixture")
        }
        return next
    }
}

// MARK: - the upload in the background

/// The lab photo reads while the person goes on; the reveal waits for it.
/// It goes through `Api.capture`, the door the Add sheet's photo uses, which
/// hands a lab sheet to the upload pipeline.
@MainActor
@Observable
final class SetupUpload {
    private(set) var task: Task<String?, Never>?
    private(set) var error: String?

    var pending: Bool { task != nil }

    func start(_ photo: Data) {
        error = nil
        task = Task {
            do {
                let read = try await Api.capture(photo: photo, caption: "Lab report",
                                                 takenAt: Date())
                if let e = read.error { return e }
                return read.routedTo == nil ? "That photo did not read as a lab report." : nil
            } catch {
                return error.localizedDescription
            }
        }
    }

    /// Nil when the report read, or when nothing was sent.
    func wait() async {
        guard let task else { return }
        error = await task.value
        self.task = nil
    }

    /// A picked photo as the JPEG the capture route expects.
    static func jpeg(_ item: PhotosPickerItem) async -> Data? {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return nil }
        return image.jpegData(compressionQuality: 0.8)
    }
}

// MARK: - the flow

struct SetupView: View {
    let onClose: () -> Void
    var initial: Api.SetupBody?
    var load: () async throws -> Api.SetupBody = SetupFlow.load
    var post: ([String: Any]) async throws -> Api.SetupBody = SetupFlow.post

    @State private var now: Api.SetupBody?
    /// The previous reply's picture; nil until the first answer, so a
    /// screen opened cold shows no "+47" moves it never saw.
    @State private var was: [Api.PictureRow]?
    @State private var busy = false
    @State private var failed: String?
    @State private var taps = 0
    @State private var upload = SetupUpload()
    @State private var reading = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(spacing: 0) {
            top
            ScrollView {
                VStack(alignment: .leading, spacing: DesignTokens.s21) {
                    if let now {
                        screen(now)
                            .id(Self.key(now.screen))
                            .transition(.opacity)
                        if SetupFlow.showsPicture(now.screen.kind) {
                            PictureCard(rows: now.picture,
                                        deltas: was.map { SetupFlow.deltas(from: $0, to: now.picture) } ?? [:])
                        }
                    } else if failed == nil {
                        ProgressView().tint(Hy.ink2)
                            .frame(maxWidth: .infinity, minHeight: 300)
                    }
                    if let failed {
                        Text(failed).hType(13, .medium, Hy.rose)
                            .fixedSize(horizontal: false, vertical: true)
                        if now == nil {
                            HyAction(title: "Try again", kind: .secondary, wide: false) {
                                Task { await reload() }
                            }
                        }
                    }
                }
                .padding(.horizontal, DesignTokens.s21)
                .padding(.vertical, DesignTokens.s13)
            }
            .scrollDismissesKeyboard(.interactively)
            if let now, SetupFlow.skippable(now.screen.kind) {
                HyAction(title: "Skip", kind: .text) { skip(now.screen) }
                    .disabled(busy)
                    .padding(.bottom, DesignTokens.s8)
            }
        }
        .background(Hy.paper.ignoresSafeArea())
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
        .task {
            if now == nil, let initial { now = initial }
            if now == nil { await reload() }
        }
    }

    /// A new question is a new screen, so its fields start empty.
    static func key(_ s: Api.SetupScreen) -> String {
        if case .question(let key, _, _) = s { return "question:\(key)" }
        return s.kind
    }

    // MARK: chrome

    private var top: some View {
        HStack(spacing: DesignTokens.s13) {
            GeometryReader { g in
                let p = now.map { Double($0.progress.at) / Double(max(1, $0.progress.of)) } ?? 0
                ZStack(alignment: .leading) {
                    Capsule().fill(Hy.paper2)
                    Capsule().fill(Hy.plum3).frame(width: g.size.width * min(1, max(0, p)))
                }
                .motion(Curve.ease.animation(0.6), value: p)
            }
            .frame(height: 5)
            .accessibilityElement()
            .accessibilityLabel("Setup progress")
            .accessibilityValue(now.map { "\($0.progress.at) of \($0.progress.of)" } ?? "")
            if now?.screen.kind != "reveal" {
                Button("Finish later", action: onClose)
                    .hType(13, .semibold, Hy.ink2)
                    .frame(minHeight: 44)
            }
        }
        .padding(.horizontal, DesignTokens.s21)
        .padding(.top, DesignTokens.s8)
    }

    @ViewBuilder
    private func screen(_ b: Api.SetupBody) -> some View {
        switch b.screen {
        case .intro(let goals):
            IntroScreen(goals: goals, busy: busy, tap: tap, send: send)
        case .upload:
            UploadScreen(pick: picked, busy: busy)
        case .basics(let sex, let year, let country):
            BasicsScreen(sex: sex ?? "", year: year ?? "", country: country ?? "",
                         busy: busy, tap: tap, send: send)
        case .body(let height, let weight, let waist):
            BodyScreen(height: height ?? "", weight: weight ?? "", waist: waist ?? "",
                       busy: busy, send: send)
        case .question(let key, let question, let options):
            QuestionScreen(key: key, question: question, options: options,
                           busy: busy, tap: tap, send: send)
        case .treatments(let current):
            TreatmentsScreen(current: current, busy: busy, tap: tap, send: send)
        case .data(let needsUpload):
            DataScreen(needsUpload: needsUpload && !upload.pending, busy: busy,
                       pick: { upload.start($0) }, send: send)
        case .reveal(let r):
            RevealScreen(r: r, reading: reading, uploadError: upload.error, busy: busy) {
                Task {
                    guard await send(["screen": "reveal"]) else { return }
                    onClose()
                }
            }
            .task(id: upload.pending) { await waitForUpload() }
        }
    }

    // MARK: actions

    private func tap() { taps += 1 }

    private func reload() async {
        failed = nil
        do {
            let next = try await load()
            Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { now = next }
        } catch {
            failed = error.localizedDescription
        }
    }

    /// Posts one screen's answers; the reply is the next screen. False when
    /// the server said no, and the screen stays with its message.
    @discardableResult
    private func send(_ body: [String: Any]) async -> Bool {
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        failed = nil
        do {
            let next = try await post(body)
            was = now?.picture ?? []
            Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { now = next }
            return true
        } catch {
            failed = error.localizedDescription
            return false
        }
    }

    private func skip(_ s: Api.SetupScreen) {
        tap()
        var body: [String: Any] = ["screen": s.kind, "skip": true]
        if case .question(let key, _, _) = s { body["key"] = key }
        Task { await send(body) }
    }

    /// The upload screen: the read starts, the flow goes on at once.
    private func picked(_ photo: Data) {
        tap()
        upload.start(photo)
        Task { await send(["screen": "upload", "skip": true]) }
    }

    /// On the reveal: "Reading your report…" until the photo is read, then
    /// the reveal again, now with what the report said.
    private func waitForUpload() async {
        guard upload.pending else { return }
        reading = true
        await upload.wait()
        if let next = try? await load() {
            Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { now = next }
        }
        reading = false
    }
}

// MARK: - pieces

private struct Title: View {
    let text: String
    var sub: String?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text(text).hType(26, .semibold, Hy.ink, tracking: -0.02)
                .fixedSize(horizontal: false, vertical: true)
            if let sub {
                Text(sub).hType(15, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A large tap target. `on` draws it chosen.
private struct Choice: View {
    let label: String
    var note: String?
    var on = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 3) {
                Text(label).hType(17, .semibold, on ? Hy.cream : Hy.ink)
                if let note {
                    Text(note).hType(12, .regular, on ? Hy.cream.opacity(0.8) : Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 55, alignment: .leading)
            .padding(.horizontal, DesignTokens.s13)
            .padding(.vertical, DesignTokens.s5)
            .background {
                if on {
                    RoundedRectangle(cornerRadius: 17, style: .continuous).fill(Hy.plum)
                } else {
                    Color.clear.grained(Hy.card, radius: 17, shadow: 0.18)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
        }
        .buttonStyle(Pressed(scale: 0.97))
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A small chip, for the treatments rows.
private struct SetupChip: View {
    let label: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label).hType(14, .semibold, on ? Hy.cream : Hy.ink)
                .padding(.horizontal, DesignTokens.s13)
                .frame(minHeight: 44)
                .background(Capsule().fill(on ? Hy.plum : Hy.paper2))
                .contentShape(Capsule())
        }
        .buttonStyle(Pressed(scale: 0.94))
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

private struct Field: View {
    let label: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            Text(label).hType(13, .medium, Hy.ink2)
            TextField("", text: $text)
                .font(.grotesk(17, .semibold))
                .foregroundStyle(Hy.ink)
                .keyboardType(keyboard)
                .padding(.horizontal, DesignTokens.s13)
                .frame(minHeight: 50)
                .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Hy.card))
                .accessibilityLabel(label)
        }
    }
}

/// Up to three bars, each with its share and how far the last answer moved it.
private struct PictureCard: View {
    let rows: [Api.PictureRow]
    var deltas: [String: Int] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text("YOUR PICTURE SO FAR").hType(11, .semibold, Hy.ink2, tracking: 0.08)
            if rows.isEmpty {
                Text("Nothing stands out yet.").hType(14, .regular, Hy.ink2)
            } else {
                Text("These start as the odds for your sex and age. Each answer moves them.")
                    .hType(13, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(row.name).hType(14, .semibold, Hy.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        if let d = deltas[row.id] {
                            Text(SetupFlow.deltaText(d))
                                .hType(12, .semibold, d > 0 ? Hy.plum3 : Hy.ink3)
                                .transition(.opacity)
                        }
                        Text(SetupFlow.barLabel(row.p)).hType(17, .semibold, Hy.ink, tracking: -0.02)
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Hy.paper2)
                            Capsule().fill(Hy.plum3)
                                .frame(width: max(4, g.size.width * min(1, row.p)))
                        }
                    }
                    .frame(height: 5)
                    .motion(Curve.ease.animation(0.6), value: row.p)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.3)
    }
}

// MARK: - the screens

private struct IntroScreen: View {
    let goals: [String]
    let busy: Bool
    let tap: () -> Void
    let send: ([String: Any]) async -> Bool
    @State private var goal: String?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "What brings you here?",
                  sub: "A few quick questions build your first picture. Every answer saves as you go.")
            ForEach(goals, id: \.self) { g in
                Choice(label: g, on: goal == g) { tap(); goal = g }
            }
            Title(text: "Do you have a lab report with you?")
                .padding(.top, DesignTokens.s13)
            HStack(spacing: DesignTokens.s8) {
                ForEach([true, false], id: \.self) { has in
                    Choice(label: has ? "Yes" : "No") {
                        guard let goal else { return }
                        tap()
                        Task { await send(["screen": "intro", "goal": goal, "hasReport": has]) }
                    }
                }
            }
            .disabled(goal == nil || busy)
            .opacity(goal == nil ? 0.45 : 1)
        }
    }
}

private struct UploadScreen: View {
    let pick: (Data) -> Void
    let busy: Bool
    @State private var item: PhotosPickerItem?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "Add your lab report",
                  sub: "Pick a photo of the first page. It reads in the background while you answer the rest.")
            PhotosPicker(selection: $item, matching: .images) {
                Text("Choose a photo").hType(15, .semibold, Hy.plum)
                    .frame(maxWidth: .infinity, minHeight: 55)
                    .background(Capsule().fill(Hy.lime))
            }
            .buttonStyle(Pressed(scale: 0.96))
            .disabled(busy)
            .onChange(of: item) { _, new in
                guard let new else { return }
                Task { if let data = await SetupUpload.jpeg(new) { pick(data) } }
            }
            Text("A PDF goes in from the website, or later from +.")
                .hType(13, .regular, Hy.ink2)
        }
    }
}

private struct BasicsScreen: View {
    @State var sex: String
    @State var year: String
    @State var country: String
    let busy: Bool
    let tap: () -> Void
    let send: ([String: Any]) async -> Bool

    private var ready: Bool {
        !sex.isEmpty && !year.trimmingCharacters(in: .whitespaces).isEmpty
            && !country.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "The basics", sub: "Sex and age decide which conditions apply to you.")
            Text("Biological sex").hType(13, .medium, Hy.ink2)
            HStack(spacing: DesignTokens.s8) {
                ForEach(SetupFlow.sexes, id: \.self) { s in
                    Choice(label: s, on: sex == s) { tap(); sex = s }
                }
            }
            Field(label: "Year you were born", text: $year, keyboard: .numberPad)
            Field(label: "Country you live in", text: $country)
            HyAction(title: busy ? "Saving…" : "Continue") {
                tap()
                Task {
                    await send(["screen": "basics", "sex": sex,
                                "birthYear": year.trimmingCharacters(in: .whitespaces),
                                "country": country.trimmingCharacters(in: .whitespaces)])
                }
            }
            .disabled(!ready || busy)
        }
    }
}

private struct BodyScreen: View {
    @State var height: String
    @State var weight: String
    @State var waist: String
    let busy: Bool
    let send: ([String: Any]) async -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "Your body", sub: "Weight and waist are optional.")
            Field(label: "Height, cm", text: $height, keyboard: .decimalPad)
            Field(label: "Weight, kg", text: $weight, keyboard: .decimalPad)
            Field(label: "Waist, cm", text: $waist, keyboard: .decimalPad)
            HyAction(title: busy ? "Saving…" : "Continue") {
                var body: [String: Any] = ["screen": "body"]
                for (key, value) in [("heightCm", height), ("weightKg", weight), ("waistCm", waist)] {
                    let v = value.trimmingCharacters(in: .whitespaces)
                    if !v.isEmpty { body[key] = v }
                }
                Task { await send(body) }
            }
            .disabled(busy)
        }
    }
}

private struct QuestionScreen: View {
    let key: String
    let question: String
    let options: [Api.SetupOption]
    let busy: Bool
    let tap: () -> Void
    let send: ([String: Any]) async -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: question)
            ForEach(options, id: \.label) { o in
                Choice(label: o.label, note: SetupFlow.movesLine(o)) {
                    tap()
                    Task { await send(["screen": "question", "key": key, "value": o.label]) }
                }
            }
        }
        .disabled(busy)
    }
}

private struct TreatmentsScreen: View {
    let current: [Api.Treatment]
    let busy: Bool
    let tap: () -> Void
    let send: ([String: Any]) async -> Bool
    @State private var rows = [SetupFlow.TreatmentDraft()]

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "What do you take, or tried before?",
                  sub: "Supplements and medicines both count.")
            if !current.isEmpty {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    Text("ON YOUR LIST").hType(11, .semibold, Hy.ink2, tracking: 0.08)
                    ForEach(Array(current.enumerated()), id: \.offset) { _, t in
                        Text("\(t.what) · \(SetupFlow.routes.first { $0.value == t.route }?.label ?? t.route) · "
                             + "\(t.started) to \(t.stopped ?? "now")")
                            .hType(14, .regular, Hy.ink)
                    }
                }
            }
            ForEach($rows) { $row in
                TreatmentRow(row: $row, tap: tap)
            }
            HyAction(title: "Add another", kind: .text, wide: false) {
                tap()
                rows.append(SetupFlow.TreatmentDraft())
            }
            HyAction(title: busy ? "Saving…" : "Continue") {
                let ready = rows.filter(\.ready).map(\.posted)
                Task { await send(["screen": "treatments", "treatments": ready]) }
            }
            .disabled(busy)
        }
    }
}

private struct TreatmentRow: View {
    @Binding var row: SetupFlow.TreatmentDraft
    let tap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            FlowRow(SetupFlow.chips) { c in
                SetupChip(label: c, on: row.what == c) { tap(); row.what = c }
            }
            if row.what == "Other" {
                Field(label: "What is it?", text: $row.other)
            }
            HStack(spacing: DesignTokens.s8) {
                ForEach(SetupFlow.routes, id: \.value) { r in
                    SetupChip(label: r.label, on: row.route == r.value) { tap(); row.route = r.value }
                }
            }
            DatePicker("Started", selection: $row.started, in: ...Date(), displayedComponents: .date)
                .hType(14, .medium, Hy.ink)
            Toggle("Still taking", isOn: $row.still)
                .hType(14, .medium, Hy.ink)
                .tint(Hy.plum3)
            if !row.still {
                DatePicker("Stopped", selection: $row.stopped, in: row.started...Date(),
                           displayedComponents: .date)
                    .hType(14, .medium, Hy.ink)
            }
        }
        .padding(DesignTokens.s13)
        .grained(Hy.card, radius: 21, shadow: 0.18)
    }
}

/// Chips that wrap onto the next line.
private struct FlowRow<Content: View>: View {
    let items: [String]
    let content: (String) -> Content

    init(_ items: [String], @ViewBuilder content: @escaping (String) -> Content) {
        self.items = items
        self.content = content
    }

    var body: some View {
        Wrap(spacing: DesignTokens.s5) {
            ForEach(items, id: \.self) { content($0) }
        }
    }
}

private struct Wrap: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0, x + s.width > width { x = 0; y += line + spacing; line = 0 }
            x += s.width + spacing
            line = max(line, s.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews,
                       cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX, x + s.width > bounds.maxX {
                x = bounds.minX; y += line + spacing; line = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            line = max(line, s.height)
        }
    }
}

private struct DataScreen: View {
    let needsUpload: Bool
    let busy: Bool
    let pick: (Data) -> Void
    let send: ([String: Any]) async -> Bool
    @ObservedObject private var health = HealthSyncModel.shared
    @State private var item: PhotosPickerItem?
    @State private var picked = false

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "More data, sharper picture", sub: "Each of these is optional.")
            row("Apple Health", "Steps, sleep, heart rate and weight, synced in the background.") {
                HyAction(title: "Connect Apple Health", kind: .secondary, wide: false) {
                    Task { await health.requestAuthorization() }
                }
                .disabled(!health.available)
                if !health.status.isEmpty {
                    Text(health.status).hType(12, .regular, Hy.ink2)
                }
            }
            row("Genome", "Add a genome file from the website.") { EmptyView() }
            if needsUpload && !picked {
                row("Lab report", "A photo of the first page reads while you finish.") {
                    PhotosPicker(selection: $item, matching: .images) {
                        Text("Choose a photo").hType(15, .semibold, Hy.cream)
                            .padding(.horizontal, DesignTokens.s21)
                            .frame(height: 44)
                            .background(Capsule().fill(Hy.plum))
                    }
                    .buttonStyle(Pressed(scale: 0.96))
                    .onChange(of: item) { _, new in
                        guard let new else { return }
                        Task {
                            if let data = await SetupUpload.jpeg(new) {
                                pick(data)
                                picked = true
                            }
                        }
                    }
                }
            } else if picked {
                Text("Reading your report in the background.").hType(13, .regular, Hy.ink2)
            }
            HyAction(title: busy ? "Saving…" : "Continue") {
                Task { await send(["screen": "data"]) }
            }
            .disabled(busy)
        }
    }

    private func row<Extra: View>(_ title: String, _ line: String,
                                  @ViewBuilder extra: () -> Extra) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text(title).hType(17, .semibold, Hy.ink)
            Text(line).hType(13, .regular, Hy.ink2)
                .fixedSize(horizontal: false, vertical: true)
            extra()
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.18)
    }
}

private struct RevealScreen: View {
    let r: Api.SetupReveal
    let reading: Bool
    let uploadError: String?
    let busy: Bool
    let done: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "Your first picture")
            if reading {
                HStack(spacing: DesignTokens.s8) {
                    ProgressView().tint(Hy.ink2)
                    Text("Reading your report…").hType(14, .medium, Hy.ink2)
                }
            }
            if let uploadError {
                VStack(alignment: .leading, spacing: 3) {
                    Text(uploadError).hType(13, .medium, Hy.rose)
                    Text("Add it later from +.").hType(13, .regular, Hy.ink2)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            if r.fromAnswersOnly {
                Text("From your answers alone.").hType(14, .medium, Hy.ink2)
            }
            if let d = r.hunch?.differential {
                OurRead(d: d, specialty: r.hunch?.bestRead?.specialty)
            } else {
                PictureCard(rows: r.picture)
            }
            if let t = r.test {
                card("THE TEST THAT TELLS MOST",
                     t.label + (t.price.map { " · \($0)" } ?? ""))
            }
            if let a = r.action {
                card("ONE THING TO START", a.title + (a.dose.map { " · \($0)" } ?? ""))
            }
            HyAction(title: busy ? "Opening…" : "Open my home", action: done)
                .disabled(busy || reading)
                .padding(.top, DesignTokens.s8)
        }
    }

    private func card(_ label: String, _ line: String) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            Text(label).hType(11, .semibold, Hy.ink2, tracking: 0.08)
            Text(line).hType(15, .semibold, Hy.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.18)
    }
}
