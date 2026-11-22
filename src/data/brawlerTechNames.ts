// 格闘の技の名前と入力の向き(プレイヤーに見せる表記の正・更新情報の表記と同じ)。
// 通信の下の行(components/NpcDialogue の SkillProcRows)が引く。向きは utils/brawler の classifyBrawlerFlick と同じ割り当て。
import type { TechProcKey } from '../utils/skillProcFeed';

/** 入力の向き。all=秘奥義(4つの技を続けた先)。chain=入力ではなく前の技から自動で続いた技(向きの印は出さず、続きの印=字下げ)。 */
export type BrawlerTechDir = 'up' | 'down' | 'left' | 'right' | 'all' | 'chain';

export const BRAWLER_TECH_NAMES: Record<TechProcKey, { name: string; dir: BrawlerTechDir }> = {
  'tech:guard': { name: '構え', dir: 'up' },
  'tech:stomp': { name: '地割り', dir: 'down' }, // 社長指示2026-11-20「大踏みつぶし→地割り」(research/BRAWLER.md §35)
  'tech:kiko': { name: '気功', dir: 'left' },
  'tech:kick': { name: '飛び蹴り', dir: 'right' },
  'tech:kick2': { name: '空中蹴り', dir: 'right' },
  'tech:kick3': { name: '蹴り飛ばし', dir: 'right' },
  'tech:heel': { name: '踵落とし', dir: 'down' },
  'tech:kickup': { name: '蹴り上げ', dir: 'up' },
  'tech:airthrow': { name: '空中投げ', dir: 'chain' }, // 蹴り上げから自動で続く(入力ではない)
  'tech:suplex': { name: 'スープレックス', dir: 'up' }, // 密着の構え(上)から
  'tech:suplexchain': { name: 'スープレックス', dir: 'chain' }, // 蹴り上げからの空中投げで投げ先が無かった時(自動の続き)
  'tech:flipkick': { name: 'サマーソルト', dir: 'up' },
  'tech:mogura': { name: '土竜', dir: 'up' }, // 地割りの溜めの間に上で派生(§35)
  'tech:secret': { name: '秘奥義', dir: 'all' },
  // 刀(research/KATANA_TSUBAME.md §2・§4)。一閃=はじいた向きの楔(右向きの1本で代表)・燕返し=一閃からの続き(└)・殺陣=秘奥義と同じ扱い。
  'tech:issen': { name: '一閃', dir: 'right' },
  'tech:tsubame': { name: '燕返し', dir: 'chain' },
  'tech:satsujin': { name: '殺陣', dir: 'all' },
  // 鞭の叩きつけ(research/WHIP_FOLLOWUP.md §7)。前の技の続きではなく、浮いた敵に鞭が当たると出る1行=続きの印(└)は付けない。
  // 印は振り下ろして地面を打つ形(先に地面の線)=地割りと同じ下向きの楔。
  'tech:whipslam': { name: '叩きつけ', dir: 'down' },
};
