// ★歩行二次モーションのうち、**絵を歪める成分だけを抜く**関数の不変条件。
// (このファイルは PixiJS 非依存の純関数=`enemyMotion.ts` の冒頭コメント参照。描画コードは試していない。)
import { describe, it, expect } from 'vitest';
import { enemyMotionPose, undistortForSheet, type EnemyMotionSpec } from './enemyMotion';

// 四つ這いの獣(骸骨)の表と同じ値。歪みが一番大きく出る型の1つ。
const CRAWL: EnemyMotionSpec = {
  kind: 'crawl', bobPx: 1.8, rockRad: 0.050, sqAmp: 0.045, strideHz: 3.0, uneven: 0.35, faceMove: true,
};

describe('★★絵が入った敵は歪めない(社長指示2026-09-21)', () => {
  it('シートのコマが出ているフレームは、傾ぎもスカッシュも掛からない', () => {
    // 歩調の1周期ぶんを細かく走査する——「たまたま波がゼロの瞬間だけ0」を通さないため。
    for (let t = 0; t < 1200; t += 7) {
      const raw = enemyMotionPose(CRAWL, 0.9, t, 1);
      const out = undistortForSheet(raw, true);
      expect(out.rot).toBe(0);
      expect(out.sqX).toBe(1);
      expect(out.sqY).toBe(1);
    }
  });

  it('★上下の位置(bob)は残る=歪みだけを抜いている', () => {
    let moved = 0;
    for (let t = 0; t < 1200; t += 7) {
      const raw = enemyMotionPose(CRAWL, 0.9, t, 1);
      expect(undistortForSheet(raw, true).bob).toBe(raw.bob);
      if (raw.bob > 0) moved++;
    }
    expect(moved).toBeGreaterThan(0);   // bobが常に0なら上の等価判定は何も言っていない
  });

  it('シートが無い(立ち絵の)フレームは従来どおり歪む', () => {
    let warped = 0;
    for (let t = 0; t < 1200; t += 7) {
      const raw = enemyMotionPose(CRAWL, 0.9, t, 1);
      expect(undistortForSheet(raw, false)).toBe(raw);   // 同じ物をそのまま返す
      if (raw.rot !== 0 || raw.sqX !== 1) warped++;
    }
    expect(warped).toBeGreaterThan(0);
  });

  it('止まっている時は、シートの有無にかかわらず歪みゼロ(元から静止)', () => {
    const still = enemyMotionPose(CRAWL, 0.9, 500, 0);
    expect(still.rot).toBe(0);
    expect(still.sqX).toBe(1);
    expect(undistortForSheet(still, true)).toEqual({ rot: 0, bob: still.bob, sqX: 1, sqY: 1 });
  });
});
