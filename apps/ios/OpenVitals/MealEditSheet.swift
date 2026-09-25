import SwiftUI

// The meal sheet and the targets form: one custom overlay in the Today
// ZStack, over a veil that leaves the header in sight. Spec part C, "Meal
// sheet" and "Target entry"; reference "Meal edit sheet"; 48-hybrid.html's
// `.ed` wins ties.

/// Which sheet is up.
enum TodaySheet: Equatable {
    case meal(String)
    case targets
}

/// What the food card asks of Today: open a meal, open the targets form.
struct FoodActions {
    var edit: (String) -> Void = { _ in }
    var targets: () -> Void = {}
}

private struct FoodActionsKey: EnvironmentKey {
    static let defaultValue = FoodActions()
}

extension EnvironmentValues {
    var foodActions: FoodActions {
        get { self[FoodActionsKey.self] }
        set { self[FoodActionsKey.self] = newValue }
    }
}

// MARK: - a meal, changed on the phone

extension Api.Meal {
    init(id: String, time: String?, photo: String?, label: String, servings: Double,
         items: [Api.MealItem], totals: Api.Macros, moves: [Api.MealMove]) {
        self.id = id
        self.time = time
        self.photo = photo
        self.label = label
        self.servings = servings
        self.items = items
        self.totals = totals
        self.moves = moves
    }

    /// The meal with some fields changed, its totals worked out again the
    /// server's way: one plate is the item sum, rounded; the meal is the
    /// plate times the servings, rounded (`scaleTotals`).
    // ponytail: the server's plausibility floor on a plate is left off;
    // the reload after the write brings its numbers.
    func with(label: String? = nil, time: String? = nil, servings: Double? = nil,
              items: [Api.MealItem]? = nil) -> Api.Meal {
        let s = servings ?? self.servings
        let list = items ?? self.items
        let totals = servings == nil && items == nil ? self.totals
            : Api.Macros(kcal: Self.plate(list, \.kcal).map { Double(Score.round($0 * s)) },
                         proteinG: Self.plate(list, \.proteinG).map { Double(Score.round($0 * s)) },
                         carbsG: Self.plate(list, \.carbsG).map { Double(Score.round($0 * s)) },
                         fatG: Self.plate(list, \.fatG).map { Double(Score.round($0 * s)) },
                         estimated: self.totals.estimated)
        return Api.Meal(id: id, time: time ?? self.time, photo: photo, label: label ?? self.label,
                        servings: s, items: list, totals: totals, moves: moves)
    }

    /// One plate of one macro: the items that have it, summed and rounded.
    static func plate(_ items: [Api.MealItem], _ key: KeyPath<Api.MealItem, Double?>) -> Double? {
        let xs = items.compactMap { $0[keyPath: key] }.filter { $0 >= 0 }
        return xs.isEmpty ? nil : Double(Score.round(xs.reduce(0, +)))
    }

    var photoURL: URL? {
        guard let path = photo else { return nil }
        return path.hasPrefix("http") ? URL(string: path)
            : URL(string: path, relativeTo: Api.baseURL)
    }
}

extension Api.MealItem {
    /// "150 g" at 1.5 servings is "225 g": the leading number scales, the
    /// words after it stay.
    func portion(times servings: Double) -> String {
        guard servings != 1,
              let m = portion.firstMatch(of: /^(\d+(?:\.\d+)?)(.*)$/),
              let n = Double(m.1) else { return portion }
        return Design.number((n * servings * 10).rounded() / 10) + m.2
    }
}

// MARK: - the host

/// The sheet: 8 from the sides and the bottom, radius 42, padding
/// 13/21/21, at most 610 tall, scrolling. Grained cream.
struct TodaySheetHost: View {
    let model: TodayModel
    let sheet: TodaySheet
    /// `-OVMeal YES`: stage the prototype's third phone.
    var staged = false
    let close: () -> Void

    @State private var height: CGFloat = 610

