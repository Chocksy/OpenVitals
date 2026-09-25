import Observation
import SwiftUI

// Phase 38 part D4 (`docs/plans/2026-09-24-phase38-hybrid-tabs-spec.md`):
// Plan in the Hybrid look, and Adopt wired. The plum header counts the
// adopted rows done today; the shelves are the day in the order it runs, the
// report's own suggestions with an Adopt each, and the way into Research.

extension Notification.Name {
    /// An adopt, a stored tick or an undo on Plan: Today reads the plan again.
    static let ovPlanChanged = Notification.Name("ovPlanChanged")
}

/// The pill under the shelves after an adopt. Four things it can say, and
/// only a fresh adopt carries an undo: an action that was already on the
/// protocol is somebody's older item, and undoing it would delete that.
struct PlanPill: Equatable {
    enum Kind: Equatable {
        case added(adoptId: String, removeIds: [String])
        case already
        case failed
    }

    /// Counts every pill shown, so the same words twice still restart the 4 s.
    let n: Int
    let kind: Kind

    var text: String {
        switch kind {
        case .added: return "Added"
        case .already: return "Already on your plan"
        case .failed: return "That did not save"
        }
    }

    var canUndo: Bool {
        if case let .added(_, removeIds) = kind { return !removeIds.isEmpty }
        return false
    }
}

// MARK: - the model

/// Everything Plan draws and every write it makes. The view reads it; the
/// tests swap the five seams and never reach a server.
@Observable
@MainActor
final class PlanModel {
    var plan: Api.PlanDay?
    var papers: [Api.Paper] = []
    var error = ""
    var pill: PlanPill?

    /// Row ids with a tick on its way to the server.
    private(set) var saving: Set<String> = []
    /// Adopt ids with a POST in flight. A second tap on the same card while
    /// the first runs finds its id here and does nothing (Review focus 4).
    private(set) var adopting: Set<String> = []
    /// Suggestions adopted this session. The card leaves at once, before the
    /// reload drops the row, and a fixture run (which reloads the canned day)
    /// keeps it gone.
    private(set) var gone: Set<String> = []
    private(set) var undoing = false
    /// Counts the ticks the server stored. The view buzzes `.success` on it.
    private(set) var stored = 0

    @ObservationIgnored
    var fetch: () async throws -> Api.PlanDay = { try await Api.planToday() }
    @ObservationIgnored
    var fetchPapers: () async -> [Api.Paper] = { (try? await Api.research())?.rows ?? [] }
    /// `POST /api/habits`.
    @ObservationIgnored
    var send: (_ itemId: String, _ day: String, _ done: Bool) async throws -> Void = {
        _ = try await Api.tick(itemId: $0, day: $1, done: $2)
    }
    /// `POST /api/plan/adopt` with `{ id }`.
    @ObservationIgnored
    var sendAdopt: (_ id: String) async throws -> Api.Adopted = { try await Api.adopt(id: $0) }
    /// `POST /api/plan/adopt` with `{ removeIds }`.
    @ObservationIgnored
    var sendUndo: (_ removeIds: [String]) async throws -> Void = {
        _ = try await Api.unadopt(removeIds: $0)
    }
    /// Tells Today the plan moved.
    @ObservationIgnored
    var changed: () -> Void = {
        NotificationCenter.default.post(name: .ovPlanChanged, object: nil)
    }

    @ObservationIgnored private var shown = 0

    // MARK: what the screen reads

    /// The rows on the protocol: the ones with an item to tick.
    var adopted: [(id: String, row: Api.PlanDay.Row)] {
        plan?.identified.filter { $0.row.itemId != nil } ?? []
    }

    /// The report's own actions not adopted yet, minus the ones just adopted.
    var suggested: [Api.PlanDay.Row] {
        plan?.rows.filter {
            $0.tag == "suggested" && $0.adoptId.map { !gone.contains($0) } == true
        } ?? []
    }

    var doneCount: Int { adopted.filter(\.row.done).count }

    /// "1/5"; nil (the header's "—") with nothing adopted.
    var value: String? {
        adopted.isEmpty ? nil : "\(doneCount)/\(adopted.count)"
    }

