import SwiftUI

// Focus: Deck II's table, full screen, opened out of the Do stack's own
// rectangle and closed back into it. Big cream cards, swipe right to tick,
// left to skip; a chip per move; confetti when the pile is gone.
// Reference: "Focus mode".

struct FocusDeck: View {
    let model: TodayModel
    /// The Do stack, in the full-screen space this deck is drawn in.
    let from: CGRect
    let size: CGSize
    let safeTop: CGFloat
    /// Open with no animation: the `-OVFocus` screenshot.
    var instant = false
    /// Set false by the screen to close; `closed` runs once the clip is shut.
    let open: Bool
    let closed: () -> Void
    let close: () -> Void
    let celebrate: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var on = false
    @State private var dealt = false
    @State private var drag: CGSize = .zero
    @State private var exits: [Exit] = []

    struct Exit: Identifiable {
        let id = UUID()
        let row: Api.PlanDay.Row
        let dir: CGFloat
        let pose: CGSize
    }

    private var pile: [Api.PlanDay.Row] { model.focusPile }
    private var full: CGRect { CGRect(origin: .zero, size: size) }

    var body: some View {
        ZStack(alignment: .top) {
            FocusBackground(running: on && !reduce)
            inner
                .scaleEffect(on ? 1 : 0.8,
                             anchor: UnitPoint(x: from.midX / max(1, size.width),
                                               y: from.midY / max(1, size.height)))
                .motion(Curve.spring.animation(0.56), value: on)
                .opacity(on ? 1 : 0)
                .motion(Curve.ease.animation(0.28), value: on)
        }
        .frame(width: size.width, height: size.height)
        .clipShape(Aperture(rect: on ? full : from, radius: on ? 47 : 21))
        .motion(Curve.spring.animation(0.56), value: on)
        .contentShape(Rectangle())
        .sensoryFeedback(.selection, trigger: abs(drag.width) > Swipe.threshold) { _, new in new }
        // Focus settles once, at the close, so a tick in here buzzes when the
        // server has it: a write that fails never plays `.success`.
        .sensoryFeedback(.success, trigger: model.confirmed)
        .onAppear {
            if instant {
                on = true
                dealt = true
            } else {
                on = true
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(20))
                    dealt = true
                }
            }
            if instant, Fixtures.focus {
                // The prototype's phone 2: the top card caught mid-swipe.
                drag = CGSize(width: 118, height: 21)
            }
        }
        .onChange(of: open) { _, now in
            guard !now else { return }
            on = false
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(reduce ? 200 : 560))
                closed()
            }
        }
        .accessibilityAddTraits(.isModal)
    }

    // MARK: the layer that scales in

    private var inner: some View {
        VStack(spacing: 0) {
            topRow.padding(.top, DesignTokens.s8)
            table
                .frame(height: 521)
                .padding(.top, DesignTokens.s13)
            note.padding(.top, DesignTokens.s13)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, DesignTokens.s21)
        .padding(.top, safeTop)
        .frame(width: size.width, height: size.height, alignment: .top)
    }

    private var topRow: some View {
        HStack(spacing: DesignTokens.s13) {
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Hy.cream)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Hy.cream.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Back to home")
            VStack(alignment: .leading, spacing: 0) {
                Text("Focus").hType(21, .semibold, Hy.cream, tracking: -0.02)
                Text(pile.isEmpty
                     ? "\(model.movesDone) of \(model.doRows.count) ticked"
                     : "\(pile.count) left · swipe right to tick, left to skip")
                    .hType(13, .regular, Hy.mist)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 0) {
                Text(model.result?.score.map(String.init) ?? "—")
                    .hType(34, .semibold, Hy.cream, tracking: -0.04)
                    .contentTransition(.numericText(value: Double(model.result?.score ?? 0)))
                    // `countTo(…, 700)`, ease-out cubic.
                    .motion(.timingCurve(0.33, 1, 0.68, 1, duration: 0.7),
                            value: model.result?.score)
                Text("score").hType(11, .regular, Hy.mist)
            }
        }
    }

    @ViewBuilder
    private var note: some View {
        if !pile.isEmpty, let all = model.allDone {
            (Text("Tick \(pile.count == 1 ? "this one" : "all \(pile.count)") and today lands on ")
                + Text("\(all)").font(.grotesk(13, .semibold)).foregroundColor(Hy.cream)
                + Text("."))
                .hType(13, .regular, Hy.mist)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: the table

    private var table: some View {
        TableFloat(running: on && !reduce) {
            ZStack(alignment: .top) {
                FocusEmpty(model: model, back: close, chip: chip)
                    .opacity(pile.isEmpty && exits.isEmpty ? 1 : 0)
                    .animation(Motion.animation(Curve.ease.animation(0.6).delay(0.2),
                                                reduce: reduce),
                               value: pile.isEmpty && exits.isEmpty)
                    .allowsHitTesting(pile.isEmpty)
                ForEach(Array(pile.enumerated()), id: \.element.id) { d, row in
                    card(row, depth: d)
                }
                ForEach(exits) { exit in
                    ExitCard(exit: exit, model: model)
                        .zIndex(20)
                }
            }
        }
    }

    private func card(_ row: Api.PlanDay.Row, depth d: Int) -> some View {
        let top = d == 0
        let dx = top ? drag.width : 0
        let dy = top ? drag.height * 0.3 : 0
        return FocusCard(model: model, row: row, stamp: dx,
                         tick: { fly(+1) }, chip: chip)
            .colorMultiply(d > 0 ? Color(white: 0.86) : .white)
            .saturation(d > 0 ? 0.8 : 1)
            .animation(Motion.animation(Curve.ease.animation(0.36), reduce: reduce), value: d)
            .rotationEffect(.degrees(reduce ? 0 : Double(dx) / 17), anchor: .top)
            .offset(x: dx, y: dy)
            .scaleEffect(dealt ? 1 - 0.05 * CGFloat(d) : 0.85, anchor: .top)
            .offset(y: dealt ? -13 * CGFloat(d) : -34)
            .opacity(dealt && d < 3 ? 1 : 0)
            .motion(Curve.spring.animation(0.48), value: d)
            .motion(Curve.spring.animation(0.48), value: dealt)
            .padding(.top, DesignTokens.s21)
            .zIndex(Double(10 - d))
            .allowsHitTesting(top && exits.isEmpty)
            .accessibilityHidden(!top)
            .gesture(top ? swipe : nil)
            .accessibilityAction(named: "Tick") { fly(+1) }
            .accessibilityAction(named: "Skip") { fly(-1) }
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 5)
            .onChanged { v in
                guard exits.isEmpty else { return }
                var t = Transaction()
                t.disablesAnimations = true
                withTransaction(t) { drag = v.translation }
            }
            .onEnded { v in
                guard exits.isEmpty else { return }
                if abs(v.translation.width) > Swipe.threshold {
                    fly(v.translation.width > 0 ? 1 : -1)
                } else {
                    Motion.animate(Curve.spring.animation(0.48), reduce: reduce) { drag = .zero }
                }
            }
    }

    /// `ffly`: the top card leaves `(dir × 480, 55) rotate dir × 28°` over
    /// 420 ms; the model moves at once, so the next card rises under it.
    private func fly(_ dir: CGFloat) {
        guard exits.isEmpty, let row = pile.first else { return }
        let had = pile.count
        exits.append(Exit(row: row, dir: dir, pose: drag))
        var t = Transaction()
        t.disablesAnimations = true
        withTransaction(t) { drag = .zero }
        Motion.animate(Curve.spring.animation(0.48), reduce: reduce) {
            if dir > 0 { model.tick(row, hold: false) } else { model.skip(row) }
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(420))
            exits.removeAll()
            if had > 0, model.focusPile.isEmpty { celebrate() }
        }
    }

    /// A chip ticks an open move or unticks a done one; a skipped move comes
    /// back ticked. The chips on a card and on the empty table both land here.
    private func chip(_ row: Api.PlanDay.Row) {
        Motion.animate(Curve.spring.animation(0.48), reduce: reduce) {
            if row.done {
                model.untick(row, settles: false)
            } else {
                model.tick(row, hold: false)
            }
        }
    }
}

