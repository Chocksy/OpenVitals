import SwiftUI
import UIKit

// The chat screens: "Everything you asked", one thread, and a new one. One
// full-screen cover; the list and the thread swap inside it.

/// Shell's door to the chat: Today's Ask card and a question typed
/// into Add. Nil outside the Shell, where Add answers in its own sheet.
private struct OpenChatKey: EnvironmentKey {
    static let defaultValue: ((ChatStart) -> Void)? = nil
}

extension EnvironmentValues {
    var openChat: ((ChatStart) -> Void)? {
        get { self[OpenChatKey.self] }
        set { self[OpenChatKey.self] = newValue }
    }
}

// MARK: - the Ask card on Today

/// The web's `AskLine` as a Today card, but a button: a field on Today sat
/// under the keyboard, so the tap opens a new chat with its own composer
/// already focused. The line under it opens "Everything you asked". Hidden
/// outside the Shell, where there is no chat to open.
struct AskCard: View {
    @Environment(\.openChat) private var openChat
    @State private var count: Int?

    var body: some View {
        if let openChat {
            VStack(spacing: 0) {
                Button { openChat(ChatStart()) } label: {
                    HStack(spacing: DesignTokens.s8) {
                        Image(systemName: "questionmark.bubble")
                            .font(.system(size: 15))
                            .foregroundStyle(Hy.ink3)
                        Text("Ask, or tell me what changed")
                            .hType(15, .regular, Hy.ink3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Ask").hType(13, .semibold, Hy.cream)
                            .padding(.horizontal, DesignTokens.s13)
                            .frame(height: 34)
                            .background(Capsule().fill(Hy.plum))
                    }
                    .padding(.vertical, DesignTokens.s8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(Pressed(scale: 0.98))
                .accessibilityLabel("Ask a question")
                Rectangle().fill(Hy.line).frame(height: 1)
                Button { openChat(.everything) } label: {
                    HStack {
                        Text("Everything you asked" + (count.map { $0 > 0 ? " · \($0)" : "" } ?? ""))
                            .hType(13, .medium, Hy.ink2)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Hy.ink3)
                    }
                    .padding(.vertical, DesignTokens.s13)
                    .contentShape(Rectangle())
                }
                .buttonStyle(Pressed(scale: 0.98))
            }
            .padding(.horizontal, DesignTokens.s13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .grained(Hy.card, radius: 21, shadow: 0.3)
            .padding(.horizontal, DesignTokens.s21)
            .task { count = try? await ChatApi.threads().threads.count }
        }
    }
}

// MARK: - the cover

struct ChatScreen: View {
    let start: ChatStart
    let close: () -> Void

    @State private var list = ChatListModel()
    /// The thread on screen; nil is the list.
    @State private var open: ChatStart?
    @Environment(\.accessibilityReduceMotion) private var reduce

    init(start: ChatStart, close: @escaping () -> Void) {
        self.start = start
        self.close = close
        _open = State(initialValue: start.list ? nil : start)
    }

    var body: some View {
        ZStack {
            Hy.paper.ignoresSafeArea()
            if let open {
                ChatThreadView(start: open,
                               back: start.list ? { show(nil) } : nil,
                               close: close)
                    .id(open.id)
                    .transition(reduce ? .opacity : .move(edge: .trailing))
            } else {
                ChatListView(model: list, close: close, open: { show($0) })
                    .transition(.opacity)
            }
        }
        .environment(\.colorScheme, .light)
        .task {
            guard start.list else { return }
            await list.load()
            #if DEBUG
            // `-OVScreen chat-thread [-OVAsk "…"]`: the newest thread, open,
            // with the follow-up sent.
            if Fixtures.screen == "chat-thread", let first = list.rows.first {
                show(ChatStart(threadId: first.id, title: first.title,
                               ask: UserDefaults.standard.string(forKey: "OVAsk")))
            }
            #endif
        }
    }

    private func show(_ next: ChatStart?) {
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { open = next }
        if next == nil { Task { await list.load() } }
    }
}

// MARK: - Everything you asked

struct ChatListView: View {
    let model: ChatListModel
    let close: () -> Void
    let open: (ChatStart) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HyHeader(title: "Everything you asked",
                     value: model.loaded ? Design.number(model.rows.count) : nil,
                     word: model.rows.count == 1 ? "question" : "questions",
                     line: "Swipe left on one to delete it.") {
                ChatCircle(glyph: "xmark", label: "Close", dark: true, action: close)
            }
            .zIndex(1)

            if !model.loaded {
                ProgressView().tint(Hy.ink2).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if model.rows.isEmpty {
                Text("Nothing asked yet. Ask about a number, a symptom or your plan.")
                    .hType(15, .regular, Hy.ink2)
                    .multilineTextAlignment(.center)
                    .padding(DesignTokens.s34)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(model.rows) { row in
                        Button { open(ChatStart(threadId: row.id, title: row.title)) } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(row.title).hType(15, .semibold, Hy.ink)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                let when = ChatListModel.when(row.lastTurnAt)
                                if !when.isEmpty { Text(when).hType(12, .regular, Hy.ink3) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Hy.paper)
                        .listRowSeparatorTint(Hy.line)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                Task { await model.delete(row) }
                            } label: { Label("Delete", systemImage: "trash") }
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
            if !model.error.isEmpty {
                Text(model.error).hType(13, .medium, Hy.rose)
                    .padding(.horizontal, DesignTokens.s21)
            }
            HyAction(title: "Ask something new") { open(ChatStart()) }
                .padding(.horizontal, DesignTokens.s21)
                .padding(.vertical, DesignTokens.s13)
        }
        .background(Hy.paper)
    }
}

// MARK: - one thread

struct ChatThreadView: View {
    let start: ChatStart
    var back: (() -> Void)?
    let close: () -> Void

    @State private var model: ChatModel
    @State private var started = false
    @FocusState private var typing: Bool

    init(start: ChatStart, back: (() -> Void)?, close: @escaping () -> Void) {
        self.start = start
        self.back = back
        self.close = close
        _model = State(initialValue: ChatModel(start: start))
    }

    /// The gallery and the previews: a thread already drawn.
    init(model: ChatModel) {
        start = ChatStart()
        back = nil
        close = {}
        _model = State(initialValue: model)
        _started = State(initialValue: true)
    }

    var body: some View {
        VStack(spacing: 0) {
            bar
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: DesignTokens.s21) {
                        if model.isNew && !model.busy {
                            Text("Ask about a number, a symptom or your plan. The answer uses your own readings.")
                                .hType(15, .regular, Hy.ink2)
                                .padding(.horizontal, DesignTokens.s21)
                        }
                        if model.loading {
                            ProgressView().tint(Hy.ink2).frame(maxWidth: .infinity, minHeight: 120)
                        }
                        ForEach(model.messages) { message in
                            if message.role == "user" {
                                Text(message.text)
                                    .hType(21, .semibold, Hy.ink, tracking: -0.02)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .padding(.horizontal, DesignTokens.s21)
                                    .padding(.top, DesignTokens.s8)
                            } else if !message.visible.isEmpty {
                                ChatAnswer(message: message, model: model)
                            }
                        }
                        if model.thinking {
                            ChatThinking().padding(.horizontal, DesignTokens.s21)
                        }
                        ForEach([model.error, model.actError].filter { !$0.isEmpty }, id: \.self) { line in
                            Text(line).hType(14, .medium, Hy.rose)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.horizontal, DesignTokens.s21)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(.vertical, DesignTokens.s13)
                }
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(.bottom)
                .onChange(of: model.messages) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
                .onChange(of: model.thinking) { _, _ in proxy.scrollTo("end", anchor: .bottom) }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { input }
        .background(Hy.paper.ignoresSafeArea())
        .task {
            guard !started else { return }
            started = true
            await model.load()
            if let ask = start.ask { await model.send(ask) }
            // A new chat opened empty (Today's Ask card): the keyboard comes up.
            else if model.isNew { typing = true }
        }
    }

    private var bar: some View {
        HStack(spacing: DesignTokens.s13) {
            if let back { ChatCircle(glyph: "chevron.left", label: "All questions", action: back) }
            Text(model.title)
                .hType(15, .semibold, Hy.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: back == nil ? .leading : .center)
            ChatCircle(glyph: "xmark", label: "Close", action: close)
        }
        .padding(.horizontal, DesignTokens.s21)
        .padding(.vertical, DesignTokens.s8)
        .overlay(alignment: .bottom) { Hy.line.frame(height: 1) }
    }

    private var input: some View {
        HStack(alignment: .bottom, spacing: DesignTokens.s8) {
            TextField(model.isNew ? "Ask, or tell me what changed" : "Ask a follow-up, or tell me something",
                      text: $model.input, axis: .vertical)
                .font(.grotesk(16))
                .foregroundStyle(Hy.ink)
                .lineLimit(1...5)
                .focused($typing)
                .submitLabel(.send)
                .padding(.horizontal, DesignTokens.s13)
                .padding(.vertical, 11)
                .background(RoundedRectangle(cornerRadius: 21, style: .continuous).fill(Hy.card))
                .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous)
                    .strokeBorder(Hy.line, lineWidth: 1))
            Button {
                let text = model.input
                Task { await model.send(text) }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(Hy.plum)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Hy.lime))
            }
            .buttonStyle(Pressed(scale: 0.9))
            .disabled(model.busy || model.input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(model.busy ? 0.45 : 1)
            .accessibilityLabel("Ask")
        }
        .padding(.horizontal, DesignTokens.s13)
        .padding(.vertical, DesignTokens.s8)
        .background(Hy.paper.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Hy.line.frame(height: 1) }
    }
}

