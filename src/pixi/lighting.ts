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
/**
 * v0.25.2633(社長報告「松明台の外に出てきてるやつ。明らかにベタ塗りじゃん」): **柔らかく減衰する**光源用テクスチャ。
 *
 * 事故: 松明の外側ハローは `Graphics.circle(...).fill({alpha:0.09})` = **均一に塗った円**だった。
 * `fill` は中心から縁まで同じ濃さで、**縁で突然0になる**ので、加算合成すると「縁のあるベタ塗り」に見える。
 * 一方 **M6(洋館)の壁灯は綺麗**で、社長から「同じ技術を他でも使いたい」との相談があった。
 * 実装を突き合わせると、違いは**減衰カーブ**だった:
 *
 * | 中心からの距離 | 共有の `getGlowTexture` | M6の壁灯 |
 * |---|---|---|
 * | 0%   | 1.00 | 0.90 |
 * | 25%  | —    | **0.50** |
 * | 45%  | 0.55 | — |
 * | 60%  | —    | **0.16** |
 * | 100% | 0    | 0 |
 *
 * `getGlowTexture` は**45%でまだ0.55**=中心付近が広く均一に濃い(=塊に見える)。
 * M6は**25%で0.50・60%で0.16**と早く落ちて尾を引く=「芯があって外へ消える」光に見える。
 *
 * ここではM6と**同じ形**の減衰を焼く(色は白=使う側が tint する。共有テクスチャは**変更しない**
 * ——他のエフェクトが多数ぶら下がっており、影響が読めないため)。
 */
let softGlowTex: Texture | null = null;
export const getSoftGlowTexture = (): Texture => {
  if (softGlowTex) return softGlowTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  // M6(corridorLayer.bakeRadialGlow の壁灯)と同じ相対カーブ。色は白で焼き、使う側で tint する。
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softGlowTex = Texture.from(canvas);
  return softGlowTex;
};

/**
 * v0.25.2635(社長指示「光源側もDOF、松明からやって」): **ピントが外れた光源用**の平坦なカーブ。
 *
 * 考え方: 普通の物体をボカすには**ブラー版の素材を焼く**必要がある(M6の柱は `-blur`/`-farblur` を
 * 事前に焼いてクロスフェードしている)。しかし**光には輪郭が無い**ので、
 * **カーブを緩くして半径を広げるだけ**でボケになる ⇒ **素材の追加が要らず、全光源で使い回せる。**
 *
 * `getSoftGlowTexture`(ピント)との差:
 * | 距離 | ピント | ボケ |
 * |---|---|---|
 * | 25% | 0.55 | **0.72** |
 * | 60% | 0.18 | **0.34** |
 * ⇒ 中心の締まりが緩み、外へ広く残る=「大きく柔らかい玉」に見える。
 *
 * **使う側の義務**: ボケ側は**半径を広げるぶん必ずαを下げる**(総光量を保つ=ボケて明るくならない)。
 * 半径キャップも掛けること。**加算の塗り面積が律速**なので、ここを守らないと v0.25.2149 の再来になる。
 */
let bokehGlowTex: Texture | null = null;
export const getBokehGlowTexture = (): Texture => {
  if (bokehGlowTex) return bokehGlowTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.34)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  bokehGlowTex = Texture.from(canvas);
  return bokehGlowTex;
};

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

