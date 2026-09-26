import SwiftUI

// The shelves under the header: Do now, Today so far, Where it's heading, in
// one vertical scroll. Rows lag the scroll; horizontal shelves lean with it.
// Reference: "Shelves".

struct Shelves: View {
    let model: TodayModel
    @Binding var tight: Bool

    @Environment(\.ovTabBarInset) private var tabBar
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var lastY: CGFloat = 0
    @State private var lag: CGFloat = 0
    @State private var settle: Task<Void, Never>?
    /// The tab bar's selection: Worth a look's line switches to Blood.
    @AppStorage("tab") private var tab = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                DoShelf(model: model)
                    .lagging(lag, row: 0)
                    .padding(.top, DesignTokens.s21)
                ShelfTitle("Today so far", "food · sleep · moves")
                    .padding(.top, DesignTokens.s21)
                HShelf { TodaySoFar(model: model) }
                    .lagging(lag, row: 1)
                if let hunches = model.today?.hunches, !hunches.isEmpty {
                    let open = hunches.filter { $0.kind != "good_news" }.count
                    ShelfTitle("Worth a look", open > 0
                               ? "\(open) open" + (open < hunches.count ? " · \(hunches.count - open) good news" : "")
                               : "good news")
                    // ponytail: three rows here, the rest on Blood behind the line.
                    WorthALook(rows: Array(hunches.prefix(3)), desk: model.desk,
                               more: hunches.count, toBlood: { tab = 2 })
                        .padding(.bottom, DesignTokens.s21)
                        .lagging(lag, row: 2)
                }
                if !model.headings.isEmpty {
                    // `margin-top: 0`: the shelf above ends on its 21 of padding.
                    ShelfTitle("Where it's heading", "if you keep this")
                    HShelf { Heading.Cards(goals: model.headings, model: model) }
                        .lagging(lag, row: 3)
                }
            }
            // `.scroll { padding-bottom: 110 }`, the tab bar's share included.
            .padding(.bottom, max(110, tabBar + DesignTokens.s21))
            .background {
                GeometryReader { g in
                    Color.clear.onChange(of: g.frame(in: .named("shelves")).minY,
                                         initial: true) { _, y in scrolled(-y) }
                }
            }
        }
        .coordinateSpace(name: "shelves")
        .scrollIndicators(.hidden)
        .refreshable { await model.load() }
        .scrollToBottomIfAsked()
    }

    /// `scrollTop` moved: the score shrinks past 21, the rows lag by
    /// `clamp(−13, 13, −dy × .6)` and come back 90 ms after the last move.
    private func scrolled(_ top: CGFloat) {
        let dy = top - lastY
        lastY = top
        if (top > 21) != tight { tight = top > 21 }
        guard !reduce, dy != 0 else { return }
        lag = max(-13, min(13, -dy * 0.6))
        settle?.cancel()
        settle = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(90))
            if !Task.isCancelled { lag = 0 }
        }
    }
}

private extension View {
    /// `.row { transform: translateY(var(--lag)) }`: 700 ms spring, rows
    /// 50 ms apart.
    func lagging(_ lag: CGFloat, row: Int) -> some View {
        offset(y: lag)
            .motion(Curve.spring.animation(0.7).delay(Double(row) * 0.05), value: lag)
    }
}

// MARK: - horizontal shelves

/// `--tilt` and `--shift`, handed to each card of a horizontal shelf.
private struct LeanKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

extension EnvironmentValues {
    /// The last horizontal scroll step of the shelf a card sits on, points.
    var shelfVelocity: CGFloat {
        get { self[LeanKey.self] }
        set { self[LeanKey.self] = newValue }
    }
}

