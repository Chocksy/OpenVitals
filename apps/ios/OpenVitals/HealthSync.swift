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
import UIKit

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

    /// The identifier without its `HKQuantityTypeIdentifier` or
    /// `HKCategoryTypeIdentifier` prefix, which is how `lib/healthkit.ts`
    /// names a type and how the totals route keys its rows.
    var shortType: String {
        for prefix in ["HKQuantityTypeIdentifier", "HKCategoryTypeIdentifier"]
        where identifier.hasPrefix(prefix) {
            return String(identifier.dropFirst(prefix.count))
        }
        return identifier
    }

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

    /// How often iOS should wake us for a type.
    ///
    /// Glucose is the one where minutes matter — a CGM reading an hour late is
    /// a number about the past. Everything else is a daily total or a nightly
    /// median, so hourly costs nothing and saves the battery.
    static func frequency(_ spec: HKTypeSpec) -> HKUpdateFrequency {
        spec.identifier.hasSuffix("BloodGlucose") ? .immediate : .hourly
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
        let f = formatter(zone)
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
        let f = formatter(zone)
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

    /// One formatter per zone, built once: a sync formats every sample twice,
    /// and a first sync reads tens of thousands. HealthKit calls back on its
    /// own threads, hence the lock.
    private static let formatterLock = NSLock()
    private static var formatters: [TimeZone: DateFormatter] = [:]

    static func formatter(_ zone: TimeZone) -> DateFormatter {
        formatterLock.lock()
        defer { formatterLock.unlock() }
        if let f = formatters[zone] { return f }
        let f = Api.isoFormatter(zone)
        formatters[zone] = f
        return f
    }

    // MARK: whole days

    /// The local days these samples change on the server. A night is filed on
    /// the morning it ended, and the evening it started is touched too, so a
    /// night across midnight resends both days whole.
    static func touchedDays(_ samples: [Api.Sample]) -> Set<String> {
        var days = Set<String>()
        for sample in samples {
            days.insert(day(of: sample))
            if sample.type.hasSuffix("SleepAnalysis") {
                days.insert(String(sample.start.prefix(10)))
            }
        }
        return days
    }

    struct DayRange: Equatable {
        let first: String
        let last: String
    }

    private static let dayMath: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    private static let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = dayMath
        f.timeZone = dayMath.timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func dayAfter(_ day: String) -> String? {
        guard let date = dayFormat.date(from: day),
              let next = dayMath.date(byAdding: .day, value: 1, to: date)
        else { return nil }
        return dayFormat.string(from: next)
    }

    /// Days as runs of consecutive dates, so one date query reads each run.
    static func ranges(_ days: Set<String>) -> [DayRange] {
        var out: [DayRange] = []
        for day in days.sorted() {
            if let last = out.last, dayAfter(last.last) == day {
                out[out.count - 1] = DayRange(first: last.first, last: day)
            } else {
                out.append(DayRange(first: day, last: day))
            }
        }
        return out
    }

    /// The instants a date query reads for a run of days: a day wider on each
    /// side, because a night ending on the first day began the day before.
    /// `wholeDays` then keeps only the days asked for.
    static func window(_ range: DayRange, calendar: Calendar = .current) -> DateInterval? {
        func midnight(_ day: String) -> Date? {
            let parts = day.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            return calendar.date(from: DateComponents(year: parts[0], month: parts[1],
                                                      day: parts[2]))
        }
        guard let first = midnight(range.first), let last = midnight(range.last),
              let start = calendar.date(byAdding: .day, value: -1, to: first),
              let end = calendar.date(byAdding: .day, value: 2, to: last),
              start < end
        else { return nil }
        return DateInterval(start: start, end: end)
    }

    static func wholeDays(_ samples: [Api.Sample], in days: Set<String>) -> [Api.Sample] {
        samples.filter { days.contains(day(of: $0)) }
    }
}

