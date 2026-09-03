import Foundation

/// Where a number sits on a ruler. `components/ruler.tsx` `rangeScale`, ported.
///
/// TPO antibodies 320 against a 0–34 band would paint the mark hard against
/// the right edge with the whole band squashed into the first tenth of the
/// track: a picture that says "off the scale" and nothing else. So the scale
/// is linear over the band and twice its width either side, and everything
/// past that is compressed into a short tail. The web draws a break glyph in
/// the axis at that point; the phone's `Ruler` has no break, so the tail is
/// drawn without one and the scale's ends still print the real numbers.
///
/// Pure, so `MarkerScaleTests` states the whole contract.
struct MarkerScale {

    /// How much of the track a compressed tail is allowed to take, 0…1.
    private static let tail = 0.14
    /// How far past the band the scale stays linear, in band widths.
    private static let reach = 2.0
    /// The air the tail keeps at its far end, so the mark never hugs the edge.
    private static let tailPad = 0.12

    /// The lowest and highest number the track carries, for the printed ends.
    let lo: Double
    let hi: Double

    private let min: Double
    private let max: Double
    private let tailLow: Double
    private let tailHigh: Double
    private let hasTailLow: Bool
    private let hasTailHigh: Bool

    /// - Parameters:
    ///   - marks: every number the ruler draws — value, previous, target and
    ///     both band bounds.
    ///   - bandLow/bandHigh: the widest band it has, or nil when it has none.
    init(marks: [Double], bandLow: Double?, bandHigh: Double?) {
        let values = marks.filter { $0.isFinite }
        let lowest = values.min() ?? 0
        let highest = values.max() ?? 1
        let width = (bandLow != nil && bandHigh != nil && bandHigh! > bandLow!)
            ? bandHigh! - bandLow! : nil

        // A concentration has no negative half, so the padding never takes the
        // axis below zero: "−24 U/L" is not a number this app can print.
        func floorAt(_ v: Double) -> Double { lowest >= 0 ? Swift.max(0, v) : v }

        guard let width else {
            let pad = (highest - lowest) * 0.12
            let fallback = abs(highest) * 0.1
            let air = pad != 0 ? pad : (fallback != 0 ? fallback : 1)
            min = floorAt(lowest - air)
            max = highest + air
            lo = min
            hi = max
            tailLow = 0
            tailHigh = 0
            hasTailLow = false
            hasTailHigh = false
            return
        }

        let capHigh = bandHigh! + Self.reach * width
        let capLow = bandLow! - Self.reach * width
        hasTailHigh = highest > capHigh
        hasTailLow = lowest < capLow
        let innerLo = hasTailLow ? capLow : lowest
        let innerHi = hasTailHigh ? capHigh : highest
        let span = (innerHi - innerLo) * 0.12
        let pad = span != 0 ? span : 1
        min = floorAt(innerLo - (hasTailLow ? 0 : pad))
        max = innerHi + (hasTailHigh ? 0 : pad)
        tailLow = hasTailLow ? Self.tail : 0
        tailHigh = hasTailHigh ? Self.tail : 0
        lo = hasTailLow ? lowest : min
        hi = hasTailHigh ? highest : max
    }

    /// Where a number sits on the track, 0…1.
    func at(_ v: Double) -> Double {
        if hasTailLow, v < min {
            let out = min - lo != 0 ? min - lo : 1
            let into = tailLow * (1 - Self.tailPad) * (v - lo) / out
            return Swift.max(0, tailLow * Self.tailPad + into)
        }
        if hasTailHigh, v > max {
            let out = hi - max != 0 ? hi - max : 1
            let into = tailHigh * (1 - Self.tailPad) * (v - max) / out
            return Swift.min(1, 1 - tailHigh + into)
        }
        let middle = 1 - tailLow - tailHigh
        let span = max - min != 0 ? max - min : 1
        return Swift.min(1, Swift.max(0, tailLow + middle * (v - min) / span))
    }

