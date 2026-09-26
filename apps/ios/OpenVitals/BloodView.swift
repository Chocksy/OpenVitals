import SwiftUI

/// Blood, in the Hybrid look. Phase 38 part D2
/// (`docs/plans/2026-09-24-phase38-hybrid-tabs-spec.md`): the plum header
/// with the blood layer of the score, the markers that need a look, where the
/// goals are heading, and every marker `/api/markers` carries.
///
/// The list is read in the order the server sent it: sorted once there,
/// grouped by system, so the phone never re-sorts and the web Markers tab and
/// this one can never disagree.
struct BloodView: View {
    @State private var markers: Api.Markers?
    @State private var today: Api.Today?
    @State private var error = ""
    @State private var query = ""
    @State private var filter = "All"
    @State private var open: Api.Markers.Marker?
    /// Phase 39: Worth a look, the rows Blood opens on.
    @State private var hunches: Api.HunchesBody?
    @State private var desk = HunchDesk()
    /// The corridor row open in place.
    @State private var expanded: String?
    /// The case pushed over the tab ("‹ Blood").
    @State private var pushed: String?
    @Namespace private var rows
    @Environment(\.accessibilityReduceMotion) private var reduce

    /// Built by `init()`: reads the server. The tests hand their data in and
    /// never load.
    private let live: Bool

    init() { live = true }

    /// A screen with its data already in hand: the tests.
    init(markers: Api.Markers?, today: Api.Today?, hunches: Api.HunchesBody? = nil,
         error: String = "", pushed: String? = nil) {
        _markers = State(initialValue: markers)
        _today = State(initialValue: today)
        _hunches = State(initialValue: hunches)
        _pushed = State(initialValue: pushed)
        // The tests never reach the server: a case opens as its row.
        let desk = HunchDesk()
        let rows = hunches.map { $0.open + $0.goodNews + $0.closed } ?? []
        desk.fetch = { id in
            guard let row = rows.first(where: { $0.id == id }) else {
                throw Api.Failure(status: 404, message: "no such hunch")
            }
            return Api.HunchCase(row: row)
        }
        _desk = State(initialValue: desk)
        _error = State(initialValue: error)
        live = false
    }

    var body: some View {
        ZStack {
            screen
            if let pushed {
                casePage(pushed)
                    .transition(reduce ? .opacity : .move(edge: .trailing))
                    .zIndex(1)
            }
        }
        .environment(\.hunchActions, HunchActions(open: push))
        .preference(key: TabBarHiddenKey.self, value: pushed != nil)
    }

    private var screen: some View {
        HyScreen(refresh: live ? { await load() } : nil) {
            HyHeader(title: "Blood", value: value, word: Score.word(layer),
                     line: markers.map(Self.line))
        } content: {
            if let markers {
                if markers.markers.isEmpty {
                    nothingYet
                } else {
                    shelves(markers)
                }
            } else if error.isEmpty {
                Text("Asking the server…").hType(13, .regular, Hy.ink3).hyCard()
            } else {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    CardLabel(text: "Nothing to show", glyph: "exclamationmark.triangle")
                    Text(error).hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .hyCard()
            }
        }
        .task { if live { await load() } }
        .sheet(item: $open) { marker in
            MarkerView(marker: marker, days: markers?.days ?? 365) {
                await load()
            }
        }
    }

    // MARK: - the header

    /// The blood layer of the score, 0–100; nil with no draw.
    private var layer: Int? { today?.score?.result.blood }
    private var value: String? { layer.map { Design.number($0) } }

    /// "82 in range · 22 borderline · 6 off" off the markers' own words. A
    /// marker with no band is in none of the three.
    static func line(_ markers: Api.Markers) -> String {
        guard !markers.markers.isEmpty else { return "No lab results yet" }
        let n = { (word: String) in markers.markers.filter { $0.word == word }.count }
        return "\(Design.number(n("optimal"))) in range · "
            + "\(Design.number(n("borderline"))) borderline · "
            + "\(Design.number(n("off"))) off"
    }

    // MARK: - the shelves

