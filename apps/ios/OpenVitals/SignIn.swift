/// Sign in, natively, once.
///
/// Phase 23b. The old build showed the site's own `/login` page in a webview:
/// it zoomed on focus, it looked like a browser inside an app, and it was the
/// step that kept failing. This is a plain form that posts to
/// `/api/auth/sign-in/email` and keeps the cookie. After that the app is just
/// an app — the webview is handed the same cookie and never sees a login page.
///
/// Google sign-in is not here on purpose: the owner uses email and password
/// out of 1Password, and OAuth in an app means a whole browser flow.
import SwiftUI

/// Whether there is a session, as a thing SwiftUI can watch. `Api.signedIn`
/// reads the cookie jar, which no view would otherwise be told about.
@MainActor
final class Session: ObservableObject {
    static let shared = Session()

    @Published private(set) var signedIn = Api.signedIn

    private init() {}

    /// Re-read the cookie jar. Called after a sign-in, a sign-out, and after
    /// the webview harvests a cookie of its own.
    func refresh() { signedIn = Api.signedIn }

    func signIn(email: String, password: String) async throws {
        try await Api.signIn(email: email, password: password)
        refresh()
    }

    /// The webview store goes first: emptying it while a navigation is still
    /// in flight is how a signed-out app quietly signs itself back in.
    func signOut() async {
        await Api.signOut()
        refresh()
    }
}

/// `.logincard` on `login.html` — one card on the cream, no shell, no
/// marketing, and no data, which is why it is the only screen in the app with
/// no mono number on it. The card is 377 px wide (the Fibonacci step above
/// 233), 34 px of radius, 34 px of padding, on `--surface-hi`.
///
/// Google sign-in is not here on purpose: the owner uses email and password
/// out of 1Password, and OAuth in an app means a whole browser flow. The
/// server row is the one thing the mockup does not draw, because a phone that
/// is not a developer's does not need it; it is folded away.
struct LoginCard<Content: View>: View {
    let brand: String
    let say: String
    @ViewBuilder var content: Content
    @Environment(\.accessibilityReduceTransparency) private var flat

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: DesignTokens.rHero, style: .continuous)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: DesignTokens.s3) {
                Text(brand)
                    .ovType(.lg)
                    .ovTracking(-0.03, .lg)
                    .foregroundStyle(Design.ink)
                Text(say).ovType(.sm).foregroundStyle(Design.ink3)
            }
            .padding(.bottom, DesignTokens.s21)
            VStack(alignment: .leading, spacing: DesignTokens.s13) { content }
        }
        .padding(DesignTokens.s34)
        .frame(maxWidth: 377, alignment: .leading)
        .background {
            if flat { Design.surfaceFlat }
            else { Design.surfaceHi.background(.ultraThinMaterial) }
        }
        .clipShape(shape)
        .overlay(shape.strokeBorder(flat ? Design.hair : Design.tileEdge,
                                    lineWidth: Design.hairline))
        .shadow(color: Color(red: 0.09, green: 0.086, blue: 0.078).opacity(0.35),
                radius: 27.5, x: 0, y: 34)
    }
}

struct SignInView: View {
    private enum Field { case email, password }

    @ObservedObject private var session = Session.shared
    @FocusState private var focus: Field?
    @State private var email = ""
    @State private var password = ""
    @State private var error = ""
    @State private var busy = false
    @State private var base = Api.base
    @State private var showServer = false

    private var ready: Bool {
        !busy && !email.trimmingCharacters(in: .whitespaces).isEmpty
            && !password.isEmpty
    }

    var body: some View {
        ScrollView {
            card.padding(.horizontal, DesignTokens.s13)
                .padding(.top, DesignTokens.s55)
                .padding(.bottom, DesignTokens.s34)
                .frame(maxWidth: .infinity)
        }
        .background(Design.canvas.ignoresSafeArea())
    }

    var card: some View {
        LoginCard(brand: "OpenVitals", say: "Welcome back.") {
            // Return walks the card: email, password, sign in. Two fields is
            // exactly where that is worth the focus state.
            Inp(label: "Email", text: $email,
                placeholder: "you@example.com",
                content: .username, keyboard: .emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.next)
                .focused($focus, equals: .email)
                .onSubmit { focus = .password }
            Inp(label: "Password", text: $password, secure: true,
                error: error.isEmpty ? nil : error,
                content: .password)
                .submitLabel(.go)
                .focused($focus, equals: .password)
                .onSubmit { submit() }
            Button(busy ? "Signing in…" : "Sign in") { submit() }
                .buttonStyle(.ov(.ink, wide: true))
                .disabled(!ready)
                .opacity(ready ? 1 : 0.45)
            Text("The same email and password as the website.")
                .ovType(.sm)
                .foregroundStyle(Design.ink3)
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)
            Hair()
            server
        }
    }

    /// Folded away, because a phone that is not a developer's does not need
    /// it, and a developer's does.
    private var server: some View {
        DisclosureGroup(isExpanded: $showServer) {
            VStack(alignment: .leading, spacing: DesignTokens.s8) {
                Inp(label: "Base URL", text: $base, mono: true,
                    keyboard: .URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Use this server") { Api.base = base; base = Api.base }
                    .buttonStyle(.ov(.quiet, small: true))
                Button("Reset to \(Api.productionBase)") {
                    Api.base = Api.productionBase
                    base = Api.base
                }
                .buttonStyle(.ov(.text, small: true))
            }
            .padding(.top, DesignTokens.s8)
        } label: {
            Text("Signing in to \(Api.base)")
                .ovType(.sm)
                .foregroundStyle(Design.ink3)
        }
        .tint(Design.ink3)
    }

    private func submit() {
        guard ready else { return }
        focus = nil
        busy = true
        error = ""
        Task {
            do {
                try await session.signIn(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password)
                password = ""
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
