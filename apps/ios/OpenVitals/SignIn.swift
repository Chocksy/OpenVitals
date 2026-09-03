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
        NavigationStack {
            Form {
                Section {
                    // Return walks the form: email, password, sign in. Two
                    // fields is exactly where that is worth the focus state.
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focus, equals: .email)
                        .onSubmit { focus = .password }
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .focused($focus, equals: .password)
                        .onSubmit { submit() }
                } header: {
                    Text("OpenVitals")
                } footer: {
                    Text("The same email and password as the website.")
                }

                Section {
                    Button(busy ? "Signing in…" : "Sign in") { submit() }
                        .disabled(!ready)
                    if !error.isEmpty {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                // Folded away, because a phone that is not a developer's does
                // not need it, and a developer's does.
                Section {
                    DisclosureGroup("Server", isExpanded: $showServer) {
                        TextField("Base URL", text: $base)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                        Button("Use this server") {
                            Api.base = base
                            base = Api.base
                        }
                        Button("Reset to \(Api.productionBase)") {
                            Api.base = Api.productionBase
                            base = Api.base
                        }
                    }
                } footer: {
                    Text("Signing in to \(Api.base).")
                }
            }
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
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
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
