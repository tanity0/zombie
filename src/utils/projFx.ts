// 投影の段階3「点で出る演出」の純関数(PixiJS を読まない・描画の写像だけ)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-7(3-7b 台帳・3-7c 置き方・3-7d 弾・3-7e 数字・3-7g 派手さの下限・3-7h 漂う粒・3-7l 作る物1)。
//
// 芯: 演出は、その演出の world の点(付け根)を投影して置き、付け根を支点にした相似で大きさを k 倍にする(段階2の後掛けと同じ形・d=1)。
// 長さと向きを持つ演出は2点(付け根と先)を投影して向きと長さを決める。飛び方そのもの(粒の速度・重力・漂い)は world で今のまま。
//
// `?proj=1` の時だけ pixiScene が使う。既定 `?proj=0` では1ビットも使われない。ゲームの判定(当たり・時刻・威力)には一切関与しない。

import {
  projectInto, makeProjPoint, projLocalYOfWorld, projScreenRowsL, visibleWorldBands, type ProjFrame, type ProjPoint,
} from './perspectiveProjection';
import { projLiftInto } from './projShape';
import type { VisualEffect } from '../types/game';

// ---------------------------------------------------------------------------------------------
// 倍率(★#24 派手さの下限・★#28 弾の大きさ・★#25 数字の大きさ)
// ---------------------------------------------------------------------------------------------

/** ★#24「派手さの絵の奥の下限」=B(社長裁定 2026-11-23): 派手さの絵は奥で s 0.6 までで縮むのを止める(叩き台 0.6)。濃さは落とさない。 */
export const PROJ_FX_MIN_S = 0.6;
/** ★#24 の案(A=s のまま/B=下限 0.6/C=今の大きさ)。ここ1か所で切り替わる。 */
export const PROJ_FX_SIZE_MODE: 'A' | 'B' | 'C' = 'B';

/** 派手さの倍率 s_fx(★#24)。濃さの掛け率は持たない(下限に当たっても濃さは落とさない)。 */
export const projFxScale = (s: number, mode: 'A' | 'B' | 'C' = PROJ_FX_SIZE_MODE): number =>
  mode === 'A' ? Math.max(0, s) : mode === 'B' ? Math.max(Math.max(0, s), PROJ_FX_MIN_S) : 1;

/** 閃光の輪(★#27=B): 中心を投影し、world の半径を s_fx/s 倍してから地面に寝かせる。この倍率(判定と一致する輪は 1)。 */
export const projFxRingRadiusMul = (s: number, mode: 'A' | 'B' | 'C' = PROJ_FX_SIZE_MODE): number =>
  projFxScale(s, mode) / Math.max(1e-6, s);

/** ★#28「弾の見た目の大きさ」=B(社長裁定 2026-11-23): 画面の直径の下限(ズーム1の画面px=表示座標の値・叩き台 6px)。 */
export const PROJ_BULLET_MIN_PX = 6;
/** ★#28 の案(A=s/B=s+直径の下限/C=今の大きさ)。 */
export const PROJ_BULLET_SIZE_MODE: 'A' | 'B' | 'C' = 'B';

/**
 * 弾の絵に掛ける倍率 s_b(★#28): 横の直径=判定の直径 worldDiam × s。B は表示座標の直径が下限(PROJ_BULLET_MIN_PX)を下回らない
 * (もとの直径が下限より小さい弾は、もとの直径まで=投影で今より大きくしない)。ズームは割らない(worldGroup が後から掛ける=3-7d)。
 * 濃さは返さない(弾は薄くしない)。
 */
export const projBulletScale = (s: number, worldDiam: number, mode: 'A' | 'B' | 'C' = PROJ_BULLET_SIZE_MODE): number => {
  const ss = Math.max(0, s);
  if (mode === 'A') return ss;
  if (mode === 'C') return 1;
  const d = Math.max(1e-6, worldDiam);
  return Math.max(ss, Math.min(PROJ_BULLET_MIN_PX, d) / d);
};

