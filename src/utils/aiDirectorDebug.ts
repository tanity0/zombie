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

// ---- 戦力マージン(難易度③・案0「まず数字を画面に出す」・社長指示v0.25.3530) ----
// **読むだけ**の窓。挙動は1ミリも変えない。
//
// なぜ要るか: 難易度③(戦力連動escalation)は「実PP ÷ その時刻の期待PP」が **1.1倍**を超えた分だけ
// 働くが、**期待PPは1分あたり4.2ずつ上限なく伸びる**のに対し、実PPは5項目のうち3つ(装備数/スキル数/
// 最大HP)に上限がある。結果、通常プレイ(5〜7分)ではマージンが1.1に届かず、**このレバーは事実上
// 一度も立ち上がっていない**(research/DIRECTOR_METRICS.md の「有意差なし」の主因)。
// **較正されていない数字を実測せずにいじるのは博打**なので、まず「今いくつなのか」を出す。
export interface DirectorPowerReadout {
  /** 実PP(プレイヤー戦力指数)。 */
  pp: number;
  /** その時刻に「順調なビルド」が持つはずのPP。 */
  expected: number;
  /** pp / expected(0.5〜3にクランプ済み)。**1.1を超えて初めて escalation が動く**。 */
  margin: number;
  /** 実際に湧きへ渡っている escalation(0..1)。 */
  esc: number;
}
let power: DirectorPowerReadout | null = null;
export const setDirectorPower = (p: DirectorPowerReadout | null) => { power = p; };
export const getDirectorPower = (): DirectorPowerReadout | null => power;
/** escalation が動き始める境目(difficultyScaler.ts の DDA_MARGIN_DEADBAND と同値。表示専用)。 */
export const DIRECTOR_MARGIN_DEADBAND = 1.1;

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
  named: 64,      // PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)出現中(生存中)
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
  // PACING_PUZZLE.md §5.8(M6追補3): パズルON時のコマ種別。リザルトのBUILD/PEAK/RELAX集計を
  // コマ基準で数えるために記録する(?puzzle=0/旧経路では undefined=従来のマクロ分類で数える)。
  komaKind?: 'relax' | 'harvest' | 'normal' | 'peak';
  // 案0(v0.25.3530): 戦力マージンと escalation の時系列。リザルトで「一度でも1.1に届いたか」を見る。
  ppMargin?: number;
  buildEsc?: number;
}
const SAMPLE_CAP = 3000; // 0.5s刻みで約25分ぶん。超えたら古いものから捨てる。
let samples: DirectorSample[] = [];

export const recordDirectorSample = (s: DirectorSample) => {
  samples.push(s);
  if (samples.length > SAMPLE_CAP) samples.shift();
};
export const getDirectorSamples = (): DirectorSample[] => samples;
export const resetDirectorSamples = () => { samples = []; };
