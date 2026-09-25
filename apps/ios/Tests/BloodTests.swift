import SwiftUI
import XCTest
@testable import OpenVitals

/// Phase 38 D2: Blood in the Hybrid look. The header's line, the shelves'
/// arithmetic, and the whole screen drawn in a real window with the canned
/// markers, with nothing at all (Review focus 1), and with a failed read.
@MainActor
final class BloodTests: XCTestCase {

    private func decode<T: Decodable>(_ name: String, as: T.Type) throws -> T {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    private func canned() throws -> (Api.Markers, Api.Today) {
        (try decode("markers", as: Api.Markers.self), try decode("today", as: Api.Today.self))
    }

    // MARK: the arithmetic

    func testTheHeaderLineCountsTheWords() throws {
        let (markers, today) = try canned()
        XCTAssertEqual(BloodView.line(markers), "82 in range · 22 borderline · 6 off")
        XCTAssertEqual(today.score?.result.blood, 85)
        XCTAssertEqual(Score.word(today.score?.result.blood), "Strong")
        XCTAssertEqual(BloodView.line(Api.Markers(days: 365, markers: [])), "No lab results yet")
    }

    func testNeedsALookIsOffThenBorderline() throws {
        let (markers, _) = try canned()
        let look = BloodView.needsALook(markers)
        XCTAssertEqual(look.count, 28)
        XCTAssertTrue(look.prefix(6).allSatisfy { $0.word == "off" })
        XCTAssertTrue(look.dropFirst(6).allSatisfy { $0.word == "borderline" })
        XCTAssertTrue(BloodView.needsALook(Api.Markers(days: 365, markers: [])).isEmpty)
    }

    func testTheSystemsKeepTheServersOrder() throws {
        let (markers, _) = try canned()
        let groups = BloodView.grouped(markers.markers)
        XCTAssertEqual(groups.count, 15)
        XCTAssertEqual(groups.first?.name, markers.markers.first?.system)
        XCTAssertEqual(groups.map(\.rows.count).reduce(0, +), 132)
        XCTAssertTrue(BloodView.grouped([]).isEmpty)
    }

    func testTheHeadingShelfTakesOnlyProjectedGoals() throws {
        let (_, today) = try canned()
        XCTAssertEqual(BloodView.headings(today).map(\.code), ["ldl_cholesterol"])
        XCTAssertTrue(BloodView.headings(nil).isEmpty)
    }

    // MARK: the screen

    /// The screen in a real window: `ImageRenderer` leaves a `ScrollView`'s
    /// content blank. The run loop turns so the first layout lands.
    private func hosted(_ view: some View) throws -> UIImage {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.overrideUserInterfaceStyle = .light
        window.rootViewController = UIHostingController(rootView: view)
        window.isHidden = false
        defer { window.isHidden = true }
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.4))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        return UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
    }

    /// How many distinct colours a strip of the picture has: a blank or
    /// one-colour strip has one or two, a drawn one many.
    private func colours(_ image: UIImage, rows: ClosedRange<CGFloat>) -> Int {
        guard let cg = image.cgImage, let data = cg.dataProvider?.data,
              let bytes = CFDataGetBytePtr(data) else { return 0 }
        let scale = image.scale
        var seen = Set<UInt32>()
        let y0 = Int(rows.lowerBound * scale), y1 = min(cg.height - 1, Int(rows.upperBound * scale))
        for y in stride(from: y0, through: y1, by: 3) {
            for x in stride(from: 0, to: cg.width, by: 3) {
                let i = y * cg.bytesPerRow + x * 4
                seen.insert(UInt32(bytes[i]) << 16 | UInt32(bytes[i + 1]) << 8 | UInt32(bytes[i + 2]))
            }
        }
        return seen.count
    }

    /// Kept for the reviewer to look at; the test does not need it.
    private func keep(_ image: UIImage, _ name: String) {
        let dir = URL(fileURLWithPath: "/tmp/p38")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? image.pngData()?.write(to: dir.appendingPathComponent("d2-test-\(name).png"))
        let shot = XCTAttachment(image: image)
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testBloodDrawsWithTheFixtures() throws {
        let (markers, today) = try canned()
        let image = try hosted(BloodView(markers: markers, today: today))
        keep(image, "fixtures")
        // The header, the Needs a look cards and the projection all draw.
        XCTAssertGreaterThan(colours(image, rows: 60...200), 20, "the plum header")
        XCTAssertGreaterThan(colours(image, rows: 260...520), 40, "the marker cards")
    }

    /// Review focus 1: a new person. No markers, no score: the header says
    /// "—" and the screen says what is missing.
    func testBloodDrawsWithNothing() throws {
        var today = try JSONSerialization.jsonObject(
            with: Data(contentsOf: XCTUnwrap(ContractTests.fixtureURL("today")))) as? [String: Any]
        today?["score"] = NSNull()
        today?["goals"] = [Any]()
        let empty = try JSONDecoder().decode(
            Api.Today.self, from: JSONSerialization.data(withJSONObject: XCTUnwrap(today)))
        let image = try hosted(BloodView(markers: Api.Markers(days: 365, markers: []),
                                         today: empty))
        keep(image, "empty")
        XCTAssertGreaterThan(colours(image, rows: 60...200), 20)

        let failed = try hosted(BloodView(markers: nil, today: nil,
                                          error: "The server did not answer."))
        keep(failed, "error")
        XCTAssertGreaterThan(colours(failed, rows: 60...200), 20)

        let loading = try hosted(BloodView(markers: nil, today: nil))
        XCTAssertNotNil(loading.cgImage)
    }

    func testTheMarkerSheetDraws() throws {
        let (markers, _) = try canned()
        let ldl = try XCTUnwrap(markers.markers.first { $0.goal != nil })
        let image = try hosted(MarkerView(marker: ldl))
        keep(image, "marker")
        XCTAssertGreaterThan(colours(image, rows: 60...400), 20)
        // A marker with no value and no band: no ruler, no chart, still draws.
        let blank = try XCTUnwrap(markers.markers.first { $0.value == nil })
        XCTAssertNotNil(try hosted(MarkerView(marker: blank)).cgImage)
    }
}
