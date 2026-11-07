import { describe, it, expect } from 'vitest';
import {
  renderedViewRect, farBackdropHeightFor, isBoxOutsideRect, isBehindHeading, shouldRetireBehind, holdMinZoom,
  newZoomHold, retireGapReady, countVisibleBelowHorizon, catchUpSpawnCdMs, enemyVisualBox, retireDisposition,
  frontRespawnPoint,
  BEHIND_RETIRE_MARGIN_PX, BEHIND_RETIRE_GAP_MS, RETIRE_ZOOM_HOLD_MS, CATCH_UP_CD_FLOOR_MS, FRONT_RESPAWN_MARGIN_PX,
  ENEMY_ART_DEPTH_MAX,
} from './spawnRefill';
import { ZOOM_MIN_ABS } from './cameraZoom';
import { chaffWeightsForKoma, noRedTierForKoma, type KomaKind4 } from './scriptPuzzle';
import type { EnemyType, EnemyColorTier } from '../types/game';

// スマホ縦の論理画面(computeViewport(430,932) ≒ 405×878)。カメラ左上(camX,camY)=(-W/2,-H/2)=プレイヤー中心(0,0)。
const W = 405, H = 878;
const CAM = { x: -W / 2, y: -H / 2 };
const box = (cx: number, cy: number, s = 30) => ({ x: cx - s / 2, y: cy - s / 2, width: s, height: s });
const RIGHT = { hx: 1, hy: 0 };

/** pixiScene の引き(縦=farH支点・横=中央支点)で、ワールド点を画面座標へ写す(テスト用の写し)。 */
const toScreen = (wx: number, wy: number, z: number) => {
  const farH = farBackdropHeightFor(H);
  return { sx: (wx - CAM.x) * z + (W / 2) * (1 - z), sy: (wy - CAM.y) * z + farH * (1 - z) };
};

describe('見えている範囲(描画の式)', () => {
  it('等倍では画面そのもの・地平線は camY+farH', () => {
    const v = renderedViewRect(CAM.x, CAM.y, W, H, 1);
    expect(v.left).toBeCloseTo(CAM.x);
    expect(v.right).toBeCloseTo(CAM.x + W);
    expect(v.top).toBeCloseTo(CAM.y);
    expect(v.bottom).toBeCloseTo(CAM.y + H);
    expect(v.horizonY).toBeCloseTo(CAM.y + farBackdropHeightFor(H));
  });
  it('引き(0.4)の4辺が描画の画面の端(0とW・0とH)にちょうど写る=縦は地平線支点', () => {
    const z = ZOOM_MIN_ABS;
    const v = renderedViewRect(CAM.x, CAM.y, W, H, z);
    expect(toScreen(v.left, v.top, z).sx).toBeCloseTo(0);
    expect(toScreen(v.left, v.top, z).sy).toBeCloseTo(0);
    expect(toScreen(v.right, v.bottom, z).sx).toBeCloseTo(W);
    expect(toScreen(v.right, v.bottom, z).sy).toBeCloseTo(H);
    // 下に広がる量の方が上より大きい(支点が上寄り)
    expect(v.bottom - CAM.y - H).toBeGreaterThan(CAM.y - v.top);
    expect(toScreen(0, v.horizonY, z).sy).toBeCloseTo(farBackdropHeightFor(H));
  });
});

