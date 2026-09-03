import SwiftUI

/// Body. The day list the web draws, on the same columns: name, type and
/// source, date, value with unit, state word. A type with nothing in it is
/// listed and says so; it is never dropped.
struct BodyView: View {
    @ObservedObject private var health = HealthSyncModel.shared
    @State private var day: Api.BodyDay?
    @State private var error = ""

    var body: some View {
        Screen(title: "Body", icon: "arrow.triangle.2.circlepath",
               iconLabel: "Sync now",
               action: { Task { await sync() } },
               refresh: { await sync() }) {
            if let day {
                Panel(title: "Apple Health", meta: meta(day)) {
                    VStack(spacing: 0) {
                        ForEach(Array(day.rows.enumerated()), id: \.element.id) { i, row in
                            if i > 0 { Hair().padding(.vertical, Design.s8) }
                            BodyRow(row: row)
                        }
                    }
                }
                Caption("Every row names its HealthKit type and the device that "
                        + "wrote it. A type with nothing in it is listed and says "
                        + "so; it is never dropped.")
                if health.busy, !health.progress.line.isEmpty {
                    Caption(health.progress.line)
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

    private func meta(_ day: Api.BodyDay) -> String {
        let types = Design.plural(day.synced.types, "type", "types")
        guard let at = Design.clock(day.synced.lastAt) else {
            return "\(types) · nothing synced yet"
        }
        return "\(types) · last sync \(at)"
    }

    private func load() async {
        do {
            day = try await Api.body()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Pull to sync: the phone sends what is new, then the day list is asked
    /// again. The sync itself is unchanged.
    private func sync() async {
        if health.available, !health.busy, !Fixtures.on { await health.syncAll() }
        await load()
    }
}

/// One HealthKit type on one day.
struct BodyRow: View {
    let row: Api.BodyDay.Row

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Design.s8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .ovType(.sm, weight: .medium)
                    .foregroundStyle(Design.ink)
                Text(row.provenance)
                    .ovType(.xs)
                    .foregroundStyle(Design.ink3)
                if !row.note.isEmpty {
                    Text(row.note).ovType(.xs).foregroundStyle(Design.ink3)
                }
            }
            Spacer(minLength: Design.s8)
            VStack(alignment: .trailing, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(row.display)
                        .ovType(.md, mono: true)
                        .foregroundStyle(Design.ink)
                    if let unit = row.unit, !unit.isEmpty, row.value != nil {
                        Text(unit).ovType(.xs).foregroundStyle(Design.ink3)
                    }
                }
                if !row.word.isEmpty {
                    Text(row.word)
                        .ovType(.xs)
                        .foregroundStyle(Design.colour(forWord: row.word))
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

#if DEBUG
#Preview("Body") {
    BodyView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
