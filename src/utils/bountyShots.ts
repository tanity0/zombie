// PACING_PUZZLE.md §6.38 v10「バス停の中立射撃に緩急」: 賞金首「バス停」(bounty-ranged)の中立
// (chase中の"ポツポツ撃ち")を型3種(burst/fan/charge)のサイクル抽選へ差し替える純関数群。
//
// 依存ゼロの葉(bountyDims.tsと同じ理由=他モジュールを一切importしない。循環import防止)。
// 型表・抽選・間隔・弾数の計算はここへ一本化し、tickRanged(bountyTick.ts)はここの関数を呼ぶだけに
// する(§6.38 v10 #10)。レンダラ/store非依存=ヘッドレスでユニットテスト可能。

export type BrShotPattern = 'burst' | 'fan' | 'charge';

/**
 * 1発あたりの持ち時間(社長裁定「案A」)。旧 `BR_SHOT_INTERVAL_MS` の改名(§6.38 v10 #11)。
 * 値(1100)は不変——「弾と弾の等間隔」から「サイクル長を組み立てる単位(弾数×これ)」へ意味が
 * 変わったための改名(#3)。
 */
export const BR_SHOT_UNIT_MS = 1100;

// ---- burst: 200ms間隔で3発。狙いはサイクル開始時のプレイヤー方向で固定(#1)。--------------------------
export const BR_BURST_SHOT_COUNT = 3;
export const BR_BURST_INTERVAL_MS = 200;

// ---- fan: 同時3発・±12°。距離340px(呼び出し側のBR_KITE_MIN)未満では選ばない(#1・監査指摘=
// 近距離だと3発同時命中で30ダメージへ跳ね上がるため)。距離判定そのものは呼び出し側がallowFanで渡す
// (このファイルはBR_KITE_MINを知らない=依存ゼロを保つ)。-------------------------------------------------
export const BR_FAN_SHOT_COUNT = 3;
export const BR_FAN_SPREAD_DEG = 12;
export const BR_FAN_ANGLE_OFFSETS_DEG: readonly number[] = [-BR_FAN_SPREAD_DEG, 0, BR_FAN_SPREAD_DEG];

// ---- charge: 350ms溜め→1発・弾速1.5倍(社長裁定「案ア」)。威力は現状のまま。溜め中は減速して止まり、
// 発射後に再加速する(慣性・CLAUDE.md MUST=瞬間停止禁止)。--------------------------------------------
export const BR_CHARGE_SHOT_COUNT = 1;
export const BR_CHARGE_WINDUP_MS = 350;
export const BR_CHARGE_SPEED_MULT = 1.5;
/** 溜め込みで1サイクル=BR_SHOT_UNIT_MS(1100)。溜め350+発射後の再加速(recover)750(#3)。 */
export const BR_CHARGE_RECOVER_MS = BR_SHOT_UNIT_MS - BR_CHARGE_WINDUP_MS;

const BR_PATTERNS: readonly BrShotPattern[] = ['burst', 'fan', 'charge'];

/** パターンごとの弾数(サイクル長=これ×BR_SHOT_UNIT_MSの土台・#3)。 */
export const brShotCount = (pattern: BrShotPattern): number => (
  pattern === 'burst' ? BR_BURST_SHOT_COUNT
    : pattern === 'fan' ? BR_FAN_SHOT_COUNT
      : BR_CHARGE_SHOT_COUNT
);

/**
 * サイクル長(ms) = 弾数 × BR_SHOT_UNIT_MS(#3「次サイクル開始=サイクル開始時刻+弾数×1100
 * (最後の弾からではない)」)。burst/fan=3300ms・charge=1100ms(溜め350+発射後の再加速750)。
 */
export const brCycleDurationMs = (pattern: BrShotPattern): number => brShotCount(pattern) * BR_SHOT_UNIT_MS;

/**
 * サイクル抽選(#2)。等確率・直前と同じ型は引かない。距離条件でfanが弾かれた(allowFan=false)時は
 * 残り2型(burst/charge)から引き直す=候補からfanを除いて抽選するのと等価。
 * randは注入式(0<=rand()<1想定)=テストで決定的に固定できる(giantScript.ts/bossScript.ts等と同じ作法)。
 * 直前と同じ型を除いてもallowFan条件と組み合わせて候補が0件になる経路は無い
 * (3候補からprevで最大1つ・fanで最大1つを除いても必ず1件以上残る)。
 */
export const pickBrShotPattern = (
  rand: () => number, prev: BrShotPattern | null, allowFan: boolean,
): BrShotPattern => {
  const pool = BR_PATTERNS.filter(p => p !== prev && (allowFan || p !== 'fan'));
  const idx = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
  return pool[idx];
};

/**
 * 溜め中(windup)の移動速度倍率。1(溜め開始=通常速度)→0(溜め完了=停止)。瞬間停止禁止
 * (CLAUDE.md MUST「動きの絶対ルール: 慣性」)なので滑らかなease-out(2乗)で減速する。
 * progress01は「溜めの経過(0=開始・1=発射の瞬間)」。
 */
export const brChargeWindupSpeedMult = (progress01: number): number => {
  const inv = 1 - Math.max(0, Math.min(1, progress01));
  return inv * inv;
};

/**
 * 発射後の再加速(recover)の移動速度倍率。0(発射直後=静止)→1(recover完了=通常速度)。ease-in(2乗)。
 * progress01は「発射後の経過(0=発射直後・1=recover完了)」。
 * windup終端(0)とrecover始端(0)が連続する=瞬間停止禁止条件を満たす(値がジャンプしない)。
 */
export const brChargeRecoverSpeedMult = (progress01: number): number => {
  const p = Math.max(0, Math.min(1, progress01));
  return p * p;
};
