import UIKit
import XCTest
@testable import OpenVitals

/// Phase 37 task C4: the island's model, its geometry, the read's progress
/// curve, and the capture run's two routes with the Api behind seams.
@MainActor
final class IslandTests: XCTestCase {

    private func sleep(_ ms: Int) async { try? await Task.sleep(for: .milliseconds(ms)) }

    // MARK: the model

    func testANewActivityReplacesTheCurrentOne() {
        let island = IslandModel(hold: .seconds(60))
        island.show(.receipt(title: "Walk", sub: "+2 · score 74 · moves 3 of 5", score: 74))
        island.show(.receipt(title: "Stretch", sub: "+2 · score 76 · moves 4 of 5", score: 76))
        XCTAssertEqual(island.activity,
                       .receipt(title: "Stretch", sub: "+2 · score 76 · moves 4 of 5", score: 76))
        XCTAssertEqual(island.serial, 2)
    }

    func testReceiptsCollapseAfterTheHold() async {
        XCTAssertEqual(IslandModel().hold, .milliseconds(2600), "the reference's 2 600 ms")
        let island = IslandModel(hold: .milliseconds(60))
        island.show(.allDone(streak: 4, moves: 5, score: 78))
        XCTAssertNotNil(island.activity)
        await sleep(300)
        XCTAssertNil(island.activity)
    }

    func testAReplacementStartsItsOwnHold() async {
        let island = IslandModel(hold: .milliseconds(250))
        island.show(.receipt(title: "A", sub: "", score: nil))
        await sleep(150)
        island.show(.receipt(title: "B", sub: "", score: nil))
        await sleep(150)
        XCTAssertEqual(island.activity, .receipt(title: "B", sub: "", score: nil),
                       "A's hold must not close B")
        await sleep(300)
        XCTAssertNil(island.activity)
    }

    func testAReadHoldsOnlyOnceItHasLanded() async {
        let island = IslandModel(hold: .milliseconds(60))
        let id = island.show(.reading(ReadingState(kind: .photo)))
        await sleep(200)
        XCTAssertNotNil(island.activity, "a read in progress stays")
        island.update(id) { $0.result = .init(title: "Salmon", sub: "605 kcal · 41 g protein") }
        await sleep(300)
        XCTAssertNil(island.activity, "a finished read holds, then goes")
    }

    func testATapOnAFailedReadGivesItsPayloadBack() {
        let island = IslandModel(hold: .seconds(60))
        let payload = CapturePayload(image: UIImage(), text: "lunch")
        island.show(.failed(message: "Couldn't read that · tap to try again", retry: payload))
        let back = island.retry()
        XCTAssertTrue(back?.image === payload.image)
        XCTAssertEqual(back?.text, "lunch")
        XCTAssertNil(island.activity)
        XCTAssertNil(island.takeDraft(), "the tap took the draft")
    }

    func testAFailedReadCollapsesAndKeepsTheDraftForTheNextAdd() async {
        let island = IslandModel(hold: .milliseconds(30))
        island.geometry = IslandGeometry(safeTop: 62, screenWidth: 402)
        let payload = CapturePayload(image: UIImage(), text: "lunch")
        island.show(.failed(message: "Couldn't read that · tap to try again", retry: payload))
        XCTAssertEqual(island.push, 56, "open, it pushes the header")
        await sleep(150)
        XCTAssertNil(island.activity, "it collapses like a receipt")
        XCTAssertEqual(island.push, 0, "collapsed, the header goes back up")
        XCTAssertNil(island.retry(), "nothing to tap once it is gone")
        // The next + opens Add with the photo and the words, once.
        let kept = island.takeDraft()
        XCTAssertTrue(kept?.image === payload.image)
        XCTAssertEqual(kept?.text, "lunch")
        XCTAssertNil(island.takeDraft())
        // A write that failed has nothing to keep and closes on its own.
        island.show(.failed(message: "Couldn't save · try again", retry: nil))
        XCTAssertNil(island.draft)
        await sleep(150)
        XCTAssertNil(island.activity)
    }

