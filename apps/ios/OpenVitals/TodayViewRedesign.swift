import SwiftUI

/// Today, re-laid-out.
///
/// The shape comes from two reference screens in the EpicPxls "MindfulMe"
/// mobile kit (`mindfulme-mental-health-companion-mobile-app`):
///
///  * **Home** — a tinted greeting band at the top, then a 2×2 grid of small
///    stat tiles, then one tinted insight callout. The grid is the borrowed
///    idea: the shipping `TodayView` puts Body / Blood / Plan in a horizontal
///    `ScrollView`, so the third card lives off-screen and nobody scrolls a
///    three-item rail. Four tiles in a grid are all visible at once.
///  * **Your Progress** — a row of segment pills under the title, and a
///    "Goal review" block of compact labelled bars near the bottom. The pills
///    become a goal filter here; the compact bars become `GoalRow`s, so only
///    the goal you are actually looking at pays for a full `GoalCard`.
///
/// Nothing from the reference's feature set came across: no badges, no streaks,
/// no mood, no audio. Every number below is one OpenVitals already serves.
struct TodayViewRedesign: View {
    @State private var today: Api.Today?
    @State private var plan: Api.PlanDay?
    @State private var meals: Api.MealDay?
    @State private var papers: [Api.Paper] = []
    @State private var error = ""
    @State private var ticking: Set<String> = []
    @State private var settings = false
    @State private var research = false
    @State private var lens: Lens = .all
    @Environment(\.openURL) private var openURL

    /// The segment pills off the reference's Progress screen. They filter what
    /// is already on the page; they never ask the server for anything new.
    private enum Lens: String, CaseIterable, Identifiable {
        case all = "All"
        case off = "Needs work"
        case ok = "On target"

        var id: String { rawValue }

        func keeps(_ goal: Api.Today.Goal) -> Bool {
            switch self {
            case .all: return true
            case .off: return Design.isOff(goal.word) || goal.word == "borderline"
            case .ok: return goal.word == "optimal"
            }
        }
    }

    var body: some View {
        Screen(title: "Today", icon: "gearshape", iconLabel: "Settings",
               action: { settings = true }, refresh: { await load() }) {
            if let today {
                hero(today)
                tiles(today)
                if let line = insight(today) { callout(line) }
                if !today.goals.isEmpty {
                    lenses
                    goals(today)
                }
                NavyCard(label: "Status",
                         number: Design.number(today.status.off),
                         glyph: today.status.off > 0,
                         title: title(today.status),
                         counts: counts(today.status),
                         tone: today.sentence.tone)
                systems(today.systems)
                research(rows: papers)
            } else if error.isEmpty {
                Panel { Text("Asking the server…").ovType(.sm).foregroundStyle(Design.ink3) }
            } else {
                Panel(title: "Nothing to show") {
                    Text(error).ovType(.sm).foregroundStyle(Design.ink2)
                }
            }
        }
        .task { await load() }
        .sheet(isPresented: $settings) { SettingsView() }
        .sheet(isPresented: $research) { ResearchView() }
    }

    // MARK: - hero

