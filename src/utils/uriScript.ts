// PACING_PUZZLE.md §6.28-17 バッチM61: ウリ(stage-5 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-17 を参照。
// ==== v0.25.2609(ボス動き横断監査・バッチ1「死に技の解放」) ====================================
// ウリは**監査で最も壊れていた技構成**だった(ヘッドレス実走180秒×3ペルソナで実測):
//   - **bolt が100%**。sweep / downslash / thrust は **1回も発動しなかった**。
//   - 原因: ウリの中立 chaseMove() はプレイヤーへ直進するので距離が常に密着〜近に居る一方、
//     sweep/downslash/thrust の下限が 320px だったため、実戦の間合いでは誰も適格にならなかった。
//   - **thrust(旧: 620px超)は理論上も発動不可能**だった: ゲート2アリーナはボス maxR=265 /
//     プレイヤー半径300 なので**最大分離は565px**。620pxには構造的に到達しない。
// 対策: 城ボス裁定(BOSS_RANGE_REWORK.md v0.25.2455)の「ゾーン×重み表」を適用し、
// thrust は「遠まで届く踏み込み技」=**追いつき技**として近ゾーンから重みを与える。
import { pickWeightedMove, bossZoneForDistance, type BossMoveWeights } from './bossScript';

export type UriMove = 'sweep' | 'downslash' | 'thrust' | 'bolt';

export const URI_PHASE_HP_THRESHOLD = 0.5; // §6.28-17: フェーズ2 = HP50%
// §6.28-17 #1「大薙ぎの内径」: Phase1=140px / Phase2=90px(技は増やさず精度だけ上げる)。不変。
export const uriSweepInnerRadius = (phase: 1 | 2): number => phase === 2 ? 90 : 140;

export const URI_COMBO_CHANCE = 0.6; // ①大薙ぎ→②振り下ろし(不変)

// ==== 4技×距離ゾーンの重み表(v0.25.2609) ====================================================
// 是正の狙い:
//   - 密着を bolt100% → **bolt50 / downslash39 / sweep11** の3本立てへ。
//     密着の主役を downslash にしたのは、**大薙ぎ(sweep)には内径(140/90px)がある**ため
//     (§6.28-17「懐が安全」の主題)。密着では大薙ぎは構造的に当たらないので主役にできない。
//     逆に downslash は内径なしの前方細長=**懐へ入った相手への答え**。主題を壊さずに空白を埋める。
//   - sweep は密着に薄く(11)残す: 内径で抜けられることをプレイヤーに見せる=学習装置。
//   - thrust は「到達不能な遠帯専用」から**追いつき技**へ役割変更(近10/中25/遠60)。城ボスの
//     dash(0/0/15/70)と同じ思想。旧FAR_MAX(1000)の頭打ちは撤廃。
export const URI_MOVE_WEIGHTS: BossMoveWeights<UriMove> = {
  sweep:     { melee: 10, near: 35, mid: 30, far: 15 },
  downslash: { melee: 35, near: 30, mid: 30, far: 10 },
  thrust:    { melee: 0,  near: 10, mid: 25, far: 60 },
  bolt:      { melee: 45, near: 25, mid: 15, far: 15 },
};

/** 技×距離→実効重み。0=出ない。 */
export const uriMoveWeight = (
  move: UriMove,
  distance: number,
  weights: BossMoveWeights<UriMove> = URI_MOVE_WEIGHTS,
): number => weights[move][bossZoneForDistance(distance)];

/** 各技の適格判定=「現在ゾーンの重み>0」(旧ハードゲートの後継)。 */
export const uriMoveEligible = (move: UriMove, distance: number): boolean => uriMoveWeight(move, distance) > 0;

const ALL_MOVES: UriMove[] = ['sweep', 'downslash', 'thrust', 'bolt'];
const ALL_READY: Record<UriMove, boolean> = { sweep: true, downslash: true, thrust: true, bolt: true };

/**
 * 現在ゾーンの重み>0の技から重み比例で1つ。該当無しはnull。
 * ウリは技ごとの個別CDを持たない(呼び出し側=angelBossTick.tsが単一の行動ゲートだけを見る)ので、
 * ready は常に全true(既存シグネチャを保つ)。
 */
export const pickUriMove = (
  distance: number,
  rand: () => number = Math.random,
): UriMove | null => pickWeightedMove(ALL_MOVES, m => uriMoveWeight(m, distance), ALL_READY, rand);

// §6.28-17 連携: ①大薙ぎ→②振り下ろし(60%)。「懐に入って避けた直後、同じ場所に内径なしが降る」ため、
// 追撃の振り下ろしは通常の間合いゲート(中320〜620)を適用しない(★未決事項に記録・rafiScript.tsの
// bone→jumpと同じ理由=直後の間合いが必ずしも「中」帯に収まらないため)。
export const pickUriCombo = (
  justFinished: UriMove,
  rand: () => number = Math.random,
): UriMove | null => {
  if (justFinished !== 'sweep') return null;
  return rand() < URI_COMBO_CHANCE ? 'downslash' : null;
};
