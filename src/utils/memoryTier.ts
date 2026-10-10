// 端末の「メモリの格」(v0.25.4867・社長「はい」=PC用とスマホ用で負荷の天井を分ける)。
// スマホ(タブレット含むタッチ端末)はタブがメモリ圧で落とされる帯(200〜400MB)の中にいる。PCはまず当たらない。
// ⇒ 天井の数字だけをここで分ける(素材は増やさない=アプリの容量は変わらない)。
// 判定は描画の解像度上限(PixiStage)が v0.25.1447 から使ってきたものと同じ=スマホ側の結果は1つも変わらない。
// store/PixiJS を読まない葉モジュール。

export type MemoryTier = 'phone' | 'pc';

/** 判定の本体(純関数)。`uaMobile` が取れればそれ、取れなければ「粗いポインタ(指)」で決める。 */
export const memoryTierFrom = (uaMobile: boolean | undefined, coarsePointer: boolean): MemoryTier => {
  if (typeof uaMobile === 'boolean') return uaMobile ? 'phone' : 'pc';
  return coarsePointer ? 'phone' : 'pc';
};

let cached: MemoryTier | null = null;
/** いまの端末の格(起動中は変わらないので1回だけ判定)。 */
export const memoryTier = (): MemoryTier => {
  if (cached) return cached;
  let uaMobile: boolean | undefined;
  let coarse = false;
  if (typeof navigator !== 'undefined') {
    const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
    if (uaData && typeof uaData.mobile === 'boolean') uaMobile = uaData.mobile;
  }
  if (uaMobile === undefined && typeof window !== 'undefined' && window.matchMedia) {
    coarse = window.matchMedia('(pointer: coarse)').matches;
  }
  cached = memoryTierFrom(uaMobile, coarse);
  return cached;
};

/** 焼いた縁の天井(MB)。スマホは v0.25.4866 の値のまま、PC は元の64へ。 */
export const rimBakeBudgetMb = (tier: MemoryTier): number => (tier === 'phone' ? 32 : 64);
/**
 * 焼き置きの天井を**本当の上限**にする判定(社長実機 v0.25.4959「変異体対策室で落ちた」: 縁の天井32MBが 71MB まで膨らんでいた)。
 * 退避は「直近に使った物は捨てない」ので、動きの激しいボスでは退避できる物が尽きる。その時は**新しく焼かない**
 * (縁が一瞬出ないだけ=立ち物は消えない)。焼いた後の合計が天井以下に収まる時だけ焼いてよい。
 */
export const canBakeWithin = (currentBytes: number, addBytes: number, limitBytes: number): boolean =>
  currentBytes + Math.max(0, addBytes) <= limitBytes;
/** 白シルエット(被弾フラッシュ・昇天の白い体)の天井(MB)。 */
export const whiteBakeBudgetMb = (tier: MemoryTier): number => (tier === 'phone' ? 16 : 32);
/** 描画の解像度上限(社長裁定 v0.25.1447: スマホ=1 / PC=2)。 */
export const resolutionCapFor = (tier: MemoryTier): number => (tier === 'phone' ? 1 : 2);
