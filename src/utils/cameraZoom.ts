// 文脈カメラズーム(視覚専用): 敵が多い/大型がいるほど「少し」引く。ゲーム判定(当たり/射程)には
// 一切影響しない。ただしスポーン距離だけは、引いた分の可視域拡大に合わせて広げる(=同じ target を
// ゲームロジックも読む)ので、この純関数を pixiScene(カメラ)と useGameLoop(湧き)の両方から使う。
//
// 社長指示の効き幅(私案・実機調整前提):
//  ・引きは「一回り」= 最大 CONTEXT_ZOOM_MIN(0.9)。
//  ・敵数 7体までは固定(引かない)、8体以上で線形に引き、20体で最大。
//  ・大型(reaper/城ボス/裏ボス/hunter)が1体でもいれば数に関係なく即・最大引き。

export const CONTEXT_ZOOM_MIN = 0.8;        // 最大の引き(社長指示で引き幅2倍: 1.0→0.9 の 0.1 → 0.2)
export const CONTEXT_ZOOM_COUNT_FLOOR = 7;  // この体数までは引かない
export const CONTEXT_ZOOM_COUNT_CEIL = 20;  // この体数で最大引き

// ボス戦(大型が1体でもいる時)だけ、さらに引く(社長指示v0.25.2412「ボス戦はもう少し引けますか」)。
// 通常戦闘の引き(体数ドリブン=CONTEXT_ZOOM_MIN)は**据え置き**で、ボス戦だけを深くする。
// `?bosszoom=0.65` 等で実機から調整できる(0.3〜1)。`?bosszoom=` 無しなら既定値。
export const BOSS_ZOOM_MIN: number = (() => {
  const def = 0.7;
  if (typeof window === 'undefined') return def;
  const v = new URLSearchParams(window.location.search).get('bosszoom');
  if (v == null) return def;
  const n = Number(v);
  return Number.isFinite(n) && n > 0.3 && n <= 1 ? n : def;
})();

// ★**安全マージンの基準はこの絶対最小値**(v0.25.2412)。
// 背景のオーバースキャン(ZOOM_OVERSCAN)・敵の回収/湧き距離・カリングは「**一番引いた時でも
// 破綻しない**」ことが条件なので、`CONTEXT_ZOOM_MIN` ではなく必ずこちらを見ること。
// CLAUDE.md の「ズーム引き考慮(必須)」で言及している v0.25.1324/1325 の潜伏バグは、
// 引きの値とマージンの基準がズレると再発する(レイヤーごとに漏れて潜伏するので気づきにくい)。
export const ZOOM_MIN_ABS = Math.min(CONTEXT_ZOOM_MIN, BOSS_ZOOM_MIN);

// 大型敵(即・最大引き対象)。パンプキン/screamer は含めない(社長指示)。
const LARGE_ZOOM_TYPES = new Set<string>(['reaper', 'giantbat', 'mimir', 'jormungand', 'skadi', 'thor', 'hunter']);
export const isLargeForZoom = (type: string): boolean => LARGE_ZOOM_TYPES.has(type);

// デバッグ: ?zoomlock=1 で常時最大引き(CONTEXT_ZOOM_MIN)に固定、?zoomlock=0.9 等の数値でその倍率に固定。
// ズーム引き対応漏れ(v0.25.1324/1325で修正した潜伏バグの類)を意図的に炙り出すための開発用フラグ。
// 描画(pixiScene)と湧き/回収(useGameLoop)の両方が contextZoomTarget を読むため、ここで固定すれば
// 全系統が一貫する。通常プレイ(パラメータ無し)は完全に従来どおり(社長承認 v0.25.1331)。
const ZOOM_LOCK: number | null = (() => {
  if (typeof window === 'undefined') return null; // ヘッドレス(テスト)では常に無効
  const v = new URLSearchParams(window.location.search).get('zoomlock');
  if (v == null) return null;
  if (v === '1') return CONTEXT_ZOOM_MIN;
  const n = Number(v);
  return Number.isFinite(n) && n > 0.3 && n <= 1 ? n : CONTEXT_ZOOM_MIN;
})();

// 目標ズーム(1.0=等倍 → CONTEXT_ZOOM_MIN=最大引き)。数と大型の「大きい方の引き」を採用。
export const contextZoomTarget = (enemyCount: number, hasLarge: boolean): number => {
  if (ZOOM_LOCK != null) return ZOOM_LOCK;
  if (hasLarge) return BOSS_ZOOM_MIN; // ボス戦だけ深く引く(v0.25.2412)
  if (enemyCount <= CONTEXT_ZOOM_COUNT_FLOOR) return 1;
  const t = Math.min(1, (enemyCount - CONTEXT_ZOOM_COUNT_FLOOR) / (CONTEXT_ZOOM_COUNT_CEIL - CONTEXT_ZOOM_COUNT_FLOOR));
  return 1 + (CONTEXT_ZOOM_MIN - 1) * t; // 1 → 0.9 へ線形
};
