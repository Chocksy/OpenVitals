import Observation
import SwiftUI
import UIKit

// Phase 37: the Hybrid Today. `docs/plans/2026-09-24-phase37-hybrid-ios-spec.md`
// part C, drawn from `docs/mockups/v4/ios-variations/48-hybrid.html` with the
// sizes, colours and curves of `phase37-hybrid-motion-reference.md`.

// MARK: - the palette

/// The Hybrid's colours. Light only: Today draws this palette in both
/// schemes (spec, "Light only").
enum Hy {
    static let plum = DesignTokens.plum.color
    static let plum2 = DesignTokens.plum2.color
    static let plum3 = DesignTokens.plum3.color
    static let mist = DesignTokens.mist.color
    static let paper = DesignTokens.paper.color
    static let paper2 = DesignTokens.paper2.color
    static let paper3 = DesignTokens.paper3.color
    static let card = DesignTokens.card.color
    static let cream = DesignTokens.cream.color
    static let life = DesignTokens.life.color
    static let lifeLt = DesignTokens.lifeLt.color
    static let blood = DesignTokens.blood.color
    static let bloodLt = DesignTokens.bloodLt.color
    static let gene = DesignTokens.gene.color
    static let geneLt = DesignTokens.geneLt.color
    static let green = DesignTokens.hGreen.color
    static let greenSoft = DesignTokens.hGreenSoft.color
    static let amber = DesignTokens.hAmber.color
    static let amberSoft = DesignTokens.hAmberSoft.color
    static let rose = DesignTokens.hRose.color
    static let roseSoft = DesignTokens.hRoseSoft.color
    static let lime = DesignTokens.hLime.color

    /// `--ink` is the plum.
    static let ink = plum
    // ponytail: --ink-2, --ink-3, --line and the header glow are the
    // prototype's own values and not in system.css's Hybrid section yet; move
    // them there when the web port needs them.
    static let ink2 = Color(UIColor(rgb: 0x6f5a72))
    static let ink3 = Color(UIColor(rgb: 0xa08fa0))
    static let line = Color(UIColor(rgb: 0xeadfcb))
    /// `radial-gradient(… #4d1d58 …)` behind the score.
    static let glow = Color(UIColor(rgb: 0x4d1d58))
}

/// The grain tile, at 128 points as the CSS draws it at 128 px.
struct GrainTile: View {
    var body: some View {
        Image(decorative: Grain.tile, scale: 1)
            .resizable(resizingMode: .tile)
            .allowsHitTesting(false)
    }
}

extension View {
    /// A cream surface: its colour with the grain over it, clipped to its
    /// radius. Cream surfaces only; never the plum or the video.
    /// `shadow` goes on the surface alone: on the whole view SwiftUI would
    /// shadow every word and tag inside it.
    func grained(_ colour: Color, radius: CGFloat, shadow: Double? = nil) -> some View {
        background {
            let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
            ZStack { colour; GrainTile() }
                .clipShape(shape)
                .background { if let shadow { shape.fill(colour).hShadow(shadow) } }
        }
    }

    /// `box-shadow: 0 13px 21px -13px rgba(43,16,51,o)`. SwiftUI has no
    /// spread, so the blur is halved and the drop carries the rest.
    func hShadow(_ opacity: Double) -> some View {
        shadow(color: Hy.plum.opacity(opacity), radius: 8, x: 0, y: 10)
    }

    /// Space Grotesk at one of the Hybrid's sizes, in one colour.
    func hType(_ size: CGFloat, _ weight: Font.Weight = .regular,
               _ colour: Color = Hy.ink, tracking em: CGFloat = 0) -> some View {
        font(.grotesk(size, weight))
            .tracking(em * size)
            .foregroundStyle(colour)
    }
}

extension Curve {
    /// The same bezier as a `UnitCurve`, for the loops a `TimelineView`
    /// drives by hand (the CSS keyframes ease every segment).
    var unit: UnitCurve {
        let b = bezier
        return .bezier(startControlPoint: UnitPoint(x: b.x1, y: b.y1),
                       endControlPoint: UnitPoint(x: b.x2, y: b.y2))
    }
}

// MARK: - the island push

private struct IslandPushKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    /// How far the open island pushes the Today header down: `Shell` sets
    /// it from `IslandModel.push`. The header pads its top by this on
    /// `Curve.ispring`.
    var islandPush: CGFloat {
        get { self[IslandPushKey.self] }
        set { self[IslandPushKey.self] = newValue }
    }
}

// MARK: - the model

/// Everything Today draws, loaded in one go. Views read it; they never call
/// `Api` themselves.
@Observable
@MainActor
final class TodayModel {
    var today: Api.Today?
    /// Phase 39: the Worth a look cases opened from Today.
    let desk = HunchDesk()
    var plan: Api.PlanDay?
    var meals: Api.MealDay?
    var days: [Api.ScoreDays.Day] = []
    var error = ""
    private(set) var loaded = false

    /// Do rows sent to the back with Later, in the order they were sent.
    // ponytail: the Later order is not saved; save it when the owner asks.
    var later: [String] = []

    /// A change the server has not answered yet (a portion), run through
    /// `Score.of` so the header moves before the reply lands. Ticks need no
    /// preview of their own: they change `plan`, and `input` counts the
    /// moves off it.
    var preview: ScoreInput?

