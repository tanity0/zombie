// HD-2D atmosphere helpers: soft radial textures baked once into offscreen
// canvases, reused by sprites for the player light halo and the screen
// vignette. Colour grade is a flat tinted sprite (no texture needed) and is
// built directly in the scene.

import { Texture } from 'pixi.js';

let glowTex: Texture | null = null;
let vignetteTex: Texture | null = null;
let softShadowTex: Texture | null = null;
let fogTex: Texture | null = null;
let fogBankTex: Texture | null = null;

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

// Wide billowy fog STRIP, baked once. Many soft white blobs spread across the
// full width and clustered toward the vertical centre, tapering to transparent at
// the top/bottom so the strip reads as one continuous "もくもく" cloud bank.
// Octopath's fog is essentially one wide sprite per layer gently swaying — so the
// scene stretches ONE of these per layer (no particle swarm) and just wobbles it.
// Tinted cool + screen-blended at low alpha by the caller; no per-frame blur.
export const getFogTexture = (): Texture => {
  if (fogTex) return fogTex;
  const w = 1024;
  const h = 320;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  const PUFFS = 30;
  for (let i = 0; i < PUFFS; i++) {
    // Spread across the whole width; cluster vertically near the middle so the
    // band has a soft billowy top/bottom contour and fades to transparent.
    const cx = w * (0.03 + hash(i * 5 + 1) * 0.94);
    const cy = h * (0.34 + hash(i * 5 + 2) * 0.32);
    const r = 48 + hash(i * 5 + 3) * 78;
    const a = 0.16 + hash(i * 5 + 4) * 0.20;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  fogTex = Texture.from(canvas);
  return fogTex;
};

// "Yamagiri" fog bank, baked once. A solid-ish fog mass along the bottom whose
// TOP contour is a soft mountain-ridge silhouette (overlapping rounded humps of
// varying height). Used for the frontmost foreground fog so its peaks can rise to
// just overlap the player as it sways. Tinted cool + screen-blended by the caller.
export const getFogBankTexture = (): Texture => {
  if (fogBankTex) return fogBankTex;
  const w = 1024;
  const h = 460;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  ctx.clearRect(0, 0, w, h);
  // Solid-ish base toward the bottom (the body of the bank).
  const base = ctx.createLinearGradient(0, h * 0.5, 0, h);
  base.addColorStop(0, 'rgba(255,255,255,0)');
  base.addColorStop(0.5, 'rgba(255,255,255,0.30)');
  base.addColorStop(1, 'rgba(255,255,255,0.62)');
  ctx.fillStyle = base;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);
  // Mountain-ridge top: overlapping rounded humps centred below the bottom edge,
  // each reaching up to a varying peak height → a soft jagged silhouette.
  ctx.globalCompositeOperation = 'lighter';
  const PEAKS = 9;
  for (let i = 0; i < PEAKS; i++) {
    const cx = w * ((i + 0.5) / PEAKS) + (hash(i * 3 + 1) - 0.5) * (w / PEAKS) * 0.7;
    const topY = h * (0.16 + hash(i * 3 + 2) * 0.34); // peak height varies (mountain silhouette)
    const cy = h * 1.04;                               // hump centre just below the bottom edge
    const r = cy - topY;                               // radius reaches up to the peak
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.50)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.26)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  fogBankTex = Texture.from(canvas);
  return fogBankTex;
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
