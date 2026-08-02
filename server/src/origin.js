const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function privateIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (octets[0] === 10) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

/** CO-3/CO-4のローカル確認用。公開ホストはデプロイ段で明示的に追加する。 */
export function allowedOriginValue(origin) {
  try {
    if (typeof origin !== 'string' || !origin) return false;
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return LOCAL_HOSTS.has(url.hostname) || privateIpv4(url.hostname);
  } catch {
    return false;
  }
}

export function allowedOrigin(request) {
  try {
    return allowedOriginValue(request.headers.get('Origin'));
  } catch {
    return false;
  }
}
