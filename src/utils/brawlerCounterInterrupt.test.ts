// ★格闘の技をカウンターされた側の中断(社長指示2026-11-26「格闘技はカウンターされるとノックバックで。」)の純関数。
import { describe, it, expect } from 'vitest';
import {
  initialBrawlerState, brawlerStartAttack, brawlerStartTech, brawlerSecretStart, brawlerPoseAt, brawlerElapsed,
  brawlerCounterInterrupt, brawlerCounterFallPx, BRAWLER_COUNTER_FALL_MS, BRAWLER_KICK_MAX,
} from './brawler';

describe('brawlerCounterInterrupt(カウンターされた側の中断)', () => {
  it('連撃の途中: 待機へ・先行入力とつながりを捨てる(次は1段目から)', () => {
    const s0 = { ...brawlerStartAttack(initialBrawlerState(), 3, 1000, false), buffered: true, nextStage: 4, chainUntil: 5000, techBuffer: 'kick' as const };
    const s = brawlerCounterInterrupt(s0, 1100);
    expect(s.phase).toBe('idle');
    expect(s.tech).toBeNull();
    expect(s.buffered).toBe(false);
    expect(s.techBuffer).toBeUndefined();
    expect(s.nextStage).toBe(1);
    expect(s.chainUntil).toBe(0);
    expect(s.kickChainUntil).toBe(0);
  });
  it('秘奥義の途中: 秘奥義ごと打ち切り(技ポイント0)', () => {
    const s0 = brawlerSecretStart({ ...initialBrawlerState(), points: 20 }, 1000, 1000);
    expect(s0.secret).toBeDefined();
    const s = brawlerCounterInterrupt(s0, 1200);
    expect(s.secret).toBeUndefined();
    expect(s.points).toBe(0);
    expect(s.phase).toBe('idle');
  });
  it('地上(体の高さ0)で返された時は落下を持たない', () => {
    const s = brawlerCounterInterrupt(brawlerStartAttack(initialBrawlerState(), 1, 1000, false), 1050);
    expect(s.counterFall).toBeUndefined();
    expect(brawlerPoseAt(s, 1060)).toBeNull(); // 待機の立ち絵のまま
  });
  it('空中(踵落とし)で返された時: その高さから加速して落ちる(瞬間に地面へ戻らない・落ち切ったら立ち絵)', () => {
    const t0 = 1000;
    const heel = brawlerStartTech({ ...initialBrawlerState(), points: 20 }, 'kick', t0, BRAWLER_KICK_MAX, false, true);
    // 体が空中に居る時刻を探す。
    let t = t0; let h = 0;
    for (let k = 1; k < 2000 && h < 10; k++) { t = t0 + k; h = brawlerPoseAt(heel, t)?.jump ?? 0; }
    expect(h).toBeGreaterThan(10);
    expect(brawlerElapsed(heel, t)).toBeGreaterThan(0);
    const s = brawlerCounterInterrupt(heel, t);
    expect(s.phase).toBe('idle');
    expect(s.counterFall?.fromPx).toBeCloseTo(h, 5);
    // 断ち切った瞬間は同じ高さ(跳ばない)。
    expect(brawlerPoseAt(s, t)?.jump).toBeCloseTo(h, 5);
    // 落ち方は加速(前半の落ち幅 < 後半の落ち幅)。
    const q = BRAWLER_COUNTER_FALL_MS / 2;
    const mid = brawlerPoseAt(s, t + q)?.jump ?? 0;
    const firstHalf = h - mid;
    const secondHalf = mid - (brawlerPoseAt(s, t + BRAWLER_COUNTER_FALL_MS - 1)?.jump ?? 0);
    expect(firstHalf).toBeGreaterThan(0);
    expect(secondHalf).toBeGreaterThan(firstHalf);
    // 落ちる間は落下の絵(しゃがみ)・落ち切ったら待機の立ち絵へ。
    expect(brawlerPoseAt(s, t + q)?.tex).toBe('ready');
    expect(brawlerPoseAt(s, t + BRAWLER_COUNTER_FALL_MS)).toBeNull();
  });
  it('落下の残り: 1−k² の形・範囲の外は0', () => {
    const f = { fromPx: 40, at: 100 };
    expect(brawlerCounterFallPx(undefined, 100)).toBe(0);
    expect(brawlerCounterFallPx(f, 100)).toBe(40);
    expect(brawlerCounterFallPx(f, 100 + BRAWLER_COUNTER_FALL_MS / 2)).toBeCloseTo(30, 5);
    expect(brawlerCounterFallPx(f, 100 + BRAWLER_COUNTER_FALL_MS)).toBe(0);
  });
});