    /// Rows skipped in Focus: they wait at the back and leave Focus's pile
    /// until ticked or brought back by their chip.
    var skipped: Set<String> = []

    /// What the header shows while a card is in the air or Focus is open:
    /// the score from before, until `settle` lands the new one. Nil: the
    /// header follows `result`.
    private(set) var shown: ScoreResult?
    @ObservationIgnored private var holds = 0

    /// The last `settle`, for the views that answer it: the pill, the catch,
    /// today's cell flash, the moves row landing, the haptic.
    private(set) var landing: Landing?

    /// Counts the ticks the server has taken. Focus buzzes `.success` on it:
    /// it settles only at the close, so it waits for the answer instead.
    private(set) var confirmed = 0

    /// `POST /api/habits`. A seam so a test can fail it.
    @ObservationIgnored
    var send: (_ itemId: String, _ day: String, _ done: Bool) async throws -> Void = {
        _ = try await Api.tick(itemId: $0, day: $1, done: $2)
    }

    /// The island's receipt for a tick, the last tick or a failed write.
    /// `HybridTodayView` hands it to the `IslandModel` on `Shell`.
    @ObservationIgnored
    var onReceipt: (TodayReceipt) -> Void = { _ in }

    /// Writes in flight, and the last write per item so two taps on one
    /// row reach the server in the order they were made.
    @ObservationIgnored private var writes = 0
    @ObservationIgnored private var chains: [String: Task<Void, Never>] = [:]

    /// Built by `init()`: reads the server again after the last write lands.
    /// The tests and the gallery hand their data in and never reload.
    private let live: Bool

    init() { live = true }

    /// A model with its data already in hand: the tests, the gallery.
    init(today: Api.Today?, plan: Api.PlanDay?, meals: Api.MealDay?,
         days: [Api.ScoreDays.Day]) {
        self.today = today
        self.plan = plan
        self.meals = meals
        self.days = days
        loaded = true
        live = false
    }

