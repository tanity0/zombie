// サブクエストの台帳(research/SUBQUESTS.md v1骨格+v2修正+v3裁定。矛盾時は v3 > v2 > v1)。
//
// 「受注せず勝手に補充される」タイプの小目標。ステージごとの**固定順**リストで、出撃時に
// 未クリアの次のorderが2枠まで補充される(補充・進捗・保存は utils/subquests.ts)。
//
// ★掟(チュートリアル台帳と同じ): **labelに数値を直書きしない**。必要数は `{n}` に差し込む
//   (`subquestLabel()`)。バランス調整で文面が嘘にならないようにするため。
// ★依存ゼロの葉モジュール(型のみimport)。store/描画からは参照するだけ。
//
// v2で入れた台帳側の緩和(v3で維持):
//  ・赤ティアは原点距離 area>=3 でしか湧かない=「深部へ行く」を要求する赤系は **S4/S5/S6 だけ**。
//  ・色系(青/紫/赤/色付き)の報酬は**色基準の固定額**(ステージ倍率を掛けない。どのステージでも
//    その色を倒す難度は同じため)。
//  ・Stage3の horde は「関所頭のみ」で出にくいので 20→10体へ減らし、順序を後方へ。
//  ・Stage6の小ボス(賞金首)はメイン(洋館通路)では湧かない=**フリー周回で進む**枠。
//  ・レスキューは1出撃1回上限(既存仕様)=累計制の長期枠。

import type { EnemyColorTier } from '../types/game';

export type SubquestKind =
  | 'kill-normal'      // 通常敵(色なし・非ボス・非賞金首・非宿敵)
  | 'kill-tier'        // 指定色(blue/purple/red)
  | 'kill-colored'     // 色付き(ティア不問)
  | 'kill-lab'         // 研究所敵(lab-zombie-1/2/3)
  | 'rescue'           // 生存者救助の成功
  | 'miniboss'         // 賞金首(bounty-*)
  | 'wanted'           // 宿敵(isNamed)
  | 'horde-kills'      // 大量発生(horde囲い)中のキル
  | 'rednight-kills'   // 紅き夜(active)中のキル
  | 'hunter-survive';  // ハンター追跡(chase)を連続N秒生き延びる

export interface SubquestDef {
  id: string;
  stageId: string;
  order: number;            // ステージ内の固定順(軽→重)
  kind: SubquestKind;
  /** 必要数。hunter-survive だけは「秒」。 */
  target: number;
  /** 報酬ゴールド(20〜200)。**ゴールドラッシュ(skillGoldRushMult)を掛ける前**の額(v3裁定Q3)。 */
  rewardGold: number;
  tier?: EnemyColorTier;    // kill-tier のみ
  labLevel?: 1 | 2 | 3;     // kill-lab のみ
  /** 表示文。`{n}` に target を差し込む(数値は直書きしない)。 */
  label: string;
}

/** 同時に持てる枠数(v3: 2つまで)。 */
export const SUBQUEST_SLOTS = 2;
/** 報酬の許容レンジ(裁定1)。台帳の不変条件テストが使う。 */
export const SUBQUEST_REWARD_MIN = 20;
export const SUBQUEST_REWARD_MAX = 200;

// 色系の固定額(v2: ステージ倍率をやめ色基準へ。青<紫<赤・色付き(不問)は青より易しいので下)。
const GOLD_COLORED = 50;
const GOLD_BLUE = 60;
const GOLD_PURPLE = 110;
const GOLD_RED = 170;

const L = {
  normal: '通常の変異体を{n}体倒す',
  colored: '色付きの変異体を{n}体倒す',
  blue: '青い変異体を{n}体倒す',
  purple: '紫の変異体を{n}体倒す',
  red: '赤い変異体を{n}体倒す',
  lab1: '研究所Lv1の被験体を{n}体倒す',
  lab2: '研究所Lv2の被験体を{n}体倒す',
  lab3: '研究所Lv3の被験体を{n}体倒す',
  rescue: '生存者の救助を{n}回成功させる',
  miniboss: '賞金首を{n}体討伐する',
  wanted: '宿敵を{n}体討伐する',
  horde: '大量発生の最中に{n}体倒す',
  rednight: '紅き夜の最中に{n}体倒す',
  hunter: 'ハンターの追跡を{n}秒生き延びる',
} as const;

