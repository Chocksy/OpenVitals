import AVFoundation
import SwiftUI
import UIKit

// The plum header over Today: the score, the three layers, 21 days, and the
// 13 weeks behind a tap. Never scrolls; no grain. Reference: "Header".

struct ScoreHeader: View {
    let model: TodayModel
    /// The shelves have scrolled past 21: the score drops to 34.
    let tight: Bool
    /// `+N · moves X of N`. Nil hides it; C2 sets it after a tick and clears
    /// it 2 600 ms later.
    var pill: String?
    var avatar: () -> Void = {}

    @Environment(\.islandPush) private var push
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var open = Fixtures.calendar || Fixtures.screen == "heading"
    /// The strip day the why line reads out.
    @State private var picked: String?
    /// The grid day the tooltip is on.
    @State private var tipped: String?
    /// `.hd.catch`: the number takes the card, scale 1.12 for 420 ms.
    @State private var caught = false

    /// Held while a card flies or Focus is open; `settle` lands it.
    private var result: ScoreResult? { model.header }
    /// Bumps each time a settle moves the score: today's cell flashes.
    private var flash: Int { model.landing?.flash == true ? model.landing?.n ?? 0 : 0 }
    private var score: Int? { result?.score }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            rowA
            layers
            strip
            if open {
                grid
                    .padding(.top, DesignTokens.s13)
                    .transition(.opacity)
                if let rows = model.today?.heading, !rows.isEmpty {
                    HeadingBlock(rows: rows, confidence: model.today?.confidence)
                        .padding(.top, DesignTokens.s13)
                        .transition(.opacity)
                }
            }
            why
        }
        .padding(.horizontal, DesignTokens.s21)
        .padding(.top, DesignTokens.s8)
        .padding(.bottom, DesignTokens.s21)
        .padding(.top, push)
        .motion(Curve.ispring.animation(0.62), value: push)
        .background { HeaderBackground() }
        .contentShape(Rectangle())
        .onChange(of: model.landing?.n) {
            Motion.animate(Curve.spring.animation(0.42), reduce: reduce) { caught = true }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(420))
                Motion.animate(Curve.spring.animation(0.42), reduce: reduce) { caught = false }
            }
        }
        .onTapGesture {
            if tipped != nil {
                Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { tipped = nil }
            } else {
                Motion.animate(Curve.ease.animation(0.52), reduce: reduce) {
                    open.toggle()
                    picked = nil
                }
            }
        }
    }

    // MARK: row A

    private var rowA: some View {
        HStack(spacing: DesignTokens.s13) {
            ScoreNumber(size: tight ? 34 : 55, text: score.map(String.init) ?? "—",
                        value: score ?? 0)
                .motion(Curve.spring.animation(0.42), value: tight)
                .scaleEffect(caught ? 1.12 : 1)
                .anchorPreference(key: TodayAnchors.self, value: .bounds) { [.score: $0] }
            VStack(alignment: .leading, spacing: 0) {
                Text("\(DayGrid.date(model.day).map(DayGrid.name) ?? model.day) · score")
                    .textCase(.uppercase)
                    .hType(11, .regular, Hy.mist, tracking: 0.08)
                    .lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if let word = result?.word {
                        Text(word).hType(17, .semibold, Hy.cream, tracking: -0.01)
                        Text("of 100").hType(13, .regular, Hy.mist)
                    } else {
                        Text("no score yet").hType(17, .semibold, Hy.cream, tracking: -0.01)
                    }
                }
                Pill(text: pill)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: avatar) {
                Image(systemName: "person.fill")
                    .font(.system(size: 17))
                    .foregroundStyle(Hy.mist)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(Hy.plum2))
                    .overlay(Circle().strokeBorder(Hy.plum3, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Settings")
        }
    }

    // MARK: layers

    private var layers: some View {
        HStack(spacing: DesignTokens.s13) {
            // The ghost jumps to the new width as the card leaves; the solid
            // fill follows when it lands.
            LayerBar(name: "Lifestyle", value: result?.life, colour: Hy.lifeLt,
                     ghost: model.result?.life)
            LayerBar(name: "Blood", value: result?.blood, colour: Hy.bloodLt)
            LayerBar(name: "Genes", value: result?.genes, colour: Hy.geneLt)
        }
        .padding(.top, DesignTokens.s13)
    }

    // MARK: 21 days

    private var strip: some View {
        HStack(spacing: 3) {
            ForEach(Array(model.strip.enumerated()), id: \.element.id) { i, cell in
                StripCell(cell: cell, picked: picked == cell.day,
                          flash: cell.isToday ? flash : 0)
                    .padding(.leading, i > 0 && cell.weekday == 0 ? 2 : 0)
                    .onTapGesture {
                        Motion.animate(Curve.spring.animation(0.3), reduce: reduce) {
                            picked = picked == cell.day ? nil : cell.day
                        }
                    }
                    .accessibilityLabel(cell.isToday ? "Today" : DayGrid.name(cell.date))
                    .accessibilityValue(cell.score.map(String.init) ?? "no data")
            }
        }
        .frame(height: open ? 0 : 13)
        .opacity(open ? 0 : 1)
        .padding(.top, open ? 0 : DesignTokens.s13)
        .allowsHitTesting(!open)
    }

    // MARK: 13 weeks

    private var grid: some View {
        let cells = model.grid
        return VStack(spacing: 0) {
            CalendarGrid(cells: cells, months: DayGrid.months(cells),
                         tipped: $tipped, flash: flash, tip: tipCard)
            legend.padding(.top, DesignTokens.s8)
        }
        .zIndex(2)
    }

    private var legend: some View {
        HStack(spacing: 3) {
            Text("60")
            ForEach([60, 64, 68, 72, 76], id: \.self) { s in
                RoundedRectangle(cornerRadius: 3).fill(DayColour.of(s))
                    .frame(width: 10, height: 10)
            }
            Text("76")
            Spacer(minLength: DesignTokens.s8)
            RoundedRectangle(cornerRadius: 3).fill(Hy.mist)
                .frame(width: 10, height: 10)
                .overlay(Circle().fill(Hy.plum).padding(3))
            Text("blood draw · tap a day")
        }
        .hType(10, .regular, Hy.mist)
    }

    private func tipCard(_ cell: DayCell) -> some View {
        DayTip(cell: cell, done: model.movesDone, due: model.doRows.count,
               gain: model.gain)
    }

    // MARK: why

    private var why: some View {
        let cell = model.strip.first { $0.day == picked }
        let line = DayGrid.why(open: open, run: model.run, selected: cell, score: score,
                               done: model.movesDone, due: model.doRows.count)
        return HStack(spacing: DesignTokens.s8) {
            Text(line)
                .hType(11, .medium, Hy.cream)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
            HStack(spacing: 3) {
                Text(open ? "13 weeks" : "21 days")
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .rotationEffect(.degrees(open ? 180 : 0))
            }
            .hType(11, .regular, Hy.mist)
        }
        .padding(.top, DesignTokens.s8)
    }
}

