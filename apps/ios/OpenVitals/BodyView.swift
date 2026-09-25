import SwiftUI

// Phase 38 D3: Body in the Hybrid look. `docs/plans/2026-09-24-phase38-hybrid-tabs-spec.md`
// part D3: the plum header with the lifestyle layer, the day's meals on a
// shelf that opens Home's own meal sheet, and Apple Health as a grid of
// small cards, one per type.

/// Body. What went into the body today beside what the body did with it. A
/// type with nothing in it is drawn and says so; it is never dropped.
struct BodyView: View {
    @ObservedObject private var health = HealthSyncModel.shared
    /// Today's meals and targets, so a meal opens the same sheet as on Home,
    /// and the lifestyle layer for the header.
    @State private var model: TodayModel
    @State private var day: Api.BodyDay?
    @State private var error = ""
    @State private var allMeals = false
    /// The meal sheet or the targets form, over the shelves.
    @State private var sheet: TodaySheet?
    /// Where the veil starts: under the header, so the layer stays in sight
    /// while a meal changes.
    @State private var headerHeight: CGFloat = 0
    /// On for the whole `sync()`, the reload included. `health.busy` alone
    /// never turns on in a fixtures build, where the Health sync is skipped.
    @State private var syncing = false
    /// How the last sync ended, for the header line.
    @State private var ended: BodyText.Ended?
    /// The render tests hand the day in and never ask the server.
    private let canned: Bool

    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.openAdd) private var openAdd
    /// On `Shell`; absent in the render tests.
    @Environment(IslandModel.self) private var island: IslandModel?

    @MainActor
    init(model: TodayModel? = nil, day: Api.BodyDay? = nil) {
        _model = State(initialValue: model ?? TodayModel())
        _day = State(initialValue: day)
        canned = day != nil
    }

    var body: some View {
        ZStack(alignment: .top) {
            HyScreen(refresh: { await sync() }) {
                header
                    .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { headerHeight = $0 }
            } content: {
                mealsShelf
                healthShelf
            }
            .overlay {
                if sheet != nil {
                    Hy.plum.opacity(0.2)
                        .padding(.top, headerHeight)
                        .ignoresSafeArea(edges: .bottom)
                        .onTapGesture { closeSheet() }
                        .transition(.opacity.animation(
                            Motion.animation(Curve.ease.animation(0.32), reduce: reduce)))
                }
            }
            if let sheet {
                TodaySheetHost(model: model, sheet: sheet, staged: Fixtures.meal,
                               close: closeSheet)
                    .transition(reduce ? .opacity : .move(edge: .bottom))
                    .zIndex(2)
            }
        }
        .environment(\.foodActions, FoodActions(
            edit: { id in openSheet(.meal(id)) },
            targets: { openSheet(.targets) }))
        .preference(key: TabBarHiddenKey.self, value: sheet != nil)
        .onReceive(NotificationCenter.default.publisher(for: .ovCaptured)) { _ in
            Task { await model.captured() }
        }
        .task {
            if let island { model.onReceipt = { [weak island] in island?.show($0) } }
            await load()
            // `-OVMeal YES -tab 1`: the meal sheet out on the first meal.
            if Fixtures.meal, let id = model.mealList.first?.id { sheet = .meal(id) }
        }
        .sheet(isPresented: $allMeals) { MealsView { allMeals = false } }
    }

    // MARK: the header

    private var life: Int? { model.result?.life }

    private var header: some View {
        HyHeader(title: "Body", value: life.map(String.init), word: Score.word(life),
                 line: BodyText.line(day, ended: ended)) {
            SyncButton(busy: syncing || health.busy) { Task { await sync() } }
        }
    }

    // MARK: meals

    /// Phase 34 moved Meals into Body; phase 38 makes it a shelf. The cards
    /// read the model's list, so an edit in the sheet shows at once.
    @ViewBuilder private var mealsShelf: some View {
        let meals = model.mealList
        if !meals.isEmpty {
            ShelfTitle("Meals", BodyText.mealsSub(count: meals.count, kcal: model.food(\.kcal)))
            HShelf {
                ForEach(Array(meals.enumerated()), id: \.element.id) { i, meal in
                    Button { openSheet(.meal(meal.id)) } label: { MealShelfCard(meal: meal) }
                        .buttonStyle(Pressed(scale: 0.96))
                        .leans(i)
                        .accessibilityHint("Opens the meal to change it")
                }
                Button { allMeals = true } label: { EveryMealCard() }
                    .buttonStyle(Pressed(scale: 0.96))
                    .leans(meals.count)
            }
        } else if model.loaded {
            ShelfTitle("Meals", "none yet today")
            noMeals.padding(.bottom, DesignTokens.s21)
        }
    }

    /// No meal today: one card, and the lime way to Add.
    private var noMeals: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("No meals yet today").hType(15, .semibold)
            Text("A photo, a few words or your voice. We read it in the island "
                 + "and sort it into meals.")
                .hType(13, .regular, Hy.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, DesignTokens.s5)
            Button(action: openAdd) {
                Label("Add a meal", systemImage: "plus")
                    .hType(15, .semibold, Hy.plum)
                    .frame(height: 44)
                    .padding(.horizontal, DesignTokens.s21)
                    .background(Capsule().fill(Hy.lime))
            }
            .buttonStyle(Pressed(scale: 0.92))
            .padding(.top, DesignTokens.s13)
        }
        .hyCard()
    }

    // MARK: Apple Health

    @ViewBuilder private var healthShelf: some View {
        ShelfTitle("Apple Health", "today, per type")
        if let day {
            if day.rows.isEmpty {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    Text("Nothing from Apple Health yet").hType(15, .semibold)
                    Text("Sync sends what the phone holds. Every type it reads "
                         + "shows here, with or without a number.")
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .hyCard()
            } else {
                TypeGrid(rows: day.rows)
            }
        } else if error.isEmpty {
            Text("Asking the server…").hType(13, .regular, Hy.ink3).hyCard()
        } else {
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                Text("Nothing to show").hType(15, .semibold)
                Text(error).hType(13, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .hyCard()
        }
        if health.busy, !health.progress.line.isEmpty {
            Text(health.progress.line)
                .hType(11, .regular, Hy.ink3)
                .lineLimit(1)
                .padding(.horizontal, DesignTokens.s21)
                .padding(.top, DesignTokens.s13)
        }
    }

    // MARK: the sheet

    /// Enters from below over 520 ms on the spring, as on Home.
    private func openSheet(_ next: TodaySheet) {
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { sheet = next }
    }

    private func closeSheet() {
        Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { sheet = nil }
    }

    // MARK: loading

    /// The day list, and the model once (a pull reads it again). Body
    /// failing is the grid's error; the model failing leaves the meals out.
    private func load(again: Bool = false) async {
        if !canned {
            do {
                day = try await Api.body()
                error = ""
            } catch {
                self.error = error.localizedDescription
            }
        }
        if again || !model.loaded { await model.load() }
    }

    /// The pull and the header's button: the phone sends what is new, then
    /// both reads go again. A phone never asked for Health access is asked
    /// first, with the same sheet Settings shows. A run already going is
    /// joined, not skipped (`HealthSyncModel` runs one at a time). The button
    /// turns for all of it, one turn at least so a reload that is back at once
    /// still shows the tap landed; the header line then says how it ended.
    private func sync() async {
        guard !syncing else { return }
        syncing = true
        defer { syncing = false }
        let start = Date()
        var outcome: SyncOutcome?
        if health.available, !Fixtures.on {
            if await health.needsAsking() { await health.requestAuthorization() }
            outcome = await health.syncAll()
        }
        await load(again: !canned)
        let left = SyncButton.turn - Date().timeIntervalSince(start)
        if left > 0 { try? await Task.sleep(for: .seconds(left)) }
        ended = BodyText.ended(error: error, health: outcome, at: Date())
    }
}

