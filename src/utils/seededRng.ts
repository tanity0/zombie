/**
 * ★ランの再現性のための乱数(TEST_HANDOFF/REQUEST-devbridge.md **C. P0-3 の seed**)。
 *
 * ★何のためか: 敵の湧きが毎回違うと、**版どうしの比較も、雑魚AI強化の前後比較も成立しない**
 * (発注文Cの狙いそのもの)。同じ seed なら**同じ敵が同じ順で同じ場所に出る**ようにする。
 *
 * ★**通常プレイの挙動は1ビットも変わらない。**
 * `?seed=` が無ければ返すのは **`Math.random` そのもの**なので、呼ばれる関数が同一。
 * 「seed化すると難度カーブが変わる」は、**固定seedを通常プレイで強制した場合**の話であって、
 * この形では構造的に起こらない。
 *
 * ★**系統ごとに独立した流れを持つ**(`salt`)。ここを共有にすると、後から別の系統
 * (例: ドロップ)を seed 配下に足した瞬間に、**同じseedでも敵の湧きの並びが変わる**——
 * つまり**過去に撮った比較が全部使えなくなる**。系統を足しても既存の系統が動かないようにする。
 *
 * ★**seedが揃っても「完全再現」にはならない**(実測で確認した範囲):
 *  ①ボット(`playtestDriver.ts`)がクリット判定・回避抽選・台本抽選で素の `Math.random()` を使う
 *   =**プレイヤー側の行動が毎回違う**
 *  ②個体差の種が `id + spawnedAt`(`chaffMoves.ts`)なので、**湧く時刻が1ms違うと個体差が変わる**
 *  ③フレームレート差(ヘッドレス3fps / 実機60fps)で `deltaTime` が変わる
 * ⇒ **買えるのは「同じ敵が同じ順で同じ場所に出る」まで。** それで比較の土台は立つが、
 *   「戦闘の結果まで一致する」とは**言わないこと**(期待を間違えると「seedが効いていない」になる)。
 */
import { mulberry32 } from './botUpgradePolicy';
import { DEV_SEED_PARAM } from './devTestKnobs';

/** 系統名 → 独立した流れ。`salt` は系統ごとに違う整数へ畳む(同じ名前なら同じ流れ)。 */
const saltOf = (name: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
};

interface SeededStream { (): number; reset: () => void }

const streams: SeededStream[] = [];

/**
 * 系統ぶんの乱数を1本作る。**`?seed=` が無ければ `Math.random` をそのまま返す**
 * (=通常プレイでは分岐すら通らない)。
 * 返り値には `reset()` が生えており、**ランの開始時に呼ぶと同じ列の頭へ戻る**
 * (1ページで2回出撃しても、2回目が同じ並びになる)。
 */
export const makeSeededRng = (name: string): SeededStream => {
  if (DEV_SEED_PARAM === null) {
    const passthrough = (() => Math.random()) as SeededStream;
    passthrough.reset = () => {};
    return passthrough;
  }
  const seed = (DEV_SEED_PARAM ^ saltOf(name)) >>> 0;
  let inner = mulberry32(seed);
  const fn = (() => inner()) as SeededStream;
  fn.reset = () => { inner = mulberry32(seed); };
  streams.push(fn);
  return fn;
};

/**
 * ★湧きの**意思決定**の系統(台本の抽選・チャフの型抽選・パンプキン枠の実体化)。
 *
 * ★なぜ `spawn`(enemyUtils)と別の流れなのか: enemyUtils の `spawn` は「選ばれた型を
 * どこに・どんな色で置くか」を引く流れで、**引く回数が配置の都合で変わる**。
 * 「**どの型を出すか**」を同じ流れに載せると、配置側の都合で型の並びが動いてしまう。
 * 系統を割るのは `makeSeededRng` の設計思想(ファイル冒頭)そのまま。
 *
 * ★ここに載っている実際の呼び出し元(2026-09-17時点・数えたもの):
 *  - `directorTick.ts` 台本ローテーション(`selectRotationPattern` の2値)
 *  - `directorTick.ts` 盤面維持の抽選(`decideNextSpawn` の `tieBreakRandom` → `pickChaffType`)
 *  - `drillerAi.ts` `resolvePumpkinTier` の既定 rand(pumpkin/driller/logger の実体化)
 */
export const directorRng = makeSeededRng('director');

/** ★ランの開始時に全系統を頭へ戻す(`?seed=` 未指定なら何もしない)。 */
export const resetSeededRngs = (): void => { for (const s of streams) s.reset(); };

/** いま seed が効いているか(テストブリッジの報告用)。 */
export const isSeededRun = (): boolean => DEV_SEED_PARAM !== null;
