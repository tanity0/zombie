// 二人組(クエストNPC)のクエスト定義(EVENT_QUEST_DESIGN.md・社長裁定v0.25.1686)。
// 純関数のみ(store/React非依存)=ユニットテスト対象。永続フラグは data/progress.ts、
// 受領/納品の状態機械は gameStore/useGameLoop 側がこのモジュールを消費する。
//
// 構成(社長指示):
//  ・強制「特定変異種のサンプルが欲しい」= 二人と反対側の研究対象区域にネームド(パンプキンか犬)出現→討伐。
//    強制を実際に課すのはステージ1のみ。ステージ3/4/5はフラグ構造は持つが「最初からクリア済み」扱い
//    (forced: false)=サブのみ発生。
//  ・サブ「とにかくサンプルを集めてきて」= 強制クリア後に受注可。完了は1度きり(受注は死亡したら次runで再受注可)。
//    st1=敵10体 / st3=レア敵(青)5体 / st4=紫敵5体 / st5=赤敵5体。
//  ・次ステージ解放 = 城ボスクリアフラグ && 強制クリアフラグ(progress.ts の syncQuestStageClear)。

import type { EnemyType, EnemyColorTier } from '../types/game';

// サブ目標: tier=null は「全キル」を数える。それ以外は指定色個体(colorTier一致)のみ。
export interface EventQuestSubGoal {
  tier: EnemyColorTier | null;
  count: number;
}

export interface EventQuestConfig {
  forced: boolean;          // 強制クエスト(ネームド討伐)を実際に課すか(=falseなら最初からクリア済み扱い)
  namedTypes: EnemyType[];  // 強制のネームド候補型(社長指示「パンプキンか犬で」=受領時にランダム1体)
  sub: EventQuestSubGoal;
}

// ステージ毎の設定。ここに無いステージには二人は出現しない(社長裁定#6)。
export const EVENT_QUEST_CONFIG: Record<string, EventQuestConfig> = {
  'stage-1': { forced: true,  namedTypes: ['pumpkin', 'werewolf'], sub: { tier: null,     count: 10 } },
  'stage-3': { forced: false, namedTypes: ['pumpkin', 'werewolf'], sub: { tier: 'blue',   count: 5 } },
  'stage-4': { forced: false, namedTypes: ['pumpkin', 'werewolf'], sub: { tier: 'purple', count: 5 } },
  'stage-5': { forced: false, namedTypes: ['pumpkin', 'werewolf'], sub: { tier: 'red',    count: 5 } },
};

export const getEventQuestConfig = (stageId: string): EventQuestConfig | null =>
  EVENT_QUEST_CONFIG[stageId] ?? null;

// 強制ネームドの出現位置: 「二人がいるエリアと反対の研究エリア」(社長指示)=原点(出撃地点)から見て
// 二人の方位角+180°・距離2000〜2600(研究対象区域1500-3000の内側・叩き台#7)。
export const QUEST_NAMED_DIST_MIN = 2000;
export const QUEST_NAMED_DIST_MAX = 2600;
export const QUEST_NAMED_AGGRO_RANGE = 320; // 休眠→起動距離(叩き台。拠点同様「行くと戦いが始まる」)

export const questNamedSpawnPos = (
  npcX: number, npcY: number, rand: () => number = Math.random
): { x: number; y: number } => {
  const ang = Math.atan2(npcY, npcX) + Math.PI;
  const dist = QUEST_NAMED_DIST_MIN + rand() * (QUEST_NAMED_DIST_MAX - QUEST_NAMED_DIST_MIN);
  return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist };
};

export const pickQuestNamedType = (
  cfg: EventQuestConfig, rand: () => number = Math.random
): EnemyType => cfg.namedTypes[Math.floor(rand() * cfg.namedTypes.length)] ?? cfg.namedTypes[0];

// キル1件がクエスト進捗になるか。なるなら新しいキル数、ならないなら null。
// forced: クエスト対象個体(questTarget)の討伐のみ(0/1→1/1)。
// sub: tier=null は全キル、指定色はcolorTier一致のみ。
export const questKillProgress = (
  active: 'forced' | 'sub' | null,
  goalTier: EnemyColorTier | null,
  currentKills: number,
  enemy: { questTarget?: boolean; colorTier?: EnemyColorTier }
): number | null => {
  if (active === 'forced') return enemy.questTarget ? Math.max(1, currentKills) : null;
  if (active === 'sub') {
    if (goalTier !== null && enemy.colorTier !== goalTier) return null;
    return currentKills + 1;
  }
  return null;
};
