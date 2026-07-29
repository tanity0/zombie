import { describe, it, expect } from 'vitest';
import { topScoreItem, calculateResultScore, GHOST_SCORE_MULT } from './resultScoring';
import type { GameStats } from '../types/game';

// 全項目0の GameStats(必要なものだけ上書きして使う)。
const mkStats = (over: Partial<GameStats> = {}): GameStats => ({
  timeAlive: 0, enemiesKilled: 0, damageDealt: 0, experienceCollected: 0, maxLevel: 1,
  maxCombo: 0, strapsCollected: 0, strapsSpent: 0, treasuresCollected: 0, damageTaken: 0,
  meleeFinishers: 0, eliteKills: 0, bossKills: 0, maxAreaReached: 0, maxDepthDist: 0, maxRankReached: 1,
  ...over,
});

// 被弾スコアの時間ランプ(社長決定v0.25.1992): 開始60秒は0→満額へ。何もしない超短時間ランの穴を塞ぐ。
describe('survivalScore の生存時間ランプ', () => {
  it('何もしない0秒ラン(被弾0)は survival=0・ゴールド0(旧: 満額20000→10G の穴)', () => {
    const r = calculateResultScore(mkStats({ timeAlive: 0, damageTaken: 0 }), false);
    expect(r.survivalScore).toBe(0);
    expect(r.goldEarned).toBe(0);
  });
  it('30秒・被弾0は半額(ramp=0.5)', () => {
    const r = calculateResultScore(mkStats({ timeAlive: 30, damageTaken: 0 }), false);
    expect(r.survivalScore).toBe(10000);
  });
  it('60秒以上・被弾0は満額20000(頭打ち)', () => {
    expect(calculateResultScore(mkStats({ timeAlive: 60, damageTaken: 0 }), false).survivalScore).toBe(20000);
    expect(calculateResultScore(mkStats({ timeAlive: 300, damageTaken: 0 }), false).survivalScore).toBe(20000);
  });
  it('被弾が多ければランプ後も0(死亡でも下限0)', () => {
    const r = calculateResultScore(mkStats({ timeAlive: 300, damageTaken: 1000 }), false); // base=20000-80000<0→0
    expect(r.survivalScore).toBe(0);
  });
});

// PACING_PUZZLE.md §5.19 バッチM18②: 「一番効いた項目」= scoreItems の argmax(同点は先勝ち)。
describe('topScoreItem', () => {
  it('returns the item with the highest value', () => {
    const items = [
      { label: 'a', value: 10 },
      { label: 'b', value: 30 },
      { label: 'c', value: 20 },
    ];
    expect(topScoreItem(items)?.label).toBe('b');
  });

  it('ties go to the first item (stable, no silent reorder)', () => {
    const items = [
      { label: 'first', value: 50 },
      { label: 'second', value: 50 },
    ];
    expect(topScoreItem(items)?.label).toBe('first');
  });

  it('returns null for an empty list', () => {
    expect(topScoreItem([])).toBeNull();
  });

  it('handles a single item', () => {
    expect(topScoreItem([{ label: 'only', value: 5 }])?.label).toBe('only');
  });
});

// BOT_AND_GHOST.md §2.7 制約2(G3): 守護霊(ゴースト)が一度でも召喚されたランは totalScore×0.5。
// 対象はハイスコア/順位(totalScore)のみで、換金(goldScore/goldEarned)には掛けない(誇りだけを差し出す)。
describe('守護霊(ゴースト)発動ランのスコア半減(G3)', () => {
  const stats = mkStats({
    timeAlive: 300, damageDealt: 4000, meleeFinishers: 5, maxCombo: 10,
    treasuresCollected: 2, strapsCollected: 100, damageTaken: 100,
  });

  it('totalScoreだけが×0.5される(換金goldScore/goldEarnedは完全不変)', () => {
    const base = calculateResultScore(stats, true);
    const halved = calculateResultScore(stats, true, false, true);
    expect(halved.totalScore).toBe(Math.round(base.totalScore * GHOST_SCORE_MULT));
    expect(halved.totalScore).toBeLessThan(base.totalScore);
    expect(halved.goldScore).toBe(base.goldScore);
    expect(halved.goldEarned).toBe(base.goldEarned);
    // 内訳項目も不変(半減は最終集計の1箇所でのみ掛ける=散在させない)
    expect(halved.damageScore).toBe(base.damageScore);
    expect(halved.clearBonus).toBe(base.clearBonus);
  });

  it('未発動(引数省略/false)は完全不変', () => {
    expect(calculateResultScore(stats, true, false, false)).toEqual(calculateResultScore(stats, true));
  });

  it('倍率は1/2(叩き台・社長調整)', () => {
    expect(GHOST_SCORE_MULT).toBe(0.5);
  });
});
