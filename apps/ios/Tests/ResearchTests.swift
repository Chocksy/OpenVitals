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
    func testTheMovesWordColours() {
        XCTAssertEqual(PaperCard.ink("bad"), Hy.rose)
        XCTAssertEqual(PaperCard.ink("ok"), Hy.green)
        XCTAssertEqual(PaperCard.ink("none"), Hy.ink3)
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
