// BOT_AND_GHOST.md §2.13/§2.16 B・C: リザルト年表/討伐記録一覧の表示用純関数。
// 「保存された生値 → 今回 vs 現在の記録」の組み立てだけを検証する(描画はテストしない)。
import { describe, it, expect } from 'vitest';
import {
  parseBossSlotKey, trendLowerBetter, trendHigherBetter,
  buildRunTimeline, buildAlbumCards, buildDuoRunTimeline, buildDuoAlbumCards,
  formatClearTime, formatPerMin, formatRatePercent,
} from './ghostAlbum';
import { bossStyleSlotKey, type BossStyleSlot, type PendingBossClearView, type PlayerProfile } from './playerTraits';
import type { DuoAlbum, DuoRunClearView } from './duoRecords';

const slot = (over: Partial<BossStyleSlot> = {}): BossStyleSlot => ({
  reactionMs: 250, counterChance: 0.5, preferredDist: 180, meleeBias: 0.4, mobility: 0.6,
  hitsPerMin: 3, subUsesPerMin: 2, stationaryFrac: 0.35, approachPerMin: 3,
  subStyles: { wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 }, homing: { n: 0, holdMsAvg: 0 } },
  srcClass: 'warrior', snapshot: null, srcName: 'me', at: 1000, clearTimeMs: 60_000,
  ...over,
});

const profileWith = (bossStyles: Record<string, BossStyleSlot>): PlayerProfile => ({
  v: 1, runs: 3, reactionMs: 250, counterChance: 0.5, preferredDist: 180, meleeBias: 0.4,
  mobility: 0.6, hitsPerMin: 3, subUsesPerMin: 2, stationaryFrac: 0.35, approachPerMin: 3,
  moveReactions: {},
  subStyles: { wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 }, homing: { n: 0, holdMsAvg: 0 } },
  bossStyles,
});

const clear = (over: Partial<PendingBossClearView> = {}): PendingBossClearView => ({
  slotKey: 'thor', clearTimeMs: 50_000, hitsPerMin: 2, counterChance: 0.6, perfScore: 10, at: 2000, ally: null,
  ...over,
});

describe('ghostAlbum: slotKeyの分解(bossStyleSlotKeyの逆変換)', () => {
  it('type単体のキーはそのまま(stageIdなし)', () => {
    expect(parseBossSlotKey('thor')).toEqual({ bossType: 'thor', stageId: null });
  });

  it('giantbatのステージ別キーは型とステージへ分解できる(組み立てと往復する)', () => {
    const key = bossStyleSlotKey('giantbat', 'stage-5');
    expect(key).toBe('giantbat@stage-5');
    expect(parseBossSlotKey(key)).toEqual({ bossType: 'giantbat', stageId: 'stage-5' });
  });
});

describe('ghostAlbum: 良化/悪化の向き', () => {
  it('小さい方が良い指標(撃破タイム・被弾/分)', () => {
    expect(trendLowerBetter(10, 20)).toBe('better');
    expect(trendLowerBetter(30, 20)).toBe('worse');
    expect(trendLowerBetter(20, 20)).toBe('same');
    expect(trendLowerBetter(20, null)).toBe('first');
    expect(trendLowerBetter(null, 20)).toBe('first');
  });

  it('大きい方が良い指標(カウンター成功率)', () => {
    expect(trendHigherBetter(0.8, 0.5)).toBe('better');
    expect(trendHigherBetter(0.3, 0.5)).toBe('worse');
    expect(trendHigherBetter(0.5, 0.5)).toBe('same');
    expect(trendHigherBetter(0.5, undefined)).toBe('first');
  });
});

describe('ghostAlbum: リザルト年表の組み立て', () => {
  it('撃破順を保ち、現在の記録(反映前)を比較対象として添える', () => {
    const profile = profileWith({ thor: slot({ hitsPerMin: 5, clearTimeMs: 80_000, counterChance: 0.4 }) });
    const cards = buildRunTimeline([clear({ slotKey: 'thor' }), clear({ slotKey: 'mimir', at: 2001 })], profile);
    expect(cards.map(c => c.slotKey)).toEqual(['thor', 'mimir']); // 撃破順のまま
    expect(cards[0].best).toEqual({ clearTimeMs: 80_000, hitsPerMin: 5, counterChance: 0.4, perfScore: null });
    expect(cards[1].best).toBeNull(); // 記録が無いボス=比較対象なし
  });

  // v0.25.2603(社長式): 判定基準は**評点**(高いほど良い)。commit側と同じ純関数を共有する。
  it('記録更新の判定はベスト保持規則(評点)と一致する', () => {
    const profile = profileWith({ thor: slot({ perfScore: 2.0, clearTimeMs: 60_000 }) });
    // 今回の方が評点が低い=上書きされない
    expect(buildRunTimeline([clear({ perfScore: 1.0 })], profile)[0].isRecordUpdate).toBe(false);
    // 評点が高い=更新
    expect(buildRunTimeline([clear({ perfScore: 2.5 })], profile)[0].isRecordUpdate).toBe(true);
    // 同点は撃破が速い方(clear()の既定は50_000ms=記録の60_000msより速い)
    expect(buildRunTimeline([clear({ perfScore: 2.0 })], profile)[0].isRecordUpdate).toBe(true);
    // 記録が無ければ初記録=更新(評点が出せなくても残す)
    expect(buildRunTimeline([clear({ slotKey: 'skadi', perfScore: null })], profile)[0].isRecordUpdate).toBe(true);
  });

  it('プロファイル未保存(初プレイ)でも比較なしのカードが作れる', () => {
    const cards = buildRunTimeline([clear()], null);
    expect(cards[0].best).toBeNull();
    expect(cards[0].isRecordUpdate).toBe(true);
  });

  it('同行守護霊の写しはそのままカードへ載る(不在ならnull)', () => {
    const ally = { name: 'tanity', build: { maxHealth: 120, speed: 8, level: 9 }, isOwn: true };
    const cards = buildRunTimeline([clear({ ally }), clear({ slotKey: 'skadi' })], null);
    expect(cards[0].ally).toEqual(ally);
    expect(cards[1].ally).toBeNull();
  });
});

