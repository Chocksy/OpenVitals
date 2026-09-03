import SwiftUI
import UIKit

/// The design system, phase 29, in one file.
///
/// Every value here is copied from `docs/mockups/v4/system.css`'s `:root` and
/// its dark column. The rules that go with them, in the order they matter:
///
///  - the spectrum (ok / warn / bad) is text, a dot, a tick or a triangle. It
///    is never a surface and never a filled badge.
///  - navy is the only dark surface. On it the spectrum is the lightened set.
///  - lime is the one accent, and it sits on the one control that adds data.
///  - every number is named, dated and sourced; an estimate says "est.".
enum Design {

    // MARK: - the ladder

    /// Light and dark in one colour, resolved by the trait collection so a
    /// screenshot in either mode is the same view.
    static func pair(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }

    static func pair(_ light: UInt32, _ lightAlpha: Double,
                     _ dark: UInt32, _ darkAlpha: Double) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(rgb: dark, alpha: darkAlpha)
                : UIColor(rgb: light, alpha: lightAlpha)
        })
    }

    /// The page.
    static let canvas = pair(0xfdf5ec, 0x121110)
    /// The sheet behind the page: the tab bar's own well.
    static let canvasDeep = pair(0xf4e9dc, 0x0c0b0a)
    /// The tile. Translucent over the canvas in light, flat in dark.
    static let surface = pair(0xffffff, 0.58, 0x1c1a18, 1)
    static let surfaceHi = pair(0xffffff, 0.78, 0x24221f, 1)
    /// The flat twin, for anything that must not blur (Reduce Transparency).
    static let surfaceFlat = pair(0xfefbf7, 0x1c1a18)
    static let track = pair(0xece0d1, 0x2c2a26)
    static let hair = pair(0x3d2a1c, 0.12, 0xf1efea, 0.11)

    static let ink = pair(0x3d2a1c, 0xf1efea)
    static let ink2 = pair(0x6d5744, 0xb4aea4)
    static let ink3 = pair(0x7f6a59, 0x979083)

    // The spectrum. Text, dots, ticks, the triangle — never a filled surface.
    static let ok = pair(0x2b7f3a, 0x8fc46a)
    static let warn = pair(0x9a6413, 0xe0a63c)
    static let bad = pair(0xc32b45, 0xe3767c)
    /// A glyph or a dot only, never a word: 3.45:1 clears the non-text bar.
    static let badFill = pair(0xe74d64, 0xe3767c)
    static let none = pair(0x7f6a59, 0x979083)

    // The one dark surface, and the spectrum lightened so it survives it.
    static let navy = Color(UIColor(rgb: 0x0f2140))
    static let navyInk = Color(UIColor(rgb: 0xf4f2ed))
    static let navyInk2 = Color(UIColor(rgb: 0xf4f2ed, alpha: 0.72))
    static let navyOk = Color(UIColor(rgb: 0x8fc46a))
    static let navyWarn = Color(UIColor(rgb: 0xe0a63c))
    static let navyBad = Color(UIColor(rgb: 0xe3767c))
    static let sky = pair(0xd9e7f7, 0x1b2b44)

    /// Never text, never state.
    static let lime = Color(UIColor(rgb: 0xd7f24b))
    static let limeInk = Color(UIColor(rgb: 0x1d2405))

    // MARK: - Fibonacci space, four radii, five type sizes

    static let s3: CGFloat = 3
    static let s5: CGFloat = 5
    static let s8: CGFloat = 8
    static let s13: CGFloat = 13
    static let s21: CGFloat = 21
    static let s34: CGFloat = 34
    static let s55: CGFloat = 55

    static let rInner: CGFloat = 13
    static let rCard: CGFloat = 21
    static let rHero: CGFloat = 34
    static let rPill: CGFloat = 999

    enum Size: CGFloat {
        case xs = 11
        case sm = 13
        case md = 15
        case lg = 21
        case xl = 34

        /// The text style each size scales against, so Dynamic Type moves the
        /// whole page and keeps its proportions.
        var style: UIFont.TextStyle {
            switch self {
            case .xs: return .caption2
            case .sm: return .footnote
            case .md: return .subheadline
            case .lg: return .title3
            case .xl: return .largeTitle
            }
        }
    }

    // MARK: - words

    /// The four state words the engine writes, mapped onto the spectrum.
    static func colour(forWord word: String) -> Color {
        switch word.lowercased() {
        case "off", "bad": return bad
        case "borderline", "warn": return warn
        case "good", "ok", "optimal": return ok
        default: return none
        }
    }

    static func colour(forTone tone: String) -> Color {
        switch tone {
        case "bad": return bad
        case "warn": return warn
        case "ok": return ok
        default: return none
        }
    }

    /// "7 234". A non-breaking thin space, because a number never wraps.
    static func number(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = "\u{202F}"
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    static func number(_ d: Double) -> String {
        d == d.rounded() ? number(Int(d))
            : String(format: "%.1f", d)
    }

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let pretty: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MMM d yyyy"
        return f
    }()

    private static let weekday: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "EEEE MMM d"
        return f
    }()

    /// "2026-08-01" → "Aug 1 2026". An unparseable day is printed as it came,
    /// because a date the app cannot read is still the server's date.
    static func day(_ iso: String?) -> String {
        guard let iso, let date = ymd.date(from: iso) else { return iso ?? "—" }
        return pretty.string(from: date)
    }

    /// "2026-09-03" → "Thursday Sep 3".
    static func longDay(_ iso: String?) -> String {
        guard let iso, let date = ymd.date(from: iso) else { return iso ?? "—" }
        return weekday.string(from: date)
    }

    /// "2026-09-03T08:12:00+03:00" → "08:12".
    static func clock(_ stamp: String?) -> String? {
        guard let stamp else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        guard let date = iso.date(from: stamp) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    private static let words = ["zero", "one", "two", "three", "four", "five",
                                "six", "seven", "eight", "nine", "ten",
                                "eleven", "twelve"]

    /// "Two of seven done." A sentence spells its small counts; a card's
    /// number stays a numeral.
    static func word(_ n: Int) -> String {
        n >= 0 && n < words.count ? words[n] : number(n)
    }

    /// "one meal", "two meals" — the plural the design system asks for.
    static func plural(_ n: Int, _ one: String, _ many: String) -> String {
        "\(number(n)) \(n == 1 ? one : many)"
    }
}

