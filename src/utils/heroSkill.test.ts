// research/MUTANT_HERO.md §1b(社長指示2026-10-05)スキル「英雄」: 満タンの間だけ移動速度・与ダメージ ×1.3。被ダメージ ×1.3 は常時(社長指示2026-11-02)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, skillHeroMult, skillHeroActive, skillIncomingDamageMult, skillOutgoingDamageMult, HERO_SKILL_MULT } from '../store/gameStore';
import { SKILLS, GACHA_EXCLUDED_SKILLS, SKILL_KEYS } from '../data/campaign';

beforeEach(() => { useGameStore.getState().resetGame('warrior'); });

describe('スキル「英雄」', () => {
  it('速度・与ダメはHPが満タンの間だけ ×1.3、満タンでなければ効かない', () => {
    const p = useGameStore.getState().player;
    const full = { ...p, skills: ['hero' as const], health: p.maxHealth };
    const hurt = { ...full, health: p.maxHealth - 1 };
    expect(skillHeroActive(full)).toBe(true);
    expect(skillHeroMult(full)).toBe(HERO_SKILL_MULT);
    expect(skillHeroMult(hurt)).toBe(1);
    expect(skillHeroMult({ ...full, skills: [] })).toBe(1);
  });
  it('与ダメージと被ダメージの両方に掛かる', () => {
    const p = useGameStore.getState().player;
    const base = { ...p, skills: [], health: p.maxHealth };
    const hero = { ...base, skills: ['hero' as const] };
    expect(skillOutgoingDamageMult(hero) / skillOutgoingDamageMult(base)).toBeCloseTo(HERO_SKILL_MULT);
    expect(skillIncomingDamageMult(hero, 0) / skillIncomingDamageMult(base, 0)).toBeCloseTo(HERO_SKILL_MULT);
  });
  it('被ダメージ ×1.3 は満タンでなくても常時(社長指示2026-11-02)。与ダメは満タンでなければ上がらない', () => {
    const p = useGameStore.getState().player;
    const base = { ...p, skills: [], health: 1 };
    const hero = { ...base, skills: ['hero' as const] };
    expect(skillIncomingDamageMult(hero, 0) / skillIncomingDamageMult(base, 0)).toBeCloseTo(HERO_SKILL_MULT);
    expect(skillOutgoingDamageMult(hero) / skillOutgoingDamageMult(base)).toBeCloseTo(1);
  });
  it('台帳に載り、ガチャからは出ない(昇天させた時だけ)', () => {
    expect(SKILL_KEYS).toContain('hero');
    expect(SKILLS.hero.name).toBe('英雄');
    expect(GACHA_EXCLUDED_SKILLS).toContain('hero');
  });
});
