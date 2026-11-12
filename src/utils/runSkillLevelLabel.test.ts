import { describe, it, expect } from 'vitest';
import { runSkillDisplayCap, skillLevelTone } from './runSkillLevelLabel';
import { runLevelCap } from './runSkillDraft';
import { skillMaxLevel, SKILLS } from '../data/campaign';
import type { SkillKey } from '../types/game';

const key = Object.keys(SKILLS)[0] as SkillKey;

describe('runSkillDisplayCap', () => {
  it('所持Lvが上限(=この出撃で届く最大)になる。全体の最大ではない', () => {
    expect(runSkillDisplayCap(key, 1, {})).toBe(1);
    expect(runSkillDisplayCap(key, 1, { [key]: 2 })).toBe(Math.min(2, skillMaxLevel(key)));
    expect(runSkillDisplayCap(key, 1, { [key]: 2 })).toBe(runLevelCap(key, { [key]: 2 }));
  });
  it('所持Lvが全体の最大を超えていても全体の最大で止まる', () => {
    expect(runSkillDisplayCap(key, 1, { [key]: 99 })).toBe(skillMaxLevel(key));
  });
  it('今のLvが上限を超えている時は今のLvを上限として出す', () => {
    expect(runSkillDisplayCap(key, 3, {})).toBe(3);
  });
});

describe('skillLevelTone', () => {
  it('上限に達したら max(Lv1上限1も含む)', () => {
    expect(skillLevelTone(3, 3)).toBe('max');
    expect(skillLevelTone(1, 1)).toBe('max');
  });
  it('Lv1で上限未満は low、2以上で上限未満は normal', () => {
    expect(skillLevelTone(1, 2)).toBe('low');
    expect(skillLevelTone(2, 3)).toBe('normal');
  });
});
