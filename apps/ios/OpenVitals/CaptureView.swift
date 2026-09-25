import AVFoundation
import Speech
import SwiftUI
import UIKit

/// What the sheet says back after a send.
///
/// Every line in it comes from a field the server sent: the chips it
/// understood, the fields it wrote, and its own sentence. When the server sent
/// no words at all, the receipt says what the server's own flags say. It never
/// prints the reply body, so no id, field name or brace ever reaches the eye.
struct CaptureReceipt: Equatable {
    /// What was understood: one chip per fact, labelled as the reader
    /// labelled it.
    var chips: [String] = []
    /// What was saved: the keys `POST /api/capture` says it wrote, and the
    /// day it wrote them to.
    var saved: [String] = []
    /// The reader's own words: `reply`, `answer`, `note`, `basis`, `error`,
    /// or, when it sent none, one of the two sentences below.
    var said = ""

    var isEmpty: Bool { chips.isEmpty && saved.isEmpty && said.isEmpty }

    /// The reader did not run: the words are kept and read later.
    static let unread = "Saved. It will be read when the reader is back."
    /// The reader ran and kept nothing.
    static let nothingKept = "Read. Nothing to keep from that."

    /// Words on their own. `/api/compose` reads and writes in one call, so the
    /// chips that come back are already stored and its `reply` is the answer.
    static func of(_ composed: Api.Composed) -> CaptureReceipt {
        let chips = (composed.chips ?? []).map(\.label)
        return CaptureReceipt(
            chips: chips,
            said: sentence(composed.reply, composed.error)
                ?? standing(read: composed.read, kept: !chips.isEmpty))
    }

    /// A question. `/api/ask` answers in one field.
    static func of(_ asked: Api.Asked) -> CaptureReceipt {
        CaptureReceipt(said: sentence(asked.answer, asked.error) ?? "")
    }

    /// A photograph, read. A lab sheet carries a `note` instead of chips,
    /// because that one goes to the upload reader.
    static func of(_ read: Api.CaptureResult) -> CaptureReceipt {
        CaptureReceipt(chips: (read.chips ?? []).map(\.label),
                       said: sentence(read.note, read.basis, read.error) ?? "")
    }

    /// The first field that holds words. A field that is there but empty is
    /// not a sentence, so it is not the receipt either.
    private static func sentence(_ fields: String?...) -> String? {
        fields.compactMap { $0 }.first {
            !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    /// The server sent no words. Say what its flags say and nothing more: the
    /// chips already speak when there are any, and a server that reported
    /// neither state gets silence rather than a guess.
    private static func standing(read: Bool?, kept: Bool) -> String {
        guard let read, !kept else { return "" }
        return read ? nothingKept : unread
    }

    /// The write that follows the read: what the server names as written.
    func with(_ wrote: Api.ConfirmResult) -> CaptureReceipt {
        var out = self
        out.saved = (wrote.facts ?? []) + (wrote.day.map { [$0] } ?? [])
        if let error = wrote.error, !error.isEmpty { out.said = error }
        return out
    }
}

/// Add. The sheet behind the +: one box, one photo, one Send.
///
/// The routing is the engine's, not the person's: a photograph goes to
/// `/api/capture`, a question to `/api/ask`, and anything else to
/// `/api/compose`. The sheet never says so — the owner types what happened and
/// the server decides which reader gets it.
/// The Add sheet's three ways in.
enum AddMode: Equatable { case photo, voice, text }

/// The tests and the gallery still say `CaptureView`.
typealias CaptureView = AddSheet

/// `.veil`: plum at .32 over the blur; a tap closes.
struct AddVeil: View {
    let tap: () -> Void

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            Hy.plum.opacity(0.32)
        }
        .environment(\.colorScheme, .light)
        .ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture(perform: tap)
        .accessibilityLabel("Close")
        .accessibilityAddTraits(.isButton)
    }
}

/// Add: 48-hybrid.html's `.sheet.add`, drawn by `Shell` over the screen
/// and the bar. Three modes fill one well; Send shows once there is
/// something to send. Words and photos read in the island, a question
/// answers here. Spec phase 38, D1.
struct AddSheet: View {
    @Environment(IslandModel.self) private var island: IslandModel?
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Binding var busy: Bool
    let close: () -> Void
    /// D5: the Photo tile hands over to the camera, with the words so far.
    let openCamera: (String) -> Void

