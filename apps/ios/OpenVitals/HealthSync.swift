/// HealthKit, all we can take.
///
/// `HK` is the table and the arithmetic-free plumbing: which types we read, in
/// which unit, and how a store sample becomes an `Api.Sample`. It is a plain
/// enum of pure functions so the tests can exercise it without a live store.
/// `HealthSyncModel` is the live half: anchors, observers, background delivery.
///
/// The phone sends raw samples and no opinions. Every total, median and night
/// is computed by `lib/healthkit.ts` on the server.
import Foundation
import HealthKit

// MARK: - the table

struct HKTypeSpec: Identifiable, Hashable {
    /// The full HealthKit identifier. The server strips the prefix itself.
    let identifier: String
    let name: String
    /// The unit string the server sees. Sleep replaces it per sample with the
    /// stage name, which is where a category sample's meaning lives.
    let unit: String
    /// nil for category types, which have a value and no unit.
    let hkUnit: HKUnit?

    var id: String { identifier }
    /// The one type that is neither a quantity nor a category. Its samples are
    /// `HKWorkout`, and each one goes on the wire as two flat samples.
    var isWorkout: Bool { identifier == HK.workoutType }
    var isCategory: Bool { hkUnit == nil && !isWorkout }

    var sampleType: HKSampleType? {
        if isWorkout { return HKObjectType.workoutType() }
        if hkUnit != nil {
            return HKObjectType.quantityType(
                forIdentifier: HKQuantityTypeIdentifier(rawValue: identifier))
        }
        return HKObjectType.categoryType(
            forIdentifier: HKCategoryTypeIdentifier(rawValue: identifier))
    }

    static func == (a: HKTypeSpec, b: HKTypeSpec) -> Bool {
        a.identifier == b.identifier
    }
    func hash(into hasher: inout Hasher) { hasher.combine(identifier) }
}

enum HK {
    private static func q(_ id: String, _ name: String, _ unit: String,
                          _ hkUnit: HKUnit) -> HKTypeSpec {
        HKTypeSpec(identifier: "HKQuantityTypeIdentifier" + id, name: name,
                   unit: unit, hkUnit: hkUnit)
    }
    private static func c(_ id: String, _ name: String, _ unit: String) -> HKTypeSpec {
        HKTypeSpec(identifier: "HKCategoryTypeIdentifier" + id, name: name,
                   unit: unit, hkUnit: nil)
    }

    private static let perMinute = HKUnit.count().unitDivided(by: .minute())

    /// Built rather than parsed from a string, because `HKUnit(from:)` raises
    /// on anything it does not like and this runs at static-init time.
    private static let vo2Unit = HKUnit.literUnit(with: .milli)
        .unitDivided(by: HKUnit.gramUnit(with: .kilo)
            .unitMultiplied(by: HKUnit.minute()))