    /// The four reads in parallel. Today failing is the screen's error; the
    /// other three failing leave their shelf as it was.
    func load() async {
        // Last time's answers first, so the screen never opens empty; the
        // live reads below replace them, and a failed one leaves them up.
        if today == nil { today = Api.cachedToday() }
        if plan == nil { plan = Api.cachedPlanToday() }
        if meals == nil { meals = Api.cachedMeals() }
        if days.isEmpty { days = Api.cachedScoreDays(n: 91)?.days ?? [] }
        async let plan = try? await Api.planToday()
        async let meals = try? await Api.meals()
        async let days = try? await Api.scoreDays(n: 91)
        do {
            today = try await Api.today()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
        if let plan = await plan { self.plan = plan }
        if let meals = await meals { self.meals = meals }
        if let days = await days { self.days = days.days }
        loaded = true
    }

    // MARK: derived

    /// The day the score is for, `YYYY-MM-DD`.
    var day: String { today?.score?.day ?? plan?.day ?? Api.localDay() }

    /// Every row that can be ticked: the pips and the moves card.
    var doRows: [Api.PlanDay.Row] { plan?.rows.filter { $0.itemId != nil } ?? [] }

    /// The Do queue: open rows in plan order, the ones sent Later at the back.
    var queue: [Api.PlanDay.Row] {
        let open = doRows.filter { !$0.done }
        let front = open.filter { !later.contains($0.itemId ?? "") }
        let back = later.compactMap { id in open.first { $0.itemId == id } }
        return front + back
    }

    /// No tickable row at all: the Do card says "Nothing planned today".
    var nothingPlanned: Bool { doRows.isEmpty }

    var movesDone: Int { doRows.filter(\.done).count }

    /// The server's input with the moves counted off `plan`, so a tick the
    /// server has not answered is already in it.
    var input: ScoreInput? {
        guard var input = preview ?? today?.score?.input else { return nil }
        if !doRows.isEmpty { input.moves = .init(done: movesDone, due: doRows.count) }
        // A meal edited or deleted here, not yet read back: its difference
        // goes on the server's day, so the header previews the portion.
        let kcal = mealDelta(\.kcal), protein = mealDelta(\.proteinG)
        if kcal != 0 { input.kcal = max(0, (input.kcal ?? 0) + kcal) }
        if protein != 0 { input.proteinG = max(0, (input.proteinG ?? 0) + protein) }
        return input
    }

    /// The score now: the server's while nothing is pending, else the
    /// preview through `Score.of`.
    var result: ScoreResult? {
        guard let input else { return today?.score?.result }
        if input == today?.score?.input, let server = today?.score?.result { return server }
        return Score.of(input)
    }

    /// What the header draws: held while a card flies or Focus is open.
    var header: ScoreResult? { shown ?? result }

    /// The rows Focus deals: the queue without the ones skipped there.
    var focusPile: [Api.PlanDay.Row] { queue.filter { !skipped.contains($0.itemId ?? "") } }

    /// The score with Focus's whole pile ticked, for its footer.
    var allDone: Int? {
        guard var input, let m = input.moves else { return result?.score }
        input.moves = .init(done: min(m.due, m.done + focusPile.count), due: m.due)
        return Score.of(input).score
    }

    var targets: Api.Targets? { today?.score?.targets }

    /// `+N`: the score with one more move done, minus the score now. Nil
    /// when nothing is left to tick.
    var gain: Int? {
        guard var input, let m = input.moves, m.done < m.due,
              let now = Score.of(input).score else { return nil }
        input.moves = .init(done: m.done + 1, due: m.due)
        return Score.of(input).score.map { $0 - now }
    }

    /// Goals with a projection, the ones the plan moves most first.
    var headings: [Api.Today.Goal] {
        (today?.goals ?? []).filter { $0.projection != nil }
            .sorted { Heading.pull($0) > Heading.pull($1) }
    }

    /// 21 days ending today, today on the score the header shows.
    var strip: [DayCell] { DayGrid.strip(today: day, days: days, live: header) }

    /// 13 weeks ending on today's week.
    var grid: [DayCell] { DayGrid.grid(today: day, days: days, live: header) }

    /// Days in a row at 65 or more, ending today.
    var run: Int { DayGrid.run(grid) }

    // MARK: ticks

    private func row(_ id: String) -> Api.PlanDay.Row? { doRows.first { $0.itemId == id } }

    /// Freeze the header on the score it shows now, until `settle`.
    func hold() {
        if holds == 0 { shown = result }
        holds += 1
    }

    /// `settleScore`: release one hold and land the header on `after` (the
    /// score right after that tick) or, with nothing else held, on `result`.
    /// Runs once per tick, so two fast ticks count up twice.
    ///
    /// A tick whose write failed before it landed has been rolled back
    /// already: it lands as nothing, with no `.success` and no score of its
    /// own for the header.
    func settle(at after: ScoreResult? = nil, row: String? = nil, ticked: Bool = false) {
        let failed = ticked && row.map { self.row($0)?.done != true } == true
        let from = header
        holds = max(0, holds - 1)
        shown = holds > 0 ? (failed ? shown : after ?? shown) : nil
        let to = header
        var pill: String?
        if let a = from?.score, let b = to?.score, a != b {
            pill = "\(b > a ? "+" : "−")\(abs(b - a)) · moves \(movesDone) of \(doRows.count)"
        }
        landing = Landing(n: (landing?.n ?? 0) + 1, pill: pill, row: failed ? nil : row,
                          ticked: ticked && !failed)
    }

    /// Tick a row now and tell the server. `hold` freezes the header first,
    /// for a card that flies to it; Focus holds the header for itself.
    /// Returns the score right after, for `settle`.
    @discardableResult
    func tick(_ row: Api.PlanDay.Row, hold: Bool = true) -> ScoreResult? {
        guard let id = row.itemId, self.row(id)?.done == false else { return nil }
        let before = result?.score
        if hold { self.hold() }
        later.removeAll { $0 == id }
        skipped.remove(id)
        plan = plan?.with(id, done: true)
        let after = result
        if queue.isEmpty {
            allDone(moves: doRows.count, score: after?.score)
        } else {
            onReceipt(.tick(title: row.title,
                            sub: TodayReceipt.tickSub(gain: (after?.score ?? 0) - (before ?? 0),
                                                      score: after?.score, done: movesDone,
                                                      due: doRows.count),
                            score: after?.score))
        }
        write(id, done: true)
        return after
    }

    /// "All done", with the streak as the server counts it (`lib/daily.ts`
    /// `streak`: today counts once it is active, and a tick makes it active).
    /// When the server already saw a tick today its streak holds today, so
    /// it goes out now; otherwise today may or may not have been active
    /// before, so the receipt waits for the reload's own number.
    private func allDone(moves: Int, score: Int?) {
        let server = today?.score
        if let server, (server.input.moves?.done ?? 0) > 0 {
            onReceipt(.allDone(streak: server.streak, moves: moves, score: score))
        } else if live, !Fixtures.on {
            pendingAllDone = (moves, score)
        } else {
            // ponytail: a fixture run and the tests have no server to ask;
            // count today on top of the canned streak.
            onReceipt(.allDone(streak: (server?.streak ?? 0) + 1, moves: moves, score: score))
        }
    }

    /// An "All done" waiting for the reload's streak.
    @ObservationIgnored private var pendingAllDone: (moves: Int, score: Int?)?

    /// A capture landed: read the day again, as after a write.
    func captured() async { await reconcile() }

    /// A tap on a done pip, or a done chip in Focus. On the home the header
    /// settles at once; in Focus it waits for the close.
    func untick(_ row: Api.PlanDay.Row, settles: Bool = true) {
        guard let id = row.itemId, self.row(id)?.done == true else { return }
        if settles { hold() }
        plan = plan?.with(id, done: false)
        write(id, done: false)
        if settles { settle() }
    }

    /// Left past 89 on the home: to the back of the queue, locally.
    func sendLater(_ row: Api.PlanDay.Row) {
        guard let id = row.itemId else { return }
        later.removeAll { $0 == id }
        later.append(id)
    }

    /// Left past 89 in Focus: to the back, and out of Focus's pile.
    func skip(_ row: Api.PlanDay.Row) {
        guard let id = row.itemId else { return }
        sendLater(row)
        skipped.insert(id)
    }

    /// One write, after the last one for the same item. A failure puts the
    /// row back as it was (so the card returns to the queue and the score to
    /// its number) and says so in the island. The last write to land reads
    /// the server again.
    private func write(_ id: String, done: Bool) {
        let before = chains[id]
        writes += 1
        let day = self.day
        chains[id] = Task { [weak self] in
            await before?.value
            guard let self else { return }
            do {
                try await self.send(id, day, done)
                if done { self.confirmed += 1 }
            } catch {
                if self.row(id)?.done == done {
                    self.plan = self.plan?.with(id, done: !done)
                }
                self.pendingAllDone = nil
                self.onReceipt(.failed(message: "Couldn't save · try again"))
            }
            self.writes -= 1
            if self.writes == 0 {
                self.chains = [:]
                await self.reconcile()
            }
        }
    }

    /// Waits for every write sent so far, and for any portion burst still
    /// waiting to be sent. The tests use it.
    func drain() async {
        while writes > 0 || !debounces.isEmpty {
            for task in Array(debounces.values) { await task.value }
            for task in Array(chains.values) { await task.value }
        }
    }

    /// Today, the plan, the meals and the days again, once no write is in
    /// flight. Today and the meals land together, so a meal edit's
    /// difference is always measured against the day it came with.
    /// ponytail: a fixture run has no server to answer, so it keeps its
    /// local ticks rather than reloading the canned ones over them.
    private func reconcile() async {
        guard live, !Fixtures.on else { return }
        async let plan = try? await Api.planToday()
        async let days = try? await Api.scoreDays(n: 91)
        async let meals = try? await Api.meals()
        if let today = try? await Api.today() {
            self.today = today
            if let pending = pendingAllDone, let streak = today.score?.streak {
                pendingAllDone = nil
                onReceipt(.allDone(streak: streak, moves: pending.moves, score: pending.score))
            }
        }
        let freshMeals = await meals
        if let freshMeals { self.meals = freshMeals }
        guard writes == 0 else { return }
        if let plan = await plan { self.plan = plan }
        if let days = await days { self.days = days.days }
        // The server has every write now: its meals take over from the
        // local copies, except one a portion burst has not sent yet.
        if freshMeals != nil {
            for id in edited.keys where debounces[id] == nil {
                edited[id] = nil
                accepted[id] = nil
            }
            gone.removeAll()
        }
    }

    // MARK: meals (task C3)

    /// Meals changed here and not yet read back from the server, by id. The
    /// sheet and the food card read these over `meals`, so a reload that
    /// lands during a portion burst cannot snap the stepper back (Review
    /// focus 4). The reload after the last write clears them.
    private(set) var edited: [String: Api.Meal] = [:]
    /// Meals deleted here, until the reload after the delete.
    private(set) var gone: Set<String> = []
    /// What the server last took from us, per meal: a failed write rolls
    /// back to it (none: back to the server's own copy).
    @ObservationIgnored private var accepted: [String: Api.Meal] = [:]
    /// The portion stepper's wait, per meal.
    @ObservationIgnored private var debounces: [String: Task<Void, Never>] = [:]

    /// `PATCH /api/meals/:id`. A seam so a test can count or fail it.
    @ObservationIgnored
    var sendPatch: (_ id: String, _ change: MealChange) async throws -> Void = { id, c in
        _ = try await Api.patchMeal(id: id, label: c.label, time: c.time,
                                    servings: c.servings, items: c.items)
    }
    /// `DELETE /api/meals/:id`.
    @ObservationIgnored
    var sendDelete: (_ id: String) async throws -> Void = { _ = try await Api.deleteMeal(id: $0) }
    /// `POST /api/meals/:id/reread`.
    @ObservationIgnored
    var sendReread: (_ id: String, _ note: String) async throws -> Api.Meal = {
        try await Api.reread(id: $0, note: $1)
    }
    /// `PUT /api/targets`.
    @ObservationIgnored
    var sendTargets: (_ kcal: Double?, _ proteinG: Double?) async throws -> Void = {
        _ = try await Api.setTargets(kcal: $0, proteinG: $1)
    }
    /// How long the stepper waits after the last tap before it sends.
    @ObservationIgnored var debounce: Duration = .milliseconds(600)

    /// Today's meals as the phone has them: the server's, edits over them,
    /// deletions out.
    var mealList: [Api.Meal] {
        (meals?.meals ?? []).filter { !gone.contains($0.id) }.map { edited[$0.id] ?? $0 }
    }

    func meal(_ id: String) -> Api.Meal? {
        guard !gone.contains(id) else { return nil }
        return edited[id] ?? meals?.meals.first { $0.id == id }
    }

    /// What the edits and deletions add to the server's day, for one macro.
    func mealDelta(_ key: KeyPath<Api.Macros, Double?>) -> Double {
        (meals?.meals ?? []).reduce(0) { sum, m in
            let deleted = gone.contains(m.id)
            guard deleted || edited[m.id] != nil else { return sum }
            let now = deleted ? nil : edited[m.id]?.totals[keyPath: key]
            return sum + (now ?? 0) - (m.totals[keyPath: key] ?? 0)
        }
    }

    /// The day's meal totals with the edits in.
    func food(_ key: KeyPath<Api.Macros, Double?>) -> Double? {
        let base = meals?.totals[keyPath: key]
        let d = mealDelta(key)
        return d == 0 ? base : max(0, (base ?? 0) + d)
    }

    /// The stepper: the meal changes now, the PATCH goes 600 ms after the
    /// last tap, one call per burst.
    func setServings(_ id: String, _ value: Double) {
        guard let meal = meal(id) else { return }
        let v = min(4, max(0.5, (value * 2).rounded() / 2))
        guard v != meal.servings else { return }
        edited[id] = meal.with(servings: v)
        debounces[id]?.cancel()
        let wait = debounce
        debounces[id] = Task { [weak self] in
            try? await Task.sleep(for: wait)
            guard !Task.isCancelled, let self else { return }
            self.debounces[id] = nil
            self.writeMeal(id, MealChange(servings: v))
        }
    }

    /// A swipe past −160 or a tap on Remove. The last row stays: deleting
    /// the meal is the way to empty it (the server answers 400 otherwise).
    @discardableResult
    func removeItem(_ id: String, at index: Int) -> Bool {
        guard let meal = meal(id), meal.items.count > 1,
              meal.items.indices.contains(index) else { return false }
        var items = meal.items
        items.remove(at: index)
        edited[id] = meal.with(items: items)
        writeMeal(id, MealChange(items: items))
        return true
    }

    /// The name field, on submit.
    func rename(_ id: String, _ label: String) {
        let label = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let meal = meal(id), !label.isEmpty, label.count <= 200,
              label != meal.label else { return }
        edited[id] = meal.with(label: label)
        writeMeal(id, MealChange(label: label))
    }

    /// The time field, on submit. `HH:MM` as the server takes it, or false.
    @discardableResult
    func retime(_ id: String, _ time: String) -> Bool {
        let time = time.trimmingCharacters(in: .whitespaces)
        guard time.wholeMatch(of: /([01]\d|2[0-3]):[0-5]\d/) != nil,
              let meal = meal(id) else { return false }
        guard time != meal.time else { return true }
        edited[id] = meal.with(time: time)
        writeMeal(id, MealChange(time: time))
        return true
    }

    /// Delete, after the inline confirm: out of the day now, back with a
    /// receipt if the server says no.
    func deleteMeal(_ id: String) {
        debounces[id]?.cancel()
        debounces[id] = nil
        gone.insert(id)
        let key = "meal:" + id
        let before = chains[key]
        writes += 1
        chains[key] = Task { [weak self] in
            await before?.value
            guard let self else { return }
            do {
                try await self.sendDelete(id)
            } catch {
                self.gone.remove(id)
                self.onReceipt(.failed(message: "Couldn't delete · try again"))
            }
            await self.landed()
        }
    }

    /// Fix results: the photo read again with the note. The rows that are
    /// new come back for the flash; a read with no plate leaves the meal as
    /// it was.
    func reread(_ id: String, note: String) async -> Reread {
        let note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let before = meal(id), (1...500).contains(note.count) else { return .failed }
        debounces[id]?.cancel()
        debounces[id] = nil
        let key = "meal:" + id
        await chains[key]?.value
        writes += 1
        let outcome: Reread
        do {
            let meal = try await sendReread(id, note)
            edited[id] = meal
            accepted[id] = meal
            outcome = .changed(Set(meal.items.map(\.id)).subtracting(before.items.map(\.id)))
        } catch let failure as Api.Failure where failure.status == 422 {
            outcome = .noPlate
        } catch {
            onReceipt(.failed(message: "Couldn't read it again · try again"))
            outcome = .failed
        }
        Task { await self.landed() }
        return outcome
    }

    enum Reread: Equatable {
        /// The item ids that are new since the read before.
        case changed(Set<String>)
        /// 422: the reader found no plate in the photo.
        case noPlate
        case failed
    }

    /// One PATCH, after the meal's last write. A failure puts the meal back
    /// to what the server last took and says so in the island.
    private func writeMeal(_ id: String, _ change: MealChange) {
        let key = "meal:" + id
        let before = chains[key]
        let sent = edited[id]
        writes += 1
        chains[key] = Task { [weak self] in
            await before?.value
            guard let self else { return }
            do {
                try await self.sendPatch(id, change)
                if let sent { self.accepted[id] = sent }
            } catch {
                self.debounces[id]?.cancel()
                self.debounces[id] = nil
                self.edited[id] = self.accepted[id]
                self.onReceipt(.failed(message: "Couldn't save · try again"))
            }
            await self.landed()
        }
    }

    private func landed() async {
        writes -= 1
        if writes == 0 {
            chains = [:]
            await reconcile()
        }
    }

    // MARK: targets (task C3)

    /// `PUT /api/targets`'s bounds: outside them a number is a typo.
    static let kcalBounds: ClosedRange<Double> = 800...6000
    static let proteinBounds: ClosedRange<Double> = 10...400

    /// What is wrong with the two fields, or nil. An empty field is nil and
    /// clears the person's own number, so the estimate takes over.
    static func targetProblem(kcal: Double?, proteinG: Double?) -> String? {
        if let kcal, !kcalBounds.contains(kcal) { return "Calories go from 800 to 6 000" }
        if let proteinG, !proteinBounds.contains(proteinG) { return "Protein goes from 10 to 400 g" }
        return nil
    }

    /// Save, then read the day again. Nil when it saved, else what to say.
    func saveTargets(kcal: Double?, proteinG: Double?) async -> String? {
        if let problem = Self.targetProblem(kcal: kcal, proteinG: proteinG) { return problem }
        do {
            try await sendTargets(kcal, proteinG)
        } catch {
            onReceipt(.failed(message: "Couldn't save · try again"))
            return "Couldn't save · try again"
        }
        if live, !Fixtures.on { await load() }
        return nil
    }
}

/// One `PATCH /api/meals/:id`: only the fields given go out.
struct MealChange: Equatable {
    var label: String?
    var time: String?
    var servings: Double?
    var items: [Api.MealItem]?
}

/// What a tick or a failed write tells the island.
enum TodayReceipt: Equatable {
    /// `"<move>" / "+Δ · score S · moves X of N"`.
    case tick(title: String, sub: String, score: Int?)