    var body: some View {
        GeometryReader { g in
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                ScrollView {
                    content
                        .padding(.top, DesignTokens.s13)
                        .padding(.horizontal, DesignTokens.s21)
                        .padding(.bottom, DesignTokens.s21)
                        .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { height = $0 }
                }
                .scrollIndicators(.hidden)
                .scrollBounceBehavior(.basedOnSize)
                .scrollDismissesKeyboard(.interactively)
                .frame(height: max(0, min(610, height, g.size.height - DesignTokens.s8)))
                .grained(Hy.card, radius: 42)
                .clipShape(RoundedRectangle(cornerRadius: 42, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 42, style: .continuous))
            }
            .padding(.horizontal, DesignTokens.s8)
            .padding(.bottom, DesignTokens.s8)
        }
        .ignoresSafeArea(.container, edges: .bottom)
    }

    @ViewBuilder
    private var content: some View {
        switch sheet {
        case .meal(let id): MealEditor(model: model, id: id, staged: staged, close: close)
        case .targets: TargetsForm(model: model, close: close)
        }
    }
}

// MARK: - the meal editor

private struct MealEditor: View {
    let model: TodayModel
    let id: String
    let staged: Bool
    let close: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var name = ""
    @State private var time = ""
    @State private var badTime = false
    /// Counts stepper taps: the value bumps on each.
    @State private var bump = 0
    @State private var note = ""
    @State private var reading = false
    @State private var fix: FixState = .idle
    /// The rows a Fix brought, and which Fix it was, for the flash.
    @State private var flashed: Set<String> = []
    @State private var flashN = 0
    @State private var confirming = false
    @State private var stagedRow = false
    @FocusState private var focus: Field?

    private enum Field { case name, time, note }

    enum FixState: Equatable { case idle, reading, fixed, noPlate, failed }

    /// The ease-out cubic `1 − (1 − k)³` of `countTo`, 700 ms.
    static let count = Animation.timingCurve(0.33, 1, 0.68, 1, duration: 0.7)

    var body: some View {
        if let meal = model.meal(id) {
            ScrollViewReader { proxy in
                VStack(alignment: .leading, spacing: 0) {
                    Grab()
                    top(meal)
                    live.padding(.top, DesignTokens.s13)
                    portion(meal).padding(.top, DesignTokens.s13)
                    tiles(meal).padding(.top, DesignTokens.s13)
                    ingredients(meal)
                    if meal.photo != nil { fixBox.padding(.top, DesignTokens.s21) }
                    delete(meal, proxy).padding(.top, DesignTokens.s13)
                    SheetButton(title: "Done", action: done).padding(.top, DesignTokens.s8)
                }
            }
            .onAppear {
                name = meal.label
                time = meal.time ?? ""
                if staged { stage() }
            }
        }
    }

    // MARK: top row

    private func top(_ meal: Api.Meal) -> some View {
        HStack(alignment: .center, spacing: DesignTokens.s13) {
            KenBurns(url: meal.photoURL)
                .frame(width: 55, height: 55)
                .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
            VStack(alignment: .leading, spacing: 0) {
                TextField("Meal name", text: $name)
                    .font(.grotesk(21, .semibold)).tracking(-0.42)
                    .foregroundStyle(Hy.ink)
                    .focused($focus, equals: .name)
                    .submitLabel(.done)
                    .onSubmit { model.rename(id, name) }
                    .padding(.bottom, 1.5)
                    .overlay(alignment: .bottom) {
                        Line().stroke(Hy.paper3, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            .frame(height: 1.5)
                            .opacity(focus == .name ? 1 : 0)
                    }
                HStack(spacing: 0) {
                    Text("at ")
                    TextField("HH:MM", text: $time)
                        .font(.grotesk(13, .semibold))
                        .foregroundStyle(badTime ? Hy.rose : Hy.ink)
                        .keyboardType(.numbersAndPunctuation)
                        .focused($focus, equals: .time)
                        .submitLabel(.done)
                        .onSubmit(commitTime)
                        .fixedSize()
                        .padding(.vertical, 1)
                        .padding(.horizontal, DesignTokens.s5)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Hy.paper))
                    Text(meal.photo != nil ? " · read from the photo" : " · logged in Health")
                        .lineLimit(1)
                }
                .hType(13, .regular, Hy.ink2)
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            CloseButton(action: done)
        }
    }

    // MARK: live chip

