// 段階6(後半)の純関数: 湧きのフェードイン・回収の残像の列・作る範囲・弾の半径・置く範囲・吸い付きの頭の画面点
// (research/PERSPECTIVE_PROJECTION.md §3-9o イ・ウ・エ・ケ4・ケ7・ケ13・コ3)。手前を抑える案 ON の表で回す。
import { describe, it, expect } from 'vitest';
import {
  projAdvanceGhosts, projGhostAlpha, projBulletGhostAlpha, projFadeHidden, projEnemyFadeAlpha, projMarkFadeIn, projFadeInNewEnemies, flushProjGhosts,
  projGhostDrift, projEnemyGhostVelocity, projRecycledNear, queueProjRecycleGhost, resetProjFadeState,
  PROJ_RECYCLE_GHOST_CAP, PROJ_GHOST_DRIFT_TAU_MS,
} from './projSpawnFade';
import {
  projGameFrame, projGameViewContains, projGameBandPick, projGameRowHalfW, projGameRowSpan, projPropRegionRect, projBulletCullRadius,
  projEndingReentryHalfW, projGameEdgePoint, PROJ_FADE_MS, PROJ_GHOST_FADE_MS, PROJ_BULLET_GHOST_FADE_MS, projFadeInAlpha, PROJ_GAME_OVERSCAN, PROJ_REF_PHONE_H, PROJ_REF_PHONE_W, type ProjFrameBaseParams,
} from './projGameView';
import { projAimFrameFrom, projAimFrameScalars, projHeadScreenDist2 } from './projAimSnap';
import { makeProjPoint, projectInto, projDisplayToScreenInto, projLocalYOfWorld, type GroundPerspectiveParams } from './perspectiveProjection';
import { horizonForestFootLocalY } from './horizonForestLine';
import { farBackdropHeightFor, shouldRetireBehind } from './spawnRefill';
import { ZOOM_MIN_ABS } from './cameraZoom';
import { playerCenteredRegion } from './regionEdgeFade';
import { computeSupportSniperEntry, computeSupportSniperFarCorner } from './supportSniper';
import { libVolleyArrows } from './libertyScript';
import { wraithSummonSpots } from './wraithScript';
import { pickPracticeAmmoSpot } from './practiceAmmoResupply';
import { trySpawnEndingBomb } from './endingScene';
import type { Enemy } from '../types/game';

const P: GroundPerspectiveParams = { tileScaleX: 0.82, trapFar: 0.10, trapCurve: 1, trapezoid: 1, farScale: 0.055, nearScale: 0.82, curve: 2.6 };
const PH = 28;
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const SCENES = [{ W: 405, H: 878 }, { W: 405, H: 720 }, { W: 1280, H: 720 }, { W: 1152, H: 720 }];
const params = (W: number, H: number, camX: number, camY: number, z: number): ProjFrameBaseParams => ({
  persp: P, camX, camY, screenW: W, screenH: H, farH: farBackdropHeightFor(H), viewH: H, playerH: PH,
  playerFootY: camY + H * 0.58 + PH / 2, camZoom: z, camDown: 0.08, zref: 2, near: true, att: null,
  farStart: 1200, farEnd: 1500, overscan: PROJ_GAME_OVERSCAN,
});
const view = (W: number, H: number, camX: number, camY: number, z: number) =>
  projGameFrame(null, params(W, H, camX, camY, z), z,
    horizonForestFootLocalY({ screenH: H, farH: farBackdropHeightFor(H), farKey: 'forest', stage5: false, lab: false, upPx: 60 }), 120);

const enemy = (over: Partial<Enemy> = {}): Enemy => ({
  id: 'e1', x: 0, y: 0, width: 30, height: 40, speed: 1, health: 10, maxHealth: 10, damage: 1, type: 'zombie', experienceValue: 1, lastHit: 0,
  ...over,
} as Enemy);

