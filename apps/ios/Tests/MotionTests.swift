import SwiftUI
import UIKit
import XCTest
@testable import OpenVitals

final class MotionTests: XCTestCase {

    // node, the prototype's mulberry32 verbatim: const r = mulberry32(435)
    func testMulberry32MatchesTheJavaScript() {
        var r = Mulberry32(435)
        let js = [0.8254746480379254, 0.8762295674532652, 0.4360827300697565,
                  0.1549664402846247, 0.25321726920083165]
        for expected in js {
            XCTAssertEqual(r.next(), expected)
        }
    }

    // colorsys.hls_to_rgb on the prototype's hsl(90.5 68% 90%),
    // hsl(109.2 68% 49.2%) and hsl(129 68% 34%), times 255
    func testDayColourMatchesTheCSSHSL() {
        let cases: [(Int, Double, Double, Double)] = [
            (55, 229.211, 246.84, 212.16),
            (72, 70.859808, 210.7728, 40.1472),
            (90, 27.744, 145.656, 45.4308),
        ]
        for (score, r, g, b) in cases {
            let c = DayColour.rgb(score)
            XCTAssertEqual(c.r, r, accuracy: 0.001, "r \(score)")
            XCTAssertEqual(c.g, g, accuracy: 0.001, "g \(score)")
            XCTAssertEqual(c.b, b, accuracy: 0.001, "b \(score)")
        }
    }

    // node, the prototype's grain loop into a Uint8ClampedArray: the first
    // four pixels, and 9042 of 16384 pixels carrying alpha
    func testTheGrainTileIsTheSeededOne() {
        let tile = Grain.tile
        XCTAssertEqual(tile.width, 128)
        XCTAssertEqual(tile.height, 128)
        let pixels = Grain.pixels()
        XCTAssertEqual(pixels, Grain.pixels())
        XCTAssertEqual(Array(pixels.prefix(16)),
                       [122, 122, 122, 34, 252, 252, 252, 0,
                        190, 190, 190, 34, 183, 183, 183, 34])
        let opaque = stride(from: 3, to: pixels.count, by: 4)
            .filter { pixels[$0] != 0 }.count
        XCTAssertEqual(opaque, 9042)
    }

    func testReduceMotionSwapsTheCurve() {
        let spring = Curve.spring.animation(0.56)
        XCTAssertEqual(Motion.animation(spring, reduce: false), spring)
        XCTAssertEqual(Motion.animation(spring, reduce: true), Motion.reduced)
    }

    func testSpaceGroteskIsRegistered() {
        XCTAssertNotNil(UIFont(name: Face.groteskName, size: 17))
        XCTAssertTrue(Face.grotesk(17, .bold).fontName.hasPrefix("SpaceGrotesk"))
    }
}
