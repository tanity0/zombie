// PC 固有のずれのチェック(社長指示2026-10-08「PC固有のバグも発見できるようにしないと危ないな今後」→「はい」)。
// スマホの配置チェック(scripts/phone-guard.mjs)の PC 版。PC は画面の大きさ・解像度が機種ごとにまちまちなので、
// スマホでは起きないずれ(例: v0.25.4929 の「1440×900・解像度2倍だけ NPC がプレイヤーより小さい」)が潜む。
//
//   node scripts/pc-guard.mjs baseline   … PC の画面の配置を基準として保存(大きさの比は基準なしで毎回スマホと比べる)
//   node scripts/pc-guard.mjs check      … ①大きさの比をスマホと比べる ②PC の画面の配置を基準と比べる(差があれば exit 1)
//
// 前提: `npm run dev -- --port 5199` が動いていること(PC_GUARD_URL で変更可)。出力先: PC_GUARD_DIR(既定 /tmp/pc-guard)。
// **PNG はリポジトリに入れない**(CLAUDE.md「リポジトリを重くしない」)。目安: 1回 約5分(ヘッドレスは1画面30秒前後かかる)。
//
// 見るもの:
//   ① 大きさの比(本命): ゲーム中のプレイヤー・軍人(進軍NPC)・敵(ゾンビ/骸骨)の**画面上の高さ**を測り、
//      「軍人÷プレイヤー」「敵÷プレイヤー」を出す。PC の各画面サイズの比が、スマホ(430×932・3倍)の比から
//      RATIO_TOL(既定6%)より離れたら NG。基準ファイルは要らない(同じ回でスマホも測って比べる)。
//   ② PC の画面の配置: タイトルとゲーム中の HUD の要素の位置と大きさ(phone-guard と同じ方式)。1px でも動けば NG。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const MODE = process.argv[2] === 'baseline' ? 'baseline' : 'check';
const BASE = process.env.PC_GUARD_URL ?? 'http://localhost:5199/zombie/';
const DIR = process.env.PC_GUARD_DIR ?? '/tmp/pc-guard';
const OUT = path.join(DIR, MODE === 'baseline' ? 'baseline' : 'current');
const RATIO_TOL = Number(process.env.PC_GUARD_RATIO_TOL ?? 0.06);
fs.mkdirSync(OUT, { recursive: true });

// [名前, 画面, 解像度, スマホか]。先頭がスマホ=比の基準。
const DEVICES = [
  ['ph430x932@3', { width: 430, height: 932 }, 3, true],
  ['pc1280x720@1', { width: 1280, height: 720 }, 1, false],
  ['pc1440x900@2', { width: 1440, height: 900 }, 2, false],
  ['pc1920x1080@1', { width: 1920, height: 1080 }, 1, false],
];

