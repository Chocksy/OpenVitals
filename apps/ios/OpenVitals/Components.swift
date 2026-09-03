import SwiftUI
import UIKit

// One native component per element on `docs/mockups/v4/system.html`, sections
// 03 to 15, with the CSS class it is named after in the comment above it and
// that class's own geometry in the body. Nothing here invents a number: every
// padding, gap, radius and size comes from `system.css`, through
// `DesignTokens.swift`.
//
// The three rules the whole file obeys:
//   * the spectrum (ok / warn / bad) is a word, a dot, a tick or the ▲. It is
//     never a surface and never a filled badge.
//   * navy is the only dark surface.
//   * lime sits on the one control that adds data, and nowhere else.

// MARK: - the tile

extension Design {
    /// The 1 px inner border on a translucent tile:
    /// `border: 1px solid rgba(255,255,255,.5)`, and `.08` in dark.
    static let tileEdge = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 1, alpha: 0.08)
            : UIColor(white: 1, alpha: 0.5)
    })

    /// `backdrop-filter: blur(21px)` — the tile is translucent and sits over
    /// the canvas, so the canvas has to show through it.
    static let tileBlur = DesignTokens.s21
}

/// `.card` / `.panel` — the tile. Translucent over the canvas, with the 1 px
/// inner border; flat when the person asked for less transparency.
struct Tile<Content: View>: View {
    var radius: CGFloat = DesignTokens.rCard
    var padding: CGFloat = DesignTokens.s13
    var raised = false
    @ViewBuilder var content: Content
    @Environment(\.accessibilityReduceTransparency) private var flat

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if flat {
                    Design.surfaceFlat
                } else if raised {
                    Design.surfaceHi.background(.ultraThinMaterial)
                } else {
                    Design.surface.background(.ultraThinMaterial)
                }
            }
            .clipShape(shape)
            .overlay(shape.strokeBorder(flat ? Design.hair : Design.tileEdge,
                                        lineWidth: Design.hairline))
    }
}

/// `.panel-head` — a 13 px title on the left, an 11 px mono meta on the right,
/// 13 px of air under it.
struct PanelHead: View {
    let title: String?
    var meta: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s13) {
            if let title {
                Text(title)
                    .ovType(.sm, weight: .medium)
                    .foregroundStyle(Design.ink)
            }
            Spacer(minLength: DesignTokens.s5)
            if let meta {
                Text(meta)
                    .ovType(.xs, mono: true)
                    .foregroundStyle(Design.ink3)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

/// `.panel` — a tile with a head. `hi` is `.panel.hi`, the raised one.
struct Panel<Content: View>: View {
    var title: String?
    var meta: String?
    var hi = false
    @ViewBuilder var content: Content

    var body: some View {
        Tile(padding: DesignTokens.s13, raised: hi) {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                if title != nil || meta != nil {
                    PanelHead(title: title, meta: meta)
                }
                content
            }
        }
    }
}

/// `border-bottom: 1px solid var(--hair)` — the one hairline in the system.
struct Hair: View {
    var body: some View {
        Rectangle().fill(Design.hair).frame(height: Design.hairline)
    }
}

/// `.rowlist` — rows with 13 px of air above and below and a hairline between,
/// none after the last.
struct RowList<Row: View>: View {
    let count: Int
    @ViewBuilder var row: (Int) -> Row

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(0..<count, id: \.self) { index in
                row(index)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, DesignTokens.s13)
                if index < count - 1 { Hair() }
            }
        }
    }
}

// MARK: - cards

/// `.navycard` — Kite's navy, the one dark surface in the app. The spectrum on
/// it is the lightened set, and the 3 px bar at the top follows the worst band.
struct NavyCard: View {
    let label: String
    let number: String
    var glyph = false
    var title: String?
    var counts: [String]
    var tone: String = "none"
    /// `.c-bar` — the 3 px hue bar. Only where the mockup draws one.
    var bar = false

    private var mark: Color {
        switch tone {
        case "bad": return Design.navyBad
        case "warn": return Design.navyWarn
        case "ok": return Design.navyOk
        default: return Design.navyInk
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Text(label)
                .ovType(.xs, weight: .medium, mono: true)
                .textCase(.uppercase)
                .ovTracking(0.1, .xs)
                .foregroundStyle(Design.navyInk2)
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s5) {
                Text(number)
                    .ovType(.xl, weight: .ultraLight, mono: true, leading: 1)
                    .ovTracking(-0.04, .xl)
                    .foregroundStyle(mark)
                if glyph { Triangle() }
            }
            if let title {
                Text(title)
                    .ovType(.lg, leading: 1.2)
                    .ovTracking(-0.02, .lg)
                    .foregroundStyle(Design.navyInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(counts, id: \.self) { line in
                    Text(line)
                        .ovType(.sm)
                        .foregroundStyle(Design.navyInk2)
                }
            }
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, minHeight: 160, alignment: .topLeading)
        .background(Design.navy)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.rCard,
                                    style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: DesignTokens.rCard,
                                  style: .continuous)
            .strokeBorder(Color.white.opacity(0.12),
                          lineWidth: Design.hairline))
        .overlay(alignment: .top) {
            if bar {
                Rectangle().fill(mark).frame(height: DesignTokens.s3)
                    .clipShape(RoundedRectangle(cornerRadius: DesignTokens.rCard,
                                                style: .continuous))
            }
        }
    }
}

/// `.rail > .card` — one card in the horizontal rail: 8 px of padding on the
/// phone, a 34 px mono number, a 13 px line under it.
struct RailCard: View {
    let label: String
    let number: String
    var unit: String?
    let line: String
    var tone: String = "none"

    var body: some View {
        Tile(padding: DesignTokens.s8) {
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                Text(label)
                    .ovType(.xs, weight: .medium, mono: true)
                    .textCase(.uppercase)
                    .ovTracking(0.1, .xs)
                    .foregroundStyle(Design.ink3)
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s5) {
                    Text(number)
                        .ovType(.xl, weight: .ultraLight, mono: true, leading: 1)
                        .ovTracking(-0.04, .xl)
                        .foregroundStyle(Design.colour(forTone: tone,
                                                       fallback: Design.ink))
                        .lineLimit(1)
                    if let unit {
                        Text(unit)
                            .ovType(.sm)
                            .foregroundStyle(Design.ink3)
                    }
                }
                Text(line)
                    .ovType(.sm, leading: 1.35)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(minWidth: 140, alignment: .leading)
    }
}

/// `.empty` — a quiet tile. No dashed borders anywhere in the system: one
/// sentence that says what is true, and one link to what would change it.
struct Empty: View {
    let kicker: String
    var title: String?
    let say: String
    var link: String?
    var act: (() -> Void)?

