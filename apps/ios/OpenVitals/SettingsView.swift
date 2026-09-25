import SwiftUI

/// Settings, reached from Today's gear. The Apple Health permission list with
/// its per-type counts, the honest "seen, not used", the account and the
/// server. The sync itself is unchanged: this screen only names it.
///
/// Phase 38 D8: on `HyScreen` with the plum header (how many types reach the
/// server as its value, who is signed in under it) and a close, since the
/// gear opens it as a sheet. Every part is a shelf with one `hyCard`.
struct SettingsView: View {
    @ObservedObject private var model = HealthSyncModel.shared
    @ObservedObject private var session = Session.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var base = Api.base
    @State private var mustAsk = true
    @State private var confirmResync = false
    @State private var showServer = false
    #if DEBUG
    @State private var showGallery = false
    #endif

    /// Built by `init()`: asks HealthKit and the server. The tests draw the
    /// screen without either.
    private let live: Bool

    init() { live = true }

    /// The screen with nothing asked: the tests.
    init(asking: Bool) { live = asking }

    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        HyScreen(refresh: live ? { await model.loadTotals() } : nil) {
            HyHeader(title: "Settings",
                     value: Self.sending(model.totals).map { Design.number($0) },
                     word: "of \(Design.plural(HK.types.count, "type", "types")) sending",
                     line: Self.account(email: session.email,
                                        signedIn: session.signedIn, base: Api.base)) {
                close
            }
        } content: {
            health
            types
            if !model.seenNotUsed.isEmpty { seenNotUsed }
            server
            account
            #if DEBUG
            gallery
            #endif
        }
        .environment(\.colorScheme, .light)
        .task {
            guard live else { return }
            mustAsk = await model.needsAsking()
            await model.loadTotals()
        }
    }

    // MARK: - the header

    /// Types with a row on the server; nil until the server has answered.
    static func sending(_ totals: Api.Totals?) -> Int? {
        guard let totals else { return nil }
        return HK.types.filter { (totals.byType[$0.shortType]?.count ?? 0) > 0 }.count
    }

    /// "you@example.com · vitals.chocksy.com": who, and where this phone
    /// sends. The email is the one typed at sign-in; a session adopted any
    /// other way has none, and says "signed in".
    static func account(email: String?, signedIn: Bool, base: String) -> String {
        let who = signedIn ? (email.flatMap { $0.isEmpty ? nil : $0 } ?? "signed in")
                           : "signed out"
        let host = URL(string: base)?.host ?? base
        return "\(who) · \(host)"
    }

    /// The Hybrid close: 44, plum2, the cross in cream, as Research's.
    private var close: some View {
        Button { dismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Hy.cream)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Hy.plum2))
                .contentShape(Circle())
        }
        .buttonStyle(Pressed(scale: 0.92))
        .accessibilityLabel("Close")
    }

    // MARK: - Apple Health

    private var health: some View {
        SettingsShelf("Apple Health", sendingNote) {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                if !model.available {
                    FinePrint("Health data is not available on this device.")
                }
                HyAction(title: model.busy ? "Syncing…" : "Sync now") {
                    Task { await model.syncAll() }
                }
                .disabled(!model.available || model.busy)
                HStack(spacing: DesignTokens.s8) {
                    // iOS asks once; after that only the Health app changes
                    // what this app may read.
                    HyAction(title: mustAsk ? "Allow Health access" : "Change in Health",
                             kind: .secondary) {
                        if mustAsk {
                            Task {
                                await model.requestAuthorization()
                                mustAsk = await model.needsAsking()
                            }
                        } else if let url = URL(string: "x-apple-health://") {
                            openURL(url)
                        }
                    }
                    .disabled(!model.available)
                    HyAction(title: "Resync everything", kind: .text, wide: false) {
                        confirmResync = true
                    }
                    .disabled(!model.available || model.busy)
                }
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    if model.busy, !model.progress.line.isEmpty {
                        Text(model.progress.line).hType(13, .medium, Hy.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if !model.status.isEmpty {
                        Text(model.status).hType(13, .medium, Hy.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text(model.totals?.headline ?? "asking the server…")
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                FinePrint("Counted in the database, not by this phone. iOS never "
                     + "reveals which types you granted, so a type with nothing "
                     + "sent is either empty or not granted. To change access, "
                     + "open Health, tap your picture, then Apps, then OpenVitals.")
                FinePrint("A normal sync sends again, whole, every day that changed. "
                     + "Resync forgets its place and reads every year Apple Health "
                     + "holds; the server writes each day over the old one, so "
                     + "nothing doubles.")
            }
            .motion(Curve.ease.animation(0.32), value: model.busy)
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

    private var sendingNote: String {
        "\(Design.plural(HK.types.count, "type", "types")) · "
            + "\(Self.sending(model.totals).map { Design.number($0) } ?? "—") sending"
    }

    /// Every type, one row each: a green dot when the server holds rows for
    /// it, and the one line that says what it holds. A dot, not a tick: the
    /// row reports, it does not toggle.
    private var types: some View {
        SettingsShelf("Every type", "what the server holds") {
            let _ = model.revision
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(HK.types.enumerated()), id: \.element.identifier) { i, spec in
                    if i > 0 { Hy.line.frame(height: 1) }
                    typeRow(spec)
                }
            }
        }
    }

    /// The 8 dot, the type's name, and its line.
    private func typeRow(_ spec: HKTypeSpec) -> some View {
        let state = model.state.state(spec.identifier)
        let server = model.totals?.byType[spec.shortType]
        let on = (server?.count ?? 0) > 0
        return HStack(alignment: .top, spacing: DesignTokens.s13) {
            Circle().fill(on ? Hy.green : Hy.paper3)
                .frame(width: 8, height: 8)
                .padding(.top, 7)
            VStack(alignment: .leading, spacing: 2) {
                Text(spec.name).hType(15, .medium, Hy.ink)
                Text(Self.detail(spec.shortType, state, server, stamp: Self.stamp))
                    .hType(11, .regular, state.lastError == nil ? Hy.ink3 : Hy.rose)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, DesignTokens.s8)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
        .accessibilityValue(on ? "sending" : "nothing sent")
    }

    static func detail(_ shortType: String, _ state: SyncState.TypeState,
                       _ server: Api.TypeTotal?, stamp: DateFormatter) -> String {
        if let error = state.lastError {
            return "\(shortType) · failed (will resume next sync): \(error)"
        }
        var parts = [shortType]
        if let server, server.count > 0 {
            parts.append(Api.Totals.count(server.count))
        }
        if let server, let first = server.first {
            parts.append("server has \(first) to \(server.last ?? first)")
        } else {
            parts.append("nothing on the server · syncs the moment it lands")
        }
        if let at = state.lastSent {
            parts.append("last sent \(stamp.string(from: at))")
        }
        if let resumed = state.resumed, resumed > 0 {
            parts.append("resumed after retry ×\(resumed)")
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - the rest

    private var seenNotUsed: some View {
        SettingsShelf("Seen, not used", Design.plural(model.seenNotUsed.count, "type", "types")) {
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                ForEach(model.seenNotUsed, id: \.self) { name in
                    Text(name).hType(13, .medium, Hy.ink)
                }
                FinePrint("Your phone offered these HealthKit types and the engine has "
                     + "no rule for them. They are named here rather than silently "
                     + "dropped, and nothing about them is sent.")
                    .padding(.top, DesignTokens.s8)
            }
        }
    }

    private var server: some View {
        SettingsShelf("Server", URL(string: Api.base)?.host ?? Api.base) {
            HyFold(open: $showServer) {
                VStack(alignment: .leading, spacing: DesignTokens.s8) {
                    TextField("", text: $base,
                              prompt: Text(verbatim: "Base URL").foregroundColor(Hy.ink3))
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(Hy.ink)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .padding(.horizontal, DesignTokens.s13)
                        .frame(height: 44)
                        .background(Capsule().fill(Hy.paper))
                    HStack(spacing: DesignTokens.s8) {
                        HyAction(title: "Use this server", kind: .secondary, wide: false) {
                            Api.base = base
                            base = Api.base
                            model.reset()
                            Api.clearCache()
                        }
                        Spacer(minLength: 0)
                    }
                    HyAction(title: "Reset to \(Api.productionBase)", kind: .text, wide: false) {
                        Api.base = Api.productionBase
                        base = Api.base
                        model.reset()
                        Api.clearCache()
                    }
                }
                .padding(.top, DesignTokens.s8)
            } label: {
                Text("Where this phone sends").hType(13, .medium, Hy.ink2)
            }
        }
    }

    #if DEBUG
    /// The design system, section by section, so the phone can be held next
    /// to the browser. Debug builds only.
    private var gallery: some View {
        SettingsShelf("Design system", "sections 03–15") {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                HStack {
                    HyAction(title: "Open the gallery", kind: .secondary, wide: false) {
                        showGallery = true
                    }
                    Spacer(minLength: 0)
                }
                FinePrint("Every component in every state, in the same order and "
                     + "with the same sample values as system.html.")
            }
        }
        .sheet(isPresented: $showGallery) { GalleryView() }
    }
    #endif

    private var account: some View {
        SettingsShelf("Account", session.signedIn ? "signed in" : "signed out") {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                if let email = session.email, !email.isEmpty {
                    Text(email).hType(15, .medium, Hy.ink)
                }
                HyAction(title: "Sign out", kind: .destructive) {
                    Task { await session.signOut() }
                }
                FinePrint("Email and password only. Google sign-in is on the website.")
            }
        }
    }
}

// MARK: - the parts

/// One shelf of Settings: its title and note, one card, 21 under it.
private struct SettingsShelf<Content: View>: View {
    let title: String
    let sub: String
    @ViewBuilder var content: Content

    init(_ title: String, _ sub: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.sub = sub
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ShelfTitle(title, sub)
            content.hyCard()
        }
        .padding(.bottom, DesignTokens.s21)
    }
}

/// The small print under a card's controls: 11, ink3, as many lines as it
/// takes.
private struct FinePrint: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).hType(11, .regular, Hy.ink3)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A fold in the Hybrid look: the label and a chevron that turns, the
/// content under it on `Curve.ease`. `DisclosureGroup` draws its chevron in
/// the system tint whatever `.tint` says.
struct HyFold<Label: View, Content: View>: View {
    @Binding var open: Bool
    @ViewBuilder var content: Content
    @ViewBuilder var label: Label

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { open.toggle() } label: {
                HStack(spacing: DesignTokens.s8) {
                    label
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Hy.ink3)
                        .rotationEffect(.degrees(open ? 90 : 0))
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(open ? "open" : "closed")
            if open { content.transition(.opacity) }
        }
        .motion(Curve.ease.animation(0.32), value: open)
    }
}

