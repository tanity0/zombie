// ★空中の弾の止め(utils/airShotStop・社長指示2026-11-12)の純関数。
import { describe, it, expect } from 'vitest';
import {
  airShotStopMs, airShotStopPatch, airShotStopTick, airShotStopped, airShotNudgePatch, AIR_SHOT_NUDGE_PX,
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

describe('空中の敵を弾の向きへ微妙に押す(社長指示2026-11-13)', () => {
  const KB = 280, SP = (AIR_SHOT_NUDGE_PX * 2) / (KB / 1000);
  it('叩き台は10px', () => { expect(AIR_SHOT_NUDGE_PX).toBe(10); });
  it('浮いている雑魚・強個体だけ。地上・ボス級・浮かない区分は押さない', () => {
    expect(airShotNudgePatch({}, 'mob', NOW, 1, 0, SP, KB)).toBeNull();
    expect(airShotNudgePatch({ ...air }, 'boss', NOW, 1, 0, SP, KB)).toBeNull();
    expect(airShotNudgePatch({ ...air }, null, NOW, 1, 0, SP, KB)).toBeNull();
    expect(airShotNudgePatch({ ...air }, 'strong', NOW, 1, 0, SP, KB)).not.toBeNull();
    const p = airShotNudgePatch({ ...air }, 'mob', NOW, 3, 4, SP, KB)!;
    expect(p.knockbackVx).toBeCloseTo(0.6 * SP, 9);
    expect(p.knockbackVy).toBeCloseTo(0.8 * SP, 9);
    expect(p.knockbackUntil).toBe(NOW + KB);
  });
  it('止めが明けてから満額で動く: 空中の弾の止め(tick が後ろへずらす分を引く)・被弾の止め(hitStunUntil)', () => {
    let e: AirShotStopFields = { ...air, ...airShotStopPatch({ ...air }, 520, NOW, 1, 0)! };
    e = { ...e, ...airShotNudgePatch(e, 'mob', NOW, 1, 0, SP, KB)! };
    for (const t of [NOW + 16, NOW + 80, NOW + 140, NOW + 200]) { const d = airShotStopTick(e, t); if (d) e = { ...e, ...d }; }
    expect(e.knockbackUntil).toBe(NOW + 140 + KB);
    // 被弾の止めの方が長い時はそちらの明けから
    let g: AirShotStopFields & { hitStunUntil?: number } = { ...air, hitStunUntil: NOW + 300, ...airShotStopPatch({ ...air }, 520, NOW, 1, 0)! };
    g = { ...g, ...airShotNudgePatch(g, 'mob', NOW, 1, 0, SP, KB)! };
    for (const t of [NOW + 50, NOW + 140, NOW + 200]) { const d = airShotStopTick(g, t); if (d) g = { ...g, ...d }; }
    expect(g.knockbackUntil).toBe(NOW + 300 + KB);
  });
  it('走っているもっと強い押しは上書きしない(弱い押し・切れた押しは上書きする)', () => {
    expect(airShotNudgePatch({ ...air, knockbackVx: 600, knockbackVy: 0, knockbackUntil: NOW + 200 }, 'mob', NOW, 1, 0, SP, KB)).toBeNull();
    expect(airShotNudgePatch({ ...air, knockbackVx: 10, knockbackVy: 0, knockbackUntil: NOW + 200 }, 'mob', NOW, 1, 0, SP, KB)).not.toBeNull();
    expect(airShotNudgePatch({ ...air, knockbackVx: 600, knockbackVy: 0, knockbackUntil: NOW - 1 }, 'mob', NOW, 1, 0, SP, KB)).not.toBeNull();
  });
});
