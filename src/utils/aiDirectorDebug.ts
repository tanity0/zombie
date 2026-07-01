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
export interface DirectorSample { t: number; intensity: number; performance: number; macro: DirectorMacro; }
const SAMPLE_CAP = 3000; // 0.5s刻みで約25分ぶん。超えたら古いものから捨てる。
let samples: DirectorSample[] = [];

export const recordDirectorSample = (s: DirectorSample) => {
  samples.push(s);
  if (samples.length > SAMPLE_CAP) samples.shift();
};
export const getDirectorSamples = (): DirectorSample[] => samples;
export const resetDirectorSamples = () => { samples = []; };
