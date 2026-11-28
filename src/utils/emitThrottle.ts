// 「n msに1回だけ撒く」間引き時計の純関数(v0.25.3070)。
//
// 事故(社長報告「城ボス4技達からキラキラが消えた」): 冷気ブレス/三連突進のキラキラは
// モジュール変数 `quadSparkleLastAt`(gameTime基準)で間引いていたが、**gameTime は出撃ごとに0へ戻る**
// のに変数はラン間で持ち越されていた。結果、2回目以降の出撃では
//   gameTime(0付近) - quadSparkleLastAt(前ランの終盤=数十万) = 大きな負数
// となり `>= 60` が**そのランの間ずっと偽**=キラキラが1粒も出なかった。
// (1回目の出撃だけ正常に見えるので「急に消えた」と観測される。)
//
// ここで機械化する不変条件:
//   > **時計が巻き戻ったら(=新しいラン)、間引きは必ずリセットされて即座に撒ける。**
// ラン開始時のリセット(resetGame)と二重の安全弁にする。片方を忘れても演出が消えない。
export const shouldEmitThrottled = (now: number, lastAt: number, intervalMs: number): boolean => {
  const dt = now - lastAt;
  return dt < 0 || dt >= intervalMs; // 巻き戻り(新ラン)は無条件で許可
};