    var body: some View {
        Tile(padding: DesignTokens.s21) {
            VStack(alignment: .leading, spacing: DesignTokens.s8) {
                Text(kicker)
                    .ovType(.xs, mono: true)
                    .textCase(.uppercase)
                    .ovTracking(0.1, .xs)
                    .foregroundStyle(Design.ink3)
                if let title {
                    Text(title)
                        .ovType(.md)
                        .foregroundStyle(Design.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(say)
                    .ovType(.sm)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                if let link {
                    Button(link) { act?() }
                        .buttonStyle(.plain)
                        .ovType(.sm)
                        .foregroundStyle(Design.ink)
                        .underline()
                }
            }
        }
    }
}

// MARK: - state words, dots, glyphs, chips

/// `.tri` — the ▲. Only on what is off, only in coral, 10 px, never anywhere
/// else. It repeats a word already printed beside it.
struct Triangle: View {
    var body: some View {
        Text("▲")
            .font(.system(size: 10))
            .foregroundStyle(Design.badFill)
            .accessibilityHidden(true)
    }
}

/// `.dot` — 8 px, filled in the state's colour, hollow when nothing was ever
/// measured.
struct StateDot: View {
    let word: String

    var body: some View {
        let colour = Design.colour(forWord: word)
        let hollow = Design.hollow(word)
        Circle()
            .strokeBorder(colour, lineWidth: hollow ? 1 : 0)
            .background(Circle().fill(hollow ? Color.clear : colour))
            .frame(width: 8, height: 8)
    }
}

/// `.state` — a state is a word in its colour, with the dot before it and the
/// ▲ after it when it is off. Never a filled badge.
struct StateWord: View {
    let word: String
    var dot = false
    var triangle = false
    /// When the word is not one of the four — "Hashimoto's" on a paper row —
    /// the tone says which colour it wears.
    var tone: String?

    var body: some View {
        HStack(spacing: DesignTokens.s5) {
            if dot { StateDot(word: word) }
            Text(word)
                .ovType(.sm)
                .foregroundStyle(tone.map { Design.colour(forTone: $0) }
                                 ?? Design.colour(forWord: word))
            if triangle, Design.isOff(word) { Triangle() }
        }
        .accessibilityElement(children: .combine)
    }
}

/// `.chip` — a capsule on `--surface-hi`, 13 px, 5 px by 13 px of padding.
struct Chip<Content: View>: View {
    var quiet = false
    var ink = false
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: DesignTokens.s5) { content }
            .ovType(.sm)
            .foregroundStyle(ink ? Design.canvas
                             : (quiet ? Design.ink3 : Design.ink))
            .padding(.horizontal, DesignTokens.s13)
            .padding(.vertical, DesignTokens.s5)
            .background {
                if ink { Capsule().fill(Design.ink) }
                else if quiet { Capsule().strokeBorder(Design.hair,
                                                       lineWidth: Design.hairline) }
                else { Capsule().fill(Design.surfaceHi) }
            }
    }
}

/// One system as a chip: the dot, the name, and the ▲ when it is off.
struct SystemChip: View {
    let name: String
    let word: String
    var showsWord = false

    var body: some View {
        Chip {
            StateDot(word: word)
            Text(name)
            if showsWord {
                Text(word)
                    .ovType(.xs, weight: .medium, mono: true)
                    .textCase(.uppercase)
                    .ovTracking(0.04, .xs)
                    .foregroundStyle(Design.ink3)
            }
            if Design.isOff(word) { Triangle() }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(word)")
    }
}

/// `.tier` — how settled the thing behind an action is. An outline, never a
/// fill: the word carries the colour.
struct Tier: View {
    let word: String

    private var colour: Color {
        switch word {
        case "early": return Design.warn
        case "experimental": return Design.ink3
        default: return Design.ink2
        }
    }

    var body: some View {
        Text(word)
            .ovType(.xs, mono: true)
            .textCase(.uppercase)
            .ovTracking(0.08, .xs)
            .foregroundStyle(colour)
            .padding(.horizontal, DesignTokens.s8)
            .padding(.vertical, 2)
            .overlay(Capsule().strokeBorder(colour.opacity(0.5),
                                            lineWidth: Design.hairline))
    }
}

/// `.glyph` — ● A, ● B, ◐ opinion, ○ E. The glyph never changes size and never
/// gains a fill.
struct Glyph: View {
    let mark: String
    var kind: String = "sci"

    private var colour: Color {
        switch kind {
        case "sci": return Design.ok
        case "op": return Design.warn
        default: return Design.ink3
        }
    }

    var body: some View {
        Text(mark)
            .ovType(.xs, mono: true)
            .foregroundStyle(colour)
    }
}

// MARK: - buttons, the three jobs and the lime add

/// `.b` — one family, 40 px tall (the app's `.hit-40` rule), a capsule, 13 px,
/// 8 px by 21 px of padding. `.b-sm` is 32 px, 5 px by 13 px, 11 px.
enum ButtonJob {
    case ink, quiet, text, add
}

struct OVButtonStyle: ButtonStyle {
    var job: ButtonJob = .quiet
    var small = false
    var wide = false
    /// `justify-content: flex-start` — Capture's four rows, and nothing else.
    var leading = false

    private var height: CGFloat { small ? 32 : 40 }
    private var padH: CGFloat {
        if case .text = job { return DesignTokens.s5 }
        return small ? DesignTokens.s13 : DesignTokens.s21
    }
    private var padV: CGFloat { small ? DesignTokens.s5 : DesignTokens.s8 }
    private var size: Design.Size { small ? .xs : .sm }

    private var ink: Color {
        switch job {
        case .ink: return Design.canvas
        case .quiet: return Design.ink
        case .text: return Design.ink2
        case .add: return Design.limeInk
        }
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .ovType(size, weight: .regular, leading: 1.2)
            .foregroundStyle(ink)
            .padding(.horizontal, padH)
            .padding(.vertical, padV)
            .frame(minHeight: height)
            // `width: 100%; justify-content: flex-start` — a full-width
            // button on the phone reads left, like the row it replaces.
            .frame(maxWidth: wide ? .infinity : nil,
                   alignment: leading ? .leading : .center)
            .background {
                switch job {
                case .ink: Capsule().fill(Design.ink)
                case .add: Capsule().fill(Design.lime)
                case .quiet: Capsule().strokeBorder(Design.hair,
                                                    lineWidth: Design.hairline)
                case .text: Color.clear
                }
            }
            .contentShape(Capsule())
            // `.b:active { scale: .96 }`
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: DesignTokens.durQuick),
                       value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == OVButtonStyle {
    /// The one primary per screen.
    static var ovInk: OVButtonStyle { OVButtonStyle(job: .ink) }
    /// Bordered, and does the rest.
    static var ovQuiet: OVButtonStyle { OVButtonStyle(job: .quiet) }
    /// No box.
    static var ovText: OVButtonStyle { OVButtonStyle(job: .text) }
    /// The lime add: the one control that puts data in.
    static var ovAdd: OVButtonStyle { OVButtonStyle(job: .add) }

    static func ov(_ job: ButtonJob, small: Bool = false,
                   wide: Bool = false,
                   leading: Bool = false) -> OVButtonStyle {
        OVButtonStyle(job: job, small: small, wide: wide, leading: leading)
    }
}

/// `.tabbar .plusslot button` — the 44 px lime circle. There is one of it.
struct AddButton: View {
    let act: () -> Void

    var body: some View {
        Button(action: act) {
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Design.limeInk)
                .frame(width: 44, height: 44)
                .background(Design.lime)
                .clipShape(Circle())
                .shadow(color: Color(red: 120 / 255, green: 140 / 255,
                                     blue: 20 / 255).opacity(0.7),
                        radius: (13 - 5) / 2, x: 0, y: 5)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add data")
    }
}

// MARK: - inputs

/// `.field > label` — mono, 11 px, uppercase, 0.08 em of tracking.
struct FieldLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .ovType(.xs, mono: true)
            .textCase(.uppercase)
            .ovTracking(0.08, .xs)
            .foregroundStyle(Design.ink3)
    }
}

