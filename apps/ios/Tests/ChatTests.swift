import XCTest
@testable import OpenVitals

/// The chat's parser against a real turn: `chat-stream.sse` is a `POST
/// /api/chat` captured from the local server, byte for byte.
@MainActor
final class ChatTests: XCTestCase {

    private func lines(_ name: String) throws -> [String] {
        let url = try XCTUnwrap(Bundle(for: ChatTests.self).url(forResource: name, withExtension: "sse"),
                                "no fixture named \(name).sse")
        return try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: "\n")
    }

    /// The deltas of one text id, joined straight from the file, so the
    /// expectation is not the parser's own output.
    private func deltas(_ lines: [String], id: String) throws -> String {
        var out = ""
        for line in lines where line.hasPrefix("data: {") {
            let obj = try JSONSerialization.jsonObject(with: Data(line.dropFirst(6).utf8)) as? [String: Any]
            if obj?["type"] as? String == "text-delta", obj?["id"] as? String == id {
                out += obj?["delta"] as? String ?? ""
            }
        }
        return out
    }

    func testTheCapturedStreamRebuildsTheTextAndTheOffer() throws {
        let raw = try lines("chat-stream")
        let built = ChatAssembler.assemble(raw)
        XCTAssertTrue(built.finished)
        XCTAssertNil(built.error)

        let texts = built.parts.compactMap { if case .text(let t) = $0 { return t } else { return nil } }
        XCTAssertEqual(texts.count, 2)
        let first = try deltas(raw, id: "gen-1791231645-QqWE2eK5tJRd6x8qsl9O")
        XCTAssertTrue(first.hasPrefix("Your LDL is 131 mg/dL, up from 117 in December"))
        XCTAssertEqual(texts.first, first)
        XCTAssertEqual(texts.last, try deltas(raw, id: "gen-1791231655-FMRloyet3P64O6Xm55I5"))

        // The paragraph, then the offer, then the closing line: the order the
        // web draws, even though the first text ended after the tool input.
        XCTAssertEqual(built.parts.count, 3)
        guard case .offer(let offer) = built.parts[1] else {
            return XCTFail("the second part is not the offer: \(built.parts[1])")
        }
        XCTAssertEqual(offer.actions.map(\.id), [
            "plan:e2baca46-cadf-457f-9feb-ef16678d3b07:3",
            "int:seed_ascvd_risk_plant_sterols_and_stanols_condition",
            "plan:e2baca46-cadf-457f-9feb-ef16678d3b07:10",
        ])
        XCTAssertEqual(offer.actions[1].grade, "A")
        XCTAssertEqual(offer.actions[2].basis, "opinion")
        XCTAssertEqual(offer.tests.map(\.code), ["ldl_cholesterol", "apolipoprotein_b"])
        XCTAssertEqual(offer.tests.first?.weeks, 12)
        XCTAssertEqual(offer.tests.first?.selfOrder, true)
        XCTAssertTrue(offer.questions.isEmpty)

        // Reasoning streamed first; none of it is kept.
        XCTAssertFalse(texts.joined().contains("I'm structuring"))
    }

    func testAResetStepDropsWhatTheStepWrote() {
        var a = ChatAssembler()
        a.apply(ChatChunk(type: "start-step"))
        a.apply(ChatChunk(type: "text-start", id: "1"))
        a.apply(ChatChunk(type: "text-delta", id: "1", delta: "kept"))
        a.apply(ChatChunk(type: "start-step"))
        a.apply(ChatChunk(type: "text-start", id: "2"))
        a.apply(ChatChunk(type: "text-delta", id: "2", delta: "dropped"))
        a.apply(ChatChunk(type: "reset-step"))
        XCTAssertEqual(a.parts, [.text("kept")])
    }

    func testAnErrorChunkIsKeptInTheServersWords() {
        let a = ChatAssembler.assemble([#"data: {"type":"error","errorText":"rate limited"}"#, "data: [DONE]"])
        XCTAssertEqual(a.error, "rate limited")
        XCTAssertTrue(a.finished)
    }

    func testAStoredThreadDecodesWithoutReasoning() throws {
        let url = try XCTUnwrap(ContractTests.fixtureURL("chat-thread"))
        let thread = try JSONDecoder().decode(ChatThread.self, from: Data(contentsOf: url))
        XCTAssertEqual(thread.messages.first?.role, "user")
        XCTAssertEqual(thread.messages.first?.text, "what supplements should i take to fix my blood work?")
        let answer = try XCTUnwrap(thread.messages.last)
        let shown = answer.visible
        XCTAssertEqual(shown.count, 3)
        guard case .offer(let offer) = shown[1] else { return XCTFail("no offer") }
        XCTAssertEqual(offer.questions.map(\.key), ["supplements"])
        // No options: the ask-back is a text field.
        XCTAssertEqual(offer.options["supplements"], [])
        // Two messages from the server, two ids of our own.
        XCTAssertNotEqual(thread.messages[0].id, thread.messages[1].id)
    }

    func testATurnSavedAnswerFirstReadsQuestionFirst() {
        let q1 = ChatMessage(role: "user", parts: [.text("q1")])
        let a1 = ChatMessage(role: "assistant", parts: [.text("a1")])
        let q2 = ChatMessage(role: "user", parts: [.text("q2")])
        let a2 = ChatMessage(role: "assistant", parts: [.text("a2")])
        XCTAssertEqual(ChatModel.paired([a1, q1, q2, a2]).map(\.text), ["q1", "a1", "q2", "a2"])
    }

    func testTheListDecodes() throws {
        let url = try XCTUnwrap(ContractTests.fixtureURL("chat-threads"))
        let list = try JSONDecoder().decode(ChatThreadList.self, from: Data(contentsOf: url))
        XCTAssertEqual(list.threads.count, 2)
    }

    func testARepeatedParagraphPrintsOnce() {
        let m = ChatMessage(role: "assistant", parts: [.text("Same."), .other, .text(" Same.\n"), .text("New.")])
        XCTAssertEqual(m.visible, [.text("Same."), .text("New.")])
    }

    func testEvidenceLabelsSplitOut() {
        XCTAssertEqual(ChatProse.runs("Oats [science, a] and rest [opinion]. [science, A, guideline]"), [
            .plain("Oats "), .label(basis: "science", grade: "A"),
            .plain(" and rest "), .label(basis: "opinion", grade: nil),
            .plain(". [science, A, guideline]"),
        ])
        XCTAssertEqual(ChatProse.chip(basis: "opinion", grade: nil), "◐ opinion")
    }

    func testTheTurnBodyIsTheWebsShape() throws {
        let body = ChatApi.TurnBody(threadId: nil, about: "c1", text: "Hi", id: "m1")
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any])
        XCTAssertEqual(obj["about"] as? String, "c1")
        let message = try XCTUnwrap(obj["message"] as? [String: Any])
        XCTAssertEqual(message["id"] as? String, "m1")
        XCTAssertEqual(message["role"] as? String, "user")
        let parts = try XCTUnwrap(message["parts"] as? [[String: String]])
        XCTAssertEqual(parts, [["type": "text", "text": "Hi"]])
    }

    func testARetestIsDueInWholeWeeks() {
        let now = Date(timeIntervalSince1970: 1_790_000_000) // 2026-09-21 UTC
        XCTAssertEqual(ChatModel.due(weeks: 12, from: now), "2026-12-14")
    }
}
