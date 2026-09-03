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
                        "meal", "genome", "research"]

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
        // Nothing was written, so there is no writer and no day to print, and
        // the line collapses to the type rather than to stray separators.
        XCTAssertEqual(empty.provenance, empty.type)
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
            XCTAssertFalse(row.display.isEmpty, row.name)
            XCTAssertTrue(row.provenance.contains(row.type), row.provenance)
            XCTAssertFalse(row.provenance.contains(" ·  · "), row.provenance)
        }
    }

    // MARK: - GET /api/plan/today, POST /api/habits

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
        let first = try XCTUnwrap(plan.rows.first)
        let moved = plan.with(first.id, done: true)
        XCTAssertEqual(moved.done, plan.done + 1)
        XCTAssertEqual(moved.total, plan.total)
        XCTAssertTrue(try XCTUnwrap(moved.rows.first { $0.id == first.id }).done)
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
            XCTAssertFalse(meal.time.isEmpty)
            XCTAssertFalse(meal.items.isEmpty, meal.label)
        }
    }

    /// The card never totals anything itself: the server's total is the sum of
    /// the server's items, and this is where that is checked.
    func testTheTotalsAreTheItemsAddedUp() throws {
        let day = try decode("meals", as: Api.MealDay.self)
        for meal in day.meals {
            XCTAssertEqual(meal.items.map(\.kcal).reduce(0, +), meal.totals.kcal,
                           meal.label)
            XCTAssertEqual(meal.items.map(\.proteinG).reduce(0, +),
                           meal.totals.proteinG, meal.label)
            XCTAssertEqual(meal.items.map(\.carbsG).reduce(0, +),
                           meal.totals.carbsG, meal.label)
            XCTAssertEqual(meal.items.map(\.fatG).reduce(0, +),
                           meal.totals.fatG, meal.label)
        }
        XCTAssertEqual(day.meals.map(\.totals.kcal).reduce(0, +), day.totals.kcal)
        XCTAssertEqual(day.meals.map(\.totals.proteinG).reduce(0, +),
                       day.totals.proteinG)
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
        XCTAssertEqual(meal.basis,
                       (meal.photo == nil ? "logged in Health" : "from a photo")
                       + " · \(meal.time)")
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
