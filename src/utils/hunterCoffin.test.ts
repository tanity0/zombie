import { describe, it, expect } from 'vitest';
import {
  usesHunterCoffin, coffinPhaseNow, coffinPose, coffinSwingFrame, coffinSwingAlpha,
  coffinSlamFrame, coffinTotalMs, coffinLeadMs,
  COFFIN_SWING_FRAMES, COFFIN_SWING_IMPACT_FRAME, COFFIN_SWING_HOLD_MS,
  COFFIN_SLAM_FRAMES, COFFIN_SLAM_IMPACT_FRAME, COFFIN_SLAM_HOLD_MS,
  COFFIN_RAISE_MS, COFFIN_SLAM_MS, COFFIN_SETTLE_MS, COFFIN_DOWN_DEG, COFFIN_BACK_DEG,
} from './hunterCoffin';

const D2R = Math.PI / 180;
const norm = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

describe('棺桶: 対象と技', () => {
  it('振るのはハンターだけ', () => {
    expect(usesHunterCoffin({ type: 'hunter' })).toBe(true);
    expect(usesHunterCoffin({ type: 'pumpkin' })).toBe(false);
  });

  it('★ジャンプと突進の両方で振る(社長指示2026-09-18)', () => {
    expect(coffinPhaseNow({ aiPhase: 'jump' })).toBe(true);
    expect(coffinPhaseNow({ aiPhase: 'charge' })).toBe(true);
    expect(coffinPhaseNow({ aiPhase: undefined })).toBe(false);
  });
});

describe('棺桶: 振りの姿勢', () => {
  it('★振り上げ切った所で叩きつけが始まる', () => {
    expect(coffinPose(-COFFIN_SLAM_MS, 1)!.angle).toBeCloseTo(COFFIN_BACK_DEG * D2R, 4);
  });

  it('★決まる瞬間に叩きつけ切っている', () => {
    expect(coffinPose(0, 1)!.angle).toBeCloseTo(COFFIN_DOWN_DEG * D2R, 4);
  });

  it('★振り下ろし切った所は「下」である(振り上がらない)', () => {
    expect(Math.sin(norm(coffinPose(0, 1)!.angle))).toBeGreaterThan(0);
    expect(Math.sin(norm(coffinPose(0, -1)!.angle))).toBeGreaterThan(0);
  });

  it('★上下は画面で固定・左右だけ鏡(右向きは前が右 / 左向きは前が左)', () => {
    expect(Math.cos(norm(coffinPose(0, 1)!.angle))).toBeGreaterThan(0);
    expect(Math.cos(norm(coffinPose(0, -1)!.angle))).toBeLessThan(0);
  });

  it('★重い得物: 振り上げは長く、振り下ろしは短い', () => {
    expect(COFFIN_RAISE_MS).toBeGreaterThan(COFFIN_SLAM_MS * 2);
  });

  it('★振り下ろしは落ちるほど速い(等速でない)', () => {
    const a = (t: number) => coffinPose(-COFFIN_SLAM_MS * (1 - t), 1)!.angle;
    expect(Math.abs(a(1) - a(0.5))).toBeGreaterThan(Math.abs(a(0.5) - a(0)) * 1.5);
  });

  it('★叩きつけた後は減衰する揺れ(符号が2回以上変わる)', () => {
    const d0 = coffinPose(0, 1)!.angle;
    const sgn: number[] = [];
    for (let t = 1; t < COFFIN_SETTLE_MS; t += 4) sgn.push(Math.sign(coffinPose(t, 1)!.angle - d0));
    let flips = 0;
    for (let i = 1; i < sgn.length; i++) if (sgn[i] !== 0 && sgn[i] !== sgn[i - 1]) flips++;
    expect(flips).toBeGreaterThanOrEqual(2);
  });

  it('★前後の範囲の外では出さない', () => {
    expect(coffinPose(-(COFFIN_RAISE_MS + COFFIN_SLAM_MS) - 1, 1)).toBeNull();
    expect(coffinPose(COFFIN_SETTLE_MS + 1, 1)).toBeNull();
  });
});

describe('棺桶: 斬撃10コマ + 地面5コマ', () => {
  it('★シートの読み: 斬撃は1・2行目の通しで10コマ、地面は3行目で5コマ', () => {
    expect(COFFIN_SWING_FRAMES).toBe(10);
    expect(COFFIN_SLAM_FRAMES).toBe(5);
    expect(COFFIN_SWING_HOLD_MS).toHaveLength(10);
    expect(COFFIN_SLAM_HOLD_MS).toHaveLength(5);
  });

  it('★決まる瞬間に、斬撃は最後のコマ・地面は先頭のコマ', () => {
    expect(coffinSwingFrame(0)).toBe(COFFIN_SWING_IMPACT_FRAME);
    expect(coffinSlamFrame(0)).toBe(COFFIN_SLAM_IMPACT_FRAME);
    expect(coffinSlamFrame(-1)).toBeNull();   // 決まる前に地面は割れない
  });

  it('★斬撃は決まる前に流れる(最後の1枚が一番長い)', () => {
    const last = COFFIN_SWING_HOLD_MS[COFFIN_SWING_IMPACT_FRAME];
    for (let i = 0; i < COFFIN_SWING_IMPACT_FRAME; i++) expect(last).toBeGreaterThan(COFFIN_SWING_HOLD_MS[i]);
    // 斬撃の先頭コマが出るのは「斬撃ぶんの先行」から(武器の振り上げはそれより早く始まる=
    // `coffinLeadMs` は両方を覆う長い方)。
    const swingLead = COFFIN_SWING_HOLD_MS.slice(0, COFFIN_SWING_IMPACT_FRAME).reduce((a, b) => a + b, 0);
    expect(coffinSwingFrame(-swingLead)).toBe(0);
    expect(coffinSwingFrame(-swingLead - 1)).toBeNull();
    expect(coffinLeadMs()).toBeGreaterThanOrEqual(swingLead);
  });

  it('★地面は散るほど遅い(等間隔にしない)', () => {
    expect(COFFIN_SLAM_HOLD_MS[4]).toBeGreaterThan(COFFIN_SLAM_HOLD_MS[1]);
  });

  it('★どちらもコマは戻らず最後まで流し切る', () => {
    for (const [fn, n] of [[coffinSwingFrame, COFFIN_SWING_FRAMES], [coffinSlamFrame, COFFIN_SLAM_FRAMES]] as const) {
      let prev = -1;
      for (let t = -400; t < coffinTotalMs(); t += 2) {
        const f = fn(t); if (f === null) continue;
        expect(f).toBeGreaterThanOrEqual(prev); prev = f;
      }
      expect(prev).toBe(n - 1);
    }
  });

  it('★斬撃はパッと消えない', () => {
    expect(coffinSwingAlpha(0)).toBe(1);
    expect(coffinSwingAlpha(89)).toBeGreaterThan(0);
    expect(coffinSwingAlpha(90)).toBe(0);
  });

  it('ラッチの寿命は一番長い絵を覆う', () => {
    expect(coffinTotalMs()).toBeGreaterThanOrEqual(COFFIN_SETTLE_MS);
    expect(coffinTotalMs()).toBeGreaterThanOrEqual(COFFIN_SLAM_HOLD_MS.reduce((a, b) => a + b, 0));
  });
});
