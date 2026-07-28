// PACING_PUZZLE.md §6.26 バッチM51: 城ボス「ジャイアント」の行動・攻撃パターン改訂。
// 「間合い/CD/HP段階から次の技を選ぶ」purely-functionな判断ロジック(実装精度の規律4)。
// レンダラ非依存・store非依存(gameStore.ts からのみ import される。逆import禁止=循環回避)。
// 数値の根拠(帯の由来/リード秒数/裁定内容)は PACING_PUZZLE.md §6.26-5/6.26-6/6.26-9 を参照。
// 実効(実時間)msの定数はこのファイル側に置き、gameStore.ts 側で ENEMY_ATTACK_SPEED_MULT を
// 掛けて atkUntil() 用の生値に変換する(このファイル自体は攻撃倍速の概念を知らない=純粋)。
//
// ==== M60追記(PACING_PUZZLE.md §6.28-11・ロットL4) ====
// Phase1/2向けの5関数(giantPhaseForHealth/giantPhaseJustChanged/giantMoveEligible/
// pickGiantMove/pickGiantCombo)は、通常ステージ(1〜6)の城ボスが今も使っている「社長実機評価
// 済み」の実装。CLAUDE.md「仕様変更のルール」に従い、Phase1/2の挙動が1ミリも変わらないことを
// 最優先に、下記の方針で拡張した:
//  ・giantPhaseForHealth / GIANT_COMBO_FOLLOWUP / GIANT_COMBO_CHANCE / pickGiantCombo は無改変
//    (Phase3はstoryBoss個体だけが到達する上位フェーズなので、別関数として「上に積む」)。
//  ・giantPhaseJustChanged / giantMoveEligible / pickGiantMove は phase の型を 1|2 → GiantPhase
//    (1|2|3)へ広げたが、phase∈{1,2}の入力に対する出力は一切変えていない(3は今までのコードから
//    絶対に来ない値だったので、新しい枝を1つ足しただけ=既存の到達可能な入力領域では無改変)。
//  ・Phase3専用の新規ロジック(giantPhaseForHealthStory/pickGiantStoryCombo等)はファイル末尾に集約。

import { phaseForHealth } from './bossScript';

export type GiantMove = 'stomp' | 'sweep' | 'jump' | 'dash' | 'bolt';
// Phase3は§6.28-11でstoryBoss(グレン/未確認変異体)専用に追加された上位フェーズ。
// 通常城ボスはgiantPhaseForHealth(無改変)しか呼ばないため、実際には1|2までしか出ない。
export type GiantPhase = 1 | 2 | 3;

// 間合いの帯(px・中心間距離)。6.26-6の表で確定した最終値(由来はgameStore.ts側の定数から導出済み)。
export const GIANT_RANGE = {
  MELEE_MAX: 140,   // 密着 0〜140
  NEAR_MAX: 320,    // 近 140〜320
  MID_MAX: 620,     // 中 320〜620
  FAR_MAX: 1000,    // 遠 620〜1000
  JUMP_MAX: 700,    // 飛び掛かりの上限(近〜中 140〜700)
} as const;

// フェーズ移行のHP閾値(社長裁定6.26-9 #4で60%のまま据え置き)。
export const GIANT_PHASE_HP_THRESHOLD = 0.6;

export const giantPhaseForHealth = (healthFrac: number): 1 | 2 =>
  healthFrac <= GIANT_PHASE_HP_THRESHOLD ? 2 : 1;

// フェーズが「今フレームで切り替わった瞬間」かどうか(HPバー点滅のトリガー判定に使う)。
// 初回(prevPhase未設定=初期化前)は「変わった」扱いにしない=ラン開始直後に誤発火させない。
// (M60: 型をGiantPhaseへ広げただけ。単純な数値比較なので3が来ても挙動は変わらない。)
export const giantPhaseJustChanged = (prevPhase: GiantPhase | undefined, nextPhase: GiantPhase): boolean =>
  prevPhase !== undefined && prevPhase !== nextPhase;

// 各技の間合い適格判定(6.26-6 状態機械の抽選条件と同一)。CD(readyAt)は呼び出し側(gameStore.ts)が
// 個別に持つタイムスタンプで判定するため、ここでは「間合い」と「フェーズ」だけを見る。
// (M60: phaseの型をGiantPhaseへ広げ、sweepをphase>=2へ緩和。phase∈{1,2}での出力は無改変
//  =通常城ボスは今までどおりphase===2の時だけsweepが解禁される。phase===3はstoryBoss専用で、
//  「Phase2で解禁された技はPhase3でも消えない」という原則⑥(6.28-2-2)どおりsweepを維持する。)
export const giantMoveEligible = (move: GiantMove, distance: number, phase: GiantPhase): boolean => {
  switch (move) {
    case 'stomp': return distance <= GIANT_RANGE.MELEE_MAX;
    case 'sweep': return (phase === 2 || phase === 3) && distance > GIANT_RANGE.MELEE_MAX && distance <= GIANT_RANGE.NEAR_MAX;
    case 'jump':  return distance > GIANT_RANGE.MELEE_MAX && distance <= GIANT_RANGE.JUMP_MAX;
    case 'dash':  return distance > GIANT_RANGE.NEAR_MAX && distance <= GIANT_RANGE.FAR_MAX;
    case 'bolt':  return distance > GIANT_RANGE.NEAR_MAX && distance <= GIANT_RANGE.MID_MAX;
    default: return false;
  }
};

