import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import {
  LICH_KEEP_RADIUS_PX, LICH_WARP_VANISH_MS, LICH_WARP_APPEAR_MS,
  lichWarpLanding, lichIsVanishing, lichWarpDue, lichWarpPose,
  lichVanishProgress, lichAppearProgress,
  lichCircleVanishProgress, lichCircleAppearProgress, lichWarpTintStrength,
  LICH_CIRCLE_VANISH_MS, LICH_CIRCLE_APPEAR_MS, LICH_CIRCLE_LEAD_MS, LICH_WARP_CANCEL_MS,
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

  it('★消滅は「死の潰れ」にならず、等方に足元へ縮む(陣へ吸い込まれる)', () => {
    // `corpseSquashNow` の「縦に潰れて横に広がる」=倒した の絵。同じ形だと「倒れた?」と読まれる。
    // 逆に縦へ伸ばすと、足元アンカーなので**体が天へ昇る**=床の陣に吸われる絵の逆になる。
    const e = mk({ lichWarpAt: 0 });
    const late = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.9);
    expect(late.sqX).toBeLessThan(1);
    expect(late.sqY).toBeLessThan(1);
    expect(late.sqX).toBeCloseTo(late.sqY, 6);   // ★等方(ドット絵を非等方に歪めない)
  });

  it('★陣は体より先に灯る(吸う動きが、吸われる物が消えた後に始まらない)', () => {
    const e = mk({ lichWarpAt: 1000 });
    expect(lichCircleVanishProgress(e, 1000 - LICH_CIRCLE_LEAD_MS + 10)).not.toBeNull();
    expect(lichVanishProgress(e, 1000 - LICH_CIRCLE_LEAD_MS + 10)).toBeNull();
  });

  it('★跳びが遅れている間、陣の進みは「体が消えた時点」で止まる(消えて再点灯しない)', () => {
    const e = mk({ lichWarpAt: 0 });
    const atGone = lichCircleVanishProgress(e, LICH_WARP_VANISH_MS)!;
    // 被弾硬直で跳びが 400ms 遅れても、陣は同じ進みのまま(null にならない=消えない)
    expect(lichCircleVanishProgress(e, LICH_WARP_VANISH_MS + 400)).toBe(atGone);
    // 跳んだら、その進みから跡へ続く
    const jumped = mk({ lichWarpDoneAt: 0 });
    expect(lichCircleVanishProgress(jumped, 0)).toBeCloseTo(atGone, 6);
  });

  it('★取り消しても等身へ「戻る」(1フレームで全身に復帰しない)', () => {
    const e = mk({ lichWarpCancelAt: 0, lichWarpCancelFrom: 0.8 });
    const t0 = lichWarpPose(e, 0);
    const mid = lichWarpPose(e, LICH_WARP_CANCEL_MS * 0.5);
    const end = lichWarpPose(e, LICH_WARP_CANCEL_MS);
    expect(t0.sqX).toBeLessThan(0.6);          // 止まった時点の縮んだ姿から
    expect(mid.sqX).toBeGreaterThan(t0.sqX);   // 戻る途中
    expect(mid.sqX).toBeLessThan(1);
    expect(end).toEqual({ sqX: 1, sqY: 1, alpha: 1 });
  });

  it('★消える体は陣の色を受ける(体だけ元の色のまま薄れない)', () => {
    const e = mk({ lichWarpAt: 0 });
    expect(lichWarpTintStrength(e, LICH_WARP_VANISH_MS * 0.1))
      .toBeLessThan(lichWarpTintStrength(e, LICH_WARP_VANISH_MS * 0.8));
    expect(lichWarpTintStrength(mk({}), 999)).toBe(0);
  });

  it('★絞り切った姿が見える(透明度が形より遅れて落ちる)', () => {
    const e = mk({ lichWarpAt: 0 });
    const p = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.85);
    expect(1 - p.sqX).toBeGreaterThan(0.45);  // ほぼ絞り切っている時に
    expect(p.alpha).toBeGreaterThan(0.3);     // まだ見えている
  });

  it('★変化が終盤の数コマに固まらない(中盤で既に3割は進んでいる)', () => {
    const e = mk({ lichWarpAt: 0 });
    const mid = lichWarpPose(e, LICH_WARP_VANISH_MS * 0.6);
    expect(1 - mid.sqX).toBeGreaterThan(0.88 * 0.3);
  });

  it('★出現は大きく行き過ぎて収まる(小さい動きは存在しないのと同じ)', () => {
    const e = mk({ lichWarpDoneAt: 0 });
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) =>
      lichWarpPose(e, LICH_WARP_APPEAR_MS * (i + 1) / 41).sqY));
    expect(peak).toBeGreaterThan(1.2);                                 // 約26%行き過ぎる
    expect(lichWarpPose(e, LICH_WARP_APPEAR_MS * 0.999).sqY).toBeCloseTo(1, 1);
  });

  it('★出現は消滅の逆再生ではない(逆向きに重ねても形が合わない)', () => {
    // 消滅は**一方向**(縮み続ける・行き過ぎない)。出現は**行き過ぎて戻る**。
    // 逆再生なら、どちらも同じ「一方向」か同じ「行って戻る」になるはず。
    const vx = [0.2, 0.45, 0.7, 0.95].map(u => lichWarpPose(mk({ lichWarpAt: 0 }), LICH_WARP_VANISH_MS * u).sqX);
    for (let i = 1; i < vx.length; i++) expect(vx[i]).toBeLessThan(vx[i - 1]);   // 単調
    const xs = [0.3, 0.45, 0.7, 0.95].map(u => lichWarpPose(mk({ lichWarpDoneAt: 0 }), LICH_WARP_APPEAR_MS * u).sqX);
    expect(Math.min(...xs)).toBeLessThan(1);      // 小さい所から
    expect(Math.max(...xs)).toBeGreaterThan(1);   // 行き過ぎる
  });

  it('★陣が先に灯り、体は遅れて立つ(出た瞬間に既に居る、にしない)', () => {
    const e = mk({ lichWarpDoneAt: 0 });
    expect(lichWarpPose(e, LICH_WARP_APPEAR_MS * 0.1).alpha).toBe(0);   // 体はまだ出ていない
    expect(lichCircleAppearProgress(e, LICH_WARP_APPEAR_MS * 0.1)).not.toBeNull(); // 陣は出ている
  });

  it('★飛んだ後も元居た場所に陣の跡が残り、やがて終わる', () => {
    const e = mk({ lichWarpDoneAt: 0, lichWarpFromX: 10, lichWarpFromY: 20 });
    expect(lichCircleVanishProgress(e, 100)).not.toBeNull();
    expect(lichCircleVanishProgress(e, LICH_CIRCLE_VANISH_MS)).toBeNull();
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
