// ★★赤い予告の4つの掟④(CLAUDE.md・社長指示2026-09-18「**通るものもそれに合わせて**」)の共通部品。
// PACING_PUZZLE.md §18-1(d)。
//
// 突進(「通る」技)は**接触で当たる**ので当たる瞬間が1点に定まらない。だから走行中も
// **体幅ぶんの赤帯**を出し、「**赤が消えている間は当たらない**」を全型で成り立たせる。
// 先例=トールの突進(`drawThorDashBodyBand`・v0.25.3818)。ここはその**判断と時刻**だけを
// 純関数として括り出した葉(依存ゼロ。描画は pixiScene が `sweptRectHull` で行う)。
//
// import は**依存ゼロの葉である `airHop.ts` の ease 1本だけ**(トールの帯が使っている曲線と
// 同じものを読む=同じ動きを2度書かない)。尺(ms)は呼び出し側が判定側の実体から渡す=ここに手写ししない。
//
// **判定は1つも変えていない。** 突進中の当たりは「ボスのAABB × プレイヤーのAABB の重なり」
// (`combatTick.applyContactDamage`)のまま。ここが決めるのは**赤帯を出す州と、出ている間の濃さ**だけ。

import { airHopEase01 } from './airHop';

/** 出現/消滅の慣性(ms)。トールの `THOR_DASH_BAND_FADE_MS`(v0.25.3818)と同値=語彙を発明しない。 */
export const DASH_BAND_FADE_MS = 60;

/**
 * 到達点までの残り距離によるフェード(px)。
 *
 * 汎用突進(犬/城ボス/馬乗り)は**時間切れではなく「到達したら終わり」**(`cdist < 12` で打ち切り)なので、
 * 時間の締切だけでフェードを作ると**到達の瞬間にパッと消える**(CLAUDE.md「動きの絶対ルール: 慣性」違反)。
 * 残り距離でも絞ることで、到達で終わる型でも消えが演じられる。
 * トールの突進は**必ず moveMs ぴったりで終わる**ので距離側は使わない(= `Infinity` を渡す)
 * =トールの見た目は1pxも変えない。
 */
export const DASH_BAND_ARRIVE_FADE_PX = 60;

/** 加減速。トールの帯が使っているのと**同じ** `airHopEase01`(smootherstep)。 */
const ease01 = airHopEase01;

/**
 * 走行中の赤帯の濃さ(0〜1)。出始めと終わりに加減速が付く。
 * `distRemainPx` 省略時(=Infinity)は時間だけで決まる=トールの既存式と完全に一致する。
 */
export const dashBandAlpha01 = (
  sinceStartMs: number, remainMs: number, distRemainPx: number = Infinity,
  fadeMs: number = DASH_BAND_FADE_MS, fadePx: number = DASH_BAND_ARRIVE_FADE_PX,
): number => {
  if (sinceStartMs < 0 || remainMs <= 0) return 0;
  const f = Math.max(1, fadeMs);
  const p = Math.max(1, fadePx);
  return ease01(Math.min(1, sinceStartMs / f))
    * ease01(Math.min(1, remainMs / f))
    * (Number.isFinite(distRemainPx) ? ease01(Math.min(1, distRemainPx / p)) : 1);
};

/**
 * ★**走行中の州の台帳**(掟④)。ここに載っている間は**必ず赤帯が出ている**。
 *
 * 新しい突進(「通る」技)を足したら**必ずここへ足す**——CLAUDE.md「同じ"動作"を持つ全員に付ける」
 * (v0.25.2426/3521/3584 と同型の取りこぼしを作らないため、台帳は1本)。
 *
 * ※ミゲル `mdash-move` とウリ `thrust` は「線を走者が食う」方式で既に揃っているので載せない
 *   (PACING_PUZZLE.md §18-1(d) 脚注)。
 */
// ★★**社長指示2026-09-18で撤去した**(「自転車に流星のあと紅いライン引いたね？これやめてほしいん
// だけど、ほかの敵や技にも引いた？全部取っ払って」)。
// v0.25.4458 で §18-1(d) として**犬(自転車)/裏ボス共通/城ボス/馬乗り**の5州へ広げたが、実機で見た
// 社長の判断で**広げた分を全部外す**。残すのは**トールの突進だけ**——あれは §18 より前(v0.25.3818)に
// 別件で入っていた既存の絵で、今回の指示が指しているのは「流星のあとに新しく引かれた線」。
// ★**掟④(通る技は当たり得る間ずっと赤)との関係**: 掟④は残っているが、**この見せ方は採らない**という
// 社長の判断。再び「通る技の赤」を検討する時は、体帯とは**別の見せ方**から始めること
// (体帯は実機で「流星のあとに紅いラインが残る」と読まれた)。
/** `aiPhase` 側。**社長指示で空**(以前は charge / g-dash-charge / g-quad-charge)。 */
export const DASH_BAND_AI_PHASES: readonly string[] = [];
/** `bossState` 側。**トールの突進だけ**(§18より前からある既存の絵)。 */
export const DASH_BAND_BOSS_STATES: readonly string[] = ['thor-dash-move'];

