/// Sync: what HealthKit has sent, when, and what it saw that we cannot use.
///
/// Read permission is the one thing HealthKit will not tell an app about: Apple
/// hides it on purpose so a refusal is indistinguishable from an empty store.
/// So this screen does not claim to know. It shows what was actually sent per
/// type, which is the honest version of the same question.
import SwiftUI

struct SyncView: View {
    @ObservedObject private var model = HealthSyncModel.shared
    @ObservedObject private var session = Session.shared
    @State private var base = Api.base
    @State private var mustAsk = true
    @State private var confirmResync = false

    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LabeledContent("Session",
                                   value: session.signedIn ? "signed in" : "signed out")
                    Button("Sign out", role: .destructive) {
                        Task { await session.signOut() }
                    }
                } header: {
                    Text("Account")
                } footer: {
                    Text("Email and password only. Google sign-in is on the website.")
                }

                Section("Apple Health") {
                    if !model.available {
                        Text("Health data is not available on this device.")
                            .foregroundStyle(.secondary)
                    }
                    Button(mustAsk ? "Allow Health access" : "Review Health access") {
                        Task {
                            await model.requestAuthorization()
                            mustAsk = await model.needsAsking()
                        }
                    }
                    .disabled(!model.available)
                    Button(model.busy ? "Syncing…" : "Sync now") {
                        Task { await model.syncAll() }
                    }
                    .disabled(!model.available || model.busy)
                    Button("Resync full history") { confirmResync = true }
                        .disabled(!model.available || model.busy)
                    if model.busy, !model.progress.line.isEmpty {
                        Text(model.progress.line).font(.footnote)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    if !model.status.isEmpty {
                        Text(model.status).font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Text("iOS never reveals which types you granted. A type with nothing sent is either empty or not granted.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text("A normal sync only reads what is new. Resync forgets that place and reads every year Apple Health holds; the server writes each day over the old one, so nothing doubles.")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Section {
                    Text(model.totals?.headline ?? "asking the server…")
                        .font(.callout).monospacedDigit()
                } header: {
                    Text("On the server")
                } footer: {
                    Text("Counted in the database, not by this phone. A reinstall forgets what it sent; the rows stay.")
                }

                Section("Types (\(HK.types.count))") {
                    ForEach(HK.types) { spec in
                        row(spec)
                    }
                }

                if !model.seenNotUsed.isEmpty {
                    Section("Seen, not used") {
                        ForEach(model.seenNotUsed, id: \.self) { name in
                            Text(name).font(.callout)
                        }
                        Text("Your Health app has these and the server maps none of them yet.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }

                Section("Server") {
                    TextField("Base URL", text: $base)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Button("Use this server") { Api.base = base; base = Api.base }
                    Button("Reset to \(Api.productionBase)") {
                        Api.base = Api.productionBase
                        base = Api.base
                    }
                }
            }
            .navigationTitle("Sync")
            .confirmationDialog("Read every year again?",
                                isPresented: $confirmResync,
                                titleVisibility: .visible) {
                Button("Resync full history") {
                    Task { await model.resyncEverything() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This can be tens of thousands of samples and take a while on the phone.")
            }
            .task {
                mustAsk = await model.needsAsking()
                await model.loadTotals()
            }
            .refreshable { await model.loadTotals() }
        }
    }

    @ViewBuilder
    private func row(_ spec: HKTypeSpec) -> some View {
        // `model.revision` is read so a finished sync redraws these rows.
        let _ = model.revision
        let state = model.state.state(spec.identifier)
        let server = model.totals?.byType[spec.shortType]
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(spec.name)
                Spacer()
                // The server's count when it has one, because that is the
                // number a reinstall cannot forget. Steps and the other daily
                // totals land in `daily_logs` and have no per-metric row, so
                // those keep showing what this phone remembers sending.
                Text(count(server, state))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Text(detail(state, server))
                .font(.caption)
                .foregroundStyle(state.lastError == nil ? Color.secondary : Color.red)
        }
    }

    private func count(_ server: Api.TypeTotal?,
                       _ state: SyncState.TypeState) -> String {
        if let server { return Api.Totals.count(server.count) }
        return state.samples == 0 ? "—" : Api.Totals.count(state.samples)
    }

    /// The audit line. A type that failed says so and says it is not lost; a
    /// type that only stumbled says it came back.
    private func detail(_ state: SyncState.TypeState,
                        _ server: Api.TypeTotal?) -> String {
        if let error = state.lastError {
            return "failed (will resume next sync): \(error)"
        }
        var parts: [String] = []
        if let server, let first = server.first {
            parts.append("server has \(first) to \(server.last ?? first)")
        }
        if let at = state.lastSent {
            parts.append("last sent \(Self.stamp.string(from: at))")
        } else if parts.isEmpty {
            parts.append("nothing sent yet")
        }
        if let resumed = state.resumed, resumed > 0 {
            parts.append("resumed after retry ×\(resumed)")
        }
        return parts.joined(separator: " · ")
    }
}
