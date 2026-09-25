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
    /// The email typed at the last sign-in, for Settings' header. Nil for a
    /// session that came any other way (the debug one, the webview's).
    @Published private(set) var email = UserDefaults.standard.string(forKey: Session.emailKey)

    static let emailKey = "OVAccountEmail"

    private init() {}

    /// Re-read the cookie jar. Called after a sign-in, a sign-out, and after
    /// the webview harvests a cookie of its own.
    func refresh() { signedIn = Api.signedIn }

    func signIn(email: String, password: String) async throws {
        try await Api.signIn(email: email, password: password)
        remember(email)
        refresh()
    }

    /// The webview store goes first: emptying it while a navigation is still
    /// in flight is how a signed-out app quietly signs itself back in.
    func signOut() async {
        await Api.signOut()
        HealthSyncModel.shared.reset()
        remember(nil)
        refresh()
    }

    private func remember(_ email: String?) {
        self.email = email
        UserDefaults.standard.set(email, forKey: Session.emailKey)
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
///
/// Phase 38 D8: `SignInView` no longer draws it; the gallery's `login.html`
/// frame still does, for the snapshot test.
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

/// Phase 38 D8: sign-in in the Hybrid look. The plum header carries the
/// wordmark, the form sits on one cream card, and the one lime button signs
/// in. Shown as a sheet (from Add, when the cookie is gone) it closes itself
/// once the sign-in lands; at the root, `Session` swaps it for `Shell`.
struct SignInView: View {
    private enum Field { case email, password }

    @ObservedObject private var session = Session.shared
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var presented
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
        HyScreen {
            header
        } content: {
            card
        }
        .environment(\.colorScheme, .light)
    }

    /// The plum header: the eyebrow, the wordmark, the welcome in lime.
    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Sign in").textCase(.uppercase)
                .hType(11, .medium, Hy.mist, tracking: 0.12)
            Text("OpenVitals")
                .hType(44, .semibold, Hy.cream, tracking: -0.04)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, DesignTokens.s5)
            Text("Welcome back.").hType(15, .medium, Hy.lime)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, DesignTokens.s21)
        .padding(.top, DesignTokens.s34)
        .padding(.bottom, DesignTokens.s34)
        .background { HeaderBackground() }
    }

    var card: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            // Return walks the card: email, password, sign in. Two fields is
            // exactly where that is worth the focus state.
            field("Email", wrong: false) {
                TextField("", text: $email,
                          prompt: Text(verbatim: "you@example.com").foregroundColor(Hy.ink3))
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focus, equals: .email)
                    .onSubmit { focus = .password }
            }
            field("Password", wrong: !error.isEmpty) {
                SecureField("", text: $password)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .focused($focus, equals: .password)
                    .onSubmit { submit() }
            }
            if !error.isEmpty {
                Text(error).hType(11, .medium, Hy.rose)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }
            HyAction(title: busy ? "Signing in…" : "Sign in") { submit() }
                .disabled(!ready)
                .padding(.top, DesignTokens.s8)
            Text("The same email and password as the website.")
                .hType(11, .regular, Hy.ink3)
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)
            Hy.line.frame(height: 1)
            server
        }
        .motion(Curve.ease.animation(0.32), value: error)
        .hyCard()
    }

    /// A label in 11 caps over a 44 capsule on paper; rose round it when the
    /// server said no.
    private func field<Input: View>(_ label: String, wrong: Bool,
                                    @ViewBuilder input: () -> Input) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).textCase(.uppercase)
                .hType(11, .medium, Hy.ink2, tracking: 0.12)
            input()
                .font(.grotesk(15))
                .foregroundStyle(Hy.ink)
                .padding(.horizontal, DesignTokens.s13)
                .frame(height: 44)
                .background(Capsule().fill(Hy.paper))
                .overlay(Capsule().strokeBorder(wrong ? Hy.rose : .clear, lineWidth: 1.5))
        }
    }

    /// Folded away, because a phone that is not a developer's does not need
    /// it, and a developer's does.
    private var server: some View {
        HyFold(open: $showServer) {
            VStack(alignment: .leading, spacing: DesignTokens.s8) {
                field("Base URL", wrong: false) {
                    TextField("", text: $base)
                        .font(.system(size: 13, design: .monospaced))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                HStack(spacing: DesignTokens.s8) {
                    HyAction(title: "Use this server", kind: .secondary, wide: false) {
                        Api.base = base
                        base = Api.base
                    }
                    Spacer(minLength: 0)
                }
                HyAction(title: "Reset to \(Api.productionBase)", kind: .text, wide: false) {
                    Api.base = Api.productionBase
                    base = Api.base
                }
            }
            .padding(.top, DesignTokens.s8)
        } label: {
            Text(verbatim: "Signing in to \(Api.base)")
                .hType(11, .regular, Hy.ink3)
                .lineLimit(1)
                .truncationMode(.middle)
        }
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
                // From Add, a sheet: the sign-in is what it was open for.
                if presented { dismiss() }
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
