import { describe, it, expect } from 'vitest';
import { SKILL_BURST_FRAMES, skillBurstFrame, skillBurstTexture, skillBurstSize, skillBurstTint, skillBurstScale, skillBurstAlpha } from './skillBurstFrames';

describe('skillBurstFrames(スキル取得の炸裂)', () => {
  it('進行度がコマ番号へ写り、端で溢れない', () => {
    expect(skillBurstFrame(0)).toBe(0);
    expect(skillBurstFrame(1)).toBe(SKILL_BURST_FRAMES - 1);
    expect(skillBurstFrame(1.5)).toBe(SKILL_BURST_FRAMES - 1);
    expect(skillBurstFrame(-1)).toBe(0);
  });
  it('テクスチャ名は2桁ゼロ詰め', () => {
    expect(skillBurstTexture(0)).toBe('fx/skill-burst-00');
    expect(skillBurstTexture(SKILL_BURST_FRAMES - 1)).toBe('fx/skill-burst-12');
    expect(skillBurstTexture(99)).toBe('fx/skill-burst-12');
  });
  it('★コマ送りは等間隔ではなく前半を伸ばす(頭の3コマが絵の本体・v0.25.4344)', () => {
    // 尺の前半で、等分送りより手前のコマに留まっていること
    expect(skillBurstFrame(0.5)).toBeLessThan(Math.floor(0.5 * SKILL_BURST_FRAMES));
    expect(skillBurstFrame(0.25)).toBeLessThan(Math.floor(0.25 * SKILL_BURST_FRAMES));
    // 単調に進む
    for (let i = 1; i <= 20; i++) expect(skillBurstFrame(i / 20)).toBeGreaterThanOrEqual(skillBurstFrame((i - 1) / 20));
  });
  it('★出だしに押し出しがあり、末尾でαが抜ける(慣性MUST)', () => {
    expect(skillBurstScale(0.10)).toBeGreaterThan(1.1); // 行き過ぎる
    expect(skillBurstScale(0.5)).toBe(1);               // 整定する
    expect(skillBurstScale(0)).toBeLessThan(1);         // 小さく出る
    expect(skillBurstAlpha(0.5)).toBeCloseTo(0.72);
    expect(skillBurstAlpha(0.5)).toBeLessThan(1); // ★加算で潰れないよう天井を下げてある
    expect(skillBurstAlpha(1)).toBe(0);                 // 素材任せにしない
  });
  it('★レベルが上がるほど大きい(社長指示「大きさがレベル」)', () => {
    expect(skillBurstSize(2)).toBeGreaterThan(skillBurstSize(1));
    expect(skillBurstSize(3)).toBeGreaterThan(skillBurstSize(2));
  });
  it('★一番小さくてもプレイヤー(描画 約64×52px)より大きい(社長指示)', () => {
    expect(skillBurstSize(1)).toBeGreaterThan(64);
  });
  it('★色はレア度で白/青/金。赤と紫は使わない(色の文法)', () => {
    expect(skillBurstTint('normal')).toBe(0xdfe6f0);
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
