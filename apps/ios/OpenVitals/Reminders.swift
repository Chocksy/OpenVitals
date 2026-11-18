import SwiftUI
import UserNotifications

// Batch 5C: the phone nudges toward the plan. Local notifications only, no
// APNs: one repeating reminder per slot of the day that has items, and two
// per goal retest (a week before and on the day). Every id starts "plan.",
// so a rebuild never touches the check-in's own "checkin".

/// One notification the schedule wants. Pure data, so the tests read it.
struct PlannedReminder: Equatable {
    let id: String
    let title: String
    let body: String
    /// Hour and minute for a daily repeat; a full date for a one-off.
    let when: DateComponents
    let repeats: Bool
}

enum Reminders {
    static let prefix = "plan."
    /// The Settings switch: true turns plan reminders off.
    static let offKey = "remindersOff"
    /// When "Not now" was tapped on the ask card.
    static let notNowKey = "remindersNotNow"
    static let snooze: TimeInterval = 14 * 24 * 3600
    /// 64 is iOS's pending limit; the check-in takes one, three are spare.
    static let cap = 60

    // MARK: slots

    /// The fixed time and the word for each slot `lib/plan-line.ts` writes
    /// (`SLOTS`). "lunch" is read as midday, as the server parses it.
    static let slots: [(key: String, label: String, hour: Int, minute: Int)] = [
        ("morning", "Morning", 8, 0),
        ("breakfast", "Breakfast", 8, 30),
        ("midday", "Midday", 12, 30),
        ("afternoon", "Afternoon", 15, 0),
        ("dinner", "Dinner", 19, 0),
        ("evening", "Evening", 21, 30),
        ("bedtime", "Bedtime", 22, 30),
    ]

    /// One reminder's worth of rows: a slot, or a literal "HH:MM".
    struct Group: Equatable {
        let key: String
        let label: String
        let hour: Int
        let minute: Int
        let titles: [String]
    }

    /// Today's tickable rows by slot (or clock time), in the order the day
    /// runs. A row with neither has no hour to remind at and is left out; a
    /// suggestion has no item to tick and is left out too.
    static func groups(_ rows: [Api.PlanDay.Row]) -> [Group] {
        var titles: [String: [String]] = [:]
        var at: [String: (label: String, hour: Int, minute: Int)] = [:]
        for row in rows where row.itemId != nil && (row.daysOfWeek ?? []).isEmpty {
            if let slot = row.slot.map({ $0 == "lunch" ? "midday" : $0 }),
               let s = slots.first(where: { $0.key == slot }) {
                titles[s.key, default: []].append(row.title)
                at[s.key] = (s.label, s.hour, s.minute)
            } else if let time = row.time, let hm = clock(time) {
                let key = String(format: "%02d:%02d", hm.hour, hm.minute)
                titles[key, default: []].append(row.title)
                at[key] = (key, hm.hour, hm.minute)
            }
        }
        return titles.keys
            .map { k in Group(key: k, label: at[k]!.label, hour: at[k]!.hour,
                              minute: at[k]!.minute, titles: titles[k]!) }
            .sorted { ($0.hour, $0.minute, $0.key) < ($1.hour, $1.minute, $1.key) }
    }

    /// "18:00" → (18, 0); anything else nil.
    static func clock(_ s: String) -> (hour: Int, minute: Int)? {
        let parts = s.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
              (0..<24).contains(h), (0..<60).contains(m) else { return nil }
        return (h, m)
    }

    // MARK: the schedule

    /// Items and goals in, notification requests out: the slots first (they
    /// repeat daily), then the retests soonest first, capped at `cap`.
    static func schedule(rows: [Api.PlanDay.Row], goals: [Api.Today.Goal],
                         dated: [Api.Today.Retest] = [],
                         now: Date = Date(), calendar: Calendar = .current) -> [PlannedReminder] {
        let daily = groups(rows).map { g in
            PlannedReminder(id: "\(prefix)slot.\(g.key)", title: g.label,
                            body: g.titles.joined(separator: ", "),
                            when: DateComponents(hour: g.hour, minute: g.minute),
                            repeats: true)
        }
        return Array((daily + weekly(rows)
                      + retests(goals, dated: dated, now: now, calendar: calendar)).prefix(cap))
    }

