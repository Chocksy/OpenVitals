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

    static let filters = ["Moves something", "All"]

    var body: some View {
        Screen(title: "Research", refresh: { await load() }) {
            if loaded {
                Filters(names: Self.filters, chosen: $filter) { count($0) }
                if unread > 0 {
                    Panel(title: "Not read yet",
                          meta: Design.number(unread)) {
                        Caption("\(Design.plural(unread, "paper", "papers")) "
                                + "here have a title, a journal and a date and "
                                + "nothing else. The grade and the one-line "
                                + "finding come from the intake, which reads "
                                + "each abstract with the model; it has not "
                                + "run on these rows, so nothing here claims "
                                + "to move a number.")
                    }
                }
                papers
                conditions
                if !said.isEmpty { Caption(said) }
            } else if error.isEmpty {
                Panel { Text("Asking the server…").ovType(.sm)
                    .foregroundStyle(Design.ink3) }
            } else {
                Panel(title: "Nothing to show") {
                    Text(error).ovType(.sm).foregroundStyle(Design.ink2)
                }
            }
        }
        .task { await load() }
    }

    // MARK: - the parts

    private var shown: [Api.Paper] {
        filter == "All" ? rows : rows.filter { $0.moves != nil }
    }

    private var unread: Int { rows.filter { !$0.read }.count }

    private func count(_ name: String) -> Int {
        name == "All" ? rows.count : rows.filter { $0.moves != nil }.count
    }

    @ViewBuilder private var papers: some View {
        if shown.isEmpty {
            Panel {
                Text(rows.isEmpty
                     ? "The watch has not found a paper for you yet."
                     : "Nothing found so far moves a number of yours.")
                    .ovType(.sm).foregroundStyle(Design.ink2)
            }
        } else {
            Panel(title: nil, meta: "\(Design.number(shown.count)) of "
                  + "\(Design.number(rows.count))") {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, p in
                        Button { Task { await open(p) } } label: {
                            PaperRow(title: p.title, cite: p.cite,
                                     grade: p.grade, found: p.found,
                                     movesWord: p.movesWord,
                                     movesTone: p.movesTone,
                                     moves: p.movesLine,
                                     showsMoves: p.showsMoves,
                                     actions: false)
                                .padding(.vertical, DesignTokens.s13)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button("Open in Safari") {
                                Task { await open(p) }
                            }
                        }
                        .accessibilityHint("Opens the paper in Safari and "
                                           + "marks it seen")
                        if i < shown.count - 1 { Hair() }
                    }
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
            Panel(title: "Research now", meta: Design.number(ids.count)) {
                VStack(alignment: .leading, spacing: DesignTokens.s8) {
                    ForEach(ids, id: \.self) { id in
                        HStack(spacing: DesignTokens.s13) {
                            Text(Self.name(id)).ovType(.sm)
                                .foregroundStyle(Design.ink)
                            Spacer(minLength: 0)
                            Button(running == id ? "Reading…" : "Research now") {
                                Task { await run(id) }
                            }
                            .buttonStyle(.ov(.quiet, small: true))
                            .disabled(!running.isEmpty)
                        }
                    }
                }
                Caption("One run per condition per ninety days. Inside that "
                        + "window the server says when it last looked rather "
                        + "than pretending it ran.")
            }
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
        guard !Fixtures.on else { return }
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

/// Today's "New for you": at most three rows that moved something, and
/// nothing at all when none did. A feed that shows the same rows every day
/// whether or not they changed anything is a feed nobody reads.
struct NewForYou: View {
    let rows: [Api.Paper]
    var open: (Api.Paper) -> Void

    /// Only what moved a number, newest first, capped at three.
    static func pick(_ rows: [Api.Paper]) -> [Api.Paper] {
        Array(rows.filter { $0.moves != nil && $0.dismissedAt == nil }
            .sorted { $0.publishedAt > $1.publishedAt }
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