describe('置き去りの回収(PACING_PUZZLE.md §20 ★未決②)', () => {
  it('右へ歩き続けている時、左(後ろ)で画面+300pxの外にいる敵だけ回収する', () => {
    const view = renderedViewRect(CAM.x, CAM.y, W, H, 1);
    const base = { playerCx: 0, playerCy: 0, heading: RIGHT, walkStrength: 1, views: [view] };
    expect(shouldRetireBehind({ ...base, box: box(-560, 0) })).toBe(true);
    expect(shouldRetireBehind({ ...base, box: box(-450, 0) })).toBe(false); // 余白の内側
    expect(shouldRetireBehind({ ...base, box: box(560, 0) })).toBe(false);  // 前
    expect(shouldRetireBehind({ ...base, walkStrength: 0.2, box: box(-560, 0) })).toBe(false);
    expect(shouldRetireBehind({ ...base, heading: { hx: 0, hy: 0 }, box: box(-560, 0) })).toBe(false);
  });

  it('★一番引いたズーム(0.4)で、絵(背丈込み)が画面に1pxでも掛かる敵は回収しない(網羅)', () => {
    const z = ZOOM_MIN_ABS;
    const view = renderedViewRect(CAM.x, CAM.y, W, H, z);
    // 上へ歩く=下が後ろ。画面の下端(手前)の外に足元があっても、頭が覗くなら残す。
    const UP = { hx: 0, hy: -1 };
    const artW = 31 * 2 * 1.5, artH = 31 * 2 * 1.5; // skeleton 相当の描画枠
    for (let sx = 0; sx <= W; sx += 15) {
      for (let footOut = -400; footOut <= 600; footOut += 10) {
        const hit = { x: 0, y: 0, width: 31, height: 31 };
        // 足元のワールドY = 下端 + footOut
        hit.y = view.bottom + footOut - hit.height;
        hit.x = (sx - (W / 2) * (1 - z)) / z + CAM.x - hit.width / 2;
        const vis = enemyVisualBox(hit, artW, artH);
        const artTopScreen = toScreen(0, vis.y, z).sy;
        const visible = artTopScreen < H; // 絵の上端が画面の下端より上=映っている
        if (visible) {
          expect(shouldRetireBehind({ box: vis, playerCx: 0, playerCy: 0, heading: UP, walkStrength: 1, views: [view] })).toBe(false);
        }
      }
    }
  });

  it('絵の背丈(遠近の最大込み)が足元から上へ伸びる分を、見えているかの判定に含める', () => {
    const hit = { x: 0, y: 100, width: 30, height: 30 };
    const vis = enemyVisualBox(hit, 90, 90);
    expect(vis.y + vis.height).toBe(130);          // 足元はそのまま
    expect(vis.height).toBeCloseTo(90 * ENEMY_ART_DEPTH_MAX); // 上へ伸びる
    expect(vis.x + vis.width / 2).toBeCloseTo(15); // 横は足元中心
  });

  it('見えている範囲の候補が複数あれば、全部の外の時だけ回収する(カメラのずれに倒す)', () => {
    const a = renderedViewRect(CAM.x, CAM.y, W, H, 1);
    const b = renderedViewRect(CAM.x - 400, CAM.y, W, H, 1);
    const base = { playerCx: 0, playerCy: 0, heading: RIGHT, walkStrength: 1, views: [a, b] };
    expect(shouldRetireBehind({ ...base, box: box(-560, 0) })).toBe(false);
    expect(shouldRetireBehind({ ...base, box: box(-960, 0) })).toBe(true);
    expect(shouldRetireBehind({ ...base, views: [], box: box(-960, 0) })).toBe(false);
  });

  it('isBoxOutsideRect は箱が少しでも掛かっていれば外扱いにしない', () => {
    const r = { left: 0, top: 0, right: 100, bottom: 100, horizonY: 26 };
    expect(isBoxOutsideRect({ x: -40, y: 50, width: 30, height: 30 }, r, 0)).toBe(true);
    expect(isBoxOutsideRect({ x: -20, y: 50, width: 30, height: 30 }, r, 0)).toBe(false);
    expect(isBoxOutsideRect({ x: -40, y: 50, width: 30, height: 30 }, r, 20)).toBe(false);
  });

  it('isBehindHeading は進む向きとの内積が負の側', () => {
    expect(isBehindHeading(-10, 0, 0, 0, RIGHT)).toBe(true);
    expect(isBehindHeading(10, 0, 0, 0, RIGHT)).toBe(false);
    expect(isBehindHeading(0, 50, 0, 0, { hx: 0, hy: -1 })).toBe(true);
  });

  it('ズームは引きを即採用・戻りは3秒保持・ランが巻き戻ったら数え直す', () => {
    let h = newZoomHold();
    h = holdMinZoom(h, 1, 0);
    h = holdMinZoom(h, 0.7, 1000);
    expect(h.z).toBe(0.7);
    h = holdMinZoom(h, 1, 1000 + RETIRE_ZOOM_HOLD_MS - 1);
    expect(h.z).toBe(0.7);
    h = holdMinZoom(h, 1, 1000 + RETIRE_ZOOM_HOLD_MS);
    expect(h.z).toBe(1);
    expect(holdMinZoom({ z: 0.4, at: 50000 }, 1, 10).z).toBe(1);
  });

  it('回収は1体ずつ(間隔)・余白は300px', () => {
    expect(retireGapReady(-Infinity, 0)).toBe(true);
    expect(retireGapReady(1000, 1000 + BEHIND_RETIRE_GAP_MS - 1)).toBe(false);
    expect(retireGapReady(1000, 1000 + BEHIND_RETIRE_GAP_MS)).toBe(true);
    expect(retireGapReady(5000, 10)).toBe(true);
    expect(BEHIND_RETIRE_MARGIN_PX).toBe(300);
  });
});

