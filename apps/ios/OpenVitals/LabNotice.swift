import BackgroundTasks
import SwiftUI
import UserNotifications

// Batch 6: new lab results get their own moment. Once per new headline the
// home opens a full-screen "Your 17 Nov results" with what changed and one
// question per plan item the draw credits. In the background a refresh task
// reads /api/today and posts the headline as a local notification when it
// is new. Nothing here deletes a plan item: Change and Drop open the chat.

/// True while Shell has setup, the check-in, its launch ask or a chat over
/// everything: the lab cover waits for it, since two covers at once drop one.
private struct ShellCoveredKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    var shellCovered: Bool {
        get { self[ShellCoveredKey.self] }
        set { self[ShellCoveredKey.self] = newValue }
    }
}

enum LabNotice {
    /// The headline the sheet last showed.
    static let seenKey = "labSeenHeadline"
    /// The headline the background refresh last posted.
    static let notifiedKey = "labNotifiedHeadline"
    static let taskId = "com.chocksy.OpenVitals.refresh"
    static let notificationId = "lab.headline"

    static var seen: String? { UserDefaults.standard.string(forKey: seenKey) }

    /// What "seen" remembers: the draw date, so a headline that only gains
    /// "· 2 goals reached" later does not reopen the same draw. The headline
    /// itself when the draw date is missing.
    static func key(headline: String?, drawDate: String?) -> String? {
        guard let headline, !headline.isEmpty else { return nil }
        return drawDate.map { String($0.prefix(10)) } ?? headline
    }

    /// The sheet shows for a headline it has not shown yet.
    static func shouldShow(_ headline: String?, seen: String?) -> Bool {
        guard let headline, !headline.isEmpty else { return false }
        return headline != seen
    }

    /// The refresh posts a headline neither the sheet nor an earlier post
    /// has shown.
    static func shouldNotify(_ headline: String?, seen: String?, notified: String?) -> Bool {
        shouldShow(headline, seen: seen) && headline != notified
    }

    /// Sign-out: the next account sees its own results.
    static func reset() {
        UserDefaults.standard.removeObject(forKey: seenKey)
        UserDefaults.standard.removeObject(forKey: notifiedKey)
    }

    static func markSeen(_ headline: String) {
        UserDefaults.standard.set(headline, forKey: seenKey)
        UserDefaults.standard.set(headline, forKey: notifiedKey)
    }

    /// "Your 17 Nov results", or "Your new results" without a draw date.
    static func title(drawDate: String?) -> String {
        guard let drawDate, let date = ymd.date(from: String(drawDate.prefix(10))) else {
            return "Your new results"
        }
        return "Your \(dayMonth.string(from: date)) results"
    }

    /// One question per plan item a "since" line credits, in the order the
    /// lines name them: "Psyllium husk" from "LDL 131 → 104 since Psyllium
    /// husk, 5 Oct".
    struct Item: Identifiable, Equatable {
        let id: String
        let name: String
        /// "LDL 131 → 104", the change it is credited with.
        let change: String
    }

    static func items(_ changes: [Api.Today.Change]) -> [Item] {
        var out: [Item] = []
        for c in changes where c.better {
            let parts = c.text.components(separatedBy: " since ")
            guard parts.count > 1 else { continue }
            var name = parts[1]
            if let comma = name.range(of: ", ", options: .backwards) {
                name = String(name[..<comma.lowerBound])
            }
            let id = c.itemId ?? name.lowercased()
            guard !name.isEmpty, !out.contains(where: { $0.id == id }) else { continue }
            out.append(Item(id: id, name: name, change: parts[0]))
        }
        return out
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let dayMonth: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "d MMM"
        return f
    }()

    // MARK: the background refresh

    /// At launch, before it finishes: iOS only hands the task to a handler
    /// registered by then.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            schedule()
            let work = Task {
                let ok = await refresh()
                task.setTaskCompleted(success: ok)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    /// Ask for the next refresh, no sooner than six hours out.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: taskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 3600)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// Read Today; post the headline when it is new.
    static func refresh() async -> Bool {
        guard Api.signedIn, let today = try? await Api.today() else { return false }
        let defaults = UserDefaults.standard
        guard let headline = today.headline,
              let key = key(headline: headline, drawDate: today.status.drawDate),
              shouldNotify(key, seen: defaults.string(forKey: seenKey),
                           notified: defaults.string(forKey: notifiedKey)) else { return true }
        let content = UNMutableNotificationContent()
        content.title = title(drawDate: today.status.drawDate)
        content.body = headline
        content.sound = .default
        // Remembered only once posted, so a failed post tries again next refresh.
        do {
            try await UNUserNotificationCenter.current()
                .add(UNNotificationRequest(identifier: notificationId, content: content, trigger: nil))
        } catch { return false }
        defaults.set(key, forKey: notifiedKey)
        return true
    }
}

/// The full-screen notice: the headline, what changed, then "Keep <item>?"
/// for each item the draw credits. `close` carries a chat to open after the
/// cover has gone, or nil.
struct LabNoticeView: View {
    let today: Api.Today
    let close: (ChatStart?) -> Void

    @State private var kept: Set<String> = []

    private var rows: [WhatChangedCard.Row] { WhatChangedCard.rows(today.changes ?? []) }
    private var items: [LabNotice.Item] { LabNotice.items(today.changes ?? []) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                Text(LabNotice.title(drawDate: today.status.drawDate))
                    .hType(28, .semibold, Hy.ink, tracking: -0.02)
                    .padding(.top, DesignTokens.s34)
                if let headline = today.headline {
                    Text(headline).hType(15, .medium, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                VStack(alignment: .leading, spacing: DesignTokens.s8) {
                    ForEach(rows) { r in
                        HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                            Circle().fill(r.colour).frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.head).hType(15, .semibold, Hy.ink)
                                if !r.since.isEmpty {
                                    Text("since " + r.since.joined(separator: " · "))
                                        .hType(12, .regular, Hy.ink2)
                                }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(DesignTokens.s13)
                .frame(maxWidth: .infinity, alignment: .leading)
                .grained(Hy.card, radius: 21, shadow: 0.3)
                ForEach(items) { item in question(item) }
                HyAction(title: "Done", kind: .primary) { close(nil) }
                    .padding(.top, DesignTokens.s8)
            }
            .padding(.horizontal, DesignTokens.s21)
            .padding(.bottom, DesignTokens.s34)
        }
        .background(Hy.paper.ignoresSafeArea())
    }

    private func question(_ item: LabNotice.Item) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text("Keep \(item.name)?").hType(17, .semibold, Hy.ink)
            Text(item.change).hType(13, .regular, Hy.ink2)
            if kept.contains(item.id) {
                Text("Kept on your plan.").hType(13, .medium, Hy.green)
            } else {
                HStack(spacing: DesignTokens.s8) {
                    HyAction(title: "Keep", kind: .secondary, wide: false) {
                        kept.insert(item.id)
                    }
                    HyAction(title: "Change", kind: .text, wide: false) {
                        close(ChatStart(draft: "I'd like to change how I take \(item.name). "
                                        + "My last draw: \(item.change). What would you change?"))
                    }
                    HyAction(title: "Drop", kind: .text, wide: false) {
                        close(ChatStart(draft: "I'm thinking of dropping \(item.name). "
                                        + "My last draw: \(item.change). Should I?"))
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.3)
    }
}
