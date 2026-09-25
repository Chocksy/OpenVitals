import SwiftUI

// Do now: the pips, the Focus button, the queue as a fanned stack, the drag
// with its stamps, and the ticked card's flight to the score.
// Reference: "Do now".

// MARK: - what the shelf asks of the screen

/// The two things the Do shelf cannot do inside itself: fly a card over the
/// header, and open Focus over everything. `HybridTodayView` sets them.
struct DoActions {
    /// Tick this row and fly its card from the stack, starting in `pose`
    /// (the drag's `dx, dy` at release).
    var fly: (Api.PlanDay.Row, CGSize) -> Void = { _, _ in }
    var focus: () -> Void = {}
}

private struct DoActionsKey: EnvironmentKey {
    static let defaultValue = DoActions()
}

extension EnvironmentValues {
    var doActions: DoActions {
        get { self[DoActionsKey.self] }
        set { self[DoActionsKey.self] = newValue }
    }
}

/// The frames the flight and Focus need, as anchors: the stack and the score
/// number. Resolved in one full-screen reader over Today (the spec's
/// `"today"` space).
enum TodaySpot: Hashable { case stack, score }

struct TodayAnchors: PreferenceKey {
    static let defaultValue: [TodaySpot: Anchor<CGRect>] = [:]
    static func reduce(value: inout [TodaySpot: Anchor<CGRect>],
                       nextValue: () -> [TodaySpot: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

// MARK: - the shelf

struct DoShelf: View {
    let model: TodayModel
    @Environment(\.doActions) private var act

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            HStack(spacing: DesignTokens.s8) {
                Text("Do now")
                    .hType(17, .semibold, Hy.ink, tracking: -0.02)
                    .fixedSize()
                Pips(rows: model.doRows) { row in
                    if row.done { model.untick(row) } else { act.fly(row, .zero) }
                }
                Spacer(minLength: 0)
                if !model.nothingPlanned {
                    FocusButton(left: model.queue.count, action: act.focus)
                }
            }
            .padding(.horizontal, DesignTokens.s21)
            DoStack(queue: model.queue, total: model.doRows.count,
                    tick: { act.fly($0, $1) }, later: model.sendLater)
        }
    }
}

/// One 21 circle per tickable row; done is green with a check that draws
/// itself. A tap ticks (the card flies) or, on a done pip, unticks. The hit
/// area is 44 tall around the 21.
private struct Pips: View {
    let rows: [Api.PlanDay.Row]
    let tap: (Api.PlanDay.Row) -> Void

    var body: some View {
        HStack(spacing: DesignTokens.s5) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                Pip(done: row.done) { tap(row) }
                    .accessibilityLabel(row.title)
                    .accessibilityValue(row.done ? "done" : "not done")
            }
        }
    }
}

private struct Pip: View {
    let done: Bool
    let tap: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var pop = false

    var body: some View {
        Button {
            Motion.animate(Curve.spring.animation(0.42), reduce: reduce) { pop = true }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(300))
                Motion.animate(Curve.spring.animation(0.42), reduce: reduce) { pop = false }
            }
            tap()
        } label: {
            Check(done: done, colour: done ? Hy.green : Hy.paper3, size: 21, glyph: 11,
                  line: 3)
                .scaleEffect(pop ? 1.3 : 1)
                .frame(width: 21, height: 21)
                .contentShape(Rectangle().inset(by: -11.5))
        }
        .buttonStyle(.plain)
    }
}

/// A ring that fills green, with the prototype's check drawing in over
/// 420 ms after 120 ms (`stroke-dashoffset 22.6 → 0`).
struct Check: View {
    let done: Bool
    var colour: Color
    let size: CGFloat
    let glyph: CGFloat
    var line: CGFloat = 2.4
    var dashed = false

    var body: some View {
        ZStack {
            Circle().fill(done ? Hy.green : .clear)
            Circle().strokeBorder(colour, style: StrokeStyle(lineWidth: 2,
                                                             dash: dashed ? [4, 3] : []))
            CheckMark()
                .trim(from: 0, to: done ? 1 : 0)
                .stroke(.white, style: StrokeStyle(lineWidth: line, lineCap: .round,
                                                   lineJoin: .round))
                .frame(width: glyph, height: glyph)
                .motion(Curve.ease.animation(0.42).delay(done ? 0.12 : 0), value: done)
        }
        .frame(width: size, height: size)
        .motion(Curve.ease.animation(0.3), value: done)
    }
}