// MARK: - pieces

/// Phase 39 I6: where each system is heading on the person's own draws, 12
/// small tiles, and how much the app knows ("Last draw 156 days ago · 11 of
/// 12 systems · 4 open").
struct HeadingBlock: View {
    let rows: [Api.Today.HeadingRow]
    var confidence: Api.Today.Confidence?

    static func look(_ word: String) -> (arrow: String, ink: Color) {
        switch word {
        case "toward": return ("arrow.up.right", Hy.lime)
        case "holding": return ("arrow.right", Hy.mist)
        case "away": return ("arrow.down.right", Hy.rose)
        default: return ("minus", Hy.mist.opacity(0.5))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            Text("HEADING").hType(10, .semibold, Hy.mist, tracking: 0.1)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 4),
                      spacing: 5) {
                ForEach(rows) { row in
                    let look = Self.look(row.word)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(row.name).hType(10, .medium, Hy.mist)
                            .lineLimit(1).minimumScaleFactor(0.6)
                        HStack(spacing: 3) {
                            Image(systemName: look.arrow).font(.system(size: 9, weight: .bold))
                            Text(row.word).lineLimit(1).minimumScaleFactor(0.7)
                        }
                        .hType(11, .semibold, look.ink)
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Hy.plum2.opacity(0.6)))
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(row.why)
                }
            }
            if let confidence {
                Text(confidence.line).hType(11, .medium, Hy.mist).lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }
}

