import { describe, expect, it } from 'vitest';
import { buildKenkiArchive, kenkiDefeatedLevels } from './kenkiArchive';
import { kenkiChronicleKillDetail, type KenkiLevel } from './kenkiLevel';
import { buildBossStoryGroups, bossStoryShownName } from './bossStoryArchive';
import { KENKI_LEVEL_NAMES } from '../data/kenkiNames';

const none = new Set<string>();
const chron = (...lv: KenkiLevel[]) => new Set(lv.map(kenkiChronicleKillDetail));

describe('資料室の孫悟空の欄(倒した時の名前と討伐の記録)', () => {
  it('一度も倒していない: 記録なし・次の技なし', () => {
    const v = buildKenkiArchive(1, none);
    expect(v.topLevel).toBeNull();
    expect(v.rows).toEqual([]);
    expect(v.nextArt).toBeNull();
  });
  it('Lv1を倒した(レベル2): 孫悟空を討伐・技なし・次は踵落とし', () => {
    const v = buildKenkiArchive(2, chron(1));
    expect(v.topLevel).toBe(1);
    expect(v.rows.map(r => [r.name, r.art, r.tint])).toEqual([['孫悟空', null, null]]);
    expect(v.nextArt).toBe('踵落とし');
  });
  it('Lv2を倒した(レベル3): 弼馬温(青)で踵落としを体得・次は蹴り上げ', () => {
    const v = buildKenkiArchive(3, none); // 年表が無くてもレベルから分かる
    expect(v.topLevel).toBe(2);
    expect(v.rows.map(r => [r.name, r.art, r.tint])).toEqual([['孫悟空', null, null], ['弼馬温', '踵落とし', 'blue']]);
    expect(v.nextArt).toBe('蹴り上げ');
  });
  it('レベル5(済が出る)でも済をまだ倒していなければ一番上は Lv4・次の技は無い', () => {
    const v = buildKenkiArchive(5, chron(1, 2, 3, 4));
    expect(v.topLevel).toBe(4);
    expect(v.rows[3]).toMatchObject({ name: '孫行者', art: '土竜', tint: 'red' });
    expect(v.nextArt).toBeNull();
  });
  it('済を倒した(年表の記録で判断): 一番上は斗戦勝仏(金)', () => {
    const v = buildKenkiArchive(5, chron(1, 2, 3, 4, 5));
    expect(v.topLevel).toBe(5);
    expect(v.rows.at(-1)).toMatchObject({ name: KENKI_LEVEL_NAMES[5], art: null, tint: 'gold' });
    expect(v.nextArt).toBeNull();
  });
  it('倒したレベル=レベルより下 ∪ 年表の討伐の行', () => {
    expect(kenkiDefeatedLevels(1, none)).toEqual([]);
    expect(kenkiDefeatedLevels(4, none)).toEqual([1, 2, 3]);
    expect(kenkiDefeatedLevels(5, chron(5))).toEqual([1, 2, 3, 4, 5]);
  });
  it('棚の名前: 孫悟空の枠だけ倒した時の名前・それ以外は台帳の名前', () => {
    const cells = buildBossStoryGroups(new Set(['phantom-brawler', 'miguel']), false, new Set(), buildKenkiArchive(3, none)).flatMap(g => g.cells);
    const brawler = cells.find(c => c.entry.key === 'phantom-brawler')!;
    expect(bossStoryShownName(brawler)).toEqual({ name: '弼馬温', tint: 'blue' });
    expect(cells.filter(c => c.entry.key !== 'phantom-brawler').every(c => c.kenki === null)).toBe(true);
    const fresh = buildBossStoryGroups(new Set(['phantom-brawler']), false, new Set(), buildKenkiArchive(1, none)).flatMap(g => g.cells);
    expect(bossStoryShownName(fresh.find(c => c.entry.key === 'phantom-brawler')!)).toEqual({ name: '孫悟空(幻影)', tint: null });
  });
});