// MARK: - one line while it runs

/// What a run is doing right now.
///
/// A determinate bar would be a lie: an anchored query does not say how many
/// samples are behind it. What it can say honestly is which type it is on, how
/// far back it has read, and how many POSTs have landed.
struct SyncProgress: Equatable {
    var typeName = ""
    var pagesDone = 0
    /// The oldest day this type has read so far, `yyyy-MM-dd`.
    var oldestDaySeen = ""
    var batchesSent = 0
    var batchesFailed = 0

    /// "Sleep · reading 2023-04 · 41 batches sent"
    var line: String {
        guard !typeName.isEmpty else { return "" }
        var parts = [typeName]
        if !oldestDaySeen.isEmpty {
            parts.append("reading \(oldestDaySeen.prefix(7))")
        }
        parts.append("\(batchesSent) batch\(batchesSent == 1 ? "" : "es") sent")
        if batchesFailed > 0 { parts.append("\(batchesFailed) failed") }
        return parts.joined(separator: " · ")
    }

    /// A new type starts its own count; the run keeps going.
    mutating func begin(_ name: String) {
        typeName = name
        pagesDone = 0
        oldestDaySeen = ""
        batchesSent = 0
        batchesFailed = 0
    }

    mutating func saw(_ samples: [Api.Sample]) {
        pagesDone += 1
        guard let oldest = samples.map(HK.day(of:)).min() else { return }
        if oldestDaySeen.isEmpty || oldest < oldestDaySeen { oldestDaySeen = oldest }
    }
}

// MARK: - a POST that failed once is not a failure

/// Three more tries before a type is called failed.
///
/// Most of what killed a resync was one 500 in the middle of forty POSTs. The
/// batch that comes back on the second try is not an error, and the audit line
/// says so rather than reading "failed" for the whole type.
///
/// Only for the failures a later try can fix: the network, and the server's
/// own 5xx. A 4xx is the request's fault and fails at once; 401 stops the
/// whole run and asks for a sign-in.
enum Retry {
    static let delays: [TimeInterval] = [1, 4, 16]

    static func sleep(_ seconds: TimeInterval) async throws {
        try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    static func retryable(_ error: Error) -> Bool {
        if let failure = error as? Api.Failure { return failure.status >= 500 }
        if let url = error as? URLError {
            return ![.cancelled, .userAuthenticationRequired].contains(url.code)
        }
        return false
    }

    static func signedOut(_ error: Error) -> Bool {
        (error as? Api.Failure)?.status == 401
    }

    /// `work` until it stops throwing, the error is not worth another try, or
    /// the delays run out. Comes back with how many retries it took, so a
    /// resumed batch can be told from a clean one.
    static func run<T>(nap: (TimeInterval) async throws -> Void = sleep,
                       work: () async throws -> T) async throws -> (T, Int) {
        var used = 0
        while true {
            do { return (try await work(), used) } catch {
                guard used < delays.count, retryable(error) else { throw error }
                try await nap(delays[used])
                used += 1
            }
        }
    }
}

// MARK: - one run at a time

/// What a sync asks for. Two asks while a run is going fold into one.
enum SyncJob: Equatable {
    case types(Set<String>)
    case all
    case resync

    func folded(_ other: SyncJob) -> SyncJob {
        switch (self, other) {
        case (.resync, _), (_, .resync): return .resync
        case (.all, _), (_, .all): return .all
        case (.types(let a), .types(let b)): return .types(a.union(b))
        }
    }
}

/// One run at a time, for every caller: observers, Body, Settings, the
/// background. An ask while a run goes waits for it; asks while one already
/// waits fold into that one, and every asker gets the run it joined.
@MainActor
final class SyncQueue<Outcome> {
    private let perform: (SyncJob) async -> Outcome
    private var last: Task<Outcome, Never>?
    private var waiting: (job: SyncJob, task: Task<Outcome, Never>)?

