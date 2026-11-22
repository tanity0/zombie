// スキル「カウンターマスター」(counter-master)。
// 社長指示2026-11-22「カウンターマスター 近接(カウンター)、サブウェポン、リロード 全てを短縮
//  カウンター成立時に周りの敵を吹き飛ばし」。
// - **カウンター成立時だけ**、次の待ち時間の「残り」を Lv別割合(Lv1 40% / Lv2 70% / Lv3 100%)ぶん前倒しする:
//   ①近接/カウンター共用CD(player.counterCooldownEnd)
//   ②装備中のサブウェポン全部の「次に使えるまでの残り」(形の違うものは下の各関数)
//   ③リロード(リロード中の時だけ)
// - 成立ゲートが本質: 不成立の近接スイング(素振り)には一切影響しない(CD_REWORK.md 確定2 の考え方を引き継ぐ)。
// - 吹き飛ばし(周りの敵)も成立時だけ。こちらは gameStore.counterMasterOnCounterSuccess(成立の縁で1回)。
// この純関数の当て先は gameStore.applyCounterMasterRefund 1本。それを「カウンター成立」の瞬間
// (lastCounterSuccessTime を打刻する全箇所)から呼ぶ。
import type { Player, SubWeaponKey } from '../types/game';
import type { AlchemyRhythmState } from './alchemyRhythmTypes';

export const COUNTER_MASTER_REFUND_FRAC_BY_LEVEL: readonly number[] = [0, 0.4, 0.7, 1.0]; // index=Lv(0=未所持)

/** Lv → 前倒しの割合(範囲外はclamp)。 */
export const counterMasterRefundFrac = (counterMasterLv: number): number => {
  const lv = Math.max(0, Math.min(3, Math.floor(counterMasterLv)));
  return COUNTER_MASTER_REFUND_FRAC_BY_LEVEL[lv] ?? 0;
};

/**
 * 締切(endAt)までの残りを frac ぶん前倒しする共通の純関数。
 * frac<=0 / 残り無し(endAt<=nowAt)の時は入力をそのまま返す。frac=1 で nowAt(=即使用可)。
 */
export const shortenRemaining = (endAt: number, nowAt: number, frac: number): number => {
  if (!(frac > 0)) return endAt;
  const remaining = endAt - nowAt;
  if (!(remaining > 0)) return endAt;
  return endAt - remaining * Math.min(1, frac);
};

/**
 * カウンター成立時の counterCooldownEnd リファンド(純関数)。
 * 未所持(Lv0)/残りCD無しの時は入力をそのまま返す=挙動不変。
 */
export const refundCounterCooldown = (
  counterCooldownEnd: number,
  nowMs: number,
  counterMasterLv: number,
): number => shortenRemaining(counterCooldownEnd, nowMs, counterMasterRefundFrac(counterMasterLv));

/** サブウェポンの絶対時刻CD(subWeaponCooldowns・gameTime基準)。装備中のキーだけ。変化が無ければ同じ参照。 */
export const refundSubWeaponCooldownMap = (
  cooldowns: Partial<Record<SubWeaponKey, number>>,
  equipped: readonly SubWeaponKey[],
  gameTime: number,
  frac: number,
): Partial<Record<SubWeaponKey, number>> => {
  let next: Partial<Record<SubWeaponKey, number>> | null = null;
  for (const key of equipped) {
    const at = cooldowns[key];
    if (at === undefined) continue;
    const moved = shortenRemaining(at, gameTime, frac);
    if (moved === at) continue;
    if (!next) next = { ...cooldowns };
    next[key] = moved;
  }
  return next ?? cooldowns;
};

/** センサー地雷のチャージ(回復待ちの readyAt 配列・gameTime基準)。各チャージの残りを前倒し。変化が無ければ同じ参照。 */
export const refundChargeReadyAts = (pending: readonly number[], gameTime: number, frac: number): readonly number[] => {
  let changed = false;
  const next = pending.map(at => {
    const moved = shortenRemaining(at, gameTime, frac);
    if (moved !== at) changed = true;
    return moved;
  });
  return changed ? next : pending;
};