// MARK: - the words

/// Body's lines, apart from any view.
enum BodyText {
    /// How the last sync from the header's button ended.
    enum Ended: Equatable {
        /// `sent` is what Apple Health sent; nil when this build did not ask it.
        case synced(Date, sent: Int? = nil)
        case failed(String)
    }

    /// The Health run first: one that failed or needs a sign-in says so
    /// rather than "synced" over the reload. Then the reload's error, or the
    /// time it came back with what Health sent.
    static func ended(error: String, health: SyncOutcome? = nil, at: Date) -> Ended {
        if let health, !health.ok { return .failed(health.line) }
        return error.isEmpty ? .synced(at, sent: health?.sent) : .failed(error)
    }

    /// "12 types · last sync 07:18", or "… · nothing synced yet". Nil while
    /// the day is not in. Once the button has run: "12 types · 340 sent ·
    /// synced 09:12" ("nothing new" when Health had nothing), or the error it
    /// ended with.
    static func line(_ day: Api.BodyDay?, ended: Ended? = nil) -> String? {
        switch ended {
        case .failed(let message):
            return message
        case .synced(let at, let sent):
            var done = "synced \(clock(at))"
            if let sent {
                done = (sent == 0 ? "nothing new" : "\(Design.number(sent)) sent") + " · " + done
            }
            return day.map { "\(Design.plural($0.synced.types, "type", "types")) · \(done)" }
                ?? done
        case nil:
            break
        }
        guard let day else { return nil }
        let types = Design.plural(day.synced.types, "type", "types")
        guard let at = Design.clock(day.synced.lastAt) else {
            return "\(types) · nothing synced yet"
        }
        return "\(types) · last sync \(at)"
    }