    init(perform: @escaping (SyncJob) async -> Outcome) { self.perform = perform }

    @discardableResult
    func submit(_ job: SyncJob) async -> Outcome {
        if let waiting {
            self.waiting = (waiting.job.folded(job), waiting.task)
            return await waiting.task.value
        }
        let before = last
        let task = Task { @MainActor () -> Outcome in
            _ = await before?.value
            let next = self.waiting?.job ?? job
            self.waiting = nil
            return await self.perform(next)
        }
        waiting = (job, task)
        last = task
        return await task.value
    }
}

/// What one run came to, for Settings' status line and Body's header.
struct SyncOutcome: Equatable {
    var sent = 0
    var failed: [String] = []
    var signedOut = false
    var unavailable = false

    var ok: Bool { failed.isEmpty && !signedOut && !unavailable }

    var line: String {
        if unavailable { return "Health data is not available on this device." }
        if signedOut { return "Sign in again." }
        var line = sent == 0 ? "Nothing new to send."
                             : "Sent \(Api.Totals.count(sent)) samples."
        if !failed.isEmpty {
            line += " \(failed.count) type\(failed.count == 1 ? "" : "s")"
                + " will resume next sync: \(failed.joined(separator: ", "))."
        }
        return line
    }
}

/// `beginBackgroundTask` around one run, so a sync the observer woke, or one
/// the person left mid-way, gets its ~30 s to finish.
@MainActor
private final class BackgroundTime {
    private var id = UIBackgroundTaskIdentifier.invalid

