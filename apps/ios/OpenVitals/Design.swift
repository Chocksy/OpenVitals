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

    // ── the tokens, generated from docs/mockups/v4/system.css ─────────
    // Design.swift keeps the components; DesignTokens.swift keeps the
    // values. Nothing here invents a colour or a step.

    static let canvas = DesignTokens.canvas.color
    static let canvasDeep = DesignTokens.canvasDeep.color
    static let surface = DesignTokens.surface.color
    static let surfaceHi = DesignTokens.surfaceHi.color
    static let surfaceFlat = DesignTokens.surfaceFlat.color
    static let track = DesignTokens.track.color
    static let hair = DesignTokens.hair.color

    static let ink = DesignTokens.ink.color
    static let ink2 = DesignTokens.ink2.color
    static let ink3 = DesignTokens.ink3.color

    static let ok = DesignTokens.ok.color
    static let warn = DesignTokens.warn.color
    static let bad = DesignTokens.bad.color
    static let badFill = DesignTokens.badFill.color
    static let none = DesignTokens.none.color

    static let navy = DesignTokens.navy.color
    static let navyInk = DesignTokens.navyInk.color
    static let navyInk2 = DesignTokens.navyInk2.color
    static let navyOk = DesignTokens.navyOk.color
    static let navyWarn = DesignTokens.navyWarn.color
    static let navyBad = DesignTokens.navyBad.color
    static let sky = DesignTokens.sky.color

    static let lime = DesignTokens.lime.color
    static let limeInk = DesignTokens.limeInk.color

    static let s3 = DesignTokens.s3
    static let s5 = DesignTokens.s5
    static let s8 = DesignTokens.s8
    static let s13 = DesignTokens.s13
    static let s21 = DesignTokens.s21
    static let s34 = DesignTokens.s34
    static let s55 = DesignTokens.s55

    static let rInner = DesignTokens.rInner
    static let rCard = DesignTokens.rCard
    static let rHero = DesignTokens.rHero
    /// `--r-pill` is 999 px in CSS; on a shape that is any capsule.
    static let rPill = DesignTokens.rPill

    /// The hairline is 1 CSS px, which is 1 point, not 1 device pixel.
    static let hairline: CGFloat = 1

    enum Size: CGFloat {
        case xs = 11
        case sm = 13
        case md = 15
        case lg = 21
        case xl = 34

        static let xsValue = DesignTokens.typeXs
        static let smValue = DesignTokens.typeSm
        static let mdValue = DesignTokens.typeMd
        static let lgValue = DesignTokens.typeLg
        static let xlValue = DesignTokens.typeXl

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

    /// A number the server may not have. The dash says "no number", and no
    /// zero is ever invented in its place.
    static func number(_ d: Double?) -> String {
        d.map { number($0) } ?? "—"
    }

    /// "605 kcal", "41 g", or the dash on its own. A unit is never printed
    /// without the number it belongs to.
    static func amount(_ d: Double?, _ unit: String) -> String {
        d.map { "\(number($0)) \(unit)" } ?? "—"
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

/// Geist Sans and Geist Mono, the design's own faces, bundled under
/// `Fonts/` from the OFL release (vercel/geist-font v1.7.2) and declared in
/// `Info.plist` under `UIAppFonts`. SF is the fallback and only that: if a
/// face fails to load the app still reads, at the same size and weight.
enum Face {

    /// The five sans weights the CSS asks for, by PostScript name.
    static let sans: [UIFont.Weight: String] = [
        .ultraLight: "Geist-ExtraLight",
        .thin: "Geist-ExtraLight",
        .light: "Geist-Light",
        .regular: "Geist-Regular",
        .medium: "Geist-Medium",
        .semibold: "Geist-SemiBold",
        .bold: "Geist-SemiBold",
    ]

    /// Geist Mono: every number in the app wears it.
    static let mono: [UIFont.Weight: String] = [
        .ultraLight: "GeistMono-ExtraLight",
        .thin: "GeistMono-ExtraLight",
        .light: "GeistMono-Light",
        .regular: "GeistMono-Regular",
        .medium: "GeistMono-Medium",
        .semibold: "GeistMono-Medium",
        .bold: "GeistMono-Medium",
    ]

    /// True when both families loaded. The gallery prints it.
    static var bundled: Bool {
        UIFont(name: "Geist-Regular", size: 12) != nil
            && UIFont(name: "GeistMono-Regular", size: 12) != nil
    }

    static func font(_ points: CGFloat, _ weight: UIFont.Weight,
                     mono: Bool) -> UIFont {
        let table = mono ? Self.mono : Self.sans
        if let name = table[weight], let face = UIFont(name: name, size: points) {
            return face
        }
        return mono
            ? UIFont.monospacedSystemFont(ofSize: points, weight: weight)
            : UIFont.systemFont(ofSize: points, weight: weight)
    }
}

private struct OVType: ViewModifier {
    let size: Design.Size
    let weight: UIFont.Weight
    let mono: Bool
    /// The CSS `line-height` of the element, as a multiple of its font size.
    /// The page's own default is 1.5; every value below it is an override the
    /// stylesheet writes out.
    let leading: CGFloat
    @Environment(\.dynamicTypeSize) private var dynamic

    func body(content: Content) -> some View {
        // Reading `dynamic` is what makes the font rebuild when the person
        // changes their text size; `scaledFont` alone is a snapshot.
        _ = dynamic
        let base = Face.font(size.rawValue, weight, mono: mono)
        let scaled = UIFontMetrics(forTextStyle: size.style).scaledFont(for: base)
        // CSS puts half the leading above the line and half below it, which is
        // what makes a paragraph of 13 px text 19.5 px a line. SwiftUI's line
        // spacing only goes between lines, so the halves are padding.
        let box = scaled.pointSize * leading
        let extra = max(0, box - scaled.lineHeight)
        return content
            .font(Font(scaled))
            .lineSpacing(extra)
            .padding(.vertical, extra / 2)
    }
}

extension View {
    /// Geist at one of the five sizes, scaled by Dynamic Type from the text
    /// style each size belongs to. `mono: true` is Geist Mono, which every
    /// number wears so columns of digits line up.
    func ovType(_ size: Design.Size, weight: UIFont.Weight = .regular,
                mono: Bool = false, leading: CGFloat = 1.5) -> some View {
        modifier(OVType(size: size, weight: weight, mono: mono,
                        leading: leading))
    }

    /// The CSS `letter-spacing` of an element, in em, at a given size.
    func ovTracking(_ em: CGFloat, _ size: Design.Size) -> some View {
        tracking(em * size.rawValue)
    }
}
