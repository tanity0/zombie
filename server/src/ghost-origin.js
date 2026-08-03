const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function allowedGhostOriginValue(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === 'capacitor:' || url.protocol === 'ionic:') return true;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return LOCAL_HOSTS.has(url.hostname) || (url.protocol === 'https:' && url.hostname.endsWith('.github.io'));
  } catch {
    return false;
  }
}
