import XCTest
@testable import OpenVitals

/// Phase 37 task C3: the meal sheet's model paths and the targets form's
/// bounds. The seams stand in for the server, as C2's tick tests do.
@MainActor
final class MealEditTests: XCTestCase {

    private func json(_ name: String) throws -> [String: Any] {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url))
            as? [String: Any])
    }

    private func decode<T: Decodable>(_ object: [String: Any], as: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
    }

    private func canned() throws -> TodayModel {
        let m = TodayModel(today: try decode(json("today"), as: Api.Today.self),
                           plan: try decode(json("plan-today"), as: Api.PlanDay.self),
                           meals: try decode(json("meals"), as: Api.MealDay.self),
                           days: [])
        m.debounce = .milliseconds(30)
        return m
    }

    private func mealId(_ m: TodayModel) throws -> String {
        try XCTUnwrap(m.mealList.first?.id)
    }

    func testABurstOfTapsSendsOnePatch() async throws {
        let m = try canned()
        let id = try mealId(m)
        var sent: [MealChange] = []
        m.sendPatch = { _, change in sent.append(change) }

        for v in [1.5, 2, 2.5, 2] { m.setServings(id, v) }
        XCTAssertEqual(m.meal(id)?.servings, 2, "the stepper moves at once")
        XCTAssertTrue(sent.isEmpty, "nothing goes out mid-burst")
        await m.drain()
        XCTAssertEqual(sent, [MealChange(servings: 2)])
    }

    /// Review focus 4: a reload landing while the PATCH is out must not snap
    /// the stepper back.
    func testAReloadDuringAnEditKeepsTheServings() async throws {
        let m = try canned()
        let id = try mealId(m)
        var calls = 0
        m.sendPatch = { _, _ in
            calls += 1
            try await Task.sleep(for: .milliseconds(150))
        }
        let kcalBefore = try XCTUnwrap(m.food(\.kcal))

        m.setServings(id, 1.5)
        try await Task.sleep(for: .milliseconds(80))  // the PATCH is out now
        // The reload: today and the meals as the server had them before.
        m.today = try decode(json("today"), as: Api.Today.self)
        m.meals = try decode(json("meals"), as: Api.MealDay.self)
        XCTAssertEqual(m.meal(id)?.servings, 1.5)
        XCTAssertEqual(m.mealList.first?.servings, 1.5)
        XCTAssertGreaterThan(try XCTUnwrap(m.food(\.kcal)), kcalBefore)

        await m.drain()
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(m.meal(id)?.servings, 1.5)
    }

    func testAFailedPatchRollsBack() async throws {
        let m = try canned()
        let id = try mealId(m)
        struct Down: Error {}
        m.sendPatch = { _, _ in throw Down() }
        var receipts: [TodayReceipt] = []
        m.onReceipt = { receipts.append($0) }
        let score = m.result?.score

        m.setServings(id, 3)
        XCTAssertNotEqual(m.result?.score, score, "the preview moved")
        await m.drain()
        XCTAssertEqual(m.meal(id)?.servings, 1)
        XCTAssertEqual(m.result?.score, score)
        XCTAssertEqual(receipts, [.failed(message: "Couldn't save · try again")])
    }

    func testTheLastRowCannotBeRemoved() async throws {
        let m = try canned()
        let id = try mealId(m)
        var sent: [MealChange] = []
        m.sendPatch = { _, change in sent.append(change) }
        let count = try XCTUnwrap(m.meal(id)?.items.count)
        XCTAssertGreaterThan(count, 1)

        for _ in 1..<count { XCTAssertTrue(m.removeItem(id, at: 0)) }
        XCTAssertEqual(m.meal(id)?.items.count, 1)
        XCTAssertFalse(m.removeItem(id, at: 0), "Delete is the way")
        XCTAssertEqual(m.meal(id)?.items.count, 1)
        await m.drain()
        XCTAssertEqual(sent.count, count - 1)
        XCTAssertEqual(sent.last?.items?.count, 1)
    }

    /// The live chip reads `result`: it must be `Score.of` on the server's
    /// day with the edited meal's kcal and protein in place of the old.
    func testTheLiveChipScoresTheEditedTotals() throws {
        let m = try canned()
        let id = try mealId(m)
        let meal = try XCTUnwrap(m.meal(id))
        m.sendPatch = { _, _ in }
        m.setServings(id, 2.5)

        let edited = try XCTUnwrap(m.meal(id))
        // 605 kcal a plate (310 + 260 + 35) and 41 g protein, times 2.5.
        XCTAssertEqual(edited.totals.kcal, 1513)
        XCTAssertEqual(edited.totals.proteinG, 103)
        var input = try XCTUnwrap(m.today?.score?.input)
        input.kcal = (input.kcal ?? 0) + (edited.totals.kcal ?? 0) - (meal.totals.kcal ?? 0)
        input.proteinG = (input.proteinG ?? 0) + (edited.totals.proteinG ?? 0)
            - (meal.totals.proteinG ?? 0)
        if let moves = m.input?.moves { input.moves = moves }
        XCTAssertEqual(m.input?.kcal, input.kcal)
        XCTAssertEqual(m.result, Score.of(input))
        XCTAssertNotEqual(m.result?.score, m.today?.score?.result.score)
    }

    func testADeleteLeavesTheDayAndComesBackOnFailure() async throws {
        let m = try canned()
        let id = try mealId(m)
        struct Down: Error {}
        m.sendDelete = { _ in throw Down() }
        var receipts: [TodayReceipt] = []
        m.onReceipt = { receipts.append($0) }

        m.deleteMeal(id)
        XCTAssertTrue(m.mealList.isEmpty)
        XCTAssertEqual(m.food(\.kcal), 0)
        await m.drain()
        XCTAssertEqual(m.mealList.count, 1)
        XCTAssertEqual(receipts.count, 1)
    }

    func testAReadWithNoPlateKeepsTheMeal() async throws {
        let m = try canned()
        let id = try mealId(m)
        let before = m.meal(id)
        m.sendReread = { _, _ in throw Api.Failure(status: 422, message: "no plate") }
        let outcome = await m.reread(id, note: "it was two eggs")
        XCTAssertEqual(outcome, .noPlate)
        XCTAssertEqual(m.meal(id), before)
    }

    func testTheTargetBounds() async throws {
        XCTAssertNil(TodayModel.targetProblem(kcal: 800, proteinG: 10))
        XCTAssertNil(TodayModel.targetProblem(kcal: 6000, proteinG: 400))
        XCTAssertNil(TodayModel.targetProblem(kcal: nil, proteinG: nil), "empty clears")
        XCTAssertNotNil(TodayModel.targetProblem(kcal: 799, proteinG: nil))
        XCTAssertNotNil(TodayModel.targetProblem(kcal: 6001, proteinG: nil))
        XCTAssertNotNil(TodayModel.targetProblem(kcal: nil, proteinG: 9))
        XCTAssertNotNil(TodayModel.targetProblem(kcal: nil, proteinG: 401))

        let m = try canned()
        var sent: [String] = []
        m.sendTargets = { k, p in sent.append("\(k ?? -1) \(p ?? -1)") }
        let refused = await m.saveTargets(kcal: 500, proteinG: 100)
        XCTAssertNotNil(refused)
        XCTAssertTrue(sent.isEmpty, "a bad number never leaves the phone")
        let saved = await m.saveTargets(kcal: 2200, proteinG: nil)
        XCTAssertNil(saved)
        XCTAssertEqual(sent, ["2200.0 -1.0"])
    }

    func testThePortionScalesItsNumber() throws {
        let items = try decode(json("meals"), as: Api.MealDay.self).meals[0].items
        XCTAssertEqual(items[0].portion(times: 1.5), "225 g")
        XCTAssertEqual(items[1].portion(times: 0.5), "100 g cooked")
        XCTAssertEqual(items[1].portion(times: 1), "200 g cooked")
    }
}
