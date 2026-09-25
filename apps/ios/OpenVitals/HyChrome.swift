import SwiftUI

// Phase 38 D0: the chrome every tab shares, in the Hybrid look.
// `docs/plans/2026-09-24-phase38-hybrid-tabs-spec.md` part D0, the tab bar
// from `48-hybrid.html` (`.tabs`, `.tb`, `.plus`).

// MARK: - the header

/// The plum header of Body, Blood and Plan: the tab's name, one big value
/// with its word, one line under it. Pads like `ScoreHeader` (21 sides, 8
/// top, 21 bottom) and moves down under an open island on `Curve.ispring`.
struct HyHeader<Trailing: View>: View {
    /// The eyebrow: the tab's name, 11 caps.
    let title: String
    /// The big number. Nil draws "—".
    let value: String?
    var word: String?
    var line: String?
    @ViewBuilder var trailing: Trailing

    @Environment(\.islandPush) private var push

    init(title: String, value: String?, word: String? = nil, line: String? = nil,
         @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.value = value
        self.word = word
        self.line = line
        self.trailing = trailing()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).textCase(.uppercase)
                .hType(11, .medium, Hy.mist, tracking: 0.12)
                .lineLimit(1)
            HStack(alignment: .center, spacing: DesignTokens.s13) {
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                    Text(value ?? "—")
                        .hType(55, .semibold, Hy.cream, tracking: -0.04)
                        .lineLimit(1)
                        .fixedSize()
                        .contentTransition(.numericText())
                        .motion(Curve.spring.animation(0.9), value: value)
                    if let word {
                        Text(word).hType(15, .medium, Hy.lime)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                trailing
            }
            if let line {
                Text(line).hType(13, .regular, Hy.mist)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, DesignTokens.s21)
        .padding(.top, DesignTokens.s8)
        .padding(.bottom, DesignTokens.s21)
        .padding(.top, push)
        .motion(Curve.ispring.animation(0.62), value: push)
        .background { HeaderBackground() }
    }
}

extension HyHeader where Trailing == EmptyView {
    init(title: String, value: String?, word: String? = nil, line: String? = nil) {
        self.init(title: title, value: value, word: word, line: line) { EmptyView() }
    }
}

// MARK: - shelves

/// `.shelf h2`: the title 17/600 and its note 11 ink2 on one line.
struct ShelfTitle: View {
    let title: String
    let sub: String

    init(_ title: String, _ sub: String) {
        self.title = title
        self.sub = sub
    }

    var body: some View {
        (Text(title).font(.grotesk(17, .semibold)).tracking(-0.34)
            + Text("  ") .font(.grotesk(5))
            + Text(sub).font(.grotesk(11, .medium)).tracking(0.22)
                .foregroundColor(Hy.ink2))
            .foregroundStyle(Hy.ink)
            .padding(.horizontal, DesignTokens.s21)
            .padding(.bottom, DesignTokens.s8)
    }
}

/// A tab: its `HyHeader` that never scrolls, the shelves under it on grained
/// paper. The shelves end clear of the tab bar (`.scroll { padding-bottom:
/// 110 }`); `refresh` is the pull.
struct HyScreen<Header: View, Content: View>: View {
    var refresh: (() async -> Void)?
    @ViewBuilder var header: Header
    @ViewBuilder var content: Content

    @Environment(\.ovTabBarInset) private var tabBar

    init(refresh: (() async -> Void)? = nil,
         @ViewBuilder header: () -> Header,
         @ViewBuilder content: () -> Content) {
        self.refresh = refresh
        self.header = header()
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            header
                // Above the shelves, so its shadow falls on them.
                .zIndex(1)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) { content }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, DesignTokens.s21)
                    .padding(.bottom, max(110, tabBar + DesignTokens.s21))
            }
            .scrollIndicators(.hidden)
            .refreshableIf(refresh)
            .scrollToBottomIfAsked()
        }
        .background {
            ZStack { Hy.paper; GrainTile() }.ignoresSafeArea()
        }
    }
}