/// The number, its size animated so 55 → 34 is a glide and not a jump.
/// `min-width` keeps the side column still: 68 at 55, 42 at 34.
private struct ScoreNumber: View, Animatable {
    var size: CGFloat
    let text: String
    let value: Int

    var animatableData: CGFloat {
        get { size }
        set { size = newValue }
    }

    var body: some View {
        Text(text)
            .font(.grotesk(size, .semibold))
            .tracking(-0.05 * size)
            .foregroundStyle(Hy.cream)
            .lineLimit(1)
            .fixedSize()
            .frame(minWidth: size * 68 / 55, alignment: .leading)
            .contentTransition(.numericText(value: Double(value)))
            // `countTo(…, 900)` in `settleScore`.
            .motion(Curve.spring.animation(0.9), value: value)
    }
}

/// The lime pill under the word. Shows from y+5 over 360 ms.
private struct Pill: View {
    let text: String?
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var shown: String?

    var body: some View {
        Text(shown ?? " ")
            .hType(11, .semibold, Hy.lime)
            .lineLimit(1)
            .padding(.vertical, 3)
            .padding(.horizontal, DesignTokens.s8)
            .background(Capsule().fill(Hy.lime.opacity(0.16)))
            .opacity(text == nil ? 0 : 1)
            .offset(y: text == nil ? 5 : 0)
            .motion(Curve.ease.animation(0.36), value: text)
            // Keep the old words while the pill fades out.
            .onChange(of: text, initial: true) { _, new in if let new { shown = new } }
            .accessibilityHidden(text == nil)
    }
}

