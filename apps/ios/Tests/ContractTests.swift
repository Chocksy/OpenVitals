import UIKit
import XCTest
@testable import OpenVitals

/// Phase 32, section 6: the contract both sides implement.
///
/// Every endpoint has one JSON fixture with realistic values, and every
/// fixture is decoded here.
///
/// The files are `apps/ios/Tests/Fixtures/*.json`. They are read out of the
/// test bundle, which the synchronised `Tests` group fills from that folder:
/// reading the repo path directly from inside the simulator kills the test
/// process, so the bundle copy is the only one this target may open.
///
/// When 32a lands `apps/simple/fixtures/api/*.json`, point `Tests/Fixtures` at
/// it (`ln -s ../../simple/fixtures/api Tests/Fixtures`) and every assertion
/// below then runs against the web's own output with no change to this file.
final class ContractTests: XCTestCase {

    static func fixtureURL(_ name: String) -> URL? {
        Bundle(for: ContractTests.self).url(forResource: name, withExtension: "json")
    }

    private func decode<T: Decodable>(_ name: String, as: T.Type) throws -> T {
        let url = try XCTUnwrap(Self.fixtureURL(name), "no fixture named \(name)")
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    /// The eight files the contract needs, and the one place that lists them.
    static let names = ["today", "body", "plan-today", "habits", "meals",
                        "meal", "genome", "research", "markers"]

    func testEveryEndpointHasAFixture() {
        for name in Self.names {
            XCTAssertNotNil(Self.fixtureURL(name), name)
        }
    }

    // MARK: - GET /api/today

    func testTodayDecodes() throws {
        let today = try decode("today", as: Api.Today.self)
        XCTAssertTrue(["ok", "warn", "bad", "none"].contains(today.sentence.tone),
                      today.sentence.tone)
        XCTAssertFalse(today.sentence.head.isEmpty)
        XCTAssertFalse(today.plan.headline.isEmpty)
        XCTAssertGreaterThanOrEqual(today.plan.todo, 0)
        XCTAssertFalse(today.body.line.isEmpty)
        XCTAssertNotNil(today.body.unit)
    }

    /// The Plan card is a done-of-total and the thing that is next, so the
    /// phone needs no second request to draw it.
    func testThePlanCardCountsAndNamesWhatIsNext() throws {
        let today = try decode("today", as: Api.Today.self)
        XCTAssertEqual(today.plan.headline, "0 / 4")
        XCTAssertEqual(today.plan.todo, 4)
        let next = try XCTUnwrap(today.plan.next)
        XCTAssertFalse(next.isEmpty)
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        XCTAssertEqual(today.plan.todo, plan.total - plan.done)
        XCTAssertTrue(plan.rows.contains { $0.title == next }, next)
    }

    /// The three counters are the whole panel, so they add up to it.
    func testTheCountersAddUpToTheMarkerCount() throws {
        let today = try decode("today", as: Api.Today.self)
        XCTAssertEqual(today.status.counted, today.blood.total)
        XCTAssertGreaterThan(today.blood.total, 0)
        XCTAssertEqual(today.status.off, today.blood.off)
        XCTAssertEqual(Design.day(today.status.drawDate), "Apr 23 2026")
    }

    /// The next draw names the markers it is for, each with its code.
    func testTheNextDrawNamesItsMarkers() throws {
        let today = try decode("today", as: Api.Today.self)
        let draw = try XCTUnwrap(today.blood.nextDraw)
        XCTAssertGreaterThan(draw.weeks, 0)
        XCTAssertFalse(draw.codes.isEmpty)
        for code in draw.codes {
            XCTAssertFalse(code.code.isEmpty)
            XCTAssertFalse(code.name.isEmpty)
        }
    }

    /// The twelve systems, each with a state word from the four the design
    /// system allows, and a number that is never printed without its unit.
    func testTheTwelveSystemsCarryStateAndUnits() throws {
        let today = try decode("today", as: Api.Today.self)
        XCTAssertEqual(today.systems.count, 12)
        let words = Set(["off", "borderline", "good", "never measured"])
        for system in today.systems {
            XCTAssertTrue(words.contains(system.word), system.word)
            XCTAssertFalse(system.name.isEmpty)
            if system.value != nil {
                XCTAssertNotNil(system.unit, system.name)
                XCTAssertNotNil(system.marker, system.name)
                XCTAssertNotNil(system.reading, system.name)
            }
        }
        let lipids = try XCTUnwrap(today.systems.first { $0.id == "lipids" })
        XCTAssertEqual(lipids.reading, "HDL cholesterol 50 mg/dL")
    }

    /// Nothing measured is a hollow dot and no number, not a zero.
    func testNeverMeasuredHasNoNumber() throws {
        let today = try decode("today", as: Api.Today.self)
        let blank = try XCTUnwrap(today.systems.first { $0.word == "never measured" })
        XCTAssertNil(blank.value)
        XCTAssertNil(blank.unit)
        XCTAssertNil(blank.reading)
    }

    // MARK: - GET /api/today, the goals block (phase 34 section 1)

    /// Every goal is a target with a distance to it, and the block is empty
    /// rather than fabricated when nothing is aimed at anything.
    func testTheGoalsBlockDecodes() throws {
        let today = try decode("today", as: Api.Today.self)
        for goal in today.goals {
            XCTAssertFalse(goal.code.isEmpty)
            XCTAssertFalse(goal.name.isEmpty)
            XCTAssertTrue(goal.target.low != nil || goal.target.high != nil,
                          goal.code)
            XCTAssertFalse(goal.band.isEmpty, goal.code)
            for move in goal.moves { XCTAssertFalse(move.title.isEmpty) }
        }
    }

    /// The owner's account has one goal on file: LDL 70–100 by Dec 1 2026,
    /// 131 today, so 31 mg/dL to go and no projection behind it.
    func testTheOwnersOneGoalReadsAsItsOwnNumbers() throws {
        let today = try decode("today", as: Api.Today.self)
        let goal = try XCTUnwrap(today.goals.first { $0.code == "ldl_cholesterol" })
        XCTAssertEqual(goal.value, 131)
        XCTAssertEqual(goal.target.low, 70)
        XCTAssertEqual(goal.target.high, 100)
        XCTAssertEqual(goal.toGo, 31)
        XCTAssertEqual(goal.band, "70–100 mg/dL")
        XCTAssertEqual(goal.toGoLine, "31 mg/dL to go")
        XCTAssertEqual(goal.word, "off")
    }

    /// No projection is not a "no": the card says so in words rather than
    /// printing a verdict nobody computed.
    func testAGoalWithNoProjectionSaysSo() throws {
        let today = try decode("today", as: Api.Today.self)
        let goal = try XCTUnwrap(today.goals.first { $0.onPace == nil })
        XCTAssertNil(goal.paceLine)
        XCTAssertEqual(goal.pace, "no projection yet")
    }

    /// The sentence is the goals sentence when there are goals, and the
    /// ledger's own sentence when there are none. Either way it is one of the
    /// four tones and it never says sick.
    func testTheSentenceLeadsWithWhatIsBeingMoved() throws {
        let today = try decode("today", as: Api.Today.self)
        XCTAssertTrue(["ok", "warn", "bad", "none"].contains(today.sentence.tone))
        if today.goals.isEmpty {
            XCTAssertFalse(today.sentence.head.contains("sick"))
        } else {
            XCTAssertTrue(today.sentence.head.contains("moving"),
                          today.sentence.head)
            XCTAssertTrue(today.goals.allSatisfy {
                today.sentence.tail.contains($0.name)
            }, today.sentence.tail)
        }
    }

    /// Where the value and the target sit on one track, on the web's own
    /// scale. A value outside the band is never pinned to the edge.
    func testTheGoalRulerPutsTheValueAndTheTargetOnOneTrack() throws {
        let today = try decode("today", as: Api.Today.self)
        let goal = try XCTUnwrap(today.goals.first)
        let scale = TodayView.scale(goal)
        let band = try XCTUnwrap(scale.band)
        XCTAssertGreaterThan(scale.at, band.upperBound, "131 is over 100")
        XCTAssertLessThan(scale.at, 1)
        XCTAssertGreaterThan(band.lowerBound, 0)
    }

    // MARK: - GET /api/markers (phase 34 section 2)

    func testMarkersDecode() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        XCTAssertEqual(markers.days, 365)
        XCTAssertGreaterThan(markers.markers.count, 100)
        let words = Set(["off", "borderline", "optimal", "no band",
                         "never measured"])
        for marker in markers.markers {
            XCTAssertTrue(words.contains(marker.word), marker.word)
            XCTAssertFalse(marker.code.isEmpty)
            XCTAssertFalse(marker.name.isEmpty)
            XCTAssertFalse(marker.system.isEmpty)
            XCTAssertFalse(marker.date.isEmpty)
        }
    }

