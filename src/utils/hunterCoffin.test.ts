import { describe, it, expect } from 'vitest';
import {
  usesHunterCoffin, coffinPhaseNow, coffinPose, coffinSwingFrame, coffinSwingAlpha,
  coffinSlamFrame, coffinTotalMs, coffinLeadMs,
  COFFIN_SWING_FRAMES, COFFIN_SWING_IMPACT_FRAME, COFFIN_SWING_HOLD_MS,
  COFFIN_SLAM_FRAMES, COFFIN_SLAM_IMPACT_FRAME, COFFIN_SLAM_HOLD_MS,
  COFFIN_RAISE_MS, COFFIN_SLAM_MS, COFFIN_SETTLE_MS, COFFIN_DOWN_DEG, COFFIN_BACK_DEG,
  coffinSpinRevs, coffinSpinPose, coffinSpinTailAt,
  COFFIN_SPIN_UP_MS, COFFIN_SPIN_DOWN_MS, COFFIN_SPIN_TAIL_MS,
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

describe('突進は頭上で振り回す(社長指示2026-09-18「突進は振りをやめて、棺桶を頭上で振り回しながら」)', () => {
  const D = COFFIN_SPIN_DOWN_MS, T = COFFIN_SPIN_TAIL_MS;

  it('★回転は戻らない(累積が単調増加)', () => {
    let prev = -1;
    for (let t = 0; t <= 3000; t += 10) {
      const r = coffinSpinRevs(t, Math.max(0, 3000 - t));
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r;
    }
  });

  it('★回し始めは加速する(等速で始まらない=慣性MUST)', () => {
    const step = (t: number) => coffinSpinRevs(t + 20, 9999) - coffinSpinRevs(t, 9999);
    expect(step(COFFIN_SPIN_UP_MS)).toBeGreaterThan(step(0) * 2);
  });

  it('★終いは減速して止まる(瞬間停止しない)', () => {
    const step = (rm: number) => coffinSpinRevs(2000, rm) - coffinSpinRevs(1980, rm + 20);
    expect(step(D)).toBeGreaterThan(step(10) * 2);
    expect(step(0)).toBeCloseTo(0, 3);
  });

  it('★走りが切れた後も尻すぼみに回ってから消える', () => {
    const a = coffinSpinRevs(2000, 0, 0), b = coffinSpinRevs(2000, 0, T / 2), c = coffinSpinRevs(2000, 0, T);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(coffinSpinPose(2000, 0, T, 1)).toBeNull();     // 尻尾が切れたら消える
  });

  // ★★社長報告2026-09-22「**ハンターがダッシュした後、頭上を周る棺桶が消えない**」(v0.25.4571)。
  // 旧実装は尻尾を**ラッチの窓の終わり**(t0 + dur − TAIL)から数えていた。突進の長さは可変なので
  // 窓は**60秒**の安全枠を取っており、結果**尻尾が始まるのは突進開始から59.7秒後**=
  // **走り終わっても棺桶が約1分回り続けた**。起点は窓ではなく「走りが切れた瞬間」。
  describe('★★走り終わったら消える(尻尾の起点は「切れた瞬間」)', () => {
    it('走っている間は尻尾ゼロ', () => {
      expect(coffinSpinTailAt(10_000, undefined, true)).toBe(0);
      expect(coffinSpinTailAt(10_000, 9_000, true)).toBe(0);   // armed が勝つ(再突進)
    });

    it('★切れた瞬間から数え、T で消える(窓の長さに引きずられない)', () => {
      const off = 5_000;
      expect(coffinSpinTailAt(off, off, false)).toBe(0);
      expect(coffinSpinTailAt(off + T / 2, off, false)).toBe(T / 2);
      expect(coffinSpinTailAt(off + T - 1, off, false)).toBe(T - 1);
      expect(coffinSpinTailAt(off + T, off, false)).toBeNull();        // ここで捨てる
      expect(coffinSpinTailAt(off + 60_000, off, false)).toBeNull();   // ★1分後に残らない
    });

    it('★★突進が終わって T を過ぎたら、絵は1フレームも出ない(実バグの形)', () => {
      const start = 1_000, off = 2_400;   // 1.4秒走って終わった
      for (let now = off + T; now <= off + 60_000; now += 250) {
        const tail = coffinSpinTailAt(now, off, false);
        expect(tail, `now=${now}`).toBeNull();
        // 呼び手はラッチを捨てるので描画にも入らないが、仮に入っても姿は無い
        expect(coffinSpinPose(now - start, 0, T, 1)).toBeNull();
      }
    });

    it('切れた時刻が焼けていなければ出さない(描く根拠が無い)', () => {
      expect(coffinSpinTailAt(10_000, undefined, false)).toBeNull();
    });
  });

  it('★左右で回る向きが鏡になる', () => {
    const r = coffinSpinPose(800, 9999, 0, 1)!.angle;
    const l = coffinSpinPose(800, 9999, 0, -1)!.angle;
    expect(Math.sign(r)).toBe(-Math.sign(l));
  });

  it('★頭上に掲げる(足元より上)', () => {
    expect(coffinSpinPose(800, 9999, 0, 1)!.upFrac).toBeGreaterThan(1);
  });

  it('★パッと出さない(頭のフレームは薄い)', () => {
    expect(coffinSpinPose(0, 9999, 0, 1)!.alpha).toBeLessThan(0.2);
    expect(coffinSpinPose(300, 9999, 0, 1)!.alpha).toBe(1);
  });

  it('★大きく回す(1秒で1回転以上)', () => {
    expect(coffinSpinRevs(1260, 9999)).toBeGreaterThan(1);
  });
});
