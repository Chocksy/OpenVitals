import PhotosUI
import SwiftUI
import UIKit

/// Meals. One card a meal, the items behind a disclosure, and "est." on every
/// number that came off a photograph. A meal logged in Health carries no
/// "est.", because a barcode or a weighed entry is not a guess.
///
/// Phase 38 D3: in the Hybrid look, opened from Body's "Every meal" card.
struct MealsView: View {
    /// Set when Meals is opened from Body, which is where it lives: the tab
    /// bar is Home · Body · Blood · Plan and Meals is a shelf on Body.
    var close: (() -> Void)?
    @State private var day: Api.MealDay?
    @State private var error = ""
    @State private var pick: PhotosPickerItem?
    @State private var busy = false

    var body: some View {
        HyScreen(refresh: { await load() }) {
            HyHeader(title: "Meals",
                     value: day?.totals.kcal.map { Design.number($0) },
                     word: day?.totals.kcal == nil ? nil : "kcal" + (day?.totals.mark ?? ""),
                     line: day.map(meta)) {
                if let close {
                    Button(action: close) {
                        Image(systemName: "xmark")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Hy.cream)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Hy.plum2))
                    }
                    .buttonStyle(Pressed(scale: 0.92))
                    .accessibilityLabel("Close")
                }
            }
        } content: {
            if let day {
                if day.meals.isEmpty {
                    Text("No meals yet today. A photo below, or the + on any tab.")
                        .hType(13, .regular, Hy.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                        .hyCard()
                }
                VStack(spacing: DesignTokens.s13) {
                    ForEach(day.meals) { meal in MealCard(meal: meal) }
                }
                Text("A meal from Apple Health carries no “est.”, because a "
                     + "barcode or a weighed entry is not a guess. A meal from "
                     + "a photo always carries it.")
                    .hType(11, .regular, Hy.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, DesignTokens.s21)
                    .padding(.top, DesignTokens.s13)
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

            PhotosPicker(selection: $pick, matching: .images) {
                Label(busy ? "Reading…" : "Add a meal from a photo", systemImage: "camera")
                    .hType(15, .semibold, Hy.plum)
                    .frame(maxWidth: .infinity, minHeight: 55)
                    .background(Capsule().fill(Hy.lime))
            }
            .buttonStyle(Pressed(scale: 0.96))
            .disabled(busy)
            .padding(.horizontal, DesignTokens.s21)
            .padding(.top, DesignTokens.s21)
        }
        .task { await load() }
        .onChange(of: pick) { _, item in Task { await add(item) } }
    }

    private func meta(_ day: Api.MealDay) -> String {
        "\(Design.plural(day.meals.count, "meal", "meals")) · "
            + "\(Design.number(day.fromPhoto)) from a photo"
    }

    private func load() async {
        do {
            day = try await Api.meals()
            error = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func add(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        busy = true
        defer { busy = false; pick = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.8)
        else {
            error = "That photo could not be read."
            return
        }
        do {
            _ = try await Api.postMeal(photo: jpeg, day: Api.localDay())
            await load()
            NotificationCenter.default.post(name: .ovCaptured, object: nil)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The meal itself: the photo, the label, the four macros, the items, and what
/// it moved. Nothing on it is totalled by the phone.
struct MealCard: View {
    let meal: Api.Meal
    @State private var open = false
    @Environment(\.accessibilityReduceMotion) private var reduce

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MealPhoto(meal: meal, height: 144)
            // The label, then where and when, then the "est." every photo
            // number carries.
            Text(meal.label)
                .hType(17, .semibold, Hy.ink, tracking: -0.02)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, DesignTokens.s13)
            Text(meal.basis).hType(11, .regular, Hy.ink3)
                .padding(.top, 2)
            macros.padding(.top, DesignTokens.s13)
            Text("\(Design.plural(meal.items.count, "item", "items")) · "
                 + (meal.totals.estimated ? "not a scale" : "logged, not guessed"))
                .hType(11, .regular, Hy.ink3)
                .padding(.top, DesignTokens.s8)

            Button {
                Motion.animate(Curve.ease.animation(0.32), reduce: reduce) { open.toggle() }
            } label: {
                HStack(spacing: DesignTokens.s5) {
                    Text(open ? "Hide the items" : "What was on the plate")
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
                .hType(13, .medium, Hy.ink2)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, DesignTokens.s5)
            if open {
                VStack(spacing: 0) {
                    ForEach(Array(meal.items.enumerated()), id: \.element.id) { i, item in
                        if i > 0 { Hy.line.frame(height: 1) }
                        MealItemRow(item: item).padding(.vertical, DesignTokens.s8)
                    }
                }
                .transition(.opacity)
            }

            if !meal.moves.isEmpty {
                VStack(alignment: .leading, spacing: DesignTokens.s5) {
                    Text("What it moves").hType(13, .semibold)
                    ForEach(meal.moves) { move in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(move.what).hType(13, .regular)
                            Text(move.line).hType(11, .regular, Hy.ink3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.top, DesignTokens.s13)
            }
        }
        .hyCard()
    }

    private var macros: some View {
        HStack(alignment: .top, spacing: DesignTokens.s13) {
            figure(Design.number(meal.totals.kcal), "kcal")
            figure(Design.amount(meal.totals.proteinG, "g"), "protein")
            figure(Design.amount(meal.totals.carbsG, "g"), "carbs")
            figure(Design.amount(meal.totals.fatG, "g"), "fat")
        }
    }

    /// One number and the word that names it, "est." on a guess.
    private func figure(_ value: String, _ name: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).hType(17, .semibold, Hy.ink, tracking: -0.02)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(name + meal.totals.mark).hType(11, .regular, Hy.ink3)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// One number and the word that names it. Never a number on its own.
struct Macro: View {
    let value: String
    let name: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .ovType(.md, mono: true, leading: 1.1)
                .foregroundStyle(Design.ink)
            Text(name)
                .ovType(.xs)
                .foregroundStyle(Design.ink3)
        }
        .frame(minWidth: 62, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct MealItemRow: View {
    let item: Api.MealItem

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: DesignTokens.s8) {
            Text(item.name).hType(13, .regular)
            Spacer(minLength: DesignTokens.s5)
            Text(item.portion).hType(11, .regular, Hy.ink3)
            Text(Design.amount(item.kcal, "kcal\(item.estimated ? " est." : "")"))
                .hType(11, .medium, Hy.ink2)
        }
    }
}

/// The photograph, or the plate the design system draws when there is none.
struct MealShot: View {
    let url: String?

    var body: some View {
        ZStack {
            // `.meal .shot { background: var(--canvas-deep) }`
            RoundedRectangle(cornerRadius: Design.rInner, style: .continuous)
                .fill(Design.canvasDeep)
            RoundedRectangle(cornerRadius: Design.rInner, style: .continuous)
                .strokeBorder(Design.hair, lineWidth: 1)
            if let url, let full = full(url) {
                AsyncImage(url: full) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    plate
                }
                .clipShape(RoundedRectangle(cornerRadius: Design.rInner,
                                            style: .continuous))
            } else {
                plate
            }
        }
        .frame(width: 89, height: 89)
        .accessibilityHidden(true)
    }

    private var plate: some View {
        ZStack {
            Circle().strokeBorder(Design.hair, lineWidth: 1).padding(8)
            Circle().strokeBorder(Design.hair, lineWidth: 1).padding(18)
        }
    }

    private func full(_ path: String) -> URL? {
        path.hasPrefix("http") ? URL(string: path)
            : URL(string: path, relativeTo: Api.baseURL)
    }
}

#if DEBUG
#Preview("Meals") {
    MealsView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
