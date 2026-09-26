/**
 * Writes `public/grain.png`: the paper grain of the Hybrid look, phase 40a.
 *
 * `docs/mockups/v4/ios-variations/53-web.html` draws its `--noise` on a
 * canvas at load with mulberry32(7): 128×128, a grey between 120 and 255 per
 * pixel, and 55 % of the pixels at alpha 34, the rest clear. The app draws it
 * once, here, from the same seed, so the grain is a static file and nothing
 * moves at runtime. Run it again only to change the grain:
 *
 *   pnpm exec tsx scripts/grain.ts
 *
 * No dependency: a PNG is a signature, an IHDR, one IDAT of deflated rows
 * (filter byte 0 each) and an IEND, and Node's zlib has deflate and crc32.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const SIZE = 128;

/** The mockup's own generator, verbatim. */
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RGBA bytes, row by row, in the order the mockup's loop fills ImageData. */
export function grainPixels(seed = 7, size = SIZE): Uint8Array {
  const r = mulberry32(seed);
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < out.length; i += 4) {
    const v = Math.round(120 + r() * 135);
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = r() < 0.55 ? 34 : 0;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePng(rgba: Uint8Array, size = SIZE): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(
      rows,
      y * (size * 4 + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  mkdirSync(path.join(root, "public"), { recursive: true });
  const file = path.join(root, "public/grain.png");
  const png = encodePng(grainPixels());
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
