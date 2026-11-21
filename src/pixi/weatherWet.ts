// ステージの天候「雨上がり」の描画(research/WEATHER_WET.md §2・`?weather=wet` でステージ1の時だけ)。
//
// ★描くだけ。配置は world/weatherPuddles.ts(決まった乱数の純関数)、動きの曲線は utils/weatherWet.ts。
//   ゲームの状態には1バイトも書かない(敵・地形・当たり判定は変えない=「ではない」条件)。
//
// 何をしているか:
//   1. 色調整 … 世界の層(worldGroup)に色行列1枚(`gradeFilter`)。彩度を少し落とし、青く冷たく、暗部を少し持ち上げる。
//   2. 水たまり … 帯2の水たまり(縁つき)を地面の層の一番下へ。帯1の「水面だけ」の対を内側へ重ねて水の層にする。
//      帯2の小物を周りへ少し。一部(waterOnly)は縁も小物も無い帯1だけの薄い水の膜(水たまりの大きさいっぱい)。
//   3. 映り込み … 空の色(水面の加算)・近くの松明の光だまりのにじみ(既存の映り込み=光だまりの色と強さをそのまま読む)。
//      プレイヤーの近くの水たまりにだけ、キャラの逆さの薄い映り・光の筋・水面を渡る細い光の線を、
//      水面(帯1)の形で切って描く(切り抜きは同時に最大 MAX_SLOTS 枚)。
//   3b. 風景の映り … 既に読み込んである遠景(空・月・城・森)の絵を、地平線を軸に上下反転して地面の層に1組だけ敷き、
//      画面内の水たまりの水面の形を集めた1枚の型(マスク)の内側にだけ出す(新しい素材・光・投影影なし)。
//      元の絵の視差(横の流れ)をそのまま写す=歩くと水の中で空と森が流れる。
//   4. 雫と波紋 … 木の下でときどき雫→波紋。水たまりを踏んだら波紋。どちらも使い回しの粒(上限つき)。
//   4b. ポツポツ雨 … 細く短い線をまばらに斜めに落とす(少し加速)。着いた所が水たまりなら水の波紋・地面なら小さな跳ね
//      (4 の波紋の粒をそのまま使う)。線はアクターの上・被写界深度の外の層(danceUiLayer)・粒は上限 RAIN_MAX。
//   5./6. 霧を少し薄く冷たく・空(遠景)を少し明るく … 毎フレームの最後に色を掛け、次のフレームの頭で戻す
//      (pixiScene の applyForestPreview / applyWraithDarkness と同じ型=他の色の書き込みとぶつからない)。
// 影を落とす光は1つも足さない(このプロジェクトで高いのは投影影を落とす光だけ=CLAUDE.md の実測)。

import { ColorMatrixFilter, Container, Matrix, Point, Sprite, Texture, TilingSprite, type Filter, type RenderTexture } from 'pixi.js';
import { getTexture } from './pixiTextures';
import { getSoftGlowTexture } from './lighting';
import {
  puddlesInRegion, puddleAt, isInPuddle, PUDDLE_ART_SCALE, DEBRIS_ART_SCALE, PUDDLE_CELL, type Puddle,
} from '../world/weatherPuddles';
import {
  ripplePose, glintPose, GLINT_MS,
  rainDropSpec, rainPose, rainNextGapMs, rainNextEvent, RAIN_MAX, RAIN_SPAWN_PER_FRAME, type RainDropSpec,
  puddleRippleRate,
  landscapeBand, landscapeBandStart,
  buildWetGradeMatrix, WET_FOG_ALPHA_MUL, WET_FOG_TINT_MUL, WET_FRONT_TINT_MUL,
  WET_MOON_GLOW_ALPHA_MUL, WET_MOON_GLOW_SCALE_MUL, WET_MOON_HALO_ALPHA_MUL, WET_MOON_HALO_SCALE_MUL,
  TORCH_STREAK_LEN, TORCH_STREAK_W, TORCH_STREAK_ALPHA, TORCH_STREAK_TOP, TORCH_STREAK_DASHES,
  TORCH_STREAK_DASH_W, TORCH_STREAK_DASH_H, TORCH_STREAK_DASH_ALPHA, TORCH_STREAK_EASE, torchStreakDash,
  TORCH_BACK_UP, TORCH_BACK_W, TORCH_BACK_H, TORCH_BACK_ALPHA, TORCH_BACK_TINT, TORCH_BACK_TINT_MIX,
  DRIP_EVERY_MS, DRIP_MAX, DRIP_LAG_TAU_MS, makeRainSchedule, advanceRainSchedule, followLag, type RainSchedule,
  leafDripSpec, leafDripPose, type LeafDripSpec,
  WET_GLOSS_ALPHA, WET_GLOSS_TINT, WET_GLOSS_TILE_WORLD, WET_GLOSS_SHAFT_GAIN,
  WET_GLOSS_TORCH_W, WET_GLOSS_TORCH_H, WET_GLOSS_TORCH_ALPHA, wetGlossDrift, MOON_RIM_EASE,
} from '../utils/weatherWet';

// ---- 叩き台の値(設計書 §0-1「数値は叩き台」) ----
/** 水面(帯1)を縁つきの水たまり(帯2)の内側へ合わせる縮み(帯1は縁まで含む大きさで描かれているため)。 */
const WATER_FIT_X = 0.8;
const WATER_FIT_Y = 0.72;
/** 水面の色(乗算)と濃さ。空を映した冷たい色。 */
const WATER_TINT = 0x45465a; // 彩度を落として暗く=地面に沈める(旧 0x7d88c4・その前 0x9fb6d4)
const WATER_ALPHA = 0.9;
/** 水面と、その上に重ねる映り(空・松明のにじみ・キャラの逆さの映り・光の筋・光の線)の濃さの一律の掛け率。
 *  社長指示2026-11-20「少し薄く」=70%(地面に沈める。縁つきの水たまりの絵と小物はそのまま)。 */
const WATER_FADE = 0.7;
/** 風景の映り(遠景の上下反転)の濃さと色(冷たく少し沈める)。濃さは WATER_FADE も掛かる。 */
const LAND_ALPHA = 1.0; // 鏡らしさは残して少し沈める(旧 1.3・その前 0.75)
const LAND_TINT = 0xb2a8a4; // 夜空の色は映りの中身に任せ、乗せる色は彩度を落とす(旧 0xdcd2f2・その前 0xb4c4dc)
/** 遠景の帯を焼く大きさ(論理px・解像度1)。小さく焼いて引き伸ばす=水面の映りらしく柔らかい(遠景のボケとも揃う)。 */
const LAND_RT_W = 320;
const LAND_RT_H = 192;
/** 夜の暗さ(envTint)をどこまで映りに掛けるか(1=地面と同じ暗さ・大きいほど明るく残す)。 */
const LAND_ENV_LIFT = 1.5; // 空と月は映すが、地面から浮かない明るさ(旧 2.1・その前 1.6)
/** 型の焼きの大きさ(論理px・解像度1)。水たまりを囲む矩形をこの1枚へ縮めて焼く(縁がわずかに柔らかくなるだけ)。 */
const LAND_MASK_RT_W = 256;
const LAND_MASK_RT_H = 384;
/** 空の映り(水面の形の加算)。光が無い所でもうっすら空が映る。 */
const SKY_TINT = 0x2a3160; // 彩度を落とした藍(旧 0x3a4aa6・その前 0x34507a)
const SKY_ALPHA = 0.1; // 平らな青の塗りに見せない(旧 0.22・その前 0.16)
/** 松明の光だまりが水たまりへにじむ距離(world px)と強さ。 */
const LIGHT_REACH = 300;
const LIGHT_GAIN = 0.75;
/** キャラの逆さの映り。 */
const REFL_TINT = 0xa4bad6;
const REFL_ALPHA = 0.55;
const REFL_PER_SLOT = 3;
/** 小物の色(地面の色に寄せて沈める)。 */
const DEBRIS_DIM = { r: 0.62, g: 0.64, b: 0.7 };
/** 切り抜き(映り・光の筋・光の線)を同時に描く水たまりの上限。 */
const MAX_SLOTS = 5;
/** 光の線: 何msおきに1本(乱数で幅を持たせる)。同時に2本まで。 */
const GLINT_EVERY_MS = 2200;
const GLINT_MAX = 2;
/** 波紋の上限(使い回し)。ポツポツ雨の着地ぶんを足して 24→40、本降りで水たまりが波立つぶんを足して 40→64。 */
const RIPPLE_MAX = 96; // 本降りの時に波紋の使い回しが埋まらない余裕(64→96)
/** 水たまりの雨の波紋を1フレームで生む上限(重いフレーム・タブ復帰で一度に立たない)。 */
const PUDDLE_RIPPLE_PER_FRAME = 4;
/** 水たまりの雨の波紋の濃さ(雫・着地の波紋に掛ける 1 に対して)。 */
const PUDDLE_RIPPLE_ALPHA = 1;
/** 雨粒の色(冷たい白)・太さ(world px・遠近前)。 */
const RAIN_TINT = 0xd8e4f6;
const RAIN_WIDTH = 1.1;
/** 踏んだ時の波紋: 同じキャラは最短この間隔・この距離を歩くごと。 */
const STEP_RIPPLE_MS = 260;
const STEP_RIPPLE_DIST = 14;
/** 霧の薄さ・藍寄せ、近景の森の色、月の暈とグローの倍率は utils/weatherWet.ts(参考画に寄せる)。 */
/** 雫(葉先から垂れる)の芯の色・照りの色(間隔と同時上限は utils/weatherWet.ts)。 */
const DRIP_TINT = 0xeef5ff;
const DRIP_GLOW_TINT = 0xa9c4ff;
/** 松明の光の映り(縦の筋)を同時に描く松明の上限(使い回し)。 */
const TORCH_STREAK_MAX = 6;