/// `.inp` — 40 px tall, 13 px radius, `--surface-hi` with a 1 px inset hair.
/// Focus is a 2 px ink ring; invalid is a 2 px `--bad` ring.
///
/// `lines` turns it into `.ta`, the same box with a 76 px floor that grows
/// with the words. Everything else — the ring, the radius, the surface, the
/// padding — is the one field the system already draws.
struct Inp: View {
    /// Empty draws no label: the sheet's own title is the label there.
    var label: String
    @Binding var text: String
    var placeholder = ""
    var secure = false
    var help: String?
    var error: String?
    var mono = false
    /// `.ta` — how many lines the box may grow to before it scrolls.
    var lines: ClosedRange<Int>?
    var content: UITextContentType?
    var keyboard: UIKeyboardType = .default
    @FocusState private var focused: Bool

    private var ring: Color {
        if error != nil { return Design.bad }
        return focused ? Design.ink : Design.hair
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            if !label.isEmpty { FieldLabel(text: label) }
            Group {
                if let lines {
                    TextField(placeholder, text: $text, axis: .vertical)
                        .lineLimit(lines)
                } else if secure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .ovType(.md, mono: mono)
            .foregroundStyle(Design.ink)
            .textContentType(content)
            .keyboardType(keyboard)
            .focused($focused)
            .padding(.horizontal, DesignTokens.s13)
            .padding(.vertical, DesignTokens.s8)
            .frame(minHeight: lines == nil ? 40 : 76,
                   alignment: lines == nil ? .center : .topLeading)
            .background(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                         style: .continuous)
                .fill(Design.surfaceHi))
            .overlay(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                      style: .continuous)
                .strokeBorder(ring,
                              lineWidth: (focused || error != nil) ? 2 : 1))
            if let error {
                Text(error).ovType(.xs).foregroundStyle(Design.bad)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let help {
                Text(help).ovType(.xs).foregroundStyle(Design.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// `.checkrow` — a 21 px box on the left, the label and its caption on the
/// right, 40 px of hit area.
struct CheckRow: View {
    let label: String
    let caption: String
    var on: Bool
    var act: (() -> Void)?

    var body: some View {
        Button { act?() } label: {
            HStack(alignment: .center, spacing: DesignTokens.s13) {
                TickBox(on: on)
                VStack(alignment: .leading, spacing: 0) {
                    Text(label).ovType(.sm).foregroundStyle(Design.ink)
                    Text(caption).ovType(.xs).foregroundStyle(Design.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 40)
        }
        .buttonStyle(.plain)
        .disabled(act == nil)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

/// `.checkrow .box` / `.dayrow .box` — 21 px, 5 px radius, a hairline when
/// empty, filled with ink and a canvas tick when done.
struct TickBox: View {
    let on: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: DesignTokens.s5, style: .continuous)
            .fill(on ? Design.ink : Design.surfaceHi)
            .overlay {
                if on {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Design.canvas)
                } else {
                    RoundedRectangle(cornerRadius: DesignTokens.s5,
                                     style: .continuous)
                        .strokeBorder(Design.hair, lineWidth: Design.hairline)
                }
            }
            .frame(width: DesignTokens.s21, height: DesignTokens.s21)
    }
}

// MARK: - lists and rows

/// `.mrow` — Body's day list: name, type and source, the value with its unit,
/// and the state word in a 76 px column on the right.
struct MarkerRow: View {
    let name: String
    let source: String
    let value: String
    var unit: String?
    let word: String
    /// `grid-template-columns: minmax(0, 1fr) 96px auto 76px` — the second
    /// track. The phone's row is 364 pt, so the slot is 64 by 20 rather than
    /// the page's 96 by 26; it is a fixed slot either way, so the line can
    /// never run over the name or the value.
    var spark: [Double]?

    static let sparkSlot = CGSize(width: 64, height: 20)

    var body: some View {
        HStack(alignment: .center, spacing: DesignTokens.s13) {
            VStack(alignment: .leading, spacing: 0) {
                Text(name).ovType(.sm).foregroundStyle(Design.ink)
                    .lineLimit(1)
                Text(source).ovType(.xs).foregroundStyle(Design.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // `grid-template-columns: 1fr auto auto` — the name column takes
            // what is left, and a Spacer beside it would take half of that.
            .frame(maxWidth: .infinity, alignment: .leading)
            if let spark {
                Sparkline(values: spark, width: Self.sparkSlot.width,
                          height: Self.sparkSlot.height)
            }
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s3) {
                Text(value)
                    .ovType(.lg, weight: .light, mono: true)
                    .ovTracking(-0.03, .lg)
                    .foregroundStyle(Design.ink)
                if let unit, !unit.isEmpty {
                    Text(unit).ovType(.xs).foregroundStyle(Design.ink3)
                }
            }
            .fixedSize()
            Text(word)
                .ovType(.xs)
                .foregroundStyle(Design.colour(forWord: word))
                .frame(width: 76, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

/// `.dayrow` — the day column on the phone: a 54 px mono hour, the 21 px tick,
/// then the thing, the why and the tag stacked in one column.
struct DayRow: View {
    let at: String
    let what: String
    let why: String
    let tag: String
    var done: Bool
    var enabled = true
    var tick: (() -> Void)?
    var adopt: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: DesignTokens.s13) {
            Text(at)
                .ovType(.sm, mono: true)
                .foregroundStyle(Design.ink3)
                .padding(.top, 2)
                .frame(width: 54, alignment: .leading)
            Button { tick?() } label: { TickBox(on: done) }
                .buttonStyle(.plain)
                .disabled(!enabled)
                .opacity(enabled ? 1 : 0.4)
                .accessibilityLabel(what)
                .accessibilityValue(enabled ? (done ? "done" : "not done")
                                    : "not adopted yet")
            VStack(alignment: .leading, spacing: DesignTokens.s3) {
                Text(what)
                    .ovType(.sm, leading: 1.45)
                    .foregroundStyle(done ? Design.ink2 : Design.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(why)
                    .ovType(.xs)
                    .foregroundStyle(Design.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                Text(tag)
                    .ovType(.xs, mono: true)
                    .foregroundStyle(Design.ink3)
                if let adopt {
                    Button("＋ Add", action: adopt)
                        .buttonStyle(.ov(.add, small: true))
                        .padding(.top, DesignTokens.s5)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

/// `.verdict` — answer first: the 3 px rail in the state's colour, the answer
/// in the heading, the reason in one line, the multiplier in mono.
struct VerdictRow: View {
    let question: String
    let answer: String
    let say: String
    let side: String
    var tone: String = "none"
    var grade: String?

    private var rail: Color {
        switch tone {
        case "ok": return Design.ok
        case "warn": return Design.warn
        case "bad": return Design.badFill
        default: return Design.ink3
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: DesignTokens.s13) {
            Capsule().fill(rail)
                .frame(width: DesignTokens.s3)
                .frame(minHeight: DesignTokens.s21)
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                (Text(question + " ").foregroundStyle(Design.ink)
                 + Text(answer).foregroundStyle(rail))
                    .ovType(.md, leading: 1.4)
                    .fixedSize(horizontal: false, vertical: true)
                Text(say)
                    .ovType(.sm, leading: 1.6)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s5) {
                    Text(side)
                        .ovType(side == "no change" ? .md : .lg, mono: true)
                        .foregroundStyle(side == "no change" ? Design.ink3
                                         : Design.ink)
                    if let grade { Glyph(mark: grade) }
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// `.paper` — title, citation, grade, what it found, and what it would move.
/// A paper that moves nothing says "nothing for you" in the same place.
struct PaperRow: View {
    let title: String
    let cite: [String]
    var grade: String?
    let found: String
    let movesWord: String
    var movesTone: String?
    var moves = ""
    /// A paper nothing has read says only that; the "moves →" line would be a
    /// second copy of the same sentence.
    var showsMoves = true
    /// `research.html`'s 390 frame drops the two buttons — "the Open and
    /// Discuss buttons move to a long-press menu" — so the phone's row is the
    /// row without them and the whole row is the tap target.
    var actions = true
    var open: (() -> Void)?
    var discuss: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: DesignTokens.s13) {
            RoundedRectangle(cornerRadius: DesignTokens.rInner,
                             style: .continuous)
                .fill(Design.canvasDeep)
                .frame(width: DesignTokens.s34, height: DesignTokens.s34)
                .overlay(Image(systemName: "doc.text")
                    .font(.system(size: 15))
                    .foregroundStyle(Design.ink2))
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                Text(title).ovType(.sm, leading: 1.45)
                    .foregroundStyle(Design.ink)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: DesignTokens.s8) {
                    Text(cite.joined(separator: " · "))
                        .ovType(.xs, mono: true)
                        .foregroundStyle(Design.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                    if let grade { Glyph(mark: grade) }
                }
                Text(found).ovType(.sm, leading: 1.6)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                if showsMoves {
                    HStack(alignment: .firstTextBaseline,
                           spacing: DesignTokens.s8) {
                        Text("moves →").ovType(.sm, mono: true)
                            .foregroundStyle(Design.ink3)
                        StateWord(word: movesWord, tone: movesTone)
                    }
                }
                if !moves.isEmpty {
                    Text(moves).ovType(.sm).foregroundStyle(Design.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if actions {
                    HStack(spacing: DesignTokens.s5) {
                        Button("Open") { open?() }
                            .buttonStyle(.ov(.quiet, small: true))
                        Button("Discuss") { discuss?() }
                            .buttonStyle(.ov(.text, small: true))
                    }
                }
            }
        }
    }
}

/// A CSS grid row: `grid-template-columns` with `fr` weights and fixed
/// tracks, and one gap between them. SwiftUI's stacks split leftover space
/// evenly, which is not what `minmax(0, 1.1fr) minmax(0, 1fr) 110px` means.
struct Columns: Layout {
    enum Track {
        case flex(CGFloat)
        case fixed(CGFloat)
    }

    let tracks: [Track]
    var spacing: CGFloat = DesignTokens.s13

    private func widths(_ total: CGFloat) -> [CGFloat] {
        let gaps = spacing * CGFloat(max(tracks.count - 1, 0))
        var fixed: CGFloat = 0
        var weight: CGFloat = 0
        for track in tracks {
            switch track {
            case .fixed(let w): fixed += w
            case .flex(let f): weight += f
            }
        }
        let free = max(total - gaps - fixed, 0)
        return tracks.map { track in
            switch track {
            case .fixed(let w): return w
            case .flex(let f): return weight > 0 ? free * f / weight : 0
            }
        }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews,
                      cache: inout ()) -> CGSize {
        let total = proposal.width ?? 0
        let cols = widths(total)
        let height = zip(subviews, cols).map { view, w in
            view.sizeThatFits(ProposedViewSize(width: w, height: nil)).height
        }.max() ?? 0
        return CGSize(width: total, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize,
                       subviews: Subviews, cache: inout ()) {
        let cols = widths(bounds.width)
        var x = bounds.minX
        for (view, w) in zip(subviews, cols) {
            view.place(at: CGPoint(x: x, y: bounds.midY),
                       anchor: .leading,
                       proposal: ProposedViewSize(width: w, height: nil))
            x += w + spacing
        }
    }
}

/// `.markerrow.said` — the name and its line, the sentence in the middle
/// column, and the value on the right in 110 px. The container query that
/// stacks this row never fires at 390 px inside the phone frame, so the
/// columns stay.
struct SaidRow: View {
    let name: String
    let say: String
    let meta: String
    let word: String
    var tone: String = "none"

    var body: some View {
        Columns(tracks: [.flex(1.1), .flex(1), .fixed(110)]) {
            VStack(alignment: .leading, spacing: 0) {
                Text(name).ovType(.sm).foregroundStyle(Design.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(say).ovType(.xs).foregroundStyle(Design.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(meta).ovType(.xs, leading: 1.45)
                .foregroundStyle(Design.ink3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Text(word)
                .ovType(.sm)
                .foregroundStyle(Design.colour(forTone: tone,
                                               fallback: Design.ink3))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// `.uprow` — a file, what came out of it, what to do about it.
struct UploadRow: View {
    let file: String
    let meta: String
    let got: String
    let word: String

    var body: some View {
        HStack(alignment: .top, spacing: DesignTokens.s13) {
            RoundedRectangle(cornerRadius: DesignTokens.rInner,
                             style: .continuous)
                .fill(Design.canvasDeep)
                .frame(width: DesignTokens.s34, height: DesignTokens.s34)
                .overlay(Image(systemName: "doc")
                    .font(.system(size: 15)).foregroundStyle(Design.ink2))
            VStack(alignment: .leading, spacing: 2) {
                Text(file).ovType(.sm).foregroundStyle(Design.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(meta).ovType(.xs).foregroundStyle(Design.ink3)
                Text(got).ovType(.xs).foregroundStyle(Design.ink3)
                StateWord(word: word)
            }
            Spacer(minLength: 0)
        }
    }
}

/// `.protorow` — what you decided to do, and the 30 days behind it.
struct ProtocolRow: View {
    let name: String
    let sub: String
    let pct: String
    let of: String
    var strip: [Int]?

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            HStack(alignment: .top, spacing: DesignTokens.s13) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).ovType(.sm).foregroundStyle(Design.ink)
                    Text(sub).ovType(.xs).foregroundStyle(Design.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: DesignTokens.s5)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(pct).ovType(.lg, weight: .light, mono: true)
                        .foregroundStyle(Design.ink)
                    Text(of).ovType(.sm).foregroundStyle(Design.ink3)
                }
            }
            if let strip { Strip30(days: strip) }
        }
    }
}

/// `.strip30` — 30 cells, one a day, oldest on the left, today outlined.
struct Strip30: View {
    /// 0 not done, 1 done, 2 today.
    let days: [Int]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                RoundedRectangle(cornerRadius: 1)
                    .fill(day == 1 ? Design.ok.opacity(0.72) : Design.track)
                    .frame(height: 13)
                    .overlay {
                        if day == 2 {
                            RoundedRectangle(cornerRadius: 1)
                                .strokeBorder(Design.ink,
                                              lineWidth: Design.hairline)
                        }
                    }
            }
        }
        .accessibilityHidden(true)
    }
}

/// `.goalrow` — the target, where the value is now, and the bar between them.
/// `grid-template-columns: minmax(0, 1fr) auto`, baseline aligned, with the
/// 5 px progress bar spanning both columns under them.
struct GoalRow: View {
    let goal: String
    let meta: String
    let target: String
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s13) {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    Text(goal).ovType(.sm, weight: .semibold)
                        .foregroundStyle(Design.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(meta).ovType(.sm).foregroundStyle(Design.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(target).ovType(.sm, mono: true)
                    .foregroundStyle(Design.ink2)
                    .lineLimit(1)
                    .fixedSize()
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Design.track)
                    Capsule().fill(Design.ok)
                        .frame(width: proxy.size.width * progress)
                }
            }
            .frame(height: 5)
        }
    }
}

/// The goal card, phase 34 section 1: what this person is moving, how far it
/// still has to go, and whether it is going to get there.
///
/// `.goalrow` says the same things in one line on the web; the phone has the
/// room for the ruler, so the card is the row with the ruler under it and the
/// adopted moves below that. Nothing here is invented: with no projection the
/// pace line says "no projection yet" rather than a verdict nobody computed.
struct GoalCard: View {
    struct Move: Identifiable {
        let id: String
        let title: String
        let done: Bool
        var busy = false
    }

    let name: String
    /// "131", the value as it stands.
    let value: String
    var unit: String?
    /// "70–100 mg/dL", the band it is aimed at.
    let target: String
    /// "due Dec 1 2026 · 31 mg/dL to go"
    let meta: String
    let word: String
    /// 0…1 along the ruler.
    var at: Double = 0
    var normal: ClosedRange<Double>?
    var optimal: ClosedRange<Double>?
    var band: ClosedRange<Double>?
    var low = ""
    var mid = ""
    var high = ""
    let pace: String
    var moves: [Move] = []
    var tick: ((Move) -> Void)?

    var body: some View {
        Panel(title: name, meta: word.uppercased()) {
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                Text(value)
                    .ovType(.xl, weight: .light, mono: true, leading: 1.1)
                    .ovTracking(-0.03, .xl)
                    .foregroundStyle(Design.colour(forWord: word))
                if let unit, !unit.isEmpty {
                    Text(unit).ovType(.xs).foregroundStyle(Design.ink3)
                }
                Text("→").ovType(.sm, mono: true).foregroundStyle(Design.ink3)
                Text(target).ovType(.sm, mono: true)
                    .foregroundStyle(Design.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            Ruler(at: at, normal: normal, optimal: optimal, target: band,
                  word: word, low: low, mid: mid, high: high)
            Text(meta).ovType(.sm).foregroundStyle(Design.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Text(pace).ovType(.sm).foregroundStyle(Design.ink3)
                .fixedSize(horizontal: false, vertical: true)
            if !moves.isEmpty {
                Hair()
                VStack(alignment: .leading, spacing: DesignTokens.s8) {
                    ForEach(moves) { move in
                        Button { tick?(move) } label: {
                            HStack(alignment: .top,
                                   spacing: DesignTokens.s13) {
                                TickBox(on: move.done)
                                Text(move.title)
                                    .ovType(.sm, leading: 1.45)
                                    .foregroundStyle(move.done ? Design.ink2
                                                     : Design.ink)
                                    .fixedSize(horizontal: false,
                                               vertical: true)
                                Spacer(minLength: 0)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(move.busy || tick == nil)
                        .opacity(move.busy ? 0.45 : 1)
                        .accessibilityLabel(move.title)
                        .accessibilityValue(move.done ? "done" : "not done")
                    }
                }
            }
        }
    }
}

/// `.filters` — one row of pills, the chosen one in ink. The state filter on
/// Blood and the "moves something" filter on Research are the same control.
/// It wraps rather than scrolling sideways: four state pills do not fit on
/// 364 pt, and a filter a person has to scroll to find is a filter nobody
/// uses.
struct Filters: View {
    let names: [String]
    @Binding var chosen: String
    var count: (String) -> Int

    var body: some View {
        Flow {
            ForEach(names, id: \.self) { name in
                Button { chosen = name } label: {
                    Chip(quiet: chosen != name, ink: chosen == name) {
                        Text(name)
                        Text(Design.number(count(name)))
                            .ovType(.xs, mono: true)
                            .foregroundStyle(chosen == name
                                             ? Design.canvas : Design.ink3)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(chosen == name
                                        ? [.isButton, .isSelected]
                                        : .isButton)
            }
        }
    }
}

/// `.searchbox` — the magnifier, one field, and the clear when it has words.
struct SearchBox: View {
    @Binding var text: String
    var placeholder = "ferritin, TSH, LDL…"

    var body: some View {
        HStack(spacing: DesignTokens.s8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(Design.ink3)
            TextField(placeholder, text: $text)
                .ovType(.sm)
                .foregroundStyle(Design.ink)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Design.ink3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear the search")
            }
        }
        .padding(.horizontal, DesignTokens.s13)
        .frame(height: 40)
        .background(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                     style: .continuous)
            .fill(Design.surfaceHi))
        .overlay(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                  style: .continuous)
            .strokeBorder(Design.hair, lineWidth: Design.hairline))
    }
}

/// `.threadrow` — a date, a question, a chevron.
struct ThreadRow: View {
    let day: String
    let question: String

    var body: some View {
        HStack(spacing: DesignTokens.s13) {
            Text(day).ovType(.xs, mono: true).foregroundStyle(Design.ink3)
                .frame(width: 48, alignment: .leading)
            Text(question).ovType(.sm).foregroundStyle(Design.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 11))
                .foregroundStyle(Design.ink3)
        }
    }
}

// MARK: - tables

/// `.tbl` — mono uppercase headers over an ink-3 rule, hairlines between rows,
/// numbers in mono and right-aligned. No pagination anywhere in the app.
struct Table: View {
    let columns: [String]
    let rows: [[String]]
    /// Column indexes whose cells are numbers.
    var numeric: Set<Int> = []
    /// A fixed width per column, or 0 for "take what is left". A date column
    /// left to share the width evenly wraps "Apr 23 2026" onto two lines.
    var widths: [CGFloat]?

    private func width(_ i: Int) -> CGFloat? {
        guard let w = widths, i < w.count, w[i] > 0 else { return nil }
        return w[i]
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 0) {
                ForEach(Array(columns.enumerated()), id: \.offset) { i, head in
                    Text(head)
                        .ovType(.xs, mono: true)
                        .textCase(.uppercase)
                        .ovTracking(0.1, .xs)
                        .foregroundStyle(Design.ink3)
                        .padding(.horizontal, DesignTokens.s5)
                        .padding(.vertical, DesignTokens.s8)
                        .track(width(i))
                }
            }
            Rectangle().fill(Design.ink3).frame(height: Design.hairline)
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(row.enumerated()), id: \.offset) { i, cell in
                        Text(cell)
                            .ovType(.sm, mono: numeric.contains(i))
                            .foregroundStyle(numeric.contains(i) || i == 0
                                             ? Design.ink : Design.ink2)
                            .padding(.horizontal, DesignTokens.s5)
                            .padding(.vertical, DesignTokens.s8)
                            .track(width(i))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Hair()
            }
        }
    }
}

private extension View {
    /// One CSS grid track: a fixed width, or the leftover share.
    @ViewBuilder func track(_ width: CGFloat?) -> some View {
        if let width { frame(width: width, alignment: .leading) }
        else { frame(maxWidth: .infinity, alignment: .leading) }
    }
}

/// `.tbl.sched` — what, how much, when, with what, until. The four slots are
/// fixed so the eye can scan the column; an unused slot is a filled track.
struct ScheduleTable: View {
    struct Row: Identifiable {
        let id = UUID()
        let what: String
        let dose: String
        /// M, N, E, B — the one that is on.
        let slot: Int
        let note: String?
        let with: String
        let until: String
        let aimedAt: String
    }

    let rows: [Row]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    HStack(alignment: .firstTextBaseline,
                           spacing: DesignTokens.s8) {
                        Text(row.what).ovType(.sm).foregroundStyle(Design.ink)
                        Text(row.dose).ovType(.sm, mono: true)
                            .foregroundStyle(Design.ink)
                        Spacer(minLength: DesignTokens.s5)
                        Slots(on: row.slot)
                        if let note = row.note {
                            Text(note).ovType(.xs, mono: true)
                                .ovTracking(0.04, .xs)
                                .foregroundStyle(Design.ink3)
                        }
                    }
                    Text(row.with).ovType(.sm).foregroundStyle(Design.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(alignment: .firstTextBaseline,
                           spacing: DesignTokens.s8) {
                        Text(row.until).ovType(.sm, mono: true)
                            .foregroundStyle(Design.ink2)
                        Text(row.aimedAt).ovType(.sm)
                            .foregroundStyle(Design.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, DesignTokens.s8)
                Hair()
            }
        }
    }

    /// `.slots` — M N E B, the used one filled.
    struct Slots: View {
        let on: Int
        private static let letters = ["M", "N", "E", "B"]

        var body: some View {
            HStack(spacing: 2) {
                ForEach(Array(Self.letters.enumerated()), id: \.offset) { i, l in
                    Text(l)
                        .ovType(.xs, mono: true)
                        .foregroundStyle(i == on ? Design.canvas : Design.ink3)
                        .frame(width: 16, height: 16)
                        .background(RoundedRectangle(cornerRadius: 3)
                            .fill(i == on ? Design.ink : Design.track))
                }
            }
        }
    }
}

// MARK: - the month

/// `.month` — seven columns, one cell a day, today outlined the way the 30-cell
/// strip outlines it. The dots are what the day asks for.
struct MonthStrip: View {
    struct Day: Identifiable {
        let id = UUID()
        let number: Int?
        var past = false
        var today = false
        /// "train", "supp", "food", "draw", "check"
        var dots: [String] = []
    }

    let title: String
    let days: [Day]
    private static let dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    static func colour(_ kind: String) -> Color {
        switch kind {
        case "train": return Design.ok
        case "supp": return Design.ink2
        case "food": return Design.warn
        case "draw": return Design.badFill
        default: return .clear
        }
    }

    private let grid = Array(repeating: GridItem(.flexible(),
                                                 spacing: DesignTokens.s3),
                             count: 7)

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            LazyVGrid(columns: grid, spacing: DesignTokens.s3) {
                ForEach(Self.dow, id: \.self) { day in
                    Text(day)
                        .ovType(.xs, mono: true)
                        .textCase(.uppercase)
                        .ovTracking(0.1, .xs)
                        .foregroundStyle(Design.ink3)
                }
                ForEach(days) { day in cell(day) }
            }
            key
        }
    }

    private func cell(_ day: MonthStrip.Day) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s3) {
            if let number = day.number {
                Text("\(number)")
                    .ovType(.xs, mono: true, leading: 1)
                    .foregroundStyle(day.today ? Design.ink : Design.ink2)
            }
            Spacer(minLength: 0)
            HStack(spacing: 2) {
                ForEach(Array(day.dots.enumerated()), id: \.offset) { _, kind in
                    Circle()
                        .fill(Self.colour(kind))
                        .frame(width: DesignTokens.s5, height: DesignTokens.s5)
                        .overlay {
                            if kind == "check" {
                                Circle().strokeBorder(Design.ink3,
                                                      lineWidth: 1.5)
                            }
                        }
                }
            }
        }
        .padding(DesignTokens.s5)
        .frame(maxWidth: .infinity, minHeight: DesignTokens.s55,
               alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: DesignTokens.s5)
            .fill(day.number == nil ? Color.clear
                  : (day.past ? Design.canvasDeep : Design.surfaceFlat)))
        .overlay {
            if day.number != nil {
                RoundedRectangle(cornerRadius: DesignTokens.s5)
                    .strokeBorder(day.today ? Design.ink : Design.hair,
                                  lineWidth: day.today ? 1.5 : Design.hairline)
            }
        }
    }

    private var key: some View {
        Flow(spacing: DesignTokens.s13) {
            ForEach([("train", "training"), ("supp", "supplement"),
                     ("food", "food rule"), ("draw", "draw"),
                     ("check", "check-in")], id: \.0) { kind, word in
                HStack(spacing: DesignTokens.s5) {
                    Circle().fill(Self.colour(kind))
                        .frame(width: DesignTokens.s5, height: DesignTokens.s5)
                        .overlay {
                            if kind == "check" {
                                Circle().strokeBorder(Design.ink3,
                                                      lineWidth: 1.5)
                            }
                        }
                    Text(word).ovType(.xs).foregroundStyle(Design.ink3)
                }
            }
        }
    }
}

// MARK: - charts

/// `.ruler` — one value against its own bands. The track is `--track`, the
/// normal and optimal bands are the green mixed into it, and the value is a
/// 2 px tick in the state's colour. The spectrum is a mark, never a fill.
struct Ruler: View {
    /// 0…1 along the track.
    let at: Double
    var normal: ClosedRange<Double>?
    var optimal: ClosedRange<Double>?
    /// `.band.pace` — the goal band, hatched rather than filled, so a target
    /// nobody has reached yet cannot be mistaken for a measured band.
    var target: ClosedRange<Double>?
    var ghost: Double?
    let word: String
    let low: String
    let mid: String
    let high: String

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s3) {
            GeometryReader { proxy in
                let w = proxy.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(Design.track)
                    if let normal {
                        band(normal, w, Design.ok.opacity(0.16))
                    }
                    if let optimal {
                        band(optimal, w, Design.ok.opacity(0.36))
                    }
                    if let target {
                        Hatch()
                            .frame(width: max(0, w * (target.upperBound
                                                      - target.lowerBound)))
                            .offset(x: w * target.lowerBound)
                    }
                    if let ghost {
                        Rectangle().fill(Design.ink3.opacity(0.5))
                            .frame(width: 1.5)
                            .offset(x: w * ghost)
                    }
                    Rectangle().fill(Design.colour(forWord: word))
                        .frame(width: 2)
                        .cornerRadius(1)
                        .offset(x: max(0, w * at - 1))
                }
            }
            .frame(height: 18)
            HStack {
                Text(low)
                Spacer()
                Text(mid)
                Spacer()
                Text(high)
            }
            .ovType(.xs, mono: true)
            .foregroundStyle(Design.ink3)
        }
    }

    private func band(_ range: ClosedRange<Double>, _ w: CGFloat,
                      _ fill: Color) -> some View {
        Capsule().fill(fill)
            .frame(width: max(0, w * (range.upperBound - range.lowerBound)))
            .offset(x: w * range.lowerBound)
    }
}

/// `.band.pace` / `.hist-band.pace` — `repeating-linear-gradient(118deg, ok
/// 46%, transparent 4px 9px)`. A target is drawn, never filled: the hatch is
/// what says "not measured, aimed at".
struct Hatch: View {
    var colour: Color = Design.ok
    var opacity: Double = 0.46
    /// The stripe and the gap, in points, as the CSS states them.
    var on: CGFloat = 4
    var off: CGFloat = 5

    var body: some View {
        Canvas { context, size in
            let step = on + off
            // 118 degrees from the x axis, which leans the stripe back.
            let lean = CGFloat(tan((118 - 90) * Double.pi / 180))
            let reach = size.height * abs(lean)
            var x = -reach
            while x < size.width + reach {
                var stripe = Path()
                stripe.move(to: CGPoint(x: x, y: size.height))
                stripe.addLine(to: CGPoint(x: x + lean * size.height, y: 0))
                stripe.addLine(to: CGPoint(x: x + lean * size.height + on, y: 0))
                stripe.addLine(to: CGPoint(x: x + on, y: size.height))
                stripe.closeSubpath()
                context.fill(stripe, with: .color(colour.opacity(opacity)))
                x += step
            }
        }
        .accessibilityHidden(true)
    }
}

/// `.spark` — 96 by 26, a 1.5 px `--ink-3` polyline with the last point marked
/// in ink. Drawn only where a daily series exists: never a fake flat line.
struct Sparkline: View {
    let values: [Double]
    var width: CGFloat = 96
    var height: CGFloat = 26

    var body: some View {
        Canvas { context, size in
            guard let low = values.min(), let high = values.max() else { return }
            // One draw is one dot: a line needs two points, and a flat line
            // through one reading is a line nobody measured.
            guard values.count > 1 else {
                context.fill(Path(CGRect(x: size.width / 2 - 1.5,
                                         y: size.height / 2 - 1.5,
                                         width: 3, height: 3)),
                             with: .color(Design.ink))
                return
            }
            let span = max(high - low, 0.0001)
            var path = Path()
            for (i, value) in values.enumerated() {
                let x = size.width * CGFloat(i) / CGFloat(values.count - 1)
                let y = size.height * (1 - CGFloat((value - low) / span))
                if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
                else { path.addLine(to: CGPoint(x: x, y: y)) }
            }
            context.stroke(path, with: .color(Design.ink3),
                           style: StrokeStyle(lineWidth: 1.5, lineCap: .round,
                                              lineJoin: .round))
            if let last = path.currentPoint {
                context.fill(Path(CGRect(x: last.x - 1.5, y: last.y - 1.5,
                                         width: 3, height: 3)),
                             with: .color(Design.ink))
            }
        }
        .frame(width: width, height: height)
        .accessibilityHidden(true)
    }
}

/// `.hist` — the history chart. One diamond a draw on a real value scale and a
/// real date scale; nothing is interpolated between two draws.
struct HistoryChart: View {
    struct Point: Identifiable {
        let id = UUID()
        /// 0…1 across the plot.
        let x: Double
        /// 0…1 down the plot.
        let y: Double
        let label: String
        var planned = false
    }

    let title: String
    let unit: String
    let points: [Point]
    var normal: ClosedRange<Double>?
    /// `.hist-band.pace` — a goal is hatched, never filled: a target is aimed
    /// at and never measured, and the two must not look alike.
    var hatched = false
    var mini = true

    private var plotHeight: CGFloat { mini ? 130 : 210 }

    var body: some View {
        Tile(padding: DesignTokens.s13) {
            VStack(alignment: .leading, spacing: DesignTokens.s8) {
                PanelHead(title: title, meta: unit)
                GeometryReader { proxy in
                    let size = proxy.size
                    ZStack(alignment: .topLeading) {
                        if let normal {
                            Group {
                                if hatched {
                                    Hatch(opacity: 0.34)
                                } else {
                                    Rectangle().fill(Design.ok.opacity(0.16))
                                }
                            }
                            .frame(height: size.height
                                   * (normal.upperBound - normal.lowerBound))
                            .offset(y: size.height * normal.lowerBound)
                        }
                        Path { path in
                            for (i, point) in points.enumerated()
                            where !point.planned {
                                let p = CGPoint(x: size.width * point.x,
                                                y: size.height * point.y)
                                if i == 0 { path.move(to: p) }
                                else { path.addLine(to: p) }
                            }
                        }
                        .stroke(Design.ink3, lineWidth: 1.5)
                        ForEach(points) { point in
                            diamond(point, size)
                        }
                    }
                }
                .frame(height: plotHeight)
            }
        }
    }

    private func diamond(_ point: Point, _ size: CGSize) -> some View {
        VStack(spacing: 2) {
            Text(point.label)
                .ovType(.xs, mono: true)
                .foregroundStyle(point.planned ? Design.ink3 : Design.ink)
            Rectangle()
                .fill(point.planned ? Color.clear : Design.ink)
                .overlay(Rectangle().strokeBorder(Design.ink, lineWidth: 1))
                .frame(width: 7, height: 7)
                .rotationEffect(.degrees(45))
        }
        .fixedSize()
        .position(x: min(max(size.width * point.x, 30), size.width - 30),
                  y: size.height * point.y)
    }
}

/// `.hovercard` — date, value, unit, state word, band and the "was". It is a
/// surface, so it is `--surface-hi` and never a spectrum fill.
struct HoverCard: View {
    let date: String
    let value: String
    var unit: String?
    let word: String
    let band: String
    var was: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(date)
                .ovType(.xs, mono: true)
                .ovTracking(0.04, .xs)
                .foregroundStyle(Design.ink3)
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s3) {
                Text(value).ovType(.lg, mono: true, leading: 1.15)
                    .foregroundStyle(Design.ink)
                if let unit {
                    Text(unit).ovType(.xs).foregroundStyle(Design.ink3)
                }
            }
            .padding(.top, 2)
            HStack(spacing: DesignTokens.s8) {
                StateWord(word: word)
                Text(band).ovType(.xs).foregroundStyle(Design.ink3)
            }
            .padding(.top, DesignTokens.s5)
            if let was {
                Text(was).ovType(.xs, mono: true).foregroundStyle(Design.ink3)
                    .padding(.top, DesignTokens.s3)
            }
        }
        .padding(.horizontal, DesignTokens.s13)
        .padding(.vertical, DesignTokens.s8)
        .frame(minWidth: 168, maxWidth: 260, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                     style: .continuous)
            .fill(Design.surfaceHi))
        .overlay(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                  style: .continuous)
            .strokeBorder(Design.hair, lineWidth: Design.hairline))
    }
}