    func testANewReadReplacesTheDraft() {
        let island = IslandModel(hold: .seconds(60))
        island.show(.failed(message: "Couldn't read that", retry: CapturePayload(image: nil, text: "x")))
        XCTAssertNotNil(island.draft)
        island.show(.reading(ReadingState(kind: .text)))
        XCTAssertNil(island.draft)
    }

    // MARK: geometry and the push

    func testAnIslandPhone() {
        // iPhone 17 Pro: 402 wide, the key window's top inset 62.
        let g = IslandGeometry(safeTop: 62, screenWidth: 402)
        XCTAssertTrue(g.hasIsland)
        XCTAssertEqual(g.frame(nil), CGRect(x: 138, y: 11, width: 126, height: 37), "the cutout")
        XCTAssertEqual(g.frame(.plate), CGRect(x: 22, y: 11, width: 358, height: 121))
        XCTAssertEqual(g.frame(.receipt).height, 99)
        XCTAssertEqual(g.contentTop, 37, "the camera band stays clear")
        XCTAssertEqual(g.push(.plate), 11 + 121 + 8 - 62)
        XCTAssertEqual(g.push(.receipt), 11 + 99 + 8 - 62)
        XCTAssertEqual(g.push(nil), 0)
        XCTAssertEqual(g.radius(.plate), 34)
        XCTAssertEqual(g.radius(.receipt), 31)
        XCTAssertEqual(g.radius(nil), 18.5)
    }

    func testANarrowIslandPhoneAndThe51Threshold() {
        let g = IslandGeometry(safeTop: 51, screenWidth: 375)
        XCTAssertTrue(g.hasIsland)
        XCTAssertEqual(g.width, 343, "screen width less 32")
        XCTAssertFalse(IslandGeometry(safeTop: 50, screenWidth: 375).hasIsland)
    }

    func testAPhoneWithoutAnIslandDropsAPill() {
        // iPhone SE: 20 of status bar.
        let g = IslandGeometry(safeTop: 20, screenWidth: 375)
        XCTAssertFalse(g.hasIsland)
        XCTAssertEqual(g.contentTop, 0, "no band")
        XCTAssertEqual(g.frame(.plate), CGRect(x: 16, y: 25, width: 343, height: 84))
        XCTAssertLessThan(g.frame(nil).maxY, 0, "closed, it waits above the screen")
        XCTAssertEqual(g.push(.plate), 25 + 84 + 8 - 20)
        XCTAssertEqual(g.push(.receipt), 25 + 62 + 8 - 20)
    }

    func testTheModelPushesWhileOpen() {
        let island = IslandModel(hold: .seconds(60))
        island.geometry = IslandGeometry(safeTop: 62, screenWidth: 402)
        XCTAssertEqual(island.push, 0)
        island.show(.reading(ReadingState(kind: .photo)))
        XCTAssertEqual(island.push, 78)
        island.show(.receipt(title: "A", sub: "", score: nil))
        XCTAssertEqual(island.push, 56)
        island.close()
        XCTAssertEqual(island.push, 0)
    }

    // MARK: the curve

    func testTheProgressCurve() {
        // e = k < .5 ? k × 1.3 : .65 + (k − .5) × .7
        XCTAssertEqual(CaptureRun.curve(0), 0)
        XCTAssertEqual(CaptureRun.curve(0.25), 0.325, accuracy: 1e-9)
        XCTAssertEqual(CaptureRun.curve(0.5), 0.65, accuracy: 1e-9)
        XCTAssertEqual(CaptureRun.curve(0.75), 0.825, accuracy: 1e-9)
        XCTAssertEqual(CaptureRun.curve(1), 1, accuracy: 1e-9)
        XCTAssertEqual(CaptureRun.curve(3), 1)
        // Against the expected 7 s, held at 95 % until the answer.
        XCTAssertEqual(CaptureRun.progress(elapsed: 3.5, expected: 7), 0.65, accuracy: 1e-9)
        XCTAssertEqual(CaptureRun.progress(elapsed: 7, expected: 7), 0.95)
        XCTAssertEqual(CaptureRun.progress(elapsed: 60, expected: 7), 0.95)
    }