// カウンター窓のリーチリング(v0.25.2468・社長指示「進行方向寄りが太く、背面寄りに徐々に細い
// 月食の月のようなデザイン」の再現)。前方(+x)が最も太く明るく、背面へ滑らかに細く薄くなる
// アニュラスを一度だけ焼き込む。実行時はスプライトの rotation を狙い方向へ向けるだけ。
// 旧v0.25.2427実装(64線分+半径揺らぎ)は破線状のガタつきが出たため、高分割(360セグ)の
// ベイクで同じ意匠を滑らかに再現する。
const counterRingTexCache = new Map<number, Texture>();
export const getCounterRingTexture = (base: number): Texture => {
  const hit = counterRingTexCache.get(base);
  if (hit) return hit;
  const pad = RING_TEX_PAD;
  const half = base + pad;
  const size = half * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.lineCap = 'round';
  const SEGS = 360;
  for (let i = 0; i < SEGS; i++) {
    const a1 = (i / SEGS) * Math.PI * 2;
    const a2 = ((i + 1.6) / SEGS) * Math.PI * 2; // 少し重ねて継ぎ目を消す
    const mid = (a1 + a2) / 2;
    const forward = 0.5 + 0.5 * Math.cos(mid); // +x(前方)=1 / -x(背面)=0
    // 外側のソフトな光(前方ほど太く濃い)
    ctx.beginPath();
    ctx.arc(half, half, base, a1, a2);
    ctx.lineWidth = 2.5 + forward * 8.5;
    ctx.strokeStyle = `rgba(255,255,255,${(0.10 + 0.24 * forward).toFixed(3)})`;
    ctx.stroke();
    // 芯の細い明線(全周に出るが前方ほど太く明るい=月食の欠け際)
    ctx.beginPath();
    ctx.arc(half, half, base, a1, a2);
    ctx.lineWidth = 0.9 + forward * 1.3;
    ctx.strokeStyle = `rgba(255,255,255,${(0.30 + 0.60 * forward).toFixed(3)})`;
    ctx.stroke();
  }
  const tex = Texture.from(canvas);
  counterRingTexCache.set(base, tex);
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

// M1用: getCineWarmTexture の「紫版」。stop位置/αは同一で、RGBだけ暖色→紫(ヴァイオレット)へ
// (社長指示v0.25.1960 青版→v0.25.1962「青残照帯を紫にして」)。地平帯に紫の残照(月夜の霞)を screen で乗せる。
let cineCoolTex: Texture | null = null;
export const getCineCoolTexture = (): Texture => {
  if (cineCoolTex) return cineCoolTex;
  const w = 8, h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.00, 'rgba(160,90,255,0.0)');   // 最上部=透明(空/銀河をそのまま)
  g.addColorStop(0.20, 'rgba(160,90,255,0.0)');   // 光源(月≈0.18)を越えるまで透明=光源より上に紫を出さない
  g.addColorStop(0.25, 'rgba(168,100,255,0.14)'); // 光源より下=残照の立ち上がり
  g.addColorStop(0.33, 'rgba(180,115,255,0.44)');
  g.addColorStop(0.41, 'rgba(190,125,255,0.55)'); // 地平帯=残照の芯(強・ピーク・紫)
  g.addColorStop(0.51, 'rgba(168,105,240,0.36)');
  g.addColorStop(0.63, 'rgba(146,88,214,0.18)');  // 地平下=淡く
  g.addColorStop(0.80, 'rgba(120,74,182,0.06)');  // 足元付近までうっすら
  g.addColorStop(1.00, 'rgba(96,60,150,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  cineCoolTex = Texture.from(canvas);
  return cineCoolTex;
};

// フィールドに落とす「雲の影」タイルテクスチャ(社長指示v0.25.1974)。白ベース+柔らかい暗い斑=multiply用。
// 各斑を8方向のラップ位置にも描いてシームレスにタイル(TilingSpriteでドリフト)。参考: Octopath 0 の流れる雲影。
// cool=true(夜・月夜)は斑を青寄りに焼く=multiplyで寒色の影(白ベースは両方とも白=影以外は色を変えない)。社長指示v0.25.1975。
const cloudShadowTex: (Texture | null)[] = [null, null]; // [0]=昼(中立グレー) / [1]=夜(青寄り)
export const getCloudShadowTexture = (cool = false): Texture => {
  const idx = cool ? 1 : 0;
  if (cloudShadowTex[idx]) return cloudShadowTex[idx]!;
  const s = 256; const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s); // 白ベース=multiplyで無変化
  let seed = 987654321; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  ctx.globalCompositeOperation = 'multiply'; // 斑同士も重ねて濃淡
  // 斑を少し減らし+小さく=影の面積(割合)を下げて光の余白を増やす(社長指示v0.25.1978「影の割合が少しだけ多い・濃さではなく」)。濃さ(α)は据え置き。
  for (let i = 0; i < 9; i++) {
    const bx = rnd() * s, by = rnd() * s;
    const r = s * (0.11 + rnd() * 0.15);
    const v = Math.round((0.24 + rnd() * 0.22) * 255); // 影の濃さ(小=濃い)。濃くして視認性UP(社長「どこに雲影ある？」v0.25.1976)
    // 夜=R/Gを多めに落とし青を残す=寒色の影。昼=中立グレー。
    const rr = cool ? Math.round(v * 0.80) : v;
    const gg = cool ? Math.round(v * 0.90) : v;
    const bb = cool ? Math.min(255, Math.round(v * 1.06)) : v;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { // 8方向ラップ=シームレス
      const g = ctx.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, r);
      g.addColorStop(0, `rgba(${rr},${gg},${bb},1)`);
      g.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx + ox, by + oy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  cloudShadowTex[idx] = Texture.from(c);
  return cloudShadowTex[idx]!;
};

// 同じ雲影を「形をアルファに持つ黒」で焼いた版(通常合成=normal で塗る経路・現状ステージ7のみ)。
// 上の multiply 用テクスチャは **白ベースの不透明**で、雲の形は RGB(斑の暗さ)にしか入っていない。
// これを tint=黒 で塗ると全テクセルが真っ黒になり、α が一様1なので **雲の形が消えて全面ベタの
// 黒矩形**になる(=社長報告v0.25.2279「m7の雲地面の影見当たらない」の正体。影が無いのではなく
// 地面全体が均一に暗くなっていて影に見えなかった)。通常合成では形をα側に持たせる必要がある。
// 乱数列・斑の個数/位置/半径は multiply 版と同一(同じ雲の形)。α=multiply版の暗さ(1 - v/255)。
const CLOUD_SHADOW_SHAPE_GAIN = 2.0;  // 焼き込みαの密度ゲイン(v0.25.2282で1.35→2.0。1.0=multiply版と同じ暗さ)
let cloudShadowShapeTex: Texture | null = null;
export const getCloudShadowShapeTexture = (): Texture => {
  if (cloudShadowShapeTex) return cloudShadowShapeTex;
  const s = 256; const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!; // ベースは透明のまま=影の無いところは何も塗らない
  let seed = 987654321; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 9; i++) {
    const bx = rnd() * s, by = rnd() * s;              // ← multiply版と同じ順・同じ回数だけ引く
    const r = s * (0.11 + rnd() * 0.15);
    const v = Math.round((0.24 + rnd() * 0.22) * 255);
    // multiply版の「暗さ」(1 - v/255 ≒ 0.54〜0.76)を不透明度へ。ステージ7は通常合成の黒＝
    // 素のままだと薄いので密度ゲインを掛けて焼く(社長指示v0.25.2281「もっと濃くして」)。
    // 形(斑の位置/半径/重なり)は不変=濃さだけ持ち上げる。細かい増減は ?cloudshadow7alpha= 側で。
    const a = Math.min(1, (1 - v / 255) * CLOUD_SHADOW_SHAPE_GAIN);
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { // 8方向ラップ=シームレス
      const g = ctx.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx + ox, by + oy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  cloudShadowShapeTex = Texture.from(c);
  return cloudShadowShapeTex;
};

// シネマティック(?cine=1)の追加3要素(社長試作v0.25.1863「その他も全部積む」)。全て一度だけベイク=
// screen合成の全画面/帯スプライト。per-frameの重い描画なし=負荷は各1枚(bloom/grade同経路)。
// ① 地平の太陽フレア(白熱コア+暖色ハロー+細い十字光条)。
// 社長指示v0.25.1963→1965: 「光源(ハロー)だけ明るく・十字はあのまま(明るくしない)」。光源の明るさはスプライトα(CINE_SUN_ALPHA_MAX=0.95)で上げるが、
// それだと十字も一緒に明るくなるため、十字の焼き込みαを元見え(α0.67時代:横0.32/縦0.2)に合わせて下げて補正(0.32→0.226・0.2→0.141=0.67/0.95倍)=十字は元の明るさのまま。
let cineSunTex: Texture | null = null;
export const getCineSunTexture = (): Texture => {
  if (cineSunTex) return cineSunTex;
  const s = 384; const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!; const cx = s / 2, cy = s / 2;
  // できる限り明るく(社長指示v0.25.1972): 白熱コアを完全(1.0)+明るい芯を広げる+ハローを強める。bloomにも強く拾わせる。
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, s / 2);
  halo.addColorStop(0.0, 'rgba(255,253,245,1.0)');  // 白熱コア=完全
  halo.addColorStop(0.10, 'rgba(255,238,200,1.0)'); // 明るい芯を広げる(0.06→0.10)
  halo.addColorStop(0.22, 'rgba(255,180,100,0.78)');// ハローを強く・広く
  halo.addColorStop(0.40, 'rgba(230,105,55,0.34)');
  halo.addColorStop(0.65, 'rgba(155,52,40,0.09)');
  halo.addColorStop(1.0, 'rgba(120,40,40,0.0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, s, s);
  // 十字の光条(スターバースト)。加算。焼き込みαは補正済み(スプライトα1.0でも元0.67時代の見えに一致=十字は明るくしない)。0.32×0.67=0.214 / 0.2×0.67=0.134。
  ctx.globalCompositeOperation = 'lighter';
  const gx = ctx.createLinearGradient(0, cy, s, cy);
  gx.addColorStop(0, 'rgba(255,200,140,0)'); gx.addColorStop(0.5, 'rgba(255,210,150,0.214)'); gx.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = gx; ctx.fillRect(0, cy - 1.5, s, 3);
  const gy = ctx.createLinearGradient(cx, 0, cx, s);
  gy.addColorStop(0, 'rgba(255,190,130,0)'); gy.addColorStop(0.5, 'rgba(255,200,140,0.134)'); gy.addColorStop(1, 'rgba(255,190,130,0)');
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
// M2の非常灯スポットライト。**上から降りてくる光の円錐**を1枚に焼く(1灯=1スプライト)。
//
// v0.25.2270(社長指摘「かなり雑な見た目」)で描き方を作り直した。
// 旧: 台形をベタ塗り → 左右を**一律の横グラデ**で抜く、という作り。これだと
//   ①上の細い部分は縁が硬いまま ②下の広い部分だけ柔らかい、と不揃いになり、
//   ベクター図形を貼ったように見えていた。
// 新: **画素ごとに計算**する。各高さでのビーム半幅 halfW(t) を出し、中心からの相対位置 u=|x-cx|/halfW(t)
//   で減衰させる=**どの高さでも縁の柔らかさが同じ割合**になる。中心には芯(明るい筋)を足し、
//   わずかな粒状ノイズを掛けて「空気中の埃に光が散っている」質感を出す(ベタ塗り感を消す)。
// 焼くのは初回1度きり。実行時のコストは従来と同じ(スプライト1枚)。
let spotConeTex: Texture | null = null;
export const getSpotConeTexture = (): Texture => {
  if (spotConeTex) return spotConeTex;
  const W = 384, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const cx = W / 2;
  const TOP_HALF = W * 0.055;  // 灯具側の半幅
  const BOT_HALF = W * 0.46;   // 床側の半幅
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  // 決定的な粒(毎回同じ絵になるように Math.random は使わない)。
  const grain = (x: number, y: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  // 床の光だまり(平たい楕円)の中心と大きさ。
  // v0.25.2272(社長指摘「光の下の部分がパッツン切れてる」): 旧 poolY=H*0.9 は楕円の**下半分が
  // テクスチャの外**にはみ出しており、下端で水平に切り落とされていた。中心を上げて全体を枠内に収める。
  const poolY = H * 0.78, poolRX = W * 0.5, poolRY = poolRX * 0.34;
  // さらに保険として、最下部で全体を 0 へ落とす(円錐本体の下辺もここで消える=硬い切れ目を作らない)。
  const BOTTOM_FADE_FROM = 0.90;
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const halfW = TOP_HALF + (BOT_HALF - TOP_HALF) * t;
    // 縦の明るさ: 灯具の手前で 0 から立ち上げ(上端の硬い切れ目を作らない)、下へ向かって減衰。
    const vert = smooth(0, 0.09, t) * (0.22 + 0.78 * Math.pow(1 - t, 1.25));
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x - cx) / halfW;              // 0=中心 / 1=ビームの縁
      // 縁の減衰。0.42 あたりから落ち始めて 1.0 で 0=どの高さでも同じ割合で柔らかい。
      const body = 1 - smooth(0.42, 1.0, u);
      const core = (1 - smooth(0, 0.34, u)) * 0.45;    // 中心の芯(光の筋)
      let a = vert * (body * 0.8 + core);
      // 床の光だまりを加算(円錐の着地点)。
      const dx = (x - cx) / poolRX, dy = (y - poolY) / poolRY;
      const pd = Math.sqrt(dx * dx + dy * dy);
      if (pd < 1) a += (1 - smooth(0, 1, pd)) * 0.85;
      // 最下部のフェード(テクスチャ端での切れ目対策)。
      a *= 1 - smooth(BOTTOM_FADE_FROM, 1, t);
      if (a <= 0) continue;
      // 粒状ノイズ(±8%)。ベタ塗りに見せないためのわずかな揺らぎ。
      a *= 0.92 + 0.16 * grain(x, y);
      const i = (y * W + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  spotConeTex = Texture.from(canvas);
  return spotConeTex;
};

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

// ---------------------------------------------------------------------------
// research/LIGHT_REWORK.md §3-9-B v8「テクスチャの焼き方」: 接地2枚(芯/外側)専用の新カーブ。
// getSoftShadowTexture の 0→1/0.66→0.94/1→0 は「ベタ塗りの正体」として名指しで否定されたカーブ
// (§3-9-B v5訂正)なので流用しない。ここに新規で焼く。起動時に1回だけ・以後キャッシュ。
let shadowCoreTex: Texture | null = null;
let shadowOuterTex: Texture | null = null;

const bakeRadialAlphaCurve = (stops: [number, number][]): Texture => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  for (const [offset, alpha] of stops) g.addColorStop(offset, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
};

/** 接地の芯(§3-9-B v8): 0→1 / 0.52→0.93 / 0.82→0.40 / 1→0。 */
export const getShadowCoreTexture = (): Texture => {
  if (shadowCoreTex) return shadowCoreTex;
  shadowCoreTex = bakeRadialAlphaCurve([[0, 1], [0.52, 0.93], [0.82, 0.40], [1, 0]]);
  return shadowCoreTex;
};

/** 接地の外側(§3-9-B v8): 0→0.95 / 0.25→0.80 / 0.6→0.42 / 1→0(社長承認モックのカーブ)。 */
export const getShadowOuterTexture = (): Texture => {
  if (shadowOuterTex) return shadowOuterTex;
  shadowOuterTex = bakeRadialAlphaCurve([[0, 0.95], [0.25, 0.80], [0.6, 0.42], [1, 0]]);
  return shadowOuterTex;
};