/**
 * 台帳。**stage-1〜6 のみ**(stage-tutorial / stage-7 / stage-ex1 / stage-ex2 は対象外=
 * ストーリーボス面/訓練。不変条件テストで固定)。
 */
export const SUBQUESTS: readonly SubquestDef[] = [
  // ── Stage1(基礎)。v2で「⑦赤2体」を削除(赤は area>=3 でしか湧かない)。
  { id: 'sq-1-1', stageId: 'stage-1', order: 1, kind: 'kill-normal', target: 25, rewardGold: 20, label: L.normal },
  { id: 'sq-1-2', stageId: 'stage-1', order: 2, kind: 'kill-tier', tier: 'blue', target: 5, rewardGold: GOLD_BLUE, label: L.blue },
  { id: 'sq-1-3', stageId: 'stage-1', order: 3, kind: 'rescue', target: 2, rewardGold: 40, label: L.rescue },
  { id: 'sq-1-4', stageId: 'stage-1', order: 4, kind: 'kill-normal', target: 75, rewardGold: 60, label: L.normal },
  { id: 'sq-1-5', stageId: 'stage-1', order: 5, kind: 'kill-tier', tier: 'purple', target: 5, rewardGold: GOLD_PURPLE, label: L.purple },
  { id: 'sq-1-6', stageId: 'stage-1', order: 6, kind: 'miniboss', target: 1, rewardGold: 100, label: L.miniboss },
  { id: 'sq-1-7', stageId: 'stage-1', order: 7, kind: 'wanted', target: 1, rewardGold: 150, label: L.wanted },

  // ── Stage2(研究所・軽め)。ハンター/紅き夜/賞金首は出ないので討伐系のみ。
  { id: 'sq-2-1', stageId: 'stage-2', order: 1, kind: 'kill-lab', labLevel: 1, target: 30, rewardGold: 30, label: L.lab1 },
  { id: 'sq-2-2', stageId: 'stage-2', order: 2, kind: 'kill-lab', labLevel: 2, target: 15, rewardGold: 60, label: L.lab2 },
  { id: 'sq-2-3', stageId: 'stage-2', order: 3, kind: 'kill-lab', labLevel: 3, target: 5, rewardGold: 100, label: L.lab3 },

  // ── Stage3。v2: horde は 20→10体・順序を後方(⑤)へ。
  { id: 'sq-3-1', stageId: 'stage-3', order: 1, kind: 'kill-normal', target: 40, rewardGold: 30, label: L.normal },
  { id: 'sq-3-2', stageId: 'stage-3', order: 2, kind: 'kill-colored', target: 10, rewardGold: GOLD_COLORED, label: L.colored },
  { id: 'sq-3-3', stageId: 'stage-3', order: 3, kind: 'kill-normal', target: 100, rewardGold: 90, label: L.normal },
  { id: 'sq-3-4', stageId: 'stage-3', order: 4, kind: 'rednight-kills', target: 5, rewardGold: 120, label: L.rednight },
  { id: 'sq-3-5', stageId: 'stage-3', order: 5, kind: 'horde-kills', target: 10, rewardGold: 80, label: L.horde },
  { id: 'sq-3-6', stageId: 'stage-3', order: 6, kind: 'wanted', target: 1, rewardGold: 150, label: L.wanted },

  // ── Stage4。赤系はここから(area>=3の深部)。
  { id: 'sq-4-1', stageId: 'stage-4', order: 1, kind: 'kill-normal', target: 50, rewardGold: 40, label: L.normal },
  { id: 'sq-4-2', stageId: 'stage-4', order: 2, kind: 'kill-tier', tier: 'blue', target: 15, rewardGold: GOLD_BLUE, label: L.blue },
  { id: 'sq-4-3', stageId: 'stage-4', order: 3, kind: 'hunter-survive', target: 20, rewardGold: 100, label: L.hunter },
  { id: 'sq-4-4', stageId: 'stage-4', order: 4, kind: 'rescue', target: 3, rewardGold: 70, label: L.rescue },
  { id: 'sq-4-5', stageId: 'stage-4', order: 5, kind: 'kill-tier', tier: 'purple', target: 8, rewardGold: GOLD_PURPLE, label: L.purple },
  { id: 'sq-4-6', stageId: 'stage-4', order: 6, kind: 'kill-normal', target: 125, rewardGold: 120, label: L.normal },
  { id: 'sq-4-7', stageId: 'stage-4', order: 7, kind: 'kill-tier', tier: 'red', target: 3, rewardGold: GOLD_RED, label: L.red },
  { id: 'sq-4-8', stageId: 'stage-4', order: 8, kind: 'wanted', target: 1, rewardGold: 160, label: L.wanted },

  // ── Stage5(最重)。
  { id: 'sq-5-1', stageId: 'stage-5', order: 1, kind: 'kill-normal', target: 60, rewardGold: 50, label: L.normal },
  { id: 'sq-5-2', stageId: 'stage-5', order: 2, kind: 'kill-colored', target: 15, rewardGold: GOLD_COLORED, label: L.colored },
  { id: 'sq-5-3', stageId: 'stage-5', order: 3, kind: 'kill-tier', tier: 'blue', target: 25, rewardGold: GOLD_BLUE, label: L.blue },
  { id: 'sq-5-4', stageId: 'stage-5', order: 4, kind: 'miniboss', target: 2, rewardGold: 130, label: L.miniboss },
  { id: 'sq-5-5', stageId: 'stage-5', order: 5, kind: 'rednight-kills', target: 10, rewardGold: 150, label: L.rednight },
  { id: 'sq-5-6', stageId: 'stage-5', order: 6, kind: 'hunter-survive', target: 30, rewardGold: 160, label: L.hunter },
  { id: 'sq-5-7', stageId: 'stage-5', order: 7, kind: 'kill-tier', tier: 'purple', target: 12, rewardGold: GOLD_PURPLE, label: L.purple },
  { id: 'sq-5-8', stageId: 'stage-5', order: 8, kind: 'kill-tier', tier: 'red', target: 5, rewardGold: GOLD_RED, label: L.red },
  { id: 'sq-5-9', stageId: 'stage-5', order: 9, kind: 'kill-normal', target: 150, rewardGold: 180, label: L.normal },
  { id: 'sq-5-10', stageId: 'stage-5', order: 10, kind: 'wanted', target: 1, rewardGold: 200, label: L.wanted },

  // ── Stage6(洋館・シンプル)。④賞金首はメイン(通路)では湧かない=フリー周回で進む枠(v2注記)。
  { id: 'sq-6-1', stageId: 'stage-6', order: 1, kind: 'kill-normal', target: 40, rewardGold: 40, label: L.normal },
  { id: 'sq-6-2', stageId: 'stage-6', order: 2, kind: 'kill-colored', target: 10, rewardGold: GOLD_COLORED, label: L.colored },
  { id: 'sq-6-3', stageId: 'stage-6', order: 3, kind: 'kill-tier', tier: 'purple', target: 10, rewardGold: GOLD_PURPLE, label: L.purple },
  { id: 'sq-6-4', stageId: 'stage-6', order: 4, kind: 'miniboss', target: 2, rewardGold: 140, label: L.miniboss },
  { id: 'sq-6-5', stageId: 'stage-6', order: 5, kind: 'kill-tier', tier: 'red', target: 5, rewardGold: GOLD_RED, label: L.red },
  { id: 'sq-6-6', stageId: 'stage-6', order: 6, kind: 'kill-normal', target: 100, rewardGold: 150, label: L.normal },
];

/** 台帳を持つステージの集合(不変条件テストと補充の入口ガードが読む)。 */
export const SUBQUEST_STAGE_IDS: readonly string[] =
  [...new Set(SUBQUESTS.map(q => q.stageId))];

/** そのステージの台帳(order昇順)。台帳が無いステージは空配列=サブクエスト無し。 */
export const subquestsForStage = (stageId: string): SubquestDef[] =>
  SUBQUESTS.filter(q => q.stageId === stageId).sort((a, b) => a.order - b.order);

export const subquestById = (id: string): SubquestDef | undefined =>
  SUBQUESTS.find(q => q.id === id);

/** 表示文。`{n}` に必要数を差し込む(labelに数値を直書きしないための唯一の出口)。 */
export const subquestLabel = (def: SubquestDef): string =>
  def.label.replace('{n}', String(def.target));
