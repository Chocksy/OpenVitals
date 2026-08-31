/// The parts a simulator can actually check: the wire format, the type table,
/// batching, and the anchor bookkeeping. No live HealthKit store is touched —
/// every function under test takes plain values or goes through `KeyValueStore`.
import XCTest
@testable import OpenVitals

final class InstantTests: XCTestCase {
    private let july = Date(timeIntervalSince1970: 1_788_246_600)  // 2026-09-01

    /// The server derives the day from the date in the string, so the offset
    /// has to be the phone's, spelled with a colon.
    func testLocalOffsetNotZulu() {
        let bucharest = Api.isoFormatter(TimeZone(secondsFromGMT: 3 * 3600)!)
        let stamp = bucharest.string(from: july)
        XCTAssertTrue(stamp.hasSuffix("+03:00"), stamp)
        XCTAssertFalse(stamp.hasSuffix("Z"), stamp)
        XCTAssertEqual(stamp.count, 25)
    }

    /// `XXXXX` and `ZZZZZ` both write `Z` at zero offset; lowercase `xxxxx`
    /// writes `+00:00`, so the rule "never Z" holds in London in winter too.
    func testZeroOffsetIsWrittenOut() {
        let utc = Api.isoFormatter(TimeZone(secondsFromGMT: 0)!)
        XCTAssertTrue(utc.string(from: july).hasSuffix("+00:00"))
    }

    /// A night that runs past midnight keeps each side on its own date.
    func testEveningSampleKeepsItsOwnDay() {
        let zone = TimeZone(secondsFromGMT: 3 * 3600)!
        var parts = DateComponents()
        parts.year = 2026; parts.month = 8; parts.day = 30
        parts.hour = 23; parts.minute = 10
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let start = calendar.date(from: parts)!
        let stamp = Api.isoFormatter(zone).string(from: start)
        XCTAssertEqual(stamp, "2026-08-30T23:10:00+03:00")
    }
}

final class SampleEncodingTests: XCTestCase {
    private let zone = TimeZone(secondsFromGMT: 3 * 3600)!

    private func spec(_ id: String) -> HKTypeSpec {
        HK.types.first { $0.identifier == id }!
    }

    private func json(_ sample: Api.Sample) throws -> [String: Any] {
        let data = try JSONEncoder().encode(sample)
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }

    func testQuantitySampleShape() throws {
        let start = Date(timeIntervalSince1970: 1_788_246_600)
        let sample = HK.sample(spec("HKQuantityTypeIdentifierStepCount"),
                               value: 9000, start: start, end: start,
                               source: "com.apple.health", zone: zone)
        let body = try json(sample)
        XCTAssertEqual(body["type"] as? String, "HKQuantityTypeIdentifierStepCount")
        XCTAssertEqual(body["unit"] as? String, "count")
        XCTAssertEqual(body["value"] as? Double, 9000)
        XCTAssertEqual(body["sourceBundle"] as? String, "com.apple.health")
        XCTAssertTrue((body["start"] as! String).hasSuffix("+03:00"))
        XCTAssertEqual(Set(body.keys),
                       ["type", "unit", "value", "start", "end", "sourceBundle"])
    }

    /// The one contract a category sample has: the stage name rides in `unit`.
    func testSleepStageRidesInTheUnitField() throws {
        let start = Date(timeIntervalSince1970: 1_788_246_600)
        let sample = HK.sample(spec("HKCategoryTypeIdentifierSleepAnalysis"),
                               value: 1, unit: "asleepREM", start: start,
                               end: start.addingTimeInterval(1800),
                               source: "com.apple.health", zone: zone)
        let body = try json(sample)
        XCTAssertEqual(body["unit"] as? String, "asleepREM")
        XCTAssertEqual(body["type"] as? String,
                       "HKCategoryTypeIdentifierSleepAnalysis")
    }

    func testSleepStageNames() {
        XCTAssertEqual(HK.sleepStage(0), "inBed")
        XCTAssertEqual(HK.sleepStage(1), "asleepUnspecified")
        XCTAssertEqual(HK.sleepStage(2), "awake")
        XCTAssertEqual(HK.sleepStage(3), "asleepCore")
        XCTAssertEqual(HK.sleepStage(4), "asleepDeep")
        XCTAssertEqual(HK.sleepStage(5), "asleepREM")
        XCTAssertNil(HK.sleepStage(99))
    }

