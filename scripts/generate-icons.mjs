/**
 * Generates the PNG app icons from the same house-and-checkmark mark as
 * `public/icon.svg`. iOS does NOT accept an SVG apple-touch-icon and Android
 * maskable icons must be raster, so we need real PNGs — but the demo box has no
 * SVG rasterizer (rsvg/imagemagick/sharp all absent). So this is a tiny,
 * dependency-free rasterizer: it draws the mark with 4x supersampling (for clean
 * edges) using Node's built-in `zlib` to deflate the PNG. Re-run with
 * `npm run icons` after changing the mark; the outputs are committed so the Vercel
 * build just serves static files.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const SKY = [14, 165, 233]; // #0ea5e9
const WHITE = [255, 255, 255];
const SS = 4; // supersampling factor

// ---- geometry, all in the 64x64 design space of icon.svg ----
const HOUSE = [
  [14, 31],
  [32, 15],
  [50, 31],
  [50, 49],
  [14, 49],
];
const CHECK = [
  [23, 39],
  [29, 45],
  [41, 32],
];
const CHECK_WIDTH = 4.5;
const CORNER_RADIUS = 14;

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function nearPolyline(x, y, pts, halfWidth) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= halfWidth) {
      return true;
    }
  }
  return false;
}

function inRoundedRect(x, y, size, r) {
  if (x < 0 || y < 0 || x > size || y > size) return false;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r + 1e-6;
}

/**
 * @param size       output pixel size
 * @param variant    'rounded' (transparent corners) | 'fullbleed' (opaque square)
 * @param designScale shrink the mark toward the center (maskable safe zone)
 */
function renderIcon(size, variant, designScale = 1) {
  const px = Buffer.alloc(size * size * 4); // RGBA
  const radius = (CORNER_RADIUS / 64) * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          // sample point in pixel space, then map to 64-design space
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          const dx = (fx / size) * 64;
          const dy = (fy / size) * 64;

          // background presence
          const bgPresent =
            variant === 'fullbleed' ? true : inRoundedRect(fx, fy, size, radius);
          if (!bgPresent) continue; // transparent subsample

          // mark drawn in (optionally) shrunk space, centered on 32,32
          const mx = 32 + (dx - 32) / designScale;
          const my = 32 + (dy - 32) / designScale;

          let color = SKY;
          if (pointInPolygon(mx, my, HOUSE)) color = WHITE;
          if (nearPolyline(mx, my, CHECK, CHECK_WIDTH / 2)) color = SKY;

          r += color[0];
          g += color[1];
          b += color[2];
          a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      // average colour over covered subsamples; alpha = coverage
      const covered = a / 255;
      px[i] = covered ? Math.round(r / covered) : 0;
      px[i + 1] = covered ? Math.round(g / covered) : 0;
      px[i + 2] = covered ? Math.round(b / covered) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(px, size, size);
}

// ---- minimal PNG encoder (RGBA, 8-bit, color type 6) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(px, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression / filter / interlace = 0

  // raw scanlines with a 0 (none) filter byte per row
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    px.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- emit the icon set ----
const outputs = [
  // Android / manifest "any": rounded mark with transparent corners
  ['icon-192.png', renderIcon(192, 'rounded')],
  ['icon-512.png', renderIcon(512, 'rounded')],
  // Android maskable: full-bleed background, mark inside the ~80% safe zone
  ['icon-maskable-512.png', renderIcon(512, 'fullbleed', 0.78)],
  // iOS apple-touch-icon: opaque, full-bleed (iOS rounds the corners itself)
  ['apple-touch-icon.png', renderIcon(180, 'fullbleed')],
];

for (const [name, buf] of outputs) {
  writeFileSync(join(PUBLIC_DIR, name), buf);
  console.log(`wrote public/${name} (${buf.length} bytes)`);
}
