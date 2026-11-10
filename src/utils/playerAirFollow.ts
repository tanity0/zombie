// ★プレイヤーが空中の敵を殴る時、プレイヤーの絵も宙へ浮かせて敵の高さを追う(描画だけ・判定・移動・当たりの位置・カメラは1pxも変えない)。
// 社長指示2026-11-10「飛び蹴りとか、近接時、空中の敵攻撃する時追尾するプレイヤーも空中に浮かせたい」・research/BRAWLER.md §18。
// ここは高さの曲線(純関数)と「最後に空中の敵へ近接を当てた記録」だけ。store には書かない(記録はこのモジュールの1つの変数・当たりの瞬間にしか書かない)。
// 時計は Date.now 系(ms)。上向きを正とする高さ h(px)と速さ vy(px/ms)。
import { brawlerAirborne, brawlerJuggleHeightRel } from './brawlerCombo';

/** 浮く高さ = 当てた時点での敵の絵の浮いた高さ × この倍率。上限はプレイヤーの体の高さ × CAP。 */
export const PLAYER_AIR_FOLLOW_K = 0.9;
export const PLAYER_AIR_BODY_CAP = 1.3;
/** 上りも落ちも同じ重力(px/ms²)。40px で上り・落ちとも約180ms。上りの初速は v0=√(2gh)=頂点で速さ0になる放物線。 */
export const PLAYER_AIR_GRAVITY = 0.0024;
/** 最後の空中の当たりから、頂点付近で漂う時間(ms)と、漂っている間のゆっくりした沈み(px/ms)。 */
export const PLAYER_AIR_HOVER_MS = 250;
export const PLAYER_AIR_HOVER_SINK = 0.04;
/** 飛び立つ前の沈み(ms)と、その縦の倍率。 */
export const PLAYER_AIR_CROUCH_MS = 40;
export const PLAYER_AIR_CROUCH_SQY = 0.9;
/** 空中の姿勢(伸び縮み): 上がり / 頂点 / 落下。 */
export const PLAYER_AIR_POSE = {
  rise: { sqY: 1.10, sqX: 0.92 },
  apex: { sqY: 0.94, sqX: 1.0 },
  fall: { sqY: 1.06, sqX: 1.0 },
} as const;
/** 敵の方への前傾(rad)。 */
export const PLAYER_AIR_LEAN_RAD = 0.25;
/** 当たり1発ごとの小さな跳ね(px・上げ80ms ease-out・戻し120ms)。 */
export const PLAYER_AIR_BUMP_PX = 5;
export const PLAYER_AIR_BUMP_UP_MS = 80;
export const PLAYER_AIR_BUMP_BACK_MS = 120;
/** 着地の沈みの長さ(ms)と、沈みの深さ(低い落下 → 体の高さから落ちた時)。 */
export const PLAYER_AIR_LAND_MS = 170;
export const PLAYER_AIR_LAND_SQUASH_MIN = 0.08;
export const PLAYER_AIR_LAND_SQUASH_MAX = 0.22;
/** 影(地面の楕円): 体の幅に対する幅・固定のα・縮みの下限(浮きの高さに応じて 1 → これ)。 */
export const PLAYER_AIR_SHADOW_W = 0.6;
export const PLAYER_AIR_SHADOW_ALPHA = 0.5;
export const PLAYER_AIR_SHADOW_SHRINK_MIN = 0.75;
/** 1フレームの進めの上限(ms)。止まった後の復帰で飛ばないように。 */
export const PLAYER_AIR_MAX_DT_MS = 50;

export interface PlayerAirState {
  /** 高さ(px・地面=0)。 */
  h: number;
  /** 上向きの速さ(px/ms)。正=上り・0=頂点/漂い・負=落下。 */
  vy: number;
  /** 飛び立ち前の沈みの終わり(Date.now・未設定=沈んでいない)。 */
  crouchUntil?: number;
}

/** 目標の高さ(px)。enemyScalePx=その敵の浮く絵の高さの基準(1倍=何px)・rel=敵の高さの倍率・bodyH=プレイヤーの体の高さ(上限は ×CAP)。 */
export const playerAirTargetPx = (rel: number, enemyScalePx: number, bodyH: number): number =>
  Math.max(0, Math.min(Math.max(0, bodyH) * PLAYER_AIR_BODY_CAP, PLAYER_AIR_FOLLOW_K * Math.max(0, rel) * Math.max(0, enemyScalePx)));

