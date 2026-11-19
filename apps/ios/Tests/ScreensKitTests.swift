import XCTest
@testable import OpenVitals

/// Batch 6: the rules behind Plan, Blood, Body, Focus and the + sheet.
@MainActor
final class ScreensKitTests: XCTestCase {

    private func decode<T: Decodable>(_ name: String, as: T.Type) throws -> T {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    private func row(_ title: String, time: String? = nil, slot: String? = nil,
                     id: String = "pi_x", adherence: Double? = nil) -> Api.PlanDay.Row {
        .init(itemId: id, adoptId: nil, time: time, slot: slot, title: title, why: "",
              tag: "protocol", done: false, adherence: adherence)
    }

    // MARK: Plan

    func testTheShortTitleMatchesTheServer() {
        let psyllium = ScreensKit.split("Psyllium husk 5 g with lunch and 5 g with dinner — 10 g/day")
        XCTAssertEqual(psyllium.short, "Psyllium husk")
        XCTAssertEqual(psyllium.rest, "5 g with lunch and 5 g with dinner — 10 g/day")
        let meal = ScreensKit.split("Meal sequencing with dietary soluble fibre preload — At least 10g")
        XCTAssertEqual(meal.short, "Meal sequencing")
        XCTAssertEqual(ScreensKit.split("Omega 3 supliment").short, "Omega 3 supliment")
        XCTAssertEqual(ScreensKit.short("Walk 10 minutes after dinner"), "Walk")
        XCTAssertEqual(ScreensKit.short("Berberine (2 a day)"), "Berberine")
        XCTAssertEqual(ScreensKit.split("Berberine").short, "Berberine")
        XCTAssertNil(ScreensKit.split("Berberine").rest)
        XCTAssertEqual(ScreensKit.short("Vitamin D3 (4000 IU), daily"), "Vitamin D3")
    }

    func testAdherenceSaysNotLoggedWhenSparse() {
        XCTAssertEqual(ScreensKit.adherence(nil), "not logged")
        XCTAssertEqual(ScreensKit.adherence(0.03), "not logged")
        XCTAssertEqual(ScreensKit.adherence(0.71), "71% of the last 30 days")
    }

    func testBackfillSendsTheDrawDateThenReloads() async throws {
        let m = PlanModel()
        let plan = Api.PlanDay(day: "2026-11-19", done: 0, total: 1,
                               rows: [row("Berberine 500 mg", id: "pi_b")])
        m.plan = plan
        m.fetch = { plan }
        m.fetchPapers = { [] }
        m.readUntilDraw = { _ in [:] }
        m.untilDraw = ["pi_b": "2026-11-17"]
        var sent: [(String, String)] = []
        m.sendBackfill = { sent.append(($0, $1)) }
        var changed = 0
        m.changed = { changed += 1 }
        await m.backfill(plan.rows[0])
        XCTAssertEqual(sent.map(\.0), ["pi_b"])
        XCTAssertEqual(sent.map(\.1), ["2026-11-17"])
        XCTAssertNil(m.untilDraw["pi_b"])
        XCTAssertEqual(m.pill?.kind, .filled)
        XCTAssertEqual(changed, 1)
        // No draw date: nothing is sent.
        await m.backfill(plan.rows[0])
        XCTAssertEqual(sent.count, 1)
    }

    // MARK: Focus

    func testFocusDealsTheSlotAndWhatIsLeftFromBefore() {
        let rows = [row("Vitamin D", slot: "breakfast", id: "a"),
                    row("Walk", slot: "midday", id: "b"),
                    row("Weights", time: "18:00", id: "c"),
                    row("Fibre first", id: "d")]
        XCTAssertEqual(ScreensKit.dealt(rows, now: 0).compactMap(\.itemId), ["a", "d"])
        XCTAssertEqual(ScreensKit.dealt(rows, now: 1).compactMap(\.itemId), ["a", "b", "d"])
        XCTAssertEqual(ScreensKit.dealt(rows, now: 2).count, 4)
        XCTAssertEqual(ScreensKit.slot(hour: 10), 0)
        XCTAssertEqual(ScreensKit.slot(hour: 11), 1)
        XCTAssertEqual(ScreensKit.slot(hour: 16), 2)
    }

    func testFocusFindsTheGoalARowMoves() throws {
        let today = try decode("today", as: Api.Today.self)
        let goal = ScreensKit.goal(for: row("Psyllium husk 10 g daily"), in: today.goals)
        XCTAssertEqual(goal?.code, today.goals.first?.code)
        XCTAssertNil(ScreensKit.goal(for: row("Walk 10 minutes"), in: today.goals))
    }

    // MARK: Blood

    func testBloodOpensOnOffAndDropsOldReadings() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        XCTAssertEqual(BloodView.opening(markers, today: "2026-04-23"), "Off")
        XCTAssertEqual(BloodView.opening(markers, today: "2040-01-01"), "All")
        XCTAssertEqual(BloodView.opening(Api.Markers(days: 365, markers: [])), "All")
        let look = BloodView.needsALook(markers, today: "2026-04-23")
        XCTAssertTrue(look.allSatisfy { !BloodView.isOld($0, today: "2026-04-23") })
        XCTAssertLessThan(look.count, BloodView.needsALook(markers, today: "2012-08-08").count)
        let old = try XCTUnwrap(markers.markers.first { $0.date == "2016-01-09" })
        XCTAssertTrue(BloodView.isOld(old, today: "2026-11-19"))
    }

