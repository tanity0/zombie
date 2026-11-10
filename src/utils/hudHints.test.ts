import { describe, it, expect } from 'vitest';
import { hudHintStyle, hudGlyph, hudGunSlotKey, pauseResumeHint, pauseResumePadStyle, fillPadGlyphs, padStyleOf } from './hudHints';

describe('hudHintStyle(ゲーム中のボタン札を出す種類・research/PC_SUPPORT.md §14-1)', () => {
  it('縦の画面(スマホ)は、キーやパッドを繋いでも出さない', () => {
    expect(hudHintStyle(true, 'xbox', 'touch', true, false)).toBeNull();
    expect(hudHintStyle(false, 'xbox', 'mouse', true, false)).toBeNull();
  });
  it('スマホ(タッチだけ・キーを押していない)は出さない', () => {
    expect(hudHintStyle(false, 'xbox', 'touch', false, true)).toBeNull();
  });
  it('パッドを触っている間はパッド(PS 系は padps)。端末の種類より優先', () => {
    expect(hudHintStyle(true, 'xbox', 'touch', false, true)).toBe('pad');
    expect(hudHintStyle(true, 'ps', 'mouse', true, true)).toBe('padps');
    expect(hudHintStyle(true, 'nin', 'touch', false, true)).toBe('padnin');
  });
  it('マウスの端末はキー。タッチの端末でも指の後にキーを押したらキー', () => {
    expect(hudHintStyle(false, 'xbox', 'mouse', false, true)).toBe('key');
    expect(hudHintStyle(false, 'xbox', 'touch', true, true)).toBe('key');
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
  it('任天堂系: 標準配置は位置で並ぶので、下(指)が B・右(はじく)が A・上(次の銃)が X・左肩が L・一時停止は +', () => {
    expect([hudGlyph('padnin', 'press', false), hudGlyph('padnin', 'flick', false), hudGlyph('padnin', 'gunPrev', false), hudGlyph('padnin', 'gunNext', false), hudGlyph('padnin', 'pause', false)])
      .toEqual(['B', 'A', 'L', 'X', 'plus']);
  });
  it('銃の枠の番号はキーボードの1〜9だけ', () => {
    expect(hudGunSlotKey('key', 0)).toBe('1');
    expect(hudGunSlotKey('key', 8)).toBe('9');
    expect(hudGunSlotKey('key', 9)).toBeNull();
    expect(hudGunSlotKey('pad', 0)).toBeNull();
  });
});

describe('一時停止の再開の案内(今遊んでいる機器で)', () => {
  it('スマホ(細かいポインタ無し)は下の1行を出さない', () => {
    expect(pauseResumeHint(false, false)).toBeNull();
    expect(pauseResumeHint(true, false)).toBeNull();
  });
  it('キーボードのある端末は ESC / P(今どおり)。パッドで遊んでいる間は出さない(札が言っている)', () => {
    expect(pauseResumeHint(false, true)).toBe('ESC / P でも再開');
    expect(pauseResumeHint(true, true)).toBeNull();
  });
  it('パッドの時は「続ける」の右に系統ごとの札。縦のスマホ(細かいポインタ無し・縦)には繋いでいても出さない', () => {
    expect(pauseResumePadStyle('', true, true)).toBeNull();
    expect(pauseResumePadStyle('xbox', true, true)).toBe('pad');
    expect(pauseResumePadStyle('ps', true, true)).toBe('padps');
    expect(pauseResumePadStyle('nin', false, true)).toBe('padnin'); // タブレットの横持ち+パッド
    expect(pauseResumePadStyle('xbox', false, false)).toBeNull();
    // 札の字=一時停止のボタン(三本線・任天堂系は +)
    expect(hudGlyph('pad', 'pause', false)).toBe('menu');
    expect(hudGlyph('padnin', 'pause', false)).toBe('plus');
  });
});

describe('fillPadGlyphs(説明文にパッドの刻印を差し込む・字は HUD の札と同じ)', () => {
  it('{press}/{flick} を系統ごとの字にする(任天堂系は実際に割り当たっている刻印=下が B・右が A)', () => {
    const t = '{press} を離す。{flick} ではじく';
    expect(fillPadGlyphs(t, 'xbox')).toBe('A を離す。B ではじく');
    expect(fillPadGlyphs(t, 'ps')).toBe('× を離す。○ ではじく');
    expect(fillPadGlyphs(t, 'nin')).toBe('B を離す。A ではじく');
  });
  it('字は hudGlyph と同じ(札と食い違わない)', () => {
    for (const k of ['xbox', 'ps', 'nin'] as const) {
      expect(fillPadGlyphs('{press}', k)).toBe(hudGlyph(padStyleOf(k), 'press', false));
      expect(fillPadGlyphs('{flick}', k)).toBe(hudGlyph(padStyleOf(k), 'flick', false));
    }
  });
});
