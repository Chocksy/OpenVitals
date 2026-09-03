import SwiftUI

/// Today, native. Goals first: the sentence names what this person is moving,
/// then one card per goal, then Status, the rail of three, the systems, and
/// the research that moved something.
///
/// With no goal on file the sentence falls back to the loudest system —
/// "Thyroid is the one to move first" — and the goal cards are simply not
/// there. Nothing is invented: an empty `goals` array draws no card.
struct TodayView: View {
    @State private var today: Api.Today?
    @State private var plan: Api.PlanDay?
    @State private var papers: [Api.Paper] = []
    @State private var error = ""
    @State private var ticking: Set<String> = []
    @State private var settings = Fixtures.sheet == "settings"
    @Environment(\.openURL) private var openURL

    var body: some View {
        Screen(title: "Today", icon: "gearshape", iconLabel: "Settings",
               action: { settings = true }, refresh: { await load() }) {
            if let today {
                sentence(today.sentence)
                ForEach(today.goals) { goal in card(goal, day: plan?.day) }
                NavyCard(label: "Status",
                         number: Design.number(today.status.off),
                         glyph: today.status.off > 0,
                         title: title(today.status),
                         counts: counts(today.status),
                         tone: today.sentence.tone)
                rail(today)
                systems(today.systems)
                if !NewForYou.pick(papers).isEmpty {
                    NewForYou(rows: NewForYou.pick(papers)) { paper in
                        if let url = paper.url.flatMap(URL.init(string:)) {
                            openURL(url)
                        }
                    }
                }
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
    }

    // MARK: - the parts

    private func sentence(_ s: Api.Today.Sentence) -> some View {
        (Text(s.head).foregroundStyle(Design.ink)
            + Text(" ") + Text(s.tail).foregroundStyle(Design.ink2))
            .ovType(.md)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// One goal: the value, the band it is aimed at, the ruler with the target
    /// hatched, how far it still has to go, what the pace says and the adopted
    /// moves with today's ticks.
    private func card(_ goal: Api.Today.Goal, day: String?) -> some View {
        let scale = Self.scale(goal)
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

    /// Where the value and the target sit on one track. The scale is the web's
    /// own (`MarkerScale`), read against the target band, which is the only
    /// band `/api/today` carries for a goal.
    static func scale(_ goal: Api.Today.Goal)
        -> (at: Double, band: ClosedRange<Double>?, low: String, high: String) {
        let marks = [goal.value, goal.target.low, goal.target.high]
            .compactMap { $0 }
        guard !marks.isEmpty else { return (0, nil, "", "") }
        let scale = MarkerScale(marks: marks, bandLow: goal.target.low,
                                bandHigh: goal.target.high)
        let ends = scale.ends(marks.map { Optional($0) })
        return (goal.value.map { scale.at($0) } ?? 0,
                scale.band(goal.target.low, goal.target.high),
                ends.low,
                "\(ends.high) \(goal.unit ?? "")"
                    .trimmingCharacters(in: .whitespaces))
    }

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

    private func rail(_ t: Api.Today) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: DesignTokens.s13) {
                RailCard(label: "Body",
                         number: t.body.headline ?? "—",
                         line: [t.body.unit, t.body.line]
                            .compactMap { $0 }.joined(separator: " · "))
                RailCard(label: "Blood",
                         number: Design.number(t.blood.total),
                         line: "markers · last draw \(Design.day(t.status.drawDate))")
                RailCard(label: "Plan",
                         number: t.plan.headline,
                         line: planLine(t.plan))
            }
            .padding(.horizontal, 1)
        }
    }

    /// "done today · resistance at 17:30". `plan.next` names the thing; the
    /// hour comes from `/api/plan/today` when that has loaded. Without either
    /// the card says only what it can prove.
    private func planLine(_ card: Api.Today.PlanCard) -> String {
        guard let next = card.next ?? plan?.rows.first(where: { !$0.done })?.title
        else { return "done today" }
        let at = plan?.rows.first { $0.title == next }?.time
            .map { " at \($0)" } ?? ""
        return "done today · \(next.lowercased())\(at)"
    }

    private func systems(_ rows: [Api.Today.System]) -> some View {
        Panel(title: "Systems", meta: Design.number(rows.count)) {
            Flow {
                ForEach(rows) { system in
                    SystemChip(name: system.name, word: system.word)
                }
            }
        }
    }

    // MARK: - loading

    private func load() async {
        do {
            today = try await Api.today()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        // The plan is the card's second line and the day a tick is written
        // for; the research is one panel. If either fails the screen still
        // stands, with one fewer block.
        plan = try? await Api.planToday()
        papers = (try? await Api.research())?.rows ?? []
    }

    /// Ticking a move here is the same write as ticking it on Plan: one item,
    /// one day, one boolean. The move carries the protocol item's title, so
    /// the id comes from the plan's own row of the same name — a move with no
    /// row on the plan today is shown and cannot be ticked.
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
#Preview("Today") {
    TodayView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
