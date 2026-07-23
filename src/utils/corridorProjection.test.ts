import { describe, it, expect } from 'vitest';
import {
  projectCorridorPillars, CORRIDOR_CFG,
  projectCorridorEntity, PLAYER_VIEW_DEPTH, CORRIDOR_LATERAL_CLAMP,
  CORRIDOR_ENTITY_CULL_DEPTH,
} from './corridorProjection';

// ステージ6(洋館)通路の疑似投影の不変条件(v0.25.2077)。
const W = 430, H = 932;

describe('projectCorridorPillars (洋館通路の1/z投影)', () => {
  it('片側count本×左右=2×count個を返す', () => {
    expect(projectCorridorPillars(0, W, H)).toHaveLength(CORRIDOR_CFG.count * 2);
  });

  it('奥→手前の描画順(depth降順)', () => {
    const ps = projectCorridorPillars(123, W, H);
    for (let i = 1; i < ps.length; i++) expect(ps[i - 1].depth).toBeGreaterThanOrEqual(ps[i].depth);
  });

  it('手前(depth小)ほど大きく・下に・外側に描かれる', () => {
    const ps = projectCorridorPillars(0, W, H).filter(p => p.side === 1);
    const far = ps[0], near = ps[ps.length - 1];
    expect(near.h).toBeGreaterThan(far.h);
    expect(near.y).toBeGreaterThan(far.y);
    expect(near.x).toBeGreaterThan(far.x); // 右側: 手前ほど右(外)へ
  });

  it('一周(spacing×count)進むと同じ配置に戻る=無限ループ', () => {
    const loop = CORRIDOR_CFG.spacing * CORRIDOR_CFG.count;
    const a = projectCorridorPillars(200, W, H);
    const b = projectCorridorPillars(200 + loop, W, H);
    expect(b).toEqual(a);
  });

  it('前進すると柱の depth が減る(奥から手前へ流れる)', () => {
    const loop = CORRIDOR_CFG.spacing * CORRIDOR_CFG.count;
    const norm = (x: number) => ((x % loop) + loop) % loop; // depthは[-behind, loop-behind)なので正規化して比較
    const a = projectCorridorPillars(0, W, H).filter(p => p.side === 1);
    const b = projectCorridorPillars(100, W, H).filter(p => p.side === 1);
    const shifted = a.map(p => norm(p.depth - 100)).sort((x, y) => x - y);
    const bd = b.map(p => norm(p.depth)).sort((x, y) => x - y);
    bd.forEach((d, i) => expect(d).toBeCloseTo(shifted[i], 6));
  });

  it('カメラ通過中(depth<0)の柱も描画対象=巻き戻しは画面外(behind)まで起きない', () => {
    // 柱がちょうどカメラ位置を少し過ぎた瞬間(travel=柱位置+100)にその柱が負のdepthで残っていること。
    const ps = projectCorridorPillars(CORRIDOR_CFG.spacing * 2 + 100, W, H).filter(p => p.side === 1);
    const passing = ps.find(p => p.depth < 0);
    expect(passing).toBeDefined();
    expect(passing!.depth).toBeCloseTo(-100, 6);
    expect(passing!.h).toBeGreaterThan(H * CORRIDOR_CFG.pillarHr); // 通過中はd=0より大きく描かれる
  });
});

describe('projectCorridorEntity (エンティティの通路投影)', () => {
  it('プレイヤー(自分の視深)は画面中央・足元は画面高≒50%(社長指示v0.25.2106=常に真ん中)', () => {
    // プレイヤー自身: centerY=playerCenterY → d=PLAYER_VIEW_DEPTH → 足元投影が画面高≒50%。
    const v = projectCorridorEntity(0, 0, 0, W, H);
    expect(v.visible).toBe(true);
    expect(v.depth).toBeCloseTo(PLAYER_VIEW_DEPTH, 6);
    expect(v.scale).toBeCloseTo(CORRIDOR_CFG.focal / (CORRIDOR_CFG.focal + PLAYER_VIEW_DEPTH), 6);
    expect(v.x).toBeCloseTo(W / 2, 6); // 中心x=0 → 画面中央
    expect(Math.abs(v.y - H * 0.5)).toBeLessThan(H * 0.02); // 足元は画面中央(±2%)
  });

  it('横クランプ端(centerX=±260)は柱ライン(aisleHalfXr)に一致する', () => {
    const py = 0;
    const entRight = projectCorridorEntity(CORRIDOR_LATERAL_CLAMP, 0, py, W, H);
    // 同じ奥行きの柱の中心x(=W/2 + aisleHalfXr*W*s)と一致するはず。
    const s = entRight.scale;
    const pillarX = W / 2 + CORRIDOR_CFG.aisleHalfXr * W * s;
    expect(entRight.x).toBeCloseTo(pillarX, 4);
    const entLeft = projectCorridorEntity(-CORRIDOR_LATERAL_CLAMP, 0, py, W, H);
    expect(entLeft.x).toBeCloseTo(W - pillarX, 4);
  });

  it('上(奥=centerYが小)にいる敵ほど遠く=小さく描かれる', () => {
    const playerCY = 0;
    const near = projectCorridorEntity(0, -100, playerCY, W, H); // 少し上
    const far = projectCorridorEntity(0, -600, playerCY, W, H);  // もっと上(奥)
    expect(far.depth).toBeGreaterThan(near.depth);
    expect(far.scale).toBeLessThan(near.scale);
    expect(far.y).toBeLessThan(near.y); // 奥ほど足元が消失点(上)へ寄る
  });

  it('カメラ手前(d<CULL_DEPTH)はカリングされる', () => {
    // 敵が十分下(手前)にいて d が 60 未満になるケース。
    const behind = projectCorridorEntity(0, PLAYER_VIEW_DEPTH - CORRIDOR_ENTITY_CULL_DEPTH + 1, 0, W, H);
    expect(behind.visible).toBe(false);
  });
});
