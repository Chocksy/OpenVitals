import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import UIKit

/// A pixel diff in plain Swift: no package, no framework beyond Core Graphics.
///
/// Two images are compared channel by channel. A pixel counts as differing
/// when its largest channel distance is over `threshold`. Text is excluded by
/// a 1 px halo around every edge in the reference, because WebKit and CoreText
/// do not anti-alias a glyph the same way and never will: the mask is the
/// honest way to compare a layout without comparing two rasterisers.
enum PixelDiff {

    struct Bitmap {
        let width: Int
        let height: Int
        /// RGBA, 8 bits a channel, `width * height * 4` long.
        let pixels: [UInt8]

        func at(_ x: Int, _ y: Int) -> (UInt8, UInt8, UInt8) {
            let i = (y * width + x) * 4
            return (pixels[i], pixels[i + 1], pixels[i + 2])
        }
    }

    struct Result {
        let differing: Int
        let compared: Int
        let masked: Int
        /// The bounding box of the largest differing region, in image pixels.
        let worst: CGRect?
        let width: Int
        let height: Int

        var fraction: Double {
            compared == 0 ? 1 : Double(differing) / Double(compared)
        }

        var percent: String {
            String(format: "%.2f %%", fraction * 100)
        }
    }

    // ── reading ──────────────────────────────────────────────────────

