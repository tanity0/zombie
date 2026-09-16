import type { EnemyType } from '../types/game';
import { isBossType } from './enemyUtils';

/**
 * ★敵の被弾しなり(のけぞり)の**強さ**を、そのヒットのダメージから決める(社長裁定2026-09-16「0.15から」)。
 *
 * 社長の言葉: 「**これダメージによって仰け反り方が弱くなるんじゃなかったの? ほかにもスリップダメージあるけど**」。
 *
 * v0.25.4374 までは **チャネル(`damageChannel==='dot'`)で丸ごと除外**していた。これは
 * ①新しい持続ダメージを足した人が箱への登録を忘れると同じ事故が再発する
 * ②`'dot'` は本来「**画面を揺らさない**」の箱で、犬の噛みつき・タレットの爆風・守護霊のナイフ・
 *   味方の射撃という**単発の打撃まで一緒に入っている**(それらまで無反応になっていた)
 * という2つの弱さがあった。⇒ **量で決める**形へ置き換える。延焼の1tickは自然に小さくなり、
 * 犬の噛みつきは量なりに出る。**箱への登録がそもそも要らなくなる。**
 *
 * ★ボス・強個体(`isBossType`)は対象外=**満額のまま**。社長の
 * 「**敵は体勢値、プレイヤーは無敵時間があるので分けないとあかん**」のとおり、この層は体勢値が
 * 別に効いている。しかも1発が最大HPの数%しか無いので、この式を掛けると常時ほぼ下限に張り付く。
 */

/** これ以上のダメージ(最大HPに対する割合)で満額のけぞる。 */
export const FLINCH_FULL_DAMAGE_FRAC = 0.15;
/** どんなに小さいダメージでも残る最低限の強さ(社長裁定2026-09-16「0.15から」)。0にすると完全無反応。 */
export const FLINCH_MIN_STRENGTH = 0.15;

/**
 * ダメージ量 → しなりの強さ(0〜1)。`damage` が未記録(まだ1度も殴られていない個体など)は
 * 従来どおり満額の1を返す=情報が無い時に弱める、という賭けをしない。
 */
export const flinchStrengthOf = (damage: number | undefined, maxHealth: number): number => {
  if (damage === undefined) return 1;
  const frac = Math.max(0, damage) / Math.max(1, maxHealth);
  return Math.min(1, Math.max(FLINCH_MIN_STRENGTH, frac / FLINCH_FULL_DAMAGE_FRAC));
};

/** 敵1体ぶんの判定(ボス・強個体は満額)。描画側(pixiScene)の唯一の窓口。 */
export const enemyFlinchStrength = (
  e: { type: EnemyType; lastHitDmg?: number; maxHealth: number },
): number => (isBossType(e.type) ? 1 : flinchStrengthOf(e.lastHitDmg, e.maxHealth));
