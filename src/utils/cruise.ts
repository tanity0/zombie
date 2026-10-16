// ★B3 巡航(走り続けると速くなる)+ B11 加速中の被弾%カット(research/THEONE_ROUND2.md §4b・社長「B3はA案で」2026-10-16)。
// 既存の速度ランプ(utils/speedRamp.ts の sustainMs=同じ向きへ走り続けた時間)を「3段」に読み替える純関数。
// 状態(sustainMs)の進め方・リセットは speedRamp.stepSpeedRamp と movePlayer が持つ。ここは数式だけ(副作用・時刻なし)。
import type { EquipLoadout } from '../types/game';
import { equipmentById } from '../data/equipment';

/** 段の速度ボーナス(段0/1/2/3)。累計ではなくその段の値。社長「１：２０％ ２：３０％ ３：４０％」。 */
export const CRUISE_STAGE_BONUS = [0, 0.20, 0.30, 0.40] as const;
export const CRUISE_STAGE_MAX = 3;
/** 間隔の元(秒): ランナー無し=1.0 / Lv1〜3=0.8/0.7/0.6。社長「スキル１：０．８ ２：０．７ ３：０．６」。 */
export const CRUISE_BASE_INTERVAL_S = [1.0, 0.8, 0.7, 0.6] as const;
/** 機動系の装備の段階ごとに縮む秒(社長「装備：-0.1ずつ」)。 */
export const CRUISE_EQUIP_STEP_S = 0.1;
/** 間隔の下限(秒)=全部積んだ時の「0.1秒で最大速」。 */
export const CRUISE_MIN_INTERVAL_S = 0.1;
/** 段が上がる瞬間の寄せ込み(ms)。パッと跳ねない(慣性MUST)。 */
export const CRUISE_STAGE_BLEND_MS = 120;
/**
 * 上乗せ(ランナー/装備/英雄/消費カード/魔導士の追加分)の立ち上がりにかける時間の上限(ms)。
 * 段の総時間が長いビルドでも、上乗せは従来どおり1秒で満額(=今までより遅くしない・設計監査の指摘)。総時間がそれより短ければそれに揃う。
 */
export const CRUISE_OTHERS_RAMP_MAX_MS = 1000;
export const cruiseOthersRampMs = (totalMs: number): number => Math.max(1, Math.min(CRUISE_OTHERS_RAMP_MAX_MS, totalMs));
/** B11: 段1以上の被弾を軽くする量(機動系の装備の段階あたり)。段階5で −20%。 */
export const CRUISE_DR_PER_TIER = 0.04;

/** 段の間隔(秒)。ランナー Lv と機動系の装備の段階から。下限 0.1。 */
export const cruiseIntervalS = (runnerLv: number, equipTier: number): number => {
  const lv = Math.max(0, Math.min(3, Math.floor(runnerLv)));
  const t = Math.max(0, Math.min(5, Math.floor(equipTier)));
  return Math.max(CRUISE_MIN_INTERVAL_S, CRUISE_BASE_INTERVAL_S[lv] - CRUISE_EQUIP_STEP_S * t);
};

/**
 * 最大段(段3)までの総時間(ms)。読み②(A案): 間隔 1.0秒→総 3.0秒、間隔 0.1秒→総 0.1秒 を線形に結ぶ
 * (全部積むと 0.1秒で最大速=社長「全部つむと0.1秒で最大速になる？そんなビルドもありかな」)。
 */
export const cruiseTotalMs = (intervalS: number): number => {
  const i = Math.max(CRUISE_MIN_INTERVAL_S, intervalS);
  const totalS = CRUISE_MIN_INTERVAL_S + (i - CRUISE_MIN_INTERVAL_S) * ((3.0 - CRUISE_MIN_INTERVAL_S) / (1.0 - CRUISE_MIN_INTERVAL_S));
  return totalS * 1000;
};

/** 今の段(0〜3)。段k に入る時刻 = k × total / 3。 */
export const cruiseStage = (sustainMs: number, totalMs: number): number => {
  if (!(totalMs > 0)) return CRUISE_STAGE_MAX;
  const step = totalMs / CRUISE_STAGE_MAX;
  return Math.max(0, Math.min(CRUISE_STAGE_MAX, Math.floor(sustainMs / step)));
};

/** 段の速度ボーナス(0〜0.4)。段が上がる瞬間は min(120ms, 段の間) で前の段の値から寄せる(ease-out)。 */
export const cruiseStageBonus = (sustainMs: number, totalMs: number): number => {
  const stage = cruiseStage(sustainMs, totalMs);
  if (stage === 0) return 0;
  const step = totalMs / CRUISE_STAGE_MAX;
  const blend = Math.max(1, Math.min(CRUISE_STAGE_BLEND_MS, step));
  const since = sustainMs - stage * step;
  const u = Math.max(0, Math.min(1, since / blend));
  const e = 1 - (1 - u) * (1 - u);
  const prev = CRUISE_STAGE_BONUS[stage - 1], cur = CRUISE_STAGE_BONUS[stage];
  return prev + (cur - prev) * e;
};

/** 上乗せ(ランナー/装備/英雄/消費カード)の立ち上がり割合 0..1 = sustainMs / total。 */
export const cruiseRampFrac = (sustainMs: number, totalMs: number): number =>
  totalMs > 0 ? Math.max(0, Math.min(1, sustainMs / totalMs)) : 1;

/** B11: 段1以上の被弾の倍率(1 − 0.04 × 装備段階)。段0・装備無しは 1。 */
export const cruiseDamageMult = (stage: number, equipTier: number): number =>
  stage >= 1 ? 1 - CRUISE_DR_PER_TIER * Math.max(0, Math.min(5, Math.floor(equipTier))) : 1;

/** 機動系の装備の段階(0〜5)。体スロットの機動系だけを見る。特殊装備は移動速度の値から段階へ写す(+25%=段階3)。 */
export const equipCruiseTier = (loadout: EquipLoadout | undefined): number => {
  if (!loadout?.body) return 0;
  const def = equipmentById(loadout.body);
  if (!def) return 0;
  if (!def.special) return def.line === 'mobility' ? def.tier : 0;
  const ms = def.stats.find(st => st.key === 'moveSpeed')?.value ?? 0;
  return ms > 0 ? Math.max(1, Math.min(5, Math.round(ms / 0.1))) : 0;
};
