/** 製品版がプレイヤー自身のPCへ接続しないよう、出荷時の既定は未設定。 */
export const DEFAULT_SIGNAL_URL = '';

function normalizeSignalUrl(candidate: string | null | undefined): string | null {
  try {
    if (!candidate?.trim()) return null;
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/** `?online=0` だけを見る全オンライン共通の安全弁。loopbackもこの判定だけを使う。 */
export function onlineAllowed(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('online') !== '0';
  } catch {
    return false;
  }
}

/**
 * 接続先を返す。引数を渡した場合は、そのAPIインスタンス専用の値としてlocationを参照しない。
 * 引数なしでは `?signal=`、次に未設定の既定値を見る。
 */
export function signalUrl(explicitUrl?: string): string | null {
  try {
    if (explicitUrl !== undefined) return normalizeSignalUrl(explicitUrl);
    if (typeof window === 'undefined') return normalizeSignalUrl(DEFAULT_SIGNAL_URL);
    const params = new URLSearchParams(window.location.search);
    const candidate = params.has('signal') ? params.get('signal') : DEFAULT_SIGNAL_URL;
    return normalizeSignalUrl(candidate);
  } catch {
    return null;
  }
}

/** `?online=0` または接続先未設定ならオンライン基盤を全停止する。判定失敗時も安全側へ倒す。 */
export function enabled(explicitUrl?: string): boolean {
  try {
    return onlineAllowed() && signalUrl(explicitUrl) !== null;
  } catch {
    return false;
  }
}
