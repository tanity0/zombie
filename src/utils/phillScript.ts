// PACING_PUZZLE.md §10(EXボス「フィル(変異体)」バッチ2): フィルの技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。他の<boss>Script.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §10-3/§10-9/§10-13(技セット)・§10-14#7/§10-15#5(カウンター必須の規約)。
//
// 技14(実在13。#13「吸引+金環」は§10-14#14で落とされ、番号だけ14まで進んでいる):
// lightrain(1祝福・旧「光の雨」) lancefan(2光槍の扇) wingslash(3羽斬り) wingthrust(4羽突き) wingcombo(5羽連撃)
// summon(6召喚) goldring(7金環) judgment(8裁きの光★必須) cage(9羽根の檻★必須) meteor(10エルデの流星)
// ringtoss(11光輪投げ) dive(12急降下) feathershot(14羽根散弾)。
import { bossZoneForDistance, phaseForHealth, pickWeightedMove, type BossMoveWeights } from './bossScript';
import { multiPhaseTelegraphProg } from './bandSweep';

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
    // ★v0.25.3741(社長指示): 急降下は「召喚→急降下」の台本連携でのみ出す=単発抽選から除外。
    meteor: true, ringtoss: true, dive: false, feathershot: true,
    lightrain: gates.lightrainReady, goldring: gates.goldringReady,
    summon: gates.summonReady,
    judgment: gates.requiredReady && gates.judgmentReady,
    // ★v0.25.3740(社長指示「裁きの光の中身を羽根の檻に差し替え」): 檻はjudgment(裁きの光)の
    // 発動内容に統合=単独抽選から除外(同じ檻が2枠から出ない)。キー/CD台帳は互換のため残す。
    cage: false,
  },
  rand,
);

// ============================================================================================
// ★★赤い予告の4つの掟(CLAUDE.md・社長指示2026-09-18)への是正。PACING_PUZZLE.md §18-1 A-2/A-3/C-1。
// ============================================================================================
//
// **判定・ダメージ・射程・尺は1つも変えていない。** 変えたのは「いつ赤を出し、いつ消すか」だけで、
// 時刻は判定側(`angelBossTick.runPhillTick`)の州遷移と同じ順番・同じ尺から導く。
//
// 直した嘘(v0.25.4456以前):
//  - A-2 羽連撃の2撃目: **予告が存在しない**(1撃目の帯だけ)。2撃目は1撃目の +active1+gap に当たる。
//  - A-3 光輪投げ: 往路(`out`)も復路(`back`)も**静的な全形の帯が出っぱなし**。実際に当たるのは
//    溜め明け(1撃目)と往路の終わり(2撃目)の2点だけで、**復路の380msは赤いのに当たらない**。

/** 2撃ある技の赤帯。`null`=その帯は出さない / 数値=流星の進行(1で消え切る=当たる)。 */
export interface PhillTwoBeatRed { firstProg: number | null; secondProg: number | null }

const NO_RED: PhillTwoBeatRed = { firstProg: null, secondProg: null };

export interface PhillWingcomboTiming { windupMs: number; active1Ms: number; gapMs: number }

/**
 * ★A-2: 羽連撃(技5)の赤帯。
 * 1撃目は溜め明け(`windup`満了)、**2撃目は `gap` の満了**(= `active1` + `gapMs` だけ後)に成立する
 * (`runPhillTick` の `phill-wingcombo-gap` 枝が `pushBlast` する)。
 * ⇒ 2撃目の帯は**溜めの頭から出て**(掟②)、**2撃目が当たる瞬間に消え切る**(掟③)。
 */
