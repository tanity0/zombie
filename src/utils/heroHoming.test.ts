// 英雄の帰巣中に撃たれたら振り返る(社長報告2026-10-24「一定の距離離れると、英雄が定位置に戻るまで攻撃し放題になる」)。
import { describe, it, expect } from 'vitest';
import { heroHomingReengage, HERO_HOME_LIMIT_PX } from './heroTick';

describe('英雄の帰巣中の被弾', () => {
  it('帰巣を始めた後に撃たれ、活動の限界の内側なら振り返って戦う', () => {
    expect(heroHomingReengage(5000, 4000, 300)).toBe(true);
    expect(heroHomingReengage(5000, 4000, HERO_HOME_LIMIT_PX)).toBe(true);
  });
  it('限界の外では撃たれても巣へ向かう(遠くへ誘い出し続けられない)', () => {
    expect(heroHomingReengage(5000, 4000, HERO_HOME_LIMIT_PX + 1)).toBe(false);
  });
  it('帰巣を始める前の被弾・撃たれていない時は振り返らない', () => {
    expect(heroHomingReengage(3000, 4000, 300)).toBe(false);
    expect(heroHomingReengage(undefined, 4000, 300)).toBe(false);
  });
});
