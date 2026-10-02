// ★ミーミルの「紫の車輪」(回る全方位レーザー・research/MIMIR_WHEEL.md)の純関数。
// 予告線(pixiScene)・判定(useGameLoop)・追跡弾(gameStore)が**同じ式**を読む。store / pixi 非依存の葉。

/**
 * 絵の眼の高さ=判定の中心から体の高さの何倍上か(立ち絵は足元から上へ描くので眼は判定の中心より上にある)。
 * 変化の赤い光(描画)と追跡弾の出どころ(判定)が同じ値を読む。実測: 立ち絵の眼は判定の中心から約160px上(高さ124の約1.3倍)。
 */
export const MIMIR_WHEEL_EYE_UP = 1.3;

export interface MimirWheelSpec {
  windupMs: number; fireMs: number; spokes: number;
  /** 溜めの終わりで届く角速度(rad/s)=予告線がじわっと回り始める。 */
  omegaWindup: number;
  /** 発射中の最高角速度(rad/s)。 */
  omegaMax: number;
  /** 発射の頭で omegaWindup → omegaMax へ上げる時間 / 最後に 0 へ落とす時間(ms)。 */
  rampMs: number; decelMs: number;
}

const clampSpec = (s: MimirWheelSpec) => {
  const W = Math.max(1, s.windupMs) / 1000;
  const F = Math.max(1, s.fireMs) / 1000;
  const R = Math.min(Math.max(0, s.rampMs) / 1000, F / 2);
  const D = Math.min(Math.max(0, s.decelMs) / 1000, F - R);
  return { W, F, R, D, ww: Math.abs(s.omegaWindup), wm: Math.abs(s.omegaMax) };
};

/**
 * 溜めの頭から tMs の、回転の**角速度**(rad/s・向きの符号なし)。
 * 溜め: 0→ωw へ直線 / 発射の頭 R: ωw→ωmax / 中盤: ωmax / 最後の D: ωmax→0 / 発射後: 0。継ぎ目で連続(慣性)。
 */
export const mimirWheelOmega = (tMs: number, spec: MimirWheelSpec): number => {
  const { W, F, R, D, ww, wm } = clampSpec(spec);
  const t = Math.max(0, tMs) / 1000;
  if (t <= W) return ww * (t / W);
  const u = t - W;
  if (u <= R) return R > 0 ? ww + (wm - ww) * (u / R) : wm;
  if (u <= F - D) return wm;
  if (u <= F) return D > 0 ? wm * (1 - (u - (F - D)) / D) : 0;
  return 0;
};

/** 溜めの頭から tMs までに回った角(rad・0以上・単調増加)= `mimirWheelOmega` の積分(閉じた式)。 */
export const mimirWheelAngle = (tMs: number, spec: MimirWheelSpec): number => {
  const { W, F, R, D, ww, wm } = clampSpec(spec);
  const t = Math.max(0, tMs) / 1000;
  if (t <= W) return (ww * t * t) / (2 * W);
  let a = (ww * W) / 2;
  const u = t - W;
  const ur = Math.min(u, R);
  a += R > 0 ? ww * ur + ((wm - ww) * ur * ur) / (2 * R) : 0;
  if (u <= R) return a;
  const uc = Math.min(u, F - D) - R;
  a += wm * uc;
  if (u <= F - D) return a;
  const ud = Math.min(u, F) - (F - D);
  a += D > 0 ? wm * (ud - (ud * ud) / (2 * D)) : 0;
  return a;
};

/** 最初の角: ヘイトの相手への角 + π/本数(=相手は隙間の真ん中から始まる)。 */
export const mimirWheelTheta0 = (aimAngle: number, spokes: number): number =>
  aimAngle + Math.PI / Math.max(1, Math.round(spokes));

/** 溜めの頭から tMs の、k本目(0始まり)のレーザーの角。dir=+1 時計回り / −1 反時計回り(画面のyは下向き)。 */
export const mimirWheelSpokeAngle = (
  theta0: number, dir: 1 | -1, k: number, tMs: number, spec: MimirWheelSpec,
): number => theta0 + dir * mimirWheelAngle(tMs, spec) + (Math.PI * 2 * k) / Math.max(1, Math.round(spec.spokes));

/** 半径 r での隙間の横幅(px)= 2πr/本数 − 2·半太さ − 自機の幅。 */
export const mimirWheelGapPx = (r: number, spokes: number, halfWidth: number, actorPx: number): number =>
  (Math.PI * 2 * r) / Math.max(1, Math.round(spokes)) - 2 * halfWidth - actorPx;

/**
 * 追跡弾の向きを、狙点の方へ**最大 maxTurnRad だけ**回す(旋回上限=横へ切れば外せる)。向きは単位ベクトルで返す。
 */
export const steerDirToward = (
  dirX: number, dirY: number, fromX: number, fromY: number, toX: number, toY: number, maxTurnRad: number,
): { x: number; y: number } => {
  const cur = Math.atan2(dirY, dirX);
  const want = Math.atan2(toY - fromY, toX - fromX);
  let d = want - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // −π..π
  const lim = Math.max(0, maxTurnRad);
  const a = cur + Math.max(-lim, Math.min(lim, d));
  return { x: Math.cos(a), y: Math.sin(a) };
};

/**
 * 変化(HP60%以下)の追跡弾 k 発目(0始まり)を撃つ時刻(発射の頭からのms)。「2連 → 休み」の組:
 * startMs + ⌊k/2⌋·(pairGapMs + restMs) + (k mod 2)·pairGapMs。2連の間は1振りで2つ返せる間合い。
 */
export const mimirWheelShotOffsetMs = (
  k: number, h: { startMs: number; pairGapMs: number; restMs: number },
): number => h.startMs + Math.floor(Math.max(0, k) / 2) * (h.pairGapMs + h.restMs) + (Math.max(0, k) % 2) * h.pairGapMs;
