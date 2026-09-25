import SwiftUI
import XCTest
@testable import OpenVitals

/// Phase 38 D3: Body on the canned fixtures, a person with no data at all
/// (Review focus 1), and the lines Body writes.
@MainActor
final class BodyTests: XCTestCase {

    private func json(_ name: String) throws -> [String: Any] {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url))
            as? [String: Any])
    }

    private func decode<T: Decodable>(_ object: [String: Any], as: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
    }

    private func canned() throws -> (TodayModel, Api.BodyDay) {
        let model = TodayModel(today: try decode(json("today"), as: Api.Today.self),
                               plan: try decode(json("plan-today"), as: Api.PlanDay.self),
                               meals: try decode(json("meals"), as: Api.MealDay.self),
                               days: [])
        return (model, try decode(json("body"), as: Api.BodyDay.self))
    }

    /// No score, no meals, no rows, never synced.
    private func empty() throws -> (TodayModel, Api.BodyDay) {
        var today = try json("today")
        today["score"] = NSNull()
        var meals = try json("meals")
        meals["meals"] = [Any]()
        meals["totals"] = ["kcal": NSNull(), "protein_g": NSNull(), "carbs_g": NSNull(),
                           "fat_g": NSNull(), "estimated": false]
        var body = try json("body")
        body["rows"] = [Any]()
        body["synced"] = ["types": 0, "lastAt": NSNull()]
        let model = TodayModel(today: try decode(today, as: Api.Today.self), plan: nil,
                               meals: try decode(meals, as: Api.MealDay.self), days: [])
        return (model, try decode(body, as: Api.BodyDay.self))
    }

    /// A whole screen in a real window: `ImageRenderer` leaves a
    /// `ScrollView`'s content blank. The run loop turns so the `.task` lands.
    private func hosted(_ view: some View) -> PixelDiff.Bitmap? {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first else { return nil }
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.overrideUserInterfaceStyle = .light
        window.rootViewController = UIHostingController(rootView: view)
        window.isHidden = false
        defer { window.isHidden = true }
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.4))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        return image.cgImage.map(PixelDiff.bitmap)
    }

    private func assertNotOneColour(_ shot: PixelDiff.Bitmap,
                                    file: StaticString = #filePath, line: UInt = #line) {
        let first = Array(shot.pixels.prefix(4))
        let differing = stride(from: 0, to: shot.pixels.count, by: 4).filter {
            Array(shot.pixels[$0..<$0 + 4]) != first
        }.count
        XCTAssertGreaterThan(differing, shot.width * shot.height / 10,
                             "the render is (nearly) one colour", file: file, line: line)
    }

    // MARK: the words

    func testTheCannedBody() throws {
        let (model, day) = try canned()
        XCTAssertEqual(model.result?.life, 73)
        XCTAssertEqual(Score.word(model.result?.life), "On track")
        XCTAssertEqual(model.mealList.count, 1)
        XCTAssertEqual(BodyText.mealsSub(count: model.mealList.count, kcal: model.food(\.kcal)),
                       "1 meal · 605 kcal")
        // The clock is the phone's own zone, so only the words around it.
        let line = try XCTUnwrap(BodyText.line(day))
        XCTAssertTrue(line.hasPrefix("12 types · last sync "), line)
        XCTAssertEqual(BodyText.macros(model.mealList[0].totals), "P 41 · C 64 · F 20 g")
    }

    /// A portion stepped in the meal sheet moves the header's layer before
    /// the server answers, as on Home.
    func testAPortionMovesTheLayer() async throws {
        let (model, _) = try canned()
        model.sendPatch = { _, _ in }
        model.debounce = .zero
        let before = model.result?.life
        let id = try XCTUnwrap(model.mealList.first?.id)
        model.setServings(id, 1.5)
        print("BODY life \(String(describing: before)) → \(String(describing: model.result?.life))")
        XCTAssertNotEqual(model.result?.life, before)
        await model.drain()
    }

    /// Every type the server lists is a card, the empty ones included.
    func testATypeWithNothingIsNeverDropped() throws {
        let (_, day) = try canned()
        let empty = day.rows.filter { $0.value == nil }
        XCTAssertFalse(empty.isEmpty, "the fixture should carry a type with nothing")
        for row in empty { XCTAssertEqual(BodyText.word(row), "nothing today") }
        for row in day.rows where row.value != nil {
            XCTAssertEqual(BodyText.word(row), row.word)
        }
        XCTAssertEqual(HyState.ink("good"), Hy.green)
        XCTAssertEqual(HyState.ink("borderline"), Hy.amber)
    }

    func testTheLinesWithNoData() throws {
        let (model, day) = try empty()
        XCTAssertNil(model.result?.life)
        XCTAssertNil(Score.word(nil))
        XCTAssertTrue(model.mealList.isEmpty)
        XCTAssertEqual(BodyText.line(day), "0 types · nothing synced yet")
        XCTAssertNil(BodyText.line(nil))
        XCTAssertEqual(BodyText.mealsSub(count: 0, kcal: nil), "0 meals")
        let none = try decode(["kcal": NSNull(), "protein_g": NSNull(), "carbs_g": NSNull(),
                               "fat_g": NSNull(), "estimated": true], as: Api.Macros.self)
        XCTAssertEqual(BodyText.macros(none), "P — · C — · F — g")
    }

    // MARK: the render

    /// Body with the fixtures draws full width and not blank; with nothing at
    /// all it still draws, and differently.
    func testTheLineAfterTheSyncButton() throws {
        let (_, day) = try canned()
        var parts = DateComponents()
        parts.year = 2026; parts.month = 9; parts.day = 25; parts.hour = 9; parts.minute = 12
        let at = try XCTUnwrap(Calendar.current.date(from: parts))
        XCTAssertEqual(BodyText.clock(at), "09:12")
        XCTAssertEqual(BodyText.ended(error: "", at: at), .synced(at))
        XCTAssertEqual(BodyText.ended(error: "offline", at: at), .failed("offline"))
        XCTAssertEqual(BodyText.line(day, ended: .synced(at)), "12 types · synced 09:12")
        XCTAssertEqual(BodyText.line(nil, ended: .synced(at)), "synced 09:12")
        XCTAssertEqual(BodyText.line(day, ended: .failed("The server is down.")),
                       "The server is down.")
        XCTAssertEqual(BodyText.line(day, ended: nil), BodyText.line(day))
    }

    func testBodyDrawsWithTheFixturesAndWithNothing() throws {
        let (model, day) = try canned()
        let full = try XCTUnwrap(hosted(BodyView(model: model, day: day)), "no window")
        XCTAssertEqual(full.width, 780)
        assertNotOneColour(full)

        let (bare, none) = try empty()
        let blank = try XCTUnwrap(hosted(BodyView(model: bare, day: none)), "no window")
        assertNotOneColour(blank)
        let (result, _) = PixelDiff.compare(full, blank)
        XCTAssertGreaterThan(result.fraction, 0.05, "the canned day and no data look the same")
    }
}
