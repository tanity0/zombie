import { describe, it, expect } from 'vitest';
import { keyRetaliationDir } from './keyRetaliation';

describe('keyRetaliationDir(PC キーボードの被弾反撃の入力)', () => {
  const none = { up: false, down: false, left: false, right: false };
  it('新しい押下で、押した後の合成方向(正規化)を返す', () => {
    expect(keyRetaliationDir({ ...none, right: true }, false)).toEqual({ x: 1, y: 0 });
    const d = keyRetaliationDir({ ...none, right: true, down: true }, false)!;
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(d.y).toBeCloseTo(Math.SQRT1_2, 6);
  });
  it('押しっぱなし(repeat)は入力にしない=パッドの「倒しっぱなしでは出ない」と同じ', () => {
    expect(keyRetaliationDir({ ...none, right: true }, true)).toBeNull();
  });
  it('方向が無ければ null(逆向き同時押しも含む)', () => {
    expect(keyRetaliationDir(none, false)).toBeNull();
    expect(keyRetaliationDir({ ...none, left: true, right: true }, false)).toBeNull();
  });
});
