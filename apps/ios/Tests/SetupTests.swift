import XCTest
@testable import OpenVitals

/// Phase 43C: the setup flow's contract (`SetupBody` in
/// `apps/simple/lib/setup-server.ts`) and the pure pieces `SetupView` draws
/// from. One fixture per screen kind, synthetic values only.
final class SetupTests: XCTestCase {

    private func body(_ name: String) throws -> Api.SetupBody {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try JSONDecoder().decode(Api.SetupBody.self, from: Data(contentsOf: url))
    }

    // MARK: one decode per screen kind

    func testIntroDecodes() throws {
        let b = try body("setup-intro")
        XCTAssertEqual(b.screen.kind, "intro")
        guard case .intro(let goals) = b.screen else { return XCTFail("not intro") }
        XCTAssertEqual(goals.first, "Feel better")
        XCTAssertEqual(goals.count, 4)
        XCTAssertTrue(b.due)
        XCTAssertEqual(b.progress.at, 0)
        XCTAssertTrue(b.picture.isEmpty)
    }

    func testUploadDecodes() throws {
        let b = try body("setup-upload")
        XCTAssertEqual(b.screen.kind, "upload")
        XCTAssertEqual(b.progress.of, 15)
    }

    func testBasicsDecodes() throws {
        let b = try body("setup-basics")
        guard case .basics(let sex, let year, let country) = b.screen else {
            return XCTFail("not basics")
        }
        XCTAssertNil(sex)
        XCTAssertNil(year)
        XCTAssertNil(country)
    }

    func testBodyDecodes() throws {
        let b = try body("setup-body")
        guard case .body(let height, let weight, let waist) = b.screen else {
            return XCTFail("not body")
        }
        XCTAssertNil(height)
        XCTAssertEqual(weight, "64.5")
        XCTAssertNil(waist)
        XCTAssertEqual(b.picture.first?.name, "Insulin resistance")
        XCTAssertEqual(b.picture.first?.p ?? 0, 0.468, accuracy: 0.0001)
    }

    func testQuestionDecodes() throws {
        let b = try body("setup-question")
        guard case .question(let key, let text, let options) = b.screen else {
            return XCTFail("not question")
        }
        XCTAssertEqual(key, "sym_cycle")
        XCTAssertTrue(text.hasPrefix("Are your periods"))
        XCTAssertEqual(options[1].moves?.to, 31)
        XCTAssertNil(options[2].moves)
    }

    func testTreatmentsDecodes() throws {
        let b = try body("setup-treatments")
        guard case .treatments(let current) = b.screen else { return XCTFail("not treatments") }
        XCTAssertEqual(current.map(\.what), ["Iron", "Vitamin D"])
        XCTAssertEqual(current[0].stopped, "2025-09")
        XCTAssertNil(current[1].stopped)
        XCTAssertEqual(current[1].route, "oral")
    }

    func testDataDecodes() throws {
        let b = try body("setup-data")
        guard case .data(let needsUpload) = b.screen else { return XCTFail("not data") }
        XCTAssertTrue(needsUpload)
    }

    func testRevealFromAnswersDecodes() throws {
        let b = try body("setup-reveal")
        guard case .reveal(let r) = b.screen else { return XCTFail("not reveal") }
        XCTAssertTrue(r.fromAnswersOnly)
        XCTAssertNil(r.hunchId)
        XCTAssertNil(r.hunch)
        XCTAssertEqual(r.picture.count, 3)
        XCTAssertEqual(r.test?.price, "€11")
        XCTAssertEqual(r.action?.title, "Mediterranean diet")
        XCTAssertNil(r.action?.dose)
    }

    /// `case` is the same JSON as `GET /api/hunches/:id`.
    func testRevealWithACaseDecodes() throws {
        let b = try body("setup-reveal-case")
        guard case .reveal(let r) = b.screen else { return XCTFail("not reveal") }
        XCTAssertFalse(r.fromAnswersOnly)
        let c = try XCTUnwrap(r.hunch)
        XCTAssertEqual(c.id, r.hunchId)
        XCTAssertEqual(c.differential?.options.first?.name, "Atrophic gastritis")
        XCTAssertEqual(r.test?.price, "194.98 RON")
        XCTAssertEqual(r.action?.dose, "4 weeks")
    }

    func testAnUnknownKindFailsLoudly() {
        let json = #"{"due":true,"screen":{"kind":"later"},"progress":{"at":0,"of":1},"picture":[]}"#
        XCTAssertThrowsError(try JSONDecoder().decode(Api.SetupBody.self, from: Data(json.utf8)))
    }

    /// Every setup fixture is compiled in, so the gallery can draw it.
    func testEveryScreenHasACompiledFixture() {
        for name in SetupFlow.fixtures {
            XCTAssertNotNil(SetupFlow.canned(name), name)
        }
        XCTAssertEqual(Set(SetupFlow.fixtures.compactMap { SetupFlow.canned($0)?.screen.kind }),
                       ["intro", "upload", "basics", "body", "question", "treatments", "data", "reveal"])
    }

    // MARK: what the view prints

    func testSkipIsOfferedExceptOnIntroBasicsAndReveal() {
        XCTAssertEqual(["intro", "upload", "basics", "body", "question", "treatments", "data", "reveal"]
            .filter(SetupFlow.skippable),
                       ["upload", "body", "question", "treatments", "data"])
    }

    func testDeltasKeepMovesOfTwoPointsOrMore() {
        let was = [Api.PictureRow(id: "a", name: "A", p: 0.12), .init(id: "b", name: "B", p: 0.40)]
        let now = [Api.PictureRow(id: "a", name: "A", p: 0.31), .init(id: "b", name: "B", p: 0.41),
                   .init(id: "c", name: "C", p: 0.30)]
        XCTAssertEqual(SetupFlow.deltas(from: was, to: now), ["a": 19])
        XCTAssertEqual(SetupFlow.deltaText(19), "+19")
        XCTAssertEqual(SetupFlow.deltaText(-7), "−7")
    }

    func testAnOptionSaysWhatItMoves() throws {
        let b = try body("setup-question")
        guard case .question(_, _, let options) = b.screen else { return XCTFail("not question") }
        XCTAssertEqual(SetupFlow.movesLine(options[1]),
                       "Irregular moves Polycystic ovary syndrome 11 → 31")
        XCTAssertNil(SetupFlow.movesLine(options[2]))
        XCTAssertEqual(SetupFlow.barLabel(0.468), "47%")
    }

    func testATreatmentPostsInTheServersShape() {
        var row = SetupFlow.TreatmentDraft()
        row.what = "Iron"
        row.route = "iv"
        row.started = SetupFlow.date("2025-03")!
        row.still = false
        row.stopped = SetupFlow.date("2025-06")!
        XCTAssertEqual(row.posted as NSDictionary,
                       ["what": "Iron", "route": "iv", "started": "2025-03", "stopped": "2025-06"])
        row.still = true
        XCTAssertNil(row.posted["stopped"])
        row.what = "Other"
        row.other = "  Folic acid "
        XCTAssertEqual(row.posted["what"] as? String, "Folic acid")
        row.other = " "
        XCTAssertFalse(row.ready)
    }
}
