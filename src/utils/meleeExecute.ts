// PACING_PUZZLE.md §6.22 M47仕様①: 気絶中近接の即死に「強個体」しきい値を設ける。
// 雑魚は無条件即死(弾切れ救済ループ=不変)。強個体(タイプ/フラグ判定。ランタイムHPの絶対値
// では判定しない=深部の雑魚を巻き込まない)は HP < maxHealth×ELITE_EXECUTE_HP_RATIO のときのみ
// 即死し、HP >= しきい値のときは即死せず近接ダメージ×ELITE_MELEE_STUN_MULT を与えて気絶解除
// (ボス5×打と同じ「フィニッシュ経路」扱い=finishKillOnly個体でもclampしない・crit扱いの金数字表示)。
// 呼び出し側(gameStore.ts の finisher 4箇所)は isBossType 分岐より後段に置くこと(ボスは現行どおり
// 別扱いで変更しない)。レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(実装精度の規律4)。
import type { EnemyType } from '../types/game';

export const ELITE_EXECUTE_HP_RATIO = 0.5;
export const ELITE_MELEE_STUN_MULT = 3;

// 強個体の定義: pumpkin/lab-zombie-3(タイプ) または isNamed/questTarget(個体フラグ)。
const isEliteType = (t: EnemyType): boolean => t === 'pumpkin' || t === 'lab-zombie-3';

interface StunnedMeleeEnemy {
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
