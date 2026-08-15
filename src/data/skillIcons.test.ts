import { describe, it, expect } from 'vitest';
import { SKILL_ICON_ORDER, SKILL_ICON_COLS, SKILL_ICON_ROWS, SKILL_ICON_INDEX, skillIconStyle } from './skillIcons';

describe('スキルアイコンの台帳(社長支給の1枚シート)', () => {
  it('社長指定の38個・重複なし', () => {
    expect(SKILL_ICON_ORDER).toHaveLength(38);
    expect(new Set(SKILL_ICON_ORDER).size).toBe(38);
  });

  it('シートの枠(8列×5段)に収まる', () => {
    expect(SKILL_ICON_ORDER.length).toBeLessThanOrEqual(SKILL_ICON_COLS * SKILL_ICON_ROWS);
  });

  it('番号→座標の切り出しが並び順(左上から右・1段ずつ下)と一致する', () => {
    // 1番目=左上(0,0)/9番目=2段目の左端/38番目=5段目の6個目。
    expect(skillIconStyle(SKILL_ICON_ORDER[0], 'x.png', 64)?.backgroundPosition).toBe('0px 0px');
    expect(skillIconStyle(SKILL_ICON_ORDER[8], 'x.png', 64)?.backgroundPosition).toBe('0px -64px');
    expect(skillIconStyle(SKILL_ICON_ORDER[37], 'x.png', 64)?.backgroundPosition).toBe('-320px -256px');
  });

  it('台帳に無いスキルは番号を持たない(守護霊・POI専用など)', () => {
    expect(SKILL_ICON_INDEX['guardian-spirit']).toBeUndefined();
    expect(SKILL_ICON_INDEX['poi-bombing']).toBeUndefined();
  });
});