    /// Every type `lib/healthkit.ts` maps, in the same order its table lists
    /// them. The unit string is chosen so the server never has to convert:
    /// each one is either already the stored unit or a spelling `HK_UNITS`
    /// folds onto it.
    static let types: [HKTypeSpec] = [
        // activity
        q("StepCount", "Steps", "count", .count()),
        q("ActiveEnergyBurned", "Active energy", "kcal", .kilocalorie()),
        q("AppleExerciseTime", "Exercise minutes", "min", .minute()),
        c("AppleStandHour", "Stand hours", "count"),
        q("DistanceWalkingRunning", "Distance", "km", .meterUnit(with: .kilo)),
        q("FlightsClimbed", "Flights climbed", "count", .count()),
        // The workout itself: the activity name rides in `unit`, the minutes
        // in `value`, and the energy follows as a second `HKWorkoutEnergy`.
        HKTypeSpec(identifier: workoutType, name: "Workouts", unit: "",
                   hkUnit: nil),
        // heart
        q("RestingHeartRate", "Resting heart rate", "count/min", perMinute),
        q("HeartRateVariabilitySDNN", "HRV (SDNN)", "ms",
          .secondUnit(with: .milli)),
        // The catalog stores breaths/min and `lib/units.ts` knows no factor
        // from bpm to it, so sending count/min would be dropped as unmappable.
        q("RespiratoryRate", "Respiratory rate", "breaths/min", perMinute),
        q("OxygenSaturation", "Blood oxygen", "%", .percent()),
        q("WalkingHeartRateAverage", "Walking heart rate average", "count/min",
          perMinute),
        q("HeartRateRecoveryOneMinute", "Heart rate recovery, one minute",
          "count/min", perMinute),
        // sleep: the stage goes in `unit`, the minutes come from start/end
        c("SleepAnalysis", "Sleep", ""),
        // fitness and body
        q("VO2Max", "VO2max", "ml/(kg*min)", vo2Unit),
        q("BodyMass", "Weight", "lb", .pound()),
        q("BodyFatPercentage", "Body fat", "%", .percent()),
        q("WaistCircumference", "Waist", "cm", .meterUnit(with: .centi)),
        // vitals
        q("BloodPressureSystolic", "Blood pressure, systolic", "mmHg",
          .millimeterOfMercury()),
        q("BloodPressureDiastolic", "Blood pressure, diastolic", "mmHg",
          .millimeterOfMercury()),
        q("BloodGlucose", "Glucose", "mg/dL",
          HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci))),
        q("AppleSleepingWristTemperature", "Sleeping wrist temperature", "degC",
          .degreeCelsius()),
        // cycle
        c("MenstrualFlow", "Menstrual flow", "count"),
        // mindfulness and food
        c("MindfulSession", "Mindful minutes", "min"),
        q("DietaryEnergyConsumed", "Dietary energy", "kcal", .kilocalorie()),
        q("DietaryProtein", "Dietary protein", "g", .gram()),
        q("DietaryCarbohydrates", "Dietary carbohydrates", "g", .gram()),
        q("DietaryFatTotal", "Dietary fat", "g", .gram()),
    ]

    static var readTypes: Set<HKObjectType> {
        Set(types.compactMap { $0.sampleType as HKObjectType? })
    }

    // MARK: - workouts

    /// The wire type of a workout, and of the spec that reads them. The server
    /// spells both of these out in `lib/healthkit.ts`; change one, change both.
    static let workoutType = "HKWorkout"
    static let workoutEnergyType = "HKWorkoutEnergy"

    /// The activity names the server's habit matcher knows by name. Everything
    /// else goes over as whatever Swift calls the case, which is still more
    /// useful in the day view than a number would be.
    private static let activityNames: [HKWorkoutActivityType: String] = [
        .traditionalStrengthTraining: "strengthTraining",
        .functionalStrengthTraining: "strengthTraining",
        .coreTraining: "strengthTraining",
        .running: "running",
        .walking: "walking",
        .hiking: "walking",
        .cycling: "cycling",
        .swimming: "swimming",
        .yoga: "yoga",
        .pilates: "yoga",
        .highIntensityIntervalTraining: "hiit",
    ]

    static func activityName(_ type: HKWorkoutActivityType) -> String {
        if let name = activityNames[type] { return name }
        // `HKWorkoutActivityType` is an imported `NS_ENUM` with no name API.
        // Reflection gives the case name for the ones Swift knows and
        // `HKWorkoutActivityType(rawValue: 3000)` for the ones it does not, so
        // anything with a bracket in it is not a name.
        let described = String(describing: type)
        return described.contains("(") ? "workout" : described
    }

    /// A workout as the two samples the wire carries. Pure: everything a live
    /// `HKWorkout` has that matters is a parameter, so the tests can build one.
    static func workoutSamples(activity: String, minutes: Double, kcal: Double?,
                               start: Date, end: Date, source: String?,
                               zone: TimeZone = .current) -> [Api.Sample] {
        let f = Api.isoFormatter(zone)
        let from = f.string(from: start)
        let to = f.string(from: end)
        guard minutes > 0 else { return [] }
        var out = [Api.Sample(type: workoutType, unit: activity,
                              value: (minutes * 100).rounded() / 100,
                              start: from, end: to, sourceBundle: source)]
        if let kcal, kcal > 0 {
            out.append(Api.Sample(type: workoutEnergyType, unit: "kcal",
                                  value: (kcal * 10).rounded() / 10,
                                  start: from, end: to, sourceBundle: source))
        }
        return out
    }

    /// The active energy a workout recorded, in kilocalories.
    static func workoutEnergy(_ workout: HKWorkout) -> Double? {
        workout.statistics(for: HKQuantityType(.activeEnergyBurned))?
            .sumQuantity()?
            .doubleValue(for: .kilocalorie())
    }

    // MARK: - pure

    /// `HKCategoryValueSleepAnalysis` → the stage name the server reads out of
    /// the `unit` field. `STAGE_NAMES` in `lib/healthkit.ts` lowercases before
    /// it looks up, so the camel case here is only for humans.
    static func sleepStage(_ raw: Int) -> String? {
        switch raw {
        case 0: return "inBed"
        case 1: return "asleepUnspecified"
        case 2: return "awake"
        case 3: return "asleepCore"
        case 4: return "asleepDeep"
        case 5: return "asleepREM"
        default: return nil
        }
    }

    /// A stand hour is one hour stood. `.stood` is 0 and `.idle` is 1, so the
    /// value the server sums is the inverse of the raw category value.
    static func standHours(_ raw: Int) -> Double { raw == 0 ? 1 : 0 }

    /// One store sample as the wire sees it. `zone` is a parameter so a test
    /// can pin an offset instead of trusting the machine it runs on.
    static func sample(_ spec: HKTypeSpec, value: Double, unit: String? = nil,
                       start: Date, end: Date, source: String?,
                       zone: TimeZone = .current) -> Api.Sample {
        let f = Api.isoFormatter(zone)
        let u = unit ?? spec.unit
        return Api.Sample(type: spec.identifier,
                          unit: u.isEmpty ? nil : u,
                          value: value,
                          start: f.string(from: start),
                          end: f.string(from: end),
                          sourceBundle: source)
    }

    /// A store sample, or nil when it is a kind we cannot read (a sleep value
    /// Apple has not defined yet, an idle stand hour that says nothing).
    static func sample(from hkSample: HKSample, spec: HKTypeSpec,
                       zone: TimeZone = .current) -> Api.Sample? {
        let source = hkSample.sourceRevision.source.bundleIdentifier
        if let hkUnit = spec.hkUnit {
            guard let q = hkSample as? HKQuantitySample else { return nil }
            return sample(spec, value: q.quantity.doubleValue(for: hkUnit),
                          start: q.startDate, end: q.endDate, source: source,
                          zone: zone)
        }
        guard let cat = hkSample as? HKCategorySample else { return nil }
        switch spec.identifier {
        case "HKCategoryTypeIdentifierSleepAnalysis":
            guard let stage = sleepStage(cat.value) else { return nil }
            return sample(spec, value: 1, unit: stage, start: cat.startDate,
                          end: cat.endDate, source: source, zone: zone)
        case "HKCategoryTypeIdentifierAppleStandHour":
            let hours = standHours(cat.value)
            guard hours > 0 else { return nil }
            return sample(spec, value: hours, start: cat.startDate,
                          end: cat.endDate, source: source, zone: zone)
        default:
            return sample(spec, value: Double(cat.value), start: cat.startDate,
                          end: cat.endDate, source: source, zone: zone)
        }
    }

    /// Every sample a store sample becomes. One for almost everything; two for
    /// a workout, which carries its energy alongside; none for a kind we
    /// cannot read.
    static func samples(from hkSample: HKSample, spec: HKTypeSpec,
                        zone: TimeZone = .current) -> [Api.Sample] {
        guard let workout = hkSample as? HKWorkout else {
            return sample(from: hkSample, spec: spec, zone: zone).map { [$0] } ?? []
        }
        return workoutSamples(
            activity: activityName(workout.workoutActivityType),
            minutes: workout.duration / 60,
            kcal: workoutEnergy(workout),
            start: workout.startDate, end: workout.endDate,
            source: workout.sourceRevision.source.bundleIdentifier, zone: zone)
    }

    // MARK: - batching

    /// The day the server will file this sample under.
    ///
    /// `lib/healthkit.ts` reads the date out of `start` — except for sleep,
    /// which it files on the morning the night ended (`sleepDay`). Getting
    /// this wrong splits a night across two POSTs, so the two rules are
    /// spelled the same way on both sides.
    static func day(of sample: Api.Sample) -> String {
        let isSleep = sample.type.hasSuffix("SleepAnalysis")
        let instant = isSleep ? (sample.end ?? sample.start) : sample.start
        return String(instant.prefix(10))
    }

    /// One POST per slice. The server takes 20 000 in a batch; 500 keeps a
    /// failed request small and a first sync interruptible.
    static let batchSize = 500

    /// Batches that never cut a day in half.
    ///
    /// The server aggregates each POST on its own and *replaces* the day's
    /// totals with what that POST adds up to, because a resync sends the same
    /// day again and adding would double it. So a day whose samples land in
    /// two POSTs ends up with only the second half of itself: with 500-sample
    /// batches and a few hundred step samples a day, that was roughly one day
    /// in five.
    ///
    /// Days are therefore packed whole. A day bigger than `size` becomes its
    /// own batch and is allowed to exceed it — one oversize POST is honest,
    /// half a day of steps is not.
    static func batches(_ samples: [Api.Sample],
                        size: Int = batchSize) -> [[Api.Sample]] {
        guard size > 0, !samples.isEmpty else { return [] }
        var order: [String] = []
        var byDay: [String: [Api.Sample]] = [:]
        for sample in samples {
            let key = day(of: sample)
            if byDay[key] == nil { order.append(key) }
            byDay[key, default: []].append(sample)
        }

        var out: [[Api.Sample]] = []
        var current: [Api.Sample] = []
        for key in order {
            let group = byDay[key]!
            if !current.isEmpty && current.count + group.count > size {
                out.append(current)
                current = []
            }
            current.append(contentsOf: group)
        }
        if !current.isEmpty { out.append(current) }
        return out
    }

    /// The samples that are safe to send now, and the newest day, held back.
    ///
    /// A page is cut by sample count, so its far edge lands mid-day almost
    /// every time — the same split `batches` fixes, one level up. While more
    /// pages could still add to the newest day, that day waits for the page
    /// that finishes it.
    static func holdNewestDay(_ samples: [Api.Sample])
        -> (ready: [Api.Sample], held: [Api.Sample]) {
        guard let newest = samples.map(day(of:)).max() else { return ([], []) }
        var ready: [Api.Sample] = []
        var held: [Api.Sample] = []
        for sample in samples {
            if day(of: sample) == newest { held.append(sample) } else { ready.append(sample) }
        }
        return (ready, held)
    }
}

