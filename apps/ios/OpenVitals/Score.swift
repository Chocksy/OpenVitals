import Foundation

/// The day's score, as arithmetic. Phase 37 task B3.
///
/// A line-by-line port of `apps/simple/lib/score.ts` `scoreOf`. The server
/// decides the score: `/api/today` carries its input and its result. The phone
/// runs this copy only to preview a tick or a portion before the server
/// answers. Both sides pass `fixtures/score-vectors.json`, which is how the
/// two are kept the same function.

/// What the score is computed from. `var` so a preview can change one field
/// (a tick, a portion) and run `Score.of` again.
struct ScoreInput: Codable, Equatable {
    struct Moves: Codable, Equatable {
        var done: Int
        var due: Int
    }

    struct Targets: Codable, Equatable {
        var kcal: Double?
        var proteinG: Double?
    }

    struct Blood: Codable, Equatable {
        var green: Int
        var amber: Int
        var rose: Int
    }

    var sleepHours: Double?
    /// Null when nothing is due.
    var moves: Moves?
    /// Eaten today.
    var kcal: Double?
    var proteinG: Double?
    var targets: Targets
    /// Null: no draw.
    var blood: Blood?
    /// 0–100. Null: no genome.
    var genes: Double?
}

struct ScoreResult: Codable, Equatable {
    /// Each 0–100, null when its input or its target is missing.
    struct Rows: Codable, Equatable {
        var sleep: Int?
        var moves: Int?
        var kcal: Int?
        var protein: Int?
    }

    var score: Int?
    /// "Strong" | "On track" | "Watch" | "Act"
    var word: String?
    var life: Int?
    var blood: Int?
    var genes: Int?
    var rows: Rows
}

enum Score {

    static let weights = (life: 0.4, blood: 0.45, genes: 0.15)

    /// The AASM adult band, in hours.
    static let sleepBand = (lo: 7.0, hi: 9.0)

    /// How far under the kcal target still reads as on target.
    static let kcalBelow = 300.0

    /// JS `Math.round`: halves go up, on both sides of zero. Swift's
    /// `.rounded()` takes -2.5 to -3, and the two sides would disagree.
    static func round(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }

    /// `round` over a row that may be null, as `score.ts` does it.
    private static func rounded(_ x: Double?) -> Int? { x.map { round($0) } }

    private static func floor0(_ n: Double) -> Double { max(0, n) }

    static func sleepRow(_ hours: Double?) -> Double? {
        guard let hours else { return nil }
        let (lo, hi) = sleepBand
        let outside = hours < lo ? lo - hours : hours > hi ? hours - hi : 0
        return floor0(100 - 25 * outside)
    }

    static func movesRow(_ m: ScoreInput.Moves?) -> Double? {
        guard let m, m.due > 0 else { return nil }
        return Double(m.done) / Double(m.due) * 100
    }

    static func kcalRow(_ kcal: Double?, _ target: Double?) -> Double? {
        guard let kcal, let target else { return nil }
        let lo = target - kcalBelow
        let distance = kcal < lo ? lo - kcal : kcal > target ? kcal - target : 0
        return floor0(100 - distance / 10)
    }

    static func proteinRow(_ g: Double?, _ target: Double?) -> Double? {
        guard let g, let target, target > 0 else { return nil }
        return min(100, g / target * 100)
    }

    static func word(_ score: Int?) -> String? {
        guard let score else { return nil }
        if score >= 80 { return "Strong" }
        if score >= 65 { return "On track" }
        if score >= 50 { return "Watch" }
        return "Act"
    }

    static func of(_ input: ScoreInput) -> ScoreResult {
        let rows = ScoreResult.Rows(
            sleep: rounded(sleepRow(input.sleepHours)),
            moves: rounded(movesRow(input.moves)),
            kcal: rounded(kcalRow(input.kcal, input.targets.kcal)),
            protein: rounded(proteinRow(input.proteinG, input.targets.proteinG)))

        let present = [rows.sleep, rows.moves, rows.kcal, rows.protein]
            .compactMap { $0 }
        let life = present.isEmpty ? nil
            : round(Double(present.reduce(0, +)) / Double(present.count))

        var blood: Int?
        if let b = input.blood {
            let drawn = b.green + b.amber + b.rose
            if drawn > 0 {
                blood = round((Double(b.green) + 0.5 * Double(b.amber))
                              / Double(drawn) * 100)
            }
        }

        let genes = rounded(input.genes)

        // The order the server sums in, so the floats agree to the last bit.
        let layers = [(weights.life, life), (weights.blood, blood),
                      (weights.genes, genes)]
            .compactMap { w, v in v.map { (w, Double($0)) } }
        let weight = layers.reduce(0.0) { $0 + $1.0 }
        let score = layers.isEmpty ? nil
            : round(layers.reduce(0.0) { $0 + $1.0 * $1.1 } / weight)

        return ScoreResult(score: score, word: word(score), life: life,
                           blood: blood, genes: genes, rows: rows)
    }
}