/// Lucide's `check`, `M20 6 9 17l-5-5` in a 24 box.
struct CheckMark: Shape {
    func path(in r: CGRect) -> Path {
        let k = r.width / 24
        return Path {
            $0.move(to: CGPoint(x: r.minX + 20 * k, y: r.minY + 6 * k))
            $0.addLine(to: CGPoint(x: r.minX + 9 * k, y: r.minY + 17 * k))
            $0.addLine(to: CGPoint(x: r.minX + 4 * k, y: r.minY + 12 * k))
        }
    }
}

/// `.fbtn`: plum pill, lime glyph, pressed .94.
private struct FocusButton: View {
    let left: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: DesignTokens.s5) {
                Image(systemName: "viewfinder")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Hy.lime)
                    .frame(width: 15, height: 15)
                Text("Focus · " + (left > 0 ? "\(left) left" : "done"))
                    .hType(13, .semibold, Hy.cream)
                    .lineLimit(1)
                    .fixedSize()
                    .contentTransition(.numericText())
            }
            .padding(.vertical, DesignTokens.s5)
            .padding(.leading, DesignTokens.s8)
            .padding(.trailing, DesignTokens.s13)
            .background(Capsule().fill(Hy.plum)
                .shadow(color: Hy.plum.opacity(0.6), radius: 5, x: 0, y: 6))
        }
        .buttonStyle(Pressed(scale: 0.94))
    }
}

/// `button:active { scale(s) }` on the spring, 300 ms: .94 on the Focus
/// pill, .9 on the meal sheet's buttons.
struct Pressed: ButtonStyle {
    let scale: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .motion(Curve.spring.animation(0.3), value: configuration.isPressed)
    }
}

/// How far a card goes before it counts, in the Do stack and in Focus: past
/// it a drag ticks (right) or sends to the back (left), the stamp is full,
/// and the `.selection` haptic fires.
enum Swipe {
    static let threshold: CGFloat = 89
}

// MARK: - the stack

/// The queue, fanned by depth; the empty card when none. The top card drags:
/// right past 89 ticks and flies, left past 89 goes to the back.
struct DoStack: View {
    let queue: [Api.PlanDay.Row]
    /// Every tickable row, done or not.
    let total: Int
    var tick: (Api.PlanDay.Row, CGSize) -> Void = { _, _ in }
    var later: (Api.PlanDay.Row) -> Void = { _ in }

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var drag: CGSize = .zero
    /// Nil until the drag picks a direction; false once it reads as a scroll.
    @State private var sideways: Bool?
    /// The card on its way out to the left, before it joins the back.
    @State private var leaving: String?
    @State private var laters = 0

    /// `(dx, dy, degrees, scale)` for depth 0, 1 and 2+.
    static func fan(_ depth: Int) -> (CGFloat, CGFloat, Double, CGFloat) {
        switch depth {
        case 0: return (0, 0, 0, 1)
        case 1: return (8, 8, 2.5, 0.96)
        default: return (-5, 13, -2, 0.92)
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            EmptyCard(total: total)
                .opacity(queue.isEmpty ? 1 : 0)
                .scaleEffect(queue.isEmpty ? 1 : 0.9)
                .motion(Curve.spring.animation(0.56), value: queue.isEmpty)
            ForEach(Array(queue.enumerated()), id: \.element.id) { d, row in
                card(row, depth: d)
            }
        }
        .frame(height: 126, alignment: .top)
        .anchorPreference(key: TodayAnchors.self, value: .bounds) { [.stack: $0] }
        .padding(.horizontal, DesignTokens.s21)
        .sensoryFeedback(.selection, trigger: abs(drag.width) > Swipe.threshold) { _, new in new }
        .sensoryFeedback(.impact(weight: .light), trigger: laters)
    }

    private func card(_ row: Api.PlanDay.Row, depth d: Int) -> some View {
        let top = d == 0
        let out = leaving == row.id
        return posed(row, depth: d, out: out)
            .zIndex(Double(10 - d))
            .motion(Curve.spring.animation(0.56), value: d)
            .allowsHitTesting(top && leaving == nil)
            .accessibilityHidden(!top)
            .transition(Self.leave)
            .simultaneousGesture(top ? dragging(row) : nil)
            .accessibilityAction(named: "Done") { tick(row, .zero) }
            .accessibilityAction(named: "Later") { send(row) }
    }

