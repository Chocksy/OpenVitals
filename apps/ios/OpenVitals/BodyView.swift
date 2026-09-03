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
                    // `.rows { gap: 13 }` — no hairline between them; the
                    // columns do the separating.
                    VStack(alignment: .leading, spacing: DesignTokens.s13) {
                        ForEach(day.rows) { row in BodyRow(row: row) }
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

/// One HealthKit type on one day: `.mrow`. Name, type and source, the value
/// with its unit, and the state word in a 76 px column on the right.
struct BodyRow: View {
    let row: Api.BodyDay.Row

    var body: some View {
        MarkerRow(name: row.name,
                  source: [row.provenance, row.note]
                      .filter { !$0.isEmpty }.joined(separator: " · "),
                  value: row.display,
                  unit: row.value == nil ? nil : row.unit,
                  word: row.word)
    }
}

#if DEBUG
#Preview("Body") {
    BodyView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