// MARK: - pieces

/// The clip: `inset(… round r)` from the stack's rectangle to the screen.
struct Aperture: Shape {
    var rect: CGRect
    var radius: CGFloat

    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>,
                                       AnimatablePair<AnimatablePair<CGFloat, CGFloat>, CGFloat>> {
        get {
            AnimatablePair(AnimatablePair(rect.minX, rect.minY),
                           AnimatablePair(AnimatablePair(rect.width, rect.height), radius))
        }
        set {
            rect = CGRect(x: newValue.first.first, y: newValue.first.second,
                          width: newValue.second.first.first,
                          height: newValue.second.first.second)
            radius = newValue.second.second
        }
    }

    func path(in _: CGRect) -> Path {
        Path(roundedRect: rect, cornerRadius: max(0, radius), style: .continuous)
    }
}

/// Plum with two fixed glows and two that drift, 21 s and 34 s, back and
/// forth between `(−34, −21) scale .92` and `(144, 89) scale 1.12`.
private struct FocusBackground: View {
    let running: Bool
    @State private var start = Date()

    var body: some View {
        GeometryReader { g in
            let W = g.size.width, H = g.size.height
            ZStack(alignment: .topLeading) {
                Hy.plum
                // `radial-gradient(80% 45% at 50% 62%, #53225e, transparent 70%)`
                EllipticalGradient(colors: [Color(UIColor(rgb: 0x53225e)), .clear],
                                   center: .center, endRadiusFraction: 0.7)
                    .frame(width: W * 1.6, height: H * 0.9)
                    .position(x: W * 0.5, y: H * 0.62)
                // `radial-gradient(60% 30% at 90% 100%, #4a1a3a, transparent 70%)`
                EllipticalGradient(colors: [Color(UIColor(rgb: 0x4a1a3a)), .clear],
                                   center: .center, endRadiusFraction: 0.7)
                    .frame(width: W * 1.2, height: H * 0.6)
                    .position(x: W * 0.9, y: H)
                TimelineView(.animation(paused: !running)) { ctx in
                    let t = ctx.date.timeIntervalSince(start)
                    ZStack(alignment: .topLeading) {
                        glow(RadialGradient(stops: [
                                .init(color: Color(red: 214 / 255, green: 150 / 255, blue: 226 / 255).opacity(0.22), location: 0),
                                .init(color: Color(red: 214 / 255, green: 150 / 255, blue: 226 / 255).opacity(0.06), location: 0.55),
                                .init(color: .clear, location: 1)],
                                            center: .center, startRadius: 0, endRadius: 260),
                             side: 520, at: CGPoint(x: -140, y: 260),
                             k: Self.drift(t, period: 21, reverse: false))
                        glow(RadialGradient(colors: [Color(red: 228 / 255, green: 114 / 255, blue: 47 / 255).opacity(0.13), .clear],
                                            center: .center, startRadius: 0, endRadius: 190),
                             side: 380, at: CGPoint(x: 120, y: 520),
                             k: Self.drift(t, period: 34, reverse: true))
                    }
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private func glow(_ fill: RadialGradient, side: CGFloat, at: CGPoint, k: CGFloat) -> some View {
        Circle().fill(fill)
            .frame(width: side, height: side)
            .scaleEffect(0.92 + 0.2 * k)
            .offset(x: at.x - 34 + 178 * k, y: at.y - 21 + 110 * k)
    }

    /// `ease-in-out infinite alternate`: 0 → 1 → 0, eased each way.
    static func drift(_ t: TimeInterval, period: Double, reverse: Bool) -> CGFloat {
        let cycle = (t / period).truncatingRemainder(dividingBy: 2)
        var p = cycle < 1 ? cycle : 2 - cycle
        if reverse { p = 1 - p }
        return UnitCurve.easeInOut.value(at: p)
    }
}

/// `.float`: the table idles over 5.5 s, up 3 and a quarter degree at the
/// middle.
private struct TableFloat<Content: View>: View {
    let running: Bool
    @ViewBuilder let content: Content
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(paused: !running)) { ctx in
            let p = running
                ? ctx.date.timeIntervalSince(start).truncatingRemainder(dividingBy: 5.5) / 5.5 : 0
            let k = UnitCurve.easeInOut.value(at: p < 0.5 ? p * 2 : 2 - p * 2)
            content
                .rotationEffect(.degrees(0.25 * k))
                .offset(y: -3 * k)
        }
    }
}

/// `.fcard`: 500 tall, radius 34, cream with grain, padding 21.
private struct FocusCard: View {
    let model: TodayModel
    let row: Api.PlanDay.Row
    var stamp: CGFloat = 0
    let tick: () -> Void
    let chip: (Api.PlanDay.Row) -> Void

    private var index: Int { (model.doRows.firstIndex { $0.itemId == row.itemId } ?? 0) + 1 }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Move \(index) of \(model.doRows.count)")
                    .textCase(.uppercase)
                    .hType(11, .medium, Hy.ink2, tracking: 0.14)
                Spacer()
                Image(systemName: DoCard.glyph(row.tag))
                    .font(.system(size: 13))
                    .foregroundStyle(Hy.ink2)
                    .frame(width: 15, height: 15)
            }
            Button(action: tick) {
                ZStack {
                    Circle().strokeBorder(Hy.paper3, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                    Circle().fill(Hy.ink).padding(8)
                        .shadow(color: Hy.plum.opacity(0.5), radius: 8, x: 0, y: 10)
                    Pulse(inset: 8, colour: Hy.ink)
                    Image(systemName: DoCard.glyph(row.tag))
                        .font(.system(size: 40, weight: .light))
                        .foregroundStyle(Hy.cream)
                }
                .frame(width: 144, height: 144)
            }
            .buttonStyle(.plain)
            .padding(.top, DesignTokens.s34)
            .accessibilityLabel("Tick \(row.title)")
            Text(row.title)
                .hType(34, .semibold, Hy.ink, tracking: -0.04)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .padding(.top, DesignTokens.s21)
            (Text(DoCard.sub(row)) + Text("\nfor ") + Text(row.why).foregroundColor(Hy.ink))
                .hType(13, .regular, Hy.ink2)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .padding(.top, DesignTokens.s8)
            Spacer(minLength: DesignTokens.s8)
            HStack {
                Text("← skip").foregroundStyle(Hy.rose)
                Spacer()
                Text("+\(model.gain ?? 0) to the score")
                    .font(.grotesk(11, .medium))
                    .tracking(0.44)
                    .textCase(nil)
                    .foregroundStyle(Hy.ink3)
                Spacer()
                Text("tick →").foregroundStyle(Hy.green)
            }
            .textCase(.uppercase)
            .font(.grotesk(11, .semibold))
            .tracking(1.54)
            Chips(model: model, current: row.itemId, dark: false, tap: chip)
                .padding(.top, DesignTokens.s13)
        }
        .padding(DesignTokens.s21)
        .frame(maxWidth: .infinity)
        .frame(height: 500)
        .overlay(alignment: .top) {
            HStack {
                Stamp(text: "TICK", colour: Hy.green, degrees: -14, size: 34, fill: nil)
                    .opacity(stamp > 0 ? min(1, stamp / Swipe.threshold) : 0)
                Spacer()
                Stamp(text: "SKIP", colour: Hy.rose, degrees: 14, size: 34, fill: nil)
                    .opacity(stamp < 0 ? min(1, -stamp / Swipe.threshold) : 0)
            }
            .padding(.horizontal, DesignTokens.s21)
            .padding(.top, 89)
            .allowsHitTesting(false)
        }
        .background {
            let shape = RoundedRectangle(cornerRadius: 34, style: .continuous)
            ZStack { Hy.cream; GrainTile() }
                .clipShape(shape)
                .background(shape.fill(Hy.cream)
                    .shadow(color: Color(red: 10 / 255, green: 2 / 255, blue: 12 / 255).opacity(0.55),
                            radius: 13, x: 0, y: 18))
        }
    }
}

