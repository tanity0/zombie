/**
 * ★雑魚の「軽い攻撃」の予告を流星ラインにする(社長指示2026-09-17
 * 「**雑魚の軽い攻撃の予告は赤ラインの流星にする**」/ 色分けは社長承認2026-09-17「提案通りで」)。
 *
 * ここまでの雑魚の予告は「**本体が光るだけ**」(§12の噛みつき=紫の点滅 / §16の技=赤の加算グロー)で、
 * **どの方角の、どの点を狙われているのかが画面に1つも出ていなかった**。ボス側には既に流星ライン
 * (溜めと同期して伸び、技の出始めに描き切り、根元から消え、**消え切った瞬間が判定**)があるので、
 * その文法をそのまま雑魚へ降ろす。
 *
 * ★色(CLAUDE.md「色と形の文法」・社長承認2026-09-17):
 *   **赤=カウンターできる技**(コウモリの掴み/スケルトンの噛み/ゾンビの2連)
 *   **紫=カウンターできない攻撃**(§12の噛みつき)
 *   **線の形は共通**。出どころは `BiteSpec.counterable` の1箇所=判定と色が必ず一対になる。
 *
 * ★線の終点は「**狙っている点**」(CLAUDE.md 攻撃ヴィジュアルの2分類①=判定に揃える)。
 * 終点 = 発火時の敵の中心 + 向き × (踏み込み距離 + 接触距離)。
 * 踏み込み距離は `biteLungeDistanceAtFire`(=発火時の中心間距離 − 接触距離)で焼かれているので、
 * **この終点は「発火の瞬間にプレイヤーが立っていた点」と厳密に一致する**(§16の3体)。
 * 踏み込みを焼かない敵(§12の既定)でも、敵は `lungePx` ぶん前へ出て体が重なったら当たりなので、
 * **その先は安全**=終点は同じ式で正しい。
 *
 * ★「赤いのに当たらない/赤くないのに当たる」を作らないための線引き: これは**線**であって
 * **面ではない**。危険域の広さは主張せず、「**この方角の、この点に、この瞬間に来る**」だけを言う。
 */
import type { Enemy } from '../types/game';
import { biteSpecFor, bitePhaseOf, biteProgress, biteLungeFrac, BITE_CONTACT_DIST_PX } from './enemyBite';
import { enemyContactBox } from './collisionUtils';
import { isTrueBossType } from './enemyUtils';

/** プレイヤーの当たり判定の半幅(PLAYER_HITBOX=28 の半分)。enemyBite.ts の接触距離の導出と同じ値。 */
const PLAYER_HALF_PX = 14;

/**
 * 接触距離(=この距離まで詰めれば体が重なる)。§16の3体は実測から置いた台帳の値
 * (`BITE_CONTACT_DIST_PX`)、それ以外は当たり判定の箱から同じ式で導く
 * (どの向きから来ても安全側=短い方の軸を採る)。
 */
export const biteContactDistPx = (e: Enemy): number => {
  const known = (BITE_CONTACT_DIST_PX as Partial<Record<Enemy['type'], number>>)[e.type];
  if (known !== undefined) return known;
  const b = enemyContactBox(e);
  return Math.min(b.width, b.height) / 2 + PLAYER_HALF_PX;
};

export interface BiteTelegraphLine {
  /** 始点(=発火時の敵の中心。踏み込みで敵が動いても線は動かない)。 */
  fx: number; fy: number;
  /** 終点(=狙っている点)。 */
  tx: number; ty: number;
  /** 溜め〜噛みの通し進捗 0..1。**1=判定の瞬間**(ここで線が消え切る)。 */
  prog: number;
  /** 描き切る位置(=溜めの割合)。溜めが終わる=踏み込みが始まる瞬間に線が満ちる。 */
  drawFrac: number;
  /** 判定までの残り(ms)。中断の検知に使う(dashLineTick の remainMs)。 */
  remainMs: number;
  /** カウンターできるか。**true=赤 / false=紫**(色の出どころはここ1箇所)。 */
  counterable: boolean;
}

/**
 * 予告の線を引く(出さない時は null)。**雑魚の軽い攻撃だけ**——本物のボスと城ボスは
 * 自前の予告(帯・円・専用ライン)を既に持っているので対象外(予告を二重に出さない)。
 */
export const biteTelegraphLine = (e: Enemy, gameTime: number): BiteTelegraphLine | null => {
  if (isTrueBossType(e.type) || e.type === 'giantbat') return null;
  const phase = bitePhaseOf(e, gameTime);
  if (phase === 'none') return null;
  const dirX = e.biteDirX, dirY = e.biteDirY;
  if (dirX === undefined || dirY === undefined) return null;
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  const total = spec.windupMs + spec.biteMs;
  if (total <= 0) return null;
  const lp = e.biteLungePx ?? spec.lungePx;
  // 踏み込みで既に進んだぶんを引き戻して、**発火時の中心**を復元する(線を世界に固定するため。
  // 新しい状態を持たずに済む=`biteLungeFrac` が同じ曲線を知っている)。
  const frac = biteLungeFrac(e, gameTime);
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
  const fx = ecx - dirX * lp * frac, fy = ecy - dirY * lp * frac;
  const reach = lp + biteContactDistPx(e);
  return {
    fx, fy,
    tx: fx + dirX * reach, ty: fy + dirY * reach,
    prog: biteProgress(e, gameTime),
    drawFrac: spec.windupMs / total,
    remainMs: Math.max(0, (e.biteAt ?? gameTime) + total - gameTime),
    counterable: spec.counterable,
  };
};