    /// An item that runs on some weekdays only: one weekly repeat per day it
    /// runs, at its slot or clock time. Apple counts weekdays from Sunday = 1.
    static func weekly(_ rows: [Api.PlanDay.Row]) -> [PlannedReminder] {
        var out: [PlannedReminder] = []
        for row in rows {
            guard let item = row.itemId, let days = row.daysOfWeek, !days.isEmpty else { continue }
            let at: (label: String, hour: Int, minute: Int)?
            if let slot = row.slot.map({ $0 == "lunch" ? "midday" : $0 }),
               let s = slots.first(where: { $0.key == slot }) {
                at = (s.label, s.hour, s.minute)
            } else if let time = row.time, let hm = clock(time) {
                at = (time, hm.hour, hm.minute)
            } else { at = nil }
            guard let at else { continue }
            for iso in days where (1...7).contains(iso) {
                out.append(PlannedReminder(
                    id: "\(prefix)item.\(item).\(iso)", title: at.label, body: row.title,
                    when: DateComponents(hour: at.hour, minute: at.minute, weekday: iso % 7 + 1),
                    repeats: true))
            }
        }
        return out
    }

    /// The retest date: the projection's `retestAt`, else the goal's due date.
    /// One at 09:00 on the day, one at 09:00 seven days before; past ones go.
    static func retests(_ goals: [Api.Today.Goal], dated: [Api.Today.Retest] = [],
                        now: Date = Date(),
                        calendar: Calendar = .current) -> [PlannedReminder] {
        var out: [(Date, PlannedReminder)] = []
        // Target goals first (their projection knows the retest), then the
        // date-only ones `goals` leaves out, one per marker.
        var all: [(code: String, name: String, iso: String)] = goals.compactMap { g in
            (g.projection?.retestAt ?? g.target.due).map { (g.code, g.name, $0) }
        }
        for r in dated where !all.contains(where: { $0.code == r.code }) {
            all.append((r.code, r.name, r.due))
        }
        for g in all {
            let iso = g.iso
            guard let day = localDay(iso, calendar) else { continue }
            let marks: [(Int, String, String)] = [
                (-7, "week", "\(g.name) retest in a week"),
                (0, "due", "\(g.name) retest is due"),
            ]
            for (offset, tag, title) in marks {
                guard let d = calendar.date(byAdding: .day, value: offset, to: day),
                      let fire = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: d),
                      fire > now else { continue }
                let body = offset == 0
                    ? "Book the draw: it shows what the plan moved."
                    : "Book the draw for \(Design.longDay(String(iso.prefix(10))))."
                out.append((fire, PlannedReminder(
                    id: "\(prefix)retest.\(g.code).\(tag)", title: title, body: body,
                    when: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire),
                    repeats: false)))
            }
        }
        return out.sorted { $0.0 < $1.0 }.map(\.1)
    }

    /// "2026-12-01" (or a longer ISO stamp) as midnight local time.
    static func localDay(_ iso: String, _ calendar: Calendar) -> Date? {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    // MARK: the live side

    /// Off in fixture runs, the gallery and the unit tests.
    static var live: Bool { !Fixtures.on && NSClassFromString("XCTestCase") == nil }

    static var off: Bool { UserDefaults.standard.bool(forKey: offKey) }

    /// What the last loads said, so a plan load (no goals) and a Today load
    /// (both) rebuild from the same picture.
    @MainActor private static var rows: [Api.PlanDay.Row]?
    @MainActor private static var goals: [Api.Today.Goal] = []
    @MainActor private static var dated: [Api.Today.Retest] = []

    /// Called whenever the plan or Today loads. Waits for a plan before the
    /// first rebuild, so a goals-only call never drops the slot reminders.
    @MainActor
    static func loaded(plan: Api.PlanDay? = nil, goals: [Api.Today.Goal]? = nil,
                       retests: [Api.Today.Retest]? = nil) {
        guard live else { return }
        if let plan { rows = plan.rows }
        if let goals { self.goals = goals }
        if let retests { dated = retests }
        Task { await rebuild() }
    }

    /// Removes every "plan." request, then adds the schedule back, unless the
    /// switch is off or notifications are not allowed.
    @MainActor
    static func rebuild() async {
        guard live else { return }
        let center = UNUserNotificationCenter.current()
        // No plan loaded yet (a cold start offline): keep what is scheduled.
        guard off || rows != nil else { return }
        await clear()
        guard !off, let rows else { return }
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional else { return }
        for p in schedule(rows: rows, goals: goals, dated: dated) {
            let content = UNMutableNotificationContent()
            content.title = p.title
            content.body = p.body
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(dateMatching: p.when, repeats: p.repeats)
            try? await center.add(UNNotificationRequest(identifier: p.id, content: content,
                                                        trigger: trigger))
        }
    }

    /// Every pending plan reminder gone; the check-in's stays.
    static func clear() async {
        let center = UNUserNotificationCenter.current()
        let ids = await center.pendingNotificationRequests().map(\.identifier)
            .filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    // MARK: the ask

    /// The card shows while iOS has not asked yet, the switch is on, and no
    /// "Not now" in the last 14 days.
    static func shouldAsk(now: Date = Date(), status: UNAuthorizationStatus,
                          off: Bool, notNow: Date?) -> Bool {
        guard status == .notDetermined, !off else { return false }
        guard let notNow else { return true }
        return now.timeIntervalSince(notNow) >= snooze
    }

    static func shouldAskNow() async -> Bool {
        guard live else { return false }
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        return shouldAsk(status: status, off: off,
                         notNow: UserDefaults.standard.object(forKey: notNowKey) as? Date)
    }

    /// The system prompt, then the schedule if it was allowed.
    @MainActor
    static func allow() async {
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound])
        // The check-in's own ask would only repeat this one.
        UserDefaults.standard.set(true, forKey: CheckinReminder.askedKey)
        await rebuild()
    }

    static func notNow(_ now: Date = Date()) {
        UserDefaults.standard.set(now, forKey: notNowKey)
    }
}

