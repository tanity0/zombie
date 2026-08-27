// 通しAI実機テスト用スイープランナー(2026-08-27・設計チャット作成/REQUEST.md「通しE2E」参照)。
// botrun-local.mjs と同じ土台(ローカルビルド→preview→実走)で、ボス直行クエリのシナリオ列を回し、
// **console全文([GHOSTLOG]/[GHOSTDMG]/[BOT_REPORT]/エラー)とDOMの通信セリフ**を機械採取する。
// 使い方: プロジェクト直下で `node TEST_HANDOFF/run-e2e-sweep.mjs`
// 出力: TEST_HANDOFF/results/<stamp>-e2e-sweep-raw.json + スクショ最大4枚(掟: PNGは1テスト5枚まで)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'TEST_HANDOFF/results');
fs.mkdirSync(outDir, { recursive: true });

// ── シナリオ表(REQUEST.md の A/B 系列と1:1。durMs=そのシナリオの実走時間)─────────────────
// ボットは死亡すると [BOT_REPORT] を出して止まる。死亡してもシナリオは時間まで観測を続ける
// (死亡後のログ/画面も証拠)。shot: 'end'|'mid'|null = スクショを撮るか(掟: 合計5枚まで)。
const SCENARIOS = [
  { name: 'A1-ghost-castle', durMs: 10 * 60000, shot: 'end',
    query: 'smoke=1&stage=stage-1&castlenow=1&ghost=1&ghostlog=1&autotut=1&bot=standard&botskill=master' },
  { name: 'A2-ghost-thor-nihil', durMs: 10 * 60000, shot: 'end',
    query: 'smoke=1&stage=stage-5&bossnow=1&ghost=1&ghostlog=1&autotut=1&bot=standard&botskill=casual' },
  { name: 'A3-ghost-bounty', durMs: 8 * 60000, shot: null,
    query: 'smoke=1&stage=stage-1&bountynow=1&bountytype=melee&ghost=1&ghostlog=1&autotut=1&bot=standard&botskill=master' },
  { name: 'A4-ghost-angel', durMs: 10 * 60000, shot: null,
    query: 'smoke=1&stage=stage-1&gateboss=1&ghost=1&ghostlog=1&autotut=1&bot=standard&botskill=master' },
  { name: 'A5-ghost-idol', durMs: 8 * 60000, shot: 'mid',
    query: 'smoke=1&stage=stage-1&idolnow=1&ghost=1&ghostlog=1&autotut=1&bot=standard&botskill=master' },
  { name: 'B1-phantom', durMs: 12 * 60000, shot: 'end',
    query: 'smoke=1&stage=stage-1&phantomnow=1&autotut=1&bot=standard&botskill=master' },
];

// ── サーバ(botrun-local.mjs と同じ: 毎回ビルド→preview)────────────────────────────────
console.log('[setup] npm run build(最新HEADをテストするため毎回ビルド)');
execSync('npm run build', { cwd: root, stdio: 'inherit' });
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore', shell: true });
server.on('error', (e) => console.error('[setup] previewサーバのspawnに失敗:', e.message));
let up = false;
for (let i = 0; i < 30 && !up; i++) {
  try { const r = await fetch('http://localhost:4173/zombie/'); up = r.ok; } catch { /* retry */ }
  if (!up) await new Promise(r => setTimeout(r, 1000));
}
if (!up) { console.error('[setup] previewサーバが起動しない'); server.kill(); process.exit(1); }
const baseUrl = 'http://localhost:4173/zombie/';
console.log('[setup] preview起動OK →', baseUrl);

// ローカル(テストチャット)= Chrome。コンテナ実行時のフォールバック = 環境Chromium+swiftshader
// (TEST_HANDOFF/HEADLESS.md の掟。`npx playwright install` は絶対にしない)。
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  .catch(() => chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  }));

const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
const results = [];
let shotCount = 0;

