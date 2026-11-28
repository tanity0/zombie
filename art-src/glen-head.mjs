// 変異後グレン(glen-boss.png)の頭部切り出し+背景透過(境界フラッドフィル方式・内部の誤爆なし)。
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const SRC = 'public/sprites/glen-boss.png';
const OUT = 'public/sprites/npc/glen-mutant-head-0.png';
const CROP = { x: 660, y: 70, w: 240, h: 240 }; // 顔(叫び)中心
const TOL = 26;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const b64 = readFileSync(SRC).toString('base64');
const dataUrl = await page.evaluate(async ({ b64, CROP, TOL }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = CROP.w; c.height = CROP.h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, CROP.w, CROP.h);
  const d = ctx.getImageData(0, 0, CROP.w, CROP.h);
  const p = d.data, W = CROP.w, H = CROP.h;
  const bg = [p[0], p[1], p[2]];
  const isBg = (i) => Math.abs(p[i] - bg[0]) < TOL && Math.abs(p[i + 1] - bg[1]) < TOL && Math.abs(p[i + 2] - bg[2]) < TOL;
  // 境界からのフラッドフィルで「外側の背景」だけ透過(アート内部の似色は残す)。
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const idx = stack.pop();
    if (seen[idx]) continue;
    seen[idx] = 1;
    const i4 = idx * 4;
    if (!isBg(i4)) continue;
    p[i4 + 3] = 0;
    const x = idx % W, y = (idx / W) | 0;
    if (x > 0) stack.push(idx - 1);
    if (x < W - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - W);
    if (y < H - 1) stack.push(idx + W);
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}, { b64, CROP, TOL });
writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
console.log('wrote', OUT);
