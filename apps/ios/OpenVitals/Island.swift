import ActivityKit
import Observation
import SwiftUI
import UIKit

// Phase 37 task C4: the island inside the app, and the capture run that feeds
// it. Shapes and timings from `phase37-hybrid-motion-reference.md` "Island";
// geometry from the spec, "Island geometry".

// MARK: - the geometry

/// Where the island sits and how tall it opens, apart from any view.
struct IslandGeometry: Equatable {
    /// The hardware cutout. ponytail: fixed cutout size; add a per-model
    /// table if a device misaligns.
    static let cutout = CGSize(width: 126, height: 37)
    static let cutoutTop: CGFloat = 11
    /// Above the content on an island phone: the camera hides these pixels,
    /// so nothing is drawn in them.
    static let band: CGFloat = 37
    static let maxWidth: CGFloat = 358
    /// Without an island the pill drops this far under the safe-area top.
    static let pillGap: CGFloat = 5
    /// The header clears the island by this much.
    static let clearance: CGFloat = 8

    enum Shape: Equatable {
        /// A read: 84 of content.
        case plate
        /// A receipt, "All done" or a failure: 62 of content.
        case receipt

        var content: CGFloat { self == .plate ? 84 : 62 }
        /// `.island` 34 open on a plate, 31 on a receipt.
        var radius: CGFloat { self == .plate ? 34 : 31 }
    }

    var safeTop: CGFloat
    var screenWidth: CGFloat

    /// A key window whose top inset is 51 or more has a Dynamic Island.
    var hasIsland: Bool { safeTop >= 51 }

    /// 358, or the screen less 16 a side on a narrower phone.
    var width: CGFloat { min(Self.maxWidth, screenWidth - 32) }

    /// Where the content starts inside the shape.
    var contentTop: CGFloat { hasIsland ? Self.band : 0 }

    func height(_ shape: Shape) -> CGFloat { contentTop + shape.content }

    /// The open top edge, from the top of the screen.
    var top: CGFloat { hasIsland ? Self.cutoutTop : safeTop + Self.pillGap }

    /// The shape's frame in screen points. Closed, it is the cutout on an
    /// island phone, and a pill tucked above the screen on any other.
    func frame(_ shape: Shape?) -> CGRect {
        guard let shape else {
            if hasIsland {
                return CGRect(x: (screenWidth - Self.cutout.width) / 2, y: Self.cutoutTop,
                              width: Self.cutout.width, height: Self.cutout.height)
            }
            let h = Shape.receipt.content
            return CGRect(x: (screenWidth - width) / 2, y: -h - Self.clearance,
                          width: width, height: h)
        }
        return CGRect(x: (screenWidth - width) / 2, y: top, width: width, height: height(shape))
    }

    /// Closed, the cutout's own pill.
    func radius(_ shape: Shape?) -> CGFloat {
        shape?.radius ?? (hasIsland ? Self.cutout.height / 2 : Shape.receipt.radius)
    }

    /// How far the Today header moves down: the island's bottom plus 8,
    /// less the safe-area top the header already clears. 0 when closed.
    func push(_ shape: Shape?) -> CGFloat {
        guard let shape else { return 0 }
        return max(0, top + height(shape) + Self.clearance - safeTop)
    }
}

// MARK: - what it shows

/// What a failed read keeps, so a tap on the island opens Add with it again.
struct CapturePayload: Equatable {
    var image: UIImage?
    var text: String

    static func == (a: Self, b: Self) -> Bool { a.image === b.image && a.text == b.text }
}

/// One read in the island: the thumb, the ring and the bar, the items as
/// they arrive, then the result.
struct ReadingState: Equatable {
    enum Kind: Equatable { case photo, voice, text }

    var kind: Kind
    var thumb: UIImage?
    /// 0…1.
    var progress: Double = 0
    /// Arrived so far, oldest first; the newest draws in lime.
    var items: [String] = []
    /// Set when the read has landed: the check disc, the green bar.
    var result: Result?

