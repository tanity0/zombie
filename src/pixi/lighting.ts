// HD-2D atmosphere helpers: soft radial textures baked once into offscreen
// canvases, reused by sprites for the player light halo and the screen
// vignette. Colour grade is a flat tinted sprite (no texture needed) and is
// built directly in the scene.

import { Texture } from 'pixi.js';

let glowTex: Texture | null = null;
const vignetteTexByInner = new Map<number, Texture>();
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

// 施策1(効果のper-frame Graphics廃止)用の共有テクスチャ群。particle/ring/trail を
// プールsprite化するための白素材。tint/scale/alpha で色・大きさ・フェードを表す。

// 白いハードエッジの円盤。Graphics の circle().fill() と同形状なので、これを tint+scale
// した sprite は旧・毎フレーム円fillと見た目が一致する(パーティクルの halo/本体/芯に使う)。
let circleTex: Texture | null = null;
export const getCircleTexture = (): Texture => {
  if (circleTex) return circleTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  circleTex = Texture.from(canvas);
  return circleTex;
};

// リング(円周ストローク)用の白アニュラス。段階ベース半径ごとに1回だけ焼き、実行時は
// 終端半径に最も近いベースを選んで scale する(線の太さのひずみを ±√2 以内に抑える)。
// プロファイルは旧Graphicsの3重ストロークのうち色側2本(柔帯 width+4/α0.3+主線 width/α1.0、
// 基準線幅=4px)を1枚に合成。白い熱芯は getRingCoreTexture(別枚)で重ねる(tintで色が乗らないように)。
export const RING_TEX_BASES = [16, 32, 64, 128, 256];
const RING_TEX_PAD = 14;
const ringTexCache = new Map<number, Texture>();
export const getRingTexture = (base: number): Texture => {
  const hit = ringTexCache.get(base);
  if (hit) return hit;
  const half = base + RING_TEX_PAD;
  const size = half * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  const stop = (r: number) => Math.max(0, Math.min(1, r / half));
  g.addColorStop(stop(base - 6), 'rgba(255,255,255,0)');
  g.addColorStop(stop(base - 3), 'rgba(255,255,255,0.3)');
  g.addColorStop(stop(base - 2), 'rgba(255,255,255,1)');
  g.addColorStop(stop(base + 2), 'rgba(255,255,255,1)');
  g.addColorStop(stop(base + 3), 'rgba(255,255,255,0.3)');
  g.addColorStop(stop(base + 6), 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = Texture.from(canvas);
  ringTexCache.set(base, tex);
  return tex;
};

// リングの白い熱芯(旧: width*0.4 の白ストローク)。色リングと同ベース半径・同scaleで重ねる。
const ringCoreTexCache = new Map<number, Texture>();
export const getRingCoreTexture = (base: number): Texture => {
  const hit = ringCoreTexCache.get(base);
  if (hit) return hit;
  const half = base + RING_TEX_PAD;
  const size = half * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  const stop = (r: number) => Math.max(0, Math.min(1, r / half));
  g.addColorStop(stop(base - 2), 'rgba(255,255,255,0)');
  g.addColorStop(stop(base - 1), 'rgba(255,255,255,1)');
  g.addColorStop(stop(base + 1), 'rgba(255,255,255,1)');
  g.addColorStop(stop(base + 2), 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = Texture.from(canvas);
  ringCoreTexCache.set(base, tex);
  return tex;
};

// Green insect egg (mine): baked ONCE into a canvas and drawn as a pooled
// normal-blend sprite, replacing the old per-frame `Graphics` egg (clear() +
// ~12 ellipse fills every frame). Upright mossy-green egg with an upper-left
// highlight and a faint contact shadow baked at the base, so a single sprite
// (anchor 0.5,1 at footX/footY) draws the whole thing. Tint/scale can vary it.
let eggTex: Texture | null = null;
export const getEggTexture = (): Texture => {
  if (eggTex) return eggTex;
  const w = 64, h = 84;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const cx = w / 2;
  // contact shadow on the ground (baked at the very bottom).
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, 20, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(7,16,10,0.38)';
  ctx.fill();
  // egg body: upright oval, dark mossy green with an upper-left highlight.
  const bodyCx = cx, bodyCy = 40, rx = 18, ry = 27;
  const grad = ctx.createRadialGradient(bodyCx - 6, bodyCy - 12, 2, bodyCx, bodyCy, 32);
  grad.addColorStop(0, 'rgba(120,135,90,1)');   // highlight ~#788d5a
  grad.addColorStop(0.4, 'rgba(60,80,45,1)');    // mid ~#3c502d
  grad.addColorStop(1, 'rgba(11,33,19,1)');      // shadow ~#0b2113
  ctx.beginPath();
  ctx.ellipse(bodyCx, bodyCy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  // subtle dark rim so the egg reads against bright ground.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(8,18,11,0.5)';
  ctx.stroke();
  // bright speck highlight (upper-left).
  ctx.beginPath();
  ctx.ellipse(bodyCx - 7, bodyCy - 14, 4, 6, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(160,170,120,0.5)';
  ctx.fill();
  eggTex = Texture.from(canvas);
  return eggTex;
};

// アーム済み(起爆待ち)の赤卵(社長仕様v0.25.1846「踏むと赤くプクプク」)。形状は緑卵と同一・
// パレットだけ赤系に差し替えて一度だけベイク(tintで緑を赤くすると濁るため専用ベイク)。
let eggTexArmed: Texture | null = null;
export const getEggTextureArmed = (): Texture => {
  if (eggTexArmed) return eggTexArmed;
  const w = 64, h = 84;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const cx = w / 2;
  ctx.beginPath();
  ctx.ellipse(cx, h - 6, 20, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(16,7,7,0.38)';
  ctx.fill();
  const bodyCx = cx, bodyCy = 40, rx = 18, ry = 27;
  const grad = ctx.createRadialGradient(bodyCx - 6, bodyCy - 12, 2, bodyCx, bodyCy, 32);
  grad.addColorStop(0, 'rgba(235,140,110,1)');  // highlight(熱)
  grad.addColorStop(0.4, 'rgba(190,55,40,1)');  // mid=赤
  grad.addColorStop(1, 'rgba(56,10,10,1)');     // shadow=暗赤
  ctx.beginPath();
  ctx.ellipse(bodyCx, bodyCy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(30,6,6,0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(bodyCx - 7, bodyCy - 14, 4, 6, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,190,150,0.55)';
  ctx.fill();
  eggTexArmed = Texture.from(canvas);
  return eggTexArmed;
};

// Visibility light: a near-solid white disc that drops off abruptly near the rim.
// Used as a "hole" in the stage-2 darkness overlay (player + UV bars). The flat
// core keeps the lit zone at full visibility, then it darkens sharply past ~radius
// (社長指示「ハンドガン射程くらいから外は急激に暗い」).
let visLightTex: Texture | null = null;
export const getVisibilityLightTexture = (): Texture => {
  if (visLightTex) return visLightTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  // 円形でなだらかに減衰(中心=明るい → 縁=透明)。硬い縁/四角さを避ける。
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  visLightTex = Texture.from(canvas);
  return visLightTex;
};

// Vignette: transparent through the centre, darkening to near-black at the
// corners. Stretched to the screen (so it reads as an ellipse, which is the
// usual cinematic vignette shape).
// `inner` = 明るい(透明)中心の半径割合。小さいほど明るい部分が狭い(減光が中心寄りから始まる)。
//   既定 0.55(全ステージ共通)/ ステージ2は 0.35 の狭い版を使う(社長指示)。
export const getVignetteTexture = (inner = 0.55): Texture => {
  const cached = vignetteTexByInner.get(inner);
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, r * inner, r, r, r * 1.0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.75, 'rgba(4,6,12,0.35)');
  g.addColorStop(1, 'rgba(2,3,8,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = Texture.from(canvas);
  vignetteTexByInner.set(inner, tex);
  return tex;
};
// ステージ2(lab)用の「明るい部分が狭い=暗い部分が広い」vignette。中心の明部をさらに絞る(社長指示)。
export const getVignetteTextureNarrow = (): Texture => getVignetteTexture(0.22);

// 瀕死(HP≤20)用の「暗い赤」vignette。中心は透明、縁へ向けて暗い赤が濃くなる(RGBが赤なので tint 不要で赤く出る)。
let redVignetteTex: Texture | null = null;
export const getRedVignetteTexture = (): Texture => {
  if (redVignetteTex) return redVignetteTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, r * 0.30, r, r, r * 1.0);
  g.addColorStop(0, 'rgba(120,0,0,0)');
  g.addColorStop(0.6, 'rgba(150,0,0,0.40)');
  g.addColorStop(1, 'rgba(190,0,0,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  redVignetteTex = Texture.from(canvas);
  return redVignetteTex;
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
  // 連続した帯ではなく「離散した雲の個体」を横に間隔を空けて並べる(本物の雲のように)。
  // 各個体は数個のパフのまとまり。横方向は ±w で継ぎ目なくタイル可。
  const K = 3; // 横に並ぶ雲の個体数(間に隙間ができる)
  for (let k = 0; k < K; k++) {
    const ccx = w * ((k + 0.5) / K) + (hash(k * 7 + 1) - 0.5) * (w / K) * 0.30;
    const ccy = h * (0.40 + hash(k * 7 + 2) * 0.20);
    const puffN = 4 + Math.floor(hash(k * 7 + 3) * 3); // 4〜6
    for (let pi = 0; pi < puffN; pi++) {
      const s = k * 40 + pi * 3;
      const px = ccx + (hash(s + 1) - 0.5) * w * 0.10; // 個体内のまとまり(狭め=隙間を残す)
      const py = ccy + (hash(s + 2) - 0.5) * h * 0.28;
      const r = 30 + hash(s + 3) * 45;
      const a = 0.14 + hash(s + 4) * 0.16;
      for (const dx of [-w, 0, w]) {
        const x = px + dx;
        const g = ctx.createRadialGradient(x, py, 0, x, py, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.55, `rgba(255,255,255,${a * 0.5})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, py - r, r * 2, r * 2);
      }
    }
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
  const N = 6;
  const valley = h * 0.62; // 谷を高め(=山の間は霧が薄く、個体が離れて見える)
  const peaks: { cx: number; a: number; wd: number }[] = [];
  for (let j = 0; j < N; j++) {
    peaks.push({
      cx: w * ((j + 0.5) / N) + (hash(j * 4 + 1) - 0.5) * (w / N) * 0.55, // 間隔のばらつき(ランダム感)
      a: h * (0.10 + hash(j * 4 + 2) * 0.22),         // 山の高さ=浅め+ばらつき
      wd: (w / N) * (0.55 + hash(j * 4 + 3) * 0.45),  // 裾を狭めて山どうしを離す(隙間)
    });
  }
  const ridge = (x: number): number => {
    let y = valley;
    for (const p of peaks) {
      // 横方向に周期的(継ぎ目なくタイル可)にするため、±w にずらした山の寄与も加える。
      for (const off of [-w, 0, w]) {
        const d = Math.abs(x - (p.cx + off));
        if (d < p.wd) y -= p.a * 0.5 * (1 + Math.cos((Math.PI * d) / p.wd));
      }
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
