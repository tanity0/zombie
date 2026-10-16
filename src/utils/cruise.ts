// ★B3 巡航(走り続けると速くなる)+ B11 加速中の被弾%カット(research/THEONE_ROUND2.md §4b・社長「B3はA案で」2026-10-16)。
// 既存の速度ランプ(utils/speedRamp.ts の sustainMs=同じ向きへ走り続けた時間)を「3段」に読み替える純関数。
// 状態(sustainMs)の進め方・リセットは speedRamp.stepSpeedRamp と movePlayer が持つ。ここは数式だけ(副作用・時刻なし)。
import type { EquipLoadout } from '../types/game';
import { equipmentById } from '../data/equipment';

/** 段の速度ボーナス(段0/1/2/3)。累計ではなくその段の値。社長「１：２０％ ２：３０％ ３：４０％」。 */
export const CRUISE_STAGE_BONUS = [0, 0.20, 0.30, 0.40] as const;
export const CRUISE_STAGE_MAX = 3;
/** 段が上がる瞬間の寄せ込み(ms)。パッと跳ねない(慣性MUST)。 */
export const CRUISE_STAGE_BLEND_MS = 120;
/**
 * 上乗せ(ランナー/装備/英雄/消費カード/マークスマンの追加分)の立ち上がりにかける時間の上限(ms)。
 * 段の総時間が長いビルドでも、上乗せは従来どおり1秒で満額(=今までより遅くしない・設計監査の指摘)。総時間がそれより短ければそれに揃う。
 */
export const CRUISE_OTHERS_RAMP_MAX_MS = 1000;
export const cruiseOthersRampMs = (totalMs: number): number => Math.max(1, Math.min(CRUISE_OTHERS_RAMP_MAX_MS, totalMs));
/** B11: 段1以上の被弾を軽くする量(機動系の装備の段階あたり)。段階5で −20%。 */
export const CRUISE_DR_PER_TIER = 0.04;

/** スキル(ランナー)の時間倍率: 無し=1 / Lv1〜3=0.8/0.7/0.6。社長「スキル１：０．８ ２：０．７ ３：０．６」。 */
export const CRUISE_RUNNER_TIME_MULT = [1.0, 0.8, 0.7, 0.6] as const;
/** 機動系の装備の段階ごとの時間倍率(×0.9ずつ・社長「装備：-0.1ずつ」を掛け算で効かせる=v0.25.5083「抑えが効く計算」)。 */
export const CRUISE_EQUIP_TIME_STEP = 0.9;
/** 何も無い時の最大段までの総時間(ms)=1秒ごとに3段。 */
export const CRUISE_BASE_TOTAL_MS = 3000;

/**
 * 最大段(段3)までの総時間(ms)= 3秒 × ランナーの倍率 × 0.9^装備段階(★v0.25.5083 社長「もうちょっと抑えが効く計算に」→「はい」)。
 * 旧(v0.25.5082)は引き算+写像で全部揃えると 0.1秒だった。今は全部揃えても約1.06秒(積むほど確実に早く、上振れしない)。
 */
export const cruiseTotalMsFor = (runnerLv: number, equipTier: number): number => {
  const lv = Math.max(0, Math.min(3, Math.floor(runnerLv)));
  const t = Math.max(0, Math.min(5, Math.floor(equipTier)));
  return CRUISE_BASE_TOTAL_MS * CRUISE_RUNNER_TIME_MULT[lv] * Math.pow(CRUISE_EQUIP_TIME_STEP, t);
};

/** 速度ボーナスの合計が素直に効く所まで(+60%)。ここを超えた分は効きが鈍る。 */
export const CRUISE_SPEED_KNEE = 0.6;
/** 速度ボーナスの頭打ち(+100%=2倍の手前で止まる)。 */
export const CRUISE_SPEED_CAP = 1.0;
/**
 * 速度ボーナスの合計(足し算)→ 実際に効く量。+60%までは素直、超えた分は CAP へ漸近(★v0.25.5083「抑えが効く計算」)。
 * 段3のみ +40%→+40% / 段3+ランナーLv3 +60%→+60% / +最上位の靴 +100%→+85% / +英雄 +130%→+93%。
 */
export const cruiseSoftCap = (bonus: number): number => {
  if (bonus <= CRUISE_SPEED_KNEE) return bonus;
  const room = CRUISE_SPEED_CAP - CRUISE_SPEED_KNEE;
  return CRUISE_SPEED_KNEE + room * (1 - Math.exp(-(bonus - CRUISE_SPEED_KNEE) / room));
};
/**
 * 移動速度の倍率 = 1 + softcap(段のボーナス + 上乗せの合計 × 上乗せの立ち上がり)。
 * 上乗せの合計 = ランナー/装備/英雄/消費カード/マークスマンの追加分の (倍率−1) の**足し算**(旧=掛け算)。
 */
export const cruiseSpeedMult = (stageBonus: number, othersSum: number, othersRampFrac: number): number =>
  1 + cruiseSoftCap(Math.max(0, stageBonus) + Math.max(0, othersSum) * Math.max(0, Math.min(1, othersRampFrac)));

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
