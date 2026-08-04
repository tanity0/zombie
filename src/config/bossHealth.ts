import type { EnemyType } from '../types/game';

// ボスHPの正本。PHILLガンはstage-2限定かつ弾薬有限の特殊支給品なので、
// この進行カーブの火力基準には含めない。通常プレイヤーが作れるビルドを基準にする。
export const STAGE_BOSS_HEALTH_BY_STAGE: Readonly<Record<string, number>> = {
  'stage-1': 3500,
  'stage-2': 4000,
  'stage-3': 4500,
  'stage-4': 5000,
  'stage-5': 5500,
  'stage-6': 6000,
};

// ゲート2は実際に登場する順で8000から1000ずつ上げる。
export const GATE_BOSS_HEALTH = {
  miguel: 8000,
  jibril: 9000,
  rafi: 10000,
  uri: 11000,
  suriel: 12000,
  acrasiel: 13000,
} as const satisfies Partial<Record<EnemyType, number>>;

// 裏ボスはstage-1からstage-5まで2000ずつ上げる。
export const HIDDEN_BOSS_HEALTH = {
  mimir: 14000,
  idol: 16000,
  jormungand: 18000,
  skadi: 20000,
  thor: 22000,
} as const satisfies Partial<Record<EnemyType, number>>;

export const stageBossHealthFor = (stageId: string): number =>
  STAGE_BOSS_HEALTH_BY_STAGE[stageId] ?? STAGE_BOSS_HEALTH_BY_STAGE['stage-1'];
