// ラン内でしか意味を持たない「時計」の唯一の置き場(v0.25.3084・テスト設計B)。
//
// ★なぜ要るか(実際の事故から): `gameTime` は**出撃ごとに0へ戻る**のに、間引き用の
// モジュール変数だけがラン間で持ち越されていた。結果 `gameTime(0付近) − 前ラン終盤(数十万)` が
// 大きな負数になり、**2回目以降の出撃で演出が丸ごと出なくなった**(v0.25.3070「キラキラが消えた」)。
// 1回目の出撃だけ正常に見えるので、まっさらから1ランしか回さない従来のテストでは**構造的に踏めない**。
//
// ★対策の形: gameTime基準の時計を**この1オブジェクトに集約**し、resetGame は `resetRunClocks()` を
// 1回呼ぶだけにする。フィールドを足しても**リセット側を直す必要が無い**(汎用ループで全部0にする)ので、
// 「時計を足したがリセットを忘れた」という事故が**構造的に起きない**。
// テスト(runClocks.test.ts)は「全フィールドが0に戻る」ことを Object.keys で総当たりするため、
// 将来フィールドが増えても**自動で検査対象に入る**。
//
// ★掟(新しい時計を足す人へ): **gameTime を基準にした時計はここに足す**。ファイル内に
// `let xxxLastAt = 0` を作らない。判定側は必ず `shouldEmitThrottled`(巻き戻り耐性つき)を使う
// =リセットとロジックの二重の安全弁になる。
export interface RunClocks {
  /** 冷気ブレス/三連突進の軌跡キラキラ(v0.25.3042/3049)。 */
  quadSparkle: number;
  /** スカジの氷刃の軌跡(v0.25.3071)。 */
  skadiBlade: number;
  /** スカジの氷塊テレグラフ中の冷気(v0.25.3071)。 */
  skadiIce: number;
  /** 城ボスの氷塊が中心へ凝縮するキラキラ(v0.25.3074)。 */
  iceGather: number;
  /** 氷結波の吸い込み予兆(v0.25.3079)。 */
  novaGather: number;
  /** 氷結波の発動直前のピカッ(v0.25.3079)。 */
  novaFlash: number;
}

const ZERO: RunClocks = {
  quadSparkle: 0, skadiBlade: 0, skadiIce: 0, iceGather: 0, novaGather: 0, novaFlash: 0,
};

/** ラン内の時計(gameTime基準)。**出撃をまたいで持ち越してはいけない値だけ**を置く。 */
export const runClocks: RunClocks = { ...ZERO };

/** 出撃のたびに呼ぶ(resetGame)。フィールドが増えても自動で全部戻る。 */
export const resetRunClocks = (): void => {
  for (const k of Object.keys(runClocks) as (keyof RunClocks)[]) runClocks[k] = 0;
};