/** ★#25「ダメージ数字の大きさ」=A(社長裁定 2026-11-23): 今の大きさのまま(投影の s を掛けない)。 */
export const PROJ_NUMBER_SIZE_MODE: 'A' | 'B' = 'A';
/** 3-7e の (ii): 数字(と体の高さで出る演出)を持ち上げる一定の高さ H0(叩き台 28=主人公の当たり判定の高さ)。 */
export const PROJ_NUMBER_LIFT_H0 = 28;

/** 段階3の線の下限(ズーム後の画面px)。下限に当たっても濃さは落とさない(★#23 の「薄くする」は段階4の予告の線だけ)。 */
export const PROJ_FX_LINE_MIN_PX = 1;

/**
 * 段階3の線の規則(3-7c): 太さ = 今の太さ × k。画面(ズーム後)で 1px を下回らない(今の太さが既に 1px 未満なら今の太さまで=今より太くしない)。
 * 濃さは返さない(落とさない)。wgScale=worldGroup のズーム。
 */
export const projLineWidth = (base: number, k: number, wgScale: number): number => {
  const b = Math.max(0, base);
  const z = wgScale > 0 ? wgScale : 1;
  return Math.max(b * Math.max(0, k), Math.min(b, PROJ_FX_LINE_MIN_PX / z));
};

// ---------------------------------------------------------------------------------------------
// 台帳(3-7b)
// ---------------------------------------------------------------------------------------------

/** 型の名札(点/点o/向/両/読/体/形/済/外)。 */
export type ProjFxType = 'point' | 'origin' | 'dir' | 'seg' | 'hud' | 'body' | 'shape' | 'done' | 'exempt';
/** 倍率の出し方。's'=判定に揃える(下限なし)・'fx'=s_fx・'fxRing'=閃光の輪・'bullet'=s_b・'hud'=1・'body'=持ち主の s/d・'none'=投影の形そのもの。 */
export type ProjFxKMode = 's' | 'fx' | 'fxRing' | 'bullet' | 'hud' | 'body' | 'none';

export interface ProjFxRow { type: ProjFxType; k: ProjFxKMode; what: string }

/**
 * 段階3の台帳(鍵=台帳の行 ID・行を分けた所は枝を付ける)。research/PERSPECTIVE_PROJECTION.md §3-7b の表を写した物。
 * 1行に2つの型がある行は枝に分けた('A14.drop'/'A14.stain' 等)。
 */