// MARK: - what the phone remembers

/// The seam the tests use instead of `UserDefaults`. `UserDefaults` already has
/// all three methods, so conforming it costs nothing.
protocol KeyValueStore: AnyObject {
    func data(forKey key: String) -> Data?
    func set(_ value: Any?, forKey key: String)
}

extension UserDefaults: KeyValueStore {}

final class MemoryStore: KeyValueStore {
    private var values: [String: Any] = [:]
    func data(forKey key: String) -> Data? { values[key] as? Data }
    func set(_ value: Any?, forKey key: String) { values[key] = value }
}

/// Anchors and the per-type audit line the Sync tab shows.
///
/// The anchor is only committed after the samples it covers have been accepted
/// by the server, so a failed POST is retried rather than silently skipped.
final class SyncState {
    struct TypeState: Codable, Equatable {
        var lastSent: Date?
        var samples: Int = 0
        var lastError: String?
    }

    private let store: KeyValueStore

    init(store: KeyValueStore = UserDefaults.standard) { self.store = store }

    private func anchorKey(_ id: String) -> String { "hk.anchor.\(id)" }
    private func stateKey(_ id: String) -> String { "hk.state.\(id)" }

    func anchorData(_ id: String) -> Data? { store.data(forKey: anchorKey(id)) }