    struct Result: Equatable {
        var title: String
        var sub: String
    }

    var done: Bool { result != nil }

    /// `"Reading your plate…"` / `"…what you said…"` / `"…your note…"`.
    var title: String {
        if let result { return result.title }
        switch kind {
        case .photo: return "Reading your plate…"
        case .voice: return "Reading what you said…"
        case .text: return "Reading your note…"
        }
    }

    static func == (a: Self, b: Self) -> Bool {
        a.kind == b.kind && a.thumb === b.thumb && a.progress == b.progress
            && a.items == b.items && a.result == b.result
    }
}

/// One thing at a time in the island.
enum IslandActivity: Equatable {
    case reading(ReadingState)
    /// `"<move>" / "+Δ · score S · moves X of N"`, the score big on the right.
    case receipt(title: String, sub: String, score: Int?)
    /// The last move ticked: `"All done today" / "streak N · moves X of X"`.
    case allDone(streak: Int, moves: Int, score: Int?)
    /// A write or a read that failed. With `retry`, a tap opens Add again
    /// with the photo and the words.
    case failed(message: String, retry: CapturePayload?)

    var shape: IslandGeometry.Shape {
        if case .reading = self { return .plate }
        return .receipt
    }

    /// Whether it closes on its own after the hold. A read closes once it
    /// has landed; a failure closes like a receipt, and the model keeps its
    /// photo and words as `draft`, so nothing is lost.
    var collapses: Bool {
        switch self {
        case .reading(let s): return s.done
        case .receipt, .allDone, .failed: return true
        }
    }

    /// Today's receipts, as the island draws them.
    init(_ receipt: TodayReceipt) {
        switch receipt {
        case let .tick(title, sub, score): self = .receipt(title: title, sub: sub, score: score)
        case let .allDone(streak, moves, score): self = .allDone(streak: streak, moves: moves, score: score)
        case let .failed(message): self = .failed(message: message, retry: nil)
        }
    }
}

extension Notification.Name {
    /// A capture landed on the server: Today reads the day again.
    static let ovCaptured = Notification.Name("ovCaptured")
}

// MARK: - the model

/// The island's one activity, on `Shell` so every tab has it.
@Observable
@MainActor
final class IslandModel {
    private(set) var activity: IslandActivity?
    /// Counts up per `show`, so a replacement redraws its content even when
    /// it reads the same.
    private(set) var serial = 0
    /// What a failed read kept. It outlives the failure's 2.6 s on screen:
    /// the next tap on + opens the Add sheet with it. A new read replaces it.
    private(set) var draft: CapturePayload?
    /// Set by the overlay from the window it draws in.
    var geometry = IslandGeometry(safeTop: 0, screenWidth: 390)

    /// Receipts collapse after this; a finished read holds this long too.
    @ObservationIgnored let hold: Duration
    @ObservationIgnored private var collapse: Task<Void, Never>?
    @ObservationIgnored let run: CaptureRun

    init(hold: Duration = .milliseconds(2600)) {
        self.hold = hold
        run = CaptureRun()
        run.island = self
    }

    /// How far the Today header moves down while the island is open.
    var push: CGFloat { geometry.push(activity?.shape) }

    /// A new activity replaces the current one. `stay` keeps it open (the
    /// screenshot fixtures).
    @discardableResult
    func show(_ next: IslandActivity, stay: Bool = false) -> Int {
        collapse?.cancel()
        switch next {
        case .failed(_, let kept?): draft = kept
        case .reading: draft = nil
        default: break
        }
        activity = next
        serial += 1
        if next.collapses, !stay { schedule() }
        return serial
    }

    func show(_ receipt: TodayReceipt) { show(IslandActivity(receipt)) }

    /// A read still on screen changes in place: the ring, the items, the
    /// result. Nothing happens once something else replaced it.
    func update(_ id: Int, _ change: (inout ReadingState) -> Void) {
        guard id == serial, case .reading(var state) = activity else { return }
        change(&state)
        activity = .reading(state)
        if state.done { schedule() }
    }