    @ViewBuilder
    private func shelves(_ markers: Api.Markers) -> some View {
        if let glance = hunches?.glance, !glance.isEmpty {
            ShelfTitle("Worth a look", "\(hunches?.open.count ?? 0) open · "
                       + "\(hunches?.goodNews.count ?? 0) good news")
            WorthALook(rows: glance, desk: desk)
                .padding(.bottom, DesignTokens.s21)
        }
        let look = Self.needsALook(markers)
        if !look.isEmpty {
            ShelfTitle("Needs a look", "off and borderline")
            HShelf {
                ForEach(Array(look.enumerated()), id: \.element.id) { i, marker in
                    Button { open = marker } label: { MarkerCard(marker: marker) }
                        .buttonStyle(Pressed(scale: 0.96))
                        .leans(i)
                }
            }
        }
        let goals = Self.headings(today)
        if !goals.isEmpty {
            // `margin-top: 0`: the shelf above ends on its 21 of padding.
            ShelfTitle("Where it's heading", "if you keep the plan")
            HShelf { Headings(goals: goals, today: today) }
        }
        ShelfTitle("Every marker",
                   "\(Design.plural(markers.markers.count, "marker", "markers")) · "
                   + Design.plural(Self.grouped(markers.markers).count, "system", "systems"))
        search
        chips(markers)
        list(markers)
        Text("Every row is a lab reading on your own corridor: the band your "
             + "earlier draws make, with the lab's range as thin lines behind it. "
             + "Rows outside your band come first, then the ones a hunch is "
             + "about. Tap a row for its chart and the marker's details.")
            .hType(11, .regular, Hy.ink3)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, DesignTokens.s21)
            .padding(.top, DesignTokens.s13)
    }

    /// A new person: no draw on file, so nothing to list and nothing to judge.
    private var nothingYet: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            CardLabel(text: "No lab results yet", glyph: "drop")
            Text("Upload a lab report on the web and every marker shows here, "
                 + "with the band it is judged against.")
                .hType(13, .regular, Hy.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .hyCard()
    }

    /// The search field: a 44 capsule on the card colour.
    private var search: some View {
        HStack(spacing: DesignTokens.s8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15))
                .foregroundStyle(Hy.ink3)
            TextField("", text: $query,
                      prompt: Text("ferritin, TSH, LDL…").foregroundColor(Hy.ink3))
                .font(.grotesk(15))
                .foregroundStyle(Hy.ink)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Hy.ink3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear the search")
            }
        }
        .padding(.horizontal, DesignTokens.s13)
        .frame(height: 44)
        .background(Capsule().fill(Hy.card).hShadow(0.12))
        .padding(.horizontal, DesignTokens.s21)
    }

    /// The four state filters with their counts, scrolling sideways; the
    /// chosen one is plum with cream words.
    private func chips(_ markers: Api.Markers) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: DesignTokens.s8) {
                ForEach(Api.Markers.filters, id: \.self) { name in
                    let on = filter == name
                    Button { filter = name } label: {
                        HStack(spacing: DesignTokens.s5) {
                            Text(name).font(.grotesk(13, .semibold))
                            Text(Design.number(markers.count(name)))
                                .font(.grotesk(11, .medium))
                                .opacity(0.7)
                        }
                        .foregroundStyle(on ? Hy.cream : Hy.ink)
                        .padding(.horizontal, DesignTokens.s13)
                        .frame(height: 34)
                        .background(Capsule().fill(on ? Hy.plum : Hy.card))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .motion(Curve.ease.animation(0.2), value: on)
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
        .contentMargins(.horizontal, DesignTokens.s21, for: .scrollContent)
        .scrollIndicators(.hidden)
        .padding(.vertical, DesignTokens.s13)
    }

    @ViewBuilder
    private func list(_ markers: Api.Markers) -> some View {
        let rows = markers.filtered(filter, query: query)
        if rows.isEmpty {
            Text(query.isEmpty
                 ? "Nothing is \(filter.lowercased()) today."
                 : "No marker matches “\(query)”.")
                .hType(13, .regular, Hy.ink2)
                .hyCard()
        } else {
            // 132 markers: a row is built as it comes into view.
            LazyVStack(alignment: .leading, spacing: DesignTokens.s5) {
                ForEach(Self.corridorOrder(rows)) { marker in
                    CorridorRow(marker: marker, open: expanded == marker.code,
                                hunch: hunchRow(marker), space: self.rows,
                                toggle: { toggle(marker.code) },
                                details: { open = marker },
                                how: { id in push(id) })
                }
            }
            .padding(.horizontal, DesignTokens.s21)
        }
    }

    private func hunchRow(_ marker: Api.Markers.Marker) -> Api.HunchRow? {
        guard let id = marker.signal?.hunchId, let h = hunches else { return nil }
        return (h.open + h.goodNews + h.closed).first { $0.id == id }
    }

    private func toggle(_ code: String) {
        Motion.animate(Curve.spring.animation(0.56), reduce: reduce) {
            expanded = expanded == code ? nil : code
        }
    }

    private func push(_ id: String) {
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { pushed = id }
    }

    /// The case as a page over the tab, entered from the trailing edge.
    private func casePage(_ id: String) -> some View {
        ScrollView {
            HunchCaseView(id: id, row: hunches.flatMap { h in
                              (h.open + h.goodNews + h.closed).first { $0.id == id } },
                          desk: desk,
                          back: {
                              Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { pushed = nil }
                          })
                .padding(.horizontal, DesignTokens.s21)
                .padding(.top, DesignTokens.s8)
                .padding(.bottom, DesignTokens.s34)
        }
        .scrollIndicators(.hidden)
        .background { ZStack { Hy.paper; GrainTile() }.ignoresSafeArea() }
    }

    // MARK: - the arithmetic

    /// Phase 39 (55): outside the person's own band first (|z| ≥ 2.5), then
    /// the markers a hunch is about, then the rest, each in the server's order.
    static func corridorOrder(_ rows: [Api.Markers.Marker]) -> [Api.Markers.Marker] {
        let outside = { (m: Api.Markers.Marker) in abs(m.z ?? 0) >= 2.5 }
        return rows.filter(outside)
            + rows.filter { !outside($0) && $0.signal != nil }
            + rows.filter { !outside($0) && $0.signal == nil }
    }

    /// Off first, then borderline, each in the server's order.
    static func needsALook(_ markers: Api.Markers) -> [Api.Markers.Marker] {
        markers.markers.filter { $0.word == "off" }
            + markers.markers.filter { $0.word == "borderline" }
    }

    /// Goals with a projection, the ones the plan moves most first: the same
    /// order as Today's shelf.
    static func headings(_ today: Api.Today?) -> [Api.Today.Goal] {
        (today?.goals ?? []).filter { $0.projection != nil }
            .sorted { Heading.pull($0) > Heading.pull($1) }
    }

    /// The rows of one system stay together in the order the server first met
    /// them, which is what the web's own `Map` does.
    static func grouped(_ rows: [Api.Markers.Marker])
        -> [(name: String, rows: [Api.Markers.Marker])] {
        var order: [String] = []
        var byName: [String: [Api.Markers.Marker]] = [:]
        for row in rows {
            if byName[row.system] == nil { order.append(row.system) }
            byName[row.system, default: []].append(row)
        }
        return order.map { ($0, byName[$0] ?? []) }
    }

    /// How many markers this system has in all, filter or no filter: "1 of 6"
    /// is about the system, not about the list.
    private func total(_ system: String, _ markers: Api.Markers) -> Int {
        markers.markers.filter { $0.system == system }.count
    }

    /// The glyph a system's label carries.
    static func glyph(_ system: String) -> String {
        switch system.lowercased() {
        case "hematology": return "drop"
        case "lipid", "cardiac": return "heart"
        case "metabolic": return "flame"
        case "thyroid", "hormone": return "waveform.path.ecg"
        case "immunology": return "shield"
        case "inflammation": return "bolt"
        case "vitamin", "mineral": return "sun.max"
        case "iron study": return "circle.hexagongrid"
        case "urine", "urinalysis", "renal": return "flask"
        case "hepatic": return "cross.case"
        default: return "testtube.2"
        }
    }

    private func load() async {
        if markers == nil { markers = Api.cachedMarkers() }
        if today == nil { today = Api.cachedToday() }
        if hunches == nil { hunches = Api.cachedHunches() }
        async let asked = try? await Api.today()
        async let seen = try? await Api.hunches()
        do {
            let got = try await Api.markers()
            markers = got
            error = ""
            // `-OVScreen marker` opens the first marker that has a goal, so a
            // screenshot run reaches the marker sheet with no tap.
            if Fixtures.screen == "marker", open == nil {
                open = got.markers.first { $0.goal != nil }
                    ?? got.markers.first { $0.ruler != nil }
            }
        } catch {
            self.error = error.localizedDescription
        }
        // Today failing leaves the header on "—"; the list still draws.
        if let got = await asked { today = got }
        if let got = await seen { hunches = got }
    }
}

// MARK: - the projection shelf

/// Today's projection cards, one per goal, the open one wider. `Heading.Cards`
/// reads a `TodayModel`; Blood has only `/api/today`.
private struct Headings: View {
    let goals: [Api.Today.Goal]
    let today: Api.Today?
    @State private var open: String?

    var body: some View {
        ForEach(Array(goals.enumerated()), id: \.element.id) { i, goal in
            if let p = goal.projection {
                ProjectionCard(goal: goal, projection: p,
                               today: today?.score?.day ?? Api.localDay(),
                               maxChange: today?.score?.maxChange[goal.code],
                               open: open == goal.code) {
                    open = open == goal.code ? nil : goal.code
                }
                .leans(i)
            }
        }
    }
}

// MARK: - a marker, as a card and as a row

/// One card on "Needs a look": the system, the name, the number, its word,
/// the sparkline off its own series and the ruler.
struct MarkerCard: View {
    let marker: Api.Markers.Marker

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(text: marker.system, glyph: BloodView.glyph(marker.system))
            Text(marker.name)
                .hType(21, .semibold, Hy.ink, tracking: -0.02)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.top, DesignTokens.s8)
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s5) {
                Text(Design.number(marker.value))
                    .hType(34, .semibold, Hy.ink, tracking: -0.04)
                if marker.value != nil, let unit = marker.unit, !unit.isEmpty {
                    Text(unit).hType(13, .regular, Hy.ink2)
                }
                Spacer(minLength: DesignTokens.s5)
                Text(marker.word.capitalized)
                    .hType(13, .semibold, HyState.ink(marker.word))
            }
            .lineLimit(1)
            Text(Design.day(marker.date)).hType(11, .regular, Hy.ink3)
            Group {
                if marker.series.count > 1 {
                    HySpark(values: marker.series.map(\.value))
                } else {
                    // One draw is one dot: no line through a single reading.
                    Text("One draw so far").hType(11, .regular, Hy.ink3)
                        .frame(maxWidth: .infinity, maxHeight: .infinity,
                               alignment: .bottomLeading)
                }
            }
            .frame(height: 34)
            .padding(.top, DesignTokens.s8)
            Spacer(minLength: DesignTokens.s13)
            if let ruler = marker.ruler {
                HyRuler(parts: ruler, word: marker.word, mid: false)
            }
        }
        // One height for every card on the shelf, sparkline or not, so the
        // rulers line up along the bottom.
        .frame(height: 199, alignment: .top)
        .todayCard(width: 258)
        .accessibilityElement(children: .combine)
    }
}