// MARK: - sheets and overlays

/// `.ask` — the ask pill. `--surface-hi`, a capsule, and the lime Ask button
/// on its right.
struct AskPill: View {
    var placeholder = "Ask anything, or tell me what changed"
    var act: (() -> Void)?

    var body: some View {
        HStack(spacing: DesignTokens.s8) {
            Image(systemName: "sparkles")
                .font(.system(size: 16))
                .foregroundStyle(Design.ink3)
            Text(placeholder)
                .ovType(.sm)
                .foregroundStyle(Design.ink3)
                .lineLimit(1)
            Spacer(minLength: 0)
            Button("Ask") { act?() }
                .buttonStyle(.ovAdd)
        }
        .padding(.leading, DesignTokens.s13)
        .padding(DesignTokens.s5)
        .background(Capsule().fill(Design.surfaceHi))
    }
}

/// `.toast` — one at a time, bottom centre. Ink on the canvas colour, with the
/// undo inside it.
struct Toast: View {
    let say: String
    var undo: (() -> Void)?

    var body: some View {
        HStack(spacing: DesignTokens.s13) {
            Text(say).ovType(.sm).foregroundStyle(Design.canvas)
            if undo != nil {
                Button("Undo") { undo?() }
                    .buttonStyle(.plain)
                    .ovType(.xs)
                    .foregroundStyle(Design.canvas)
                    .padding(.horizontal, DesignTokens.s13)
                    .padding(.vertical, DesignTokens.s5)
                    .background(Capsule().fill(Design.canvas.opacity(0.16)))
            }
        }
        .padding(.leading, DesignTokens.s21)
        .padding(DesignTokens.s8)
        .background(Capsule().fill(Design.ink))
    }
}