    /// The read landed: in place if it is still up, else it comes back.
    func finish(_ id: Int, _ state: ReadingState) {
        if id == serial, case .reading = activity {
            update(id) { $0 = state }
        } else {
            show(.reading(state))
        }
    }

    /// A tap on a failed read: its photo and words, and the island closes.
    func retry() -> CapturePayload? {
        guard case .failed(_, let payload?) = activity else { return nil }
        close()
        draft = nil
        return payload
    }

    /// The kept draft for the Add sheet the + opens, handed over once.
    func takeDraft() -> CapturePayload? {
        defer { draft = nil }
        return draft
    }

    func close() {
        collapse?.cancel()
        activity = nil
    }

    private func schedule() {
        collapse?.cancel()
        let wait = hold
        let id = serial
        collapse = Task { [weak self] in
            try? await Task.sleep(for: wait)
            guard !Task.isCancelled, let self, self.serial == id else { return }
            self.activity = nil
        }
    }

    // MARK: fixtures

    #if DEBUG
    /// `-OVIsland plate|receipt`: the island open and held, over Today.
    func stage(_ which: String?) {
        switch which {
        case "plate":
            let meal = (Fixtures.canned("meals") as Api.MealDay?)?.meals.first
            show(.reading(ReadingState(kind: .photo, thumb: nil, progress: 0.62,
                                       items: Array((meal?.items ?? []).map(\.name).prefix(2)))),
                 stay: true)
        case "receipt":
            let m = TodayModel(today: Fixtures.canned("today"),
                               plan: Fixtures.canned("plan-today"), meals: nil, days: [])
            guard let row = m.queue.first, let now = m.result?.score else { return }
            let gain = m.gain ?? 0
            show(.receipt(title: row.title,
                          sub: TodayReceipt.tickSub(gain: gain, score: now + gain,
                                                    done: m.movesDone + 1, due: m.doRows.count),
                          score: now + gain),
                 stay: true)
        default: break
        }
    }
    #endif
}

// MARK: - the capture run

/// Send, out of the sheet. A photograph or plain words dismiss Add at once
/// and read in the island; a question keeps its answer in the sheet.
@MainActor
final class CaptureRun {
    weak var island: IslandModel?

    enum Route: Equatable { case island, sheet }

    /// `/api/ask` answers in the sheet; everything else is a read.
    static func route(_ payload: CapturePayload) -> Route {
        payload.image == nil && Api.isQuestion(payload.text) ? .sheet : .island
    }

    // The four doors, seams so a test can answer or fail them.
    var capture: (_ photo: Data, _ caption: String) async throws -> Api.CaptureResult = {
        try await Api.capture(photo: $0, caption: $1, takenAt: Date())
    }
    var confirm: (_ chips: [Api.Chip], _ label: String?) async throws -> Api.ConfirmResult = {
        try await Api.confirm(chips: $0, label: $1, at: Api.iso(Date()))
    }
    var compose: (_ text: String) async throws -> Api.Composed = { try await Api.compose(text: $0) }
    var ask: (_ question: String) async throws -> Api.Asked = { try await Api.ask($0) }

    /// The read has no server progress: the curve runs against this.
    var expected: TimeInterval = 7
    /// Between two items arriving.
    var step: Duration = .milliseconds(300)
    /// How often the ring moves.
    var frame: Duration = .milliseconds(100)
    /// Off in the tests: no Live Activity from a test host.
    var liveActivities = true

    /// The read in flight, for the tests.
    private(set) var task: Task<Void, Never>?

    /// The prototype's curve: fast to 65 % at half time, slower after.
    static func curve(_ k: Double) -> Double {
        let k = max(0, k)
        return min(1, k < 0.5 ? k * 1.3 : 0.65 + (k - 0.5) * 0.7)
    }

