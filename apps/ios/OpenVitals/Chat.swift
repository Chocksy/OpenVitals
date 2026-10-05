import Foundation
import Observation

// The conversation, native. The server is the web's own: `POST /api/chat`
// streams one turn as the AI SDK v7 UI message stream, and
// `/api/chat/threads` lists, reads and deletes. Nothing here decides
// anything; the buttons call the same routes the web's `ActOnIt` calls.

// MARK: - the shapes

/// One row of "Everything you asked": `GET /api/chat/threads`.
struct ChatThreadRow: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let about: String?
    let lastTurnAt: String?
}

struct ChatThreadList: Codable, Equatable {
    let threads: [ChatThreadRow]
}

/// What the `offer` tool hands back (`lib/thread-tools.ts`, `Offered`): the
/// ids the paragraph named, resolved by the server, plus the ask-back options.
struct ChatOffer: Decodable, Equatable {
    struct Action: Decodable, Equatable, Identifiable {
        let id: String
        let title: String
        let dose: String?
        /// "science" | "opinion" | "anecdotal"
        let basis: String?
        let grade: String?
    }

    struct Test: Decodable, Equatable, Identifiable {
        let code: String
        let name: String
        let weeks: Double
        /// False when it takes a doctor's order: the button copies the name.
        let selfOrder: Bool?
        var id: String { code }
    }

    struct Question: Decodable, Equatable, Identifiable {
        let key: String
        let question: String
        var id: String { key }
    }

    struct Source: Decodable, Equatable, Identifiable {
        let id: String
        let name: String
        let year: Int?
        let grade: String
        let quote: String?
    }

    let actions: [Action]
    let tests: [Test]
    let questions: [Question]
    var sources: [Source] = []
    var options: [String: [String]] = [:]

    enum CodingKeys: String, CodingKey { case actions, tests, questions, sources, options }

    init(actions: [Action] = [], tests: [Test] = [], questions: [Question] = [],
         sources: [Source] = [], options: [String: [String]] = [:]) {
        self.actions = actions
        self.tests = tests
        self.questions = questions
        self.sources = sources
        self.options = options
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        actions = try c.decode([Action].self, forKey: .actions)
        tests = try c.decode([Test].self, forKey: .tests)
        questions = try c.decode([Question].self, forKey: .questions)
        sources = (try? c.decodeIfPresent([Source].self, forKey: .sources)) ?? []
        options = (try? c.decodeIfPresent([String: [String]].self, forKey: .options)) ?? [:]
    }

    var isEmpty: Bool { actions.isEmpty && tests.isEmpty && questions.isEmpty && sources.isEmpty }
}

/// What a tool part's `output` is: the offer, a write's one-line receipt
/// (`{ ok, receipt }`), or something this screen does not draw.
enum ChatToolOutput: Decodable, Equatable {
    case offer(ChatOffer)
    case receipt(String)
    case other

    private struct Receipt: Decodable { let receipt: String }

    init(from decoder: Decoder) throws {
        if let offer = try? ChatOffer(from: decoder) {
            self = .offer(offer)
        } else if let r = try? Receipt(from: decoder) {
            self = .receipt(r.receipt)
        } else {
            self = .other
        }
    }
}

/// The parts this screen draws. Reasoning, step markers and anything newer
/// decode to `.other` and are never shown.
enum ChatPart: Equatable {
    case text(String)
    case offer(ChatOffer)
    case receipt(String)
    case other
}

extension ChatPart: Decodable {
    private enum Keys: String, CodingKey { case type, text, state, output }