    /// 0…1 for the lime bar.
    var progress: Double {
        adopted.isEmpty ? 0 : Double(doneCount) / Double(adopted.count)
    }

    /// "Monday Aug 31 · 1 suggested".
    var line: String? {
        plan.map { "\(Design.longDay($0.day)) · \(Design.number(suggested.count)) suggested" }
    }

    // MARK: reads

    func load() async {
        do {
            plan = try await fetch()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        papers = await fetchPapers()
    }

    /// The plan again after a write. A failed read leaves the screen as it was.
    private func reload() async {
        if let fresh = try? await fetch() { plan = fresh }
    }

    // MARK: writes

    /// Optimistic: the box fills, the write goes, and a failure puts it back
    /// and says so rather than leaving a tick that was never stored.
    func tick(_ rowId: String, _ row: Api.PlanDay.Row) async {
        guard let plan, let itemId = row.itemId, !saving.contains(rowId) else { return }
        let wanted = !row.done
        saving.insert(rowId)
        defer { saving.remove(rowId) }
        self.plan = plan.with(rowId, done: wanted)
        do {
            try await send(itemId, plan.day, wanted)
            error = ""
            if wanted { stored += 1 }
            changed()
        } catch {
            self.plan = self.plan?.with(rowId, done: !wanted)
            self.error = "That tick did not save: \(error.localizedDescription)"
        }
    }

    /// One suggestion onto the protocol. The card leaves, the plan reloads
    /// with the new row in the day, and the pill offers the undo. A failure
    /// keeps the card where it was and says so.
    func adopt(_ row: Api.PlanDay.Row) async {
        guard let id = row.adoptId, !adopting.contains(id), !gone.contains(id) else { return }
        adopting.insert(id)
        do {
            let made = try await sendAdopt(id)
            adopting.remove(id)
            gone.insert(id)
            show(made.already == true
                 ? .already
                 : .added(adoptId: id, removeIds: made.id.map { [$0] } ?? []))
            changed()
            await reload()
        } catch {
            adopting.remove(id)
            show(.failed)
        }
    }

    /// The pill's Undo: the item the adopt made comes off the protocol and
    /// the card comes back.
    func undo() async {
        guard !undoing, case let .added(id, removeIds)? = pill?.kind,
              !removeIds.isEmpty else { return }
        undoing = true
        defer { undoing = false }
        do {
            try await sendUndo(removeIds)
            gone.remove(id)
            pill = nil
            changed()
            await reload()
        } catch {
            show(.failed)
        }
    }

    private func show(_ kind: PlanPill.Kind) {
        shown += 1
        pill = PlanPill(n: shown, kind: kind)
    }
}

// MARK: - the screen

/// Plan. The day in the order it runs with a tick per row, the report's
/// suggestions with an Adopt each, and Research one tap away. Month is a
/// later slice.
struct PlanView: View {
    @State private var model: PlanModel
    @State private var research = Fixtures.screen == "research"

    @Environment(\.ovTabBarInset) private var tabBar
    @Environment(\.accessibilityReduceMotion) private var reduce

    init() { _model = State(initialValue: PlanModel()) }

    /// A screen over a model already in hand: the tests.
    init(model: PlanModel) { _model = State(initialValue: model) }

