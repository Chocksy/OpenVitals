/// Sync: what HealthKit has sent, when, and what it saw that we cannot use.
///
/// Read permission is the one thing HealthKit will not tell an app about: Apple
/// hides it on purpose so a refusal is indistinguishable from an empty store.
/// So this screen does not claim to know. It shows what was actually sent per
/// type, which is the honest version of the same question.
import SwiftUI

struct SyncView: View {
    @ObservedObject private var model = HealthSyncModel.shared
    @State private var base = Api.base
    @State private var signIn = false
    @State private var mustAsk = true

    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    LabeledContent("Session",
                                   value: Api.signedIn ? "signed in" : "signed out")
                    Button(Api.signedIn ? "Sign in again" : "Sign in") {
                        signIn = true
                    }
                    if Api.signedIn {
                        Button("Sign out", role: .destructive) { Api.signOut() }
                    }
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
                    if !model.status.isEmpty {
                        Text(model.status).font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Text("iOS never reveals which types you granted. A type with nothing sent is either empty or not granted.")
                        .font(.footnote).foregroundStyle(.secondary)
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
            .sheet(isPresented: $signIn) { SignInView() }
            .task { mustAsk = await model.needsAsking() }
        }
    }

    @ViewBuilder
    private func row(_ spec: HKTypeSpec) -> some View {
        // `model.revision` is read so a finished sync redraws these rows.
        let _ = model.revision
        let state = model.state.state(spec.identifier)
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(spec.name)
                Spacer()
                Text(state.samples == 0 ? "—" : "\(state.samples)")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Text(detail(state))
                .font(.caption)
                .foregroundStyle(state.lastError == nil ? Color.secondary : Color.red)
        }
    }

    private func detail(_ state: SyncState.TypeState) -> String {
        if let error = state.lastError { return error }
        guard let at = state.lastSent else { return "nothing sent yet" }
        return "last sent \(Self.stamp.string(from: at))"
    }
}