    /// `"+Δ · score S · moves X of N"`, the one place the tick's line is
    /// written.
    static func tickSub(gain: Int, score: Int?, done: Int, due: Int) -> String {
        "+\(gain) · score \(score.map(String.init) ?? "—") · moves \(done) of \(due)"
    }

    /// The last open move ticked: `"All done today" / "streak N · moves X of X"`.
    case allDone(streak: Int, moves: Int, score: Int?)
    case failed(message: String)
}

/// One `settleScore`, for the views that answer it.
struct Landing: Equatable {
    /// Counts up, so the same words twice still read as a new landing.
    let n: Int
    /// `+N · moves X of N`; nil when the score did not move.
    let pill: String?
    /// The move that landed, for the moves card's row.
    let row: String?
    /// A tick landed, not an untick or a Focus close: the success haptic.
    let ticked: Bool
    /// Today's cell flashes when the score moved.
    var flash: Bool { pill != nil }
}

// MARK: - the heading arithmetic

enum Heading {
    /// How far the plan moves this marker, as a share of where it is.
    static func pull(_ goal: Api.Today.Goal) -> Double {
        guard let p = goal.projection, p.from != 0 else { return 0 }
        return abs(p.expected - p.from) / abs(p.from)
    }

    /// Where the marker lands with only the levers not in `off`: `from`
    /// plus their deltas, clamped to `±maxChange × horizonWeeks / 12`.
    static func landing(_ p: Api.Today.Goal.Projection, off: Set<String>,
                        maxChange: Double?) -> Double {
        let sum = p.levers.filter { !off.contains($0.name) }
            .reduce(0) { $0 + $1.delta }
        guard let maxChange else { return p.from + sum }
        let cap = maxChange * p.horizonWeeks / 12
        return p.from + min(cap, max(-cap, sum))
    }
}

// MARK: - the days

/// One square of the strip or the grid.
struct DayCell: Identifiable, Equatable {
    let day: String
    let date: Date
    /// Monday 0 … Sunday 6.
    let weekday: Int
    let score: Int?
    let life: Int?
    let blood: Int?
    let genes: Int?
    let draw: Bool
    let reason: Api.ScoreDays.Reason?
    let isToday: Bool
    let future: Bool
    var id: String { day }
}

/// The calendar arithmetic behind the header, apart from any view.
enum DayGrid {

