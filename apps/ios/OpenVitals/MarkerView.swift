import SwiftUI

/// One marker, as `marker.html`'s 390 frame draws it: the state word, the
/// ruler, the history chart at the drawer size, every draw that carried it,
/// and the goal.
///
/// The chart draws the goal band when there is a goal, hatched, because a
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
        Screen(title: marker.name, icon: "xmark", iconLabel: "Close",
               action: { dismiss() }) {
            head
            chart
            readings
            goalPanel
            if !said.isEmpty { Caption(said) }
        }
        .safeAreaPadding(.top, DesignTokens.s21)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(DesignTokens.rHero)
        .presentationBackground(Design.canvas)
        .onAppear { goal = marker.goal; fill(marker.goal) }
    }

    // MARK: - the parts

    /// `.panel.hi` — where it came from, the number, the change and the ruler.
    private var head: some View {
        Panel(title: "\(marker.system) · \(Design.day(marker.date)) · lab",
              meta: nil, hi: true) {
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s21) {
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s5) {
                    Text(Design.number(marker.value))
                        .ovType(.xl, weight: .light, mono: true, leading: 1.1)
                        .ovTracking(-0.03, .xl)
                        .foregroundStyle(Design.ink)
                    if let unit = marker.unit, !unit.isEmpty,
                       marker.value != nil {
                        Text(unit).ovType(.xs).foregroundStyle(Design.ink3)
                    }
                }
                if let delta = marker.delta {
                    HStack(alignment: .firstTextBaseline,
                           spacing: DesignTokens.s5) {
                        Text(delta.value)
                            .ovType(.lg, weight: .light, mono: true)
                            .foregroundStyle(Design.ink2)
                        Text(delta.since).ovType(.xs)
                            .foregroundStyle(Design.ink3)
                    }
                }
                Spacer(minLength: 0)
                StateWord(word: marker.word, triangle: true)
            }
            if let ruler = marker.ruler {
                Ruler(at: ruler.at, normal: ruler.normal,
                      optimal: ruler.optimal, target: ruler.target,
                      ghost: ruler.ghost, word: marker.word,
                      low: ruler.low, mid: ruler.mid, high: ruler.high)
            } else {
                Caption("No band on file for this marker, so there is nothing "
                        + "to judge the number against.")
            }
        }
    }

    /// `.hist.mini` — the drawer size. One diamond a draw on a real value
    /// scale; nothing between two draws is drawn.
    struct Chart {
        let points: [HistoryChart.Point]
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
            HistoryChart.Point(
                x: Double(i) / Double(points.count - 1),
                y: y(point.value),
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
            HistoryChart(title: "History", unit: parts.unit,
                         points: parts.points, normal: parts.band,
                         hatched: true, mini: true)
            if parts.band != nil {
                Caption("The shaded stretch is the goal, not a measured band: "
                        + "it is what this marker is aimed at.")
            }
        }
    }

    /// `.tbl` — every draw that carried this marker, newest first.
    private var readings: some View {
        Panel(title: "Readings",
              meta: "last \(Design.number(days)) days") {
            if marker.series.isEmpty {
                Caption("No draw has ever carried a number for this marker.")
            } else {
                Table(columns: ["Date", "Value", "Reference", "State"],
                      rows: marker.series.reversed().map { point in
                          [Design.day(point.date),
                           "\(Design.number(point.value)) \(marker.unit ?? "")"
                            .trimmingCharacters(in: .whitespaces),
                           Design.band(low: marker.band.low,
                                       high: marker.band.high, unit: "")
                            .isEmpty ? "—"
                            : Design.band(low: marker.band.low,
                                          high: marker.band.high, unit: ""),
                           point.date == marker.date ? marker.word : ""]
                      },
                      numeric: [0, 1],
                      // "Apr 23 2026" is 11 mono characters and the
                      // REFERENCE head is nine: an even quarter of 338 pt
                      // wraps both onto two lines.
                      widths: [100, 84, 80, 0])
            }
        }
    }

    /// Set a goal: the same four fields the web's own form posts.
    private var goalPanel: some View {
        Panel(title: "Goal",
              meta: goal == nil ? "none yet" : Design.day(goal?.due)) {
            if let goal, !editing {
                Text(Design.band(low: goal.low, high: goal.high,
                                 unit: marker.unit ?? ""))
                    .ovType(.md, mono: true).foregroundStyle(Design.ink)
                if let due = goal.due {
                    Meta("due \(Design.day(due))")
                }
                HStack(spacing: DesignTokens.s13) {
                    Button("Change") { editing = true }
                        .buttonStyle(.ov(.quiet, small: true))
                    Button("Remove") { Task { await remove() } }
                        .buttonStyle(.ov(.text, small: true))
                        .disabled(busy)
                    Spacer(minLength: 0)
                }
            } else if editing {
                Inp(label: "Low", text: $low, placeholder: "70",
                    keyboard: .decimalPad)
                Inp(label: "High", text: $high, placeholder: "100",
                    keyboard: .decimalPad)
                Inp(label: "Due", text: $due, placeholder: "2026-12-01",
                    help: "yyyy-mm-dd, or leave it empty")
                Inp(label: "Note", text: $note,
                    placeholder: "why this number")
                HStack(spacing: DesignTokens.s13) {
                    Button(busy ? "Saving…" : "Save") { Task { await save() } }
                        .buttonStyle(.ovInk)
                        .disabled(busy || !canSave)
                        .opacity(canSave ? 1 : 0.45)
                    Button("Cancel") { editing = false; fill(goal) }
                        .buttonStyle(.ovText)
                    Spacer(minLength: 0)
                }
                Caption("A goal is a target, a date, or both, and it is the "
                        + "same row the website writes: one goal per marker.")
            } else {
                Caption("Nothing is aimed at this marker yet.")
                Button("Set a goal") { editing = true }
                    .buttonStyle(.ovInk)
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
