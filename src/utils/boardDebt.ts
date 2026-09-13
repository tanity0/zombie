// PACING_REDESIGN.mdバッチ3.5-B: 盤面在庫(boardDebt)。
// 「今盤面に何がいるのか・倒したのか」を知ってから投入する(社長指示)。台本・イベント・配役はどれも
// 盤面の残存重量を見ずに投入しており、固い敵(ゾンビ/パンプキン)を捌き切れないままピークや
// イベントが重なる=火に油、という欠落を埋める。ボス系(裏ボス/城ボス/giantbat/reaper)は別トラック
// なので対象外。台本PHASESの時刻(骨格)は動かさず、「投入を絞る方向のみ」に使う(4箇所)。
import type { Enemy, EnemyType } from '../types/game';

// 型ごとの重さ(叩き台・社長指定)。表に無い型(ボス系/ハンター等)は0=在庫に数えない。
const DEBT_WEIGHT: Partial<Record<EnemyType, number>> = {
  bat: 0.5,
  skeleton: 1,
  zombie: 2.5,
  plant: 3,
  werewolf: 4,
  screamer: 4,
  ghost: 5,
  pumpkin: 6,
};

// debtFor = Σ 型の重さ × (残りHP/最大HP)。半分削った敵は「在庫の半分」として連続値で入る
// (「倒したのか?」を段階的に反映)。敵は最大20体なので計算コストは無視できる。
export const debtFor = (enemies: Pick<Enemy, 'type' | 'health' | 'maxHealth'>[]): number =>
  enemies.reduce((sum, e) => {
    const w = DEBT_WEIGHT[e.type];
    if (!w) return sum;
    const hpFrac = e.maxHealth > 0 ? Math.max(0, Math.min(1, e.health / e.maxHealth)) : 0;
    return sum + w * hpFrac;
  }, 0);

// 在庫を見る4箇所のしきい値(すべて叩き台・実機調整前提・社長指示)。
export const EVENT_DEBT_MAX = 12; // これを超えたら囲い/ハンター/叫びの発火を延期(タイマー消費なし)
export const CAST_DEBT_MAX = 10;  // これを超えたらgatePressureの配役投入を延期
export const RISE_DEBT_MAX = 10;  // これを超えたらgatePressureの登り(rising)をブロック

const TEMPO_DEBT_FLOOR = 8;          // これ以下は湧きテンポを緩めない
const TEMPO_DEBT_EASE_PER_UNIT = 0.05; // 在庫1あたりの間隔倍率の上乗せ
const TEMPO_DEBT_EASE_CAP = 1.6;     // 間隔倍率の上限(PUMPKIN_PAIR_SPAWN_EASEの一般化)

// 湧きテンポのイーズ倍率: interval × (1 + 0.05×max(0, debt-8))、上限×1.6。
export const debtTempoEaseMult = (debt: number): number =>
  Math.min(TEMPO_DEBT_EASE_CAP, 1 + TEMPO_DEBT_EASE_PER_UNIT * Math.max(0, debt - TEMPO_DEBT_FLOOR));
