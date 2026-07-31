// ボス戦テストメニュー(bossTest.ts)のユニット。カタログの固定表が実設定(campaign.tsのhiddenBoss/
// ENGAGEABLE_BOSS_TYPES)とズレたら落ちる突き合わせ+URL合成の検証。
import { describe, it, expect } from 'vitest';
import { BOSS_TEST_ENTRIES, bossTestQuery, parseBossTestMode } from './bossTest';
import { ENGAGEABLE_BOSS_TYPES } from './bossEngagement';
import { getStage } from '../data/campaign';

describe('BOSS_TEST_ENTRIES(カタログの整合)', () => {
  it('裏ボス(bossnow)のステージ対応は campaign.ts の hiddenBoss と一致する', () => {
    for (const e of BOSS_TEST_ENTRIES.filter(e => e.param === 'bossnow')) {
      expect(getStage(e.stageId)?.hiddenBoss).toBe(e.boss);
    }
  });

  it('全エントリのステージは実在する', () => {
    for (const e of BOSS_TEST_ENTRIES) {
      expect(getStage(e.stageId), e.stageId).toBeDefined();
    }
  });

  it('掲載ボスは全て守護霊の交戦対象(ENGAGEABLE)=守護霊テストの対象網羅', () => {
    for (const e of BOSS_TEST_ENTRIES) {
      expect(ENGAGEABLE_BOSS_TYPES.has(e.boss), e.boss).toBe(true);
    }
  });

  it('ENGAGEABLEの全ボス型がカタログに1件以上ある(取りこぼしなし)', () => {
    const listed = new Set(BOSS_TEST_ENTRIES.map(e => e.boss));
    for (const t of ENGAGEABLE_BOSS_TYPES) {
      expect(listed.has(t), t).toBe(true);
    }
  });
});

describe('bossTestQuery(URL合成)', () => {
  const entry = { boss: 'mimir', stageId: 'stage-1', param: 'bossnow' } as const;

  it('smoke/stage/強制フラグ/class/retryが常に入る', () => {
    const q = new URLSearchParams(bossTestQuery(entry, { characterClass: 'rogue', ghost: false, ghostlog: false }));
    expect(q.get('smoke')).toBe('1');
    expect(q.get('stage')).toBe('stage-1');
    expect(q.get('bossnow')).toBe('1');
    expect(q.get('class')).toBe('rogue');
    expect(q.get('retry')).toBe('1');
    expect(q.get('ghost')).toBeNull();
    expect(q.get('ghostlog')).toBeNull();
  });

  it('ghost/ghostlogはトグルONの時だけ付く', () => {
    const q = new URLSearchParams(bossTestQuery(entry, { characterClass: 'warrior', ghost: true, ghostlog: true }));
    expect(q.get('ghost')).toBe('1');
    expect(q.get('ghostlog')).toBe('1');
  });
});

describe('parseBossTestMode(現在モードの判定・社長指示「いまどのモードか出しといて」)', () => {
  it('素のURL=通常モード', () => {
    const m = parseBossTestMode('');
    expect(m.active).toBe(false);
    expect(m.params).toEqual([]);
  });

  it('テスト出撃のURL=activeで内訳(フラグ/ステージ/守護霊)が取れる', () => {
    const q = bossTestQuery({ boss: 'mimir', stageId: 'stage-1', param: 'bossnow' }, { characterClass: 'warrior', ghost: true, ghostlog: false });
    const m = parseBossTestMode(q);
    expect(m.active).toBe(true);
    expect(m.params).toEqual(['bossnow']);
    expect(m.stageId).toBe('stage-1');
    expect(m.ghost).toBe(true);
  });

  it('?ghost=1単独の残留もactiveとして検出する', () => {
    const m = parseBossTestMode('?ghost=1');
    expect(m.active).toBe(true);
    expect(m.params).toEqual([]);
    expect(m.ghost).toBe(true);
  });
});
