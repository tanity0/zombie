import { describe, it, expect } from 'vitest';
import { killSlashNeckPosition, pickImageEffectFrame, KILL_SLASH_NECK_HEIGHT_RATIO } from './killSlashFx';

describe('killSlashNeckPosition', () => {
  it('水平方向は当たり箱の中心', () => {
    const enemy = { x: 100, y: 200, width: 40, height: 80 };
    const pos = killSlashNeckPosition(enemy);
    expect(pos.x).toBe(100 + 40 / 2);
  });

  it('垂直方向は上端からheight*KILL_SLASH_NECK_HEIGHT_RATIO下がった位置(頭寄り)', () => {
    const enemy = { x: 0, y: 200, width: 40, height: 80 };
    const pos = killSlashNeckPosition(enemy);
    expect(pos.y).toBe(200 + 80 * KILL_SLASH_NECK_HEIGHT_RATIO);
    // 首は当たり箱の中心(y+height/2=240)より上(頭寄り)であること。
    expect(pos.y).toBeLessThan(200 + 80 / 2);
  });

  it('負の座標でも壊れない(単なる算術)', () => {
    const enemy = { x: -50, y: -20, width: 30, height: 60 };
    const pos = killSlashNeckPosition(enemy);
    expect(pos.x).toBe(-50 + 15);
    expect(pos.y).toBe(-20 + 60 * KILL_SLASH_NECK_HEIGHT_RATIO);
  });
});

describe('pickImageEffectFrame', () => {
  it('進捗0で0コマ目', () => {
    expect(pickImageEffectFrame(0, 17)).toBe(0);
  });

  it('進捗1で最終コマ(16)で止まる', () => {
    expect(pickImageEffectFrame(1, 17)).toBe(16);
  });

  it('中間の進捗は単調に増える', () => {
    const a = pickImageEffectFrame(0.25, 17);
    const b = pickImageEffectFrame(0.75, 17);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(16);
  });

  it('範囲外(負・1超)の進捗はクランプされ、ループしない', () => {
    expect(pickImageEffectFrame(-5, 17)).toBe(0);
    expect(pickImageEffectFrame(5, 17)).toBe(16);
  });

  it('cols<=1やNaN/Infinityでも例外を投げず0を返す', () => {
    expect(pickImageEffectFrame(0.5, 0)).toBe(0);
    expect(pickImageEffectFrame(0.5, 1)).toBe(0);
    expect(pickImageEffectFrame(0.5, NaN)).toBe(0);
    expect(pickImageEffectFrame(0.5, Infinity)).toBe(0);
    expect(pickImageEffectFrame(NaN, 17)).toBe(0);
  });
});
