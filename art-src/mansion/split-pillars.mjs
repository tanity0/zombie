// 洋館(ステージ6)柱素材: 紫背景を境界フラッドフィルで透過→左右の柱に分割して書き出す。
// 実行: リポジトリルートで `node art-src/mansion/split-pillars.mjs`
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const SRC = 'art-src/mansion/pillars-src.png';
const OUT_DIR = 'public/sprites/mansion';
const TOL = 34; // 紫ベタのキー許容差

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const b64 = readFileSync(SRC).toString('base64');
const result = await page.evaluate(async ({ b64, TOL }) => {
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
  const isBg = (i4) => Math.abs(p[i4] - bg[0]) < TOL && Math.abs(p[i4 + 1] - bg[1]) < TOL && Math.abs(p[i4 + 2] - bg[2]) < TOL;
  // 境界フラッドフィル(外側の紫だけ透過。アート内部の似色は残す)。
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
  // 左半分/右半分それぞれの不透明ピクセルのバウンディングボックスを求めて切り出す。
  const bbox = (x0, x1) => {
    let minX = x1, maxX = x0, minY = H, maxY = 0;
    for (let y = 0; y < H; y++) {
      for (let x = x0; x < x1; x++) {
        if (p[(y * W + x) * 4 + 3] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  };
  const crop = (b) => {
    const cc = document.createElement('canvas');
    cc.width = b.w; cc.height = b.h;
    cc.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return cc.toDataURL('image/png');
  };
  const lb = bbox(0, (W / 2) | 0), rb = bbox((W / 2) | 0, W);
  return { left: crop(lb), right: crop(rb), lb, rb };
}, { b64, TOL });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/pillar-left.png`, Buffer.from(result.left.split(',')[1], 'base64'));
writeFileSync(`${OUT_DIR}/pillar-right.png`, Buffer.from(result.right.split(',')[1], 'base64'));
console.log('wrote', OUT_DIR, JSON.stringify({ lb: result.lb, rb: result.rb }));
await browser.close();
