// Generates the extension's PNG icons — a rounded square with the Instagram
// diagonal gradient — with no image libraries, just Node's zlib. Run:
//   node tools/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(size) {
  // Instagram gradient stops, bottom-left -> top-right.
  const stops = [
    [0.0, [0xfe, 0xda, 0x75]],
    [0.25, [0xfa, 0x7e, 0x1e]],
    [0.5, [0xd6, 0x29, 0x76]],
    [0.75, [0x96, 0x2f, 0xbf]],
    [1.0, [0x4f, 0x5b, 0xd5]],
  ];
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const color = (t) => {
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1];
        const [t1, c1] = stops[i];
        const k = (t - t0) / (t1 - t0);
        return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
      }
    }
    return stops[stops.length - 1][1];
  };
  const r = size * 0.22; // corner radius
  const rows = [];
  for (let y = 0; y < size; y++) {
    const line = Buffer.alloc(1 + size * 4); // filter byte + RGBA
    for (let x = 0; x < size; x++) {
      const t = (x + (size - 1 - y)) / (2 * (size - 1)); // diagonal
      const [cr, cg, cb] = color(t);
      // rounded-corner alpha
      let a = 255;
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      if (cx < r && cy < r) {
        const dx = r - cx, dy = r - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        a = d > r ? 0 : d > r - 1 ? Math.round(255 * (r - d)) : 255;
      }
      const o = 1 + x * 4;
      line[o] = cr; line[o + 1] = cg; line[o + 2] = cb; line[o + 3] = a;
    }
    rows.push(line);
  }
  const raw = deflateSync(Buffer.concat(rows));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", raw), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync(new URL("../icons/", import.meta.url), { recursive: true });
for (const size of [16, 48, 128]) {
  const out = new URL(`../icons/icon${size}.png`, import.meta.url);
  writeFileSync(out, png(size));
  console.log("wrote icons/icon" + size + ".png");
}