/// A 36 circle: back and close.
private struct ChatCircle: View {
    let glyph: String
    let label: String
    var dark = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: glyph)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(dark ? Hy.mist : Hy.ink)
                .frame(width: 36, height: 36)
                .background(Circle().fill(dark ? Hy.plum2 : Hy.paper2))
        }
        .buttonStyle(Pressed(scale: 0.9))
        .accessibilityLabel(label)
    }
}

private struct ChatThinking: View {
    var body: some View {
        HStack(spacing: DesignTokens.s8) {
            ProgressView().tint(Hy.ink2)
            Text("Thinking…").hType(14, .medium, Hy.ink2)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - the answer card

private struct ChatAnswer: View {
    let message: ChatMessage
    let model: ChatModel

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            ForEach(Array(message.visible.enumerated()), id: \.offset) { _, part in
                switch part {
                case .text(let t):
                    Text(ChatProse.attributed(t))
                        .font(.grotesk(16))
                        .foregroundStyle(Hy.ink)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                case .offer(let o):
                    ChatActOnIt(offer: o, model: model)
                case .receipt(let r):
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "checkmark").foregroundStyle(Hy.green)
                        Text(r).hType(13, .medium, Hy.ink2)
                    }
                case .other:
                    EmptyView()
                }
            }
        }
        .hyCard()
    }
}

