import XCTest
@testable import OpenVitals

final class CheckinTests: XCTestCase {

    private func body(_ name: String) throws -> Api.CheckinBody {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try JSONDecoder().decode(Api.CheckinBody.self, from: Data(contentsOf: url))
    }

    func testQuestionDecodes() throws {
        let b = try body("checkin-question")
        XCTAssertTrue(b.due)
        guard case .question(let key, _, let why, let options)? = b.screen else {
            return XCTFail("not question")
        }
        XCTAssertEqual(key, "sym_cold")
        XCTAssertFalse(why.isEmpty)
        XCTAssertEqual(options.count, 2)
        XCTAssertEqual(options[0].moves?.to, 38)
        XCTAssertEqual(b.picture.count, 3)
    }

    func testAFollowUpIsAPlainQuestionThatNamesTheItem() throws {
        guard case .question(let key, let question, _, let options)? = try body("checkin-followup").screen else {
            return XCTFail("not question")
        }
        XCTAssertTrue(key.hasPrefix("followup_adherence:"))
        XCTAssertTrue(question.hasPrefix("Iron bisglycinate"))
        XCTAssertEqual(options.map(\.label), ["Every day", "Most days", "Some days", "Not at all"])
        XCTAssertTrue(options.allSatisfy { $0.moves == nil })
    }

    func testSinceDecodes() throws {
        guard case .since(let moved, let hunches, let test)? = try body("checkin-since").screen else {
            return XCTFail("not since")
        }
        XCTAssertEqual(moved.first?.to, 61)
        XCTAssertNil(moved.last?.by)
        XCTAssertEqual(hunches.count, 1)
        XCTAssertEqual(test?.price, "€11")
    }

    func testIdleHasNoScreen() throws {
        let b = try body("checkin-idle")
        XCTAssertFalse(b.due)
        XCTAssertNil(b.screen)
    }

    func testAnUnknownKindFailsLoudly() {
        let json = #"{"due":true,"dueAt":"2026-10-08T06:00:00.000Z","screen":{"kind":"later"},"progress":{"at":0,"of":1},"picture":[]}"#
        XCTAssertThrowsError(try JSONDecoder().decode(Api.CheckinBody.self, from: Data(json.utf8)))
    }

    func testReminderDateIsTheLaterOfDueAndSnooze() {
        // CheckinReminder.fireDate(dueAt:) parses ISO with fractional seconds
        XCTAssertNotNil(CheckinReminder.fireDate("2026-10-08T06:00:00.000Z"))
        XCTAssertEqual(CheckinReminder.fireDate("2026-10-08T06:00:00Z"),
                       CheckinReminder.fireDate("2026-10-08T06:00:00.000Z"))
        XCTAssertNil(CheckinReminder.fireDate("next week"))
    }

    func testEveryFixtureIsCompiledIn() {
        for name in CheckinFlow.fixtures {
            XCTAssertNotNil(CheckinFlow.canned(name), name)
        }
        XCTAssertEqual(CheckinFlow.fixtures.compactMap { CheckinFlow.canned($0)?.screen?.kind },
                       ["question", "question", "since"])
    }

    func testTheWalkRunsARoundThenEnds() throws {
        let next = try CheckinFlow.walk(["screen": "question", "key": "sym_cold", "value": "Yes"])
        guard case .question(let key, _, _, _)? = next.screen else { return XCTFail("not question") }
        XCTAssertTrue(key.hasPrefix("followup_"))
        XCTAssertEqual(try CheckinFlow.walk(["screen": "question", "key": key, "skip": true]).screen?.kind,
                       "since")
        XCTAssertNil(try CheckinFlow.walk(["done": true]).screen)
        XCTAssertNil(try CheckinFlow.walk(["skip": true]).screen)
    }

    func testTheLinesUseTheEnginesNumbers() throws {
        guard case .since(let moved, let hunches, _)? = try body("checkin-since").screen else {
            return XCTFail("not since")
        }
        XCTAssertEqual(CheckinFlow.movedLine(moved[0]),
                       "Iron deficiency 41% → 61%, from your hair loss answer")
        XCTAssertEqual(CheckinFlow.movedLine(moved[2]), "Insulin resistance 20% → 23%")
        XCTAssertEqual(CheckinFlow.hunchLine(hunches[0]), "Iron deficiency got stronger, 41% → 61%")
        XCTAssertEqual(CheckinFlow.count(.init(at: 1, of: 5)), "2 of 5")
    }

    func testAskLaterSendsMinutesEastOfUTC() throws {
        let east = try XCTUnwrap(TimeZone(secondsFromGMT: 3 * 3600))
        XCTAssertEqual(CheckinFlow.later(east) as NSDictionary, ["later": true, "offsetMin": 180])
        let west = try XCTUnwrap(TimeZone(secondsFromGMT: -5 * 3600))
        XCTAssertEqual(CheckinFlow.later(west)["offsetMin"] as? Int, -300)
    }
}
