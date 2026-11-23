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

/*
 * 手前(南)の天井は全体には掛けない(監査2巡目 A-1: 全体の天井 1.25 は ★#24=B の式「s_fx = max(s, 0.6)・南は s のまま」を変え、
 * 閃光の輪が判定と一致する輪の内側に入り、当たった所の派手さの絵が南で判定や敵より小さくなった)。
 * 天井は、膨らむとボケて安く見える個別の絵(硬い縁の光の円盤など・CR-1)だけに、呼ぶ所で掛ける。
 */
/** 硬い縁の光の円盤(口の冷気の円盤など・CR-1)の手前の天井(叩き台 1.1)。呼ぶ所で体の相似の倍率をこの値で頭打ちにする。 */
export const PROJ_FX_DISC_MAX_S = 1.1;
/** 層を重ねた柔らかい光の円盤(凍てつく牙の口の光・CR-1)の手前の天井(叩き台 1.25)。個別の絵の天井(全体には掛けない)。 */
export const PROJ_FX_SOFT_DISC_MAX_S = 1.25;

/**
 * 細長い絵の先(鞭の縄・火炎の噴き)の太さと先の炎の大きさの奥の下限(クリエイティブ監査1巡目 CR-14「奥で小さな火花に」・叩き台 0.9)。
 * 長さは投影のまま(=s)・太さと大きさだけこの値まで。
 */
export const PROJ_FX_TIP_MIN_S = 0.9;

/** 派手さの倍率 s_fx(★#24=B: max(s, 0.6)・南は s のまま=天井なし)。濃さの掛け率は持たない(下限に当たっても濃さは落とさない)。 */
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
/**
 * 倍率の出し方。's'=判定に揃える(下限なし)・'fx'=s_fx・'fxRing'=閃光の輪・'fxFlat'=地面に付いた派手さの絵(★#30・中心の s_fx で一様に寝かせる
 * =projFlatInto)・'bullet'=s_b・'hud'=1・'body'=持ち主の s/d・'none'=投影の形そのもの。
 */
export type ProjFxKMode = 's' | 'fx' | 'fxRing' | 'fxFlat' | 'bullet' | 'hud' | 'body' | 'none';

export interface ProjFxRow { type: ProjFxType; k: ProjFxKMode; what: string }

