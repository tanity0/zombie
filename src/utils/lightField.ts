// 「その地点は今どれくらい明るいか」を1点で測る純関数(社長要望 v0.25.2779
// 「光源の強さと連動できないかなーと。たとえば、松明の近くに来ると薄まるとかも」)。
//
// 用途: プレイヤーの補助光(playerLight / playerGroundPool)を、周りが明るいほど引く。
// **明るい所では自分の光が要らない**という考え方(物理に沿う)。
// PixiJS非依存=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4)。
//
// ★光源の数値は「実際に描いている光」からそのまま取る(松明なら描画に使う haloR / haloA)。
// そうしないと**絵と挙動がズレる**——「見た目は明るいのに暗い扱い」が起きる。

/** 点光源1つ。reach=届く距離px / strength=中心での強さ(0..1目安。合計してクランプする)。 */
export interface PointLight {
  x: number;
  y: number;
  reach: number;
  strength: number;
}

/**
 * 地点 (x, y) での明るさを 0..1 で返す。
 * 減衰は `1 - dist/reach` の線形(影の `falloff` と同じ式=**2つの仕組みで光の届き方が食い違わない**)。
 * 合計してから 1 でクランプする(強い光が重なっても上限を超えない)。
 */
export const lightAt = (x: number, y: number, lights: readonly PointLight[]): number => {
  let sum = 0;
  for (const l of lights) {
    if (!(l.reach > 0) || !(l.strength > 0)) continue;
    const dx = x - l.x, dy = y - l.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= l.reach) continue;
    sum += (1 - dist / l.reach) * l.strength;
  }
  return sum > 1 ? 1 : sum;
};

/**
 * 指数平滑の係数。松明は `pulse` で脈打つので、生の値をそのまま使うと**プレイヤーが一緒に明滅する**。
 * @param dtSec 前フレームからの実測秒
 * @param tauMs 時定数ms(0以下なら平滑しない=即時)
 */
export const lightSmoothLerp = (dtSec: number, tauMs: number): number =>
  tauMs > 0 ? 1 - Math.exp(-dtSec / (tauMs / 1000)) : 1;

/**
 * 明るさ `b`(0..1) から、補助光に掛ける倍率を返す。
 * `yield` が 1 なら真っ暗な所で等倍・最大の明るさで 0(完全に消える)。
 */
export const assistLightMult = (b: number, yieldAmount: number): number => {
  const m = 1 - yieldAmount * Math.min(1, Math.max(0, b));
  return m < 0 ? 0 : m;
};
