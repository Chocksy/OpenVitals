import XCTest
@testable import OpenVitals

/// Batch 5C: the slot grouping and the schedule builder, pure, no centre.
final class RemindersTests: XCTestCase {

    private func row(_ title: String, slot: String? = nil, time: String? = nil,
                     itemId: String? = "id", tag: String = "protocol") -> Api.PlanDay.Row {
        .init(itemId: itemId.map { "\($0)-\(title)" }, adoptId: nil, time: time, slot: slot,
              title: title, why: "", tag: tag, done: false, adherence: nil)
    }

    private func goal(_ code: String, _ name: String, due: String?,
                      retestAt: String? = nil) -> Api.Today.Goal {
        let projection = retestAt.map {
            Api.Today.Goal.Projection(from: 130, fromDate: "2026-06-01", expected: 110,
                                      low: 100, high: 120, horizonWeeks: 12, retestAt: $0,
                                      levers: [], history: [])
        }
        return .init(code: code, name: name, value: 131, unit: "mg/dL",
                     target: .init(low: 70, high: 100, due: due), toGo: 31, onPace: nil,
                     paceLine: nil, moves: [], projection: projection)
    }

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Bucharest")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    /// The owner's eight: three slots, a lunch alias, one with no slot.
    private var owner: [Api.PlanDay.Row] {
        [row("Berberine 500 mg", slot: "morning"),
         row("Omega 3", slot: "morning"),
         row("Vitamin D3 4000 IU", slot: "morning"),
         row("Psyllium husk 10 g", slot: "midday"),
         row("Walk 10 minutes", slot: "lunch"),
         row("Berberine 500 mg", slot: "dinner"),
         row("Magnesium glycinate", slot: "dinner"),
         row("Protein first at every meal"),
         row("Try creatine", slot: "morning", tag: "suggested").withoutItem]
    }

    func testGroupsBySlotInDayOrder() {
        let g = Reminders.groups(owner)
        XCTAssertEqual(g.map(\.key), ["morning", "midday", "dinner"])
        XCTAssertEqual(g[0].titles, ["Berberine 500 mg", "Omega 3", "Vitamin D3 4000 IU"])
        XCTAssertEqual(g[1].titles, ["Psyllium husk 10 g", "Walk 10 minutes"])
        XCTAssertEqual(g.map { "\($0.hour):\($0.minute)" }, ["8:0", "12:30", "19:0"])
    }

    func testAClockTimeGetsItsOwnReminderAndJunkIsDropped() {
        let g = Reminders.groups([row("Lift", time: "18:00"), row("Odd", slot: "teatime"),
                                  row("Late", time: "25:00"), row("Tea", slot: "evening")])
        XCTAssertEqual(g.map(\.key), ["18:00", "evening"])
        XCTAssertEqual(g.last.map { "\($0.hour):\($0.minute)" }, "21:30")
    }

    func testScheduleRepeatsSlotsAndAddsBothRetestReminders() {
        let now = date(2026, 11, 18)
        let goals = [goal("ldl", "LDL", due: "2027-03-01", retestAt: "2026-12-20"),
                     goal("hba1c", "HbA1c", due: "2026-11-21"),
                     goal("tsh", "TSH", due: "2026-01-01"),
                     goal("ferritin", "Ferritin", due: nil)]
        let s = Reminders.schedule(rows: owner, goals: goals, now: now, calendar: calendar)
        XCTAssertEqual(s.map(\.id), [
            "plan.slot.morning", "plan.slot.midday", "plan.slot.dinner",
            // HbA1c's week-before mark (Nov 14) is past; only its day stays.
            "plan.retest.hba1c.due",
            "plan.retest.ldl.week", "plan.retest.ldl.due",
        ])
        let morning = s[0]
        XCTAssertTrue(morning.repeats)
        XCTAssertEqual(morning.title, "Morning")
        XCTAssertEqual(morning.body, "Berberine 500 mg, Omega 3, Vitamin D3 4000 IU")
        XCTAssertEqual(morning.when, DateComponents(hour: 8, minute: 0))
        let ldl = s[5]
        XCTAssertFalse(ldl.repeats)
        XCTAssertEqual(ldl.title, "LDL retest is due")
        XCTAssertEqual(ldl.when.day, 20)
        XCTAssertEqual(ldl.when.hour, 9)
        XCTAssertEqual(s[4].title, "LDL retest in a week")
        XCTAssertEqual(s[4].when.day, 13)
    }

