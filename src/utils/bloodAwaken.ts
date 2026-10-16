// B10 血の覚醒(research/THEONE_ROUND2.md §3・第3版)。**純関数だけ**を置く(store/pixi/React は読むだけ)。
//
// 仕組み(一言): 自分の手で近くの敵を倒す(浴びる)と体力のオーブの液体が赤く染まる。満ちたら自動で10秒間の覚醒
// (移動・弾速・与ダメージ ×1.5 / 被ダメージ ×2 / スーパーアーマー)。**時間の速さ(timeScale)は触らない。**
//
// ★「乾き」は**書き込まずに導く**: meter は「最後に浴びた時点の値」で、時間が経った値は
// `bloodDryStep(meter, lastGainAt, now, awakening)` が毎回求める(浴びる/終わる時にだけ store へ書く)。
// 毎フレーム player を書き換えない(購読者を起こさない・CLAUDE.md の再レンダ規律)。
//
// ★守護霊・幻影の疑似Playerには持ち越さない: `withoutBlood`(ghostBuild/playerBuild が通す)。落とさないと
// 覚醒中に計測したビルドの守護霊が永久に ×1.5 になる。
//
// ★加算の「誰が浴びるか」はここでは分からない(分身/守護霊/スケボーも同じ player を渡してくる)。
// 加算は呼び手が選ぶ(gameStore: 本人の近接の呼び手が grantMeleeBlood / damageEnemy の gun 枝が grantGunBlood。分身・スケボー・守護霊は呼ばない=0)。

import { LOW_HP_PULSE_MS, lowHpBeatShape } from './lowHpPulse';

/** 血の状態(Player の部分。テストでは必要な欄だけ渡せる)。 */
export interface BloodFields {
  /** 最後に浴びた時点の血の量(満タン体力=1の絶対量・0..1)。乾きは含まない(→ bloodDryStep)。 */
  bloodMeter?: number;
  /** 覚醒の終わり(gameTime)。0=覚醒していない。 */
  bloodAwakenUntil?: number;
  /** 覚醒の始まり(gameTime)。入りの赤の立ち上がりに使う。 */
  bloodAwakenStartedAt?: number;
  /** 最後に浴びた時刻(gameTime)。乾きの起点。 */
  bloodLastGainAt?: number;
  /** 今の体力・最大体力(満タン値=器の大きさを決める。無ければ満タン扱い)。 */
  health?: number;
  maxHealth?: number;
}

/**
 * ★器の考え方(社長2026-10-16「体力が低いと溜まる量が増えるのではなく、相対的に満タン値が下がってくるので自ずと早まる」):
 * 血は**体力の液体を染める**。血の量(bloodMeter)は満タン体力を1とした絶対量で、器の大きさ=今の体力の割合。
 * 体力が減ると器が小さくなり、同じ血でも液体の多くが赤くなる=自ずと早く満ちる。回復すると器が大きくなり薄まる。
 * 体力ゼロ付近で1滴で満ちないよう、器の下限を置く。
 */
export const BLOOD_CAP_MIN = 0.15;
export const bloodCapacity = (p: BloodFields): number => {
  const max = p.maxHealth ?? 0;
  const frac = max > 0 ? Math.max(0, Math.min(1, (p.health ?? max) / max)) : 1;
  return Math.max(BLOOD_CAP_MIN, frac);
};