const mulTint = (tint: number, k: { r: number; g: number; b: number }): number => {
  const r = Math.round(((tint >> 16) & 255) * k.r);
  const g = Math.round(((tint >> 8) & 255) * k.g);
  const b = Math.round((tint & 255) * k.b);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
};
const lerpTint = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** 雨粒の線の絵(1回だけ焼く・素材ファイルではない): 尾(上)は透明→先(下)ほど濃い。左右の縁は薄く(細い線がギザつかない)。 */
let rainTex: Texture | null = null;
const getRainStreakTexture = (): Texture => {
  if (rainTex) return rainTex;
  const w = 4, hgt = 48;
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < w; x++) {
    const edge = x === 0 || x === w - 1 ? 0.35 : 1;
    const g = ctx.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, `rgba(255,255,255,${0.45 * edge})`);
    g.addColorStop(0.8, `rgba(255,255,255,${0.9 * edge})`);
    g.addColorStop(1, `rgba(255,255,255,${edge})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1, hgt);
  }
  rainTex = Texture.from(c);
  return rainTex;
};

/**
 * 濡れた地面の照りの絵(1回だけ焼く・素材ファイルではない): 横に伸びた柔らかい斑点を散らした 128px の継ぎ目なしの1枚。
 * radial=true は中心から楕円に薄れる版(松明の足元に1枚置く)。乱数は固定の種=毎回同じ絵。
 */
const glossTex: { tile: Texture | null; pool: Texture | null } = { tile: null, pool: null };
const getGlossTexture = (radial: boolean): Texture => {
  const hit = radial ? glossTex.pool : glossTex.tile;
  if (hit) return hit;
  const W = 128, H = radial ? 64 : 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  let seed = radial ? 91 : 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const blob = (x: number, y: number, rx: number, ry: number, a: number) => {
    ctx.save();
    ctx.translate(x, y); ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(190,205,245,${a})`); // 大きい斑=月明りを拾う冷たい照り
    g.addColorStop(0.5, `rgba(190,205,245,${a * 0.35})`);
    g.addColorStop(1, 'rgba(190,205,245,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  const n = radial ? 46 : 34;
  for (let i = 0; i < n; i++) {
    // 大きく淡い斑と、小さく強い照りの粒を混ぜる(全部同じ大きさにしない)。
    const big = rnd() < 0.35;
    const x = rnd() * W, y = rnd() * H;
    const rx = big ? 10 + 16 * rnd() : 2 + 6 * rnd();
    const ry = rx * (big ? 0.35 + 0.2 * rnd() : 0.25 + 0.2 * rnd()); // 横長=濡れた面の照り
    const a = big ? 0.25 + 0.25 * rnd() : 0.5 + 0.5 * rnd();
    if (radial) blob(x, y, rx, ry, a);
    else for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) blob(x + ox, y + oy, rx, ry, a); // 端で継ぎ目が出ない
  }
  // 細かい照りの粒(濡れた土・苔の先が拾う小さな光)。地面の細部として読ませる。1〜2px の角の立った点。
  //   苔の先(黄緑)と濡れた小石(青白)の2色を混ぜる=参考画の地面の細かな粒。
  const specks = radial ? 90 : 320;
  for (let i = 0; i < specks; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    const w = rnd() < 0.6 ? 1 : 2;
    const moss = rnd() < 0.55;
    const al = 0.35 + 0.65 * rnd() * rnd();
    ctx.fillStyle = moss ? `rgba(196,214,110,${al})` : `rgba(176,196,246,${al})`;
    ctx.fillRect(x, y, w, 1);
  }
  if (radial) {
    // 中心から楕円に薄れる(端が四角く切れない)。
    ctx.globalCompositeOperation = 'destination-in';
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(W / 2, H / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  const t = Texture.from(c);
  if (radial) glossTex.pool = t; else glossTex.tile = t;
  return t;
};

export interface WetActor {
  id: string;
  sprite: Sprite;
}
export interface WetLight {
  /** 松明ごとの名札(縦の筋の濃さを慣性で寄せるため)。 */
  id: string;
  x: number;
  y: number;
  color: number;
  /** 0..1 */
  strength: number;
}
export interface WetTree {
  footX: number;
  footY: number;
  scale: number;
  /** 画面に出ている木の絵の幅・高さ(world px・遠近込み)。葉先の雫の生まれる高さに使う。 */
  w: number;
  h: number;
}
/** 型を焼くための窓口(pixiScene の焼きの入口=メモリの台帳を通す)。 */
export interface WetGpu {
  bake: (w: number, h: number) => RenderTexture;
  release: (rt: RenderTexture) => void;
  render: (c: Container, target: RenderTexture, transform: Matrix) => void;
}
/** 水たまりに映す遠景(pixiScene の遠景の絵そのもの・描かれている順)。 */
export interface WetLandscape {
  sources: readonly (Sprite | TilingSprite)[];
  /** 地平線(地面と遠景の境目)の y。画面の上端・下端の y。どれも global(stage の描画座標)。 */
  horizonY: number;
  screenTop: number;
  screenBottom: number;
  screenLeft: number;
  screenRight: number;
  /** 注目点(プレイヤーの足元)の画面の y。帯の繰り返しの位相をここに合わせる。 */
  anchorY: number;
}
export interface WetHost {
  /** 演出の時計(ms・Date.now 系)。 */
  now: number;
  /** 地面に置く物の色(夜=暗く・花や木と同じ envTint)。 */
  envTint: number;
  view: { left: number; top: number; right: number; bottom: number };
  /** 実際に画面に映っている世界の矩形(ズーム込み・余白なし)。雨粒の着地点はこの中から選ぶ(無ければ view)。 */
  rainView?: { left: number; top: number; right: number; bottom: number };
  world: Container;
  depthScale: (y: number) => number;
  horizonAlpha: (y: number) => number;
  actors: readonly WetActor[];
  lights: readonly WetLight[];
  trees: readonly WetTree[];
  bases: readonly { x: number; y: number; r: number }[];
  focusX: number;
  focusY: number;
  /** 水たまりに映す遠景(無ければ風景は映さない)。 */
  landscape?: WetLandscape;
  /** 月明りの筋の今の明るさ(脈動込み・1 前後・筋が無い時は 0)。地面の照りの濃さへ移す。 */
  shaftLevel?: number;
  /** 世界の点に落ちている月明りの筋の量(0..1)。水たまりの縁と小物を月明りの絵へ寄せる。 */
  moonAt?: (x: number, y: number) => number;
}
export interface WetAtmosphere {
  fog: readonly (Sprite | TilingSprite)[];
  front: readonly (Sprite | TilingSprite | null)[];
  moonGlow: readonly Sprite[];
  moonHalo: readonly Sprite[];
  farGroup: Container | null;
}

interface PuddleView {
  p: Puddle;
  ground: Sprite;
  water: Sprite;
  sky: Sprite;
  /** 風景の映りの型(水面と同じ形・同じ位置)。 */
  landMask: Sprite;
  debris: Sprite[];
  /** 月明りの縁の絵(縁の絵の上に重ねて寄せる)・小物の月明りの絵。素材が届くまでは null。 */
  groundMoon: Sprite | null;
  debrisMoon: (Sprite | null)[];
  /** 月明りの筋の中にいる量(0..1・慣性で寄せる)。 */
  moonA: number;
  /** このフレームの見た目の倍率(遠近込み)。 */
  d: number;
  alpha: number;
  lightA: number; // 平滑したにじみの強さ
  lightColor: number;
  lightX: number;
}
interface Slot {
  root: Container;
  mask: Sprite;
  refl: Sprite[];
  streak: Sprite;
  glint: Sprite;
  /** 前フレームに受け持った水たまり(映りの濃さを慣性で寄せるため)。 */
  pid: string | null;
  reflA: number[];
}
interface ActorBox { id: string; sp: Sprite; x: number; foot: number; w: number; h: number; flip: boolean }
interface Ripple { sp: Sprite; at: number; x: number; y: number; water: boolean; s: number; on: boolean; /** 濃さの掛け率 */ a: number; /** 雨の波紋を立てた水たまり(混み具合を数える) */ pid: string | null }
interface Drip { sp: Sprite; glow: Sprite; at: number; spec: LeafDripSpec; s: number; on: boolean }
interface Glint { pid: string; at: number; dir: 1 | -1 }
interface RainDrop { sp: Sprite; at: number; x: number; y: number; spec: RainDropSpec; on: boolean }
interface TorchStreak { id: string; main: Sprite; gloss: Sprite; back: Sprite; dashes: Sprite[]; a: number; seed: number; seen: boolean }
interface LandCopy { src: Sprite | TilingSprite; wrap: Container; sp: Sprite | TilingSprite }

/** 葉先の雫の大きさ(芯と照りに掛ける)。悪目立ちしないよう半分に(社長指示2026-11-21)。 */
const DRIP_SIZE_MUL = 0.5;

export class WeatherWetLayer {
  readonly gradeFilter: ColorMatrixFilter;
  private skyFilter: ColorMatrixFilter;
  private root = new Container();
  private puddleLayer = new Container();
  // 水たまりの重なり順: 縁 → 水面 → 風景の映り → 空の色(加算)。
  private rimLayer = new Container();
  private waterLayer = new Container();
  private landLayer = new Container();
  /** 型の材料(水面の形の絵を集めた箱・表示ツリーには入れない=毎フレーム小さな焼きへ描くだけ)。 */
  private landMaskBox = new Container();
  /** 型(焼いた水面の形を、画面内の水たまりを囲む矩形へ貼った1枚)。 */
  private landMaskSprite = new Sprite(Texture.EMPTY);
  private landMaskRT: RenderTexture | null = null;
  /** 遠景の写し(表示ツリーの外)と、それを上下反転して焼いた1枚・それを敷く1枚。 */
  private landScene = new Container();
  private landRT: RenderTexture | null = null;
  private landSprite = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
  private gpu: WetGpu | null;
  private landCopies: LandCopy[] = [];
  private skyLayer = new Container();
  private mA = new Matrix();
  private mB = new Matrix();
  private mFlip = new Matrix();
  private mMask = new Matrix();
  private slotLayer = new Container();
  private debrisLayer = new Container();
  private rippleLayer = new Container();
  private dripLayer = new Container();
  /** 松明の光の映り(濡れた地面に縦に伸びる筋)。水たまりの上・キャラの下。 */
  private streakLayer = new Container();
  private streaks: TorchStreak[] = [];
  /** 濡れた地面の照り(まだらの絵を地面いっぱいに1枚・加算)と、松明の足元の照りの層。水たまりより下。 */
  private glossLayer = new Container();
  private gloss: TilingSprite | null = null;
  /** 雨粒の線(アクターの上・被写界深度の外の層へ置く=キャラの手前も降る)。 */
  private rainLayer = new Container();
  private rain: RainDrop[] = [];
  private nextRainAt = 0;
  /** 次の予定が「粒を出さずに強さを見直すだけ」か(止みかけ・強さ0でも予定が止まらない)。 */
  private rainRecheck = false;
  /** 水たまりの雨の波紋の前フレームの時刻・このフレームの水たまり(遠近込みの大きさ・1フレームに1回だけ作る)。 */
  private puddleRippleAt = 0;
  private rippleBusy = new Map<string, number>();
  private scaledPuddles: { x: number; y: number; rx: number; ry: number; waterOnly?: boolean }[] = [];
  /** 雨の強弱の時刻表(30秒〜1分おきに次の強さ)・今の強さ・それに遅れて付いてくる雫の強さ。 */
  private rainSched: RainSchedule | null = null;
  private rainLevel = 1;
  private dripLevel = 1;
  private levelAt = 0;
  private views = new Map<string, PuddleView>();
  private slots: Slot[] = [];
  private ripples: Ripple[] = [];
  private drips: Drip[] = [];
  private glints: Glint[] = [];
  private nextGlintAt = 0;
  private nextDripAt = 0;
  private steps = new Map<string, { pid: string | null; x: number; y: number; at: number }>();
  private cacheKey = '';
  private cached: Puddle[] = [];
  private originals = new Map<Sprite | TilingSprite, { tint: number; alpha: number; sx: number; sy: number }>();
  private farGroupWithFilter: Container | null = null;
  private pA = new Point();
  private pB = new Point();
  private visible = true;

  constructor(groundLayer: Container, overLayer?: Container, gpu?: WetGpu) {
    this.gpu = gpu ?? null;
    this.root.eventMode = 'none';
    this.rainLayer.eventMode = 'none';
    this.rainLayer.label = 'weatherWetRain';
    (overLayer ?? this.root).addChild(this.rainLayer);
    // 葉先の雫は枝葉の高さから落ちるので、木より上の層(雨粒と同じ層)に置く。
    this.dripLayer.eventMode = 'none';
    this.rainLayer.addChild(this.dripLayer);
    this.root.label = 'weatherWet';
    this.root.addChild(this.puddleLayer, this.slotLayer, this.debrisLayer, this.rippleLayer);
    this.landLayer.eventMode = 'none';
    this.landLayer.label = 'weatherWetLand';
    // 型: 画面内の水たまりの水面の絵を毎フレーム1枚の小さな焼き(LAND_MASK_RT_W×H)へ描き、それを
    // 水たまりを囲む矩形へ貼った Sprite を映りの箱の型にする(合成は1回・範囲は水たまりを囲む矩形だけ)。
    // 型は切り抜く側の子(兄弟に置くと描かれない・slot と同じ)。
    this.landLayer.addChild(this.landSprite, this.landMaskSprite);
    this.landLayer.setMask({ mask: this.landMaskSprite, channel: 'alpha' });
    this.landLayer.alpha = Math.min(1, LAND_ALPHA * WATER_FADE);
    this.landScene.label = 'weatherWetLandSrc';
    this.landLayer.visible = false;
    this.streakLayer.eventMode = 'none';
    this.puddleLayer.addChild(this.rimLayer, this.waterLayer, this.landLayer, this.skyLayer, this.streakLayer);
    this.glossLayer.eventMode = 'none';
    this.glossLayer.label = 'weatherWetGloss';
    this.root.addChildAt(this.glossLayer, 0);
    // 地面の層の一番下(足元の影・光だまりより下)。
    groundLayer.addChildAt(this.root, 0);
    this.gradeFilter = new ColorMatrixFilter();
    this.gradeFilter.matrix = buildWetGradeMatrix() as unknown as typeof this.gradeFilter.matrix;
    // 空(遠景)は少し明るく・わずかに冷たく(雲が切れて澄んだ空)。
    this.skyFilter = new ColorMatrixFilter();
    this.skyFilter.matrix = [
      1.06, 0, 0, 0, 0.012,
      0, 1.1, 0, 0, 0.02,
      0, 0, 1.16, 0, 0.034,
      0, 0, 0, 1, 0,
    ] as unknown as typeof this.skyFilter.matrix;
    for (let i = 0; i < MAX_SLOTS; i++) this.slots.push(this.makeSlot());
  }

  private makeSlot(): Slot {
    const root = new Container();
    root.eventMode = 'none';
    const mask = new Sprite(Texture.EMPTY);
    mask.anchor.set(0.5);
    const refl: Sprite[] = [];
    for (let i = 0; i < REFL_PER_SLOT; i++) {
      const r = new Sprite(Texture.EMPTY);
      r.anchor.set(0.5, 1);
      r.tint = REFL_TINT;
      r.visible = false;
      refl.push(r);
    }
    const streak = new Sprite(getSoftGlowTexture());
    streak.anchor.set(0.5);
    streak.blendMode = 'add';
    streak.visible = false;
    const glint = new Sprite(Texture.WHITE);
    glint.anchor.set(0.5);
    glint.blendMode = 'add';
    glint.tint = 0xe8f2ff;
    glint.visible = false;
    root.addChild(...refl, streak, glint, mask); // 型は切り抜く側の子(兄弟に置くと描かれない・pixiScene の crawlerFlash と同じ)
    root.mask = mask;
    root.visible = false;
    this.slotLayer.addChild(root);
    return { root, mask, refl, streak, glint, pid: null, reflA: refl.map(() => 0) };
  }

  setVisible(on: boolean): void {
    if (this.visible === on) return;
    this.visible = on;
    this.root.visible = on;
    this.rainLayer.visible = on;
    if (!on) this.detachSky();
  }

  // ---- 水たまりの一覧(区画が変わった時だけ作り直す=毎フレーム木を走査しない) ----
  private puddlesFor(h: WetHost): Puddle[] {
    const m = PUDDLE_CELL * 0.5;
    const cx0 = Math.floor((h.view.left - m) / PUDDLE_CELL), cx1 = Math.floor((h.view.right + m) / PUDDLE_CELL);
    const cy0 = Math.floor((h.view.top - m) / PUDDLE_CELL), cy1 = Math.floor((h.view.bottom + m) / PUDDLE_CELL);
    const key = `${cx0},${cy0},${cx1},${cy1}|${h.bases.map(b => `${Math.round(b.x)},${Math.round(b.y)}`).join(';')}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.cached = puddlesInRegion(cx0 * PUDDLE_CELL, cy0 * PUDDLE_CELL, (cx1 + 1) * PUDDLE_CELL - 1, (cy1 + 1) * PUDDLE_CELL - 1, { bases: h.bases });
    }
    return this.cached;
  }

  sync(h: WetHost): void {
    if (!this.visible) return;
    const puddles = this.puddlesFor(h);
    const seen = new Set<string>();
    const v = h.view;
    for (const p of puddles) {
      if (p.x + p.rx < v.left - 40 || p.x - p.rx > v.right + 40 || p.y + p.ry < v.top - 40 || p.y - p.ry > v.bottom + 40) continue;
      const ha = h.horizonAlpha(p.y);
      if (ha <= 0.001) continue;
      const pv = this.viewFor(p);
      if (!pv) continue;
      seen.add(p.id);
      this.placePuddle(pv, h, ha);
    }
    for (const [id, pv] of this.views) {
      if (seen.has(id)) continue;
      pv.ground.destroy(); pv.water.destroy(); pv.sky.destroy(); pv.landMask.destroy();
      pv.groundMoon?.destroy();
      for (const d of pv.debris) d.destroy();
      for (const d of pv.debrisMoon) d?.destroy();
      this.views.delete(id);
    }
    const boxes: ActorBox[] = [];
    for (const a of h.actors) {
      const bx = this.actorBox(a, h.world);
      if (!bx) continue;
      if (bx.x < v.left - 100 || bx.x > v.right + 100 || bx.foot < v.top - 100 || bx.foot > v.bottom + 200) continue;
      boxes.push(bx);
    }
    this.syncGloss(h);
    this.syncLandscape(h);
    this.syncSlots(h, boxes);
    this.syncTorchStreaks(h);
    this.scaledPuddles.length = 0;
    for (const pv of this.views.values()) this.scaledPuddles.push({ x: pv.p.x, y: pv.p.y, rx: pv.p.rx * pv.d, ry: pv.p.ry * pv.d, waterOnly: pv.p.waterOnly });
    this.syncSteps(h, boxes);
    this.syncRainLevel(h.now);
    this.syncDrips(h);
    this.syncRain(h);
    this.syncPuddleRain(h);
    this.syncRipples(h);
  }

  private viewFor(p: Puddle): PuddleView | null {
    const hit = this.views.get(p.id);
    if (hit) return hit;
    const gTex = getTexture(`weather/${p.variant}`);
    const wTex = getTexture(`weather/${p.variant}-water`);
    const debrisTex = p.debris.map(d => getTexture(`weather/${d.variant}`));
    if (!gTex || !wTex || debrisTex.some(t => !t)) return null; // 届くまでは出さない(網が取りに行っている)
    const ground = new Sprite(gTex);
    ground.anchor.set(0.5);
    const water = new Sprite(wTex);
    water.anchor.set(0.5);
    const sky = new Sprite(wTex);
    sky.anchor.set(0.5);
    sky.blendMode = 'add';
    sky.tint = SKY_TINT;
    const landMask = new Sprite(wTex);
    landMask.anchor.set(0.5);
    this.rimLayer.addChild(ground);
    this.waterLayer.addChild(water);
    this.skyLayer.addChild(sky);
    this.landMaskBox.addChild(landMask);
    const debris: Sprite[] = [];
    for (const t of debrisTex) {
      const sp = new Sprite(t!);
      sp.anchor.set(0.5, 1);
      this.debrisLayer.addChild(sp);
      debris.push(sp);
    }
    // 月明りの縁(素材が無ければ出さないだけ=水たまり自体は出す)。縁の絵の直上・小物の絵の直上に重ねる。
    const moonTex = getTexture(`weather/${p.variant}-moon`);
    let groundMoon: Sprite | null = null;
    if (moonTex && !p.waterOnly) {
      groundMoon = new Sprite(moonTex);
      groundMoon.anchor.set(0.5);
      groundMoon.visible = false;
      this.rimLayer.addChild(groundMoon);
    }
    const debrisMoon = p.debris.map((dd, i) => {
      const t = getTexture(`weather/${dd.variant}-moon`);
      if (!t) return null;
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 1);
      sp.visible = false;
      this.debrisLayer.addChildAt(sp, this.debrisLayer.getChildIndex(debris[i]) + 1);
      return sp;
    });
    const pv: PuddleView = { p, ground, water, sky, landMask, debris, groundMoon, debrisMoon, moonA: 0, d: 1, alpha: 1, lightA: 0, lightColor: SKY_TINT, lightX: p.x };
    this.views.set(p.id, pv);
    return pv;
  }

  private placePuddle(pv: PuddleView, h: WetHost, ha: number): void {
    const p = pv.p;
    const d = h.depthScale(p.y);
    pv.d = d;
    pv.alpha = ha;
    const s = PUDDLE_ART_SCALE * p.scale * d;
    const fx = p.flip ? -1 : 1;
    pv.ground.position.set(p.x, p.y);
    pv.ground.scale.set(s * fx, s);
    pv.ground.alpha = ha;
    pv.ground.tint = h.envTint;
    pv.ground.visible = !p.waterOnly; // 水面だけの膜は縁の絵を出さない(寸法の基準には使う)
    // 月明りの筋の中では、縁(と小物)を月明りの絵へ寄せる。筋が流れても慣性で寄せる(パッと切り替わらない)。
    const moonT = h.moonAt ? h.moonAt(p.x, p.y) : 0;
    pv.moonA += (moonT - pv.moonA) * MOON_RIM_EASE;
    if (pv.moonA < 0.003) pv.moonA = moonT > 0 ? pv.moonA : 0;
    const gm = pv.groundMoon;
    if (gm) {
      gm.visible = !p.waterOnly && pv.moonA > 0.003;
      if (gm.visible) {
        // 縁の絵の外形にぴったり合わせる(月明りの絵は寸法が少し違う=縁の位置を揃える)。
        const mw = gm.texture.width || 1, mh = gm.texture.height || 1;
        gm.position.set(p.x, p.y);
        gm.scale.set((pv.ground.texture.width * s * fx) / mw, (pv.ground.texture.height * s) / mh);
        gm.alpha = ha * pv.moonA;
        gm.tint = h.envTint;
      }
    }
    // 水面(帯1)は縁の内側へ。帯1は縁まで含む大きさで描かれているので、縮めて中心を揃える。
    // 水面だけの膜は縁が無いので、縮めずに水たまりの大きさいっぱいに出す。
    const gw = pv.ground.texture.width, gh = pv.ground.texture.height;
    const ww = pv.water.texture.width || 1, wh = pv.water.texture.height || 1;
    const fitX = p.waterOnly ? 1 : WATER_FIT_X, fitY = p.waterOnly ? 1 : WATER_FIT_Y;
    const wsx = (gw * fitX * s) / ww, wsy = (gh * fitY * s) / wh;
    for (const sp of [pv.water, pv.sky, pv.landMask]) {
      sp.position.set(p.x, p.y - (p.waterOnly ? 0 : gh * s * 0.02));
      sp.scale.set(wsx * fx, wsy);
    }
    pv.water.alpha = WATER_ALPHA * WATER_FADE * ha;
    pv.landMask.alpha = ha; // 地平線の向こうへ消える水たまりは映りも一緒に消える(型の濃さ=映りの濃さ)
    pv.water.tint = mulTint(WATER_TINT, { r: ((h.envTint >> 16) & 255) / 255, g: ((h.envTint >> 8) & 255) / 255, b: (h.envTint & 255) / 255 });
    // 近くの光だまり(松明)のにじみ。強さと色を慣性で寄せる(灯の揺らぎで水面がチラつかない)。
    let best = 0, bestColor = SKY_TINT, bestX = p.x, sum = 0;
    for (const l of h.lights) {
      const dist = Math.hypot(l.x - p.x, (l.y - p.y) * 1.4);
      if (dist >= LIGHT_REACH) continue;
      const k = (1 - dist / LIGHT_REACH) ** 2 * l.strength;
      sum += k;
      if (k > best) { best = k; bestColor = l.color; bestX = l.x; }
    }
    const target = Math.min(1, sum * LIGHT_GAIN);
    pv.lightA += (target - pv.lightA) * 0.12;
    pv.lightColor = best > 0 ? bestColor : pv.lightColor;
    pv.lightX = bestX;
    pv.sky.tint = lerpTint(SKY_TINT, pv.lightColor, Math.min(1, pv.lightA * 1.4));
    pv.sky.alpha = (SKY_ALPHA + pv.lightA * 0.55) * WATER_FADE * ha;
    for (let i = 0; i < pv.debris.length; i++) {
      const dd = p.debris[i];
      const sp = pv.debris[i];
      if (!dd || !sp) continue;
      const ds = h.depthScale(dd.y);
      sp.position.set(dd.x, dd.y);
      sp.scale.set(DEBRIS_ART_SCALE * ds * (dd.flip ? -1 : 1), DEBRIS_ART_SCALE * ds);
      sp.alpha = h.horizonAlpha(dd.y);
      sp.tint = mulTint(h.envTint, DEBRIS_DIM); // 小物は地面に沈める(白い小石が光って浮かない)
      const mp = pv.debrisMoon[i];
      if (mp) {
        mp.visible = pv.moonA > 0.003;
        if (mp.visible) {
          const mw = mp.texture.width || 1, mh = mp.texture.height || 1;
          mp.position.set(dd.x, dd.y);
          mp.scale.set((sp.texture.width * DEBRIS_ART_SCALE * ds * (dd.flip ? -1 : 1)) / mw, (sp.texture.height * DEBRIS_ART_SCALE * ds) / mh);
          mp.alpha = sp.alpha * pv.moonA;
          mp.tint = sp.tint;
        }
      }
    }
  }

  // ---- 風景の映り(遠景の上下反転を、水面の形の型の内側にだけ) ----
  // 1. 遠景の絵の写し(表示ツリーの外の箱 landScene)を、画面の上端〜地平線の帯ごと小さな焼き(LAND_RT_*)へ
  //    上下反転して描く(元の絵の位置・視差・空のコマ送り・月の呼吸をそのまま写す=新しい素材なし)。
  // 2. その焼きを1枚の TilingSprite(landSprite)として地平線から画面の下端まで縦に繰り返して敷く(world の層・
  //    画面に対して固定=水たまりが流れても映りは視点についてくる=本物の映り方)。
  // 3. 水たまりの水面の形の型(bakeLandMask)の内側にだけ出す。
  private syncLandscape(h: WetHost): void {
    const L = h.landscape;
    const gpu = this.gpu;
    if (!L || !gpu || this.views.size === 0) { this.landLayer.visible = false; return; }
    // 元の絵の数・顔ぶれが変わった時だけ作り直す(ステージの遠景の差し替え等)。
    const same = this.landCopies.length === L.sources.length && this.landCopies.every((c, i) => c.src === L.sources[i]);
    if (!same) {
      for (const c of this.landCopies) c.wrap.destroy({ children: true });
      this.landCopies = L.sources.map(src => {
        const wrap = new Container();
        const sp = src instanceof TilingSprite ? new TilingSprite({ texture: src.texture, width: 1, height: 1 }) : new Sprite(src.texture);
        wrap.addChild(sp);
        this.landScene.addChild(wrap);
        return { src, wrap, sp };
      });
    }
    let any = false;
    for (const c of this.landCopies) {
      const src = c.src;
      const par = src.parent;
      const on = !src.destroyed && !!par && src.visible && src.alpha > 0.004 && src.renderable;
      c.wrap.visible = on;
      if (!on) continue;
      any = true;
      // 包み=元の絵の親の global(=画面の座標で元の絵と同じ所に置く)。反転は焼く時の変換で1回だけ。
      c.wrap.setFromMatrix(par.getGlobalTransform(this.mA, false));
      const sp = c.sp;
      if (sp.texture !== src.texture) sp.texture = src.texture;
      sp.anchor.copyFrom(src.anchor);
      sp.position.copyFrom(src.position);
      sp.scale.copyFrom(src.scale);
      sp.rotation = src.rotation;
      sp.tint = src.tint;
      sp.alpha = src.alpha;
      sp.blendMode = src.blendMode;
      if (sp instanceof TilingSprite && src instanceof TilingSprite) {
        sp.width = src.width; // TilingSprite の幅・高さは scale を含まない窓の大きさ
        sp.height = src.height;
        sp.tileScale.copyFrom(src.tileScale);
        sp.tilePosition.copyFrom(src.tilePosition); // 視差(横の流れ)もそのまま
      }
    }
    if (!any || !this.bakeLandMask()) { this.landLayer.visible = false; return; }
    this.landLayer.visible = true;
    const band = landscapeBand(L.horizonY, L.screenTop, L.screenBottom);
    const gx0 = L.screenLeft, gw = Math.max(1, L.screenRight - L.screenLeft);
    // 1. 帯(画面の上端〜地平線)を上下反転して焼く: 焼きの上端=地平線・下端=画面の上端。
    if (!this.landRT) this.landRT = gpu.bake(LAND_RT_W, LAND_RT_H);
    const rt = this.landRT;
    const sx = rt.width / gw, sy = rt.height / band.srcH;
    gpu.render(this.landScene, rt, this.mB.set(sx, 0, 0, -sy, -gx0 * sx, L.horizonY * sy));
    // 2. 地平線から下端までの窓に、焼きを縦に繰り返して敷く(窓の座標=画面の座標・左上=地平線の左端)。
    //    繰り返しの位相は足元に合わせる(帯の頭=逆さの稜線が足元の少し上に来る)。
    const ls = this.landSprite;
    if (ls.texture !== rt) ls.texture = rt;
    const inv = this.landLayer.getGlobalTransform(this.mA, false).invert();
    ls.setFromMatrix(inv.append(this.mFlip.set(1, 0, 0, 1, gx0, L.horizonY)));
    ls.width = gw;
    ls.height = Math.max(1, L.screenBottom - L.horizonY);
    ls.tileScale.set(gw / rt.width, band.bandH / rt.height);
    ls.tilePosition.set(0, landscapeBandStart(band, L.horizonY, L.anchorY) - L.horizonY);
    // 夜は地面と同じ暗さへ寄せ、冷たく少し沈める(空の明るさがそのまま地面に浮かない)。
    const e = h.envTint;
    const lift = (c: number) => Math.min(1, (c / 255) * LAND_ENV_LIFT);
    ls.tint = mulTint(LAND_TINT, { r: lift((e >> 16) & 255), g: lift((e >> 8) & 255), b: lift(e & 255) });
  }

  /** 水面の形を焼いて型にする。焼く範囲=画面内の水たまりの水面を囲む矩形(world)。何も無ければ false。 */
  private bakeLandMask(): boolean {
    const gpu = this.gpu;
    if (!gpu) return false;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pv of this.views.values()) {
      const w = pv.landMask;
      if (w.alpha <= 0.004) continue;
      const hw = Math.abs(w.scale.x) * w.texture.width * 0.5, hh = Math.abs(w.scale.y) * w.texture.height * 0.5;
      x0 = Math.min(x0, w.x - hw); x1 = Math.max(x1, w.x + hw);
      y0 = Math.min(y0, w.y - hh); y1 = Math.max(y1, w.y + hh);
    }
    if (!(x1 > x0 && y1 > y0)) return false;
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
    if (!this.landMaskRT) this.landMaskRT = gpu.bake(LAND_MASK_RT_W, LAND_MASK_RT_H);
    const rt = this.landMaskRT;
    // world の矩形 → 焼きの全面(縦横で倍率は別でよい=形がわずかに粗くなるだけ)。
    const sx = rt.width / (x1 - x0), sy = rt.height / (y1 - y0);
    this.mMask.set(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
    gpu.render(this.landMaskBox, rt, this.mMask);
    const ms = this.landMaskSprite;
    if (ms.texture !== rt) ms.texture = rt;
    ms.position.set(x0, y0);
    ms.width = x1 - x0;
    ms.height = y1 - y0;
    return true;
  }

  // ---- 切り抜き(映り・光の筋・光の線) ----
  private actorBox(a: WetActor, world: Container): ActorBox | null {
    const sp = a.sprite;
    if (sp.destroyed || !sp.visible || sp.alpha <= 0.02 || !sp.texture || sp.texture.width <= 1) return null;
    let c: Container | null = sp;
    while (c) { if (!c.visible) return null; c = c.parent; }
    const b = sp.getBounds();
    if (b.width <= 0 || b.height <= 0) return null;
    this.pA.set(b.minX, b.minY);
    this.pB.set(b.maxX, b.maxY);
    world.toLocal(this.pA, undefined, this.pA);
    world.toLocal(this.pB, undefined, this.pB);
    return { id: a.id, sp, x: (this.pA.x + this.pB.x) / 2, foot: this.pB.y, w: this.pB.x - this.pA.x, h: this.pB.y - this.pA.y, flip: sp.worldTransform.a < 0 };
  }

  private syncSlots(h: WetHost, boxes: readonly ActorBox[]): void {
    const now = h.now;
    // 光の線: ときどき、画面内の大きめの水たまりへ1本。
    this.glints = this.glints.filter(g => now - g.at < GLINT_MS && this.views.has(g.pid));
    if (now >= this.nextGlintAt && this.glints.length < GLINT_MAX) {
      const cand = [...this.views.values()].filter(pv => pv.p.rx > 30 && pv.alpha > 0.5
        && pv.p.x > h.view.left && pv.p.x < h.view.right && pv.p.y > h.view.top && pv.p.y < h.view.bottom
        && !this.glints.some(g => g.pid === pv.p.id));
      if (cand.length) this.glints.push({ pid: cand[Math.floor(Math.random() * cand.length)].p.id, at: now, dir: Math.random() < 0.5 ? 1 : -1 });
      this.nextGlintAt = now + GLINT_EVERY_MS * rand(0.6, 1.6);
    }
    // 切り抜きを受け持つ水たまりを選ぶ: キャラが映る所(注目点に近い順)→光の線→光の強い所。
    type Pick = { pv: PuddleView; acts: ActorBox[]; glint: Glint | null };
    const picks: Pick[] = [];
    const reflectors: Pick[] = [];
    for (const pv of this.views.values()) {
      const p = pv.p;
      const rx = p.rx * pv.d, ry = p.ry * pv.d;
      const acts = boxes.filter(b => Math.abs(b.x - p.x) < rx + b.w * 0.5
        && b.foot > p.y - ry - b.h * 0.8 && b.foot < p.y + ry * 0.6);
      if (acts.length) reflectors.push({ pv, acts, glint: null });
    }
    reflectors.sort((a, b) => Math.hypot(a.pv.p.x - h.focusX, a.pv.p.y - h.focusY) - Math.hypot(b.pv.p.x - h.focusX, b.pv.p.y - h.focusY));
    for (const r of reflectors) { if (picks.length < MAX_SLOTS) picks.push(r); }
    for (const g of this.glints) {
      const hit = picks.find(pk => pk.pv.p.id === g.pid);
      if (hit) { hit.glint = g; continue; }
      const pv = this.views.get(g.pid);
      if (pv && picks.length < MAX_SLOTS) picks.push({ pv, acts: [], glint: g });
    }
    const lit = [...this.views.values()].filter(pv => pv.lightA > 0.18 && !picks.some(pk => pk.pv === pv))
      .sort((a, b) => b.lightA - a.lightA);
    for (const pv of lit) { if (picks.length < MAX_SLOTS) picks.push({ pv, acts: [], glint: null }); }

    // 同じ水たまりは同じ枠へ(映りの濃さの慣性が途切れない)。
    const free = this.slots.filter(sl => !picks.some(pk => pk.pv.p.id === sl.pid));
    const assigned = new Map<Slot, Pick>();
    for (const pk of picks) {
      const same = this.slots.find(sl => sl.pid === pk.pv.p.id);
      if (same) assigned.set(same, pk);
    }
    for (const pk of picks) {
      if ([...assigned.values()].includes(pk)) continue;
      const sl = free.shift();
      if (!sl) break;
      sl.reflA.fill(0);
      assigned.set(sl, pk);
    }
    for (const sl of this.slots) {
      const pk = assigned.get(sl);
      if (!pk) { sl.root.visible = false; sl.pid = null; sl.reflA.fill(0); continue; }
      sl.pid = pk.pv.p.id;
      this.drawSlot(sl, pk.pv, pk.acts, pk.glint, now);
    }
  }

  private drawSlot(
    sl: Slot, pv: PuddleView,
    acts: readonly ActorBox[],
    glint: Glint | null, now: number,
  ): void {
    const p = pv.p;
    sl.root.visible = true;
    sl.mask.texture = pv.water.texture;
    sl.mask.position.copyFrom(pv.water.position);
    sl.mask.scale.copyFrom(pv.water.scale);
    const rx = p.rx * pv.d, ry = p.ry * pv.d;
    // 逆さの映り(足元から下へ・薄く冷たく)。濃さは慣性で寄せる(入る・出るがパッと切り替わらない)。
    for (let i = 0; i < sl.refl.length; i++) {
      const r = sl.refl[i];
      const a = acts[i];
      const target = a ? REFL_ALPHA * WATER_FADE * pv.alpha : 0;
      sl.reflA[i] += (target - sl.reflA[i]) * 0.18;
      if (!a) { r.visible = sl.reflA[i] > 0.01; r.alpha = sl.reflA[i]; continue; }
      const tex = a.sp.texture;
      r.texture = tex;
      const tw = tex.width || 1, th = tex.height || 1;
      r.position.set(a.x, a.foot);
      r.scale.set((a.w / tw) * (a.flip ? -1 : 1), -(a.h / th) * 0.85);
      r.visible = true;
      r.alpha = sl.reflA[i];
    }
    // 光の筋(松明の光が水面に縦に伸びる)。
    if (pv.lightA > 0.05) {
      const k = Math.min(1, pv.lightA);
      sl.streak.visible = true;
      sl.streak.tint = pv.lightColor;
      sl.streak.position.set(Math.max(p.x - rx * 0.6, Math.min(p.x + rx * 0.6, pv.lightX)), p.y);
      sl.streak.width = Math.max(8, rx * 0.32);
      sl.streak.height = ry * 2.4;
      sl.streak.alpha = 0.55 * WATER_FADE * k * pv.alpha * (0.9 + 0.1 * Math.sin(now / 340 + p.x));
    } else sl.streak.visible = false;
    // 光の線(水面の端から端へ、加速して減速しながらゆっくり渡る)。
    const gp = glint ? glintPose(now - glint.at) : null;
    if (glint && gp) {
      sl.glint.visible = true;
      sl.glint.position.set(p.x + gp.pos * rx * 1.15 * glint.dir, p.y);
      sl.glint.rotation = -0.5 * glint.dir;
      sl.glint.width = Math.max(2, 2.2 * pv.d);
      sl.glint.height = ry * 3.2;
      sl.glint.alpha = 0.6 * WATER_FADE * gp.alpha * pv.alpha;
    } else sl.glint.visible = false;
  }

  // ---- 松明の光の映り(濡れた地面に、足元から手前へ縦に伸びる暖色の筋) ----
  // 既存の光のにじみ(柔らかい丸の絵)を縦に伸ばした1枚+途切れた横の光の欠片(さざなみ)。
  // 濃さは松明の光だまりの強さ(=炎の揺らぎ込み)をそのまま読み、慣性で寄せる。影を落とす光ではない(加算の絵だけ)。
  private syncTorchStreaks(h: WetHost): void {
    for (const st of this.streaks) st.seen = false;
    const v = h.view;
    for (const l of h.lights) {
      if (l.x < v.left - 60 || l.x > v.right + 60 || l.y < v.top - 40 || l.y > v.bottom + 20) continue;
      let st = this.streaks.find(q => q.id === l.id);
      if (!st) {
        st = this.streaks.find(q => !q.seen && q.a <= 0.004 && !this.isStreakLive(q, h));
        if (!st) {
          if (this.streaks.length >= TORCH_STREAK_MAX) continue;
          const main = new Sprite(getSoftGlowTexture());
          main.anchor.set(0.5, 0.5);
          main.blendMode = 'add';
          const dashes: Sprite[] = [];
          for (let i = 0; i < TORCH_STREAK_DASHES; i++) {
            // 欠片は角の立った横棒(参考画のドットの照り返し)。偶数本目だけ柔らかい丸=全部同じ硬さにしない。
            const d = new Sprite(i % 2 === 0 ? getSoftGlowTexture() : Texture.WHITE);
            d.anchor.set(0.5);
            d.blendMode = 'add';
            dashes.push(d);
          }
          const gloss = new Sprite(getGlossTexture(true));
          gloss.anchor.set(0.5, 0.35);
          gloss.blendMode = 'add';
          // 松明の裏の光(足元の少し奥の地面)。地面の層の中=松明の絵より必ず下に描かれる→三脚が明るい地面の前に影絵で立つ。
          const back = new Sprite(getSoftGlowTexture());
          back.anchor.set(0.5, 0.5);
          back.blendMode = 'add';
          this.glossLayer.addChild(back, gloss);
          this.streakLayer.addChild(main, ...dashes);
          st = { id: l.id, main, gloss, back, dashes, a: 0, seed: 0, seen: false };
          this.streaks.push(st);
        }
        st.id = l.id; st.a = 0; st.seed = (Math.abs(Math.sin(l.x * 0.013 + l.y * 0.007)) * 10) % 6.283;
      }
      st.seen = true;
      const ha = h.horizonAlpha(l.y);
      const target = Math.min(1, l.strength) * ha;
      st.a += (target - st.a) * TORCH_STREAK_EASE;
      this.drawStreak(st, l, h);
    }
    for (const st of this.streaks) {
      if (st.seen) continue;
      st.a += (0 - st.a) * TORCH_STREAK_EASE; // 画面から外れた/消えた松明は慣性で消える(最後の位置のまま)
      if (st.a <= 0.004) { st.a = 0; st.main.visible = false; st.gloss.visible = false; st.back.visible = false; for (const d of st.dashes) d.visible = false; continue; }
      st.main.alpha *= 1 - TORCH_STREAK_EASE;
      st.gloss.alpha *= 1 - TORCH_STREAK_EASE;
      st.back.alpha *= 1 - TORCH_STREAK_EASE;
      for (const d of st.dashes) d.alpha *= 1 - TORCH_STREAK_EASE;
    }
  }

  private isStreakLive(st: TorchStreak, h: WetHost): boolean {
    return h.lights.some(l => l.id === st.id);
  }

  private drawStreak(st: TorchStreak, l: WetLight, h: WetHost): void {
    const d = h.depthScale(l.y);
    const len = TORCH_STREAK_LEN * d;
    const top = l.y + TORCH_STREAK_TOP * d;
    const a = st.a;
    const m = st.main;
    m.visible = a > 0.004;
    m.tint = l.color;
    // 横長の楕円の光だまり: 中心を上から 30% に置く=足元側が明るく、手前へ薄く抜ける。
    m.position.set(l.x, top + len * 0.3);
    m.width = TORCH_STREAK_W * d;
    m.height = len * 1.15;
    m.alpha = TORCH_STREAK_ALPHA * a;
    // 足元の濡れた地面の照り(まだらの斑が温かく光る)。松明の背丈より広く、足元の少し奥から手前へ。
    const g = st.gloss;
    g.visible = m.visible;
    g.tint = lerpTint(l.color, 0xffd9a0, 0.3);
    g.position.set(l.x, l.y);
    g.width = WET_GLOSS_TORCH_W * d;
    g.height = WET_GLOSS_TORCH_H * d;
    g.alpha = WET_GLOSS_TORCH_ALPHA * a;
    // 裏の光: 足元の少し奥(画面の上)に横長の柔らかい光。濃さは炎の揺らぎ込みの a をそのまま読む。
    const b = st.back;
    b.visible = m.visible;
    b.tint = lerpTint(l.color, TORCH_BACK_TINT, TORCH_BACK_TINT_MIX);
    b.position.set(l.x, l.y - TORCH_BACK_UP * d);
    b.width = TORCH_BACK_W * d;
    b.height = TORCH_BACK_H * d;
    b.alpha = TORCH_BACK_ALPHA * a;
    for (let i = 0; i < st.dashes.length; i++) {
      const sp = st.dashes[i];
      const ds = torchStreakDash(i, st.dashes.length, h.now, st.seed);
      sp.visible = a > 0.004 && ds.a > 0.01;
      if (!sp.visible) continue;
      sp.tint = lerpTint(l.color, 0xffe2a8, 0.5); // 欠片は芯より少し白っぽい照り返し
      const w = TORCH_STREAK_DASH_W * d * ds.w * (sp.texture === Texture.WHITE ? 0.6 : 1); // 角の立った棒は短め
      sp.position.set(l.x + ds.dx * w * 0.6, top + len * ds.t);
      sp.width = w;
      const hard = sp.texture === Texture.WHITE;
      sp.height = hard ? Math.max(1, TORCH_STREAK_DASH_H * 0.5 * d) : Math.max(2, TORCH_STREAK_DASH_H * d);
      sp.alpha = TORCH_STREAK_DASH_ALPHA * ds.a * a * (hard ? 0.55 : 1);
    }
  }

  // ---- 波紋 ----
  private spawnRipple(x: number, y: number, water: boolean, s: number, now: number, a = 1, pid: string | null = null): void {
    let r = this.ripples.find(q => !q.on);
    if (!r) {
      if (this.ripples.length >= RIPPLE_MAX) {
        r = this.ripples.reduce((o, q) => (q.at < o.at ? q : o)); // 一番古いものを使い回す
      } else {
        const sp = new Sprite(Texture.EMPTY);
        sp.anchor.set(0.5);
        this.rippleLayer.addChild(sp);
        r = { sp, at: 0, x: 0, y: 0, water: true, s: 1, on: false, a: 1, pid: null };
        this.ripples.push(r);
      }
    }
    r.at = now; r.x = x; r.y = y; r.water = water; r.s = s; r.on = true; r.a = a; r.pid = pid;
  }

  private syncRipples(h: WetHost): void {
    for (const r of this.ripples) {
      if (!r.on) { r.sp.visible = false; continue; }
      const pose = ripplePose(h.now - r.at);
      if (!pose) { r.on = false; r.sp.visible = false; continue; }
      const tex = getTexture(`weather/ripple-${r.water ? 'water' : 'ground'}-${pose.frame}`);
      if (!tex) { r.sp.visible = false; continue; }
      r.sp.texture = tex;
      r.sp.visible = true;
      r.sp.position.set(r.x, r.y);
      const sc = DEBRIS_ART_SCALE * h.depthScale(r.y) * r.s * pose.scale; // 波紋は雫の大きさ=水たまりを大きくしても据え置き
      r.sp.scale.set(sc, sc);
      r.sp.alpha = pose.alpha * (r.water ? 0.6 : 0.45) * r.a * h.horizonAlpha(r.y);
    }
  }

  /** 水たまりを踏んだら波紋(入った瞬間と、中を歩いている間は一定の距離ごと)。 */
  private syncSteps(h: WetHost, boxes: readonly ActorBox[]): void {
    const now = h.now;
    const alive = new Set<string>();
    const scaled = [...this.views.values()];
    for (const bx of boxes) {
      const a = bx;
      alive.add(a.id);
      let hit: PuddleView | null = null;
      for (const pv of scaled) {
        if (isInPuddle({ x: pv.p.x, y: pv.p.y, rx: pv.p.rx * pv.d, ry: pv.p.ry * pv.d }, bx.x, bx.foot)) { hit = pv; break; }
      }
      const st = this.steps.get(a.id);
      const pid = hit ? hit.p.id : null;
      if (!st) { this.steps.set(a.id, { pid, x: bx.x, y: bx.foot, at: now }); continue; }
      if (hit) {
        const moved = Math.hypot(bx.x - st.x, bx.foot - st.y);
        const entered = st.pid !== pid;
        if ((entered && moved > 1) || (moved >= STEP_RIPPLE_DIST && now - st.at >= STEP_RIPPLE_MS)) {
          this.spawnRipple(bx.x, bx.foot, true, 0.8, now);
          st.x = bx.x; st.y = bx.foot; st.at = now;
        }
      } else { st.x = bx.x; st.y = bx.foot; }
      st.pid = pid;
    }
    for (const id of this.steps.keys()) if (!alive.has(id)) this.steps.delete(id);
  }

  // ---- 濡れた地面の照り(地面いっぱいに1枚。地平線の向こう=森・空の上には敷かない) ----
  private syncGloss(h: WetHost): void {
    const v = h.rainView ?? h.view;
    // 地平線の手前(地面が見えている所)から下だけ。上から粗く探す(画面の高さ/24 回まで)。
    const step = Math.max(8, (v.bottom - v.top) / 24);
    let top = v.top;
    while (top < v.bottom && h.horizonAlpha(top) < 0.5) top += step;
    if (!this.gloss) {
      this.gloss = new TilingSprite({ texture: getGlossTexture(false), width: 1, height: 1 });
      this.gloss.blendMode = 'add';
      this.gloss.tint = WET_GLOSS_TINT;
      this.glossLayer.addChildAt(this.gloss, 0);
    }
    const g = this.gloss;
    if (top >= v.bottom) { g.visible = false; return; }
    g.visible = true;
    const m = 40;
    g.position.set(v.left - m, top);
    g.width = v.right - v.left + m * 2;
    g.height = v.bottom - top + m;
    const k = WET_GLOSS_TILE_WORLD / 128;
    g.tileScale.set(k, k);
    const dr = wetGlossDrift(h.now);
    // 絵は世界に貼り付く(カメラが動いても地面と一緒に動く)+ごくゆっくりのずれ。
    g.tilePosition.set(-(v.left - m) + dr.x, -top + dr.y);
    const shaft = h.shaftLevel ?? 1;
    g.alpha = WET_GLOSS_ALPHA * dr.shimmer * Math.max(0.6, 1 + (shaft - 1) * WET_GLOSS_SHAFT_GAIN);
  }

  // ---- 雨の強弱(雨粒の降る量に掛ける。雫はそれに遅れて付いてくる) ----
  private syncRainLevel(now: number): void {
    if (!this.rainSched) {
      this.rainSched = makeRainSchedule(Math.random() * 1000, now);
      this.levelAt = now;
    }
    this.rainLevel = advanceRainSchedule(this.rainSched, now);
    // 1秒を超える間(タブ復帰)は1秒ぶんだけ進める=一気に追いつかない。
    const dt = Math.min(1000, Math.max(0, now - this.levelAt));
    this.levelAt = now;
    this.dripLevel = followLag(this.dripLevel, this.rainLevel, dt, DRIP_LAG_TAU_MS);
  }

  /** 開発用: 今の雨の強さと雫の強さ。 */
  get rainIntensity(): { rain: number; drip: number } { return { rain: this.rainLevel, drip: this.dripLevel }; }

  // ---- 葉先から垂れる雫(枝葉の高さで膨らむ→重力で加速して落ちる→着いた所で波紋) ----
  private syncDrips(h: WetHost): void {
    const now = h.now;
    if (now - this.nextDripAt > 1000) this.nextDripAt = now; // タブ復帰で一度に生まない
    if (now >= this.nextDripAt) {
      this.nextDripAt = now + (DRIP_EVERY_MS / Math.max(0.1, this.dripLevel)) * rand(0.4, 1.8); // 雨が弱いほど間が空く
      const v = h.view;
      // 枝葉が画面に入っている木(足元が画面の下の外でも、絵の高さぶんは対象)。
      const inView = h.trees.filter(t => t.footX + t.w * 0.5 > v.left && t.footX - t.w * 0.5 < v.right
        && t.footY > v.top && t.footY - t.h < v.bottom + 40 && t.h > 4);
      if (inView.length && this.drips.filter(d => d.on).length < DRIP_MAX) {
        const t = inView[Math.floor(Math.random() * inView.length)];
        const spec = leafDripSpec(t, Math.random);
        let d = this.drips.find(q => !q.on);
        if (!d) {
          const glow = new Sprite(getSoftGlowTexture());
          glow.anchor.set(0.5);
          glow.blendMode = 'add';
          glow.tint = DRIP_GLOW_TINT;
          const sp = new Sprite(Texture.WHITE);
          sp.anchor.set(0.5, 1);
          sp.tint = DRIP_TINT;
          this.dripLayer.addChild(glow, sp);
          d = { sp, glow, at: 0, spec, s: 1, on: false };
          this.drips.push(d);
        }
        d.at = now; d.spec = spec; d.s = h.depthScale(spec.y); d.on = true;
      }
    }
    for (const d of this.drips) {
      if (!d.on) { d.sp.visible = false; d.glow.visible = false; continue; }
      const pose = leafDripPose(now - d.at, d.spec);
      if (!pose) {
        d.on = false; d.sp.visible = false; d.glow.visible = false;
        const pv = puddleAt(this.scaledPuddles, d.spec.x, d.spec.y);
        this.spawnRipple(d.spec.x, d.spec.y, !!pv, pv ? 0.6 : 0.5, now);
        continue;
      }
      const s = d.s * DRIP_SIZE_MUL; // 社長指示2026-11-21「滴る水が悪目立ち」→「小さくして」(明るさは保つ)
      const ha = h.horizonAlpha(d.spec.y);
      const y = d.spec.y - pose.h;
      d.sp.visible = true;
      d.sp.position.set(d.spec.x, y);
      // ぶら下がり=丸い粒が育つ / 落下=細くなり、速くなるほど尾が伸びる。
      d.sp.width = (pose.falling ? 1.5 : 1.2 + 1.3 * pose.swell) * s;
      d.sp.height = (pose.falling ? 3 + 11 * pose.tail : 1.2 + 2 * pose.swell) * s;
      d.sp.alpha = 0.95 * pose.alpha * ha;
      // 照り(月明りを拾った小さな光)。ぶら下がっている間は膨らみに合わせて育ち、落ちる間は少し小さく。
      d.glow.visible = true;
      d.glow.position.set(d.spec.x, y - (pose.falling ? 2 : 1) * s);
      const gs = (pose.falling ? 7 : 4 + 6 * pose.swell) * s;
      d.glow.width = gs; d.glow.height = gs * (pose.falling ? 1.5 : 1);
      d.glow.alpha = 0.7 * pose.alpha * ha;
    }
  }

  // ---- ポツポツ雨 ----
  private syncRain(h: WetHost): void {
    const now = h.now;
    const v = h.rainView ?? h.view;
    const w = Math.max(0, v.right - v.left), hh = Math.max(0, v.bottom - v.top);
    // 遅れが1秒を超えたら追いかけない(タブ復帰・重いフレームで一度に降らせない)。
    if (now - this.nextRainAt > 1000) this.nextRainAt = now;
    let budget = RAIN_SPAWN_PER_FRAME;
    while (now >= this.nextRainAt && budget-- > 0) {
      const spawn = !this.rainRecheck;
      const ev = rainNextEvent(rainNextGapMs(w * hh * this.rainLevel, Math.random)); // 今の雨の強さぶん
      this.nextRainAt += ev.dt;
      this.rainRecheck = !ev.spawn;
      if (!spawn) continue; // 見直しだけの予定(止みかけ)
      let d = this.rain.find(q => !q.on);
      if (!d) {
        if (this.rain.length >= RAIN_MAX) break;
        const sp = new Sprite(getRainStreakTexture());
        sp.anchor.set(0.5, 1); // 線の下端=雨粒の先
        sp.tint = RAIN_TINT;
        sp.visible = false;
        this.rainLayer.addChild(sp);
        d = { sp, at: 0, x: 0, y: 0, spec: rainDropSpec(Math.random), on: false };
        this.rain.push(d);
      }
      // 着地点は可視域の中(下は少し外まで=画面の下端へ落ちる粒も描く)。地平線の向こうには降らせない。
      // 地平線の向こうに落ちる点は捨てずに引き直す(最大4回)=本降りが見える地面に全数降る(社長指示2026-11-21「もっと土砂降りに」)。
      const x = v.left + Math.random() * w;
      let y = v.top + Math.random() * (hh + 60);
      for (let k = 0; k < 4 && h.horizonAlpha(y) <= 0.02; k++) y = v.top + Math.random() * (hh + 60);
      if (h.horizonAlpha(y) <= 0.02) continue;
      d.at = now; d.x = x; d.y = y; d.spec = rainDropSpec(Math.random); d.on = true;
    }
    for (const d of this.rain) {
      if (!d.on) { d.sp.visible = false; continue; }
      const pose = rainPose(now - d.at, d.spec);
      const ds = h.depthScale(d.y);
      if (!pose) {
        d.on = false; d.sp.visible = false;
        const pv = puddleAt(this.scaledPuddles, d.x, d.y);
        this.spawnRipple(d.x, d.y, !!pv, pv ? 0.42 + Math.random() * 0.16 : 0.3 + Math.random() * 0.1, now);
        continue;
      }
      const sl = d.spec.slant;
      d.sp.visible = true;
      // 斜めに落ちる: 高さ h の所では着地点より上流(左)へ h*slant ずれている。
      d.sp.position.set(d.x - pose.h * sl * ds, d.y - pose.h * ds);
      d.sp.rotation = -Math.atan(sl); // 尾が左上へ伸びる=右下へ流れる向き
      d.sp.width = RAIN_WIDTH * ds;
      d.sp.height = pose.len * ds;
      d.sp.alpha = d.spec.alpha * pose.alpha * h.horizonAlpha(d.y);
    }
  }

  // ---- 水たまりの雨の波紋(雨が強いほど水面が忙しく波立つ・止みかけでは立たない) ----
  private syncPuddleRain(h: WetHost): void {
    const now = h.now;
    const dt = Math.min(100, Math.max(0, now - this.puddleRippleAt));
    this.puddleRippleAt = now;
    if (dt <= 0) return;
    let budget = PUDDLE_RIPPLE_PER_FRAME;
    const v = h.rainView ?? h.view;
    // 同じ水たまりで今立っている雨の波紋の数(混むほど1つ1つを薄く=重なっても白く潰れず、輪が1つずつ読める)。
    const busy = this.rippleBusy;
    busy.clear();
    for (const r of this.ripples) if (r.on && r.pid) busy.set(r.pid, (busy.get(r.pid) ?? 0) + 1);
    for (const pv of this.views.values()) {
      if (budget <= 0) break;
      if (pv.alpha < 0.05) continue;
      const p = pv.p;
      if (p.x < v.left || p.x > v.right || p.y < v.top || p.y > v.bottom + 20) continue;
      const rx = p.rx * pv.d * WATER_FIT_X, ry = p.ry * pv.d * WATER_FIT_Y; // 水面(縁の内側)
      const rate = puddleRippleRate(this.rainLevel, Math.PI * rx * ry);
      if (rate <= 0) continue;
      // 見込みの数 λ の整数部+端数は確率で(重いフレームでも1つの水たまりに2つまで)。
      const lam = rate * dt;
      const n = Math.min(2, Math.floor(lam) + (Math.random() < lam - Math.floor(lam) ? 1 : 0));
      for (let i = 0; i < n && budget > 0; i++, budget--) {
        const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.85;
        const c = busy.get(p.id) ?? 0;
        busy.set(p.id, c + 1);
        // 雨粒の輪は雫(0.6)・着地(0.42..0.58)より小さく、混むほど薄く(5つまでは素のまま)。
        const a = PUDDLE_RIPPLE_ALPHA * Math.min(1, Math.sqrt(5 / Math.max(5, c)));
        this.spawnRipple(p.x + Math.cos(ang) * rx * rr, p.y + Math.sin(ang) * ry * rr, true, 0.28 + Math.random() * 0.14, now, a, p.id);
      }
    }
  }

  // ---- 霧・近景・月・空(毎フレームの最後に掛け、次のフレームの頭で戻す) ----
  private paint(sp: Sprite | TilingSprite | null, tint: number, alpha: number, scaleMul = 1): void {
    if (!sp || sp.destroyed) return;
    if (!this.originals.has(sp)) this.originals.set(sp, { tint: Number(sp.tint), alpha: sp.alpha, sx: sp.scale.x, sy: sp.scale.y });
    sp.tint = tint;
    sp.alpha = alpha;
    if (scaleMul !== 1) sp.scale.set(sp.scale.x * scaleMul, sp.scale.y * scaleMul);
  }

  applyAtmosphere(a: WetAtmosphere): void {
    if (!this.visible) return;
    // 霧は薄く・藍へ(灰色の平たい幕に見えない)。近景の森も同じ藍の夜へ。月の暈とグローは大きく明るく。
    for (const f of a.fog) this.paint(f, mulTint(Number(f.tint), WET_FOG_TINT_MUL), f.alpha * WET_FOG_ALPHA_MUL);
    for (const f of a.front) if (f) this.paint(f, mulTint(Number(f.tint), WET_FRONT_TINT_MUL), f.alpha);
    for (const m of a.moonGlow) this.paint(m, Number(m.tint), m.alpha * WET_MOON_GLOW_ALPHA_MUL, WET_MOON_GLOW_SCALE_MUL);
    for (const m of a.moonHalo) this.paint(m, Number(m.tint), m.alpha * WET_MOON_HALO_ALPHA_MUL, WET_MOON_HALO_SCALE_MUL);
    // 空は遠景の箱に色行列を1枚足す(1回だけ・外す時は detachSky)。
    if (a.farGroup && this.farGroupWithFilter !== a.farGroup) {
      this.detachSky();
      const cur = (a.farGroup.filters as Filter[] | null) ?? [];
      a.farGroup.filters = [...cur, this.skyFilter];
      this.farGroupWithFilter = a.farGroup;
    } else if (a.farGroup) {
      const cur = (a.farGroup.filters as Filter[] | null) ?? [];
      if (!cur.includes(this.skyFilter)) a.farGroup.filters = [...cur, this.skyFilter]; // 他所が作り直した時
    }
  }

  restoreAtmosphere(): void {
    for (const [sp, o] of this.originals) {
      if (!sp.destroyed) { sp.tint = o.tint; sp.alpha = o.alpha; sp.scale.set(o.sx, o.sy); }
    }
    this.originals.clear();
  }

  private detachSky(): void {
    const g = this.farGroupWithFilter;
    if (!g) return;
    this.farGroupWithFilter = null;
    if (g.destroyed) return;
    const cur = (g.filters as Filter[] | null) ?? [];
    if (cur.includes(this.skyFilter)) g.filters = cur.filter(f => f !== this.skyFilter);
  }

  destroy(): void {
    this.restoreAtmosphere();
    this.detachSky();
    this.landLayer.mask = null;
    this.landCopies = [];
    this.root.destroy({ children: true });
    this.landMaskBox.destroy({ children: true });
    if (this.landMaskRT) { this.gpu?.release(this.landMaskRT); this.landMaskRT = null; }
    this.landScene.destroy({ children: true });
    if (this.landRT) { this.gpu?.release(this.landRT); this.landRT = null; }
    if (!this.rainLayer.destroyed) this.rainLayer.destroy({ children: true });
    this.rain = [];
    this.views.clear();
    this.gradeFilter.destroy();
    this.skyFilter.destroy();
  }
}
