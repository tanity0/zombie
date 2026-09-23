import { describe, it, expect } from 'vitest';
import {
  COUNTER_REWIND_MS, counterRewindEase, counterRewindElapsed, counterRewindFrame,
} from './counterRewind';

describe('★カウンターの巻き戻し(社長指示2026-09-23「跳ね返してる感じ」)', () => {
  it('イージングは 0→1 の単調増加で、両端がちょうど 0 と 1', () => {
    expect(counterRewindEase(0)).toBe(0);
    expect(counterRewindEase(1)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = counterRewindEase(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('★等速ではない(慣性MUST): 前半で半分以上戻る=最初が速く、あとで減速する', () => {
    // 等速なら 0.5 のとき「半分戻る」。ease-out は**それより多く**戻っていること。
    expect(counterRewindEase(0.5)).toBeGreaterThan(0.5);
  });

  it('経過msの巻き戻し: 開始点はそのまま → 途中は手前へ → 戻り切ったら null', () => {
    const from = 200;
    expect(counterRewindElapsed(from, 0)).toBe(from);
    const mid = counterRewindElapsed(from, COUNTER_REWIND_MS / 2)!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(from);
    expect(counterRewindElapsed(from, COUNTER_REWIND_MS)).toBeNull();
    expect(counterRewindElapsed(from, COUNTER_REWIND_MS + 50)).toBeNull();
  });

  it('経過msは戻る一方(単調に減る)=途中で進み直さない', () => {
    const from = 300;
    let prev = Infinity;
    for (let ms = 0; ms < COUNTER_REWIND_MS; ms += 5) {
      const v = counterRewindElapsed(from, ms)!;
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('コマ番号の巻き戻し: 出ていたコマ → 0コマ目へ向かって戻り、戻り切ったら null', () => {
    expect(counterRewindFrame(8, 0)).toBe(8);
    expect(counterRewindFrame(8, COUNTER_REWIND_MS / 2)!).toBeLessThan(8);
    expect(counterRewindFrame(8, COUNTER_REWIND_MS)).toBeNull();
    for (let ms = 0; ms < COUNTER_REWIND_MS; ms += 5) {
      expect(counterRewindFrame(8, ms)!).toBeGreaterThanOrEqual(0);
    }
  });

  it('★コマ数が違っても戻る速さは同じ(時間で決めているため。差はコマ1枚ぶんの丸めだけ)', () => {
    // 6コマと16コマで「どれだけ戻ったか」の割合が揃うこと。ズレてよいのは**整数コマへの丸めぶん**
    // (小さいシートほど1コマが粗いので、6コマ側の許容は 0.5/6)。ここが割合で揃っていないなら、
    // 「時間で決める」が壊れている(=コマ数で決めてしまっている)。
    const half = COUNTER_REWIND_MS / 2;
    const a = counterRewindFrame(6, half)! / 6;
    const b = counterRewindFrame(16, half)! / 16;
    expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5 / 6 + 1e-9);
  });

  it('★0コマ目でカウンターされたら何も出さない=構えの絵で固まらない(監査 指摘1)', () => {
    // 伐採人の薙ぎは溜めが1コマだけ(`{windup:1,...}`)なので、着弾前のカウンターでは必ずコマ0。
    // ここで戻り値を返すと「構えの絵のまま窓のぶん止まる」=元の「絵が固まる」に戻る。
    expect(counterRewindFrame(0, 0)).toBeNull();
    expect(counterRewindFrame(0, 50)).toBeNull();
    expect(counterRewindElapsed(0, 0)).toBeNull();
    expect(counterRewindElapsed(200, 10, 0)).toBeNull();
  });
});
