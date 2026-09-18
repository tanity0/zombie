import { describe, it, expect } from 'vitest';
import {
  acrasielPhaseForHealth, acrasielSpikeGapCount, pickSpikeGapMask, isSpikeGapSector,
  pickAcrasielMove, pickAcrasielCombo, ACRASIEL_SECTOR_COUNT, planAcrasielPattern,
  acrasielCounterAccepted, acrasielGazeAngles, acrasielGazeBeamCount, ACRASIEL_GAZE_SPREAD_RAD,
  acrasielBurstShardAngles, ACRASIEL_BURST_SHARD_COUNT, acrasielSpikeWaveCount, acrasielNextWaveGapMask,
  acrasielWarpRed, acrasielBurstRed,
} from './acrasielScript';

describe('acrasielPhaseForHealth (§6.28-19: 60%/30%の3段)', () => {
  it('phase transitions at the documented thresholds', () => {
    expect(acrasielPhaseForHealth(1)).toBe(1);
    expect(acrasielPhaseForHealth(0.6)).toBe(2);
    expect(acrasielPhaseForHealth(0.3)).toBe(3);
    expect(acrasielPhaseForHealth(0)).toBe(3);
  });
});

describe('acrasielSpikeGapCount', () => {
  it('2 gaps in phase1, 1 gap from phase2 onward', () => {
    expect(acrasielSpikeGapCount(1)).toBe(2);
    expect(acrasielSpikeGapCount(2)).toBe(1);
    expect(acrasielSpikeGapCount(3)).toBe(1);
  });
});

describe('pickSpikeGapMask / isSpikeGapSector', () => {
  it('selects the requested number of distinct sectors', () => {
    const mask = pickSpikeGapMask(2, () => 0);
    let count = 0;
    for (let i = 0; i < ACRASIEL_SECTOR_COUNT; i++) if (isSpikeGapSector(mask, i)) count++;
    expect(count).toBe(2);
  });
  it('is deterministic given an injected rand', () => {
    const a = pickSpikeGapMask(1, () => 0);
    const b = pickSpikeGapMask(1, () => 0);
    expect(a).toBe(b);
  });
  it('clamps gapCount to the sector count', () => {
    const mask = pickSpikeGapMask(99, () => 0);
    let count = 0;
    for (let i = 0; i < ACRASIEL_SECTOR_COUNT; i++) if (isSpikeGapSector(mask, i)) count++;
    expect(count).toBe(ACRASIEL_SECTOR_COUNT);
  });
});

describe('pickAcrasielMove', () => {
  it('距離帯の重みから5技を選び、密着ではburst、遠距離ではspearを生かす', () => {
    expect(pickAcrasielMove(60, 1, () => 0)).toBe('spike');
    expect(pickAcrasielMove(60, 1, () => 0.99)).toBe('gaze');
    const nearPicks = Array.from({ length: 100 }, (_, i) => pickAcrasielMove(60, 1, () => i / 100));
    const farPicks = Array.from({ length: 100 }, (_, i) => pickAcrasielMove(900, 1, () => i / 100));
    expect(nearPicks).toContain('burst');
    expect(farPicks).toContain('spear');
  });
});

describe('pickAcrasielCombo (§6.28-19 Phase3: spike→spear同時)', () => {
  it('only fires in phase 3', () => {
    expect(pickAcrasielCombo('spike', 1, () => 0)).toBeNull();
    expect(pickAcrasielCombo('spike', 2, () => 0)).toBeNull();
  });
  it('fires deterministically (100%) in phase 3', () => {
    expect(pickAcrasielCombo('spike', 3, () => 0.999)).toBe('spear');
    expect(pickAcrasielCombo('spear', 3, () => 0.999)).toBe('warp');
  });
  it('no followup defined for other moves', () => {
    expect(pickAcrasielCombo('gaze', 3, () => 0)).toBeNull();
  });
});

