// 洋館(ステージ6)奥の一枚絵(ステンドグラス窓の壁): 紫背景をグローバルキーで透過→bboxで切り出し。
// 実行: リポジトリルートで `node art-src/mansion/key-back.mjs`
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const SRC = 'art-src/mansion/candle-src.png';
const OUT = 'public/sprites/mansion/candle.png';
const TOL = 34;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const b64 = readFileSync(SRC).toString('base64');
const dataUrl = await page.evaluate(async ({ b64, TOL }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H);
  const p = d.data;
  const bg = [p[0], p[1], p[2]];
  for (let i4 = 0; i4 < p.length; i4 += 4) {
    if (Math.abs(p[i4] - bg[0]) < TOL && Math.abs(p[i4 + 1] - bg[1]) < TOL && Math.abs(p[i4 + 2] - bg[2]) < TOL) p[i4 + 3] = 0;
  }
  ctx.putImageData(d, 0, 0);
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (p[(y * W + x) * 4 + 3] > 0) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const cc = document.createElement('canvas');
  cc.width = maxX - minX + 1; cc.height = maxY - minY + 1;
  cc.getContext('2d').drawImage(c, minX, minY, cc.width, cc.height, 0, 0, cc.width, cc.height);
  return cc.toDataURL('image/png');
}, { b64, TOL });
mkdirSync('public/sprites/mansion', { recursive: true });
writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote', OUT);
await browser.close();