    @State private var mode: AddMode?
    @State private var image: UIImage?
    @State private var text = ""
    @State private var dictation = Dictation()
    @State private var receipt: CaptureReceipt?
    @State private var signIn = false
    /// How far the sheet is pulled down.
    @State private var drag: CGFloat = 0
    @State private var answerHeight: CGFloat = 0
    @FocusState private var typing: Bool

    /// `start`: the mode the camera's strip asked for; a kept draft wins.
    init(draft: CapturePayload? = nil, start: AddMode? = nil,
         busy: Binding<Bool> = .constant(false),
         close: @escaping () -> Void = {}, openCamera: @escaping (String) -> Void = { _ in }) {
        _busy = busy
        self.close = close
        self.openCamera = openCamera
        _image = State(initialValue: draft?.image)
        _text = State(initialValue: draft?.text ?? "")
        _mode = State(initialValue: Self.mode(for: draft, start: start))
    }

    /// The gallery's old Add still draws these two.
    static let placeholder =
        "What happened, what you took, what you ate, or a question"

    static let caption =
        "Read by the app and kept as facts, meals and supplements. "
        + "A lab sheet becomes a read receipt under Blood."

    static let title = "Add to today"
    static let line =
        "One thing or several. We read it in the island and sort it into meals and moves."
    static let empty = "Pick one. Send shows once there is something to send."
    static let ready = "Ready. We read it in the island."
    static let prompt = "Glass of red wine…"
    /// A pull past this closes the sheet.
    static let pullToClose: CGFloat = 89

    /// A reopened draft lands on the mode it came from.
    static func mode(for draft: CapturePayload?) -> AddMode? {
        guard let draft else { return nil }
        if draft.image != nil { return .photo }
        return draft.text.isEmpty ? nil : .text
    }

    /// From the camera's strip: Voice or Text as asked. Photo is the camera
    /// itself, so the sheet never opens on it without a photo.
    static func mode(for draft: CapturePayload?, start: AddMode?) -> AddMode? {
        mode(for: draft) ?? (start == .photo ? nil : start)
    }

