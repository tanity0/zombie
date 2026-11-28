import { describe, it, expect } from 'vitest';
import { gunSlotTap, playerAutoFireAllowed } from './autoFireToggle';

describe('autoFireToggle(装備中の銃の枠タップ=装備を外す)', () => {
  it('装備中の銃をタップすると外す', () => {
    expect(gunSlotTap('g1', 'g1', false)).toEqual({ equip: null, autoFireOff: true });
  });
  it('外している間に同じ銃をタップすると、その銃を装備し直す', () => {
    expect(gunSlotTap('g1', 'g1', true)).toEqual({ equip: 'g1', autoFireOff: false });
  });
  it('外している間に別の銃をタップすると、その銃を装備', () => {
    expect(gunSlotTap('g1', 'g2', true)).toEqual({ equip: 'g2', autoFireOff: false });
  });
  it('装備中に別の銃をタップすると今どおり持ち替え', () => {
    expect(gunSlotTap('g1', 'g2', false)).toEqual({ equip: 'g2', autoFireOff: false });
  });
  it('銃を持っていない時のタップは装備扱い(外すにしない)', () => {
    expect(gunSlotTap(null, 'g1', false)).toEqual({ equip: 'g1', autoFireOff: false });
  });
  it('playerAutoFireAllowed は autoFireOff の逆', () => {
    expect(playerAutoFireAllowed({ autoFireOff: false })).toBe(true);
    expect(playerAutoFireAllowed({ autoFireOff: true })).toBe(false);
    expect(playerAutoFireAllowed({})).toBe(true);
  });
});