    /// Where the ring stands `elapsed` into a read: the curve, held at 95 %
    /// until the answer lands.
    static func progress(elapsed: TimeInterval, expected: TimeInterval) -> Double {
        min(0.95, curve(elapsed / expected))
    }

    /// One Send. A question comes back as the sheet's receipt; anything
    /// else starts the read in the island and returns nil at once.
    func send(_ payload: CapturePayload) async -> CaptureReceipt? {
        switch Self.route(payload) {
        case .sheet:
            do { return CaptureReceipt.of(try await ask(payload.text)) }
            catch { return CaptureReceipt(said: error.localizedDescription) }
        case .island:
            task = Task { await read(payload) }
            return nil
        }
    }

    /// What a read lands as.
    struct Outcome: Equatable {
        var items: [String]
        var title: String
        var sub: String
    }

    /// A photograph: its food names as the items, then
    /// `"<label>" / "<kcal> kcal · <protein> g protein"`. A photo that is
    /// not a meal says what the reader said.
    static func outcome(_ seen: Api.CaptureResult, wrote: Api.ConfirmResult?) -> Outcome {
        let chips = seen.chips ?? []
        let names = (seen.label ?? "").split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        func number(_ key: String) -> Int? {
            guard case .number(let v)? = chips.first(where: { $0.key == key })?.value else { return nil }
            return Int((v + 0.5).rounded(.down))
        }
        var receipt = CaptureReceipt.of(seen)
        if let wrote { receipt = receipt.with(wrote) }
        let sub: String
        if let error = wrote?.error, !error.isEmpty {
            sub = error
        } else if let kcal = number("kcal") {
            sub = "\(kcal) kcal" + (number("proteinG").map { " · \($0) g protein" } ?? "")
        } else {
            sub = receipt.said.isEmpty ? CaptureReceipt.nothingKept : receipt.said
        }
        return Outcome(items: names.isEmpty ? chips.map(\.label) : names,
                       title: sentenceCase(seen.label) ?? "Read", sub: sub)
    }

    /// Words: the chips as the items, the reader's own sentence under
    /// "Noted".
    static func outcome(_ composed: Api.Composed) -> Outcome {
        let receipt = CaptureReceipt.of(composed)
        let sub = receipt.said.isEmpty ? receipt.chips.joined(separator: " · ") : receipt.said
        return Outcome(items: receipt.chips, title: "Noted", sub: sub)
    }

    private static func sentenceCase(_ s: String?) -> String? {
        guard let s = s?.trimmingCharacters(in: .whitespaces), let first = s.first else { return nil }
        return first.uppercased() + s.dropFirst()
    }

    /// Reading → items → result, then Today reads the day again. A failure
    /// keeps the photo and the words for the retry.
    private func read(_ payload: CapturePayload) async {
        guard let island else { return }
        let background = Background()
        defer { background.end() }

        let kind: ReadingState.Kind = payload.image == nil ? .text : .photo
        var state = ReadingState(kind: kind, thumb: payload.image)
        let id = island.show(.reading(state))
        // The plate read only; words stay in the app.
        let live = kind == .photo && liveActivities ? PlateLive.start(state.title) : nil

        let t0 = Date()
        let expected = self.expected, frame = self.frame, title = state.title
        let ticker = Task { [weak island] in
            while !Task.isCancelled {
                let p = Self.progress(elapsed: Date().timeIntervalSince(t0), expected: expected)
                island?.update(id) { $0.progress = p }
                live?.progress(p, title: title)
                try? await Task.sleep(for: frame)
            }
        }

        do {
            let out: Outcome
            if let image = payload.image {
                guard let data = image.jpegData(compressionQuality: 0.8) else {
                    throw Api.Failure(status: 0, message: "The photo could not be read")
                }
                let seen = try await capture(data, payload.text)
                let chips = seen.chips ?? []
                let wrote = chips.isEmpty ? nil : try await confirm(chips, seen.label)
                out = Self.outcome(seen, wrote: wrote)
            } else {
                out = Self.outcome(try await compose(payload.text))
            }
            ticker.cancel()
            state.progress = Self.progress(elapsed: Date().timeIntervalSince(t0), expected: expected)
            let from = state.progress
            for (i, item) in out.items.enumerated() {
                state.items.append(item)
                state.progress = from + (1 - from) * Double(i + 1) / Double(out.items.count + 1)
                let now = state
                island.update(id) { $0 = now }
                try? await Task.sleep(for: step)
            }
            state.progress = 1
            state.result = .init(title: out.title, sub: out.sub)
            island.finish(id, state)
            live?.end(.init(phase: .done, progress: 1, title: out.title, sub: out.sub))
            NotificationCenter.default.post(name: .ovCaptured, object: nil)
        } catch {
            ticker.cancel()
            island.show(.failed(message: "Couldn't read that · tap to try again", retry: payload))
            live?.end(.init(phase: .failed, progress: state.progress,
                            title: "Couldn't read that", sub: "open the app to try again"))
        }
    }
}