/// `.sheet` — a head with its close, a body, and a foot of buttons.
struct Sheet<Body: View, Foot: View>: View {
    let title: String
    var close: (() -> Void)?
    @ViewBuilder var content: Body
    @ViewBuilder var foot: Foot

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: DesignTokens.s13) {
                Text(title).ovType(.md, weight: .medium)
                    .foregroundStyle(Design.ink)
                Spacer(minLength: 0)
                if let close {
                    Button { close() } label: {
                        Image(systemName: "xmark").font(.system(size: 15))
                    }
                    .buttonStyle(.ovText)
                    .accessibilityLabel("Close")
                }
            }
            .padding(.horizontal, DesignTokens.s21)
            .padding(.vertical, DesignTokens.s13)
            Hair()
            VStack(alignment: .leading, spacing: DesignTokens.s13) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(DesignTokens.s21)
            HStack(spacing: DesignTokens.s8) { foot }
                .padding(.horizontal, DesignTokens.s21)
                .padding(.bottom, DesignTokens.s21)
        }
        .background(Design.surfaceFlat)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.rHero,
                                    style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: DesignTokens.rHero,
                                  style: .continuous)
            .strokeBorder(Design.hair, lineWidth: Design.hairline))
    }
}

// MARK: - the page

/// `.sec-head` — the number in mono, the title at 21 px.
struct SecHead: View {
    let number: String
    let title: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s13) {
            Text(number)
                .ovType(.xs, mono: true)
                .ovTracking(0.14, .xs)
                .foregroundStyle(Design.ink3)
            Text(title)
                .ovType(.lg)
                .ovTracking(-0.028, .lg)
                .foregroundStyle(Design.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.bottom, DesignTokens.s5)
    }
}