/// One row of "Every marker": the name, where it came from and when, the
/// value with its unit, a state dot. 44 tall at least.
struct MarkerLine: View {
    let marker: Api.Markers.Marker

    var body: some View {
        HStack(alignment: .center, spacing: DesignTokens.s13) {
            VStack(alignment: .leading, spacing: 2) {
                Text(marker.name).hType(15, .medium, Hy.ink)
                    .lineLimit(1)
                Text(marker.source).hType(11, .regular, Hy.ink3)
                    .lineLimit(1)
            }
            Spacer(minLength: DesignTokens.s5)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(Design.number(marker.value)).hType(15, .semibold, Hy.ink)
                if marker.value != nil, let unit = marker.unit, !unit.isEmpty {
                    Text(unit).hType(11, .regular, Hy.ink2)
                }
            }
            .lineLimit(1)
            .fixedSize()
            Circle().fill(HyState.ink(marker.word))
                .frame(width: 8, height: 8)
        }
        .padding(.vertical, DesignTokens.s8)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(marker.word)
    }
}

/// Phase 39 (55): one marker as a slim corridor row. The name and unit, the
/// glance corridor, the value and where it sits on the person's own band.
/// A tap opens it in place into the chart, the hunch it belongs to, and the
/// way to the marker's own sheet.
struct CorridorRow: View {
    let marker: Api.Markers.Marker
    let open: Bool
    var hunch: Api.HunchRow?
    let space: Namespace.ID
    let toggle: () -> Void
    let details: () -> Void
    let how: (String) -> Void

