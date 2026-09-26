// 向きの縁ライティング(研究資料: research/LIGHT_REWORK.md §6)。
//
// 社長指示2026-09-15「案Bの方がいいな」「まず縁だけ入れて様子見よう」「(縁は)焼く」。
// **光の当たっている側の縁だけ**を光らせる。面の陰影(擬似法線/Normal Map)はやらない(§5は破棄)。
//
// ここは**描画を持たない純粋な計算**だけを置く(pixiScene は結果を読むだけ)。
// 光の一覧は `worldLights`(= {x,y,reach,strength})。**色は別に渡す**(PointLight が色を持たないため)。

/** 縁の光源1つ。`worldLights` の PointLight に色を足したもの。 */
export interface RimLight {
  x: number;
  y: number;
  reach: number;
  strength: number;
  /** 0xRRGGBB。未指定の光は呼び側が既定色を入れる。 */
  color: number;
}

/** 縁を出す向きと強さ。`null` = この点では縁を出さない。 */
export interface RimSample {
  /** 光へ向かう単位ベクトル(画面/ワールドの +x=右, +y=下)。 */
  dx: number;
  dy: number;
  /** 0..1。縁の濃さ。 */
  strength: number;
  color: number;
}

/**
 * ★距離ゼロの光を捨てる閾値(world px)。
 * レベルアップの強glowは**プレイヤー位置ちょうど**に出る(gameStore の spawnGlow)。
 * フィルの後光は**自分の頭**・ジブリルのランタンは**自分の手**に登録される(pixiScene)。
 * これらは dx,dy≈0 なので、正規化すると向きが NaN になるか暴れる(§6品質監査 A-5)。
 */
export const RIM_MIN_DIST = 14;

/** これ未満の寄与しかない光は無視する(遠すぎる光で縁がチラつかないように)。 */
export const RIM_MIN_STRENGTH = 0.06;

/**
 * その点を照らす光を**合成して1つの向き**にする。
 *
 * ★なぜ「一番強い光1本」ではないか(§6クリエイティブ監査 #6):
 * 影は「光1つ=シルエット1枚」で作られている。縁を「支配光1本」で作ると、松明が2本ある通路で
 * **歩いて支配光が入れ替わった瞬間に縁が左右へ飛ぶ**(影は飛ばない)。
 * 寄与を**ベクトルとして足す**と、2本の間ではその中間を向き、入れ替わりが連続になる。
 *
 * 色は「いちばん寄与の大きい光の色」を採る(色の混合は濁るだけなので混ぜない)。
 */
export const sampleRim = (
  x: number,
  y: number,
  lights: readonly RimLight[],
  opts: { minDist?: number; minStrength?: number } = {},
): RimSample | null => {
  const minDist = opts.minDist ?? RIM_MIN_DIST;
  const minStrength = opts.minStrength ?? RIM_MIN_STRENGTH;
  let ax = 0, ay = 0;
  let bestW = 0, bestColor = 0xffffff;
  for (const L of lights) {
    if (!(L.reach > 0) || !(L.strength > 0)) continue;
    const ux = L.x - x, uy = L.y - y;
    const d = Math.hypot(ux, uy);
    if (!(d >= minDist)) continue;       // ★自己光源・距離ゼロの光を捨てる(NaN 防止)
    if (d >= L.reach) continue;
    // 距離減衰は既存の光の作法と揃える(1 - d/reach の二乗=中心が濃く、端で滑らかに0)
    const fall = 1 - d / L.reach;
    const w = L.strength * fall * fall;
    if (w <= 0) continue;
    ax += (ux / d) * w;
    ay += (uy / d) * w;
    if (w > bestW) { bestW = w; bestColor = L.color; }
  }
  const mag = Math.hypot(ax, ay);
  if (!(mag > minStrength)) return null;  // 逆向き2本で打ち消し合った場合もここで落ちる
  return { dx: ax / mag, dy: ay / mag, strength: Math.min(1, mag), color: bestColor };
};

/** 焼いておく向きの数。45°刻み。隣どうしを混ぜるので、見た目はこの刻みより滑らかになる。 */
export const RIM_BUCKETS = 8;

/**
 * 向きを焼いた向き(バケツ)へ丸める。**隣のバケツと、その混ぜ具合**も返す。
 * ★45°のハードカットにすると光が回った時にカクつく(慣性MUST)。2枚を混ぜて連続にする。
 */
export const rimBuckets = (dx: number, dy: number): { a: number; b: number; t: number } => {
  const ang = Math.atan2(dy, dx);                       // -π..π
  const f = ((ang / (Math.PI * 2)) * RIM_BUCKETS + RIM_BUCKETS * 2) % RIM_BUCKETS;
  const a = Math.floor(f) % RIM_BUCKETS;
  return { a, b: (a + 1) % RIM_BUCKETS, t: f - Math.floor(f) };
};

/** バケツ番号 → その向きの単位ベクトル(焼く側が使う)。 */
export const rimBucketDir = (bucket: number): { dx: number; dy: number } => {
  const ang = ((bucket % RIM_BUCKETS) / RIM_BUCKETS) * Math.PI * 2;
  return { dx: Math.cos(ang), dy: Math.sin(ang) };
};

/**
 * 時定数で追従させる(慣性MUST)。
 * ★松明は炎のゆらぎ(pulse)を含んだ強さで登録されているので、生の値をそのまま使うと
 * **縁が炎に同期してパカパカする**(§6品質監査 A-2。同じ事故の対策が pixiScene に既にある)。
 * dt に依存しない指数追従にする(フレーム落ちしても速度が変わらない)。
 */
export const rimFollow = (prev: number, target: number, dtMs: number, tauMs: number): number => {
  if (!(tauMs > 0)) return target;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  return prev + (target - prev) * k;
};

/**
 * 向きの追従。角度で回す(成分ごとに追うと、真逆へ回る時に一度原点を通って向きが消える)。
 * 戻り値は単位ベクトル。
 */
export const rimFollowDir = (
  px: number, py: number, tx: number, ty: number, dtMs: number, tauMs: number,
): { dx: number; dy: number } => {
  const pm = Math.hypot(px, py);
  if (!(pm > 1e-6)) return { dx: tx, dy: ty };          // 初回は即その向き
  const pa = Math.atan2(py, px), ta = Math.atan2(ty, tx);
  let d = ta - pa;
  while (d > Math.PI) d -= Math.PI * 2;                  // 近い方へ回す
  while (d < -Math.PI) d += Math.PI * 2;
  const k = tauMs > 0 ? 1 - Math.exp(-Math.max(0, dtMs) / tauMs) : 1;
  const a = pa + d * k;
  return { dx: Math.cos(a), dy: Math.sin(a) };
};