    /// "09:12", as `Design.clock` writes a server stamp.
    static func clock(_ date: Date) -> String { clockFormat.string(from: date) }

    private static let clockFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f
    }()

    /// "2 meals · 1 240 kcal"; the meals alone when no meal has a number.
    static func mealsSub(count: Int, kcal: Double?) -> String {
        let meals = Design.plural(count, "meal", "meals")
        return kcal.map { "\(meals) · \(Design.number($0)) kcal" } ?? meals
    }

    /// The word under a type's value: its state, or "nothing today".
    static func word(_ row: Api.BodyDay.Row) -> String {
        row.value == nil ? "nothing today" : row.word
    }

    /// "P 41 · C 64 · F 20 g"; a macro the meal has no number for is a dash.
    static func macros(_ m: Api.Macros) -> String {
        "P \(Design.number(m.proteinG)) · C \(Design.number(m.carbsG)) · "
            + "F \(Design.number(m.fatG)) g"
    }
}

// MARK: - opening Add

private struct OpenAddKey: EnvironmentKey {
    static let defaultValue: () -> Void = {}
}

extension EnvironmentValues {
    /// Opens the Add sheet, as the + does. `Shell` sets it; without it the
    /// "Add a meal" button does nothing.
    var openAdd: () -> Void {
        get { self[OpenAddKey.self] }
        set { self[OpenAddKey.self] = newValue }
    }
}

// MARK: - pieces

/// The header's trailing control: 44, plum2, the two arrows in cream,
/// turning while a sync runs. Still under Reduce Motion. A tap knocks.
private struct SyncButton: View {
    let busy: Bool
    let action: () -> Void
    @State private var taps = 0
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        Button { taps += 1; action() } label: {
            TimelineView(.animation(paused: !busy || reduce)) { ctx in
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Hy.cream)
                    .rotationEffect(.degrees(busy && !reduce ? Self.angle(ctx.date) : 0))
            }
            .frame(width: 44, height: 44)
            .background(Circle().fill(Hy.plum2))
            .contentShape(Circle())
        }
        .buttonStyle(Pressed(scale: 0.92))
        .disabled(busy)
        .sensoryFeedback(.impact, trigger: taps)
        .accessibilityLabel(busy ? "Syncing" : "Sync now")
    }

    /// One turn, in seconds.
    static let turn: TimeInterval = 1.2

    static func angle(_ date: Date) -> Double {
        date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: turn) / turn * 360
    }
}

/// The 89 block on top of a meal card: the photo, or paper2 with the glyph
/// of where the meal came from.
struct MealPhoto: View {
    let meal: Api.Meal
    var height: CGFloat = 89