private struct LayerBar: View {
    let name: String
    let value: Int?
    let colour: Color
    /// Lifestyle's dashed ghost: the live value, ahead of the solid fill.
    var ghost: Int??

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            HStack(alignment: .firstTextBaseline) {
                Text(name).hType(11, .regular, Hy.mist)
                Spacer(minLength: 0)
                if let value {
                    Text("\(value)").hType(13, .semibold, Hy.cream)
                        .contentTransition(.numericText(value: Double(value)))
                        .motion(Curve.spring.animation(0.9), value: value)
                } else {
                    Text("no data").hType(11, .regular, Hy.mist)
                }
            }
            GeometryReader { g in
                let w = g.size.width * CGFloat(value ?? 0) / 100
                ZStack(alignment: .leading) {
                    Hy.cream.opacity(0.14)
                    if let ghost {
                        Rectangle()
                            .stroke(colour, style: StrokeStyle(lineWidth: 5, dash: [3, 2]))
                            .frame(width: g.size.width * CGFloat(ghost ?? 0) / 100, height: 0)
                            .opacity(0.8)
                            .motion(Curve.spring.animation(0.9), value: ghost)
                    }
                    RoundedRectangle(cornerRadius: 3).fill(colour).frame(width: w)
                        .motion(Curve.spring.animation(0.9), value: value)
                }
                .clipShape(RoundedRectangle(cornerRadius: 3))
            }
            .frame(height: 5)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

private struct StripCell: View {
    let cell: DayCell
    let picked: Bool
    /// Bumps when a tick lands on today.
    var flash = 0
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(cell.score.map(DayColour.of) ?? .clear)
            .overlay {
                if cell.score == nil {
                    RoundedRectangle(cornerRadius: 3)
                        .strokeBorder(Hy.cream.opacity(0.16), lineWidth: 1)
                }
            }
            .background {
                // `box-shadow: 0 0 0 2px plum, 0 0 0 3px cream`
                if cell.isToday {
                    RoundedRectangle(cornerRadius: 6).fill(Hy.cream).padding(-3)
                    RoundedRectangle(cornerRadius: 5).fill(Hy.plum).padding(-2)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 13)
            .keyframeAnimator(initialValue: 0.0, trigger: reduce ? 0 : flash) { cell, v in
                // `cflash`, drawn to the strip's size: a lime ring twice.
                cell.overlay {
                    RoundedRectangle(cornerRadius: 5).strokeBorder(Hy.lime, lineWidth: 2)
                        .padding(-3 * v).opacity(v)
                }
                .scaleEffect(x: 1, y: 1 + 0.4 * v)
            } keyframes: { _ in
                KeyframeTrack {
                    CubicKeyframe(1, duration: 0.32)
                    CubicKeyframe(0, duration: 0.32)
                    CubicKeyframe(1, duration: 0.32)
                    CubicKeyframe(0, duration: 0.32)
                }
            }
            .scaleEffect(x: 1, y: picked ? 1.4 : 1)
            .zIndex(cell.isToday ? 1 : 0)
            .motion(Curve.ease.animation(0.6), value: cell.score)
            .contentShape(Rectangle())
    }
}

/// The 13 weeks, laid out by `DayGrid.cellRect` so the tooltip and the cells
/// read the same numbers.
private struct CalendarGrid<Tip: View>: View {
    let cells: [DayCell]
    let months: [String]
    @Binding var tipped: String?
    var flash = 0
    let tip: (DayCell) -> Tip
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            ZStack(alignment: .topLeading) {
                ForEach(Array(months.enumerated()), id: \.offset) { k, m in
                    let r = DayGrid.cellRect(week: k, weekday: 0, width: w)
                    Text(m).hType(10, .regular, Hy.mist).opacity(0.7)
                        .fixedSize()
                        .offset(x: r.minX, y: 0)
                }
                ForEach(Array(["M", "", "W", "", "F", "", "S"].enumerated()), id: \.offset) { k, l in
                    let r = DayGrid.cellRect(week: 0, weekday: k, width: w)
                    Text(l).hType(10, .regular, Hy.mist).opacity(0.7)
                        .frame(height: 17)
                        .offset(x: r.minX - DayGrid.labelColumn - DayGrid.gap, y: r.minY)
                }
                ForEach(Array(cells.enumerated()), id: \.element.id) { i, cell in
                    let r = DayGrid.cellRect(index: i, width: w)
                    GridCell(cell: cell, index: i, dim: tipped != nil && tipped != cell.day,
                             on: tipped == cell.day, flash: cell.isToday ? flash : 0)
                        .frame(width: r.width, height: r.height)
                        .offset(x: r.minX, y: r.minY)
                        .zIndex(cell.isToday || tipped == cell.day ? 1 : 0)
                        .onTapGesture {
                            guard !cell.future else { return }
                            Motion.animate(Curve.ease.animation(0.32), reduce: reduce) {
                                tipped = tipped == cell.day ? nil : cell.day
                            }
                        }
                }
                if let i = cells.firstIndex(where: { $0.day == tipped }) {
                    let place = TipPlacement(cell: DayGrid.cellRect(index: i, width: w),
                                             weekday: cells[i].weekday, width: w)
                    TipBubble(place: place) { tip(cells[i]) }
                        .frame(width: w, height: place.above ? place.edgeY : nil,
                               alignment: place.above ? .bottomLeading : .topLeading)
                        .offset(y: place.above ? 0 : place.edgeY)
                        .zIndex(5)
                        .transition(.opacity.combined(with: .offset(y: 5)))
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(height: DayGrid.gridHeight)
    }
}

private struct GridCell: View {
    let cell: DayCell
    let index: Int
    let dim: Bool
    let on: Bool
    var flash = 0
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var shown = false
    @State private var start = Date()
    @State private var flashAt: Date?

    private var colour: Color { cell.score.map(DayColour.of) ?? .clear }

    var body: some View {
        face
            .opacity(shown ? (dim && !cell.future ? 0.28 : 1) : 0)
            .scaleEffect(shown ? 1 : 0.3)
            .onAppear {
                start = Date()
                // `cpop`: 420 ms from scale .3, `i × 5 ms` apart.
                Motion.animate(Curve.ease.animation(0.42).delay(reduce ? 0 : Double(index) * 0.005),
                               reduce: reduce) { shown = true }
            }
            .accessibilityLabel(cell.isToday ? "Today" : DayGrid.name(cell.date))
            .accessibilityValue(cell.score.map(String.init) ?? "no data")
            .onChange(of: flash) { if !reduce { flashAt = Date() } }
    }

