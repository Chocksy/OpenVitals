import SwiftUI
import UserNotifications

// Phase 44D: the check-in on the phone. The server picks every question and
// its order (`/api/checkin`, `lib/checkin-server.ts`); this draws the JSON,
// posts each answer, and keeps one local reminder at the next due date. It
// reuses setup's question block and picture, as the web does.
// Spec: docs/plans/2026-09-30-phase44-checkin-spec.md, B5 and B6.

/// The pure pieces `CheckinView` draws from, kept out of the view so the
/// tests can read them.
enum CheckinFlow {

    /// One compiled fixture per screen, in the order a round runs, then the
    /// body with no round due.
    static let fixtures = ["checkin-question", "checkin-followup", "checkin-since", "checkin-idle"]

    /// "2 of 5": the question on screen, counted from one. No percent, so no bar.
    static func count(_ p: Api.SetupBody.Progress) -> String { "\(p.at + 1) of \(p.of)" }

    /// "Iron deficiency 41% → 61%, from your hair loss answer"
    static func movedLine(_ m: Api.CheckinScreen.Moved) -> String {
        "\(m.name) \(m.from)% → \(m.to)%" + (m.by.map { ", from \($0)" } ?? "")
    }

    /// "Iron deficiency got stronger, 41% → 61%"
    static func hunchLine(_ h: Api.CheckinScreen.Hunch) -> String {
        "\(h.title) got \(h.to > h.from ? "stronger" : "weaker"), \(h.from)% → \(h.to)%"
    }

    /// `later` wants minutes east of UTC, the web's `-getTimezoneOffset()`.
    static func later(_ zone: TimeZone = .current) -> [String: Any] {
        ["later": true, "offsetMin": zone.secondsFromGMT() / 60]
    }

    // MARK: fixtures

    /// A fixture run draws canned bodies and must not touch the real reminder.
    static var live: Bool { !Fixtures.on }

    static func canned(_ name: String) -> Api.CheckinBody? {
        #if DEBUG
        guard let text = Fixtures.json[name] else { return nil }
        return try? JSONDecoder().decode(Api.CheckinBody.self, from: Data(text.utf8))
        #else
        return nil
        #endif
    }

    /// The round to open on: the server's, or under `-OVFixtures YES
    /// -OVScreen checkin-<kind>` the canned one.
    static func load() async throws -> Api.CheckinBody {
        #if DEBUG
        if Fixtures.on, let b = canned(Fixtures.screen ?? "checkin-question") { return b }
        #endif
        return try await Api.checkin()
    }

    static func post(_ body: [String: Any]) async throws -> Api.CheckinBody {
        #if DEBUG
        if Fixtures.on { return try walk(body) }
        #endif
        return try await Api.checkinPost(body)
    }

    /// Offline: a question leads to the follow-up, the follow-up to `since`,
    /// and anything that ends the round (later, skip, done) to no round.
    static func walk(_ body: [String: Any]) throws -> Api.CheckinBody {
        let next: String
        if let key = body["key"] as? String {
            next = key.hasPrefix("followup_") ? "checkin-since" : "checkin-followup"
        } else {
            next = "checkin-idle"
        }
        guard let b = canned(next) else { throw Api.Failure(status: 0, message: "no fixture") }
        return b
    }
}

// MARK: - the reminder

/// One local notification, id "checkin", at the next due date. Each launch
/// replaces it. Permission is asked once, at the end of the first finished
/// check-in. No APNs, no entitlement.
enum CheckinReminder {
    static let id = "checkin"
    static let askedKey = "checkinAsked"

    /// `dueAt` as the server writes it (`toISOString`, with milliseconds), or
    /// without them.
    static func fireDate(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)
    }

    /// Drops the pending reminder and sets one at `dueAt`, unless that is in
    /// the past or notifications are not allowed.
    static func schedule(at dueAt: String) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [id])
        guard let date = fireDate(dueAt), date > Date() else { return }
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional else { return }
        let content = UNMutableNotificationContent()
        content.title = "Your check-in is ready"
        content.body = "A few questions, about a minute."
        content.sound = .default
        let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second],
                                                   from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    /// The system prompt, once per install, whatever the answer was.
    static func askOnce() async {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: askedKey) else { return }
        defaults.set(true, forKey: askedKey)
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound])
    }
}

// MARK: - the flow

struct CheckinView: View {
    let onClose: () -> Void
    var initial: Api.CheckinBody?
    var load: () async throws -> Api.CheckinBody = CheckinFlow.load
    var post: ([String: Any]) async throws -> Api.CheckinBody = CheckinFlow.post
    /// Off in the gallery and fixture runs: no reminder, no permission prompt.
    var live = CheckinFlow.live