/// `.lede` — the paragraph under a section head.
struct Lede: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .ovType(.sm)
            .foregroundStyle(Design.ink2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, DesignTokens.s21)
    }
}

/// `.sub` — a 15 px title, a 13 px note, a hairline under both.
struct SubHead: View {
    let title: String
    var note: String?
    /// `margin-top` — 34 on a page, 0 on the first group of a list.
    var top: CGFloat = DesignTokens.s34

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s13) {
                Text(title).ovType(.md, weight: .medium)
                    .foregroundStyle(Design.ink)
                if let note {
                    Text(note).ovType(.sm).foregroundStyle(Design.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            Hair()
        }
        .padding(.top, top)
        .padding(.bottom, DesignTokens.s13)
    }
}

/// `.cap` — the caption under a thing.
struct Caption: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .ovType(.sm)
            .foregroundStyle(Design.ink3)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// `.t-meta` — the 13 px quiet line the system uses everywhere.
struct Meta: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).ovType(.sm, leading: 1.45).foregroundStyle(Design.ink3)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// `.screenhead` — the screen's own title, and one icon on the right.
/// `padding: 0 3px 13px`.
struct ScreenHead: View {
    let title: String
    var icon: String?
    var iconLabel: String?
    var act: (() -> Void)?

    var body: some View {
        HStack(alignment: .center, spacing: DesignTokens.s8) {
            Text(title)
                .ovType(.lg)
                .ovTracking(-0.03, .lg)
                .foregroundStyle(Design.ink)
            Spacer(minLength: 0)
            if let icon {
                Button { act?() } label: {
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .light))
                        .foregroundStyle(Design.ink3)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .disabled(act == nil)
                .accessibilityLabel(iconLabel ?? "More")
            }
        }
        .padding(.horizontal, DesignTokens.s3)
        .padding(.bottom, DesignTokens.s13)
    }
}

