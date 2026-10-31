// アバターの「頭の位置」台帳(src/data/playerHeadAnchors.ts)を作る道具(社長指示2026-10-26
// 「このアバターの位置取りについて、今後も流用するので覚えておいて。毎回アバターごとにずれると面倒なので」)。
//
// 使い方: node scripts/avatar-head-anchors.mjs [--write]
//   - 体の各コマ(待機・歩き・走り・近接の構え/振り抜き・武将)の**頭の位置**を、待機絵の頭を手本にした
//     テンプレート照合で求める(「絵の一番上の点」ではない=振り上げた拳や銃を頭と取り違えない)。
//   - 結果を表で出し、確認用の画(各コマに頭の印)を scratch へ書く。--write で台帳を書き換える。
//   - 台帳の `manual: true` の行は上書きしない(目で直した値を守る)。
// 体の絵を差し替えた・コマを足した時に回す。アバター(耳・帽子…)側は何もしなくてよい。
import { chromium } from '../node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SPR = path.join(ROOT, 'public/sprites');
const OUT_TS = path.join(ROOT, 'src/data/playerHeadAnchors.ts');
const WRITE = process.argv.includes('--write');
const SHEET = process.env.HEAD_SHEET || '/tmp/avatar-head-anchors.png';

const CLASSES = ['magnum', 'shotgun', 'striker', 'scavenger'];
const frames = [];
for (const c of CLASSES) {
  const idle = `player-${c}-idle`;
  const names = fs.readdirSync(SPR).filter(f => f.startsWith(`player-${c}-`) && /-(idle|walk-\d|run-\d|melee-ready|melee-swing)\.png$/.test(f)).map(f => f.replace(/\.png$/, ''));
  for (const n of names.sort()) frames.push({ name: n, ref: idle });
}
for (const w of ['gun', 'katana']) {
  const ref = `player-warlord-${w}-walk-0`;
  for (const f of fs.readdirSync(SPR).filter(f => f.startsWith(`player-warlord-${w}-walk-`) && f.endsWith('.png'))) frames.push({ name: f.replace(/\.png$/, ''), ref });
}
const dataUrl = n => 'data:image/png;base64,' + fs.readFileSync(path.join(SPR, n + '.png')).toString('base64');
const imgs = {};
for (const f of frames) { imgs[f.name] = dataUrl(f.name); imgs[f.ref] = imgs[f.ref] || dataUrl(f.ref); }

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await b.newPage();
const res = await pg.evaluate(async ({ frames, imgs }) => {
  const load = src => new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = src; });
  const px = async (name) => {
    const i = await load(imgs[name]); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
    const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { w: i.width, h: i.height, d: x.getImageData(0, 0, i.width, i.height).data, img: i };
  };
  const A = 16;
  // 手本(待機)の頭: 一番上の不透明行から、その行付近の頭の中心(頭部帯=上から18%の横中心)。
  const refHead = (P) => {
    let top = -1, bottom = -1;
    for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) if (P.d[(y * P.w + x) * 4 + 3] > A) { if (top < 0) top = y; bottom = y; break; }
    const band = Math.max(2, Math.round((bottom - top + 1) * 0.18));
    let mn = P.w, mx = -1;
    for (let y = top; y < top + band; y++) for (let x = 0; x < P.w; x++) if (P.d[(y * P.w + x) * 4 + 3] > A) { mn = Math.min(mn, x); mx = Math.max(mx, x); }
    return { top, cx: Math.round((mn + mx) / 2) };
  };
  const cache = {};
  const get = async n => (cache[n] = cache[n] || await px(n));
  const out = [];
  for (const f of frames) {
    const R = await get(f.ref), P = await get(f.name);
    const rh = refHead(R);
    // 手本の頭の切り出し(横±9・縦14行)。
    const TW = 9, TH = 14;
    const tx0 = rh.cx - TW, ty0 = rh.top;
    // 足元を揃えた時の手本の頭の位置を中心に、横±16・縦±22を探す。
    const baseY = rh.top + (P.h - R.h), baseX = rh.cx + Math.round((P.w - R.w) / 2);
    let best = { s: Infinity, dx: 0, dy: 0 };
    for (let dy = -22; dy <= 22; dy++) for (let dx = -16; dx <= 16; dx++) {
      let s = 0, n = 0;
      for (let yy = 0; yy < TH; yy++) for (let xx = -TW; xx <= TW; xx++) {
        const rx = tx0 + TW + xx, ry = ty0 + yy;
        const qx = baseX + dx + xx, qy = baseY + dy + yy;
        const ri = (ry * R.w + rx) * 4;
        const ra = (rx >= 0 && ry >= 0 && rx < R.w && ry < R.h) ? R.d[ri + 3] : 0;
        let qa = 0, qi = 0;
        if (qx >= 0 && qy >= 0 && qx < P.w && qy < P.h) { qi = (qy * P.w + qx) * 4; qa = P.d[qi + 3]; }
        if (ra <= A && qa <= A) continue;
        n++;
        if ((ra > A) !== (qa > A)) { s += 600; continue; }
        s += Math.abs(R.d[ri] - P.d[qi]) + Math.abs(R.d[ri + 1] - P.d[qi + 1]) + Math.abs(R.d[ri + 2] - P.d[qi + 2]);
      }
      const sc = n ? s / n : Infinity;
      if (sc < best.s) best = { s: sc, dx, dy };
    }
    const top = baseY + best.dy, cx = baseX + best.dx;
    out.push({ name: f.name, w: P.w, h: P.h, top, cx, score: Math.round(best.s), x: cx - P.w / 2, y: P.h - top });
  }
  // 確認用の画: 各コマを4倍で並べ、頭の中心(縦線)と頭頂(横線)を描く。
  const S = 4, cols = 8, cw = 96 * S, ch = 80 * S;
  const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = Math.ceil(out.length / cols) * ch;
  const g = sheet.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#556'; g.fillRect(0, 0, sheet.width, sheet.height);
  out.forEach((o, k) => {
    const ox = (k % cols) * cw, oy = Math.floor(k / cols) * ch;
    g.drawImage(cache[o.name].img, ox, oy, o.w * S, o.h * S);
    g.strokeStyle = '#0f0'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ox + o.cx * S, oy + (o.top - 4) * S); g.lineTo(ox + o.cx * S, oy + (o.top + 10) * S); g.stroke();
    g.beginPath(); g.moveTo(ox + (o.cx - 8) * S, oy + o.top * S); g.lineTo(ox + (o.cx + 8) * S, oy + o.top * S); g.stroke();
    g.fillStyle = '#ff0'; g.font = '16px monospace'; g.fillText(o.name.replace('player-', ''), ox + 4, oy + ch - 6);
  });
  return { out, sheet: sheet.toDataURL('image/png') };
}, { frames, imgs });
await b.close();
fs.writeFileSync(SHEET, Buffer.from(res.sheet.split(',')[1], 'base64'));
for (const o of res.out) console.log(`${o.name.padEnd(34)} x=${String(o.x).padStart(5)} y=${String(o.y).padStart(3)} score=${o.score}`);
console.log(`確認用の画: ${SHEET}`);

if (WRITE) {
  // 既存の手直し(manual)は守る。
  const prev = fs.existsSync(OUT_TS) ? fs.readFileSync(OUT_TS, 'utf8') : '';
  const manual = {};
  for (const m of prev.matchAll(/'([^']+)': \{ x: (-?[\d.]+), y: (-?[\d.]+), manual: true \}/g)) manual[m[1]] = { x: +m[2], y: +m[3] };
  const lines = res.out.map(o => manual[o.name]
    ? `  '${o.name}': { x: ${manual[o.name].x}, y: ${manual[o.name].y}, manual: true },`
    : `  '${o.name}': { x: ${o.x}, y: ${o.y} },`);
  const head = prev.split('export const PLAYER_HEAD_ANCHORS')[0] || '';
  fs.writeFileSync(OUT_TS, head + 'export const PLAYER_HEAD_ANCHORS: Readonly<Record<string, PlayerHeadAnchor>> = {\n' + lines.join('\n') + '\n};\n');
  console.log(`台帳を書いた: ${OUT_TS}(manual ${Object.keys(manual).length}行は保持)`);
}
