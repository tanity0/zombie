/**
 * ★まとめて当てた時の手応え(社長「複数の敵に一括で当たった時に画面揺れとかストップの長さとかを強めて複数に当たった感を強めるのがいいかもしれない」
 * →叩き台に「はい」・「格闘も同じにして」)。
 *
 * プレイヤー本人の近接の「1回の振り」(1つの段・1つの技の1回の当たり判定)で当たった敵の数 n(倒した敵も数える)で決める。
 *  - 止め: 2体目から1体ごとに +MULTI_HIT_STOP_STEP_MS・上限 +MULTI_HIT_STOP_MAX_MS(n>=4 で頭打ち)。
 *    当たった敵の止めと、自分の振りの止めがある武器(ナイフ・格闘)は自分の止めにも足す。画面全体は止めない。
 *  - 揺れ: n>=2 で足す。長さ BASE+STEP×(n−1)ms・強さ BASE+STEP×(n−1)(n−1 は MULTI_HIT_STEP_CAP で頭打ち)。段の揺れがある時は上乗せ。
 *  - 絵と音(クリエイティブ監査「1発が強くなった、としか読めない。何体に当たったかが伝わらない」の作り直し・判定なしの派手さの絵):
 *    n>=2: 当たった敵1体ごとに小さな白い閃き(+粒)を、プレイヤーに近い順に MULTI_HIT_STAGGER_MS ずつずらして出す(バラバラッ)。
 *          命中音も当たった数だけ(上限 MULTI_HIT_SFX_MAX)同じ間隔でずらして鳴らす(後ろほど少し小さく・少し高く)。
 *    n>=MULTI_HIT_BIG_FX_MIN: 上乗せした止めが明ける時刻に、輪と光が弾ける(溜め→解放の拍)。武器の形で置き方を変える
 *          (ナイフ・格闘=輪 multiHitBurstRings / 刀=当たりを結ぶ筋 multiHitLinePath / 鞭=弧に沿った粒 multiHitArcPath)。
 *    n>=MULTI_HIT_HUGE_FX_MIN: 2本目の輪をさらに遅らせて外へ・光をもう1つ・低い支えの音を1つ。
 * n=1(と0)は全部0=今と同じ。判定・ダメージ・押しの距離・段の間隔・カウンター窓は変えない。
 * 純関数だけ(store が呼ぶ)。数値は叩き台。
 */

export const MULTI_HIT_STOP_STEP_MS = 20;
export const MULTI_HIT_STOP_MAX_MS = 60;
export const MULTI_HIT_SHAKE_BASE_MS = 60;
export const MULTI_HIT_SHAKE_STEP_MS = 40;
export const MULTI_HIT_SHAKE_BASE_MAG = 2;
export const MULTI_HIT_SHAKE_STEP_MAG = 2;
/** 揺れの (n−1) の頭打ち。 */
export const MULTI_HIT_STEP_CAP = 3;
/** 止めの明けに弾ける輪と光が出る数。 */
export const MULTI_HIT_BIG_FX_MIN = 3;
/** 5体以上のご褒美(2本目の輪をさらに外へ・光をもう1つ・低い支えの音)が出る数。 */
export const MULTI_HIT_HUGE_FX_MIN = 5;
/** 1体ごとの閃き・命中音をずらす間隔(ms)。 */
export const MULTI_HIT_STAGGER_MS = 20;
/** 閃きを出す数の上限(それより後ろは出さない=重ならないように)。 */
export const MULTI_HIT_FLASH_MAX = 8;
/** 命中音を鳴らす数の上限(1発目=武器の今の命中音を含む)。 */
export const MULTI_HIT_SFX_MAX = 5;

export interface MultiHitFeel {
  /** 当たった敵の止め・自分の振りの止めに足す長さ(ms)。 */
  extraStopMs: number;
  /** 足す揺れの長さ(ms・0=足さない)と強さ。 */
  shakeMs: number;
  shakeMag: number;
  /** 1体ごとの閃きと、ずらした命中音を出すか(n>=2)。 */
  staggerFx: boolean;
  /** 止めの明けに弾ける輪と光を出すか(n>=3)。 */
  bigFx: boolean;
  /** 5体以上のご褒美を出すか(n>=5)。 */
  hugeFx: boolean;
}

const NONE: MultiHitFeel = Object.freeze({ extraStopMs: 0, shakeMs: 0, shakeMag: 0, staggerFx: false, bigFx: false, hugeFx: false });

/** 1回の振りで当たった数 n からの上乗せ。n<=1 は全部0(=今と同じ)。 */
export const multiHitFeel = (n: number): MultiHitFeel => {
  const extra = Math.floor(Number.isFinite(n) ? n : 0) - 1;
  if (extra <= 0) return NONE;
  const k = Math.min(MULTI_HIT_STEP_CAP, extra);
  return {
    extraStopMs: Math.min(MULTI_HIT_STOP_MAX_MS, MULTI_HIT_STOP_STEP_MS * extra),
    shakeMs: MULTI_HIT_SHAKE_BASE_MS + MULTI_HIT_SHAKE_STEP_MS * k,
    shakeMag: MULTI_HIT_SHAKE_BASE_MAG + MULTI_HIT_SHAKE_STEP_MAG * k,
    staggerFx: true,
    bigFx: extra + 1 >= MULTI_HIT_BIG_FX_MIN,
    hugeFx: extra + 1 >= MULTI_HIT_HUGE_FX_MIN,
  };
};

