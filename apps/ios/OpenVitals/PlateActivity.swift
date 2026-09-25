import ActivityKit
import Foundation

/// The plate read as a Live Activity: the island outside the app (spec,
/// "The Dynamic Island has two halves"). Compiled into the app and into the
/// `OpenVitalsIsland` extension: the extension picks this one file out of the
/// `OpenVitals` folder through a membership exception in `project.pbxproj`,
/// so both sides share one type and ActivityKit can match them.
struct PlateActivityAttributes: ActivityAttributes {

    struct ContentState: Codable, Hashable {
        enum Phase: String, Codable, Hashable {
            case reading, done, failed
        }

        var phase: Phase
        /// 0…1, the island's curve against the expected read.
        var progress: Double
        /// "Reading your plate…", then the meal's label.
        var title: String
        /// "looking", then `"<kcal> kcal · <protein> g protein"`.
        var sub: String
    }
}
