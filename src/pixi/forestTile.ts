// Procedural forest-floor tile for the Pixi background.
//
// The Canvas2D renderer paints the grass + detail props directly from a
// world-coordinate hash every frame. For Pixi we bake an equivalent patch once
// into an offscreen canvas and scroll it with a TilingSprite (tilePosition =
// -camera). Cheap and infinite; the trade-off is the pattern repeats every
// TILE px, which is fine for a spike floor and trivial to replace with a real
// ground texture later.

import { Texture } from 'pixi.js';

const TILE = 512;
const CELL = 32;

// Same deterministic 2D hash as renderUtils so the texel character matches.
const hash2 = (x: number, y: number) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const grassTuft = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = '#3a7a32';
  ctx.fillRect(x, y, 1, 3);
  ctx.fillRect(x + 2, y + 1, 1, 2);
  ctx.fillRect(x - 2, y + 1, 1, 2);
};

const flower = (ctx: CanvasRenderingContext2D, x: number, y: number, roll: number) => {
  const palette = ['#f87171', '#fbbf24', '#a5b4fc', '#f9a8d4'];
  ctx.fillStyle = palette[Math.floor(roll * palette.length)];
  ctx.fillRect(x, y, 2, 2);
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = '#2a5a25';
  ctx.fillRect(x + 1, y + 2, 1, 2);
};

const mushroom = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x + 1, y + 2, 2, 2);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(x, y, 4, 2);
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(x + 1, y, 1, 1);
};

const stone = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = '#454f53';
  ctx.fillRect(x, y + 1, 4, 2);
  ctx.fillStyle = '#5e6a70';
  ctx.fillRect(x + 1, y, 2, 1);
};

let cached: Texture | null = null;

export const getForestTexture = (): Texture => {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // Solid grass base.
  ctx.fillStyle = '#1b3a18';
  ctx.fillRect(0, 0, TILE, TILE);

  // Tinted cells.
  for (let wx = 0; wx < TILE; wx += CELL) {
    for (let wy = 0; wy < TILE; wy += CELL) {
      const h = hash2(wx, wy);
      if (h < 0.12) {
        ctx.fillStyle = '#142a11';
        ctx.fillRect(wx, wy, CELL, CELL);
      } else if (h < 0.22) {
        ctx.fillStyle = '#234d20';
        ctx.fillRect(wx, wy, CELL, CELL);
      }
    }
  }

  // Detail props.
  for (let wx = 0; wx < TILE; wx += CELL) {
    for (let wy = 0; wy < TILE; wy += CELL) {
      const d = hash2(wx + 31, wy + 17);
      if (d >= 0.32) continue;
      const px = wx + 6 + Math.floor(hash2(wx + 1, wy + 2) * (CELL - 12));
      const py = wy + 6 + Math.floor(hash2(wx + 3, wy + 5) * (CELL - 12));
      if (d < 0.16) grassTuft(ctx, px, py);
      else if (d < 0.22) flower(ctx, px, py, hash2(wx + 7, wy + 11));
      else if (d < 0.27) mushroom(ctx, px, py);
      else stone(ctx, px, py);
    }
  }

  cached = Texture.from(canvas);
  cached.source.scaleMode = 'nearest';
  return cached;
};
