import { describe, it, expect } from 'vitest';
import {
  usesZombieBiteFx, zombieBiteCounterable, zombieBiteTotalMs, zombieBiteFrame,
  zombieBiteFrameWithWindup, zombieBiteAlpha, zombieBiteTexName, zombieBiteIn, zombieBiteInMs, ZOMBIE_BITE_IN_SCALE0, zombieBiteClose, zombieBitePulse, ZOMBIE_BITE_CLOSE_SCALE_Y, ZOMBIE_BITE_WINDUP_SCALE, ZOMBIE_BITE_WINDUP_ALPHA,
  ZOMBIE_BITE_FRAMES, ZOMBIE_BITE_IMPACT_FRAME, ZOMBIE_BITE_HOLD_MS, ZOMBIE_BITE_W_PX,
} from './zombieBiteFx';

describe('ゾンビの噛みつきVFX: 対象と色', () => {
  it('★ゾンビとラボゾンビ1・2が出す(社長指示2026-09-18「ラボゾンビは今回の噛みつきで」)', () => {
    expect(usesZombieBiteFx({ type: 'zombie' })).toBe(true);
    expect(usesZombieBiteFx({ type: 'lab-zombie-1' })).toBe(true);
    expect(usesZombieBiteFx({ type: 'lab-zombie-2' })).toBe(true);
  });

  it('★lab-zombie-3 は外す(社長指示「3はジャンプなのでいらない。パンプキンと同等」)', () => {
    expect(usesZombieBiteFx({ type: 'lab-zombie-3' })).toBe(false);
    expect(usesZombieBiteFx({ type: 'pumpkin' })).toBe(false);
  });

  it('他の系統には付けない', () => {
    expect(usesZombieBiteFx({ type: 'bat' })).toBe(false);
    expect(usesZombieBiteFx({ type: 'skeleton' })).toBe(false);
    expect(usesZombieBiteFx({ type: 'lich' })).toBe(false);
  });

  it('★色はカウンター可否で決まる(2連噛み=赤 / 既定の噛みつき=紫)', () => {
    expect(zombieBiteCounterable({ type: 'zombie', chaffMove: 'zombie-double' } as never)).toBe(true);
    expect(zombieBiteCounterable({ type: 'zombie' } as never)).toBe(false);
  });

  it('★赤と紫で別のテクスチャを引く', () => {
    expect(zombieBiteTexName(2, true)).toBe('fx/zombie-bite-2');
    expect(zombieBiteTexName(2, false)).toBe('fx/zombie-bite-p-2');
  });
});

