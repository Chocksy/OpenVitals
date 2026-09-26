import SwiftUI

// Phase 39 I4: the case (depth 2) and How we know (depth 3), from
// `docs/mockups/v4/ios-variations/54-casefile.html`. Simple to read and act
// on at the top; the provenance sits under it, folded until asked for.

struct HunchCaseView: View {
    let id: String
    /// The row it was opened from: drawn while the full case loads.
    var row: Api.HunchRow?
    let desk: HunchDesk
    /// `-OVScreen hunch-how`: every How we know fold open.
    var howOpen = false
    /// In Today's sheet: the close circle.
    var close: (() -> Void)?
    /// On Blood's pushed page: "‹ Blood".
    var back: (() -> Void)?

    private var c: Api.HunchCase? { desk.cases[id] ?? row.map(Api.HunchCase.init(row:)) }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            if let c {
                top(c)
                Evidence(c: c, desk: desk)
                HowWeKnow(c: c, allOpen: howOpen)
                    .padding(.top, DesignTokens.s8)
                    .id(HowWeKnow.anchor)
            } else {
                ProgressView().tint(Hy.ink2).frame(maxWidth: .infinity, minHeight: 200)
            }
            if let error = desk.failed[id] {
                Text(error).hType(12, .medium, Hy.rose)
            }
        }
        .task { await desk.load(id) }
    }

    // MARK: depth 2, the top

    @ViewBuilder
    private func top(_ c: Api.HunchCase) -> some View {
        HStack(spacing: DesignTokens.s8) {
            if let back {
                Button(action: back) {
                    HStack(spacing: 3) {
                        Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                        Text("Blood")
                    }
                    .hType(14, .semibold, Hy.ink)
                }
                .buttonStyle(Pressed(scale: 0.94))
                .accessibilityLabel("Back to Blood")
            }
            Text("Worth a look" + (c.row.system.map { " · \(Self.system($0))" } ?? ""))
                .hType(13, .medium, Hy.ink2)
            Spacer()
            Text(c.row.state == "closed" ? "CLOSED" : c.row.state == "testing" ? "TESTING" : "OPEN")
                .hType(10, .semibold, Hy.ink2, tracking: 0.12)
            if let close {
                Button(action: close) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Hy.ink)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(Hy.card).hShadow(0.18))
                }
                .buttonStyle(Pressed(scale: 0.9))
                .accessibilityLabel("Close")
            }
        }

        HStack(spacing: DesignTokens.s8) {
            Text(c.row.stamp)
                .hType(10, .bold, HunchInk.of(c.row.kind), tracking: 0.1)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(HunchInk.of(c.row.kind), lineWidth: 1.2))
            if let written = c.writtenAt {
                Text("written down \(Design.day(written))")
                    .hType(10, .semibold, Hy.green, tracking: 0.04)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Hy.greenSoft))
                    .transition(.scale.combined(with: .opacity))
            }
        }

        Text(c.row.line)
            .hType(21, .semibold, Hy.ink, tracking: -0.02)
            .fixedSize(horizontal: false, vertical: true)
        if !c.say.isEmpty {
            Text(c.say).hType(14, .regular, Hy.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        chart(c)
    }

    static func system(_ id: String) -> String {
        id.replacingOccurrences(of: "_", with: " ").capitalized
    }

    // MARK: the corridor card

    @ViewBuilder
    private func chart(_ c: Api.HunchCase) -> some View {
        let ink = HunchInk.of(c.row.kind)
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            HStack {
                Text("YOUR CORRIDOR VS THE LAB'S").hType(11, .semibold, Hy.ink2, tracking: 0.08)
                Spacer()
                if !c.series.isEmpty {
                    Text(Design.plural(c.series.count, "draw", "draws")).hType(11, .medium, Hy.ink2)
                }
            }
            if !c.markers.isEmpty {
                ForEach(c.markers) { lane in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(lane.name).hType(12, .semibold, Hy.ink)
                            Spacer()
                            Text((lane.last.map(Design.digits) ?? "—") + (lane.unit.map { " \($0)" } ?? ""))
                                .hType(12, .semibold, Hy.ink)
                        }
                        CorridorChart(draws: lane.series.map { CorridorDraw(date: $0.date, value: $0.value) },
                                      bandAt: lane.bandAt, band: lane.band, ink: ink, compact: true)
                            .frame(height: 46)
                    }
                }
            } else if !c.series.isEmpty {
                CorridorChart(draws: c.series.map { CorridorDraw(date: $0.date, value: $0.value) },
                              bandAt: c.bandAt, band: c.row.mini.band, lab: c.row.mini.lab,
                              goal: c.row.mini.goal, ink: ink)
                    .frame(height: 176)
            } else {
                MiniCorridor(band: c.row.mini.band, lab: c.row.mini.lab, goal: c.row.mini.goal,
                             last: c.row.mini.last, ink: ink)
                    .scaleEffect(2.4, anchor: .leading)
                    .frame(height: 56, alignment: .leading)
            }
            legend(c)
            if let s = Self.sentence(c.row) {
                s.hType(13, .medium, Hy.ink).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(DesignTokens.s13)
        .grained(Hy.card, radius: 21, shadow: 0.3)
    }

    private func legend(_ c: Api.HunchCase) -> some View {
        HStack(spacing: DesignTokens.s13) {
            if c.row.mini.band != nil {
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(Hy.plum2.opacity(0.26)).frame(width: 13, height: 8)
                    Text(c.row.mini.band?.provisional == true ? "your band, 4 draws" : "your band as it stood")
                }
            }
            if let lab = c.row.mini.lab, lab.contains(where: { $0 != nil }) {
                HStack(spacing: 4) {
                    Rectangle().fill(Hy.ink3).frame(width: 13, height: 1)
                    Text("lab \(Design.band(low: lab.first ?? nil, high: lab.last ?? nil, unit: c.row.number.unit ?? ""))")
                }
            }
            if c.row.mini.goal != nil {
                HStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 2).fill(Hy.green.opacity(0.3)).frame(width: 13, height: 8)
                    Text("your goal")
                }
            }
        }
        .hType(10, .medium, Hy.ink2)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }

    /// "0.19 sits inside the lab's range and outside yours."
    static func sentence(_ row: Api.HunchRow) -> Text? {
        guard let v = row.mini.last ?? row.number.value else { return nil }
        var parts: [Text] = [Text("\(Design.digits(v)) sits ")]
        if let lab = row.mini.lab, lab.count == 2 {
            let inside = v >= (lab[0] ?? -.infinity) && v <= (lab[1] ?? .infinity)
            parts.append(Text("\(inside ? "inside" : "outside") the lab's range"))
        }
        if let band = row.mini.band {
            let inside = v >= band.low && v <= band.high
            if parts.count > 1 { parts.append(Text(" and ")) }
            parts.append(Text(inside ? "inside yours" : "outside yours")
                .foregroundColor(inside ? Hy.green : HunchInk.of(row.kind)))
        } else if let goal = row.mini.goal, goal.count == 2 {
            let inside = v >= (goal[0] ?? -.infinity) && v <= (goal[1] ?? .infinity)
            if parts.count > 1 { parts.append(Text(" and ")) }
            parts.append(Text(inside ? "inside your goal" : "outside your goal")
                .foregroundColor(inside ? Hy.green : HunchInk.of(row.kind)))
        }
        guard parts.count > 1 else { return nil }
        return parts.reduce(Text(""), +) + Text(".")
    }
}

