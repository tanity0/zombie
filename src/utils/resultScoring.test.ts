import { describe, it, expect } from 'vitest';
import { topScoreItem, calculateResultScore } from './resultScoring';
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

// ★v0.25.2768(社長裁定): 守護霊ランのスコア半減は**廃止**。
// 「スコアは換金されないのだから、自然に減る以外いじらない。0.5もしない。」
// + 「AI有無のスコアは分けない」= ハイスコアは1本・霊の有無で計算を変えない。
// ⇒ `calculateResultScore` に守護霊の引数は無い。**この不変条件をここで固定する。**
describe('守護霊(ゴースト)ランのスコアは素通し(v0.25.2768で半減を廃止)', () => {
  const stats = mkStats({
    timeAlive: 300, damageDealt: 4000, meleeFinishers: 5, maxCombo: 10,
    treasuresCollected: 2, strapsCollected: 100, damageTaken: 100,
  });

  it('スコアを左右する引数は stats / won / isLab の3つだけ(守護霊の口が生えていない)', () => {
    expect(calculateResultScore.length).toBe(2); // 既定値つき isLab は length に数えられない
    // 旧実装は第4引数 ghostSummoned=true で totalScore が半分になっていた。余分な引数を渡しても
    // 結果が変わらない=倍率の口が塞がっていることを固定する。
    const base = calculateResultScore(stats, true);
    const extra = (calculateResultScore as unknown as
      (s: typeof stats, w: boolean, l?: boolean, g?: boolean) => typeof base)(stats, true, false, true);
    expect(extra).toEqual(base);
  });

  it('内訳の合計がそのまま totalScore になる(どこにも倍率が掛かっていない)', () => {
    const r = calculateResultScore(stats, true);
    expect(r.totalScore).toBe(
      r.clearBonus + r.treasureScore + r.damageScore + r.finisherScore +
      r.comboScore + r.eliteBossScore + r.scrapScore + r.survivalScore + r.speedBonus);
  });
});
