import { describe, it, expect } from 'vitest';
import { bossFaceWant } from './bossFacing';
import { sheetArtFacesRight } from './enemySheets';

describe('裏ボスの向き', () => {
  it('相手の居る側を向く・真上/真下では今の向きのまま', () => {
    expect(bossFaceWant(-1, 100, 300)).toBe(1);
    expect(bossFaceWant(1, 100, -50)).toBe(-1);
    expect(bossFaceWant(1, 100, 110)).toBe(1);
    expect(bossFaceWant(-1, 100, 90)).toBe(-1);
    expect(bossFaceWant(1, 100, Number.NaN)).toBe(1);
  });
  it('絵の素の向き: シートごとの指定が立ち絵の指定より優先', () => {
    expect(sheetArtFacesRight('jibril', 'jibril-throw')).toBe(true);  // ランタンを右へ投げる絵
    expect(sheetArtFacesRight('jibril', 'jibril-idle')).toBe(false);  // 頭巾は左を向いている
    expect(sheetArtFacesRight('miguel', 'miguel-idle')).toBe(true);
    expect(sheetArtFacesRight('phill', null)).toBe(true);
  });
});