    /// A stored `UIMessage` part. Only a tool call whose output arrived counts.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let type = (try? c.decodeIfPresent(String.self, forKey: .type)) ?? ""
        if type == "text" {
            self = .text((try? c.decodeIfPresent(String.self, forKey: .text)) ?? "")
            return
        }
        guard type.hasPrefix("tool-"),
              (try? c.decodeIfPresent(String.self, forKey: .state)) == "output-available",
              let output = try? c.decodeIfPresent(ChatToolOutput.self, forKey: .output)
        else { self = .other; return }
        self = Self.of(tool: String(type.dropFirst("tool-".count)), output)
    }

    /// The offer is only drawn from the `offer` tool; any other tool's
    /// `{ receipt }` is the line it leaves under the answer.
    static func of(tool: String, _ output: ChatToolOutput) -> ChatPart {
        switch output {
        case .offer(let o) where tool == "offer": return .offer(o)
        case .receipt(let r): return .receipt(r)
        default: return .other
        }
    }
}

/// A stored or streamed `UIMessage`, down to what is drawn. The server
/// stores assistant messages with an empty id, so the id here is our own.
struct ChatMessage: Decodable, Equatable, Identifiable {
    var id: String
    let role: String
    var parts: [ChatPart]

    init(id: String = UUID().uuidString, role: String, parts: [ChatPart]) {
        self.id = id
        self.role = role
        self.parts = parts
    }

    private enum Keys: String, CodingKey { case role, parts }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        id = UUID().uuidString
        role = (try? c.decode(String.self, forKey: .role)) ?? "assistant"
        parts = (try? c.decode([ChatPart].self, forKey: .parts)) ?? []
    }

    /// Everything the person typed: the question line.
    var text: String {
        parts.compactMap { if case .text(let t) = $0 { return t } else { return nil } }
            .joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The parts as drawn. The model sometimes writes its paragraph again
    /// after `offer`; an identical text part prints once (the web's `said`).
    var visible: [ChatPart] {
        var said = Set<String>()
        return parts.filter { part in
            switch part {
            case .text(let t):
                let key = t.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !key.isEmpty, !said.contains(key) else { return false }
                said.insert(key)
                return true
            case .offer(let o): return !o.isEmpty
            case .receipt(let r): return !r.isEmpty
            case .other: return false
            }
        }
    }
}

/// `GET /api/chat/threads?id=`: the thread and its stored messages.
struct ChatThread: Decodable, Equatable {
    let thread: ChatThreadRow
    let messages: [ChatMessage]
}

// MARK: - the stream

/// One chunk of the UI message stream (`uiMessageChunkSchema` in
/// `ai/dist/index.js`), down to the fields read here.
struct ChatChunk: Decodable, Equatable {
    var type: String
    var id: String?
    var delta: String?
    var toolCallId: String?
    var toolName: String?
    var errorText: String?
    var output: ChatToolOutput?

    init(type: String, id: String? = nil, delta: String? = nil, toolCallId: String? = nil,
         toolName: String? = nil, errorText: String? = nil, output: ChatToolOutput? = nil) {
        self.type = type
        self.id = id
        self.delta = delta
        self.toolCallId = toolCallId
        self.toolName = toolName
        self.errorText = errorText
        self.output = output
    }

    private enum Keys: String, CodingKey {
        case type, id, delta, toolCallId, toolName, errorText, output
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        type = try c.decode(String.self, forKey: .type)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        delta = try? c.decodeIfPresent(String.self, forKey: .delta)
        toolCallId = try? c.decodeIfPresent(String.self, forKey: .toolCallId)
        toolName = try? c.decodeIfPresent(String.self, forKey: .toolName)
        errorText = try? c.decodeIfPresent(String.self, forKey: .errorText)
        output = try? c.decodeIfPresent(ChatToolOutput.self, forKey: .output)
    }
}

/// The wire: `JsonToSseTransformStream` writes `data: {json}\n\n` per chunk
/// and `data: [DONE]\n\n` at the end. Anything else on a line is not ours.
enum ChatSSE {
    enum Event: Equatable {
        case chunk(ChatChunk)
        case done
    }

    static func event(_ line: String) -> Event? {
        guard line.hasPrefix("data:") else { return nil }
        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
        if payload == "[DONE]" { return .done }
        guard let chunk = try? JSONDecoder().decode(ChatChunk.self, from: Data(payload.utf8))
        else { return nil }
        return .chunk(chunk)
    }
}

