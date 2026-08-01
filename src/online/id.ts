const STORAGE_KEY = 'zombie.online.anonymous-id.v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createUuid(): string | null {
  try {
    const uuid = globalThis.crypto.randomUUID();
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
