// ステージ7 グレンの変身の場面の空き地(社長指示2026-11-25「木はグレンの前に生やさない」・research/GLEN_TRANSFORM.md)。
//
// 方式は poiClearings / destructibles と同じ「world 層のモジュール状態」: 咆哮の瞬間に決まるグレンの足元(=第一形態の箱の足元)の
// **周り(前後左右)**で、絵がグレン(人間の姿・第一形態)に掛かる木と松明のキーをここへ入れる(社長指示2026-11-25
// 「グレン、登場の時点で近くに生やさないで」=奥の木もグレンのすぐ後ろに大きく被さって見えるので、奥か手前かを問わない)。
// treesInRegion / torchesInRegion がこのキーを欠番にする=**描画・当たり判定・湧き回避が同じ1点で同時に消える**。
// 置き場所の計算(選び直し)には触れない=周りの木が別の位置へ生え替わらない(壊された木と同じ扱い)。
// 絵が守る矩形に掛からない遠い木は残す。
//
// 消える木・松明は、その時画面に見えていてもパッと消さない(慣性の掟): 描画が glenClearingFadeK で短くフェードアウトさせる
// (時間停止の中なので実時間で測る)。当たり判定は空き地を作った時点で消える(時間が止まっているので誰も動かない)。
// 空き地はその出撃の間ずっと残す(戦闘中に生え戻らない)。resetGame が clearGlenClearing で消す。
//
// RENDERER-AGNOSTIC: PixiJS を import しない。木・松明の生成(trees.ts / torches.ts)はここを読む側=ここからは import しない
// (循環を作らない)。どの木を消すかを選ぶのは glenClearingPick.ts。
import type { Rect } from './obstacles';

/**
 * 守る絵の矩形(グレンの足元から・遠近を掛ける前の world px)。人間のグレン(体の高さ約108・幅約84)と
 * 第一形態の絵(当たり判定 120×120 の2倍化ボス・絵は箱より大きく出る)を両方含む大きさ。
 * 値は描画の実測(スマホ 430×932 の場面の寄りで、第一形態の絵の外接矩形 ≒ 幅340×高さ260 world px 相当)に余白を足したもの。
 */
export const GLEN_CLEAR_PROTECT_HALF_W = 200;
export const GLEN_CLEAR_PROTECT_H = 330;
/**
 * 木・松明の絵を大きめに見る倍率(足元を支点)。遠近で描かれる大きさが変わるので、scale 1 の treeArtRect のままだと
 * 描かれた絵がはみ出して掛かる。描画の遠近の上限(物の手前の最大 1.7〜1.85)を見込む(奥の物にも同じ倍率=大きめに見て弾く側へ倒す)。
 */
export const GLEN_CLEAR_NEAR_K = 1.85;
/**
 * 消える木・松明のフェードの長さ(実時間 ms)。場面の開始(=人間のグレンが現れ始める時刻)から、人間のグレンが現れ切る
 * utils/glenIntro.GLEN_TF_APPEAR_MS(450)までに消え切る=現れ切った時にはもう見えない(テストで固定)。
 */
export const GLEN_CLEAR_FADE_MS = 450;

/** 守る絵の矩形(足元を下辺の中心に)。 */
export const glenClearProtectRect = (footX: number, footY: number): Rect => ({
  x: footX - GLEN_CLEAR_PROTECT_HALF_W,
  y: footY - GLEN_CLEAR_PROTECT_H,
  width: GLEN_CLEAR_PROTECT_HALF_W * 2,
  height: GLEN_CLEAR_PROTECT_H,
});

/** 足元 (fx, fy) を支点に絵の矩形を k 倍した矩形。 */
export const scaleArtAboutFoot = (art: Rect, fx: number, fy: number, k: number): Rect => ({
  x: fx + (art.x - fx) * k,
  y: fy + (art.y - fy) * k,
  width: art.width * k,
  height: art.height * k,
});

/**
 * 足元 (propFootX, propFootY)・絵の矩形 art の物が、グレンの足元 (glenFootX, glenFootY) のグレンの絵に掛かるか(=空き地で弾くか)。
 * 奥か手前かを問わず、遠近を見込んで大きめにした絵が守る絵の矩形に掛かれば弾く。
 */
export const glenClearHides = (art: Rect, propFootX: number, propFootY: number, glenFootX: number, glenFootY: number): boolean => {
  const a = scaleArtAboutFoot(art, propFootX, propFootY, GLEN_CLEAR_NEAR_K);
  const p = glenClearProtectRect(glenFootX, glenFootY);
  return a.x < p.x + p.width && a.x + a.width > p.x && a.y < p.y + p.height && a.y + a.height > p.y;
};

/** フェードの残り(1=まだ消え始めていない・0=消え切った)。ease-in-out(動き始めと止まりに加減速)。 */
export const glenClearFadeKAt = (elapsedMs: number): number => {
  if (elapsedMs <= 0) return 1;
  const t = elapsedMs / GLEN_CLEAR_FADE_MS;
  if (t >= 1) return 0;
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return 1 - e;
};

// ---- モジュール状態(その出撃の空き地) ----
let treeKeys = new Set<string>();
let torchIds = new Set<string>();
/** 消える木(フェードの間だけ描画が足して描く・生成の形のまま持つ)。 */
let fadingTrees: readonly unknown[] = [];
let startedAtReal = 0;

/** 空き地を作る(glenClearingPick.applyGlenClearing が呼ぶ)。startedAt=場面の開始の実時間(フェードの起点)。 */
export const setGlenClearing = (trees: readonly { key: string }[], torches: readonly { id: string }[], startedAt: number): void => {
  treeKeys = new Set(trees.map(t => t.key));
  torchIds = new Set(torches.map(t => t.id));
  fadingTrees = trees.slice();
  startedAtReal = startedAt;
};

/** 空き地を消す(resetGame)。 */
export const clearGlenClearing = (): void => {
  treeKeys = new Set();
  torchIds = new Set();
  fadingTrees = [];
  startedAtReal = 0;
};

/** 空き地で消えた木か(空き地が無い出撃は常に false=負荷ゼロ)。 */
export const isGlenClearedTree = (key: string): boolean => treeKeys.size > 0 && treeKeys.has(key);
/** 空き地で消えた松明か。 */
export const isGlenClearedTorch = (id: string): boolean => torchIds.size > 0 && torchIds.has(id);
/** 空き地が在るか(描画の早見)。 */
export const hasGlenClearing = (): boolean => treeKeys.size > 0 || torchIds.size > 0;

/** 消える物のフェードの残り(実時間 realNow で)。空き地が無ければ 1。 */
export const glenClearingFadeK = (realNow: number): number =>
  hasGlenClearing() ? glenClearFadeKAt(realNow - startedAtReal) : 1;

/** フェードの間だけ、消える木(生成の形)を返す。消え切ったら空。描画が treesInRegion の結果に足して描く。 */
export const glenClearingFadingTrees = <T>(realNow: number): readonly T[] =>
  (fadingTrees.length > 0 && glenClearingFadeK(realNow) > 0 ? fadingTrees : []) as readonly T[];
