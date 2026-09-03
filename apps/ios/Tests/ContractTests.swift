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
        XCTAssertEqual(today.sentence.tone, "bad")
        XCTAssertFalse(today.sentence.head.isEmpty)
        XCTAssertEqual(today.status.off, 7)
        XCTAssertEqual(today.status.counted, 52)
        XCTAssertEqual(today.status.drawDate, "2026-08-01")
        XCTAssertEqual(today.blood.total, 52)
        XCTAssertEqual(today.blood.nextDraw?.codes.first?.code, "TPO")
        XCTAssertEqual(today.plan.headline, "2 / 7")
    }

    /// The twelve systems, each with a state word from the four the design
    /// system allows, and a number that is never printed without its unit.
    func testTheTwelveSystemsCarryStateAndUnits() throws {
        let today = try decode("today", as: Api.Today.self)
        XCTAssertEqual(today.systems.count, 12)
        let words = Set(["off", "borderline", "good", "never measured"])
        for system in today.systems {
            XCTAssertTrue(words.contains(system.word), system.word)
            if system.value != nil { XCTAssertNotNil(system.unit, system.name) }
        }
        let thyroid = try XCTUnwrap(today.systems.first { $0.id == "thyroid" })
        XCTAssertEqual(thyroid.value, 320)
        XCTAssertEqual(thyroid.reading, "TPO 320 IU/mL")
        let ldl = try XCTUnwrap(today.systems.first { $0.id == "lipids" })
        XCTAssertEqual(ldl.value, 131)
        XCTAssertEqual(ldl.unit, "mg/dL")
    }

    /// Nothing measured is a hollow dot and no number, not a zero.
    func testNeverMeasuredHasNoNumber() throws {
        let today = try decode("today", as: Api.Today.self)
        let sex = try XCTUnwrap(today.systems.first { $0.id == "sex-hormones" })
        XCTAssertEqual(sex.word, "never measured")
        XCTAssertNil(sex.value)
        XCTAssertNil(sex.reading)
    }

    // MARK: - GET /api/body

    func testBodyDecodes() throws {
        let body = try decode("body", as: Api.BodyDay.self)
        XCTAssertEqual(body.day, "2026-09-02")
        XCTAssertEqual(body.synced.types, 27)
        XCTAssertEqual(Design.clock(body.synced.lastAt), "08:12")
        let steps = try XCTUnwrap(body.rows.first { $0.type == "StepCount" })
        XCTAssertEqual(steps.value, 7234)
        XCTAssertEqual(steps.unit, "steps")
        XCTAssertEqual(steps.provenance, "StepCount · iPhone · Sep 2")
    }

    /// A type with nothing in it is listed and says so; it is never dropped.
    func testAnEmptyTypeIsStillARow() throws {
        let body = try decode("body", as: Api.BodyDay.self)
        let empty = try XCTUnwrap(body.rows.first { $0.value == nil })
        XCTAssertEqual(empty.word, "never measured")
        XCTAssertFalse(empty.note.isEmpty)
        XCTAssertFalse(empty.display.isEmpty)
    }

    /// Every row names its HealthKit type and the device that wrote it.
    func testEveryBodyRowIsSourcedAndDated() throws {
        let body = try decode("body", as: Api.BodyDay.self)
        XCTAssertFalse(body.rows.isEmpty)
        for row in body.rows {
            XCTAssertFalse(row.source.isEmpty, row.name)
            XCTAssertFalse(row.when.isEmpty, row.name)
            XCTAssertTrue(row.identifier.hasPrefix("HK"), row.identifier)
        }
    }

    // MARK: - GET /api/plan/today, POST /api/habits

    func testPlanTodayDecodes() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        XCTAssertEqual(plan.day, "2026-09-03")
        XCTAssertEqual(plan.done, 2)
        XCTAssertEqual(plan.total, 7)
        XCTAssertEqual(plan.rows.count, 7)
        XCTAssertEqual(plan.rows.filter(\.done).count, plan.done)
    }

    func testEveryPlanRowCarriesOneOfTheFourTags() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        let tags = Set(["protocol", "goal", "every day", "suggested"])
        for row in plan.rows {
            XCTAssertTrue(tags.contains(row.tag), row.tag)
            XCTAssertFalse(row.why.isEmpty, row.title)
        }
    }

    /// The badge is the adherence when there is one, else the tag. A number
    /// there always wears its per-cent sign.
    func testTheBadgeIsAdherenceOrTheTag() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        let selenium = try XCTUnwrap(plan.rows.first { $0.itemId == "pi_selenium" })
        XCTAssertEqual(selenium.badge, "86 %")
        let steps = try XCTUnwrap(plan.rows.first { $0.itemId == "pi_steps" })
        XCTAssertEqual(steps.badge, "every day")
    }

    /// Ticking a row moves that row and the counter, and nothing else.
    func testTickingOneRowMovesTheCounter() throws {
        let plan = try decode("plan-today", as: Api.PlanDay.self)
        let moved = plan.with("pi_resistance", done: true)
        XCTAssertEqual(moved.done, 3)
        XCTAssertEqual(moved.total, 7)
        XCTAssertTrue(try XCTUnwrap(moved.rows.first { $0.id == "pi_resistance" }).done)
        XCTAssertEqual(moved.rows.count, plan.rows.count)
        XCTAssertEqual(moved.with("pi_resistance", done: false), plan)
    }

    func testHabitAckDecodes() throws {
        let ack = try decode("habits", as: Api.HabitAck.self)
        XCTAssertEqual(ack.ok, true)
    }

    /// The route as it stands answers with the habit row, not `{ok:true}`.
    /// Both have to decode, because the phone cannot choose which it gets.
    func testTheHabitRowAlsoDecodes() throws {
        let row = Data(#"{"itemId":"pi_iron","day":"2026-09-03","done":true}"#.utf8)
        let ack = try JSONDecoder().decode(Api.HabitAck.self, from: row)
        XCTAssertNil(ack.ok)
        XCTAssertEqual(ack.done, true)
    }

    // MARK: - GET/POST /api/meals

    func testMealsDecodes() throws {
        let day = try decode("meals", as: Api.MealDay.self)
        XCTAssertEqual(day.day, "2026-09-03")
        XCTAssertEqual(day.meals.count, 2)
        XCTAssertEqual(day.fromPhoto, 1)
        XCTAssertEqual(day.totals.kcal, 832)
        XCTAssertEqual(day.totals.proteinG, 62)
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
    }

    /// A photo's numbers say "est.". A meal logged in Health does not.
    func testEstimatesAreLabelledAndLoggedMealsAreNot() throws {
        let day = try decode("meals", as: Api.MealDay.self)
        let lunch = try XCTUnwrap(day.meals.first { $0.photo != nil })
        XCTAssertTrue(lunch.totals.estimated)
        XCTAssertEqual(lunch.totals.mark, " est.")
        XCTAssertTrue(lunch.items.allSatisfy(\.estimated))
        XCTAssertEqual(lunch.basis, "from a photo · 13:05")

        let breakfast = try XCTUnwrap(day.meals.first { $0.photo == nil })
        XCTAssertFalse(breakfast.totals.estimated)
        XCTAssertEqual(breakfast.totals.mark, "")
        XCTAssertEqual(breakfast.basis, "logged in Health · 08:05")
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
        XCTAssertEqual(meal.id, "meal_lunch")
        XCTAssertEqual(meal.items.count, 4)
        XCTAssertEqual(meal.totals.kcal, 422)
        XCTAssertEqual(meal.moves.count, 3)
        XCTAssertEqual(meal.items.first?.name, "Sardines in olive oil")
        XCTAssertEqual(meal.items.first?.portion, "1 tin · ~90 g")
    }

    // MARK: - GET /api/genome, GET /api/research

    func testGenomeDecodes() throws {
        let genome = try decode("genome", as: Api.Genome.self)
        XCTAssertEqual(genome.file?.name, "AncestryDNA.txt")
        XCTAssertEqual(genome.verdicts.count, 3)
        let coeliac = try XCTUnwrap(genome.verdicts.first { $0.conditionId == "coeliac" })
        // An absent haplotype is a verdict, not a gap: direction down, no test.
        XCTAssertEqual(coeliac.direction, "down")
        XCTAssertTrue(coeliac.absent)
        XCTAssertFalse(coeliac.testNeeded)
        XCTAssertFalse(genome.genes.first?.rsids.isEmpty ?? true)
    }

    func testResearchDecodes() throws {
        let list = try decode("research", as: Api.ResearchList.self)
        XCTAssertEqual(list.rows.count, 2)
        let moving = try XCTUnwrap(list.rows.first { $0.moves != nil })
        XCTAssertEqual(moving.moves?.direction, "up")
        XCTAssertEqual(moving.grade, "B")
        XCTAssertNil(moving.seenAt)
        // No rule out of the intake means no move, printed as "nothing for you".
        XCTAssertNil(list.rows.last?.moves)
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
    func testFixturesAreOffUnlessAsked() {
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
        XCTAssertEqual(some?.status.off, 7)
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
