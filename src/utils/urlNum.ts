/**
 * URLクエリの数値ツマミを読む(`?key=値`)。**既定値へ確実に落ちる**ことだけを保証する小さな純関数。
 *
 * ★なぜ関数にしたか(v0.25.4341・実費のかかった事故の機械化):
 * `Number(new URLSearchParams(s).get(key))` は、**キーが無い時 `Number(null)` = 0** を返し、
 * `Number.isFinite(0)` は **true** なので、`Number.isFinite(n) ? n : def` と書くと
 * **既定値が一度も使われず、常に 0 になる**。
 * 実際 `MELEE_HIT_TINT`(近接ヒットVFXの色)がこれで **0x000000=黒** に固定され、
 * 加算合成で何も足さない=「VFXが出ない/影みたいに見える」として社長の端末に4回出た。
 * (このリポジトリの既存ヘルパ `tsNum`/`camNum` は null を先に潰していて正しい。
 *  事故ったのは**その場で書いた**新しい式の方だった=だから共通の窓口を1つ置く。)
 */
export const urlNum = (search: string, key: string, def: number): number => {
  const raw = new URLSearchParams(search).get(key);
  if (raw === null || raw.trim() === '') return def; // ★ここが肝。Number(null)=0 を通さない
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
};
