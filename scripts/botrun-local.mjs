// ローカル(テストチャット)用ボット実走ランナー(TEST_HANDOFF運用・v0.25.1706)。
// TEST_HANDOFF/request.config.json を読み、各構成をローカルChromeで実走して
// TEST_HANDOFF/results/ に生データ(.json)を書く。人間向け要約(.md)はテストチャットが書く。
// 使い方: node scripts/botrun-local.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'TEST_HANDOFF/request.config.json'), 'utf8'));
const outDir = path.join(root, 'TEST_HANDOFF/results');
fs.mkdirSync(outDir, { recursive: true });

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

  const url = `${cfg.baseUrl}?smoke=1&bot=${c.persona ?? 'standard'}&stage=stage-1`;
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
    console.log(`[warn] ${c.name}: smokeスキップ不発 → タイトルからUIクリックで開始を試行`);
    const clickSeq = ['はじめる', '狂い咲きの森', '出撃準備', 'START'];
    for (const label of clickSeq) {
      try {
        await page.getByText(label, { exact: false }).first().click({ timeout: 8000 });
        await page.waitForTimeout(1800);
        console.log(`[fallback] clicked: ${label}`);
      } catch {
        console.log(`[fallback] click失敗: ${label}(この時点の画面テキストを記録)`);
        break;
      }
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
const outPath = path.join(outDir, `${stamp}-raw.json`);
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), config: cfg, results }, null, 2));
console.log(`[out] ${outPath}`);
