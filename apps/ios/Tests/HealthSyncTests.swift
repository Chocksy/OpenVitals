/// Phase 38 D7: the anchor finds the days, a date query sends them whole.
///
/// The server stores what one POST adds up to for a day, so an incremental
/// sync that sent only the new samples wrote part of a day over all of it.
/// These are the pure halves of the fix: which days new samples touch, the
/// runs of days one date query reads, the filter back to those days, and the
/// one queue every sync goes through.
import XCTest
import HealthKit
@testable import OpenVitals

final class WholeDayTests: XCTestCase {
    private func steps(_ start: String) -> Api.Sample {
        Api.Sample(type: "HKQuantityTypeIdentifierStepCount", unit: "count",
                   value: 100, start: start, end: start, sourceBundle: nil)
    }

    private func sleep(_ start: String, _ end: String) -> Api.Sample {
        Api.Sample(type: "HKCategoryTypeIdentifierSleepAnalysis", unit: "asleepCore",
                   value: 1, start: start, end: end, sourceBundle: nil)
    }

    func testStepsTouchTheDayTheyStarted() {
        let days = HK.touchedDays([
            steps("2026-09-01T23:50:00+03:00"),
            steps("2026-09-02T00:10:00+03:00"),
            steps("2026-09-02T09:00:00+03:00"),
        ])
        XCTAssertEqual(days, ["2026-09-01", "2026-09-02"])
    }

