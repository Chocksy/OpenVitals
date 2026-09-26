import SwiftUI
import XCTest
@testable import OpenVitals

/// Phase 39 I: the hunch contract, the desk, and the new pieces drawn in a
/// real window (the `BloodTests` pattern). The PNGs land in /tmp/p39i.
@MainActor
final class HunchTests: XCTestCase {

    private func json(_ name: String) throws -> [String: Any] {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url))
            as? [String: Any])
    }

    private func decode<T: Decodable>(_ name: String, as: T.Type) throws -> T {
        let url = try XCTUnwrap(ContractTests.fixtureURL(name), "no fixture named \(name)")
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    private func decode<T: Decodable>(_ object: [String: Any], as: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
    }

    // MARK: the contract

    func testHunchesDecode() throws {
        let body = try decode("hunches", as: Api.HunchesBody.self)
        XCTAssertEqual(body.open.map(\.kind), ["cluster", "drift", "step", "gap"])
        XCTAssertEqual(body.goodNews.map(\.kind), ["good_news"])
        XCTAssertEqual(body.glance.count, 5)
        let gap = try XCTUnwrap(body.open.first { $0.kind == "gap" })
        XCTAssertNil(gap.mini.band)
        XCTAssertEqual(gap.action.kind, "book")
        let drift = try XCTUnwrap(body.open.first { $0.kind == "drift" })
        XCTAssertEqual(drift.mini.goal?.compactMap { $0 }, [70, 100])
        XCTAssertEqual(drift.number.value, 131)
    }

    func testTheCaseDecodes() throws {
        let c = try decode("hunch", as: Api.HunchCase.self)
        XCTAssertEqual(c.row.kind, "cluster")
        XCTAssertEqual(c.row.system, "iron")
        XCTAssertEqual(c.explanations.count, 4)
        XCTAssertEqual(c.explanations.map(\.weight).reduce(0, +), 1, accuracy: 0.01)
        XCTAssertEqual(c.question?.chips.count, 4)
        XCTAssertNil(c.answer)
        XCTAssertEqual(c.test?.priceLine, "10 EUR · estimated")
        XCTAssertEqual(c.explanations.first?.check?.words, "over 10")
        XCTAssertEqual(c.rule.count, 3)
        XCTAssertEqual(c.unknowns.count, 5)
        XCTAssertEqual(c.firedAt, ["2026-04-23"])
        XCTAssertEqual(c.markers.map(\.code), ["homocysteine", "ferritin", "vitamin_d", "vitamin_b12"])
        XCTAssertEqual(c.series.last?.value, 79.6)
    }

    /// A case from an older server: only the row. Everything past it has a
    /// default.
    func testAThinCaseStillDecodes() throws {
        var row = try json("hunch")
        for key in ["say", "series", "bandAt", "explanations", "question", "answer", "test",
                    "predictions", "writtenAt", "outcome", "outcomeLine", "rule", "unknowns",
                    "firedAt", "markers"] { row[key] = nil }
        let c = try decode(row, as: Api.HunchCase.self)
        XCTAssertEqual(c.row.line, try decode("hunch", as: Api.HunchCase.self).row.line)
        XCTAssertTrue(c.explanations.isEmpty && c.series.isEmpty && c.markers.isEmpty)
    }

    func testTodayCarriesThePhase39Fields() throws {
        let today = try decode("today", as: Api.Today.self)
        XCTAssertEqual(today.heading?.count, 12)
        XCTAssertEqual(today.hunches?.count, 5)
        XCTAssertEqual(today.confidence?.line, "Last draw 156 days ago · 11 of 12 systems · 4 open")
        let ldl = try XCTUnwrap(today.goals.first { $0.code == "ldl_cholesterol" })
        XCTAssertEqual(ldl.recentSlope?.perYear ?? 0, 16.03, accuracy: 0.01)
        XCTAssertEqual(ldl.landing?.date, "2026-12-01")
    }

    /// Old caches and old servers: no phase 39 key anywhere still decodes.
    func testAnOldServerStillDecodes() throws {
        var today = try json("today")
        for key in ["hunches", "heading", "confidence"] { today[key] = nil }
        today["goals"] = (today["goals"] as? [[String: Any]])?.map { goal in
            var g = goal
            g["recentSlope"] = nil
            g["landing"] = nil
            return g
        }
        let old = try decode(today, as: Api.Today.self)
        XCTAssertNil(old.hunches)
        XCTAssertNil(old.heading)

        var markers = try json("markers")
        markers["markers"] = (markers["markers"] as? [[String: Any]])?.map { m in
            var x = m
            x["personalBand"] = nil
            x["z"] = nil
            x["signal"] = nil
            return x
        }
        let thin = try decode(markers, as: Api.Markers.self)
        XCTAssertEqual(thin.markers.count, 132)
        XCTAssertTrue(thin.markers.allSatisfy { $0.personalBand == nil && $0.signal == nil })
    }

    func testMarkersCarryTheirOwnBand() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        XCTAssertEqual(markers.markers.filter { $0.personalBand != nil }.count, 49)
        XCTAssertEqual(markers.markers.filter { $0.signal != nil }.count, 8)
        let ferritin = try XCTUnwrap(markers.markers.first { $0.code == "ferritin" })
        XCTAssertEqual(ferritin.signal?.kind, "cluster")
        let band = try XCTUnwrap(ferritin.personalBand)
        XCTAssertEqual(band.low, band.median - 2.5 * band.sd, accuracy: 1e-9)
    }

    // MARK: the arithmetic

    func testAnAnswerReweightsTheServersWay() throws {
        let c = try decode("hunch", as: Api.HunchCase.self)
        let chip = try XCTUnwrap(c.question?.chips.first)
        let after = c.answered(chip.id)
        XCTAssertEqual(after.answer, chip.id)
        XCTAssertEqual(after.explanations.map(\.weight).reduce(0, +), 1, accuracy: 1e-9)
        for (was, now) in zip(c.explanations, after.explanations) {
            let favoured = chip.favours.contains(was.id)
            // A favoured one grows against the rest; the others shrink.
            XCTAssertEqual(now.weight > was.weight, favoured, was.id)
        }
        // An unknown chip changes nothing but the answer.
        XCTAssertEqual(c.answered("nope").explanations, c.explanations)
    }

    func testWritingItDownFillsThePredictions() throws {
        let c = try decode("hunch", as: Api.HunchCase.self)
        let w = c.written(on: "2026-09-26")
        XCTAssertEqual(w.writtenAt, "2026-09-26")
        XCTAssertEqual(w.row.state, "testing")
        XCTAssertEqual(w.row.action.kind, "result")
        XCTAssertEqual(w.predictions?.count, c.explanations.filter { $0.predicts != nil }.count)
    }

    func testTheCorridorOrder() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        let order = BloodView.corridorOrder(markers.markers)
        XCTAssertEqual(order.count, markers.markers.count)
        let outside = order.prefix { abs($0.z ?? 0) >= 2.5 }
        XCTAssertEqual(outside.count, markers.markers.filter { abs($0.z ?? 0) >= 2.5 }.count)
        let next = order.dropFirst(outside.count).prefix { $0.signal != nil }
        XCTAssertEqual(next.count, markers.markers.filter { abs($0.z ?? 0) < 2.5 && $0.signal != nil }.count)
        let eos = try XCTUnwrap(markers.markers.first { $0.code == "eosinophils_abs" })
        XCTAssertEqual(CorridorRow.status(eos).word, "above your band")
    }

    func testTheScaleKeepsTheOwnCorridorReadable() {
        // A wide lab range far from the draws is left off the scale.
        let s = CorridorScale(values: [79.6, 94.4],
                              bands: [Api.PersonalBand(median: 113, sd: 15.5, n: 4, provisional: true)],
                              lab: [22, 322])
        XCTAssertLessThan(s.hi, 322)
        XCTAssertGreaterThanOrEqual(s.lo, 0)
        XCTAssertEqual(CorridorChart.brokenEdge([1, 1.1, 0.9, 1.0, 2, 2.1])?.value, 1.1)
        XCTAssertNil(CorridorChart.brokenEdge([1, 2, 3]))
    }

    func testTheDeskAnswersThroughItsSeams() async throws {
        let c = try decode("hunch", as: Api.HunchCase.self)
        let desk = HunchDesk()
        var sent: [String] = []
        desk.fetch = { _ in c }
        desk.sendAnswer = { id, chip in sent.append("answer \(chip)"); return c.answered(chip) }
        desk.sendTest = { _ in sent.append("test"); return c.written(on: "2026-09-26") }
        desk.sendSeen = { id in sent.append("seen \(id)") }

        await desk.toggleChips(c.id)
        XCTAssertEqual(desk.chipsOpen, c.id)
        XCTAssertNotNil(desk.cases[c.id])
        await desk.answer(c.id, chip: "c1")
        XCTAssertNil(desk.chipsOpen)
        XCTAssertEqual(desk.settled[c.id], "Noted")
        XCTAssertEqual(desk.cases[c.id]?.answer, "c1")
        await desk.acceptTest(c.id)
        XCTAssertEqual(desk.cases[c.id]?.writtenAt, "2026-09-26")
        await desk.seen("x")
        XCTAssertEqual(desk.settled["x"], "Seen")
        XCTAssertEqual(sent, ["answer c1", "test", "seen x"])

        // A failed fetch says so and leaves no case.
        let broken = HunchDesk()
        broken.fetch = { _ in throw Api.Failure(status: 500, message: "down") }
        await broken.load("y")
        XCTAssertNil(broken.cases["y"])
        XCTAssertNotNil(broken.failed["y"])
    }

    // MARK: drawn

    private func hosted(_ view: some View, height: CGFloat = 874) throws -> UIImage {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: height)
        window.overrideUserInterfaceStyle = .light
        window.rootViewController = UIHostingController(rootView: view)
        window.isHidden = false
        defer { window.isHidden = true }
        window.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(1.2))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        return UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
    }

    private func colours(_ image: UIImage, rows: ClosedRange<CGFloat>) -> Int {
        guard let cg = image.cgImage, let data = cg.dataProvider?.data,
              let bytes = CFDataGetBytePtr(data) else { return 0 }
        let scale = image.scale
        var seen = Set<UInt32>()
        let y0 = Int(rows.lowerBound * scale), y1 = min(cg.height - 1, Int(rows.upperBound * scale))
        for y in stride(from: y0, through: y1, by: 3) {
            for x in stride(from: 0, to: cg.width, by: 3) {
                let i = y * cg.bytesPerRow + x * 4
                seen.insert(UInt32(bytes[i]) << 16 | UInt32(bytes[i + 1]) << 8 | UInt32(bytes[i + 2]))
            }
        }
        return seen.count
    }

    private func keep(_ image: UIImage, _ name: String) {
        let dir = URL(fileURLWithPath: "/tmp/p39i")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? image.pngData()?.write(to: dir.appendingPathComponent("test-\(name).png"))
        let shot = XCTAttachment(image: image)
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func paper(_ view: some View) -> some View {
        ScrollView { view.padding(.vertical, 21) }
            .background { ZStack { Hy.paper; GrainTile() }.ignoresSafeArea() }
    }

    func testTheShelfDraws() throws {
        let today = try decode("today", as: Api.Today.self)
        let rows = try XCTUnwrap(today.hunches)
        let desk = HunchDesk()
        let image = try hosted(paper(WorthALook(rows: Array(rows.prefix(3)), desk: desk, more: rows.count)))
        keep(image, "shelf")
        XCTAssertGreaterThan(colours(image, rows: 30...300), 20, "the rows")
        // Answer open: the chips draw under the row.
        let c = try decode("hunch", as: Api.HunchCase.self)
        desk.cases[c.id] = c
        desk.chipsOpen = c.id
        let open = try hosted(paper(WorthALook(rows: [c.row], desk: desk)))
        keep(open, "shelf-chips")
        XCTAssertGreaterThan(colours(open, rows: 150...260), 10, "the chips")
    }

    func testTheCaseDraws() throws {
        let c = try decode("hunch", as: Api.HunchCase.self)
        let desk = HunchDesk()
        desk.cases[c.id] = c
        let image = try hosted(paper(HunchCaseView(id: c.id, desk: desk, close: {})
            .padding(.horizontal, 21)))
        keep(image, "case")
        XCTAssertGreaterThan(colours(image, rows: 60...300), 20, "the top")
        XCTAssertGreaterThan(colours(image, rows: 360...700), 20, "the lanes")

        // Depth 3: How we know with every fold open, on a tall window.
        let how = try hosted(paper(HowWeKnow(c: c, allOpen: true).padding(.horizontal, 21)),
                             height: 1600)
        keep(how, "how-we-know")
        XCTAssertGreaterThan(colours(how, rows: 100...1500), 30)

        // Answered and written down: the stamp and the predictions.
        desk.cases[c.id] = c.answered("c1").written(on: "2026-09-26")
        let done = try hosted(paper(HunchCaseView(id: c.id, desk: desk).padding(.horizontal, 21)))
        keep(done, "case-written")
        XCTAssertNotNil(done.cgImage)
    }

    func testTheCorridorRowDraws() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        let eos = try XCTUnwrap(markers.markers.first { $0.code == "eosinophils_abs" })
        let ldl = try XCTUnwrap(markers.markers.first { $0.code == "ldl_cholesterol" })
        struct Rows: View {
            let a: Api.Markers.Marker
            let b: Api.Markers.Marker
            @Namespace var ns
            var body: some View {
                VStack(spacing: 5) {
                    CorridorRow(marker: a, open: false, space: ns, toggle: {}, details: {}, how: { _ in })
                    CorridorRow(marker: b, open: true, space: ns, toggle: {}, details: {}, how: { _ in })
                }
                .padding(.horizontal, 21)
            }
        }
        let image = try hosted(paper(Rows(a: eos, b: ldl)))
        keep(image, "corridor-rows")
        XCTAssertGreaterThan(colours(image, rows: 25...80), 15, "the slim row")
        XCTAssertGreaterThan(colours(image, rows: 100...260), 20, "the open chart")
    }

    func testTheHeadingDraws() throws {
        let today = try decode("today", as: Api.Today.self)
        let image = try hosted(
            HeadingBlock(rows: try XCTUnwrap(today.heading), confidence: today.confidence)
                .padding(21)
                .frame(maxHeight: .infinity, alignment: .top)
                .background(Hy.plum))
        keep(image, "heading")
        XCTAssertGreaterThan(colours(image, rows: 20...200), 15)
    }

    func testBloodOpensOnHunches() throws {
        let markers = try decode("markers", as: Api.Markers.self)
        let today = try decode("today", as: Api.Today.self)
        let hunches = try decode("hunches", as: Api.HunchesBody.self)
        let image = try hosted(BloodView(markers: markers, today: today, hunches: hunches))
        keep(image, "blood")
        XCTAssertGreaterThan(colours(image, rows: 260...600), 30, "the Worth a look rows")

        // How we know pushed over the tab.
        let pushed = try hosted(BloodView(markers: markers, today: today, hunches: hunches,
                                          pushed: hunches.open[0].id))
        keep(pushed, "blood-pushed")
        XCTAssertGreaterThan(colours(pushed, rows: 60...300), 20)
    }
}
