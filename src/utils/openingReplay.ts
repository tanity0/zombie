// オープニングを毎回流さない(research/UIUX_PROPOSAL.md P7・社長承認)。
// - 一度最後まで見た(またはスキップした)端末では、起動のタップ(更新情報の OK / START)でオープニングを流さず作戦室へ直行する。
// - 初めての端末は今どおり流す。見返すのは資料室の「記録映像」から(ここは記録の読み書きと判定だけ)。
// - 記録は localStorage の1キー(更新情報の既読 'zombie.notice.seen' と同じ「zombie.<何>.seen」の型)。
//   チュートリアルの既読(utils/tutorialArchive)とは別物=混ぜない。
// - localStorage が読めない環境では「見ていない」扱い=今どおり毎回流れる(壊れない側に倒す)。

export const OPENING_SEEN_KEY = 'zombie.opening.seen';

/** この端末でオープニングを見終えた(スキップ含む)か。 */
export const loadOpeningSeen = (): boolean => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(OPENING_SEEN_KEY) === '1'; } catch { return false; }
};

/** オープニングが明けた時(最後まで/スキップ)に1回書く。 */
export const markOpeningSeen = (): void => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(OPENING_SEEN_KEY, '1'); } catch { /* 書けない環境は素通し */ }
};

/** 起動のタップでオープニングを流すか(資料室から見返す時はこの判定を通さない)。 */
export const shouldPlayOpeningOnLaunch = (seen: boolean): boolean => !seen;