    func state(_ id: String) -> TypeState {
        guard let data = store.data(forKey: stateKey(id)),
              let s = try? JSONDecoder().decode(TypeState.self, from: data)
        else { return TypeState() }
        return s
    }

    private func put(_ s: TypeState, _ id: String) {
        store.set(try? JSONEncoder().encode(s), forKey: stateKey(id))
    }

    /// A sync that worked: the anchor moves and the count grows. `lastSent` is
    /// only stamped when something was actually sent, so a nightly no-op does
    /// not make an empty type look busy.
    func commit(_ id: String, anchor: Data?, sent: Int, at: Date) {
        if let anchor { store.set(anchor, forKey: anchorKey(id)) }
        var s = state(id)
        s.samples += sent
        if sent > 0 { s.lastSent = at }
        s.lastError = nil
        put(s, id)
    }

    /// A sync that did not: the anchor stays where it was.
    func fail(_ id: String, _ message: String) {
        var s = state(id)
        s.lastError = message
        put(s, id)
    }

    func reset(_ id: String) {
        store.set(nil, forKey: anchorKey(id))
        store.set(nil, forKey: stateKey(id))
    }

    /// Forget where the anchored query got to, keep the audit line.
    ///
    /// An anchored query never looks back, so widening the first-sync window
    /// does nothing for a phone that already synced: the anchor is past the old
    /// years. Dropping the anchor is the only way to read them, and re-sending
    /// is safe because the server upserts per day.
    func clearAnchor(_ id: String) {
        store.set(nil, forKey: anchorKey(id))
    }