/** 残りms型のCD(援護射撃 supportSniperCdMs)。 */
export const refundRemainingMs = (remainingMs: number, frac: number): number =>
  shortenRemaining(remainingMs, 0, frac);

/**
 * 溜め型(開始時刻+所要時間で満ちる: 狩猟の溜め)。溜めている途中(startedAt>0・未完了)だけ、
 * 残りを前倒しするよう開始時刻を過去へずらす。満ちた(残り0)なら charged=true を返す。
 */
export const refundChargeStart = (
  startedAt: number, charged: boolean, gameTime: number, chargeMs: number, frac: number,
): { startedAt: number; charged: boolean } => {
  if (charged || !(startedAt > 0) || !(chargeMs > 0) || !(frac > 0)) return { startedAt, charged };
  const end = startedAt + chargeMs;
  const movedEnd = shortenRemaining(end, gameTime, frac);
  if (movedEnd === end) return { startedAt, charged };
  if (movedEnd <= gameTime) return { startedAt, charged: true };
  // 開始時刻は 0 を「溜めていない」に使っているので、0以下へは落とさない(ラン開始直後の端の保険)。
  return { startedAt: Math.max(Number.EPSILON, movedEnd - chargeMs), charged };
};

/** 回数型(鞭: ヒット数がしきい値に届くと溜まる)。残りヒット数を前倒し(端数は切り上げ=Lv1でも1は進む)。 */
export const refundHitCount = (
  count: number, charged: boolean, threshold: number, frac: number,
): { count: number; charged: boolean } => {
  if (charged || !(frac > 0) || !(threshold > 0)) return { count, charged };
  const remaining = threshold - count;
  if (!(remaining > 0)) return { count, charged };
  const nextCount = count + Math.ceil(remaining * Math.min(1, frac));
  return { count: nextCount, charged: nextCount >= threshold };
};

/**
 * 錬金術の溜め(立ち止まり。終わる時刻=rhythm.startedAt+(既定の長さ−cutMs))。溜めの途中だけ、
 * 残りを前倒しする=リズムの成功と同じ「溜めが縮む」帳簿(cutMs)へ足す(溜めの判定・サークルの打ち切りが同じ式を読む)。
 */
export const refundAlchemyChannel = (
  rhythm: AlchemyRhythmState | undefined, channelMs: number, gameTime: number, frac: number,
): AlchemyRhythmState | undefined => {
  if (!rhythm || !(frac > 0)) return rhythm;
  const end = rhythm.startedAt + channelMs - rhythm.cutMs;
  const movedEnd = shortenRemaining(end, gameTime, frac);
  if (movedEnd === end) return rhythm;
  return { ...rhythm, cutMs: rhythm.cutMs + (end - movedEnd) };
};

type RefundPlayerFields = Pick<Player,
  | 'counterCooldownEnd' | 'subWeapons' | 'subWeaponCooldowns'
  | 'reloadEndsAt' | 'reloadingWeaponId'
  | 'katanaDashCooldownEnd' | 'katanaDashUntil'
  | 'huntingChargeStartedAt' | 'huntingCharged'
  | 'whipHitCount' | 'whipCharged'
  | 'alchemyChannelStartedAt' | 'alchemyRhythm'>;

export interface CounterMasterRefundInput {
  counterMasterLv: number;
  /** 実時間(Date.now): counterCooldownEnd / reloadEndsAt / katanaDashCooldownEnd の時計。 */
  nowMs: number;
  /** ゲーム内時刻: subWeaponCooldowns / センサー地雷 / 狩猟 / 錬金術 の時計。 */
  gameTime: number;
  player: RefundPlayerFields;
  sensorMineCharges: readonly number[];
  supportSniperCdMs: number;
  /** 狩猟の溜めの長さ(Lv別・呼び出し側が引く)。 */
  huntingChargeMs: number;
  /** 鞭のハリケーンに要るヒット数(Lv別・呼び出し側が引く)。 */
  whipChargeHits: number;
  /** 錬金術の溜めの既定の長さ。 */
  alchemyChannelMs: number;
}