export const PROJ_FX_ROWS = {
  // A. エフェクト20種(syncEffects)
  'A1': { type: 'hud', k: 'hud', what: 'damageNumber' },
  'A2': { type: 'point', k: 'fx', what: 'meleeHit' },
  'A3': { type: 'point', k: 'fx', what: 'skillBurst' },
  'A4': { type: 'origin', k: 'fx', what: 'image' },
  'A4.follow': { type: 'body', k: 'body', what: 'image(followPlayer)' },
  'A4.ground': { type: 'shape', k: 'none', what: 'image(ground)' },
  'A5': { type: 'point', k: 'fx', what: 'dogFetch' },
  'A6': { type: 'origin', k: 'fx', what: 'smoke' },
  'A7': { type: 'point', k: 'fx', what: 'glow(small)' },
  'A8': { type: 'point', k: 'fx', what: 'glow(strong)' },
  'A9': { type: 'dir', k: 'fx', what: 'whipsnare' },
  'A10': { type: 'seg', k: 's', what: 'whip' },
  'A11': { type: 'seg', k: 'fx', what: 'whiprope' },
  'A12': { type: 'dir', k: 'fx', what: 'firejet' },
  'A13': { type: 'dir', k: 'fx', what: 'blood' },
  'A14.drop': { type: 'origin', k: 'fx', what: 'bloodBurst(drops)' },
  'A14.stain': { type: 'point', k: 'fx', what: 'bloodBurst(stain)' },
  'A15': { type: 'dir', k: 'fx', what: 'slash' },
  'A15.path': { type: 'seg', k: 's', what: 'slash(katanaPath)' },
  'A16': { type: 'origin', k: 'fx', what: 'particle' },
  'A17': { type: 'shape', k: 'fxRing', what: 'ring' },
  'A17.judge': { type: 'shape', k: 'none', what: 'ring(judge)' },
  'A18': { type: 'point', k: 'fx', what: 'explosion' },
  'A19': { type: 'seg', k: 'fx', what: 'trail' },
  'A20': { type: 'seg', k: 'fx', what: 'drain' },
  'A21': { type: 'hud', k: 'hud', what: 'multiHit' },
  'A22': { type: 'exempt', k: 'none', what: 'flash' },
  // B. 弾・飛ぶ物
  'B1.round': { type: 'point', k: 'bullet', what: 'drawProjectile(round)' },
  'B1.long': { type: 'dir', k: 'bullet', what: 'drawProjectile(long)' },
  'B2': { type: 'point', k: 'bullet', what: 'drawPlantSeed' },
  'B3': { type: 'point', k: 'fx', what: 'boltFx' },
  'B4': { type: 'dir', k: 'bullet', what: 'syncIceLanceBolts' },
  'B5': { type: 'dir', k: 'bullet', what: 'syncThrownBags' },
  'B6': { type: 'dir', k: 'bullet', what: 'syncFireKnives' },
  'B7': { type: 'dir', k: 'bullet', what: 'syncSkateboards' },
  'B8': { type: 'point', k: 'bullet', what: 'syncDroneBoomerangs' },
  'B9': { type: 'done', k: 'none', what: 'syncDecoys' },
  'B10': { type: 'point', k: 'fx', what: 'NewGunsFx' },
  'B10.fan': { type: 'shape', k: 'none', what: 'NewGunsFx(scanFan)' },
  'B11': { type: 'seg', k: 's', what: 'PileDriverFx(pile)' },
  'B11.fx': { type: 'origin', k: 'fx', what: 'PileDriverFx(steam/spark)' },
  'B12': { type: 'dir', k: 's', what: 'drawBrawlerKiko' },
  'B13': { type: 'seg', k: 's', what: 'syncEyeLaser' },
  'B14': { type: 'exempt', k: 'none', what: 'astroThrows/skyFx(stage5)' },
  // C. 体に付いて動く演出
  'C1': { type: 'body', k: 'body', what: 'slash/breathRope/airStreaks' },
  'C2': { type: 'body', k: 'body', what: 'thorCharge' },
  'C3': { type: 'body', k: 'body', what: 'skelClaw' },
  'C4': { type: 'body', k: 'body', what: 'playerBurn' },
  'C5': { type: 'dir', k: 'fx', what: 'flamerStreaks' },
  'C6.wire': { type: 'seg', k: 'fx', what: 'playerFx(wire)' },
  'C6.ring': { type: 'shape', k: 'none', what: 'playerFx(rings TI:I12-I15)' },
  'C6.reload': { type: 'hud', k: 'hud', what: 'playerFx(reload)' },
  'C7': { type: 'point', k: 'fx', what: 'bountyWhipSmear' },
  'C8': { type: 'point', k: 'fx', what: 'coffin/bat slam' },
  'C9': { type: 'origin', k: 'fx', what: 'maiko petals' },
  'C10.slash': { type: 'point', k: 'fx', what: 'killFxSlash' },
  'C10.text': { type: 'hud', k: 'hud', what: 'killFxText' },
  'C10.blood': { type: 'origin', k: 'fx', what: 'kamitsuki/killFxBlood' },
  'C11.strike': { type: 'seg', k: 'fx', what: 'satsujin(strikes)' },
  'C11.shadow': { type: 'body', k: 'body', what: 'satsujin(shadow)' },
  'C11.curtain': { type: 'exempt', k: 'none', what: 'satsujin(curtain)' },
  'C12': { type: 'done', k: 'none', what: 'stage2 attachedArt' },
  'C13': { type: 'body', k: 'body', what: 'katanaSlash/Ready' },
  'C14': { type: 'dir', k: 'fx', what: 'thrustWind' },
  'C15': { type: 'origin', k: 'fx', what: 'alchemyRockShatter' },
  'C16': { type: 'body', k: 'body', what: 'muzzleFlash(player)' },
  'C17': { type: 'body', k: 'body', what: 'escortMelee' },
  'C18': { type: 'shape', k: 'none', what: 'guardian ring' },
  // D. 敵に直に描いている飾り・段階4の projKeep
  'D1': { type: 'body', k: 'body', what: 'mimirWheel' },
  'D2': { type: 'body', k: 'body', what: 'jormungandr breath' },
  'D3': { type: 'body', k: 'body', what: 'muzzle(tele)' },
  'D4': { type: 'seg', k: 'fx', what: 'dust streak' },
  'D5': { type: 'seg', k: 'fx', what: 'skadi blade/frost' },
  'D6': { type: 'shape', k: 'fxRing', what: 'jump ring' },
  'D7': { type: 'body', k: 'body', what: 'phantom flamer ember' },
  'D8': { type: 'body', k: 'body', what: 'thin polygons' },
  'D9': { type: 'point', k: 'fx', what: 'bossFire glow' },
  'D10': { type: 'point', k: 'fx', what: 'arrow rain soil' },
  'D11': { type: 'point', k: 'fx', what: 'fallback art' },
  // E. 地面の粉・粒
  'E1': { type: 'point', k: 'fx', what: 'drawDust' },
  'E2': { type: 'point', k: 'fx', what: 'drawRunDust' },
  // F. 光
  'F1': { type: 'point', k: 'fx', what: 'strong glow art' },
  'F2': { type: 'point', k: 'fx', what: 'small glow art' },
  'F3': { type: 'shape', k: 'none', what: 'localEventShade' },
  'F4': { type: 'exempt', k: 'none', what: 'old silhouette shadow' },
  'F5': { type: 'exempt', k: 'none', what: 'light math' },
  'F6': { type: 'done', k: 'none', what: 'torch/dof/rim/pool' },
  'F7': { type: 'exempt', k: 'none', what: 'lab lights' },
  // G. 漂う粒
  'G1': { type: 'point', k: 'fx', what: 'syncFireflies' },
  'G2': { type: 'point', k: 'fx', what: 'syncWorldEmbers' },
  'G3': { type: 'point', k: 'fx', what: 'syncMoonDust' },
  'G4': { type: 'point', k: 'fx', what: 'endingAmbient' },
  'G5': { type: 'point', k: 'fx', what: 'WeatherWetLayer' },
  'G6': { type: 'done', k: 'none', what: 'BurningWreckLayer' },
  'G7': { type: 'exempt', k: 'none', what: 'stage7 weather' },
} as const satisfies Record<string, ProjFxRow>;

