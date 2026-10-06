import XCTest
@testable import OpenVitals

/// Phase 38 D6: Research's plum header. The line under the count says what
/// the count does not.
final class ResearchTests: XCTestCase {

    private func rows() throws -> [Api.Paper] {
        let url = try XCTUnwrap(ContractTests.fixtureURL("research"), "no research fixture")
        return try JSONDecoder().decode(Api.ResearchList.self, from: Data(contentsOf: url)).rows
    }

    func testTheHeaderLine() throws {
        let rows = try rows()
        XCTAssertFalse(rows.isEmpty)
        let line = ResearchView.line(rows)
        print("RESEARCH line \(line)")
        XCTAssertFalse(line.contains("papers found"), line)
        let unread = rows.filter { !$0.read }.count
        if unread > 0 { XCTAssertTrue(line.hasSuffix("\(unread) not read yet"), line) }
        XCTAssertEqual(ResearchView.line([]), "none found yet")
    }

    /// Phase 38 D8: the chips count what each filter keeps.
    func testTheFiltersCount() throws {
        let rows = try rows()
        let moving = rows.filter { $0.moves != nil }.count
        XCTAssertEqual(ResearchView.count("All", rows), rows.count)
        XCTAssertEqual(ResearchView.count("Moves something", rows), moving)
        XCTAssertEqual(ResearchView.shown("Moves something", rows).map(\.id),
                       rows.filter { $0.moves != nil }.map(\.id))
        XCTAssertEqual(ResearchView.count("All", []), 0)
    }

    /// The word for what a paper moves wears the colour of its direction.
    /// `POST /api/research` takes `{ topic }` for a watched topic; sending a
    /// `topic:` id as a condition is the 404 "not yours".
    func testResearchNowPicksTheBodyByTheId() throws {
        XCTAssertEqual(Api.researchBody("topic:full"), ["topic": "full"])
        XCTAssertEqual(Api.researchBody("topic:cold exposure"), ["topic": "cold exposure"])
        XCTAssertEqual(Api.researchBody("ascvd_risk"), ["conditionId": "ascvd_risk"])
        XCTAssertEqual(ResearchView.name("topic:cold exposure"), "Cold exposure")
    }

    /// A topic's reply: the cooldown with `days`, and a run with `runTopic`'s
    /// fields. Both decode, and say the topic's own rule.
    func testATopicRunDecodesAndSaysItsRule() throws {
        let wait = try JSONDecoder().decode(Api.ResearchRun.self, from: Data("""
            {"ok":false,"cooldown":true,"lastRun":"2026-09-20","since":"2026-09-20","days":30}
            """.utf8))
        XCTAssertEqual(wait.days, 30)
        XCTAssertTrue(ResearchView.said("topic:full", wait).hasSuffix("One run per topic per 30 days."))
        XCTAssertTrue(ResearchView.said("ldl", wait).hasSuffix("per condition per ninety days."))
        let ran = try JSONDecoder().decode(Api.ResearchRun.self, from: Data("""
            {"ok":true,"topic":"full","since":"2026-09-06","found":12,"stored":4,
             "outcomes":1,"read":false,"reason":"no key"}
            """.utf8))
        XCTAssertEqual(ran.outcomes, 1)
        XCTAssertEqual(ran.read, false)
        XCTAssertTrue(ResearchView.said("topic:full", ran).hasSuffix("4 kept, 1 finding."))
        XCTAssertEqual(ResearchView.footnote(topics: true, conditions: false).prefix(36),
                       "One run per topic per thirty days. I")
    }

    /// The moves line shows only when the paper moves something: "moves
    /// nothing for you" on every row says nothing.
    func testTheMovesLineOnlyWhenSomethingMoves() throws {
        for paper in try rows() {
            XCTAssertEqual(paper.showsMoves, paper.moves != nil, paper.id)
        }
    }

    func testTheMovesWordColours() {
        XCTAssertEqual(PaperCard.ink("bad"), Hy.rose)
        XCTAssertEqual(PaperCard.ink("ok"), Hy.green)
        XCTAssertEqual(PaperCard.ink("none"), Hy.ink3)
    }

    /// The "Not read yet" card says what the rows hold: a row with a plain
    /// line is more than a title, and neither kind has a grade.
    func testTheUnreadNoteSaysWhatIsThere() throws {
        let rows = try rows()
        XCTAssertTrue(ResearchView.unreadNote(rows).contains("abstract in plain words"))
        let bare = rows.map { p in
            var q = p
            q.summary = nil
            return q
        }
        XCTAssertTrue(ResearchView.unreadNote(bare).contains("nothing else"))
    }

    /// A paper that backs an action draws Ask and Add; one that backs none
    /// draws Ask only.
    @MainActor
    func testACardDrawsItsDoors() throws {
        var paper = try XCTUnwrap(try rows().first)
        paper.action = Api.Paper.Action(id: "int:iron", title: "Oral iron",
                                        dose: "60 mg/day", grade: "A")
        let image = try Hosted.image(
            ResearchView(rows: [paper] + (try rows()).dropFirst().prefix(1)))
        Hosted.keep(image, "papers-card-action", in: self)
        XCTAssertNotNil(image.cgImage)
    }

    @MainActor
    func testResearchDraws() throws {
        let image = try Hosted.image(ResearchView(rows: try rows()))
        Hosted.keep(image, "d8-test-research", in: self)
        XCTAssertGreaterThan(Hosted.colours(image, rows: 60...200), 20, "the plum header")
        XCTAssertGreaterThan(Hosted.colours(image, rows: 260...600), 20, "the paper cards")
        XCTAssertNotNil(try Hosted.image(ResearchView(rows: [])).cgImage)
    }
}
