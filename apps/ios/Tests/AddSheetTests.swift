import XCTest
@testable import OpenVitals

/// Phase 38, D1. The Add sheet: which words and which photo a Send carries
/// under each mode, and when Send is there at all.
@MainActor
final class AddSheetTests: XCTestCase {

    private let photo = UIImage()

    private func sendable(_ mode: AddMode?, text: String = "", transcript: String = "",
                          image: UIImage? = nil, busy: Bool = false) -> Bool {
        AddSheet.canSend(AddSheet.payload(mode: mode, text: text, transcript: transcript,
                                          image: image), busy: busy)
    }

    /// Voice sends what was heard: the transcript alone opens Send.
    func testTheVoiceTranscriptFeedsCanSend() {
        XCTAssertFalse(sendable(.voice))
        XCTAssertFalse(sendable(.voice, transcript: " "))
        XCTAssertTrue(sendable(.voice, transcript: "Walked fifteen minutes"))
        XCTAssertFalse(sendable(.voice, transcript: "Walked fifteen minutes", busy: true))
        let sent = AddSheet.payload(mode: .voice, text: "", transcript: " Walked fifteen minutes ",
                                    image: nil)
        XCTAssertEqual(sent.text, "Walked fifteen minutes")
        XCTAssertNil(sent.image)
        XCTAssertEqual(CaptureRun.route(sent), .island)
    }

    /// A denied microphone leaves no transcript, so Send stays hidden even
    /// with words typed earlier under Text.
    func testVoiceIgnoresTheTypedLine() {
        XCTAssertFalse(sendable(.voice, text: "Glass of red wine"))
        XCTAssertTrue(sendable(.text, text: "Glass of red wine"))
        XCTAssertFalse(sendable(.text, transcript: "Walked fifteen minutes"))
    }

    /// The photo goes only under Photo, with the words beside it.
    func testThePhotoGoesOnlyUnderPhoto() {
        XCTAssertTrue(sendable(.photo, image: photo))
        XCTAssertFalse(sendable(.photo))
        XCTAssertFalse(sendable(.text, image: photo))
        let sent = AddSheet.payload(mode: .photo, text: "lunch", transcript: "", image: photo)
        XCTAssertTrue(sent.image === photo)
        XCTAssertEqual(sent.text, "lunch")
    }

    /// Nothing chosen, nothing to send: the empty well.
    func testNoModeSendsNothing() {
        XCTAssertFalse(sendable(nil))
        XCTAssertFalse(sendable(nil, transcript: "Walked", image: photo))
    }

    /// A kept draft reopens on its own mode.
    func testADraftReopensOnItsMode() {
        XCTAssertNil(AddSheet.mode(for: nil))
        XCTAssertNil(AddSheet.mode(for: CapturePayload(image: nil, text: "")))
        XCTAssertEqual(AddSheet.mode(for: CapturePayload(image: nil, text: "Walked")), .text)
        XCTAssertEqual(AddSheet.mode(for: CapturePayload(image: photo, text: "")), .photo)
        XCTAssertEqual(AddSheet.mode(for: CapturePayload(image: photo, text: "lunch")), .photo)
    }

    /// A question typed or said still answers in the sheet.
    func testASaidQuestionAnswersInTheSheet() {
        let sent = AddSheet.payload(mode: .voice, text: "",
                                    transcript: "What should my vitamin D be?", image: nil)
        XCTAssertEqual(CaptureRun.route(sent), .sheet)
    }

    /// The words on the sheet, as the prototype has them; no route names.
    func testTheSheetWords() {
        XCTAssertEqual(AddSheet.title, "Add to today")
        XCTAssertEqual(AddSheet.empty, "Pick one. Send shows once there is something to send.")
        XCTAssertEqual(AddSheet.pullToClose, 89)
        for line in [AddSheet.line, AddSheet.empty, AddSheet.ready, AddSheet.prompt,
                     Dictation.denied, Dictation.unavailable] {
            for word in ["/api", "compose", "draft", "chip", "endpoint", "transcript"] {
                XCTAssertFalse(line.lowercased().contains(word), line)
            }
        }
    }

    /// A fresh dictation is idle and empty; a cancel keeps it that way.
    func testDictationStartsIdle() {
        let d = Dictation()
        XCTAssertEqual(d.phase, .idle)
        XCTAssertEqual(d.transcript, "")
        d.stop()
        d.cancel()
        XCTAssertEqual(d.phase, .idle)
        XCTAssertFalse(d.listening)
    }
}