    /// Day strings are calendar days, so the arithmetic runs in UTC where
    /// no day is 23 hours long.
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private static func formatter(_ format: String, _ locale: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: locale)
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.dateFormat = format
        return f
    }

    private static let ymd = formatter("yyyy-MM-dd", "en_US_POSIX")
    private static let named = formatter("EEE d MMM", "en_GB")
    private static let monthDay = formatter("MMM d", "en_US_POSIX")
    private static let month = formatter("MMM", "en_US_POSIX")

    static func date(_ day: String) -> Date? { ymd.date(from: day) }
    static func key(_ date: Date) -> String { ymd.string(from: date) }
    /// "Sat 12 Sep", the prototype's `dname`.
    static func name(_ date: Date) -> String { named.string(from: date) }
    /// "Dec 9", the chart's axis.
    static func short(_ date: Date) -> String { monthDay.string(from: date) }

    static func weekday(_ date: Date) -> Int {
        (calendar.component(.weekday, from: date) + 5) % 7
    }

    static func adding(_ days: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: days, to: date) ?? date
    }

    /// `count` cells from `start`. Today takes the live result when there is
    /// one; a day after today is future; a day the server has no row for, or
    /// a null score, is an empty cell.
    static func cells(from start: Date, count: Int, today: String,
                      days: [Api.ScoreDays.Day], live: ScoreResult?) -> [DayCell] {
        let byDay = Dictionary(days.map { ($0.day, $0) }, uniquingKeysWith: { $1 })
        return (0..<count).map { i in
            let date = adding(i, to: start)
            let day = key(date)
            let row = byDay[day]
            let isToday = day == today
            let future = day > today
            let useLive = isToday && live != nil
            return DayCell(
                day: day, date: date, weekday: weekday(date),
                score: future ? nil : useLive ? live?.score : row?.score,
                life: useLive ? live?.life : row?.life,
                blood: useLive ? live?.blood : row?.blood,
                genes: useLive ? live?.genes : row?.genes,
                draw: row?.draw ?? false,
                reason: row?.reason,
                isToday: isToday, future: future)
        }
    }

    /// The last 20 days and today.
    static func strip(today: String, days: [Api.ScoreDays.Day],
                      live: ScoreResult?) -> [DayCell] {
        guard let end = date(today) else { return [] }
        return cells(from: adding(-20, to: end), count: 21, today: today,
                     days: days, live: live)
    }

    /// 91 cells, Monday first, the last column the week today is in.
    static func grid(today: String, days: [Api.ScoreDays.Day],
                     live: ScoreResult?) -> [DayCell] {
        guard let end = date(today) else { return [] }
        let monday = adding(-weekday(end), to: end)
        return cells(from: adding(-84, to: monday), count: 91, today: today,
                     days: days, live: live)
    }

    /// The run: today counts only at 65 or more, then each day before it
    /// while it has a score of 65 or more. `scores` is oldest first and ends
    /// on today.
    static func run(scores: [Int?]) -> Int {
        guard let today = scores.last ?? nil, today >= 65 else { return 0 }
        var n = 1
        for s in scores.dropLast().reversed() {
            guard let s, s >= 65 else { break }
            n += 1
        }
        return n
    }

    static func run(_ cells: [DayCell]) -> Int {
        run(scores: cells.filter { !$0.future }.map(\.score))
    }

    // The grid's box: a 13 label column and 13 week columns of 17, 5 apart,
    // under a 13 month row, centred in the header.
    static let cellSide: CGFloat = 17
    static let gap: CGFloat = 5
    static let labelColumn: CGFloat = 13
    static let gridWidth = labelColumn + 13 * (cellSide + gap)
    static let gridHeight = labelColumn + 7 * (cellSide + gap)

    /// Where a grid cell sits in a grid `width` wide.
    static func cellRect(week: Int, weekday: Int, width: CGFloat) -> CGRect {
        let x0 = (width - gridWidth) / 2 + labelColumn + gap
        return CGRect(x: x0 + CGFloat(week) * (cellSide + gap),
                      y: labelColumn + gap + CGFloat(weekday) * (cellSide + gap),
                      width: cellSide, height: cellSide)
    }

    static func cellRect(index: Int, width: CGFloat) -> CGRect {
        cellRect(week: index / 7, weekday: index % 7, width: width)
    }

    /// The month over each week column: the month whose 1st falls in it.
    static func months(_ grid: [DayCell]) -> [String] {
        stride(from: 0, to: grid.count, by: 7).map { w in
            grid[w..<min(w + 7, grid.count)]
                .first { calendar.component(.day, from: $0.date) == 1 }
                .map { month.string(from: $0.date) } ?? ""
        }
    }

    /// The why line under the strip.
    static func why(open: Bool, run: Int, selected: DayCell?, score: Int?,
                    done: Int, due: Int) -> String {
        // A score under 65 today breaks the run; "0-day run" reads as a bug.
        let streak = run > 0 ? "\(run)-day run at 65+" : "No run at 65+ now"
        if open { return "\(streak) · tap a day" }
        guard let cell = selected else {
            return "\(streak) · tap for 13 weeks"
        }
        if cell.isToday {
            let s = score.map(String.init) ?? "—"
            return due > 0 ? "Today · \(s) · moves \(done) of \(due)" : "Today · \(s)"
        }
        guard let s = cell.score else { return "\(name(cell.date)) · No data" }
        return "\(name(cell.date)) · \(s)" + (cell.reason.map { " · \($0.text)" } ?? "")
    }
}

