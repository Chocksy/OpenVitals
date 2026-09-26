import SwiftUI

// Phase 39 I2: the corridor, one component reused on Today's shelf, the case
// sheet and the Blood tab. `docs/mockups/v4/ios-variations/55-corridors.html`
// (`mini`, `chartOf`): your own band as a plum fill (dashed when it rests on
// four draws), the lab range as thin grey lines behind it, the goal in green,
// the last draw a dot in the hunch's ink.

// MARK: - inks

/// One ink per stamp (55's `HCOL`): berry for a level that left or stepped,
/// amber for a drift, violet for stores moving together, plum for a gap,
/// green for good news.
enum HunchInk {
    static func of(_ kind: String?) -> Color {
        switch kind {
        case "step", "left_band", "discordance": return Hy.blood
        case "cluster": return Hy.gene
        case "drift": return Hy.amber
        case "gap": return Hy.plum3
        case "good_news": return Hy.green
        default: return Hy.ink
        }
    }

    /// The app's evidence rule (phase 40 conflicts table): ● science,
    /// ◐ opinion, ○ anecdotal or hypothesis.
    static func glyph(_ basis: String) -> String {
        switch basis {
        case "science": return "●"
        case "opinion": return "◐"
        default: return "○"
        }
    }
}

// MARK: - the scale

/// The value domain one corridor draws on (55's `DOM`): the draws, every
/// band, the goal, and a lab end only when it sits close to the rest, so a
/// wide lab range never flattens the person's own corridor. 6 % pad, and
/// never below zero for a marker that is never negative.
struct CorridorScale: Equatable {
    let lo: Double
    let hi: Double

    init(values: [Double], bands: [Api.PersonalBand] = [], lab: [Double?]? = nil,
         goal: [Double?]? = nil) {
        var vs = values
        for b in bands { vs += [b.low, b.high] }
        vs += (goal ?? []).compactMap { $0 }
        var lo = vs.min() ?? 0
        var hi = vs.max() ?? 1
        let span = max(hi - lo, abs(hi) * 0.1, 0.0001)
        if let l = lab?.first ?? nil, l >= lo - 0.35 * span { lo = min(lo, l) }
        if let h = lab?.last ?? nil, h <= hi + 0.35 * span { hi = max(hi, h) }
        let pad = max(hi - lo, span) * 0.06
        let floor0 = (values.min() ?? 0) >= 0
        self.lo = floor0 ? max(0, lo - pad) : lo - pad
        self.hi = hi + pad
    }

    /// 0…1 along the scale, clamped.
    func at(_ v: Double) -> Double {
        max(0, min(1, (v - lo) / max(hi - lo, 0.0001)))
    }

    func contains(_ v: Double) -> Bool { v >= lo && v <= hi }
}

// MARK: - the glance

/// 55's `mini`: 121 by 21. The paper track, your corridor (or the goal zone
/// for a goal marker), the lab ends as ticks, the draw before hollow with a
/// trail, the last draw solid in `ink`.
struct MiniCorridor: View {
    let band: Api.PersonalBand?
    var lab: [Double?]?
    var goal: [Double?]?
    let last: Double?
    var previous: Double?
    var ink: Color = Hy.ink

    static let size = CGSize(width: 121, height: 21)

    var body: some View {
        Canvas { ctx, size in draw(&ctx, size) }
            .frame(width: Self.size.width, height: Self.size.height)
            .accessibilityHidden(true)
    }