    /// "Today N kcal · score S": the score through `Score.of` on the edited
    /// kcal and protein, with its day colour.
    private var live: some View {
        let score = model.result?.score
        let kcal = model.input?.kcal
        return HStack(spacing: DesignTokens.s8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(score.map(DayColour.of) ?? Hy.paper3)
                .frame(width: 8, height: 8)
                .motion(Curve.ease.animation(0.6), value: score)
            HStack(spacing: 0) {
                Text("Today ")
                Text(Design.number(kcal.map { Double(Score.round($0)) }))
                    .hType(13, .semibold, Hy.cream)
                    .contentTransition(.numericText(value: kcal ?? 0))
                Text(" kcal · score ")
                Text(score.map(String.init) ?? "—")
                    .hType(13, .semibold, Hy.cream)
                    .contentTransition(.numericText(value: Double(score ?? 0)))
            }
            .motion(Self.count, value: kcal)
        }
        .hType(11, .regular, Hy.mist)
        .padding(.vertical, DesignTokens.s5)
        .padding(.horizontal, DesignTokens.s13)
        .background(Capsule().fill(Hy.plum))
        .accessibilityElement(children: .combine)
    }

    // MARK: portion

    private func portion(_ meal: Api.Meal) -> some View {
        HStack(alignment: .center, spacing: DesignTokens.s13) {
            HStack(spacing: 0) {
                StepButton(glyph: "minus", label: "Less") { step(meal, -0.5) }
                    .disabled(meal.servings <= 0.5)
                Text(String(format: "%.1f×", meal.servings))
                    .hType(17, .semibold)
                    .frame(minWidth: 55)
                    .keyframeAnimator(initialValue: 1.0, trigger: reduce ? 0 : bump) { v, s in
                        v.scaleEffect(s)
                    } keyframes: { _ in
                        // `@keyframes bump { 40% { scale(1.16) } }`, 480 ms.
                        KeyframeTrack {
                            CubicKeyframe(1.16, duration: 0.192)
                            CubicKeyframe(1, duration: 0.288)
                        }
                    }
                StepButton(glyph: "plus", label: "More") { step(meal, 0.5) }
                    .disabled(meal.servings >= 4)
            }
            .padding(DesignTokens.s3)
            .background(Capsule().fill(Hy.paper))
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 0) {
                Text(Design.number(meal.totals.kcal))
                    .hType(34, .semibold, Hy.ink, tracking: -0.04)
                    .contentTransition(.numericText(value: meal.totals.kcal ?? 0))
                    .motion(Self.count, value: meal.totals.kcal)
                Text("kcal · \(Design.number(Api.Meal.plate(meal.items, \.kcal))) at 1×")
                    .hType(11, .regular, Hy.ink2)
            }
        }
    }

    private func step(_ meal: Api.Meal, _ by: Double) {
        let next = meal.servings + by
        guard (0.5...4).contains(next) else { return }
        bump += 1
        Motion.animate(Curve.spring.animation(0.9), reduce: reduce) {
            model.setServings(id, next)
        }
    }

    // MARK: macro tiles

    private func tiles(_ meal: Api.Meal) -> some View {
        // The protein day is the score's own (it counts Health's food too);
        // carbs and fat come from the meals.
        let proteinDay = model.input?.proteinG ?? model.food(\.proteinG)
        return HStack(alignment: .top, spacing: DesignTokens.s8) {
            MacroTile(name: "Protein", meal: meal.totals.proteinG, day: proteinDay,
                      target: model.targets?.proteinG, colour: Hy.life)
            // ponytail: carbs and fat have no stored target (the prototype's
            // 210 and 60 were placeholders), so their rails measure against
            // the day itself and say no "of". Add targets when the owner asks.
            MacroTile(name: "Carbs", meal: meal.totals.carbsG, day: model.food(\.carbsG),
                      target: nil, colour: Hy.amber)
            MacroTile(name: "Fat", meal: meal.totals.fatG, day: model.food(\.fatG),
                      target: nil, colour: Hy.blood)
        }
    }

    // MARK: ingredients

    private func ingredients(_ meal: Api.Meal) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Ingredients").textCase(.uppercase)
                    .hType(11, .semibold, Hy.ink2, tracking: 0.12)
                Spacer(minLength: DesignTokens.s8)
                if meal.items.count > 1 {
                    Text("swipe left to remove").hType(11, .regular, Hy.ink3)
                }
            }
            .padding(.bottom, DesignTokens.s5)
            .overlay(alignment: .bottom) { Hy.line.frame(height: 1) }
            ForEach(Array(meal.items.enumerated()), id: \.element.id) { i, item in
                IngredientRow(item: item, servings: meal.servings,
                              removable: meal.items.count > 1,
                              flash: flashed.contains(item.id) ? flashN : nil,
                              startsOpen: stagedRow && i == meal.items.count - 1) {
                    Motion.animate(Curve.ease.animation(0.32), reduce: reduce) {
                        _ = model.removeItem(id, at: i)
                    }
                }
                .transition(.collapse)
            }
        }
        .padding(.top, DesignTokens.s21)
    }

    // MARK: fix results

    private var fixBox: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Fix results").textCase(.uppercase)
                .hType(11, .semibold, Hy.ink2, tracking: 0.12)
            TextField("Say what's off", text: $note, axis: .vertical)
                .font(.grotesk(15))
                .foregroundStyle(Hy.ink)
                .lineLimit(2, reservesSpace: true)
                .focused($focus, equals: .note)
                .disabled(reading)
                .modifier(Shimmer(on: reading))
                .padding(.top, DesignTokens.s5)
            HStack(spacing: DesignTokens.s8) {
                Text(fixLine)
                    .hType(11, fix == .noPlate || fix == .failed ? .semibold : .regular,
                           fix == .noPlate || fix == .failed ? Hy.rose : Hy.ink3)
                Spacer(minLength: 0)
                if !reading, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(action: runFix) {
                        Text("Fix").hType(13, .semibold, Hy.plum)
                            .padding(.vertical, DesignTokens.s8)
                            .padding(.horizontal, DesignTokens.s21)
                            .background(Capsule().fill(Hy.lime))
                    }
                    .buttonStyle(Pressed(scale: 0.9))
                }
            }
            .frame(minHeight: 34)
            .padding(.top, DesignTokens.s8)
        }
        .padding(DesignTokens.s13)
        .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous)
            .strokeBorder(Hy.paper3, style: StrokeStyle(lineWidth: 2, dash: [6, 4])))
    }

    private var fixLine: String {
        switch fix {
        case .idle: "We read the photo again with your note."
        case .reading: "Reading it again…"
        case .fixed: "Fixed: read again with your note."
        case .noPlate: "Couldn't find a plate in the photo"
        case .failed: "Couldn't read it again · try again"
        }
    }

    private func runFix() {
        focus = nil
        reading = true
        fix = .reading
        Task { @MainActor in
            let outcome = await model.reread(id, note: note)
            reading = false
            switch outcome {
            case .changed(let rows):
                fix = .fixed
                note = ""
                flashN += 1
                flashed = rows
            case .noPlate: fix = .noPlate
            case .failed: fix = .failed
            }
        }
    }

    // MARK: delete and done

    @ViewBuilder
    private func delete(_ meal: Api.Meal, _ proxy: ScrollViewProxy) -> some View {
        if confirming {
            VStack(alignment: .leading, spacing: 0) {
                (Text("Delete \(meal.label)?").font(.grotesk(13, .bold))
                    + Text(" \(Design.number(meal.totals.kcal)) kcal leave today and the score counts again."))
                    .hType(13)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: DesignTokens.s8) {
                    Button { Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { confirming = false } } label: {
                        Text("Keep it").hType(15, .semibold)
                            .frame(maxWidth: .infinity, minHeight: 42)
                            .background(Capsule().fill(Hy.card))
                    }
                    Button(action: deleteNow) {
                        Text("Delete").hType(15, .semibold, .white)
                            .frame(maxWidth: .infinity, minHeight: 42)
                            .background(Capsule().fill(Hy.rose))
                    }
                }
                .buttonStyle(Pressed(scale: 0.9))
                .padding(.top, DesignTokens.s13)
            }
            .padding(DesignTokens.s13)
            .background(RoundedRectangle(cornerRadius: 21, style: .continuous).fill(Hy.roseSoft))
            .id("confirm")
            .transition(.opacity)
        } else {
            Button {
                Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { confirming = true }
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(50))
                    Motion.animate(Curve.ease.animation(0.32), reduce: reduce) {
                        proxy.scrollTo("confirm", anchor: .bottom)
                    }
                }
            } label: {
                Label("Delete meal", systemImage: "trash")
                    .hType(15, .semibold, Hy.rose)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .overlay(Capsule().strokeBorder(Hy.rose, lineWidth: 1.5))
                    .contentShape(Capsule())
            }
            .buttonStyle(Pressed(scale: 0.9))
        }
    }

    /// Out of the day now; the sheet closes and the food ring recounts.
    private func deleteNow() {
        Motion.animate(Curve.spring.animation(0.9), reduce: reduce) { model.deleteMeal(id) }
        close()
    }

    private func commitTime() {
        badTime = !model.retime(id, time)
    }

    /// Done and the close button: whatever the two fields hold is sent.
    private func done() {
        model.rename(id, name)
        if !time.isEmpty { commitTime() }
        focus = nil
        close()
    }

    /// The prototype's third phone: 1.5×, a note typed, the last row open.
    private func stage() {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(700))
            if let meal = model.meal(id) { step(meal, 1.5 - meal.servings) }
            note = "the rice was half that"
            stagedRow = true
        }
    }
}

