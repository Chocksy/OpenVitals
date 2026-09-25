import SwiftUI

/// One marker, in the Hybrid look (phase 38 D2): a system sheet on the
/// grained card colour, corner 42. It shows what `marker.html`'s 390 frame
/// shows: the state word, the ruler, the history chart, every draw that
/// carried it, and the goal.
///
/// The chart draws the goal band when there is a goal, dashed, because a
/// target is aimed at and never measured. Nothing between two draws is
/// interpolated: one diamond is one draw.
struct MarkerView: View {
    let marker: Api.Markers.Marker
    var days = 365
    var reload: (() async -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var goal: Api.Markers.Goal?
    @State private var editing = false
    @State private var low = ""
    @State private var high = ""
    @State private var due = ""
    @State private var note = ""
    @State private var busy = false
    @State private var said = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                top
                head
                chart
                readings
                goalCard
                if !said.isEmpty {
                    Text(said).hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, DesignTokens.s21)
                }
            }
            .padding(.top, DesignTokens.s21)
            .padding(.bottom, DesignTokens.s34)
        }
        .scrollIndicators(.hidden)
        .environment(\.colorScheme, .light)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(42)
        .presentationBackground { ZStack { Hy.card; GrainTile() } }
        .onAppear { goal = marker.goal; fill(marker.goal) }
    }

    // MARK: - the parts

    /// The name and the close.
    private var top: some View {
        HStack(alignment: .center, spacing: DesignTokens.s13) {
            Text(marker.name)
                .hType(21, .semibold, Hy.ink, tracking: -0.02)
                .lineLimit(2)
            Spacer(minLength: 0)
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Hy.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Hy.paper2))
            }
            .buttonStyle(Pressed(scale: 0.92))
            .accessibilityLabel("Close")
        }
        .padding(.horizontal, DesignTokens.s21)
    }

    /// Where it came from, the number, the change, the word and the ruler.
    private var head: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(text: "\(marker.system) · \(Design.day(marker.date)) · lab",
                      glyph: BloodView.glyph(marker.system))
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s13) {
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s5) {
                    Text(Design.number(marker.value))
                        .hType(55, .semibold, Hy.ink, tracking: -0.04)
                    if let unit = marker.unit, !unit.isEmpty, marker.value != nil {
                        Text(unit).hType(13, .regular, Hy.ink2)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                Text(marker.word.capitalized)
                    .hType(13, .semibold, HyState.ink(marker.word))
                    .padding(.vertical, 3)
                    .padding(.horizontal, DesignTokens.s8)
                    .background(Capsule().fill(HyState.soft(marker.word)))
            }
            .padding(.top, DesignTokens.s8)
            if let delta = marker.delta {
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s5) {
                    Text(delta.value).hType(17, .semibold, Hy.ink2)
                    Text(delta.since).hType(11, .regular, Hy.ink3)
                }
            }
            Group {
                if let ruler = marker.ruler {
                    HyRuler(parts: ruler, word: marker.word)
                } else {
                    Text("No band on file for this marker, so there is nothing "
                         + "to judge the number against.")
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, DesignTokens.s13)
        }
        .hyCard()
    }

    /// The history, drawn at the drawer size.
    struct Chart {
        /// 0…1 across and down the plot.
        let points: [(x: Double, y: Double, label: String)]
        /// The goal as a 0…1 stretch down the plot.
        let band: ClosedRange<Double>?
        let unit: String
    }

    /// Nil with fewer than two draws: a chart with one point is a dot, and a
    /// line between one point and nothing is invented.
    private var chartParts: Chart? {
        let points = marker.series
        guard points.count > 1 else { return nil }
        let values = points.map(\.value)
        let bounds = [goal?.low, goal?.high].compactMap { $0 }
        let lo = (values + bounds).min() ?? 0
        let hi = (values + bounds).max() ?? 1
        let span = hi - lo == 0 ? 1 : hi - lo
        func y(_ v: Double) -> Double { 1 - (v - lo) / span }
        let plotted = points.enumerated().map { i, point in
            (x: Double(i) / Double(points.count - 1), y: y(point.value),
             label: Design.number(point.value))
        }
        let band: ClosedRange<Double>? = {
            guard let goal else { return nil }
            let top = y(goal.high ?? hi)
            let bottom = y(goal.low ?? lo)
            guard bottom > top else { return nil }
            return top...bottom
        }()
        return Chart(points: plotted, band: band,
                     unit: [marker.unit,
                            Design.plural(points.count, "draw", "draws")]
                        .compactMap { $0 }.filter { !$0.isEmpty }
                        .joined(separator: " · "))
    }

    @ViewBuilder private var chart: some View {
        if let parts = chartParts {
            VStack(alignment: .leading, spacing: 0) {
                CardLabel(text: "History · \(parts.unit)", glyph: "chart.xyaxis.line")
                HyHistory(chart: parts)
                    .frame(height: 144)
                    .padding(.top, DesignTokens.s8)
                if parts.band != nil {
                    Text("The dashed stretch is the goal, not a measured band: "
                         + "it is what this marker is aimed at.")
                        .hType(11, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, DesignTokens.s13)
                }
            }
            .hyCard()
        }
    }

    /// Every draw that carried this marker, newest first.
    private var readings: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(text: "Readings · last \(Design.number(days)) days",
                      glyph: "list.bullet")
                .padding(.bottom, DesignTokens.s5)
            if marker.series.isEmpty {
                Text("No draw has ever carried a number for this marker.")
                    .hType(13, .regular, Hy.ink2)
                    .padding(.top, DesignTokens.s5)
            } else {
                let reference = Design.band(low: marker.band.low,
                                            high: marker.band.high, unit: "")
                ForEach(Array(marker.series.reversed().enumerated()),
                        id: \.element.id) { i, point in
                    if i > 0 { Hy.line.frame(height: 1) }
                    HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                        Text(Design.day(point.date))
                            .hType(13, .regular, Hy.ink2)
                            .frame(width: 96, alignment: .leading)
                        (Text(Design.number(point.value)).font(.grotesk(15, .semibold))
                            + Text(" \(marker.unit ?? "")").font(.grotesk(11))
                                .foregroundColor(Hy.ink2))
                            .foregroundStyle(Hy.ink)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Text(reference.isEmpty ? "—" : reference)
                            .hType(11, .regular, Hy.ink3)
                        if point.date == marker.date {
                            Circle().fill(HyState.ink(marker.word))
                                .frame(width: 8, height: 8)
                                .accessibilityLabel(marker.word)
                        } else {
                            Color.clear.frame(width: 8, height: 8)
                        }
                    }
                    .frame(minHeight: 44)
                }
            }
        }
        .hyCard()
    }

    /// Set a goal: the same four fields the web's own form posts.
    private var goalCard: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            CardLabel(text: "Goal · " + (goal == nil ? "none yet"
                                         : goal?.due.map { "due \(Design.day($0))" } ?? "no date"),
                      glyph: "scope")
            if let goal, !editing {
                Text(Design.band(low: goal.low, high: goal.high,
                                 unit: marker.unit ?? ""))
                    .hType(21, .semibold, Hy.ink, tracking: -0.02)
                HStack(spacing: DesignTokens.s13) {
                    Button { editing = true } label: { capsule("Change", fill: Hy.paper2, ink: Hy.ink) }
                        .buttonStyle(Pressed(scale: 0.94))
                    Button { Task { await remove() } } label: {
                        Text("Remove").hType(13, .semibold, Hy.rose)
                            .frame(height: 44)
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                    Spacer(minLength: 0)
                }
            } else if editing {
                field("Low", $low, "70", keyboard: .decimalPad)
                field("High", $high, "100", keyboard: .decimalPad)
                field("Due", $due, "2026-12-01", help: "yyyy-mm-dd, or leave it empty")
                field("Note", $note, "why this number")
                HStack(spacing: DesignTokens.s13) {
                    Button { Task { await save() } } label: {
                        capsule(busy ? "Saving…" : "Save", fill: Hy.plum, ink: Hy.cream)
                    }
                    .buttonStyle(Pressed(scale: 0.94))
                    .disabled(busy || !canSave)
                    .opacity(canSave ? 1 : 0.45)
                    Button { editing = false; fill(goal) } label: {
                        Text("Cancel").hType(13, .semibold, Hy.ink2).frame(height: 44)
                    }
                    .buttonStyle(.plain)
                    Spacer(minLength: 0)
                }
                Text("A goal is a target, a date, or both, and it is the same row "
                     + "the website writes: one goal per marker.")
                    .hType(11, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Nothing is aimed at this marker yet.")
                    .hType(13, .regular, Hy.ink2)
                Button { editing = true } label: {
                    capsule("Set a goal", fill: Hy.plum, ink: Hy.cream)
                }
                .buttonStyle(Pressed(scale: 0.94))
            }
        }
        .motion(Curve.ease.animation(0.32), value: editing)
        .hyCard()
    }

    private func capsule(_ title: String, fill: Color, ink: Color) -> some View {
        Text(title).hType(15, .semibold, ink)
            .padding(.horizontal, DesignTokens.s21)
            .frame(height: 44)
            .background(Capsule().fill(fill))
    }

    /// A label in 11 caps over a 44 capsule on paper.
    private func field(_ label: String, _ text: Binding<String>, _ placeholder: String,
                       keyboard: UIKeyboardType = .default,
                       help: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).textCase(.uppercase)
                .hType(11, .medium, Hy.ink2, tracking: 0.12)
            TextField("", text: text,
                      prompt: Text(placeholder).foregroundColor(Hy.ink3))
                .font(.grotesk(15))
                .foregroundStyle(Hy.ink)
                .keyboardType(keyboard)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .padding(.horizontal, DesignTokens.s13)
                .frame(height: 44)
                .background(Capsule().fill(Hy.paper))
            if let help {
                Text(help).hType(11, .regular, Hy.ink3)
            }
        }
    }

    private var canSave: Bool {
        parse(low) != nil || parse(high) != nil
            || !due.trimmingCharacters(in: .whitespaces).isEmpty
    }

    // MARK: - doing it

    private func parse(_ text: String) -> Double? {
        let t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(
            of: ",", with: ".")
        return t.isEmpty ? nil : Double(t)
    }

    private func fill(_ goal: Api.Markers.Goal?) {
        low = goal?.low.map { Design.number($0) } ?? ""
        high = goal?.high.map { Design.number($0) } ?? ""
        due = goal?.due ?? ""
        note = ""
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            let saved = try await Api.setGoal(
                code: marker.code, low: parse(low), high: parse(high),
                due: due.trimmingCharacters(in: .whitespaces), note: note)
            goal = Api.Markers.Goal(low: saved.targetLow,
                                    high: saved.targetHigh, due: saved.due)
            editing = false
            said = "Saved. Today's sentence counts it from now on."
            await reload?()
        } catch {
            said = "That goal did not save: \(error.localizedDescription)"
        }
    }

    private func remove() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await Api.removeGoal(code: marker.code)
            goal = nil
            fill(nil)
            said = "Removed."
            await reload?()
        } catch {
            said = "That did not delete: \(error.localizedDescription)"
        }
    }
}

