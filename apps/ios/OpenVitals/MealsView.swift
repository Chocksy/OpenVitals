import PhotosUI
import SwiftUI
import UIKit

/// Meals. One card a meal, the items behind a disclosure, and "est." on every
/// number that came off a photograph. A meal logged in Health carries no
/// "est.", because a barcode or a weighed entry is not a guess.
struct MealsView: View {
    /// Set when Meals is opened from Body, which is where it lives now: the
    /// tab bar is Today · Blood · + · Body · Plan and Meals is a section.
    var close: (() -> Void)?
    @State private var day: Api.MealDay?
    @State private var error = ""
    @State private var pick: PhotosPickerItem?
    @State private var busy = false

    var body: some View {
        Screen(title: "Meals", icon: close == nil ? nil : "xmark",
               iconLabel: "Close", action: close,
               refresh: { await load() }) {
            if let day {
                ForEach(day.meals) { meal in
                    MealCard(meal: meal)
                }
                Panel(title: "Today", meta: meta(day)) {
                    VStack(spacing: 0) {
                        ForEach(Array(day.meals.enumerated()), id: \.element.id) { i, meal in
                            if i > 0 { Hair().padding(.vertical, Design.s8) }
                            MealSummaryRow(meal: meal)
                        }
                        if !day.meals.isEmpty {
                            Hair().padding(.vertical, Design.s8)
                            HStack {
                                Text("All of it")
                                    .ovType(.sm, weight: .medium)
                                    .foregroundStyle(Design.ink)
                                Spacer()
                                Text(Design.amount(day.totals.kcal,
                                                   "kcal" + day.totals.mark))
                                    .ovType(.sm, mono: true)
                                    .foregroundStyle(Design.ink)
                            }
                        }
                    }
                }
                Caption("A meal from Apple Health carries no “est.”, because a "
                        + "barcode or a weighed entry is not a guess. A meal from "
                        + "a photo always carries it.")
            } else if error.isEmpty {
                Panel { Text("Asking the server…").ovType(.sm).foregroundStyle(Design.ink3) }
            } else {
                Panel(title: "Nothing to show") {
                    Text(error).ovType(.sm).foregroundStyle(Design.ink2)
                }
            }

            PhotosPicker(selection: $pick, matching: .images) {
                Label(busy ? "Reading…" : "Add a meal from a photo",
                      systemImage: "camera")
            }
            .ovType(.sm, weight: .medium)
            .foregroundStyle(Design.ink)
            .padding(.horizontal, Design.s13)
            .padding(.vertical, Design.s8 + 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Design.surfaceHi)
            .clipShape(RoundedRectangle(cornerRadius: Design.rInner, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Design.rInner, style: .continuous)
                .strokeBorder(Design.hair, lineWidth: 1))
            .disabled(busy)
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

    var body: some View {
        // `.meal` on the phone: one column, the shot full width at 144 px,
        // then the head, the macros and the note.
        Panel {
            // `.meal { grid-template-columns: 89px minmax(0,1fr); gap: 13 }`
            HStack(alignment: .top, spacing: DesignTokens.s13) {
                MealShot(url: meal.photo)
                VStack(alignment: .leading, spacing: 0) {
                    // `.mhead` — the label, then the time in mono, then the
                    // "est." that every photo number carries.
                    HStack(alignment: .firstTextBaseline,
                           spacing: DesignTokens.s8) {
                        Text(meal.label)
                            .ovType(.md)
                            .foregroundStyle(Design.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(meal.basis)
                            .ovType(.xs, mono: true)
                            .foregroundStyle(Design.ink3)
                        Spacer(minLength: 0)
                    }
                    macros.padding(.top, DesignTokens.s8)
                    Text("\(Design.plural(meal.items.count, "item", "items")) · "
                         + (meal.totals.estimated ? "not a scale"
                            : "logged, not guessed"))
                        .ovType(.xs)
                        .foregroundStyle(Design.ink3)
                        .padding(.top, DesignTokens.s8)
                }

                DisclosureGroup(isExpanded: $open) {
                    VStack(spacing: 0) {
                        ForEach(Array(meal.items.enumerated()),
                                id: \.element.id) { i, item in
                            MealItemRow(item: item)
                                .padding(.vertical, DesignTokens.s5)
                            if i < meal.items.count - 1 { Hair() }
                        }
                    }
                    .padding(.top, DesignTokens.s8)
                } label: {
                    Text(open ? "Hide the items" : "What was on the plate")
                        .ovType(.xs)
                        .foregroundStyle(Design.ink2)
                }
                .tint(Design.ink2)

                if !meal.moves.isEmpty {
                    VStack(alignment: .leading, spacing: DesignTokens.s5) {
                        Text("What it moves")
                            .ovType(.sm, weight: .medium)
                            .foregroundStyle(Design.ink)
                        ForEach(meal.moves) { move in
                            VStack(alignment: .leading, spacing: 1) {
                                Text(move.what)
                                    .ovType(.sm)
                                    .foregroundStyle(Design.ink)
                                Text(move.line)
                                    .ovType(.xs)
                                    .foregroundStyle(Design.ink3)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
        }
    }

    private var macros: some View {
        Flow(spacing: Design.s13) {
            Macro(value: Design.number(meal.totals.kcal),
                  name: "kcal" + meal.totals.mark)
            Macro(value: Design.amount(meal.totals.proteinG, "g"),
                  name: "protein" + meal.totals.mark)
            Macro(value: Design.amount(meal.totals.carbsG, "g"),
                  name: "carbs" + meal.totals.mark)
            Macro(value: Design.amount(meal.totals.fatG, "g"),
                  name: "fat" + meal.totals.mark)
        }
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
        HStack(alignment: .firstTextBaseline, spacing: Design.s8) {
            Text(item.name)
                .ovType(.xs)
                .foregroundStyle(Design.ink)
            Spacer(minLength: Design.s5)
            Text(item.portion)
                .ovType(.xs)
                .foregroundStyle(Design.ink3)
            Text(Design.amount(item.kcal,
                               "kcal\(item.estimated ? " est." : "")"))
                .ovType(.xs, mono: true)
                .foregroundStyle(Design.ink2)
        }
    }
}

struct MealSummaryRow: View {
    let meal: Api.Meal

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Design.s8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(meal.label)
                    .ovType(.sm, weight: .medium)
                    .foregroundStyle(Design.ink)
                    .lineLimit(2)
                Text(meal.basis)
                    .ovType(.xs)
                    .foregroundStyle(Design.ink3)
            }
            Spacer(minLength: Design.s5)
            VStack(alignment: .trailing, spacing: 2) {
                Text(Design.amount(meal.totals.kcal, "kcal\(meal.totals.mark)"))
                    .ovType(.sm, mono: true)
                    .foregroundStyle(Design.ink)
                Text(meal.totals.estimated ? "estimate" : "not an estimate")
                    .ovType(.xs)
                    .foregroundStyle(meal.totals.estimated ? Design.warn : Design.ok)
            }
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