describe('残像の列 projAdvanceGhosts(3-9o イ・ケ7)', () => {
  it('フェードアウトの尺(敵 450ms)だけ残してから外す・変わらないフレームは同じ参照', () => {
    const a = [{ id: 'a', at: 1000 }, { id: 'b', at: 1300 }];
    expect(projAdvanceGhosts(a, [], 1400, 24)).toBe(a);
    const n = projAdvanceGhosts(a, [], 1000 + PROJ_GHOST_FADE_MS, 24);
    expect(n.map(g => g.id)).toEqual(['b']);
    expect(projAdvanceGhosts(n, [], 1000 + PROJ_GHOST_FADE_MS + 1, 24)).toBe(n);
  });
  it('弾の列は弾の尺(200ms)で外す', () => {
    const a = [{ id: 'a', at: 1000 }];
    expect(projAdvanceGhosts(a, [], 1000 + PROJ_BULLET_GHOST_FADE_MS - 1, 48, undefined, PROJ_BULLET_GHOST_FADE_MS)).toBe(a);
    expect(projAdvanceGhosts(a, [], 1000 + PROJ_BULLET_GHOST_FADE_MS, 48, undefined, PROJ_BULLET_GHOST_FADE_MS)).toEqual([]);
  });
  it('上限を超えた分は古い方から落とし、数を知らせる', () => {
    let over = 0;
    const add = Array.from({ length: PROJ_RECYCLE_GHOST_CAP + 5 }, (_, i) => ({ id: `g${i}`, at: 10 }));
    const n = projAdvanceGhosts([], add, 10, PROJ_RECYCLE_GHOST_CAP, k => { over += k; });
    expect(n.length).toBe(PROJ_RECYCLE_GHOST_CAP);
    expect(over).toBe(5);
    expect(n[0].id).toBe('g5');
  });
  it('残像の濃さは 1→0(敵 450ms・弾 200ms・単調・ease-in=前半はゆっくり)', () => {
    for (const [fn, dur] of [[projGhostAlpha, PROJ_GHOST_FADE_MS], [projBulletGhostAlpha, PROJ_BULLET_GHOST_FADE_MS]] as const) {
      let prev = 2;
      for (let t = 0; t <= dur; t += 5) { const a = fn(0, t); expect(a).toBeLessThanOrEqual(prev); prev = a; }
      expect(fn(0, 0)).toBe(1);
      expect(fn(0, dur)).toBe(0);
      expect(fn(0, dur / 2)).toBeGreaterThan(0.5); // ease-in: 半分の時刻ではまだ半分より濃い
      // 始まりと終わりの速さは小さい(慣性)
      const d0 = 1 - fn(0, dur * 0.05), dm = fn(0, dur * 0.45) - fn(0, dur * 0.5);
      expect(d0).toBeLessThan(dm);
    }
  });
  it('フェードインとフェードアウトは別の曲線(非対称)', () => {
    expect(PROJ_FADE_MS).toBe(900);
    expect(projFadeInAlpha(PROJ_FADE_MS / 2)).toBeGreaterThan(0.5); // ease-out 寄り=前半で立ち上がる
    expect(projGhostAlpha(0, PROJ_GHOST_FADE_MS / 2)).toBeGreaterThan(0.5); // ease-in=後半で抜ける
  });
});

