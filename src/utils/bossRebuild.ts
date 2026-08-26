// 2026-08-05 ボス再構築の正本。
// 調査・企画案から採用した共通文法を、実装と実機調整で同じ表を読める形にまとめる。
// HP・報酬・弱点・加護はここでは扱わない。stage-1の城ボスも対象外。
import type { EnemyType } from '../types/game';

export type BossRebuildId =
  | 'stage-3' | 'stage-4' | 'stage-5' | 'stage-7' | 'stage-ex1'
  | 'miguel' | 'jibril' | 'rafi' | 'uri' | 'suriel' | 'acrasiel'
  | 'mimir' | 'idol' | 'jormungand' | 'skadi' | 'thor';

export interface BossCombatProfile {
  /** そのボスでプレイヤーに覚えてほしい一つの主題。 */
  identity: string;
  /** フェーズごとの最大連段。後半で技を減らさず、圧だけを足す。 */
  maxString: readonly number[];
  /** 技の硬直とは別に、中立姿勢を見せる時間幅(ms)。 */
  neutralMs: readonly { min: number; max: number }[];
  /** どのフェーズでも必ず残す反撃時間(ms)。 */
  mandatoryRestMs: number;
  /** 歩くだけでは解けない技(C分類)を同時に要求する上限。 */
  maxConcurrentC: number;
}

const P = (
  identity: string,
  maxString: readonly number[],
  neutralMs: readonly { min: number; max: number }[],
): BossCombatProfile => ({ identity, maxString, neutralMs, mandatoryRestMs: 1700, maxConcurrentC: 1 });

/**
 * 「距離帯で選ぶ / 予告位置を固定 / 連段後は必ず休む / フェーズは足し算」を全員に適用する台帳。
 * stage-1城ボスは意図的に存在しない。値は実機調整の入口であり、HP調整とは独立する。
 */
export const BOSS_COMBAT_PROFILES: Record<BossRebuildId, BossCombatProfile> = {
  'stage-3': P('空から狩る。滑空の軌道を読み、急降下後へ差し込む', [2, 3], [{ min: 650, max: 1000 }, { min: 500, max: 800 }]),
  'stage-4': P('三連突進を数え、氷の横薙ぎ後へ反撃する', [2, 4], [{ min: 700, max: 1050 }, { min: 500, max: 800 }]),
  'stage-5': P('翼撃と掃射の安全側を見抜き、要塞を崩す', [2, 3], [{ min: 700, max: 1100 }, { min: 550, max: 850 }]),
  'stage-7': P('これまでの回避を連続で試す最終試験', [2, 3, 3], [{ min: 700, max: 1100 }, { min: 550, max: 850 }, { min: 400, max: 700 }]),
  'stage-ex1': P('距離を選ばず追い続ける変異の総合試験', [2, 2, 3], [{ min: 650, max: 1000 }, { min: 500, max: 800 }, { min: 400, max: 650 }]),

  miguel: P('踏み込みで詰め、三段斬りの終わりを見切る', [2, 3], [{ min: 500, max: 900 }, { min: 400, max: 700 }]),
  jibril: P('炎で退路を区切る射撃戦。燃える場所を記憶する', [2, 3], [{ min: 700, max: 1100 }, { min: 550, max: 900 }]),
  rafi: P('残る骨刃と本体の跳躍を同時にさばく', [2, 3], [{ min: 600, max: 950 }, { min: 450, max: 750 }]),
  uri: P('大薙ぎの懐へ入り、振り下ろしと突きを見切る', [2, 3], [{ min: 650, max: 1000 }, { min: 500, max: 800 }]),
  suriel: P('離れた環と本体の交差攻撃を一つずつほどく', [2, 2], [{ min: 700, max: 1100 }, { min: 550, max: 900 }]),
  acrasiel: P('固定された隙間を読み、槍と転移の連鎖を抜ける', [2, 2, 3], [{ min: 750, max: 1150 }, { min: 550, max: 850 }, { min: 400, max: 700 }]),

  mimir: P('群体の面攻撃を横切り、レーザー後へ詰める', [2, 3], [{ min: 650, max: 1000 }, { min: 500, max: 800 }]),
  idol: P('遠距離ほど危険。撃たせながら接近して主導権を奪う', [3, 4], [{ min: 700, max: 1300 }, { min: 700, max: 1300 }]),
  jormungand: P('蛇の巻き付きから弾幕までを数えて抜ける', [2, 4], [{ min: 550, max: 900 }, { min: 400, max: 700 }]),
  skadi: P('氷の設置位置を先読みし、三段の終端を狩る', [2, 3, 3], [{ min: 650, max: 1000 }, { min: 500, max: 800 }, { min: 400, max: 650 }]),
  thor: P('刀の間合いと間を読む、一対一の決闘', [2, 2, 3], [{ min: 700, max: 1100 }, { min: 600, max: 900 }, { min: 500, max: 750 }]),
};

const ENEMY_PROFILE_IDS: Partial<Record<EnemyType, BossRebuildId>> = {
  miguel: 'miguel', jibril: 'jibril', rafi: 'rafi', uri: 'uri', suriel: 'suriel', acrasiel: 'acrasiel',
  mimir: 'mimir', idol: 'idol', jormungand: 'jormungand', skadi: 'skadi', thor: 'thor',
};

export const bossRebuildIdForEnemy = (type: EnemyType): BossRebuildId | null => ENEMY_PROFILE_IDS[type] ?? null;

/**
 * ★技間の追加インターバル(社長指示2026-08-26「技から次の技を出すとき、もう少し間隔をあけるなり、
 * 移動するなりを挟んでほしい。あまりにも怒涛の攻撃しかしてこない」・v0.25.3949)。
 * 台帳の全帯へ一律加算する1ノブ(叩き台=+600ms。実機で絞る)。中立の間は各自の追跡/旋回が動く
 * =「移動を挟む」は既存の中立挙動がそのまま担う。対象=この台帳を読む全員(天使6+フィル+裏4+トール)。
 * 城ボスは技ごとの個別CD(aiReadyAt)、偶像は休符(IDOL_TUNING)=別系。賞金首は BOUNTY_NEUTRAL_MS(同版で+600)。
 */
export const BOSS_NEUTRAL_EXTRA_MS = 600;
/** ★社長指示2026-08-26「全ボス、技と技の間のインターバルは最低でも今の倍で」: 全体倍率(叩き台=2)。 */
export const BOSS_NEUTRAL_MULT = 2;

/** フェーズは1始まり。未定義の上位フェーズは最後の値を引き継ぐ=後半で遅く戻らない。 */
export const bossNeutralDelayMs = (
  id: BossRebuildId,
  phase: number,
  rand: () => number = Math.random,
): number => {
  const bands = BOSS_COMBAT_PROFILES[id].neutralMs;
  const band = bands[Math.min(bands.length - 1, Math.max(0, Math.floor(phase) - 1))];
  const r = Math.max(0, Math.min(1, rand()));
  return (BOSS_NEUTRAL_EXTRA_MS + band.min + (band.max - band.min) * r) * BOSS_NEUTRAL_MULT; // ★倍率=社長指示2026-08-26「最低でも今の倍」
};
