/// Three tabs, nothing more.
///
/// The phone is the capture organ; the web app stays the viewing organ. So the
/// app itself is: the site in a webview, a camera that talks to `/api/capture`,
/// and a HealthKit pump that talks to `/api/sync/healthkit`.
import SwiftUI

@main
struct OpenVitalsApp: App {
    @StateObject private var health = HealthSyncModel.shared
    /// The app reopens on the tab you left it on. It is a `UserDefaults` key,
    /// so `simctl launch booted com.chocksy.OpenVitals -tab 2` opens Sync.
    @AppStorage("tab") private var tab = 0

    var body: some Scene {
        WindowGroup {
            TabView(selection: $tab) {
                TodayView()
                    .tabItem { Label("Today", systemImage: "house") }
                    .tag(0)
                CaptureView()
                    .tabItem { Label("Capture", systemImage: "camera") }
                    .tag(1)
                SyncView()
                    .tabItem { Label("Sync", systemImage: "arrow.triangle.2.circlepath") }
                    .tag(2)
            }
            .task {
                // Observers and background delivery are registered every launch;
                // HealthKit ignores a repeat. Nothing is read until the person
                // has granted something, and a denied type simply stays empty.
                health.enableBackgroundDelivery()
                health.startObservers()
            }
        }
    }
}
