#!/usr/bin/env node
// Zero-dependency PNG icon generator — writes raw pixels, deflates with
// Node's built-in zlib (no image library needed). Draws a simple flat
// square with a lighter "M" glyph mark so the app has real installable
// icons without depending on a design tool.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [0x0b, 0x0e, 0x14]; // matches --bg
const FG = [0x4d, 0xa3, 0xff]; // matches --accent

function crc32Table() {
  // Node's zlib doesn't export crc32 as a function on all versions; compute manually.
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crc32Table();
function crc32Buf(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32Buf(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// "M" glyph as a set of filled rectangles on a normalized 0..1 grid (two
// verticals + two diagonals approximated as staircase rectangles).
function isGlyphPixel(nx, ny) {
  // nx, ny in [0,1]. Letterform box [0.22,0.78] x [0.28,0.72].
  const left = 0.24, right = 0.76, top = 0.28, bottom = 0.72, stroke = 0.09;
  if (nx < left || nx > right || ny < top || ny > bottom) return false;
  if (nx <= left + stroke) return true; // left vertical
  if (nx >= right - stroke) return true; // right vertical
  // two diagonals meeting in the middle, forming the "V" of the M
  const midX = (left + right) / 2;
  const span = right - left;
  const tNorm = (ny - top) / (bottom - top); // 0 at top, 1 at bottom
  const diagLeftX = left + stroke + tNorm * (midX - left - stroke);
  const diagRightX = right - stroke - tNorm * (right - stroke - midX);
  if (Math.abs(nx - diagLeftX) < stroke * 0.7) return true;
  if (Math.abs(nx - diagRightX) < stroke * 0.7) return true;
  return false;
}

function makePNG(size) {
  const raw = Buffer.alloc(size * (1 + size * 3)); // filter byte + RGB per row
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      const [r, g, b] = isGlyphPixel(nx, ny) ? FG : BG;
      const off = rowStart + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = process.argv[2] || "app/assets/icons";
mkdirSync(outDir, { recursive: true });
for (const size of [32, 180, 192, 512]) {
  const png = makePNG(size);
  writeFileSync(`${outDir}/icon-${size}.png`, png);
  console.log(`wrote ${outDir}/icon-${size}.png (${png.length} bytes)`);
}
