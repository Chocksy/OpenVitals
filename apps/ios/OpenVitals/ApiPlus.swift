import Foundation

extension Api {
    /// `POST /api/habits/backfill`: "I took it most days" from the item's
    /// start to `until` (YYYY-MM-DD), on days with no tick yet.
    static func backfill(itemId: String, until: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/habits/backfill"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["itemId": itemId, "until": until])
        let (_, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
