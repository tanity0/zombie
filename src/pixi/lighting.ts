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

// シネマティック残照(社長試作v0.25.1860 `?cine=1`)。画面上部=地平の残照を暖色でscreen合成する
// 縦グラデを一度だけベイク。上=血の残照(橙)がピーク→下(足元)へフェード。teal寄せの寒色grade(乗算)と
// 合わせて teal-orange のシネマ調にする。負荷=全画面スプライト1枚(grade/vignetteと同経路)=軽い。
let cineWarmTex: Texture | null = null;
export const getCineWarmTexture = (): Texture => {
  if (cineWarmTex) return cineWarmTex;
  const w = 8, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  // 残照は「光源(sunY≈0.18)より下=地平帯」だけに集中させ、光源より上はクリーンな銀河を残す(社長指示v0.25.1927/1928・
  // 参照画像の特徴=光源より上にオレンジがあまり掛からない)。透明域を光源を越える0.20まで伸ばし、オレンジは光源より確実に下から。
  g.addColorStop(0.00, 'rgba(255,150,70,0.0)');   // 最上部=透明(銀河をそのまま見せる)
  g.addColorStop(0.20, 'rgba(255,150,70,0.0)');   // 光源(0.18)を越えるまで透明=光源より上にオレンジを出さない
  g.addColorStop(0.25, 'rgba(255,138,58,0.14)');  // 光源より確実に下=残照の立ち上がり
  g.addColorStop(0.33, 'rgba(255,126,50,0.44)');
  g.addColorStop(0.41, 'rgba(255,118,48,0.55)');  // 地平帯=残照の芯(強・ここがピーク)
  g.addColorStop(0.51, 'rgba(238,104,50,0.36)');
  g.addColorStop(0.63, 'rgba(198,86,55,0.18)');   // 地平下=淡く
  g.addColorStop(0.80, 'rgba(150,72,58,0.06)');   // 足元付近までうっすら(ゲーム面は明るくしすぎない)
  g.addColorStop(1.00, 'rgba(90,55,65,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  cineWarmTex = Texture.from(canvas);
  return cineWarmTex;
};

// シネマティック(?cine=1)の追加3要素(社長試作v0.25.1863「その他も全部積む」)。全て一度だけベイク=
// screen合成の全画面/帯スプライト。per-frameの重い描画なし=負荷は各1枚(bloom/grade同経路)。
// ① 地平の太陽フレア(白熱コア+暖色ハロー+細い十字光条)。
let cineSunTex: Texture | null = null;
export const getCineSunTexture = (): Texture => {
  if (cineSunTex) return cineSunTex;
  const s = 384; const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!; const cx = s / 2, cy = s / 2;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  halo.addColorStop(0.0, 'rgba(255,250,235,0.95)');
  halo.addColorStop(0.06, 'rgba(255,225,170,0.9)');
  halo.addColorStop(0.16, 'rgba(255,160,80,0.55)');
  halo.addColorStop(0.34, 'rgba(220,90,45,0.22)');
  halo.addColorStop(0.62, 'rgba(140,45,35,0.05)');
  halo.addColorStop(1.0, 'rgba(120,40,40,0.0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, s, s);
  // 細い十字の光条(スターバースト)。横条+縦条を加算合成で。
  ctx.globalCompositeOperation = 'lighter';
  // 横光条
  // フレア少し絞る(社長指示v0.25.1864): 十字光条の芯を弱める(横0.5→0.32・縦0.32→0.2)。
  const gx = ctx.createLinearGradient(0, cy, s, cy);
  gx.addColorStop(0, 'rgba(255,200,140,0)'); gx.addColorStop(0.5, 'rgba(255,210,150,0.32)'); gx.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = gx; ctx.fillRect(0, cy - 1.5, s, 3);
  const gy = ctx.createLinearGradient(cx, 0, cx, s);
  gy.addColorStop(0, 'rgba(255,190,130,0)'); gy.addColorStop(0.5, 'rgba(255,200,140,0.2)'); gy.addColorStop(1, 'rgba(255,190,130,0)');
  ctx.fillStyle = gy; ctx.fillRect(cx - 1.5, 0, 3, s);
  cineSunTex = Texture.from(c); return cineSunTex;
};

// ①' M1用の月(光源)。太陽フレアの白熱コア+ハローと同じ放射グラデを、RGBだけ冷たい月光(青白)へ置き換えたもの。
// 太陽の十字光条(スターバースト)は月には不自然なので**外す**(社長指示v0.25.1950「十字ビームやめよう」)=柔らかい青白グローのみ。
// 太陽と同じ cineSun スプライトにテクスチャだけ差し替えて使う(M1のみ・社長指示v0.25.1948〜)。
let cineMoonTex: Texture | null = null;
export const getCineMoonTexture = (): Texture => {
  if (cineMoonTex) return cineMoonTex;
  const s = 384; const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!; const cx = s / 2, cy = s / 2;
  // ハロー: getCineSunTexture と同じ stop 位置/α、RGBだけ冷色(青白)へ。十字光条は無し。
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  halo.addColorStop(0.0, 'rgba(240,248,255,0.95)');
  halo.addColorStop(0.06, 'rgba(205,225,255,0.9)');
  halo.addColorStop(0.16, 'rgba(150,185,240,0.55)');
  halo.addColorStop(0.34, 'rgba(90,130,210,0.22)');
  halo.addColorStop(0.62, 'rgba(50,80,160,0.05)');
  halo.addColorStop(1.0, 'rgba(40,70,140,0.0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, s, s);
  cineMoonTex = Texture.from(c); return cineMoonTex;
};

// ①'' 月暈(つきがさ)=月の周りの淡い光冠リング(大気の光冠)。中心は透明、中半径に細い冷色リング、外へフェード。
// 加算で月より大きく重ねる=月の周りに1本の淡いリング(社長指示v0.25.1956「月暈と光の呼吸で幻想的に」)。
let moonHaloTex: Texture | null = null;
export const getMoonHaloTexture = (): Texture => {
  if (moonHaloTex) return moonHaloTex;
  const s = 512; const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!; const cx = s / 2, cy = s / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  g.addColorStop(0.00, 'rgba(205,228,255,0.0)');
  g.addColorStop(0.55, 'rgba(205,228,255,0.0)');   // 月とリングの間=透明(暗い隙間=暈らしさ)
  g.addColorStop(0.66, 'rgba(210,232,255,0.06)');  // リングの立ち上がり
  g.addColorStop(0.74, 'rgba(225,240,255,0.22)');  // リングの芯(細く淡く)
  g.addColorStop(0.80, 'rgba(210,232,255,0.07)');  // 落ち
  g.addColorStop(0.92, 'rgba(185,210,248,0.02)');  // 外側うっすら
  g.addColorStop(1.00, 'rgba(165,195,238,0.0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  moonHaloTex = Texture.from(c); return moonHaloTex;
};

// ② 放射状の薄雲(太陽=下端中央から扇状に伸びる暖色の筋=「光の線」)。帯スプライトとして地平の上に重ねる。
// variant別に異なる線群を焼く(明滅=出没の煌めきを複数レイヤーの位相ちがいで作るため・社長指示v0.25.1906)。
// 各テクスチャは「原点(光源=下端中央)から外側へフェードアウト」を destination-in の放射グラデで焼き込む。
const cineCloudTexVariants: (Texture | null)[] = [];
export const getCineCloudTexture = (variant = 0, streaks = 60): Texture => {
  if (cineCloudTexVariants[variant]) return cineCloudTexVariants[variant]!;
  const w = 768, h = 384; const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const ox = w / 2, oy = h * 0.98; // 放射の原点=下端中央(=地平の太陽)
  ctx.globalCompositeOperation = 'lighter';
  let seed = 20240718 + variant * 90001; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < streaks; i++) {
    const ang = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.15; // 上方向中心に扇状
    const len = h * (0.4 + rnd() * 0.7);
    const dist0 = h * (0.05 + rnd() * 0.5);
    const x0 = ox + Math.cos(ang) * dist0, y0 = oy + Math.sin(ang) * dist0;
    const x1 = ox + Math.cos(ang) * (dist0 + len), y1 = oy + Math.sin(ang) * (dist0 + len);
    const thick = 4 + rnd() * 22;
    const a = 0.05 + rnd() * 0.16;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(255,175,110,${a})`);
    g.addColorStop(1, 'rgba(255,150,90,0)');
    ctx.strokeStyle = g; ctx.lineWidth = thick; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // ② 光源(原点)から外側へフェードアウト: 放射グラデで alpha を掛ける(destination-in)。中心付近は不透明、外周で0。
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(ox, oy, 0, ox, oy, h * 1.02);
  fade.addColorStop(0, 'rgba(255,255,255,1)');
  fade.addColorStop(0.30, 'rgba(255,255,255,1)');
  fade.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = fade; ctx.fillRect(0, 0, w, h);
  const t = Texture.from(c); cineCloudTexVariants[variant] = t; return t;
};

// ③ 大気の塵(暖色のボケ粒。タイル化してゆっくりドリフト)。
let cineDustTex: Texture | null = null;
export const getCineDustTexture = (): Texture => {
  if (cineDustTex) return cineDustTex;
  const s = 256; const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  let seed = 777; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const x = rnd() * s, y = rnd() * s;
    const r = rnd() < 0.15 ? 4 + rnd() * 7 : 0.7 + rnd() * 2.2; // たまに大きめのボケ
    const a = (0.12 + rnd() * 0.5) * (r > 4 ? 0.5 : 1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,220,170,${a})`); g.addColorStop(1, 'rgba(255,190,130,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  cineDustTex = Texture.from(c); return cineDustTex;
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
