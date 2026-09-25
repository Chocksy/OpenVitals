import SwiftUI

/// Research, as `research.html`'s 390 frame draws it: the papers the watch
/// found for the conditions this person actually has, newest first.
///
/// Research is not a fifth destination. It is reached from Plan and from
/// Today's "New for you"; the tab bar keeps its four.
///
/// A row that nothing has graded says so — "found, not read yet" — because an
/// empty grade slot reads as "no evidence", and the two are not the same
/// thing.
struct ResearchView: View {
    @State private var rows: [Api.Paper] = []
    @State private var error = ""
    @State private var loaded = false
    @State private var filter = "All"
    @State private var running = ""
    @State private var said = ""
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    static let filters = ["Moves something", "All"]

    /// Built by `init()`: reads the server. The tests hand their rows in and
    /// never load.
    private let live: Bool

    init() { live = true }

    /// A screen with its rows already in hand: the tests.
    init(rows: [Api.Paper]) {
        _rows = State(initialValue: rows)
        _loaded = State(initialValue: true)
        live = false
    }

    /// Phase 38 D6: on `HyScreen` with the plum header, the paper count as
    /// its value and a close, since every way in is a sheet. D8: the body in
    /// the Hybrid look too: Blood's chips, one `hyCard` per paper.
    var body: some View {
        HyScreen(refresh: live ? { await load() } : nil) {
            HyHeader(title: "Research", value: loaded ? Design.number(rows.count) : nil,
                     word: loaded ? (rows.count == 1 ? "paper" : "papers") : nil,
                     line: loaded ? Self.line(rows) : nil) {
                close
            }
        } content: {
            parts
        }
        .environment(\.colorScheme, .light)
        .task { if live { await load() } }
    }

    /// The header's line, under the count it does not repeat: "2 moved
    /// something · 13 not read yet", either half alone, or "none found yet".
    static func line(_ rows: [Api.Paper]) -> String {
        if rows.isEmpty { return "none found yet" }
        let moved = ResearchRow.moved(rows)
        let unread = rows.filter { !$0.read }.count
        let parts = [moved > 0 ? "\(Design.number(moved)) moved something" : nil,
                     unread > 0 ? "\(Design.number(unread)) not read yet" : nil]
            .compactMap { $0 }
        return parts.isEmpty ? "all read" : parts.joined(separator: " · ")
    }