/**
 * 段階3の台帳(鍵=台帳の行 ID・行を分けた所は枝を付ける)。research/PERSPECTIVE_PROJECTION.md §3-7b の表を写した物。
 * 1行に2つの型がある行は枝に分けた('A14.drop'/'A14.stain' 等)。
 * ★#30「地面に付いた物の型」(社長裁定 2026-11-23): 地面に接する物は全部「形」(寝かせる)。判定を持たない物は 'fxFlat'(中心の s_fx で一様に潰す・
 * 縦は横を超えない・★#24 の下限 0.6・南は s のまま)。宙にある物(火の粉・血しぶき・破片の飛んでいる間)は点のまま。
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
  'A14.stain': { type: 'shape', k: 'fxFlat', what: 'bloodBurst(pool/stain)' },
  'A15': { type: 'dir', k: 'fx', what: 'slash' },
  'A15.path': { type: 'seg', k: 's', what: 'slash(katanaPath)' },
  'A16': { type: 'origin', k: 'fx', what: 'particle' },
  'A16.floor': { type: 'shape', k: 'fxFlat', what: 'particle(on the floor: shell/settled drop)' },
  'A17': { type: 'shape', k: 'fxRing', what: 'ring' },
  'A17.judge': { type: 'shape', k: 'none', what: 'ring(judge)' },
  'A18': { type: 'point', k: 's', what: 'explosion' }, // 判定に揃える絵(幅=判定の直径×1.1)=k は s(監査2巡目 A-2)・絵の下辺=爆心(v0.25.3285)
  'A19': { type: 'seg', k: 'fx', what: 'trail' },
  'A20': { type: 'seg', k: 'fx', what: 'drain' },
  'A21': { type: 'hud', k: 'hud', what: 'multiHit' },
  'A22': { type: 'exempt', k: 'none', what: 'flash' },
  // B. 弾・飛ぶ物
  'B1.round': { type: 'point', k: 'bullet', what: 'drawProjectile(round)' },
  'B1.long': { type: 'dir', k: 'bullet', what: 'drawProjectile(long)' },
  // 盾=判定を持つ壁(長手=ローカルの y・k は判定に揃える s=監査2巡目 A-5)。今の盾は syncShields の立つ絵(段階2)で、drawProjectile は通らない
  'B1.wall': { type: 'dir', k: 's', what: 'drawProjectile(shield wall)' },
  'B2': { type: 'point', k: 'bullet', what: 'drawPlantSeed' },
  'B3': { type: 'point', k: 'fx', what: 'boltFx' },
  'B4': { type: 'dir', k: 'bullet', what: 'syncIceLanceBolts' },
  'B5': { type: 'dir', k: 'bullet', what: 'syncThrownBags' },
  'B6': { type: 'dir', k: 'bullet', what: 'syncFireKnives' },
  'B7': { type: 'dir', k: 'bullet', what: 'syncSkateboards' },
  'B8': { type: 'point', k: 'bullet', what: 'syncDroneBoomerangs' },
  'B9': { type: 'done', k: 'none', what: 'syncDecoys' },
  'B10.bullet': { type: 'point', k: 'bullet', what: 'NewGunsFx(satellite orb/released shot/blob shot)' },
  'B10.fx': { type: 'point', k: 'fx', what: 'NewGunsFx(steam/sparks/fire smoke/release lines/marks)' },
  'B10.ground': { type: 'shape', k: 'fxFlat', what: 'NewGunsFx(scorch/blob shadow/drag dust/stop dust)' },
  'B10.fan': { type: 'shape', k: 'none', what: 'NewGunsFx(scanFan)' },
  'B11': { type: 'seg', k: 's', what: 'PileDriverFx(pile)' },
  // 蒸気の噴き・蒸気の粒=主人公の体の相似(筒から出て近くを漂う=付け根≒主人公の足元・実装に合わせた・監査 C-3)。火花・閃光=刺さった所の点
  'B11.steam': { type: 'body', k: 'body', what: 'PileDriverFx(jets/steam puffs)' },
  'B11.impact': { type: 'point', k: 'fx', what: 'PileDriverFx(impact sparks/flash)' },
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
  'C10.puff': { type: 'shape', k: 'fxFlat', what: 'killFx return landing dust puff (on the ground)' }, // 監査2巡目 A-6
  // 白い筋は赤い幕と同じ画面の絵(大きさ・向きは今のまま)・X の交点だけ相手の体の中心の写りへ平行移動(CR-8)
  'C11.strike': { type: 'hud', k: 'hud', what: 'satsujin(strikes)' },
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
  // 監査2巡目 A-6(★#30・★#27=B): 地面に接するヨルムンガンドの演出=寝かせる。宙の光弾・息の塊・殻は点のまま
  'D2.land': { type: 'shape', k: 'fxFlat', what: 'jormungandr rain landing disc/ring (on the ground)' },
  'D2.frost': { type: 'shape', k: 'fxFlat', what: 'jormungandr freeze frost flower / crushed crystals (on the ground)' },
  'D3': { type: 'body', k: 'body', what: 'muzzle(tele)' },
  'D4': { type: 'seg', k: 'fx', what: 'dust streak' },
  'D5': { type: 'seg', k: 'fx', what: 'skadi blade/frost' },
  'D6': { type: 'shape', k: 'fxRing', what: 'jump ring' },
  'D7': { type: 'body', k: 'body', what: 'phantom flamer ember' },
  'D8': { type: 'body', k: 'body', what: 'thin polygons' },
  'D9': { type: 'point', k: 'fx', what: 'bossFire flames' },
  'D9.ground': { type: 'shape', k: 'fxFlat', what: 'bossFire outer glow (on the ground)' },
  'D10': { type: 'shape', k: 'fxFlat', what: 'arrow rain soil' },
  'D11': { type: 'point', k: 'fx', what: 'fallback art' },
  // E. 地面の粉・粒
  'E1': { type: 'shape', k: 'fxFlat', what: 'drawDust' },
  'E2': { type: 'shape', k: 'fxFlat', what: 'drawRunDust' },
  // F. 光
  'F1': { type: 'point', k: 'fx', what: 'strong glow art' },
  'F2': { type: 'point', k: 'fx', what: 'small glow art' },
  // 監査2巡目 A-6: 地面に落ちる光=寝かせる
  'F2.foot': { type: 'shape', k: 'fxFlat', what: 'player foot assist light (on the ground)' },
  'F2.refl': { type: 'shape', k: 'fxFlat', what: 'ground reflection of a light (groundReflSprite)' },
  'F3': { type: 'shape', k: 'none', what: 'localEventShade' },
  'F4': { type: 'exempt', k: 'none', what: 'old silhouette shadow' },
  'F5': { type: 'exempt', k: 'none', what: 'light math' },
  'F6': { type: 'done', k: 'none', what: 'torch/dof/rim/pool' },
  'F7': { type: 'exempt', k: 'none', what: 'lab lights' },
  // G. 漂う粒
  // G1(監査2巡目 C-2): ステージ1の蛍(world の漂う粒)=点・大きさは s(下限なし)。★#24 の下限の例外=漂う粒は判定を持たない背景で ★#26 の対象
  // (CR-6 で下限を外した=奥で素直に小さく)。雪の中の層は ★#31 で画面座標の3層=外(G1.snow)
  'G1': { type: 'point', k: 's', what: 'syncFireflies(stage1 fireflies: drifting motes, no floor)' },
  'G1.snow': { type: 'exempt', k: 'none', what: 'syncFireflies(snow: screen-space 3 layers ★#31)' },
  'G2': { type: 'point', k: 'fx', what: 'syncWorldEmbers' },
  'G3': { type: 'point', k: 'fx', what: 'syncMoonDust' },
  'G4': { type: 'point', k: 'fx', what: 'endingAmbient' },
  'G5': { type: 'point', k: 'fx', what: 'WeatherWetLayer(drops/splashes/torch sheen)' },
  'G5.ripple': { type: 'shape', k: 'fxFlat', what: 'WeatherWetLayer(ripples on the ground)' },
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
  if (n === 0 || !Number.isFinite(l) || !Number.isFinite(t) || !Number.isFinite(r) || !Number.isFinite(b)) {
    // 帯が1本も無い(地面が画面に映っていない等)=±Infinity をそのまま返すと面積が NaN になる(監査 B-4)。
    // 中心の列の基準点の1点(広さ0)+余白に縮める(呼ぶ側の面積の比は 0=増やさない・取り直しは余白の中)。
    const cx = Number.isFinite(f.cxw) ? f.cxw : 0, cy = Number.isFinite(f.farRefY) ? f.farRefY : 0;
    out.left = cx - m; out.right = cx + m; out.top = cy - m; out.bottom = cy + m;
    return out;
  }
  out.left = l - m; out.right = r + m; out.top = t - m; out.bottom = b + m;
  return out;
};

/** 漂う粒の数(★#26=B): 面積の比で増やす(減らさない)・上限 cap 倍(叩き台 2)。 */
export const PROJ_AMBIENT_CAP = 2;
export const projAmbientCount = (base: number, areaRatio: number, cap: number = PROJ_AMBIENT_CAP): number => {
  const r = Number.isFinite(areaRatio) ? areaRatio : 1;
  return Math.round(Math.max(0, base) * Math.min(Math.max(1, cap), Math.max(1, r)));
};

