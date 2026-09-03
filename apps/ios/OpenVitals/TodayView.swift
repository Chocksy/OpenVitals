import SwiftUI

/// Today, native. The sentence, the one navy card, the rail of three, and the
/// twelve systems as chips. No web view, no cookie harvesting, no bridge.
struct TodayView: View {
    @State private var today: Api.Today?
    @State private var plan: Api.PlanDay?
    @State private var error = ""
    @State private var settings = Fixtures.sheet == "settings"

    var body: some View {
        Screen(title: "Today", icon: "gearshape", iconLabel: "Settings",
               action: { settings = true }, refresh: { await load() }) {
            if let today {
                sentence(today.sentence)
                NavyCard(label: "Status",
                         number: Design.number(today.status.off),
                         title: title(today.status),
                         counts: counts(today.status),
                         tone: today.sentence.tone)
                rail(today)
                systems(today.systems)
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
            HStack(alignment: .top, spacing: Design.s8) {
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

    /// "done today · resistance at 17:30". The second half comes from
    /// `/api/plan/today`; without it the card says only what it can prove.
    private func planLine(_ card: Api.Today.PlanCard) -> String {
        guard let next = plan?.rows.first(where: { !$0.done }) else {
            return "done today"
        }
        let at = next.time.map { " at \($0)" } ?? ""
        return "done today · \(next.title.lowercased())\(at)"
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
        // The plan is the card's second line and nothing else. If it fails the
        // card still stands, with one fewer clause.
        plan = try? await Api.planToday()
    }
}

#if DEBUG
#Preview("Today") {
    TodayView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