extension UIColor {
    convenience init(rgb: UInt32, alpha: Double = 1) {
        self.init(red: Double((rgb >> 16) & 0xff) / 255,
                  green: Double((rgb >> 8) & 0xff) / 255,
                  blue: Double(rgb & 0xff) / 255,
                  alpha: alpha)
    }
}

// MARK: - type

private struct OVType: ViewModifier {
    let size: Design.Size
    let weight: UIFont.Weight
    let mono: Bool
    @Environment(\.dynamicTypeSize) private var dynamic

    func body(content: Content) -> some View {
        // Reading `dynamic` is what makes the font rebuild when the person
        // changes their text size; `scaledFont` alone is a snapshot.
        _ = dynamic
        let base = mono
            ? UIFont.monospacedSystemFont(ofSize: size.rawValue, weight: weight)
            : UIFont.systemFont(ofSize: size.rawValue, weight: weight)
        return content.font(
            Font(UIFontMetrics(forTextStyle: size.style).scaledFont(for: base)))
    }
}

extension View {
    /// SF Pro at one of the five sizes. `mono: true` is SF Mono, which every
    /// number wears so columns of digits line up.
    func ovType(_ size: Design.Size, weight: UIFont.Weight = .regular,
                mono: Bool = false) -> some View {
        modifier(OVType(size: size, weight: weight, mono: mono))
    }
}

// MARK: - the tile

/// The panel: a translucent tile with a hairline, or a flat one when the
/// person asked for less transparency.
struct Tile<Content: View>: View {
    var radius: CGFloat = Design.rCard
    var padding: CGFloat = Design.s13
    @ViewBuilder var content: Content
    @Environment(\.accessibilityReduceTransparency) private var flat

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(flat ? Design.surfaceFlat : Design.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Design.hair, lineWidth: 1))
    }
}

/// A panel with the head the mockup draws: a title on the left, one line of
/// meta on the right.
struct Panel<Content: View>: View {
    var title: String?
    var meta: String?
    @ViewBuilder var content: Content