// ★§6.28-19の主題を守る網(v0.25.4197)。再構築(v0.25.4196)で空きの向きがプレイヤー正面へ
// 固定され、「その場に立っていれば当たらない」状態になっていた。同じ壊し方を機械で捕まえる。
describe('planAcrasielPattern — ★空きは毎回変わる(主題)', () => {
  const plan = (rand: () => number) => planAcrasielPattern(0, 0, 1, 0, 210, 6, rand);

  it('向きは注入した乱数だけで決まる(プレイヤー位置を引数に取らない)', () => {
    expect(plan(() => 0).rotation).toBeCloseTo(0, 6);
    expect(plan(() => 0.5).rotation).toBeCloseTo(Math.PI, 6);
  });

  it('空きセクターが特定の1つに固定されない(8方向へ散る)', () => {
    const seen = new Set<number>();
    let seed = 12345;
    const nextRand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 400; i++) {
      const p = planAcrasielPattern(0, 0, 2, 0, 210, 6, nextRand);
      for (let s2 = 0; s2 < ACRASIEL_SECTOR_COUNT; s2++) if (isSpikeGapSector(p.gapMask, s2)) seen.add(s2);
    }
    // phase2 は空き1つ。400回まわして8方向すべてが少なくとも1回は空きになること。
    expect(seen.size).toBe(ACRASIEL_SECTOR_COUNT);
  });

  it('phase1 は空きが2つ・phase2以降は1つ(acrasielSpikeGapCountと一致)', () => {
    const count = (mask: number) => {
      let n = 0;
      for (let s2 = 0; s2 < ACRASIEL_SECTOR_COUNT; s2++) if (isSpikeGapSector(mask, s2)) n++;
      return n;
    };
    let seed = 777;
    const nextRand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    expect(count(planAcrasielPattern(0, 0, 1, 0, 210, 6, nextRand).gapMask)).toBe(acrasielSpikeGapCount(1));
    expect(count(planAcrasielPattern(0, 0, 2, 0, 210, 6, nextRand).gapMask)).toBe(acrasielSpikeGapCount(2));
    expect(count(planAcrasielPattern(0, 0, 3, 0, 210, 6, nextRand).gapMask)).toBe(acrasielSpikeGapCount(3));
  });
});

// ★カウンター連発(ハメ)の再発防止(v0.25.4198)。社長報告2026-09-10
// 「突っ立ってるところに近接当てるだけでカウンター連発してた」。
// カウンター→硬直→その硬直中の接触でまたカウンター…が無限に続いていた。
describe('acrasielCounterAccepted — ★カウンターで入った硬直中は再カウンターを受け付けない', () => {
  it('ロックが無ければ受け付ける(通常の溜め中・硬直中=掟W7)', () => {
    expect(acrasielCounterAccepted(undefined, 1000)).toBe(true);
    expect(acrasielCounterAccepted(0, 1000)).toBe(true);
  });

  it('カウンター由来の硬直が明けるまでは受け付けない', () => {
    // now=1000でカウンター成立 → 硬直500ms → ロックは1500まで。
    expect(acrasielCounterAccepted(1500, 1000)).toBe(false);
    expect(acrasielCounterAccepted(1500, 1499)).toBe(false);
  });

  it('硬直が明けた後は再び受け付ける(技を出し直せばまたカウンターできる)', () => {
    expect(acrasielCounterAccepted(1500, 1500)).toBe(true);
    expect(acrasielCounterAccepted(1500, 1501)).toBe(true);
  });
});

// ★v0.25.4203(社長「紅ライン予告出る割に弾が1発出るだけ」「全部の技を見直して激ムズ派手に」)。
// 予告(pixiScene)と判定(angelBossTick)が**同じ純関数**を読むことが一致の担保なので、
// その純関数の形をテストで固定する。
describe('acrasielGazeAngles — 単眼レーザーの多射線', () => {
  it('フェーズで本数が増える(5 → 7 → 9)', () => {
    expect(acrasielGazeBeamCount(1)).toBe(5);
    expect(acrasielGazeBeamCount(2)).toBe(7);
    expect(acrasielGazeBeamCount(3)).toBe(9);
    expect(acrasielGazeAngles(0, 1)).toHaveLength(5);
    expect(acrasielGazeAngles(0, 3)).toHaveLength(9);
  });

  it('基準角を中心に左右対称で、両端の開きが仕様の総角度と一致する', () => {
    const a = acrasielGazeAngles(0, 1);
    expect(a[2]).toBeCloseTo(0, 6);                       // 中央は基準角そのもの
    expect(a[0]).toBeCloseTo(-a[4], 6);                   // 左右対称
    expect(a[4] - a[0]).toBeCloseTo(ACRASIEL_GAZE_SPREAD_RAD, 6);
  });
});

describe('acrasielBurstShardAngles — 爆発/転移の破片弾', () => {
  it('絵と同じ本数を、等間隔で全方位に返す', () => {
    const a = acrasielBurstShardAngles(0);
    expect(a).toHaveLength(ACRASIEL_BURST_SHARD_COUNT);
    expect(a[1] - a[0]).toBeCloseTo(Math.PI * 2 / ACRASIEL_BURST_SHARD_COUNT, 6);
  });
});