    @ViewBuilder
    private var face: some View {
        if cell.isToday {
            TimelineView(.animation(paused: reduce)) { ctx in
                let (beat, spread, fade) = Self.beat(ctx.date.timeIntervalSince(start),
                                                     reduce: reduce)
                let lit = flashAt.map { Self.flash(ctx.date.timeIntervalSince($0)) } ?? 0
                let scale = lit > 0 ? 1.3 + 0.8 * lit : beat
                ZStack {
                    RoundedRectangle(cornerRadius: 6 + 3 * lit)
                        .fill(Hy.lime)
                        .padding(-1.5 - 3 * lit)
                        .opacity(lit)
                    RoundedRectangle(cornerRadius: 5 + spread)
                        .fill(colour)
                        .padding(-spread)
                        .opacity(fade)
                    square
                        .background(RoundedRectangle(cornerRadius: 6).fill(Hy.plum).padding(-1.5))
                    Text(cell.score.map(String.init) ?? "")
                        .font(.grotesk(8, .bold))
                        .foregroundStyle(.white)
                }
                .scaleEffect(scale)
            }
        } else {
            square
                .background {
                    if on {
                        RoundedRectangle(cornerRadius: 8.5).fill(Hy.cream).padding(-3.5)
                        RoundedRectangle(cornerRadius: 7).fill(Hy.plum).padding(-2)
                    }
                }
                .scaleEffect(on ? 1.25 : 1)
        }
    }

    private var square: some View {
        RoundedRectangle(cornerRadius: 5)
            .fill(colour)
            .overlay {
                if cell.score == nil {
                    RoundedRectangle(cornerRadius: 5)
                        .strokeBorder(Hy.cream.opacity(0.16), lineWidth: 1)
                }
                if cell.draw {
                    Circle().fill(Hy.plum).padding(5.5)
                }
            }
    }

    /// `cflash`, 1.6 s: 0 → 1 at 20 % and 60 %, back at 40 % and 80 %,
    /// each stretch on the ease. 1 is scale 2.1 and a 3 lime ring.
    static func flash(_ t: TimeInterval) -> CGFloat {
        let p = t / 1.6
        guard p > 0, p < 0.8 else { return 0 }
        let seg = Int(p / 0.2)
        let k = Curve.ease.unit.value(at: (p - Double(seg) * 0.2) / 0.2)
        return seg % 2 == 0 ? k : 1 - k
    }

    /// Today's idle beat: after 1.4 s, every 2.4 s the cell goes 1.3 → 1.6
    /// at 12 % and back, and a ring grows to 8 and fades out by 70 %.
    static func beat(_ t: TimeInterval, reduce: Bool) -> (CGFloat, CGFloat, Double) {
        let t = t - 1.4
        guard !reduce, t > 0 else { return (1.3, 0, 0) }
        let p = t.truncatingRemainder(dividingBy: 2.4) / 2.4
        let ease = Curve.ease.unit
        let scale = p < 0.12
            ? 1.3 + 0.3 * ease.value(at: p / 0.12)
            : 1.6 - 0.3 * ease.value(at: (p - 0.12) / 0.88)
        let ring = min(1, p / 0.7)
        let k = ease.value(at: ring)
        return (scale, 8 * k, 0.7 * (1 - k))
    }
}

/// The card with its arrow. The arrow sits on the edge that faces the cell.
private struct TipBubble<Content: View>: View {
    let place: TipPlacement
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(DesignTokens.s13)
            .frame(width: TipPlacement.width, alignment: .leading)
            .background(alignment: place.above ? .bottomLeading : .topLeading) {
                ZStack(alignment: place.above ? .bottomLeading : .topLeading) {
                    RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Hy.card)
                    Rectangle().fill(Hy.card)
                        .frame(width: 10, height: 10)
                        .rotationEffect(.degrees(45))
                        .offset(x: place.arrowX - 5, y: place.above ? 5 : -5)
                    GrainTile()
                        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                }
                .shadow(color: Color(red: 10 / 255, green: 2 / 255, blue: 12 / 255).opacity(0.6),
                        radius: 13, x: 0, y: 18)
            }
            .offset(x: place.left)
    }
}

