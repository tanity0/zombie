import type { EnemyType } from '../types/game';

/** ボス別守護霊スロットの唯一の組み立て規則。 */
export const bossStyleSlotKey = (type: EnemyType, stageId: string): string =>
  type === 'giantbat' ? `giantbat@${stageId}` : type;
