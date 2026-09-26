import { describe, it, expect } from 'vitest';
import {
  usesZombieBiteFx, zombieBiteCounterable, zombieBiteTotalMs, zombieBiteFrame,
  zombieBiteFrameWithWindup, zombieBiteAlpha, zombieBiteTexName,
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

  it('E-5受け入れ条件3: 溜め明け(>= windupMs)からは`zombieBiteFrame`と1ミリも変わらない', () => {
    for (let sinceImpactMs = -100; sinceImpactMs <= 200; sinceImpactMs += 4) {
      const sinceWindupMs = WINDUP_MS + 9999; // 十分に溜め明け
      expect(zombieBiteFrameWithWindup(sinceWindupMs, WINDUP_MS, sinceImpactMs))
        .toBe(zombieBiteFrame(sinceImpactMs));
    }
  });

  it('まだ発火していない(sinceWindupMs<0)は出さない', () => {
    expect(zombieBiteFrameWithWindup(-1, WINDUP_MS, -9999)).toBeNull();
  });
});
