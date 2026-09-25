import XCTest
@testable import OpenVitals

/// Phase 37 task B3: the port against the server's own test vectors.
///
/// `Tests/Fixtures/score-vectors.json` is a copy of
/// `apps/simple/fixtures/score-vectors.json`, which `lib/score.test.ts` runs
/// too. Every vector, every field: a preview that drifts from the server by
/// one point is a number that jumps when the answer lands.
final class ScoreTests: XCTestCase {

    struct Vector: Decodable {
        let name: String
        let input: ScoreInput
        let expected: ScoreResult
    }

    private func vectors() throws -> [Vector] {
        let url = try XCTUnwrap(ContractTests.fixtureURL("score-vectors"),
                                "no score-vectors.json in the test bundle")
        return try JSONDecoder().decode([Vector].self, from: Data(contentsOf: url))
    }

    func testEveryVector() throws {
        let all = try vectors()
        XCTAssertGreaterThanOrEqual(all.count, 9)
        for v in all {
            let got = Score.of(v.input)
            XCTAssertEqual(got.score, v.expected.score, "\(v.name): score")
            XCTAssertEqual(got.word, v.expected.word, "\(v.name): word")
            XCTAssertEqual(got.life, v.expected.life, "\(v.name): life")
            XCTAssertEqual(got.blood, v.expected.blood, "\(v.name): blood")
            XCTAssertEqual(got.genes, v.expected.genes, "\(v.name): genes")
            XCTAssertEqual(got.rows.sleep, v.expected.rows.sleep, "\(v.name): sleep")
            XCTAssertEqual(got.rows.moves, v.expected.rows.moves, "\(v.name): moves")
            XCTAssertEqual(got.rows.kcal, v.expected.rows.kcal, "\(v.name): kcal")
            XCTAssertEqual(got.rows.protein, v.expected.rows.protein,
                           "\(v.name): protein")
            XCTAssertEqual(got, v.expected, v.name)
        }
    }

    /// JS `Math.round` takes a half up on both sides of zero.
    func testRoundingIsJavaScripts() {
        XCTAssertEqual(Score.round(82.5), 83)
        XCTAssertEqual(Score.round(62.5), 63)
        XCTAssertEqual(Score.round(-2.5), -2)
        XCTAssertEqual(Score.round(-2.6), -3)
        XCTAssertEqual(Score.round(0.4), 0)
    }

    /// Nothing is due: no moves row, not a zero.
    func testNothingDueIsNoMovesRow() {
        let input = ScoreInput(sleepHours: 8, moves: .init(done: 0, due: 0),
                               kcal: nil, proteinG: nil,
                               targets: .init(kcal: nil, proteinG: nil),
                               blood: nil, genes: nil)
        let result = Score.of(input)
        XCTAssertNil(result.rows.moves)
        XCTAssertEqual(result.life, 100)
        XCTAssertEqual(result.score, 100)
    }
}