    var body: some View {
        HyScreen(refresh: { await model.load() }) {
            HyHeader(title: "Plan", value: model.value, word: "done today",
                     line: model.line)
                .overlay(alignment: .bottom) {
                    if model.plan != nil { bar }
                }
        } content: {
            if let plan = model.plan {
                shelves(plan)
            } else if model.error.isEmpty {
                Text("Asking the server…").hType(13, .regular, Hy.ink3).hyCard()
            } else {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    CardLabel(text: "Nothing to show", glyph: "exclamationmark.triangle")
                    Text(model.error).hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .hyCard()
            }
        }
        .overlay(alignment: .bottom) {
            ZStack {
                if let pill = model.pill {
                    PillView(pill: pill, undoing: model.undoing) {
                        Task { await model.undo() }
                    }
                    .id(pill.n)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.bottom, max(110, tabBar + DesignTokens.s21) - DesignTokens.s21)
            .motion(Curve.spring.animation(0.42), value: model.pill)
        }
        .task(id: model.pill?.n) {
            guard model.pill != nil else { return }
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { model.pill = nil }
        }
        .sensoryFeedback(.success, trigger: model.stored)
        .task { await model.load() }
        .sheet(isPresented: $research) { ResearchView() }
    }

    /// Under the header's line: 5 tall, lime over mist, done / adopted.
    private var bar: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Hy.mist.opacity(0.25))
                Capsule().fill(Hy.lime)
                    .frame(width: g.size.width * model.progress)
            }
        }
        .frame(height: 5)
        .motion(Curve.spring.animation(0.7), value: model.progress)
        .padding(.horizontal, DesignTokens.s21)
        .padding(.bottom, DesignTokens.s8)
        .accessibilityHidden(true)
    }

    // MARK: the shelves

    @ViewBuilder
    private func shelves(_ plan: Api.PlanDay) -> some View {
        ShelfTitle("Today", "in the order it runs")
        today
        if !model.suggested.isEmpty {
            ShelfTitle("Suggested", "from your last report")
                .padding(.top, DesignTokens.s21)
            HShelf {
                ForEach(Array(model.suggested.enumerated()), id: \.element.id) { i, row in
                    SuggestionCard(row: row,
                                   busy: row.adoptId.map { model.adopting.contains($0) } == true) {
                        Task { await model.adopt(row) }
                    }
                    .leans(i)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
            .motion(Curve.ease.animation(0.32), value: model.suggested.map(\.id))
        }
        ShelfTitle("Research", "papers on what you have")
            .padding(.top, model.suggested.isEmpty ? DesignTokens.s21 : 0)
        researchCard
        if !model.error.isEmpty {
            Text(model.error).hType(11, .regular, Hy.rose)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, DesignTokens.s21)
                .padding(.top, DesignTokens.s13)
        }
    }

    /// One card, a row per adopted item, a hairline between them.
    @ViewBuilder private var today: some View {
        let rows = model.adopted
        VStack(alignment: .leading, spacing: 0) {
            if rows.isEmpty {
                CardLabel(text: "Nothing adopted yet", glyph: "checklist")
                Text(model.suggested.isEmpty
                     ? "The plan comes from your report. Upload a lab report on "
                       + "the web and its actions show here to adopt."
                     : "Adopt a suggestion below and it shows here, in the order "
                       + "the day runs.")
                    .hType(13, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, DesignTokens.s5)
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, pair in
                TodayPlanRow(row: pair.row, busy: model.saving.contains(pair.id)) {
                    Task { await model.tick(pair.id, pair.row) }
                }
                if i < rows.count - 1 {
                    Rectangle().fill(Hy.line).frame(height: 1)
                }
            }
        }
        .hyCard()
    }

    /// Research is reached from here, not from the tab bar: it is four
    /// destinations plus the +, and a feed is not one of them.
    private var researchCard: some View {
        let unread = model.papers.filter { !$0.read }.count
        return VStack(alignment: .leading, spacing: DesignTokens.s8) {
            CardLabel(text: model.papers.isEmpty
                      ? "Nothing found yet"
                      : "\(Design.plural(model.papers.count, "paper", "papers")) · "
                        + "\(Design.number(unread)) not read",
                      glyph: "books.vertical")
            Text(model.papers.first(where: { $0.moves != nil }).map {
                "The newest one that moves something: \($0.title)"
            } ?? "Nothing found so far moves a number of yours.")
                .hType(13, .regular, Hy.ink2)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            Button { research = true } label: {
                Text("Open research").hType(15, .semibold, Hy.cream)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(Capsule().fill(Hy.plum))
                    .contentShape(Capsule())
            }
            .buttonStyle(Pressed(scale: 0.96))
        }
        .hyCard()
    }
}

// MARK: - the pieces