/// What the tooltip says about one day.
private struct DayTip: View {
    let cell: DayCell
    let done: Int
    let due: Int
    let gain: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(DayGrid.name(cell.date) + (cell.isToday ? " · today" : ""))
                .hType(11, .regular, Hy.ink2)
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(cell.score.map(DayColour.of) ?? Hy.paper2)
                    .frame(width: 10, height: 10)
                    .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
                Text(cell.score.map(String.init) ?? "—")
                    .hType(34, .semibold, Hy.ink, tracking: -0.04)
                Text(OpenVitals.Score.word(cell.score) ?? "No data")
                    .hType(13, .semibold, Hy.ink)
            }
            .padding(.top, 2)
            Hy.line.frame(height: 1).padding(.top, DesignTokens.s8)
            HStack(alignment: .top, spacing: DesignTokens.s8) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Top reason")
                        .textCase(.uppercase)
                        .hType(10, .regular, Hy.ink2, tracking: 0.06)
                    Text(reason.text).hType(13, .regular, Hy.ink)
                    if let sub = reason.sub {
                        Text(sub).hType(13, .regular, Hy.ink2)
                    }
                }
                Spacer(minLength: 0)
                if let e = cell.isToday ? nil : cell.reason?.effect {
                    Text("\(e >= 0 ? "+" : "−")\(abs(e))")
                        .hType(13, .bold, e >= 0 ? Hy.green : Hy.rose)
                }
            }
            .padding(.top, DesignTokens.s8)
            Text("Life \(n(cell.life)) · Blood \(n(cell.blood)) · Genes \(n(cell.genes))")
                .hType(11, .regular, Hy.ink2)
                .padding(.top, DesignTokens.s5)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func n(_ v: Int?) -> String { v.map(String.init) ?? "—" }

    private var reason: (text: String, sub: String?) {
        if cell.score == nil { return ("No data", nil) }
        if cell.isToday, due > 0 {
            let next = done < due
                ? gain.map { "tick the next one for +\($0)" } ?? "tick the next one"
                : "all \(due) done"
            return ("Moves \(done) of \(due) ticked", next)
        }
        guard let r = cell.reason else { return ("Nothing stood out", nil) }
        return (r.text, r.sub)
    }
}

// MARK: - the plum

/// The plum under `ScoreHeader` and `HyHeader`: the glow, the clip, the
/// rounded bottom. No grain.
struct HeaderBackground: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var ready = false

    private let shape = UnevenRoundedRectangle(bottomLeadingRadius: 34,
                                               bottomTrailingRadius: 34,
                                               style: .continuous)

    var body: some View {
        ZStack {
            Hy.plum
            // `radial-gradient(70% 90% at 15% 0%, #4d1d58, transparent 70%)`
            GeometryReader { g in
                EllipticalGradient(colors: [Hy.glow, Hy.glow.opacity(0)],
                                   center: UnitPoint(x: 0.15, y: 0),
                                   startRadiusFraction: 0, endRadiusFraction: 0.7)
                    .frame(width: g.size.width * 1.4, height: g.size.height * 1.8)
                    .offset(x: -g.size.width * 0.7 + g.size.width * 0.15,
                            y: -g.size.height * 0.9)
            }
            PlumClip(reduce: reduce) { ready = true }
                .padding(-55)
                .blur(radius: 21)
                .saturation(1.1)
                .blendMode(.screen)
                .opacity(ready ? 0.45 : 0)
                .motion(.timingCurve(0.25, 0.1, 0.25, 1, duration: 1.4), value: ready)
        }
        .compositingGroup()
        .clipShape(shape)
        .background(shape.fill(Hy.plum).hShadow(0.5))
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
}

/// `vid/45-plum.mp4`: muted, once at half speed, resting on its last frame.
/// Under Reduce Motion the first frame, still.
struct PlumClip: UIViewRepresentable {
    let reduce: Bool
    /// The first frame is on screen: start the fade.
    var onReady: () -> Void = {}

    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
        var watch: NSKeyValueObservation?
    }

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        guard let url = Bundle.main.url(forResource: "45-plum", withExtension: "mp4")
        else { return view }
        let player = AVPlayer(url: url)
        player.isMuted = true
        player.actionAtItemEnd = .pause
        player.preventsDisplaySleepDuringVideoPlayback = false
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        let reduce = reduce
        let ready = onReady
        view.watch = view.playerLayer.observe(\.isReadyForDisplay, options: [.initial, .new]) { layer, _ in
            guard layer.isReadyForDisplay else { return }
            DispatchQueue.main.async { ready() }
        }
        if !reduce { player.playImmediately(atRate: 0.5) }
        return view
    }

    func updateUIView(_ view: PlayerView, context: Context) {}

    static func dismantleUIView(_ view: PlayerView, coordinator: ()) {
        view.watch?.invalidate()
        view.playerLayer.player?.pause()
    }
}
