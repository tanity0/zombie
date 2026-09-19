// プレイヤー立ち絵の取込みツール(正式規約=÷Nドット保持焼き・社長承認v0.25.1769)。
// スプライトシート(横並び・透過区切り)や単品PNGを受け取り、個別PNGへ展開する。
// Node組み込みのみ(zlib)・追加パッケージ不要(process-heli.mjs と同じ方針)。
//
// ★標準モード(--dot N・プレイヤークラス素材はこれ一択):
//   AI生成シート=「N倍に整数拡大されたドット絵」(グリッド整列は事前検証済みであること)。
//   ①シート全体を ÷N NEAREST(ドット保持・平均化しない=モヤの原因になるため)
//   ②完全透過の列でコマ分割 ③頭中心x合わせ(上部22%の不透過画素のmedian=v48規約・頭の横揺れ0px)
//   ④足元下端・キャンバス幅78(PLAYER_ART_BASE_W)へ配置 ⑤現行命名で書き出し
//   表示側はピクセルスナップ(pixiScene.snapTexelScale)で1ドット=画面整数pxに固定される。
//   ※「高解像度のまま縮小表示(linear/mipmap)」は res不問で滲むため廃止(v0.25.1765→1767の教訓)。
//
// 使い方:
//   node scripts/import-player-sprites.mjs <outPrefix> <kind=src.png> [kind=src.png ...] [--dot N] [--out DIR]
//     outPrefix: 例 player-scavenger
//     kind:      idle | walk | run | game | melee-ready | melee-swing | melee
//                (idle / melee-ready / melee-swing は1コマ必須。melee=2コマシート
//                 [しゃがみ構え, 振り抜き]の一括指定→ -melee-ready / -melee-swing へ展開。
//                 walk/run/game は検出したコマ数だけ -N 連番で出力)
//     --dot N:   ドット保持モード(必須推奨・通常 N=4)。÷N nearest+頭合わせ+幅78キャンバス。
//     --out DIR: 出力先(既定 public/sprites)
//     (旧オプション --pad/--fitchar はドット絵以外の素材用に残置。プレイヤークラスでは使わない)
//   例: node scripts/import-player-sprites.mjs player-scavenger \
//         walk=st-walk.png melee=st-melee.png run=st-run.png --dot 4
//
// 重要: 同クラスの全ポーズは1回の実行でまとめて渡す(統一キャンバス=表示サイズが揃う)。
// idle が「歩きの特定コマと同じ」場合は取込み後に walk-N を idle 名へコピー(同一キャンバスなので整合)。
// 取込み後の ASSET_VERSION バンプは不要(v0.25.2277〜: 素材の ?v= はファイル内容ハッシュなので、
// 差し替えてコミットすればそのファイルのURLだけが自動で変わる)。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const ALPHA_MIN = 9;   // これ以下のαは「透過」とみなす(コマ区切り/トリム判定)
// コマ区切り判定のしきい値。ドット保持モード(÷N後=論理解像度)では隙間も1/Nに縮むので小さくする
// (v0.25.1769実バグ: ÷4後の3px隙間がGAP_MIN=4で併合されコマ数が欠けた)。
let GAP_MIN = 4;       // コマ区切りとみなす透過列の最小連続数(細い絵の内部隙間で誤分割しない)
let FRAME_MIN_W = 16;  // これより狭い「コマ」はゴミとして隣へ併合

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
  // 各コマの上下bbox+頭中心x(上部22%の不透過画素のmedian=v48規約。ドットモードの配置基準)。
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
    const headBot = top + Math.max(2, Math.round((bot - top + 1) * 0.22));
    const xs = [];
    for (let y = top; y <= headBot; y++) {
      for (let x = left; x <= right; x++) {
        if (rgba[(y * width + x) * 4 + 3] >= ALPHA_MIN) xs.push(x);
      }
    }
    xs.sort((a, b) => a - b);
    const headX = xs.length ? xs[Math.floor(xs.length / 2)] : Math.round((left + right) / 2);
    return { img, left, right, top, bot, w: right - left + 1, h: bot - top + 1, headX };
  });
};

// ドット保持ダウンスケール(÷K nearest): 各出力画素=対応ブロックの左上画素をそのまま採用。
// 「N倍拡大されたドット絵」を無劣化で論理解像度へ戻す(平均化しない=モヤを作らない)。
const downscaleNearest = (img, K) => {
  const w = Math.floor(img.width / K), h = Math.floor(img.height / K);
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y * K) * img.width + (x * K)) * 4;
      const d = (y * w + x) * 4;
      rgba[d] = img.rgba[s]; rgba[d + 1] = img.rgba[s + 1];
      rgba[d + 2] = img.rgba[s + 2]; rgba[d + 3] = img.rgba[s + 3];
    }
  }
  return { width: w, height: h, rgba };
};

// ---- 引数 ----
const args = process.argv.slice(2);
let outDir = 'public/sprites';
let pad = 2;
let fitChar = 0; // 0=無効。>0 なら「画面上のキャラ幅を N px」にする余白を自動計算(非ドット素材用)
let dotN = 0;    // 0=無効。>0 ならドット保持モード(÷N nearest+頭中心合わせ+幅78キャンバス)=標準
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outDir = args[++i];
  else if (args[i] === '--pad') pad = Math.max(0, Number(args[++i]) || 0);
  else if (args[i] === '--fitchar') fitChar = Math.max(0, Number(args[++i]) || 0);
  else if (args[i] === '--dot') dotN = Math.max(0, Math.floor(Number(args[++i]) || 0));
  else positional.push(args[i]);
}
if (dotN > 0) { GAP_MIN = 2; FRAME_MIN_W = 8; } // 論理解像度ではコマ間隙間も1/Nに縮む
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
  // ドット保持モード: 先にシート全体を÷N nearest(画像原点基準=グリッド整列を保つ)、その後にコマ分割。
  const srcImg = decodePng(src);
  const frames = detectFrames(dotN > 0 ? downscaleNearest(srcImg, dotN) : srcImg);
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
if (dotN > 0) {
  // ドット保持モード: キャンバス幅は表示基準幅78に固定(表示側の幅正規化=78/78=×1.0等倍)。
  // キャラ幅が78を超える素材は規格外(検収ルール5)=取り込まず停止して報告する。
  canvasW = RUNTIME_BASE_W;
  const over = all.filter(f => f.w > canvasW);
  if (over.length) {
    console.error(`規格外: ÷${dotN}後のキャラ幅がキャンバス(${canvasW})を超えるコマがある(最大${Math.max(...over.map(f => f.w))}px)。取り込まず停止。`);
    process.exit(1);
  }
}
if (fitChar > 0 && dotN === 0) {
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
    // ドット保持モード=頭中心x合わせ(v48規約・コマ間の頭の横揺れ0px)/ 通常=bbox中央。
    const dstX0 = dotN > 0
      ? Math.max(0, Math.min(canvasW - f.w, Math.round(canvasW / 2 - (f.headX - f.left))))
      : Math.round((canvasW - f.w) / 2);
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
console.log('done. キャッシュバストは自動(?v=はファイル内容ハッシュ・v0.25.2277〜)。ASSET_VERSIONのバンプは不要。');
