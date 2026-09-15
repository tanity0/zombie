import { describe, it, expect } from 'vitest';
import { SKILL_BURST_FRAMES, skillBurstFrame, skillBurstTexture, skillBurstSize, skillBurstTint } from './skillBurstFrames';

describe('skillBurstFrames(スキル取得の炸裂)', () => {
  it('進行度がコマ番号へ写り、端で溢れない', () => {
    expect(skillBurstFrame(0)).toBe(0);
    expect(skillBurstFrame(1)).toBe(SKILL_BURST_FRAMES - 1);
    expect(skillBurstFrame(1.5)).toBe(SKILL_BURST_FRAMES - 1);
    expect(skillBurstFrame(-1)).toBe(0);
  });
  it('テクスチャ名は2桁ゼロ詰め', () => {
    expect(skillBurstTexture(0)).toBe('fx/skill-burst-00');
    expect(skillBurstTexture(17)).toBe('fx/skill-burst-17');
    expect(skillBurstTexture(99)).toBe('fx/skill-burst-17');
  });
  it('★レベルが上がるほど大きい(社長指示「大きさがレベル」)', () => {
    expect(skillBurstSize(2)).toBeGreaterThan(skillBurstSize(1));
    expect(skillBurstSize(3)).toBeGreaterThan(skillBurstSize(2));
  });
  it('★一番小さくてもプレイヤー(描画 約64×52px)より大きい(社長指示)', () => {
    expect(skillBurstSize(1)).toBeGreaterThan(64);
  });
  it('★色はレア度で白/青/金。赤と紫は使わない(色の文法)', () => {
    expect(skillBurstTint('normal')).toBe(0xffffff);
    const rare = skillBurstTint('rare'), sup = skillBurstTint('super');
    // 青=青成分が最大 / 金=赤成分が最大
    expect(rare & 0xff).toBeGreaterThan((rare >> 16) & 0xff);
    expect((sup >> 16) & 0xff).toBeGreaterThan(sup & 0xff);
    // 紫(赤と青が高く緑が低い)にならないこと
    for (const c of [rare, sup]) {
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
      expect(g).toBeGreaterThan(Math.min(r, b) * 0.9);
    }
  });
});
