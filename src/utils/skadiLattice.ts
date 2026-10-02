// ★スカジの「氷の格子」(research/SKADI_LATTICE.md)の純関数。判定(useGameLoop)と予告・刃の絵(pixiScene)が同じ並びを読む。
// store / pixi 非依存の葉。

export type LatticeAxis = 'v' | 'h';

export interface LatticeSpec { bands: number; spacing: number; halfWidth: number }

export interface LatticeBand { fx: number; fy: number; tx: number; ty: number }

/**
 * 1段の刃の並び。軸 'v'=縦の刃(上→下へ走る帯)が横に並ぶ / 'h'=横の刃(左→右)が縦に並ぶ。
 * 中心の1本(i = ⌊(n−1)/2⌋ を side で選ぶ)が段の中心 (cx, cy) を通る=止まっていると必ず当たる。
 * side=+1 は中心より「+側」に多く並ぶ(n=10なら +側5本・−側4本)、−1 はその逆。
 * 刃の長さ = 本数 × 間隔(=正方形の格子)。**帯の端点**を返す(判定は distToBandRect が半幅ぶん伸ばした四角=描いている四角)。
 */
export const latticeBands = (
  cx: number, cy: number, axis: LatticeAxis, side: 1 | -1, spec: LatticeSpec,
): LatticeBand[] => {
  const n = Math.max(1, Math.round(spec.bands));
  const lo = side === 1 ? -Math.floor((n - 1) / 2) : -Math.ceil((n - 1) / 2); // 中心から−側に何本
  const half = (n * spec.spacing) / 2;
  const res: LatticeBand[] = [];
  for (let i = 0; i < n; i++) {
    const off = (lo + i) * spec.spacing;
    if (axis === 'v') res.push({ fx: cx + off, fy: cy - half, tx: cx + off, ty: cy + half });
    else res.push({ fx: cx - half, fy: cy + off, tx: cx + half, ty: cy + off });
  }
  return res;
};

/** 段の数: 覚醒前(フェーズ1)は縦→横の1回=2段、覚醒後は rounds 回。 */
export const latticeStageCount = (phase: number, roundsP1: number, roundsAwake: number): number =>
  2 * Math.max(1, Math.round(phase >= 2 ? roundsAwake : roundsP1));

/** k 段目(0始まり)の軸。縦から始めて交互。 */
export const latticeAxisForStage = (k: number): LatticeAxis => (k % 2 === 0 ? 'v' : 'h');

/**
 * 静止から d px 進むのにかかる時間(ms)。速度は目標速度 v へ時定数 tau(秒)で寄る(=プレイヤーの慣性)。
 * 進んだ距離 x(T) = v·(T − tau·(1 − e^(−T/tau))) を二分法で解く。受け入れ条件「溜め ≥ 反応 + 1歩」の物差し。
 */
export const walkTimeMs = (d: number, v: number, tau: number): number => {
  if (d <= 0) return 0;
  const x = (T: number) => v * (T - tau * (1 - Math.exp(-T / Math.max(1e-6, tau))));
  let lo = 0, hi = 10;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (x(m) < d) lo = m; else hi = m; }
  return hi * 1000;
};

/**
 * 当たった時に弾く向きの元(被弾源)。刃に**直交**して弾く: 縦の刃なら (刃のx, 自機のy)、横の刃なら (自機のx, 刃のy)。
 * 刃の真上(1px未満)に居たら、本数の少ない側(開けている側=−side)へ弾くよう、源を +side 側へ1pxずらす。
 */
export const latticeHitSource = (
  band: LatticeBand, px: number, py: number, side: 1 | -1,
): { x: number; y: number } => {
  if (band.fx === band.tx) {
    const x = Math.abs(px - band.fx) < 1 ? px + side : band.fx;
    return { x, y: py };
  }
  const y = Math.abs(py - band.fy) < 1 ? py + side : band.fy;
  return { x: px, y };
};

/**
 * 段の中心=相手が**溜めの終わり(当たる瞬間)に居る場所**の予測(社長裁定2026-10-02「推薦で」)。
 * 今の位置 + 速度 × 溜め。止まっていれば今の位置(=中心の1本が真上)、歩き続ければ行き先の真上に刃が来る
 * =斜めに歩き続けるだけで全段を抜ける、を潰し、毎段「止まる/切り返す」を迫る。速度を持たない相手(守護霊)は今の位置。
 */
export const latticeCenter = (
  x: number, y: number, vx: number, vy: number, windupMs: number,
): { x: number; y: number } => ({ x: x + vx * (windupMs / 1000), y: y + vy * (windupMs / 1000) });
