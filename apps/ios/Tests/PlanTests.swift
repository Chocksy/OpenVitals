import XCTest
@testable import OpenVitals

/// Phase 38 part D4: the Plan model's adopt, undo and tick through its seams,
/// on the canned `plan-today` fixture. Nothing here reaches a server.
@MainActor
final class PlanTests: XCTestCase {

    private struct Boom: Error {}

    private func canned() throws -> Api.PlanDay {
        let url = try XCTUnwrap(ContractTests.fixtureURL("plan-today"))
        return try JSONDecoder().decode(Api.PlanDay.self, from: Data(contentsOf: url))
    }

    /// The canned day after the suggestion was adopted: the server hands the
    /// row back as a protocol item and it stops being a suggestion.
    private func adoptedDay(_ plan: Api.PlanDay, itemId: String) -> Api.PlanDay {
        let rows = plan.rows.map { row -> Api.PlanDay.Row in
            guard row.tag == "suggested" else { return row }
            return .init(itemId: itemId, adoptId: nil, time: nil, slot: nil,
                         title: row.title, why: row.why, tag: "protocol",
                         done: false, adherence: nil)
        }
        return Api.PlanDay(day: plan.day, done: plan.done, total: plan.total, rows: rows)
    }

    /// A model over the canned day, its writes counted and never sent.
    private func model(_ plan: Api.PlanDay) -> (PlanModel, Counter) {
        let m = PlanModel()
        let c = Counter()
        m.plan = plan
        m.fetch = { plan }
        m.fetchPapers = { [] }
        m.changed = { c.changed += 1 }
        return (m, c)
    }

    private final class Counter {
        var changed = 0
        var adopts: [String] = []
        var undos: [[String]] = []
    }

    func testTheFixtureSuggestionCarriesItsAdoptId() throws {
        let plan = try canned()
        let s = try XCTUnwrap(plan.rows.first { $0.tag == "suggested" })
        XCTAssertNil(s.itemId)
        XCTAssertEqual(s.adoptId?.hasPrefix("plan:"), true)
        for row in plan.rows where row.tag != "suggested" { XCTAssertNil(row.adoptId) }
    }

    func testTheHeaderCountsAdoptedRowsOnly() throws {
        let (m, _) = model(try canned())
        XCTAssertEqual(m.adopted.count, 5)
        XCTAssertEqual(m.value, "1/5")
        XCTAssertEqual(m.progress, 0.2, accuracy: 0.0001)
        XCTAssertEqual(m.suggested.count, 1)
        XCTAssertEqual(m.line?.hasSuffix("· 1 suggested"), true)
    }

    /// A person with nothing adopted and nothing suggested: "—", no crash.
    func testNoPlanDrawsTheDash() {
        let empty = Api.PlanDay(day: "2026-08-31", done: 0, total: 0, rows: [])
        let (m, _) = model(empty)
        XCTAssertNil(m.value)
        XCTAssertEqual(m.progress, 0)
        XCTAssertTrue(m.suggested.isEmpty)
        XCTAssertTrue(m.adopted.isEmpty)
        let none = PlanModel()
        XCTAssertNil(none.value)
        XCTAssertNil(none.line)
    }

    func testAdoptSuccessRemovesTheCardReloadsAndOffersUndo() async throws {
        let plan = try canned()
        let (m, c) = model(plan)
        let row = try XCTUnwrap(m.suggested.first)
        let after = adoptedDay(plan, itemId: "pi_new")
        m.fetch = { after }
        m.sendAdopt = { id in
            c.adopts.append(id)
            return Api.Adopted(ok: true, id: "pi_new", adopted: nil, already: nil, removed: nil)
        }
        await m.adopt(row)
        XCTAssertEqual(c.adopts, [row.adoptId!])
        XCTAssertTrue(m.suggested.isEmpty, "the card left")
        XCTAssertEqual(m.adopted.count, 6, "the reload brought the new row")
        XCTAssertEqual(m.pill?.kind, .added(adoptId: row.adoptId!, removeIds: ["pi_new"]))
        XCTAssertEqual(m.pill?.canUndo, true)
        XCTAssertEqual(c.changed, 1)
        XCTAssertTrue(m.adopting.isEmpty)
    }