/// `beginBackgroundTask` around one read: the upload and the answer finish
/// when the person leaves the app mid-read.
@MainActor
private final class Background {
    private var id = UIBackgroundTaskIdentifier.invalid

    init() {
        id = UIApplication.shared.beginBackgroundTask(withName: "capture") { [weak self] in
            self?.end()
        }
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}

/// The plate read on the Lock Screen and in the Dynamic Island while the app
/// is away. iOS hides it while the app is in front.
// ponytail: no APNs push updates; add push-to-update when a read outlasts
// the ~30 s of background time.
@MainActor
final class PlateLive {
    private let activity: Activity<PlateActivityAttributes>
    private var sent = Date.distantPast

    private init(_ activity: Activity<PlateActivityAttributes>) { self.activity = activity }

    static func start(_ title: String) -> PlateLive? {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
        let state = PlateActivityAttributes.ContentState(phase: .reading, progress: 0,
                                                         title: title, sub: "looking")
        guard let activity = try? Activity.request(
            attributes: PlateActivityAttributes(),
            content: ActivityContent(state: state, staleDate: nil), pushType: nil)
        else { return nil }
        return PlateLive(activity)
    }

    /// About once a second: ActivityKit budgets updates.
    func progress(_ p: Double, title: String) {
        guard Date().timeIntervalSince(sent) >= 1 else { return }
        sent = Date()
        let state = PlateActivityAttributes.ContentState(phase: .reading, progress: p,
                                                         title: title, sub: "looking")
        let activity = self.activity
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
    }

    /// The result, then gone 4 s later.
    func end(_ state: PlateActivityAttributes.ContentState) {
        let activity = self.activity
        Task {
            await activity.end(ActivityContent(state: state, staleDate: nil),
                               dismissalPolicy: .after(Date().addingTimeInterval(4)))
        }
    }
}

// MARK: - the overlay

/// The island in the app: black, grown out of the hardware cutout, never
/// drawing inside it. On a phone without an island it drops as a pill from
/// under the status bar. Only the shape takes touches.
struct IslandOverlay: View {
    let model: IslandModel
    /// A tap on a failed read: Add again with what it kept.
    var reopen: (CapturePayload) -> Void = { _ in }

    @Environment(\.accessibilityReduceMotion) private var reduce
    /// Off once a collapse has finished, so nothing rests over the cutout.
    @State private var visible = false
    /// The last open shape, so Reduce Motion can fade it out at its size.
    @State private var last: IslandGeometry.Shape = .receipt