    var seenNotUsed: [String] {
        get {
            guard let d = store.data(forKey: "hk.seenNotUsed") else { return [] }
            return (try? JSONDecoder().decode([String].self, from: d)) ?? []
        }
        set { store.set(try? JSONEncoder().encode(newValue), forKey: "hk.seenNotUsed") }
    }
}

// MARK: - the live half

@MainActor
final class HealthSyncModel: ObservableObject {
    static let shared = HealthSyncModel()

    @Published var busy = false
    @Published var status = ""
    @Published var seenNotUsed: [String] = []
    /// Bumped after every sync so the list redraws from `SyncState`.
    @Published var revision = 0

    let store = HKHealthStore()
    let state = SyncState()

    /// One anchored read; the loop repeats while a pass comes back full.
    private let pageSize = 2000
    /// How many pages one type may take in a single run: 400 000 samples at
    /// 2000 a page, enough for years of steps. It used to be 25, which was a
    /// year's worth and no more. A type that ever hits the ceiling has still
    /// moved its anchor, so the next sync carries on where this one stopped.
    private let maxPages = 200

    var available: Bool { HKHealthStore.isHealthDataAvailable() }

    init() { seenNotUsed = state.seenNotUsed }

    func requestAuthorization() async {
        guard available else {
            status = "Health data is not available on this device."
            return
        }
        do {
            try await store.requestAuthorization(toShare: [], read: HK.readTypes)
            status = "Health access requested."
            enableBackgroundDelivery()
        } catch {
            status = "Health access failed: \(error.localizedDescription)"
        }
    }

    /// Apple never reveals read permission, so the honest answer is only
    /// whether the sheet still has something to ask for.
    func needsAsking() async -> Bool {
        guard available else { return false }
        let status = try? await store.statusForAuthorizationRequest(
            toShare: [], read: HK.readTypes)
        return status != .unnecessary
    }

    func syncAll() async {
        guard available else {
            status = "Health data is not available on this device."
            return
        }
        guard !busy else { return }
        busy = true
        defer { busy = false; revision += 1 }
        var sent = 0
        var unmapped = Set<String>()
        for spec in HK.types {
            do {
                let result = try await sync(spec)
                sent += result.0
                unmapped.formUnion(result.1)
            } catch {
                state.fail(spec.identifier, error.localizedDescription)
            }
        }
        seenNotUsed = unmapped.sorted()
        state.seenNotUsed = seenNotUsed
        status = sent == 0 ? "Nothing new to send." : "Sent \(sent) samples."
    }

    /// Every anchor dropped, then a full read.
    ///
    /// For the phone that already synced under the old one-year window this is
    /// the only way back to 2019: an anchored query will not re-read the past
    /// on its own. The per-day upsert on the server means the year that came
    /// through the first time is simply written again, not doubled.
    func resyncEverything() async {
        guard !busy else { return }
        for spec in HK.types { state.clearAnchor(spec.identifier) }
        status = "Reading all of Apple Health…"
        await syncAll()
    }