/// Builds the assistant message from chunks, as `processUIMessageStream`
/// does: a text part per `text-start` id, a tool part per call id, a step
/// marker per `start-step` so `reset-step` can drop what the step wrote.
/// Reasoning is never kept.
struct ChatAssembler {
    private enum Slot {
        case step
        case text(id: String, String)
        case tool(callId: String, name: String, output: ChatToolOutput?)
    }

    private var slots: [Slot] = []
    /// The stream's own `error` chunk, in the server's words.
    private(set) var error: String?
    private(set) var finished = false

    mutating func apply(_ chunk: ChatChunk) {
        switch chunk.type {
        case "start-step":
            slots.append(.step)
        case "reset-step":
            if let last = slots.lastIndex(where: { if case .step = $0 { return true }; return false }) {
                slots.removeSubrange((last + 1)...)
            }
        case "text-start":
            slots.append(.text(id: chunk.id ?? "", ""))
        case "text-delta":
            let id = chunk.id ?? ""
            let delta = chunk.delta ?? ""
            if let i = textIndex(id), case .text(_, let had) = slots[i] {
                slots[i] = .text(id: id, had + delta)
            } else {
                slots.append(.text(id: id, delta))
            }
        case "tool-input-start", "tool-input-available":
            guard let call = chunk.toolCallId, toolIndex(call) == nil else { return }
            slots.append(.tool(callId: call, name: chunk.toolName ?? "", output: nil))
        case "tool-output-available":
            guard let call = chunk.toolCallId else { return }
            if let i = toolIndex(call), case .tool(_, let name, _) = slots[i] {
                slots[i] = .tool(callId: call, name: name, output: chunk.output)
            } else {
                slots.append(.tool(callId: call, name: chunk.toolName ?? "", output: chunk.output))
            }
        case "error":
            error = chunk.errorText ?? "The answer stopped."
        case "finish", "abort":
            finished = true
        default:
            break
        }
    }

    private func textIndex(_ id: String) -> Int? {
        slots.lastIndex { if case .text(let i, _) = $0 { return i == id }; return false }
    }

    private func toolIndex(_ call: String) -> Int? {
        slots.lastIndex { if case .tool(let c, _, _) = $0 { return c == call }; return false }
    }

    var parts: [ChatPart] {
        slots.compactMap { slot in
            switch slot {
            case .step: return nil
            case .text(_, let t): return .text(t)
            case .tool(_, let name, let output):
                guard let output else { return nil }
                let part = ChatPart.of(tool: name, output)
                return part == .other ? nil : part
            }
        }
    }

    /// Every line of a captured stream, start to `[DONE]`: the tests.
    static func assemble(_ lines: [String]) -> ChatAssembler {
        var out = ChatAssembler()
        for line in lines {
            switch ChatSSE.event(line) {
            case .chunk(let c)?: out.apply(c)
            case .done?: out.finished = true
            case nil: break
            }
        }
        return out
    }
}

// MARK: - the calls

enum ChatApi {
    /// The body `components/chat.tsx` sends: the thread, what it is about,
    /// and the one new user message.
    struct TurnBody: Encodable {
        struct Message: Encodable {
            struct Part: Encodable {
                let type = "text"
                let text: String
            }
            let id: String
            let role = "user"
            let parts: [Part]
        }
        let threadId: String?
        let about: String?
        let message: Message

        init(threadId: String?, about: String?, text: String, id: String = UUID().uuidString) {
            self.threadId = threadId
            self.about = about
            message = Message(id: id, parts: [Message.Part(text: text)])
        }
    }

    static func threads() async throws -> ChatThreadList {
        if let canned: ChatThreadList = Fixtures.canned("chat-threads") { return canned }
        return try await Api.send(Api.get("api/chat/threads"))
    }

    static func thread(id: String) async throws -> ChatThread {
        if let canned: ChatThread = Fixtures.canned("chat-thread") { return canned }
        return try await Api.send(Api.get("api/chat/threads", query: ["id": id]))
    }