    /// The Hybrid close: 44, plum2, the cross in cream, as Body's sync.
    private var close: some View {
        Button { dismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Hy.cream)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Hy.plum2))
                .contentShape(Circle())
        }
        .buttonStyle(Pressed(scale: 0.92))
        .accessibilityLabel("Close")
    }

    @ViewBuilder private var parts: some View {
        if loaded {
            HyChips(names: Self.filters, chosen: $filter) { Self.count($0, rows) }
            if unread > 0 {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    CardLabel(text: "Not read yet · \(Design.number(unread))",
                              glyph: "hourglass")
                    Text("\(Design.plural(unread, "paper", "papers")) "
                         + "here have a title, a journal and a date and "
                         + "nothing else. The grade and the one-line "
                         + "finding come from the intake, which reads "
                         + "each abstract with the model; it has not "
                         + "run on these rows, so nothing here claims "
                         + "to move a number.")
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .hyCard()
                .padding(.bottom, DesignTokens.s21)
            }
            papers
            conditions
            if !said.isEmpty {
                Text(said).hType(13, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, DesignTokens.s21)
                    .padding(.top, DesignTokens.s13)
            }
        } else if error.isEmpty {
            Text("Asking the server…").hType(13, .regular, Hy.ink3).hyCard()
        } else {
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                CardLabel(text: "Nothing to show", glyph: "exclamationmark.triangle")
                Text(error).hType(13, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .hyCard()
        }
    }

    // MARK: - the parts

    /// The rows the chosen filter keeps.
    static func shown(_ filter: String, _ rows: [Api.Paper]) -> [Api.Paper] {
        filter == "All" ? rows : rows.filter { $0.moves != nil }
    }

    private var shown: [Api.Paper] { Self.shown(filter, rows) }

    private var unread: Int { rows.filter { !$0.read }.count }

    static func count(_ name: String, _ rows: [Api.Paper]) -> Int {
        shown(name, rows).count
    }

    @ViewBuilder private var papers: some View {
        ShelfTitle("Papers", "\(Design.number(shown.count)) of "
                   + "\(Design.number(rows.count)) · newest first")
        if shown.isEmpty {
            Text(rows.isEmpty
                 ? "The watch has not found a paper for you yet."
                 : "Nothing found so far moves a number of yours.")
                .hType(13, .regular, Hy.ink2)
                .hyCard()
        } else {
            LazyVStack(alignment: .leading, spacing: DesignTokens.s8) {
                ForEach(shown) { p in
                    Button { Task { await open(p) } } label: { PaperCard(paper: p) }
                        .buttonStyle(Pressed(scale: 0.98))
                        .contextMenu {
                            Button("Open in Safari") {
                                Task { await open(p) }
                            }
                        }
                        .accessibilityHint("Opens the paper in Safari and "
                                           + "marks it seen")
                }
            }
        }
    }

    /// Research now, one condition at a time. The list is the conditions the
    /// rows already name, which are this person's own: `POST /api/research`
    /// refuses any other, and the phone never offers one it would refuse.
    @ViewBuilder private var conditions: some View {
        let ids = Array(NSOrderedSet(array: rows.map(\.conditionId))
            .array as? [String] ?? [])
        if !ids.isEmpty {
            ShelfTitle("Research now", Design.plural(ids.count, "condition", "conditions"))
                .padding(.top, DesignTokens.s21)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(ids.enumerated()), id: \.element) { i, id in
                    if i > 0 { Hy.line.frame(height: 1) }
                    HStack(spacing: DesignTokens.s13) {
                        Text(Self.name(id)).hType(15, .medium, Hy.ink)
                        Spacer(minLength: 0)
                        HyAction(title: running == id ? "Reading…" : "Research now",
                                 kind: .secondary, wide: false) {
                            Task { await run(id) }
                        }
                        .disabled(!running.isEmpty)
                    }
                    .padding(.vertical, DesignTokens.s8)
                }
                Text("One run per condition per ninety days. Inside that "
                     + "window the server says when it last looked rather "
                     + "than pretending it ran.")
                    .hType(11, .regular, Hy.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, DesignTokens.s8)
            }
            .hyCard()
        }
    }

    /// "ascvd_risk" → "Ascvd risk". The id is what the ledger calls it; the
    /// phone does not invent a prettier name for it.
    static func name(_ id: String) -> String {
        let words = id.replacingOccurrences(of: "_", with: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    // MARK: - doing it

    private func load() async {
        if !loaded, let last = Api.cachedResearch() {
            rows = last.rows
            loaded = true
        }
        do {
            rows = try await Api.research().rows
            loaded = true
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Open in Safari, and mark it seen. Opening it is what "seen" means, so
    /// the write goes with the open and not before it.
    private func open(_ paper: Api.Paper) async {
        if let url = paper.url.flatMap(URL.init(string:)) { openURL(url) }
        guard !Fixtures.on, live else { return }
        if let seen = try? await Api.seePaper(id: paper.id),
           let at = rows.firstIndex(where: { $0.id == seen.id }) {
            rows[at] = seen
        }
    }

    private func run(_ id: String) async {
        running = id
        defer { running = "" }
        do {
            let result = try await Api.researchNow(conditionId: id)
            said = result.ok == true
                ? "Looked at \(Self.name(id)) since "
                    + "\(Design.day(result.since)). "
                    + "\(Design.number(result.found ?? 0)) found, "
                    + "\(Design.number(result.stored ?? 0)) kept, "
                    + "\(Design.number(result.moved ?? 0)) moved something."
                : "Already looked at \(Self.name(id))"
                    + (result.lastRun.map { " on \(Design.day($0))" } ?? "")
                    + ". One run per condition per ninety days."
            await load()
        } catch {
            said = error.localizedDescription
        }
    }
}

// MARK: - the Hybrid parts

/// Blood's filter chips (phase 38 D2), for any screen with a handful of
/// filters: a capsule each with its count, scrolling sideways; the chosen
/// one is plum with cream words.
struct HyChips: View {
    let names: [String]
    @Binding var chosen: String
    var count: (String) -> Int

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: DesignTokens.s8) {
                ForEach(names, id: \.self) { name in
                    let on = chosen == name
                    Button { chosen = name } label: {
                        HStack(spacing: DesignTokens.s5) {
                            Text(name).font(.grotesk(13, .semibold))
                            Text(Design.number(count(name)))
                                .font(.grotesk(11, .medium))
                                .opacity(0.7)
                        }
                        .foregroundStyle(on ? Hy.cream : Hy.ink)
                        .padding(.horizontal, DesignTokens.s13)
                        .frame(height: 34)
                        .background(Capsule().fill(on ? Hy.plum : Hy.card))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .motion(Curve.ease.animation(0.2), value: on)
                    .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
        .contentMargins(.horizontal, DesignTokens.s21, for: .scrollContent)
        .scrollIndicators(.hidden)
        .padding(.bottom, DesignTokens.s13)
    }
}

/// One paper as a card: the title, the journal and the date with the grade,
/// what it found, and the word for what it moves in that word's colour. The
/// whole card is the tap.
struct PaperCard: View {
    let paper: Api.Paper

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            Text(paper.title).hType(15, .semibold, Hy.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: DesignTokens.s8) {
                Text(paper.cite.joined(separator: " · "))
                    .hType(11, .regular, Hy.ink3)
                    .lineLimit(1)
                if let grade = paper.grade {
                    Text(grade).hType(11, .semibold, Hy.ink2)
                        .padding(.horizontal, DesignTokens.s5)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(Hy.paper2))
                }
            }
            if paper.read {
                Text(paper.found).hType(13, .regular, Hy.ink2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                // Nothing has read it: the finding slot is its state word.
                Text(paper.found)
                    .hType(11, .semibold, Hy.ink3)
                    .padding(.vertical, 2)
                    .padding(.horizontal, DesignTokens.s8)
                    .background(Capsule().fill(Hy.paper2))
                    .padding(.top, 2)
            }
            if paper.showsMoves {
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                    Text("moves").hType(11, .medium, Hy.ink3)
                    Text(paper.movesWord)
                        .hType(13, .semibold, Self.ink(paper.movesTone))
                        .padding(.vertical, 2)
                        .padding(.horizontal, DesignTokens.s8)
                        .background(Capsule().fill(Self.soft(paper.movesTone)))
                    if !paper.movesLine.isEmpty {
                        Text(paper.movesLine).hType(11, .medium, Hy.ink2)
                    }
                }
                .padding(.top, 2)
            }
        }
        .hyCard()
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// `movesTone` in the Hybrid colours: up is rose, down is green, nothing
    /// named is ink3.
    static func ink(_ tone: String) -> Color { colours(tone).ink }
    static func soft(_ tone: String) -> Color { colours(tone).soft }

    static func colours(_ tone: String) -> (ink: Color, soft: Color) {
        switch tone {
        case "ok": return (Hy.green, Hy.greenSoft)
        case "warn": return (Hy.amber, Hy.amberSoft)
        case "bad": return (Hy.rose, Hy.roseSoft)
        default: return (Hy.ink3, Hy.paper2)
        }
    }
}

/// Today's "New for you": at most three rows that moved something, and
/// nothing at all when none did. A feed that shows the same rows every day
/// whether or not they changed anything is a feed nobody reads.
/// The permanent research row on Today.
///
/// "New for you" only ever appears when a paper moved a number, which is why
/// the watch looked switched off on a quiet week. This row is always drawn: it
/// says what moved when something did, and how many papers are waiting when
/// nothing has.
struct ResearchRow: View {
    let rows: [Api.Paper]
    var open: () -> Void

    /// Papers that move a number of yours and have not been dismissed — the
    /// same set `NewForYou` draws.
    static func moved(_ rows: [Api.Paper]) -> Int {
        rows.filter { $0.moves != nil && $0.dismissedAt == nil }.count
    }

    static func line(_ rows: [Api.Paper]) -> String {
        let moved = moved(rows)
        if moved > 0 {
            return "New for you · \(Design.number(moved)) moved something"
        }
        if rows.isEmpty { return "no papers yet" }
        let unread = rows.filter { !$0.read }.count
        // Everything read and nothing moving is not "not read yet", so the row
        // stops at the count rather than saying something untrue.
        return unread > 0
            ? "\(Design.plural(unread, "paper", "papers")) found · not read yet"
            : "\(Design.plural(rows.count, "paper", "papers")) found"
    }

    var body: some View {
        Button(action: open) {
            Panel(title: "Research", meta: Design.number(rows.count)) {
                HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                    Text(Self.line(rows))
                        .ovType(.sm)
                        .foregroundStyle(Design.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .light))
                        .foregroundStyle(Design.ink3)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint("Opens Research")
    }
}

struct NewForYou: View {
    let rows: [Api.Paper]
    var open: (Api.Paper) -> Void

    /// Only what moved a number, newest first, capped at three.
    static func pick(_ rows: [Api.Paper]) -> [Api.Paper] {
        Array(rows.filter { $0.moves != nil && $0.dismissedAt == nil }
            .sorted { ($0.publishedAt ?? "") > ($1.publishedAt ?? "") }
            .prefix(3))
    }

    var body: some View {
        Panel(title: "New for you", meta: Design.number(rows.count)) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, p in
                    Button { open(p) } label: {
                        VStack(alignment: .leading, spacing: DesignTokens.s5) {
                            Text(p.title).ovType(.sm, leading: 1.45)
                                .foregroundStyle(Design.ink)
                                .fixedSize(horizontal: false, vertical: true)
                                .multilineTextAlignment(.leading)
                            HStack(spacing: DesignTokens.s8) {
                                Text(p.cite.joined(separator: " · "))
                                    .ovType(.xs, mono: true)
                                    .foregroundStyle(Design.ink3)
                                if let grade = p.grade { Glyph(mark: grade) }
                            }
                            HStack(alignment: .firstTextBaseline,
                                   spacing: DesignTokens.s8) {
                                Text("moves →").ovType(.sm, mono: true)
                                    .foregroundStyle(Design.ink3)
                                StateWord(word: p.movesWord,
                                          tone: p.movesTone)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, DesignTokens.s13)
                    }
                    .buttonStyle(.plain)
                    if i < rows.count - 1 { Hair() }
                }
            }
        }
    }
}

#if DEBUG
#Preview("Research") {
    ResearchView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
