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
//   3b. 風景の映り … 既に読み込んである遠景(空・月・城・森)の絵を、地平線を軸に上下反転して小さな焼き1枚にし、
//      水たまりごとに「逆さの稜線(木の根元)=その水たまりの奥の縁」に吊るして置く(木は手前へ垂れ、その先は空だけ)。
//      画面内の水たまりの水面の形を集めた1枚の型(マスク)の内側にだけ出す(新しい素材・光・投影影なし)。
//      元の絵の視差(横の流れ)をそのまま写す=歩くと水の中で空と森が流れる。
//   4. 雫と波紋 … 木の下でときどき雫→波紋。水たまりを踏んだら波紋。どちらも使い回しの粒(上限つき)。
//   4b. ポツポツ雨 … 細く短い線をまばらに斜めに落とす(少し加速)。着いた所が水たまりなら水の波紋・地面なら小さな跳ね
//      (4 の波紋の粒をそのまま使う)。線はアクターの上・被写界深度の外の層(danceUiLayer)・粒は上限 RAIN_MAX。
//   5./6. 霧を少し薄く冷たく・空(遠景)を少し明るく … 毎フレームの最後に色を掛け、次のフレームの頭で戻す
//      (pixiScene の applyForestPreview / applyWraithDarkness と同じ型=他の色の書き込みとぶつからない)。
// 影を落とす光は1つも足さない(このプロジェクトで高いのは投影影を落とす光だけ=CLAUDE.md の実測)。