// MARK: - explanations, the question, the test

private struct Evidence: View {
    let c: Api.HunchCase
    let desk: HunchDesk

    @Environment(\.accessibilityReduceMotion) private var reduce

    private var ranked: [Api.HunchCase.Explanation] {
        c.explanations.sorted { $0.weight > $1.weight }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            if !c.explanations.isEmpty { explanations }
            if let q = c.question { question(q) }
            if let t = c.test { test(t) }
            if c.outcome != nil || c.outcomeLine != nil { outcome }
        }
    }

    private var explanations: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            HStack {
                Text("WHAT COULD EXPLAIN IT").hType(11, .semibold, Hy.ink2, tracking: 0.08)
                Spacer()
                Text("share").hType(11, .medium, Hy.ink2)
            }
            Text("● science · ◐ opinion · ○ anecdote or hypothesis")
                .hType(11, .regular, Hy.ink2)
            ForEach(ranked) { e in
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .top, spacing: DesignTokens.s8) {
                        Text(HunchInk.glyph(e.basis)).hType(12, .regular, Hy.ink)
                            .accessibilityLabel(e.basis)
                        Text(e.text).hType(13, .medium, Hy.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(Int((e.weight * 100).rounded()))%")
                            .hType(13, .semibold, Hy.ink)
                            .contentTransition(.numericText())
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Hy.paper2)
                            Capsule().fill(e.id == ranked.first?.id ? HunchInk.of(c.row.kind) : Hy.plum2)
                                .frame(width: max(4, g.size.width * e.weight))
                        }
                    }
                    .frame(height: 5)
                    .padding(.leading, 20)
                }
                .padding(.vertical, 3)
            }
            Text("share of this hunch, not a diagnosis").hType(11, .regular, Hy.ink3)
        }
        .motion(Curve.spring.animation(0.7), value: ranked.map(\.id))
        .motion(Curve.spring.animation(0.9), value: ranked.map(\.weight))
        .padding(DesignTokens.s13)
        .grained(Hy.card, radius: 21, shadow: 0.3)
    }

    private func question(_ q: Api.HunchCase.Question) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text("ONE QUESTION").hType(11, .semibold, Hy.ink2, tracking: 0.08)
            Text(q.text).hType(14, .semibold, Hy.ink).fixedSize(horizontal: false, vertical: true)
            Flow(spacing: DesignTokens.s5) {
                ForEach(q.chips) { chip in
                    let picked = c.answer == chip.id
                    Button { Task { await desk.answer(c.id, chip: chip.id) } } label: {
                        HStack(spacing: 4) {
                            if picked { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)) }
                            Text(chip.label)
                        }
                        .hType(12, .medium, picked ? Hy.cream : Hy.ink)
                        .padding(.horizontal, DesignTokens.s13)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(picked ? Hy.plum : Hy.paper2))
                    }
                    .buttonStyle(Pressed(scale: 0.94))
                    .accessibilityAddTraits(picked ? .isSelected : [])
                }
            }
            if c.answer != nil {
                Text("Noted. The shares above moved with your answer.")
                    .hType(11, .medium, Hy.green)
            }
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.3)
    }

    private func test(_ t: Api.HunchCase.Test) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text("THE TEST THAT SETTLES IT").hType(11, .semibold, Hy.ink2, tracking: 0.08)
            HStack(alignment: .firstTextBaseline) {
                Text(t.name).hType(15, .semibold, Hy.ink).fixedSize(horizontal: false, vertical: true)
                Spacer()
                Text(t.priceLine).hType(12, .medium, Hy.ink2)
            }
            if let written = c.writtenAt {
                Text("Written down \(Design.day(written)). On the next draw:")
                    .hType(12, .semibold, Hy.green)
                ForEach(Array((c.predictions ?? []).enumerated()), id: \.offset) { _, p in
                    HStack(alignment: .top, spacing: 6) {
                        Text("·").hType(13, .bold, Hy.ink2)
                        Text(p.text + (p.check.map { " (\($0.code) \($0.words))" } ?? ""))
                            .hType(12, .regular, Hy.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                Text("We write each explanation's prediction down now, so the result can prove us wrong.")
                    .hType(12, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Button { Task { await desk.acceptTest(c.id) } } label: {
                    Text("Write it down")
                        .hType(14, .semibold, Hy.cream)
                        .frame(maxWidth: .infinity)
                        .frame(height: 42)
                        .background(Capsule().fill(Hy.plum))
                }
                .buttonStyle(Pressed(scale: 0.96))
            }
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.3)
        .motion(Curve.spring.animation(0.52), value: c.writtenAt)
    }

    private var outcome: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            Text("WHAT THE RESULT SAID").hType(11, .semibold, Hy.ink2, tracking: 0.08)
            Text(c.outcomeLine ?? c.outcome ?? "").hType(14, .semibold, Hy.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.3)
    }
}

