import { describe, expect, it } from 'vitest';
import { wraithBgmMuteNext, isVolumeLockedDevice, WRAITH_BGM_MUTE_ON, WRAITH_BGM_MUTE_OFF } from './wraithBgmMute';

describe('亡霊戦の曲の消し方(iPhone/iPad)', () => {
  it('半分を超えたら消し、少し離れたら戻す(境目でパタつかない)', () => {
    expect(wraithBgmMuteNext(false, WRAITH_BGM_MUTE_ON - 0.01)).toBe(false);
    expect(wraithBgmMuteNext(false, WRAITH_BGM_MUTE_ON)).toBe(true);
    expect(wraithBgmMuteNext(true, (WRAITH_BGM_MUTE_ON + WRAITH_BGM_MUTE_OFF) / 2)).toBe(true);
    expect(wraithBgmMuteNext(true, WRAITH_BGM_MUTE_OFF - 0.01)).toBe(false);
    expect(wraithBgmMuteNext(true, 0)).toBe(false);
  });
  it('iPhone・iPad(Mac と名乗るもの含む)だけ', () => {
    expect(isVolumeLockedDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isVolumeLockedDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
    expect(isVolumeLockedDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isVolumeLockedDevice('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5)).toBe(false);
    expect(isVolumeLockedDevice('Mozilla/5.0 (Windows NT 10.0)', 'Win32', 0)).toBe(false);
  });
});