/** 覚醒の長さ(gameTime ms)。 */
export const BLOOD_AWAKEN_MS = 10000;
/** 覚醒中の強化倍率(移動速度・弾速・与ダメージ)。 */
export const BLOOD_AWAKEN_BOOST = 1.5;
/** 覚醒中の被ダメージ倍率。 */
export const BLOOD_AWAKEN_TAKEN = 2;
/** 終わりの何ms前から倍率が 1.0 へ線形に戻るか。 */
export const BLOOD_AWAKEN_FADE_MS = 1000;
/** 最後に浴びてからこの時間(ms)は乾かない。 */
export const BLOOD_DRY_DELAY_MS = 4000;
/** 乾く速さ(1/秒)。 */
export const BLOOD_DRY_PER_SEC = 0.01;
/** 体が赤くなる入り: ピーク(オーバーシュート)まで(ms)。 */
export const BLOOD_RED_IN_MS = 300;
/** ピークから定常へ落ち着くまで(ms)。 */
export const BLOOD_RED_SETTLE_MS = 500;
/** 入りのオーバーシュート(定常 1.0 に対するピーク)。 */
export const BLOOD_RED_OVERSHOOT = 1.2;
/** 体の赤が光より遅れて染まる時間(ms・位相差 80〜120)。 */
export const BLOOD_BODY_LAG_MS = 100;

/** 発動音('heavy-impact' の流用)の鳴らし方: 敵のレーザー等と同じ素材を、低く(rate)・控えめ(gain)に鳴らして別物にする。 */
export const BLOOD_AWAKEN_SFX_RATE = 0.7;
export const BLOOD_AWAKEN_SFX_GAIN = 0.5;

/** 近接キルで「浴びる」距離(プレイヤー中心と敵中心・px)。 */
export const BLOOD_MELEE_NEAR_PX = 120;
/** 銃キルで「浴びる」距離(px)。これより遠いキルは 0。 */
export const BLOOD_GUN_NEAR_PX = 90;

export const BLOOD_GAIN_MELEE_KILL_NEAR = 0.12;
export const BLOOD_GAIN_MELEE_KILL_FAR = 0.06;
export const BLOOD_GAIN_MELEE_HIT = 0.02;
export const BLOOD_GAIN_GUN_KILL_NEAR = 0.06;

export type BloodGainKind = 'melee-kill' | 'melee-hit' | 'gun-kill';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 1回の加算量(満タン体力を1とした絶対量)。表は §3-1。体力による補正は掛けない(器の大きさ=bloodCapacity が担う)。
 *  - 近接キル: 距離≤120px で +0.12 / それ以上 +0.06 / 近接ヒットのみ +0.02
 *  - 銃キル: 距離≤90px で +0.06 / それ以上 0
 * distPx は呼び手がプレイヤー中心と敵中心で測る(melee-hit では使わない)。
 */
export const bloodGainFor = (a: { kind: BloodGainKind; distPx: number }): number => {
  let base = 0;
  if (a.kind === 'melee-kill') base = a.distPx <= BLOOD_MELEE_NEAR_PX ? BLOOD_GAIN_MELEE_KILL_NEAR : BLOOD_GAIN_MELEE_KILL_FAR;
  else if (a.kind === 'melee-hit') base = BLOOD_GAIN_MELEE_HIT;
  else if (a.kind === 'gun-kill') base = a.distPx <= BLOOD_GUN_NEAR_PX ? BLOOD_GAIN_GUN_KILL_NEAR : 0;
  return base;
};

/** 覚醒中か。 */
export const isBloodAwakening = (p: BloodFields, gameTime: number): boolean =>
  (p.bloodAwakenUntil ?? 0) > gameTime;

/**
 * 乾きを織り込んだ血の量。最後に浴びてから 4秒後から −0.01/秒。覚醒中は乾かない(meter をそのまま返す)。
 * meter は 0..1 に丸める。
 */
export const bloodDryStep = (meter: number, lastGainAt: number, now: number, awakening: boolean): number => {
  const m = clamp01(meter);
  if (awakening || m <= 0) return m;
  const dryMs = now - lastGainAt - BLOOD_DRY_DELAY_MS;
  if (dryMs <= 0) return m;
  return Math.max(0, m - (dryMs / 1000) * BLOOD_DRY_PER_SEC);
};

/** 今の血の量(乾き込み)。覚醒していない時の表示・加算の起点。 */
export const bloodMeterNow = (p: BloodFields, gameTime: number): number =>
  bloodDryStep(p.bloodMeter ?? 0, p.bloodLastGainAt ?? 0, gameTime, isBloodAwakening(p, gameTime));

