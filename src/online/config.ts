/** `?online=0` の時だけオンライン基盤を全停止する。判定失敗時も安全側へ倒す。 */
export function enabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('online') !== '0';
  } catch {
    return false;
  }
}
