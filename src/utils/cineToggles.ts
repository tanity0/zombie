// 寄り演目(処刑カメラ)の部品スイッチ。**開発用**。research/CINEMATIC_CAMERA.md §2-6/§6/§8。既定は全部「入」=今の見え方。
//
// なぜ store ではなくここか: **pixiScene が毎フレーム読む**ので、React の再描画を起こさない素の変数で持つ
// (CLAUDE.md「React re-render discipline」)。値の出どころは URL > 既定 の順。
//
// ★タイトル画面の CAMERA パネルは撤去した(社長指示2026-10-08「スタートメニューのカメラってもういらなくない?」→「はい」)。
// 切り分けは URL のツマミ(`?cineorbit=0` 等)だけで行う。パネルが端末に保存していた入/切は読まず、起動時に消す
// (画面から戻す手段が無くなったため=切ったまま固まるのを防ぐ)。

export type CineToggleKey = 'cinecam' | 'cineorbit' | 'cineplates' | 'cinedemo';

/** 部品の一覧と説明(URLのツマミ名=key)。 */
export const CINE_TOGGLES: { key: CineToggleKey; label: string; hint: string }[] = [
  { key: 'cineorbit',  label: '横滑り',     hint: 'カメラが横へ流れる' },
  { key: 'cineplates', label: '近景の板',   hint: '縁に割り込む木の幹と霧' },
  { key: 'cinecam',    label: 'カメラ台本', hint: '切ると全部止まって素の寄りだけになる' },
  { key: 'cinedemo',   label: '一振りで再生', hint: '近接を振るたびに処刑の演出を出す(確認用)' },
];

const DEFAULTS: Record<CineToggleKey, number> = {
  cinecam: 1, cineorbit: 1, cineplates: 1, cinedemo: 0,
};

const STORAGE_PREFIX = 'zombie:cine:';

const urlValue = (key: CineToggleKey): number | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const live: Record<CineToggleKey, number> = { ...DEFAULTS };
for (const { key } of CINE_TOGGLES) {
  live[key] = urlValue(key) ?? DEFAULTS[key];
  try { localStorage.removeItem(STORAGE_PREFIX + key); } catch { /* 端末のブラウザ設定で localStorage が使えない環境がある */ }
}

/** 毎フレーム読む窓口(素の変数=React を起こさない)。 */
export const cineToggle = (key: CineToggleKey): number => live[key];
export const cineToggleOn = (key: CineToggleKey): boolean => live[key] !== 0;

