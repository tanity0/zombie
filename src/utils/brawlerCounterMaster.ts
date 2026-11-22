// ★格闘のときのスキル「カウンターマスター」(社長指示2026-11-22「カウンターマスター 格闘では変えず技が変更以下
//  雑魚:土竜に変更 ボス:気功を2連発に変更 30%はつける」→ 確認「受けた直後に自動で反撃」)。純関数だけ(store が読んで書く)。
//  - 格闘のときは、カウンター成立時の「待ち時間の前倒し」と「周りの吹き飛ばし」を付けない(格闘以外は今まで通り)。
//  - 代わりに、構えで受けてカウンターが決まった瞬間に、自動で反撃の技を出す(技ポイントは使わない):
//      受けた相手が雑魚・強個体 → 土竜(地割りの派生・代金なし) / ボス級・終端・相手が分からない → 気功の二連発(反撃の気功を2発)。
//  - 覚醒(Lv3)の成立後3秒・全攻撃+30% は格闘でも付く(Lv3のみのまま=counterMasterAwakenBuffPatch は今どおり)。
// 区分は構えの成立の効果と同じ物差し(brawlerGuard.brawlerGuardSourceClass)。ここで作り直さない。
import type { BrawlerGuardClass } from './brawlerGuard';

/** 自動の反撃。mogura=土竜 / kiko2=気功の二連発 / null=出さない(今までの構えの効果のまま)。 */
export type BrawlerCounterMasterReply = 'mogura' | 'kiko2' | null;

/** 気功の二連発の発数。 */
export const BRAWLER_CM_KIKO_SHOTS = 2;
/** 1発目から2発目までの間(ms・実時間=反撃の気功の予約と同じ時計)。 */
export const BRAWLER_CM_KIKO_GAP_MS = 160;

/** 格闘のときはカウンターマスターの「待ち時間の前倒し」と「周りの吹き飛ばし」を付けない。 */
export const counterMasterSkipsRefundAndBlow = (brawlerMode: boolean): boolean => brawlerMode;

/**
 * 構えで受けてカウンターが決まった瞬間の自動の反撃。
 *  - 格闘でない・カウンターマスター未所持・成立していない(弱い構え=counter が false)・間引きの受け・持続ダメージ → null。
 *  - 受けた相手にボス級・終端(浮かない区分)が1件でも居る → 'kiko2'(ボスを優先。近くの雑魚へ土竜を出してボスの前で構えを終えない)。
 *  - それ以外で雑魚・強個体が1件でも居る → 'mogura'。
 *  - 相手が1件も分からない → 'kiko2'(受けた点の方向へ撃つ)。
 * 弾を受けた時は出さない(社長指示2026-11-13「弾を受けてもカウンターモードは解除しない。その後の連動技も発動しない」に揃える)。
 */
export const brawlerCounterMasterReply = (o: {
  brawlerMode: boolean; counterMasterLv: number; counter: boolean; throttled: boolean; dot?: boolean; projectile?: boolean; classes: readonly BrawlerGuardClass[];
}): BrawlerCounterMasterReply => {
  if (!o.brawlerMode || !(o.counterMasterLv > 0) || !o.counter || o.throttled || o.dot || o.projectile) return null;
  if (o.classes.some(c => c === 'boss' || c === null)) return 'kiko2';
  if (o.classes.some(c => c === 'mob' || c === 'strong')) return 'mogura';
  return 'kiko2';
};

/** 気功の二連発を予約するか。構え1回(guardSince ごと)に1度だけ(通常の反撃の気功と同じ数え方・弾の受けでも出す)。 */
export const brawlerCounterMasterKikoDue = (guardSince: number | undefined, firedFor: number | undefined): boolean =>
  guardSince !== undefined && firedFor !== guardSince;

/** 予約した反撃の気功を1発撃った後の予約。残りがあれば間を置いた次の時刻、無ければ undefined。left 未指定=1発(通常の反撃の気功)。 */
export const brawlerCounterKikoAfterShot = <R extends { at: number; left?: number }>(r: R): R | undefined => {
  const left = r.left ?? 1;
  return left > 1 ? { ...r, at: r.at + BRAWLER_CM_KIKO_GAP_MS, left: left - 1 } : undefined;
};
