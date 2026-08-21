// PACING_PUZZLE.md §10(EXボス「フィル(変異体)」バッチ2): フィルの技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。他の<boss>Script.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §10-3/§10-9/§10-13(技セット)・§10-14#7/§10-15#5(カウンター必須の規約)。
//
// 技14(実在13。#13「吸引+金環」は§10-14#14で落とされ、番号だけ14まで進んでいる):
// lightrain(1祝福・旧「光の雨」) lancefan(2光槍の扇) wingslash(3羽斬り) wingthrust(4羽突き) wingcombo(5羽連撃)
// summon(6召喚) goldring(7金環) judgment(8裁きの光★必須) cage(9羽根の檻★必須) meteor(10エルデの流星)
// ringtoss(11光輪投げ) dive(12急降下) feathershot(14羽根散弾)。
import { bossZoneForDistance, phaseForHealth, pickWeightedMove, type BossMoveWeights } from './bossScript';

export type PhillMove =
  | 'lightrain' | 'lancefan' | 'wingslash' | 'wingthrust' | 'wingcombo' | 'summon' | 'goldring'
  | 'judgment' | 'cage' | 'meteor' | 'ringtoss' | 'dive' | 'feathershot';

const ALL_MOVES: readonly PhillMove[] = [
  'lightrain', 'lancefan', 'wingslash', 'wingthrust', 'wingcombo', 'summon', 'goldring',
  'judgment', 'cage', 'meteor', 'ringtoss', 'dive', 'feathershot',
];

// §10-9「フェーズ2(HP50%): 8・9(裁きの光/羽根の檻)を解禁」。
export const PHILL_PHASE_HP_THRESHOLD = 0.5;
export const phillPhaseForHealth = (healthFrac: number): 1 | 2 =>
  phaseForHealth(healthFrac, [PHILL_PHASE_HP_THRESHOLD]) as 1 | 2;

// §10-14#7(R7)「カウンター必須技は同時に1つまで・前の必須技の成立/被弾から最低4秒(叩き台)空ける」。
export const PHILL_REQUIRED_GAP_MS = 4000;
/** カウンター必須技(判定/cage)が今抽選候補に入れるか。 */
export const phillRequiredMoveReady = (phase: 1 | 2, now: number, requiredReadyAt: number): boolean =>
  phase === 2 && now >= requiredReadyAt;

// §10-15#2「後追い分岐ではbossState='phill-<move>-recover'+bossStateUntil=+900ms(§6.28の硬直と同値)」。
export const PHILL_COUNTER_RECOVER_MS = 900;

// §10-15#5「1発のダメージ上限=最大HPの35%以下(叩き台)」。blastを積む地点でクランプの形にする。
export const PHILL_REQUIRED_DAMAGE_CAP_FRAC = 0.35;
export const phillRequiredMoveDamage = (enemyDamage: number, playerMaxHealth: number): number =>
  Math.min(enemyDamage, playerMaxHealth * PHILL_REQUIRED_DAMAGE_CAP_FRAC);

// §10-12#17「羽根の檻の初期半径は可視短辺の0.45倍を叩き台上限」。
export const PHILL_CAGE_MAX_RADIUS_FRAC_OF_VIEW = 0.45;
export const phillCageInitialRadiusPx = (preferredRadiusPx: number, visibleShortSidePx: number): number =>
  Math.min(preferredRadiusPx, visibleShortSidePx * PHILL_CAGE_MAX_RADIUS_FRAC_OF_VIEW);

// §10-3の6「召喚: EX雑魚2〜3体・同時上限3」。
export const PHILL_SUMMON_CAP = 3;
/** 今回の召喚で何体出すか(上限を超えない・2〜3体の乱数)。上限に空きが無ければ0。 */
export const phillSummonSpawnCount = (currentLiveEscorts: number, rand: () => number = Math.random): number => {
  const room = Math.max(0, PHILL_SUMMON_CAP - currentLiveEscorts);
  if (room <= 0) return 0;
  const desired = 2 + Math.floor(rand() * 2); // 2 or 3
  return Math.min(room, desired);
};

