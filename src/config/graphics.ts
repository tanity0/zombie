// Graphics quality toggles (read live so the option screen can flip them
// without a reload). Persisted to localStorage; the PixiJS scene reads the
// getters each frame and adds/removes the matching filter when it changes.
//
// Bloom = the AdvancedBloomFilter applied to the whole gameplay world. It is
// the biggest render cost on-device (it blurs every bright pixel full-screen),
// so it gets a user-facing on/off in Options.

const BLOOM_KEY = 'zombie:gfx:bloom';

const readBool = (key: string, def: boolean): boolean => {
  if (typeof window === 'undefined') return def;
  try {
    const v = window.localStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    // localStorage can throw in privacy modes — fall through to the default.
  }
  return def;
};

let bloomEnabled = readBool(BLOOM_KEY, true);

export const getBloomEnabled = (): boolean => bloomEnabled;

export const setBloomEnabled = (on: boolean): void => {
  bloomEnabled = on;
  try { window.localStorage.setItem(BLOOM_KEY, on ? '1' : '0'); } catch { /* ignore */ }
};
