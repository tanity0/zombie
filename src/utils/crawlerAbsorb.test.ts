import { describe, it, expect } from 'vitest';
import { isCrawlerAbsorbable, type CrawlerAbsorbSubject } from './crawlerAbsorb';
import type { EnemyType } from '../types/game';

const e = (type: EnemyType, extra: Partial<CrawlerAbsorbSubject> = {}): CrawlerAbsorbSubject => ({ type, health: 10, ...extra } as CrawlerAbsorbSubject);

describe('ステージ2の這う塊が取り込める敵(雑魚だけ)', () => {
  it('雑魚は取り込める', () => {
    expect(isCrawlerAbsorbable(e('zombie'))).toBe(true);
    expect(isCrawlerAbsorbable(e('lab-zombie-1'))).toBe(true);
  });
  it('ボス級・強個体・ハンター・死神は取り込まない', () => {
    for (const t of ['idol', 'hunter', 'reaper', 'pumpkin', 'lab-zombie-3', 'driller', 'logger', 'giantbat', 'thor', 'mutant-hero'] as EnemyType[]) {
      expect(isCrawlerAbsorbable(e(t))).toBe(false);
    }
    expect(isCrawlerAbsorbable(e('zombie', { colorTier: 'red' }))).toBe(false); // 色つき強個体(体勢値あり)
  });
  it('名前付き・イベント湧き・クエスト対象・物語ボス・固定配置・救助の攻撃役・死体は取り込まない', () => {
    expect(isCrawlerAbsorbable(e('zombie', { isNamed: true }))).toBe(false);
    expect(isCrawlerAbsorbable(e('zombie', { fromEvent: true }))).toBe(false);
    expect(isCrawlerAbsorbable(e('zombie', { questTarget: true }))).toBe(false);
    expect(isCrawlerAbsorbable(e('zombie', { isStoryBoss: true }))).toBe(false);
    expect(isCrawlerAbsorbable(e('lab-zombie-1', { fixed: true }))).toBe(false);
    expect(isCrawlerAbsorbable(e('zombie', { escortTarget: 'npc-1' }))).toBe(false);
    expect(isCrawlerAbsorbable(e('zombie', { corpseUntil: 123 }))).toBe(false);
    expect(isCrawlerAbsorbable(e('zombie', { health: 0 }))).toBe(false);
  });
});
