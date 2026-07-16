// プレイヤー立ち絵 高解像度素材の取込みツール(社長決定v0.25.1763-1764・エリオット式/NPC方式)。
// スプライトシート(横並び・透過区切り)や単品PNGを受け取り、
//   ①コマ検出(完全透過の列で分割) ②各コマを内容bboxへトリム
//   ③全コマ共通の統一キャンバスへ「足元下端・中央」で配置 ④現行命名の個別PNGとして書き出し
// までを自動化する。素材側は「同一キャンバス」に揃えなくてよい(このツールが吸収する)。
// Node組み込みのみ(zlib)・追加パッケージ不要(process-heli.mjs と同じ方針)。
//
// 使い方:
//   node scripts/import-player-sprites.mjs <outPrefix> <kind=src.png> [kind=src.png ...] [--out DIR] [--pad N] [--fitchar W]
//     outPrefix: 例 player-scavenger
//     kind:      idle | walk | run | game | melee-ready | melee-swing | melee
//                (idle / melee-ready / melee-swing は1コマ必須。melee=2コマシート
//                 [しゃがみ構え, 振り抜き]の一括指定→ -melee-ready / -melee-swing へ展開。
//                 walk/run/game は検出したコマ数だけ -N 連番で出力)
//     --out DIR:   出力先(既定 public/sprites)
//     --pad N:     統一キャンバスの左右余白px(既定 2・--fitchar 指定時は無視)
//     --fitchar W: 「画面上のキャラ幅を W px にする」余白を自動計算(推奨 48=現行ドット絵の
//                  キャラ実幅)。ゲームはキャンバス幅を78pxへ正規化表示するため、
//                  canvasW = 基準コマのキャラ幅 × 78 / W で余白を焼き込む。基準コマ=walk があれば
//                  walk の最大キャラ幅、無ければ全コマの最大幅。
//   例: node scripts/import-player-sprites.mjs player-scavenger \
//         walk=art_src/st-walk.png melee=art_src/st-melee.png run=art_src/st-run.png --fitchar 48
//
// 重要: 1回の実行に渡した全入力のコマから統一キャンバスを決める。同クラスの全ポーズは
// なるべく1回の実行でまとめて取り込むこと(別々に実行するとキャンバス=表示サイズが揃わない)。
// idle が「歩きの特定コマと同じ」素材の場合は、取込み後に walk-N を idle 名へコピーすればよい
// (全出力が同一キャンバスなのでコピーで整合する)。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const ALPHA_MIN = 9;   // これ以下のαは「透過」とみなす(コマ区切り/トリム判定)
const GAP_MIN = 4;     // コマ区切りとみなす透過列の最小連続数(細い絵の内部隙間で誤分割しない)
const FRAME_MIN_W = 16; // これより狭い「コマ」はゴミとして隣へ併合

// ---- PNG decode(process-heli.mjs と同系・8bit/非インターレースのみ) ----
const decodePng = (path) => {
  const buf = readFileSync(path);
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error(`not a PNG: ${path}`);
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('latin1', off, off + 4); off += 4;
    const data = buf.subarray(off, off + len); off += len + 4; // +crc
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8) throw new Error(`only 8-bit PNG supported (${path}: bitDepth=${bitDepth})`);
  if (interlace !== 0) throw new Error(`interlaced PNG unsupported (${path})`);
  const channelsFor = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const ch = channelsFor[colorType];
  if (!ch) throw new Error(`unsupported colorType ${colorType} (${path})`);
  const stride = width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
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
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rpos++];
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= ch) ? prev[x - ch] : 0;
      let val;
      switch (ft) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: val = rawByte + paeth(a, b, c); break;
        default: throw new Error(`bad filter ${ft} (${path})`);
      }
      cur[x] = val & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * ch;
    let r, g, b, a;
    if (colorType === 6) { r = out[o]; g = out[o + 1]; b = out[o + 2]; a = out[o + 3]; }
    else if (colorType === 2) { r = out[o]; g = out[o + 1]; b = out[o + 2]; a = 255; }
    else if (colorType === 0) { r = g = b = out[o]; a = 255; }
    else if (colorType === 4) { r = g = b = out[o]; a = out[o + 1]; }
    else { // 3: palette
      const idx = out[o];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
};