/** 液体のうち赤く染まった割合(0..1)= 血の量 ÷ 器(今の体力の割合)。覚醒中は1。 */
export const bloodFill = (p: BloodFields, gameTime: number): number =>
  isBloodAwakening(p, gameTime) ? 1 : clamp01(bloodMeterNow(p, gameTime) / bloodCapacity(p));

/**
 * 加算を適用した後の欄を返す。加算が 0 以下 / 覚醒中は null(何も書かない)。溢れた分は捨てる(上限=今の器)。
 * 満ちたら自動発動するのは useGameLoop のティック(bloodAwakenStep)。
 */
export const applyBloodGain = (p: BloodFields, gain: number, gameTime: number): { bloodMeter: number; bloodLastGainAt: number } | null => {
  if (!(gain > 0)) return null;
  if (isBloodAwakening(p, gameTime)) return null;
  return { bloodMeter: Math.min(bloodCapacity(p), bloodMeterNow(p, gameTime) + gain), bloodLastGainAt: gameTime };
};

/**
 * 毎ティックの遷移(useGameLoop 1箇所)。書くべき欄があれば patch を返す。
 *  - 覚醒が終わった(gameTime ≥ until): 血を 0・覚醒を 0 へ
 *  - 覚醒していない & 器が満ちた(bloodFill ≥ 1。被弾で体力が減って器が縮んだ瞬間にも満ちうる): 自動発動(started=true。音は呼び手が鳴らす)
 *  - それ以外は null(書かない)
 */
export const bloodAwakenStep = (
  p: BloodFields, gameTime: number,
): { patch: Required<Pick<BloodFields, 'bloodMeter' | 'bloodAwakenUntil' | 'bloodAwakenStartedAt' | 'bloodLastGainAt'>>; started: boolean } | null => {
  const until = p.bloodAwakenUntil ?? 0;
  if (until > 0 && gameTime >= until) {
    return { patch: { bloodMeter: 0, bloodAwakenUntil: 0, bloodAwakenStartedAt: p.bloodAwakenStartedAt ?? 0, bloodLastGainAt: 0 }, started: false };
  }
  if (until <= gameTime && (p.bloodMeter ?? 0) > 0 && bloodFill(p, gameTime) >= 1 - 1e-9) {
    return {
      patch: { bloodMeter: 1, bloodAwakenUntil: gameTime + BLOOD_AWAKEN_MS, bloodAwakenStartedAt: gameTime, bloodLastGainAt: gameTime },
      started: true,
    };
  }
  return null;
};

/**
 * 覚醒中の倍率。入りは即(1.5 / 2)、終わりの 1秒で線形に 1.0 へ戻る。
 * boost=移動速度・弾速(発射時に確定)・与ダメージ(近接+銃) / taken=被ダメージ。覚醒していなければ全部 1。
 */
export const bloodAwakenMult = (p: BloodFields, gameTime: number): { boost: number; taken: number } => {
  if (!isBloodAwakening(p, gameTime)) return { boost: 1, taken: 1 };
  const k = clamp01(((p.bloodAwakenUntil ?? 0) - gameTime) / BLOOD_AWAKEN_FADE_MS);
  return {
    boost: 1 + (BLOOD_AWAKEN_BOOST - 1) * k,
    taken: 1 + (BLOOD_AWAKEN_TAKEN - 1) * k,
  };
};

/**
 * 入りの「瞬間」(クリエイティブ監査): 赤は一度オーバーシュートしてから定常へ落ち着く。
 * 0→1.2 を 0.3秒で ease-out(慣性)、1.2→1.0 を 0.5秒で smoothstep(動き終わりに加減速)。sinceMs ≤ 0 は 0。
 */
