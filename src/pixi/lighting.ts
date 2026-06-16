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
  // 連なる山の稜線(リッジ)。複数の raised-cosine の山を重ねて連続した尾根を作り、その下を霧で満たす。
  // 谷は底まで落とさない(=山が繋がって見える)。各列を上端フェザー付き・下ほど濃い縦グラデで塗る。
  const N = 8;
  const valley = h * 0.50; // 谷(尾根の最も低い位置)
  const peaks: { cx: number; a: number; wd: number }[] = [];
  for (let j = 0; j < N; j++) {
    peaks.push({
      cx: w * ((j + 0.5) / N) + (hash(j * 4 + 1) - 0.5) * (w / N) * 0.40,
      a: h * (0.14 + hash(j * 4 + 2) * 0.22),         // 山の高さ(ばらつき=山並み)
      wd: (w / N) * (0.85 + hash(j * 4 + 3) * 0.65),  // 山の裾の広さ(隣と重なって連なる)
    });
  }
  const ridge = (x: number): number => {
    let y = valley;
    for (const p of peaks) {
      const d = Math.abs(x - p.cx);
      if (d < p.wd) y -= p.a * 0.5 * (1 + Math.cos((Math.PI * d) / p.wd));
    }
    return y;
  };
  const step = 2;
  for (let x = 0; x < w; x += step) {
    const top = ridge(x);
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');     // 稜線の縁はフェザー(霧らしく)
    g.addColorStop(0.14, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0.62)');  // 下ほど濃い本体
    ctx.fillStyle = g;
    ctx.fillRect(x, top, step + 1, h - top);
  }
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