describe('回収した敵の行き先(前へ動かす/退場)', () => {
  const ALL: EnemyType[] = ['bat', 'skeleton', 'zombie', 'plant', 'werewolf', 'pumpkin', 'driller', 'logger'];
  const TIERS: (EnemyColorTier | undefined)[] = [undefined, 'blue', 'purple', 'red'];

  it('★リラックス/ハーベスト中に前へ動かすのは「バット・スケルトン・赤なし」だけ(顔ぶれを崩さない)', () => {
    for (const koma of ['relax', 'harvest'] as KomaKind4[]) {
      for (const t of ALL) for (const tier of TIERS) {
        const d = retireDisposition(t, tier, koma);
        const ok = (t === 'bat' || t === 'skeleton') && tier !== 'red';
        expect(d).toBe(ok ? 'move' : 'remove');
      }
    }
    // リラックスの顔ぶれ(バット・スケルトンのみ・赤なし)そのものとも一致している
    const w = chaffWeightsForKoma('relax');
    expect(w.zombie).toBe(0);
    expect(w.bat).toBeGreaterThan(0);
    expect(w.skeleton).toBeGreaterThan(0);
    expect(noRedTierForKoma('relax')).toBe(true);
  });

  it('通常/ピーク・コマ不明(盤面の仕組みが止まっている時)は全部前へ動かす', () => {
    for (const koma of ['normal', 'peak', null] as (KomaKind4 | null)[]) {
      for (const t of ALL) for (const tier of TIERS) expect(retireDisposition(t, tier, koma)).toBe('move');
    }
  });

  it('前へ動かす先は進む先の辺に固定・正面寄り・絵ごと見えている範囲の外', () => {
    const z = 0.8;
    const view = renderedViewRect(CAM.x, CAM.y, W, H, z);
    const base = { view, playerCx: 0, playerCy: 0, width: 31, height: 31, artWidth: 170, artHeight: 170, corridor: false };
    const cases: [{ hx: number; hy: number }, number][] = [[RIGHT, 1], [{ hx: -1, hy: 0 }, 3], [{ hx: 0, hy: -1 }, 0], [{ hx: 0, hy: 1 }, 2]];
    for (const [heading, side] of cases) {
      for (const [r1, r2] of [[0, 0], [0.5, 0.5], [1, 1], [0.2, 0.9]]) {
        const pt = frontRespawnPoint({ ...base, heading, roll1: r1, roll2: r2 });
        expect(pt.side).toBe(side);
        const vis = enemyVisualBox({ x: pt.x, y: pt.y, width: 31, height: 31 }, 170 / ENEMY_ART_DEPTH_MAX, 170 / ENEMY_ART_DEPTH_MAX);
        expect(isBoxOutsideRect(vis, view, FRONT_RESPAWN_MARGIN_PX - 1)).toBe(true);
      }
    }
    // 乱数が真ん中なら正面(右へ歩く=プレイヤーと同じ高さ)
    const mid = frontRespawnPoint({ ...base, heading: RIGHT, roll1: 0.5, roll2: 0.5 });
    expect(mid.y + 31).toBeCloseTo(0);
  });

  it('通路は上か下だけ(左右は壁)', () => {
    const view = renderedViewRect(CAM.x, CAM.y, W, H, 1);
    const base = { view, playerCx: 0, playerCy: 0, width: 31, height: 31, artWidth: 90, artHeight: 90, corridor: true, roll1: 0.5, roll2: 0.5 };
    expect(frontRespawnPoint({ ...base, heading: { hx: 0.9, hy: -0.4 } }).side).toBe(0);
    expect(frontRespawnPoint({ ...base, heading: { hx: -1, hy: 0 } }).side).toBe(0);
    expect(frontRespawnPoint({ ...base, heading: { hx: 0.2, hy: 0.9 } }).side).toBe(2);
  });
});

describe('追い上げの湧き間隔', () => {
  it('画面内0体=×0.3(下限0.3秒)・1体=×0.5・2体以上=そのまま', () => {
    expect(catchUpSpawnCdMs(2000, 0)).toBe(600);
    expect(catchUpSpawnCdMs(1000, 0)).toBe(CATCH_UP_CD_FLOOR_MS);
    expect(catchUpSpawnCdMs(1000, 1)).toBe(500);
    expect(catchUpSpawnCdMs(1000, 2)).toBe(1000);
    expect(catchUpSpawnCdMs(500, 1)).toBe(300);
  });
  it('元より長くはしない(元が下限より短い時は元のまま)', () => {
    expect(catchUpSpawnCdMs(250, 0)).toBe(250);
    expect(catchUpSpawnCdMs(0, 0)).toBe(0);
  });
  it('地平線より下の可視域にいる敵だけ数える', () => {
    const view = renderedViewRect(CAM.x, CAM.y, W, H, 1); // 地平線 = -439 + 228 = -211
    const boxes = [
      { x: -15, y: -15, width: 30, height: 30 },   // 中央=数える
      { x: -15, y: -300, width: 30, height: 30 },  // 地平線より上(足元 -270)=数えない
      { x: 300, y: 0, width: 30, height: 30 },     // 画面外=数えない
      { x: -15, y: 420, width: 30, height: 30 },   // 下端に掛かる=数える
    ];
    expect(countVisibleBelowHorizon(boxes, view)).toBe(2);
  });
});
