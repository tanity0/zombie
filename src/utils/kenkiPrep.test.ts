// research/BRAWLER_PHANTOM.md §16-5: 拳鬼の技の予備動作(純関数)。受け入れ条件 §16-6 の4(付く技・コマ・長さ)。
import { describe, expect, it } from 'vitest';
import { kenkiPrepFor, kenkiPrepStart, kenkiPrepDue, KENKI_PREP_RAISE_MS, KENKI_PREP_CROUCH_MS } from './kenkiPrep';
import { brawlerAfterHurtPoints, initialBrawlerState } from './brawler';

describe('予備動作の付く技', () => {
  it('気功・大叩き潰し=腕上げ / 初段の飛び蹴り=しゃがみ(長さは社長指示で3つとも80ms)', () => {
    expect(KENKI_PREP_RAISE_MS).toBe(80);
    expect(KENKI_PREP_CROUCH_MS).toBe(80);
    expect(kenkiPrepFor('kiko', 0)).toEqual({ tex: 'swing', ms: KENKI_PREP_RAISE_MS });
    expect(kenkiPrepFor('stomp', 0)).toEqual({ tex: 'swing', ms: KENKI_PREP_RAISE_MS });
    expect(kenkiPrepFor('kick', 1)).toEqual({ tex: 'ready', ms: KENKI_PREP_CROUCH_MS });
  });
  it('2発目以降の蹴り・構えには付かない', () => {
    expect(kenkiPrepFor('kick', 2)).toBeNull();
    expect(kenkiPrepFor('kick', 3)).toBeNull();
    expect(kenkiPrepFor('guard', 0)).toBeNull();
  });
  it('終わった瞬間に技が出る(決めた時刻・取り消しの扱いを持ち越す)', () => {
    const p = kenkiPrepStart('stomp', 0, 1000, true, -1)!;
    expect(p).toMatchObject({ at: 1000, until: 1000 + KENKI_PREP_RAISE_MS, cancel: true, dirX: -1, tex: 'swing' });
    expect(kenkiPrepDue(p, 1000 + KENKI_PREP_RAISE_MS - 1)).toBe(false);
    expect(kenkiPrepDue(p, 1000 + KENKI_PREP_RAISE_MS)).toBe(true);
    expect(kenkiPrepStart('guard', 0, 1000, false, 1)).toBeNull();
  });
});

// research/BRAWLER.md §12-3c(社長指示2026-11-10「あと格闘は攻撃食らっても技ポイント貯まる にしよう」)
describe('食らっても技ポイントが貯まる(共通の純関数)', () => {
  it('体力が減った被弾で+1・上限で止まる・0ダメージでは貯まらない', () => {
    const s = { ...initialBrawlerState(), points: 4 };
    expect(brawlerAfterHurtPoints(s, 5, true, 7).points).toBe(5);
    expect(brawlerAfterHurtPoints(s, 5, true, 7).gainAt).toBe(7);
    expect(brawlerAfterHurtPoints({ ...s, points: 5 }, 5, true, 7)).toEqual({ ...s, points: 5 });
    expect(brawlerAfterHurtPoints(s, 5, false, 7)).toBe(s);
  });
});
