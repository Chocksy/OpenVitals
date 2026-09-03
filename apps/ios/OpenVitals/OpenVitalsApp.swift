import SwiftUI

@main
struct OpenVitalsApp: App {
    @StateObject private var health = HealthSyncModel.shared
    @StateObject private var session = Session.shared

    init() {
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
struct Shell: View {
    @ObservedObject private var health = HealthSyncModel.shared
    @AppStorage("tab") private var tab = 0
    @State private var capture = Fixtures.sheet == "capture"
    /// Measured, not guessed: the bar tells the screens how much room it takes.
    @State private var barHeight: CGFloat = 0

    private static let tabs: [(title: String, icon: String)] = [
        ("Today", "house"),
        ("Body", "waveform.path.ecg"),
        ("Meals", "fork.knife"),
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
        case 1: BodyView()
        case 2: MealsView()
        case 3: PlanView()
        default: TodayView()
        }
    }
}
