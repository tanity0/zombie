// ★生存時間(gameStats.timeAlive)の書き込みを「1秒に1回」へ(コード監査2026-10-23 SIM S-2 / UI B-3・社長承認)。
//
// なぜ: ループが毎tick `updateGameStats({timeAlive})` を呼ぶと `gameStats` が毎フレーム新しい参照になり、
// ストアの購読者を毎フレーム起こしていた。表示に使うのはリザルトの「生存時間」とスコア計算だけなので、
// **途中は秒が変わった時だけ**書く。
//
// ★リザルトの値:
// - 勝利・帰還・ベンチ: 結果画面へ移る瞬間に `flushTimeAlive` が**最後のtickの値**を書く(毎tick書いていた頃と同じ値)。
// - 死亡: **死んだ瞬間の値**(`freezeTimeAliveAtDeath`)。死亡演出(寄り+スロー・約2秒)を最後まで見せるようになった
//   (同監査 B-1)ので、その間もゲーム時間は進む。演出の間を生存時間・スコアに数えない(仕様=死んだ時点の生存時間・品質監査6)。
// ここは store を import しない(循環importの網を増やさない)。呼び出し側が getState を渡す。

let latest: { gameTimeMs: number; sec: number } | null = null;
/** 死亡で固定した値。同じ出撃の間(gameTime が固定時刻以上)は、これより後の値を記録しない。 */
let frozen: { gameTimeMs: number; sec: number } | null = null;

/** 秒(整数部)が変わった時だけ store へ書く(純関数)。巻き戻り(新しい出撃)でも書く。 */
export const timeAliveWriteDue = (writtenSec: number, nextSec: number): boolean =>
  Math.floor(writtenSec) !== Math.floor(nextSec) || nextSec < writtenSec;

/**
 * ループが毎tick呼ぶ。`gameTimeMs` はこのtickを進めた後の store.gameTime(出撃の取り違え防止の鍵)、
 * `sec` は従来どおり書いていた値(`gameTime / 1000`)。返り値=store へ書いてよい値(死亡で固定中は null)。
 */
export const noteTimeAlive = (gameTimeMs: number, sec: number): number | null => {
  if (frozen) {
    if (gameTimeMs >= frozen.gameTimeMs) return null; // 死亡の後(演出の間)は数えない
    frozen = null; // gameTime が戻った=新しい出撃
  }
  latest = { gameTimeMs, sec };
  return sec;
};

/**
 * 死亡の瞬間に呼ぶ。`gameTimeMs` はその時の store.gameTime、`sec` は生存時間(秒)。
 * 以後この出撃では記録を進めず、`flushTimeAlive` はこの値を書く。
 */
export const freezeTimeAliveAtDeath = (gameTimeMs: number, sec: number): void => {
  frozen = { gameTimeMs, sec };
  latest = frozen;
};

/**
 * リザルトへ書くべき値(純関数)。書く必要が無ければ null。
 * `storeGameTimeMs` が記録時より小さい=別の出撃(resetGame 後)の値なので書かない。
 */
export const pendingTimeAlive = (
  rec: { gameTimeMs: number; sec: number } | null,
  storeGameTimeMs: number,
  writtenSec: number,
): number | null => {
  if (!rec) return null;
  if (storeGameTimeMs < rec.gameTimeMs) return null;
  return rec.sec !== writtenSec ? rec.sec : null;
};

/** リザルトへ移る直前に呼ぶ。最後のtickの値を store へ書く(従来の毎tick書き込みと同じ値になる)。 */
export const flushTimeAlive = (
  getState: () => { gameTime: number; gameStats: { timeAlive: number }; updateGameStats: (s: { timeAlive: number }) => void },
): void => {
  const s = getState();
  const v = pendingTimeAlive(latest, s.gameTime, s.gameStats.timeAlive);
  if (v !== null) s.updateGameStats({ timeAlive: v });
};

/** テスト用: 記録を捨てる。 */
export const resetTimeAliveSyncForTest = (): void => { latest = null; frozen = null; };
