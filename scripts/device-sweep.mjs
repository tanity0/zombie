// 端末スイープ(v0.25.1775・社長指示「端末特有の問題もテスト機能に盛り込みたい」):
// 主要機種のビューポートでゲームを起動し、全画面+プレイヤー周辺の切り出しを一括スクショする検証ツール。
// ドット潰れ(ピクセルスナップ)・被写界深度のピント位置・UIレイアウトの端末差を目視確認する用途。
// ※数値の不変条件(スナップ帯の網羅)は src/utils/deviceCoverage.test.ts がCIで機械検査する。
//   こちらは「見た目」の最終確認ツール(実機確認の前段)。
//
// 使い方:
//   1) 別ターミナルで `npm run dev` を起動しておく(または --url で任意のビルドを指す)
//   2) node scripts/device-sweep.mjs [--url http://localhost:5173/zombie/] [--out device-sweep] [--class rogue]
//   出力: <out>/<端末名>-full.png(全画面) / <端末名>-player.png(プレイヤー周辺の拡大)
//
// 端末リストの正は src/utils/deviceCoverage.ts(こちらは複製。変更時は両方更新すること)。
// Playwright + このリポジトリの事前導入Chromium(/opt/pw-browsers/chromium)を使用。
// ローカル(社長Mac等)では executablePath を指定しなくても playwright 既定解決で動く(存在チェックで分岐)。

import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

// = src/utils/deviceCoverage.ts の複製(supported=帯内期待 / false=既知の制限も観察対象として撮る)
const DEVICES = [
  { name: 'iphone-se2', w: 375, h: 667 },
  { name: 'iphone-x-13mini', w: 375, h: 812 },
  { name: 'iphone-12-14', w: 390, h: 844 },
  { name: 'iphone-15-16', w: 393, h: 852 },
  { name: 'iphone-xr-11', w: 414, h: 896 },
  { name: 'iphone-15promax', w: 430, h: 932 },
  { name: 'iphone-16promax', w: 440, h: 956 },
  { name: 'android-360dp', w: 360, h: 800 },
  { name: 'android-384dp', w: 384, h: 854 },
  { name: 'android-412dp', w: 412, h: 915 },
  // 既知の制限(帯外)も観察のため撮る
  { name: 'LIMIT-iphone-se1', w: 320, h: 568 },
  { name: 'LIMIT-se2-safari-bars', w: 375, h: 553 },
  { name: 'LIMIT-ipad', w: 820, h: 1180 },
];

const args = process.argv.slice(2);
const opt = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const BASE_URL = opt('--url', 'http://localhost:5173/zombie/');
const OUT = opt('--out', 'device-sweep');
const KLASS = opt('--class', 'rogue');
const SETTLE_MS = 9000; // 素材ロード+登場演出明け待ち

mkdirSync(OUT, { recursive: true });
const exePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  ...(existsSync(exePath) ? { executablePath: exePath } : {}),
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});

for (const d of DEVICES) {
  const page = await browser.newPage({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 3 });
  try {
    await page.goto(`${BASE_URL}?smoke=1&class=${KLASS}&stage=stage-1&res=1`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/${d.name}-full.png` });
    // プレイヤーは画面高の~0.58(屋外camdown)。周辺を拡大で切り出し(潰れ/ピントの目視用)。
    const py = Math.round(d.h * 0.58);
    const cw = Math.min(180, d.w);
    await page.screenshot({
      path: `${OUT}/${d.name}-player.png`,
      clip: { x: Math.round(d.w / 2 - cw / 2), y: Math.max(0, py - 120), width: cw, height: Math.min(220, d.h - Math.max(0, py - 120)) },
    });
    console.log(`✓ ${d.name} (${d.w}x${d.h})`);
  } catch (e) {
    console.error(`✗ ${d.name}: ${e.message}`);
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(`done → ${OUT}/`);
