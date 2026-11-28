/**
 * 視覚エフェクト(store の effects)の寿命切れの判定(updateEffects の掃除と同じ式・2026-11-28 に切り出し)。
 *
 * 一閃の筋(slash/trail)と鞭の縄(whiprope)は、絵の時計を止めた分(stopMs)だけ寿命が延びる(描画だけ)。
 * 時計は実時間(Date.now)=止め・スローの間も進む(createdAt も実時刻で打つ)。
 */
import type { VisualEffect } from '../types/game';
import { MELEE_HIT_HOLD_MIN_MS } from './meleeHitstopTiming';

type Expirable = Pick<VisualEffect, 'kind' | 'createdAt' | 'duration'> & { stopMs?: number; stopAt?: number };

/** 絵の時計を止めた分の延長(ms)。 */
export const effectLifeExtensionMs = (e: Expirable): number => {
  if (e.kind === 'slash' || e.kind === 'trail') return e.stopMs ?? 0;
  if (e.kind === 'whiprope') return e.stopAt !== undefined ? Math.max(e.stopMs ?? 0, MELEE_HIT_HOLD_MIN_MS) : 0;
  return 0;
};

/** 寿命が切れたか(=掃除で捨てる)。 */
export const isEffectExpired = (e: Expirable, now: number): boolean =>
  now - e.createdAt > e.duration + effectLifeExtensionMs(e);

/**
 * 寿命の切れた物だけを取り除く(動かさない・増やさない)。1つも切れていなければ**同じ配列をそのまま返す**
 * (呼び側は参照が変わった時だけ store へ書く=購読者を毎フレーム起こさない)。
 */
export const pruneExpiredEffects = <T extends Expirable>(effects: readonly T[], now: number): readonly T[] => {
  let i = 0;
  while (i < effects.length && !isEffectExpired(effects[i], now)) i++;
  if (i === effects.length) return effects;
  const out = effects.slice(0, i);
  for (i++; i < effects.length; i++) if (!isEffectExpired(effects[i], now)) out.push(effects[i]);
  return out;
};