    /// What Send sends: the mode's own words (the transcript under Voice),
    /// and the photo only under Photo.
    static func payload(mode: AddMode?, text: String, transcript: String,
                        image: UIImage?) -> CapturePayload {
        let words = mode == .voice ? transcript : text
        return CapturePayload(image: mode == .photo ? image : nil,
                              text: words.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    static func canSend(text: String, photo: Bool, busy: Bool) -> Bool {
        guard !busy else { return false }
        if photo { return true }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    static func canSend(_ payload: CapturePayload, busy: Bool) -> Bool {
        canSend(text: payload.text, photo: payload.image != nil, busy: busy)
    }

    private var payload: CapturePayload {
        Self.payload(mode: mode, text: text, transcript: dictation.transcript, image: image)
    }

    /// Send is drawn once there is something; a send in flight dims it.
    private var hasContent: Bool { Self.canSend(payload, busy: false) }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            card
                .offset(y: drag)
                .gesture(pull)
        }
        .padding(.horizontal, DesignTokens.s8)
        .padding(.bottom, DesignTokens.s8)
        .ignoresSafeArea(.container, edges: .bottom)
        .onAppear { if mode == .voice, image == nil { Task { await dictation.start() } } }
        .onDisappear { dictation.cancel() }
        .sheet(isPresented: $signIn) { SignInView() }
        #if DEBUG
        .onAppear(perform: stage)
        #endif
    }

    // MARK: the card

    /// 8 from the sides and the bottom, radius 42, padding 13/21/21.
    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            Grab()
            Text(Self.title).hType(21, .semibold, tracking: -0.02)
            Text(Self.line).hType(13, .regular, Hy.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, DesignTokens.s3)
            Group {
                if let receipt { read(receipt) } else { compose }
            }
            .padding(.top, DesignTokens.s13)
        }
        .padding(.top, DesignTokens.s13)
        .padding(.horizontal, DesignTokens.s21)
        .padding(.bottom, DesignTokens.s21)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 42)
        .contentShape(RoundedRectangle(cornerRadius: 42, style: .continuous))
    }

    /// Drag down 89 or more closes; less springs back.
    private var pull: some Gesture {
        DragGesture(minimumDistance: DesignTokens.s13)
            .onChanged { v in
                guard !busy else { return }
                drag = max(0, v.translation.height)
            }
            .onEnded { v in
                guard !busy else { return }
                if v.translation.height >= Self.pullToClose {
                    dismiss()
                } else {
                    Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { drag = 0 }
                }
            }
    }

    private var compose: some View {
        VStack(spacing: 0) {
            modes
            well.padding(.top, DesignTokens.s13)
            if hasContent {
                sendButton
                    .padding(.top, DesignTokens.s13)
                    .transition(reduce ? .opacity
                                : .opacity.combined(with: .offset(y: DesignTokens.s8)))
            }
        }
        .motion(Curve.ease.animation(0.2), value: hasContent)
    }

    // MARK: modes

    private var modes: some View {
        HStack(spacing: DesignTokens.s8) {
            tile(.photo, "camera", "Photo", "plate or label")
            tile(.voice, dictation.listening ? "mic.fill" : "mic", "Voice", "just say it")
            tile(.text, "text.alignleft", "Text", "a line is enough")
        }
    }

    /// `.modes button`: paper, radius 21, padding 13, a 2 pt ink border
    /// when chosen.
    private func tile(_ which: AddMode, _ glyph: String, _ title: String,
                      _ sub: String) -> some View {
        let on = mode == which
        let shape = RoundedRectangle(cornerRadius: 21, style: .continuous)
        return Button { choose(which) } label: {
            VStack(alignment: .leading, spacing: DesignTokens.s8) {
                Image(systemName: glyph)
                    .font(.system(size: 21))
                    .foregroundStyle(Hy.ink)
                    .frame(height: 24)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title).hType(15, .semibold)
                    Text(sub).hType(11, .regular, Hy.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(DesignTokens.s13)
            .background(shape.fill(Hy.paper))
            .overlay(shape.strokeBorder(on ? Hy.ink : .clear, lineWidth: 2))
            .contentShape(shape)
        }
        .buttonStyle(Pressed(scale: 0.96))
        .disabled(busy)
        .accessibilityLabel(title)
        .accessibilityHint(sub)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    /// Photo hands over to the camera (D5) with the words so far; Voice
    /// starts listening and a second tap stops it; Text focuses the line.
    private func choose(_ next: AddMode) {
        if next != .voice { dictation.stop() }
        if next != .text { typing = false }
        switch next {
        case .photo:
            dictation.cancel()
            openCamera(text)
            return
        case .voice:
            if dictation.listening { dictation.stop(); return }
            Task { await dictation.start() }
        case .text:
            typing = true
        }
        Motion.animate(Curve.ease.animation(0.2), reduce: reduce) { mode = next }
    }

    // MARK: the well

    /// `.well`: 2 pt dashed paper-3, radius 21, at least 89 tall.
    private var well: some View {
        HStack(alignment: .center, spacing: DesignTokens.s13) { inWell }
            .hType(13, .regular, Hy.ink2)
            .frame(maxWidth: .infinity, minHeight: 89 - 2 * DesignTokens.s13,
                   alignment: .leading)
            .padding(DesignTokens.s13)
            .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous)
                .strokeBorder(Hy.paper3, style: StrokeStyle(lineWidth: 2, dash: [6, 5])))
    }

    @ViewBuilder private var inWell: some View {
        switch mode {
        case nil:
            Text(Self.empty)
        case .photo?:
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 62, height: 62)
                    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                    .accessibilityLabel("The photo to send")
                VStack(alignment: .leading, spacing: 2) {
                    Text(Self.ready).foregroundStyle(Hy.ink)
                    if !text.isEmpty { Text(text).lineLimit(2) }
                }
            } else {
                Text("Take a photo or choose one.")
            }
        case .voice?:
            voice
        case .text?:
            TextField("", text: $text, prompt: Text(Self.prompt).foregroundStyle(Hy.ink3),
                      axis: .vertical)
                .font(.grotesk(15))
                .foregroundStyle(Hy.ink)
                .tint(Hy.ink)
                .lineLimit(2...5)
                .focused($typing)
                .onAppear { typing = true }
        }
    }

    @ViewBuilder private var voice: some View {
        switch dictation.phase {
        case .asking:
            Text("Asking to use the microphone…")
        case .listening:
            Wave()
            if dictation.transcript.isEmpty {
                Text("Listening…")
            } else {
                heard
            }
        case .denied:
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                Text(Dictation.denied).fixedSize(horizontal: false, vertical: true)
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .font(.grotesk(13, .semibold))
                .foregroundStyle(Hy.ink)
            }
        case .unavailable(let why):
            Text(why)
        case .idle:
            if dictation.transcript.isEmpty { Text("Tap Voice and say it.") } else { heard }
        }
    }

    private var heard: some View {
        Text(dictation.transcript)
            .hType(15, .regular, Hy.ink)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// `.send`: 55, lime, 17/600 plum.
    private var sendButton: some View {
        Button { Task { await send() } } label: {
            Text(busy ? "Sending…" : "Send")
                .hType(17, .semibold, Hy.plum)
                .frame(maxWidth: .infinity, minHeight: 55)
                .background(Capsule().fill(Hy.lime))
                .contentShape(Capsule())
        }
        .buttonStyle(Pressed(scale: 0.96))
        .disabled(busy)
    }

    // MARK: a question's answer

    private func read(_ receipt: CaptureReceipt) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            ScrollView {
                answer(receipt)
                    .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) {
                        answerHeight = $0
                    }
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollIndicators(.hidden)
            .frame(height: min(answerHeight, 340))
            HStack(spacing: DesignTokens.s8) {
                Button { dismiss() } label: {
                    Text("Done").hType(15, .semibold, Hy.cream)
                        .frame(maxWidth: .infinity, minHeight: 55)
                        .background(Capsule().fill(Hy.plum))
                        .contentShape(Capsule())
                }
                .buttonStyle(Pressed(scale: 0.96))
                Button { again() } label: {
                    Text("Add another").hType(15, .semibold)
                        .padding(.horizontal, DesignTokens.s21)
                        .frame(minHeight: 55)
                        .background(Capsule().fill(Hy.paper))
                        .contentShape(Capsule())
                }
                .buttonStyle(Pressed(scale: 0.96))
            }
            .disabled(busy)
        }
    }

    private func answer(_ receipt: CaptureReceipt) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            if !receipt.chips.isEmpty {
                Flow {
                    ForEach(receipt.chips, id: \.self) { label in
                        Text(label).hType(13, .medium)
                            .padding(.horizontal, DesignTokens.s13)
                            .padding(.vertical, DesignTokens.s5)
                            .background(Capsule().fill(Hy.paper))
                    }
                }
            }
            if !receipt.saved.isEmpty {
                Text("Saved · \(receipt.saved.joined(separator: " · "))")
                    .hType(13, .regular, Hy.ink2)
            }
            if !receipt.said.isEmpty {
                Text(receipt.said)
                    .hType(15, .regular, Hy.ink)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: actions

    private func dismiss() {
        dictation.cancel()
        typing = false
        close()
    }

    private func again() {
        receipt = nil
        text = ""
        image = nil
        dictation.reset()
        mode = .text
        typing = true
    }

    private func send() async {
        guard Api.signedIn else { signIn = true; return }
        guard let run = island?.run else { return }
        dictation.stop()
        let payload = self.payload
        guard Self.canSend(payload, busy: busy) else { return }
        if CaptureRun.route(payload) == .island {
            _ = await run.send(payload)
            dismiss()
            return
        }
        typing = false
        busy = true
        defer { busy = false }
        receipt = await run.send(payload)
    }

    #if DEBUG
    /// `-OVAdd text|voice`, with `-OVSheet capture`: Add open on one mode
    /// with something in the well, so a screenshot reaches Send with no tap.
    private func stage() {
        guard Fixtures.on else { return }
        switch UserDefaults.standard.string(forKey: "OVAdd") {
        case "text":
            mode = .text
            text = "Glass of red wine with dinner"
        case "voice":
            mode = .voice
            dictation.stage("Walked fifteen minutes after dinner, then psyllium in water.")
        default:
            break
        }
    }
    #endif
}