/// The card that just left, flying off on its own layer.
private struct ExitCard: View {
    let exit: FocusDeck.Exit
    let model: TodayModel
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var gone = false

    var body: some View {
        let dir = exit.dir
        FocusCard(model: model, row: exit.row, stamp: dir * Swipe.threshold,
                  tick: {}, chip: { _ in })
            .rotationEffect(.degrees(reduce ? 0 : gone ? Double(dir) * 28 : Double(exit.pose.width) / 17),
                            anchor: .top)
            .offset(x: gone ? dir * 480 : exit.pose.width, y: gone ? 55 : exit.pose.height * 0.3)
            .opacity(gone ? 0 : 1)
            .padding(.top, DesignTokens.s21)
            .allowsHitTesting(false)
            .onAppear {
                Motion.animate(Curve.ease.animation(0.42), reduce: reduce) { gone = true }
            }
    }
}

/// `.chips`: one 55 column per move, a 34 circle over a short name. Done is
/// green, the card on top has an ink ring, a skipped one a dashed rose ring.
private struct Chips: View {
    let model: TodayModel
    let current: String?
    let dark: Bool
    let tap: (Api.PlanDay.Row) -> Void

    var body: some View {
        HStack(alignment: .top) {
            ForEach(Array(model.doRows.enumerated()), id: \.offset) { i, row in
                if i > 0 { Spacer(minLength: 0) }
                let now = row.itemId == current
                let skip = !row.done && model.skipped.contains(row.itemId ?? "")
                Button { tap(row) } label: {
                    VStack(spacing: DesignTokens.s5) {
                        Check(done: row.done,
                              colour: row.done ? Hy.green
                                  : skip ? Hy.rose
                                  : now ? Hy.ink
                                  : dark ? Hy.cream.opacity(0.3) : Hy.paper3,
                              size: 34, glyph: 17, dashed: skip)
                        Text(Self.short(row.title))
                            .font(.grotesk(11, now ? .semibold : .regular))
                            .foregroundStyle(dark ? Hy.mist : now ? Hy.ink : Hy.ink2)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(width: 66)
                    }
                    .frame(width: 55)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(row.title)
                .accessibilityValue(row.done ? "done" : skip ? "skipped" : "not done")
            }
        }
        .padding(.top, DesignTokens.s13)
        .overlay(alignment: .top) {
            (dark ? Hy.cream.opacity(0.14) : Hy.line).frame(height: 1)
        }
    }

    /// The chip's name: the first two words, as the prototype's `sh`.
    // ponytail: the plan has no short names; the first two words stand in.
    static func short(_ title: String) -> String {
        title.split(separator: " ").prefix(2).joined(separator: " ")
    }
}

/// `.fempty`: the dashed outline, a bobbing disc, "Nothing left to do", the
/// chips, and a lime way home.
private struct FocusEmpty: View {
    let model: TodayModel
    let back: () -> Void
    /// `FocusDeck.chip`, the one tick and untick the card's chips use.
    let chip: (Api.PlanDay.Row) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var start = Date()