/// `.hs`: snap to the start with 21 leading, 13 apart, padding 5/21/21.
struct HShelf<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var lastX: CGFloat = 0
    @State private var v: CGFloat = 0
    @State private var settle: Task<Void, Never>?

    var body: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: DesignTokens.s13) { content }
                .scrollTargetLayout()
                .padding(.top, DesignTokens.s5)
                .padding(.bottom, DesignTokens.s21)
                .background {
                    GeometryReader { g in
                        Color.clear.onChange(of: g.frame(in: .named("hs")).minX,
                                             initial: true) { _, x in scrolled(-x) }
                    }
                }
        }
        .coordinateSpace(name: "hs")
        .contentMargins(.horizontal, DesignTokens.s21, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned)
        .scrollIndicators(.hidden)
        .environment(\.shelfVelocity, v)
    }

    private func scrolled(_ left: CGFloat) {
        let dv = left - lastX
        lastX = left
        guard !reduce, dv != 0 else { return }
        v = dv
        settle?.cancel()
        settle = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(90))
            if !Task.isCancelled { v = 0 }
        }
    }
}

private struct Leans: ViewModifier {
    let index: Int
    @Environment(\.shelfVelocity) private var v

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees(max(-5, min(5, -v * 0.25))), anchor: .bottom)
            .offset(x: max(-21, min(21, -v * 0.8)))
            .motion(Curve.spring.animation(0.7).delay(Double(min(index, 3)) * 0.04),
                    value: v)
    }
}

extension View {
    /// A card on a horizontal shelf: `rotate(clamp(±5°, −v × .25))` and
    /// `translateX(clamp(±21, −v × .8))` round its bottom centre.
    func leans(_ index: Int) -> some View { modifier(Leans(index: index)) }

    /// `.tc`: the card, grained, radius 21, padding 13.
    func todayCard(width: CGFloat = 258) -> some View {
        padding(DesignTokens.s13)
            .frame(width: width, alignment: .topLeading)
            .frame(minHeight: 146, alignment: .topLeading)
            // ponytail: the `inset 0 1 0 #fff` top line is left off; a
            // one-point white stroke on the top edge if the owner misses it.
            .grained(Hy.card, radius: 21, shadow: 0.3)
    }
}

/// `.tc .lbl`: 11 caps, .12em, ink2, a 15 glyph on the right.
struct CardLabel: View {
    let text: String
    let glyph: String

    var body: some View {
        HStack {
            Text(text).textCase(.uppercase)
                .hType(11, .medium, Hy.ink2, tracking: 0.12)
                .lineLimit(1)
            Spacer(minLength: DesignTokens.s5)
            Image(systemName: glyph)
                .font(.system(size: 13))
                .foregroundStyle(Hy.ink2)
                .frame(width: 15, height: 15)
        }
    }
}

// MARK: - Today so far

private struct TodaySoFar: View {
    let model: TodayModel

    var body: some View {
        FoodCard(model: model).leans(0)
        SleepCard(sleep: model.today?.sleep).leans(1)
        MovesCard(rows: model.doRows, landing: model.landing).leans(2)
    }
}

