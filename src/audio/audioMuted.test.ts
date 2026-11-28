import { describe, expect, it } from 'vitest';
import { isAudioMuted, setAudioMuted, subscribeAudioMuted } from './audioManager';

// 音のボタン・オプションの「音なし」・ゲーム中の音のボタンが同じ値を見続けるための通知(useAudioMuted が使う)。
describe('subscribeAudioMuted(「音なし」が変わった時の通知)', () => {
  it('値が変わった時だけ通知し、解除後は通知しない', () => {
    setAudioMuted(false);
    let n = 0;
    const off = subscribeAudioMuted(() => { n++; });
    setAudioMuted(true);
    expect(isAudioMuted()).toBe(true);
    expect(n).toBe(1);
    setAudioMuted(true); // 同じ値=通知しない
    expect(n).toBe(1);
    setAudioMuted(false);
    expect(n).toBe(2);
    off();
    setAudioMuted(true);
    expect(n).toBe(2);
    setAudioMuted(false);
  });
});