// MARK: - pieces

/// `.grab`: 34×5, radius 3, paper3, 13 above the content.
private struct Grab: View {
    var body: some View {
        Capsule().fill(Hy.paper3)
            .frame(width: 34, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.bottom, DesignTokens.s13)
    }
}

private struct Line: Shape {
    func path(in rect: CGRect) -> Path {
        Path { $0.move(to: CGPoint(x: 0, y: rect.midY)); $0.addLine(to: CGPoint(x: rect.maxX, y: rect.midY)) }
    }
}

/// `.x`: 34, paper.
private struct CloseButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Hy.ink)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Hy.paper))
        }
        .buttonStyle(Pressed(scale: 0.9))
        .accessibilityLabel("Close")
    }
}

/// `.donebtn`: plum, 55 tall.
private struct SheetButton: View {
    let title: String
    var busy = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).hType(15, .semibold, Hy.cream)
                .frame(maxWidth: .infinity, minHeight: 55)
                .background(Capsule().fill(Hy.plum))
                .opacity(busy ? 0.6 : 1)
        }
        .buttonStyle(Pressed(scale: 0.9))
        .disabled(busy)
    }
}

/// `.step button`: 34, card, a small shadow.
private struct StepButton: View {
    let glyph: String
    let label: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: glyph)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Hy.ink)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Hy.card)
                    .shadow(color: Hy.plum.opacity(0.15), radius: 1.5, x: 0, y: 1))
        }
        .buttonStyle(Pressed(scale: 0.9))
        .accessibilityLabel(label)
    }
}