/// `.grab`: 34 × 5, paper-3.
private struct Grab: View {
    var body: some View {
        Capsule().fill(Hy.paper3)
            .frame(width: 34, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.bottom, DesignTokens.s13)
    }
}

/// `.wave`: 21 bars 3 wide, each 5 ↔ 34 over 700 ms on the ease,
/// alternating, staggered by 89 ms. Still under Reduce Motion.
private struct Wave: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: reduce)) { context in
            let t = reduce ? 0 : context.date.timeIntervalSince(start)
            HStack(spacing: DesignTokens.s3) {
                ForEach(0..<21, id: \.self) { i in
                    Capsule().fill(Hy.ink)
                        .frame(width: 3, height: Self.height(at: t, bar: i))
                }
            }
            .frame(height: 34)
        }
        .accessibilityHidden(true)
    }

    /// The CSS `animation-delay` as a phase: bar `i` runs `(i · 89) mod 700`
    /// ms ahead, so a still frame is already uneven.
    static func height(at t: TimeInterval, bar: Int) -> CGFloat {
        let k = (t + Double((bar * 89) % 700) / 1000) / 0.7
        let lap = k.rounded(.down)
        var f = k - lap
        if Int(lap) % 2 == 1 { f = 1 - f }
        return 5 + 29 * CGFloat(Curve.ease.unit.value(at: f))
    }
}