/// One adopted row: the hour or slot, the thing, why, its tag and how often
/// it got done, and the tick on the right with a 44 hit area.
private struct TodayPlanRow: View {
    let row: Api.PlanDay.Row
    let busy: Bool
    let tick: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: DesignTokens.s8) {
            Text(row.time ?? row.slot ?? "any time").textCase(.uppercase)
                .hType(11, .medium, Hy.ink3, tracking: 0.12)
                // "breakfast" in 11 caps is wider than 55: it shrinks rather
                // than breaking mid-word
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(width: 55, alignment: .leading)
                .padding(.top, 3)
            VStack(alignment: .leading, spacing: 3) {
                Text(row.title)
                    .hType(15, .semibold, row.done ? Hy.ink3 : Hy.ink)
                    .strikethrough(row.done, color: Hy.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                if !row.why.isEmpty {
                    Text(row.why).hType(13, .regular, Hy.ink2)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: DesignTokens.s8) {
                    Text(row.tag).hType(11, .medium, Hy.ink2)
                        .padding(.horizontal, DesignTokens.s8)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Hy.paper2))
                    if let a = row.adherence {
                        Text("\(Int((a * 100).rounded()))% of the last 30 days")
                            .hType(11, .regular, Hy.ink3)
                            .lineLimit(1)
                    }
                }
                .padding(.top, 2)
            }
            .motion(Curve.ease.animation(0.3), value: row.done)
            Spacer(minLength: 0)
            Button(action: tick) {
                Check(done: row.done, colour: row.done ? Hy.green : Hy.paper3,
                      size: 26, glyph: 14)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(Pressed(scale: 0.9))
            .disabled(busy)
            .padding(.top, -DesignTokens.s8)
            .accessibilityLabel(row.done ? "Done: \(row.title)" : "Tick \(row.title)")
        }
        .padding(.vertical, DesignTokens.s13)
    }
}

/// One suggestion on the horizontal shelf: what, why, and the lime Adopt.
private struct SuggestionCard: View {
    let row: Api.PlanDay.Row
    let busy: Bool
    let adopt: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            CardLabel(text: "Suggested", glyph: "sparkles")
            Text(row.title).hType(17, .semibold, Hy.ink, tracking: -0.02)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            Text(row.why).hType(13, .regular, Hy.ink2)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button(action: adopt) {
                ZStack {
                    if busy {
                        ProgressView().tint(Hy.plum)
                    } else {
                        Text("Adopt").hType(15, .semibold, Hy.plum)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(Capsule().fill(Hy.lime))
                .contentShape(Capsule())
            }
            .buttonStyle(Pressed(scale: 0.94))
            .allowsHitTesting(!busy)
            .accessibilityLabel(busy ? "Adopting \(row.title)" : "Adopt \(row.title)")
        }
        .todayCard()
    }
}

/// "Added · Undo", or what went wrong: plum capsule over the tab bar.
private struct PillView: View {
    let pill: PlanPill
    let undoing: Bool
    let undo: () -> Void

    var body: some View {
        HStack(spacing: DesignTokens.s8) {
            Text(pill.text).hType(13, .semibold, Hy.cream)
            if pill.canUndo {
                Text("·").hType(13, .regular, Hy.mist)
                Button(action: undo) {
                    Text("Undo").hType(13, .semibold, Hy.lime)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(undoing)
            }
        }
        .padding(.horizontal, DesignTokens.s21)
        .frame(minHeight: 44)
        .background(Capsule().fill(pill.kind == .failed ? Hy.rose : Hy.plum))
        .hShadow(0.35)
    }
}

extension Api.PlanDay {
    /// The same day with one row's tick moved, and the counter with it.
    func with(_ rowId: String, done: Bool) -> Api.PlanDay {
        let moved = rows.enumerated().map { index, row -> Row in
            guard Self.rowId(row, at: index) == rowId,
                  row.done != done else { return row }
            return Row(itemId: row.itemId, adoptId: row.adoptId, time: row.time,
                       slot: row.slot, title: row.title, why: row.why, tag: row.tag,
                       done: done, adherence: row.adherence)
        }
        return Api.PlanDay(day: day, done: moved.filter(\.done).count,
                           total: total, rows: moved)
    }
}

#if DEBUG
#Preview("Plan") {
    PlanView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