    func testAdoptFailureKeepsTheCardAndSaysSo() async throws {
        let (m, c) = model(try canned())
        let row = try XCTUnwrap(m.suggested.first)
        m.sendAdopt = { _ in throw Boom() }
        await m.adopt(row)
        XCTAssertEqual(m.suggested.map(\.id), [row.id], "the card stays")
        XCTAssertEqual(m.pill?.kind, .failed)
        XCTAssertEqual(m.pill?.text, "That did not save")
        XCTAssertEqual(m.pill?.canUndo, false)
        XCTAssertEqual(c.changed, 0)
        XCTAssertTrue(m.adopting.isEmpty, "a failed adopt can be tried again")
    }

    func testUndoPostsTheRemoveIdsAndBringsTheCardBack() async throws {
        let plan = try canned()
        let (m, c) = model(plan)
        let row = try XCTUnwrap(m.suggested.first)
        let after = adoptedDay(plan, itemId: "pi_new")
        m.fetch = { after }
        m.sendAdopt = { _ in Api.Adopted(ok: true, id: "pi_new", adopted: nil,
                                          already: nil, removed: nil) }
        m.sendUndo = { c.undos.append($0) }
        await m.adopt(row)
        m.fetch = { plan }
        await m.undo()
        XCTAssertEqual(c.undos, [["pi_new"]])
        XCTAssertNil(m.pill)
        XCTAssertEqual(m.suggested.map(\.id), [row.id], "the card is back")
        XCTAssertEqual(m.adopted.count, 5)
        XCTAssertEqual(c.changed, 2)
    }

    func testAFailedUndoSaysSoAndKeepsTheItem() async throws {
        let plan = try canned()
        let (m, c) = model(plan)
        let row = try XCTUnwrap(m.suggested.first)
        m.sendAdopt = { _ in Api.Adopted(ok: true, id: "pi_new", adopted: nil,
                                          already: nil, removed: nil) }
        m.sendUndo = { _ in throw Boom() }
        await m.adopt(row)
        await m.undo()
        XCTAssertEqual(m.pill?.kind, .failed)
        XCTAssertTrue(m.suggested.isEmpty)
        XCTAssertEqual(c.changed, 1)
    }

    /// An action that was already on the protocol is an older item: undoing
    /// it would delete that, so the pill offers no undo.
    func testAlreadyOnThePlanOffersNoUndo() async throws {
        let (m, c) = model(try canned())
        let row = try XCTUnwrap(m.suggested.first)
        m.sendAdopt = { _ in Api.Adopted(ok: true, id: "pi_old", adopted: nil,
                                          already: true, removed: nil) }
        m.sendUndo = { c.undos.append($0) }
        await m.adopt(row)
        XCTAssertEqual(m.pill?.kind, .already)
        XCTAssertEqual(m.pill?.canUndo, false)
        await m.undo()
        XCTAssertTrue(c.undos.isEmpty)
    }

    /// Review focus 4: the second tap while the first runs is ignored.
    func testAdoptTwiceFastPostsOnce() async throws {
        let (m, c) = model(try canned())
        let row = try XCTUnwrap(m.suggested.first)
        var release: CheckedContinuation<Void, Never>?
        m.sendAdopt = { id in
            c.adopts.append(id)
            await withCheckedContinuation { release = $0 }
            return Api.Adopted(ok: true, id: "pi_new", adopted: nil, already: nil, removed: nil)
        }
        let first = Task { await m.adopt(row) }
        while release == nil { await Task.yield() }
        XCTAssertEqual(m.adopting, [row.adoptId!])
        await m.adopt(row)
        XCTAssertEqual(c.adopts.count, 1, "the second tap did nothing")
        release?.resume()
        await first.value
        XCTAssertEqual(c.adopts.count, 1)
        XCTAssertTrue(m.adopting.isEmpty)
    }

    // MARK: add your own, and new suggestions

    func testAddSendsTheTrimmedWordsAndSlotThenClearsAndReloads() async throws {
        let plan = try canned()
        let (m, c) = model(plan)
        let after = adoptedDay(plan, itemId: "pi_mine")
        m.fetch = { after }
        var sent: [(String, String?)] = []
        m.sendAdd = { sent.append(($0, $1)) }
        m.draft = "  10 minutes of stretching \n"
        m.slot = "evening"
        XCTAssertTrue(m.canAdd)
        await m.add()
        XCTAssertEqual(sent.map(\.0), ["10 minutes of stretching"])
        XCTAssertEqual(sent.map(\.1), ["evening"])
        XCTAssertEqual(m.pill?.kind, .saved)
        XCTAssertEqual(m.pill?.text, "Added to your plan")
        XCTAssertEqual(m.pill?.canUndo, false)
        XCTAssertEqual(m.adopted.count, 6, "the reload brought the new row")
        XCTAssertEqual(m.draft, "")
        XCTAssertNil(m.slot)
        XCTAssertEqual(c.changed, 1)
        XCTAssertFalse(m.adding)
    }