// MARK: - voice

/// Voice: dictation on the phone (`SFSpeechRecognizer` on the device when
/// it can), the words sent as a typed line would be. No audio leaves.
@Observable
@MainActor
final class Dictation {
    enum Phase: Equatable { case idle, asking, listening, denied, unavailable(String) }

    private(set) var phase: Phase = .idle
    private(set) var transcript = ""

    var listening: Bool { phase == .listening }

    static let denied = "Voice needs the microphone and speech recognition. "
        + "Allow both for OpenVitals in Settings, or type it instead."
    static let unavailable = "Dictation is not available right now. Type it instead."

    @ObservationIgnored private var engine: AVAudioEngine?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    /// Bumped on every start and cancel, so a late word from an old run
    /// is dropped.
    @ObservationIgnored private var run = 0

    /// Asks on first use, then listens.
    func start() async {
        guard phase != .listening, phase != .asking else { return }
        phase = .asking
        let allowed = await Self.allowed()
        // Closed or stopped while the question was up.
        guard phase == .asking else { return }
        guard allowed else { phase = .denied; return }
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            phase = .unavailable(Self.unavailable)
            return
        }
        do {
            try begin(recognizer)
        } catch {
            teardown()
            phase = .unavailable(Self.unavailable)
        }
    }

    /// Stops listening; the last words still land.
    func stop() {
        guard phase == .listening || phase == .asking else { return }
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        engine = nil
        request?.endAudio()
        phase = .idle
    }

    /// Stops and drops whatever is still coming.
    func cancel() {
        run += 1
        task?.cancel()
        teardown()
        if phase != .denied { phase = .idle }
    }

    func reset() {
        cancel()
        transcript = ""
    }

    static func allowed() async -> Bool {
        let speech = await withCheckedContinuation { go in
            SFSpeechRecognizer.requestAuthorization { go.resume(returning: $0) }
        }
        guard speech == .authorized else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }

    private struct NoInput: Error {}

    private func begin(_ recognizer: SFSpeechRecognizer) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        let engine = AVAudioEngine()
        let format = engine.inputNode.outputFormat(forBus: 0)
        // A simulator with no microphone reports a zero format; the tap
        // would throw an Objective-C exception on it.
        guard format.sampleRate > 0, format.channelCount > 0 else { throw NoInput() }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        request.addsPunctuation = true
        Self.tap(engine.inputNode, format: format, into: request)
        engine.prepare()
        try engine.start()
        run += 1
        let id = run
        transcript = ""
        self.engine = engine
        self.request = request
        task = Self.listen(recognizer, request) { [weak self] words, done in
            Task { @MainActor in self?.heard(id, words, done: done) }
        }
        phase = .listening
    }

    /// Off the main actor: the tap and the recognizer call back on their
    /// own queues.
    nonisolated private static func tap(_ input: AVAudioInputNode, format: AVAudioFormat,
                                        into request: SFSpeechAudioBufferRecognitionRequest) {
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
    }

    nonisolated private static func listen(
        _ recognizer: SFSpeechRecognizer, _ request: SFSpeechAudioBufferRecognitionRequest,
        _ heard: @escaping @Sendable (String?, Bool) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            heard(result?.bestTranscription.formattedString,
                  error != nil || (result?.isFinal ?? false))
        }
    }

    private func heard(_ id: Int, _ words: String?, done: Bool) {
        guard id == run else { return }
        if let words, !words.isEmpty { transcript = words }
        guard done else { return }
        teardown()
        if phase == .listening { phase = .idle }
    }

    private func teardown() {
        engine?.stop()
        engine?.inputNode.removeTap(onBus: 0)
        engine = nil
        request?.endAudio()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    #if DEBUG
    /// A screenshot's listening well, with no microphone.
    func stage(_ words: String) {
        transcript = words
        phase = .listening
    }
    #endif
}

#if DEBUG
#Preview("Add") {
    AddSheet()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
