import XCTest
@testable import OpenVitals

/// The generated `DesignTokens.swift` against the CSS it came from.
///
/// The design system is `docs/mockups/v4/system.css`. `scripts/gen-design.py`
/// turns its two token columns into Swift. These tests parse the CSS again
/// and fail when either side has been edited on its own.
final class DesignTokensTests: XCTestCase {

    // ── the CSS, read from the repo when the test runs on the build
    //    machine, and from the bundled copy otherwise ──────────────────

    static let css: String = {
        let here = URL(fileURLWithPath: #filePath)          // …/Tests/…
        let repo = here
            .deletingLastPathComponent()                    // Tests
            .deletingLastPathComponent()                    // apps/ios
            .deletingLastPathComponent()                    // apps
            .deletingLastPathComponent()                    // repo root
            .appendingPathComponent("docs/mockups/v4/system.css")
        if let live = try? String(contentsOf: repo, encoding: .utf8) {
            return live
        }
        guard let url = Bundle(for: DesignTokensTests.self)
                .url(forResource: "system", withExtension: "css"),
              let copy = try? String(contentsOf: url, encoding: .utf8)
        else { return "" }
        return copy
    }()

    private func declarations(_ selector: String) -> [String: String] {
        CSSTokens.declarations(in: Self.css, selector: selector)
    }

    func testTheCSSIsReachable() {
        XCTAssertFalse(Self.css.isEmpty,
                       "neither the repo's system.css nor the bundled copy could be read")
        XCTAssertTrue(Self.css.contains("--canvas"))
    }

    func testTheLightColumnMatchesTheGeneratedFile() {
        XCTAssertEqual(declarations(":root"), DesignTokens.light,
                       "run: python3 apps/ios/scripts/gen-design.py")
    }

    func testTheDarkColumnMatchesTheGeneratedFile() {
        XCTAssertEqual(declarations(".dark, html[data-theme=\"dark\"]"),
                       DesignTokens.dark,
                       "run: python3 apps/ios/scripts/gen-design.py")
    }

    func testEveryColourConstantParsesBackToItsCSSValue() {
        let light = declarations(":root")
        let dark = declarations(".dark, html[data-theme=\"dark\"]")
        XCTAssertEqual(DesignTokens.colours.count, 24)
        for (name, pair) in DesignTokens.colours {
            XCTAssertEqual(CSSTokens.colour(light[name] ?? ""), pair.light,
                           "light \(name)")
            XCTAssertEqual(CSSTokens.colour(dark[name] ?? light[name] ?? ""),
                           pair.dark, "dark \(name)")
        }
    }

    func testEveryLengthConstantParsesBackToItsCSSValue() {
        let light = declarations(":root")
        XCTAssertEqual(DesignTokens.lengths.count, 20)
        for (name, value) in DesignTokens.lengths {
            XCTAssertEqual(CSSTokens.px(light[name] ?? ""), value, "\(name)")
        }
    }

    func testEveryDurationConstantParsesBackToItsCSSValue() {
        let light = declarations(":root")
        XCTAssertEqual(DesignTokens.durations.count, 12)
        for (name, value) in DesignTokens.durations {
            let css = CSSTokens.ms(light[name] ?? "")
            XCTAssertNotNil(css, "\(name)")
            XCTAssertEqual(css ?? .nan, value * 1000,
                           accuracy: 0.0001, "\(name)")
        }
    }

    func testTheFibonacciLadderAndTheFiveTypeSizes() {
        XCTAssertEqual([DesignTokens.s3, DesignTokens.s5, DesignTokens.s8,
                        DesignTokens.s13, DesignTokens.s21, DesignTokens.s34,
                        DesignTokens.s55],
                       [3, 5, 8, 13, 21, 34, 55])
        XCTAssertEqual([DesignTokens.typeXs, DesignTokens.typeSm,
                        DesignTokens.typeMd, DesignTokens.typeLg,
                        DesignTokens.typeXl],
                       [11, 13, 15, 21, 34])
        XCTAssertEqual([DesignTokens.rInner, DesignTokens.rCard,
                        DesignTokens.rHero], [13, 21, 34])
    }

    func testTheSpectrumIsNeverASurfaceAndNavyIsTheOnlyDarkOne() {
        // the one dark surface keeps its value in both columns
        XCTAssertEqual(DesignTokens.navy.light, DesignTokens.navy.dark)
        // lime is the accent on the add control, unchanged in dark
        XCTAssertEqual(DesignTokens.lime.light, DesignTokens.lime.dark)
    }
}

/// A very small CSS reader: enough for a token block.
enum CSSTokens {

    static func stripComments(_ css: String) -> String {
        var out = ""
        var rest = Substring(css)
        while let open = rest.range(of: "/*") {
            out += rest[rest.startIndex..<open.lowerBound]
            guard let close = rest.range(of: "*/", range: open.upperBound..<rest.endIndex)
            else { return out }
            rest = rest[close.upperBound...]
        }
        return out + rest
    }

    static func declarations(in css: String, selector: String) -> [String: String] {
        let clean = stripComments(css)
        var selectorStart = clean.startIndex
        var index = clean.startIndex
        while index < clean.endIndex {
            let ch = clean[index]
            if ch == "{" {
                let head = clean[selectorStart..<index]
                guard let close = clean[index...].firstIndex(of: "}") else { break }
                let body = clean[clean.index(after: index)..<close]
                if squeeze(head.split(separator: ";").last.map(String.init) ?? "")
                    == selector {
                    return parse(String(body))
                }
                index = clean.index(after: close)
                selectorStart = index
                continue
            }
            if ch == "}" {
                index = clean.index(after: index)
                selectorStart = index
                continue
            }
            index = clean.index(after: index)
        }
        return [:]
    }

    private static func squeeze(_ s: String) -> String {
        s.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    private static func parse(_ body: String) -> [String: String] {
        var out: [String: String] = [:]
        for line in body.split(separator: ";") {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = squeeze(String(line[line.startIndex..<colon]))
            guard name.hasPrefix("--") else { continue }
            out[name] = squeeze(String(line[line.index(after: colon)...]))
        }
        return out
    }

    static func colour(_ value: String) -> DesignTokens.Ink? {
        if value.hasPrefix("#"), value.count == 7,
           let rgb = UInt32(value.dropFirst(), radix: 16) {
            return DesignTokens.Ink(rgb: rgb, alpha: 1)
        }
        guard value.hasPrefix("rgb"), let open = value.firstIndex(of: "("),
              let close = value.lastIndex(of: ")") else { return nil }
        let parts = value[value.index(after: open)..<close]
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 3 || parts.count == 4 else { return nil }
        let channels = parts.prefix(3).compactMap { Double($0) }
        guard channels.count == 3 else { return nil }
        let alpha = parts.count == 4 ? (Double(parts[3]) ?? 1) : 1
        let rgb = (UInt32(channels[0]) << 16)
            | (UInt32(channels[1]) << 8) | UInt32(channels[2])
        return DesignTokens.Ink(rgb: rgb, alpha: alpha)
    }

    static func px(_ value: String) -> CGFloat? {
        guard value.hasSuffix("px"), let n = Double(value.dropLast(2))
        else { return nil }
        return CGFloat(n)
    }

    static func ms(_ value: String) -> Double? {
        value.hasSuffix("ms") ? Double(value.dropLast(2)) : nil
    }
}
