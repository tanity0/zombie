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
// 呼び手が旗を立てる(gameStore: grantMeleeKillRewards の bloodSplash / damageEnemy の gun 枝)。

/** 血の状態(Player の部分。テストでは必要な欄だけ渡せる)。 */
export interface BloodFields {
  /** 最後に浴びた時点の血の量(0..1)。乾きは含まない(→ bloodDryStep)。覚醒中は 1 のまま。 */
  bloodMeter?: number;
  /** 覚醒の終わり(gameTime)。0=覚醒していない。 */
  bloodAwakenUntil?: number;
  /** 覚醒の始まり(gameTime)。入りの赤の立ち上がりに使う。 */
  bloodAwakenStartedAt?: number;
  /** 最後に浴びた時刻(gameTime)。乾きの起点。 */
  bloodLastGainAt?: number;
}

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
/** 体が赤くなる入り(ms)。 */
export const BLOOD_RED_IN_MS = 300;

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
 * HPが低いほど早く染まる(社長案): 満タン×1.0 → HP半分×1.75 → HP2割×2.2。単調(HPが減るほど増える)。
 * hpFrac は 0..1 に丸める。
 */
export const bloodGainMult = (hpFrac: number): number => 1 + 1.5 * (1 - clamp01(hpFrac));

/**
 * 1回の加算量(HP補正込み)。表は §3-1。
 *  - 近接キル: 距離≤120px で +0.12 / それ以上 +0.06 / 近接ヒットのみ +0.02
 *  - 銃キル: 距離≤90px で +0.06 / それ以上 0
 * distPx は呼び手がプレイヤー中心と敵中心で測る(melee-hit では使わない)。
 */
export const bloodGainFor = (a: { kind: BloodGainKind; distPx: number; hpFrac: number }): number => {
  let base = 0;
  if (a.kind === 'melee-kill') base = a.distPx <= BLOOD_MELEE_NEAR_PX ? BLOOD_GAIN_MELEE_KILL_NEAR : BLOOD_GAIN_MELEE_KILL_FAR;
  else if (a.kind === 'melee-hit') base = BLOOD_GAIN_MELEE_HIT;
  else if (a.kind === 'gun-kill') base = a.distPx <= BLOOD_GUN_NEAR_PX ? BLOOD_GAIN_GUN_KILL_NEAR : 0;
  return base * bloodGainMult(a.hpFrac);
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

/**
 * 加算を適用した後の欄を返す。加算が 0 以下 / 覚醒中は null(何も書かない)。溢れた分は捨てる(上限 1)。
 * 満ちたら自動発動するのは useGameLoop のティック(bloodAwakenStep)。
 */
export const applyBloodGain = (p: BloodFields, gain: number, gameTime: number): { bloodMeter: number; bloodLastGainAt: number } | null => {
  if (!(gain > 0)) return null;
  if (isBloodAwakening(p, gameTime)) return null;
  return { bloodMeter: Math.min(1, bloodMeterNow(p, gameTime) + gain), bloodLastGainAt: gameTime };
};

/**
 * 毎ティックの遷移(useGameLoop 1箇所)。書くべき欄があれば patch を返す。
 *  - 覚醒が終わった(gameTime ≥ until): 血を 0・覚醒を 0 へ
 *  - 覚醒していない & meter ≥ 1: 自動発動(started=true。音は呼び手が鳴らす)
 *  - それ以外は null(書かない)
 */
export const bloodAwakenStep = (
  p: BloodFields, gameTime: number,
): { patch: Required<BloodFields>; started: boolean } | null => {
  const until = p.bloodAwakenUntil ?? 0;
  if (until > 0 && gameTime >= until) {
    return { patch: { bloodMeter: 0, bloodAwakenUntil: 0, bloodAwakenStartedAt: p.bloodAwakenStartedAt ?? 0, bloodLastGainAt: 0 }, started: false };
  }
  if (until <= gameTime && (p.bloodMeter ?? 0) >= 1) {
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
 * 覚醒中の体の赤の濃さ(0..1・描画用)。入り 0.3秒は ease-out で立ち上がり、終わりの 1秒で戻る。
 * 覚醒していなければ 0。
 */
export const bloodAwakenRedAlpha = (p: BloodFields, gameTime: number): number => {
  if (!isBloodAwakening(p, gameTime)) return 0;
  const inK = clamp01((gameTime - (p.bloodAwakenStartedAt ?? 0)) / BLOOD_RED_IN_MS);
  const inA = 1 - (1 - inK) * (1 - inK); // ease-out
  const k = clamp01(((p.bloodAwakenUntil ?? 0) - gameTime) / BLOOD_AWAKEN_FADE_MS);
  const outA = k * k * (3 - 2 * k); // smoothstep(動き終わりに加減速)
  return inA * outA;
};

/**
 * 体力のオーブの液体が目指す「血の量」(0..1)。覚醒中は残り時間の割合(=満タンの赤から10秒で紫へ戻る)、
 * それ以外は乾き込みの血の量。React の購読ではなく rAF から getState で読む用。
 */
export const bloodOrbTarget = (p: BloodFields, gameTime: number): number => {
  if (isBloodAwakening(p, gameTime)) return clamp01(((p.bloodAwakenUntil ?? 0) - gameTime) / BLOOD_AWAKEN_MS);
  return bloodMeterNow(p, gameTime);
};

/** 守護霊・幻影の疑似Playerから血の状態を落とす(本人の覚醒を他人に乗せない)。 */
export const withoutBlood = <T extends BloodFields>(p: T): T => ({
  ...p, bloodMeter: 0, bloodAwakenUntil: 0, bloodAwakenStartedAt: 0, bloodLastGainAt: 0,
});
