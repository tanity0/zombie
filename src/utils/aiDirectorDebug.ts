// AIディレクターのデバッグ受け渡し用の極小バス(ステップA=読むだけ用)。
// useGameLoop が毎フレーム最新の DirectorState をここへ publish し、DirectorOverlay が自前 raf で読む。
// ストアを触らない=毎フレームの set() 追加も subscriber 起床も無し(?director=1 のデバッグ時のみ更新)。
//
// あわせて「ラン中の時系列サンプル」もここでリングバッファに溜める(リザルト画面のタイムライン/難易度スコア用)。
// 数字を見ながらプレイするのは無理なので、プレイ後に曲線で振り返れるようにする(社長指示)。
import type { DirectorState, DirectorMacro } from './aiDirector';

let latest: DirectorState | null = null;

export const setDirectorDebug = (s: DirectorState | null) => { latest = s; };
export const getDirectorDebug = (): DirectorState | null => latest;

// ---- 時系列サンプル(リザルトのタイムライン/スコア用) ----
// バッチ2.5(診断計測・v0.25.1312): 実機確認①の原因分析(固定タイマー起因のイベント/ハンターが
// gatePressureと無関係に体感を支配していた)を、リザルト画面だけで追えるように4フィールド追加。
// 挙動は一切変えない(記録と表示のみ)。
export type DirectorPhaseKind = 'buildup' | 'gate' | 'boss';
// 発火中イベントのビットフラグ。複数同時は基本無い想定だが、記録側は素直にORするだけ。
export const DIRECTOR_EVENT_BIT = {
  arena: 1,      // 囲い系(horde/boss/rescue、activeEvent非null)
  hunter: 2,      // ハンター(索敵〜追跡〜撤退)
  redNight: 4,    // 紅き月(phase==='active')
  screamer: 8,    // 叫喚型(生存中)
  reaper: 16,     // リーパー(終盤エンティティ、生存中)
  castleBoss: 32, // 城ボス(bossSpawned後)
} as const;
export interface DirectorSample {
  t: number;
  intensity: number;
  performance: number;
  macro: DirectorMacro;
  phaseKind: DirectorPhaseKind;
  pressure: number | null; // gate中のgatePressure値。緩フェーズ中はnull。
  areaIdx: number;         // プレイヤーの現在エリア(0-4)
  events: number;          // DIRECTOR_EVENT_BIT のOR
  debt: number;            // バッチ3.5-B: 盤面在庫(boardDebt)。記録のみ・挙動には影響しない。
  upswing: number;         // 診断up+N線(バッチ1退屈シグナルの上振れ枠。0-BORED_BONUS_MAX)。記録のみ。
  // PACING_PUZZLE.md バッチM2(§3-D): 本方式(?puzzle=0以外)ON時のみ設定。旧経路(?puzzle=0)は
  // undefinedのまま=リザルトのランク階段線は本方式のランのみ描画される。
  puzzleRank?: number;
  boardTarget?: number;
}
const SAMPLE_CAP = 3000; // 0.5s刻みで約25分ぶん。超えたら古いものから捨てる。
let samples: DirectorSample[] = [];

export const recordDirectorSample = (s: DirectorSample) => {
  samples.push(s);
  if (samples.length > SAMPLE_CAP) samples.shift();
};
export const getDirectorSamples = (): DirectorSample[] => samples;
export const resetDirectorSamples = () => { samples = []; };
