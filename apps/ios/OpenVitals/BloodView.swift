import SwiftUI

/// Blood. Every marker `/api/markers` carries, in the order the web Markers
/// tab puts them: sorted once on the server, grouped by system, and read here
/// in that order so the phone never re-sorts and the two can never disagree.
///
/// One search field and one state filter, as on the web. A row is the marker
/// row from `system.html` section 08: the name, where it came from and when,
/// the value with its unit, the state word, the sparkline off its own series
/// and the ruler under both.
struct BloodView: View {
    @State private var markers: Api.Markers?
    @State private var error = ""
    @State private var query = ""
    @State private var filter = "Off"
    @State private var open: Api.Markers.Marker?

    var body: some View {
        Screen(title: "Blood", refresh: { await load() }) {
            if let markers {
                SearchBox(text: $query)
                Filters(names: Api.Markers.filters, chosen: $filter) {
                    markers.count($0)
                }
                list(markers)
                Caption("Every row is a lab reading with the date it was drawn "
                        + "and the band it is judged against. A marker with no "
                        + "band is listed under All and judged by nothing, "
                        + "because a number nothing can judge is not a state.")
            } else if error.isEmpty {
                Panel { Text("Asking the server…").ovType(.sm)
                    .foregroundStyle(Design.ink3) }
            } else {
                Panel(title: "Nothing to show") {
                    Text(error).ovType(.sm).foregroundStyle(Design.ink2)
                }
            }
        }
        .task { await load() }
        .sheet(item: $open) { marker in
            MarkerView(marker: marker, days: markers?.days ?? 365) {
                await load()
            }
        }
    }

    @ViewBuilder
    private func list(_ markers: Api.Markers) -> some View {
        let rows = markers.filtered(filter, query: query)
        if rows.isEmpty {
            Panel {
                Text(query.isEmpty
                     ? "Nothing is \(filter.lowercased()) today."
                     : "No marker matches “\(query)”.")
                    .ovType(.sm).foregroundStyle(Design.ink2)
            }
        } else {
            Panel(title: nil,
                  meta: "\(Design.number(rows.count)) of "
                  + "\(Design.number(markers.markers.count)) shown") {
                // 132 markers, each with a ruler: the rows are built as they
                // come into view rather than all at once.
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(grouped(rows).enumerated()),
                            id: \.element.name) { i, group in
                        SubHead(title: group.name,
                                note: "\(Design.number(group.rows.count)) of "
                                + "\(Design.number(total(group.name, markers)))"
                                + " shown",
                                top: i == 0 ? 0 : DesignTokens.s21)
                        ForEach(Array(group.rows.enumerated()),
                                id: \.element.id) { j, marker in
                            Button { open = marker } label: {
                                BloodRow(marker: marker)
                                    .padding(.vertical, DesignTokens.s13)
                            }
                            .buttonStyle(.plain)
                            if j < group.rows.count - 1 { Hair() }
                        }
                    }
                }
            }
        }
    }

    /// The rows of one system stay together in the order the server first met
    /// them, which is what the web's own `Map` does.
    private func grouped(_ rows: [Api.Markers.Marker])
        -> [(name: String, rows: [Api.Markers.Marker])] {
        var order: [String] = []
        var byName: [String: [Api.Markers.Marker]] = [:]
        for row in rows {
            if byName[row.system] == nil { order.append(row.system) }
            byName[row.system, default: []].append(row)
        }
        return order.map { ($0, byName[$0] ?? []) }
    }

    /// How many markers this system has in all, filter or no filter: "1 of 6
    /// shown" is a sentence about the system, not about the list.
    private func total(_ system: String, _ markers: Api.Markers) -> Int {
        markers.markers.filter { $0.system == system }.count
    }

    private func load() async {
        do {
            let asked = try await Api.markers()
            markers = asked
            error = ""
            // `-OVScreen marker` opens the first marker that has a goal, so a
            // screenshot run reaches the marker sheet with no tap.
            if Fixtures.screen == "marker", open == nil {
                open = asked.markers.first { $0.goal != nil }
                    ?? asked.markers.first { $0.ruler != nil }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One marker in the list: the row, then the sparkline off its own series and
/// the ruler under it. Nothing is drawn where there is nothing to draw — a
/// marker with one reading has no line, and one with no band has no ruler.
struct BloodRow: View {
    let marker: Api.Markers.Marker

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            MarkerRow(name: marker.name, source: marker.source,
                      value: Design.number(marker.value),
                      unit: marker.value == nil ? nil : marker.unit,
                      word: marker.word,
                      spark: marker.series.isEmpty
                          ? nil : marker.series.map(\.value))
            if let ruler = marker.ruler {
                Ruler(at: ruler.at, normal: ruler.normal,
                      optimal: ruler.optimal, target: ruler.target,
                      ghost: ruler.ghost, word: marker.word, low: ruler.low,
                      mid: ruler.mid, high: ruler.high)
            }
        }
    }
}

// MARK: - the ruler behind a marker

extension Api.Markers.Marker {

    /// Everything the ruler needs, on the web's own scale
    /// (`components/ruler.tsx` `rangeScale`, ported in `MarkerScale`).
    struct RulerParts {
        let at: Double
        let normal: ClosedRange<Double>?
        let optimal: ClosedRange<Double>?
        let target: ClosedRange<Double>?
        let ghost: Double?
        let low: String
        let mid: String
        let high: String
    }

    /// Nil when there is no value or nothing to judge it against: a bar with
    /// no band under it says nothing a number does not already say.
    var ruler: RulerParts? {
        guard let value else { return nil }
        let bounds = [band.low, band.high, optimal.low, optimal.high,
                      goal?.low, goal?.high].compactMap { $0 }
        guard !bounds.isEmpty else { return nil }
        let was = series.count > 1 ? series[series.count - 2].value : nil
        let marks = [value] + bounds + [was].compactMap { $0 }
        let scale = MarkerScale(marks: marks, bandLow: band.low,
                                bandHigh: band.high)
        let words = [
            band.range.map {
                "normal \(Design.digits($0.lowerBound))"
                + "–\(Design.digits($0.upperBound))"
            },
            optimal.range.map {
                "optimal \(Design.digits($0.lowerBound))"
                + "–\(Design.digits($0.upperBound))"
            },
        ].compactMap { $0 }
        // The ends are rounded outward to a number a person would say, and
        // never to more decimals than this marker's own readings carry.
        let ends = scale.ends(marks.map { Optional($0) })
        return RulerParts(
            at: scale.at(value),
            normal: scale.band(band.low, band.high),
            optimal: scale.band(optimal.low, optimal.high),
            target: goal.flatMap { scale.band($0.low, $0.high) },
            ghost: was.map { scale.at($0) },
            low: ends.low,
            mid: words.joined(separator: " · "),
            high: "\(ends.high) \(unit ?? "")"
                .trimmingCharacters(in: .whitespaces))
    }

    /// "−92 since Dec 9 2025", or nil when there is only one draw.
    var delta: (value: String, since: String)? {
        guard series.count > 1 else { return nil }
        let was = series[series.count - 2]
        let now = series[series.count - 1]
        let change = now.value - was.value
        let sign = change > 0 ? "+" : (change < 0 ? "−" : "")
        return ("\(sign)\(Design.number(abs(change)))",
                "since \(Design.day(was.date))")
    }
}