    /// `.stood` is 0 and `.idle` is 1, so the hour the server sums is inverted.
    func testStandHourValue() {
        XCTAssertEqual(HK.standHours(0), 1)
        XCTAssertEqual(HK.standHours(1), 0)
    }

    /// An empty unit is left out rather than sent as an empty string.
    func testEmptyUnitIsOmitted() throws {
        let spec = HKTypeSpec(identifier: "HKCategoryTypeIdentifierSleepAnalysis",
                              name: "Sleep", unit: "", hkUnit: nil)
        let sample = HK.sample(spec, value: 1, start: Date(), end: Date(),
                               source: nil, zone: zone)
        XCTAssertNil(sample.unit)
        XCTAssertFalse(try json(sample).keys.contains("unit"))
    }
}

final class TypeTableTests: XCTestCase {
    func testEveryTypeResolves() {
        for spec in HK.types {
            XCTAssertNotNil(spec.sampleType, "no HealthKit type for \(spec.identifier)")
        }
    }

    func testTableCoversTheServerMapping() {
        let expected: Set<String> = [
            "StepCount", "ActiveEnergyBurned", "AppleExerciseTime", "AppleStandHour",
            "RestingHeartRate", "HeartRateVariabilitySDNN", "RespiratoryRate",
            "OxygenSaturation", "WalkingHeartRateAverage", "HeartRateRecoveryOneMinute",
            "SleepAnalysis", "VO2Max", "BodyMass", "BodyFatPercentage",
            "WaistCircumference", "BloodPressureSystolic", "BloodPressureDiastolic",
            "BloodGlucose", "AppleSleepingWristTemperature", "MenstrualFlow",
            "MindfulSession", "DietaryEnergyConsumed", "DietaryProtein",
            "DietaryCarbohydrates", "DietaryFatTotal",
        ]
        let short = Set(HK.types.map { spec -> String in
            for prefix in ["HKQuantityTypeIdentifier", "HKCategoryTypeIdentifier"]
            where spec.identifier.hasPrefix(prefix) {
                return String(spec.identifier.dropFirst(prefix.count))
            }
            return spec.identifier
        })
        XCTAssertEqual(short, expected)
        XCTAssertEqual(HK.types.count, expected.count)
    }

    /// `lib/units.ts` knows no factor from bpm to breaths/min, so a respiratory
    /// rate sent as `count/min` is dropped on arrival.
    func testRespiratoryRateSendsTheStoredUnit() {
        let spec = HK.types.first {
            $0.identifier == "HKQuantityTypeIdentifierRespiratoryRate"
        }!
        XCTAssertEqual(spec.unit, "breaths/min")
    }

    func testCategoryTypesHaveNoHKUnit() {
        let categories = HK.types.filter(\.isCategory).map(\.identifier)
        XCTAssertEqual(Set(categories), [
            "HKCategoryTypeIdentifierAppleStandHour",
            "HKCategoryTypeIdentifierSleepAnalysis",
            "HKCategoryTypeIdentifierMenstrualFlow",
            "HKCategoryTypeIdentifierMindfulSession",
        ])
    }
}

final class BatchingTests: XCTestCase {
    private func samples(_ n: Int) -> [Api.Sample] {
        (0..<n).map {
            Api.Sample(type: "HKQuantityTypeIdentifierStepCount", unit: "count",
                       value: Double($0), start: "2026-09-01T07:10:00+03:00",
                       end: nil, sourceBundle: nil)
        }
    }

    func testBatchesOfFiveHundred() {
        let batches = HK.batches(samples(1200))
        XCTAssertEqual(batches.map(\.count), [500, 500, 200])
        XCTAssertEqual(batches.flatMap { $0 }.count, 1200)
        XCTAssertEqual(batches[1].first?.value, 500)
    }

    func testExactMultipleDoesNotLeaveAnEmptyBatch() {
        XCTAssertEqual(HK.batches(samples(1000)).map(\.count), [500, 500])
    }

