// ★ヨルムンガルドの弾幕技(research/JORM_DANMAKU.md)。導入の叩きつけの時刻表・弾幕Aの発射角・
// 弾幕Bの落下点と撒き方を**純関数**で持つ(判定=useGameLoop と 描画=pixiScene が同じ式を読む)。
// store / pixi 非依存の葉。

/** 叩きつけの時刻表。段k(1始まり)の命中時刻 = 開始 + windup + (k−1)×interval。 */
export const jormSlamHitAt = (startAt: number, k: number, windupMs: number, intervalMs: number): number =>
  startAt + windupMs + (Math.max(1, k) - 1) * intervalMs;

/** 段k(1始まり)の「体からの届き」(px)。表に無い段は最後の値。 */
export const jormSlamReach = (k: number, reaches: readonly number[]): number =>
  reaches[Math.min(reaches.length, Math.max(1, k)) - 1] ?? 0;

/**
 * 段kの叩きつけの判定=**体の矩形を reach だけ広げた矩形**(帯: 始点→終点・半幅)。
 * ★`pumpkinBlasts` の帯判定(`distToBandRect`)と、赤い予告の帯(`drawSweepBand`)が**同じ矩形**を読む
 * =「赤いのに当たらない/赤くないのに当たる」を作らない。蛇は横長(519×90)なので、円にすると
 * 脇(上下)と先端で逃げる距離が5倍違う=**どこに居ても同じ距離で逃げられる**ように体の形で広げる。
 */
export const jormSlamBand = (
  body: { x: number; y: number; width: number; height: number }, reach: number,
): { fx: number; fy: number; tx: number; ty: number; halfWidth: number } => {
  const cy = body.y + body.height / 2;
  return { fx: body.x - reach, fy: cy, tx: body.x + body.width + reach, ty: cy, halfWidth: body.height / 2 + reach };
};

/** 点から体の矩形までの距離(中なら0)と、矩形上の最寄り点。 */
export const jormBodyRectDist = (
  px: number, py: number, body: { x: number; y: number; width: number; height: number },
): { dist: number; nx: number; ny: number } => {
  const nx = Math.max(body.x, Math.min(body.x + body.width, px));
  const ny = Math.max(body.y, Math.min(body.y + body.height, py));
  return { dist: Math.hypot(px - nx, py - ny), nx, ny };
};

/**
 * 段kの赤い円の溜めの進み(0..1)。**全段の円が導入の開始時刻に出て**、段kはその段の命中時刻で1になる
 * (赤い予告の掟②③: 出る=溜めの開始 / 消え切る=当たる・段ごとに別々の時刻)。
 * 開始前・命中後は null(描かない)。
 */
export const jormSlamTelegraphProgress = (
  now: number, startAt: number, k: number, windupMs: number, intervalMs: number,
): number | null => {
  const hitAt = jormSlamHitAt(startAt, k, windupMs, intervalMs);
  if (now < startAt || now >= hitAt) return null;
  const span = hitAt - startAt;
  return span > 0 ? (now - startAt) / span : 1;
};

// =================================================================================================
// 弾幕A: 波と粒の境界(発射角を二次関数で回す)
// =================================================================================================
export interface JormWaveSpec {
  /** 腕の数(1回に撃つ方向の数)。 */
  arms: number;
  /** 回転の初速(rad/s)と加速(rad/s²)。**時計回り**(画面のyは下向き=角が増える向き)。 */
  omega0: number;
  alpha: number;
}

/**
 * 撃ち始めから t ms の時の、腕kの発射角(rad)。θ0 + 2πk/arms + ω0·t + ½·α·t²。
 * ★回転は**常に時計回り**(§6.28-7の螺旋と同じ不変条件): 符号は Math.abs で正へ丸める
 * =定数の符号ミスがあっても反転できない。
 */
export const jormWaveAngle = (theta0: number, k: number, tMs: number, spec: JormWaveSpec): number => {
  const t = Math.max(0, tMs) / 1000;
  const arms = Math.max(1, Math.round(spec.arms));
  return theta0 + (Math.PI * 2 * k) / arms
    + Math.abs(spec.omega0) * t + 0.5 * Math.abs(spec.alpha) * t * t;
};

