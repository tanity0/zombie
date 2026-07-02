// PACING_REDESIGN.mdバッチ7: イベントプロデューサー(純関数)。
//
// 大原則(社長指示)「イベントはノルマではない」: 発生総数を保証しない。既存の各イベントタイマー
// (nextArenaAt/redNightFireAt/hunterRef/screamerRef)はベーススケジュールとして残し、この関数群は
// その発火可否を「ゲート」するだけ(発火の主体は既存タイマー側=useGameLoop.ts)。
//
// 憲法第5条: 「大イベントは重ねない・ピンチに撃たない・緩を荒らさない」
// - 大イベント(囲い/紅き月/ハンター/裏ボス)は同時に1つまで。
// - ピンチ救済(pity)発動中+解除後10秒はイベント発火禁止。
// - イベント中は反応型ディレクターをPEAK扱い(呼び出し側=useGameLoop.tsのdangerBias=1で対応、
//   紅き月の既存パターンを全大イベントへ拡張。本ファイルは判定のみで副作用は持たない)。
import type { DirectorPhaseKind } from './aiDirectorDebug';
import { BORED_BONUS_MAX } from './boredomDirector';

export const PITY_EVENT_BLOCK_TAIL_MS = 10000; // ピンチ解除後、イベント発火を禁止し続ける猶予

// 大イベント共通ゲート: 他の大イベントが進行中でない・ピンチ猶予を過ぎている。
export const eventGateOk = (input: {
  bigEventActive: boolean;
  gameTime: number;
  pityBlockUntilMs: number;
}): boolean => !input.bigEventActive && input.gameTime >= input.pityBlockUntilMs;

// 紅き月: 緩フェーズ(buildup/boss)中にしか開始しない(山=関所に重ねない)。関所中に窓が開いても
// ロールは消費せず、次の緩フェーズまで毎フレーム再判定するだけで自然に遅延する。
export const redNightPhaseGateOk = (phaseKind: DirectorPhaseKind): boolean => phaseKind !== 'gate';

// 叫び(screamer): 関所中のみ発火(バッチ3のpressure≥0.80解禁と統合するまでの先行導入=フェーズ種別だけで判定)。
export const screamerPhaseGateOk = (phaseKind: DirectorPhaseKind): boolean => phaseKind === 'gate';

// ハンター: 独自の6項目優勢判定を廃止し、退屈シグナル(バッチ1の上振れ枠)に統合。上振れ枠(+数、天井
// BORED_BONUS_MAX)を使い切ってもなお余裕(退屈)な相手にだけ、質の緊張の切り札として出す。
export const hunterBoredomReady = (boredomBonusValue: number): boolean => boredomBonusValue >= BORED_BONUS_MAX;

// 規模(撃退数)スケール。Rank/退屈が高いほど増、直近ピンチ救済が発動していたら減。1.0=既定のまま。
export const eventSizeMult = (input: {
  rank: number;
  boredomBonusValue: number;
  pityRecentlyActive: boolean;
}): number => {
  let mult = 1;
  if (input.rank >= 2) mult *= 1.25;
  if (input.boredomBonusValue >= BORED_BONUS_MAX) mult *= 1.15;
  if (input.pityRecentlyActive) mult *= 0.7;
  return mult;
};
