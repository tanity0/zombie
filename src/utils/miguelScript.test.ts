import { describe, it, expect } from 'vitest';
import { pickMiguelMove, miguelDashFollowupEligible, MIGUEL_HARAI_TRIGGER_DIST, MIGUEL_VOLLEY_CHANCE } from './miguelScript';

describe('pickMiguelMove (§6.28-4)', () => {
  it('≤250px: picks volley under MIGUEL_VOLLEY_CHANCE, harai otherwise', () => {
    expect(pickMiguelMove(200, false, () => 0)).toBe('volley');
    expect(pickMiguelMove(200, false, () => MIGUEL_VOLLEY_CHANCE + 0.01)).toBe('harai');
  });
  it('≤250px never picks dash even if dashReady', () => {
    expect(pickMiguelMove(MIGUEL_HARAI_TRIGGER_DIST, true, () => 0)).not.toBe('dash');
  });
  it('>250px: picks dash when ready and under the dash chance', () => {
    expect(pickMiguelMove(400, true, () => 0)).toBe('dash');
  });
  it('>250px: falls back to volley when dash roll fails or not ready', () => {
    expect(pickMiguelMove(400, true, () => 0.99)).toBe('volley');
    expect(pickMiguelMove(400, false, () => 0)).toBe('volley');
  });
});

describe('miguelDashFollowupEligible (§6.28-4連携 dash→harai)', () => {
  it('eligible within the harai trigger distance', () => {
    expect(miguelDashFollowupEligible(MIGUEL_HARAI_TRIGGER_DIST)).toBe(true);
    expect(miguelDashFollowupEligible(0)).toBe(true);
  });
  it('not eligible beyond the trigger distance', () => {
    expect(miguelDashFollowupEligible(MIGUEL_HARAI_TRIGGER_DIST + 1)).toBe(false);
  });
});
