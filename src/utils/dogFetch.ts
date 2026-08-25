// ドッグ(dog サブウェポン)の「拾える物の台帳」を1箇所に閉じ込める。
//
// ★社長裁定2026-08-25「犬がそのレベルで拾うものをそのまま移せばいいと思いますが。」
// = **プレイヤーのドッグが拾える物 = 幻影のドッグが消せる物**。リストを2本持たない
// (2本あると片方だけ調整されて必ずズレる——タレット・地雷でも同じ方針を採った)。
// 仕様の正は research/SAME_ARENA.md §3-d-4。
import type { Pickup, PickupType } from '../types/game';

/**
 * ドッグが**触らない**拾い物。
 * - card-key / lab-clear-item: 任務の進行アイテム。**幻影に消されると任務が詰む**。
 *   (プレイヤー側の元の除外理由は「壁越し誤発火の防止」で違うが、外すべき物は同じ。)
 * ★このリストは**プレイヤーの犬と幻影の犬で共有**する(社長裁定2026-08-25
 *   「犬がそのレベルで拾うものをそのまま移せばいい」)。リストを2本持つと片方だけ調整されてズレるので、
 *   **1本であること自体が仕様**。だからここへ1行足すと**両側が同時に直る**。
 * - weapon-crate / chest / bounty-chest(金箱): **開ける物**なので遠隔で開けさせない。
 *   ★社長裁定2026-08-25「あー犬は箱を触らないに変更で。」——それまで**武器箱だけが除外**されており、
 *   金箱(= addPickup で武器箱が5%の抽選に当たって変化したもの)と宝箱は**素通りしていた**。
 *   同じ箱なのに抽選に当たった方だけ犬が遠隔で開けられる状態=v0.25.3644 の足し忘れ。
 *   筋は**「犬は"拾う物"を拾う。"開ける物"には触らない」**の1本。
 *   トレジャー・武器ドロップは**拾う物なので対象のまま**(箱ではない)。
 * - quick-magazine: 使う瞬間をプレイヤーが選ぶ拾い物(社長指示v0.25.2409)。
 */
export const DOG_EXCLUDED_TYPES: readonly PickupType[] = [
  'card-key', 'lab-clear-item', 'quick-magazine',
  // ★開ける物3種(社長裁定2026-08-25「犬は箱を触らない」)。weapon-crate だけが除外されていた。
  'weapon-crate', 'chest', 'bounty-chest',
];

/** 投げられて飛行中の拾い物か(着地するまでドッグは触らない)。 */
const isInFlight = (p: Pickup, nowMs: number): boolean =>
  p.throwStartAt !== undefined && p.throwDuration !== undefined && nowMs - p.throwStartAt < p.throwDuration;

export interface DogEligibleInput {
  pickups: readonly Pickup[];
  /** 中心座標(狙いを選ぶ時=主語の中心 / 消す・拾う時=目標地点)。 */
  cx: number;
  cy: number;
  radius: number;
  nowMs: number;
  /**
   * 満タンの回復を除くか。プレイヤーのドッグは「満タンなら回復を拾わない」。
   * **幻影のドッグは常に false**(相手が満タンかどうかは邪魔する側には関係ない=
   * 満タンでも消しに行く)。
   */
  skipHealth: boolean;
}

/**
 * 半径内でドッグが触れる拾い物。**狙いを選ぶ時と、着いてから触る時の両方でこの1本を通す**
 * (プレイヤー側は歴史的に2つの別々のフィルタを持っていて、狙いでは card-key を外すのに
 *  着いてからは外していなかった。幻影側はそれを持ち込まない=**同じ1本**)。
 */
export const dogEligiblePickups = ({
  pickups, cx, cy, radius, nowMs, skipHealth,
}: DogEligibleInput): Pickup[] => {
  const r2 = radius * radius;
  return pickups.filter(p => {
    if (DOG_EXCLUDED_TYPES.includes(p.type)) return false;
    if (skipHealth && p.type === 'health') return false;
    if (isInFlight(p, nowMs)) return false;
    const px = p.x + 8;
    const py = p.y + 8;
    const dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy <= r2;
  });
};