describe('残像の流れ projGhostDrift(慣性)', () => {
  it('回収直前の速度で始まり、減速しながら止まる(単調・上限 v·τ)', () => {
    const vx = 120, vy = -40;
    let prev = 0;
    let prevStep = Infinity;
    for (let t = 0; t <= 2000; t += 50) {
      const d = projGhostDrift(vx, vy, t, PROJ_GHOST_DRIFT_TAU_MS);
      const m = Math.hypot(d.dx, d.dy);
      expect(m).toBeGreaterThanOrEqual(prev);
      if (t > 0) { expect(m - prev).toBeLessThanOrEqual(prevStep + 1e-9); prevStep = m - prev; }
      prev = m;
    }
    expect(prev).toBeLessThanOrEqual(Math.hypot(vx, vy) * PROJ_GHOST_DRIFT_TAU_MS / 1000 + 1e-9);
    // 出だしの速さは元の速さ(止めない)
    const d1 = projGhostDrift(vx, vy, 1, PROJ_GHOST_DRIFT_TAU_MS);
    expect(d1.dx / 0.001).toBeCloseTo(vx, 0);
    const d00 = projGhostDrift(vx, vy, 0, PROJ_GHOST_DRIFT_TAU_MS);
    expect(Math.abs(d00.dx) + Math.abs(d00.dy)).toBe(0);
  });
  it('速度は押されている間は押しの速さ・それ以外は追いの速さ・無ければ 0', () => {
    expect(projEnemyGhostVelocity(enemy({ vx: 30, vy: 4 }), 0)).toEqual({ vx: 30, vy: 4 });
    expect(projEnemyGhostVelocity(enemy({ vx: 30, vy: 4, knockbackUntil: 100, knockbackVx: -200, knockbackVy: 0 }), 50)).toEqual({ vx: -200, vy: 0 });
    expect(projEnemyGhostVelocity(enemy(), 0)).toEqual({ vx: 0, vy: 0 });
  });
  it('回収の出来事の記録(計器用)は出撃の始めに消える', () => {
    resetProjFadeState();
    queueProjRecycleGhost(enemy({ id: 'r1' }), 500);
    expect(projRecycledNear('r1', 550)).toBe(true);
    expect(projRecycledNear('r1', 700)).toBe(false);
    resetProjFadeState();
    expect(projRecycledNear('r1', 550)).toBe(false);
  });
});

describe('フェードインの印と「見えていない」(3-9o イ)', () => {
  it('印が無ければ濃さ 1・見えていないにしない(?proj=0 は1ビットも変わらない)', () => {
    expect(projEnemyFadeAlpha({}, 5000)).toBe(1);
    expect(projFadeHidden({}, 5000)).toBe(false);
  });
  it('濃さ 0.5 未満の間だけ見えていない(フェードインの新しい曲線で測る)・gameTime で数える(止まれば止まる)', () => {
    // 0.5 を跨ぐ時刻を曲線から探す(曲線の中で決まる=尺の半分ではない)
    let tHalf = 0;
    while (projFadeInAlpha(tHalf) < 0.5) tHalf++;
    expect(tHalf).toBeLessThan(PROJ_FADE_MS / 2);
    expect(projFadeHidden({ projFadeInAt: 1000 }, 1000)).toBe(true);
    expect(projFadeHidden({ projFadeInAt: 1000 }, 1000 + tHalf - 1)).toBe(true);
    expect(projFadeHidden({ projFadeInAt: 1000 }, 1000 + tHalf)).toBe(false);
    expect(projEnemyFadeAlpha({ projFadeInAt: 1000 }, 1200)).toBe(projEnemyFadeAlpha({ projFadeInAt: 1000 }, 1200));
  });
  it('旗 false(テストは ?proj=0)では何もしない(同じ物を返す)', () => {
    const e = enemy();
    expect(projMarkFadeIn(e, 100)).toBe(e);
    const list = [e];
    expect(projFadeInNewEnemies(list, 100)).toBe(list);
    const st = { projRecycleGhosts: [], projBulletGhosts: [] };
    expect(flushProjGhosts(st, 100)).toBeNull();
  });
});