describe('ghostAlbum: 討伐記録一覧の組み立て', () => {
  it('保存済みスロットを新しい順に並べ、比較対象は持たない', () => {
    const cards = buildAlbumCards(profileWith({
      thor: slot({ at: 100 }),
      'giantbat@stage-5': slot({ at: 300, clearTimeMs: 42_000 }),
      mimir: slot({ at: 200 }),
    }));
    expect(cards.map(c => c.slotKey)).toEqual(['giantbat@stage-5', 'mimir', 'thor']);
    expect(cards[0].stageId).toBe('stage-5');
    expect(cards[0].clearTimeMs).toBe(42_000);
    expect(cards[0].best).toBeNull();
    expect(cards[0].isRecordUpdate).toBe(false);
  });

  it('記録が無ければ空配列(プロファイル未保存/旧フォーマットでも落ちない)', () => {
    expect(buildAlbumCards(null)).toEqual([]);
    expect(buildAlbumCards(profileWith({}))).toEqual([]);
  });

  it('旧レコード(clearTimeMs欠損)はnull=「—」表示になる', () => {
    const s = slot();
    delete s.clearTimeMs;
    const cards = buildAlbumCards(profileWith({ thor: s }));
    expect(cards[0].clearTimeMs).toBeNull();
    expect(formatClearTime(cards[0].clearTimeMs)).toBe('—');
  });
});

describe('ghostAlbum: 同行枠(§2.17)のカード組み立て', () => {
  const duoClear = (over: Partial<DuoRunClearView> = {}): DuoRunClearView => ({
    slotKey: 'thor', clearTimeMs: 45_000, at: 3000, ally: { name: 'tanity', className: 'warrior', isOwn: true },
    bestBefore: null, isRecordUpdate: true,
    ...over,
  });

  it('リザルト年表: 撃破順のまま・評価数値は常にnull(計測しない)・記録更新は打刻時の確定値を写す', () => {
    const cards = buildDuoRunTimeline([
      duoClear(),
      duoClear({ slotKey: 'giantbat@stage-2', at: 3001, bestBefore: 40_000, isRecordUpdate: false }),
    ]);
    expect(cards.map(c => c.slotKey)).toEqual(['thor', 'giantbat@stage-2']);
    expect(cards[0].hitsPerMin).toBeNull();
    expect(cards[0].counterChance).toBeNull();
    expect(cards[0].best).toBeNull();               // 初記録=比較対象なし
    expect(cards[0].isRecordUpdate).toBe(true);
    expect(cards[0].ally?.name).toBe('tanity');
    expect(cards[1].stageId).toBe('stage-2');       // giantbatはステージ別スロット
    expect(cards[1].best).toEqual({ clearTimeMs: 40_000, hitsPerMin: null, counterChance: null, perfScore: null });
    expect(cards[1].isRecordUpdate).toBe(false);
  });

  it('討伐記録一覧: 新しい順・比較対象なし・ally欠損(不在撃破)はnull', () => {
    const album: DuoAlbum = {
      v: 1,
      slots: {
        thor: { clearTimeMs: 45_000, at: 100 },
        'giantbat@stage-5': { clearTimeMs: 30_000, at: 300, ally: { name: 'tanity' } },
        mimir: { clearTimeMs: 20_000, at: 200, ally: { name: 'tanity' } },
      },
    };
    const cards = buildDuoAlbumCards(album);
    expect(cards.map(c => c.slotKey)).toEqual(['giantbat@stage-5', 'mimir', 'thor']);
    expect(cards[0].clearTimeMs).toBe(30_000);
    expect(cards[0].best).toBeNull();
    expect(cards[0].isRecordUpdate).toBe(false);
    expect(cards[2].ally).toBeNull();
  });

  it('台帳が無ければ空配列', () => {
    expect(buildDuoAlbumCards(null)).toEqual([]);
    expect(buildDuoRunTimeline([])).toEqual([]);
  });
});

describe('ghostAlbum: 表示フォーマット', () => {
  it('撃破タイムは m:ss.d', () => {
    expect(formatClearTime(0)).toBe('0:00.0');
    expect(formatClearTime(65_400)).toBe('1:05.4');
    expect(formatClearTime(null)).toBe('—');
  });

  it('率は百分率・被弾/分は小数1桁(未計測は「—」)', () => {
    expect(formatRatePercent(0.5)).toBe('50%');
    expect(formatRatePercent(null)).toBe('—');
    expect(formatPerMin(2.35)).toBe('2.4');
    expect(formatPerMin(null)).toBe('—');
  });
});
