import type { EnemyType } from '../types/game';

/** ボス別守護霊スロットの唯一の組み立て規則。
 * ★v0.25.5050(検収監査A-3): フィルは 'phillboss@stage-ex1'。ghostDossier/bossEncounter/duoRecords/fixedGuardians は
 * 全てこの形で持っているのに、ここだけ型名 'phillboss' を返していた=新規撃破の守護霊記録が討伐記録画面で引けず、
 * 年表の実績「ボスをソロで全撃破」も到達不能だった。旧キー 'phillboss' は playerTraits の読み込みで移行する。 */
export const bossStyleSlotKey = (type: EnemyType, stageId: string): string =>
  type === 'giantbat' ? `giantbat@${stageId}` : type === 'phillboss' ? 'phillboss@stage-ex1' : type;