    static func delete(id: String) async throws {
        if Fixtures.on { return }
        var req = Api.get("api/chat/threads", query: ["id": id])
        req.httpMethod = "DELETE"
        let _: Api.Ok = try await Api.send(req)
    }

    /// `POST /api/facts { key, value }`: an ask-back answered.
    static func fact(key: String, value: String) async throws {
        if Fixtures.on { return }
        let _: Api.Ok = try await Api.send(try Api.json("api/facts", "POST",
                                                        ["key": key, "value": value]))
    }

    static func turnRequest(_ body: TurnBody) throws -> URLRequest {
        var req = URLRequest(url: Api.baseURL.appendingPathComponent("api/chat"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.setValue(Api.userAgentTag, forHTTPHeaderField: "X-OpenVitals-Client")
        // The route may run 120 s; the first byte can take a while.
        req.timeoutInterval = 180
        req.httpBody = try JSONEncoder().encode(body)
        return req
    }

    /// One turn, opened. Hands back the thread id the server gave it and
    /// the stream's lines; a refusal (401, 404, 400) throws in its own words.
    static func open(_ body: TurnBody) async throws
        -> (threadId: String?, lines: AsyncLineSequence<URLSession.AsyncBytes>) {
        let req = try turnRequest(body)
        let (bytes, response) = try await URLSession.shared.bytes(for: req)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            var data = Data()
            for try await byte in bytes { data.append(byte) }
            let said = (try? JSONDecoder().decode([String: Api.JSON].self, from: data))?["error"]?.text
            Api.trace("POST /api/chat \(status) failed: \(said ?? "")")
            throw Api.Failure(status: status, message: said ?? "no reply")
        }
        Api.trace("POST /api/chat \(status) streaming")
        return (http?.value(forHTTPHeaderField: "x-thread-id"), bytes.lines)
    }

    /// A fixture run has no server: the canned thread's last answer comes
    /// back a few words at a time through the same assembler.
    static func cannedChunks() -> [ChatChunk] {
        let canned: ChatThread? = Fixtures.canned("chat-thread")
        let parts = canned?.messages.last { $0.role == "assistant" }?.parts ?? []
        var out = [ChatChunk(type: "start"), ChatChunk(type: "start-step")]
        for (i, part) in parts.enumerated() {
            switch part {
            case .text(let t):
                out.append(ChatChunk(type: "text-start", id: "t\(i)"))
                var word = ""
                for ch in t {
                    word.append(ch)
                    if ch == " " {
                        out.append(ChatChunk(type: "text-delta", id: "t\(i)", delta: word))
                        word = ""
                    }
                }
                out.append(ChatChunk(type: "text-delta", id: "t\(i)", delta: word))
                out.append(ChatChunk(type: "text-end", id: "t\(i)"))
            case .offer(let o):
                out.append(ChatChunk(type: "tool-input-start", toolCallId: "c\(i)", toolName: "offer"))
                out.append(ChatChunk(type: "tool-output-available", toolCallId: "c\(i)",
                                     output: .offer(o)))
            default:
                break
            }
        }
        out.append(ChatChunk(type: "finish"))
        return out
    }

    /// What went wrong, in plain words.
    static func plain(_ error: Error) -> String {
        if let failure = error as? Api.Failure {
            switch failure.status {
            case 401: return "You are signed out. Sign in again, then ask."
            case 404: return "That conversation is gone. Start a new one."
            case 0: return failure.message
            default: return "The server said no: \(failure.message)"
            }
        }
        if let url = error as? URLError {
            switch url.code {
            case .notConnectedToInternet, .networkConnectionLost:
                return "No connection. Check the network and ask again."
            case .timedOut: return "The answer took too long. Ask again."
            case .cannotConnectToHost, .cannotFindHost:
                return "The server cannot be reached right now."
            case .cancelled: return "Stopped."
            default: break
            }
        }
        return error.localizedDescription
    }
}

// MARK: - where a conversation starts

/// How a chat opens: the list, a stored thread, or a new one with a question
/// sent at once (`ask`) or waiting in the box (`draft`).
struct ChatStart: Identifiable, Equatable {
    let id = UUID()
    var list = false
    var threadId: String?
    var title: String?
    var about: String?
    var ask: String?
    var draft: String?