// MARK: - the tap

/// A tap on a plan reminder opens Home, where the Do shelf ticks; a retest
/// opens Blood. Set as the centre's delegate at launch, before a tap that
/// launched the app is delivered.
final class ReminderTaps: NSObject, UNUserNotificationCenterDelegate {
    static let shared = ReminderTaps()

    static func tab(for id: String) -> Int? {
        if id.hasPrefix("\(Reminders.prefix)slot.") || id.hasPrefix("\(Reminders.prefix)item.") { return 0 }
        if id.hasPrefix("\(Reminders.prefix)retest.") { return 2 }
        return nil
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let tab = Self.tab(for: response.notification.request.identifier) {
            // `Shell` keeps its tab in `@AppStorage("tab")`.
            UserDefaults.standard.set(tab, forKey: "tab")
        }
        completionHandler()
    }
}

// MARK: - the card

/// "Get a reminder at the time you take your plan", on Home under Do now.
/// Shows on launch and again after the first tick the server takes, while
/// `Reminders.shouldAsk` holds and the day has a slot to remind at.
struct ReminderAskCard: View {
    let rows: [Api.PlanDay.Row]
    /// `TodayModel.confirmed`: a tick landing asks again.
    let ticks: Int

    @State private var shown = false
    @State private var busy = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    private var groups: [Reminders.Group] { Reminders.groups(rows) }

    var body: some View {
        VStack(spacing: 0) {
            if shown, !groups.isEmpty {
                VStack(alignment: .leading, spacing: DesignTokens.s8) {
                    CardLabel(text: "Reminders", glyph: "bell")
                    Text("Get a reminder at the time you take your plan")
                        .hType(15, .semibold, Hy.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(groups.map { "\($0.label) \(String(format: "%02d:%02d", $0.hour, $0.minute))" }
                        .joined(separator: " · "))
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: DesignTokens.s8) {
                        HyAction(title: "Allow", kind: .secondary, wide: false) {
                            busy = true
                            Task {
                                await Reminders.allow()
                                busy = false
                                hide()
                            }
                        }
                        .disabled(busy)
                        HyAction(title: "Not now", kind: .text, wide: false) {
                            Reminders.notNow()
                            hide()
                        }
                        Spacer(minLength: 0)
                    }
                }
                .hyCard()
                .padding(.top, DesignTokens.s21)
                .transition(.opacity)
            }
        }
        .task { shown = await Reminders.shouldAskNow() }
        .onChange(of: ticks) { old, _ in
            guard old == 0 else { return }
            Task { shown = await Reminders.shouldAskNow() }
        }
    }

    private func hide() {
        Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { shown = false }
    }
}
