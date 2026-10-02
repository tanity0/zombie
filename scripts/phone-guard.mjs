// スマホの見え方の回帰チェック(社長指示2026-10-02「絶対スマホ用の現状が壊れないように分けて作業してね」)。
// PC 版の作業(research/PC_SUPPORT.md)の間、スマホの画面が1pxも動いていないことを push 前に機械で確かめる。
//
//   node scripts/phone-guard.mjs baseline   … 今の画面を基準として保存(PC 作業に入る前の版で1回)
//   node scripts/phone-guard.mjs check      … 今の画面を基準と比べる(違いがあれば一覧を出して exit 1)
//
// 前提: `npm run dev -- --port 5199` が動いていること(PHONE_GUARD_URL で変更可)。
// 出力先: PHONE_GUARD_DIR(既定 /tmp/phone-guard)。**PNG はリポジトリに入れない**(CLAUDE.md「リポジトリを重くしない」)。
// 基準が消えていたら(コンテナの作り直し等)、基準の版を別の作業木で起動して baseline を撮り直す:
//   git worktree add /tmp/pg-base c4dc20d4 && (cd /tmp/pg-base && npm ci && npm run dev -- --port 5198) → PHONE_GUARD_URL=http://localhost:5198/zombie/ node scripts/phone-guard.mjs baseline
//   (c4dc20d4 = v0.25.4786。PC の段3-2 までが入り、スマホが変わっていないことを実画で確かめた版)
//
// 見るもの(2つ):
//   ① DOM の配置 … 画面内の要素の位置と大きさ(タグ+クラス+矩形)の一覧。1px でも動けば出る(本命)。
//   ② 画素 … 画面写真の差(動く背景・粒子・ゲーム画面は揺れるので「何%違うか」を目安に出す。判定は①)。
// 撮る画面: タイトル / ホーム / 作戦地域 / 作戦説明 / キャラ選択 / ゲーム中の HUD / 一時停止。端末: 430×932 と 375×667(タッチ)。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MODE = process.argv[2] === 'baseline' ? 'baseline' : 'check';
const BASE = process.env.PHONE_GUARD_URL ?? 'http://localhost:5199/zombie/';
const DIR = process.env.PHONE_GUARD_DIR ?? '/tmp/phone-guard';
const OUT = path.join(DIR, MODE === 'baseline' ? 'baseline' : 'current');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  ['p430', { width: 430, height: 932 }],
  ['p375', { width: 375, height: 667 }],
];

// 要素の矩形の一覧(見えている物だけ)。文言は乱数の会話で揺れるので入れない。アニメの途中を拾わないよう reduced motion で撮る。
const dumpRects = (page) => page.evaluate(() => {
  const out = [];
  const root = document.getElementById('root') ?? document.body;
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    if (el.closest('[data-phone-guard-skip]')) continue;
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(c => c && !c.startsWith('menu-item-in')).slice(0, 4).join('.');
    out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} @ ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} fs=${cs.fontSize}`);
  }
  return out;
});

const shot = async (page, dev, name) => {
  await page.waitForTimeout(2500);
  const rects = await dumpRects(page);
  fs.writeFileSync(path.join(OUT, `${dev}-${name}.txt`), rects.join('\n'));
  await page.screenshot({ path: path.join(OUT, `${dev}-${name}.png`), timeout: 180000 });
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
for (const [dev, vp] of DEVICES) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  // メニューの流れ: タイトル→ホーム→作戦地域→作戦説明→キャラ選択
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.waitForTimeout(15000);
  const ok = p.getByRole('button', { name: 'OK' });
  if (await ok.count()) { await ok.first().click(); await p.waitForTimeout(3000); }
  await shot(p, dev, 'title');
  await p.mouse.click(vp.width / 2, vp.height * 0.5); await p.waitForTimeout(8000);
  for (let i = 0; i < 3; i++) { const sk = p.getByText(/スキップ/).first(); if (await sk.count()) { await sk.click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(5000); } }
  await shot(p, dev, 'home');
  await p.getByTestId('ops-sortie').click(); await p.waitForTimeout(3000);
  await shot(p, dev, 'stages');
  await p.locator('.command-stage-card').nth(1).click(); await p.waitForTimeout(3000);
  await shot(p, dev, 'briefing');
  await p.getByRole('button', { name: /ジョブ選択/ }).first().click(); await p.waitForTimeout(4000);
  await shot(p, dev, 'charselect');
  await p.close();
  // ゲーム中: 敵なしでステージ1に入り HUD と一時停止
  const g = await ctx.newPage();
  await g.goto(`${BASE}?smoke=1&stage=stage-1&nospawn=1&class=warrior`);
  await g.waitForTimeout(30000);
  await shot(g, dev, 'ingame');
  await g.keyboard.press('Escape'); await g.waitForTimeout(2000);
  await shot(g, dev, 'pause');
  await g.close();
  await ctx.close();
}

let failed = false;
if (MODE === 'check') {
  const baseDir = path.join(DIR, 'baseline');
  const cmp = await b.newPage();
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
    const a = fs.existsSync(path.join(baseDir, f)) ? fs.readFileSync(path.join(baseDir, f), 'utf8').split('\n') : null;
    const c = fs.readFileSync(path.join(OUT, f), 'utf8').split('\n');
    const name = f.replace(/\.txt$/, '');
    if (!a) { console.log(`?? ${name}: 基準が無い`); failed = true; continue; }
    const sa = new Set(a); const sc = new Set(c);
    const gone = a.filter(x => !sc.has(x)); const added = c.filter(x => !sa.has(x));
    // 画素の差(目安)
    const pct = await cmp.evaluate(async ([x, y]) => {
      const load = (src) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return 100;
      const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
      const g2 = cv.getContext('2d'); g2.drawImage(ia, 0, 0); const da = g2.getImageData(0, 0, cv.width, cv.height).data;
      g2.clearRect(0, 0, cv.width, cv.height); g2.drawImage(ib, 0, 0); const db = g2.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) n++;
      return Math.round(n / (da.length / 4) * 1000) / 10;
    }, [`data:image/png;base64,${fs.readFileSync(path.join(baseDir, `${name}.png`)).toString('base64')}`, `data:image/png;base64,${fs.readFileSync(path.join(OUT, `${name}.png`)).toString('base64')}`]);
    const domOk = gone.length === 0 && added.length === 0;
    console.log(`${domOk ? 'OK ' : 'NG '} ${name}: 配置の差 -${gone.length} +${added.length} / 画素の差 ${pct}%`);
    if (!domOk) {
      failed = true;
      for (const x of gone.slice(0, 8)) console.log(`     - ${x}`);
      for (const x of added.slice(0, 8)) console.log(`     + ${x}`);
    }
  }
}
await b.close();
console.log(MODE === 'baseline' ? `基準を保存: ${OUT}` : failed ? 'スマホの配置に差があります(上の NG を確認)' : 'スマホの配置は基準と同じ');
process.exit(failed ? 1 : 0);