    /// A band as a 0…1 stretch of the track, or nil when it has no width on it.
    func band(_ low: Double?, _ high: Double?) -> ClosedRange<Double>? {
        let a = at(low ?? lo)
        let b = at(high ?? hi)
        guard b > a else { return nil }
        return a...b
    }
}

/* ── nice axis ends ─────────────────────────────────────────────────────
 * `components/ruler.tsx` `niceEnd` and `decimalsOf`, ported.
 *
 * The padded end of a scale is arithmetic, not a reading: the owner read
 * "146.72 mg/dL" under a bar and took it for a second value. An axis end is
 * rounded outward to the nearest preferred number, and never to more decimals
 * than the marker's own readings carry.
 */
extension MarkerScale {

    /// Mantissas an axis end is allowed to land on, 1 ≤ n < 10.
    static let nice: [Double] = [1, 1.2, 1.5, 1.6, 2, 2.5, 3, 4, 5, 6, 8]

    /// Float noise: 3 × 0.1 is 0.30000000000000004 and 3.0000001 is not 3.1.
    private static let eps = 1e-9

    private static func clean(_ v: Double) -> Double {
        Double(String(format: "%.12g", v)) ?? v
    }

    /// The nearest preferred number outward from `v`: the smallest one at or
    /// above it going up, the largest one at or below it going down. Zero
    /// stays zero, and a negative end mirrors, so the floor of a scale that
    /// dips below zero is as round as its ceiling.
    static func niceEnd(_ v: Double, _ up: Bool, decimals: Int = 3) -> Double {
        guard v.isFinite, v != 0 else { return 0 }
        if v < 0 { return -niceEnd(-v, !up, decimals: decimals) }
        let base = pow(10, (log10(v)).rounded(.down))
        let m = v / base
        let mantissa = up
            ? (nice.first { $0 >= m - eps } ?? 10)
            : (nice.reversed().first { $0 <= m + eps } ?? 1)
        let end = mantissa * base
        let q = pow(10, Double(decimals))
        return clean(up ? (end * q).rounded(.up) / q
                     : (end * q).rounded(.down) / q)
    }

    /// How many decimals this marker's own numbers use, capped at three.
    static func decimalsOf(_ values: [Double?]) -> Int {
        let used = values.compactMap { $0 }.filter(\.isFinite).map { v -> Int in
            // Swift's shortest round-trip form, which is JavaScript's
            // `String(v)` except that a whole number keeps a ".0".
            let text = String(v)
            guard let dot = text.firstIndex(of: ".") else { return 0 }
            let fraction = text[text.index(after: dot)...]
            return fraction == "0" ? 0 : fraction.count
        }
        return Swift.min(3, used.max() ?? 0)
    }

    /// The two ends this scale prints, already rounded and quantised to the
    /// decimals the marker's own readings carry.
    func ends(_ marks: [Double?]) -> (low: String, high: String) {
        let places = Self.decimalsOf(marks)
        return (Design.digits(Self.niceEnd(lo, false, decimals: places)),
                Design.digits(Self.niceEnd(hi, true, decimals: places)))
    }
}

extension Design {

    /// `digits` on the web: 34 stays 34, 16.29 stays 16.29, 5.6000001 becomes
    /// 5.6. `Design.number` rounds to one decimal, which turns an axis end of
    /// 0.04 into "0.0"; an axis end is a number, not a rounded reading.
    static func digits(_ v: Double) -> String {
        if v == v.rounded() { return String(Int(v)) }
        let rounded = (v * 100).rounded() / 100
        return String(rounded)
    }


    /// "70–100 mg/dL", "under 100 IU/mL", "above 50 ng/mL", and the empty
    /// string when there is no target at all. `goalWords` on the web, with the
    /// unit attached because the phone prints it in one place.
    static func band(low: Double?, high: Double?, unit: String) -> String {
        let tail = unit.isEmpty ? "" : " \(unit)"
        if let low, let high { return "\(number(low))–\(number(high))\(tail)" }
        if let high { return "under \(number(high))\(tail)" }
        if let low { return "above \(number(low))\(tail)" }
        return ""
    }
}