    func testNothingToSendIsNoRequests() {
        XCTAssertTrue(HK.batches([]).isEmpty)
    }

    func testSmallerThanOneBatch() {
        XCTAssertEqual(HK.batches(samples(3)).map(\.count), [3])
    }
}

final class AnchorBookkeepingTests: XCTestCase {
    private let type = "HKQuantityTypeIdentifierStepCount"

    func testAnchorIsOnlyStoredOnCommit() {
        let state = SyncState(store: MemoryStore())
        XCTAssertNil(state.anchorData(type))
        state.fail(type, "network went away")
        XCTAssertNil(state.anchorData(type), "a failed sync must not move the anchor")
        XCTAssertEqual(state.state(type).lastError, "network went away")
        XCTAssertEqual(state.state(type).samples, 0)

        let anchor = Data([1, 2, 3])
        state.commit(type, anchor: anchor, sent: 42, at: Date())
        XCTAssertEqual(state.anchorData(type), anchor)
        XCTAssertEqual(state.state(type).samples, 42)
        XCTAssertNil(state.state(type).lastError, "a good sync clears the last error")
    }

    func testCountsAccumulateAndTheAnchorMoves() {
        let state = SyncState(store: MemoryStore())
        state.commit(type, anchor: Data([1]), sent: 10, at: Date())
        state.commit(type, anchor: Data([2]), sent: 5, at: Date())
        XCTAssertEqual(state.anchorData(type), Data([2]))
        XCTAssertEqual(state.state(type).samples, 15)
    }

    /// A commit with no new anchor (HealthKit had nothing to give) keeps the
    /// old one rather than clearing it and re-reading a year.
    func testCommitWithoutAnchorKeepsTheOldOne() {
        let state = SyncState(store: MemoryStore())
        state.commit(type, anchor: Data([7]), sent: 1, at: Date())
        state.commit(type, anchor: nil, sent: 0, at: Date())
        XCTAssertEqual(state.anchorData(type), Data([7]))
    }

    /// A page HealthKit filled with nothing we send still moves the anchor,
    /// or the next sync reads the same samples for ever. But it must not
    /// pretend a number went out.
    func testEmptyPageMovesTheAnchorWithoutStampingASend() {
        let state = SyncState(store: MemoryStore())
        state.commit(type, anchor: Data([4]), sent: 0, at: Date())
        XCTAssertEqual(state.anchorData(type), Data([4]))
        XCTAssertNil(state.state(type).lastSent)
        XCTAssertEqual(state.state(type).samples, 0)
    }

    func testResetForgetsEverythingForOneType() {
        let state = SyncState(store: MemoryStore())
        state.commit(type, anchor: Data([9]), sent: 3, at: Date())
        state.reset(type)
        XCTAssertNil(state.anchorData(type))
        XCTAssertEqual(state.state(type).samples, 0)
    }

    func testSeenNotUsedRoundTrips() {
        let state = SyncState(store: MemoryStore())
        XCTAssertEqual(state.seenNotUsed, [])
        state.seenNotUsed = ["HeartRate", "Height"]
        XCTAssertEqual(state.seenNotUsed, ["HeartRate", "Height"])
    }

    func testTypesKeepSeparateBooks() {
        let state = SyncState(store: MemoryStore())
        state.commit(type, anchor: Data([1]), sent: 4, at: Date())
        XCTAssertNil(state.anchorData("HKQuantityTypeIdentifierBodyMass"))
        XCTAssertEqual(state.state("HKQuantityTypeIdentifierBodyMass").samples, 0)
    }
}

final class ApiShapeTests: XCTestCase {
    func testSyncBodyIsSamplesArray() throws {
        let sample = Api.Sample(type: "HKQuantityTypeIdentifierBodyMass",
                                unit: "lb", value: 180.4,
                                start: "2026-09-01T07:10:00+03:00",
                                end: "2026-09-01T07:10:00+03:00",
                                sourceBundle: "com.apple.health")
        let data = try JSONEncoder().encode(Api.SyncBody(samples: [sample]))
        let body = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual((body["samples"] as? [Any])?.count, 1)
    }

