import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import {
  LICH_KEEP_RADIUS_PX, LICH_WARP_VANISH_MS, LICH_WARP_APPEAR_MS,
  lichWarpLanding, lichIsVanishing, lichWarpDue, lichWarpPose,
  lichVanishProgress, lichAppearProgress,
  lichCircleVanishProgress, lichCircleAppearProgress,
  LICH_WARP_TRACE_MS, LICH_CIRCLE_VANISH_MS, LICH_CIRCLE_APPEAR_MS,
} from './lichWarp';

const mk = (p: Partial<Enemy>): Enemy => ({ id: 'l1', type: 'lich', spawnedAt: 100, ...p } as Enemy);

describe('§16-B B-5 リッチの転移', () => {
  it('着地は的から所定の距離ちょうど', () => {
    const l = lichWarpLanding(500, 400, 620, 400, 'l1', 100);
    expect(Math.hypot(l.x - 500, l.y - 400)).toBeCloseTo(LICH_KEEP_RADIUS_PX, 6);
  });

  it('★今いる方角を保ったまま外へ退く(的を挟んで反対側へ飛ばない)', () => {
    // リッチは的の**右**に居る。着地も右半面に留まること(真後ろへ回り込まない)。
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const l = lichWarpLanding(500, 400, 620, 400, id, 100);
      expect(l.x).toBeGreaterThan(500);
    }
  });

  it('着地の角度は個体ごとに散る(複数体が同じ点に重ならない)', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => Math.round(lichWarpLanding(500, 400, 620, 400, id, 100).y));
    expect(new Set(xs).size).toBeGreaterThan(3);
  });

  it('★消えている間 → 転移の時刻、の順に進む(硬直を飛ばさない)', () => {
    const e = mk({ lichWarpAt: 1000 });
    expect(lichIsVanishing(e, 1000)).toBe(true);
    expect(lichWarpDue(e, 1000)).toBe(false);
    expect(lichIsVanishing(e, 1000 + LICH_WARP_VANISH_MS)).toBe(false);
    expect(lichWarpDue(e, 1000 + LICH_WARP_VANISH_MS)).toBe(true);
  });

  it('予約が無ければ消えも転移もしない', () => {
    const e = mk({});
    expect(lichIsVanishing(e, 9999)).toBe(false);
    expect(lichWarpDue(e, 9999)).toBe(false);
  });

  it('★消滅は「死の潰れ」と逆方向へ変形する(横に絞り、縦に伸びる)', () => {
    // 同じ画面で `corpseSquashNow` が「縦に潰れて横に広がる」=倒した の絵なので、
    // 転移がそれと同じ形だとプレイヤーは「倒れた?」と読む。
    const e = mk({ lichWarpAt: 0 });
    const late = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.9);
    expect(late.sqX).toBeLessThan(1);      // 横は絞られる(広がらない)
    expect(late.sqY).toBeGreaterThan(1);   // 縦は伸びる(潰れない)
  });

  it('★絞り切った姿が見える(透明度が形より遅れて落ちる)', () => {
    const e = mk({ lichWarpAt: 0 });
    const p = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.85);
    expect(1 - p.sqX).toBeGreaterThan(0.45);  // ほぼ絞り切っている時に
    expect(p.alpha).toBeGreaterThan(0.3);     // まだ見えている
  });

  it('★変化が終盤の数コマに固まらない(中盤で既に半分は進んでいる)', () => {
    const e = mk({ lichWarpAt: 0 });
    const mid = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.6);
    expect(1 - mid.sqX).toBeGreaterThan(0.72 * 0.3);
  });

  it('★出現は大きく行き過ぎて収まる(小さい動きは存在しないのと同じ)', () => {
    const e = mk({ lichWarpDoneAt: 0 });
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) =>
      lichWarpPose(e, LICH_WARP_APPEAR_MS * (i + 1) / 41).sqY));
    expect(peak).toBeGreaterThan(1.15);                                // 25%近く行き過ぎる
    expect(lichWarpPose(e, LICH_WARP_APPEAR_MS * 0.999).sqY).toBeCloseTo(1, 1);
  });

  it('★出現は消滅の逆再生ではない(逆向きに重ねても形が合わない)', () => {
    // 消滅は**一方向**(横に絞り続ける)。出現は**行き過ぎて戻る**=途中で向きが変わる。
    // 逆再生なら、どちらも同じ「一方向」か同じ「行って戻る」になるはず。
    const vx = [0.2, 0.45, 0.7, 0.95].map(u => lichWarpPose(mk({ lichWarpAt: 0 }), LICH_WARP_VANISH_MS * u).sqX);
    for (let i = 1; i < vx.length; i++) expect(vx[i]).toBeLessThan(vx[i - 1]);   // 単調
    const xs = [0.2, 0.45, 0.7, 0.95].map(u => lichWarpPose(mk({ lichWarpDoneAt: 0 }), LICH_WARP_APPEAR_MS * u).sqX);
    expect(Math.min(...xs)).toBeLessThan(1);
    expect(Math.max(...xs)).toBeGreaterThan(1);
  });

  it('★陣が先に灯り、体は遅れて立つ(出た瞬間に既に居る、にしない)', () => {
    const e = mk({ lichWarpDoneAt: 0 });
    expect(lichWarpPose(e, LICH_WARP_APPEAR_MS * 0.1).alpha).toBe(0);   // 体はまだ出ていない
    expect(lichCircleAppearProgress(e, LICH_WARP_APPEAR_MS * 0.1)).not.toBeNull(); // 陣は出ている
  });

  it('★飛んだ後も元居た場所に陣の跡が残る(「消えた場所が残る」を嘘にしない)', () => {
    const e = mk({ lichWarpDoneAt: 0, lichWarpFromX: 10, lichWarpFromY: 20 });
    expect(lichCircleVanishProgress(e, LICH_WARP_TRACE_MS * 0.5)).not.toBeNull();
    expect(lichCircleVanishProgress(e, LICH_WARP_TRACE_MS + 1)).toBeNull();
  });

  it('★陣は体より長い時計で回す(短い尺に流用すると渦に見えない)', () => {
    expect(LICH_CIRCLE_VANISH_MS).toBeGreaterThan(LICH_WARP_VANISH_MS);
    expect(LICH_CIRCLE_APPEAR_MS).toBeGreaterThan(LICH_WARP_APPEAR_MS);
  });

  it('演出が終われば等身・不透明に戻る(残らない)', () => {
    const e = mk({ lichWarpDoneAt: 0 });
    expect(lichAppearProgress(e, LICH_WARP_APPEAR_MS)).toBeNull();
    const p = lichWarpPose(e, LICH_WARP_APPEAR_MS + 1);
    expect(p).toEqual({ sqX: 1, sqY: 1, alpha: 1 });
  });

  it('進みは0..1に収まり、窓の外ではnull', () => {
    const e = mk({ lichWarpAt: 500 });
    expect(lichVanishProgress(e, 499)).toBeNull();
    expect(lichVanishProgress(e, 500)).toBe(0);
    expect(lichVanishProgress(e, 500 + LICH_WARP_VANISH_MS)).toBeNull();
  });
});