    var body: some View {
        Hy.paper2
            .frame(height: height)
            .frame(maxWidth: .infinity)
            .overlay {
                if let url = meal.photoURL {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { glyph }
                } else {
                    glyph
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            .accessibilityHidden(true)
    }

    /// A photo still loading shows the camera; a meal logged in Health, the
    /// plate.
    private var glyph: some View {
        Image(systemName: meal.photo == nil ? "fork.knife" : "camera")
            .font(.system(size: 21))
            .foregroundStyle(Hy.ink3)
    }
}

/// One meal on the shelf: the photo, the name, where and when, the kcal,
/// the three macros. A tap opens the meal sheet.
private struct MealShelfCard: View {
    let meal: Api.Meal

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MealPhoto(meal: meal)
            Text(meal.label)
                .hType(15, .semibold, Hy.ink, tracking: -0.02)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, DesignTokens.s8)
            Text(meal.basis).hType(11, .regular, Hy.ink3)
                .lineLimit(1)
                .padding(.top, 2)
            (Text(Design.number(meal.totals.kcal))
                .font(.grotesk(21, .semibold))
                + Text(" kcal" + meal.totals.mark).font(.grotesk(11)).foregroundColor(Hy.ink3))
                .foregroundStyle(Hy.ink)
                .contentTransition(.numericText())
                .padding(.top, DesignTokens.s5)
            Text(BodyText.macros(meal.totals)).hType(11, .regular, Hy.ink2)
                .lineLimit(1)
        }
        .todayCard(width: 180)
        .accessibilityElement(children: .combine)
    }
}

/// The last card on the Meals shelf: every meal, with its items.
private struct EveryMealCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Hy.paper2
                .frame(height: 89)
                .overlay {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 21))
                        .foregroundStyle(Hy.ink2)
                }
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            Text("Every meal").hType(15, .semibold, Hy.ink, tracking: -0.02)
                .padding(.top, DesignTokens.s8)
            Text("the items, and what each one moves")
                .hType(11, .regular, Hy.ink3)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)
        }
        .todayCard(width: 144)
        .accessibilityElement(children: .combine)
    }
}

/// Two columns of small cards, one per HealthKit type; the cards of a row
/// share its height.
private struct TypeGrid: View {
    let rows: [Api.BodyDay.Row]

    var body: some View {
        Grid(horizontalSpacing: DesignTokens.s13, verticalSpacing: DesignTokens.s13) {
            ForEach(Array(stride(from: 0, to: rows.count, by: 2)), id: \.self) { i in
                GridRow {
                    TypeCard(row: rows[i])
                    if i + 1 < rows.count {
                        TypeCard(row: rows[i + 1])
                    } else {
                        Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                    }
                }
            }
        }
        .padding(.horizontal, DesignTokens.s21)
    }
}

/// One type today: the name in caps, the value and its unit, the word in its
/// colour, where it came from on one line.
private struct TypeCard: View {
    let row: Api.BodyDay.Row

    private var measured: Bool { row.value != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(row.name).textCase(.uppercase)
                .hType(11, .medium, Hy.ink2, tracking: 0.12)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(measured ? row.display : "—")
                    .hType(21, .semibold, Hy.ink, tracking: -0.03)
                    .lineLimit(1)
                if measured, let unit = row.unit, !unit.isEmpty {
                    Text(unit).hType(11, .regular, Hy.ink2).lineLimit(1)
                }
            }
            .padding(.top, DesignTokens.s5)
            Text(BodyText.word(row))
                .hType(11, .medium, measured ? HyState.ink(row.word) : Hy.ink3)
                .lineLimit(1)
            Spacer(minLength: DesignTokens.s5)
            Text(row.provenance).hType(11, .regular, Hy.ink3)
                .lineLimit(1)
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, minHeight: 89, maxHeight: .infinity, alignment: .topLeading)
        .grained(Hy.card, radius: 21)
        .accessibilityElement(children: .combine)
    }
}

#if DEBUG
#Preview("Body") {
    BodyView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