// ---- 距離帯×重み表(叩き台・全て「良かれと思って」の値ではなく設計書の技の性格から素直に割り振った目安) ----
// 近接3技(wingslash/wingthrust/wingcombo)は密着〜近を主戦場、範囲/弾/召喚系は中〜遠へ比重を置く。
// judgment/cageは距離非依存(追尾する技のため四帯フラット)=フェーズ+CD側で出現を絞る。
export const PHILL_MOVE_WEIGHTS: BossMoveWeights<PhillMove> = {
  wingslash:    { melee: 40, near: 30, mid: 10, far: 0 },
  wingthrust:   { melee: 25, near: 30, mid: 20, far: 5 },
  wingcombo:    { melee: 30, near: 25, mid: 10, far: 0 },
  lightrain:    { melee: 5,  near: 15, mid: 25, far: 30 },
  lancefan:     { melee: 10, near: 20, mid: 25, far: 25 },
  goldring:     { melee: 15, near: 20, mid: 20, far: 15 },
  meteor:       { melee: 5,  near: 10, mid: 20, far: 25 },
  ringtoss:     { melee: 10, near: 20, mid: 20, far: 15 },
  dive:         { melee: 10, near: 15, mid: 15, far: 10 },
  summon:       { melee: 10, near: 10, mid: 10, far: 10 },
  feathershot:  { melee: 5,  near: 15, mid: 20, far: 20 },
  judgment:     { melee: 10, near: 10, mid: 10, far: 10 },
  cage:         { melee: 10, near: 10, mid: 10, far: 10 },
};

// §10-3「大技(光の雨・金環)は実効CD10秒標準」+ §10-9(裁きの光/羽根の檻も同じ大技扱い)。
// 4技それぞれが個別の10秒CDを持つ(叩き台)。judgment/cageはさらに**2つ合わせて**§10-14#7の
// 4秒間隔(requiredReady)にも従う=個別CDと共通ゲートの両方を満たさないと候補に入れない。
export const PHILL_BIG_MOVE_CD_MS = 10000;

export interface PhillMoveGates {
  /** 光の雨(lightrain)個別CD明け。 */
  lightrainReady: boolean;
  /** 金環(goldring)個別CD明け。 */
  goldringReady: boolean;
  /** 裁きの光(judgment)個別CD明け。 */
  judgmentReady: boolean;
  /** 羽根の檻(cage)個別CD明け。 */
  cageReady: boolean;
  /** §10-14#7: フェーズ2 && 前回の必須技(judgment/cageどちらか)の成立/被弾から4秒以上。両方に掛かる共通ゲート。 */
  requiredReady: boolean;
  /** §10-3の6: 召喚の同時上限に空きがある。 */
  summonReady: boolean;
}

/**
 * 現在ゾーンの重み比例で1つ選ぶ。CD中/フェーズ未達/召喚上限中の技は候補から外れる
 * (=抽選そのものを塞ぐことで「同時に1つまで」「フェーズ2限定」を状態機械の外側からも保証する)。
 */
export const pickPhillMove = (
  distance: number,
  gates: PhillMoveGates,
  rand: () => number = Math.random,
): PhillMove | null => pickWeightedMove(
  ALL_MOVES,
  m => PHILL_MOVE_WEIGHTS[m][bossZoneForDistance(distance)],
  {
    lancefan: true, wingslash: true, wingthrust: true, wingcombo: true,
    meteor: true, ringtoss: true, dive: true, feathershot: true,
    lightrain: gates.lightrainReady, goldring: gates.goldringReady,
    summon: gates.summonReady,
    judgment: gates.requiredReady && gates.judgmentReady,
    cage: gates.requiredReady && gates.cageReady,
  },
  rand,
);