/// The evidence labels inside an answer, as `lib/evidence.ts` reads them:
/// `[science, A]`, `[opinion]`, `[anecdotal]`. A label it cannot read stays
/// as written.
enum ChatProse {
    enum Run: Equatable {
        case plain(String)
        case label(basis: String, grade: String?)
    }

    private static let pattern = try! NSRegularExpression(
        pattern: #"\[(science|opinion|anecdotal)(?:\s*,\s*([A-Ea-e]))?\]"#)

    static func runs(_ text: String) -> [Run] {
        let ns = text as NSString
        var out: [Run] = []
        var at = 0
        for m in pattern.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            if m.range.location > at {
                out.append(.plain(ns.substring(with: NSRange(location: at, length: m.range.location - at))))
            }
            let grade = m.range(at: 2).location == NSNotFound ? nil
                : ns.substring(with: m.range(at: 2)).uppercased()
            out.append(.label(basis: ns.substring(with: m.range(at: 1)), grade: grade))
            at = m.range.location + m.range.length
        }
        if at < ns.length { out.append(.plain(ns.substring(from: at))) }
        return out
    }

    /// ● science, ◐ opinion, ○ anecdote; the grade when there is one.
    static func chip(basis: String, grade: String?) -> String {
        let glyph = basis == "science" ? "●" : basis == "opinion" ? "◐" : "○"
        let word = grade ?? (basis == "science" ? "study" : basis == "opinion" ? "opinion" : "anecdote")
        return "\(glyph) \(word)"
    }