    static func bitmap(_ image: CGImage) -> Bitmap {
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        pixels.withUnsafeMutableBytes { raw in
            guard let context = CGContext(
                data: raw.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width,
                                           height: height))
        }
        return Bitmap(width: width, height: height, pixels: pixels)
    }

    static func load(_ url: URL) -> Bitmap? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { return nil }
        return bitmap(image)
    }

    // ── the text mask ────────────────────────────────────────────────

    /// True where the reference has an edge, dilated by 1 px. Every glyph is
    /// an edge, so this is the halo the two rasterisers disagree inside.
    static func edgeMask(_ image: Bitmap, contrast: Int = 40) -> [Bool] {
        var edge = [Bool](repeating: false, count: image.width * image.height)
        for y in 1..<max(image.height - 1, 1) {
            for x in 1..<max(image.width - 1, 1) {
                let (r, g, b) = image.at(x, y)
                var high = 0
                for dy in -1...1 {
                    for dx in -1...1 where dx != 0 || dy != 0 {
                        let (r2, g2, b2) = image.at(x + dx, y + dy)
                        let d = max(abs(Int(r) - Int(r2)),
                                    max(abs(Int(g) - Int(g2)),
                                        abs(Int(b) - Int(b2))))
                        high = max(high, d)
                    }
                }
                if high > contrast { edge[y * image.width + x] = true }
            }
        }
        // dilate by one, which is the 1 px halo
        var mask = edge
        for y in 1..<max(image.height - 1, 1) {
            for x in 1..<max(image.width - 1, 1) where edge[y * image.width + x] {
                for dy in -1...1 {
                    for dx in -1...1 {
                        mask[(y + dy) * image.width + (x + dx)] = true
                    }
                }
            }
        }
        return mask
    }

    // ── the comparison ───────────────────────────────────────────────

    static func compare(_ reference: Bitmap, _ candidate: Bitmap,
                        threshold: Int = 26,
                        maskText: Bool = true) -> (Result, [Bool]) {
        let width = max(reference.width, candidate.width)
        let height = max(reference.height, candidate.height)
        let mask = maskText ? edgeMask(reference) : []
        var differing = [Bool](repeating: false, count: width * height)
        var count = 0
        var compared = 0
        var masked = 0

        for y in 0..<height {
            for x in 0..<width {
                let inReference = x < reference.width && y < reference.height
                let inCandidate = x < candidate.width && y < candidate.height
                if maskText, inReference,
                   mask[y * reference.width + x] {
                    masked += 1
                    continue
                }
                compared += 1
                if !inReference || !inCandidate {
                    // one image is taller or wider than the other: that is a
                    // real difference, not a rounding one.
                    differing[y * width + x] = true
                    count += 1
                    continue
                }
                let (r1, g1, b1) = reference.at(x, y)
                let (r2, g2, b2) = candidate.at(x, y)
                let d = max(abs(Int(r1) - Int(r2)),
                            max(abs(Int(g1) - Int(g2)),
                                abs(Int(b1) - Int(b2))))
                if d > threshold {
                    differing[y * width + x] = true
                    count += 1
                }
            }
        }

        let worst = largestRegion(differing, width: width, height: height)
        return (Result(differing: count, compared: compared, masked: masked,
                       worst: worst, width: width, height: height),
                differing)
    }

    /// The bounding box of the biggest cluster of differing pixels, found on
    /// an 8 px grid so a stray pixel never wins.
    private static func largestRegion(_ differing: [Bool], width: Int,
                                      height: Int) -> CGRect? {
        let cell = 8
        let cols = (width + cell - 1) / cell
        let rows = (height + cell - 1) / cell
        var hot = [Bool](repeating: false, count: cols * rows)
        for y in 0..<height {
            for x in 0..<width where differing[y * width + x] {
                hot[(y / cell) * cols + (x / cell)] = true
            }
        }
        var seen = [Bool](repeating: false, count: cols * rows)
        var best: (Int, CGRect)?
        for start in 0..<(cols * rows) where hot[start] && !seen[start] {
            var stack = [start]
            seen[start] = true
            var size = 0
            var minX = cols, maxX = 0, minY = rows, maxY = 0
            while let index = stack.popLast() {
                size += 1
                let cx = index % cols
                let cy = index / cols
                minX = min(minX, cx); maxX = max(maxX, cx)
                minY = min(minY, cy); maxY = max(maxY, cy)
                let steps: [(Int, Int)] = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                for step in steps {
                    let nx: Int = cx + step.0
                    let ny: Int = cy + step.1
                    guard nx >= 0, nx < cols, ny >= 0, ny < rows else { continue }
                    let next = ny * cols + nx
                    if hot[next], !seen[next] {
                        seen[next] = true
                        stack.append(next)
                    }
                }
            }
            let bx = CGFloat(minX * cell)
            let by = CGFloat(minY * cell)
            let bw = CGFloat((maxX - minX + 1) * cell)
            let bh = CGFloat((maxY - minY + 1) * cell)
            let box = CGRect(x: bx, y: by, width: bw, height: bh)
            if best == nil || size > best!.0 { best = (size, box) }
        }
        return best?.1
    }

    /// A bitmap straight back out as a PNG, in its own colours.
    @discardableResult
    static func writeImage(_ bitmap: Bitmap, to url: URL) -> Bool {
        write(bitmap.pixels, width: bitmap.width, height: bitmap.height,
              to: url)
    }

    private static func write(_ pixels: [UInt8], width: Int, height: Int,
                              to url: URL) -> Bool {
        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              let image = CGImage(
                width: width, height: height, bitsPerComponent: 8,
                bitsPerPixel: 32, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(
                    rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider, decode: nil, shouldInterpolate: false,
                intent: .defaultIntent),
              let out = CGImageDestinationCreateWithURL(
                url as CFURL, UTType.png.identifier as CFString, 1, nil)
        else { return false }
        CGImageDestinationAddImage(out, image, nil)
        return CGImageDestinationFinalize(out)
    }

    // ── the diff image ───────────────────────────────────────────────

    /// The reference, greyed, with every differing pixel in coral. Written
    /// next to the reference as `<name>.diff.png` when a test fails.
    @discardableResult
    static func write(_ reference: Bitmap, _ differing: [Bool],
                      width: Int, height: Int, to url: URL) -> Bool {
        var pixels = [UInt8](repeating: 255, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let out = (y * width + x) * 4
                if x < reference.width, y < reference.height {
                    let (r, g, b) = reference.at(x, y)
                    let luma: Int = (Int(r) * 30 + Int(g) * 59 + Int(b) * 11)
                        / 100
                    let soft = UInt8(180 + luma / 4)
                    pixels[out] = soft
                    pixels[out + 1] = soft
                    pixels[out + 2] = soft
                } else {
                    pixels[out] = 240; pixels[out + 1] = 240
                    pixels[out + 2] = 240
                }
                pixels[out + 3] = 255
                if differing[y * width + x] {
                    pixels[out] = 231; pixels[out + 1] = 77
                    pixels[out + 2] = 100
                }
            }
        }
        return write(pixels, width: width, height: height, to: url)
    }
}