    /// Cards leaving the queue: `y −34, scale .9, opacity 0`.
    private static let leave = AnyTransition.asymmetric(
        insertion: .opacity,
        removal: AnyTransition.opacity
            .combined(with: .scale(scale: 0.9, anchor: .bottom))
            .combined(with: .offset(y: -34)))

    /// The fan pose for its depth, plus the drag on the top card, or the
    /// Later exit.
    private func posed(_ row: Api.PlanDay.Row, depth d: Int, out: Bool) -> some View {
        let (x, y, deg, s) = Self.fan(d)
        let dx: CGFloat = d == 0 ? drag.width : 0
        let dy: CGFloat = d == 0 ? drag.height * 0.3 : 0
        let tilt: Double = reduce ? 0 : (out ? -18 : Double(dx) / 17)
        let ox: CGFloat = x + (out ? -380 : dx)
        let oy: CGFloat = y + (out ? 21 : dy)
        return DoCard(row: row, top: d == 0, stamp: dx)
            .scaleEffect(s, anchor: .bottom)
            .rotationEffect(.degrees(deg + tilt), anchor: .bottom)
            .offset(x: ox, y: oy)
            .opacity(d < 3 ? 1 : 0)
    }

    private func dragging(_ row: Api.PlanDay.Row) -> some Gesture {
        DragGesture(minimumDistance: 5)
            .onChanged { v in
                if sideways == nil {
                    sideways = abs(v.translation.width) >= abs(v.translation.height)
                }
                guard sideways == true else { return }
                var t = Transaction()
                t.disablesAnimations = true
                withTransaction(t) { drag = v.translation }
            }
            .onEnded { v in
                defer { sideways = nil }
                guard sideways == true else { return }
                let dx = v.translation.width
                if dx > Swipe.threshold {
                    let pose = v.translation
                    var t = Transaction()
                    t.disablesAnimations = true
                    withTransaction(t) { drag = .zero }
                    tick(row, pose)
                } else if dx < -Swipe.threshold {
                    send(row)
                } else {
                    Motion.animate(Curve.spring.animation(0.56), reduce: reduce) { drag = .zero }
                }
            }
    }

    /// `later()`: out to `(−380, 21) rotate −18°` over 360 ms, then to the
    /// back of the fan on the card spring.
    private func send(_ row: Api.PlanDay.Row) {
        laters += 1
        Motion.animate(Curve.ease.animation(0.36), reduce: reduce) {
            leaving = row.id
            drag = .zero
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(360))
            Motion.animate(Curve.spring.animation(0.56), reduce: reduce) {
                leaving = nil
                later(row)
            }
        }
    }
}

/// `.dcard`: 110 tall, radius 21, a 55 plum icon, title 21, why 13, and the
/// two stamps the drag shows.
struct DoCard: View {
    let row: Api.PlanDay.Row
    let top: Bool
    /// The drag's `dx`: DONE to the right, LATER to the left, full at 89.
    var stamp: CGFloat = 0

    static func glyph(_ tag: String) -> String {
        switch tag {
        case "protocol": return "pills"
        case "goal": return "target"
        default: return "figure.walk"
        }
    }

    /// The line under the title: the hour, else the slot, else the tag.
    static func sub(_ row: Api.PlanDay.Row) -> String {
        row.time.map { "at \($0)" } ?? row.slot ?? row.tag
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            HStack(alignment: .top, spacing: DesignTokens.s13) {
                ZStack {
                    Circle().fill(Hy.plum)
                    Image(systemName: Self.glyph(row.tag))
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(Hy.cream)
                    if top { Pulse() }
                }
                .frame(width: 55, height: 55)
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.title)
                        .hType(21, .semibold, Hy.ink, tracking: -0.02)
                        .lineLimit(1)
                    Text(Self.sub(row))
                        .hType(13, .regular, Hy.ink2)
                        .lineLimit(1)
                }
            }
            HStack {
                Text("← later").foregroundStyle(Hy.rose)
                Spacer(minLength: DesignTokens.s5)
                Text("for \(row.why)")
                    .textCase(nil)
                    .hType(11, .medium, Hy.ink2, tracking: 0.02)
                    .lineLimit(1)
                    .padding(.vertical, 3)
                    .padding(.horizontal, DesignTokens.s8)
                    .background(Capsule().fill(Hy.paper))
                Spacer(minLength: DesignTokens.s5)
                Text("done →").foregroundStyle(Hy.green)
            }
            .textCase(.uppercase)
            .font(.grotesk(11, .semibold))
            .tracking(1.1)
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .frame(height: 110, alignment: .top)
        .overlay(alignment: .topTrailing) {
            ZStack(alignment: .topTrailing) {
                Stamp(text: "DONE", colour: Hy.green, degrees: -12)
                    .opacity(stamp > 0 ? min(1, stamp / Swipe.threshold) : 0)
                Stamp(text: "LATER", colour: Hy.rose, degrees: 12)
                    .opacity(stamp < 0 ? min(1, -stamp / Swipe.threshold) : 0)
            }
            .padding(.top, DesignTokens.s21)
            .padding(.trailing, DesignTokens.s21)
            .allowsHitTesting(false)
        }
        .grained(Hy.card, radius: 21, shadow: 0.35)
        .accessibilityElement(children: .combine)
    }
}