describe('★#37 作る範囲・弾・エンディングの兵士(3-9o ウ・ケ4)', () => {
  it('作る範囲: 縦持ちは今の playerCenteredRegion と同じ・横長は基準のスマホを縦横入れ替え(中心基準)', () => {
    for (const [W, H] of [[405, 878], [405, 720]]) {
      expect(projPropRegionRect(W, H, 100, -50, 520)).toEqual(playerCenteredRegion(100, -50, W, H, 520));
    }
    const l = projPropRegionRect(1280, 720, 100, -50, 520);
    expect(l.right - l.left).toBeCloseTo(PROJ_REF_PHONE_H + 1040, 9);
    expect(l.bottom - l.top).toBeCloseTo(PROJ_REF_PHONE_W + 1040, 9);
    expect((l.left + l.right) / 2).toBeCloseTo(100, 9);
    expect((l.top + l.bottom) / 2).toBeCloseTo(-50, 9);
  });
  it('弾の半径: 縦持ちは今の max(W,H)/ZOOM_MIN_ABS・横長は 2195 の固定', () => {
    expect(projBulletCullRadius(405, 878)).toBeCloseTo(878 / ZOOM_MIN_ABS, 9);
    expect(projBulletCullRadius(1280, 720)).toBeCloseTo(2195, 9);
    expect(projBulletCullRadius(1152, 720)).toBeCloseTo(2195, 9);
  });
  it('エンディングの兵士: 縦持ちは今の式・横長は幅の項を 878 に', () => {
    expect(projEndingReentryHalfW(405, 878, 200)).toBeCloseTo(405 / 2 / ZOOM_MIN_ABS + 200, 9);
    expect(projEndingReentryHalfW(1280, 720, 200)).toBeCloseTo(PROJ_REF_PHONE_H / 2 / ZOOM_MIN_ABS + 200, 9);
    expect(PROJ_REF_PHONE_W).toBe(405);
  });
});

describe('置く範囲・縁の点(★#38=A・V5・V38・V43・V47・V49・V50・V77)', () => {
  for (const sc of SCENES) for (const z of [1, 0.7, 0.4]) {
    it(`${sc.W}×${sc.H} z=${z}: projGameBandPick の点は見える地面の中`, () => {
      const gv = view(sc.W, sc.H, 0, -300, z);
      const r = rng(7);
      let inside = 0;
      for (let k = 0; k < 300; k++) {
        const q = projGameBandPick(gv, -8, r(), r());
        if (projGameViewContains(gv, q.x, q.y, 0)) inside++;
      }
      expect(inside).toBeGreaterThanOrEqual(297); // 帯の境目の丸めで外れるのは数点まで
    });
  }
  it('行の半幅は、その行の見える左右と同じ', () => {
    const gv = view(1280, 720, 0, -300, 1);
    const y = -100;
    const l = projLocalYOfWorld(gv.f, y);
    const r = projGameRowSpan(gv, l);
    expect(projGameRowHalfW(gv, y)).toBeCloseTo((r.right - r.left) / 2, 6);
  });
  it('援護射撃NPCの縁: edgeFn を渡した時はその点・渡さない時は今の矩形の交点', () => {
    const v = { left: -100, top: -100, right: 100, bottom: 100 };
    const a = computeSupportSniperEntry(50, 0, 0, 0, v, 0);
    expect(a).toEqual({ x: -100, y: 0, dirX: 1, dirY: -0 });
    const gv = view(405, 878, -200, -500, 1);
    const b = computeSupportSniperEntry(50, 0, 0, 0, v, 0, (fx, fy, dx, dy) => projGameEdgePoint(gv, fx, fy, dx, dy));
    expect(b).not.toBeNull();
    const c = computeSupportSniperFarCorner(0, 0, v, [{ x: 5, y: 5 }, { x: -300, y: 0 }]);
    expect(c.x).toBe(-300);
  });
  it('矢の雨・召喚・拾い物: pick を渡しても乱数の本数は今と同じ', () => {
    let n0 = 0, n1 = 0;
    const r0 = rng(11), r1 = rng(11);
    libVolleyArrows({ left: 0, right: 100, top: 0, bottom: 100 }, { x: 50, y: 50 }, 0, () => { n0++; return r0(); });
    libVolleyArrows({ left: 0, right: 100, top: 0, bottom: 100 }, { x: 50, y: 50 }, 0, () => { n1++; return r1(); }, () => ({ x: 1, y: 2 }));
    expect(n1).toBe(n0);
    const spots = wraithSummonSpots(0, 0, 100, 0, { left: -1000, right: 1000, top: -1000, bottom: 1000 }, () => true);
    expect(spots.length).toBeGreaterThan(0);
    let k0 = 0, k1 = 0;
    pickPracticeAmmoSpot({ view: { left: 0, top: 0, right: 500, bottom: 500, horizonY: 0 }, playerCx: 0, playerCy: 0, rng: () => { k0++; return 0.5; }, standable: () => null, tries: 5 });
    pickPracticeAmmoSpot({ view: { left: 0, top: 0, right: 500, bottom: 500, horizonY: 0 }, playerCx: 0, playerCy: 0, rng: () => { k1++; return 0.5; }, standable: () => null, tries: 5,
      projPick: () => ({ x: 300, y: 300 }), projInside: () => true });
    expect(k1).toBe(k0);
  });
  it('エンディングの爆弾: rowHalfW を渡さない時は今の式', () => {
    const soldiers = [{ x: 100, y: 0, speed: 0, velMult: 1 } as unknown as Parameters<typeof trySpawnEndingBomb>[1][number]];
    const a = trySpawnEndingBomb('a', soldiers, 0, 0, 640, rng(1));
    const b = trySpawnEndingBomb('a', soldiers, 0, 0, 640, rng(1), undefined, () => 0);
    expect(a).not.toBeNull();
    expect(b).toBeNull(); // 行の半幅 0 なら候補なし
  });
});