const ALL_MOVES: GiantMove[] = ['stomp', 'sweep', 'jump', 'dash', 'bolt'];

// 間合い+フェーズ+CD明けの技から等確率で1つ選ぶ(既存スケジューラ gameStore.ts:7338-7339 と同じ作法)。
// 該当技が無ければ null(=通常チェイスへフォールスルー)。(M60: phase型のみGiantPhaseへ拡張。)
export const pickGiantMove = (
  distance: number,
  phase: GiantPhase,
  ready: Record<GiantMove, boolean>,
  rand: () => number = Math.random,
): GiantMove | null => {
  const pool = ALL_MOVES.filter(m => ready[m] && giantMoveEligible(m, distance, phase));
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
};

// Phase2限定の2連携(社長裁定6.26-9 #8): 許す組み合わせは2つのみ。
// 「相手がまだその技の間合いに居るなら」確率40%でもう1発だけ続ける。
export const GIANT_COMBO_FOLLOWUP: Partial<Record<GiantMove, GiantMove>> = {
  sweep: 'stomp',
  dash: 'stomp',
};
export const GIANT_COMBO_CHANCE = 0.4;

export const pickGiantCombo = (
  justFinished: GiantMove,
  phase: 1 | 2,
  distance: number,
  rand: () => number = Math.random,
): GiantMove | null => {
  if (phase !== 2) return null;
  const followup = GIANT_COMBO_FOLLOWUP[justFinished];
  if (!followup) return null;
  if (!giantMoveEligible(followup, distance, phase)) return null; // 「まだその技の間合いに居るなら」
  return rand() < GIANT_COMBO_CHANCE ? followup : null;
};

// ============================================================================================
// M60(PACING_PUZZLE.md §6.28-11・ロットL4): グレン(stage-7)/未確認変異体(stage-ex1)専用のPhase3。
// 通常城ボス(stage-1〜6)はgameStore.ts側で isStoryBoss !== true のためこれらの関数を一切呼ばない
// (呼び出し箇所は gameStore.ts のジャイアント新スクリプトブロックの isStoryBoss 分岐のみ)。
// ============================================================================================

// フェーズ移行のHP閾値(社長裁定6.28-21★2「足す」・§6.28-11 #1「HP30%以下」)。
// 30%は既存 drawHealthBar の赤しきい値(pct<0.3)と一致=新しい数字を発明しない。
// 60%は通常ジャイアントの GIANT_PHASE_HP_THRESHOLD と同値(Phase1→2の閾値はstoryBossでも変えない)。
export const GIANT_STORY_PHASE_THRESHOLDS = [GIANT_PHASE_HP_THRESHOLD, 0.3] as const;

// bossScript.ts の phaseForHealth(N段階汎用)をそのまま使う(新形式を発明しない)。
// healthFrac<=0.6でPhase2、<=0.3でPhase3、それ以外はPhase1——通常ジャイアントの2段判定と
// 60%の境界で完全に一致する(検証は giantScript.test.ts)。
export const giantPhaseForHealthStory = (healthFrac: number): GiantPhase =>
  phaseForHealth(healthFrac, GIANT_STORY_PHASE_THRESHOLDS) as GiantPhase;

// Phase3限定の3発目(社長裁定6.28-11 #2「薙ぎ払い→踏み鳴らし→突進」の3発目=踏み鳴らしの後に突進)。
// 既存2組(GIANT_COMBO_FOLLOWUP=sweep→stomp/dash→stomp)はPhase3でも生きたまま(原則⑥=フェーズは
// 技を減らさない)なので、それを土台に3発目のリンクだけを足す。
export const GIANT_STORY_PHASE3_FOLLOWUP: Partial<Record<GiantMove, GiantMove>> = {
  ...GIANT_COMBO_FOLLOWUP,
  stomp: 'dash',
};

// 連携確率(社長裁定6.28-11 #3「頻度だけを上げる」+ #EX注記「stage-ex1だけ60%→70%」)。
export const GIANT_STORY_COMBO_CHANCE_PHASE3 = 0.6;    // グレン(stage-7)
export const GIANT_STORY_COMBO_CHANCE_PHASE3_EX = 0.7; // 未確認変異体(stage-ex1・クリア後コンテンツ)

// Phase3(storyBossのみ到達)の追撃選択。既存pickGiantComboは `phase!==2` で弾く専用実装のため
// 呼び出し側(gameStore.ts)がPhase3の時だけこちらを使う(Phase1/2はpickGiantComboのまま=無改変)。
export const pickGiantStoryCombo = (
  justFinished: GiantMove,
  distance: number,
  isEx: boolean,
  rand: () => number = Math.random,
): GiantMove | null => {
  const followup = GIANT_STORY_PHASE3_FOLLOWUP[justFinished];
  if (!followup) return null;
  if (!giantMoveEligible(followup, distance, 3)) return null; // 「まだその技の間合いに居るなら」
  const chance = isEx ? GIANT_STORY_COMBO_CHANCE_PHASE3_EX : GIANT_STORY_COMBO_CHANCE_PHASE3;
  return rand() < chance ? followup : null;
};