    var body: some View {
        GeometryReader { g in
            let geo = IslandGeometry(safeTop: g.safeAreaInsets.top, screenWidth: g.size.width)
            let shape = model.activity?.shape
            // Reduce Motion: no growing; the open shape crossfades in and out.
            let drawn = reduce ? (shape ?? last) : shape
            let f = geo.frame(drawn)
            ZStack(alignment: .top) {
                Color.black
                if let activity = model.activity {
                    IslandContent(activity: activity)
                        .frame(width: geo.width, height: activity.shape.content)
                        .padding(.top, geo.contentTop)
                        .id(model.serial)
                        .transition(.asymmetric(
                            insertion: .opacity.animation(Motion.animation(
                                .easeOut(duration: 0.2).delay(0.18), reduce: reduce)),
                            removal: .opacity.animation(Motion.animation(
                                .easeOut(duration: 0.2), reduce: reduce))))
                }
            }
            .frame(width: f.width, height: f.height, alignment: .top)
            .clipShape(RoundedRectangle(cornerRadius: geo.radius(drawn), style: .continuous))
            .shadow(color: .black.opacity(visible && shape != nil ? 0.5 : 0), radius: 8, y: 8)
            .contentShape(RoundedRectangle(cornerRadius: geo.radius(drawn), style: .continuous))
            .onTapGesture { if let payload = model.retry() { reopen(payload) } }
            .allowsHitTesting(shape != nil)
            .offset(y: f.minY)
            .opacity(reduce ? (shape == nil ? 0 : 1) : (visible ? 1 : 0))
            .motion(Curve.ispring.animation(0.62), value: shape)
            .motion(.easeOut(duration: 0.2), value: model.serial)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .ignoresSafeArea()
            .onAppear { model.geometry = geo }
            .onChange(of: geo) { _, new in model.geometry = new }
        }
        .onChange(of: model.activity?.shape) { _, shape in
            if let shape {
                last = shape
                visible = true
            } else {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(620))
                    if model.activity == nil { visible = false }
                }
            }
        }
        .onAppear { if model.activity != nil { visible = true } }
    }
}

/// The two layouts inside the island.
private struct IslandContent: View {
    let activity: IslandActivity

    var body: some View {
        switch activity {
        case .reading(let state):
            PlateRow(state: state)
        case let .receipt(title, sub, score):
            ReceiptRow(disc: .ok, title: title, sub: sub, score: score)
        case let .allDone(streak, moves, score):
            ReceiptRow(disc: .all, title: "All done today",
                       sub: "streak \(streak) · moves \(moves) of \(moves)", score: score)
        case let .failed(message, _):
            let parts = message.components(separatedBy: " · ")
            ReceiptRow(disc: .failed, title: parts[0],
                       sub: parts.dropFirst().joined(separator: " · "), score: nil)
        }
    }
}

private enum Isl {
    static let sub = Color(UIColor(rgb: 0xaeaeb2))
    static let track = Color(UIColor(rgb: 0x2c2c2e))
    static let thumb = Color(UIColor(rgb: 0x1c1c1e))
}