/// `.stamp`: 21/700, .12em, a 3 border, radius 8, card at 86 % behind.
struct Stamp: View {
    let text: String
    let colour: Color
    let degrees: Double
    var size: CGFloat = 21
    var fill: Color? = Hy.card.opacity(0.86)

    var body: some View {
        Text(text)
            .hType(size, .bold, colour, tracking: 0.12)
            .padding(.horizontal, fill == nil ? DesignTokens.s13 : DesignTokens.s8)
            .padding(.vertical, fill == nil ? DesignTokens.s3 : 0)
            .background(RoundedRectangle(cornerRadius: 8).fill(fill ?? .clear))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(colour, lineWidth: 3))
            .rotationEffect(.degrees(degrees))
            .fixedSize()
    }
}

/// `.ic::after`: a ring going .9 → 1.3 and .5 → 0 over 2.1 s, repeating.
/// `inset` is where the ring starts: −5 round the Do icon, 8 in Focus.
struct Pulse: View {
    var inset: CGFloat = -5
    var colour: Color = Hy.plum
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(paused: reduce)) { ctx in
            let p = reduce ? 1 : Curve.ease.unit.value(
                at: ctx.date.timeIntervalSince(start).truncatingRemainder(dividingBy: 2.1) / 2.1)
            Circle()
                .strokeBorder(colour, lineWidth: 2)
                .padding(inset)
                .scaleEffect(0.9 + 0.4 * p)
                .opacity(0.5 * (1 - p))
        }
        .allowsHitTesting(false)
    }
}

private struct EmptyCard: View {
    let total: Int

    var body: some View {
        VStack(spacing: 0) {
            if total == 0 {
                Text("Nothing planned today").hType(21, .semibold)
                Text("Adopt a move on Plan and it lands here.")
                    .hType(13, .regular, Hy.ink2)
            } else {
                Text("Day complete").hType(21, .semibold)
                Text("All \(total) done. The score has them.")
                    .hType(13, .regular, Hy.ink2)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .frame(height: 110)
        .grained(Hy.card, radius: 21, shadow: 0.35)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - the flight

/// A ticked card on its way to the score: a copy of the card from the stack
/// rectangle, in the release pose, to the number's centre. 560 ms on the
/// `fly` curve to `rotate −8° scale .08`; opacity to .25 on `ease`. Reduce
/// Motion: it stays where it is and fades.
struct FlyingCard: View {
    let row: Api.PlanDay.Row
    /// The stack, in the reader's space.
    let from: CGRect
    /// The score number's centre, in the same space.
    let to: CGPoint
    let pose: CGSize

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var flown = false
    @State private var faded = false

    var body: some View {
        // `tx = num.cx − stack.cx`, `ty = num.cy − (stack.y + 55)`
        let tx = to.x - from.midX
        let ty = to.y - (from.minY + 55)
        DoCard(row: row, top: false, stamp: Swipe.threshold)
            .frame(width: from.width, height: 110)
            .scaleEffect(flown ? 0.08 : 1)
            .rotationEffect(.degrees(flown ? -8 : reduce ? 0 : Double(pose.width) / 17))
            .offset(x: flown ? tx : pose.width, y: flown ? ty : pose.height * 0.3)
            .opacity(reduce ? (faded ? 0 : 1) : (faded ? 0.25 : 1))
            .position(x: from.midX, y: from.minY + 55)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                if reduce {
                    Motion.animate(Motion.reduced, reduce: reduce) { faded = true }
                    return
                }
                Motion.animate(Curve.fly.animation(0.56), reduce: reduce) { flown = true }
                Motion.animate(Curve.ease.animation(0.56), reduce: reduce) { faded = true }
            }
    }
}
