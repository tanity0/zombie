import { describe, it, expect } from 'vitest';
import { nextBeatToSchedule } from './danceBeat';

const base = { firstBeatAtMs: 10000, intervalMs: 500, lastScheduledIndex: -1, windowMs: 150 };

describe('nextBeatToSchedule (ダンスビートB方式)', () => {
  it('窓の外(まだ遠い)なら予約しない', () => {
    const r = nextBeatToSchedule({ ...base, nowMs: 9000 }); // beat0は1秒後=窓150msの外
    expect(r.shouldSchedule).toBe(false);
    expect(r.beatIndex).toBe(0);
    expect(r.beatAtMs).toBe(10000);
  });

  it('窓に入ったら予約する(拍0)', () => {
    const r = nextBeatToSchedule({ ...base, nowMs: 9900 }); // beat0まで100ms=窓150ms以内
    expect(r.shouldSchedule).toBe(true);
    expect(r.beatIndex).toBe(0);
    expect(r.beatAtMs).toBe(10000);
  });

  it('拍がちょうど過ぎていても(遅延)そのまま予約する', () => {
    const r = nextBeatToSchedule({ ...base, nowMs: 10050 });
    expect(r.shouldSchedule).toBe(true);
    expect(r.beatIndex).toBe(0);
  });

  it('二重予約しない: 既に予約済みのindexより必ず先へ進む', () => {
    const r = nextBeatToSchedule({ ...base, nowMs: 10050, lastScheduledIndex: 0 });
    expect(r.beatIndex).toBe(1);
    expect(r.beatAtMs).toBe(10500);
  });

  it('リードイン中(拍0より前)は拍0より前の負indexを予約しない', () => {
    const r = nextBeatToSchedule({ ...base, nowMs: 0 });
    expect(r.beatIndex).toBeGreaterThanOrEqual(0);
    expect(r.shouldSchedule).toBe(false); // 遠すぎるので窓の外
  });

  it('間隔変更時(レベルアップ等)は新しい間隔で再計算される', () => {
    // 拍0(10000)発火直後・同じ現在時刻でも、intervalMsが変われば次の拍位置が変わる。
    const slow = nextBeatToSchedule({ ...base, nowMs: 10100, intervalMs: 500, lastScheduledIndex: 0 });
    const fast = nextBeatToSchedule({ ...base, nowMs: 10100, intervalMs: 300, lastScheduledIndex: 0 });
    expect(slow.beatIndex).toBe(1);
    expect(slow.beatAtMs).toBe(10500); // 500ms間隔: 次拍は10500
    expect(fast.beatIndex).toBe(1);
    expect(fast.beatAtMs).toBe(10300); // 300ms間隔: 次拍は10300(同じ現在時刻でも間隔が違えば拍位置が変わる)
  });

  it('intervalMs<=0は予約しない(安全側)', () => {
    const r = nextBeatToSchedule({ ...base, nowMs: 10000, intervalMs: 0 });
    expect(r.shouldSchedule).toBe(false);
  });
});