    /// The week a first sync sends ahead of the full walk: today and the six
    /// local days before it, across a month end.
    func testRecentDaysAreTheLastWeekInLocalTime() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Bucharest")!
        // 2026-09-02 01:30 in Bucharest is still 2026-09-01 in UTC.
        let now = ISO8601DateFormatter().date(from: "2026-09-01T22:30:00Z")!
        XCTAssertEqual(HK.recentDays(7, now: now, calendar: cal), [
            "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30",
            "2026-08-31", "2026-09-01", "2026-09-02",
        ])
    }

    /// The server files a night on the morning it ended; the evening it began
    /// is sent whole too, so neither day is left with part of it.
    func testANightAcrossMidnightTouchesBothDays() {
        let night = sleep("2026-08-31T23:30:00+03:00", "2026-09-01T06:30:00+03:00")
        XCTAssertEqual(HK.touchedDays([night]), ["2026-08-31", "2026-09-01"])
        XCTAssertEqual(HK.day(of: night), "2026-09-01")
    }

    func testANapTouchesOneDay() {
        let nap = sleep("2026-09-01T14:00:00+03:00", "2026-09-01T14:40:00+03:00")
        XCTAssertEqual(HK.touchedDays([nap]), ["2026-09-01"])
    }

    func testNoSamplesTouchNoDays() {
        XCTAssertTrue(HK.touchedDays([]).isEmpty)
        XCTAssertTrue(HK.ranges([]).isEmpty)
    }

    func testConsecutiveDaysAreOneRange() {
        XCTAssertEqual(
            HK.ranges(["2026-09-03", "2026-09-01", "2026-09-02", "2026-09-07",
                       "2026-09-08", "2026-09-12"]),
            [HK.DayRange(first: "2026-09-01", last: "2026-09-03"),
             HK.DayRange(first: "2026-09-07", last: "2026-09-08"),
             HK.DayRange(first: "2026-09-12", last: "2026-09-12")])
    }

    /// Month and year ends, and the leap day, are still next to each other.
    func testRangesRunAcrossMonthsAndYears() {
        XCTAssertEqual(HK.ranges(["2025-12-31", "2026-01-01"]),
                       [HK.DayRange(first: "2025-12-31", last: "2026-01-01")])
        XCTAssertEqual(HK.ranges(["2028-02-28", "2028-02-29", "2028-03-01"]),
                       [HK.DayRange(first: "2028-02-28", last: "2028-03-01")])
        XCTAssertEqual(HK.ranges(["2026-02-28", "2026-03-01"]),
                       [HK.DayRange(first: "2026-02-28", last: "2026-03-01")])
        XCTAssertEqual(HK.dayAfter("2026-09-30"), "2026-10-01")
    }

    /// Local midnights, one day wider on each side.
    func testTheWindowIsLocalMidnightsWidenedByADay() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 3 * 3600)!
        let window = try XCTUnwrap(HK.window(
            HK.DayRange(first: "2026-09-01", last: "2026-09-02"), calendar: calendar))
        let f = Api.isoFormatter(calendar.timeZone)
        XCTAssertEqual(f.string(from: window.start), "2026-08-31T00:00:00+03:00")
        XCTAssertEqual(f.string(from: window.end), "2026-09-04T00:00:00+03:00")
    }

    /// A clock change inside the run: the window still ends on a midnight.
    func testTheWindowAcrossADaylightChange() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Bucharest")!
        let window = try XCTUnwrap(HK.window(
            HK.DayRange(first: "2026-10-24", last: "2026-10-25"), calendar: calendar))
        let f = Api.isoFormatter(calendar.timeZone)
        XCTAssertEqual(f.string(from: window.start), "2026-10-23T00:00:00+03:00")
        XCTAssertEqual(f.string(from: window.end), "2026-10-27T00:00:00+02:00")
    }

    /// The widened read brings in neighbours; only the asked days go out, and
    /// all of each asked day does.
    func testWholeDaysKeepsEveryAndOnlyTheAskedDays() {
        let read = [
            steps("2026-08-31T22:00:00+03:00"),
            steps("2026-09-01T00:00:00+03:00"),
            steps("2026-09-01T12:00:00+03:00"),
            steps("2026-09-01T23:59:00+03:00"),
            steps("2026-09-02T08:00:00+03:00"),
            sleep("2026-08-31T23:30:00+03:00", "2026-09-01T06:30:00+03:00"),
            sleep("2026-09-01T23:30:00+03:00", "2026-09-02T06:30:00+03:00"),
        ]
        let kept = HK.wholeDays(read, in: ["2026-09-01"])
        XCTAssertEqual(kept.count, 4)
        XCTAssertEqual(Set(kept.map(HK.day(of:))), ["2026-09-01"])
        // The night ending on the 2nd belongs to the 2nd, not here.
        XCTAssertFalse(kept.contains { $0.end == "2026-09-02T06:30:00+03:00" })
    }

    /// Read whole, then batched: a day still never splits.
    func testWholeDaysThenBatchesNeverSplitADay() {
        let read = (0..<600).map { i in
            steps(String(format: "2026-09-%02dT%02d:00:00+03:00", 1 + i / 200, (i / 10) % 24))
        }
        let batches = HK.batches(HK.wholeDays(read, in: ["2026-09-01", "2026-09-02",
                                                         "2026-09-03"]))
        XCTAssertEqual(batches.map(\.count), [400, 200])
        let sets = batches.map { Set($0.map(HK.day(of:))) }
        XCTAssertTrue(sets[0].isDisjoint(with: sets[1]))
    }

    func testTheSampleFormatterIsBuiltOncePerZone() {
        let zone = TimeZone(secondsFromGMT: 3 * 3600)!
        XCTAssertTrue(HK.formatter(zone) === HK.formatter(zone))
        XCTAssertFalse(HK.formatter(zone) === HK.formatter(TimeZone(secondsFromGMT: 0)!))
    }
}

final class SyncJobTests: XCTestCase {
    func testFolding() {
        XCTAssertEqual(SyncJob.types(["a"]).folded(.types(["b"])), .types(["a", "b"]))
        XCTAssertEqual(SyncJob.types(["a"]).folded(.all), .all)
        XCTAssertEqual(SyncJob.all.folded(.types(["a"])), .all)
        XCTAssertEqual(SyncJob.all.folded(.resync), .resync)
        XCTAssertEqual(SyncJob.resync.folded(.types(["a"])), .resync)
    }

    func testTheOutcomeLine() {
        XCTAssertEqual(SyncOutcome().line, "Nothing new to send.")
        XCTAssertTrue(SyncOutcome().ok)
        XCTAssertEqual(SyncOutcome(signedOut: true).line, "Sign in again.")
        XCTAssertFalse(SyncOutcome(signedOut: true).ok)
        let failed = SyncOutcome(sent: 0, failed: ["Steps", "Sleep"])
        XCTAssertFalse(failed.ok)
        XCTAssertEqual(failed.line,
                       "Nothing new to send. 2 types will resume next sync: Steps, Sleep.")
    }
}

