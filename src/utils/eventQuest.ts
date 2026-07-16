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
  // 統合正本M5(4.5)/指示書: 遭遇のみ。サークル滞在で確定会話を流して完了(クエスト受注・報酬なし)。
  // 完了はサブ納品と同じ永続フラグ(meta.sub)=以後そのステージに二人は出現しない。
  encounterOnly?: boolean;
}

// ステージ毎の設定。ここに無いステージには二人は出現しない(社長裁定#6)。
// 任意サブ3本=ステージ1/3/4(統合正本「任意サブ3本」)。ステージ5は遭遇のみ(encounterOnly・sub目標は未使用)。
export const EVENT_QUEST_CONFIG: Record<string, EventQuestConfig> = {
  'stage-1': { forced: true,  namedTypes: ['pumpkin', 'werewolf'], sub: { tier: null,     count: 10 } },
  'stage-3': { forced: false, namedTypes: ['pumpkin', 'werewolf'], sub: { tier: 'blue',   count: 5 } },
  'stage-4': { forced: false, namedTypes: ['pumpkin', 'werewolf'], sub: { tier: 'purple', count: 5 } },
  'stage-5': { forced: false, namedTypes: ['pumpkin', 'werewolf'], sub: { tier: 'red',    count: 5 }, encounterOnly: true },
};

// ───────────────────────────────────────────────────────────────────────────
// 二人組の確定会話(統合正本M1/任意サブ1〜3/M5・一括制作指示書4章)。一言一句変更しない。
// 話者名はNPC会話バストアップの対応(NpcDialogue.tsx)と一致させる: グレン(男)/ミラ(女)。
export interface EventQuestLine { name: string; text: string }

// M1 強制初遭遇(救助後)= 強制クエスト受領時に流す(統合正本4.1)。
export const EVENT_QUEST_LINES_FORCED: EventQuestLine[] = [
  { name: 'ミラ', text: 'この国の人？　助かったよ！' },
  { name: 'グレン', text: '俺はグレン。こいつはミラだ。礼を言う。では……' },
  { name: 'ミラ', text: '私たち、隣の国から任務で来たの！' },
  { name: 'グレン', text: 'こら、極秘だぞ' },
  { name: 'ミラ', text: 'わっ！　……またね！' },
];

// 任意サブ受注(サブ1=stage-1 / サブ2=stage-3 / サブ3=stage-4)。
export const EVENT_QUEST_SUB_ACCEPT_LINES: Record<string, EventQuestLine[]> = {
  'stage-1': [
    { name: 'グレン', text: 'またお前か。頼みがある。極秘のミッションでな。理由は聞くな' },
    { name: 'ミラ', text: 'そう！　血液サンプルを持ち帰って、独自開発した製剤の有用性を極秘で調べるんだよ！' },
    { name: 'グレン', text: '……' },
  ],
  'stage-3': [
    { name: 'グレン', text: 'また会ったな。実は頼みがある。理由は聞くなよ' },
    { name: 'ミラ', text: '秘密だからね！　通常個体とは違う血液が、こっちの試料にどう反応するか――' },
    { name: 'グレン', text: '……あっ、後ろに変異体だ、ミラ！' },
    { name: 'ミラ', text: 'わっ！　どこ！？' },
  ],
  'stage-4': [
    { name: 'グレン', text: 'よく会うな。追っかけか？　まあいい、頼みがある' },
    { name: 'ミラ', text: 'うぐ……めっちゃ怒られるから、理由は言えないの……' },
    { name: 'グレン', text: '頼んだぞ' },
  ],
};

// 任意サブ納品(完了)。「ミラがグレンの物を勝手に渡す」掛け合い=M7撃破後の反転(グレン「……」)への布石。
export const EVENT_QUEST_SUB_COMPLETE_LINES: Record<string, EventQuestLine[]> = {
  'stage-1': [
    { name: 'ミラ', text: 'ありがと！　これ、報酬ね！' },
    { name: 'グレン', text: 'それ俺のだろ' },
  ],
  'stage-3': [
    { name: 'グレン', text: '報酬はそうだなぁ……' },
    { name: 'ミラ', text: 'もう渡したよ！' },
    { name: 'グレン', text: 'また俺の……' },
  ],
  'stage-4': [
    { name: 'グレン', text: '今日は俺の物を渡すなよ' },
    { name: 'ミラ', text: 'もう渡したよ！' },
    { name: 'グレン', text: '……' },
  ],
};

// M5 強制再遭遇(統合正本4.5)。グレンは体調不良で発話しない=ミラのみ。
export const EVENT_QUEST_ENCOUNTER_LINES: EventQuestLine[] = [
  { name: 'ミラ', text: 'なんか大変なことになった！' },
  { name: 'ミラ', text: 'と、とにかくありがとう！　どろん！' },
];

export const eventQuestSubAcceptLines = (stageId: string): EventQuestLine[] =>
  EVENT_QUEST_SUB_ACCEPT_LINES[stageId] ?? [];
export const eventQuestSubCompleteLines = (stageId: string): EventQuestLine[] =>
  EVENT_QUEST_SUB_COMPLETE_LINES[stageId] ?? [];

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
