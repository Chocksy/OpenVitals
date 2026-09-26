import SwiftUI

// Phase 39 I3 and I5: the Worth a look rows, one list shared by Today's
// shelf and the Blood tab, and the desk that answers them. The design is
// `docs/mockups/v4/ios-variations/54-casefile.html` (`.hn` rows). The glance
// button is neutral: Answer opens the chips under the row and one chip tap
// sends it. It never pre-picks an answer.

// MARK: - the desk

/// The cases the person has opened, what they answered, and the rows that
/// settled. One per screen that shows rows (Today, Blood); the calls are
/// seams so the tests run it without a server.
@Observable
@MainActor
final class HunchDesk {
    /// The full cases, by hunch id, as they load.
    var cases: [String: Api.HunchCase] = [:]
    /// A row that is done for now: "Noted", "Written down", "Seen".
    var settled: [String: String] = [:]
    /// The row whose chips are open under it.
    var chipsOpen: String?
    var busy: Set<String> = []
    var failed: [String: String] = [:]

    @ObservationIgnored
    var fetch: (String) async throws -> Api.HunchCase = { try await Api.hunch(id: $0) }
    @ObservationIgnored
    var sendAnswer: (String, String) async throws -> Api.HunchCase = {
        try await Api.answer(id: $0, chip: $1)
    }
    @ObservationIgnored
    var sendTest: (String) async throws -> Api.HunchCase = { try await Api.acceptTest(id: $0) }
    @ObservationIgnored
    var sendSeen: (String) async throws -> Void = { _ = try await Api.seen(id: $0) }

    /// The case for `id`, fetched once.
    func load(_ id: String) async {
        guard cases[id] == nil, !busy.contains(id) else { return }
        busy.insert(id)
        defer { busy.remove(id) }
        do {
            cases[id] = try await fetch(id)
            failed[id] = nil
        } catch {
            failed[id] = "Could not open this one. Pull to try again."
        }
    }

    /// Answer opens the chips; a second tap closes them. The case loads
    /// first because the chips live on it.
    func toggleChips(_ id: String) async {
        if chipsOpen == id { chipsOpen = nil; return }
        chipsOpen = id
        await load(id)
    }

    /// The bars move on the local re-weighting at once; the server's case
    /// replaces it when it answers.
    func answer(_ id: String, chip: String) async {
        if let now = cases[id] { cases[id] = now.answered(chip) }
        settled[id] = "Noted"
        chipsOpen = nil
        do { cases[id] = try await sendAnswer(id, chip) } catch {
            failed[id] = "Your answer did not reach the server."
        }
    }

    func acceptTest(_ id: String) async {
        if let now = cases[id] { cases[id] = now.written(on: Api.localDay()) }
        settled[id] = "Written down"
        do { cases[id] = try await sendTest(id) } catch {
            failed[id] = "Could not write it down. Try again."
        }
    }

    func seen(_ id: String) async {
        settled[id] = "Seen"
        do { try await sendSeen(id) } catch { settled[id] = nil }
    }
}

// MARK: - opening a case

/// What a row asks of the screen it sits on: open the case.
struct HunchActions {
    var open: (String) -> Void = { _ in }
}

private struct HunchActionsKey: EnvironmentKey {
    static let defaultValue = HunchActions()
}

extension EnvironmentValues {
    var hunchActions: HunchActions {
        get { self[HunchActionsKey.self] }
        set { self[HunchActionsKey.self] = newValue }
    }
}

// MARK: - the rows

/// Rows inside one card (54's `.hns`), a hairline between them.
struct WorthALook: View {
    let rows: [Api.HunchRow]
    let desk: HunchDesk
    /// Today's line under the rows: "5 things worth a look in your blood ›".
    var more: Int?
    var toBlood: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                if i > 0 { Rectangle().fill(Hy.line).frame(height: 1) }
                HunchRowView(row: row, desk: desk)
            }
            if let more {
                Rectangle().fill(Hy.line).frame(height: 1)
                Button(action: toBlood) {
                    HStack {
                        Text("\(Design.plural(more, "thing", "things")) worth a look in your blood")
                            .hType(13, .medium, Hy.ink2)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Hy.ink3)
                    }
                    .padding(.vertical, DesignTokens.s13)
                    .contentShape(Rectangle())
                }
                .buttonStyle(Pressed(scale: 0.98))
            }
        }
        .padding(.horizontal, DesignTokens.s13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .grained(Hy.card, radius: 21, shadow: 0.3)
        .padding(.horizontal, DesignTokens.s21)
    }
}

