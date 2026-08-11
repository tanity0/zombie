// PACING_PUZZLE.md §6.22 M47仕様①: 気絶中近接の即死に「強個体」しきい値を設ける。
// 雑魚は無条件即死(弾切れ救済ループ=不変)。強個体(タイプ/フラグ判定。ランタイムHPの絶対値
// では判定しない=深部の雑魚を巻き込まない)は HP < maxHealth×ELITE_EXECUTE_HP_RATIO のときのみ
// 即死し、HP >= しきい値のときは即死せず近接ダメージ×ELITE_MELEE_STUN_MULT を与えて気絶解除
// (ボス5×打と同じ「フィニッシュ経路」扱い=finishKillOnly個体でもclampしない・crit扱いの金数字表示)。
// 呼び出し側(gameStore.ts の finisher 3箇所+ここ)の「ボスか否か」は **usesBossStunnedMelee** で
// 判定する(v0.25.3171・案A)。旧コメントは「isBossType 分岐より後段に置くこと」だったが、
// それだと pumpkin / lab-zombie-3 に強個体規定が永久に届かなかった。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(実装精度の規律4)。
import type { EnemyType } from '../types/game';
import { isBossType } from './enemyUtils';

export const ELITE_EXECUTE_HP_RATIO = 0.5;
export const ELITE_MELEE_STUN_MULT = 3;

// 強個体の定義: pumpkin/lab-zombie-3(タイプ) または isNamed/questTarget(個体フラグ)。
const isEliteType = (t: EnemyType): boolean => t === 'pumpkin' || t === 'lab-zombie-3';

/**
 * ★気絶中の近接を「ボス式」(=即死しない・近接×BOSS_MELEE_STUN_MULT)で受ける型か。
 * **= `isBossType` から強個体(pumpkin / lab-zombie-3)を除いたもの。**
 *
 * 社長裁定v0.25.3171(案A)。**M47(§6.22 仕様①)はこの2体を「強個体」と名指ししていた**のに、
 * 実装は全ての呼び出し側で `isBossType` を**先に**見ており、pumpkin / lab-zombie-3 は必ずボス枝へ
 * 落ちていた=**M47の規定がこの2体に一度も届いていなかった**(v0.25.2422以降はそもそもクリで
 * 固まらなくなっていたので誰も踏まなかった。v0.25.3169で固まるようになって表面化)。
 * ⇒ 気絶近接の「ボスか否か」はこの述語で判定する。**呼び出し側で `isBossType` を書かない。**
 */
export const usesBossStunnedMelee = (t: EnemyType): boolean => isBossType(t) && !isEliteType(t);

export interface StunnedMeleeEnemy {
  type: EnemyType;
  isNamed?: boolean;
  questTarget?: boolean;
  health: number;
  maxHealth: number;
}

export type StunnedMeleeOutcome = 'execute' | 'heavy';

export const stunnedMeleeOutcome = (enemy: StunnedMeleeEnemy): StunnedMeleeOutcome => {
  const isElite = isEliteType(enemy.type) || !!enemy.isNamed || !!enemy.questTarget;
  if (!isElite) return 'execute'; // 雑魚は無条件即死
  return enemy.health < enemy.maxHealth * ELITE_EXECUTE_HP_RATIO ? 'execute' : 'heavy';
};

// ---------------------------------------------------------------------------
// 気絶敵への近接フィニッシュ(処刑)の裁定 — 唯一の出どころ。
// research/GHOST_PARITY_LEDGER.md §3-3(項目10)+発注B(v0.25.2525・GHOST-REFLECT-MELEE-SUBS)。
// プレイヤーのナイフスイング(gameStore.triggerCounter)と**守護霊の近接スイング**が同じ1本を通る
// (BOT_AND_GHOST.md §2.11補足「写すな、共通化しろ」=ゴースト用に分岐を複製しない)。
// 値・条件はプレイヤーの既存分岐そのまま(ボス5×・気絶維持は完全気絶中のみ / 強個体3× / 雑魚即死)。
// レンダラ非依存の純関数(判定のみ・副作用なし)=ヘッドレスでテスト可能。
// ---------------------------------------------------------------------------

/** 気絶中の敵に「フィニッシュ可能な近接」が当たった時の裁定。 */
export type StunnedMeleeHit =
  /** ボス: 即死しない=近接ダメージ×BOSS_MELEE_STUN_MULT。keepStun=完全気絶(紫)中は気絶を解除しない。 */
  | { kind: 'boss'; dmg: number; keepStun: boolean }
  /** 強個体(HP50%以上): 即死せず近接ダメージ×ELITE_MELEE_STUN_MULT+気絶解除。 */
  | { kind: 'heavy'; dmg: number }
  /** 雑魚/HP50%未満の強個体: 即時処刑(即死)。 */
  | { kind: 'execute' };

/** 気絶判定+フィニッシュ裁定。null=気絶していない(呼び出し側は通常ヒット経路へ)。 */
export const resolveStunnedMeleeHit = (
  enemy: StunnedMeleeEnemy & { stunUntil?: number; bossFullStunUntil?: number },
  baseDamage: number,
  gameTime: number,
  bossStunMult: number, // = gameStore.BOSS_MELEE_STUN_MULT(値の二重管理を避けて注入)
): StunnedMeleeHit | null => {
  const stunned = enemy.stunUntil !== undefined && gameTime < enemy.stunUntil;
  if (!stunned) return null;
  if (usesBossStunnedMelee(enemy.type)) {
    // 通常の気絶は1発で解除するが、裏ボスの「完全気絶(紫)」中は解除せずタイマー切れまで5×し放題。
    const bossFull = enemy.bossFullStunUntil !== undefined && gameTime < enemy.bossFullStunUntil;
    return { kind: 'boss', dmg: baseDamage * bossStunMult, keepStun: bossFull };
  }
  if (stunnedMeleeOutcome(enemy) === 'heavy') {
    return { kind: 'heavy', dmg: baseDamage * ELITE_MELEE_STUN_MULT };
  }
  return { kind: 'execute' };
};

/** フィニッシュ打(ボス5×/強個体3×)で敵が浮く時間(ms)。プレイヤーの既存値(420)。 */
export const MELEE_STUN_LIFT_MS = 420;