/** 最初の向き: 相手へ向けた角から、腕と腕の間の半分だけずらす(相手は腕の間から始まる)。 */
export const jormWaveTheta0 = (aimAngle: number, arms: number): number =>
  aimAngle + Math.PI / Math.max(1, Math.round(arms));

/**
 * 半径rでの、同じ腕の連続した2発の横の間隔(px)の近似 = r·ω(t)·gap。
 * 「離れるほど隙間が開く」の根拠を数字で持つ(テストで不変条件にする)。
 */
export const jormWaveParticleGapPx = (rPx: number, tMs: number, gapMs: number, spec: JormWaveSpec): number => {
  const t = Math.max(0, tMs) / 1000;
  const omega = Math.abs(spec.omega0) + Math.abs(spec.alpha) * t;
  return rPx * omega * (gapMs / 1000);
};

// =================================================================================================
// 弾幕B: 降り注ぐ星弓(打ち上げ→本体から離れた所へ落ちる→外向きに撒く)
// =================================================================================================
export interface JormRainSpec {
  /** 落下点の範囲=**体の矩形からの距離** rMin〜rMax(体の形の帯。rMin の内側=安全地帯)。 */
  rMin: number;
  rMax: number;
  /** 1か所から撒く弾数と、外向きの片側の開き(rad)。 */
  burstCount: number;
  burstSpread: number;
}

/**
 * 落下点。体の矩形から rMin〜rMax の帯の中で一様(棄却法)。
 * `avoid` から `avoidR` 以内には落とさない(相手の足元に予告ゼロで弾が湧くのを防ぐ=打ち上げ時点の位置)。
 * 引けなかった時は null(その回は打ち上げない)。rand は [0,1) を返す関数。
 */
export const jormRainLandingPoint = (
  body: { x: number; y: number; width: number; height: number }, spec: JormRainSpec, rand: () => number,
  avoid?: { x: number; y: number }, avoidR = 0,
): { x: number; y: number } | null => {
  const R = Math.max(spec.rMin, spec.rMax);
  for (let i = 0; i < 24; i++) {
    const x = body.x - R + rand() * (body.width + 2 * R);
    const y = body.y - R + rand() * (body.height + 2 * R);
    const d = jormBodyRectDist(x, y, body).dist;
    if (d < spec.rMin || d > spec.rMax) continue;
    if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < avoidR) continue;
    return { x, y };
  }
  return null;
};

/**
 * 落ちた所から撒く弾の向き(rad)。**体の矩形から遠ざかる向き**(最寄り点→落下点)を中心に、片側 burstSpread へ等間隔。
 * ★外向きの成分が必ず正(=体の側へ戻る弾を作らない)ように、開きは90°未満へ丸める。
 */
export const jormRainBurstAngles = (
  landX: number, landY: number, body: { x: number; y: number; width: number; height: number }, spec: JormRainSpec,
): number[] => {
  const near = jormBodyRectDist(landX, landY, body);
  const out = Math.atan2(landY - near.ny, landX - near.nx);
  const n = Math.max(1, Math.round(spec.burstCount));
  const spread = Math.min(Math.abs(spec.burstSpread), Math.PI / 2 - 0.05);
  if (n === 1) return [out];
  const res: number[] = [];
  for (let i = 0; i < n; i++) res.push(out - spread + (2 * spread * i) / (n - 1));
  return res;
};

/** 打ち上げた光弾の、飛んでいる途中の位置(描画用)。u=0..1。高さは放物線(峰=peakPx)。 */
export const jormRainLobPos = (
  fromX: number, fromY: number, toX: number, toY: number, u: number, peakPx: number,
): { x: number; y: number; groundY: number } => {
  const k = Math.max(0, Math.min(1, u));
  const gx = fromX + (toX - fromX) * k;
  const gy = fromY + (toY - fromY) * k;
  return { x: gx, y: gy - 4 * peakPx * k * (1 - k), groundY: gy };
};
