import { describe, it, expect } from 'vitest';
import { NPC_SCENE_VARIANTS, pickNpcLine } from './npcLines';

// 拠点陥落(撤退)の台詞はシート「セリフDB_量産用」の base_lost(dlg_000417..000424)から引く(社長指示2026-11-17)。
describe('retreat (拠点陥落) lines', () => {
  for (let idx = 0; idx <= 7; idx++) {
    it(`soldier ${idx} has a retreat variant and pickNpcLine returns one of them`, () => {
      const texts = NPC_SCENE_VARIANTS.filter(v => v.idx === idx && v.cat === 'retreat').map(v => v.text);
      expect(texts.length).toBeGreaterThan(0);
      for (let i = 0; i < 10; i++) expect(texts).toContain(pickNpcLine(idx, 'retreat', '__fallback__'));
    });
  }
});
