// ローカル(テストチャット)用ボット実走ランナー(TEST_HANDOFF運用・v0.25.1706)。
// TEST_HANDOFF/request.config.json を読み、各構成をローカルChromeで実走して
// TEST_HANDOFF/results/ に生データ(.json)を書く。人間向け要約(.md)はテストチャットが書く。
// 使い方: node scripts/botrun-local.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

// Windows対応: URL.pathname は「\C:\...」になり ENOENT で即死する(テストチャット報告v0.25.1707)。
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'TEST_HANDOFF/request.config.json'), 'utf8'));
const outDir = path.join(root, 'TEST_HANDOFF/results');
fs.mkdirSync(outDir, { recursive: true });

// baseUrl:"local" = その場でビルドしてプレビューサーバを立てる(既定)。Pages配信のラグ/環境差を排除し、
// 常に「pullした最新コード」をテストする。URL文字列を入れればそのURL(Pages等)を叩く従来動作。
let baseUrl = cfg.baseUrl;
let server = null;
if (baseUrl === 'local') {
  if (cfg.skipBuild !== true) {
    console.log('[setup] npm run build(最新HEADをテストするため毎回ビルド・約20-30秒)');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }
  // Windows対応(テストチャット報告v0.25.1721): npxの実体はnpx.cmdのため素のspawnはENOENT(-4058)で落ちる。
  // shell:trueで解決し、errorイベントも拾って診断可能にする。
  server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore', detached: false, shell: true });
  server.on('error', (e) => console.error('[setup] previewサーバのspawnに失敗:', e.message));
  let up = false;
  for (let i = 0; i < 30 && !up; i++) {
    try { const r = await fetch('http://localhost:4173/zombie/'); up = r.ok; } catch { /* retry */ }
    if (!up) await new Promise(r => setTimeout(r, 1000));
  }
  if (!up) { console.error('[setup] previewサーバが起動しない'); server.kill(); process.exit(1); }
  baseUrl = 'http://localhost:4173/zombie/';
  console.log('[setup] preview起動OK →', baseUrl);
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
const browser = await chromium.launch({ headless: cfg.headless !== false, channel: 'chrome' })
  .catch(() => chromium.launch({ headless: cfg.headless !== false })); // Chrome不在ならPlaywright同梱Chromium
const results = [];

for (const c of cfg.configs) {
  const ctx = await browser.newContext({ viewport: cfg.viewport ?? { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 500)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 500)));
  await ctx.addInitScript(({ subs, skills }) => {
    try {
      if (subs) localStorage.setItem('zombie:loadoutSubs', JSON.stringify(subs));
      if (skills) {
        localStorage.setItem('zombie:loadoutSkills', JSON.stringify(skills));
        localStorage.setItem('zombie:ownedSkills', JSON.stringify(skills));
        const lv = {}; for (const k of skills) lv[k] = 3;
        localStorage.setItem('zombie:ownedSkillLevels', JSON.stringify(lv));
      }
    } catch { /* ignore */ }
  }, { subs: c.subs, skills: c.skills });

  // extraQuery(任意): ラン別の追加URLパラメータ("bountynow=1&bountytype=melee" 等)。
  // クリ計測のボス戦ラン(REQUEST 2026-08-15)のために追加。未指定なら従来と同一URL。
  // ★stage(任意・v0.25.3929): ステージをランごとに変えられる。既定は従来どおり stage-1。
  //   旧実装は `stage=stage-1` を直書きしていて、`stage` は**先勝ち**なので extraQuery でも
  //   上書きできず、**stage-2 以降のランが作れなかった**(2026-08-25のテストで実際に詰まり、
  //   テストチャットが手作業で回避した)。依頼側が書けるようにする。
  const url = `${baseUrl}?smoke=1&bot=${c.persona ?? 'standard'}&stage=${c.stage ?? 'stage-1'}${c.extraQuery ? `&${c.extraQuery}` : ''}`;
  const t0 = Date.now();
  console.log(`[run] ${c.name} → ${url}`);
  await page.goto(url, { waitUntil: 'load' });
  // ?smoke=1 が効かずタイトルで止まった場合のフォールバック(自動クリックで出撃まで進める)。
  // ボット(?bot)はゲーム開始後に勝手に操作を引き継ぐので、ここは開始导線だけ通せばよい。
  let smokeFallback = false;
  await page.waitForTimeout(9000);
  const titleTxt = await page.evaluate(() => document.body.innerText).catch(() => '');
  if (titleTxt.includes('はじめる')) {
    smokeFallback = true;
    // テストチャット実測(v0.25.1707): 「はじめる」1クリックで足りる(その後は?smoke=1が自動出撃させる。
    // ステージ選択以降のクリック列は不要=空振りする)。ロードが遅い環境ではタイトル表示まで時間がかかる
    // だけなので、クリック前に追加で待つ。
    console.log(`[warn] ${c.name}: タイトル検出 → 「はじめる」をクリック(以降は?smoke=1が自動出撃)`);
    try {
      await page.getByText('はじめる', { exact: false }).first().click({ timeout: 15000 });
      console.log('[fallback] clicked: はじめる');
    } catch {
      console.log('[fallback] click失敗: はじめる(この時点の画面テキストを記録)');
    }
  }
  let report = null;
  while (Date.now() - t0 < (cfg.runMs ?? 900000)) {
    await page.waitForTimeout(5000);
    report = await page.evaluate(() => window.__BOT_REPORT__ ?? null).catch(() => null);
    if (report) break; // 死亡 or 15分到達でレポートが出る
  }
  await page.screenshot({ path: path.join(outDir, `${stamp}-${c.name}.png`) }).catch(() => {});
  const finalTxt = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '');
  results.push({ config: c.name, subs: c.subs, skills: c.skills, realSec: Math.round((Date.now() - t0) / 1000), smokeFallback, botReport: report, errors, finalBodySnippet: finalTxt });
  console.log(`[done] ${c.name}: report=${report ? 'yes' : 'timeout'} errors=${errors.length}`);
  await ctx.close();
}

await browser.close();
server?.kill();
const outPath = path.join(outDir, `${stamp}-raw.json`);
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), config: cfg, results }, null, 2));
console.log(`[out] ${outPath}`);
