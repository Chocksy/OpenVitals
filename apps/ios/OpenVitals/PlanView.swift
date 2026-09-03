import SwiftUI

/// Plan. The Today column from `plan-month.html`, in clock order, with a tick
/// per row. Ticking here is the same write as ticking on the web: one item,
/// one day, one boolean. Month is a later slice.
struct PlanView: View {
    @State private var plan: Api.PlanDay?
    @State private var error = ""
    @State private var saving: Set<String> = []

    var body: some View {
        Screen(title: "Plan", refresh: { await load() }) {
            if let plan {
                Text(sentence(plan))
                    .ovType(.md)
                    .foregroundStyle(Design.ink)
                Panel {
                    VStack(spacing: 0) {
                        ForEach(Array(plan.rows.enumerated()), id: \.element.id) { i, row in
                            if i > 0 { Hair().padding(.vertical, Design.s8) }
                            PlanRow(row: row, busy: saving.contains(row.id)) {
                                await tick(row)
                            }
                        }
                    }
                }
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
    }

    /// Optimistic: the box fills, the write goes, and a failure puts it back
    /// and says so rather than leaving a tick that was never stored.
    private func tick(_ row: Api.PlanDay.Row) async {
        guard let plan, let itemId = row.itemId else { return }
        let wanted = !row.done
        saving.insert(row.id)
        defer { saving.remove(row.id) }
        self.plan = plan.with(row.id, done: wanted)
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
        let moved = rows.map { row -> Row in
            guard row.id == rowId, row.done != done else { return row }
            return Row(itemId: row.itemId, time: row.time, slot: row.slot,
                       title: row.title, why: row.why, tag: row.tag,
                       done: done, adherence: row.adherence)
        }
        return Api.PlanDay(day: day, done: moved.filter(\.done).count,
                           total: total, rows: moved)
    }
}

/// One occurrence: the hour, the box, the thing, the why, the badge.
struct PlanRow: View {
    let row: Api.PlanDay.Row
    var busy = false
    let tick: () async -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Design.s8) {
            Text(row.time ?? "—")
                .ovType(.xs, mono: true)
                .foregroundStyle(Design.ink3)
                .frame(width: 40, alignment: .leading)
            Button { Task { await tick() } } label: {
                ZStack {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(row.done ? Design.ink : Color.clear)
                        .frame(width: 21, height: 21)
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(row.done ? Design.ink : Design.hair, lineWidth: 1.5)
                        .frame(width: 21, height: 21)
                    if row.done {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Design.canvas)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(busy || row.itemId == nil)
            // A row the report only suggested has no protocol item behind it,
            // so there is nothing to tick yet and the box says so by fading.
            .opacity(row.itemId == nil ? 0.4 : 1)
            .accessibilityLabel(row.title)
            .accessibilityValue(row.itemId == nil ? "not adopted yet"
                                : (row.done ? "done" : "not done"))
            .accessibilityAddTraits(row.done ? [.isButton, .isSelected] : .isButton)

            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .ovType(.sm, weight: .medium)
                    .foregroundStyle(row.done ? Design.ink3 : Design.ink)
                Text(row.why)
                    .ovType(.xs)
                    .foregroundStyle(Design.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                Text(row.badge)
                    .ovType(.xs, mono: row.adherence != nil)
                    .foregroundStyle(Design.ink3)
            }
            Spacer(minLength: 0)
        }
    }
}

#if DEBUG
#Preview("Plan") {
    PlanView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