private struct TabBarInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    var ovTabBarInset: CGFloat {
        get { self[TabBarInsetKey.self] }
        set { self[TabBarInsetKey.self] = newValue }
    }
}

struct TabBarHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// `.phone > .screenhead + .stack` — the head and the 13 px stack under it,
/// with the phone's own 13 px of padding around the lot. This is what the
/// snapshot tests render; `Screen` wraps it in the scroll view.
struct ScreenBody<Content: View>: View {
    let title: String
    var icon: String?
    var iconLabel: String?
    var action: (() -> Void)?
    var bottomInset: CGFloat = 0
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScreenHead(title: title, icon: icon, iconLabel: iconLabel,
                       act: action)
            // `.stack { gap: 13 }`
            VStack(alignment: .leading, spacing: DesignTokens.s13) { content }
        }
        .padding(DesignTokens.s13)
        .padding(.bottom, bottomInset)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The screen: `ScreenBody` in a scroll view on the canvas.
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
            ScreenBody(title: title, icon: icon, iconLabel: iconLabel,
                       action: action, bottomInset: DesignTokens.s34 + tabBar) {
                content
            }
        }
        .refreshableIf(refresh)
        .scrollToBottomIfAsked()
        .background(Design.canvas.ignoresSafeArea())
    }
}

