// 月明りの筋の絵(utils/moonShafts.ts の柔らかい分布を1度だけ焼く・白で焼いて使う側で tint)。
// 縦=筋の長さ方向(上が空の側)。幅は絵の中で細る(空の側ほど細い)ので、Sprite 1枚を回して置くだけで済む。
import { Texture } from 'pixi.js';
import { moonShaftTexel, moonPoolTexel } from '../utils/moonShafts';
import { S1N_MOON_POOL_FADE } from '../utils/weatherWet';

const TEX_W = 96;
const TEX_H = 256;
const SEEDS = [0.31, 0.77] as const;
const cache: (Texture | null)[] = [null, null];

/** i 枚目(0 か 1・中の細い筋の模様が違う)の筋の絵。初回だけ焼く(96×256=96KB)。 */
export const getMoonShaftTexture = (i: 0 | 1): Texture => {
  const hit = cache[i];
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(TEX_W, TEX_H);
    const d = img.data;
    for (let py = 0; py < TEX_H; py++) {
      for (let px = 0; px < TEX_W; px++) {
        const a = moonShaftTexel(px, py, TEX_W, TEX_H, SEEDS[i]);
        const o = (py * TEX_W + px) * 4;
        d[o] = 255; d[o + 1] = 255; d[o + 2] = 255;
        d[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = Texture.from(canvas);
  cache[i] = tex;
  return tex;
};

let poolTex: Texture | null = null;
/** 地面の月明りの溜まりの帯の絵(64×128・初回だけ焼く)。縦=帯の長さ方向(上=地面の上端の側)。 */
export const getMoonPoolTexture = (): Texture => {
  if (poolTex) return poolTex;
  const W = 64, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(W, H);
    const d = img.data;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const o = (py * W + px) * 4;
        d[o] = 255; d[o + 1] = 255; d[o + 2] = 255;
        d[o + 3] = Math.round(Math.max(0, Math.min(1, moonPoolTexel(px, py, W, H, S1N_MOON_POOL_FADE))) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  poolTex = Texture.from(canvas);
  return poolTex;
};
