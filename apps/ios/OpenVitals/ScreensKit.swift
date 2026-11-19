import Foundation

/// Batch 6: the small pure helpers Plan, Blood, Body and Focus share. Kept in
/// one place so a test can read every rule without drawing a screen.
enum ScreensKit {

    // MARK: titles

    /// The server's `shortTitle` (`apps/simple/lib/changes.ts`): the words
    /// before the first dose, " — ", comma, bracket or "with/before/after…".
    private static let cut = try? NSRegularExpression(
        pattern: #"\s(\d|with\b|before\b|after\b|at\b|every\b|daily\b)|\s[—–-]\s|[,(:;·]"#)

    /// "Psyllium husk 5 g with lunch — 10 g/day" → ("Psyllium husk",
    /// "5 g with lunch — 10 g/day"). `rest` is nil when nothing was cut.
    static func split(_ title: String) -> (short: String, rest: String?) {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = NSRange(text.startIndex..., in: text)
        // "Omega 3 supplement": a small number right after one word, with no
        // unit after it, is part of the name, so the cut moves past it.
        let match = cut?.matches(in: text, range: range).first { m in
            guard m.range.location > 0, let at = Range(m.range, in: text) else { return false }
            return !partOfName(text, at: at)
        }
        guard let match, let at = Range(match.range, in: text) else { return (text, nil) }
        let short = String(text[..<at.lowerBound]).trimmingCharacters(in: .whitespaces)
        let rest = String(text[at.lowerBound...])
            .trimmingCharacters(in: CharacterSet(charactersIn: " ,:;·—–-"))
        guard !short.isEmpty else { return (text, nil) }
        return (short, rest.isEmpty ? nil : rest)
    }

    static func short(_ title: String) -> String { split(title).short }

    private static let units: Set<String> = [
        "g", "mg", "mcg", "µg", "iu", "ml", "l", "kg", "min", "mins", "minute", "minutes",
        "h", "hr", "hrs", "hour", "hours", "x", "times", "steps", "km", "cups", "cup",
        "tbsp", "tsp", "caps", "capsules", "tablets", "%",
    ]

    private static func partOfName(_ text: String, at: Range<String.Index>) -> Bool {
        let matched = text[at]
        guard matched.first?.isWhitespace == true,
              matched.dropFirst().first?.isNumber == true else { return false }
        let head = text[..<at.lowerBound]
        guard !head.contains(" ") else { return false }
        let tail = text[at.lowerBound...].dropFirst()
        let words = tail.split(separator: " ", maxSplits: 2)
        guard let number = words.first, number.count <= 2,
              number.allSatisfy(\.isNumber) else { return false }
        guard words.count > 1 else { return true }
        return !units.contains(words[1].lowercased())
    }

    /// Plan's adherence line. "not logged" when the server has no share or
    /// it is under 20 %: a share that low says the ticks are missing, not
    /// that the item was skipped.
    static func adherence(_ a: Double?) -> String {
        guard let a, a >= 0.2 else { return "not logged" }
        return "\(Int((a * 100).rounded()))% of the last 30 days"
    }

    // MARK: days

    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Whole days from `from` to `to`, both `YYYY-MM-DD`; nil when either
    /// does not parse.
    static func days(from: String?, to: String?) -> Int? {
        guard let from, let to,
              let a = ymd.date(from: String(from.prefix(10))),
              let b = ymd.date(from: String(to.prefix(10))) else { return nil }
        return Int((b.timeIntervalSince(a) / 86_400).rounded())
    }

    // MARK: Health sources

    /// Writers people know by another name than their bundle id.
    private static let known: [(prefix: String, name: String)] = [
        ("com.apple.health", "Apple Health"),
        ("com.apple", "Apple Health"),
        ("com.viraldevelopment", "Calorie app"),
        ("cn.noerdenfit", "Noerdenfit"),
    ]

    private static let generic: Set<String> = [
        "com", "cn", "io", "net", "org", "co", "app", "apps", "ios", "iphone",
        "life", "health", "mobile", "prod", "release", "watchkitapp",
    ]

    /// "com.viraldevelopment.CalorieCounter" → "Calorie app"; an unknown id
    /// gives its last readable part, capitalised; a plain name stays.
    static func sourceName(_ raw: String) -> String {
        let text = raw.trimmingCharacters(in: .whitespaces)
        guard text.contains("."), !text.contains(" ") else { return text }
        let lower = text.lowercased()
        if let hit = known.first(where: { lower.hasPrefix($0.prefix) }) { return hit.name }
        let parts = text.split(separator: ".").map(String.init)
        guard let part = parts.reversed().first(where: {
            !generic.contains($0.lowercased()) && $0.rangeOfCharacter(from: .letters) != nil
        }) else { return "Another app" }
        return part.prefix(1).uppercased() + part.dropFirst()
    }

    // MARK: Focus slots

    /// 0 morning (before 11:00), 1 midday (11:00 to 16:00), 2 evening.
    static func slot(hour: Int) -> Int { hour < 11 ? 0 : hour < 16 ? 1 : 2 }

    static func slotNow(_ date: Date = Date(), calendar: Calendar = .current) -> Int {
        slot(hour: calendar.component(.hour, from: date))
    }

    /// The slot a row runs in: its hour first, then its slot word. Nil for a
    /// row with neither, which runs any time.
    static func slot(of row: Api.PlanDay.Row) -> Int? {
        if let time = row.time, let hour = Int(time.prefix(2)) { return slot(hour: hour) }
        switch row.slot?.lowercased() {
        case "morning", "breakfast", "wake", "waking": return 0
        case "midday", "lunch", "noon", "afternoon": return 1
        case "dinner", "evening", "bedtime", "night": return 2
        default: return nil
        }
    }

    /// What Focus deals now: this slot, anything left from earlier ones, and
    /// the rows with no time.
    static func dealt(_ rows: [Api.PlanDay.Row], now: Int) -> [Api.PlanDay.Row] {
        rows.filter { (slot(of: $0) ?? now) <= now }
    }

    /// The goal a plan row moves, by its title or its short title.
    static func goal(for row: Api.PlanDay.Row, in goals: [Api.Today.Goal]) -> Api.Today.Goal? {
        let short = self.short(row.title).lowercased()
        return goals.first { goal in
            goal.moves.contains {
                $0.title == row.title || self.short($0.title).lowercased() == short
            }
        }
    }
}
