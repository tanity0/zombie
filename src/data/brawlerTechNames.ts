// 格闘の技の名前と入力の向き(プレイヤーに見せる表記の正・更新情報の表記と同じ)。
// 通信の下の行(components/NpcDialogue の SkillProcRows)が引く。向きは utils/brawler の classifyBrawlerFlick と同じ割り当て。
import type { TechProcKey } from '../utils/skillProcFeed';

/** 入力の向き。all=秘奥義(4つの技を続けた先)。 */
export type BrawlerTechDir = 'up' | 'down' | 'left' | 'right' | 'all';

export const BRAWLER_TECH_NAMES: Record<TechProcKey, { name: string; dir: BrawlerTechDir }> = {
  'tech:guard': { name: '構え', dir: 'up' },
  'tech:stomp': { name: '大踏み潰し', dir: 'down' },
  'tech:kiko': { name: '気功', dir: 'left' },
  'tech:kick': { name: '飛び蹴り', dir: 'right' },
  'tech:kick2': { name: '空中蹴り', dir: 'right' },
  'tech:kick3': { name: '蹴り飛ばし', dir: 'right' },
  'tech:heel': { name: '踵落とし', dir: 'down' },
  'tech:secret': { name: '秘奥義', dir: 'all' },
};