export const phillWingcomboRed = (
  state: string, remainMs: number, t: PhillWingcomboTiming,
): PhillTwoBeatRed => {
  const chain = [t.windupMs, t.active1Ms, t.gapMs];
  if (state === 'phill-wingcombo-windup') {
    return {
      firstProg: multiPhaseTelegraphProg([t.windupMs], 0, remainMs),
      secondProg: multiPhaseTelegraphProg(chain, 0, remainMs),
    };
  }
  if (state === 'phill-wingcombo-active1') return { firstProg: null, secondProg: multiPhaseTelegraphProg(chain, 1, remainMs) };
  if (state === 'phill-wingcombo-gap') return { firstProg: null, secondProg: multiPhaseTelegraphProg(chain, 2, remainMs) };
  return NO_RED; // active2(2撃目は既に成立済み)/ recover は赤なし
};

export interface PhillRingtossTiming { windupMs: number; outMs: number }

/**
 * ★A-3: 光輪投げ(技11)の赤帯。
 * 当たるのは**2点だけ**——溜め明け(投げた瞬間)と、往路 `out` の満了(戻り始め)。
 * **復路 `back` には判定が無い**ので赤も出さない(旧実装は全形の帯を出しっぱなしだった)。
 */
export const phillRingtossRed = (
  state: string, remainMs: number, t: PhillRingtossTiming,
): PhillTwoBeatRed => {
  const chain = [t.windupMs, t.outMs];
  if (state === 'phill-ringtoss-windup') {
    return {
      firstProg: multiPhaseTelegraphProg([t.windupMs], 0, remainMs),
      secondProg: multiPhaseTelegraphProg(chain, 0, remainMs),
    };
  }
  if (state === 'phill-ringtoss-out') return { firstProg: null, secondProg: multiPhaseTelegraphProg(chain, 1, remainMs) };
  return NO_RED; // back(判定なし)/ recover は赤なし
};

/**
 * ★C-1: 金環(技7)の赤い大円。**濃くなる+脈打つだけ**で流星になっていなかった(掟①違反)。
 * 塗りだけを流星(外→内へ流れ、消え切った瞬間=当たる)にする。**輪の金色は社長裁定で維持**。
 */
export const phillGoldringProg = (
  state: string, remainMs: number, windupMs: number,
): number | null =>
  state === 'phill-goldring-windup' ? multiPhaseTelegraphProg([windupMs], 0, remainMs) : null;

// =============================================================================================
// ★§18-1 A-5「祝福 1発目」(社長裁定2026-09-18「フィルは推薦で」= 案①を採用)
// =============================================================================================
/**
 * 祝福(光の雨)の着弾点は、旧実装では**溜めの満了と同時**に抽選され、1発目の `at` が抽選と同時刻だった。
 * つまり1発目の予告に使える時間が**構造的に0**で、**1フレームも赤が出ない**(赤い予告の掟②違反)。
 *
 * ★採った案(①): **抽選だけを `shotGapMs` ぶん前倒しする。**
 * - **命中時刻は6発とも1msも変わらない**(`at` は溜めの満了を基準に置くので不変)。
 * - 変わるのは**着弾点をサンプルする時刻が 220ms 早まる**ことだけ(散らばり±90pxに対し歩行220ms≒25px)。
 * - 却下した案: ②1発目を +220ms(技の尺が伸びる) ③着弾点を溜め開始でロック(1.8秒前の位置基準=難度が下がる)。
 */
export const phillLightrainDrawAt = (windupEndMs: number, shotGapMs: number): number =>
  windupEndMs - shotGapMs;

/** 各発の命中時刻(溜めの満了を基準に等間隔)。**前倒ししてもここは変わらない**。 */
export const phillLightrainHitTimes = (
  windupEndMs: number, shotCount: number, shotGapMs: number,
): number[] => Array.from({ length: shotCount }, (_, i) => windupEndMs + i * shotGapMs);

/**
 * 着弾円の予告の進み(0..1)。**1=命中の瞬間**(そこで消え切る=掟③)。
 * 全発が「抽選した時刻」から自分の命中までを自分の尺として持つので、1発目にも 220ms の予告が付く。
 */
export const phillLightrainProg = (
  hitAtMs: number, drawAtMs: number, gameTimeMs: number,
): number => {
  const total = hitAtMs - drawAtMs;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - (hitAtMs - gameTimeMs) / total));
};