/// The Hybrid's buttons (phase 38 D8). Lime is the one thing to do: a 55
/// capsule with plum words. Plum is the second thing, 44 tall; rose on its
/// soft fill is the one that loses something; `.text` is plum words alone.
struct HyAction: View {
    enum Kind { case primary, secondary, destructive, text }

    let title: String
    var kind: Kind = .primary
    /// Full width; false hugs the words.
    var wide = true
    let action: () -> Void

    @Environment(\.isEnabled) private var enabled

    var body: some View {
        Button(action: action) {
            Text(title)
                .hType(15, .semibold, ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, kind == .text ? DesignTokens.s8 : DesignTokens.s21)
                .frame(maxWidth: wide ? .infinity : nil)
                .frame(height: kind == .primary ? 55 : 44)
                .background(Capsule().fill(fill))
                .contentShape(Capsule())
        }
        .buttonStyle(Pressed(scale: 0.96))
        .opacity(enabled ? 1 : 0.45)
    }

    private var ink: Color {
        switch kind {
        case .primary: return Hy.plum
        case .secondary: return Hy.cream
        case .destructive: return Hy.rose
        case .text: return Hy.plum
        }
    }

    private var fill: Color {
        switch kind {
        case .primary: return Hy.lime
        case .secondary: return Hy.plum
        case .destructive: return Hy.roseSoft
        case .text: return .clear
        }
    }
}

#if DEBUG
#Preview("Settings") {
    SettingsView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
