// ステージ2(研究所)で、たまに遠くから鳴る音(社長支給2026-10-19「ステージ2でたまに遠くから鳴る音」)。
//
// 時刻(ゲーム時間ms)と出撃ごとの種から「いつ・どちらから・どのくらいの遠さで」鳴るかを決める純関数。
// 音を鳴らすのは呼び手(useGameLoop → audioManager.playDistantSfx)。ゲーム時間で回すので、ポーズ中は鳴らない。
// ・時間軸を SLOT_MS ごとの枠に切り、枠ごとに最大1回。休みもあるので一定の拍にならない。
// ・出撃直後(最初の枠)は鳴らさない(着地と重ねない)。
// ・遠さ: 音量と高域の削り(ローパス)を一緒に動かす=遠いほど小さく、こもる。左右もばらす。

export const LAB_DISTANT_SLOT_MS = 38000;
/** 枠の頭から鳴るまでの最大のずれ。 */
const START_JITTER_MS = 30000;
/** 休みの割合。 */
const SKIP = 0.3;
const QUIET_FIRST_SLOTS = 1;

const hash = (n: number): number => {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

export interface LabDistantCue {
  /** 鳴る時刻(ゲーム時間ms)。 */
  at: number;
  /** 音量の倍率(0..1)。 */
  gain: number;
  /** 左右(-1..1)。 */
  pan: number;
  /** ローパスの周波数(Hz)。遠いほど低い。 */
  lowpassHz: number;
  /** 再生速度(音程の揺れ)。 */
  rate: number;
}

/** 枠 slot の1回(無ければ null)。 */
export const labDistantCue = (slot: number, seed = 0): LabDistantCue | null => {
  if (slot < QUIET_FIRST_SLOTS) return null;
  const base = Math.imul(slot, 7919) + Math.imul(seed | 0, 2654435761);
  const r = (i: number) => hash(base + Math.imul(i, 104729));
  if (r(0) < SKIP) return null;
  const far = r(2); // 0=近め .. 1=遠い
  const side = r(3) < 0.5 ? -1 : 1;
  return {
    at: slot * LAB_DISTANT_SLOT_MS + Math.round(r(1) * START_JITTER_MS),
    gain: 0.75 - far * 0.4,
    pan: side * (0.35 + r(4) * 0.55),
    lowpassHz: Math.round(2600 - far * 1700),
    rate: 0.9 + r(5) * 0.14,
  };
};

/** 前のフレーム(prevMs)から今(nowMs)までの間に鳴る1回(無ければ null)。巻き戻り(新しい出撃)では鳴らさない。 */
export const labDistantDue = (prevMs: number, nowMs: number, seed = 0): LabDistantCue | null => {
  if (!Number.isFinite(prevMs) || !Number.isFinite(nowMs) || nowMs <= prevMs) return null;
  const slot = Math.floor(nowMs / LAB_DISTANT_SLOT_MS);
  for (const sl of [slot - 1, slot]) {
    if (sl < 0) continue;
    const c = labDistantCue(sl, seed);
    if (c && c.at > prevMs && c.at <= nowMs) return c;
  }
  return null;
};