/**
 * 弾の形の振り分け(3-7d の軸の表=弾の種類で決める・監査 A-4。描いた回転の有無では決めない)。
 * 'round'=丸い弾(点・縦横同じ倍率)・'x'=長手の弾でローカルの x が長手(矢・曳光)・'y'=ローカルの y が長手(ロケットの素材・盾の壁)。
 * 表(監査2巡目 A-5):
 * - 'y': ロケットの素材・盾 'shield'(判定を持つ壁。長さ=ローカルの y・厚み=ローカルの x。南北に立てても長さは判定の投影のまま)
 * - 'x': 拳銃・小銃の曳光・矢の素材
 * - 'round': 赤い二重丸・散弾・phill-bullet・反射のハロー・追尾弾・手榴弾・罠 'trap'(丸い装置+範囲の円は別に判定の円で投影)・
 *   デコイ 'decoy'・タレット 'turret'(この2つは別の関数で描く=ここを通らない。通っても丸い装置=点)
 */
export const projBulletForm = (o: { weaponType: string; rocketArt: boolean; arrowArt: boolean }): 'round' | 'x' | 'y' =>
  o.rocketArt || o.weaponType === 'shield' ? 'y' : o.arrowArt ? 'x' : (o.weaponType === 'handgun' || o.weaponType === 'rifle') ? 'x' : 'round';

// ---------------------------------------------------------------------------------------------
// 地面に付いた物(★#30=社長裁定 2026-11-23「地面に接する物は全部寝かせる」)
// ---------------------------------------------------------------------------------------------

export interface ProjFlatOut {
  /** 中心(付け根)の表示座標。 */
  x: number; y: number;
  /** 中心の s と、定義域と描く距離のフェード。 */
  s: number; a: number;
  /** 横の倍率(=k・既定 s_fx=★#24 の奥の下限 0.6・南は s のまま)。 */
  kx: number;
  /** 縦の倍率(=横 × 中心の縦の詰め/s・縦は横を超えない)。 */
  ky: number;
  /** 潰しの比 ky/kx(=min(1, 中心の縦の詰め/s))。k を呼ぶ側で決める所(雨の波紋 等)はこれを掛ける。 */
  r: number;
}
export const makeProjFlatOut = (): ProjFlatOut => ({ x: 0, y: 0, s: 1, a: 1, kx: 1, ky: 1, r: 1 });

/**
 * ★#30「地面に付いた物の型」(判定を持たない地面の跡=派手さの絵: 血溜まり・焦げ・粉塵・刺さった土 等): 閃光の輪(CR-3)と同じく、
 * 中心を投影し、中心の s で一様に潰す(頂点ごとの投影だと手前で下だけ膨らむ卵形になる)。横=k(既定 s_fx)・縦=横×(中心の縦の詰め/s)。
 * 縦は横を超えない。k を渡すとその値(判定に揃える物は s)。
 */
