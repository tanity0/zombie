const STORAGE_KEY = 'zombie.online.anonymous-id.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createUuid(): string | null {
  try {
    const cryptoObject = globalThis.crypto;
    if (typeof cryptoObject?.randomUUID === 'function') {
      const uuid = cryptoObject.randomUUID();
      if (UUID_PATTERN.test(uuid)) return uuid;
    }

    const bytes = new Uint8Array(16);
    if (typeof cryptoObject?.getRandomValues === 'function') {
      cryptoObject.getRandomValues(bytes);
    } else {
      // 匿名の端末識別子であり認証トークンではない。古いWebViewでも null にせず継続するための最終手段。
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return UUID_PATTERN.test(uuid) ? uuid : null;
  } catch {
    return null;
  }
}

/** 端末に保存した匿名UUIDを返す。保存領域が使えない時は無音で null。 */
export function getAnonymousId(): string | null {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored && UUID_PATTERN.test(stored)) return stored;

    const created = createUuid();
    if (!created) return null;
    globalThis.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}
