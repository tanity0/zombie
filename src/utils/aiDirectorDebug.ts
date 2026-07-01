// AIディレクターのデバッグ受け渡し用の極小バス(ステップA=読むだけ用)。
// useGameLoop が毎フレーム最新の DirectorState をここへ publish し、DirectorOverlay が自前 raf で読む。
// ストアを触らない=毎フレームの set() 追加も subscriber 起床も無し(?director=1 のデバッグ時のみ更新)。
import type { DirectorState } from './aiDirector';

let latest: DirectorState | null = null;

export const setDirectorDebug = (s: DirectorState | null) => { latest = s; };
export const getDirectorDebug = (): DirectorState | null => latest;
