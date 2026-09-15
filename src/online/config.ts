export const DEFAULT_SIGNAL_URL = 'ws://localhost:8787';

/** 接続先を返す。`?signal=` が明示的に空、または ws(s) URL でなければ未設定とする。 */
export function signalUrl(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const candidate = params.has('signal') ? params.get('signal') : DEFAULT_SIGNAL_URL;
    if (!candidate?.trim()) return null;
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/** `?online=0` または接続先未設定ならオンライン基盤を全停止する。判定失敗時も安全側へ倒す。 */
export function enabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('online') === '0') return false;
    return signalUrl() !== null;
  } catch {
    return false;
  }
}