    init() {
        id = UIApplication.shared.beginBackgroundTask(withName: "health sync") { [weak self] in
            self?.end()
        }
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
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
        /// Batches that failed once and then went through. Optional, so a
        /// blob written before phase 24f still decodes instead of throwing
        /// the whole audit line away.
        var resumed: Int?
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
    func commit(_ id: String, anchor: Data?, sent: Int, resumed: Int = 0,
                at: Date) {
        if let anchor { store.set(anchor, forKey: anchorKey(id)) }
        var s = state(id)
        s.samples += sent
        if sent > 0 { s.lastSent = at }
        if resumed > 0 { s.resumed = (s.resumed ?? 0) + resumed }
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
    /// The one live line the Sync tab shows while a run is going.
    @Published var progress = SyncProgress()
    /// What the server says it holds. Nil until the tab has asked once.
    @Published var totals: Api.Totals?

    let store = HKHealthStore()
    let state: SyncState

    /// The transport seam. The app posts; a test hands over a flaky one and
    /// counts the tries.
    var send: ([Api.Sample]) async throws -> Api.SyncResult = Api.sync
    /// The backoff seam, so the retry tests do not sleep for 21 seconds.
    var nap: (TimeInterval) async throws -> Void = Retry.sleep

    /// One anchored read; the loop repeats while a pass comes back full.
    private let pageSize = 2000
    /// How many pages one type may take in a single run: 400 000 samples at
    /// 2000 a page, enough for years of steps. A type that ever hits the
    /// ceiling has still moved its anchor, so the next sync carries on where
    /// this one stopped.
    private let maxPages = 200
    private lazy var queue = SyncQueue<SyncOutcome> { [unowned self] in await self.run($0) }
    /// Bumped by `reset`, so a run that was going when the account changed
    /// commits no anchor for the next one.
    private var epoch = 0

    var available: Bool { HKHealthStore.isHealthDataAvailable() }

    init(state: SyncState = SyncState()) {
        self.state = state
        seenNotUsed = state.seenNotUsed
    }

    /// What the server holds, which is the only honest count. Quiet on
    /// failure: a tab with no totals is a tab with no header line, not an
    /// error the person has to dismiss.
    func loadTotals() async {
        totals = try? await Api.totals()
    }

    func requestAuthorization() async {
        guard available else {
            status = "Health data is not available on this device."
            return
        }
        do {
            try await store.requestAuthorization(toShare: [], read: HK.readTypes)
            status = "Health access requested."
            await launch()
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

    /// At launch (the app delegate, including a launch HealthKit caused in the
    /// background), after sign-in and after Health access is granted: the
    /// observers and background delivery, once, when there is someone to send
    /// for and something we may read.
    func launch() async {
        guard !Fixtures.on, Api.signedIn, available, !observing else { return }
        guard !(await needsAsking()) else { return }
        enableBackgroundDelivery()
        startObservers()
    }

    /// Sign-out and a server change: stop listening and forget every anchor,
    /// so the next account starts from the beginning.
    func reset() {
        epoch += 1
        for query in observers { store.stop(query) }
        observers = []
        observing = false
        if available { store.disableAllBackgroundDelivery { _, _ in } }
        for spec in HK.types { state.reset(spec.identifier) }
        state.seenNotUsed = []
        seenNotUsed = []
        status = ""
        totals = nil
        revision += 1
    }

    @discardableResult
    func syncAll() async -> SyncOutcome { await queue.submit(.all) }

    /// Every anchor dropped, then a full read: every day there is data is
    /// read whole and sent again. The per-day upsert on the server means a
    /// day that came through before is written again, not doubled.
    @discardableResult
    func resyncEverything() async -> SyncOutcome {
        status = "Reading all of Apple Health…"
        return await queue.submit(.resync)
    }

    /// The one place a run happens; `queue` makes sure it is one at a time.
    private func run(_ job: SyncJob) async -> SyncOutcome {
        guard available else {
            status = "Health data is not available on this device."
            return SyncOutcome(unavailable: true)
        }
        let background = BackgroundTime()
        busy = true
        defer {
            busy = false
            revision += 1
            progress = SyncProgress()
            background.end()
        }
        let specs: [HKTypeSpec]
        switch job {
        case .types(let ids): specs = HK.types.filter { ids.contains($0.identifier) }
        case .all: specs = HK.types
        case .resync:
            for spec in HK.types { state.clearAnchor(spec.identifier) }
            specs = HK.types
        }
        let started = epoch
        var outcome = SyncOutcome()
        var unmapped = Set<String>(job == .all || job == .resync ? [] : seenNotUsed)
        for spec in specs {
            do {
                let result = try await sync(spec)
                outcome.sent += result.0
                unmapped.formUnion(result.1)
            } catch is CancellationError {
                break
            } catch where Retry.signedOut(error) {
                state.fail(spec.identifier, "Sign in again.")
                outcome.signedOut = true
                break
            } catch {
                // A type that failed kept its anchor, so it is not lost: it is
                // next in line, and the line says so.
                state.fail(spec.identifier, error.localizedDescription)
                outcome.failed.append(spec.name)
            }
        }
        guard epoch == started else { return outcome }
        seenNotUsed = unmapped.sorted()
        state.seenNotUsed = seenNotUsed
        status = outcome.line
        if !outcome.signedOut { await loadTotals() }
        return outcome
    }

    /// One type: the anchored query finds the days that changed, a date query
    /// reads those days whole, and the anchor moves only once they are sent.
    /// Each page of new samples is its own step, so a first sync of years
    /// keeps what it has sent if the phone stops it half way; a day a later
    /// page touches again is not resent in the same run.
    @discardableResult
    func sync(_ spec: HKTypeSpec) async throws -> (Int, [String]) {
        guard let sampleType = spec.sampleType else { return (0, []) }
        let started = epoch
        progress.begin(spec.name)
        var anchor = state.anchorData(spec.identifier)
        var done = Set<String>()
        var sent = 0
        var unmapped: [String] = []

        for _ in 0..<maxPages {
            let page = try await readNew(sampleType, spec: spec, anchor: anchor)
            progress.saw(page.samples)
            let days = HK.touchedDays(page.samples).subtracting(done)
            var whole: [Api.Sample] = []
            var resumed = 0
            if !days.isEmpty {
                whole = try await readDays(days, type: sampleType, spec: spec)
                let out = try await post(whole)
                unmapped.append(contentsOf: out.unmapped)
                resumed = out.resumed
                done.formUnion(days)
            }
            // The anchor moves only once every day this page touched is sent,
            // including a page that held nothing we send, or reading it again
            // would be a loop with no way out.
            guard epoch == started else { throw CancellationError() }
            anchor = page.anchor ?? anchor
            state.commit(spec.identifier, anchor: anchor, sent: whole.count,
                         resumed: resumed, at: Date())
            sent += whole.count
            if page.count < pageSize { break }
        }
        return (sent, unmapped)
    }

    /// Every batch of `samples` out, each one retried before it counts as a
    /// failure.
    ///
    /// Throws once a batch has used up its tries. The caller does not commit
    /// an anchor after a throw, so those days come round again on the next
    /// sync rather than being skipped.
    @discardableResult
    func post(_ samples: [Api.Sample])
        async throws -> (unmapped: [String], resumed: Int) {
        var unmapped: [String] = []
        var resumed = 0
        for batch in HK.batches(samples) {
            do {
                let (reply, retries) = try await Retry.run(nap: nap) {
                    try await self.send(batch)
                }
                unmapped.append(contentsOf: reply.seenNotUsed ?? [])
                if retries > 0 { resumed += 1 }
                progress.batchesSent += 1
            } catch {
                progress.batchesFailed += 1
                throw error
            }
        }
        return (unmapped, resumed)
    }

    /// What is new since the anchor. Only its days are used. No predicate: a
    /// first sync reads everything HealthKit has, back to the first watch.
    private func readNew(_ type: HKSampleType, spec: HKTypeSpec,
                         anchor anchorData: Data?) async throws
        -> (samples: [Api.Sample], anchor: Data?, count: Int) {
        let anchor = anchorData.flatMap {
            try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: $0)
        }
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

    /// Every sample of these local days, whatever the anchor has seen.
    func readDays(_ days: Set<String>, type: HKSampleType,
                  spec: HKTypeSpec) async throws -> [Api.Sample] {
        var out: [Api.Sample] = []
        for range in HK.ranges(days) {
            guard let window = HK.window(range) else { continue }
            let predicate = HKQuery.predicateForSamples(
                withStart: window.start, end: window.end, options: [])
            out += try await withCheckedThrowingContinuation { continuation in
                let query = HKSampleQuery(
                    sampleType: type, predicate: predicate,
                    limit: HKObjectQueryNoLimit, sortDescriptors: nil
                ) { _, raw, error in
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    continuation.resume(returning: (raw ?? []).flatMap {
                        HK.samples(from: $0, spec: spec)
                    })
                }
                store.execute(query)
            }
        }
        return HK.wholeDays(out, in: days)
    }

    // MARK: - without opening the app

    func enableBackgroundDelivery() {
        guard available else { return }
        for spec in HK.types {
            guard let type = spec.sampleType else { continue }
            store.enableBackgroundDelivery(for: type,
                                          frequency: HK.frequency(spec)) { _, _ in }
        }
    }

    private var observing = false
    private var observers: [HKObserverQuery] = []

    /// HealthKit wakes the app per type; each wake joins the queue, and its
    /// `completion` is called on every path, or iOS stops waking the app.
    func startObservers() {
        guard available, !observing else { return }
        observing = true
        for spec in HK.types {
            guard let type = spec.sampleType else { continue }
            let query = HKObserverQuery(sampleType: type, predicate: nil) {
                [weak self] _, completion, error in
                guard error == nil else { completion(); return }
                Task { @MainActor in
                    defer { completion() }
                    await self?.queue.submit(.types([spec.identifier]))
                }
            }
            observers.append(query)
            store.execute(query)
        }
    }
}