describe('acrasielSpikeWaveCount / acrasielNextWaveGapMask — 放射棘の2波', () => {
  it('Phase1は1波・Phase2以降は2波', () => {
    expect(acrasielSpikeWaveCount(1)).toBe(1);
    expect(acrasielSpikeWaveCount(2)).toBe(2);
    expect(acrasielSpikeWaveCount(3)).toBe(2);
  });

  it('2波目の空きは1波目の45°隣へずれる(同じ場所に留まれない=読み直しが要る)', () => {
    // 1波目の空き = sector 0 のみ。ずらし先は 1 か 7 のどちらか。
    const next = acrasielNextWaveGapMask(1 << 0, 1, () => 0.1); // dir=-1側
    expect(isSpikeGapSector(next, 0)).toBe(false);
    expect(isSpikeGapSector(next, 7) || isSpikeGapSector(next, 1)).toBe(true);
  });

  it('要求された空きの個数を必ず満たす', () => {
    let seed = 4242;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 200; i++) {
      const mask = acrasielNextWaveGapMask(1 << (i % ACRASIEL_SECTOR_COUNT), 2, rand);
      let n = 0;
      for (let s2 = 0; s2 < ACRASIEL_SECTOR_COUNT; s2++) if (isSpikeGapSector(mask, s2)) n++;
      expect(n).toBe(2);
    }
  });
});

// ★★赤い予告の4つの掟②③(CLAUDE.md・社長指示2026-09-18)。PACING_PUZZLE.md §18-1 A-4 / B-1 / B-2。
// **旧実装の嘘の検知器**(=v0.25.4456以前の壊れ方をそのまま書くと落ちるテスト)。
describe('★アクラシエルの転移/爆発の赤は、判定の在る間だけ・当たる瞬間に消え切る', () => {
  // 判定側(angelBossTick.runAcrasielTick)の実測値。ここを変えたら判定側も変わっている。
  const WARP = { windupMs: 800, telegraphMs: 1000 };
  const BURST_WINDUP = 1200;

  it('★A-4: warp-out の満了で消えない(旧実装の嘘の検知器)', () => {
    // 旧: `warp-out`(800ms)の満了で予告が消え、続く `warp-in` の1000msは画面に何も出なかった。
    const atOutEnd = acrasielWarpRed('warp-out', 0, WARP);
    expect(atOutEnd).toEqual({ kind: 'meteor', prog: expect.closeTo(800 / 1800, 6) });
    expect((atOutEnd as { prog: number }).prog).toBeLessThan(1); // まだ消え切らない
    // warp-in の頭でも続きが出ている(段差なし)。
    expect(acrasielWarpRed('warp-in', WARP.telegraphMs, WARP)).toEqual(atOutEnd);
  });

  it('★A-4: 消え切る瞬間 = 衝撃(warp-active へ入る瞬間)', () => {
    expect(acrasielWarpRed('warp-in', 1, WARP)).toEqual({ kind: 'meteor', prog: expect.closeTo(1799 / 1800, 6) });
    expect(acrasielWarpRed('warp-in', 0, WARP)).toEqual({ kind: 'meteor', prog: 1 });
  });

  it('★通しの進行は単調に増える(out→in の境目で巻き戻らない)', () => {
    const seq: number[] = [];
    for (let r = WARP.windupMs; r >= 0; r -= 50) seq.push((acrasielWarpRed('warp-out', r, WARP) as { prog: number }).prog);
    for (let r = WARP.telegraphMs; r >= 0; r -= 50) seq.push((acrasielWarpRed('warp-in', r, WARP) as { prog: number }).prog);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(seq[seq.length - 1]).toBe(1);
  });

  it('★B-2: warp-active(200ms)は判定が毎フレーム生きている=赤を残す(旧実装の嘘の検知器)', () => {
    expect(acrasielWarpRed('warp-active', 200, WARP)).toEqual({ kind: 'live' });
    expect(acrasielWarpRed('warp-active', 0, WARP)).toEqual({ kind: 'live' });
  });

  it('判定の無い州(warp-recover/chase)では赤を出さない', () => {
    expect(acrasielWarpRed('warp-recover', 300, WARP)).toBeNull();
    expect(acrasielWarpRed('chase', 300, WARP)).toBeNull();
  });

  it('★B-1: burst(300ms)も判定が毎フレーム生きている=赤を残す(旧実装の嘘の検知器)', () => {
    // 旧: `burst-windup` の満了で赤が消え、実際に当たる300msの間は赤が1pxも無かった。
    expect(acrasielBurstRed('burst', 300, BURST_WINDUP)).toEqual({ kind: 'live' });
    expect(acrasielBurstRed('burst', 1, BURST_WINDUP)).toEqual({ kind: 'live' });
  });

  it('★B-1: 溜めは「出る=溜め開始」「消え切る=当たる」', () => {
    expect(acrasielBurstRed('burst-windup', BURST_WINDUP, BURST_WINDUP)).toEqual({ kind: 'meteor', prog: 0 });
    expect(acrasielBurstRed('burst-windup', 0, BURST_WINDUP)).toEqual({ kind: 'meteor', prog: 1 });
    expect(acrasielBurstRed('burst-recover', 500, BURST_WINDUP)).toBeNull();
  });
});