    static func tint(_ basis: String) -> (ink: Color, fill: Color) {
        switch basis {
        case "science": return (Hy.green, Hy.greenSoft)
        case "opinion": return (Hy.amber, Hy.amberSoft)
        default: return (Hy.ink2, Hy.paper2)
        }
    }

    static func attributed(_ text: String) -> AttributedString {
        var out = AttributedString()
        for run in runs(text) {
            switch run {
            case .plain(let s):
                out += (try? AttributedString(
                    markdown: s,
                    options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
                    ?? AttributedString(s)
            case .label(let basis, let grade):
                var chip = AttributedString("\u{2009}\(chip(basis: basis, grade: grade))\u{2009}")
                let (ink, fill) = tint(basis)
                chip.foregroundColor = ink
                chip.backgroundColor = fill
                chip.font = .grotesk(12, .semibold)
                out += chip
            }
        }
        return out
    }
}

private struct EvidenceTag: View {
    let basis: String
    let grade: String?

    var body: some View {
        let (ink, fill) = ChatProse.tint(basis)
        Text(ChatProse.chip(basis: basis, grade: grade))
            .hType(11, .semibold, ink)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Capsule().fill(fill))
    }
}

// MARK: - the offer: ActOnIt, Sources, AskBack

private struct ChatActOnIt: View {
    let offer: ChatOffer
    let model: ChatModel

    private var left: [ChatOffer.Action] { offer.actions.filter { model.added[$0.id] == nil } }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            if !offer.actions.isEmpty || !offer.tests.isEmpty {
                CardLabel(text: "Act on it", glyph: "plus.circle")
            }
            ForEach(offer.actions) { a in action(a) }
            if left.count > 1 {
                HyAction(title: "Add all \(left.count)", kind: .secondary) {
                    Task { await model.add(left, key: "all") }
                }
                .disabled(!model.working.isEmpty)
            }
            ForEach(offer.tests) { t in test(t) }
            if !offer.sources.isEmpty {
                Text("Sources: " + offer.sources.map { s in
                    s.name + (s.year.map { " (\($0))" } ?? "") + " [\(s.grade)]"
                }.joined(separator: "; "))
                .hType(12, .regular, Hy.ink3)
                .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(offer.questions) { q in
                ChatAskBack(question: q, options: offer.options[q.key] ?? [], model: model)
            }
        }
    }