/// Observers, Body, Settings and the background all ask; one run goes at a
/// time, and asks that arrive while one already waits become one run.
@MainActor
final class SyncQueueTests: XCTestCase {
    func testTwoAsksWhileARunGoesFoldIntoOneRun() async {
        var ran: [SyncJob] = []
        var gate: CheckedContinuation<Void, Never>?
        let queue = SyncQueue<Int> { job in
            ran.append(job)
            if ran.count == 1 { await withCheckedContinuation { gate = $0 } }
            return ran.count
        }
        let first = Task { await queue.submit(.types(["steps"])) }
        while gate == nil { await Task.yield() }
        let second = Task { await queue.submit(.types(["sleep"])) }
        let third = Task { await queue.submit(.types(["weight"])) }
        for _ in 0..<20 { await Task.yield() }
        XCTAssertEqual(ran.count, 1, "nothing starts while a run goes")
        gate?.resume()
        let (a, b, c) = (await first.value, await second.value, await third.value)
        XCTAssertEqual(ran, [.types(["steps"]), .types(["sleep", "weight"])])
        XCTAssertEqual(a, 1)
        XCTAssertEqual(b, 2, "both waiters get the run they joined")
        XCTAssertEqual(c, 2)
    }

    func testAnAskAfterARunEndsIsANewRun() async {
        var ran: [SyncJob] = []
        let queue = SyncQueue<Int> { job in
            ran.append(job)
            return ran.count
        }
        let a = await queue.submit(.all)
        let b = await queue.submit(.all)
        XCTAssertEqual(ran, [.all, .all])
        XCTAssertEqual([a, b], [1, 2])
    }

    /// No two runs overlap, so no two read the same anchor.
    func testRunsNeverOverlap() async {
        var inside = 0
        var most = 0
        let queue = SyncQueue<Void> { _ in
            inside += 1
            most = max(most, inside)
            for _ in 0..<5 { await Task.yield() }
            inside -= 1
        }
        await withTaskGroup(of: Void.self) { group in
            for i in 0..<8 {
                group.addTask { await queue.submit(.types(["t\(i)"])) }
            }
        }
        XCTAssertEqual(most, 1)
    }
}

/// Sign-out and a server change: the next account starts from the beginning.
@MainActor
final class ResetTests: XCTestCase {
    func testResetForgetsEveryAnchorAndAuditLine() {
        let store = MemoryStore()
        let model = HealthSyncModel(state: SyncState(store: store))
        for spec in HK.types {
            model.state.commit(spec.identifier, anchor: Data([1]), sent: 3, at: Date())
        }
        model.state.seenNotUsed = ["HeartRate"]
        model.seenNotUsed = ["HeartRate"]
        model.status = "Sent 3 samples."
        model.reset()
        for spec in HK.types {
            XCTAssertNil(store.data(forKey: "hk.anchor.\(spec.identifier)"), spec.name)
            XCTAssertNil(store.data(forKey: "hk.state.\(spec.identifier)"), spec.name)
        }
        XCTAssertEqual(model.state.seenNotUsed, [])
        XCTAssertEqual(model.seenNotUsed, [])
        XCTAssertEqual(model.status, "")
    }
}

/// Body's header reports the Health run, not only the reload.
final class BodyHealthLineTests: XCTestCase {
    private let at = Date(timeIntervalSince1970: 1_788_246_600)

    func testAFailedHealthRunIsTheLine() {
        let ended = BodyText.ended(error: "", health: SyncOutcome(signedOut: true), at: at)
        XCTAssertEqual(ended, .failed("Sign in again."))
        XCTAssertEqual(BodyText.line(nil, ended: ended), "Sign in again.")
    }

    func testAGoodRunSaysWhatItSent() {
        let ended = BodyText.ended(error: "", health: SyncOutcome(sent: 340), at: at)
        XCTAssertEqual(ended, .synced(at, sent: 340))
        let line = BodyText.line(nil, ended: ended) ?? ""
        XCTAssertTrue(line.hasPrefix("340 sent · synced "), line)
        let none = BodyText.line(nil, ended: .synced(at, sent: 0)) ?? ""
        XCTAssertTrue(none.hasPrefix("nothing new · synced "), none)
    }

    func testTheReloadErrorStillShowsAfterAGoodRun() {
        XCTAssertEqual(BodyText.ended(error: "offline", health: SyncOutcome(), at: at),
                       .failed("offline"))
    }
}