    private func draw(_ ctx: inout GraphicsContext, _ size: CGSize) {
        let W = size.width
        let scale = CorridorScale(values: [last, previous].compactMap { $0 },
                                  bands: band.map { [$0] } ?? [], lab: lab, goal: goal)
        func x(_ v: Double) -> CGFloat { W * scale.at(v) }
        ctx.fill(Path(roundedRect: CGRect(x: 0, y: 7, width: W, height: 8), cornerRadius: 4),
                 with: .color(Hy.paper2))
        if let g = goal, g.count == 2, g[0] != nil || g[1] != nil {
            let a = x(g[0] ?? scale.lo), b = x(g[1] ?? scale.hi)
            ctx.fill(Path(roundedRect: CGRect(x: a, y: 7, width: max(3, b - a), height: 8),
                          cornerRadius: 4),
                     with: .color(Hy.green.opacity(0.3)))
        } else if let band {
            let a = x(band.low), b = x(band.high)
            if band.provisional {
                let r = Path(roundedRect: CGRect(x: a, y: 7.5, width: max(3, b - a), height: 7),
                             cornerRadius: 3.5)
                ctx.fill(r, with: .color(Hy.plum2.opacity(0.1)))
                ctx.stroke(r, with: .color(Hy.plum3), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            } else {
                ctx.fill(Path(roundedRect: CGRect(x: a, y: 7, width: max(3, b - a), height: 8),
                              cornerRadius: 4),
                         with: .color(Hy.plum2.opacity(0.26)))
            }
        }
        for v in (lab ?? []).compactMap({ $0 }) where v > 0 && scale.contains(v) {
            ctx.stroke(Path { $0.move(to: CGPoint(x: x(v), y: 3)); $0.addLine(to: CGPoint(x: x(v), y: 19)) },
                       with: .color(Hy.ink3), lineWidth: 1)
        }
        if let previous, let last {
            ctx.stroke(Path { $0.move(to: CGPoint(x: x(previous), y: 11)); $0.addLine(to: CGPoint(x: x(last), y: 11)) },
                       with: .color(Hy.ink3), lineWidth: 1.5)
            let pv = Path(ellipseIn: CGRect(x: x(previous) - 2.5, y: 8.5, width: 5, height: 5))
            ctx.fill(pv, with: .color(Hy.card))
            ctx.stroke(pv, with: .color(Hy.ink3), lineWidth: 1.5)
        }
        if let last {
            let dot = Path(ellipseIn: CGRect(x: x(last) - 5, y: 6, width: 10, height: 10))
            ctx.stroke(dot, with: .color(.white), lineWidth: 2)
            ctx.fill(dot, with: .color(ink))
        }
    }
}

// MARK: - the case chart

/// One draw on a corridor chart.
struct CorridorDraw: Equatable {
    let date: String
    let value: Double
}

/// 51's history chart as 54 and 55 draw it: the draws, the band as it stood
/// before each draw (a ribbon: the outer corridor light, the middle spread
/// darker), the lab lines, the earlier edge a step broke, and a dashed
/// landing for a goal marker. It draws in from the left on `Curve.ease`.
struct CorridorChart: View {
    let draws: [CorridorDraw]
    var bandAt: [Api.HunchCase.BandAt] = []
    /// The band now; drawn from the last-but-one draw on when `bandAt` is empty.
    var band: Api.PersonalBand?
    var lab: [Double?]?
    var goal: [Double?]?
    var landing: CorridorDraw?
    var ink: Color = Hy.ink
    /// The replay: only the draws on or before this day.
    var upTo: String?
    /// A lane of a cluster: no axis, no words.
    var compact = false

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var drawn = false

    var body: some View {
        Canvas { ctx, size in draw(&ctx, size) }
            .mask(alignment: .leading) {
                GeometryReader { g in
                    Rectangle().frame(width: drawn ? g.size.width : 0)
                }
            }
            .onAppear {
                Motion.animate(Curve.ease.animation(0.9), reduce: reduce) { drawn = true }
            }
            .accessibilityElement()
            .accessibilityLabel("Draws: " + shown.map { "\(Design.day($0.date)) \(Design.digits($0.value))" }
                .joined(separator: ", "))
    }

    private var shown: [CorridorDraw] {
        guard let upTo else { return draws }
        return draws.filter { $0.date <= upTo }
    }