    func testAddFailureKeepsTheWordsAndSaysSo() async throws {
        let (m, c) = model(try canned())
        m.sendAdd = { _, _ in throw Boom() }
        m.draft = "walk after dinner"
        m.slot = "dinner"
        await m.add()
        XCTAssertEqual(m.pill?.kind, .failed)
        XCTAssertEqual(m.draft, "walk after dinner")
        XCTAssertEqual(m.slot, "dinner")
        XCTAssertEqual(c.changed, 0)
        XCTAssertFalse(m.adding)
    }

    func testBlankWordsAddNothing() async throws {
        let (m, _) = model(try canned())
        var sent = 0
        m.sendAdd = { _, _ in sent += 1 }
        m.draft = "  \n "
        XCTAssertFalse(m.canAdd)
        await m.add()
        XCTAssertEqual(sent, 0)
        XCTAssertNil(m.pill)
    }

    func testNewSuggestionsReloadAndBringBackHiddenCards() async throws {
        let plan = try canned()
        let (m, _) = model(plan)
        let row = try XCTUnwrap(m.suggested.first)
        m.sendAdopt = { _ in Api.Adopted(ok: true, id: "pi_new", adopted: nil,
                                          already: nil, removed: nil) }
        await m.adopt(row)
        XCTAssertFalse(m.gone.isEmpty)
        var fetched = 0
        m.fetch = { fetched += 1; return plan }
        m.sendSuggest = {}
        await m.suggest()
        XCTAssertEqual(fetched, 1, "the plan reloaded")
        XCTAssertTrue(m.gone.isEmpty)
        XCTAssertEqual(m.suggested.map(\.id), [row.id])
        XCTAssertEqual(m.suggestError, "")
        XCTAssertFalse(m.suggesting)
    }

    func testNewSuggestionsFailureSaysSo() async throws {
        let (m, _) = model(try canned())
        m.sendSuggest = { throw Boom() }
        await m.suggest()
        XCTAssertTrue(m.suggestError.hasPrefix("No new suggestions"))
        XCTAssertFalse(m.suggesting, "it can be tried again")
    }

    func testNewSuggestionsTwiceFastPostsOnce() async throws {
        let (m, _) = model(try canned())
        var posts = 0
        var release: CheckedContinuation<Void, Never>?
        m.sendSuggest = {
            posts += 1
            await withCheckedContinuation { release = $0 }
        }
        let first = Task { await m.suggest() }
        while release == nil { await Task.yield() }
        XCTAssertTrue(m.suggesting)
        await m.suggest()
        XCTAssertEqual(posts, 1, "the second tap did nothing")
        release?.resume()
        await first.value
        XCTAssertEqual(posts, 1)
        XCTAssertFalse(m.suggesting)
    }

    func testATickThatFailsRollsBack() async throws {
        let plan = try canned()
        let (m, c) = model(plan)
        let pair = try XCTUnwrap(m.adopted.first { !$0.row.done })
        m.send = { _, _, _ in throw Boom() }
        await m.tick(pair.id, pair.row)
        XCTAssertEqual(m.plan, plan)
        XCTAssertTrue(m.error.hasPrefix("That tick did not save"))
        XCTAssertEqual(m.stored, 0)
        XCTAssertEqual(c.changed, 0)
    }

    func testAStoredTickCountsAndTellsToday() async throws {
        let (m, c) = model(try canned())
        let pair = try XCTUnwrap(m.adopted.first { !$0.row.done })
        var sent: [(String, Bool)] = []
        m.send = { id, _, done in sent.append((id, done)) }
        await m.tick(pair.id, pair.row)
        XCTAssertEqual(sent.map(\.0), [pair.row.itemId!])
        XCTAssertEqual(sent.map(\.1), [true])
        XCTAssertEqual(m.value, "2/5")
        XCTAssertEqual(m.stored, 1)
        XCTAssertEqual(c.changed, 1)
    }
}
