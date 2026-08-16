// v0.25.3499: シートの段組みを「画像の実寸から自動判定する」ための純関数の不変条件。
// 社長のシートは支給のたびに段組みが変わりうる(初回=8列×5段 / 差し替え=1段×38列)ため、
// ここを固定値にすると差し替えのたびに人が直す必要があり、直し忘れると全アイコンがズレる。
import { describe, it, expect } from 'vitest';
import {
  SKILL_ICON_ORDER, SKILL_ICON_INDEX, SKILL_ICON_COUNT, skillSheetGrid, skillIconStyle, hasSkillIcon,
} from './skillIcons';

describe('SKILL_ICON_ORDER(台帳)', () => {
  it('38種ちょうど・重複なし', () => {
    expect(SKILL_ICON_ORDER.length).toBe(SKILL_ICON_COUNT);
    expect(new Set(SKILL_ICON_ORDER).size).toBe(SKILL_ICON_COUNT);
  });
  it('索引は並び順と一致する(1番目=index0)', () => {
    SKILL_ICON_ORDER.forEach((key, i) => expect(SKILL_ICON_INDEX[key]).toBe(i));
  });
  it('台帳に無いスキルは hasSkillIcon=false(守護霊・POI専用など)', () => {
    expect(hasSkillIcon(null)).toBe(false);
    expect(hasSkillIcon(undefined)).toBe(false);
  });
});

describe('skillSheetGrid(実寸→段組み)', () => {
  it('横1列(38×1)のシートを言い当てる', () => {
    expect(skillSheetGrid(38 * 64, 64)).toEqual({ cols: 38, rows: 1 });
  });
  it('8列×5段のシートを言い当てる(初回支給の形)', () => {
    expect(skillSheetGrid(8 * 64, 5 * 64)).toEqual({ cols: 8, rows: 5 });
  });
  it('マスの大きさが変わっても比が同じなら同じ答え(解像度非依存)', () => {
    expect(skillSheetGrid(8 * 16, 5 * 16)).toEqual({ cols: 8, rows: 5 });
    expect(skillSheetGrid(8 * 256, 5 * 256)).toEqual({ cols: 8, rows: 5 });
  });
  it('多少のはみ出し(端の余白1px等)があっても正しい段組みを選ぶ', () => {
    expect(skillSheetGrid(38 * 64 + 3, 64 + 1)).toEqual({ cols: 38, rows: 1 });
    expect(skillSheetGrid(8 * 64 + 2, 5 * 64 - 2)).toEqual({ cols: 8, rows: 5 });
  });
  it('不正な実寸では落ちずに1段として返す(描画を壊さない)', () => {
    expect(skillSheetGrid(0, 0)).toEqual({ cols: SKILL_ICON_COUNT, rows: 1 });
  });
});

describe('skillIconStyle(切り出し)', () => {
  it('1番目は左上・38番目は最後のマスを指す(1段×38列)', () => {
    const first = skillIconStyle(SKILL_ICON_ORDER[0], '/x.png', 32, 38, 1)!;
    expect(first.backgroundPosition).toBe('0px 0px');
    const last = skillIconStyle(SKILL_ICON_ORDER[37], '/x.png', 32, 38, 1)!;
    expect(last.backgroundPosition).toBe(`${-37 * 32}px 0px`);
    expect(last.backgroundSize).toBe(`${38 * 32}px ${1 * 32}px`);
  });
  it('8列×5段では9番目が2段目の先頭になる', () => {
    const ninth = skillIconStyle(SKILL_ICON_ORDER[8], '/x.png', 32, 8, 5)!;
    expect(ninth.backgroundPosition).toBe(`0px ${-1 * 32}px`);
  });
});