export type ProjFxRowId = keyof typeof PROJ_FX_ROWS;

/** 番人テスト①: VisualEffect の kind → 台帳の行 ID(flash は外)。kind を足したら必ずここへ載せる。 */
export const PROJ_FX_KINDS = {
  damageNumber: 'A1', meleeHit: 'A2', skillBurst: 'A3', image: 'A4', dogFetch: 'A5', smoke: 'A6', glow: 'A7',
  whipsnare: 'A9', whip: 'A10', whiprope: 'A11', firejet: 'A12', blood: 'A13', bloodBurst: 'A14.drop', slash: 'A15',
  particle: 'A16', ring: 'A17', explosion: 'A18', trail: 'A19', drain: 'A20', multiHit: 'A21', flash: 'A22',
} as const satisfies Record<VisualEffect['kind'], ProjFxRowId>;

/** 'k' の値('s'・'fx'・'hud' だけ。ほかは呼ぶ所で出す=3-7l)。 */
export const projFxK = (k: 's' | 'fx' | 'hud', s: number): number =>
  k === 's' ? Math.max(0, s) : k === 'fx' ? projFxScale(s) : 1;

// ---------------------------------------------------------------------------------------------
// 置き方(3-7c・3-7e)
// ---------------------------------------------------------------------------------------------

const PA = makeProjPoint();
const PB = makeProjPoint();

export interface ProjDirOut {
  /** 付け根の表示座標。 */
  x: number; y: number;
  /** 投影した向き(rad)。 */
  rot: number;
  /** 長さの倍率(=(投影した長さ/ε) × (k/s))。 */
  len: number;
  /** 幅の倍率(=k)。 */
  wid: number;
  /** 付け根の s。 */
  s: number;
  /** 付け根の定義域と描く距離のフェード。 */
  a: number;
}
export const makeProjDirOut = (): ProjDirOut => ({ x: 0, y: 0, rot: 0, len: 1, wid: 1, s: 1, a: 1 });