describe('置き去りの回収の見えている範囲(V27): outsideAll を渡した時だけ使う', () => {
  it('outsideAll が答える', () => {
    const base = { box: { x: -500, y: 0, width: 10, height: 10 }, playerCx: 0, playerCy: 0, heading: { hx: 1, hy: 0 }, walkStrength: 1, views: [{ left: -100, top: -100, right: 100, bottom: 100, horizonY: -100 }] };
    expect(shouldRetireBehind(base)).toBe(true);
    expect(shouldRetireBehind({ ...base, outsideAll: () => false })).toBe(false);
  });
});

describe('★#40=B 頭の画面点(3-9o エ・ケ13・ケ15・コ3)', () => {
  it('スカラー値から組み直した枠は元の枠と同じ投影', () => {
    const gv = view(1280, 720, 30, -260, 0.8);
    const f2 = projAimFrameFrom(projAimFrameScalars(gv.f));
    const a = projectInto(gv.f, 120, -40, makeProjPoint());
    const b = projectInto(f2, 120, -40, makeProjPoint());
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
    expect(b.s).toBeCloseTo(a.s, 9);
  });
  it('カーソルが描かれた頭の上なら距離 0・高さは ×s で上へ', () => {
    const gv = view(405, 878, 0, -400, 1);
    const f = gv.f;
    const footX = 180, footY = -150, headY = -150 - 50;
    const p = projectInto(f, footX, footY, makeProjPoint());
    const s = { x: 0, y: 0 };
    projDisplayToScreenInto(f, p.x, p.y - 50 * p.s, s);
    expect(projHeadScreenDist2(f, s.x, s.y, footX, footY, headY)).toBeCloseTo(0, 6);
    expect(projHeadScreenDist2(f, s.x, s.y + 10, footX, footY, headY)).toBeCloseTo(100, 4);
  });
  it('マウスを止めて歩いた(写しのカメラが古い): 今のカメラで組み直すと、カーソルの下の頭に吸い付いたまま(A1)', () => {
    const old = view(405, 878, 0, -400, 1);
    const sc = projAimFrameScalars(old.f); // マウスを動かした時の写し
    const now = view(405, 878, 0, -460, 1); // 60px 北へ歩いた後の今のカメラ
    const footX = 180, footY = -150, headY = -200;
    const p = projectInto(now.f, footX, footY, makeProjPoint());
    const cur = { x: 0, y: 0 };
    projDisplayToScreenInto(now.f, p.x, p.y - 50 * p.s, cur); // 今の画面に描かれた頭の上にカーソルが居る
    const fNow = projAimFrameFrom(sc, now.f.camX, now.f.camY);
    expect(projHeadScreenDist2(fNow, cur.x, cur.y, footX, footY, headY)).toBeCloseTo(0, 4);
    const fOld = projAimFrameFrom(sc);
    expect(projHeadScreenDist2(fOld, cur.x, cur.y, footX, footY, headY)).toBeGreaterThan(100); // 古いカメラのままなら外れる
  });
});