    // MARK: the capture run

    private func chip(_ key: String, _ value: Double, _ label: String) -> Api.Chip {
        Api.Chip(kind: "nutrition", key: key, label: label, value: .number(value),
                 date: "2026-08-31", quote: "a plate", confidence: 0.6, by: "model", unit: nil)
    }

    private func meal() throws -> Api.CaptureResult {
        let chips = [chip("kcal", 605, "605 kcal · estimate"),
                     chip("proteinG", 41, "41 g protein · estimate")]
        let body: [String: Any] = [
            "ok": true, "kind": "meal", "label": "grilled salmon, white rice, green beans",
            "chips": try JSONSerialization.jsonObject(with: JSONEncoder().encode(chips)),
            "photoId": "0f6c1b3a-7d24-4a1e-9c58-2b8f5d0e4a71",
            "items": [["name": "grilled salmon", "portion": "150 g", "kcal": 310,
                       "proteinG": 34, "carbsG": 0, "fatG": 19, "confidence": 0.7]],
        ]
        return try JSONDecoder().decode(Api.CaptureResult.self,
                                        from: JSONSerialization.data(withJSONObject: body))
    }

    private func run(_ island: IslandModel) -> CaptureRun {
        let run = island.run
        run.liveActivities = false
        run.step = .milliseconds(1)
        run.frame = .milliseconds(5)
        return run
    }

    func testTheRoutes() {
        let photo = UIImage()
        XCTAssertEqual(CaptureRun.route(CapturePayload(image: photo, text: "")), .island)
        XCTAssertEqual(CaptureRun.route(CapturePayload(image: photo, text: "what is this?")),
                       .island, "a photo is always a plate")
        XCTAssertEqual(CaptureRun.route(CapturePayload(image: nil, text: "should I eat more?")),
                       .sheet)
        XCTAssertEqual(CaptureRun.route(CapturePayload(image: nil, text: "walked 20 min")),
                       .island)
    }