    func testScheduleStaysUnderTheCap() {
        let rows = (0..<24).flatMap { h in [row("At \(h)", time: String(format: "%02d:00", h))] }
        let goals = (0..<40).map { goal("g\($0)", "G\($0)", due: "2027-0\(1 + $0 % 9)-1\($0 % 9)") }
        let s = Reminders.schedule(rows: rows, goals: goals, now: date(2026, 11, 18), calendar: calendar)
        XCTAssertEqual(s.count, Reminders.cap)
        XCTAssertEqual(Set(s.map(\.id)).count, s.count)
        XCTAssertTrue(s.allSatisfy { $0.id.hasPrefix(Reminders.prefix) })
    }

    func testAskWaitsFourteenDaysAfterNotNow() {
        let now = Date()
        XCTAssertTrue(Reminders.shouldAsk(now: now, status: .notDetermined, off: false, notNow: nil))
        XCTAssertFalse(Reminders.shouldAsk(now: now, status: .notDetermined, off: false,
                                           notNow: now.addingTimeInterval(-13 * 86_400)))
        XCTAssertTrue(Reminders.shouldAsk(now: now, status: .notDetermined, off: false,
                                          notNow: now.addingTimeInterval(-14 * 86_400)))
        XCTAssertFalse(Reminders.shouldAsk(now: now, status: .authorized, off: false, notNow: nil))
        XCTAssertFalse(Reminders.shouldAsk(now: now, status: .notDetermined, off: true, notNow: nil))
    }

    func testWeekdayItemsRepeatWeeklyNotDaily() {
        var lift = row("Lift", slot: "evening")
        lift.daysOfWeek = [1, 3, 7]
        let s = Reminders.schedule(rows: [row("Omega 3", slot: "morning"), lift], goals: [],
                                   now: date(2026, 11, 18), calendar: calendar)
        XCTAssertEqual(s.map(\.id), ["plan.slot.morning", "plan.item.id-Lift.1",
                                     "plan.item.id-Lift.3", "plan.item.id-Lift.7"])
        // ISO Monday is Apple weekday 2, ISO Sunday is Apple weekday 1.
        XCTAssertEqual(s[1].when, DateComponents(hour: 21, minute: 30, weekday: 2))
        XCTAssertEqual(s[3].when.weekday, 1)
        XCTAssertTrue(s[1].repeats)
        XCTAssertEqual(s[1].body, "Lift")
    }

    func testDateOnlyRetestsJoinOncePerMarker() {
        let s = Reminders.retests([goal("ldl", "LDL", due: "2026-12-20")],
                                  dated: [.init(code: "ldl", name: "LDL", due: "2027-01-01"),
                                          .init(code: "tsh", name: "TSH", due: "2026-12-30")],
                                  now: date(2026, 11, 18), calendar: calendar)
        XCTAssertEqual(s.map(\.id), ["plan.retest.ldl.week", "plan.retest.ldl.due",
                                     "plan.retest.tsh.week", "plan.retest.tsh.due"])
        XCTAssertEqual(s[1].when.day, 20)
    }

    func testATapPicksTheTab() {
        XCTAssertEqual(ReminderTaps.tab(for: "plan.slot.morning"), 0)
        XCTAssertEqual(ReminderTaps.tab(for: "plan.item.abc.3"), 0)
        XCTAssertEqual(ReminderTaps.tab(for: "plan.retest.ldl.due"), 2)
        XCTAssertNil(ReminderTaps.tab(for: "checkin"))
    }
}

private extension Api.PlanDay.Row {
    var withoutItem: Api.PlanDay.Row {
        .init(itemId: nil, adoptId: "plan:x:1", time: time, slot: slot, title: title,
              why: why, tag: tag, done: done, adherence: adherence)
    }
}
