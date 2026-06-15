// One-off: chroma-key the purple background off the helicopter art and crop to
// content, using only Node's built-in zlib (no extra packages). Outputs an
// RGBA PNG to public/sprites/helicopter.png.
import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const SRC = process.argv[2];
const OUT = process.argv[3];

const buf = readFileSync(SRC);
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG');

let off = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0;
let palette = null, trns = null;
const idat = [];
while (off < buf.length) {
  const len = buf.readUInt32BE(off); off += 4;
  const type = buf.toString('latin1', off, off + 4); off += 4;
  const data = buf.subarray(off, off + len); off += len;
  off += 4; // crc
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'PLTE') {
    palette = data;
  } else if (type === 'tRNS') {
    trns = data;
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
}
if (bitDepth !== 8) throw new Error('only 8-bit supported, got ' + bitDepth);

const channelsFor = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const ch = channelsFor[colorType];
if (!ch) throw new Error('unsupported colorType ' + colorType);
const bpp = ch; // bytes per pixel in the raw (8-bit)
const stride = width * bpp;

const raw = zlib.inflateSync(Buffer.concat(idat));
// Unfilter scanlines (filter byte prefixes each row).
const out = Buffer.alloc(height * stride);
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
};
let rpos = 0;
for (let y = 0; y < height; y++) {
  const ft = raw[rpos++];
  const cur = out.subarray(y * stride, y * stride + stride);
  const prev = y > 0 ? out.subarray((y - 1) * stride, (y - 1) * stride + stride) : null;
  for (let x = 0; x < stride; x++) {
    const rawByte = raw[rpos++];
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev ? prev[x] : 0;
    const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
    let val;
    switch (ft) {
      case 0: val = rawByte; break;
      case 1: val = rawByte + a; break;
      case 2: val = rawByte + b; break;
      case 3: val = rawByte + ((a + b) >> 1); break;
      case 4: val = rawByte + paeth(a, b, c); break;
      default: throw new Error('bad filter ' + ft);
    }
    cur[x] = val & 0xff;
  }
}

// Expand to RGBA.
const rgba = Buffer.alloc(width * height * 4);
const getPix = (i) => {
  const o = i * bpp;
  if (colorType === 6) return [out[o], out[o + 1], out[o + 2], out[o + 3]];
  if (colorType === 2) return [out[o], out[o + 1], out[o + 2], 255];
  if (colorType === 0) return [out[o], out[o], out[o], 255];
  if (colorType === 4) return [out[o], out[o], out[o], out[o + 1]];
  if (colorType === 3) {
    const idx = out[o];
    const a = trns && idx < trns.length ? trns[idx] : 255;
    return [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2], a];
  }
};
for (let i = 0; i < width * height; i++) {
  const [r, g, b, a] = getPix(i);
  rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
}

// Background colour = average of the four corners (all purple here).
const corners = [0, width - 1, (height - 1) * width, height * width - 1];
let br = 0, bg = 0, bb = 0;
for (const i of corners) { br += rgba[i * 4]; bg += rgba[i * 4 + 1]; bb += rgba[i * 4 + 2]; }
br = Math.round(br / 4); bg = Math.round(bg / 4); bb = Math.round(bb / 4);
console.log('bg colour ~', br, bg, bb);

// Chroma key with a feathered edge to avoid a hard purple fringe.
const T0 = 60;   // <= : fully transparent
const T1 = 110;  // >= : fully opaque; between = ramp
for (let i = 0; i < width * height; i++) {
  const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
  const d = Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
  let alpha;
  if (d <= T0) alpha = 0;
  else if (d >= T1) alpha = rgba[i * 4 + 3];
  else alpha = Math.round(rgba[i * 4 + 3] * (d - T0) / (T1 - T0));
  rgba[i * 4 + 3] = alpha;
}

// Crop to the opaque-ish content bounding box.
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error('image fully transparent after key');
const cw = maxX - minX + 1, chh = maxY - minY + 1;
const cropped = Buffer.alloc(cw * chh * 4);
for (let y = 0; y < chh; y++) {
  for (let x = 0; x < cw; x++) {
    const src = ((y + minY) * width + (x + minX)) * 4;
    const dst = (y * cw + x) * 4;
    cropped[dst] = rgba[src]; cropped[dst + 1] = rgba[src + 1];
    cropped[dst + 2] = rgba[src + 2]; cropped[dst + 3] = rgba[src + 3];
  }
}
console.log('cropped to', cw, 'x', chh, '(from', width, 'x', height + ')');

// Box-downsample by an integer factor to shrink the texture (still ~2x the
// on-screen height, so it stays crisp with linear scaling). Alpha-weighted so
// the keyed edges don't darken.
const FACTOR = Number(process.argv[4] || 2);
let fw = cw, fhh = chh, finalBuf = cropped;
if (FACTOR > 1) {
  fw = Math.max(1, Math.round(cw / FACTOR));
  fhh = Math.max(1, Math.round(chh / FACTOR));
  finalBuf = Buffer.alloc(fw * fhh * 4);
  for (let y = 0; y < fhh; y++) {
    for (let x = 0; x < fw; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = 0; dy < FACTOR; dy++) {
        for (let dx = 0; dx < FACTOR; dx++) {
          const sx = Math.min(cw - 1, x * FACTOR + dx);
          const sy = Math.min(chh - 1, y * FACTOR + dy);
          const s = (sy * cw + sx) * 4;
          const sa = cropped[s + 3];
          r += cropped[s] * sa; g += cropped[s + 1] * sa; b += cropped[s + 2] * sa;
          a += sa; n++;
        }
      }
      const d = (y * fw + x) * 4;
      finalBuf[d] = a > 0 ? Math.round(r / a) : 0;
      finalBuf[d + 1] = a > 0 ? Math.round(g / a) : 0;
      finalBuf[d + 2] = a > 0 ? Math.round(b / a) : 0;
      finalBuf[d + 3] = Math.round(a / n);
    }
  }
  console.log('downsampled to', fw, 'x', fhh, '(factor', FACTOR + ')');
}

// Encode RGBA PNG (colorType 6, filter 0 per row).
const enc = Buffer.alloc(fhh * (fw * 4 + 1));
for (let y = 0; y < fhh; y++) {
  enc[y * (fw * 4 + 1)] = 0;
  finalBuf.copy(enc, y * (fw * 4 + 1) + 1, y * fw * 4, (y + 1) * fw * 4);
}
const idatOut = zlib.deflateSync(enc, { level: 9 });

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = ~0;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(fw, 0); ihdr.writeUInt32BE(fhh, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from(SIG),
  chunk('IHDR', ihdr),
  chunk('IDAT', idatOut),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(OUT, png);
console.log('wrote', OUT, png.length, 'bytes');
