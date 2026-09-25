import SwiftUI
import XCTest
@testable import OpenVitals

/// Phase 38 D8: Settings and sign-in in the Hybrid look. The header's words,
/// the per-type line, and both screens drawn in a real window.
@MainActor
final class SettingsTests: XCTestCase {

    private func totals(_ perType: [String: Any]) throws -> Api.Totals {
        let json: [String: Any] = ["readings": 12119, "days": 3260, "firstDay": "2022-05-29",
                                   "lastDay": "2026-09-24", "wearableDays": 0,
                                   "perType": perType]
        return try JSONDecoder().decode(
            Api.Totals.self, from: JSONSerialization.data(withJSONObject: json))
    }

    // MARK: the words

    func testTheHeaderLineSaysWhoAndWhere() {
        XCTAssertEqual(SettingsView.account(email: "you@example.com", signedIn: true,
                                            base: "https://vitals.chocksy.com"),
                       "you@example.com · vitals.chocksy.com")
        XCTAssertEqual(SettingsView.account(email: nil, signedIn: true,
                                            base: "https://vitals.chocksy.com"),
                       "signed in · vitals.chocksy.com")
        XCTAssertEqual(SettingsView.account(email: "", signedIn: true,
                                            base: "http://192.168.1.4:3000"),
                       "signed in · 192.168.1.4")
        XCTAssertEqual(SettingsView.account(email: "you@example.com", signedIn: false,
                                            base: "https://vitals.chocksy.com"),
                       "signed out · vitals.chocksy.com")
    }

    func testSendingCountsTypesWithRowsOnTheServer() throws {
        XCTAssertNil(SettingsView.sending(nil))
        XCTAssertEqual(SettingsView.sending(try totals([:])), 0)
        let steps = try XCTUnwrap(HK.types.first)
        let two = try XCTUnwrap(HK.types.dropFirst().first)
        let got = try totals([
            "steps": ["count": 900, "first": "2022-05-29", "last": "2026-09-24",
                      "type": steps.shortType],
            "other": ["count": 0, "type": two.shortType],
        ])
        XCTAssertEqual(SettingsView.sending(got), 1)
    }

    func testTheTypeLine() throws {
        let stamp = DateFormatter()
        stamp.dateFormat = "yyyy-MM-dd"
        stamp.timeZone = TimeZone(identifier: "UTC")
        var state = SyncState.TypeState()
        XCTAssertEqual(SettingsView.detail("StepCount", state, nil, stamp: stamp),
                       "StepCount · nothing on the server · syncs the moment it lands")
        let server = try XCTUnwrap(totals([
            "s": ["count": 1200, "first": "2022-05-29", "last": "2026-09-24",
                  "type": "StepCount"],
        ]).byType["StepCount"])
        state.lastSent = Date(timeIntervalSince1970: 0)
        state.resumed = 2
        XCTAssertEqual(SettingsView.detail("StepCount", state, server, stamp: stamp),
                       "StepCount · \(Api.Totals.count(1200)) · server has 2022-05-29 to 2026-09-24 · "
                       + "last sent 1970-01-01 · resumed after retry ×2")
        state.lastError = "offline"
        XCTAssertEqual(SettingsView.detail("StepCount", state, server, stamp: stamp),
                       "StepCount · failed (will resume next sync): offline")
    }

    // MARK: the screens

    func testSettingsDraws() throws {
        let image = try Hosted.image(SettingsView(asking: false))
        Hosted.keep(image, "d8-test-settings", in: self)
        XCTAssertGreaterThan(Hosted.colours(image, rows: 60...200), 20, "the plum header")
        XCTAssertGreaterThan(Hosted.colours(image, rows: 260...600), 20, "the Health card")
    }

    func testSignInDraws() throws {
        let image = try Hosted.image(SignInView())
        Hosted.keep(image, "d8-test-signin", in: self)
        XCTAssertGreaterThan(Hosted.colours(image, rows: 60...200), 20, "the plum header")
        XCTAssertGreaterThan(Hosted.colours(image, rows: 260...600), 10, "the form")
    }
}

/// A view in a real window, as `BloodTests` draws Blood: `ImageRenderer`
/// leaves a `ScrollView`'s content blank. The run loop turns so the first
/// layout lands.
@MainActor
enum Hosted {
    static func image(_ view: some View) throws -> UIImage {
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

    /// How many distinct colours a strip of the picture has: a blank strip
    /// has one or two, a drawn one many.
    static func colours(_ image: UIImage, rows: ClosedRange<CGFloat>) -> Int {
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

    /// Kept for the reviewer to look at; the tests do not need it.
    static func keep(_ image: UIImage, _ name: String, in test: XCTestCase) {
        let dir = URL(fileURLWithPath: "/tmp/p38")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? image.pngData()?.write(to: dir.appendingPathComponent("\(name).png"))
        let shot = XCTAttachment(image: image)
        shot.name = name
        shot.lifetime = .keepAlways
        test.add(shot)
    }
}
