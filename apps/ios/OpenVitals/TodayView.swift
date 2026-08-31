/// Today: the deployed site, in a webview, plus the cookie bridge.
///
/// The site is already responsive at 390 px, so there is no native Today card
/// to build. The bridge runs both ways: the cookie the native sign-in form got
/// is pushed into the webview before it loads, so the site never shows its own
/// login page; and whatever cookie the webview ends up holding is copied back
/// into `HTTPCookieStorage`, which is what `URLSession.shared` reads.
///
/// The webview also announces itself. `Api.userAgentTag` rides in the user
/// agent, the site's `(app)` layout sees it and renders no nav of its own, and
/// the tab bar below is then the only navigation in the app.
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
/// other webview in the app, so the session survives a tab switch and a relaunch.
struct SiteWebView: UIViewRepresentable {
    let url: URL
    var reload: Int = 0
    /// Called after every navigation, with however many cookies were adopted.
    var onCookies: ((Int) -> Void)?

    static let dataStore = WKWebsiteDataStore.default()

    /// iOS zooms a focused input under 16 px and never zooms back. Pinning the
    /// viewport is the first belt; the 16 px rule in `globals.css` is the
    /// second. Run at document end, because the page's own viewport meta is
    /// parsed after document start and the last one written wins.
    static let viewportScript = WKUserScript(source: """
        (function () {
          var m = document.querySelector('meta[name=viewport]');
          if (!m) { m = document.createElement('meta'); m.name = 'viewport';
                    document.head.appendChild(m); }
          m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
        })();
        """, injectionTime: .atDocumentEnd, forMainFrameOnly: false)

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    /// The one configuration, built here so a test can ask a real WKWebView
    /// what it ends up doing rather than trusting an API's name.
    static func configuration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = dataStore
        config.userContentController.addUserScript(viewportScript)
        return config
    }

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: Self.configuration())
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        Self.announce(view) {
            Self.push(Api.cookies()) { view.load(URLRequest(url: url)) }
        }
        return view
    }

    /// The default user agent with the tag on the end.
    ///
    /// `applicationNameForUserAgent` looks like the one-line way to do this and
    /// is not: it *replaces* the `Mobile/15E148` token, so the site would stop
    /// reading as a phone. Asking the webview for its own agent and appending
    /// keeps every token WebKit put there.
    static func announce(_ view: WKWebView, then next: @escaping () -> Void) {
        view.evaluateJavaScript("navigator.userAgent") { value, _ in
            if let agent = value as? String, !agent.contains(Api.userAgentTag) {
                view.customUserAgent = "\(agent) \(Api.userAgentTag)"
            }
            next()
        }
    }

    /// native → webview. The load waits for the cookies, or the first request
    /// goes out anonymous and the site bounces to `/login`.
    static func push(_ cookies: [HTTPCookie], then load: @escaping () -> Void) {
        var left = cookies.count
        guard left > 0 else { return load() }
        for cookie in cookies {
            dataStore.httpCookieStore.setCookie(cookie) {
                left -= 1
                if left == 0 { load() }
            }
        }
    }

    /// Signing out has to empty the webview's store too, or the next load
    /// hands the old session straight back.
    static func forgetCookies(then done: @escaping () -> Void = {}) {
        let store = dataStore.httpCookieStore
        store.getAllCookies { cookies in
            var left = cookies.count
            guard left > 0 else { return done() }
            for cookie in cookies {
                store.delete(cookie) {
                    left -= 1
                    if left == 0 { done() }
                }
            }
        }
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.lastReload != reload {
            context.coordinator.lastReload = reload
            Self.push(Api.cookies()) { view.load(URLRequest(url: url)) }
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
                    // Only when something arrived, so a stray navigation
                    // during sign-out cannot put the session back.
                    if taken > 0 { Task { @MainActor in Session.shared.refresh() } }
                    self?.parent.onCookies?(taken)
                }
        }
    }
}