    /// The earlier edge the last draws broke through (`stepOf`): the last
    /// `k ≥ 2` draws all above the earlier maximum, or all below the
    /// minimum, with 3 draws before them at least.
    static func brokenEdge(_ values: [Double]) -> (value: Double, up: Bool)? {
        var best: (Double, Bool)?
        var k = 2
        while values.count - k >= 3 {
            let prior = values.dropLast(k), last = values.suffix(k)
            if let mx = prior.max(), last.allSatisfy({ $0 > mx }) { best = (mx, true) }
            else if let mn = prior.min(), last.allSatisfy({ $0 < mn }) { best = (mn, false) }
            k += 1
        }
        return best
    }

    private func draw(_ ctx: inout GraphicsContext, _ size: CGSize) {
        let pts = shown.compactMap { d in DayGrid.date(d.date).map { (t: $0, v: d.value, d: d.date) } }
        guard let first = pts.first, let lastPt = pts.last else { return }
        let bands = bandAt.map { Api.PersonalBand(median: $0.median, sd: $0.sd, n: 0, provisional: false) }
            + (band.map { [$0] } ?? [])
        let scale = CorridorScale(values: draws.map(\.value) + (landing.map { [$0.value] } ?? []),
                                  bands: bands, lab: lab, goal: goal)
        let day: TimeInterval = 86_400
        let allDates = draws.compactMap { DayGrid.date($0.date) }
        let t0 = (allDates.first ?? first.t).addingTimeInterval(-60 * day)
        let tEnd = [allDates.last, landing.flatMap { DayGrid.date($0.date) }].compactMap { $0 }.max()
            ?? lastPt.t
        let t1 = tEnd.addingTimeInterval(60 * day)
        let W = size.width
        let top: CGFloat = compact ? 4 : 13
        let bottom: CGFloat = size.height - (compact ? 4 : 21)
        func X(_ t: Date) -> CGFloat { W * t.timeIntervalSince(t0) / max(1, t1.timeIntervalSince(t0)) }
        func Y(_ v: Double) -> CGFloat { bottom - (bottom - top) * scale.at(v) }
        func label(_ s: String, _ at: CGPoint, _ anchor: UnitPoint, _ c: Color = Hy.ink2,
                   _ weight: Font.Weight = .medium) {
            guard !compact else { return }
            ctx.draw(Text(s).font(.grotesk(10, weight)).foregroundColor(c), at: at, anchor: anchor)
        }

        // The goal zone, full width.
        if let g = goal, g.count == 2, g[0] != nil || g[1] != nil {
            let a = Y(g[1] ?? scale.hi), b = Y(g[0] ?? scale.lo)
            ctx.fill(Path(CGRect(x: 0, y: a, width: W, height: max(0, b - a))),
                     with: .color(Hy.green.opacity(0.14)))
        }

        // The lab lines behind everything the person owns.
        for (i, v) in (lab ?? []).enumerated() {
            guard let v, v > 0, scale.contains(v) else { continue }
            let y = Y(v)
            ctx.stroke(Path { $0.move(to: CGPoint(x: 0, y: y)); $0.addLine(to: CGPoint(x: W, y: y)) },
                       with: .color(Hy.ink3.opacity(0.7)), lineWidth: 1)
            label("lab \(Design.digits(v))", CGPoint(x: W - 2, y: y - 2), .bottomTrailing, Hy.ink3,
                  .regular)
            _ = i
        }

        // The band as it stood before each draw: from the draw before to it.
        var ribbons: [(from: Date, to: Date, band: Api.PersonalBand)] = []
        let seen = bandAt.filter { upTo == nil || $0.date <= upTo! }
        for b in seen {
            guard let at = DayGrid.date(b.date) else { continue }
            let before = allDates.last { $0 < at } ?? t0
            ribbons.append((before, at, Api.PersonalBand(median: b.median, sd: b.sd, n: 0,
                                                         provisional: band?.provisional ?? false)))
        }
        if ribbons.isEmpty, let band, pts.count > 1 {
            ribbons.append((pts[pts.count - 2].t, lastPt.t, band))
        }
        if let lastRibbon = ribbons.last, upTo == nil {
            ribbons.append((lastRibbon.to, t1, lastRibbon.band))
        }
        for r in ribbons {
            let x0 = X(r.from), x1 = X(r.to)
            let outer = CGRect(x: x0, y: Y(r.band.high), width: max(1, x1 - x0),
                               height: max(1, Y(r.band.low) - Y(r.band.high)))
            let inner = CGRect(x: x0, y: Y(r.band.median + r.band.sd), width: max(1, x1 - x0),
                               height: max(1, Y(r.band.median - r.band.sd) - Y(r.band.median + r.band.sd)))
            ctx.fill(Path(outer), with: .color(Hy.plum2.opacity(r.band.provisional ? 0.08 : 0.12)))
            ctx.fill(Path(inner), with: .color(Hy.plum2.opacity(r.band.provisional ? 0.12 : 0.2)))
            if r.band.provisional {
                ctx.stroke(Path(outer), with: .color(Hy.plum3),
                           style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            }
        }

        // The earlier edge a step broke through.
        if !compact, upTo == nil, let edge = Self.brokenEdge(draws.map(\.value)) {
            let y = Y(edge.value)
            ctx.stroke(Path { $0.move(to: CGPoint(x: 0, y: y)); $0.addLine(to: CGPoint(x: W, y: y)) },
                       with: .color(Hy.amber), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            label("your earlier \(edge.up ? "max" : "min") \(Design.digits(edge.value))",
                  CGPoint(x: 2, y: y - 2), .bottomLeading, Hy.amber)
        }

        // The draws.
        var line = Path()
        for (i, p) in pts.enumerated() {
            let c = CGPoint(x: X(p.t), y: Y(p.v))
            i == 0 ? line.move(to: c) : line.addLine(to: c)
        }
        ctx.stroke(line, with: .color(Hy.ink),
                   style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        for p in pts.dropLast() {
            let c = CGPoint(x: X(p.t), y: Y(p.v))
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - 2.5, y: c.y - 2.5, width: 5, height: 5)),
                     with: .color(Hy.ink))
        }

        // The landing, dashed, for a goal marker.
        let end = CGPoint(x: X(lastPt.t), y: Y(lastPt.v))
        if upTo == nil, let landing, let lt = DayGrid.date(landing.date) {
            let to = CGPoint(x: X(lt), y: Y(landing.value))
            ctx.stroke(Path { $0.move(to: end); $0.addLine(to: to) },
                       with: .color(ink), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [0.1, 5]))
            let hollow = Path(ellipseIn: CGRect(x: to.x - 4, y: to.y - 4, width: 8, height: 8))
            ctx.fill(hollow, with: .color(Hy.card))
            ctx.stroke(hollow, with: .color(ink), lineWidth: 2)
            label("near \(Design.digits(landing.value.rounded())) by \(DayGrid.short(lt))",
                  CGPoint(x: to.x - 6, y: to.y + 6), .topTrailing, ink)
        }

        let dot = Path(ellipseIn: CGRect(x: end.x - 5, y: end.y - 5, width: 10, height: 10))
        ctx.stroke(dot, with: .color(.white), lineWidth: 2)
        ctx.fill(dot, with: .color(ink))
        label(Design.digits(lastPt.v), CGPoint(x: min(end.x + 8, W - 2), y: end.y),
              end.x + 40 > W ? .trailing : .leading, Hy.ink, .semibold)

        // Years along the bottom.
        guard !compact else { return }
        let cal = DayGrid.calendar
        let y0 = cal.component(.year, from: t0), y1 = cal.component(.year, from: t1)
        let step = max(1, (y1 - y0) / 4)
        for year in stride(from: y0 + 1, through: y1, by: step) {
            guard let d = cal.date(from: DateComponents(year: year, month: 1, day: 1)) else { continue }
            let x = X(d)
            guard x > 12, x < W - 12 else { continue }
            label(String(year), CGPoint(x: x, y: size.height - 2), .bottom, Hy.ink3, .regular)
        }
    }
}