const dumpRects = (page) => page.evaluate(() => {
  const out = [];
  const root = document.getElementById('root') ?? document.body;
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    if (el.closest('[data-phone-guard-skip]')) continue;
    if (el.childElementCount === 0 && /\d/.test(el.textContent ?? '')) continue;
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(c => c && !c.startsWith('menu-item-in')).slice(0, 4).join('.');
    out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} @ ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} fs=${cs.fontSize}`);
  }
  return out;
});

const closePopups = async (g) => {
  for (let i = 0; i < 4; i++) {
    if (await g.evaluate(() => !!window.__gameStore?.getState().tutorialPopup)) {
      await g.evaluate(() => window.__gameStore.setState({ tutorialPopup: null, isPaused: false }));
      await g.waitForTimeout(600);
    }
  }
};

// プレイヤーの左右に軍人を並べ、少し離して敵を2体(動かない)置いて、画面上の高さを測る。
const measureSizes = (g) => g.evaluate(async () => {
  const st = window.__gameStore; const s = st.getState(); const pl = s.player;
  const cx = pl.x + pl.width / 2, cy = pl.y + pl.height / 2;
  const { spawnEnemyAt } = await import('/zombie/src/utils/enemyUtils.ts');
  const mk = (type, dx, dy) => ({ ...spawnEnemyAt(type, cx + dx - 16, cy + dy - 16, s.gameTime), fixed: true, dormant: true, vx: 0, vy: 0, homeX: cx + dx - 16, homeY: cy + dy - 16 });
  st.setState({
    escorts: s.escorts.map((e, i) => ({ ...e, x: cx + (i < 2 ? -70 - i * 50 : 70 + (i - 2) * 50), y: cy + 8, moving: false })),
    enemies: [mk('zombie', -110, -120), mk('skeleton', 110, -120)],
  });
  await new Promise(r => setTimeout(r, 2500));
  const sc = window.__pixiScene;
  const h = (o) => o.getBounds().height;
  const player = h(sc.playerView.sprite);
  const esc = [...sc.escortSprites.values()].filter(x => x.visible).map(h);
  const en = [...sc.enemies.values()].map(v => h(v.sprite)).filter(x => x > 1);
  const mean = (a) => a.length ? a.reduce((p, q) => p + q, 0) / a.length : NaN;
  return { player, escort: mean(esc), enemy: mean(en), nEsc: esc.length, nEn: en.length };
});

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const sizes = {};
for (const [dev, vp, dpr, mob] of DEVICES) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mob, hasTouch: mob, reducedMotion: 'reduce' });
  if (!mob) {
    // PC の画面の配置: タイトル
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.waitForTimeout(15000);
    const ok = p.getByRole('button', { name: 'OK' });
    if (await ok.count()) { await ok.first().click(); await p.waitForTimeout(3000); }
    await p.waitForTimeout(2500);
    fs.writeFileSync(path.join(OUT, `${dev}-title.txt`), (await dumpRects(p)).join('\n'));
    await p.screenshot({ path: path.join(OUT, `${dev}-title.png`), timeout: 180000 });
    await p.close();
  }
  const g = await ctx.newPage();
  await g.goto(`${BASE}?smoke=1&stage=stage-1&nospawn=1&class=warrior&ts=0&welcome=0&autotut=1&hidelayer=fog`);
  await g.waitForTimeout(30000);
  await closePopups(g);
  if (!mob) {
    await g.waitForTimeout(2500);
    fs.writeFileSync(path.join(OUT, `${dev}-ingame.txt`), (await dumpRects(g)).join('\n'));
  }
  sizes[dev] = await measureSizes(g);
  await g.screenshot({ path: path.join(OUT, `${dev}-sizes.png`), timeout: 180000 });
  await g.close();
  await ctx.close();
}

let failed = false;
// ① 大きさの比(スマホと比べる)
const ref = sizes[DEVICES[0][0]];
const refEsc = ref.escort / ref.player, refEn = ref.enemy / ref.player;
console.log(`基準 ${DEVICES[0][0]}: 軍人/プレイヤー ${refEsc.toFixed(3)} / 敵/プレイヤー ${refEn.toFixed(3)} (プレイヤー ${Math.round(ref.player)}px)`);
for (const [dev] of DEVICES.slice(1)) {
  const s = sizes[dev];
  const e1 = s.escort / s.player, e2 = s.enemy / s.player;
  const d1 = Math.abs(e1 / refEsc - 1), d2 = Math.abs(e2 / refEn - 1);
  const bad = !(d1 <= RATIO_TOL) || !(d2 <= RATIO_TOL) || s.nEsc === 0 || s.nEn === 0;
  if (bad) failed = true;
  console.log(`${bad ? 'NG ' : 'OK '} ${dev} 大きさの比: 軍人/プレイヤー ${e1.toFixed(3)}(スマホ比 ${(e1 / refEsc).toFixed(3)}) / 敵/プレイヤー ${e2.toFixed(3)}(スマホ比 ${(e2 / refEn).toFixed(3)}) [測った数 軍人${s.nEsc}・敵${s.nEn}]`);
}
// ② PC の画面の配置(基準と比べる)
if (MODE === 'check') {
  const baseDir = path.join(DIR, 'baseline');
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.txt')).sort()) {
    const bf = path.join(baseDir, f);
    const name = f.replace(/\.txt$/, '');
    if (!fs.existsSync(bf)) { console.log(`?? ${name}: 配置の基準が無い(baseline を先に撮る)`); failed = true; continue; }
    const a = fs.readFileSync(bf, 'utf8').split('\n'); const c = fs.readFileSync(path.join(OUT, f), 'utf8').split('\n');
    const sa = new Set(a); const sc = new Set(c);
    const gone = a.filter(x => !sc.has(x)); const added = c.filter(x => !sa.has(x));
    const ok = gone.length === 0 && added.length === 0;
    if (!ok) failed = true;
    console.log(`${ok ? 'OK ' : 'NG '} ${name}: 配置の差 -${gone.length} +${added.length}`);
    if (!ok) { for (const x of gone.slice(0, 8)) console.log(`     - ${x}`); for (const x of added.slice(0, 8)) console.log(`     + ${x}`); }
  }
}
await b.close();
console.log(MODE === 'baseline' ? `基準を保存: ${OUT}` : failed ? 'PC にずれがあります(上の NG を確認)' : 'PC の大きさの比・配置とも問題なし');
process.exit(failed ? 1 : 0);