/// `.xrow` and `.xbar`: thumb 44, title and items, ring 34, the 5 bar.
private struct PlateRow: View {
    let state: ReadingState
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(spacing: DesignTokens.s8) {
            HStack(spacing: DesignTokens.s13) {
                thumb
                VStack(alignment: .leading, spacing: 1) {
                    Text(state.title)
                        .font(.grotesk(15, .bold))
                        .foregroundStyle(.white)
                    sub.font(.grotesk(12, .medium))
                }
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                ring
            }
            .frame(height: 44)
            bar
        }
        .padding(.vertical, DesignTokens.s13)
        .padding(.horizontal, DesignTokens.s21)
    }

    private var thumb: some View {
        ZStack {
            Isl.thumb
            if let image = state.thumb {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: state.kind == .voice ? "mic" : state.kind == .text
                      ? "text.alignleft" : "fork.knife")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Hy.lime)
            }
            if !state.done, !reduce { ScanLine() }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.s13, style: .continuous))
    }

    /// The items so far, the newest in lime; the result's line once done.
    private var sub: Text {
        if let result = state.result { return Text(result.sub).foregroundStyle(Isl.sub) }
        guard let newest = state.items.last else { return Text("looking").foregroundStyle(Isl.sub) }
        let before = state.items.dropLast().map { $0 + " · " }.joined()
        return Text(before).foregroundStyle(Isl.sub) + Text(newest).foregroundStyle(Hy.lime)
    }

    private var ring: some View {
        ZStack {
            // r 14 in the 34 box, stroke 3.5 on the path.
            Group {
                Circle().stroke(Isl.track, lineWidth: 3.5)
                Circle()
                    .trim(from: 0, to: state.progress)
                    .stroke(Hy.lime, style: StrokeStyle(lineWidth: 3.5))
                    .rotationEffect(.degrees(-90))
                    .motion(.linear(duration: 0.1), value: state.progress)
            }
            .frame(width: 28, height: 28)
            if !state.done {
                Text("\(Int((state.progress * 100).rounded()))")
                    .font(.grotesk(10, .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
            }
            OkDisc(colour: Hy.green, mark: .white, size: 34)
                .scaleEffect(state.done ? 1 : 0)
                .motion(Curve.ispring.animation(0.52), value: state.done)
        }
        .frame(width: 34, height: 34)
    }

    private var bar: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Isl.track)
                Capsule().fill(state.done ? Hy.green : Hy.lime)
                    .frame(width: g.size.width * state.progress)
                    .motion(.linear(duration: 0.1), value: state.progress)
            }
        }
        .frame(height: 5)
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

/// `.thumb::after`: a lime band sweeping down the thumb every 1 300 ms.
private struct ScanLine: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var down = false

    var body: some View {
        LinearGradient(colors: [.clear, Hy.lime.opacity(0.75), .clear],
                       startPoint: .top, endPoint: .bottom)
            .frame(height: 13)
            .offset(y: down ? 44 : -13)
            .frame(width: 44, height: 44, alignment: .top)
            .onAppear {
                // Drawn only without Reduce Motion; the helper holds the line anyway.
                Motion.animate(.easeInOut(duration: 1.3).repeatForever(autoreverses: false),
                               reduce: reduce) {
                    down = true
                }
            }
    }
}

/// `.xrc`: disc 34, title and sub, the score 34/600 in lime.
private struct ReceiptRow: View {
    enum Disc { case ok, all, failed }

    let disc: Disc
    let title: String
    let sub: String
    let score: Int?

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var shown = false

    var body: some View {
        HStack(spacing: DesignTokens.s13) {
            Group {
                switch disc {
                case .ok: OkDisc(colour: Hy.green, mark: .white, size: 34)
                case .all: OkDisc(colour: Hy.lime, mark: Hy.plum, size: 34)
                case .failed:
                    ZStack {
                        Circle().fill(Hy.rose)
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 34, height: 34)
                }
            }
            // Reduce Motion: the disc fades in at full size, no pop.
            .scaleEffect(shown || reduce ? 1 : 0)
            .opacity(shown ? 1 : 0)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.grotesk(15, .bold))
                    .foregroundStyle(.white)
                if !sub.isEmpty {
                    Text(sub)
                        .font(.grotesk(12, .medium))
                        .foregroundStyle(Isl.sub)
                }
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            if let score {
                Text("\(score)")
                    .font(.grotesk(34, .semibold))
                    .tracking(-0.04 * 34)
                    .foregroundStyle(Hy.lime)
                    .monospacedDigit()
            }
        }
        .padding(.leading, DesignTokens.s13)
        .padding(.trailing, DesignTokens.s21)
        .frame(maxHeight: .infinity)
        .onAppear {
            // `.xrc .ok`: in after 240 ms on the island's spring.
            Motion.animate(Curve.ispring.animation(0.52).delay(0.24), reduce: reduce) {
                shown = true
            }
        }
    }
}

/// A filled disc with the check, 18 wide, stroke 3.
private struct OkDisc: View {
    let colour: Color
    let mark: Color
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(colour)
            CheckMark()
                .stroke(mark, style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                .frame(width: 18, height: 18)
        }
        .frame(width: size, height: size)
    }
}