import { ColorMatrixFilter, Container, Matrix, Point, Rectangle, Sprite, Texture, TilingSprite, type Filter, type RenderTexture } from 'pixi.js';
import { getTexture } from './pixiTextures';
import { makeProjGridMesh, projMeshFromSprite, PROJ_GRID_SOFT } from './projDraw'; // 投影の段階4(?proj=1 の時だけ・K01)
import { projectInto, makeProjPoint, type ProjFrame } from '../utils/perspectiveProjection';
import { projShapeOutside } from '../utils/projShape';
import { projFxScale, projFlatInto, makeProjFlatOut, PROJ_AMBIENT_CAP } from '../utils/projFx'; // 投影の段階3(?proj=1 の時だけ・G5)
import type { MeshSimple } from 'pixi.js';
import { getSoftGlowTexture } from './lighting';
import {
  puddlesInRegion, puddleAt, isInPuddle, PUDDLE_ART_SCALE, DEBRIS_ART_SCALE, PUDDLE_CELL, type Puddle,
} from '../world/weatherPuddles';
import { propPlacementVersion } from '../world/propPlacement';
import {
  ripplePose, glintPose, GLINT_MS,
  rainDropSpec, rainGust, rainPose, rainNextGapMs, rainNextEvent, RAIN_MAX, RAIN_SPAWN_PER_FRAME, type RainDropSpec,
  puddleRippleRate,
  landscapeBand, puddleReflection, LANDSCAPE_SKY_SAMPLE,
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
import { buildWetGradeMatrixMix, mixMatrixFromIdentity } from '../utils/stage7Weather';
import { easeInOutSine } from '../utils/weatherWet';

const PFLAT = makeProjFlatOut(); // ?proj=1(段階3・G5.ripple・★#30): 寝かせる倍率の作り置き
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
/** 風景の映りを置く水たまりの上限(使い回し・1つにつき帯1枚+空の写し1枚)。画面内の水たまりはふつう10前後。 */
const LAND_REFL_MAX = 24;
/** 空の映り(水面の形の加算)。光が無い所でもうっすら空が映る。 */
const SKY_TINT = 0x2a3160; // 彩度を落とした藍(旧 0x3a4aa6・その前 0x34507a)
const SKY_ALPHA = 0.1; // 平らな青の塗りに見せない(旧 0.22・その前 0.16)
/** 松明の光だまりが水たまりへにじむ距離(world px)と強さ。 */
const LIGHT_REACH = 300;
const LIGHT_GAIN = 0.75;
/** キャラの逆さの映り。 */
const REFL_TINT = 0xc0d0e6; // 社長指示2026-11-21「水たまりに映る姿、もう少しハッキリ」で明るく(旧 0xa4bad6=沈んで輪郭が読みにくい)
const REFL_ALPHA = 0.9; // 同上(0.68→0.9・WATER_FADE は据え置き=実効 約0.48→約0.63)。その前 0.55→0.68「ほんの少しだけ上げて」
const REFL_PER_SLOT = 3;
/** 小物の色(地面の色に寄せて沈める)。 */
const DEBRIS_DIM = { r: 0.62, g: 0.64, b: 0.7 };
/** 切り抜き(映り・光の筋・光の線)を同時に描く水たまりの上限。 */
const MAX_SLOTS = 5;
/** 光の線: 何msおきに1本(乱数で幅を持たせる)。同時に2本まで。 */
const GLINT_EVERY_MS = 2200;
const GLINT_MAX = 2;
/** 波紋の上限(使い回し)。ポツポツ雨の着地ぶんを足して 24→40、本降りで水たまりが波立つぶんを足して 40→64。 */
const RIPPLE_MAX = 160; // 雨を目立たせた(2026-11-26)ぶん 96→160 // 本降りの時に波紋の使い回しが埋まらない余裕(64→96)
/** 水たまりの雨の波紋を1フレームで生む上限(重いフレーム・タブ復帰で一度に立たない)。 */
const PUDDLE_RIPPLE_PER_FRAME = 6; // 同上 4→6
/** 水たまりの雨の波紋の濃さ(雫・着地の波紋に掛ける 1 に対して)。 */
const PUDDLE_RIPPLE_ALPHA = 1;
/** 雨粒の色(冷たい白)・太さ(world px・遠近前)。 */
const RAIN_TINT = 0xe6f0ff; // 社長指示2026-11-26「雨、もっと目立つ様に」: 暗い夜に立つ明るい冷たい白(旧 0xd8e4f6)
const RAIN_WIDTH = 1.8; // 同上 1.1→1.8
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
    const edge = x === 0 || x === w - 1 ? 0.5 : 1;
    const g = ctx.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, `rgba(255,255,255,${0.6 * edge})`); // 尾も読める濃さ(旧 0.35 で 0.45)
    g.addColorStop(0.75, `rgba(255,255,255,${edge})`);
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
  /** 木の根元(遠景の絵の地面の帯の上端)の y。映りの帯はここから上だけを写す(地面は映さない)。無ければ地平線。 */
  rootY?: number;
  screenTop: number;
  screenBottom: number;
  screenLeft: number;
  screenRight: number;
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
  focusX: number;
  focusY: number;
  /** 水たまりに映す遠景(無ければ風景は映さない)。 */
  landscape?: WetLandscape;
  /** 月明りの筋の今の明るさ(脈動込み・1 前後・筋が無い時は 0)。地面の照りの濃さへ移す。 */
  shaftLevel?: number;
  /** 世界の点に落ちている月明りの筋の量(0..1)。水たまりの縁と小物を月明りの絵へ寄せる。 */
  moonAt?: (x: number, y: number) => number;
  /** 雨量に掛ける倍率(省略=1)。ステージ7で雨が上がる時に 1→0(utils/stage7Weather.ts)。雫は従来どおり遅れて付いてくる。 */
  rainScale?: number;
  /** 水たまりを置くステージ(避ける花を引く・省略=ステージ1)。 */
  stageId?: string;
  /** 雨の強さの時刻表を、この強さで降っている所から始める(最初の区間だけ・省略=従来どおり小雨から)。時刻表を作る時だけ読む。 */
  rainStart?: number;
  /** この値が変わったら雨の強さの時刻表を作り直す(ステージ7の新しい出撃=また降っている所から)。省略=作り直さない。 */
  rainRun?: number;
  /**
   * 投影の口(?proj=1 の時だけ・research/PERSPECTIVE_PROJECTION.md §3-6b の K01・段階4)。渡されると、水たまりの地面に寝た4枚
   * (縁・水面・空の映り・風景の映りの型)と月明りの縁を、同じ素材の格子メッシュ(柔らかい絵の粗い規則 24/48)で頂点ごとに投影して置く。
   * 小物・キャラの映りの型・光の筋は点+s。null/省略=今の描き方のまま(メッシュは1つも作らない)。
   */
  projGrid?: ProjFrame | null;
  /**
   * ?proj=1 の時だけ: 地面の点 (x, y) の濃さ(投影後のYの地平線フェード・§3-6f=pixiScene の projLooseFade)。
   * 渡されると、水たまりと小物の濃さを world の Y の horizonAlpha ではなくこれで引く(北の見えている地面の水たまりを捨てない)。
   */
  projFade?: (x: number, y: number) => number;
  /**
   * ?proj=1 の時だけ: 見える world(台形の外接矩形・北は描く距離の上限=pixiScene の projAmbientRect・★#26=B)。
   * 渡されると、雨粒の着地点・水たまりの雨の波紋を取る範囲を旧い画面の矩形(rainView)からこれへ広げ、数は面積の比(上限 PROJ_AMBIENT_CAP 倍)で増やす。
   * 濡れた地面の照りの上端も投影後の地平線から取る。null/省略=今のまま。
   */
  projAmbient?: { left: number; top: number; right: number; bottom: number } | null;
}
export interface WetAtmosphere {
  fog: readonly (Sprite | TilingSprite)[];
  front: readonly (Sprite | TilingSprite | null)[];
  moonGlow: readonly Sprite[];
  moonHalo: readonly Sprite[];
  farGroup: Container | null;
  /** 効き具合(0..1・加減速は呼ぶ側。省略=1=従来どおり全部)。ステージ7で雨が上がる時に抜く。0 なら何も掛けない。 */
  mix?: number;
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
  /** ?proj=1 の格子メッシュ(遅延生成・projGrid がある時に初めて作る)。 */
  pm?: { ground: MeshSimple; water: MeshSimple; sky: MeshSimple; landMask: MeshSimple; groundMoon: MeshSimple | null };
  /** ?proj=1: 水面の中心の投影(表示座標)と s(映りの型・光の筋が読む)。 */
  projX?: number; projY?: number; projS?: number;
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
/** 水たまり1つぶんの風景の映り: 帯(焼きの横の切り出し)と、その下に続ける空の鏡写し。切り出しの絵は焼きの使い回し。 */
interface LandRefl { band: Sprite; sky: Sprite; bandTex: Texture; skyTex: Texture }

/** 空(遠景)の色行列。少し明るく・わずかに冷たく(雲が切れて澄んだ空)。 */
const SKY_MATRIX: readonly number[] = [
  1.06, 0, 0, 0, 0.012,
  0, 1.1, 0, 0, 0.02,
  0, 0, 1.16, 0, 0.034,
  0, 0, 0, 1, 0,
];

/** 葉先の雫の大きさ(芯と照りに掛ける)。悪目立ちしないよう半分に(社長指示2026-11-21)。 */
const DRIP_SIZE_MUL = 0.5;

/** ?proj=1 の水たまりの格子メッシュの役(プールの仕分け)。 */
type ProjPuddleMeshRole = 'ground' | 'water' | 'sky' | 'landMask' | 'groundMoon';

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
  /** 遠景の写し(表示ツリーの外)と、それを上下反転して焼いた1枚。 */
  private landScene = new Container();
  private landRT: RenderTexture | null = null;
  /** 水たまりごとの映りの箱(子の座標=画面の座標)と、その使い回し。 */
  private landWrap = new Container();
  private landRefls: LandRefl[] = [];
  private landOrder: PuddleView[] = [];
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
  private rainRun: number | undefined;
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
    this.landLayer.addChild(this.landWrap, this.landMaskSprite);
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
    this.skyFilter.matrix = [...SKY_MATRIX] as unknown as typeof this.skyFilter.matrix;
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

