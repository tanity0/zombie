// v0.25.3499: シートの段組みを「画像の実寸から自動判定する」ための純関数の不変条件。
// 社長のシートは支給のたびに段組みが変わりうる(初回=8列×5段 / 差し替え=1段×38列)ため、
// ここを固定値にすると差し替えのたびに人が直す必要があり、直し忘れると全アイコンがズレる。
import { describe, it, expect } from 'vitest';
import {
  SKILL_ICON_ORDER, SKILL_ICON_INDEX, SKILL_ICON_COUNT, skillSheetGrid, skillSheetGeometry,
  skillIconStyle, hasSkillIcon,
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
  // 正方マスのシート(比較しやすいので基本形はこちらで固定)。
  const SQ = skillSheetGeometry(38 * 64, 64);
  it('1番目は左上・38番目は最後のマスを指す(1段×38列)', () => {
    const first = skillIconStyle(SKILL_ICON_ORDER[0], '/x.png', 32, SQ)!;
    expect(first.backgroundPosition).toBe('0px 0px');
    const last = skillIconStyle(SKILL_ICON_ORDER[37], '/x.png', 32, SQ)!;
    expect(last.backgroundPosition).toBe(`${-37 * 32}px 0px`);
    expect(last.backgroundSize).toBe(`${38 * 32}px ${1 * 32}px`);
  });
  it('8列×5段では9番目が2段目の先頭になる', () => {
    const grid = skillSheetGeometry(8 * 64, 5 * 64);
    const ninth = skillIconStyle(SKILL_ICON_ORDER[8], '/x.png', 32, grid)!;
    expect(ninth.backgroundPosition).toBe(`0px ${-1 * 32}px`);
  });

  // ★実物のシート(v0.25.3500・5472×136)は**マスが正方形ではない**(144×136)。
  // 正方形の窓へ強制すると横に潰れるので、contain(比を保って収める)+中央寄せであること。
  describe('マスが正方形でないシート(実物=5472×136)', () => {
    const REAL = skillSheetGeometry(5472, 136);
    it('段組みと1マスの実寸を正しく読む', () => {
      expect(REAL).toEqual({ cols: 38, rows: 1, cellW: 144, cellH: 136 });
    });
    it('横に潰さない: 拡縮は縦横同率で、はみ出す側ではなく収まる側に合わせる', () => {
      const st = skillIconStyle(SKILL_ICON_ORDER[0], '/x.png', 36, REAL)!;
      const scale = 36 / 144; // 横の方が大きいので横に合わせる=contain
      expect(st.backgroundSize).toBe(`${38 * 144 * scale}px ${136 * scale}px`);
    });
    it('余った側(この場合は縦)は中央へ寄せる', () => {
      const st = skillIconStyle(SKILL_ICON_ORDER[0], '/x.png', 36, REAL)!;
      const scale = 36 / 144;
      const padY = (36 - 136 * scale) / 2;
      expect(st.backgroundPosition).toBe(`0px ${padY}px`);
      expect(padY).toBeGreaterThan(0);
    });
    it('n番目のマスがちょうどn個ぶん左へずれる(並びのズレ検知)', () => {
      const scale = 36 / 144;
      for (const i of [1, 17, 37]) {
        const st = skillIconStyle(SKILL_ICON_ORDER[i], '/x.png', 36, REAL)!;
        expect(st.backgroundPosition).toBe(`${-i * 144 * scale}px ${(36 - 136 * scale) / 2}px`);
      }
    });
  });
});