export const projFlatInto = (f: ProjFrame, wx: number, wy: number, out: ProjFlatOut, k?: number): ProjFlatOut => {
  const p = projectInto(f, wx, wy, PA);
  out.x = p.x; out.y = p.y; out.s = p.s; out.a = p.alpha;
  const s = Math.max(1e-6, p.s);
  const ya = projectInto(f, wx, wy - 2, PB).y;
  const yb = projectInto(f, wx, wy + 2, PB).y;
  const sy = Math.max(0, (yb - ya) / 4);
  const kx = k ?? projFxScale(p.s);
  out.r = Math.min(1, sy / s);
  out.kx = kx;
  out.ky = kx * out.r;
  return out;
};

// ---------------------------------------------------------------------------------------------
// 雪の奥行きの3層(★#31=社長裁定 2026-11-23「地面の投影に乗せず、画面に奥行きの3層」・G1 は「外」のまま)
// ---------------------------------------------------------------------------------------------

/**
 * 雪の層の叩き台(画面座標で降らせる・地面の投影には乗せない)。中の層=今の雪(G1)そのもの(数・大きさ・速さは今のまま)。
 * 値は全部「中の層に対する倍率」。fall=落ちる速さ・wind=風と主人公の動きで流れる速さ・par=カメラが動いた分の流れ(中=1)・
 * size=粒の直径(画面px)・alpha=濃さ・lean=落ちる向きを消失点の側へ寄せる量(0=真っ直ぐ・1=消失点から放射)・soft=強くぼける絵を使う。
 */
export const PROJ_SNOW_LAYERS = {
  near: { fall: 2.1, wind: 1.8, par: 1.7, sizeMin: 16, sizeMax: 30, alphaMin: 0.26, alphaMax: 0.46, lean: 0.22, soft: true },
  mid: { lean: 0.12 },
  far: { fall: 0.42, wind: 0.4, par: 0.45, sizeMin: 1.6, sizeMax: 3.4, alphaMin: 0.22, alphaMax: 0.42, lean: 0.06, soft: false },
} as const;
/** 奥の層の数=中の層の数 × この比(密)。 */
export const PROJ_SNOW_FAR_RATIO = 2 / 3;
/** 手前の層の数=中の層の数 × (まばら) + (吹雪の強さ b=0..1) × (増やす分)。b=1 で中の 1/3。 */
export const PROJ_SNOW_NEAR_BASE_RATIO = 2 / 15;
export const PROJ_SNOW_NEAR_STORM_RATIO = 1 / 5;
/** 粒の総数の上限=中の層の数 × この値(負荷・今の2倍まで)。 */
export const PROJ_SNOW_TOTAL_CAP = 2;

/**
 * 雪の層の数(★#31): 中の層の数 mid と吹雪の強さ b(0..1)から、奥と手前の数を返す。総数(mid+奥+手前)は mid × PROJ_SNOW_TOTAL_CAP を超えない。
 */
export const projSnowCounts = (mid: number, b: number): { far: number; near: number } => {
  const m = Math.max(0, Math.round(mid));
  const bb = Number.isFinite(b) ? Math.min(1, Math.max(0, b)) : 0;
  const cap = Math.max(0, Math.floor(m * PROJ_SNOW_TOTAL_CAP) - m);
  const far = Math.min(cap, Math.round(m * PROJ_SNOW_FAR_RATIO));
  const near = Math.min(cap - far, Math.round(m * (PROJ_SNOW_NEAR_BASE_RATIO + PROJ_SNOW_NEAR_STORM_RATIO * bb)));
  return { far, near: Math.max(0, near) };
};

/**
 * 落ちる向きを消失点の側へ寄せる(★#31): 画面の点 (sx, sy) で下へ vy 落ちる粒に足す横の速さ。消失点 (vpX, vpY) から粒へ向かう線の傾き
 * (dx/dy)に lean を掛けた分=落ちる線の延長が消失点の方を向く(左の粒は少し左下へ・右の粒は少し右下へ)。消失点より上の粒は寄せない。
 */
export const projSnowLeanVx = (sx: number, sy: number, vpX: number, vpY: number, vy: number, lean: number): number => {
  const dy = sy - vpY;
  if (!(dy > 1) || !(vy > 0)) return 0;
  const slope = Math.max(-1.5, Math.min(1.5, (sx - vpX) / dy));
  return slope * vy * Math.max(0, lean);
};

/** 小物: 点の投影(作り置きを返す・次の呼び出しで上書き)。 */
export const projFxPoint = (f: ProjFrame, wx: number, wy: number): ProjPoint => projectInto(f, wx, wy, PA);