    /// "above your band", "below your band", "in your band", "too few draws".
    static func status(_ m: Api.Markers.Marker) -> (word: String, ink: Color) {
        guard m.value != nil else { return ("never measured", Hy.ink3) }
        guard m.personalBand != nil, let z = m.z else { return ("too few draws", Hy.ink3) }
        if z >= 2.5 { return ("above your band", Hy.blood) }
        if z <= -2.5 { return ("below your band", Hy.blood) }
        return ("in your band", Hy.green)
    }

    private var ink: Color {
        marker.signal.map { HunchInk.of($0.kind) } ?? Self.status(marker).ink
    }

    private var lab: [Double?] { [marker.band.low, marker.band.high] }
    private var goal: [Double?]? { marker.goal.map { [$0.low, $0.high] } }

    var body: some View {
        let status = Self.status(marker)
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Button(action: toggle) {
                HStack(spacing: DesignTokens.s8) {
                    VStack(alignment: .leading, spacing: 2) {
                        (Text(marker.name).font(.grotesk(14, .semibold)).foregroundColor(Hy.ink)
                         + Text(marker.unit.map { "  \($0)" } ?? "").font(.grotesk(10, .medium))
                            .foregroundColor(Hy.ink3))
                            .lineLimit(1)
                        Text(status.word).hType(11, .medium, status.ink)
                    }
                    Spacer(minLength: DesignTokens.s5)
                    // The glance grows into the chart below (matched geometry);
                    // its slot stays so the value does not jump.
                    if open || marker.series.count < 2 {
                        MiniCorridor(band: marker.personalBand, lab: lab, goal: goal,
                                     last: marker.value, ink: ink)
                            .opacity(open ? 0 : 1)
                    } else {
                        MiniCorridor(band: marker.personalBand, lab: lab, goal: goal,
                                     last: marker.value,
                                     previous: marker.series[marker.series.count - 2].value,
                                     ink: ink)
                            .matchedGeometryEffect(id: "mini-\(marker.code)", in: space)
                    }
                    Text(marker.value.map(Design.digits) ?? "—")
                        .hType(15, .semibold, Hy.ink)
                        .lineLimit(1)
                        .fixedSize()
                        .frame(minWidth: 40, alignment: .trailing)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityValue(status.word)
            .accessibilityHint(open ? "Closes the chart" : "Opens the chart")

            if open { detail.transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top))) }
        }
        .padding(.horizontal, DesignTokens.s13)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 13, shadow: open ? 0.3 : 0.12)
    }

    @ViewBuilder
    private var detail: some View {
        if marker.series.count > 1 {
            CorridorChart(draws: marker.series.map { CorridorDraw(date: $0.date, value: $0.value) },
                          band: marker.personalBand, lab: lab, goal: goal, ink: ink)
                .frame(height: 150)
                .matchedGeometryEffect(id: "mini-\(marker.code)", in: space)
        } else {
            Text("One draw so far: a corridor needs more.").hType(12, .regular, Hy.ink2)
        }
        if let p = marker.personalBand {
            Text("Your band \(Design.digits(p.low))–\(Design.digits(p.high)) from "
                 + Design.plural(p.n, "draw", "draws") + (p.provisional ? ", provisional" : "")
                 + " · lab \(Design.band(low: marker.band.low, high: marker.band.high, unit: marker.unit ?? ""))")
                .hType(11, .regular, Hy.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        if let hunch {
            VStack(alignment: .leading, spacing: 4) {
                Text(hunch.stamp).hType(10, .bold, HunchInk.of(hunch.kind), tracking: 0.1)
                Text(hunch.line).hType(13, .semibold, Hy.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(DesignTokens.s8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 10).fill(Hy.paper2))
        }
        HStack(spacing: DesignTokens.s8) {
            Button(action: details) { link("Marker details") }
                .buttonStyle(Pressed(scale: 0.94))
            if let id = marker.signal?.hunchId {
                Button { how(id) } label: { link("How we know") }
                    .buttonStyle(Pressed(scale: 0.94))
            }
        }
        .padding(.bottom, DesignTokens.s5)
    }

    private func link(_ text: String) -> some View {
        HStack(spacing: 3) {
            Text(text)
            Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
        }
        .hType(12, .semibold, Hy.ink)
        .padding(.horizontal, DesignTokens.s13)
        .frame(height: 30)
        .background(Capsule().fill(Hy.paper2))
    }
}

// MARK: - the Hybrid ruler and sparkline

/// The ruler in the Hybrid look: a 5 track in paper3, the normal band in
/// green-soft, optimal in green at half, the goal band a dashed plum outline,
/// the value an 8 ink dot and the draw before it a 5 ink3 dot. Under it the
/// scale's ends and, in the sheet, the bands in words.
struct HyRuler: View {
    let parts: Api.Markers.Marker.RulerParts
    let word: String
    /// The middle label ("normal 0–171 · optimal 0–200"): the sheet has room
    /// for it, a card does not.
    var mid = true

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            GeometryReader { g in
                let w = g.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(Hy.paper3).frame(height: 5)
                    if let normal = parts.normal {
                        band(normal, w).fill(Hy.greenSoft).frame(height: 5)
                    }
                    if let optimal = parts.optimal {
                        band(optimal, w).fill(Hy.green.opacity(0.5)).frame(height: 5)
                    }
                    if let target = parts.target {
                        band(target, w)
                            .stroke(Hy.plum, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2.5]))
                            .frame(height: 11)
                    }
                    if let ghost = parts.ghost {
                        dot(5, Hy.ink3).offset(x: w * ghost - 2.5)
                    }
                    dot(8, Hy.ink)
                        .overlay(Circle().strokeBorder(Hy.card, lineWidth: 1.5))
                        .offset(x: w * parts.at - 4)
                }
                .frame(height: 13)
            }
            .frame(height: 13)
            HStack(spacing: DesignTokens.s5) {
                Text(parts.low)
                Spacer(minLength: 0)
                if mid {
                    Text(parts.mid).lineLimit(1).truncationMode(.middle)
                    Spacer(minLength: 0)
                }
                Text(parts.high)
            }
            .hType(11, .regular, Hy.ink3)
            .lineLimit(1)
        }
        .accessibilityElement()
        .accessibilityLabel([parts.mid, "scale \(parts.low) to \(parts.high)"]
            .filter { !$0.isEmpty }.joined(separator: ", "))
    }

    /// A 0…1 stretch of the track as a capsule placed on it.
    private func band(_ range: ClosedRange<Double>, _ w: CGFloat) -> OffsetCapsule {
        OffsetCapsule(x: w * range.lowerBound,
                      width: max(3, w * (range.upperBound - range.lowerBound)))
    }

    private func dot(_ size: CGFloat, _ colour: Color) -> some View {
        Circle().fill(colour).frame(width: size, height: size)
    }
}

