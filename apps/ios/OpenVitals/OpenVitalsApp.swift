import SwiftUI

@main
struct OpenVitalsApp: App {
    @StateObject private var health = HealthSyncModel.shared
    @StateObject private var session = Session.shared

    init() {
        Api.adoptDebugSession()
        Api.trace("launch · base \(Api.base) · signed in \(Api.signedIn)")
    }

    var body: some Scene {
        WindowGroup {
            Group {
                #if DEBUG
                if Fixtures.gallery {
                    GalleryView()
                } else if session.signedIn || Fixtures.on {
                    Shell()
                } else {
                    SignInView()
                }
                #else
                if session.signedIn { Shell() } else { SignInView() }
                #endif
            }
            .preferredColorScheme(Self.pinned)
            .task { session.refresh() }
        }
    }

    /// Only a fixture run pins the appearance; everything else follows iOS.
    static var pinned: ColorScheme? {
        switch Fixtures.scheme {
        case "dark": return .dark
        case "light": return .light
        default: return nil
        }
    }
}

/// The four screens and the +. A hand-drawn bar rather than `TabView`, because
/// the + is not a tab: it opens the Capture sheet and the screen under it
/// stays where it was.
///
/// Phase 34 section 2: the bar is Today · Blood · + · Body · Plan, which is
/// what `blood.html` and `marker.html` draw. Meals moved into Body as a
/// section rather than becoming a fifth destination.
struct Shell: View {
    @ObservedObject private var health = HealthSyncModel.shared
    @AppStorage("tab") private var tab = 0
    @State private var capture = Fixtures.sheet == "capture"
        || Fixtures.screen == "capture" || Fixtures.screen == "words"
    /// Measured, not guessed: the bar tells the screens how much room it takes.
    @State private var barHeight: CGFloat = 0

    static let tabs: [(title: String, icon: String)] = [
        ("Today", "house"),
        ("Blood", "drop"),
        ("Body", "waveform.path.ecg"),
        ("Plan", "calendar"),
    ]

    var body: some View {
        screen
            .environment(\.ovTabBarInset, barHeight + Design.s5)
            .overlay(alignment: .bottom) {
                TabBar(tab: $tab, titles: Self.tabs, add: { capture = true })
                    .padding(.horizontal, DesignTokens.s13)
                    .padding(.bottom, DesignTokens.s5)
                    .background(GeometryReader { proxy in
                        Color.clear.preference(key: TabBarHeightKey.self,
                                               value: proxy.size.height)
                    })
            }
            .onPreferenceChange(TabBarHeightKey.self) { barHeight = $0 }
            .background(Design.canvas.ignoresSafeArea())
        .sheet(isPresented: $capture) { CaptureView() }
        .task {
            guard !Fixtures.on else { return }
            health.enableBackgroundDelivery()
            health.startObservers()
        }
    }

    @ViewBuilder private var screen: some View {
        switch tab {
        case 1: BloodView()
        case 2: BodyView()
        case 3: PlanView()
        default: TodayView()
        }
    }
}