/// The 55 photo with the slow Ken Burns: `scale(1.04) → scale(1.21)
/// translate(−3, 2)`, 21 s each way. Still under Reduce Motion.
private struct KenBurns: View {
    let url: URL?
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var far = false

    var body: some View {
        ZStack {
            Hy.paper2
            if let url {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { plate }
                    .scaleEffect(far ? 1.21 : 1.04)
                    // CSS translates inside the scale: 3 and 2 times 1.21.
                    .offset(x: far ? -3.63 : 0, y: far ? 2.42 : 0)
            } else {
                plate
            }
        }
        .onAppear {
            guard !reduce else { return }
            Motion.animate(.easeInOut(duration: 21).repeatForever(autoreverses: true),
                           reduce: reduce) { far = true }
        }
    }

    private var plate: some View {
        Image(systemName: "fork.knife")
            .font(.system(size: 17))
            .foregroundStyle(Hy.ink3)
    }
}

/// A macro tile: this meal's grams, then a rail with the rest of the day in
/// ink3 and this meal from there in the macro colour, rose when the day
/// goes over its target. With no target the rail is the day itself.
private struct MacroTile: View {
    let name: String
    let meal: Double?
    let day: Double?
    let target: Double?
    let colour: Color

    private var mine: Double { meal ?? 0 }
    private var total: Double { max(day ?? mine, mine) }
    private var rest: Double { max(0, total - mine) }
    private var over: Bool { target.map { total > $0 } ?? false }