/// One row: the line, the number, the glance corridor and one button.
struct HunchRowView: View {
    let row: Api.HunchRow
    let desk: HunchDesk

    @Environment(\.hunchActions) private var actions
    @Environment(\.accessibilityReduceMotion) private var reduce

    private var ink: Color { HunchInk.of(row.kind) }
    private var settled: String? { desk.settled[row.id] }
    private var chips: Bool { desk.chipsOpen == row.id }

    var body: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s8) {
            Button { actions.open(row.id) } label: {
                HStack(alignment: .top, spacing: DesignTokens.s13) {
                    Text(row.line)
                        .hType(14, .semibold, Hy.ink, tracking: -0.01)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let value = row.number.value {
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(Design.digits(value))
                                .hType(21, .semibold, Hy.ink, tracking: -0.02)
                            if let unit = row.number.unit {
                                Text(unit).hType(11, .medium, Hy.ink2)
                            }
                        }
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(Pressed(scale: 0.98))
            .accessibilityHint("Opens the case")

            HStack(spacing: DesignTokens.s8) {
                Button { actions.open(row.id) } label: {
                    HStack(spacing: DesignTokens.s8) {
                        MiniCorridor(band: row.mini.band, lab: row.mini.lab, goal: row.mini.goal,
                                     last: row.mini.last, ink: ink)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Hy.ink3)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHidden(true)
                Spacer(minLength: DesignTokens.s5)
                button
            }

            if chips, settled == nil { chipRow.transition(.opacity.combined(with: .move(edge: .top))) }
        }
        .padding(.vertical, DesignTokens.s13)
        .motion(Curve.spring.animation(0.5), value: chips)
        .motion(Curve.spring.animation(0.5), value: settled)
    }

    // MARK: the one button

    @ViewBuilder
    private var button: some View {
        if let settled {
            HStack(spacing: DesignTokens.s5) {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .symbolEffect(.bounce, value: settled)
                Text(settled)
            }
            .hType(13, .semibold, Hy.green)
            .padding(.horizontal, DesignTokens.s13)
            .frame(height: 34)
            .background(Capsule().fill(Hy.greenSoft))
            .transition(.scale(scale: 0.8).combined(with: .opacity))
        } else {
            switch row.action.kind {
            case "result":
                capsule(row.action.label, fill: Hy.paper2, ink: Hy.ink2).accessibilityAddTraits(.isStaticText)
            case "answer":
                Button { Task { await desk.toggleChips(row.id) } } label: {
                    capsule(chips ? "Close" : row.action.label, fill: chips ? Hy.paper2 : Hy.plum,
                            ink: chips ? Hy.ink : Hy.cream)
                }
                .buttonStyle(Pressed(scale: 0.94))
            case "got_it":
                Button { Task { await desk.seen(row.id) } } label: {
                    capsule(row.action.label, fill: Hy.greenSoft, ink: Hy.green)
                }
                .buttonStyle(Pressed(scale: 0.94))
            default:
                Button { actions.open(row.id) } label: {
                    capsule(row.action.label, fill: Hy.plum, ink: Hy.cream)
                }
                .buttonStyle(Pressed(scale: 0.94))
            }
        }
    }

    private func capsule(_ text: String, fill: Color, ink: Color) -> some View {
        Text(text)
            .hType(13, .semibold, ink)
            .lineLimit(1)
            .padding(.horizontal, DesignTokens.s13)
            .frame(height: 34)
            .background(Capsule().fill(fill))
    }

    // MARK: the chips

    @ViewBuilder
    private var chipRow: some View {
        if let question = desk.cases[row.id]?.question {
            VStack(alignment: .leading, spacing: DesignTokens.s8) {
                Text(question.text).hType(12, .medium, Hy.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Flow(spacing: DesignTokens.s5) {
                    ForEach(question.chips) { chip in
                        Button { Task { await desk.answer(row.id, chip: chip.id) } } label: {
                            Text(chip.label)
                                .hType(12, .medium, Hy.ink)
                                .padding(.horizontal, DesignTokens.s13)
                                .padding(.vertical, 7)
                                .background(Capsule().fill(Hy.paper2))
                                .overlay(Capsule().stroke(Hy.line, lineWidth: 1))
                        }
                        .buttonStyle(Pressed(scale: 0.94))
                    }
                }
            }
        } else if desk.busy.contains(row.id) {
            ProgressView().tint(Hy.ink2)
        } else {
            Button { actions.open(row.id) } label: {
                Text(desk.failed[row.id] ?? "No question on this one yet. Open the case ›")
                    .hType(12, .medium, Hy.ink2)
            }
            .buttonStyle(.plain)
        }
    }
}