    /// One type, paged until HealthKit stops filling a page.
    ///
    /// The whole job of the loop is that a day leaves the phone in one piece.
    /// The server replaces a day's totals with whatever one POST adds up to,
    /// so both cuts that could split a day — the 500-sample batch and the
    /// 2000-sample page — are made on day boundaries instead.
    @discardableResult
    func sync(_ spec: HKTypeSpec) async throws -> (Int, [String]) {
        guard let sampleType = spec.sampleType else { return (0, []) }
        var anchor = state.anchorData(spec.identifier)
        var held: [Api.Sample] = []
        var sent = 0
        /// Sent, but not yet in the audit line: the anchor they belong to has
        /// not moved yet.
        var uncounted = 0
        var unmapped: [String] = []

        func post(_ samples: [Api.Sample]) async throws {
            for batch in HK.batches(samples) {
                let reply = try await Api.sync(batch)
                unmapped.append(contentsOf: reply.seenNotUsed ?? [])
            }
            sent += samples.count
            uncounted += samples.count
        }

        for _ in 0..<maxPages {
            let page = try await read(sampleType, spec: spec, anchor: anchor)
            anchor = page.anchor ?? anchor
            let more = page.count >= pageSize
            let ready: [Api.Sample]
            if more {
                (ready, held) = HK.holdNewestDay(held + page.samples)
            } else {
                ready = held + page.samples
                held = []
            }
            try await post(ready)
            // The anchor only moves once every sample behind it has gone —
            // including a page that held nothing we send (an idle stand hour,
            // a sleep value Apple has not defined yet), or reading those again
            // would be a loop with no way out. While a day is still held back
            // it stays put, so an interrupted sync re-reads that day whole
            // rather than leaving it with half a day's total for ever.
            if held.isEmpty {
                state.commit(spec.identifier, anchor: anchor, sent: uncounted,
                             at: Date())
                uncounted = 0
            }
            if !more { break }
        }

        // `maxPages` ran out mid-day: send what is left and move on, or this
        // type would re-read the same pages on every sync and never progress.
        if !held.isEmpty {
            let last = held
            held = []
            try await post(last)
            state.commit(spec.identifier, anchor: anchor, sent: uncounted,
                         at: Date())
        }
        return (sent, unmapped)
    }

    private func read(_ type: HKSampleType, spec: HKTypeSpec,
                      anchor anchorData: Data?) async throws
        -> (samples: [Api.Sample], anchor: Data?, count: Int) {
        let anchor = anchorData.flatMap {
            try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0)
        }
        // No predicate at all: a first sync reads everything HealthKit has,
        // back to the first watch the person ever wore. It used to be a year,
        // which quietly threw away the years that make a trend a trend. The
        // 500-sample batches are the throttle, and the anchor makes every sync
        // after the first incremental.
        let page = pageSize
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKAnchoredObjectQuery(
                type: type, predicate: nil, anchor: anchor, limit: page
            ) { _, added, _, newAnchor, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let raw = added ?? []
                let samples = raw.flatMap { HK.samples(from: $0, spec: spec) }
                let data = newAnchor.flatMap {
                    try? NSKeyedArchiver.archivedData(withRootObject: $0,
                                                      requiringSecureCoding: true)
                }
                continuation.resume(returning: (samples, data, raw.count))
            }
            store.execute(query)
        }
    }

    // MARK: - without opening the app

    func enableBackgroundDelivery() {
        guard available else { return }
        for spec in HK.types {
            guard let type = spec.sampleType else { continue }
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    private var observing = false

    func startObservers() {
        guard available, !observing else { return }
        observing = true
        for spec in HK.types {
            guard let type = spec.sampleType else { continue }
            let query = HKObserverQuery(sampleType: type, predicate: nil) {
                [weak self] _, completion, _ in
                Task { @MainActor in
                    _ = try? await self?.sync(spec)
                    completion()
                }
            }
            store.execute(query)
        }
    }
}