/// A capsule `width` wide starting `x` in from the left of its frame.
struct OffsetCapsule: Shape {
    let x: CGFloat
    let width: CGFloat

    func path(in rect: CGRect) -> Path {
        Capsule().path(in: CGRect(x: x, y: rect.minY, width: width, height: rect.height))
    }
}

/// The sparkline: 1.5 ink over the series, the last draw a 5 dot. Two
/// points at least: a line through one reading is a line nobody measured.
struct HySpark: View {
    let values: [Double]

    var body: some View {
        Canvas { ctx, size in
            guard values.count > 1, let low = values.min(), let high = values.max()
            else { return }
            let span = max(high - low, 0.0001)
            // 3 in from every edge, so the end dot is never clipped.
            let inset: CGFloat = 3
            let w = size.width - 2 * inset, h = size.height - 2 * inset
            var path = Path()
            for (i, v) in values.enumerated() {
                let p = CGPoint(x: inset + w * CGFloat(i) / CGFloat(values.count - 1),
                                y: inset + h * (1 - CGFloat((v - low) / span)))
                i == 0 ? path.move(to: p) : path.addLine(to: p)
            }
            ctx.stroke(path, with: .color(Hy.ink),
                       style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            if let last = path.currentPoint {
                ctx.fill(Path(ellipseIn: CGRect(x: last.x - 2.5, y: last.y - 2.5,
                                                width: 5, height: 5)),
                         with: .color(Hy.ink))
            }
        }
        .accessibilityHidden(true)
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