export const dashBodyBandOn = (aiPhase?: string, bossState?: string): boolean =>
  (aiPhase !== undefined && DASH_BAND_AI_PHASES.includes(aiPhase))
  || (bossState !== undefined && DASH_BAND_BOSS_STATES.includes(bossState));

/**
 * ★**紫=カウンターできない攻撃**(CLAUDE.md「色と形の文法」②)。
 * 城ボスの三連突進(`g-quad-charge`)だけは v0.25.3049 の社長裁定で**カウンター不能**=
 * 赤いラインではなく**紫のライン**を出している。走行中の体帯も同じ色でなければ
 * 「赤=返せる/紫=返せない」の読み分けがその技だけ壊れる。
 */
export const DASH_BAND_PURPLE_AI_PHASES: readonly string[] = ['g-quad-charge'];

export const dashBodyBandPurple = (aiPhase?: string): boolean =>
  aiPhase !== undefined && DASH_BAND_PURPLE_AI_PHASES.includes(aiPhase);

/** 各突進の「走りの実効尺(ms)」。判定側の定数を呼び出し側が渡す(ここに手写ししない)。 */
export interface DashBandDurations {
  /** 汎用 `charge` / 城ボス `g-dash-charge` / `g-quad-charge` の実効最大時間。 */
  chargeMaxMs: number;
  /** 裏ボス共通 `dash` の実行尺。 */
  hiddenDashMs: number;
  /** 馬乗り `bm-charge` の最大時間。 */
  bmChargeMaxMs: number;
  /** トール `thor-dash-move` の走り。 */
  thorDashMoveMs: number;
}

/** 描画に必要な最小限の敵の形(pixi は Enemy を渡す。テストは素のオブジェクトを渡す)。 */
export interface DashBandActor {
  aiPhase?: string;
  bossState?: string;
  x: number; y: number; width: number; height: number;
  aiTargetX?: number; aiTargetY?: number;
  aiStartedAt?: number;
  aiPhaseUntil?: number;
  bossStateUntil?: number;
}

export interface DashBandSpec {
  /** 帯の終点(=その突進の赤いラインが指している到達点。線と帯で終点を二重定義しない)。 */
  endCx: number; endCy: number;
  /** 紫で描くか(カウンター不能の突進=その技の予告ラインと同じ色文法)。 */
  purple: boolean;
  /** 走り始めからの経過 ms(出現の加速用)。 */
  sinceStartMs: number;
  /** 走りの残り ms(消滅の減速用)。 */
  remainMs: number;
  /** 到達点までの残り距離 px(到達で終わる型の消滅用。トールは Infinity)。 */
  distRemainPx: number;
}

/**
 * 走行中の体帯の仕様を出す。**走っていなければ null**(= 赤を出さない)。
 *
 * 終点は**その突進が既に出している赤いライン(`dashLineTick`)と同じ `aiTarget`** を読む
 * (線と帯で別の終点を持たせない=「赤いのに当たらない」を作らない)。
 */
export const dashBodyBandSpec = (
  e: DashBandActor, gameTime: number, d: DashBandDurations,
): DashBandSpec | null => {
  const ph = e.aiPhase, bs = e.bossState;
  let sinceStartMs: number;
  let remainMs: number;
  let useDistFade = true;
  if (ph !== undefined && DASH_BAND_AI_PHASES.includes(ph)) {
    remainMs = (e.aiPhaseUntil ?? gameTime) - gameTime;
    sinceStartMs = d.chargeMaxMs - remainMs;
  } else if (bs === 'dash') {
    remainMs = (e.bossStateUntil ?? gameTime) - gameTime;
    sinceStartMs = d.hiddenDashMs - remainMs;
  } else if (bs === 'bm-charge') {
    remainMs = (e.bossStateUntil ?? gameTime) - gameTime;
    sinceStartMs = d.bmChargeMaxMs - remainMs;
  } else if (bs === 'thor-dash-move') {
    // トールだけは `aiStartedAt` を持ち、走りが必ず moveMs で終わる=既存の式をそのまま使う。
    sinceStartMs = gameTime - (e.aiStartedAt ?? gameTime);
    remainMs = d.thorDashMoveMs - sinceStartMs;
    useDistFade = false;
  } else return null;
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
  const endCx = e.aiTargetX ?? cx, endCy = e.aiTargetY ?? cy;
  return {
    endCx, endCy, sinceStartMs, remainMs, purple: dashBodyBandPurple(ph),
    distRemainPx: useDistFade ? Math.hypot(endCx - cx, endCy - cy) : Infinity,
  };
};