    private var line: String {
        let skipped = model.doRows.filter { !$0.done && model.skipped.contains($0.itemId ?? "") }.count
        return "\(model.movesDone) of \(model.doRows.count) ticked"
            + (skipped > 0 ? " · \(skipped) skipped, tap its chip to bring it back"
                : " · the rest is eating and sleeping")
    }

    var body: some View {
        VStack(spacing: 0) {
            TimelineView(.animation(paused: reduce)) { ctx in
                // `bob`: 4.2 s, up 8 and −2° → 2° at the middle.
                let p = reduce ? 0 : ctx.date.timeIntervalSince(start)
                    .truncatingRemainder(dividingBy: 4.2) / 4.2
                let k = UnitCurve.easeInOut.value(at: p < 0.5 ? p * 2 : 2 - p * 2)
                // ponytail: the prototype's disc is a generated plate
                // (img/45-empty.png); a cream disc with a check stands in.
                Circle().fill(Color(UIColor(rgb: 0xf8f3e3)))
                    .overlay {
                        Image(systemName: "checkmark")
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundStyle(Hy.plum)
                    }
                    .frame(width: 144, height: 144)
                    .shadow(color: Color(red: 10 / 255, green: 2 / 255, blue: 12 / 255).opacity(0.6),
                            radius: 13, x: 0, y: 18)
                    .rotationEffect(.degrees(reduce ? 0 : -2 + 4 * k))
                    .offset(y: -8 * k)
            }
            .frame(width: 144, height: 144)
            Text("Nothing left to do")
                .hType(34, .semibold, Hy.cream, tracking: -0.04)
                .padding(.top, DesignTokens.s21)
            Text(line)
                .hType(13, .regular, Hy.mist)
                .multilineTextAlignment(.center)
                .padding(.top, DesignTokens.s8)
            Chips(model: model, current: nil, dark: true, tap: chip)
            .padding(.top, DesignTokens.s21)
            Button(action: back) {
                Text("Back to home")
                    .hType(17, .semibold, Hy.plum)
                    .padding(.horizontal, DesignTokens.s34)
                    .frame(height: 55)
                    .background(Capsule().fill(Hy.lime))
            }
            .buttonStyle(.plain)
            .padding(.top, DesignTokens.s21)
        }
        .padding(.top, DesignTokens.s55)
        .padding(.horizontal, DesignTokens.s21)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .overlay {
            RoundedRectangle(cornerRadius: 34, style: .continuous)
                .strokeBorder(Hy.cream.opacity(0.25), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
        }
        .padding(.top, DesignTokens.s21)
    }
}

// MARK: - confetti

/// 42 pieces from `mulberry32(45)`, thrown up from 50 % / 40 % of the box
/// and falling over 1.8 s on the confetti curve. The host removes it after
/// 2.2 s. Never drawn under Reduce Motion.
struct Confetti: View {
    let start: Date

