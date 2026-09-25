import SwiftUI
import XCTest
@testable import OpenVitals

/// Phase 37 task C1: the Today model on the canned fixtures, a person with
/// no data at all (Review focus 1), and the header's pure arithmetic.
@MainActor
final class HybridTodayTests: XCTestCase {

    private func json(_ name: String) throws -> [String: Any] {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url))
            as? [String: Any])
    }

    private func decode<T: Decodable>(_ object: [String: Any], as: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
    }

    private func canned() throws -> TodayModel {
        TodayModel(today: try decode(json("today"), as: Api.Today.self),
                   plan: try decode(json("plan-today"), as: Api.PlanDay.self),
                   meals: try decode(json("meals"), as: Api.MealDay.self),
                   days: try decode(json("score-days"), as: Api.ScoreDays.self).days)
    }

    // MARK: the model

    func testTheCannedDay() throws {
        let m = try canned()
        // Five adopted rows, one done, and one suggestion that never ticks.
        XCTAssertEqual(m.queue.count, 4)
        XCTAssertEqual(m.doRows.count, 5)
        XCTAssertFalse(m.nothingPlanned)
        XCTAssertEqual(m.gain, 2)
        XCTAssertEqual(m.result?.score, 79)
        XCTAssertEqual(m.day, "2026-08-31")
        XCTAssertEqual(m.grid.count, 91)
        XCTAssertEqual(m.strip.count, 21)
        // Today's cell takes the live 79, not the stored 76.
        XCTAssertEqual(m.strip.last?.isToday, true)
        XCTAssertEqual(m.strip.last?.score, 79)
        // 79 today and eleven days at 65+ before it, stopped by a null.
        XCTAssertEqual(m.run, 12)
        XCTAssertEqual(m.headings.map(\.code), ["ldl_cholesterol"])
    }

    func testTheQueueKeepsPlanOrderAndLaterGoesLast() throws {
        var plan = try json("plan-today")
        plan["rows"] = [
            ["itemId": "a", "time": "08:00", "slot": nil as Any?, "title": "A", "why": "x",
             "tag": "protocol", "done": false, "adherence": nil as Any?],
            ["itemId": "b", "time": nil as Any?, "slot": "noon", "title": "B", "why": "x",
             "tag": "goal", "done": true, "adherence": nil as Any?],
            ["itemId": nil as Any?, "time": nil as Any?, "slot": nil as Any?, "title": "S",
             "why": "x", "tag": "suggested", "done": false, "adherence": nil as Any?],
            ["itemId": "c", "time": nil as Any?, "slot": nil as Any?, "title": "C", "why": "x",
             "tag": "every day", "done": false, "adherence": nil as Any?],
        ].map { $0.mapValues { $0 ?? NSNull() } }
        let m = TodayModel(today: try decode(json("today"), as: Api.Today.self),
                           plan: try decode(plan, as: Api.PlanDay.self),
                           meals: nil, days: [])
        XCTAssertEqual(m.queue.map(\.itemId), ["a", "c"])
        XCTAssertEqual(m.doRows.count, 3)
        XCTAssertEqual(m.movesDone, 1)
        XCTAssertFalse(m.nothingPlanned)
        m.later = ["a"]
        XCTAssertEqual(m.queue.map(\.itemId), ["c", "a"])
    }

    /// Review focus 1: score null, no targets, no plan rows, no days.
    func testAPersonWithNoData() throws {
        var today = try json("today")
        today["score"] = NSNull()
        today["sleep"] = NSNull()
        today["goals"] = [Any]()
        var plan = try json("plan-today")
        plan["rows"] = [Any]()
        var meals = try json("meals")
        meals["meals"] = [Any]()
        meals["totals"] = ["kcal": NSNull(), "protein_g": NSNull(), "carbs_g": NSNull(),
                           "fat_g": NSNull(), "estimated": false]
        let m = TodayModel(today: try decode(today, as: Api.Today.self),
                           plan: try decode(plan, as: Api.PlanDay.self),
                           meals: try decode(meals, as: Api.MealDay.self), days: [])
        XCTAssertNil(m.result)
        XCTAssertNil(m.targets)
        XCTAssertNil(m.gain)
        XCTAssertTrue(m.queue.isEmpty)
        XCTAssertTrue(m.nothingPlanned)
        XCTAssertTrue(m.headings.isEmpty)
        XCTAssertEqual(m.grid.count, 91)
        XCTAssertTrue(m.grid.allSatisfy { $0.score == nil })
        XCTAssertEqual(m.run, 0)
        XCTAssertEqual(DayGrid.why(open: false, run: m.run, selected: nil, score: nil,
                                   done: 0, due: 0),
                       "0-day run at 65+ · tap for 13 weeks")

        // The whole screen draws with nothing in it.
        let view = HybridTodayView(model: m).frame(width: 390, height: 844)
        XCTAssertNotNil(ImageRenderer(content: view).uiImage)
    }

    // MARK: ticks (task C2)

    /// The score-vectors "prototype" day: five moves, two done, 72.
    private func prototype() throws -> TodayModel {
        var today = try json("today")
        var score = try XCTUnwrap(today["score"] as? [String: Any])
        score["input"] = ["sleepHours": 7.5, "moves": ["done": 2, "due": 5], "kcal": 1497,
                          "proteinG": 94, "targets": ["kcal": 1900, "proteinG": 120],
                          "blood": ["green": 4, "amber": 2, "rose": 1], "genes": 63]
        score["result"] = ["score": 72, "word": "On track", "life": 77, "blood": 71, "genes": 63,
                           "rows": ["sleep": 100, "moves": 40, "kcal": 90, "protein": 78]]
        today["score"] = score
        var plan = try json("plan-today")
        plan["rows"] = (0..<5).map { i -> [String: Any] in
            ["itemId": "m\(i)", "time": NSNull(), "slot": NSNull(), "title": "Move \(i)",
             "why": "x", "tag": "goal", "done": i >= 3, "adherence": NSNull()]
        }
        return TodayModel(today: try decode(today, as: Api.Today.self),
                          plan: try decode(plan, as: Api.PlanDay.self),
                          meals: nil, days: [])
    }

    func testATickGainsWhatTheVectorsSay() async throws {
        let m = try prototype()
        var sent: [String] = []
        m.send = { id, _, done in sent.append("\(id) \(done)") }
        var receipts: [TodayReceipt] = []
        m.onReceipt = { receipts.append($0) }
        XCTAssertEqual(m.result?.score, 72)
        XCTAssertEqual(m.gain, 2)

        let after = m.tick(m.queue[0])
        XCTAssertEqual(after?.score, 74, "the tick 3 vector")
        XCTAssertEqual(m.result?.score, 74)
        XCTAssertEqual(m.header?.score, 72, "held until the card lands")
        XCTAssertEqual(m.queue.map(\.itemId), ["m1", "m2"])
        XCTAssertEqual(receipts, [.tick(title: "Move 0", sub: "+2 · score 74 · moves 3 of 5",
                                        score: 74)])
        m.settle(at: after, row: "m0", ticked: true)
        XCTAssertEqual(m.header?.score, 74)
        XCTAssertEqual(m.landing?.pill, "+2 · moves 3 of 5")
        XCTAssertEqual(m.landing?.ticked, true)
        await m.drain()
        XCTAssertEqual(sent, ["m0 true"])
    }

    func testAFailedTickRollsBack() async throws {
        let m = try prototype()
        struct Down: Error {}
        m.send = { _, _, _ in throw Down() }
        var receipts: [TodayReceipt] = []
        m.onReceipt = { receipts.append($0) }

        m.settle(at: m.tick(m.queue[0]), row: "m0", ticked: true)
        XCTAssertEqual(m.result?.score, 74, "optimistic")
        await m.drain()
        XCTAssertEqual(m.queue.map(\.itemId), ["m0", "m1", "m2"])
        XCTAssertEqual(m.result?.score, 72)
        XCTAssertEqual(m.header?.score, 72)
        XCTAssertEqual(receipts.last, .failed(message: "Couldn't save · try again"))
    }

    /// The write fails while the card is still in the air: the row is back
    /// in the queue before the card lands, so the landing has no `.success`,
    /// no pill, and the header stays on the old score.
    func testATickThatFailsBeforeItLandsHasNoSuccess() async throws {
        let m = try prototype()
        struct Down: Error {}
        m.send = { _, _, _ in throw Down() }
        let after = m.tick(m.queue[0])
        XCTAssertEqual(after?.score, 74)
        await m.drain()
        XCTAssertEqual(m.queue.map(\.itemId), ["m0", "m1", "m2"], "rolled back")
        m.settle(at: after, row: "m0", ticked: true)
        XCTAssertEqual(m.landing?.ticked, false)
        XCTAssertNil(m.landing?.pill)
        XCTAssertNil(m.landing?.row)
        XCTAssertEqual(m.header?.score, 72)
        XCTAssertEqual(m.confirmed, 0)
    }

    /// Two cards in the air and the first one's write fails: the header must
    /// not land on the first card's optimistic score.
    func testAFailedTickDoesNotLandItsScoreUnderAnotherHold() async throws {
        let m = try prototype()
        struct Down: Error {}
        m.send = { id, _, _ in if id == "m0" { throw Down() } }
        let a = m.tick(m.queue[0])
        let b = m.tick(m.queue[0])
        await m.drain()
        m.settle(at: a, row: "m0", ticked: true)
        XCTAssertEqual(m.header?.score, 72, "still held, on the score from before")
        XCTAssertEqual(m.landing?.ticked, false)
        m.settle(at: b, row: "m1", ticked: true)
        XCTAssertEqual(m.landing?.ticked, true)
        XCTAssertEqual(m.header?.score, 74, "only m1 counts")
        XCTAssertEqual(m.confirmed, 1)
    }

    /// Focus buzzes on `confirmed`: a tick the server took, never a failed
    /// one or an untick.
    func testConfirmedCountsOnlyTicksTheServerTook() async throws {
        let m = try prototype()
        struct Down: Error {}
        var fail = false
        m.send = { _, _, _ in if fail { throw Down() } }
        m.tick(m.queue[0], hold: false)
        await m.drain()
        XCTAssertEqual(m.confirmed, 1)
        fail = true
        m.tick(m.queue[0], hold: false)
        await m.drain()
        XCTAssertEqual(m.confirmed, 1)
        fail = false
        m.untick(try XCTUnwrap(m.doRows.first { $0.done }), settles: false)
        await m.drain()
        XCTAssertEqual(m.confirmed, 1)
    }

    func testTheTickLineIsWrittenInOnePlace() {
        XCTAssertEqual(TodayReceipt.tickSub(gain: 2, score: 74, done: 3, due: 5),
                       "+2 · score 74 · moves 3 of 5")
        XCTAssertEqual(TodayReceipt.tickSub(gain: 0, score: nil, done: 1, due: 1),
                       "+0 · score — · moves 1 of 1")
    }

    func testTwoTicksInARow() async throws {
        let m = try prototype()
        m.send = { _, _, _ in }
        let a = m.tick(m.queue[0])
        let b = m.tick(m.queue[0])
        XCTAssertEqual(a?.score, 74)
        XCTAssertEqual(b?.score, 76, "the tick 4 vector")
        XCTAssertEqual(m.header?.score, 72, "both cards still in the air")
        m.settle(at: a, row: "m0", ticked: true)
        XCTAssertEqual(m.header?.score, 74, "the first lands on its own score")
        XCTAssertEqual(m.landing?.n, 1)
        m.settle(at: b, row: "m1", ticked: true)
        XCTAssertEqual(m.header?.score, 76)
        XCTAssertEqual(m.landing?.n, 2)
        await m.drain()
        XCTAssertEqual(m.queue.map(\.itemId), ["m2"])
        XCTAssertEqual(m.movesDone, 4)
    }

    func testLaterGoesToTheBack() throws {
        let m = try prototype()
        m.sendLater(m.queue[0])
        XCTAssertEqual(m.queue.map(\.itemId), ["m1", "m2", "m0"])
        m.sendLater(m.queue[0])
        XCTAssertEqual(m.queue.map(\.itemId), ["m2", "m0", "m1"])
        m.skip(m.queue[0])
        XCTAssertEqual(m.focusPile.map(\.itemId), ["m0", "m1"])
        XCTAssertEqual(m.queue.map(\.itemId), ["m0", "m1", "m2"])
    }

    func testUntick() async throws {
        let m = try prototype()
        var sent: [String] = []
        m.send = { id, _, done in sent.append("\(id) \(done)") }
        let done = try XCTUnwrap(m.doRows.first { $0.done })
        m.untick(done)
        XCTAssertEqual(m.result?.score, Score.of(m.input!).score)
        XCTAssertEqual(m.movesDone, 1)
        XCTAssertEqual(m.queue.count, 4)
        XCTAssertEqual(m.header?.score, m.result?.score, "settled at once")
        XCTAssertTrue(m.landing?.pill?.hasPrefix("−") == true)
        await m.drain()
        XCTAssertEqual(sent, ["m3 false"])
    }

    // MARK: the gallery's prototype day (task C5)

    func testTheGalleryMockIsThePrototypesDay() {
        XCTAssertEqual(Score.of(Mock.hybridInput).score, 72)
        XCTAssertEqual(Score.of(Mock.hybridInput).life, 77)
        XCTAssertEqual(Score.of(Mock.hybridInput).blood, 71)
        XCTAssertEqual(Score.of(Mock.hybridInput).genes, 63)
        let m = Mock.hybridModel()
        XCTAssertEqual(m.result?.score, 72)
        XCTAssertEqual(m.day, "2026-09-23")
        XCTAssertEqual(m.mealList.map(\.label),
                       ["Oats with berries", "Sardines on rye", "Pork belly salad"])
        XCTAssertEqual(m.meals?.meals.compactMap(\.totals.kcal), [412, 462, 623])
        XCTAssertEqual(m.doRows.count, 5)
        XCTAssertEqual(m.movesDone, 2)
        XCTAssertEqual(m.queue.first?.title, "Walk after dinner")
        let ldl = m.today?.goals.first { $0.code == "ldl_cholesterol" }?.projection
        XCTAssertEqual(ldl.map { Heading.landing($0, off: [], maxChange: 50) }, 104)
        // The seeded days behind it, with a gap four days before today.
        XCTAssertEqual(m.days.count, 86)
        XCTAssertEqual(m.days[82].day, "2026-09-19")
        XCTAssertNil(m.days[82].score, "the gap day")
        XCTAssertEqual(m.strip.first { $0.day == "2026-09-19" }?.score, nil)
        XCTAssertEqual(m.days.last?.day, "2026-09-22")
        XCTAssertEqual(m.days[33].draw, true)
        XCTAssertEqual(m.days[33].day, "2026-08-01")
        // What `node` prints for the prototype's DAYS, first four and last.
        XCTAssertEqual(m.days.prefix(4).map(\.score), [67, 63, 61, 63])
        XCTAssertEqual(m.days.last?.score, 66)
        // Today and the three days after the gap: "4-day run at 65+". Without
        // the gap it was 31.
        XCTAssertEqual(m.run, 4)
    }

    // MARK: the pure parts

    func testTheRunRule() {
        XCTAssertEqual(DayGrid.run(scores: []), 0)
        XCTAssertEqual(DayGrid.run(scores: [nil]), 0)
        XCTAssertEqual(DayGrid.run(scores: [90, 90, 64]), 0, "today under 65 is no run")
        XCTAssertEqual(DayGrid.run(scores: [90, 90, 65]), 3)
        XCTAssertEqual(DayGrid.run(scores: [90, nil, 70, 80]), 2, "a gap stops it")
        XCTAssertEqual(DayGrid.run(scores: [90, 60, 70, 80]), 2)
    }

    func testTheTooltipPlacement() {
        let w: CGFloat = 348
        func cell(_ cx: CGFloat) -> CGRect { CGRect(x: cx - 8.5, y: 40, width: 17, height: 17) }

        let left = TipPlacement(cell: cell(10), weekday: 0, width: w)
        XCTAssertEqual(left.left, 0, "clamped to the left edge")
        XCTAssertEqual(left.arrowX, 10)
        XCTAssertFalse(left.above, "Monday goes below")
        XCTAssertEqual(left.edgeY, 57 + 13)
        XCTAssertEqual(left.top(height: 100), 70)

        let right = TipPlacement(cell: cell(340), weekday: 3, width: w)
        XCTAssertEqual(right.left, w - 212, "clamped to the right edge")
        XCTAssertEqual(right.arrowX, 340 - (w - 212))
        XCTAssertTrue(right.above, "Thursday goes above")
        XCTAssertEqual(right.edgeY, 40 - 13)
        XCTAssertEqual(right.top(height: 100), 40 - 13 - 100)

        let mid = TipPlacement(cell: cell(174), weekday: 2, width: w)
        XCTAssertEqual(mid.left, 68)
        XCTAssertEqual(mid.arrowX, 106)
        XCTAssertFalse(mid.above)
    }

    func testTheGridIsMondayFirstAndEndsOnTodaysWeek() {
        // 2026-09-03 is a Thursday.
        let grid = DayGrid.grid(today: "2026-09-03", days: [], live: nil)
        XCTAssertEqual(grid.count, 91)
        XCTAssertEqual(grid.first?.weekday, 0)
        XCTAssertEqual(grid[87].day, "2026-09-03")
        XCTAssertTrue(grid[87].isToday)
        XCTAssertTrue(grid[88...].allSatisfy(\.future))
        XCTAssertEqual(DayGrid.months(grid).last, "Sep")
        let r = DayGrid.cellRect(index: 87, width: DayGrid.gridWidth)
        XCTAssertEqual(r.minX, 13 + 5 + 12 * 22)
        XCTAssertEqual(r.minY, 13 + 5 + 3 * 22)
    }

    func testTheLandingClamps() throws {
        let m = try canned()
        let goal = try XCTUnwrap(m.headings.first)
        let p = try XCTUnwrap(goal.projection)
        XCTAssertEqual(Heading.landing(p, off: [], maxChange: 50), 118.4, accuracy: 0.001)
        XCTAssertEqual(Heading.landing(p, off: ["Psyllium husk 10 g daily"], maxChange: 50), 126.5,
                       accuracy: 0.001)
        XCTAssertEqual(Heading.landing(p, off: [], maxChange: 6), 125, accuracy: 0.001)
        XCTAssertEqual(Heading.landing(p, off: Set(p.levers.map(\.name)), maxChange: 50),
                       p.from)
    }
}