/** 高さ h まで頂点で速さ0になる初速(px/ms)。 */
export const playerAirLaunchSpeed = (h: number): number => Math.sqrt(2 * PLAYER_AIR_GRAVITY * Math.max(0, h));

export type PlayerAirPhase = 'ground' | 'crouch' | 'rise' | 'apex' | 'fall';
export const playerAirPhase = (s: PlayerAirState, now: number): PlayerAirPhase =>
  s.crouchUntil !== undefined && now < s.crouchUntil ? 'crouch' : s.vy > 1e-6 ? 'rise' : s.vy < -1e-6 ? 'fall' : s.h > 0.5 ? 'apex' : 'ground';

export interface PlayerAirStepInput {
  /** いま(Date.now)と前フレームからの経過(ms)。 */
  now: number; dtMs: number;
  /** 敵の高さへの目標(px)。null=最近の空中の当たりが無い。 */
  targetPx: number | null;
  /** 最後の空中の当たりを「効かせる時刻」(Date.now)。ヒットストップが明けた時刻を渡す(その前は動かさない)。null=当たり無し。 */
  hitAt: number | null;
}
export interface PlayerAirStepResult {
  state: PlayerAirState;
  /** この1フレームで飛び立ちの沈みに入った(砂埃・筋の合図)。 */
  takeoff: boolean;
  /** 着地した時の落下の速さ(px/ms・正)。着地していなければ null。 */
  landSpeed: number | null;
}

/**
 * 1フレーム進める。
 *  - 当たり(hitAt)から HOVER の間、目標が今より高ければ飛び上がる(地上なら 40ms 沈んでから・空中ならすぐ。初速は v0=√(2g(目標−今))=頂点で目標に届いて速さ0)。
 *  - 上り: 重力で減速して頂点で止まる。頂点〜HOVER の終わり: ゆっくり沈みながら漂う(目標が上がればまた飛び上がる)。
 *  - HOVER を過ぎたら重力で加速しながら落ちる。着地で landSpeed を返す。落下中に再び当たったら、その高さから上がり直す(途切れない)。
 *  - ヒットストップ中(now < hitAt)は動かさない。
 */
export const stepPlayerAir = (s: PlayerAirState, inp: PlayerAirStepInput): PlayerAirStepResult => {
  const dt = Math.max(0, Math.min(PLAYER_AIR_MAX_DT_MS, inp.dtMs));
  const { now } = inp;
  let { h, vy, crouchUntil } = s;
  let takeoff = false;
  let landSpeed: number | null = null;
  if (inp.hitAt !== null && now < inp.hitAt) return { state: s, takeoff, landSpeed }; // ヒットストップ中
  const since = inp.hitAt === null ? Infinity : now - inp.hitAt;
  const following = inp.targetPx !== null && since <= PLAYER_AIR_HOVER_MS;
  // 飛び上がり(目標が今より高い・上っていない時)。
  if (following && inp.targetPx! - h > 1 && vy <= 1e-6) {
    if (h <= 0.5) {
      if (crouchUntil === undefined) { crouchUntil = now + PLAYER_AIR_CROUCH_MS; takeoff = true; }
    } else vy = playerAirLaunchSpeed(inp.targetPx! - h);
  }
  if (crouchUntil !== undefined) {
    if (now >= crouchUntil) {
      crouchUntil = undefined;
      if (following && inp.targetPx! - h > 1) vy = playerAirLaunchSpeed(inp.targetPx! - h);
    } else return { state: { h, vy: 0, crouchUntil }, takeoff, landSpeed }; // 沈んでいる間は地面のまま
  }
  if (vy > 1e-6) { // 上り(等加速度の厳密解=刻みが粗くても頂点で行き過ぎない)
    const tUp = vy / PLAYER_AIR_GRAVITY;
    if (tUp <= dt) { h += (vy * tUp) / 2; vy = 0; }
    else { h += vy * dt - 0.5 * PLAYER_AIR_GRAVITY * dt * dt; vy -= PLAYER_AIR_GRAVITY * dt; }
  } else if (since <= PLAYER_AIR_HOVER_MS && h > 0) { // 漂い
    vy = 0;
    h = Math.max(0, h - PLAYER_AIR_HOVER_SINK * dt);
  } else if (h > 0) { // 落下
    const v1 = vy - PLAYER_AIR_GRAVITY * dt;
    h += vy * dt - 0.5 * PLAYER_AIR_GRAVITY * dt * dt;
    vy = v1;
    if (h <= 0) { landSpeed = -vy; h = 0; vy = 0; }
  }
  return { state: { h, vy, crouchUntil }, takeoff, landSpeed };
};