// ---- PNG encode(RGBA / colorType6 / filter0) ----
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
const encodePng = (rgba, w, h) => {
  const enc = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    enc[y * (w * 4 + 1)] = 0;
    rgba.copy(enc, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from(SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(enc, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ---- コマ検出(透過列で分割→bboxトリム) ----
const detectFrames = (img) => {
  const { width, height, rgba } = img;
  const colHas = new Array(width).fill(false);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (rgba[(y * width + x) * 4 + 3] >= ALPHA_MIN) { colHas[x] = true; break; }
    }
  }
  // 不透過区間を列挙し、GAP_MIN 未満の隙間は同一コマとして併合。
  const spans = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const has = x < width && colHas[x];
    if (has && start < 0) start = x;
    if (!has && start >= 0) { spans.push([start, x - 1]); start = -1; }
  }
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] - last[1] - 1 < GAP_MIN) last[1] = s[1];
    else merged.push([...s]);
  }
  // 幅が極端に狭い区間(飛び散りゴミ)は近い方の隣へ併合。
  const frames = [];
  for (const s of merged) {
    const last = frames[frames.length - 1];
    if (s[1] - s[0] + 1 < FRAME_MIN_W && last) last[1] = s[1];
    else frames.push(s);
  }
  // 各コマの上下bbox。
  return frames.map(([x0, x1]) => {
    let top = -1, bot = -1, left = x1, right = x0;
    for (let y = 0; y < height; y++) {
      for (let x = x0; x <= x1; x++) {
        if (rgba[(y * width + x) * 4 + 3] >= ALPHA_MIN) {
          if (top < 0) top = y;
          bot = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    return { img, left, right, top, bot, w: right - left + 1, h: bot - top + 1 };
  });
};

// ---- 引数 ----
const args = process.argv.slice(2);
let outDir = 'public/sprites';
let pad = 2;
let fitChar = 0; // 0=無効。>0 なら「画面上のキャラ幅を N px」にする余白を自動計算
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outDir = args[++i];
  else if (args[i] === '--pad') pad = Math.max(0, Number(args[++i]) || 0);
  else if (args[i] === '--fitchar') fitChar = Math.max(0, Number(args[++i]) || 0);
  else positional.push(args[i]);
}
const [outPrefix, ...pairs] = positional;
const KINDS = ['idle', 'walk', 'run', 'game', 'melee-ready', 'melee-swing', 'melee'];
const SINGLE_KINDS = new Set(['idle', 'melee-ready', 'melee-swing']);
if (!outPrefix || pairs.length === 0) {
  console.error('usage: node scripts/import-player-sprites.mjs <outPrefix> <kind=src.png> [kind=src.png ...] [--out DIR] [--pad N] [--fitchar W]');
  console.error('       kind: ' + KINDS.join(' | '));
  process.exit(1);
}

// ---- 取込み ----
const jobs = pairs.map((p) => {
  const eq = p.indexOf('=');
  const kind = p.slice(0, eq), src = p.slice(eq + 1);
  if (eq < 0 || !KINDS.includes(kind)) { console.error(`bad arg (kind=src.png expected): ${p}`); process.exit(1); }
  const frames = detectFrames(decodePng(src));
  if (frames.length === 0) { console.error(`no frames detected: ${src}`); process.exit(1); }
  if (SINGLE_KINDS.has(kind) && frames.length !== 1) {
    console.error(`${kind} は1コマ必須ですが ${frames.length} コマ検出: ${src}`);
    process.exit(1);
  }
  if (kind === 'melee' && frames.length !== 2) {
    console.error(`melee は2コマ(しゃがみ構え,振り抜き)必須ですが ${frames.length} コマ検出: ${src}`);
    process.exit(1);
  }
  console.log(`${kind}: ${src} → ${frames.length}コマ ` + frames.map(f => `${f.w}x${f.h}`).join(' '));
  return { kind, src, frames };
});

// 統一キャンバス: 全コマの最大bbox + 左右pad。足元=下端フラッシュ(縦padなし)。
// --fitchar 指定時: 「基準コマ(walk優先)のキャラ幅が画面上で fitChar px になる」キャンバス幅を計算
// (ゲーム側 pixiScene.playerBaseScale はキャンバス幅を PLAYER_ART_BASE_W=78px へ正規化表示するため、
//  canvasW = refW × 78 / fitChar で余白を焼き込めば旧ドット絵とキャラの見かけサイズが揃う)。
const all = jobs.flatMap(j => j.frames);
const RUNTIME_BASE_W = 78; // = src/pixi/pixiTextures.ts PLAYER_ART_BASE_W(変えたら揃えること)
let canvasW = Math.max(...all.map(f => f.w)) + pad * 2;
if (fitChar > 0) {
  const walkJob = jobs.find(j => j.kind === 'walk');
  const refW = Math.max(...(walkJob ? walkJob.frames : all).map(f => f.w));
  const fitW = Math.round(refW * RUNTIME_BASE_W / fitChar);
  if (fitW < canvasW) {
    console.warn(`警告: --fitchar ${fitChar} のキャンバス幅(${fitW})より広いコマがある(最大${canvasW - pad * 2})。はみ出さないよう広い方を採用。`);
  } else {
    canvasW = fitW;
  }
  console.log(`fitchar: 基準キャラ幅${refW}px → 画面上約${(refW * RUNTIME_BASE_W / canvasW).toFixed(1)}px(目標${fitChar}px)`);
}
const canvasH = Math.max(...all.map(f => f.h));
// ポーズ間の大きさの一貫性チェック(絵としての責務は素材側。ツールは警告のみ)。
const minH = Math.min(...all.map(f => f.h));
if (canvasH - minH > canvasH * 0.12) {
  console.warn(`警告: コマ間で背丈の差が大きい(${minH}〜${canvasH}px)。ポーズ差なら想定内、意図しないズレなら素材を確認。`);
}
console.log(`統一キャンバス: ${canvasW}x${canvasH}(pad=${pad}・足元下端揃え)`);

mkdirSync(outDir, { recursive: true });
for (const { kind, frames } of jobs) {
  frames.forEach((f, i) => {
    const outBuf = Buffer.alloc(canvasW * canvasH * 4);
    const dstX0 = Math.round((canvasW - f.w) / 2); // 中央
    const dstY0 = canvasH - f.h;                   // 足元下端
    const { width } = f.img;
    for (let y = 0; y < f.h; y++) {
      const srcOff = ((f.top + y) * width + f.left) * 4;
      const dstOff = ((dstY0 + y) * canvasW + dstX0) * 4;
      f.img.rgba.copy(outBuf, dstOff, srcOff, srcOff + f.w * 4);
    }
    // melee(2コマ一括)は [しゃがみ構え, 振り抜き] の順で -ready / -swing へ展開。
    const name = kind === 'melee' ? `${outPrefix}-melee-${i === 0 ? 'ready' : 'swing'}.png`
      : SINGLE_KINDS.has(kind) ? `${outPrefix}-${kind}.png`
      : `${outPrefix}-${kind}-${i}.png`;
    const path = join(outDir, name);
    writeFileSync(path, encodePng(outBuf, canvasW, canvasH));
    console.log(`wrote ${path} (${canvasW}x${canvasH})`);
  });
}
console.log('done. ゲーム側は同名上書きで自動反映(幅>78でlinear+mipmap化・表示サイズは幅正規化)。');
