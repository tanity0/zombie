/**
 * ★構造化イベント履歴(TEST_HANDOFF/REQUEST-devbridge.md **B. P0-2 Structured Event Timeline**)。
 *
 * ★何のためか: `run-observe.mjs` は状態のポーリング差分(1秒間隔)でランを観測しているため、
 * **フレーム内で成立して消えるイベント**(カウンター成立/サブウェポン発動/強化選択肢の提示・選択/
 * 敵の湧き/ボス撃破・退去/一時停止・再開)は拾えない。この台帳はそれらを**記録するだけ**の窓。
 *
 * ★ゲートは A(testBridge.ts)と同じ `?testbridge=1`(`devTestKnobs.ts` の `TEST_BRIDGE_ACTIVE`)。
 * **無指定では1バイトも溜めない**(`recordTestEvent` は即 return)。
 * ★**ゲームの挙動を1ミリも変えない。** 記録専用の呼び出しを足すだけ。
 *
 * ★循環import回避: このファイルは `store/gameStore.ts` を一切importしない(葉モジュール)。
 * `gameTime` は呼び出し側が持っていれば直接渡し、持っていない呼び出し元(例: playerTraits.ts の
 * 記録専用フック)は `setTestEventClock` が保持する直近値にフォールバックする。この値は
 * `testBridge.ts` の既存の store 購読(`watchSignificant`)が毎回更新する(店側からこちらへの
 * 一方向のimportのみ=循環にならない)。
 */
import { TEST_BRIDGE_ACTIVE } from './devTestKnobs';

/**
 * 発注文Bが挙げた、外からは取れないイベントの種別。
 *
 * ★`dodge`(回避)は**この表に無い**。発注文Bは挙げていたが、社長が「**回避は作らない**」と
 * 明言している(2026-09-17)ので、**未実装として型に残さない**——型にだけ在って発火箇所が
 * 1つも無い種別は、観測側に「記録漏れかもしれない」と疑わせ続けるだけの負債になる
 * (実際 `results/20260917-1430-bc-verify.md` §1 で「0件。記録漏れか意図的な後回しか不明」と
 *  報告させた)。回避を作る決定が出た時に、この行ごと足す。
 */
export type TestEventType =
  | 'counter'
  | 'skillUsed'
  | 'upgradeOptions'
  | 'upgradeSelected'
  | 'enemySpawn'
  | 'bossDefeated'
  | 'paused'
  | 'resumed';

export interface TestEvent {
  /** 絶対時刻(Date.now基準)。 */
  realTime: number;
  /** ゲーム内時計(ms・gameStore.gameTime基準)。 */
  gameTime: number;
  eventType: TestEventType;
  /** 主要値(イベント種別ごとに内容が違うので緩い形で持つ・記録専用)。 */
  data?: Record<string, unknown>;
}

/** リングバッファ上限(発注文どおり5000件)。溜め続けてメモリを食わないための上限。 */
const MAX_TEST_EVENTS = 5000;

const buffer: TestEvent[] = [];

// testBridge.ts の store 購読が毎回更新する「直近の gameTime」。呼び出し側が gameTime を
// 明示的に渡さなかった時のフォールバックにのみ使う(circular import回避のための間接参照)。
let cachedGameTime = 0;

/** ★testBridge.ts 専用: 直近の gameTime を渡しておく(store 購読の中から毎回呼ぶ)。 */
export const setTestEventClock = (gameTime: number): void => {
  cachedGameTime = gameTime;
};

/**
 * イベントを1件記録する。**`TEST_BRIDGE_ACTIVE` が false の時は即 return**(オブジェクトを
 * 作ってから捨てる形にしない=通常プレイのコストは関数呼び出し1回のみ)。
 * `gameTime` を省略した呼び出し元は `setTestEventClock` の直近値を使う。
 */
export const recordTestEvent = (
  eventType: TestEventType,
  data?: Record<string, unknown>,
  gameTime?: number,
): void => {
  if (!TEST_BRIDGE_ACTIVE) return;
  buffer.push({
    realTime: Date.now(),
    gameTime: gameTime ?? cachedGameTime,
    eventType,
    ...(data ? { data } : {}),
  });
  if (buffer.length > MAX_TEST_EVENTS) buffer.splice(0, buffer.length - MAX_TEST_EVENTS);
};

/** `window.__TEST_EVENTS__` として生やす関数(A の `read` と同じ作法=呼ぶたびに現在の配列を返す)。 */
export const getTestEvents = (): readonly TestEvent[] => buffer;