const redEnvelope = (sinceMs: number): number => {
  if (!(sinceMs > 0)) return 0;
  if (sinceMs < BLOOD_RED_IN_MS) {
    const k = sinceMs / BLOOD_RED_IN_MS;
    return BLOOD_RED_OVERSHOOT * (1 - (1 - k) * (1 - k));
  }
  const s = clamp01((sinceMs - BLOOD_RED_IN_MS) / BLOOD_RED_SETTLE_MS);
  return BLOOD_RED_OVERSHOOT + (1 - BLOOD_RED_OVERSHOOT) * (s * s * (3 - 2 * s));
};

/** 終わりの 1秒で 1→0 へ戻る係数(smoothstep=動き終わりに加減速)。 */
const redOutFactor = (p: BloodFields, gameTime: number): number => {
  const k = clamp01(((p.bloodAwakenUntil ?? 0) - gameTime) / BLOOD_AWAKEN_FADE_MS);
  return k * k * (3 - 2 * k);
};

/**
 * 覚醒中の**赤い光**の濃さ(0..1.2・描画用)。入りは先に強く(オーバーシュート 1.2 → 0.5秒で 1.0)、終わりの 1秒で戻る。
 * 体の赤(bloodAwakenRedAlpha)はこれより BLOOD_BODY_LAG_MS 遅れて染まる=「光って、遅れて体が染まる」。覚醒していなければ 0。
 */
export const bloodAwakenGlowAlpha = (p: BloodFields, gameTime: number): number => {
  if (!isBloodAwakening(p, gameTime)) return 0;
  return redEnvelope(gameTime - (p.bloodAwakenStartedAt ?? 0)) * redOutFactor(p, gameTime);
};

/**
 * 覚醒中の**体の赤**の濃さ(0..1.2・描画用)。光(bloodAwakenGlowAlpha)と同じ立ち上がりを BLOOD_BODY_LAG_MS 遅らせる
 * (位相差=光が先・体が遅れて染まる)。終わりの 1秒で戻るのは光と同時。覚醒していなければ 0。
 */
export const bloodAwakenRedAlpha = (p: BloodFields, gameTime: number): number => {
  if (!isBloodAwakening(p, gameTime)) return 0;
  return redEnvelope(gameTime - (p.bloodAwakenStartedAt ?? 0) - BLOOD_BODY_LAG_MS) * redOutFactor(p, gameTime);
};

/** 覚醒中の鼓動の周期(ms)。瀕死の縁の鼓動の中段(1195ms)と同じ拍=二拍・休止の同じ形を使う。 */
export const BLOOD_BEAT_PERIOD_MS = LOW_HP_PULSE_MS[2];

/**
 * 覚醒中の鼓動の係数(1-depth..1)。サイン波ではなく心拍の形(lowHpBeatShape=二拍・休止)。
 * 光と体の赤の両方が同じ nowMs・同じ形で読む(depth だけ変える)。
 */
export const bloodPulseMult = (nowMs: number, depth: number): number => {
  const ph = ((nowMs % BLOOD_BEAT_PERIOD_MS) + BLOOD_BEAT_PERIOD_MS) % BLOOD_BEAT_PERIOD_MS;
  return 1 - depth + depth * lowHpBeatShape(ph);
};

/**
 * 体力のオーブの液体が目指す「赤の割合」(0..1)。覚醒中は残り時間の割合(=満タンの赤から10秒で紫へ戻る)、
 * それ以外は液体のうち染まった割合(bloodFill)。React の購読ではなく rAF から getState で読む用。
 */
export const bloodOrbTarget = (p: BloodFields, gameTime: number): number => {
  if (isBloodAwakening(p, gameTime)) return clamp01(((p.bloodAwakenUntil ?? 0) - gameTime) / BLOOD_AWAKEN_MS);
  return bloodFill(p, gameTime);
};

/** 守護霊・幻影の疑似Playerから血の状態を落とす(本人の覚醒を他人に乗せない)。 */
export const withoutBlood = <T extends BloodFields>(p: T): T => ({
  ...p, bloodMeter: 0, bloodAwakenUntil: 0, bloodAwakenStartedAt: 0, bloodLastGainAt: 0,
});