    struct Piece: Equatable {
        let colour: Int
        let dx: Double
        let dy: Double
        let rot: Double
        let delay: Double
        let width: Double
    }

    static let colours: [UInt32] = [0xf6eddc, 0xecdfc8, 0xe0d0b4, 0xfff8ea, 0xcdb8d2, 0xd6f34a]

    /// In the prototype's draw order: dx, dy, rot, delay, width, each
    /// rounded as its `toFixed(0)` does.
    static let pieces: [Piece] = {
        var r = Mulberry32(45)
        return (0..<42).map { i in
            let dx = ((r.next() - 0.5) * 340).rounded()
            let dy = (-89 - r.next() * 233).rounded()
            let rot = ((r.next() - 0.5) * 900).rounded()
            let delay = (r.next() * 180).rounded() / 1000
            let width = 5 + Double(Score.round(r.next() * 5))
            return Piece(colour: i % colours.count, dx: dx, dy: dy, rot: rot,
                         delay: delay, width: width)
        }
    }()

    /// Where one piece is `t` seconds in: `(x, y, degrees, scale, opacity)`.
    /// The keyframes 0 %, 30 %, 100 % each run the curve on their own
    /// stretch, as CSS does.
    static func state(_ p: Piece, at t: Double) -> (Double, Double, Double, Double, Double) {
        let k = (t - p.delay) / 1.8
        guard k >= 0 else { return (0, 0, 0, 0.6, 0) }
        let curve = Curve.confetti.unit
        if k < 0.3 {
            let e = curve.value(at: k / 0.3)
            return (p.dx * 0.6 * e, p.dy * e, p.rot * 0.4 * e, 0.6 + 0.4 * e, 1)
        }
        let e = curve.value(at: min(1, (k - 0.3) / 0.7))
        return (p.dx * 0.6 + p.dx * 0.4 * e, p.dy + 460 * e,
                p.rot * 0.4 + p.rot * 0.6 * e, 1, k >= 1 ? 0 : 1 - e)
    }

    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSince(start)
            Canvas { g, size in
                let origin = CGPoint(x: size.width * 0.5, y: size.height * 0.4)
                for p in Self.pieces {
                    let (x, y, deg, s, o) = Self.state(p, at: t)
                    guard o > 0 else { continue }
                    var c = g
                    c.opacity = o
                    // The piece's corner sits on the origin and it turns
                    // round its own centre.
                    c.translateBy(x: origin.x + x + p.width / 2, y: origin.y + y + 6.5)
                    c.rotate(by: .degrees(deg))
                    c.scaleBy(x: s, y: s)
                    let rect = CGRect(x: -p.width / 2, y: -6.5, width: p.width, height: 13)
                    c.addFilter(.shadow(color: Color(red: 10 / 255, green: 2 / 255, blue: 12 / 255).opacity(0.3),
                                        radius: 1, x: 0, y: 1))
                    c.fill(Path(roundedRect: rect, cornerRadius: 2),
                           with: .color(Color(UIColor(rgb: Self.colours[p.colour]))))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