/** 当たり1発ごとの小さな跳ね(px)。0〜80ms で ease-out に上がり、続く120msで滑らかに戻る。 */
export const playerAirBumpPx = (sinceHitMs: number): number => {
  if (!(sinceHitMs >= 0) || sinceHitMs >= PLAYER_AIR_BUMP_UP_MS + PLAYER_AIR_BUMP_BACK_MS) return 0;
  if (sinceHitMs < PLAYER_AIR_BUMP_UP_MS) { const u = sinceHitMs / PLAYER_AIR_BUMP_UP_MS; return PLAYER_AIR_BUMP_PX * (1 - (1 - u) * (1 - u)); }
  const q = (sinceHitMs - PLAYER_AIR_BUMP_UP_MS) / PLAYER_AIR_BUMP_BACK_MS;
  return PLAYER_AIR_BUMP_PX * (1 - q * q * (3 - 2 * q));
};

/** 空中の姿勢の伸び縮み(縦・横)。沈み・上り・頂点・落下で変える。地上は 1。 */
export const playerAirPoseTarget = (phase: PlayerAirPhase): { sqY: number; sqX: number } =>
  phase === 'ground' ? { sqY: 1, sqX: 1 }
    : phase === 'crouch' ? { sqY: PLAYER_AIR_CROUCH_SQY, sqX: 1 + (1 - PLAYER_AIR_CROUCH_SQY) * 0.6 }
      : PLAYER_AIR_POSE[phase];

/** 着地の強さ(0..1)=落下の速さ ÷ 体の高さから落ちた時の速さ。 */
export const playerAirLandStrength = (landSpeed: number, bodyH: number): number => {
  const vBody = playerAirLaunchSpeed(Math.max(1, bodyH));
  return Math.max(0, Math.min(1, landSpeed / vBody));
};
/** 着地の沈みの深さ(低い落下 0.08 → 体の高さから 0.22)。 */
export const playerAirLandDepth = (strength: number): number =>
  PLAYER_AIR_LAND_SQUASH_MIN + (PLAYER_AIR_LAND_SQUASH_MAX - PLAYER_AIR_LAND_SQUASH_MIN) * Math.max(0, Math.min(1, strength));
/** 着地の沈み(縦の倍率・1=変化なし)。着地の瞬間から速く沈み、ゆっくり戻る。 */
export const playerAirLandSquashY = (sinceLandMs: number, depth: number): number => {
  if (!(sinceLandMs >= 0) || sinceLandMs >= PLAYER_AIR_LAND_MS) return 1;
  const u = sinceLandMs / PLAYER_AIR_LAND_MS;
  return 1 - depth * Math.sin(Math.PI * Math.pow(u, 0.6));
};

/** 影(地面の楕円)の幅の縮み(1=縮まない・浮きの高さ airK 0..1 で 0.75 まで)。幅・αは固定値(敵と同じ縮め方は使わない)。 */
export const playerAirShadowShrink = (airK: number): number =>
  1 - (1 - PLAYER_AIR_SHADOW_SHRINK_MIN) * Math.max(0, Math.min(1, airK));

// ---- 最後に空中の敵へ近接を当てた記録 ----
export interface AirMeleeHit { at: number; enemyId: string; rel: number }
let lastAirMeleeHit: AirMeleeHit | null = null;
/** 近接(格闘の段・技・ナイフ・刀・鞭・気功の爆発)が敵に当たる瞬間に呼ぶ。浮いていなければ何もしない(銃は呼ばない)。 */
export const noteAirMeleeHit = (e: Parameters<typeof brawlerJuggleHeightRel>[0] & { id: string }, now: number): void => {
  if (!brawlerAirborne(e, now)) return;
  lastAirMeleeHit = { at: now, enemyId: e.id, rel: brawlerJuggleHeightRel(e, now) };
};
export const getLastAirMeleeHit = (): AirMeleeHit | null => lastAirMeleeHit;
export const resetAirMeleeHit = (): void => { lastAirMeleeHit = null; };
