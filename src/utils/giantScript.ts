// PACING_PUZZLE.md §6.26 バッチM51: 城ボス「ジャイアント」の行動・攻撃パターン改訂。
// 「間合い/CD/HP段階から次の技を選ぶ」purely-functionな判断ロジック(実装精度の規律4)。
// レンダラ非依存・store非依存(gameStore.ts からのみ import される。逆import禁止=循環回避)。
// 数値の根拠(帯の由来/リード秒数/裁定内容)は PACING_PUZZLE.md §6.26-5/6.26-6/6.26-9 を参照。
// 実効(実時間)msの定数はこのファイル側に置き、gameStore.ts 側で ENEMY_ATTACK_SPEED_MULT を
// 掛けて atkUntil() 用の生値に変換する(このファイル自体は攻撃倍速の概念を知らない=純粋)。

export type GiantMove = 'stomp' | 'sweep' | 'jump' | 'dash' | 'bolt';

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
export const giantPhaseJustChanged = (prevPhase: 1 | 2 | undefined, nextPhase: 1 | 2): boolean =>
  prevPhase !== undefined && prevPhase !== nextPhase;

// 各技の間合い適格判定(6.26-6 状態機械の抽選条件と同一)。CD(readyAt)は呼び出し側(gameStore.ts)が
// 個別に持つタイムスタンプで判定するため、ここでは「間合い」と「フェーズ」だけを見る。
export const giantMoveEligible = (move: GiantMove, distance: number, phase: 1 | 2): boolean => {
  switch (move) {
    case 'stomp': return distance <= GIANT_RANGE.MELEE_MAX;
    case 'sweep': return phase === 2 && distance > GIANT_RANGE.MELEE_MAX && distance <= GIANT_RANGE.NEAR_MAX;
    case 'jump':  return distance > GIANT_RANGE.MELEE_MAX && distance <= GIANT_RANGE.JUMP_MAX;
    case 'dash':  return distance > GIANT_RANGE.NEAR_MAX && distance <= GIANT_RANGE.FAR_MAX;
    case 'bolt':  return distance > GIANT_RANGE.NEAR_MAX && distance <= GIANT_RANGE.MID_MAX;
    default: return false;
  }
};

const ALL_MOVES: GiantMove[] = ['stomp', 'sweep', 'jump', 'dash', 'bolt'];

// 間合い+フェーズ+CD明けの技から等確率で1つ選ぶ(既存スケジューラ gameStore.ts:7338-7339 と同じ作法)。
// 該当技が無ければ null(=通常チェイスへフォールスルー)。
export const pickGiantMove = (
  distance: number,
  phase: 1 | 2,
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
