// HD-2D atmosphere helpers: soft radial textures baked once into offscreen
// canvases, reused by sprites for the player light halo and the screen
// vignette. Colour grade is a flat tinted sprite (no texture needed) and is
// built directly in the scene.

import { Texture } from 'pixi.js';

let glowTex: Texture | null = null;
let vignetteTex: Texture | null = null;
let softShadowTex: Texture | null = null;

// Soft round light: opaque white centre fading to transparent at the rim.
// Tinted warm + 'add' blended for the player halo.
export const getGlowTexture = (): Texture => {
  if (glowTex) return glowTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTex = Texture.from(canvas);
  return glowTex;
};

// Vignette: transparent through the centre, darkening to near-black at the
// corners. Stretched to the screen (so it reads as an ellipse, which is the
// usual cinematic vignette shape).
export const getVignetteTexture = (): Texture => {
  if (vignetteTex) return vignetteTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, r * 0.55, r, r, r * 1.0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.75, 'rgba(4,6,12,0.35)');
  g.addColorStop(1, 'rgba(2,3,8,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  vignetteTex = Texture.from(canvas);
  return vignetteTex;
};

// Soft shadow blob: black, opaque-ish centre fading to transparent at the rim.
// Drawn as a sprite stretched/rotated so foot shadows get soft edges (no per-frame
// blur filter). Tinted black + normal alpha by the caller.
export const getSoftShadowTexture = (): Texture => {
  if (softShadowTex) return softShadowTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  // 実体(濃い部分)を広めに取り、フェードは外周だけ=ぼかし弱め(エッジがはっきり)。
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.66, 'rgba(0,0,0,0.94)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softShadowTex = Texture.from(canvas);
  return softShadowTex;
};
