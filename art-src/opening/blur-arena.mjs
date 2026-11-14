// アリーナ3枚の事前ブラー版を生成(被写界深度の周辺ぼけ用・v0.25.2060)。
// ImageMagick不在のためChromiumでCSS blurをレンダーしてスクショ→JPEG保存。
// 端の滲み(透明サンプリング)はscale(1.03)のオーバーフィルで回避。
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const JOBS = [
  { src: 'public/opening/arena.jpg', out: 'public/opening/arena-blur.jpg', w: 1536, h: 1024 },
  { src: 'public/opening/arena-diag.jpg', out: 'public/opening/arena-diag-blur.jpg', w: 1672, h: 941 },
  { src: 'public/opening/arena-side.jpg', out: 'public/opening/arena-side-blur.jpg', w: 1672, h: 941 },
];
const BLUR_PX = 10; // 素材解像度基準。表示時は約1/4縮小=画面上約2.5px、ズーム最大(3.6x)で約9px相当

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const j of JOBS) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h } });
  const b64 = readFileSync(j.src).toString('base64');
  await page.setContent(`<body style="margin:0;background:#000;overflow:hidden">
    <img src="data:image/jpeg;base64,${b64}"
         style="width:${j.w}px;height:${j.h}px;filter:blur(${BLUR_PX}px);transform:scale(1.03);transform-origin:center">
  </body>`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: j.out, type: 'jpeg', quality: 82 });
  await page.close();
  console.log('wrote', j.out);
}
await browser.close();