/// Where the day tooltip goes: 212 wide, clamped inside the grid, above the
/// cell from Thursday on and below it before, 13 away.
struct TipPlacement: Equatable {
    static let width: CGFloat = 212
    static let gap: CGFloat = 13

    let left: CGFloat
    /// The arrow's centre, from the tooltip's left edge.
    let arrowX: CGFloat
    let above: Bool
    /// Above: the tooltip's bottom edge. Below: its top edge.
    let edgeY: CGFloat

    init(cell: CGRect, weekday: Int, width: CGFloat) {
        let cx = cell.midX
        left = max(0, min(width - Self.width, cx - Self.width / 2))
        arrowX = cx - left
        above = weekday >= 3
        edgeY = above ? cell.minY - Self.gap : cell.maxY + Self.gap
    }

    /// The top edge for a tooltip `height` tall, as the prototype sets it.
    func top(height: CGFloat) -> CGFloat { above ? edgeY - height : edgeY }
}

// MARK: - the screen

/// Today: the plum score header that never scrolls, the shelves under it,
/// and (C2, C3) Focus and the meal sheet over both.
struct HybridTodayView: View {
    @State private var model: TodayModel
    @State private var tight = false
    @State private var settings = Fixtures.sheet == "settings"
    @Environment(\.accessibilityReduceMotion) private var reduce