    /// The rest's width and the meal's, 0…1 of the rail.
    private var widths: (rest: Double, meal: Double) {
        let scale = target ?? total
        guard scale > 0 else { return (0, 0) }
        let r = min(1, rest / scale)
        return (r, max(0, min(1, total / scale) - r))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(name).hType(11, .regular, Hy.ink2)
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(Design.number(meal.map { Double(Score.round($0)) }))
                    .hType(21, .semibold, Hy.ink, tracking: -0.02)
                    .contentTransition(.numericText(value: mine))
                    .motion(MealEditor.count, value: mine)
                Text(" g").hType(11, .regular, Hy.ink2)
            }
            GeometryReader { g in
                let w = widths
                ZStack(alignment: .leading) {
                    Hy.paper3
                    Hy.ink3.frame(width: g.size.width * w.rest)
                    (over ? Hy.rose : colour)
                        .frame(width: g.size.width * w.meal)
                        .offset(x: g.size.width * w.rest)
                }
                .clipShape(RoundedRectangle(cornerRadius: 3))
                .motion(Curve.spring.animation(0.6), value: [w.rest, w.meal])
            }
            .frame(height: 5)
            .padding(.top, DesignTokens.s5)
            Text("day \(Design.number(Double(Score.round(total))))"
                 + (target.map { " of \(Design.number($0))" } ?? " g"))
                .hType(11, over ? .semibold : .regular, over ? Hy.rose : Hy.ink2)
                .lineLimit(2)
                .padding(.top, DesignTokens.s3)
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 21, style: .continuous).fill(Hy.paper))
    }
}

/// `.ing`: 47 tall. Swipe left shows the 89 rose Remove; past −34 it rests
/// open at −89, past −160 it removes. A row a Fix brought flashes
/// green-soft for 1.2 s.
private struct IngredientRow: View {
    let item: Api.MealItem
    let servings: Double
    let removable: Bool
    /// The Fix that brought this row, or nil.
    let flash: Int?
    var startsOpen = false
    let remove: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var dx: CGFloat = 0
    @State private var open = false
    @State private var sideways: Bool?
    @State private var glow = 0.0

    static let rest: CGFloat = -89