    var body: some View {
        Tile {
            VStack(alignment: .leading, spacing: Design.s13) {
                if title != nil || meta != nil {
                    HStack(alignment: .firstTextBaseline, spacing: Design.s8) {
                        if let title {
                            Text(title)
                                .ovType(.sm, weight: .semibold)
                                .foregroundStyle(Design.ink)
                        }
                        Spacer(minLength: Design.s5)
                        if let meta {
                            Text(meta)
                                .ovType(.xs)
                                .foregroundStyle(Design.ink3)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }
                content
            }
        }
    }
}

/// A hairline between rows.
struct Hair: View {
    var body: some View {
        Rectangle().fill(Design.hair).frame(height: 1)
    }
}

// MARK: - the one dark surface

/// Status. The only navy on the phone, and the only place the lightened
/// spectrum is used.
struct NavyCard: View {
    let label: String
    let number: String
    let title: String
    let counts: [String]
    var tone: String = "none"

    private var mark: Color {
        switch tone {
        case "bad": return Design.navyBad
        case "warn": return Design.navyWarn
        case "ok": return Design.navyOk
        default: return Design.navyInk2
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Design.s5) {
            Text(label)
                .ovType(.xs, weight: .semibold)
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(Design.navyInk2)
            Text(number)
                .ovType(.xl, weight: .light, mono: true)
                .foregroundStyle(mark)
            Text(title)
                .ovType(.md)
                .foregroundStyle(Design.navyInk)
            VStack(alignment: .leading, spacing: 2) {
                ForEach(counts, id: \.self) { line in
                    Text(line)
                        .ovType(.xs)
                        .foregroundStyle(Design.navyInk2)
                }
            }
        }
        .padding(Design.s21)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Design.navy)
        .clipShape(RoundedRectangle(cornerRadius: Design.rCard, style: .continuous))
    }
}

/// One card of the rail: a label, one number, one sourced line.
struct RailCard: View {
    let label: String
    let number: String
    let line: String

