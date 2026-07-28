import { describe, it, expect } from 'vitest';
import { uriMoveEligible, pickUriMove, pickUriCombo, uriSweepInnerRadius, URI_RANGE } from './uriScript';

describe('uriMoveEligible', () => {
  it('bolt is eligible at every distance (no dead zone・懐が安全の担保)', () => {
    for (const d of [0, 50, 200, 320, 500, 620, 900, 1000]) {
      expect(uriMoveEligible('bolt', d)).toBe(true);
    }
  });
  it('sweep: 中〜遠(320<d<=1000)', () => {
    expect(uriMoveEligible('sweep', URI_RANGE.NEAR_MAX)).toBe(false);
    expect(uriMoveEligible('sweep', URI_RANGE.NEAR_MAX + 1)).toBe(true);
    expect(uriMoveEligible('sweep', URI_RANGE.FAR_MAX)).toBe(true);
  });
  it('downslash: 中のみ(320<d<=620)', () => {
    expect(uriMoveEligible('downslash', URI_RANGE.NEAR_MAX + 1)).toBe(true);
    expect(uriMoveEligible('downslash', URI_RANGE.MID_MAX)).toBe(true);
    expect(uriMoveEligible('downslash', URI_RANGE.MID_MAX + 1)).toBe(false);
  });
  it('thrust: 遠のみ(620<d<=1000)', () => {
    expect(uriMoveEligible('thrust', URI_RANGE.MID_MAX)).toBe(false);
    expect(uriMoveEligible('thrust', URI_RANGE.MID_MAX + 1)).toBe(true);
    expect(uriMoveEligible('thrust', URI_RANGE.FAR_MAX)).toBe(true);
  });
});

describe('uriSweepInnerRadius (§6.28-17 Phase2: 140→90)', () => {
  it('shrinks in phase 2, technique count unchanged', () => {
    expect(uriSweepInnerRadius(1)).toBe(140);
    expect(uriSweepInnerRadius(2)).toBe(90);
  });
});

describe('pickUriMove', () => {
  it('picks among eligible moves deterministically via injected rand', () => {
    expect(pickUriMove(0, () => 0)).toBe('bolt'); // near band: only bolt eligible
  });
});

describe('pickUriCombo', () => {
  it('only follows sweep, at the configured chance', () => {
    expect(pickUriCombo('downslash', () => 0)).toBeNull();
    expect(pickUriCombo('sweep', () => 0.59)).toBe('downslash');
    expect(pickUriCombo('sweep', () => 0.61)).toBeNull();
  });
});