    func testAPhotoReadsInTheIsland() async throws {
        let island = IslandModel(hold: .seconds(60))
        let run = run(island)
        let seen = try meal()
        var confirmed: [String] = []
        var sentBack: (String?, [Api.CaptureItem]?)
        var asked = false
        run.capture = { _, _ in seen }
        run.confirm = { chips, _, photoId, items in
            confirmed = chips.map(\.key)
            sentBack = (photoId, items)
            return try JSONDecoder().decode(Api.ConfirmResult.self,
                                            from: Data(#"{"ok":true,"day":"2026-08-31"}"#.utf8))
        }
        run.ask = { _ in asked = true; return Api.Asked(answer: nil, error: nil) }
        let landed = expectation(forNotification: .ovCaptured, object: nil)

        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
        let receipt = await run.send(CapturePayload(image: image, text: ""))
        XCTAssertNil(receipt, "the sheet goes at once")
        await run.task?.value
        await fulfillment(of: [landed], timeout: 1)

        guard case .reading(let state) = island.activity else {
            return XCTFail("expected the read, got \(String(describing: island.activity))")
        }
        XCTAssertTrue(state.thumb === image)
        XCTAssertEqual(state.items, ["grilled salmon", "white rice", "green beans"])
        XCTAssertEqual(state.progress, 1)
        XCTAssertEqual(state.result, .init(title: "Grilled salmon, white rice, green beans",
                                           sub: "605 kcal · 41 g protein"))
        XCTAssertEqual(confirmed, ["kcal", "proteinG"])
        // The meal keeps its photo and the reader's items.
        XCTAssertEqual(sentBack.0, "0f6c1b3a-7d24-4a1e-9c58-2b8f5d0e4a71")
        XCTAssertEqual(sentBack.1?.map(\.name), ["grilled salmon"])
        XCTAssertEqual(sentBack.1?.first?.kcal, 310)
        XCTAssertFalse(asked)
    }

    func testWordsReadInTheIslandToo() async {
        let island = IslandModel(hold: .seconds(60))
        let run = run(island)
        run.compose = { _ in
            try JSONDecoder().decode(Api.Composed.self, from: Data(
                #"{"reply":"Logged the walk.","chips":[]}"#.utf8))
        }
        _ = await run.send(CapturePayload(image: nil, text: "walked 20 min"))
        await run.task?.value
        guard case .reading(let state) = island.activity else { return XCTFail() }
        XCTAssertEqual(state.kind, .text)
        XCTAssertEqual(state.result, .init(title: "Noted", sub: "Logged the walk."))
    }

    func testAQuestionAnswersInTheSheet() async {
        let island = IslandModel(hold: .seconds(60))
        let run = run(island)
        var read = false
        run.capture = { _, _ in read = true; throw Api.Failure(status: 0, message: "no") }
        run.compose = { _ in read = true; throw Api.Failure(status: 0, message: "no") }
        run.ask = { q in Api.Asked(answer: "Yes, more protein at lunch.", error: nil) }

        let receipt = await run.send(CapturePayload(image: nil, text: "should I eat more?"))
        XCTAssertEqual(receipt?.said, "Yes, more protein at lunch.")
        XCTAssertNil(island.activity, "a question never opens the island")
        XCTAssertNil(run.task)
        XCTAssertFalse(read)
    }

    func testAFailureKeepsThePhotoAndTheWords() async {
        let island = IslandModel(hold: .milliseconds(30))
        let run = run(island)
        run.capture = { _, _ in throw URLError(.notConnectedToInternet) }
        let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { _ in }
        let payload = CapturePayload(image: image, text: "dinner")

        _ = await run.send(payload)
        await run.task?.value
        guard case .failed(let message, let kept) = island.activity else {
            return XCTFail("expected the failure, got \(String(describing: island.activity))")
        }
        XCTAssertEqual(message, "Couldn't read that · tap to try again")
        XCTAssertEqual(kept, payload)
        await sleep(150)
        XCTAssertNil(island.activity, "a failed read collapses like a receipt")
        XCTAssertTrue(island.takeDraft()?.image === image, "and keeps the photo for the next +")
    }

    // MARK: Today's receipts

    private func canned(movesDone: Int) throws -> TodayModel {
        func json(_ name: String) throws -> [String: Any] {
            let url = try XCTUnwrap(ContractTests.fixtureURL(name))
            return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url))
                as? [String: Any])
        }
        var today = try json("today")
        var score = try XCTUnwrap(today["score"] as? [String: Any])
        var input = try XCTUnwrap(score["input"] as? [String: Any])
        input["moves"] = ["done": movesDone, "due": 5]
        score["input"] = input
        today["score"] = score
        func decode<T: Decodable>(_ o: [String: Any]) throws -> T {
            try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: o))
        }
        return TodayModel(today: try decode(today), plan: try decode(json("plan-today")),
                          meals: nil, days: [])
    }

    func testTheLastTickSaysAllDoneWithTheServersStreak() async throws {
        let m = try canned(movesDone: 1)
        m.send = { _, _, _ in }
        var receipts: [TodayReceipt] = []
        m.onReceipt = { receipts.append($0) }
        while let row = m.queue.first { m.tick(row) }
        await m.drain()
        // The server saw a tick today, so its streak of 3 already holds today.
        XCTAssertEqual(receipts.last, .allDone(streak: 3, moves: 5, score: m.result?.score))
        guard case .receipt = IslandActivity(receipts[0]) else { return XCTFail() }
        XCTAssertEqual(IslandActivity(receipts.last!).shape, .receipt)
    }

    func testAllDoneCountsTodayWhenTheServerHadNoTick() async throws {
        let m = try canned(movesDone: 0)
        m.send = { _, _, _ in }
        var receipts: [TodayReceipt] = []
        m.onReceipt = { receipts.append($0) }
        while let row = m.queue.first { m.tick(row) }
        await m.drain()
        guard case .allDone(let streak, _, _) = receipts.last else { return XCTFail() }
        XCTAssertEqual(streak, 4)
    }
}