    func testSinceDropsSameAndPutsReachedFirst() throws {
        var today = try decode("today", as: Api.Today.self)
        today.changes = [
            .init(kind: "since", code: "tg", text: "Triglycerides 106 → 139", better: false, same: false),
            .init(kind: "since", code: "hdl", text: "HDL 50 → 50", better: false, same: true),
            .init(kind: "since", code: "ldl", text: "LDL 131 → 104", better: true, same: false),
            .init(kind: "reached", code: "ldl", text: "Reached: LDL ≤118", better: true, same: false),
        ]
        XCTAssertEqual(BloodView.since(today).map(\.text),
                       ["Reached: LDL ≤118", "LDL 131 → 104", "Triglycerides 106 → 139"])
        XCTAssertTrue(BloodView.since(nil).isEmpty)
    }

    // MARK: Body

    func testSourcesReadAsAppNames() {
        XCTAssertEqual(ScreensKit.sourceName("com.viraldevelopment.CalorieCounter"), "Calorie app")
        XCTAssertEqual(ScreensKit.sourceName("cn.noerdenfit.life"), "Noerdenfit")
        XCTAssertEqual(ScreensKit.sourceName("com.example.sleepy.ios"), "Sleepy")
        XCTAssertEqual(ScreensKit.sourceName("Apple Health"), "Apple Health")
        XCTAssertEqual(ScreensKit.sourceName("phone"), "phone")
    }

    func testSleepGapAndDietaryFold() throws {
        let day = try decode("body", as: Api.BodyDay.self)
        XCTAssertNil(BodyText.sleepGap(day))
        let quiet = Api.BodyDay(day: "2026-11-19", synced: day.synced, rows: day.rows.map { r in
            guard r.type == "sleep_duration" else { return r }
            return .init(type: r.type, name: r.name, identifier: r.identifier, source: r.source,
                         value: nil, unit: r.unit, display: r.display, note: r.note,
                         word: r.word, when: "2026-10-21")
        })
        XCTAssertEqual(BodyText.sleepGap(quiet), "Sleep not synced since Oct 21 2026")
        XCTAssertEqual(BodyText.header(quiet)?.hasPrefix("Sleep not synced since"), true)
        let folded = BodyText.dietary(day.rows)
        XCTAssertTrue(folded.folded)
        XCTAssertEqual(folded.rows.count, day.rows.count - 4)
        let weight = try XCTUnwrap(day.rows.first { $0.type == "weight" })
        XCTAssertFalse(BodyText.stale(weight, day: "2026-09-15"))
        XCTAssertTrue(BodyText.stale(weight, day: "2026-11-19"))
    }

    // MARK: Settings and the + sheet

    func testReminderStatusIsOnePlainSentence() {
        XCTAssertEqual(SettingsView.reminderStatus(off: true, status: .authorized),
                       "Off. No plan reminders.")
        XCTAssertEqual(SettingsView.reminderStatus(off: false, status: .denied),
                       "Blocked in iOS Settings, so none can arrive.")
        XCTAssertTrue(AddCamera.labHint.hasPrefix("Lab report?"))
    }
}