extension View {
    @ViewBuilder
    func scrollToBottomIfAsked() -> some View {
        if Fixtures.atBottom {
            defaultScrollAnchor(.bottom)
        } else {
            self
        }
    }

    @ViewBuilder
    func refreshableIf(_ action: (() async -> Void)?) -> some View {
        if let action {
            refreshable { await action() }
        } else {
            self
        }
    }
}

/// `.chips` — a wrapping row at 8 px.
struct Flow: Layout {
    var spacing: CGFloat = DesignTokens.s8

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
                subviews[i].place(at: CGPoint(x: x, y: y),
                                  proposal: ProposedViewSize(sizes[i]))
                x += sizes[i].width + spacing
            }
            y += rowHeight + spacing
        }
    }
}

// MARK: - the tab bar

/// `.tabbar` — five slots on `--surface-hi`, a 34 px radius, 8 px by 5 px of
/// padding. The + is not a tab: it opens Capture and the screen under it stays
/// where it was.
struct TabBar: View {
    @Binding var tab: Int
    let titles: [(title: String, icon: String)]
    let add: () -> Void
    @Environment(\.accessibilityReduceTransparency) private var flat

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            item(0)
            item(1)
            AddButton(act: add).frame(maxWidth: .infinity)
            item(2)
            item(3)
        }
        .padding(.horizontal, DesignTokens.s5)
        .padding(.vertical, DesignTokens.s8)
        // `.tabbar { background: var(--surface-hi) }` — no backdrop-filter on
        // this one, so no material either.
        .background(flat ? Design.surfaceFlat : Design.surfaceHi)
        .clipShape(RoundedRectangle(cornerRadius: DesignTokens.rHero,
                                    style: .continuous))
        // `box-shadow: 0 -1px 21px -13px rgba(23,22,20,.5)` — a 21 px blur
        // pulled back 13 px by the spread, so it is a soft lift and not a
        // drop shadow. SwiftUI has no spread: the blur carries it.
        .shadow(color: Color(red: 23 / 255, green: 22 / 255, blue: 20 / 255)
            .opacity(0.5), radius: (21 - 13) / 2, x: 0, y: -1)
    }

    private func item(_ index: Int) -> some View {
        let on = tab == index
        return Button { tab = index } label: {
            VStack(spacing: 2) {
                Image(systemName: titles[index].icon)
                    .font(.system(size: 20, weight: .light))
                    .frame(height: 24)
                Text(titles[index].title).ovType(.xs)
            }
            .foregroundStyle(on ? Design.ink : Design.ink3)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - words

extension Design {
    /// The words the engine writes that mean "nothing was ever measured".
    static func hollow(_ word: String) -> Bool {
        let w = word.lowercased()
        return w.isEmpty || w == "none" || w == "never measured"
            || w == "nothing for you"
    }

    static func isOff(_ word: String) -> Bool {
        let w = word.lowercased()
        return w == "off" || w == "bad" || w == "confirmed"
    }

    static func colour(forTone tone: String, fallback: Color) -> Color {
        switch tone {
        case "bad": return bad
        case "warn": return warn
        case "ok": return ok
        default: return fallback
        }
    }
}