/// The history in the Hybrid look: the goal a dashed plum stretch, a 1.5 ink3
/// line from draw to draw, and an ink diamond with its number at each draw.
struct HyHistory: View {
    let chart: MarkerView.Chart

    var body: some View {
        Canvas { ctx, size in
            // The plot sits 8 in from the sides and 21 down from the top, so
            // an end diamond and the number over the highest one are never cut.
            let left: CGFloat = 8, top: CGFloat = 21
            let W = size.width - 2 * left, H = size.height - top - 5
            func at(_ p: (x: Double, y: Double, label: String)) -> CGPoint {
                CGPoint(x: left + W * p.x, y: top + H * p.y)
            }
            if let band = chart.band {
                let rect = CGRect(x: 0, y: top + H * band.lowerBound, width: size.width,
                                  height: H * (band.upperBound - band.lowerBound))
                let shape = Path(roundedRect: rect, cornerRadius: 8)
                ctx.fill(shape, with: .color(Hy.greenSoft.opacity(0.6)))
                ctx.stroke(shape, with: .color(Hy.plum),
                           style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
            }
            var line = Path()
            for (i, p) in chart.points.enumerated() {
                i == 0 ? line.move(to: at(p)) : line.addLine(to: at(p))
            }
            ctx.stroke(line, with: .color(Hy.ink3),
                       style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            for p in chart.points {
                let c = at(p)
                var diamond = Path()
                diamond.move(to: CGPoint(x: c.x, y: c.y - 4.5))
                diamond.addLine(to: CGPoint(x: c.x + 4.5, y: c.y))
                diamond.addLine(to: CGPoint(x: c.x, y: c.y + 4.5))
                diamond.addLine(to: CGPoint(x: c.x - 4.5, y: c.y))
                diamond.closeSubpath()
                ctx.fill(diamond, with: .color(Hy.ink))
                // The number sits above its diamond, kept inside the plot.
                let x = min(max(c.x, 16), size.width - 16)
                ctx.draw(Text(p.label).font(.grotesk(11, .semibold)).foregroundColor(Hy.ink),
                         at: CGPoint(x: x, y: c.y - 8), anchor: .bottom)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("History: " + chart.points.map(\.label).joined(separator: ", "))
    }
}
