import { describe, it, expect } from 'vitest';
import { shouldEmitThrottled } from './emitThrottle';

describe('shouldEmitThrottled — ラン間で死なない間引き時計', () => {
  it('間隔未満は撒かない / 間隔ちょうどで撒く', () => {
    expect(shouldEmitThrottled(1000, 960, 60)).toBe(false); // 40ms経過
    expect(shouldEmitThrottled(1020, 960, 60)).toBe(true);  // 60ms経過(境界は撒く=従来の>=と同じ)
    expect(shouldEmitThrottled(2000, 960, 60)).toBe(true);
  });

  it('★回帰(社長報告「城ボス4技達からキラキラが消えた」): 時計が巻き戻ったら必ず撒く', () => {
    // 2回目の出撃: gameTimeは0から始まるのに、前ラン終盤の値が残っている。
    // 旧実装 `gameTime - lastAt >= 60` はこのランの間ずっと偽=演出が1粒も出なかった。
    expect(shouldEmitThrottled(0, 480_000, 60)).toBe(true);
    expect(shouldEmitThrottled(120, 480_000, 60)).toBe(true);
  });

  it('ラン開始直後(時計も初期値も0)は間隔ぶん経ってから撒く=修正前と同じテンポ', () => {
    // 撒く量やテンポは変えない(直したのは「巻き戻ったら死ぬ」ことだけ)。
    expect(shouldEmitThrottled(0, 0, 60)).toBe(false);
    expect(shouldEmitThrottled(60, 0, 60)).toBe(true);
  });
});
