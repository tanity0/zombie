// 賞金首(とボス級)の絵の取りに行き方の取りこぼしを止める(社長報告「賞金首のアテンションで魔法陣だけ映っていた」)。
import { describe, it, expect } from 'vitest';
import { BOUNTY_TYPE_BY_STAGE } from '../config/stageDifficulty';
import { allEnemySheets, sheetDeferred } from './enemySheets';
import {
  enemyArtWarmPlan, deferredSheetsOfIdle, BOUNTY_ART_GROUPS, bountyArtGroupKey, bountyArtNames, stageBountyArtGroup,
} from './enemyArtWarm';
import ledger from '../../scripts/asset-masters.json';

const FILES = (ledger as { files: Record<string, { w: number; h: number }> }).files;
const residentMB = (name: string): number => {
  const f = FILES[`sprites/${name}.png`];
  return f ? (f.w * f.h * 4) / 1048576 : 0;
};

describe('enemyArtWarmPlan(立ち絵を先に・シートは後)', () => {
  it('立ち絵だけが先・シートは全部後(立ち絵が帯域を分け合わない)', () => {
    const p = enemyArtWarmPlan('bounty-ranged');
    expect(p.first).toEqual(['bounty-ranged']);
    expect(p.then.length).toBeGreaterThan(0);
    expect(p.then).not.toContain('bounty-ranged');
  });
  it('遅延にした立ち絵は、その個体のシートを1枚も取りこぼさない(全遅延個体)', () => {
    const deferredIdles = [...new Set(allEnemySheets().filter(s => sheetDeferred(s.idle)).map(s => s.idle))];
    expect(deferredIdles.length).toBeGreaterThan(5);
    for (const idle of deferredIdles) {
      const want = allEnemySheets().filter(s => s.idle === idle).map(s => s.sheet).sort();
      expect([...enemyArtWarmPlan(idle).then].sort(), idle).toEqual(want);
    }
  });
  it('起動時に読む個体(雑魚・強個体)は後回しのシートが無い=今と同じ', () => {
    for (const idle of ['hunter', 'pumpkin-common', 'driller-common']) expect(deferredSheetsOfIdle(idle)).toEqual([]);
  });
});

describe('出撃時の賞金首の先読み', () => {
  it('賞金首の居る全ステージに組があり、立ち絵とシートを全部含む', () => {
    const stages = Object.keys(BOUNTY_TYPE_BY_STAGE);
    expect(stages.length).toBeGreaterThanOrEqual(4);
    for (const st of stages) {
      const t = BOUNTY_TYPE_BY_STAGE[st]!;
      const key = stageBountyArtGroup(st);
      expect(key).toBe(bountyArtGroupKey(t));
      const names = BOUNTY_ART_GROUPS[key!];
      expect(names, st).toBeDefined();
      expect(names[0]).toBe(t); // 立ち絵(=型名)が先頭
      for (const s of allEnemySheets().filter(x => x.idle === t)) expect(names, `${st} ${s.sheet}`).toContain(s.sheet);
    }
  });
  it('賞金首の居ないステージは先読みしない', () => {
    expect(stageBountyArtGroup('stage-2')).toBeNull();
    expect(stageBountyArtGroup('stage-7')).toBeNull();
  });
  it('全部の絵が原盤台帳にある(名前の打ち間違い=黙って読まないを止める)', () => {
    for (const names of Object.values(BOUNTY_ART_GROUPS)) for (const n of names) expect(FILES[`sprites/${n}.png`], n).toBeDefined();
  });
  it('1ステージぶんの常駐は小さい(賞金首1体ぶん・4MB未満)', () => {
    for (const [k, names] of Object.entries(BOUNTY_ART_GROUPS)) {
      const mb = names.reduce((a, n) => a + residentMB(n), 0);
      expect(mb, k).toBeLessThan(4);
    }
    // ステージ1(バス停)= 立ち絵0.11+歩き0.60+振り0.82 ≈ 1.5MB
    expect(bountyArtNames('bounty-ranged').reduce((a, n) => a + residentMB(n), 0)).toBeLessThan(2);
  });
});
