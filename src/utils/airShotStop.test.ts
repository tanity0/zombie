// ★空中の弾の止め(utils/airShotStop・社長指示2026-11-12)の純関数。
import { describe, it, expect } from 'vitest';
import {
  airShotStopMs, airShotStopPatch, airShotStopTick, airShotStopped,
  AIR_SHOT_STOP_BASE_MS, AIR_SHOT_STOP_REF_SPEED, AIR_SHOT_STOP_MIN_MS, AIR_SHOT_STOP_MAX_MS, type AirShotStopFields,
} from './airShotStop';

const NOW = 1_000_000;
const air = { brawlerLiftAt: NOW - 100, brLiftMs: 600, brLiftUntil: NOW + 500, liftUntil: NOW + 500 };

describe('止める長さ(弾速に反比例・速いほど短い)', () => {
  it('clamp(50×520/弾速, 20, 90)', () => {
    expect([AIR_SHOT_STOP_BASE_MS, AIR_SHOT_STOP_REF_SPEED, AIR_SHOT_STOP_MIN_MS, AIR_SHOT_STOP_MAX_MS]).toEqual([50, 520, 20, 90]);
    expect(airShotStopMs(520)).toBe(50);   // ハンドガン
    expect(airShotStopMs(440)).toBe(59);   // ショットガン
    expect(airShotStopMs(1000)).toBe(26);  // スナイパー
    expect(airShotStopMs(1400)).toBe(20);  // レールガン(19→下限)
    expect(airShotStopMs(200)).toBe(90);   // 上限
    expect(airShotStopMs(0)).toBe(0);
    expect(airShotStopMs(1100)).toBeLessThan(airShotStopMs(700));
  });
});

describe('止めの掛け方', () => {
  it('浮いている敵だけ・地上は止めない', () => {
    expect(airShotStopPatch({}, 520, NOW, 1, 0)).toBeNull();
    const p = airShotStopPatch({ ...air }, 520, NOW, 3, 4)!;
    expect(p.airShotStopAt).toBe(NOW);
    expect(p.airShotStopUntil).toBe(NOW + 50);
    expect(p.brawlerShakeUntil).toBe(NOW + 50);
    expect([p.brawlerShakeDx, p.brawlerShakeDy]).toEqual([0.6, 0.8]); // 当たった方向
  });
  it('重ならない(止めの最中は延ばさない)・明けてから止めの2倍の間を空ける', () => {
    const e = { ...air, ...airShotStopPatch({ ...air }, 520, NOW, 1, 0)! };
    expect(airShotStopped(e, NOW + 49)).toBe(true);
    expect(airShotStopPatch(e, 520, NOW + 30, 1, 0)).toBeNull();   // 最中
    expect(airShotStopPatch(e, 520, NOW + 149, 1, 0)).toBeNull();   // 間の中(止め50ms+間100ms)
    expect(airShotStopPatch(e, 520, NOW + 150, 1, 0)).not.toBeNull(); // 間が明けた
  });
  it('毎フレーム: 止めの間の経過ぶんだけ浮き・押しの時計を後ろへずらす(合計は止めの長さちょうど・弧の形は変えない)', () => {
    let e: AirShotStopFields = { ...air, knockbackUntil: NOW + 200, brBlastNoLiftUntil: NOW + 1200, ...airShotStopPatch({ ...air }, 520, NOW, 1, 0)! };
    for (const t of [NOW + 16, NOW + 32, NOW + 48, NOW + 64, NOW + 80]) { const d = airShotStopTick(e, t); if (d) e = { ...e, ...d }; }
    expect(e.brawlerLiftAt).toBe(air.brawlerLiftAt + 50);
    expect(e.brLiftUntil).toBe(air.brLiftUntil + 50);
    expect(e.liftUntil).toBe(air.liftUntil + 50);
    expect(e.knockbackUntil).toBe(NOW + 250);
    expect(e.brBlastNoLiftUntil).toBe(NOW + 1250);
    expect(e.brLiftMs).toBe(600);
    expect(airShotStopTick(e, NOW + 200)).toBeNull();
  });
});
