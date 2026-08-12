// PACING_PUZZLE.md §6.28-6 バッチM55: ジブリル(stage-3 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-6 を参照。
import { pickComboFollowup } from './bossScript';

export type JibrilMove = 'volley' | 'lantern' | 'consecrate' | 'lance';
export type JibrilVolleyMode = 'close' | 'snipe';

export const JIBRIL_HANDGUN_DIST = 300;      // ≤300=近接射(close) / >300=狙撃(snipe)
export const JIBRIL_LANTERN_CHANCE = 0.3;    // v0.25.3197: ランス追加に伴い 0.4→0.3(射撃40%は維持)
export const JIBRIL_LANCE_CHANCE = 0.3;      // 社長指示v0.25.3197の新技「ランス」(細い光条)。比率は叩き台
export const JIBRIL_CONSECRATE_RANGE = 200;  // 聖別が撃てる密着帯(§6.28-6 #4)
export const JIBRIL_PHASE_HP_THRESHOLD = 0.6;
export const JIBRIL_COMBO_CHANCE = 0.4;      // ランタン→狙撃 / 聖別→近接射(共通・§6.28-6フェーズ表)
// §6.28-6 #5追補: アリーナ縁に張り付いた状態が続いたら強制転移(縁ハメ潰し)。
export const JIBRIL_EDGE_STICK_MS = 3000;

export const jibrilVolleyMode = (distance: number): JibrilVolleyMode =>
  distance <= JIBRIL_HANDGUN_DIST ? 'close' : 'snipe';

// 聖別(密着帯限定・Phase2のみ)が選べるか。
export const jibrilConsecrateEligible = (phase: 1 | 2, distance: number, ready: boolean): boolean =>
  phase === 2 && distance <= JIBRIL_CONSECRATE_RANGE && ready;

// chase中の技選択。聖別が選べる時は最優先(密着帯を埋める専用技=他技と競合させない。
// §6.28-14に「聖別と既存2択の優先順位/確率配分は設計書に無い」旨を記録した叩き台)。
// それ以外は既存の踏襲(40%ランタン/60%射撃)。
export const pickJibrilMove = (
  phase: 1 | 2,
  distance: number,
  consecrateReady: boolean,
  rand: () => number = Math.random,
): JibrilMove => {
  if (jibrilConsecrateEligible(phase, distance, consecrateReady)) return 'consecrate';
  const r = rand();
  if (r < JIBRIL_LANTERN_CHANCE) return 'lantern';
  if (r < JIBRIL_LANTERN_CHANCE + JIBRIL_LANCE_CHANCE) return 'lance';
  return 'volley';
};

// §6.28-6 Phase2連携: 「ランタン→狙撃」「聖別→近接射」(共通確率40%)。狙撃/近接射のどちらを
// 撃つかは距離ではなく直前の技で決め打つ(火で足止め後は"狙撃"・密着後は"近接射")ため、
// pickComboFollowupが返す値をそのまま呼び出し側(angelBossTick.ts)がvolleyModeへ反映する。
export const JIBRIL_COMBO_FOLLOWUP: Partial<Record<JibrilMove, JibrilMove>> = { lantern: 'volley', consecrate: 'volley' };

export const pickJibrilCombo = (
  justFinished: JibrilMove,
  phase: 1 | 2,
  rand: () => number = Math.random,
): JibrilMove | null => {
  if (phase !== 2) return null;
  return pickComboFollowup(justFinished, JIBRIL_COMBO_FOLLOWUP, JIBRIL_COMBO_CHANCE, () => true, rand);
};