    /// The three counters `/api/today` prints are the three filters Blood
    /// offers, over the same rows.
    func testTheStateFiltersCountWhatTodayCounts() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        let today = try decode("today", as: Api.Today.self)
        XCTAssertEqual(markers.count("Off"), today.status.off)
        XCTAssertEqual(markers.count("Borderline"), today.status.borderline)
        XCTAssertEqual(markers.count("Optimal"), today.status.optimal)
        XCTAssertEqual(markers.count("All"), markers.markers.count)
        // "no band" is in All and in nothing else: a number nothing can judge
        // is not a state, so it never joins one of the three.
        XCTAssertGreaterThan(markers.count("All"), today.status.counted)
    }

    /// The list arrives grouped: the rows of one system are contiguous, so a
    /// client groups by reading in order and never re-sorts.
    func testTheRowsOfOneSystemAreContiguous() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        var seen: [String] = []
        for marker in markers.markers where seen.last != marker.system {
            XCTAssertFalse(seen.contains(marker.system), marker.system)
            seen.append(marker.system)
        }
        XCTAssertGreaterThan(seen.count, 1)
    }

    /// The search box reads names, codes and systems.
    func testTheSearchMatchesNameCodeAndSystem() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        let ldl = try XCTUnwrap(markers.markers.first { $0.code == "ldl_cholesterol" })
        XCTAssertTrue(ldl.matches("ldl"))
        XCTAssertTrue(ldl.matches("LDL Chol"))
        XCTAssertTrue(ldl.matches("ldl_chol"))
        XCTAssertTrue(ldl.matches(""))
        XCTAssertFalse(ldl.matches("ferritin"))
    }

    /// A marker with a goal says so on its own second line, and the ruler
    /// carries the target band. The owner has one: LDL.
    func testTheMarkerWithAGoalCarriesItsTargetBand() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        let ldl = try XCTUnwrap(markers.markers.first { $0.goal != nil })
        XCTAssertEqual(ldl.code, "ldl_cholesterol")
        XCTAssertTrue(ldl.source.contains("goal 70–100"), ldl.source)
        let ruler = try XCTUnwrap(ldl.ruler)
        XCTAssertNotNil(ruler.target)
        XCTAssertGreaterThanOrEqual(ruler.at, 0)
        XCTAssertLessThanOrEqual(ruler.at, 1)
    }

    /// Nothing is drawn where there is nothing to draw: a marker with no band
    /// and no goal has no ruler, and a marker with no value has none either.
    func testAMarkerWithNothingToJudgeItHasNoRuler() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        for marker in markers.markers where marker.ruler == nil {
            let bounds = [marker.band.low, marker.band.high,
                          marker.optimal.low, marker.optimal.high,
                          marker.goal?.low, marker.goal?.high]
                .compactMap { $0 }
            XCTAssertTrue(marker.value == nil || bounds.isEmpty, marker.code)
        }
        let blank = try XCTUnwrap(markers.markers.first { $0.value == nil })
        XCTAssertNil(blank.ruler)
        XCTAssertTrue(blank.series.isEmpty || blank.series.count >= 1)
    }

    /// The web's own scale, ported: linear over the band and twice its width
    /// either side, with everything past that in a short tail.
    func testTheScaleKeepsTheBandInShape() {
        // TPO antibodies 320 against a 0–34 band: the band is not squashed
        // into the first tenth and the mark is not pinned to the edge.
        let scale = MarkerScale(marks: [320, 412, 0, 34], bandLow: 0,
                                bandHigh: 34)
        let band = try? XCTUnwrap(scale.band(0, 34))
        XCTAssertGreaterThan(band?.upperBound ?? 0, 0.15)
        XCTAssertLessThan(scale.at(320), 1)
        XCTAssertGreaterThan(scale.at(320), scale.at(34))
        XCTAssertLessThan(scale.at(320), scale.at(412))
    }

    /// With no band there is one straight line and no tail at all.
    func testAMarkerWithNoBandGetsAStraightScale() {
        let scale = MarkerScale(marks: [10, 20, 30], bandLow: nil,
                                bandHigh: nil)
        XCTAssertEqual(scale.at(20), 0.5, accuracy: 0.001)
        XCTAssertGreaterThan(scale.at(30), 0.8)
        XCTAssertLessThan(scale.at(10), 0.2)
    }

    // ── the ends an axis prints ──────────────────────────────────────
    //
    // `components/ruler.tsx` `niceEnd` and `decimalsOf`, and the same six
    // cases `components/range-scale.test.ts` states. The padded end of a
    // scale is arithmetic, not a reading: the owner read "146.72 mg/dL" under
    // a bar and took it for a second value.

    func testAHighEndRoundsUpToANumberAPersonWouldSay() {
        XCTAssertEqual(MarkerScale.niceEnd(146.72, true), 150)
        XCTAssertEqual(MarkerScale.niceEnd(110.08, true), 120)
        XCTAssertEqual(MarkerScale.niceEnd(243.04, true), 250)
        XCTAssertEqual(MarkerScale.niceEnd(95.52, true), 100)
    }

    func testALowEndRoundsDownTheSameWay() {
        XCTAssertEqual(MarkerScale.niceEnd(67.92, false), 60)
        XCTAssertEqual(MarkerScale.niceEnd(38.48, false), 30)
    }

    func testTheRoundedEndStaysOutsideTheValueItCameFrom() {
        for v in [146.72, 110.08, 243.04, 95.52, 0.037, 4.48, 9999] {
            XCTAssertGreaterThanOrEqual(MarkerScale.niceEnd(v, true), v)
            XCTAssertLessThanOrEqual(MarkerScale.niceEnd(v, false), v)
        }
    }

    func testTheAxisFloorsAtZeroAndMirrorsBelowIt() {
        XCTAssertEqual(MarkerScale.niceEnd(0, true), 0)
        XCTAssertEqual(MarkerScale.niceEnd(0, false), 0)
        XCTAssertEqual(MarkerScale.niceEnd(-3.2, false), -4)
        XCTAssertEqual(MarkerScale.niceEnd(-3.2, true), -3)
    }

    func testTheAxisWorksAtEveryOrderOfMagnitude() {
        XCTAssertEqual(MarkerScale.niceEnd(0.037, true), 0.04, accuracy: 1e-12)
        XCTAssertEqual(MarkerScale.niceEnd(0.037, false), 0.03, accuracy: 1e-12)
        XCTAssertEqual(MarkerScale.niceEnd(1460, true), 1500)
        XCTAssertEqual(MarkerScale.niceEnd(0.0009, true), 0.001, accuracy: 1e-12)
    }

    func testTheAxisNeverPrintsMoreDecimalsThanTheReadingsUse() {
        // mg/dL comes in whole numbers, so its axis does too.
        XCTAssertEqual(MarkerScale.niceEnd(4.48, true, decimals: 0), 5)
        XCTAssertEqual(MarkerScale.niceEnd(1.15, true, decimals: 0), 2)
        XCTAssertEqual(MarkerScale.niceEnd(4.48, false, decimals: 0), 4)
        // One decimal on the readings, one on the end.
        XCTAssertEqual(MarkerScale.niceEnd(4.48, true, decimals: 1), 5)
        XCTAssertEqual(MarkerScale.niceEnd(0.44, true, decimals: 1), 0.5,
                       accuracy: 1e-12)
    }

    func testTheDecimalsComeOffTheMarkersOwnNumbers() {
        XCTAssertEqual(MarkerScale.decimalsOf([320, 412, 34]), 0)
        XCTAssertEqual(MarkerScale.decimalsOf([3.9, 0.4, 4.5]), 1)
        XCTAssertEqual(MarkerScale.decimalsOf([16.29, 6, 18.4]), 2)
        XCTAssertEqual(MarkerScale.decimalsOf([nil, nil, Double.nan]), 0)
    }

    /// What the ruler actually prints: no "146.7 mg/dL" under a bar.
    func testTheRulerEndsAreSaidNumbers() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        let ldl = try XCTUnwrap(markers.markers.first { $0.code == "ldl_cholesterol" })
        let ruler = try XCTUnwrap(ldl.ruler)
        XCTAssertEqual(ruler.low, "0")
        XCTAssertEqual(ruler.high, "150 mg/dL")
        let today = try decode("today", as: Api.Today.self)
        let goal = try XCTUnwrap(today.goals.first)
        XCTAssertEqual(TodayView.scale(goal).high, "150 mg/dL")
    }

    /// A concentration has no negative half, so the padded floor stops at 0.
    func testTheFloorNeverGoesBelowZero() {
        let scale = MarkerScale(marks: [1, 2], bandLow: nil, bandHigh: nil)
        XCTAssertGreaterThanOrEqual(scale.lo, 0)
    }

    // MARK: - GET /api/body

    func testBodyDecodes() throws {
        let body = try decode("body", as: Api.BodyDay.self)
        XCTAssertFalse(body.day.isEmpty)
        XCTAssertGreaterThan(body.synced.types, 0)
        XCTAssertFalse(body.rows.isEmpty)
        let steps = try XCTUnwrap(body.rows.first { $0.type == "steps" })
        XCTAssertEqual(steps.value, 7000)
        XCTAssertEqual(steps.unit, "steps")
        XCTAssertEqual(steps.identifier, "HKQuantityTypeIdentifierStepCount")
    }

    /// A type with nothing in it is listed and says so; it is never dropped.
    func testAnEmptyTypeIsStillARow() throws {
        let body = try decode("body", as: Api.BodyDay.self)
        let empty = try XCTUnwrap(body.rows.first { $0.value == nil })
        XCTAssertEqual(empty.word, "never measured")
        XCTAssertFalse(empty.display.isEmpty)
        // There is a writer but no reading, so there is no day to print: the
        // line is the type and the writer, never a stray separator.
        XCTAssertEqual(empty.provenance, "\(empty.type) · \(empty.source)")
        XCTAssertFalse(empty.source.isEmpty)
    }

    /// Every row that has a reading names its HealthKit type, its day and the
    /// unit that reading is in.
    func testEveryReadingIsTypedDatedAndUnitted() throws {
        let body = try decode("body", as: Api.BodyDay.self)
        let read = body.rows.filter { $0.value != nil }
        XCTAssertFalse(read.isEmpty)
        for row in read {
            XCTAssertTrue(row.identifier.hasPrefix("HK"), row.identifier)
            XCTAssertFalse(row.type.isEmpty, row.name)
            XCTAssertFalse(row.when.isEmpty, row.name)
            XCTAssertFalse(row.unit?.isEmpty ?? true, row.name)
            XCTAssertFalse(row.source.isEmpty, row.name)
            XCTAssertFalse(row.word.isEmpty, row.name)
            XCTAssertFalse(row.display.isEmpty, row.name)
            XCTAssertTrue(row.provenance.contains(row.type), row.provenance)
            XCTAssertFalse(row.provenance.contains(" ·  · "), row.provenance)
        }
    }

    // MARK: - GET /api/plan/today, POST /api/habits

    /// The phone's console said it out loud: two protocol lines can carry the
    /// same title and no item id, and a list keyed on the title alone drew one
    /// row and warned about the other.
    func testTwoPlanRowsWithOneTitleGetDistinctIds() throws {
        let json = Data(#"""
        {"day":"2026-09-03","done":0,"total":2,"rows":[
          {"itemId":null,"time":"08:00","slot":"morning",
           "title":"Vitamin D3 supplementation","why":"low 25-OH D",
           "tag":"protocol","done":false,"adherence":null},
          {"itemId":null,"time":"20:00","slot":"evening",
           "title":"Vitamin D3 supplementation","why":"low 25-OH D",
           "tag":"protocol","done":false,"adherence":null}]}
        """#.utf8)
        let plan = try JSONDecoder().decode(Api.PlanDay.self, from: json)
        let ids = plan.identified.map(\.id)
        XCTAssertEqual(ids.count, 2)
        XCTAssertEqual(Set(ids).count, 2, "two rows, two ids")
        XCTAssertFalse(ids.contains("Vitamin D3 supplementation"))
    }

    /// An item id from the server is the id, position or no position.
    func testAPlanRowKeepsItsItemId() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        for (index, row) in plan.rows.enumerated() where row.itemId != nil {
            XCTAssertEqual(Api.PlanDay.rowId(row, at: index), row.itemId)
        }
    }

    func testPlanTodayDecodes() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        XCTAssertFalse(plan.day.isEmpty)
        XCTAssertEqual(plan.rows.count, plan.total)
        XCTAssertEqual(plan.rows.filter(\.done).count, plan.done)
    }

    func testEveryPlanRowCarriesOneOfTheFourTags() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        let tags = Set(["protocol", "goal", "every day", "suggested"])
        for row in plan.rows {
            XCTAssertTrue(tags.contains(row.tag), row.tag)
            XCTAssertFalse(row.title.isEmpty)
            XCTAssertFalse(row.why.isEmpty, row.title)
        }
    }

    /// The badge is the adherence when there is one, else the tag. A row the
    /// report only suggested has no item to tick yet, so it says so.
    func testTheBadgeIsAdherenceOrTheTag() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        for row in plan.rows where row.adherence == nil {
            XCTAssertEqual(row.badge, row.tag)
        }
        let made = Api.PlanDay.Row(itemId: "pi_selenium", time: "08:00",
                                   slot: "breakfast", title: "Selenium 200 µg",
                                   why: "with breakfast", tag: "protocol",
                                   done: true, adherence: 0.86)
        XCTAssertEqual(made.badge, "86 %")
    }

    /// Ticking a row moves that row and the counter, and nothing else.
    func testTickingOneRowMovesTheCounter() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        let first = try XCTUnwrap(plan.identified.first)
        let moved = plan.with(first.id, done: true)
        XCTAssertEqual(moved.done, plan.done + 1)
        XCTAssertEqual(moved.total, plan.total)
        XCTAssertTrue(try XCTUnwrap(moved.identified.first {
            $0.id == first.id
        }).row.done)
        XCTAssertEqual(moved.rows.count, plan.rows.count)
        XCTAssertEqual(moved.with(first.id, done: false), plan)
    }

    /// The route answers `{ ok: true, ...the habit row }`, so both halves have
    /// to survive the same decoder.
    func testHabitAckDecodes() throws {
        let ack = try decode("habits", as: Api.HabitAck.self)
        XCTAssertEqual(ack.ok, true)
        XCTAssertEqual(ack.done, true)
        XCTAssertNotNil(ack.itemId)
        XCTAssertNotNil(ack.day)
    }

    func testTheBareHabitRowAlsoDecodes() throws {
        let row = Data(#"{"itemId":"pi_iron","day":"2026-09-03","done":true}"#.utf8)
        let ack = try JSONDecoder().decode(Api.HabitAck.self, from: row)
        XCTAssertNil(ack.ok)
        XCTAssertEqual(ack.done, true)
    }

    // MARK: - GET/POST /api/meals

    func testMealsDecodes() throws {
        let day = try decode("meals", as: Api.MealDay.self)
        XCTAssertFalse(day.day.isEmpty)
        XCTAssertFalse(day.meals.isEmpty)
        for meal in day.meals {
            XCTAssertFalse(meal.id.isEmpty)
            XCTAssertFalse(meal.label.isEmpty)
            XCTAssertFalse((meal.time ?? "").isEmpty)
            XCTAssertFalse(meal.items.isEmpty, meal.label)
        }
    }

    /// The card never totals anything itself: the server's total is the sum of
    /// the server's items, and this is where that is checked.
    func testTheTotalsAreTheItemsAddedUp() throws {
        let day = try decode("meals", as: Api.MealDay.self)
        for meal in day.meals {
            XCTAssertEqual(sum(meal.items.map(\.kcal)), meal.totals.kcal,
                           meal.label)
            XCTAssertEqual(sum(meal.items.map(\.proteinG)),
                           meal.totals.proteinG, meal.label)
            XCTAssertEqual(sum(meal.items.map(\.carbsG)),
                           meal.totals.carbsG, meal.label)
            XCTAssertEqual(sum(meal.items.map(\.fatG)),
                           meal.totals.fatG, meal.label)
        }
        XCTAssertEqual(sum(day.meals.map(\.totals.kcal)), day.totals.kcal)
        XCTAssertEqual(sum(day.meals.map(\.totals.proteinG)),
                       day.totals.proteinG)
    }

    /// The macros the server may leave null add up to what it did send, and
    /// nothing is zero-filled to make the sum work.
    private func sum(_ values: [Double?]) -> Double? {
        let known = values.compactMap { $0 }
        return known.isEmpty ? nil : known.reduce(0, +)
    }

    /// The phone hit this against production: a day with no meals answers 200
    /// with every macro null, and a required `Double` failed the whole screen.
    func testADayWithNoMealsDecodes() throws {
        let json = Data(#"""
        {"day":"2026-09-03","meals":[],
         "totals":{"kcal":null,"protein_g":null,"carbs_g":null,
                   "fat_g":null,"estimated":true}}
        """#.utf8)
        let day = try JSONDecoder().decode(Api.MealDay.self, from: json)
        XCTAssertTrue(day.meals.isEmpty)
        XCTAssertNil(day.totals.kcal)
    }

    /// A macro the server does not have prints a dash, never a zero.
    func testANullMacroPrintsADash() throws {
        let macros = Api.Macros(kcal: nil, proteinG: nil, carbsG: nil,
                                fatG: nil, estimated: true)
        XCTAssertEqual(Design.number(macros.kcal), "—")
        XCTAssertEqual(Design.amount(macros.proteinG, "g"), "—")
        XCTAssertEqual(Design.amount(Double(41), "g"), "41 g")
    }

    /// A read photo's numbers say "est." on every one of them.
    func testEveryEstimateIsLabelled() throws {
        let day = try decode("meals", as: Api.MealDay.self)
        for meal in day.meals where meal.totals.estimated {
            XCTAssertEqual(meal.totals.mark, " est.")
            XCTAssertTrue(meal.items.allSatisfy(\.estimated), meal.label)
        }
    }

    /// A meal that was weighed or scanned carries no "est.", and the flag is
    /// the boolean that decides it.
    func testALoggedMealCarriesNoEstimate() throws {
        let logged = Api.Macros(kcal: 410, proteinG: 33, carbsG: 40, fatG: 12,
                                estimated: false)
        XCTAssertEqual(logged.mark, "")
        let guessed = Api.Macros(kcal: 422, proteinG: 29, carbsG: 31, fatG: 20,
                                 estimated: true)
        XCTAssertEqual(guessed.mark, " est.")
    }

    /// The contract writes `estimated: true` as a literal, so a payload that
    /// leaves it out is still a guess and is labelled as one.
    func testAMissingEstimatedFlagIsAGuess() throws {
        let json = Data(#"{"kcal":10,"protein_g":1,"carbs_g":2,"fat_g":3}"#.utf8)
        let macros = try JSONDecoder().decode(Api.Macros.self, from: json)
        XCTAssertTrue(macros.estimated)
    }

    /// `POST /api/meals` answers with one meal, the same shape the list holds.
    func testTheMealPostAnswersWithOneMeal() throws {
        let meal = try decode("meal", as: Api.Meal.self)
        let day = try decode("meals", as: Api.MealDay.self)
        XCTAssertEqual(meal, day.meals.first)
        XCTAssertFalse(meal.items.isEmpty)
        let time = try XCTUnwrap(meal.time)
        XCTAssertEqual(meal.basis,
                       (meal.photo == nil ? "logged in Health" : "from a photo")
                       + " · \(time)")
    }

    // MARK: - GET /api/genome, GET /api/research

    func testGenomeDecodes() throws {
        let genome = try decode("genome", as: Api.Genome.self)
        XCTAssertFalse(try XCTUnwrap(genome.file).name.isEmpty)
        XCTAssertFalse(genome.verdicts.isEmpty)
        XCTAssertFalse(genome.genes.isEmpty)
        for verdict in genome.verdicts {
            XCTAssertTrue(["up", "down", "none"].contains(verdict.direction),
                          verdict.direction)
            XCTAssertFalse(verdict.reason.isEmpty, verdict.name)
        }
    }

    /// An absent haplotype is a verdict, not a gap: direction down, no test.
    func testAnAbsentHaplotypeIsAVerdict() throws {
        let genome = try decode("genome", as: Api.Genome.self)
        let absent = try XCTUnwrap(genome.verdicts.first(where: \.absent))
        XCTAssertEqual(absent.direction, "down")
        XCTAssertFalse(absent.testNeeded)
        XCTAssertLessThan(try XCTUnwrap(absent.factor), 1)
    }

    /// Every gene names the rsids it was read from, so nothing is a black box.
    func testEveryGeneNamesItsRsids() throws {
        let genome = try decode("genome", as: Api.Genome.self)
        for gene in genome.genes {
            XCTAssertFalse(gene.rsids.isEmpty, gene.gene)
            XCTAssertFalse(gene.source.isEmpty, gene.gene)
        }
        XCTAssertTrue(genome.genes.contains { $0.moved } || genome.genes.allSatisfy { !$0.moved })
    }

    func testResearchDecodes() throws {
        let list = try decode("research", as: Api.ResearchList.self)
        XCTAssertFalse(list.rows.isEmpty)
        for paper in list.rows {
            XCTAssertFalse(paper.title.isEmpty)
            XCTAssertFalse(paper.journal?.isEmpty ?? false)
            XCTAssertFalse(paper.publishedAt.isEmpty)
            XCTAssertEqual(paper.source, "epmc")
        }
    }

    /// An ungraded paper is the normal case while the intake is behind, and
    /// nothing may be invented in its place.
    func testAnUngradedPaperStillDecodes() throws {
        let list = try decode("research", as: Api.ResearchList.self)
        let ungraded = try XCTUnwrap(list.rows.first { $0.grade == nil })
        XCTAssertNil(ungraded.finding)
        XCTAssertNil(ungraded.moves)
        XCTAssertNotNil(ungraded.url)
    }

    /// `read` is the phase 34 field: false means found and not read, which the
    /// row says out loud. An empty grade slot reads as "no evidence", and the
    /// two are not the same answer.
    func testAPaperThatNothingHasReadSaysSo() throws {
        let list = try decode("research", as: Api.ResearchList.self)
        let unread = try XCTUnwrap(list.rows.first { !$0.read })
        XCTAssertNil(unread.grade)
        XCTAssertNil(unread.finding)
        XCTAssertEqual(unread.found, "found, not read yet")
        XCTAssertFalse(unread.showsMoves)
        XCTAssertEqual(unread.movesLine, "")
        XCTAssertFalse(unread.cite.isEmpty)
    }

    /// `read` is exactly "a grade or a finding is on file", which is what the
    /// web computes. Nothing on the phone re-derives it from anything else.
    func testReadMeansAGradeOrAFindingIsOnFile() throws {
        let list = try decode("research", as: Api.ResearchList.self)
        for paper in list.rows {
            XCTAssertEqual(paper.read,
                           paper.grade != nil || paper.finding != nil,
                           paper.id)
        }
    }

    /// "New for you" is hidden when nothing moved anything, which is what this
    /// account looks like today: fifteen rows, none of them read.
    func testNewForYouIsEmptyWhenNothingMovedAnything() throws {
        let list = try decode("research", as: Api.ResearchList.self)
        XCTAssertEqual(list.rows.filter { $0.moves != nil }.count,
                       NewForYou.pick(list.rows).count)
        XCTAssertLessThanOrEqual(NewForYou.pick(list.rows).count, 3)
    }

    /// A question goes to `/api/ask` and a statement to `/api/compose`, the
    /// same split `lib/ask-intent.ts` makes on the web.
    func testTheComposerTellsAQuestionFromAStatement() {
        XCTAssertTrue(Api.isQuestion("how do I lower my LDL?"))
        XCTAssertTrue(Api.isQuestion("What should my fasting insulin be"))
        XCTAssertTrue(Api.isQuestion("ferritin?"))
        XCTAssertFalse(Api.isQuestion("I feel tired since Monday"))
        XCTAssertFalse(Api.isQuestion("took 200 µg of selenium"))
        XCTAssertFalse(Api.isQuestion(""))
    }

    // MARK: - the compiled copies

    /// `Fixtures.json` is generated from the files. If the two drift, a DEBUG
    /// screenshot stops being a picture of the contract.
    func testTheCompiledFixturesMatchTheFiles() throws {
        for name in Self.names {
            let text = try XCTUnwrap(Fixtures.json[name], name)
            let url = try XCTUnwrap(Self.fixtureURL(name), name)
            let compiled = try JSONSerialization.jsonObject(with: Data(text.utf8))
            let onDisk = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
            XCTAssertEqual(compiled as? NSDictionary, onDisk as? NSDictionary, name)
        }
    }

    /// The seam itself: off by default, so a release build can never draw a
    /// fixture and call it the person's own data.
    func testFixturesAreOffUnlessAsked() throws {
        let key = "OVFixtures"
        let was = UserDefaults.standard.bool(forKey: key)
        defer { UserDefaults.standard.set(was, forKey: key) }

        UserDefaults.standard.set(false, forKey: key)
        XCTAssertFalse(Fixtures.on)
        let none: Api.Today? = Fixtures.canned("today")
        XCTAssertNil(none)

        UserDefaults.standard.set(true, forKey: key)
        XCTAssertTrue(Fixtures.on)
        let some: Api.Today? = Fixtures.canned("today")
        let onDisk = try? decode("today", as: Api.Today.self)
        XCTAssertNotNil(some)
        XCTAssertEqual(some, onDisk)
    }
}

/// The design system's own arithmetic: the formatters every screen prints
/// through, so a number is never bare and a date is never twice.
final class DesignTests: XCTestCase {

    func testADateIsPrintedOnceAndReadable() throws {
        XCTAssertEqual(Design.day("2026-08-01"), "Aug 1 2026")
        XCTAssertEqual(Design.longDay("2026-09-03"), "Thursday Sep 3")
        // An unparseable day is the server's day, printed as it came.
        XCTAssertEqual(Design.day("not a date"), "not a date")
        XCTAssertEqual(Design.day(nil), "—")
    }

    func testGroupedNumbers() {
        XCTAssertEqual(Design.number(7234), "7\u{202F}234")
        XCTAssertEqual(Design.number(55), "55")
        XCTAssertEqual(Design.number(6.8), "6.8")
        XCTAssertEqual(Design.number(422.0), "422")
    }

    func testPlurals() {
        XCTAssertEqual(Design.plural(1, "meal", "meals"), "1 meal")
        XCTAssertEqual(Design.plural(2, "meal", "meals"), "2 meals")
        XCTAssertEqual(Design.plural(0, "type", "types"), "0 types")
    }

    /// The four state words the engine writes, and nothing else on the
    /// spectrum. An unknown word goes grey rather than inventing a state.
    func testStateWordsMapOntoTheSpectrum() {
        XCTAssertEqual(Design.colour(forWord: "off"), Design.bad)
        XCTAssertEqual(Design.colour(forWord: "borderline"), Design.warn)
        XCTAssertEqual(Design.colour(forWord: "good"), Design.ok)
        XCTAssertEqual(Design.colour(forWord: "optimal"), Design.ok)
        XCTAssertEqual(Design.colour(forWord: "never measured"), Design.none)
        XCTAssertEqual(Design.colour(forWord: "whatever"), Design.none)
    }

    func testToneMapsOntoTheSpectrum() {
        XCTAssertEqual(Design.colour(forTone: "bad"), Design.bad)
        XCTAssertEqual(Design.colour(forTone: "warn"), Design.warn)
        XCTAssertEqual(Design.colour(forTone: "ok"), Design.ok)
        XCTAssertEqual(Design.colour(forTone: "none"), Design.none)
    }

    /// The tokens themselves, against `system.css`'s `:root`.
    func testTheTokensAreTheMockupsTokens() {
        XCTAssertEqual(Design.rInner, 13)
        XCTAssertEqual(Design.rCard, 21)
        XCTAssertEqual(Design.rHero, 34)
        XCTAssertEqual([Design.s3, Design.s5, Design.s8, Design.s13,
                        Design.s21, Design.s34, Design.s55],
                       [3, 5, 8, 13, 21, 34, 55])
        XCTAssertEqual([Design.Size.xs.rawValue, Design.Size.sm.rawValue,
                        Design.Size.md.rawValue, Design.Size.lg.rawValue,
                        Design.Size.xl.rawValue],
                       [11, 13, 15, 21, 34])
    }

    /// The one dark surface is one colour in both appearances: navy does not
    /// have a dark-mode twin, because it is already the dark one.
    func testNavyIsTheSameInBothAppearances() {
        let light = UIColor(Design.navy).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: .light))
        let dark = UIColor(Design.navy).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: .dark))
        XCTAssertEqual(light, dark)
    }

    /// The cream in light, the near-black in dark, from the same token.
    func testTheCanvasFlipsWithTheAppearance() {
        let light = UIColor(Design.canvas).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: .light))
        let dark = UIColor(Design.canvas).resolvedColor(
            with: UITraitCollection(userInterfaceStyle: .dark))
        XCTAssertNotEqual(light, dark)
        XCTAssertEqual(light, UIColor(rgb: 0xfdf5ec))
        XCTAssertEqual(dark, UIColor(rgb: 0x121110))
    }
}
