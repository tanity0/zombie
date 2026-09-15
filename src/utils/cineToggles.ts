// 寄り演目(処刑カメラ)の部品スイッチ。**開発用**(社長がタイトル画面で切り分けるためのもの)。
// research/CINEMATIC_CAMERA.md §2-6/§6/§8。既定は全部「入」=今の見え方。
//
// なぜ store ではなくここか: **pixiScene が毎フレーム読む**ので、React の再描画を起こさない素の変数で持つ
// (CLAUDE.md「React re-render discipline」)。値の出どころは URL > 端末の保存 > 既定 の順。
//
// ★URLのツマミ(`?cinepush=0` 等)は従来どおり効く。**URLで明示された項目は画面から変えられない**
// (URLが正=切り分け中に画面側の保存で上書きされない)。

export type CineToggleKey = 'cinecam' | 'cineorbit' | 'cineplates' | 'cinedemo';

/** 画面に出す並び順と説明(タイトル画面のパネルが引く台帳=文言を2箇所で持たない)。 */
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

const storedValue = (key: CineToggleKey): number | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; } // 端末のブラウザ設定で localStorage が読めない環境がある
};

/** URLで明示された項目は画面から変えられない(切り分け中に保存値で上書きしないため)。 */
export const cineToggleLockedByUrl = (key: CineToggleKey): boolean => urlValue(key) !== null;

const live: Record<CineToggleKey, number> = { ...DEFAULTS };
for (const { key } of CINE_TOGGLES) {
  live[key] = urlValue(key) ?? storedValue(key) ?? DEFAULTS[key];
}

/** 毎フレーム読む窓口(素の変数=React を起こさない)。 */
export const cineToggle = (key: CineToggleKey): number => live[key];
export const cineToggleOn = (key: CineToggleKey): boolean => live[key] !== 0;

/** 画面から変える。URL指定がある項目は無視する。 */
export const setCineToggle = (key: CineToggleKey, value: number): void => {
  if (cineToggleLockedByUrl(key)) return;
  live[key] = value;
  try { localStorage.setItem(STORAGE_PREFIX + key, String(value)); } catch { /* ignore */ }
};

/** 全部を既定(=今の見え方)へ戻す。 */
export const resetCineToggles = (): void => {
  for (const { key } of CINE_TOGGLES) setCineToggle(key, DEFAULTS[key]);
};