describe('ゾンビの噛みつきVFX: コマ送り', () => {
  it('★当たる瞬間に飛沫のコマへ切り替わる(0始まりで2)', () => {
    expect(ZOMBIE_BITE_IMPACT_FRAME).toBe(2);
    expect(zombieBiteFrame(0)).toBe(2);
    expect(zombieBiteFrame(-1)).toBe(1);   // 直前は輪が閉じているコマ
  });

  it('★当たる前に出ている時間は短い(判定の点に赤を長居させない)', () => {
    const lead = ZOMBIE_BITE_HOLD_MS.slice(0, ZOMBIE_BITE_IMPACT_FRAME).reduce((a, b) => a + b, 0);
    expect(lead).toBeLessThanOrEqual(90);
    expect(zombieBiteFrame(-lead)).toBe(0);
    expect(zombieBiteFrame(-lead - 1)).toBeNull();
  });

  it('★等間隔にしない。広がり切った最後のコマが一番長い', () => {
    const last = ZOMBIE_BITE_HOLD_MS[ZOMBIE_BITE_FRAMES - 1];
    for (let i = 0; i < ZOMBIE_BITE_FRAMES - 1; i++) expect(last).toBeGreaterThan(ZOMBIE_BITE_HOLD_MS[i]);
  });

  it('★コマは戻らず最後まで流し切る', () => {
    let prev = -1;
    for (let t = -80; t < zombieBiteTotalMs(); t += 2) {
      const f = zombieBiteFrame(t);
      if (f === null) continue;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBe(ZOMBIE_BITE_FRAMES - 1);
  });

  it('★パッと消さない(引きが緩い)', () => {
    expect(zombieBiteAlpha(0)).toBe(1);
    const a1 = zombieBiteAlpha(150), a2 = zombieBiteAlpha(200), a3 = zombieBiteAlpha(239);
    expect(a1).toBeGreaterThan(a2);
    expect(a2).toBeGreaterThan(a3);
    expect(a3).toBeGreaterThan(0);
    expect(zombieBiteAlpha(zombieBiteTotalMs())).toBe(0);
  });

  it('★判定(接触35px)より大きく出す=②派手さの絵', () => {
    expect(ZOMBIE_BITE_W_PX).toBeGreaterThan(35 * 3);
  });
});

// ★PACING_PUZZLE.md §16-E(社長指示2026-09-19「武器を構えて一瞬止まる、を雑魚モーションには
// 差し込んでみよう。牙なら牙の1コマ目で」)。ゾンビのwindupMsは§16-Dで600ms(§12既定)。
describe('ゾンビの噛みつきVFX: 構え(溜めのあいだ0コマ目で静止)', () => {
  const WINDUP_MS = 600; // §16-D後のゾンビの§12噛みつきwindupMs

  it('E-5受け入れ条件1: 溜めが始まった同じフレームに0コマ目が出る', () => {
    expect(zombieBiteFrameWithWindup(0, WINDUP_MS, -9999)).toBe(0);
  });

  it('E-5受け入れ条件2: 溜めのあいだ(< windupMs)は0コマ目のまま静止する', () => {
    expect(zombieBiteFrameWithWindup(1, WINDUP_MS, -9999)).toBe(0);
    expect(zombieBiteFrameWithWindup(300, WINDUP_MS, -9999)).toBe(0);
    expect(zombieBiteFrameWithWindup(WINDUP_MS - 1, WINDUP_MS, -9999)).toBe(0);
  });

  it('E-5受け入れ条件3: 溜め明け(>= windupMs)からは、コマが出ている所では`zombieBiteFrame`と1ミリも変わらない', () => {
    for (let sinceImpactMs = -100; sinceImpactMs <= 300; sinceImpactMs += 4) {
      const sinceWindupMs = WINDUP_MS + 9999; // 十分に溜め明け
      const f = zombieBiteFrame(sinceImpactMs);
      if (f !== null) expect(zombieBiteFrameWithWindup(sinceWindupMs, WINDUP_MS, sinceImpactMs)).toBe(f);
    }
  });

  it('★溜めの頭から当たる瞬間まで、絵が一度も途切れない(社長指摘2026-10-25「予告と絵が噛み合ってない」)', () => {
    // 既定の噛みつき(溜め800+噛み200)/ 2連の1発目(220+160)/ 2発目(300+200)
    for (const [w, b] of [[800, 200], [220, 160], [300, 200]] as const) {
      for (let t = 0; t <= w + b + 200; t += 2) {
        const sinceImpact = t - (w + b);
        if (sinceImpact >= zombieBiteTotalMs()) break;
        expect(zombieBiteFrameWithWindup(t, w, sinceImpact, b)).not.toBeNull();
      }
      expect(zombieBiteFrameWithWindup(w + b, w, 0, b)).toBe(ZOMBIE_BITE_IMPACT_FRAME); // 当たる瞬間に飛沫のコマ
    }
  });

  it('★赤い線が消えていく区間(噛み)で輪が締まる: 溜めの間は0コマ目・噛みの後ろ半分で1コマ目・コマは戻らない', () => {
    for (const [w, b] of [[800, 200], [220, 160], [300, 200]] as const) {
      expect(zombieBiteFrameWithWindup(w - 1, w, -b - 1, b)).toBe(0);
      expect(zombieBiteFrameWithWindup(w + b - 1, w, -1, b)).toBe(1);
      let prev = 0;
      for (let t = 0; t < w + b; t += 2) { const f = zombieBiteFrameWithWindup(t, w, t - (w + b), b) as number; expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
    }
  });

  it('まだ発火していない(sinceWindupMs<0)は出さない', () => {
    expect(zombieBiteFrameWithWindup(-1, 600, -9999)).toBeNull();
  });
});

describe('ゾンビの噛みつきVFX: 輪の締まり(社長指摘2026-10-25「予告と絵が噛み合ってない」)', () => {
  const W = 800, B = 200;
  it('溜めの間もじわじわ締まる(中盤から見える)・濃さは控えめ', () => {
    const a = zombieBiteClose(0, W, -(W + B), B), m = zombieBiteClose(W / 2, W, -(W / 2 + B), B), b = zombieBiteClose(W - 1, W, -B - 1, B);
    expect(a.sy).toBeCloseTo(1);
    expect(1 - m.sy).toBeGreaterThan(0.04); // 中盤で既に見える締まり
    expect(b.sy).toBeCloseTo(ZOMBIE_BITE_WINDUP_SCALE, 2);
    expect(a.alpha).toBe(ZOMBIE_BITE_WINDUP_ALPHA);
  });
  it('噛み(線が消えていく区間)で加速しながら、顎の隙間(縦)を強く締め、濃くなる', () => {
    const c = (t: number) => zombieBiteClose(W + B + t, W, t, B);
    const a = c(-150), m = c(-100), d = c(-1);
    expect(a.sy).toBeGreaterThan(m.sy);
    expect(m.sy).toBeGreaterThan(d.sy);
    expect(a.sy - m.sy).toBeLessThan(m.sy - d.sy); // 後半ほど速く締まる
    expect(d.sy).toBeCloseTo(ZOMBIE_BITE_CLOSE_SCALE_Y, 1);
    expect(d.sx).toBeGreaterThan(d.sy); // 縦(顎)の方が強く閉じる
    expect(d.alpha).toBeGreaterThan(a.alpha);
  });
  it('2連の2発目は濃く・大きく・深く締まる', () => {
    const one = zombieBiteClose(W + B - 1, W, -1, B), two = zombieBiteClose(W + B - 1, W, -1, B, true);
    expect(two.sy).toBeLessThan(one.sy * 1.1);
    expect(zombieBiteClose(10, W, -(W + B - 10), B, true).alpha).toBeGreaterThan(zombieBiteClose(10, W, -(W + B - 10), B).alpha);
  });
  it('★当たる瞬間(飛沫)からは大きさも濃さも元どおり=判定の四角は変わらない', () => {
    for (const sec of [false, true]) {
      expect(zombieBiteClose(W + B, W, 0, B, sec)).toEqual({ sx: 1, sy: 1, alpha: 1 });
      expect(zombieBiteClose(W + B + 100, W, 100, B, sec)).toEqual({ sx: 1, sy: 1, alpha: 1 });
    }
  });
  it('体の点滅の脈: 速く立ち上がり、ゆっくり戻って消える', () => {
    expect(zombieBitePulse(null)).toEqual({ scale: 0, alpha: 0 });
    const up = zombieBitePulse(35), mid = zombieBitePulse(100), end = zombieBitePulse(175);
    expect(up.scale).toBeGreaterThan(mid.scale);
    expect(mid.scale).toBeGreaterThan(0);
    expect(end.scale).toBe(0);
    expect(zombieBitePulse(10).scale).toBeGreaterThan(zombieBitePulse(0).scale);
  });
});

describe('ゾンビの噛みつきVFX: 出だし(社長指示2026-10-25「浮いて止まってる様に見える…イン効果入れて」)', () => {
  it('溜めの頭は小さく薄くゾンビ側に寄っていて、膨らんで行き過ぎ→元の大きさ・元の位置で収まる', () => {
    const a = zombieBiteIn(0, 800);
    expect(a.scale).toBeCloseTo(ZOMBIE_BITE_IN_SCALE0);
    expect(a.alpha).toBe(0);
    expect(a.backPx).toBeGreaterThan(0);
    const dur = zombieBiteInMs(800);
    let peak = 0;
    for (let t = 0; t <= dur; t += 2) peak = Math.max(peak, zombieBiteIn(t, 800).scale);
    expect(peak).toBeGreaterThan(1.08); // 見える行き過ぎ(慣性)
    expect(zombieBiteIn(dur, 800)).toEqual({ scale: 1, alpha: 1, backPx: 0 });
  });
  it('尺は溜めに比例(上下限あり)', () => {
    expect(zombieBiteInMs(800)).toBeGreaterThan(zombieBiteInMs(300));
    expect(zombieBiteInMs(220)).toBeGreaterThanOrEqual(110);
    expect(zombieBiteInMs(5000)).toBeLessThanOrEqual(280);
  });
  it('2連の2発目は大きめ・短く入る', () => {
    expect(zombieBiteIn(0, 300, true).scale).toBeGreaterThan(zombieBiteIn(0, 300).scale);
    expect(zombieBiteInMs(300, true)).toBeLessThan(zombieBiteInMs(300));
  });
  it('濃さは戻らない(出たら消えかけない)', () => {
    let prev = -1;
    for (let t = 0; t <= 300; t += 2) { const a = zombieBiteIn(t, 800).alpha; expect(a).toBeGreaterThanOrEqual(prev); prev = a; }
  });
  it('溜めが短い技でも溜めの中で終わる=当たる瞬間の絵(判定の四角)は元の大きさ・元の位置', () => {
    for (const w of [220, 300, 800]) for (const sec of [false, true]) expect(zombieBiteIn(w, w, sec)).toEqual({ scale: 1, alpha: 1, backPx: 0 });
  });
});
