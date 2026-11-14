// シールドの熟練度: 防いだ1回ごとに 'shield' へ足す(社長裁定2026-11-12「案A」)。
//
// ★依存の少ない葉(store/React/PixiJS を読まない)。読むのは masteryRun(記録の道)と shieldGuardFx(技の切れ目の間隔)だけ。
// シールドバッシュの与ダメで貯まる分(gameStore の swingMasteryHits の key:'shield')とは別に足す=両方で貯まる。
// 記録の道はドッグの拾った数(utils/dogFetch.noteDogFetchMastery)と同じ=masteryRun.noteMasteryDamage
// (出撃中の pending → リザルトの MASTERY / 報告用の表・`?masterydbg=1`)。区分の重みは掛けない。
//
// 「1つの攻撃で1回」の数え方(既存の防ぐ処理の数え方に合わせる):
//  ・技(範囲・帯・突進・光線・飛ぶ刃・継続技)= 盾の演出が使う「技の1回」のキー(攻撃者の id+技の始まり/無ければ型)。
//    同じキーが TECHNIQUE_GAP_MS(=演出が大きな衝撃を1度だけ出す関門と同じ間隔)以内に続く間は数えない。
//    毎フレーム来る光線は当たり続けている間1回。
//  ・敵弾 = 撃った個体の id+撃った時刻(createdAt)。散弾の粒は同じ1発から同じ時刻で作られる=1回。
//  ・突進・跳びかかり = 当たった瞬間に技が止まる(その場で recover へ移る)=積まれた1件が1回。
// 守護霊・幻影の盾では呼ばない(呼び手が盾の持ち主 shieldOwnerKind==='player' を確かめる)。
import { noteMasteryDamage } from './masteryRun';
import { TECHNIQUE_GAP_MS } from './shieldGuardFx';

/** シールドが防いだ1回で 'shield' へ足す量(叩き台)。 */
export const SHIELD_MASTERY_XP_PER_BLOCK = 300;

/** 盾として読む欄(projectiles の一部)。プレイヤー本人の盾か。 */
export const isPlayerShield = (p: { weaponType?: string; shieldOwnerKind?: string; hostile?: boolean } | null | undefined): boolean =>
  !!p && p.weaponType === 'shield' && p.hostile !== true && p.shieldOwnerKind === 'player';

/** キー → 最後にそのキーで防いだ時刻(ms)。 */
const lastBlockAt = new Map<string, number>();

/** 出撃の始まり(resetGame)で空にする。 */
export const resetShieldBlockMastery = (): void => { lastBlockAt.clear(); };

/**
 * 「新しい攻撃の防ぎ」か(状態を更新して返す)。同じキーが gapMs 以内に続く間は false。
 * key が無い時は '?' として同じ規則で数える(呼び手が型も id も渡さない防ぎ=毎フレーム来ても二重に数えない)。
 */
export const takeShieldBlock = (key: string | undefined, nowMs: number, gapMs: number = TECHNIQUE_GAP_MS): boolean => {
  const k = key ?? '?';
  const last = lastBlockAt.get(k);
  lastBlockAt.set(k, nowMs);
  if (lastBlockAt.size > 64) for (const old of [...lastBlockAt.keys()].slice(0, 32)) if (old !== k) lastBlockAt.delete(old);
  return last === undefined || nowMs - last > gapMs;
};

/** プレイヤーの盾が攻撃を1つ防いだ時に呼ぶ。同じ攻撃の続きなら何もしない。足したら true。 */
export const noteShieldBlockMastery = (key: string | undefined, nowMs: number, gapMs?: number): boolean => {
  if (!takeShieldBlock(key, nowMs, gapMs)) return false;
  noteMasteryDamage('shield', SHIELD_MASTERY_XP_PER_BLOCK);
  return true;
};

/** 敵弾の「1発」のキー(散弾の粒は同じ1発=同じ撃ち手・同じ作られた時刻)。 */
export const enemyBulletBlockKey = (b: { id: string; ownerId?: string; ownerType?: string; createdAt?: number }): string =>
  b.ownerId !== undefined || b.ownerType !== undefined
    ? `bullet:${b.ownerId ?? b.ownerType}:${b.createdAt ?? b.id}`
    : `bullet:${b.id}`;