private struct FoodCard: View {
    let model: TodayModel
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.foodActions) private var act
    @State private var drawn = false

    /// The meals with the sheet's edits in, so the ring recounts at once.
    private var meals: [Api.Meal] { model.mealList }
    private var kcal: Double? { model.food(\.kcal) ?? model.input?.kcal }
    private var protein: Double? { model.food(\.proteinG) ?? model.input?.proteinG }
    private var target: Double? { model.targets?.kcal }
    private var proteinTarget: Double? { model.targets?.proteinG }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(text: "Food · " + Design.plural(meals.count, "meal", "meals")
                        + (meals.isEmpty ? "" : " · tap to edit"),
                      glyph: "fork.knife")
                .contentShape(Rectangle())
                .onTapGesture { if let last = meals.last { act.edit(last.id) } }
                .accessibilityAddTraits(meals.isEmpty ? [] : .isButton)
            HStack(alignment: .center, spacing: DesignTokens.s13) {
                ring
                facts
            }
            .padding(.top, DesignTokens.s8)
        }
        .todayCard()
        .onAppear {
            // `ringin`: 1 200 ms ease after 200 ms, the first time only.
            Motion.animate(Curve.ease.animation(1.2).delay(0.2), reduce: reduce) {
                drawn = true
            }
        }
    }

    private var share: Double {
        guard let kcal, let target, target > 0 else { return 0 }
        return min(1, kcal / target)
    }

    private var ring: some View {
        ZStack {
            Circle().stroke(Hy.paper2, lineWidth: 8)
            Circle()
                .trim(from: 0, to: drawn ? share : 0)
                .stroke(Hy.life, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .motion(Curve.spring.animation(0.9), value: share)
                .opacity(share > 0 ? 1 : 0)
            VStack(spacing: 0) {
                Text(Design.number(kcal))
                    .hType(21, .semibold, Hy.ink, tracking: -0.03)
                    .contentTransition(.numericText())
                Text(target.map { "of \(Design.number($0)) kcal" } ?? "kcal")
                    .hType(11, .regular, Hy.ink3)
                if target != nil, model.targets?.estimated == true {
                    Text("estimated").hType(11, .regular, Hy.ink3)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 10)
        }
        .padding(4)
        .frame(width: 96, height: 96)
        // A long press on the ring opens the targets form.
        .contentShape(Circle())
        .onLongPressGesture { act.targets() }
        .accessibilityAction(named: "Set targets") { act.targets() }
    }

    private var facts: some View {
        VStack(alignment: .leading, spacing: 0) {
            if target == nil {
                Button(action: act.targets) {
                    Label("Set a target", systemImage: "plus")
                        .hType(13, .semibold, Hy.cream)
                        .padding(.vertical, DesignTokens.s5)
                        .padding(.horizontal, DesignTokens.s13)
                        .background(Capsule().fill(Hy.plum))
                }
                .buttonStyle(.plain)
            }
            if let target, let kcal {
                Text(kcal <= target ? "Left today" : "Over today")
                    .hType(11, .regular, Hy.ink2)
                (Text(Design.number(abs(target - kcal)))
                    .font(.grotesk(17, .semibold))
                    + Text(" kcal").font(.grotesk(11)).foregroundColor(Hy.ink3))
                    .foregroundStyle(Hy.ink)
            }
            if let proteinTarget {
                Text("Protein \(Design.number((protein ?? 0).rounded())) of \(Design.number(proteinTarget)) g")
                    .hType(11, .regular, Hy.ink2)
                    .padding(.top, DesignTokens.s5)
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Hy.paper2
                        Hy.life.frame(width: g.size.width * min(1, (protein ?? 0) / max(1, proteinTarget)))
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                }
                .frame(height: 5)
                .padding(.top, 3)
                .motion(Curve.spring.animation(0.6), value: protein)
            }
            if !meals.isEmpty {
                HStack(spacing: DesignTokens.s5) {
                    ForEach(meals.suffix(3)) { meal in
                        Button { act.edit(meal.id) } label: { MealThumb(meal: meal) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.top, DesignTokens.s8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// `.thumbs button`: 42, radius 13, a 2 card ring, the kcal over a shade.
/// A tap opens the meal sheet.
private struct MealThumb: View {
    let meal: Api.Meal

    private var url: URL? { meal.photoURL }

    var body: some View {
        ZStack(alignment: .bottom) {
            Hy.paper2
            if let url {
                // Pinned to the tile: a filled photo is wider than it, and the
                // stack would grow and push the kcal out of the clip.
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { plate }
                    .frame(width: 42, height: 42)
            } else {
                plate
            }
            Text(Design.number(meal.totals.kcal))
                .font(.grotesk(9, .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .background(LinearGradient(colors: [.clear, .black.opacity(0.55)],
                                           startPoint: .top, endPoint: .bottom))
        }
        .frame(width: 42, height: 42)
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous)
            .fill(Hy.card).padding(-2))
        .accessibilityElement()
        .accessibilityLabel("\(meal.label), \(Design.amount(meal.totals.kcal, "kcal"))")
    }

    private var plate: some View {
        Image(systemName: "fork.knife")
            .font(.system(size: 13))
            .foregroundStyle(Hy.ink3)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, 8)
    }
}

private struct SleepCard: View {
    let sleep: Api.Today.Sleep?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(text: "Sleep · last night", glyph: "moon")
            Text(sleep?.hours.map(Self.hours) ?? "—")
                .hType(34, .semibold, Hy.ink, tracking: -0.04)
                .padding(.top, DesignTokens.s13)
            if sleep?.hours == nil {
                Text("Nothing synced for last night")
                    .hType(13, .regular, Hy.ink2)
                    .padding(.top, DesignTokens.s5)
            }
            if let stages = sleep?.stages, !stages.isEmpty {
                Hypnogram(stages: stages)
                    .frame(height: 34)
                    .padding(.top, DesignTokens.s13)
                HStack {
                    Text(sleep?.bed ?? "")
                    Spacer()
                    Text(sleep?.wake ?? "")
                }
                .hType(11, .regular, Hy.ink2)
                .padding(.top, DesignTokens.s5)
            }
        }
        .todayCard()
    }

    /// 6.75 → "6h 45".
    static func hours(_ h: Double) -> String {
        let minutes = Int((h * 60).rounded())
        return "\(minutes / 60)h \(String(format: "%02d", minutes % 60))"
    }
}

/// `.hyp`: one bar per stage, deeper lower and darker, in the genes colour.
private struct Hypnogram: View {
    let stages: [Api.Today.Sleep.Stage]

    private static let level = ["awake": 0, "rem": 1, "core": 2, "deep": 3]
    private static let iso = ISO8601DateFormatter()

    var body: some View {
        Canvas { ctx, size in
            let spans = stages.compactMap { s -> (Date, Date, Int)? in
                guard let a = Self.iso.date(from: s.start), let b = Self.iso.date(from: s.end)
                else { return nil }
                return (a, b, Self.level[s.stage] ?? 0)
            }
            guard let t0 = spans.map(\.0).min(), let t1 = spans.map(\.1).max(),
                  t1 > t0 else { return }
            let scale = size.width / t1.timeIntervalSince(t0)
            for (a, b, lv) in spans {
                let x = a.timeIntervalSince(t0) * scale
                let w = max(1, b.timeIntervalSince(a) * scale - 1)
                let y = CGFloat(lv) * 8
                ctx.fill(Path(roundedRect: CGRect(x: x, y: y, width: w, height: size.height - y),
                              cornerRadius: 2),
                         with: .color(Hy.gene.opacity(0.35 + Double(3 - lv) * 0.2)))
            }
        }
    }
}

private struct MovesCard: View {
    let rows: [Api.PlanDay.Row]
    /// The last settle: its row lands (`.mlist div.land`).
    var landing: Landing?
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(text: "Moves · \(rows.filter(\.done).count) of \(rows.count) done",
                      glyph: "checkmark")
            VStack(alignment: .leading, spacing: DesignTokens.s5) {
                if rows.isEmpty {
                    Text("Nothing planned today").hType(13, .regular, Hy.ink3)
                }
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: DesignTokens.s8) {
                        Circle()
                            .strokeBorder(row.done ? Hy.green : Hy.paper3, lineWidth: 2)
                            .background(Circle().fill(row.done ? Hy.green : .clear))
                            .frame(width: 13, height: 13)
                        Text(row.title).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .hType(13, .regular, row.done ? Hy.ink : Hy.ink3)
                    .modifier(Lands(n: landing?.row != nil && landing?.row == row.itemId
                                    ? landing?.n ?? 0 : 0, reduce: reduce))
                }
            }
            .padding(.top, DesignTokens.s8)
        }
        .todayCard()
    }
}

/// `@keyframes land`: 700 ms spring from `y −13, scale 1.08` on green-soft.
private struct Lands: ViewModifier {
    let n: Int
    let reduce: Bool

    func body(content: Content) -> some View {
        content.keyframeAnimator(initialValue: 0.0, trigger: reduce ? 0 : n) { row, k in
            row.background(RoundedRectangle(cornerRadius: 5).fill(Hy.greenSoft.opacity(k))
                    .padding(-3))
                .scaleEffect(1 + 0.08 * k)
                .offset(y: -13 * k)
        } keyframes: { _ in
            KeyframeTrack {
                MoveKeyframe(1)
                CubicKeyframe(0, duration: 0.7)
            }
        }
    }
}

// MARK: - Where it's heading

extension Heading {
    /// One card per projected goal, the open one wider.
    struct Cards: View {
        let goals: [Api.Today.Goal]
        let model: TodayModel
        @State private var open: String?

        var body: some View {
            ForEach(Array(goals.enumerated()), id: \.element.id) { i, goal in
                if let p = goal.projection {
                    ProjectionCard(goal: goal, projection: p, today: model.day,
                                   maxChange: model.today?.score?.maxChange[goal.code],
                                   open: open == goal.code) {
                        open = open == goal.code ? nil : goal.code
                    }
                    .leans(i)
                }
            }
        }
    }
}

/// Internal: Blood's heading shelf draws it too.
struct ProjectionCard: View {
    let goal: Api.Today.Goal
    let projection: Api.Today.Goal.Projection
    let today: String
    let maxChange: Double?
    let open: Bool
    let toggle: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var off: Set<String> = []

    private var p: Api.Today.Goal.Projection { projection }
    private var land: Double { Heading.landing(p, off: off, maxChange: maxChange) }
    private var moved: Bool { abs(land - p.from) >= 0.05 }
    private var width: CGFloat { open ? 332 : 282 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(label).textCase(.uppercase)
                    .hType(11, .medium, Hy.ink2, tracking: 0.12)
                    .lineLimit(1)
                Spacer(minLength: DesignTokens.s5)
                tag
            }
            HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
                (Text(Design.number(p.from.rounded()))
                    + (moved ? Text(" → ") + Text(Design.number(land.rounded()))
                        .foregroundColor(Hy.blood) : Text("")))
                    .hType(34, .semibold, Hy.ink, tracking: -0.04)
                    .contentTransition(.numericText())
                Text(goal.unit ?? "").hType(11, .regular, Hy.ink2)
            }
            .padding(.top, DesignTokens.s8)
            ProjectionChart(chart: ProjectionChart.Series(goal: goal, today: today),
                            land: land, height: open ? 144 : 55, big: open)
                .frame(height: open ? 144 : 55)
                .padding(.top, DesignTokens.s8)
                .motion(Curve.spring.animation(0.7), value: land)
            sentence
                .hType(13, .regular, Hy.ink)
                .lineSpacing(13 * 0.35 - 3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, DesignTokens.s8)
            if open {
                more.transition(.opacity.combined(with: .offset(y: 8))
                    .animation(Motion.animation(Curve.ease.animation(0.42).delay(0.12),
                                                reduce: reduce)))
            }
        }
        .todayCard(width: width)
        .contentShape(Rectangle())
        .onTapGesture { if !open { grow() } }
        .accessibilityAddTraits(open ? [] : .isButton)
    }

    private func grow() {
        Motion.animate(Curve.spring.animation(0.56), reduce: reduce, toggle)
    }

    private var label: String {
        let draw = p.retestAt.flatMap(DayGrid.date).map { " · next draw \(DayGrid.short($0))" }
        return goal.name + (draw ?? "")
    }

    @ViewBuilder
    private var tag: some View {
        let t: (word: String, ink: Color, soft: Color)? = switch goal.word {
        case "off": ("Off", Hy.rose, Hy.roseSoft)
        case "borderline": ("Borderline", Hy.amber, Hy.amberSoft)
        case "optimal": ("Optimal", Hy.green, Hy.greenSoft)
        default: nil
        }
        if let t {
            Text(t.word).hType(11, .semibold, t.ink, tracking: 0.02)
                .padding(.vertical, 2).padding(.horizontal, DesignTokens.s8)
                .background(Capsule().fill(t.soft))
        }
    }

    private var weeks: String { Design.number(p.horizonWeeks) }

    private var sentence: Text {
        if moved {
            return Text("Keep this \(weeks) weeks and ")
                + Text("\(goal.name) lands near \(Design.number(land.rounded()))")
                    .font(.grotesk(13, .semibold)).foregroundColor(Hy.blood)
                + Text(", from \(Design.number(p.from.rounded())).")
        }
        let first = p.history.first?.value ?? p.from
        return Text("Nothing on today's list moves \(goal.name). It went \(Design.number(first.rounded())) → \(Design.number(p.from.rounded())).")
    }

    private var more: some View {
        VStack(alignment: .leading, spacing: 0) {
            if p.levers.isEmpty {
                Text("No lever on today's list moves this yet.")
                    .hType(11, .regular, Hy.ink2).padding(.top, DesignTokens.s13)
            } else {
                Flow(spacing: DesignTokens.s5) {
                    ForEach(p.levers) { lever in
                        let on = !off.contains(lever.name)
                        Button {
                            Motion.animate(Curve.ease.animation(0.3), reduce: reduce) {
                                if on { off.insert(lever.name) } else { off.remove(lever.name) }
                            }
                        } label: {
                            Text("\(lever.name) \(lever.delta < 0 ? "−" : "+")\(Design.number(abs(lever.delta)))")
                                .hType(13, .regular, on ? Hy.cream : Hy.ink3)
                                .padding(.vertical, DesignTokens.s5)
                                .padding(.horizontal, DesignTokens.s13)
                                .background(Capsule().fill(on ? Hy.plum : .clear))
                                .overlay(Capsule().strokeBorder(on ? Hy.plum : Hy.paper3,
                                                                lineWidth: 1.5))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                .padding(.top, DesignTokens.s13)
                Text("Each lever is kept \(weeks) weeks at today's rate. Tap to drop one and watch the landing move.")
                    .hType(11, .regular, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, DesignTokens.s8)
            }
            Button("Close", action: grow)
                .textCase(.uppercase)
                .hType(11, .regular, Hy.ink2, tracking: 0.1)
                .buttonStyle(.plain)
                .padding(.top, DesignTokens.s8)
        }
    }
}

/// The chart: the readings, today, the dotted way to the landing. The
/// reference's scale: `lo = min − (big ? 13 : 5)`, `hi = max + (big ? 8 : 3)`,
/// `X(d) = 5 + d / maxD × (W − 13)`, `Y(v) = 5 + (hi − v) / (hi − lo) × (H − (big ? 21 : 10))`.
struct ProjectionChart: View, Animatable {
    struct Series: Equatable {
        /// Days from the first reading, and the value.
        var past: [(d: Double, v: Double)]
        var today: Double
        var landDay: Double
        var aimLow: Double?
        var aimHigh: Double?
        var labels: (first: String, now: String, land: String)

        static func == (a: Series, b: Series) -> Bool {
            a.past.map(\.d) == b.past.map(\.d) && a.past.map(\.v) == b.past.map(\.v)
                && a.today == b.today && a.landDay == b.landDay
        }

        init(goal: Api.Today.Goal, today: String) {
            let p = goal.projection!
            let dated = (p.history.map { ($0.date, $0.value) } + [(p.fromDate, p.from)])
                .compactMap { d, v in DayGrid.date(d).map { ($0, v) } }
            let t0 = dated.first?.0 ?? Date()
            func days(_ d: Date) -> Double { d.timeIntervalSince(t0) / 86_400 }
            let from = DayGrid.date(p.fromDate) ?? t0
            let landing = DayGrid.adding(Int(p.horizonWeeks * 7), to: from)
            past = dated.map { (days($0.0), $0.1) }
            self.today = DayGrid.date(today).map(days) ?? days(from)
            landDay = days(landing)
            aimLow = goal.target.low
            aimHigh = goal.target.high
            labels = (DayGrid.short(t0),
                      p.history.last.flatMap { DayGrid.date($0.date) }.map(DayGrid.short) ?? "",
                      DayGrid.short(landing))
        }
    }

    let chart: Series
    var land: Double
    var height: CGFloat
    let big: Bool

    var animatableData: AnimatablePair<Double, CGFloat> {
        get { AnimatablePair(land, height) }
        set { land = newValue.first; height = newValue.second }
    }

    var body: some View {
        Canvas { ctx, size in draw(&ctx, CGSize(width: size.width, height: height)) }
            .accessibilityHidden(true)
    }

    private func draw(_ ctx: inout GraphicsContext, _ size: CGSize) {
        let W = size.width, H = size.height
        guard let first = chart.past.first, let now = chart.past.last else { return }
        let aim = [chart.aimLow, chart.aimHigh].compactMap { $0 }
        let vals = chart.past.map(\.v) + [land] + aim
        let lo = (vals.min() ?? 0) - (big ? 13 : 5)
        let hi = (vals.max() ?? 1) + (big ? 8 : 3)
        let maxD = max(1, chart.landDay)
        func X(_ d: Double) -> CGFloat { 5 + d / maxD * (W - 13) }
        func Y(_ v: Double) -> CGFloat { 5 + (hi - v) / max(0.001, hi - lo) * (H - (big ? 21 : 10)) }

        // The aim band: under the high edge, over the low one.
        let top = chart.aimHigh.map(Y) ?? Y(hi)
        let bottom = chart.aimLow.map(Y) ?? Y(lo)
        if !aim.isEmpty {
            ctx.fill(Path(CGRect(x: 0, y: top, width: W, height: max(0, bottom - top))),
                     with: .color(Hy.greenSoft))
        }
        let tx = X(chart.today)
        ctx.stroke(Path { $0.move(to: CGPoint(x: tx, y: 0)); $0.addLine(to: CGPoint(x: tx, y: H - (big ? 16 : 5))) },
                   with: .color(Hy.paper3), lineWidth: 1)

        var past = Path()
        for (i, pt) in chart.past.enumerated() {
            let p = CGPoint(x: X(pt.d), y: Y(pt.v))
            i == 0 ? past.move(to: p) : past.addLine(to: p)
        }
        ctx.stroke(past, with: .color(Hy.ink), lineWidth: 2)

        let moved = abs(land - now.v) >= 0.05
        let colour = moved ? Hy.blood : Hy.ink3
        let a = CGPoint(x: X(now.d), y: Y(now.v))
        let b = CGPoint(x: X(chart.landDay), y: Y(land))
        let future = Path {
            $0.move(to: a)
            $0.addQuadCurve(to: b, control: CGPoint(x: a.x + (b.x - a.x) * 0.57, y: b.y))
        }
        ctx.stroke(future, with: .color(colour),
                   style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [0.1, 6]))

        func dot(_ c: CGPoint, _ r: CGFloat) -> Path {
            Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
        }
        ctx.fill(dot(CGPoint(x: X(first.d), y: Y(first.v)), 3), with: .color(Hy.ink))
        ctx.fill(dot(a, 3.5), with: .color(Hy.ink))
        let landDot = dot(b, big ? 6 : 4.5)
        ctx.fill(landDot, with: .color(Hy.card))
        ctx.stroke(landDot, with: .color(colour), lineWidth: 2.5)

        guard big else { return }
        func label(_ s: String, _ at: CGPoint, _ anchor: UnitPoint, _ c: Color = Hy.ink2) {
            ctx.draw(Text(s).font(.grotesk(10, .medium)).foregroundColor(c), at: at, anchor: anchor)
        }
        let base = H - 2
        label(chart.labels.first, CGPoint(x: X(first.d), y: base), .bottomLeading)
        if chart.past.count > 2 {
            let last = chart.past[chart.past.count - 2]
            label(chart.labels.now, CGPoint(x: X(last.d), y: base), .bottom)
        }
        label("today", CGPoint(x: tx + 3, y: 10), .bottomLeading)
        label(chart.labels.land, CGPoint(x: X(chart.landDay), y: base), .bottomTrailing)
        label(Design.number(first.v.rounded()), CGPoint(x: X(first.d) + 8, y: Y(first.v) + 4), .bottomLeading)
        label(Design.number(now.v.rounded()), CGPoint(x: a.x, y: a.y - 8), .bottom)
        if let high = chart.aimHigh, chart.aimLow == nil {
            label("aim under \(Design.number(high))", CGPoint(x: W, y: Y(high) - 4), .bottomTrailing, Hy.green)
        } else if let low = chart.aimLow {
            label("aim over \(Design.number(low))", CGPoint(x: W, y: Y(low) + 12), .bottomTrailing, Hy.green)
        }
    }
}