extension View {
    /// A vertical card: `.tc` full width, 21 in from each side. Horizontal
    /// shelves keep `todayCard(width:)`.
    func hyCard() -> some View {
        padding(DesignTokens.s13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .grained(Hy.card, radius: 21, shadow: 0.3)
            .padding(.horizontal, DesignTokens.s21)
    }
}

// MARK: - state words

/// The colours a marker's word wears: green in range, amber borderline, rose
/// off; ink3 on paper2 for a number nothing can judge ("no band", "never
/// measured").
enum HyState {
    static func ink(_ word: String?) -> Color { colours(word).ink }
    static func soft(_ word: String?) -> Color { colours(word).soft }

    static func colours(_ word: String?) -> (ink: Color, soft: Color) {
        switch word?.lowercased() {
        case "optimal", "good", "in range": return (Hy.green, Hy.greenSoft)
        case "borderline": return (Hy.amber, Hy.amberSoft)
        case "off", "bad", "confirmed": return (Hy.rose, Hy.roseSoft)
        default: return (Hy.ink3, Hy.paper2)
        }
    }
}

// MARK: - the tab bar

/// `.tabs`: the glass bar with four tabs and the lime + beside it. The +
/// is not a tab: it opens Add and the screen under it stays where it was.
struct HyTabBar: View {
    @Binding var tab: Int
    let add: () -> Void

    @Namespace private var chosen
    @Environment(\.accessibilityReduceTransparency) private var flat

    /// `@AppStorage("tab")` indexes: 0 Home, 1 Body, 2 Blood, 3 Plan.
    static let tabs: [(title: String, icon: String)] = [
        ("Home", "house"),
        ("Body", "figure.walk"),
        ("Blood", "drop"),
        ("Plan", "checklist"),
    ]

    var body: some View {
        HStack(spacing: DesignTokens.s8) {
            bar
            plus
        }
        .sensoryFeedback(.selection, trigger: tab)
    }

    /// `.tb`: 62 tall, card at .78 over the blur, a plum hairline, padding 5,
    /// `box-shadow: 0 13px 34px -13px rgba(43,16,51,.35)`.
    private var bar: some View {
        HStack(spacing: 0) {
            ForEach(Self.tabs.indices, id: \.self) { item($0) }
        }
        // The chosen capsule slides on the spring, 420 ms.
        .motion(Curve.spring.animation(0.42), value: tab)
        .padding(DesignTokens.s5)
        .frame(height: 62)
        .background {
            ZStack {
                if flat {
                    Capsule().fill(Hy.card)
                } else {
                    Capsule().fill(.ultraThinMaterial)
                    Capsule().fill(Hy.card.opacity(0.78))
                }
            }
            .overlay(Capsule().strokeBorder(Hy.plum.opacity(0.08), lineWidth: 1))
            // SwiftUI has no spread: the blur is cut back and the drop carries it.
            .shadow(color: Hy.plum.opacity(0.35), radius: 10, x: 0, y: 13)
            .environment(\.colorScheme, .light)
        }
    }

    /// `.tb button`: a 19 glyph over an 11 label, ink3; `.on` sits on a
    /// paper capsule in ink.
    private func item(_ index: Int) -> some View {
        let on = tab == index
        return Button { tab = index } label: {
            VStack(spacing: 2) {
                Image(systemName: Self.tabs[index].icon)
                    .font(.system(size: 19))
                    .frame(height: 22)
                Text(Self.tabs[index].title).font(.grotesk(11, .medium))
            }
            .foregroundStyle(on ? Hy.ink : Hy.ink3)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                if on {
                    Capsule().fill(Hy.paper)
                        .matchedGeometryEffect(id: "on", in: chosen)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }

    /// `.plus`: a 62 lime circle, the plum + at 26,
    /// `box-shadow: 0 13px 21px -8px rgba(120,140,20,.5)`.
    private var plus: some View {
        Button(action: add) {
            Image(systemName: "plus")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(Hy.plum)
                .frame(width: 62, height: 62)
                .background(
                    Circle().fill(Hy.lime)
                        .shadow(color: Color(red: 120 / 255, green: 140 / 255, blue: 20 / 255)
                            .opacity(0.5), radius: 7, x: 0, y: 13))
                .contentShape(Circle())
        }
        .buttonStyle(Pressed(scale: 0.92))
        .accessibilityLabel("Add")
    }
}