    func testSyncResultDecodesTheHonestFields() throws {
        let json = """
        {"ok":true,"samples":3,"days":["2026-09-01"],"readings":2,"dailyLogs":1,
         "facts":["waist_cm"],"habitTicks":0,"dropped":1,"skipped":[],
         "seenNotUsed":["HeartRate","Height"]}
        """
        let result = try JSONDecoder().decode(
            Api.SyncResult.self, from: Data(json.utf8))
        XCTAssertEqual(result.seenNotUsed, ["HeartRate", "Height"])
        XCTAssertEqual(result.facts, ["waist_cm"])
        XCTAssertEqual(result.dropped, 1)
    }

    /// A chip's `value` is a number for food and a string for a fact, and it
    /// has to go back to the server exactly as it arrived.
    func testChipValueRoundTrips() throws {
        let json = """
        {"ok":true,"kind":"meal","basis":"a plate of rice and chicken",
         "confidence":0.6,"label":"dinner","estimated":true,
         "chips":[
           {"kind":"nutrition","key":"kcal","label":"620 kcal · estimate",
            "value":620,"date":"2026-09-01","quote":"a plate","confidence":0.5,
            "by":"model"},
           {"kind":"fact","key":"last_meal_hour","label":"last meal 21:40",
            "value":"21:40","date":"2026-09-01","quote":"a plate",
            "confidence":0.7,"by":"model"}]}
        """
        let reply = try JSONDecoder().decode(
            Api.CaptureResult.self, from: Data(json.utf8))
        XCTAssertEqual(reply.chips?.count, 2)
        XCTAssertEqual(reply.chips?[0].value, .number(620))
        XCTAssertEqual(reply.chips?[1].value, .string("21:40"))
        XCTAssertEqual(reply.estimated, true)

        let back = try JSONEncoder().encode(
            Api.ConfirmBody(chips: reply.chips!, label: "dinner", at: "21:40"))
        let body = try JSONSerialization.jsonObject(with: back) as! [String: Any]
        let chips = body["chips"] as! [[String: Any]]
        XCTAssertEqual(chips[0]["value"] as? Double, 620)
        XCTAssertEqual(chips[1]["value"] as? String, "21:40")
    }

    /// A lab sheet comes back with no chips and a pipeline name instead.
    func testRoutedPhotoDecodes() throws {
        let json = """
        {"ok":true,"kind":"lab_sheet","basis":"a printed panel","chips":[],
         "routedTo":"lab","uploadId":"3f1b","count":14,"note":null}
        """
        let reply = try JSONDecoder().decode(
            Api.CaptureResult.self, from: Data(json.utf8))
        XCTAssertEqual(reply.routedTo, "lab")
        XCTAssertEqual(reply.count, 14)
        XCTAssertEqual(reply.chips?.isEmpty, true)
    }

    func testMultipartCarriesThePhotoAndTheFields() throws {
        let photo = Data([0xFF, 0xD8, 0xFF, 0xE0])
        let body = Api.multipart(boundary: "BOUND", photo: photo,
                                 fileName: "plate.jpg",
                                 fields: ["caption": "dinner",
                                          "takenAt": "2026-09-01T21:40:00+03:00"])
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertTrue(text.contains("--BOUND\r\n"))
        XCTAssertTrue(text.contains("name=\"photo\"; filename=\"plate.jpg\""))
        XCTAssertTrue(text.contains("Content-Type: image/jpeg"))
        XCTAssertTrue(text.contains("name=\"caption\"\r\n\r\ndinner\r\n"))
        XCTAssertTrue(text.contains("2026-09-01T21:40:00+03:00"))
        XCTAssertTrue(text.hasSuffix("--BOUND--\r\n"))
        XCTAssertTrue(body.range(of: photo) != nil)
    }

    /// Both spellings better-auth uses, and nothing else.
    func testSessionCookieName() {
        XCTAssertTrue(Api.isSessionCookie("better-auth.session_token"))
        XCTAssertTrue(Api.isSessionCookie("__Secure-better-auth.session_token"))
        XCTAssertFalse(Api.isSessionCookie("better-auth.csrf_token"))
    }
}
