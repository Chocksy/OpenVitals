import SwiftUI

/// HealthKit relaunches the app in the background to deliver new samples, and
/// only observers registered at launch hear it. So they start here, not when
/// a screen appears.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions
                     launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Task { @MainActor in await HealthSyncModel.shared.launch() }
        return true
    }
}

@main
struct OpenVitalsApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
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
            .onChange(of: session.signedIn) { _, signedIn in
                if signedIn { Task { await health.launch() } }
            }
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
/// Phase 38 D0: the Hybrid bar, Home · Body · Blood · Plan in one glass
/// capsule and the lime + beside it (`HyTabBar`). Every tab draws on paper.
/// D5: the + opens the camera first; its strip hands over to the sheet.
struct Shell: View {
    @AppStorage("tab") private var tab = 0
    /// Add over the screen: the camera the + opens (D5), or the sheet.
    @State private var add: AddSurface? = Shell.staged
    /// Measured, not guessed: the bar tells the screens how much room it takes.
    @State private var barHeight: CGFloat = 0
    /// Today's Focus covers the whole screen, the bar included.
    @State private var barHidden = false
    /// The island over every tab, and the capture run behind it.
    @State private var island = IslandModel()
    /// What a failed read kept, for the Add sheet: from a tap on the failed
    /// island, or from the next + once the island has collapsed.
    @State private var draft: CapturePayload?
    /// Bumped on every open, so a retry from the island over an open Add
    /// starts it again on the kept draft.
    @State private var opened = 0
    /// A question out from Add: the veil holds it open until the answer.
    @State private var sending = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        screen
            .environment(\.ovTabBarInset, barHeight + Design.s5)
            .overlay {
                // `.tabs`: 13 from the sides, 21 from the screen's bottom
                // edge, so the column runs under the home indicator.
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    HyTabBar(tab: $tab, add: { openAdd(island.takeDraft()) })
                        .padding(.horizontal, DesignTokens.s13)
                        .padding(.bottom, DesignTokens.s21)
                        .background(GeometryReader { proxy in
                            Color.clear.preference(key: TabBarHeightKey.self,
                                                   value: proxy.size.height)
                        })
                }
                .ignoresSafeArea(.container, edges: .bottom)
                    .opacity(barHidden || add != nil ? 0 : 1)
                    .motion(Curve.ease.animation(0.28), value: barHidden || add != nil)
                    .allowsHitTesting(!barHidden && add == nil)
            }
            .onPreferenceChange(TabBarHeightKey.self) { barHeight = $0 }
            .onPreferenceChange(TabBarHiddenKey.self) { barHidden = $0 }
            .environment(\.islandPush, island.push)
            .environment(\.openAdd, { openAdd(island.takeDraft()) })
            // Add: over the bar, under the island. The veil fades on the
            // ease over 320 ms, the card rises on the spring over 520 ms.
            // The camera fades in over everything but the island.
            .overlay {
                ZStack {
                    if case .sheet = add {
                        AddVeil { if !sending { closeAdd() } }
                            .transition(.opacity.animation(
                                Motion.animation(Curve.ease.animation(0.32), reduce: reduce)))
                    }
                    if case .sheet(let start) = add {
                        AddSheet(draft: draft, start: start, busy: $sending, close: closeAdd,
                                 openCamera: { show(.camera(caption: $0)) })
                            .id(opened)
                            .transition(reduce ? .opacity : .move(edge: .bottom))
                    }
                    if case .camera(let caption) = add {
                        AddCamera(caption: caption, close: closeAdd,
                                  switchTo: { show(.sheet($0)) })
                            .id(opened)
                            .transition(.opacity)
                    }
                }
            }
            // Above the bar, Focus and the meal sheet; only its shape takes
            // touches. A failed read's tap opens the sheet on what it kept,
            // never the camera.
            .overlay(alignment: .top) {
                IslandOverlay(model: island, reopen: { show(.sheet(nil), draft: $0) })
            }
            // The open island covers the status row on an island phone, as
            // the system's own does (the time would draw over the black
            // shape). Without an island the pill sits under it. Collapsed,
            // a failed read included, the status bar and a push of 0 return.
            // The camera hides it too, as the system camera does.
            .statusBarHidden((island.activity != nil && island.geometry.hasIsland)
                             || add?.isCamera == true)
            .environment(island)
            .background(Hy.paper.ignoresSafeArea())
        .task {
            #if DEBUG
            island.stage(Fixtures.island)
            #endif
        }
    }

    /// The +: the camera at once, unless a failed read left a draft; that
    /// one reopens in the sheet with its photo and words.
    static func surface(for kept: CapturePayload?) -> AddSurface {
        kept == nil ? .camera(caption: "") : .sheet(nil)
    }

    /// `-OVSheet capture|camera` (or `-OVScreen capture|words`) opens Add on
    /// launch.
    static var staged: AddSurface? {
        if Fixtures.sheet == "camera" { return .camera(caption: "") }
        if Fixtures.sheet == "capture" || Fixtures.screen == "capture"
            || Fixtures.screen == "words" { return .sheet(nil) }
        return nil
    }

    private func openAdd(_ kept: CapturePayload?) {
        show(Self.surface(for: kept), draft: kept)
    }

    /// Camera to sheet and back ride the same spring, 520 ms; Reduce
    /// Motion fades.
    private func show(_ next: AddSurface, draft kept: CapturePayload? = nil) {
        draft = kept
        opened += 1
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { add = next }
    }

    private func closeAdd() {
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { add = nil }
        draft = nil
    }

    @ViewBuilder private var screen: some View {
        switch tab {
        case 1: BodyView()
        case 2: BloodView()
        case 3: PlanView()
        default: HybridTodayView()
        }
    }
}