    /// The greeting band. MindfulMe's Home screen leads with a tinted block
    /// carrying the person's name, the date and one status pill, before any
    /// data. Ours carries the date, the engine's sentence, and the same dot the
    /// rest of the app uses for tone — a raised tile rather than a bare
    /// paragraph, so the sentence reads as the headline it is.
    private func hero(_ t: Api.Today) -> some View {
        Tile(radius: DesignTokens.rHero, padding: DesignTokens.s21, raised: true) {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                    Text(Design.longDay(todayISO))
                        .ovType(.xs, weight: .medium, mono: true)
                        .textCase(.uppercase)
                        .ovTracking(0.1, .xs)
                        .foregroundStyle(Design.ink3)
                    Spacer(minLength: 0)
                    StateDot(word: word(for: t.sentence.tone))
                }
                (Text(t.sentence.head).foregroundStyle(Design.ink)
                    + Text(" ") + Text(t.sentence.tail).foregroundStyle(Design.ink2))
                    .ovType(.lg, leading: 1.35)
                    .ovTracking(-0.02, .lg)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var todayISO: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    private func word(for tone: String) -> String {
        switch tone {
        case "bad": return "off"
        case "warn": return "borderline"
        case "ok": return "good"
        default: return "never measured"
        }
    }

    // MARK: - the 2×2 tile grid

    /// The one structural borrow. MindfulMe's Home lays four small cards in a
    /// 2×2 grid — icon and label on top, the number under it, one quiet line of
    /// context at the bottom — which is exactly `RailCard`'s anatomy. So the
    /// rail loses its horizontal scroll and gains a fourth tile (Meals), which
    /// the app has data for and the old rail had no room for.
    private func tiles(_ t: Api.Today) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: DesignTokens.s13),
                            GridItem(.flexible(), spacing: DesignTokens.s13)],
                  spacing: DesignTokens.s13) {
            RailCard(label: "Body",
                     number: t.body.headline ?? "—",
                     unit: t.body.unit,
                     line: t.body.line)
            RailCard(label: "Blood",
                     number: Design.number(t.blood.total),
                     line: bloodLine(t),
                     tone: t.blood.off > 0 ? "bad" : "ok")
            RailCard(label: "Plan",
                     number: t.plan.headline,
                     line: planLine(t.plan),
                     tone: t.plan.todo == 0 ? "ok" : "none")
            RailCard(label: "Meals",
                     number: Design.number(meals?.totals.kcal),
                     unit: meals?.totals.kcal == nil ? nil : "kcal",
                     line: mealLine())
        }
    }

    private func bloodLine(_ t: Api.Today) -> String {
        var parts = ["\(Design.plural(t.blood.off, "marker off", "markers off"))"]
        if let draw = t.status.drawDate { parts.append("\(Design.day(draw)) draw") }
        return parts.joined(separator: " · ")
    }

    private func planLine(_ card: Api.Today.PlanCard) -> String {
        guard let next = card.next ?? plan?.rows.first(where: { !$0.done })?.title
        else { return "done today" }
        let at = plan?.rows.first { $0.title == next }?.time
            .map { " at \($0)" } ?? ""
        return "next · \(next.lowercased())\(at)"
    }

    private func mealLine() -> String {
        guard let meals else { return "nothing logged yet" }
        guard !meals.meals.isEmpty else { return "nothing logged yet" }
        var parts = [Design.plural(meals.meals.count, "meal", "meals")]
        if let p = meals.totals.proteinG { parts.append("\(Design.number(p)) g protein") }
        if meals.totals.estimated { parts.append("est.") }
        return parts.joined(separator: " · ")
    }

    // MARK: - the insight callout

    /// MindfulMe's "Today's Insight" — one tinted strip under the grid holding
    /// a single sentence, not a card of its own. The sentence here is the pace
    /// line of the goal furthest from its band, because that is the one thing
    /// on this screen that is about to change. With no goals and no projection
    /// there is no strip at all, rather than a strip that says nothing.
    private func insight(_ t: Api.Today) -> String? {
        guard let goal = t.goals
            .filter({ ($0.toGo ?? 0) > 0 })
            .max(by: { ($0.toGo ?? 0) < ($1.toGo ?? 0) }) else { return nil }
        let pace = goal.pace
        guard pace != "no projection yet" else { return nil }
        return "\(goal.name) · \(goal.toGoLine) · \(pace)"
    }

    private func callout(_ line: String) -> some View {
        HStack(alignment: .top, spacing: DesignTokens.s13) {
            Image(systemName: "sparkles")
                .font(.system(size: DesignTokens.typeSm))
                .foregroundStyle(Design.ink2)
            Text(line)
                .ovType(.sm, leading: 1.45)
                .foregroundStyle(Design.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(DesignTokens.s13)
        .background(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                     style: .continuous).fill(Design.sky))
        .accessibilityElement(children: .combine)
    }

    // MARK: - goals

    /// The pill row off the reference's Progress screen, built out of the
    /// system's own `Chip` rather than a new control.
    private var lenses: some View {
        HStack(spacing: DesignTokens.s8) {
            ForEach(Lens.allCases) { option in
                Button { lens = option } label: {
                    Chip(quiet: lens != option, ink: lens == option) {
                        Text(option.rawValue)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(lens == option ? [.isSelected] : [])
            }
            Spacer(minLength: 0)
        }
    }

    /// The hierarchy borrowed from "Goal review": the shipping screen gives
    /// every goal a full `GoalCard`, which pushes Status and Systems below two
    /// or three screenfuls. Here the first goal in the current lens keeps the
    /// card — ruler, moves, tick boxes — and the rest collapse into one panel
    /// of `GoalRow`s, the compact labelled bar the reference uses for
    /// everything it is not currently talking about.
    @ViewBuilder
    private func goals(_ t: Api.Today) -> some View {
        let shown = t.goals.filter { lens.keeps($0) }
        if shown.isEmpty {
            Panel(title: "Goals") {
                Meta("Nothing in this view.")
            }
        } else {
            card(shown[0], day: plan?.day)
            if shown.count > 1 {
                Panel(title: "Other goals",
                      meta: Design.number(shown.count - 1)) {
                    RowList(count: shown.count - 1) { i in
                        let goal = shown[i + 1]
                        GoalRow(goal: goal.name,
                                meta: goal.toGoLine,
                                target: goal.band,
                                progress: progress(goal))
                    }
                }
            }
        }
    }

    /// How far along the bar sits. `MarkerScale` already places a value inside
    /// its band for the ruler, so the row reuses that placement rather than
    /// inventing a second idea of progress.
    private func progress(_ goal: Api.Today.Goal) -> Double {
        min(max(TodayView.scale(goal).at, 0), 1)
    }

    private func card(_ goal: Api.Today.Goal, day: String?) -> some View {
        let scale = TodayView.scale(goal)
        return GoalCard(
            name: goal.name,
            value: Design.number(goal.value),
            unit: goal.unit,
            target: goal.band,
            meta: [goal.target.due.map { "due \(Design.day($0))" },
                   goal.toGoLine].compactMap { $0 }.joined(separator: " · "),
            word: goal.word,
            at: scale.at,
            band: scale.band,
            low: scale.low,
            mid: goal.band,
            high: scale.high,
            pace: goal.pace,
            moves: goal.moves.enumerated().map { i, move in
                GoalCard.Move(id: "\(goal.code)|\(i)", title: move.title,
                              done: move.done,
                              busy: ticking.contains("\(goal.code)|\(i)"))
            },
            tick: { move in Task { await tick(goal, move) } })
    }

    // MARK: - status, systems, research

    private func title(_ s: Api.Today.Status) -> String {
        s.off == 0
            ? "Steady · nothing off"
            : "Attention · \(Design.plural(s.off, "marker off", "markers off"))"
    }

    private func counts(_ s: Api.Today.Status) -> [String] {
        var lines = ["\(Design.number(s.optimal)) optimal · "
                     + "\(Design.number(s.borderline)) normal · "
                     + "\(Design.number(s.off)) off"]
        if let drawDate = s.drawDate { lines.append("\(Design.day(drawDate)) draw") }
        return lines
    }

    /// The reference's Progress screen puts its densest, least urgent block
    /// last. Systems is ours, and the off ones sort to the front so the chip
    /// row reads worst-first instead of alphabetically.
    private func systems(_ rows: [Api.Today.System]) -> some View {
        let sorted = rows.sorted { a, b in
            let rank: (String) -> Int = { w in
                if Design.isOff(w) { return 0 }
                if w.lowercased() == "borderline" { return 1 }
                if Design.hollow(w) { return 3 }
                return 2
            }
            return rank(a.word) == rank(b.word)
                ? a.name < b.name
                : rank(a.word) < rank(b.word)
        }
        return Panel(title: "Systems", meta: Design.number(rows.count)) {
            Flow {
                ForEach(sorted) { system in
                    SystemChip(name: system.name, word: system.word)
                }
            }
        }
    }

    @ViewBuilder
    private func research(rows: [Api.Paper]) -> some View {
        let picked = NewForYou.pick(rows)
        if picked.isEmpty {
            ResearchRow(rows: rows) { research = true }
        } else {
            NewForYou(rows: picked) { paper in
                if let url = paper.url.flatMap(URL.init(string:)) { openURL(url) }
            }
            ResearchRow(rows: rows) { research = true }
        }
    }

    // MARK: - data

    private func load() async {
        do {
            today = try await Api.today()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        plan = try? await Api.planToday()
        meals = try? await Api.meals()
        papers = (try? await Api.research())?.rows ?? []
    }

    private func tick(_ goal: Api.Today.Goal, _ move: GoalCard.Move) async {
        guard let plan, let row = plan.rows.first(where: {
            $0.title == move.title && $0.itemId != nil
        }), let itemId = row.itemId else { return }
        ticking.insert(move.id)
        defer { ticking.remove(move.id) }
        _ = try? await Api.tick(itemId: itemId, day: plan.day, done: !move.done)
        await load()
    }
}

#if DEBUG
#Preview("Today redesign") {
    TodayViewRedesign()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
