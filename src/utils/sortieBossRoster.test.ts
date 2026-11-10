import { describe, it, expect } from 'vitest';
import { sortieBossRoster, MUTANT_ENCOUNTER_KEYS } from './sortieBossRoster';
import { STAGES } from '../data/campaign';
import { PRACTICE_SLOTS } from './bossPractice';

const none = () => false;
const keys = (stageId: string, opts = {}) => sortieBossRoster(stageId, none, opts).map(b => b.encounterKey);

describe('sortieBossRoster(出撃前のボス一覧)', () => {
  it('ステージ1: 城のボス → ゲート → 賞金首 → 変異体4体 → 深層の順', () => {
    expect(keys('stage-1')).toEqual([
      'giantbat@stage-1', 'miguel', 'bounty-ranged',
      'mutant-hero', 'mutant-liberty', 'mutant-astro', 'mutant-wraith', 'phantom-brawler', 'mimir',
    ]);
  });
  it('拳鬼(research/BRAWLER_PHANTOM.md)はステージ1・3・4・5に1行ずつ・変異体の後ろ・絵は上書き', () => {
    for (const st of ['stage-1', 'stage-3', 'stage-4', 'stage-5']) expect(keys(st)).toContain('phantom-brawler');
    for (const st of ['stage-2', 'stage-6', 'stage-7', 'stage-tutorial']) expect(keys(st)).not.toContain('phantom-brawler');
    const b = sortieBossRoster('stage-3', none).find(x => x.encounterKey === 'phantom-brawler')!;
    expect(b.kind).toBe('phantom');
    expect(b.label).toBe('拳鬼(幻影)');
    expect(b.iconSprite).toBeTruthy();
  });
  it('研究所跡(ステージ2)は城のボスを出さず、隠しボスだけ', () => {
    expect(keys('stage-2')).toEqual(['idol']);
  });
  it('ボスの居ないステージは空(チュートリアル・洋館の通路)', () => {
    expect(keys('stage-tutorial')).toEqual([]);
    expect(keys('stage-6')).toEqual([]); // 洋館の通路の天使は本編で会えない
  });
  it('英雄を昇天させた後は英雄を並べない', () => {
    expect(keys('stage-3', { heroAscended: true })).not.toContain('mutant-hero');
    expect(keys('stage-3')).toContain('mutant-hero');
  });
  it('出会ったボスだけ known になる(対策室の常時解放は見ない)', () => {
    const r = sortieBossRoster('stage-1', k => k === 'miguel');
    expect(r.filter(b => b.known).map(b => b.encounterKey)).toEqual(['miguel']);
  });
  it('本編で会えるボスは、どこかのステージの一覧に必ず1回だけ載る(台帳の取りこぼし検知)', () => {
    const all = STAGES.flatMap(s => keys(s.id));
    for (const slot of PRACTICE_SLOTS) {
      if (!slot.reachable || slot.slotKey === 'giantbat@stage-2') continue;
      expect(all.filter(k => k === slot.encounterSlotKey).length, slot.slotKey).toBe(1);
    }
    for (const k of MUTANT_ENCOUNTER_KEYS) expect(all).toContain(k);
  });
});
