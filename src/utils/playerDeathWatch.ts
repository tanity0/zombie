/**
 * プレイヤーの死亡を「毎フレーム1箇所で」拾うための純関数(社長報告2026-08-31)。
 *
 * **なぜ要るか(実在確認・v0.25.4095)**
 * 社長報告: 「**幻影と戦ってて死んだのに、消えて動けないけど終わらない時があった。
 * その後さらに攻撃を食らったら終わった。**」
 *
 * 原因は「気絶と同時に死んだから」ではなく、**ダメージ経路ごとに死亡処理の呼び出しが要る設計**だったこと。
 * `gameStore.damagePlayer()` は「死んだか」を**返り値**で返すだけで、
 * 呼び出し側が `if (died) triggerPlayerDeath(...)` を書いて初めてゲームオーバーが走る。
 * ところが**返り値を捨てている経路が10本あった**(実在確認):
 *
 * | 捨てていた経路 | 場所 |
 * |---|---|
 * | 幻影本体の近接(致命の一撃を含む) | `phantomTick` |
 * | 幻影の分身 | `gameStore` |
 * | 幻影のドッグ / タレット / 地雷 | `useGameLoop` ×3 |
 * | 賞金首のレーザー / 鞭薙ぎ / 狙撃 / 毬回し / 手毬打ち | `bountyTick` ×5 |
 *
 * これらで死ぬと **死亡演出が出ず・`isInputLocked` が `health <= 0` を見て入力だけ死に・
 * リザルトへも行かない**(=「消えて動けないけど終わらない」)。
 * その後「返り値を見ている経路」の攻撃を食らうと、そこで初めて終わる(=社長の観察そのもの)。
 *
 * **直し方は「10箇所に書き足す」ではなく「1箇所で毎フレーム見る」**
 * (CLAUDE.md「同じ判定を2箇所に書かない」。将来ダメージ経路が増えても取りこぼさない)。
 *
 * ※ワクチンの復活(`vaccineRevives`)は `damagePlayer` の中で**HPが0に落ちる前**に処理されるので、
 * この監視が復活を潰すことはない(実在確認: `health: Math.max(1, maxHealth*0.5)` の早期return枝)。
 */

export interface PlayerDeathWatchInput {
  /** 現在のプレイヤーHP。 */
  health: number;
  /** すでに死亡処理を起動済みか(`triggerPlayerDeath` の多重発火ガードと同じ値)。 */
  alreadyTriggered: boolean;
  /** このランがクリア済みか(勝利後にHPが0になっても死亡にしない)。 */
  gameWon: boolean;
  /** 商人「帰還」などで撤収済みか。 */
  gameReturned?: boolean;
}

/** 毎フレームこれが true になったフレームで `triggerPlayerDeath` を呼ぶ。 */
export const shouldFireDeathFallback = (i: PlayerDeathWatchInput): boolean =>
  i.health <= 0 && !i.alreadyTriggered && !i.gameWon && !i.gameReturned;

/**
 * ★死亡→結果画面の送り(コード監査2026-10-23 UI B-1/B-2・社長承認)。
 * ループ(rAF)の毎フレームで見て、期限(実時間)に達した最初のフレームで1回だけ結果画面へ送る。
 * タイマーだけで送っていた頃は、重い時にタイマーが後回しにされると「死んでも終わらない」になった。
 * `dueAtMs` = 死亡確定時刻 + 正規の尺(`PLAYER_DEATH_TO_RESULT_MS`)。未予約は null。
 */
export const shouldSendDeathResult = (nowMs: number, dueAtMs: number | null, alreadySent: boolean): boolean =>
  dueAtMs !== null && !alreadySent && nowMs >= dueAtMs;

/**
 * Game.tsx の保険(HP0を見て結果画面へ送るタイマー)の尺。**正規の尺より必ず長く**して、
 * 死亡演出(寄り+スロー+余韻)を途中で切らない(旧700msは正規の2000msより先に発火して毎回演出を切っていた)。
 * 正規の経路(ループ)が何かの理由で送れなかった時だけ効く。
 */
export const DEATH_RESULT_SAFETY_EXTRA_MS = 1000;
export const deathResultSafetyMs = (regularMs: number): number => regularMs + DEATH_RESULT_SAFETY_EXTRA_MS;