export interface CounterMasterRefundResult {
  player: Partial<RefundPlayerFields>;
  sensorMineCharges?: number[];
  supportSniperCdMs?: number;
}

/**
 * カウンター成立時の前倒しを全部まとめて計算する純関数。変わったフィールドだけを返す
 * (Lv0=空の結果=挙動不変)。
 */
export const counterMasterRefund = (inp: CounterMasterRefundInput): CounterMasterRefundResult => {
  const frac = counterMasterRefundFrac(inp.counterMasterLv);
  const out: CounterMasterRefundResult = { player: {} };
  if (!(frac > 0)) return out;
  const p = inp.player;
  const { nowMs, gameTime } = inp;
  const has = (k: SubWeaponKey) => p.subWeapons.includes(k);

  // ①近接/カウンター共用CD
  const cce = shortenRemaining(p.counterCooldownEnd, nowMs, frac);
  if (cce !== p.counterCooldownEnd) out.player.counterCooldownEnd = cce;

  // ②サブウェポン
  const swc = refundSubWeaponCooldownMap(p.subWeaponCooldowns, p.subWeapons, gameTime, frac);
  if (swc !== p.subWeaponCooldowns) out.player.subWeaponCooldowns = swc;
  if (has('sensor-mine')) {
    const ch = refundChargeReadyAts(inp.sensorMineCharges, gameTime, frac);
    if (ch !== inp.sensorMineCharges) out.sensorMineCharges = [...ch];
  }
  if (has('support-sniper')) {
    const ss = refundRemainingMs(inp.supportSniperCdMs, frac);
    if (ss !== inp.supportSniperCdMs) out.supportSniperCdMs = ss;
  }
  if (has('katana') || has('murasame')) {
    // 刀の一閃のCD(実時間)。走っている最中はその着地より前へは縮めない(走りの最中に次の一閃を出させない)。
    const base = Math.max(nowMs, p.katanaDashUntil);
    const kd = shortenRemaining(p.katanaDashCooldownEnd, base, frac);
    if (kd !== p.katanaDashCooldownEnd) out.player.katanaDashCooldownEnd = kd;
  }
  if (has('striker-hunting')) {
    const h = refundChargeStart(p.huntingChargeStartedAt, p.huntingCharged, gameTime, inp.huntingChargeMs, frac);
    if (h.startedAt !== p.huntingChargeStartedAt) out.player.huntingChargeStartedAt = h.startedAt;
    if (h.charged !== p.huntingCharged) out.player.huntingCharged = h.charged;
  }
  if (has('whip')) {
    const w = refundHitCount(p.whipHitCount ?? 0, !!p.whipCharged, inp.whipChargeHits, frac);
    if (w.count !== (p.whipHitCount ?? 0)) out.player.whipHitCount = w.count;
    if (w.charged !== !!p.whipCharged) out.player.whipCharged = w.charged;
  }
  if (has('alchemy') && (p.alchemyChannelStartedAt ?? 0) > 0) {
    const r = refundAlchemyChannel(p.alchemyRhythm, inp.alchemyChannelMs, gameTime, frac);
    if (r !== p.alchemyRhythm) out.player.alchemyRhythm = r;
  }

  // ③リロード(リロード中の時だけ)
  if (p.reloadingWeaponId) {
    const re = shortenRemaining(p.reloadEndsAt, nowMs, frac);
    if (re !== p.reloadEndsAt) out.player.reloadEndsAt = re;
  }
  return out;
};