    @State private var now: Api.CheckinBody?
    @State private var was: [Api.PictureRow]?
    @State private var busy = false
    /// "Not saved. Try again." after a failed post; the screen stays.
    @State private var failed: String?
    @State private var taps = 0
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(spacing: 0) {
            top
            ScrollView {
                VStack(alignment: .leading, spacing: DesignTokens.s21) {
                    if let now {
                        if let s = now.screen {
                            screen(s)
                                .id(Self.key(s))
                                .transition(.opacity)
                            if case .question = s {
                                PictureCard(rows: now.picture,
                                            deltas: was.map { SetupFlow.deltas(from: $0, to: now.picture) } ?? [:],
                                            hint: "Each answer moves them.")
                            }
                        } else {
                            Title(text: "No check-in right now",
                                  sub: "The next one opens on its own.")
                            HyAction(title: "Close", kind: .secondary, wide: false, action: onClose)
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
            if let now, case .question(let key, _, _, _) = now.screen {
                HyAction(title: "Skip", kind: .text) {
                    tap()
                    Task { await answer(["screen": "question", "key": key, "skip": true]) }
                }
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

    static func key(_ s: Api.CheckinScreen) -> String {
        if case .question(let key, _, _, _) = s { return "question:\(key)" }
        return s.kind
    }

    // MARK: chrome

    /// The count, "Ask later" and "Skip this round", on questions only.
    @ViewBuilder
    private var top: some View {
        if let now, case .question = now.screen {
            HStack(spacing: DesignTokens.s8) {
                Text(CheckinFlow.count(now.progress))
                    .hType(13, .semibold, Hy.ink2)
                    .accessibilityLabel("Question \(now.progress.at + 1) of \(now.progress.of)")
                Spacer()
                Button("Ask later") { leave(CheckinFlow.later()) }
                    .hType(13, .semibold, Hy.ink2)
                    .frame(minHeight: 44)
                Button("Skip this round") { leave(["skip": true]) }
                    .hType(13, .semibold, Hy.ink2)
                    .frame(minHeight: 44)
            }
            .disabled(busy)
            .padding(.horizontal, DesignTokens.s21)
            .padding(.top, DesignTokens.s8)
        }
    }

    @ViewBuilder
    private func screen(_ s: Api.CheckinScreen) -> some View {
        switch s {
        case .question(let key, let question, let why, let options):
            QuestionScreen(key: key, question: question, why: why, options: options,
                           busy: busy, tap: tap, send: answer)
        case .since(let moved, let hunches, let test):
            SinceScreen(moved: moved, hunches: hunches, test: test, busy: busy) {
                leave(["done": true], ask: true)
            }
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

    /// The next body, or nil when the save failed and the screen stays.
    private func send(_ body: [String: Any]) async -> Api.CheckinBody? {
        guard !busy else { return nil }
        busy = true
        defer { busy = false }
        failed = nil
        do {
            return try await post(body)
        } catch {
            failed = "Not saved. Try again."
            return nil
        }
    }

    /// One answer or question skip; the reply is the next screen. A reply
    /// with no screen means the round is over.
    private func answer(_ body: [String: Any]) async -> Bool {
        guard let next = await send(body) else { return false }
        guard next.screen != nil else {
            onClose()
            return true
        }
        was = now?.picture ?? []
        Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { now = next }
        return true
    }

    /// Ask later, Skip this round and Open my home leave once saved. The
    /// reply's `dueAt` is the new reminder time. `ask`: the first finished
    /// round is when the app asks to send reminders.
    private func leave(_ body: [String: Any], ask: Bool = false) {
        tap()
        Task {
            guard let next = await send(body) else { return }
            if live {
                if ask { await CheckinReminder.askOnce() }
                await CheckinReminder.schedule(at: next.dueAt)
            }
            onClose()
        }
    }
}

// MARK: - since

private struct SinceScreen: View {
    let moved: [Api.CheckinScreen.Moved]
    let hunches: [Api.CheckinScreen.Hunch]
    let test: Api.SetupReveal.Test?
    let busy: Bool
    let done: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Title(text: "Since this check-in started")
            if moved.isEmpty && hunches.isEmpty {
                Text("Nothing moved much this round.").hType(15, .regular, Hy.ink2)
            } else {
                VStack(alignment: .leading, spacing: DesignTokens.s8) {
                    ForEach(moved) { m in line(CheckinFlow.movedLine(m)) }
                    ForEach(hunches) { h in line(CheckinFlow.hunchLine(h)) }
                }
                .padding(DesignTokens.s13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .grained(Hy.card, radius: 21, shadow: 0.18)
            }
            if let test {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    Text("THE TEST TO TAKE NEXT").hType(11, .semibold, Hy.ink2, tracking: 0.08)
                    Text(test.label + (test.price.map { " · \($0)" } ?? ""))
                        .hType(15, .semibold, Hy.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Why this test: it tells the most about your picture for its price.")
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(DesignTokens.s13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .grained(Hy.card, radius: 21, shadow: 0.18)
            }
            HyAction(title: busy ? "Opening…" : "Open my home", action: done)
                .disabled(busy)
                .padding(.top, DesignTokens.s8)
        }
    }

    private func line(_ text: String) -> some View {
        Text(text).hType(15, .medium, Hy.ink)
            .fixedSize(horizontal: false, vertical: true)
    }
}