    var body: some View {
        ZStack(alignment: .trailing) {
            if removable {
                Button(action: remove) {
                    Text("Remove").hType(13, .semibold, .white)
                        .frame(width: 89)
                        .frame(maxHeight: .infinity)
                        .background(Hy.rose)
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
            }
            front
                .offset(x: dx)
                .simultaneousGesture(removable ? swipe : nil)
                .onTapGesture { if open { settle(open: false) } }
        }
        .frame(height: 47)
        .clipped()
        .overlay(alignment: .bottom) { Hy.line.frame(height: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: "Remove") { if removable { remove() } }
        .onAppear {
            if startsOpen { dx = Self.rest; open = true }
            if flash != nil { light() }
        }
        .onChange(of: startsOpen) { _, now in if now { settle(open: true) } }
        .onChange(of: flash) { _, now in if now != nil { light() } }
    }

    private var front: some View {
        HStack(spacing: DesignTokens.s8) {
            VStack(alignment: .leading, spacing: 0) {
                Text(item.name.prefix(1).uppercased() + item.name.dropFirst())
                    .hType(13, .medium).lineLimit(1)
                Text("\(Design.number(item.proteinG.map { Double(Score.round($0 * servings)) })) g protein")
                    .hType(11, .regular, Hy.ink3).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(item.portion(times: servings))
                .hType(13, .semibold)
                .lineLimit(1)
                .padding(.vertical, DesignTokens.s3)
                .padding(.horizontal, DesignTokens.s8)
                .background(RoundedRectangle(cornerRadius: 8).fill(Hy.paper))
            Text(Design.number(item.kcal.map { Double(Score.round($0 * servings)) }))
                .hType(13, .semibold)
                .contentTransition(.numericText(value: (item.kcal ?? 0) * servings))
                .motion(MealEditor.count, value: servings)
                .frame(width: 55, alignment: .trailing)
        }
        .frame(maxHeight: .infinity)
        .background(Hy.card)
        .overlay(Hy.greenSoft.opacity(glow).allowsHitTesting(false))
        .contentShape(Rectangle())
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 5)
            .onChanged { v in
                if sideways == nil {
                    sideways = abs(v.translation.width) >= abs(v.translation.height)
                }
                guard sideways == true else { return }
                var t = Transaction()
                t.disablesAnimations = true
                withTransaction(t) { dx = min(0, (open ? Self.rest : 0) + v.translation.width) }
            }
            .onEnded { _ in
                defer { sideways = nil }
                guard sideways == true else { return }
                if dx < -160 { remove() } else { settle(open: dx < -34) }
            }
    }

    /// `transition: transform 320ms ease`.
    private func settle(open: Bool) {
        self.open = open
        Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { dx = open ? Self.rest : 0 }
    }

    /// `@keyframes fixed { 0%, 60% { green-soft } }` over 1.2 s.
    private func light() {
        glow = 1
        Motion.animate(Curve.ease.animation(0.48).delay(0.72), reduce: reduce) { glow = 0 }
    }
}

/// `.ing.gone`: height and opacity to nothing.
private struct Collapse: ViewModifier {
    let gone: Bool
    func body(content: Content) -> some View {
        content
            .frame(height: gone ? 0 : 47, alignment: .top)
            .clipped()
            .opacity(gone ? 0 : 1)
    }
}

private extension AnyTransition {
    static var collapse: AnyTransition {
        .asymmetric(insertion: .opacity,
                    removal: .modifier(active: Collapse(gone: true), identity: Collapse(gone: false)))
    }
}

/// `.fix.reading textarea`: a lime band sweeping across, 900 ms, linear,
/// for as long as the read runs. A still tint under Reduce Motion.
private struct Shimmer: ViewModifier {
    let on: Bool
    @Environment(\.accessibilityReduceMotion) private var reduce

    func body(content: Content) -> some View {
        content.background {
            if on {
                if reduce {
                    Hy.lime.opacity(0.25)
                } else {
                    GeometryReader { g in
                        TimelineView(.animation) { t in
                            let k = t.date.timeIntervalSinceReferenceDate
                                .truncatingRemainder(dividingBy: 0.9) / 0.9
                            let w = g.size.width
                            LinearGradient(colors: [.clear, Hy.lime.opacity(0.5), .clear],
                                           startPoint: .leading, endPoint: .trailing)
                                .frame(width: w / 2)
                                // background-position −100% → 200% at 50% size.
                                .offset(x: -w / 2 + k * 1.5 * w)
                        }
                    }
                    .clipped()
                }
            }
        }
    }
}

// MARK: - the targets form

/// The food targets, in the sheet's style: two numbers, Save. An empty
/// field clears the person's own number and the estimate takes over.
private struct TargetsForm: View {
    let model: TodayModel
    let close: () -> Void

    @State private var kcal = ""
    @State private var protein = ""
    @State private var problem: String?
    @State private var saving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Grab()
            HStack(alignment: .top, spacing: DesignTokens.s13) {
                VStack(alignment: .leading, spacing: DesignTokens.s3) {
                    Text("Food targets").hType(21, .semibold, Hy.ink, tracking: -0.02)
                    Text("What today's kcal and protein are measured against.")
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                CloseButton(action: close)
            }
            HStack(spacing: DesignTokens.s8) {
                field("Calories", $kcal, "kcal")
                field("Protein", $protein, "g")
            }
            .padding(.top, DesignTokens.s13)
            if model.targets?.estimated == true {
                Text("Now estimated from your weight, height, age and sex. A number you set wins.")
                    .hType(11, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, DesignTokens.s8)
            }
            if let problem {
                Text(problem).hType(11, .semibold, Hy.rose).padding(.top, DesignTokens.s8)
            }
            SheetButton(title: saving ? "Saving…" : "Save", busy: saving, action: save)
                .padding(.top, DesignTokens.s13)
        }
        .onAppear {
            kcal = model.targets?.kcal.map { String(Int($0)) } ?? ""
            protein = model.targets?.proteinG.map { String(Int($0)) } ?? ""
        }
    }

    private func field(_ name: String, _ text: Binding<String>, _ unit: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(name).hType(11, .regular, Hy.ink2)
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s3) {
                TextField("—", text: text)
                    .font(.grotesk(21, .semibold))
                    .foregroundStyle(Hy.ink)
                    .keyboardType(.numberPad)
                Text(unit).hType(11, .regular, Hy.ink2)
            }
        }
        .padding(DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 21, style: .continuous).fill(Hy.paper))
    }

    /// Empty is nil; anything else must read as a number.
    private static func number(_ s: String) -> Double?? {
        let t = s.trimmingCharacters(in: .whitespaces)
        if t.isEmpty { return .some(nil) }
        return Double(t).map { .some($0) }
    }

    private func save() {
        guard let k = Self.number(kcal), let p = Self.number(protein) else {
            problem = "Numbers only"
            return
        }
        if let bad = TodayModel.targetProblem(kcal: k, proteinG: p) {
            problem = bad
            return
        }
        problem = nil
        saving = true
        Task { @MainActor in
            let answer = await model.saveTargets(kcal: k, proteinG: p)
            saving = false
            if let answer { problem = answer } else { close() }
        }
    }
}