for (const sc of SCENARIOS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const errors = [];
  const tagged = [];   // [GHOSTLOG]/[GHOSTDMG]/[BOT_REPORT] を含む行(全部)
  const otherLog = []; // その他のconsole行(先頭200行まで=肥大防止)
  page.on('pageerror', e => errors.push({ atSec: sec(), text: String(e).slice(0, 500) }));
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error') { errors.push({ atSec: sec(), text: text.slice(0, 500) }); return; }
    if (text.includes('[GHOSTLOG]') || text.includes('[GHOSTDMG]') || text.includes('[BOT_REPORT]')) {
      tagged.push({ atSec: sec(), text: text.slice(0, 400) });
    } else if (otherLog.length < 200) {
      otherLog.push({ atSec: sec(), text: text.slice(0, 200) });
    }
  });
  const sec = () => Math.round((Date.now() - t0) / 1000);

  const url = `${baseUrl}?${sc.query}`;
  console.log(`[run] ${sc.name} → ${url}(${Math.round(sc.durMs / 60000)}分)`);
  await page.goto(url, { waitUntil: 'load' });

  // ?smoke=1 不発のフォールバック(botrun-local.mjs と同じ: 「はじめる」を1回押す)。
  let smokeFallback = false;
  await page.waitForTimeout(9000);
  const titleTxt = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (titleTxt.includes('はじめる')) {
    smokeFallback = true;
    try { await page.getByText('はじめる', { exact: false }).first().click({ timeout: 15000 }); } catch { /* 記録のみ */ }
  }

  // 観測ループ: 5秒ごとにDOMを見る。通信セリフ(既定文)の初出時刻を記録。30秒ごとにinnerTextの
  // 先頭200文字をタイムラインへ(フリーズ/画面遷移の事後解析用)。ボットのレポートも拾う。
  let arrivalSeenAtSec = null;   // 「援護します」(守護霊の登場セリフ・未設定時の既定文)
  let departureSeenAtSec = null; // 「帰還します」(退場セリフの既定文)
  const textTimeline = [];
  let botReport = null;
  let midShotDone = false;
  while (Date.now() - t0 < sc.durMs) {
    await page.waitForTimeout(5000);
    const body = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (arrivalSeenAtSec === null && body.includes('援護します')) arrivalSeenAtSec = sec();
    if (departureSeenAtSec === null && body.includes('帰還します')) departureSeenAtSec = sec();
    if (sec() % 30 < 5) textTimeline.push({ atSec: sec(), text: body.slice(0, 200) });
    if (!botReport) botReport = await page.evaluate(() => window.__BOT_REPORT__ ?? null).catch(() => null);
    if (sc.shot === 'mid' && !midShotDone && sec() >= Math.round(sc.durMs / 2000) && shotCount < 5) {
      midShotDone = true; shotCount++;
      await page.screenshot({ path: path.join(outDir, `${stamp}-${sc.name}.png`) }).catch(() => {});
    }
  }
  if (sc.shot === 'end' && shotCount < 5) {
    shotCount++;
    await page.screenshot({ path: path.join(outDir, `${stamp}-${sc.name}.png`) }).catch(() => {});
  }

  // 集計(要約はテストチャットが .md に書く。ここは機械集計だけ)
  const ghostlog = tagged.filter(l => l.text.includes('[GHOSTLOG]'));
  const count = (word) => ghostlog.filter(l => l.text.includes(word)).length;
  results.push({
    scenario: sc.name, url, realSec: sec(), smokeFallback,
    summary: {
      ghostlogLines: ghostlog.length,
      監視: count('監視'), 構え: count('構え'), 成立: count('成立'),
      棄却: count('棄却'), 一閃不発: count('一閃不発'),
      無境地振り: count('無境地振り'), 無境地ヒット打刻: count('無境地ヒット打刻'),
      被弾行GHOSTDMG: tagged.filter(l => l.text.includes('[GHOSTDMG]')).length,
      arrivalSeenAtSec, departureSeenAtSec,
      consoleErrors: errors.length,
    },
    botReport, tagged, errors, otherLogHead: otherLog.slice(0, 60), textTimeline,
  });
  console.log(`[done] ${sc.name}: ghostlog=${ghostlog.length} 成立=${count('成立')} errors=${errors.length} arrival=${arrivalSeenAtSec} departure=${departureSeenAtSec}`);
  await ctx.close();
}

await browser.close();
server.kill();
const outPath = path.join(outDir, `${stamp}-e2e-sweep-raw.json`);
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), scenarios: SCENARIOS, results }, null, 2));
console.log(`[out] ${outPath}`);
