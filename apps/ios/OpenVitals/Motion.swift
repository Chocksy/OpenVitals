import SwiftUI
import UIKit

/// The Hybrid's named curves. Every CSS `cubic-bezier(a,b,c,d)` in
/// 48-hybrid.html ports verbatim as `timingCurve(a,b,c,d)`; no spring
/// parameters are guessed. See docs/plans/2026-09-24-phase37-hybrid-motion-reference.md.
enum Curve: CaseIterable {
    /// `(0.2, 0.8, 0.2, 1)`: the prototype's own `--ease`, not the v4 one.
    case ease
    /// `--ease-spring`: 560 ms cards, 700 ms shelf settle, 900 ms bars and
    /// counts, 420 ms small pops.
    case spring
    /// `--ease-ispring`: the island only, 620 ms.
    case ispring
    /// `--ease-fly`: the ticked card on its way to the header, 560 ms.
    case fly
    /// `(0.2, 0.6, 0.4, 1)`: the confetti fall, 1.8 s.
    case confetti

    var bezier: DesignTokens.Bezier {
        switch self {
        case .ease: return DesignTokens.Bezier(x1: 0.2, y1: 0.8, x2: 0.2, y2: 1)
        case .spring: return DesignTokens.easeSpringCurve
        case .ispring: return DesignTokens.easeIspringCurve
        case .fly: return DesignTokens.easeFlyCurve
        case .confetti: return DesignTokens.Bezier(x1: 0.2, y1: 0.6, x2: 0.4, y2: 1)
        }
    }

    func animation(_ duration: TimeInterval) -> Animation {
        let b = bezier
        return .timingCurve(b.x1, b.y1, b.x2, b.y2, duration: duration)
    }
}

enum Motion {

    /// Under Reduce Motion every curve becomes this crossfade.
    static let reduced = Animation.easeInOut(duration: 0.2)

    /// `animation`, or the 200 ms crossfade when Reduce Motion is on.
    static func animation(_ animation: Animation, reduce: Bool) -> Animation {
        reduce ? reduced : animation
    }

    /// `withAnimation`, with the Reduce Motion swap.
    @discardableResult
    static func animate<Result>(_ animation: Animation, reduce: Bool,
                                _ body: () throws -> Result) rethrows -> Result {
        try withAnimation(Self.animation(animation, reduce: reduce), body)
    }
}

private struct MotionAnimation<V: Equatable>: ViewModifier {
    let animation: Animation
    let value: V
    @Environment(\.accessibilityReduceMotion) private var reduce

    func body(content: Content) -> some View {
        content.animation(Motion.animation(animation, reduce: reduce),
                          value: value)
    }
}

extension View {
    /// `.animation(_:value:)` that honours Reduce Motion.
    func motion<V: Equatable>(_ animation: Animation, value: V) -> some View {
        modifier(MotionAnimation(animation: animation, value: value))
    }
}

/// The prototype's `mulberry32`, bit for bit. JS works in Int32 with
/// `Math.imul` and `>>>`; the same bits fall out of UInt32 wrapping
/// arithmetic and logical shifts.
struct Mulberry32 {
    private var a: UInt32

    init(_ seed: UInt32) { a = seed }

    mutating func next() -> Double {
        a = a &+ 0x6d2b79f5
        var t = (a ^ (a >> 15)) &* (1 | a)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }
}

/// The paper grain: one 128 tile, seeded, drawn once. Cream surfaces only;
/// never the header, the plum or the video.
enum Grain {

    static let side = 128

    /// RGBA, not premultiplied, as the canvas `ImageData` holds it: two draws
    /// per pixel, the grey `120 + r × 135` and then alpha 34 when `r < .55`.
    static func pixels(seed: UInt32 = 7) -> [UInt8] {
        var r = Mulberry32(seed)
        var out = [UInt8](repeating: 0, count: side * side * 4)
        for i in stride(from: 0, to: out.count, by: 4) {
            // Uint8ClampedArray rounds to nearest, ties to even
            let v = UInt8((120 + r.next() * 135).rounded(.toNearestOrEven))
            out[i] = v
            out[i + 1] = v
            out[i + 2] = v
            out[i + 3] = r.next() < 0.55 ? 34 : 0
        }
        return out
    }

    static func image(seed: UInt32 = 7) -> CGImage {
        let data = Data(pixels(seed: seed)) as CFData
        return CGImage(
            width: side, height: side,
            bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: side * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
            provider: CGDataProvider(data: data)!,
            decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
    }

    /// Tile it with `Image(decorative:scale:).resizable(resizingMode: .tile)`.
    static let tile: CGImage = image()
}

/// The day square's colour: hue 30 → 140 with the score, lightness 90 at 55
/// falling 2.4 a point to a floor of 34, saturation 68 %.
enum DayColour {

    static func hue(_ score: Int) -> Double { 30 + Double(score) / 100 * 110 }

    static func light(_ score: Int) -> Double {
        max(34, min(90, 90 - Double(score - 55) * 2.4))
    }

    /// 0…255 per channel, unrounded. Hue and lightness are cut to one
    /// decimal first, as the prototype's `toFixed(1)` does.
    static func rgb(_ score: Int) -> (r: Double, g: Double, b: Double) {
        let h = (hue(score) * 10).rounded() / 10
        let l = (light(score) * 10).rounded() / 10 / 100
        let s = 0.68
        // CSS Color 4, hslToRgb
        let a = s * min(l, 1 - l)
        func f(_ n: Double) -> Double {
            let k = (n + h / 30).truncatingRemainder(dividingBy: 12)
            return l - a * max(-1, min(k - 3, 9 - k, 1))
        }
        return (f(0) * 255, f(8) * 255, f(4) * 255)
    }

    static func of(_ score: Int) -> Color {
        let c = rgb(score)
        return Color(.sRGB, red: c.r / 255, green: c.g / 255, blue: c.b / 255)
    }
}
