// 洋館(ステージ6)被写界深度用の事前ブラー素材生成(v0.25.2087)。
// 柱左右/奥壁=透過PNGをパディング付きでblur(7px)。床=縦3タイルしてblur(6px)→中央を切り出し(縦シームレス維持)。
// 画像はdev server(要起動: npm run dev)経由でロードする(base64引数はサイズでdecode失敗するため)。
// 実行: リポジトリルートで `node art-src/mansion/make-blur.mjs`
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const DIR = 'public/sprites/mansion';
const BASE = 'http://localhost:5173/zombie/sprites/mansion';
const bust = Date.now(); // devサーバのキャッシュ回避
const SPRITES = [
  { url: `${BASE}/pillar-left.png?v=${bust}`, out: `${DIR}/pillar-left-blur.png`, blur: 7, pad: 24 },
  { url: `${BASE}/pillar-right.png?v=${bust}`, out: `${DIR}/pillar-right-blur.png`, blur: 7, pad: 24 },
  { url: `${BASE}/back.png?v=${bust}`, out: `${DIR}/back-blur.png`, blur: 7, pad: 24 },
  // 遠方用の強ブラー(v0.25.2090): 遠方は1/5〜1/10に縮小描画されるため7pxでは約1px相当=見えない。
  // 縮小後も効く26pxを別素材で用意し、描画側で近距離用と使い分ける。
  { url: `${BASE}/pillar-left.png?v=${bust}`, out: `${DIR}/pillar-left-farblur.png`, blur: 26, pad: 40 },
  { url: `${BASE}/pillar-right.png?v=${bust}`, out: `${DIR}/pillar-right-farblur.png`, blur: 26, pad: 40 },
  { url: `${BASE}/back.png?v=${bust}`, out: `${DIR}/back-farblur.png`, blur: 26, pad: 40 },
  // 燭台(v0.25.2093): 柱と同じく近距離/遠方の2種。
  { url: `${BASE}/candle.png?v=${bust}`, out: `${DIR}/candle-blur.png`, blur: 7, pad: 24 },
  { url: `${BASE}/candle.png?v=${bust}`, out: `${DIR}/candle-farblur.png`, blur: 26, pad: 40 },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.goto('http://localhost:5173/zombie/', { waitUntil: 'commit' });

for (const j of SPRITES) {
  const dataUrl = await page.evaluate(async ({ url, blur, pad }) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth + pad * 2;
    c.height = img.naturalHeight + pad * 2;
    const ctx = c.getContext('2d');
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(img, pad, pad);
    return c.toDataURL('image/png');
  }, j);
  writeFileSync(j.out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', j.out);
}

// 床・天井: 縦3タイル→blur→中央切り出しで上下シームレスを維持(ブラーがリピート境界を跨いでも繋がる)。
for (const t of [
  { url: `${BASE}/floor.png?v=${bust}`, out: `${DIR}/floor-blur.png` },
  { url: `${BASE}/ceiling.png?v=${bust}`, out: `${DIR}/ceiling-blur.png` },
]) {
  const dataUrl = await page.evaluate(async ({ url }) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const big = document.createElement('canvas');
    big.width = W; big.height = H * 3;
    const bctx = big.getContext('2d');
    bctx.filter = 'blur(6px)';
    for (const k of [0, 1, 2]) bctx.drawImage(img, 0, k * H);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(big, 0, H, W, H, 0, 0, W, H);
    return c.toDataURL('image/png');
  }, { url: t.url });
  writeFileSync(t.out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', t.out);
}
await browser.close();