// MARK: - depth 3, How we know

struct HowWeKnow: View {
    let c: Api.HunchCase
    var allOpen = false

    @State private var open: Set<Fold> = []
    @State private var replay: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduce

    enum Fold: CaseIterable { case rule, draws, evidence, unknowns, replay }

    /// The scroll target a screenshot run jumps to.
    static let anchor = "how-we-know"

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            HStack(alignment: .firstTextBaseline) {
                Text("How we know").hType(21, .semibold, Hy.ink, tracking: -0.02)
                Spacer()
                Button(open.count == Fold.allCases.count ? "Close all" : "Open all") {
                    Motion.animate(Curve.spring.animation(0.52), reduce: reduce) {
                        open = open.count == Fold.allCases.count ? [] : Set(Fold.allCases)
                    }
                }
                .font(.grotesk(13, .semibold))
                .foregroundStyle(Hy.ink)
            }
            Text("Each number above, traced to its rule and its file.")
                .hType(12, .regular, Hy.ink2)
            VStack(spacing: 0) {
                fold(.rule, "The rule that fired",
                     "\(c.row.kind.replacingOccurrences(of: "_", with: " "))"
                        + (c.firedAt.first.map { " · first found \(Design.day($0))" } ?? "")) { ruleBody }
                fold(.draws, "The draws", drawsSub) { drawsBody }
                fold(.evidence, "The evidence", Design.plural(c.explanations.count, "explanation", "explanations")) {
                    evidenceBody
                }
                fold(.unknowns, "What we do not know", Design.plural(c.unknowns.count, "thing", "things")) {
                    unknownsBody
                }
                fold(.replay, "Replay", "the band, draw by draw", last: true) { replayBody }
            }
            .padding(.horizontal, DesignTokens.s13)
            .grained(Hy.card, radius: 21, shadow: 0.3)
        }
        .onAppear {
            if allOpen { open = Set(Fold.allCases) }
            replay = Double(max(0, c.series.count - 1))
        }
    }

    private func fold<Body: View>(_ f: Fold, _ title: String, _ sub: String, last: Bool = false,
                                  @ViewBuilder _ content: () -> Body) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Button {
                Motion.animate(Curve.spring.animation(0.52), reduce: reduce) {
                    if open.contains(f) { open.remove(f) } else { open.insert(f) }
                }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).hType(14, .semibold, Hy.ink)
                        Text(sub).hType(11, .regular, Hy.ink2)
                    }
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Hy.ink2)
                        .rotationEffect(.degrees(open.contains(f) ? 180 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(open.contains(f) ? .isSelected : [])
            if open.contains(f) {
                content().transition(.opacity)
            }
        }
        .padding(.vertical, DesignTokens.s13)
        .overlay(alignment: .bottom) {
            if !last { Rectangle().fill(Hy.line).frame(height: 1) }
        }
    }

    // MARK: folds

    private var ruleBody: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            ForEach(Array(c.rule.enumerated()), id: \.offset) { i, line in
                HStack(alignment: .top, spacing: DesignTokens.s8) {
                    Text("\(i + 1)").hType(11, .semibold, Hy.ink2)
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(Hy.paper2))
                    Text(line).hType(13, .regular, Hy.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if c.rule.isEmpty { Text("The rule loads with the case.").hType(12, .regular, Hy.ink2) }
        }
    }

    private var drawsSub: String {
        let files = c.series.filter { $0.file != nil }.count
        return Design.plural(c.series.count, "draw", "draws") + " · \(files) from files"
    }

    private var drawsBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(c.series.reversed()) { d in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(Design.day(d.date)).hType(13, .semibold, Hy.ink)
                        Spacer()
                        Text(Design.digits(d.value) + (c.row.number.unit.map { " \($0)" } ?? ""))
                            .hType(13, .semibold, Hy.ink)
                    }
                    HStack(spacing: 4) {
                        Image(systemName: d.file == nil ? "tray.and.arrow.down" : "doc")
                            .font(.system(size: 10))
                        Text(d.file ?? "imported from the old app")
                    }
                    .hType(11, .regular, Hy.ink2)
                }
                .padding(.vertical, 6)
            }
        }
    }

    private var evidenceBody: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            ForEach(c.explanations) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(HunchInk.glyph(e.basis)) \(e.text)").hType(13, .medium, Hy.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(["Grade \(e.grade)", e.basis, e.source].compactMap { $0 }
                        .removingDuplicates().joined(separator: " · "))
                        .hType(11, .regular, Hy.ink2)
                    if let check = e.check {
                        Text("Checked by \(check.code.replacingOccurrences(of: "_", with: " ")) \(check.words)")
                            .hType(11, .regular, Hy.ink2)
                    }
                }
            }
        }
    }

    private var unknownsBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(c.unknowns.enumerated()), id: \.offset) { _, u in
                HStack(alignment: .top, spacing: 6) {
                    Text("·").hType(13, .bold, Hy.ink2)
                    Text(u).hType(12, .regular, Hy.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @ViewBuilder
    private var replayBody: some View {
        if c.series.count > 1 {
            let i = min(c.series.count - 1, max(0, Int(replay.rounded())))
            let day = c.series[i].date
            VStack(alignment: .leading, spacing: DesignTokens.s8) {
                CorridorChart(draws: c.series.map { CorridorDraw(date: $0.date, value: $0.value) },
                              bandAt: c.bandAt, band: c.row.mini.band, lab: c.row.mini.lab,
                              goal: c.row.mini.goal, ink: HunchInk.of(c.row.kind), upTo: day)
                    .frame(height: 140)
                Text("As it stood on \(Design.day(day))" + (c.firedAt.contains(day) ? " · the rule fired" : ""))
                    .hType(12, .semibold, c.firedAt.contains(day) ? HunchInk.of(c.row.kind) : Hy.ink)
                Slider(value: $replay, in: 0...Double(c.series.count - 1), step: 1)
                    .tint(Hy.plum)
                    .accessibilityValue(Design.day(day))
                GeometryReader { g in
                    ForEach(Array(c.series.enumerated()), id: \.offset) { j, d in
                        let fired = c.firedAt.contains(d.date)
                        Circle()
                            .fill(fired ? HunchInk.of(c.row.kind) : Hy.ink3)
                            .frame(width: fired ? 9 : 5, height: fired ? 9 : 5)
                            .position(x: 12 + (g.size.width - 24) * CGFloat(j) / CGFloat(c.series.count - 1),
                                      y: 5)
                    }
                }
                .frame(height: 10)
                .accessibilityHidden(true)
            }
        } else {
            Text("Replay needs two draws or more.").hType(12, .regular, Hy.ink2)
        }
    }
}

private extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