/**
 * 当たった敵の止めを extraMs だけ延ばす欄。null=書かない(今止まっていない・延ばす長さ0)。
 * ★今かかっている止め(この振りの止め)を延ばすだけ=止まっていない敵に新しく止めを作らない(止めの再発火ガードを越えない)。
 * ★押しの残りは止めの後ろへ同じだけずらす(押しの距離は変えない)。「止めの長さを覚えている押し」の印(knockbackStopFor===knockbackUntil)も一緒にずらす。
 * ボス級(止めを持たない区分)は呼び手が外す。
 */
export const multiHitStopExtendPatch = (
  e: { hitStunUntil?: number; knockbackUntil?: number; knockbackStopFor?: number },
  now: number, extraMs: number,
): { hitStunUntil: number; knockbackUntil?: number; knockbackStopFor?: number } | null => {
  if (!(extraMs > 0)) return null;
  if (e.hitStunUntil === undefined || !(e.hitStunUntil > now)) return null;
  const hitStunUntil = e.hitStunUntil + extraMs;
  if (e.knockbackUntil === undefined || !(e.knockbackUntil > now)) return { hitStunUntil };
  const knockbackUntil = e.knockbackUntil + extraMs;
  return e.knockbackStopFor === e.knockbackUntil
    ? { hitStunUntil, knockbackUntil, knockbackStopFor: knockbackUntil }
    : { hitStunUntil, knockbackUntil };
};

/**
 * 1体ごとの閃きの順番と遅れ。プレイヤー(from)に近い順に並べ、i 番目を i×MULTI_HIT_STAGGER_MS 遅らせる。上限 MULTI_HIT_FLASH_MAX。
 * 同じ距離は元の順のまま(安定)。
 */
export const multiHitStagger = <P extends { x: number; y: number }>(
  pts: readonly P[], from: { x: number; y: number },
): { p: P; delayMs: number; i: number }[] =>
  pts.map((p, k) => ({ p, k, d: Math.hypot(p.x - from.x, p.y - from.y) }))
    .sort((a, b) => a.d - b.d || a.k - b.k)
    .slice(0, MULTI_HIT_FLASH_MAX)
    .map((q, i) => ({ p: q.p, delayMs: i * MULTI_HIT_STAGGER_MS, i }));

/**
 * ずらして鳴らす命中音の層(1発目=武器の今の命中音は鳴っているので、2発目から)。
 * i 番目(1..)は i×MULTI_HIT_STAGGER_MS 遅らせ、後ろほど少し小さく(×(1−0.12i))・少し高く(×(1+0.05i))。上限 MULTI_HIT_SFX_MAX 発(1発目を含む)。
 * n<=1 は空(=今と同じ)。
 */
export const multiHitSfxLayers = (n: number, gain: number, rate: number): { delayMs: number; gain: number; rate: number }[] => {
  const m = Math.min(MULTI_HIT_SFX_MAX, Math.floor(Number.isFinite(n) ? n : 0));
  const out: { delayMs: number; gain: number; rate: number }[] = [];
  for (let i = 1; i < m; i++) out.push({ delayMs: i * MULTI_HIT_STAGGER_MS, gain: gain * (1 - 0.12 * i), rate: rate * (1 + 0.05 * i) });
  return out;
};

/**
 * 止めの明けに弾ける輪の時刻(now からの遅れ ms)。当たって止まっている敵の止めの明け(延ばした後)のうち一番遅いもの。
 * 止まっている敵が居ない(ボス級だけ・全部倒した)時は上乗せの長さ。どちらも [0, MULTI_HIT_RELEASE_MAX_MS] に収める。
 */
export const MULTI_HIT_RELEASE_MAX_MS = 320;
export const multiHitReleaseDelay = (stunUntils: readonly (number | undefined)[], now: number, extraStopMs: number): number => {
  let at = 0;
  for (const u of stunUntils) if (u !== undefined && u > now) at = Math.max(at, u - now);
  const d = at > 0 ? at : extraStopMs;
  return Math.max(0, Math.min(MULTI_HIT_RELEASE_MAX_MS, d));
};

/**
 * 弾ける輪の置き場所と大きさ。中心=当たった位置の重心。
 * 半径=中心から一番遠い当たりの距離に比例(×MULTI_HIT_FX_SPREAD_K)+余白+当たった数ぶん(3体と5体で大きさの差が見えるように)。
 * 判定なしの派手さの絵なので、包む大きさより大きめに取る。
 */
