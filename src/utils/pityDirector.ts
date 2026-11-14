// 難易度⑥: ピンチ救済(pity)ディレクター。社長指示の例:「あまりにもピンチが続いて敵が増えすぎて
// しまってる人に爆弾出現率を上げる。ただし出る場所は台本を書く(今は松明からしか出ない、とか)」。
//
// 方針(RE4の動的補給=足りない物を出す、に相当):
// - 「ピンチ」= 低HP かつ 敵数が湧き上限近くまで溜まっている 状態が一定時間続いたこと。
//   一瞬の被弾では発動しない(緊張は演出の一部。持続した行き詰まりだけを救う)。
// - 救済は【中身のバイアスだけ】: 松明(breakable prop)を壊した時のドロップ内訳を回復/爆弾寄りに
//   ずらし、ドロップ率も少し上げる。出る場所は従来どおり松明のみ=台本(場所は固定・中身で調整)。
// - pity=0 の時は既存の閾値と完全一致(挙動不変)。敵の強さ/湧きには一切触れない(救済は補給側だけ)。
// - 爆弾は現在 BOMB_PICKUPS_ENABLED=false(社長指示で調査中OFF)なので、ONに戻された時に自動で
//   このバイアスが効く。OFFの間は爆弾枠はマグネットに流れる(既存のフォールバックのまま)。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

export interface PinchState { pinchMs: number; }

export const createPinchState = (): PinchState => ({ pinchMs: 0 });

export const PINCH_HP_FRAC = 0.35;    // これ以下のHP割合で「苦しい」
export const PINCH_ENEMY_FRAC = 0.75; // 湧き上限に対する敵数の割合がこれ以上で「敵が溜まりすぎ」
export const PINCH_MIN_MS = 6000;     // ピンチがこの時間続いてから救済が立ち上がる
export const PINCH_FULL_MS = 20000;   // この時間で救済が最大
const PINCH_DECAY_MULT = 3;           // ピンチを抜けたら3倍速で解除(救済を引きずらない)

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export const stepPinch = (
  prev: PinchState,
  input: { hpFrac: number; enemyCount: number; enemyCap: number; dtMs: number }
): PinchState => {
  const pinched = input.hpFrac <= PINCH_HP_FRAC && input.enemyCount >= input.enemyCap * PINCH_ENEMY_FRAC;
  const pinchMs = pinched
    ? Math.min(PINCH_FULL_MS, prev.pinchMs + input.dtMs)
    : Math.max(0, prev.pinchMs - input.dtMs * PINCH_DECAY_MULT);
  return { pinchMs };
};

// 救済レベル(0=なし〜1=最大)。PINCH_MIN_MS までは0のまま(閾値以下では一切効かない)。
export const pityLevel = (pinchMs: number): number =>
  clamp01((pinchMs - PINCH_MIN_MS) / (PINCH_FULL_MS - PINCH_MIN_MS));

// 松明ドロップの調整値。dropChance=アイテムが出る確率。roll がしきい値未満の順に
// 弾薬 → 回復 → 爆弾 → (残り)マグネット(gameStore.dropBreakablePropLoot の既存ロジックと同形)。
export interface PityDropTuning {
  dropChance: number; // 既定 0.42
  ammoT: number;      // roll <  ammoT           → 弾薬(既定 0.5)
  healthT: number;    // roll < healthT          → 回復(既定 0.75)
  bombT: number;      // roll <  bombT           → 爆弾(既定 0.9・BOMB_PICKUPS_ENABLED時のみ)
}

// 既定値 = gameStore の従来定数と完全一致(level 0 で挙動不変であることの根拠)。
export const BASE_DROP_TUNING: PityDropTuning = { dropChance: 0.42, ammoT: 0.5, healthT: 0.75, bombT: 0.9 };
// 最大救済時: ドロップ率0.42→0.70、内訳は 弾薬30% / 回復40% / 爆弾25% / マグネット5%。
const FULL_PITY_TUNING: PityDropTuning = { dropChance: 0.7, ammoT: 0.3, healthT: 0.7, bombT: 0.95 };

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const pityDropTuning = (level: number): PityDropTuning => {
  const t = clamp01(level);
  return {
    dropChance: lerp(BASE_DROP_TUNING.dropChance, FULL_PITY_TUNING.dropChance, t),
    ammoT: lerp(BASE_DROP_TUNING.ammoT, FULL_PITY_TUNING.ammoT, t),
    healthT: lerp(BASE_DROP_TUNING.healthT, FULL_PITY_TUNING.healthT, t),
    bombT: lerp(BASE_DROP_TUNING.bombT, FULL_PITY_TUNING.bombT, t),
  };
};
