import type { EnemyType } from '../types/game';
// ★幻影のHP=初期プレイヤー同値(下のGUARDIAN_PHANTOM_HEALTH)。どちらもdataの葉=循環なし
// (fixedGuardiansはcampaign/equipment/moveReactionのみ・playerProfilesはtypesのみ)。
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { strongestGuardian } from '../data/fixedGuardians';

// ボスHPの正本。PHILLガンはstage-2限定かつ弾薬有限の特殊支給品なので、
// この進行カーブの火力基準には含めない。通常プレイヤーが作れるビルドを基準にする。
export const STAGE_BOSS_HEALTH_BY_STAGE: Readonly<Record<string, number>> = {
  'stage-1': 3500,
  'stage-2': 4000,
  'stage-3': 4500,
  'stage-4': 5000,
  'stage-5': 5500,
  // stage-6にはボスがいない。6000はstage-7のラスボス(グレン)へ適用する。
  'stage-7': 6000,
};

// ゲート2は裏ボスへ向かう途中で必ず戦う中ボス。対応ステージの城ボスより強くしつつ、
// stage-1のミゲル(5000)はstage-5城ボス(5500)より下に置く。
export const GATE_BOSS_HEALTH = {
  miguel: 5000,
  jibril: 6000,
  rafi: 7000,
  uri: 8000,
  suriel: 9000,
  acrasiel: 10000,
} as const satisfies Partial<Record<EnemyType, number>>;

// 裏ボスはstage-1からstage-5まで2000ずつ上げる。
export const HIDDEN_BOSS_HEALTH = {
  mimir: 14000,
  idol: 16000,
  jormungand: 18000,
  skadi: 20000,
  thor: 22000,
} as const satisfies Partial<Record<EnemyType, number>>;

// research/GHOST_BOSS.md(守護霊ボス「幻影」): 裏ボス方式の固定HP。ENEMY_HP_MULT・エリア・色倍率を
// 一切通さない(buildEnemy の hpMult が `guardian-phantom` を 1 に固定する)ので、ここに書いた値が
// そのまま実効HPになる=練習画面の表示(practiceBossHealth)と実戦が原理的に一致する。
// ★社長裁定v0.25.3641「ステータスもそのままにできない?こっちがステータス初期だから守護霊も初期かも」:
// HP=**初期プレイヤーと同値**(台帳クラスの初期maxHp。装備補正なし=出撃直後のプレイヤーと同じ)。
// 旧: 3000固定(v1のボス型の名残)。プレイヤー側の初期HPを調整すれば幻影も自動で追従(写経禁止)。
export const GUARDIAN_PHANTOM_HEALTH = PLAYER_PROFILES[strongestGuardian().classId].maxHp;

export const stageBossHealthFor = (stageId: string): number =>
  STAGE_BOSS_HEALTH_BY_STAGE[stageId] ?? STAGE_BOSS_HEALTH_BY_STAGE['stage-1'];