export const MULTI_HIT_FX_PAD_PX = 40;
export const MULTI_HIT_FX_SPREAD_K = 1.15;
export const MULTI_HIT_FX_PER_HIT_PX = 16;
export const MULTI_HIT_FX_COUNT_CAP = 8;
export const multiHitFxSpot = (pts: readonly { x: number; y: number }[]): { x: number; y: number; r: number } | null => {
  if (pts.length === 0) return null;
  let sx = 0, sy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; }
  const cx = sx / pts.length, cy = sy / pts.length;
  let far = 0;
  for (const p of pts) far = Math.max(far, Math.hypot(p.x - cx, p.y - cy));
  return { x: cx, y: cy, r: MULTI_HIT_FX_PAD_PX + far * MULTI_HIT_FX_SPREAD_K + MULTI_HIT_FX_PER_HIT_PX * Math.min(MULTI_HIT_FX_COUNT_CAP, pts.length) };
};

/**
 * 弾ける輪の組(太く速い1本目→細く薄い2本目が少し遅れて外へ・5体以上は3本目をさらに遅らせて外へ)。
 * 描画の輪は1本の中で線の太さを変えられない(焼いた絵を半径で拡大するだけ)ので、「太く始まり外ほど細く薄く」は太い輪(weight thick)→細く薄い輪(thin)を時間差で重ねて出す。
 * どの輪も減速して止まりながら消え切る(easeOut)=真円の線が範囲の印のように残らない。scale=半径の倍率(格闘は外へ大きく)。
 */
export interface MultiHitRing { delayMs: number; start: number; end: number; alpha: number; durationMs: number; weight: 'thick' | 'thin' }
export const multiHitBurstRings = (r: number, huge: boolean, scale = 1): MultiHitRing[] => {
  const R = r * scale;
  const rings: MultiHitRing[] = [
    { delayMs: 0, start: R * 0.18, end: R * 0.62, alpha: 1, durationMs: 170, weight: 'thick' },
    { delayMs: 40, start: R * 0.45, end: R * 1.05, alpha: 0.5, durationMs: 250, weight: 'thin' },
  ];
  if (huge) rings.push({ delayMs: 110, start: R * 0.8, end: R * 1.5, alpha: 0.38, durationMs: 300, weight: 'thin' });
  return rings;
};

/**
 * 刀(線の技)の白い筋の通り道。当たった位置を振った向き(ux, uy)へ射影して並べ、最初の当たりから最後の当たりまで。
 * 当たりが1点に重なる時は向きに沿って前後へ minLen/2 ずつ伸ばす。
 */
export const multiHitLinePath = (
  pts: readonly { x: number; y: number }[], ux: number, uy: number, minLen = 120,
): { x0: number; y0: number; x1: number; y1: number } | null => {
  if (pts.length === 0) return null;
  const l = Math.hypot(ux, uy);
  const dx = l > 1e-6 ? ux / l : 1, dy = l > 1e-6 ? uy / l : 0;
  const s = [...pts].sort((a, b) => (a.x * dx + a.y * dy) - (b.x * dx + b.y * dy));
  const a = s[0], b = s[s.length - 1];
  const len = (b.x - a.x) * dx + (b.y - a.y) * dy;
  if (len >= minLen) return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = minLen / 2;
  return { x0: mx - dx * h, y0: my - dy * h, x1: mx + dx * h, y1: my + dy * h };
};

/**
 * 鞭(弧の技)の粒の並び。当たった位置を自分(from)から見た角度で並べ、その弧(半径=当たりまでの距離の平均)に沿って steps 点。
 * 弧の両端は pad(rad)だけ外へ伸ばす。delayMs=弧をなぞる順の遅れ(0→sweepMs)。ang=その点の外向き(自分から外へ)の向き。
 */
export const multiHitArcPath = (
  pts: readonly { x: number; y: number }[], from: { x: number; y: number }, steps: number, sweepMs = 70, pad = 0.18,
): { x: number; y: number; ang: number; delayMs: number }[] => {
  if (pts.length === 0 || steps < 1) return [];
  let mx = 0, my = 0, rs = 0;
  for (const p of pts) { const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1; mx += dx / d; my += dy / d; rs += d; }
  const mean = Math.atan2(my, mx), rad = rs / pts.length;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  let lo = 0, hi = 0;
  for (const p of pts) { const a = wrap(Math.atan2(p.y - from.y, p.x - from.x) - mean); lo = Math.min(lo, a); hi = Math.max(hi, a); }
  lo -= pad; hi += pad;
  const out: { x: number; y: number; ang: number; delayMs: number }[] = [];
  for (let k = 0; k < steps; k++) {
    const f = steps === 1 ? 0.5 : k / (steps - 1);
    const ang = mean + lo + (hi - lo) * f;
    out.push({ x: from.x + Math.cos(ang) * rad, y: from.y + Math.sin(ang) * rad, ang, delayMs: Math.round(sweepMs * f) });
  }
  return out;
};
