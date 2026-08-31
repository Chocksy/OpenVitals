/// Today: the deployed site, in a webview, plus the cookie bridge.
///
/// The site is already responsive at 390 px, so there is no native Today card
/// to build. The only native job here is sign-in: whatever better-auth cookie
/// the webview ends up holding is copied into `HTTPCookieStorage`, which is
/// what `URLSession.shared` reads, so the sync and capture calls are signed in
/// the moment the login page redirects.
import SwiftUI
import WebKit

struct TodayView: View {
    @State private var reload = 0

    var body: some View {
        NavigationStack {
            SiteWebView(url: Api.baseURL, reload: reload)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("Today")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Reload", systemImage: "arrow.clockwise") {
                            reload += 1
                        }
                    }
                }
        }
    }
}

/// A plain WKWebView on the site, sharing one persistent data store with every
/// other webview in the app so a login on the Sign in sheet counts here too.
struct SiteWebView: UIViewRepresentable {
    let url: URL
    var reload: Int = 0
    /// Called after every navigation, with however many cookies were adopted.
    var onCookies: ((Int) -> Void)?

    static let dataStore = WKWebsiteDataStore.default()

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = Self.dataStore
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.lastReload != reload {
            context.coordinator.lastReload = reload
            view.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: SiteWebView
        var lastReload = 0

        init(_ parent: SiteWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            harvest(webView)
        }

        func webView(_ webView: WKWebView,
                     didFailProvisionalNavigation navigation: WKNavigation!,
                     withError error: Error) {
            harvest(webView)
        }

        private func harvest(_ webView: WKWebView) {
            webView.configuration.websiteDataStore.httpCookieStore
                .getAllCookies { [weak self] cookies in
                    let taken = Api.adopt(cookies)
                    self?.parent.onCookies?(taken)
                }
        }
    }
}

/// The sign-in sheet: the same webview, pointed at `/login`, dismissed as soon
/// as a session cookie shows up.
struct SignInView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            SiteWebView(url: Api.baseURL.appendingPathComponent("login")) { _ in
                if Api.signedIn { dismiss() }
            }
            .navigationTitle("Sign in")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
