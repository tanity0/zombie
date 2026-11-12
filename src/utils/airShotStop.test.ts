// ★空中の弾の止め(utils/airShotStop・社長指示2026-11-12)の純関数。
import { describe, it, expect } from 'vitest';
import {
  airShotStopMs, airShotStopPatch, airShotStopTick, airShotStopped,
  AIR_SHOT_STOP_BASE_MS, AIR_SHOT_STOP_REF_SPEED, AIR_SHOT_STOP_MIN_MS, AIR_SHOT_STOP_MAX_MS, type AirShotStopFields,
} from './airShotStop';

const NOW = 1_000_000;
const air = { brawlerLiftAt: NOW - 100, brLiftMs: 600, brLiftUntil: NOW + 500, liftUntil: NOW + 500 };

describe('止める長さ(弾速に反比例・速いほど短い)', () => {
  it('clamp(140×520/弾速, 60, 220)', () => {
    expect([AIR_SHOT_STOP_BASE_MS, AIR_SHOT_STOP_REF_SPEED, AIR_SHOT_STOP_MIN_MS, AIR_SHOT_STOP_MAX_MS]).toEqual([140, 520, 60, 220]);
    expect(airShotStopMs(520)).toBe(140);   // ハンドガン
    expect(airShotStopMs(440)).toBe(165);   // ショットガン
    expect(airShotStopMs(1000)).toBe(73);  // スナイパー
    expect(airShotStopMs(1400)).toBe(60);  // レールガン(52→下限)
    expect(airShotStopMs(200)).toBe(220);   // 上限
    expect(airShotStopMs(0)).toBe(0);
    expect(airShotStopMs(1100)).toBeLessThan(airShotStopMs(700));
  });
});

describe('止めの掛け方', () => {
  it('浮いている敵だけ・地上は止めない', () => {
    expect(airShotStopPatch({}, 520, NOW, 1, 0)).toBeNull();
    const p = airShotStopPatch({ ...air }, 520, NOW, 3, 4)!;
    expect(p.airShotStopAt).toBe(NOW);
    expect(p.airShotStopUntil).toBe(NOW + 140);
    expect(p.brawlerShakeUntil).toBe(NOW + 140);
    expect([p.brawlerShakeDx, p.brawlerShakeDy]).toEqual([0.6, 0.8]); // 当たった方向
  });
  it('重ならない(止めの最中は延ばさない)・明けてから止めの2倍の間を空ける', () => {
    const e = { ...air, ...airShotStopPatch({ ...air }, 520, NOW, 1, 0)! };
    expect(airShotStopped(e, NOW + 139)).toBe(true);
    expect(airShotStopPatch(e, 520, NOW + 30, 1, 0)).toBeNull();   // 最中
    expect(airShotStopPatch(e, 520, NOW + 419, 1, 0)).toBeNull();   // 間の中(止め140ms+間280ms)
    expect(airShotStopPatch(e, 520, NOW + 420, 1, 0)).not.toBeNull(); // 間が明けた
  });
  it('毎フレーム: 止めの間の経過ぶんだけ浮き・押しの時計を後ろへずらす(合計は止めの長さちょうど・弧の形は変えない)', () => {
    let e: AirShotStopFields = { ...air, knockbackUntil: NOW + 200, brBlastNoLiftUntil: NOW + 1200, ...airShotStopPatch({ ...air }, 520, NOW, 1, 0)! };
    for (const t of [NOW + 16, NOW + 48, NOW + 96, NOW + 139, NOW + 140, NOW + 180]) { const d = airShotStopTick(e, t); if (d) e = { ...e, ...d }; }
    expect(e.brawlerLiftAt).toBe(air.brawlerLiftAt + 140);
    expect(e.brLiftUntil).toBe(air.brLiftUntil + 140);
    expect(e.liftUntil).toBe(air.liftUntil + 140);
    expect(e.knockbackUntil).toBe(NOW + 340);
    expect(e.brBlastNoLiftUntil).toBe(NOW + 1340);
    expect(e.brLiftMs).toBe(600);
    expect(airShotStopTick(e, NOW + 300)).toBeNull();
  });
});
