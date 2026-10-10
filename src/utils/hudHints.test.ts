import { describe, it, expect } from 'vitest';
import { hudHintStyle, hudGlyph, hudGunSlotKey } from './hudHints';

describe('hudHintStyle(ゲーム中のボタン札を出す種類・research/PC_SUPPORT.md §14-1)', () => {
  it('縦の画面(スマホ)は、キーやパッドを繋いでも出さない', () => {
    expect(hudHintStyle(true, false, 'touch', true, false)).toBeNull();
    expect(hudHintStyle(false, false, 'mouse', true, false)).toBeNull();
  });
  it('スマホ(タッチだけ・キーを押していない)は出さない', () => {
    expect(hudHintStyle(false, false, 'touch', false, true)).toBeNull();
  });
  it('パッドを触っている間はパッド(PS 系は padps)。端末の種類より優先', () => {
    expect(hudHintStyle(true, false, 'touch', false, true)).toBe('pad');
    expect(hudHintStyle(true, true, 'mouse', true, true)).toBe('padps');
  });
  it('マウスの端末はキー。タッチの端末でも指の後にキーを押したらキー', () => {
    expect(hudHintStyle(false, false, 'mouse', false, true)).toBe('key');
    expect(hudHintStyle(false, false, 'touch', true, true)).toBe('key');
  });
});

describe('hudGlyph(札の字)', () => {
  it('マウスの端末: 右手側(指=左クリック・はじく=右クリック)はマウスの絵、一時停止は Esc', () => {
    expect(hudGlyph('key', 'pause', true)).toBe('Esc');
    expect(hudGlyph('key', 'press', true)).toBe('lmb');
    expect(hudGlyph('key', 'flick', true)).toBe('rmb');
  });
  it('マウスの無い端末(タブレット+キーボード): Space / K', () => {
    expect(hudGlyph('key', 'press', false)).toBe('Space');
    expect(hudGlyph('key', 'flick', false)).toBe('K');
  });
  it('パッド: 実際の割り当て(A=指 / B=はじく / LB=前の銃 / Y=次の銃 / 一時停止=三本線)と同じ。PS は ×/○/L1/△', () => {
    expect([hudGlyph('pad', 'press', false), hudGlyph('pad', 'flick', false), hudGlyph('pad', 'gunPrev', false), hudGlyph('pad', 'gunNext', false), hudGlyph('pad', 'pause', false)])
      .toEqual(['A', 'B', 'LB', 'Y', 'menu']);
    expect([hudGlyph('padps', 'press', false), hudGlyph('padps', 'flick', false), hudGlyph('padps', 'gunPrev', false), hudGlyph('padps', 'gunNext', false), hudGlyph('padps', 'pause', false)])
      .toEqual(['×', '○', 'L1', '△', 'menu']);
  });
  it('銃の枠の番号はキーボードの1〜9だけ', () => {
    expect(hudGunSlotKey('key', 0)).toBe('1');
    expect(hudGunSlotKey('key', 8)).toBe('9');
    expect(hudGunSlotKey('key', 9)).toBeNull();
    expect(hudGunSlotKey('pad', 0)).toBeNull();
  });
});