  /** 色行列(世界・空)の効き具合(0..1・線形。見た目の加減速はここで掛ける)。呼ばなければ 1=従来どおり。変わった時だけ作り直す。 */
  private wetMix = 1;
  setWetMix(mix: number): void {
    const m = Math.max(0, Math.min(1, mix));
    if (m === this.wetMix) return;
    this.wetMix = m;
    this.gradeFilter.matrix = buildWetGradeMatrixMix(m) as unknown as typeof this.gradeFilter.matrix;
    this.skyFilter.matrix = mixMatrixFromIdentity(SKY_MATRIX, easeInOutSine(m)) as unknown as typeof this.skyFilter.matrix;
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
    // 拠点の円・POI などの手置きの物は world 層(propPlacement)が持つ=その版が変わったら作り直す。
    const key = `${cx0},${cy0},${cx1},${cy1}|${propPlacementVersion()}|${h.stageId ?? ''}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.cached = puddlesInRegion(cx0 * PUDDLE_CELL, cy0 * PUDDLE_CELL, (cx1 + 1) * PUDDLE_CELL - 1, (cy1 + 1) * PUDDLE_CELL - 1, { stageId: h.stageId });
    }
    return this.cached;
  }

  /** ?proj=1 の投影(このフレームの sync の間だけ・映りの型と光の筋が読む)。 */
  private projFrameNow: ProjFrame | null = null;
  /** ?proj=1: このフレームの見える world(★#26=B)と、旧い矩形(rainView)との面積の比(1..PROJ_AMBIENT_CAP)。?proj=0 は null / 1。 */
  private projAmbNow: { left: number; top: number; right: number; bottom: number } | null = null;
  private projAmbK = 1;
  private depthNow: ((y: number) => number) | null = null;
  /** ?proj=1: 水面の上に置いた光の筋・光の線(world の点・大きさに d)を点+s へ写す。 */
  private projSlotFx(sp: Sprite, pv: PuddleView): void {
    const q = projectInto(this.projFrameNow!, sp.position.x, sp.position.y, this.projPt);
    const k = q.s / (pv.d || 1);
    sp.position.set(q.x, q.y);
    sp.scale.set(sp.scale.x * k, sp.scale.y * k);
  }

  sync(h: WetHost): void {
    if (!this.visible) return;
    this.projFrameNow = h.projGrid ?? null;
    this.depthNow = h.depthScale;
    this.projAmbNow = null; this.projAmbK = 1;
    if (this.projFrameNow && h.projAmbient) {
      // ?proj=1(★#26=B): 取り直す範囲=見える world・数=面積の比(減らさない・上限 PROJ_AMBIENT_CAP 倍)
      const a = h.projAmbient, b = h.rainView ?? h.view;
      const a0 = Math.max(1, (b.right - b.left) * (b.bottom - b.top));
      const r = Math.max(0, (a.right - a.left) * (a.bottom - a.top)) / a0;
      this.projAmbNow = a;
      this.projAmbK = Math.min(PROJ_AMBIENT_CAP, Math.max(1, Number.isFinite(r) ? r : 1));
    }
    const puddles = this.puddlesFor(h);
    const seen = new Set<string>();
    const v = h.view;
    const pf = h.projGrid ?? null;
    for (const p of puddles) {
      // ?proj=1: 形の端を投影した箱が画面に掛かるか(見える world が北に広く・南に狭い)
      if (pf ? projShapeOutside(pf, p.x, p.y, Math.max(p.rx, p.ry) + 40, 0)
        : (p.x + p.rx < v.left - 40 || p.x - p.rx > v.right + 40 || p.y + p.ry < v.top - 40 || p.y - p.ry > v.bottom + 40)) continue;
      const ha = pf && h.projFade ? h.projFade(p.x, p.y) : h.horizonAlpha(p.y);
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
      if (pv.pm) this.releaseProjMeshes(pv.pm); // ?proj=1 のメッシュは壊さずプールへ戻す(画面を出入りするたびに作り直さない)
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
    if (h.rainRun !== undefined && h.rainRun !== this.rainRun) { this.rainRun = h.rainRun; this.rainSched = null; }
    this.syncRainLevel(h.now, h.rainScale ?? 1, h.rainStart);
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
    // 水面・空・型の Sprite は ?proj=1 の時だけ隠す(毎フレーム戻してから決める=投影の場面を出入りしても残らない)
    pv.water.visible = true; pv.sky.visible = true; pv.landMask.visible = true;
    if (h.projGrid) this.projPuddle(pv, h, h.projGrid, d);
    else {
      pv.projS = undefined;
      if (pv.pm) { pv.pm.ground.visible = false; pv.pm.water.visible = false; pv.pm.sky.visible = false; pv.pm.landMask.visible = false; if (pv.pm.groundMoon) pv.pm.groundMoon.visible = false; }
    }
  }

  private projPt = makeProjPoint();
  /** ?proj=1 の格子メッシュのプール(役ごと・層の子のまま隠して置く・監査 B-2)。 */
  private projMeshPool: Record<ProjPuddleMeshRole, MeshSimple[]> = {
    ground: [], water: [], sky: [], landMask: [], groundMoon: [],
  };
  private releaseProjMeshes(pm: NonNullable<PuddleView['pm']>): void {
    const put = (m: MeshSimple | null, k: ProjPuddleMeshRole) => {
      if (!m || m.destroyed) return;
      m.visible = false;
      this.projMeshPool[k].push(m);
    };
    put(pm.ground, 'ground'); put(pm.water, 'water'); put(pm.sky, 'sky'); put(pm.landMask, 'landMask'); put(pm.groundMoon, 'groundMoon');
  }
  /**
   * ?proj=1(段階4・K01): 地面に寝た4枚+月明りの縁を同じ素材の格子メッシュで頂点ごとに投影して置き、Sprite は隠す。
   * 寸法は Sprite に掛かっている旧い遠近の倍率 d を外した world の寸法(足元を支点に)。小物と月明りの小物は点+s。
   * 濃さ(地平線)は投影後のY(host の projFade=§3-6f・sync が ha として Sprite に入れた値をメッシュへ写す)。
   * メッシュは projGrid がある時に初めて作る(遅延生成)。画面から外れた水たまりのメッシュはプールへ戻し、次の水たまりで使い回す。
   */
  private projPuddle(pv: PuddleView, h: WetHost, f: ProjFrame, d: number): void {
    if (!pv.pm) {
      const mk = (sp: Sprite, tag: string, k: ProjPuddleMeshRole) => {
        const pool = this.projMeshPool[k];
        let m = pool.pop();
        while (m && m.destroyed) m = pool.pop();
        if (!m) { m = makeProjGridMesh(sp.texture, tag); m.eventMode = 'none'; }
        const par = sp.parent!;
        if (m.parent) m.parent.removeChild(m);
        par.addChildAt(m, par.getChildIndex(sp) + 1);
        return m;
      };
      pv.pm = {
        ground: mk(pv.ground, 'puddleGround', 'ground'), water: mk(pv.water, 'puddleWater', 'water'), sky: mk(pv.sky, 'puddleSky', 'sky'),
        landMask: mk(pv.landMask, 'puddleLandMask', 'landMask'), groundMoon: pv.groundMoon ? mk(pv.groundMoon, 'puddleGroundMoon', 'groundMoon') : null,
      };
    }
    const k = d > 0 ? 1 / d : 1;
    const pairs: [Sprite | null, MeshSimple | null][] = [
      [pv.ground, pv.pm.ground], [pv.water, pv.pm.water], [pv.sky, pv.pm.sky], [pv.landMask, pv.pm.landMask], [pv.groundMoon, pv.pm.groundMoon],
    ];
    for (const [sp, m] of pairs) {
      if (!sp || !m) continue;
      projMeshFromSprite(m, f, sp, PROJ_GRID_SOFT, k);
      sp.visible = false;
    }
    // 水面の中心(映りの型・光の筋が読む)
    const q = projectInto(f, pv.water.position.x, pv.water.position.y, this.projPt);
    pv.projX = q.x; pv.projY = q.y; pv.projS = q.s;
    // 小物(立つ絵): 足元を投影して置き、大きさは s(旧い ds を外す)
    for (let i = 0; i < pv.debris.length; i++) {
      const dd = pv.p.debris[i];
      const sp = pv.debris[i];
      if (!dd || !sp) continue;
      const ds = h.depthScale(dd.y);
      const qd = projectInto(f, dd.x, dd.y, this.projPt);
      const kk = ds > 0 ? projFxScale(qd.s) / ds : 1; // 段階3(G5・3-7i の表): 破片の大きさは旧い ds を外して s_fx
      sp.position.set(qd.x, qd.y);
      sp.scale.set(sp.scale.x * kk, sp.scale.y * kk);
      if (h.projFade) sp.alpha = h.projFade(dd.x, dd.y); // 濃さも投影後のY(§3-6f)
      const mp = pv.debrisMoon[i];
      if (mp && mp.visible) { mp.position.set(qd.x, qd.y); mp.scale.set(mp.scale.x * kk, mp.scale.y * kk); mp.alpha = sp.alpha * pv.moonA; }
    }
  }

  /** 風景の映りの型の world の矩形(?proj=1 は型のメッシュの頂点の箱=表示座標)。 */
  private maskRect(pv: PuddleView, o: { x0: number; y0: number; x1: number; y1: number }): { x0: number; y0: number; x1: number; y1: number } {
    const m = pv.pm?.landMask;
    if (m && pv.projS !== undefined) {
      const pos = m.geometry.getBuffer('aPosition').data as Float32Array;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pos.length; i += 2) {
        const x = pos[i], y = pos[i + 1];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      o.x0 = x0; o.y0 = y0; o.x1 = x1; o.y1 = y1;
      return o;
    }
    const w = pv.landMask;
    const hw = Math.abs(w.scale.x) * w.texture.width * 0.5, hh = Math.abs(w.scale.y) * w.texture.height * 0.5;
    o.x0 = w.x - hw; o.x1 = w.x + hw; o.y0 = w.y - hh; o.y1 = w.y + hh;
    return o;
  }
  private mrTmp = { x0: 0, y0: 0, x1: 0, y1: 0 };

  // ---- 風景の映り(遠景の上下反転を、水面の形の型の内側にだけ) ----
  // 1. 遠景の絵の写し(表示ツリーの外の箱 landScene)を、画面の上端〜地平線の帯ごと小さな焼き(LAND_RT_*)へ
  //    上下反転して描く(元の絵の位置・視差・空のコマ送り・月の呼吸をそのまま写す=新しい素材なし)。焼きの上端=木の根元。
  // 2. 水たまりごとに、焼きのその水たまりの横幅ぶんを切り出して、上端(木の根元)を水面の奥の縁に合わせて置く
  //    (横は画面の座標のまま=歩くと水の中で森が流れる)。縦は水たまりの深さに比例して縮める(puddleReflection)。
  //    帯の下端(空の上端)が手前の縁より上で終わったら、焼きの下端(空の上の方)を鏡写しにして手前の縁まで伸ばす
  //    =稜線の2本目も地面も映らない。
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
    const rootY = Math.min(L.horizonY, L.rootY ?? L.horizonY);
    const band = landscapeBand(rootY, L.screenTop);
    const gx0 = L.screenLeft, gw = Math.max(1, L.screenRight - L.screenLeft);
    // 1. 帯(画面の上端〜木の根元)を上下反転して焼く: 焼きの上端=木の根元・下端=画面の上端。
    if (!this.landRT) this.landRT = gpu.bake(LAND_RT_W, LAND_RT_H);
    const rt = this.landRT;
    const sx = rt.width / gw, sy = rt.height / band.srcH;
    gpu.render(this.landScene, rt, this.mB.set(sx, 0, 0, -sy, -gx0 * sx, rootY * sy));
    // 2. 映りの箱の座標=画面の座標(landLayer の global の逆)。水たまりの水面の矩形(world)を画面へ写して置く。
    const g = this.landLayer.getGlobalTransform(this.mA, false);
    this.landWrap.setFromMatrix(this.mFlip.copyFrom(g).invert());
    // 夜は地面と同じ暗さへ寄せ、冷たく少し沈める(空の明るさがそのまま地面に浮かない)。
    const e = h.envTint;
    const lift = (c: number) => Math.min(1, (c / 255) * LAND_ENV_LIFT);
    const tint = mulTint(LAND_TINT, { r: lift((e >> 16) & 255), g: lift((e >> 8) & 255), b: lift(e & 255) });
    // 奥から手前の順に置く(重なった所は手前の水たまりの映りが上)。上限を超えたら注目点に近い順。
    const order = this.landOrder;
    order.length = 0;
    for (const pv of this.views.values()) if (pv.landMask.alpha > 0.004) order.push(pv);
    if (order.length > LAND_REFL_MAX) {
      order.sort((a, b) => Math.hypot(a.p.x - h.focusX, a.p.y - h.focusY) - Math.hypot(b.p.x - h.focusX, b.p.y - h.focusY));
      order.length = LAND_REFL_MAX;
    }
    order.sort((a, b) => a.p.y - b.p.y);
    const skyRow0 = rt.height * (1 - LANDSCAPE_SKY_SAMPLE);
    let used = 0;
    for (const pv of order) {
      // ?proj=1 は型のメッシュの箱(表示座標)=型と同じ所へ帯を置く
      const mr = this.maskRect(pv, this.mrTmp);
      // world の矩形の4隅 → 画面(回転は無い前提=拡大と平行移動だけ。左上・右下の2点で足りる)。
      const ax = g.a * mr.x0 + g.c * mr.y0 + g.tx, ay = g.b * mr.x0 + g.d * mr.y0 + g.ty;
      const bx = g.a * mr.x1 + g.c * mr.y1 + g.tx, by = g.b * mr.x1 + g.d * mr.y1 + g.ty;
      // 横は画面の内側だけ切り出す(焼きの外は無い)。
      const xl = Math.max(gx0, Math.min(ax, bx)), xr = Math.min(gx0 + gw, Math.max(ax, bx));
      const far = Math.min(ay, by), near = Math.max(ay, by);
      if (xr - xl < 0.5 || near - far < 0.5 || near < L.horizonY) continue;
      const r = puddleReflection(far, near, band.srcH);
      const lr = this.landRefls[used] ?? this.makeLandRefl();
      used++;
      const fx = (xl - gx0) * sx, fw = Math.max(1e-3, (xr - xl) * sx);
      // 帯: 焼きの上から bandVisFrac ぶん(根元→空の上端の手前で切る)を、稜線の y から下へ。
      if (lr.bandTex.source !== rt.source) lr.bandTex.source = rt.source;
      lr.bandTex.frame.copyFrom(this.landFrame.set(fx, 0, fw, Math.max(1e-3, rt.height * r.bandVisFrac)));
      lr.bandTex.update();
      lr.band.visible = r.bandVisH > 0.25;
      lr.band.position.set(xl, r.ridgeY);
      lr.band.width = xr - xl;
      lr.band.height = Math.max(1e-3, r.bandVisH);
      lr.band.tint = tint;
      // 空の鏡写し: 焼きの下端(空の上端)を継ぎ目に合わせ、そこから下へ空の上の方を逆さに伸ばす(継ぎ目が切れない)。
      lr.sky.visible = r.skyH > 0.25;
      if (lr.sky.visible) {
        if (lr.skyTex.source !== rt.source) lr.skyTex.source = rt.source;
        lr.skyTex.frame.copyFrom(this.landFrame.set(fx, skyRow0, fw, rt.height - skyRow0));
        lr.skyTex.update();
        lr.sky.position.set(xl, r.skyY + r.skyH); // 上下反転(scale.y<0)なので下端を置く=上端が継ぎ目
        lr.sky.width = xr - xl;
        lr.sky.height = r.skyH;
        lr.sky.scale.y = -Math.abs(lr.sky.scale.y);
        lr.sky.tint = tint;
      }
    }
    for (let i = 0; i < this.landRefls.length; i++) {
      const lr = this.landRefls[i];
      if (i >= used) { lr.band.visible = false; lr.sky.visible = false; }
    }
  }

  private landFrame = new Rectangle();
  private makeLandRefl(): LandRefl {
    const src = this.landRT!.source;
    const bandTex = new Texture({ source: src, frame: new Rectangle(0, 0, 1, 1), dynamic: true });
    const skyTex = new Texture({ source: src, frame: new Rectangle(0, 0, 1, 1), dynamic: true });
    const band = new Sprite(bandTex);
    const sky = new Sprite(skyTex);
    band.roundPixels = false;
    this.landWrap.addChild(band, sky);
    const lr = { band, sky, bandTex, skyTex };
    this.landRefls.push(lr);
    return lr;
  }

  /** 水面の形を焼いて型にする。焼く範囲=画面内の水たまりの水面を囲む矩形(world)。何も無ければ false。 */
  private bakeLandMask(): boolean {
    const gpu = this.gpu;
    if (!gpu) return false;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pv of this.views.values()) {
      if (pv.landMask.alpha <= 0.004) continue;
      const mr = this.maskRect(pv, this.mrTmp); // ?proj=1 は型のメッシュの箱(焼く絵も型のメッシュ)
      x0 = Math.min(x0, mr.x0); x1 = Math.max(x1, mr.x1);
      y0 = Math.min(y0, mr.y0); y1 = Math.max(y1, mr.y1);
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
    // ?proj=1: 映りの型(Sprite の alpha の型=メッシュにはできない)は水面の中心の投影に置き、大きさは s(点+s・水面のメッシュとは
    // 形の遠近の歪みぶんだけ違う=小さな水たまりで数px)。映る物・光の筋・光の線も同じ点+s の座標へ写す。
    const ps = pv.projS;
    const pj = ps !== undefined && this.projFrameNow;
    if (pj) {
      const k = ps! / (pv.d || 1);
      sl.mask.position.set(pv.projX!, pv.projY!);
      sl.mask.scale.set(pv.water.scale.x * k, pv.water.scale.y * k);
    }
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
      if (pj) { // ?proj=1: 足元の投影に置く(体は段階2で投影された所に描かれる)。大きさは s/d
        const q = projectInto(this.projFrameNow!, a.x, a.foot, this.projPt);
        const da = this.depthNow ? this.depthNow(a.foot) : 1;
        const kk = da > 0 ? q.s / da : 1;
        r.position.set(q.x, q.y);
        r.scale.set(r.scale.x * kk, r.scale.y * kk);
      }
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
      if (pj) this.projSlotFx(sl.streak, pv);
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
      if (pj) this.projSlotFx(sl.glint, pv);
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
      // ?proj=1: l は world の点=濃さは投影後のY(水たまりと同じ projFade)。?proj=0 は従来どおり。
      const ha = this.projFrameNow && h.projFade ? h.projFade(l.x, l.y) : h.horizonAlpha(l.y);
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
    const pf = this.projFrameNow;
    if (pf) {
      // ?proj=1(段階3・光=点): 濡れた地面の松明の照り=付け根(松明の足元の world の点)の相似。旧い depthScale は外して s_fx
      const q = projectInto(pf, l.x, l.y, this.projPt);
      const kk = projFxScale(q.s) / (d || 1);
      for (const sp of [m, g, b, ...st.dashes]) {
        if (!sp.visible) continue;
        sp.position.set(q.x + kk * (sp.position.x - l.x), q.y + kk * (sp.position.y - l.y));
        sp.scale.set(sp.scale.x * kk, sp.scale.y * kk);
      }
    }
  }

  // ---- 波紋 ----
  private spawnRipple(x: number, y: number, water: boolean, s: number, now: number, a = 1, pid: string | null = null, dense = false): void {
    // ?proj=1(段階3・G5・CR-7): 雨の輪は、奥ほど細かく密に=投影で詰まって減って見える分を補う(奥の s が小さいほど、近くにもう1つ出す確率を上げる)。
    // ?proj=0 では何もしない(乱数も引かない)
    const pf = this.projFrameNow;
    if (pf && dense) {
      const ss = projectInto(pf, x, y, this.projPt).s;
      if (Math.random() < Math.min(1, Math.max(0, 1 / Math.max(0.2, ss) - 1))) {
        const j = 10 + Math.random() * 14, ang = Math.random() * Math.PI * 2;
        this.spawnRipple(x + Math.cos(ang) * j, y + Math.sin(ang) * j * 0.5, water, s * 0.8, now - Math.random() * 120, a, pid, false);
      }
    }
    let r = this.ripples.find(q => !q.on);
    if (!r) {
      if (this.ripples.length >= Math.round(RIPPLE_MAX * this.projAmbK)) { // ?proj=1: 雨粒を増やした分だけ(上限2倍)
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
      const pf = this.projFrameNow;
      if (pf) {
        // ?proj=1(段階3・G5.ripple・★#30): 地面に落ちた波紋=地面に付いた物=寝かせる(付け根=波紋の地面の点・中心の s で一様に潰す・縦は横を超えない。
        // 旧い depthScale は外す)・濃さは投影後のY。
        // CR-7: 投影で薄まって見える分を補う=濃さは手前ほどはっきり(1.2..1.6 倍・1 まで)。大きさは s_fx(★#24=B の下限 0.6・南は s のまま=監査2巡目 C-2)
        const q = projFlatInto(pf, r.x, r.y, PFLAT);
        const ks = projFxScale(q.s);
        const sq = DEBRIS_ART_SCALE * ks * r.s * pose.scale;
        r.sp.position.set(q.x, q.y);
        r.sp.scale.set(sq, sq * q.r);
        const boost = 1.2 + 0.4 * Math.min(1, Math.max(0, (q.s - 0.6) / 0.65));
        r.sp.alpha = Math.min(1, pose.alpha * (r.water ? 0.6 : 0.45) * r.a * boost) * (h.projFade ? h.projFade(r.x, r.y) : q.a);
      }
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
    const pf = this.projFrameNow;
    if (pf && h.projFade) {
      // ?proj=1: 照りの1枚は投影しない(画面の矩形に敷く)ので、上端は「見えている地面の一番奥」を投影した y。
      // world の Y の horizonAlpha で探すと旧い地平線(画面の中ほど)で水平に切れる=奥の見えている地面に照りが無い。
      const a = this.projAmbNow ?? h.view;
      const cx = (v.left + v.right) * 0.5;
      const ws = Math.max(8, (a.bottom - a.top) / 48);
      let wy = a.top;
      while (wy < a.bottom && h.projFade(cx, wy) < 0.5) wy += ws;
      top = wy < a.bottom ? Math.max(v.top, projectInto(pf, cx, wy, this.projPt).y) : v.bottom;
    } else {
      while (top < v.bottom && h.horizonAlpha(top) < 0.5) top += step;
    }
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
  private syncRainLevel(now: number, scale = 1, start?: number): void {
    if (!this.rainSched) {
      this.rainSched = makeRainSchedule(Math.random() * 1000, now, start);
      this.levelAt = now;
    }
    this.rainLevel = advanceRainSchedule(this.rainSched, now) * scale;
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
      const pf = this.projFrameNow;
      if (pf) {
        // ?proj=1(段階3・G5): 葉から滴る雫=落ちる先の地面の点を投影し、高さは × s で持ち上げる。大きさは旧い ds を外して s_fx
        const q = projectInto(pf, d.spec.x, d.spec.y, this.projPt);
        const kf = projFxScale(q.s) * DRIP_SIZE_MUL;
        const qa = h.projFade ? h.projFade(d.spec.x, d.spec.y) : q.alpha;
        const yq = q.y - pose.h * q.s;
        d.sp.position.set(q.x, yq);
        d.sp.width = (pose.falling ? 1.5 : 1.2 + 1.3 * pose.swell) * kf;
        d.sp.height = (pose.falling ? 3 + 11 * pose.tail : 1.2 + 2 * pose.swell) * kf;
        d.sp.alpha = 0.95 * pose.alpha * qa;
        d.glow.position.set(q.x, yq - (pose.falling ? 2 : 1) * kf);
        const gq = (pose.falling ? 7 : 4 + 6 * pose.swell) * kf;
        d.glow.width = gq; d.glow.height = gq * (pose.falling ? 1.5 : 1);
        d.glow.alpha = 0.7 * pose.alpha * qa;
      }
    }
  }

  // ---- ポツポツ雨 ----
  private syncRain(h: WetHost): void {
    const now = h.now;
    const v0 = h.rainView ?? h.view;
    // ?proj=1(★#26=B): 着地点は見える world(台形の外接矩形)から選ぶ。降る量は旧い矩形の面積×比(上限2倍)=粒の上限も同じ倍率。
    const pf = this.projFrameNow, amb = pf ? this.projAmbNow : null, k = this.projAmbK;
    const v = amb ?? v0;
    const w = Math.max(0, v.right - v.left), hh = Math.max(0, v.bottom - v.top);
    const area = amb ? Math.max(0, v0.right - v0.left) * Math.max(0, v0.bottom - v0.top) * k : w * hh;
    const rainMax = amb ? Math.round(RAIN_MAX * k) : RAIN_MAX;
    // 遅れが1秒を超えたら追いかけない(タブ復帰・重いフレームで一度に降らせない)。
    if (now - this.nextRainAt > 1000) this.nextRainAt = now;
    let budget = amb ? Math.round(RAIN_SPAWN_PER_FRAME * k) : RAIN_SPAWN_PER_FRAME;
    while (now >= this.nextRainAt && budget-- > 0) {
      const spawn = !this.rainRecheck;
      const ev = rainNextEvent(rainNextGapMs(area * this.rainLevel, Math.random)); // 今の雨の強さぶん
      this.nextRainAt += ev.dt;
      this.rainRecheck = !ev.spawn;
      if (!spawn) continue; // 見直しだけの予定(止みかけ)
      let d = this.rain.find(q => !q.on);
      if (!d) {
        if (this.rain.length >= rainMax) break;
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
      if (amb && pf) {
        // ?proj=1: 外接矩形のうち画面に映らない所(台形の外)と地平線の向こうは引き直す(最大8回)。濃さは投影後のY(projFade)で測る。
        const fade = (px: number, py: number) => (h.projFade ? h.projFade(px, py) : projectInto(pf, px, py, this.projPt).alpha);
        let px = v.left + Math.random() * w, py = v.top + Math.random() * (hh + 60);
        for (let j = 0; j < 8 && (projShapeOutside(pf, px, py, 0, 40) || fade(px, py) <= 0.02); j++) {
          px = v.left + Math.random() * w; py = v.top + Math.random() * (hh + 60);
        }
        if (projShapeOutside(pf, px, py, 0, 40) || fade(px, py) <= 0.02) continue;
        d.at = now; d.x = px; d.y = py; d.spec = rainDropSpec(Math.random, rainGust(now)); d.on = true;
        continue;
      }
      const x = v.left + Math.random() * w;
      let y = v.top + Math.random() * (hh + 60);
      for (let k = 0; k < 4 && h.horizonAlpha(y) <= 0.02; k++) y = v.top + Math.random() * (hh + 60);
      if (h.horizonAlpha(y) <= 0.02) continue;
      d.at = now; d.x = x; d.y = y; d.spec = rainDropSpec(Math.random, rainGust(now)); d.on = true;
    }
    for (const d of this.rain) {
      if (!d.on) { d.sp.visible = false; continue; }
      const pose = rainPose(now - d.at, d.spec);
      const ds = h.depthScale(d.y);
      if (!pose) {
        d.on = false; d.sp.visible = false;
        const pv = puddleAt(this.scaledPuddles, d.x, d.y);
        this.spawnRipple(d.x, d.y, !!pv, (pv ? 0.46 + Math.random() * 0.18 : 0.32 + Math.random() * 0.12) * (d.spec.near ? 1.3 : 1), now, 1, null, true); // 着地の跳ね/波紋(2026-11-26 水を少し大きく・手前の大粒は大きく。旧 水0.42〜0.58/地面0.3〜0.4)
        continue;
      }
      const sl = d.spec.slant;
      d.sp.visible = true;
      // 斜めに落ちる: 高さ h の所では着地点より上流(左)へ h*slant ずれている。
      d.sp.position.set(d.x - pose.h * sl * ds, d.y - pose.h * ds);
      d.sp.rotation = -Math.atan(sl); // 尾が左上へ伸びる=右下へ流れる向き
      d.sp.width = RAIN_WIDTH * d.spec.wMul * ds;
      d.sp.height = pose.len * ds;
      d.sp.alpha = d.spec.alpha * pose.alpha * h.horizonAlpha(d.y);
      const pf = this.projFrameNow;
      if (pf) {
        // ?proj=1(段階3・G5): 落ちる雫=着地点(地面の点)を投影し、高さと斜めのずれを × s で持ち上げる。大きさは旧い ds を外して s_fx
        const q = projectInto(pf, d.x, d.y, this.projPt);
        const kf = projFxScale(q.s);
        d.sp.position.set(q.x - pose.h * sl * q.s, q.y - pose.h * q.s);
        d.sp.width = RAIN_WIDTH * d.spec.wMul * kf;
        d.sp.height = pose.len * kf;
        d.sp.alpha = d.spec.alpha * pose.alpha * (h.projFade ? h.projFade(d.x, d.y) : q.alpha);
      }
    }
  }

  // ---- 水たまりの雨の波紋(雨が強いほど水面が忙しく波立つ・止みかけでは立たない) ----
  private syncPuddleRain(h: WetHost): void {
    const now = h.now;
    const dt = Math.min(100, Math.max(0, now - this.puddleRippleAt));
    this.puddleRippleAt = now;
    if (dt <= 0) return;
    // ?proj=1(★#26=B): 見えている水たまりが北に広がる分、1フレームに立てる数の上限も面積の比(上限2倍)。
    let budget = this.projAmbNow ? Math.round(PUDDLE_RIPPLE_PER_FRAME * this.projAmbK) : PUDDLE_RIPPLE_PER_FRAME;
    const v = h.rainView ?? h.view;
    const pf = this.projAmbNow ? this.projFrameNow : null;
    // 同じ水たまりで今立っている雨の波紋の数(混むほど1つ1つを薄く=重なっても白く潰れず、輪が1つずつ読める)。
    const busy = this.rippleBusy;
    busy.clear();
    for (const r of this.ripples) if (r.on && r.pid) busy.set(r.pid, (busy.get(r.pid) ?? 0) + 1);
    for (const pv of this.views.values()) {
      if (budget <= 0) break;
      if (pv.alpha < 0.05) continue;
      const p = pv.p;
      // ?proj=1: 画面に映っているか=中心を投影して測る(旧い矩形で測ると奥の見えている水たまりに雨の輪が立たない)
      if (pf ? projShapeOutside(pf, p.x, p.y, 0, 0)
        : (p.x < v.left || p.x > v.right || p.y < v.top || p.y > v.bottom + 20)) continue;
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
        this.spawnRipple(p.x + Math.cos(ang) * rx * rr, p.y + Math.sin(ang) * ry * rr, true, 0.28 + Math.random() * 0.14, now, a, p.id, true);
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
    const mix = a.mix ?? 1;
    if (mix <= 0) { this.detachSky(); return; } // 抜け切った=空の色行列も外す(無変化の行列で1枚描かない)
    // 効き具合(mix<1 の時だけ=ステージ7の雨上がりの移り変わり)。mix=1 は従来の値そのもの。
    const l = (v: number) => (mix >= 1 ? v : 1 + (v - 1) * easeInOutSine(mix));
    const lt = (k: { r: number; g: number; b: number }) => (mix >= 1 ? k : { r: l(k.r), g: l(k.g), b: l(k.b) });
    // 霧は薄く・藍へ(灰色の平たい幕に見えない)。近景の森も同じ藍の夜へ。月の暈とグローは大きく明るく。
    for (const f of a.fog) this.paint(f, mulTint(Number(f.tint), lt(WET_FOG_TINT_MUL)), f.alpha * l(WET_FOG_ALPHA_MUL));
    for (const f of a.front) if (f) this.paint(f, mulTint(Number(f.tint), lt(WET_FRONT_TINT_MUL)), f.alpha);
    for (const m of a.moonGlow) this.paint(m, Number(m.tint), m.alpha * l(WET_MOON_GLOW_ALPHA_MUL), l(WET_MOON_GLOW_SCALE_MUL));
    for (const m of a.moonHalo) this.paint(m, Number(m.tint), m.alpha * l(WET_MOON_HALO_ALPHA_MUL), l(WET_MOON_HALO_SCALE_MUL));
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

  /**
   * 計器(?proj=1&projaudit=1・段階4の素材の漏れ)用: 水たまりの地面に寝た Sprite(縁・水面・空の映り・風景の映りの型・月明りの縁)を順に渡す。
   * ?proj=1 ではメッシュに替えて隠しているはずの物=見えたままなら漏れ。描画は変えない(読むだけ)。
   */
  /**
   * ?proj=1 の計器(段階3・s3 fx の層を歩く数え方・監査 A-7): このフレームに投影した入れ物('fx'=破片・波紋・松明の照り・雫・雨粒は
   * 描く所で投影済み)と、段階1・4の担当の物('stage4'=水たまりの映りと体の映り=格子メッシュの型で切り抜く・'stage1'=地面いっぱいの照りの
   * 貼り絵=地面の帯の担当)を知らせる。?proj=0(projFrameNow=null)では何も知らせない。
   */
  projStage3Each(cb: (o: Container, how: 'fx' | 'stage4' | 'stage1') => void): void {
    if (!this.projFrameNow || !this.visible) return;
    cb(this.debrisLayer, 'fx'); cb(this.rippleLayer, 'fx'); cb(this.streakLayer, 'fx'); cb(this.rainLayer, 'fx');
    for (const st of this.streaks) { cb(st.back, 'fx'); cb(st.gloss, 'fx'); }
    cb(this.landLayer, 'stage4'); cb(this.slotLayer, 'stage4');
    if (this.gloss) cb(this.gloss, 'stage1');
  }

  projAuditSprites(cb: (sp: Sprite) => void): void {
    for (const pv of this.views.values()) {
      cb(pv.ground); cb(pv.water); cb(pv.sky); cb(pv.landMask);
      if (pv.groundMoon) cb(pv.groundMoon);
    }
  }

  destroy(): void {
    this.restoreAtmosphere();
    this.detachSky();
    this.landLayer.mask = null;
    this.landCopies = [];
    this.root.destroy({ children: true });
    for (const lr of this.landRefls) { lr.bandTex.destroy(false); lr.skyTex.destroy(false); } // 焼きの切り出し(焼き本体は下で返す)
    this.landRefls = [];
    this.landMaskBox.destroy({ children: true });
    if (this.landMaskRT) { this.gpu?.release(this.landMaskRT); this.landMaskRT = null; }
    this.landScene.destroy({ children: true });
    if (this.landRT) { this.gpu?.release(this.landRT); this.landRT = null; }
    if (!this.rainLayer.destroyed) this.rainLayer.destroy({ children: true });
    this.rain = [];
    this.views.clear();
    for (const k of Object.keys(this.projMeshPool) as (ProjPuddleMeshRole)[]) this.projMeshPool[k] = []; // 層の子として上で壊れている
    this.gradeFilter.destroy();
    this.skyFilter.destroy();
  }
}
