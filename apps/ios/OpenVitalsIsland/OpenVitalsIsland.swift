import ActivityKit
import SwiftUI
import WidgetKit

// Phase 37 task C4: the island outside the app. The plate read as a Live
// Activity, started, updated and ended by `CaptureRun` in the app.
// `PlateActivityAttributes` comes from `OpenVitals/PlateActivity.swift`,
// compiled into this target too.

@main
struct OpenVitalsIslandBundle: WidgetBundle {
    var body: some Widget {
        PlateLiveActivity()
    }
}

/// Plum and lime on black, the island's own colours.
private enum Ink {
    static let plum = Color(red: 0x2b / 255, green: 0x10 / 255, blue: 0x33 / 255)
    static let lime = Color(red: 0xd6 / 255, green: 0xf3 / 255, blue: 0x4a / 255)
    static let sub = Color(red: 0xae / 255, green: 0xae / 255, blue: 0xb2 / 255)
}

private typealias PlateState = PlateActivityAttributes.ContentState

private extension PlateState {
    /// The compact trailing slot: the percent while reading, the kcal after.
    var trail: String {
        switch phase {
        case .reading: return "\(Int((progress * 100).rounded()))%"
        case .done: return sub.components(separatedBy: " · ").first ?? ""
        case .failed: return "!"
        }
    }
}

struct PlateLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PlateActivityAttributes.self) { context in
            Banner(state: context.state)
                .activityBackgroundTint(.black)
                .activitySystemActionForegroundColor(Ink.lime)
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Glyph(size: 34)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(state.trail)
                        .font(.system(size: 15, weight: .bold).monospacedDigit())
                        .foregroundStyle(Ink.lime)
                }
                DynamicIslandExpandedRegion(.center) {
                    Words(state: state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Bar(progress: state.progress)
                }
            } compactLeading: {
                Image(systemName: "fork.knife")
                    .foregroundStyle(Ink.lime)
            } compactTrailing: {
                Text(state.trail)
                    .font(.system(size: 13, weight: .bold).monospacedDigit())
                    .foregroundStyle(Ink.lime)
            } minimal: {
                Ring(progress: state.progress)
            }
            .keylineTint(Ink.lime)
        }
    }
}

/// The Lock Screen: the glyph, the words, the bar.
private struct Banner: View {
    let state: PlateState

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 13) {
                Glyph(size: 44)
                Words(state: state)
                Spacer(minLength: 0)
                Text(state.trail)
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                    .foregroundStyle(Ink.lime)
            }
            Bar(progress: state.progress)
        }
        .padding(.vertical, 13)
        .padding(.horizontal, 21)
    }
}

private struct Glyph: View {
    let size: CGFloat

    var body: some View {
        Image(systemName: "fork.knife")
            .font(.system(size: size * 0.4, weight: .semibold))
            .foregroundStyle(Ink.lime)
            .frame(width: size, height: size)
            .background(Ink.plum, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

private struct Words: View {
    let state: PlateState

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(state.title)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
            Text(state.sub)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Ink.sub)
        }
        .lineLimit(1)
    }
}

/// 5 tall, plum track, lime fill.
private struct Bar: View {
    let progress: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Ink.plum)
                Capsule().fill(Ink.lime).frame(width: g.size.width * progress)
            }
        }
        .frame(height: 5)
    }
}

/// The minimal slot: the progress as a ring.
private struct Ring: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle().stroke(Ink.plum, lineWidth: 3)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(Ink.lime, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .padding(2)
    }
}