    /// Cards in the air, from the stack to the score.
    @State private var flights: [Flight] = []
    /// Focus is drawn; `focusOpen` false starts its close.
    @State private var focus = Fixtures.focus
    @State private var focusOpen = Fixtures.focus
    @State private var confetti: Date?
    @State private var pill: String?
    @State private var pillHide: Task<Void, Never>?
    /// The meal sheet or the targets form, over the shelves.
    @State private var sheet: TodaySheet?
    /// On `Shell`; absent in the gallery and the render tests.
    @Environment(IslandModel.self) private var island: IslandModel?

    struct Flight: Identifiable {
        let id = UUID()
        let row: Api.PlanDay.Row
        let pose: CGSize
    }

    @MainActor
    init(model: TodayModel? = nil) {
        _model = State(initialValue: model ?? TodayModel())
    }

    var body: some View {
        ZStack(alignment: .top) {
            VStack(spacing: 0) {
                ScoreHeader(model: model, tight: tight, pill: pill,
                            avatar: { settings = true })
                    // Above the shelves, so the tooltip can hang over them.
                    .zIndex(1)
                Shelves(model: model, tight: $tight)
                    // The veil covers the shelves only: the header stays
                    // above it so the score is in sight while a meal changes.
                    .overlay {
                        if sheet != nil {
                            Hy.plum.opacity(0.2)
                                .ignoresSafeArea()
                                .onTapGesture { closeSheet() }
                                .transition(.opacity.animation(
                                    Motion.animation(Curve.ease.animation(0.32), reduce: reduce)))
                        }
                    }
            }
            if let sheet {
                TodaySheetHost(model: model, sheet: sheet, staged: Fixtures.meal,
                               close: closeSheet)
                    .transition(reduce ? .opacity : .move(edge: .bottom))
                    .zIndex(2)
            }
        }
        .coordinateSpace(name: "today")
        .environment(\.doActions, DoActions(fly: fly, focus: openFocus))
        .environment(\.foodActions, FoodActions(
            edit: { id in openSheet(.meal(id)) },
            targets: { openSheet(.targets) }))
        .environment(\.hunchActions, HunchActions(open: { id in openSheet(.hunch(id)) }))
        .overlayPreferenceValue(TodayAnchors.self) { spots in
            // One reader over the whole screen: the stack and the score
            // resolve here, and Focus, the flights and the confetti draw here.
            // The outer reader keeps the safe area so Focus can clear the
            // status bar; the inner one covers the whole screen.
            GeometryReader { outer in
            GeometryReader { g in
                let stack = spots[.stack].map { g[$0] }
                let score = spots[.score].map { g[$0] }
                ZStack(alignment: .topLeading) {
                    if let stack, let score {
                        ForEach(flights) { f in
                            FlyingCard(row: f.row, from: stack,
                                       to: CGPoint(x: score.midX, y: score.midY), pose: f.pose)
                        }
                    }
                    if focus {
                        FocusDeck(model: model,
                                  from: stack ?? CGRect(x: 21, y: g.size.height * 0.3,
                                                        width: g.size.width - 42, height: 126),
                                  size: g.size, safeTop: outer.safeAreaInsets.top,
                                  instant: Fixtures.focus, open: focusOpen,
                                  closed: focusClosed, close: { focusOpen = false },
                                  celebrate: celebrate)
                    }
                    if let confetti {
                        Confetti(start: confetti).frame(width: g.size.width, height: g.size.height)
                    }
                }
            }
            .ignoresSafeArea()
            }
        }
        .preference(key: TabBarHiddenKey.self, value: focus || sheet != nil)
        .sensoryFeedback(.success, trigger: model.landing) { _, new in new?.ticked == true }
        .onChange(of: model.landing) { _, landing in
            guard let text = landing?.pill else { return }
            pill = text
            pillHide?.cancel()
            pillHide = Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(2600))
                if !Task.isCancelled { pill = nil }
            }
        }
        .background {
            ZStack { Hy.paper; GrainTile() }.ignoresSafeArea()
        }
        .onReceive(NotificationCenter.default.publisher(for: .ovCaptured)) { _ in
            Task { await model.captured() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .ovPlanChanged)) { _ in
            Task { await model.captured() }
        }
        .task {
            if let island { model.onReceipt = { [weak island] in island?.show($0) } }
            if !model.loaded { await model.load() }
            // `-OVMeal YES`: the prototype's third phone, the sheet open.
            if Fixtures.meal, let id = model.mealList.first?.id { sheet = .meal(id) }
            // `-OVScreen hunch` / `hunch-how`: the case with the full fixture
            // behind it (the cluster), How we know folded or open.
            if Fixtures.screen == "hunch" || Fixtures.screen == "hunch-how",
               let rows = model.today?.hunches,
               let row = rows.first(where: { $0.kind == "cluster" }) ?? rows.first {
                sheet = .hunch(row.id)
            }
        }
        .sheet(isPresented: $settings) { SettingsView() }
    }

    // MARK: the sheet

    /// Enters from below over 520 ms on the spring.
    private func openSheet(_ next: TodaySheet) {
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { sheet = next }
    }

    private func closeSheet() {
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { sheet = nil }
    }

    // MARK: the Do shelf's two asks

    /// The fly to the header: the card leaves the queue and the ghost bar
    /// jumps now; 560 ms later the header catches it (`settleScore`), and an
    /// emptied pile throws the confetti.
    private func fly(_ row: Api.PlanDay.Row, _ pose: CGSize) {
        guard let id = row.itemId, model.doRows.contains(where: { $0.itemId == id && !$0.done })
        else { return }
        let had = !model.queue.isEmpty
        let after = Motion.animate(Curve.spring.animation(0.56), reduce: reduce) {
            model.tick(row)
        }
        let flight = Flight(row: row, pose: pose)
        flights.append(flight)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(560))
            flights.removeAll { $0.id == flight.id }
            Motion.animate(Curve.spring.animation(0.9), reduce: reduce) {
                model.settle(at: after, row: id, ticked: true)
            }
            if had, model.queue.isEmpty { celebrate() }
        }
    }

    /// Focus opens out of the stack; the header holds its score until the
    /// close lands the ticks made in there.
    private func openFocus() {
        guard !focus else { return }
        model.hold()
        focusOpen = true
        focus = true
    }

    private func focusClosed() {
        focus = false
        Motion.animate(Curve.spring.animation(0.9), reduce: reduce) { model.settle() }
    }

    private func celebrate() {
        guard !reduce else { return }
        let now = Date()
        confetti = now
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(2200))
            if confetti == now { confetti = nil }
        }
    }
}

/// Today asks `Shell` to hide the tab bar while Focus covers the screen.
struct TabBarHiddenKey: PreferenceKey {
    static let defaultValue = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

#if DEBUG
#Preview("Hybrid Today") {
    HybridTodayView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