    static var everything: ChatStart { ChatStart(list: true) }

    /// "What does my LDL cholesterol mean and what should I do about it?"
    static func about(marker name: String) -> ChatStart {
        ChatStart(draft: "What does my \(name) mean and what should I do about it?")
    }
}

// MARK: - one conversation

@Observable
@MainActor
final class ChatModel {
    /// Nil until the server names a new thread on `x-thread-id`.
    private(set) var threadId: String?
    let about: String?
    private(set) var title: String
    private(set) var messages: [ChatMessage] = []
    var input = ""
    /// A turn is out: from the send to `[DONE]`.
    private(set) var busy = false
    private(set) var loading = false
    var error = ""

    /// The writes a button made, so it stays pressed: action ids added (with
    /// the protocol row each became, for undo), tests planned, names copied,
    /// ask-backs answered.
    var added: [String: String] = [:]
    var planned: Set<String> = []
    var copied: Set<String> = []
    var answered: [String: String] = [:]
    var working = ""
    var actError = ""

    init(start: ChatStart) {
        threadId = start.threadId
        about = start.about
        title = start.title ?? "New question"
        input = start.draft ?? ""
    }

    /// A model already holding its messages: the tests and the gallery.
    init(threadId: String?, title: String, messages: [ChatMessage]) {
        self.threadId = threadId
        about = nil
        self.title = title
        self.messages = messages
    }

    var isNew: Bool { threadId == nil && messages.isEmpty }

    func load() async {
        guard let threadId, messages.isEmpty else { return }
        loading = true
        defer { loading = false }
        do {
            let got = try await ChatApi.thread(id: threadId)
            title = got.thread.title
            messages = Self.paired(got.messages)
        } catch {
            self.error = ChatApi.plain(error)
        }
    }

    /// The server saves a turn's question and answer in one insert, so both
    /// rows carry the same `createdAt` and Postgres may hand them back
    /// answer first. Each turn is one pair: put the question first.
    // ponytail: client-side guard for servers older than the role tiebreak
    // in the route's `orderBy` (apps/simple/app/api/chat/threads/route.ts).
    static func paired(_ messages: [ChatMessage]) -> [ChatMessage] {
        var out = messages
        var i = 0
        while i + 1 < out.count {
            if out[i].role == "assistant", out[i + 1].role == "user" { out.swapAt(i, i + 1) }
            i += 2
        }
        return out
    }

    /// Whether the answer being written has words on screen yet.
    var thinking: Bool {
        guard busy else { return false }
        guard let last = messages.last, last.role == "assistant" else { return true }
        return last.visible.isEmpty
    }

    func send(_ raw: String) async {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        if input.trimmingCharacters(in: .whitespacesAndNewlines) == text { input = "" }
        error = ""
        busy = true
        defer { busy = false }
        if messages.isEmpty { title = String(text.prefix(80)) }
        messages.append(ChatMessage(role: "user", parts: [.text(text)]))
        let answer = ChatMessage(role: "assistant", parts: [])
        messages.append(answer)
        var built = ChatAssembler()
        func show() {
            if let i = messages.lastIndex(where: { $0.id == answer.id }) {
                messages[i].parts = built.parts
            }
        }
        do {
            if Fixtures.on {
                for chunk in ChatApi.cannedChunks() {
                    built.apply(chunk)
                    show()
                    try await Task.sleep(for: .milliseconds(35))
                }
            } else {
                let body = ChatApi.TurnBody(threadId: threadId, about: about, text: text)
                let (given, lines) = try await ChatApi.open(body)
                if let given, !given.isEmpty { threadId = given }
                for try await line in lines {
                    switch ChatSSE.event(line) {
                    case .chunk(let c)?:
                        built.apply(c)
                        show()
                    case .done?:
                        break
                    case nil:
                        continue
                    }
                }
            }
        } catch {
            self.error = ChatApi.plain(error)
        }
        if let said = built.error {
            error = "The answer stopped: \(said)"
        } else if error.isEmpty, built.parts.isEmpty {
            error = "No answer came back. Ask again."
        }
        // An answer with nothing in it is not left as an empty card.
        if built.parts.isEmpty { messages.removeAll { $0.id == answer.id } }
    }

