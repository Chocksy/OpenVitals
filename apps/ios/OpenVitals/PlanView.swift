import SwiftUI

/// Plan. The Today column from `plan-month.html`, in clock order, with a tick
/// per row. Ticking here is the same write as ticking on the web: one item,
/// one day, one boolean. Month is a later slice.
struct PlanView: View {
    @State private var plan: Api.PlanDay?
    @State private var error = ""
    @State private var saving: Set<String> = []
    @State private var research = Fixtures.screen == "research"
    @State private var papers: [Api.Paper] = []

    var body: some View {
        Screen(title: "Plan", refresh: { await load() }) {
            if let plan {
                Text(sentence(plan))
                    .ovType(.md)
                    .foregroundStyle(Design.ink)
                Panel {
                    // `.daycol` — the rows in the order the day runs, one
                    // hairline between them and none after the last.
                    VStack(spacing: 0) {
                        ForEach(Array(plan.identified.enumerated()),
                                id: \.element.id) { i, pair in
                            PlanRow(row: pair.row,
                                    busy: saving.contains(pair.id)) {
                                await tick(pair.id, pair.row)
                            }
                            .padding(.vertical, DesignTokens.s13)
                            if i < plan.identified.count - 1 { Hair() }
                        }
                    }
                }
                researchPanel
                Caption("Ticking a row here is the same write as ticking it on "
                        + "the web: one item, one day, one boolean.")
                if !error.isEmpty {
                    Caption(error)
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
        .sheet(isPresented: $research) { ResearchView() }
    }

    /// Research is reached from here, not from the tab bar: it is four
    /// destinations plus the +, and a feed is not one of them.
    @ViewBuilder private var researchPanel: some View {
        if !papers.isEmpty {
            Panel(title: "Research",
                  meta: "\(Design.number(papers.count)) found · "
                  + "\(Design.number(papers.filter { !$0.read }.count)) "
                  + "not read yet") {
                Caption(papers.first(where: { $0.moves != nil }).map {
                    "The newest one that moves something: \($0.title)"
                } ?? "Nothing found so far moves a number of yours.")
                Button("Open research") { research = true }
                    .buttonStyle(.ov(.quiet, small: true))
            }
        }
    }

    /// "Thursday Sep 3. Two of seven done."
    private func sentence(_ plan: Api.PlanDay) -> String {
        "\(Design.longDay(plan.day)). "
            + "\(Design.word(plan.done).capitalized) of "
            + "\(Design.word(plan.total)) done."
    }

    private func load() async {
        do {
            plan = try await Api.planToday()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        papers = (try? await Api.research())?.rows ?? []
    }

    /// Optimistic: the box fills, the write goes, and a failure puts it back
    /// and says so rather than leaving a tick that was never stored.
    private func tick(_ rowId: String, _ row: Api.PlanDay.Row) async {
        guard let plan, let itemId = row.itemId else { return }
        let wanted = !row.done
        saving.insert(rowId)
        defer { saving.remove(rowId) }
        self.plan = plan.with(rowId, done: wanted)
        do {
            _ = try await Api.tick(itemId: itemId, day: plan.day, done: wanted)
            error = ""
        } catch {
            self.plan = plan
            self.error = "That tick did not save: \(error.localizedDescription)"
        }
    }
}

extension Api.PlanDay {
    /// The same day with one row's tick moved, and the counter with it.
    func with(_ rowId: String, done: Bool) -> Api.PlanDay {
        let moved = rows.enumerated().map { index, row -> Row in
            guard Self.rowId(row, at: index) == rowId,
                  row.done != done else { return row }
            return Row(itemId: row.itemId, time: row.time, slot: row.slot,
                       title: row.title, why: row.why, tag: row.tag,
                       done: done, adherence: row.adherence)
        }
        return Api.PlanDay(day: day, done: moved.filter(\.done).count,
                           total: total, rows: moved)
    }
}

/// One occurrence: `.dayrow`. The hour, the box, the thing, the why, the tag.
struct PlanRow: View {
    let row: Api.PlanDay.Row
    var busy = false
    let tick: () async -> Void

    var body: some View {
        DayRow(at: row.time ?? "—",
               what: row.title,
               why: row.why,
               tag: row.badge,
               done: row.done,
               enabled: !busy && row.itemId != nil,
               tick: { Task { await tick() } })
    }
}

#if DEBUG
#Preview("Plan") {
    PlanView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
