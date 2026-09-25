import AVFoundation
import XCTest
@testable import OpenVitals

/// Phase 38, D5. Camera first: what the + opens, where a swipe on the strip
/// goes, what Send carries, and what the preview says with no camera.
@MainActor
final class AddCameraTests: XCTestCase {

    private let photo = UIImage()

    /// The + opens the camera; a failed read's draft still reopens the sheet.
    func testThePlusOpensTheCameraUnlessADraftWaits() {
        XCTAssertEqual(Shell.surface(for: nil), .camera(caption: ""))
        XCTAssertTrue(Shell.surface(for: nil).isCamera)
        XCTAssertEqual(Shell.surface(for: CapturePayload(image: photo, text: "lunch")), .sheet(nil))
        XCTAssertEqual(Shell.surface(for: CapturePayload(image: nil, text: "Walked")), .sheet(nil))
        XCTAssertFalse(AddSurface.sheet(.text).isCamera)
    }

    /// Left moves on to Text, right back to Voice, as the iOS camera does.
    func testASwipeOnTheStripPicksTheMode() {
        XCTAssertEqual(AddCamera.mode(after: CGSize(width: -60, height: 4)), .text)
        XCTAssertEqual(AddCamera.mode(after: CGSize(width: 60, height: -4)), .voice)
        XCTAssertEqual(AddCamera.mode(after: CGSize(width: -AddCamera.swipe, height: 0)), .text)
    }

    /// A short or mostly vertical drag stays on Photo.
    func testAShortOrVerticalDragStaysOnPhoto() {
        XCTAssertEqual(AddCamera.mode(after: .zero), .photo)
        XCTAssertEqual(AddCamera.mode(after: CGSize(width: -54, height: 0)), .photo)
        XCTAssertEqual(AddCamera.mode(after: CGSize(width: 80, height: 120)), .photo)
        XCTAssertEqual(AddCamera.modes, [.voice, .photo, .text])
    }

    /// The strip's Voice and Text open the sheet in that mode; a draft
    /// still wins, and the sheet never starts on Photo without one.
    func testTheSheetOpensOnTheStripsMode() {
        XCTAssertEqual(AddSheet.mode(for: nil, start: .voice), .voice)
        XCTAssertEqual(AddSheet.mode(for: nil, start: .text), .text)
        XCTAssertNil(AddSheet.mode(for: nil, start: .photo))
        XCTAssertNil(AddSheet.mode(for: nil, start: nil))
        XCTAssertEqual(AddSheet.mode(for: CapturePayload(image: photo, text: ""), start: .text),
                       .photo)
    }

    /// Nothing to send until a frame is frozen; then the frame and the
    /// words brought from the sheet, read in the island.
    func testSendCarriesTheFrozenFrame() {
        XCTAssertNil(AddCamera.payload(frozen: nil, caption: "lunch"))
        let sent = AddCamera.payload(frozen: photo, caption: " lunch ")
        XCTAssertTrue(sent?.image === photo)
        XCTAssertEqual(sent?.text, "lunch")
        XCTAssertEqual(CaptureRun.route(sent!), .island)
        XCTAssertTrue(AddSheet.canSend(sent!, busy: false))
        // A question typed before the Photo tile still reads as a photo.
        let asked = AddCamera.payload(frozen: photo, caption: "What should my vitamin D be?")
        XCTAssertEqual(CaptureRun.route(asked!), .island)
    }

    /// No camera wins over any permission; a denied one offers Settings.
    func testWhatThePreviewShows() {
        XCTAssertEqual(AddCamera.access(status: .authorized, hasCamera: false), .absent)
        XCTAssertEqual(AddCamera.access(status: .authorized, hasCamera: true), .live)
        XCTAssertEqual(AddCamera.access(status: .notDetermined, hasCamera: true), .asking)
        XCTAssertEqual(AddCamera.access(status: .denied, hasCamera: true), .denied)
        XCTAssertEqual(AddCamera.access(status: .restricted, hasCamera: true), .denied)

        XCTAssertNil(AddCamera.says(.live))
        XCTAssertNil(AddCamera.says(.asking))
        XCTAssertEqual(AddCamera.says(.denied), AddCamera.denied)
        XCTAssertEqual(AddCamera.says(.absent), AddCamera.absent)
        XCTAssertTrue(AddCamera.offersSettings(.denied))
        XCTAssertFalse(AddCamera.offersSettings(.absent))
        XCTAssertFalse(AddCamera.offersSettings(.live))
    }

    /// The camera's words: the gallery and the other modes named; no route
    /// names.
    func testTheCameraWords() {
        XCTAssertEqual(AddCamera.modes.map(AddCamera.word), ["Voice", "Photo", "Text"])
        for line in [AddCamera.denied, AddCamera.absent] {
            XCTAssertTrue(line.contains("gallery"), line)
            for word in ["/api", "capture", "draft", "session", "permission"] {
                XCTAssertFalse(line.lowercased().contains(word), line)
            }
        }
    }
}
