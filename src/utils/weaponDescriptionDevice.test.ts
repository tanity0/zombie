import { describe, it, expect } from 'vitest';
import { weaponDescription, WEAPON_DESC_BY_DEVICE } from './weaponUtils';

// research/PC_SUPPORT.md §11-6: 「指を離すと」等のスマホの言葉を PC・パッドに出さない。
describe('weaponDescription(機器ごとの説明)', () => {
  const keys = ['glauncher-t2-alchemy', 'glauncher-t3-signal'];
  it('スマホ(既定)の文は変えない', () => {
    for (const k of keys) expect(weaponDescription(k)).toMatch(/指を離す/);
    expect(weaponDescription('glauncher-t3-signal', 'touch')).toBe('自動では撃たない。狙いを定めて指を離すと、少し遅れてその地点へ空爆が落ちる');
  });
  it('PC・パッドの文にはスマホの操作の言葉が無く、パッドには「クリック」も無い', () => {
    for (const k of keys) {
      expect(weaponDescription(k, 'mouse')).not.toMatch(/指|フリック|タップ/);
      expect(weaponDescription(k, 'mouse')).toMatch(/ボタンを離すと/);
      expect(weaponDescription(k, 'pad')).not.toMatch(/指|フリック|タップ|クリック|ボタン|\{/);
    }
  });
  it('PC の文(クリックでもスペースでも同じ=「ボタン」)', () => {
    expect(weaponDescription('glauncher-t2-alchemy', 'mouse')).toBe('命中した相手に金の石を付ける。当て続けるほど石が大きくなり、ボタンを離すと石の付いた敵がまとめて爆発する');
    expect(weaponDescription('glauncher-t3-signal', 'mouse')).toBe('自動では撃たない。カーソルで狙いを定めてボタンを離すと、少し遅れてその地点へ空爆が落ちる');
  });
  it('パッドの文は系統ごとの刻印(HUD の札と同じ字)', () => {
    expect(weaponDescription('glauncher-t2-alchemy', 'pad', 'xbox')).toContain('A を離すと、石の付いた敵がまとめて爆発する');
    expect(weaponDescription('glauncher-t2-alchemy', 'pad', 'ps')).toContain('× を離すと、');
    expect(weaponDescription('glauncher-t3-signal', 'pad', 'nin')).toBe('自動では撃たない。スティックで狙いを定めて B を離すと、少し遅れてその地点へ空爆が落ちる');
  });
  it('PC の文を持つ物は、パッドの文も必ず持つ', () => {
    expect(Object.keys(WEAPON_DESC_BY_DEVICE.pad).sort()).toEqual(Object.keys(WEAPON_DESC_BY_DEVICE.pc).sort());
  });
  it('機器ごとの文が無い物・未登録は従来どおり', () => {
    expect(weaponDescription('rifle-t1', 'mouse')).toBe(weaponDescription('rifle-t1'));
    expect(weaponDescription('nope', 'pad')).toBe('');
    expect(weaponDescription(null, 'mouse')).toBe('');
  });
});