    var body: some View {
        Tile(radius: Design.rCard, padding: Design.s13) {
            VStack(alignment: .leading, spacing: Design.s5) {
                Text(label)
                    .ovType(.xs, weight: .semibold)
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .foregroundStyle(Design.ink3)
                Text(number)
                    .ovType(.lg, weight: .light, mono: true)
                    .foregroundStyle(Design.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(line)
                    .ovType(.xs)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(width: 165, alignment: .leading)
    }
}

// MARK: - state

/// The dot. Hollow when nothing was ever measured.
struct StateDot: View {
    let word: String

    var body: some View {
        let colour = Design.colour(forWord: word)
        let hollow = word == "never measured" || word == "none"
        Circle()
            .strokeBorder(colour, lineWidth: hollow ? 1.2 : 0)
            .background(Circle().fill(hollow ? Color.clear : colour))
            .frame(width: 8, height: 8)
    }
}

/// One system as a chip: dot, name, and nothing else it cannot prove.
struct SystemChip: View {
    let name: String
    let word: String

    var body: some View {
        HStack(spacing: Design.s5) {
            StateDot(word: word)
            Text(name)
                .ovType(.sm)
                .foregroundStyle(Design.ink)
        }
        .padding(.horizontal, Design.s13)
        .padding(.vertical, Design.s8)
        .background(
            Capsule().fill(Design.surfaceHi))
        .overlay(Capsule().strokeBorder(Design.hair, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(word)")
    }
}

// MARK: - controls

/// The one lime control: the thing that adds the most data.
struct AddButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .ovType(.sm, weight: .semibold)
            .foregroundStyle(Design.limeInk)
            .padding(.horizontal, Design.s13)
            .padding(.vertical, Design.s8 + 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Design.lime)
            .clipShape(RoundedRectangle(cornerRadius: Design.rInner, style: .continuous))
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}

/// Everything else that adds data: the tile, a hairline, ink.
struct QuietButtonStyle: ButtonStyle {
    var wide = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .ovType(.sm, weight: .medium)
            .foregroundStyle(Design.ink)
            .padding(.horizontal, Design.s13)
            .padding(.vertical, Design.s8 + 2)
            .frame(maxWidth: wide ? .infinity : nil, alignment: .leading)
            .background(Design.surfaceHi)
            .clipShape(RoundedRectangle(cornerRadius: Design.rInner, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Design.rInner, style: .continuous)
                .strokeBorder(Design.hair, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

/// The ink button: one to a screen.
struct InkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .ovType(.sm, weight: .semibold)
            .foregroundStyle(Design.canvas)
            .padding(.horizontal, Design.s13)
            .padding(.vertical, Design.s8)
            .background(Design.ink)
            .clipShape(RoundedRectangle(cornerRadius: Design.rInner, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// A word that behaves like a button.
struct TextButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .ovType(.sm)
            .foregroundStyle(Design.ink2)
            .padding(.vertical, Design.s5)
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

// MARK: - the screen

/// How much room the floating tab bar takes at the foot of a screen: its own
/// measured height plus its margin. Zero inside a sheet, which has no bar.
private struct TabBarInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var ovTabBarInset: CGFloat {
        get { self[TabBarInsetKey.self] }
        set { self[TabBarInsetKey.self] = newValue }
    }
}

/// The bar measures itself rather than being told a number, so Dynamic Type
/// moves the inset with it.
struct TabBarHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Every screen: the canvas, a head with the title and one icon, a scroll.
struct Screen<Content: View>: View {
    let title: String
    var icon: String?
    var iconLabel: String?
    var action: (() -> Void)?
    var refresh: (() async -> Void)?
    @ViewBuilder var content: Content
    @Environment(\.ovTabBarInset) private var tabBar

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Design.s13) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title)
                        .ovType(.lg, weight: .semibold)
                        .foregroundStyle(Design.ink)
                    Spacer()
                    if let icon, let action {
                        Button(action: action) {
                            Image(systemName: icon)
                                .foregroundStyle(Design.ink2)
                                .imageScale(.large)
                        }
                        .accessibilityLabel(iconLabel ?? "More")
                    }
                }
                .padding(.top, Design.s8)
                content
            }
            .padding(.horizontal, Design.s13)
            // The last row has to clear the floating bar, not hide under it.
            .padding(.bottom, Design.s34 + tabBar)
        }
        .refreshableIf(refresh)
        .scrollToBottomIfAsked()
        .background(Design.canvas.ignoresSafeArea())
    }
}

extension View {
    /// A screenshot run can start a long screen at its foot, which is the only
    /// way to see that the last row clears the tab bar. DEBUG and fixtures
    /// only; a real build always opens at the top.
    @ViewBuilder
    func scrollToBottomIfAsked() -> some View {
        if Fixtures.atBottom {
            defaultScrollAnchor(.bottom)
        } else {
            self
        }
    }

    /// Pull to sync, but only on the screens that have something to fetch.
    @ViewBuilder
    func refreshableIf(_ action: (() async -> Void)?) -> some View {
        if let action {
            refreshable { await action() }
        } else {
            self
        }
    }
}

/// The chips wrap. `Layout` rather than a grid, because a chip is as wide as
/// its own name and a grid would give every one of them the widest column.
struct Flow: Layout {
    var spacing: CGFloat = Design.s8

    private func rows(_ sizes: [CGSize], width: CGFloat) -> (CGFloat, [[Int]]) {
        var rows: [[Int]] = [[]]
        var x: CGFloat = 0
        var height: CGFloat = 0
        var rowHeight: CGFloat = 0
        for (i, size) in sizes.enumerated() {
            if x > 0, x + size.width > width {
                rows.append([])
                height += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            rows[rows.count - 1].append(i)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return (height + rowHeight, rows)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews,
                      cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let (height, _) = rows(sizes, width: width)
        return CGSize(width: proposal.width ?? sizes.map(\.width).max() ?? 0,
                      height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize,
                       subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let (_, rows) = rows(sizes, width: bounds.width)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            let rowHeight = row.map { sizes[$0].height }.max() ?? 0
            for i in row {
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sizes[i]))
                x += sizes[i].width + spacing
            }
            y += rowHeight + spacing
        }
    }
}

/// The line at the foot of a panel that says the quiet part.
struct Caption: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .ovType(.xs)
            .foregroundStyle(Design.ink3)
            .fixedSize(horizontal: false, vertical: true)
    }
}