    private func action(_ a: ChatOffer.Action) -> some View {
        HStack(alignment: .center, spacing: DesignTokens.s8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(a.title).hType(15, .semibold, Hy.ink)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    if let basis = a.basis { EvidenceTag(basis: basis, grade: a.grade) }
                    if let dose = a.dose, !dose.isEmpty { Text(dose).hType(12, .regular, Hy.ink2) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if model.added[a.id] != nil {
                Button { Task { await model.undo(a) } } label: {
                    Text("Added · Undo").hType(13, .semibold, Hy.green)
                        .padding(.horizontal, DesignTokens.s13).frame(height: 34)
                        .background(Capsule().fill(Hy.greenSoft))
                }
                .buttonStyle(Pressed(scale: 0.94))
            } else {
                small("Add", busy: model.working == a.id || model.working == "all") {
                    Task { await model.add([a], key: a.id) }
                }
            }
        }
    }

    private func test(_ t: ChatOffer.Test) -> some View {
        let weeks = Int(t.weeks.rounded())
        let doctor = t.selfOrder == false
        return HStack(alignment: .center, spacing: DesignTokens.s8) {
            Text(doctor ? "Ask your doctor for: \(t.name)" : "Retest \(t.name) in \(weeks) weeks")
                .hType(14, .medium, Hy.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if doctor {
                small(model.copied.contains(t.code) ? "Copied" : "Copy", busy: false) {
                    UIPasteboard.general.string = t.name
                    model.copied.insert(t.code)
                }
            } else if model.planned.contains(t.code) {
                Text("Planned").hType(13, .semibold, Hy.green)
                    .padding(.horizontal, DesignTokens.s13).frame(height: 34)
                    .background(Capsule().fill(Hy.greenSoft))
            } else {
                small("Plan retest", busy: model.working == t.code) {
                    Task { await model.plan(t) }
                }
            }
        }
    }

    private func small(_ title: String, busy: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(busy ? "…" : title).hType(13, .semibold, Hy.cream)
                .padding(.horizontal, DesignTokens.s13).frame(height: 34)
                .background(Capsule().fill(Hy.plum))
        }
        .buttonStyle(Pressed(scale: 0.94))
        .disabled(busy)
    }
}

/// A question the answer asked back: chips when the server gave options,
/// a field when it did not. The answer is saved as a fact, then sent.
private struct ChatAskBack: View {
    let question: ChatOffer.Question
    let options: [String]
    let model: ChatModel
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text(question.question).hType(14, .semibold, Hy.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let said = model.answered[question.key] {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark").foregroundStyle(Hy.green)
                    Text("Saved: \(said)").hType(13, .medium, Hy.ink2)
                }
            } else if options.isEmpty {
                HStack(spacing: DesignTokens.s8) {
                    TextField("Your answer", text: $text)
                        .font(.grotesk(15))
                        .padding(.horizontal, DesignTokens.s13).frame(height: 40)
                        .background(Capsule().fill(Hy.paper))
                        .overlay(Capsule().strokeBorder(Hy.line, lineWidth: 1))
                        .submitLabel(.send)
                        .onSubmit { save(text) }
                    Button { save(text) } label: {
                        Text(model.working == question.key ? "…" : "Save")
                            .hType(13, .semibold, Hy.cream)
                            .padding(.horizontal, DesignTokens.s13).frame(height: 40)
                            .background(Capsule().fill(Hy.plum))
                    }
                    .buttonStyle(Pressed(scale: 0.94))
                    .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } else {
                Flow {
                    ForEach(options, id: \.self) { o in
                        Button { save(o) } label: {
                            Text(o).hType(13, .medium, Hy.ink)
                                .padding(.horizontal, DesignTokens.s13).frame(height: 34)
                                .background(Capsule().fill(Hy.paper2))
                        }
                        .buttonStyle(Pressed(scale: 0.94))
                    }
                }
            }
        }
        .disabled(model.busy || !model.working.isEmpty)
    }

    private func save(_ value: String) {
        Task { await model.answer(question, value) }
    }
}

#if DEBUG
#Preview("Chat thread") {
    let thread: ChatThread? = {
        guard let text = Fixtures.json["chat-thread"] else { return nil }
        return try? JSONDecoder().decode(ChatThread.self, from: Data(text.utf8))
    }()
    return ChatThreadView(model: ChatModel(threadId: thread?.thread.id,
                                           title: thread?.thread.title ?? "",
                                           messages: thread?.messages ?? []))
}

#Preview("Everything you asked") {
    ChatScreen(start: .everything, close: {})
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