    // MARK: the buttons (ActOnIt's routes)

    func add(_ actions: [ChatOffer.Action], key: String) async {
        working = key
        actError = ""
        defer { working = "" }
        for a in actions where added[a.id] == nil {
            do {
                if Fixtures.on { added[a.id] = ""; continue }
                let done = try await Api.adopt(id: a.id)
                added[a.id] = done.id ?? ""
            } catch {
                actError = "\(a.title) was not added: \(ChatApi.plain(error))"
                return
            }
        }
        NotificationCenter.default.post(name: .ovPlanChanged, object: nil)
    }

    func undo(_ action: ChatOffer.Action) async {
        guard let row = added[action.id] else { return }
        working = action.id
        defer { working = "" }
        do {
            if !Fixtures.on, !row.isEmpty { _ = try await Api.unadopt(removeIds: [row]) }
            added[action.id] = nil
            NotificationCenter.default.post(name: .ovPlanChanged, object: nil)
        } catch {
            actError = "That did not undo: \(ChatApi.plain(error))"
        }
    }

    /// A retest is a goal with a date on it, as the web's `planRetest` writes.
    func plan(_ test: ChatOffer.Test) async {
        working = test.code
        actError = ""
        defer { working = "" }
        let weeks = Int(test.weeks.rounded())
        do {
            if !Fixtures.on {
                _ = try await Api.setGoal(code: test.code, low: nil, high: nil,
                                          due: Self.due(weeks: weeks),
                                          note: "retest \(test.name) after \(weeks) weeks")
            }
            planned.insert(test.code)
        } catch {
            actError = "\(test.name) was not planned: \(ChatApi.plain(error))"
        }
    }

    /// The web's `dueDate`: now plus the weeks, as a UTC day.
    static func due(weeks: Int, from now: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: now.addingTimeInterval(Double(weeks) * 7 * 86_400))
    }

    /// An ask-back: the fact goes to `/api/facts`, then the answer is the
    /// next turn, so the next facts block has it.
    func answer(_ q: ChatOffer.Question, _ raw: String) async {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !busy else { return }
        working = q.key
        actError = ""
        do {
            try await ChatApi.fact(key: q.key, value: value)
            working = ""
            answered[q.key] = value
            await send("\(q.question): \(value)")
        } catch {
            working = ""
            actError = "That answer was not saved: \(ChatApi.plain(error))"
        }
    }
}

// MARK: - the list

@Observable
@MainActor
final class ChatListModel {
    private(set) var rows: [ChatThreadRow] = []
    private(set) var loaded = false
    var error = ""

    func load() async {
        do {
            rows = try await ChatApi.threads().threads
            error = ""
        } catch {
            self.error = ChatApi.plain(error)
        }
        loaded = true
    }

    func delete(_ row: ChatThreadRow) async {
        let kept = rows
        rows.removeAll { $0.id == row.id }
        do {
            try await ChatApi.delete(id: row.id)
        } catch {
            rows = kept
            self.error = "That did not delete: \(ChatApi.plain(error))"
        }
    }

    /// "today", or "Oct 5".
    static func when(_ stamp: String?, now: Date = Date()) -> String {
        guard let stamp else { return "" }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = iso.date(from: stamp)
        if date == nil {
            iso.formatOptions = [.withInternetDateTime]
            date = iso.date(from: stamp)
        }
        guard let date else { return "" }
        if now.timeIntervalSince(date) < 86_400 { return "today" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}
