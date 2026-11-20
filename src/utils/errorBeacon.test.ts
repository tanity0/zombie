import { describe, it, expect, beforeEach } from 'vitest';
import { reportSuppressedError, reportSoftNotice, lastSuppressedError, rearmSuppressedError } from './errorBeacon';

beforeEach(() => rearmSuppressedError());

describe('エラービーコン', () => {
  it('最初の1件を保持し、後続の例外では上書きしない', () => {
    reportSuppressedError('a', new Error('first'));
    reportSuppressedError('b', new Error('second'));
    expect(lastSuppressedError()).toMatch(/^a: first/);
  });
  it('知らせ(ループの張り直し)は、後から来た本物の例外に席を譲る', () => {
    reportSoftNotice('loop-stall', new Error('rAF chain stalled 243128ms — revived'));
    expect(lastSuppressedError()).toMatch(/^loop-stall:/);
    reportSuppressedError('pixi-sync', new Error('boom'));
    expect(lastSuppressedError()).toMatch(/^pixi-sync: boom/);
    reportSuppressedError('later', new Error('x')); // 本物の例外の後は今どおり最初の1件を保つ
    expect(lastSuppressedError()).toMatch(/^pixi-sync: boom/);
  });
  it('知らせは既にある本物の例外を上書きしない・知らせどうしは最初の1件', () => {
    reportSoftNotice('loop-stall', new Error('s1'));
    reportSoftNotice('loop-stall', new Error('s2'));
    expect(lastSuppressedError()).toMatch(/s1/);
    rearmSuppressedError();
    reportSuppressedError('real', new Error('r'));
    reportSoftNotice('loop-stall', new Error('s'));
    expect(lastSuppressedError()).toMatch(/^real: r/);
  });
});
