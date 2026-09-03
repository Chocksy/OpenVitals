import SwiftUI

/// Settings, reached from Today's gear. The Apple Health permission list with
/// its per-type counts, the honest "seen, not used", the account and the
/// server. The sync itself is unchanged: this screen only names it.
struct SettingsView: View {
    @ObservedObject private var model = HealthSyncModel.shared
    @ObservedObject private var session = Session.shared
    @Environment(\.dismiss) private var dismiss
    @State private var base = Api.base
    @State private var mustAsk = true
    @State private var confirmResync = false
    @State private var showServer = false
    #if DEBUG
    @State private var showGallery = false
    #endif

    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        Screen(title: "Settings", icon: "xmark", iconLabel: "Close",
               action: { dismiss() },
               refresh: { await model.loadTotals() }) {
            health
            if !model.seenNotUsed.isEmpty { seenNotUsed }
            server
            account
            #if DEBUG
            gallery
            #endif
        }
        .task {
            mustAsk = await model.needsAsking()
            await model.loadTotals()
        }
    }

    // MARK: - Apple Health

    private var health: some View {
        Panel(title: "Apple Health", meta: sending) {
            VStack(spacing: 0) {
                if !model.available {
                    Caption("Health data is not available on this device.")
                }
                RowList(count: HK.types.count) { i in
                    typeRow(HK.types[i])
                }
            }
            // `.rowh { margin-top: 13 }` — the ink button, then the text one.
            HStack(spacing: DesignTokens.s13) {
                Button(model.busy ? "Syncing…" : "Sync now") {
                    Task { await model.syncAll() }
                }
                .buttonStyle(.ov(.ink, small: true))
                .disabled(!model.available || model.busy)
                Button("Resync everything") { confirmResync = true }
                    .buttonStyle(.ov(.text, small: true))
                    .disabled(!model.available || model.busy)
                Spacer(minLength: 0)
            }
            Button(mustAsk ? "Allow Health access" : "Review Health access") {
                Task {
                    await model.requestAuthorization()
                    mustAsk = await model.needsAsking()
                }
            }
            .buttonStyle(.ov(.quiet, small: true))
            .disabled(!model.available)
            if model.busy, !model.progress.line.isEmpty {
                Caption(model.progress.line)
            }
            if !model.status.isEmpty { Caption(model.status) }
            Caption(model.totals?.headline ?? "asking the server…")
            Caption("Counted in the database, not by this phone. iOS never "
                    + "reveals which types you granted, so a type with nothing "
                    + "sent is either empty or not granted.")
            Caption("A normal sync only reads what is new. Resync forgets that "
                    + "place and reads every year Apple Health holds; the server "
                    + "writes each day over the old one, so nothing doubles.")
        }
        .confirmationDialog("Read every year again?",
                            isPresented: $confirmResync,
                            titleVisibility: .visible) {
            Button("Resync everything") { Task { await model.resyncEverything() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This can be tens of thousands of samples and take a while on "
                 + "the phone.")
        }
    }

    private var sending: String {
        let total = HK.types.count
        let sending = HK.types.filter { (model.totals?.byType[$0.shortType]?.count ?? 0) > 0 }
            .count
        return "\(Design.plural(total, "type", "types")) · \(Design.number(sending)) sending"
    }

    /// `.checkrow` — the 21 px box, the type's name, and the one line that
    /// says what the server holds for it.
    @ViewBuilder
    private func typeRow(_ spec: HKTypeSpec) -> some View {
        let _ = model.revision
        let state = model.state.state(spec.identifier)
        let server = model.totals?.byType[spec.shortType]
        let on = (server?.count ?? 0) > 0
        CheckRow(label: spec.name,
                 caption: detail(spec, state, server),
                 on: on)
    }

    private func detail(_ spec: HKTypeSpec, _ state: SyncState.TypeState,
                        _ server: Api.TypeTotal?) -> String {
        if let error = state.lastError {
            return "\(spec.shortType) · failed (will resume next sync): \(error)"
        }
        var parts = [spec.shortType]
        if let server, server.count > 0 {
            parts.append(Api.Totals.count(server.count))
        }
        if let server, let first = server.first {
            parts.append("server has \(first) to \(server.last ?? first)")
        } else {
            parts.append("nothing on the server · syncs the moment it lands")
        }
        if let at = state.lastSent {
            parts.append("last sent \(Self.stamp.string(from: at))")
        }
        if let resumed = state.resumed, resumed > 0 {
            parts.append("resumed after retry ×\(resumed)")
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - the rest

    private var seenNotUsed: some View {
        Panel(title: "Seen, not used",
              meta: Design.plural(model.seenNotUsed.count, "type", "types")) {
            VStack(alignment: .leading, spacing: Design.s5) {
                ForEach(model.seenNotUsed, id: \.self) { name in
                    Text(name).ovType(.sm).foregroundStyle(Design.ink)
                }
            }
            Caption("Your phone offered these HealthKit types and the engine has "
                    + "no rule for them. They are named here rather than silently "
                    + "dropped, and nothing about them is sent.")
        }
    }

    private var server: some View {
        Panel(title: "Server", meta: Api.base) {
            DisclosureGroup(isExpanded: $showServer) {
                VStack(alignment: .leading, spacing: Design.s8) {
                    TextField("Base URL", text: $base)
                        .ovType(.sm, mono: true)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .padding(Design.s8)
                        .background(Design.surfaceHi)
                        .clipShape(RoundedRectangle(cornerRadius: Design.rInner,
                                                    style: .continuous))
                    Button("Use this server") { Api.base = base; base = Api.base }
                        .buttonStyle(.ovQuiet)
                    Button("Reset to \(Api.productionBase)") {
                        Api.base = Api.productionBase
                        base = Api.base
                    }
                    .buttonStyle(.ovText)
                }
                .padding(.top, Design.s8)
            } label: {
                Text("Where this phone sends")
                    .ovType(.xs)
                    .foregroundStyle(Design.ink2)
            }
            .tint(Design.ink2)
        }
    }

    #if DEBUG
    /// The design system, section by section, so the phone can be held next
    /// to the browser. Debug builds only.
    private var gallery: some View {
        Panel(title: "Design system", meta: "sections 03–15") {
            Button("Open the gallery") { showGallery = true }
                .buttonStyle(.ov(.quiet, small: true))
            Caption("Every component in every state, in the same order and "
                    + "with the same sample values as system.html.")
        }
        .sheet(isPresented: $showGallery) { GalleryView() }
    }
    #endif

    private var account: some View {
        Panel(title: "Account",
              meta: session.signedIn ? "signed in" : "signed out") {
            Button("Sign out") { Task { await session.signOut() } }
                .buttonStyle(.ovQuiet)
            Caption("Email and password only. Google sign-in is on the website.")
        }
    }
}

#if DEBUG
#Preview("Settings") {
    SettingsView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