/**
 * 向(3-7c): 付け根 F=(wx, wy) と、向き (ax, ay) の先の点 F+ε·単位ベクトル を投影し、回転・長さの倍率・幅の倍率を返す。
 * k=振り分けの表の値(実数)。長さ/幅の比は k に依らず投影の比のまま(北で太く短く崩れない)。
 */
export const projDirInto = (
  f: ProjFrame, wx: number, wy: number, ax: number, ay: number, eps: number, k: number, out: ProjDirOut,
): ProjDirOut => {
  const n = Math.hypot(ax, ay);
  const ux = n > 1e-12 ? ax / n : 1, uy = n > 1e-12 ? ay / n : 0;
  const e = Math.max(1e-6, eps);
  const p = projectInto(f, wx, wy, PA);
  const q = projectInto(f, wx + ux * e, wy + uy * e, PB);
  const dx = q.x - p.x, dy = q.y - p.y;
  const s = Math.max(1e-6, p.s);
  out.x = p.x; out.y = p.y; out.s = p.s; out.a = p.alpha;
  out.rot = Math.atan2(dy, dx);
  out.len = (Math.hypot(dx, dy) / e) * (k / s);
  out.wid = k;
  return out;
};

/** 床を持つ粒(3-7b の付け根の高さ): 床の点 (x, floorY) を投影し、床からの高さ floorY − y を projLiftInto で持ち上げる(高さ × s)。 */
export const projFloorAnchorInto = (
  f: ProjFrame, x: number, y: number, floorY: number, out: { x: number; y: number; s: number },
): { x: number; y: number; s: number } => projLiftInto(f, x, floorY, floorY - y, out);

/** 3-7e の (ii): 地面の点 G=(wx, wy + h0) を投影し、そこから上へ h0 × s(体の高さで出る演出の H0 方式にも使う)。 */
export const projNumberAnchorInto = (
  f: ProjFrame, wx: number, wy: number, h0: number, out: { x: number; y: number; s: number },
): { x: number; y: number; s: number } => projLiftInto(f, wx, wy + h0, h0, out);

// ---------------------------------------------------------------------------------------------
// 漂う粒(3-7h・★#26=B)
// ---------------------------------------------------------------------------------------------

export interface ProjRegion { left: number; top: number; right: number; bottom: number }
const BANDS: ProjRegion[] = [];

/**
 * 漂う粒の取り直す範囲(★#26=B): 画面に映る行の見える world(visibleWorldBands)の外接矩形+marginWorld。
 * 北は地平線と描く距離の上限で切る。out に書いて返す。
 */
export const projAmbientRegion = (f: ProjFrame, marginWorld: number, out: ProjRegion, bands = 8): ProjRegion => {
  const rows = projScreenRowsL(f);
  let lTop = Math.max(0, rows.top);
  if (f.farEnd > 0) lTop = Math.max(lTop, projLocalYOfWorld(f, f.farRefY - f.farEnd));
  const lBot = Math.max(lTop + 1e-3, rows.bottom);
  const n = visibleWorldBands(f, lTop, lBot, bands, 0, BANDS);
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (let i = 0; i < n; i++) {
    const q = BANDS[i];
    if (q.left < l) l = q.left;
    if (q.right > r) r = q.right;
    if (q.top < t) t = q.top;
    if (q.bottom > b) b = q.bottom;
  }
  const m = Math.max(0, marginWorld);
  out.left = l - m; out.right = r + m; out.top = t - m; out.bottom = b + m;
  return out;
};

/** 漂う粒の数(★#26=B): 面積の比で増やす(減らさない)・上限 cap 倍(叩き台 2)。 */
export const PROJ_AMBIENT_CAP = 2;
export const projAmbientCount = (base: number, areaRatio: number, cap: number = PROJ_AMBIENT_CAP): number => {
  const r = Number.isFinite(areaRatio) ? areaRatio : 1;
  return Math.round(Math.max(0, base) * Math.min(Math.max(1, cap), Math.max(1, r)));
};

/** 小物: 点の投影(作り置きを返す・次の呼び出しで上書き)。 */
export const projFxPoint = (f: ProjFrame, wx: number, wy: number): ProjPoint => projectInto(f, wx, wy, PA);
