import XCTest
@testable import OpenVitals

/// A screen opens on the last good answer to its GET; sign-out and a server
/// switch throw every answer away.
final class ApiCacheTests: XCTestCase {

    override func tearDown() {
        Api.clearCache()
        super.tearDown()
    }

    func testAStoredGetReadsBackUntilTheCacheIsCleared() throws {
        let req = Api.get("api/score/days", query: ["n": "91", "to": "2026-09-01"])
        let body = #"{"rows":[]}"#
        Api.store(Data(body.utf8), for: req)
        let back: Api.ResearchList? = Api.cached(req)
        XCTAssertEqual(back, Api.ResearchList(rows: []))

        // Another query is another file.
        let other = Api.get("api/score/days", query: ["n": "7"])
        let none: Api.ResearchList? = Api.cached(other)
        XCTAssertNil(none)

        Api.clearCache()
        let gone: Api.ResearchList? = Api.cached(req)
        XCTAssertNil(gone)
    }

    func testAWriteIsNeverCached() {
        var req = Api.get("api/habits")
        req.httpMethod = "POST"
        Api.store(Data(#"{"rows":[]}"#.utf8), for: req)
        let back: Api.ResearchList? = Api.cached(Api.get("api/habits"))
        XCTAssertNil(back)
    }
}
