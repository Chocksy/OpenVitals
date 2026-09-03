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
                if session.signedIn || Fixtures.on { Shell() } else { SignInView() }
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

/// Today · Body · + · Meals · Plan. The + sits in the middle, wearing the one
/// lime the phone has, because it is the control that adds data.
struct TabBar: View {
    @Binding var tab: Int
    let titles: [(title: String, icon: String)]
    let add: () -> Void
    @Environment(\.accessibilityReduceTransparency) private var flat

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            item(0)
            item(1)
            Button(action: add) {
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Design.limeInk)
                    .frame(width: 46, height: 46)
                    .background(Design.lime)
                    .clipShape(Circle())
            }
            .frame(maxWidth: .infinity)
            .accessibilityLabel("Add data")
            item(2)
            item(3)
        }
        .padding(.horizontal, Design.s8)
        .padding(.vertical, Design.s8)
        .background {
            if flat {
                Design.surfaceFlat
            } else {
                Design.surfaceHi.opacity(0.92).background(.ultraThinMaterial)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Design.rCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Design.rCard, style: .continuous)
            .strokeBorder(Design.hair, lineWidth: 1))
        .padding(.horizontal, Design.s13)
        .padding(.bottom, Design.s5)
    }

    private func item(_ index: Int) -> some View {
        let on = tab == index
        return Button { tab = index } label: {
            VStack(spacing: 2) {
                Image(systemName: titles[index].icon)
                    .font(.system(size: 17, weight: on ? .semibold : .regular))
                Text(titles[index].title)
                    .ovType(.xs, weight: on ? .semibold : .regular)
            }
            .foregroundStyle(on ? Design.ink : Design.ink3)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}
