import { describe, expect, it } from 'vitest';
import {
  PROJ_ACTOR_ROLES, PROJ_PHILL_SIZE_MODE, PROJ_SPAWN_FADE_PX, ProjSavePool,
  projActorK, projActorPosFade, projFadeTerms, projHudDelta, projPhillK, projRoleMove,
  projSeeThroughBox, projSimilarInto, projSimilarInverse, projSpawnEdgeAlpha, projSpawnFadeApplies,
  type ProjXf,
} from './projActorPass';
import { isStaticProjectedShadow } from './staticShadowCap';
import { OFFSCREEN_SPAWN_MARGIN } from './enemyUtils';

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe('projActorPass: 後掛けの相似(§3-5c 型②・作る物11)', () => {
  it('F は P へ写る・F から距離 r の点は距離 k·r・向き(角度)を保つ', () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const fx = r() * 2000 - 1000, fy = r() * 2000 - 1000, px = r() * 2000 - 1000, py = r() * 2000 - 1000;
      const k = 0.3 + r() * 2;
      const f: ProjXf = { x: fx, y: fy, sx: 1, sy: 1 };
      projSimilarInto(f, fx, fy, px, py, k);
      expect(f.x).toBeCloseTo(px, 9); expect(f.y).toBeCloseTo(py, 9);
      const ox = fx + (r() - 0.5) * 300, oy = fy + (r() - 0.5) * 300;
      const q: ProjXf = { x: ox, y: oy, sx: -1.5, sy: 2 };
      projSimilarInto(q, fx, fy, px, py, k);
      const r0 = Math.hypot(ox - fx, oy - fy), r1 = Math.hypot(q.x - px, q.y - py);
      expect(r1).toBeCloseTo(k * r0, 6);
      if (r0 > 1e-6) expect(Math.atan2(q.y - py, q.x - px)).toBeCloseTo(Math.atan2(oy - fy, ox - fx), 9);
      expect(q.sx).toBeCloseTo(-1.5 * k, 12); // 反転の符号はそのまま
      expect(q.sy).toBeCloseTo(2 * k, 12);
    }
  });

  it('保存→掛ける→戻すで元に戻る(誤差 1e-9)・箱は作り置き', () => {
    const r = rng(11);
    const pool = new ProjSavePool<ProjXf>();
    const objs: ProjXf[] = Array.from({ length: 30 }, () => ({ x: r() * 500, y: r() * 500, sx: r() + 0.2, sy: -(r() + 0.2) }));
    const orig = objs.map(o => ({ ...o }));
    for (let frame = 0; frame < 5; frame++) {
      for (const o of objs) pool.push(o, o.x, o.y, o.sx, o.sy, 1);
      for (const o of objs) projSimilarInto(o, 250, 300, 260 + frame, 330, 0.7 + 0.1 * frame);
      for (let i = 0; i < pool.length; i++) {
        const sv = pool.at(i); const o = sv.obj!;
        o.x = sv.x; o.y = sv.y; o.sx = sv.sx; o.sy = sv.sy;
      }
      pool.clear();
      objs.forEach((o, i) => {
        expect(Math.abs(o.x - orig[i].x)).toBeLessThan(1e-9);
        expect(Math.abs(o.y - orig[i].y)).toBeLessThan(1e-9);
        expect(Math.abs(o.sx - orig[i].sx)).toBeLessThan(1e-9);
        expect(Math.abs(o.sy - orig[i].sy)).toBeLessThan(1e-9);
      });
      expect(pool.capacity).toBe(30); // 毎フレームの確保を増やさない
    }
  });

  it('ボスの裏回りの点の逆写像が往復で一致する(§3-5j)', () => {
    const r = rng(3);
    for (let i = 0; i < 200; i++) {
      const fx = r() * 1000, fy = r() * 1000, px = r() * 1000, py = r() * 1000, k = 0.2 + r() * 2;
      const ox = r() * 1000, oy = r() * 1000;
      const q: ProjXf = { x: ox, y: oy, sx: 1, sy: 1 };
      projSimilarInto(q, fx, fy, px, py, k);
      const back = projSimilarInverse(fx, fy, px, py, k, q.x, q.y);
      expect(back.x).toBeCloseTo(ox, 8); expect(back.y).toBeCloseTo(oy, 8);
    }
  });

  it('k = s/d(旧い倍率を割り戻す)。主人公が基準行に居る時(s=d=1)は恒等', () => {
    expect(projActorK(1.38, 1.23)).toBeCloseTo(1.38 / 1.23, 12);
    expect(projActorK(1, 1)).toBe(1);
    const f: ProjXf = { x: 12, y: 34, sx: 2, sy: 2 };
    projSimilarInto(f, 10, 40, 10, 40, projActorK(1, 1));
    expect(f).toEqual({ x: 12, y: 34, sx: 2, sy: 2 });
  });

  it('★#22: 裁定 A(フィルもほかと同じ s/d・d=1 なので k=s)。控えの B は大きさ1=k は 1/d', () => {
    expect(PROJ_PHILL_SIZE_MODE).toBe('A');
    expect(projPhillK(0.6, 1)).toBeCloseTo(0.6, 12);
    expect(projPhillK(0.6, 1, 'B')).toBe(1);
  });
});

describe('projActorPass: 頭上の読ませる物(方針②)', () => {
  it('基準点は P + (s/b)·(H − F) へ・大きさは変えない(移動量だけ)', () => {
    const d = projHudDelta(100, 200, 130, 260, 0.8, 1, 100, 150);
    expect(100 + d.dx).toBeCloseTo(130, 12);
    expect(150 + d.dy).toBeCloseTo(260 + 0.8 * -50, 12);
    const d2 = projHudDelta(100, 200, 130, 260, 0.8, 0.5, 100, 150);
    expect(150 + d2.dy).toBeCloseTo(260 + 1.6 * -50, 12);
    // 基準行(F=P・s=1・b=1)では動かない
    const z = projHudDelta(50, 60, 50, 60, 1, 1, 50, 20);
    expect(z.dx).toBe(0); expect(z.dy).toBe(0);
  });
});

describe('projActorPass: 役の表(作る物2)', () => {
  it('予告は動かさない/頭上UIは平行移動/体と影と演出は相似', () => {
    for (const k of ['tele', 'overlayTop', 'rings', 'bands', 'bandSlices', 'clawMarks', 'shockwaves', 'spikeThrust', 'burstFrag', 'dashWind', 'coilBody'] as const) {
      expect(PROJ_ACTOR_ROLES[k]).toBe('telegraph');
      expect(projRoleMove(PROJ_ACTOR_ROLES[k])).toBe('none');
    }
    // 段階3(§3-7j の1): 演出は体の相似で動かす
    for (const k of ['slash', 'breathRope', 'airStreaks', 'playerAirStreaks'] as const) expect(projRoleMove(PROJ_ACTOR_ROLES[k])).toBe('similar');
    for (const k of ['heroTrail', 'brawlerGhost'] as const) expect(projRoleMove(PROJ_ACTOR_ROLES[k])).toBe('own'); // 残像=自分の world の点で投影
    expect(projRoleMove(PROJ_ACTOR_ROLES.overlay)).toBe('translate');
    for (const k of ['sprite', 'hitFlash', 'reticle', 'atkArt', 'glenParts', 'alchemyRocks', 'phillBack', 'featherC', 'phillFront', 'rim', 'light',
      'playerKatanaBack', 'playerSkateboard', 'playerKintoun', 'playerBloodRim', 'playerKnife', 'playerKnifeSlash', 'playerKnifeTrail',
      'playerMeleeWpn', 'playerFirstAidBag', 'airRing', 'airGroundShadow'] as const) {
      expect(projRoleMove(PROJ_ACTOR_ROLES[k])).toBe('similar');
    }
  });
});

describe('projActorPass: フェードの例外の表(§3-5i の1)', () => {
  it('フィル=両方免除/使者=地平線だけ免除/裏ボス=手前だけ免除/それ以外=両方', () => {
    expect(projFadeTerms({ phill: true, hangedman: false, hiddenBoss: true })).toEqual({ horizon: false, fore: false });
    expect(projFadeTerms({ phill: false, hangedman: true, hiddenBoss: false })).toEqual({ horizon: false, fore: true });
    expect(projFadeTerms({ phill: false, hangedman: false, hiddenBoss: true })).toEqual({ horizon: true, fore: false });
    expect(projFadeTerms({ phill: false, hangedman: false, hiddenBoss: false })).toEqual({ horizon: true, fore: true });
  });
  it('定義域の外(domain=0)は免除の型でも 0', () => {
    expect(projActorPosFade(0, 1, 1, { horizon: false, fore: false })).toBe(0);
    expect(projActorPosFade(0.5, 0.2, 0.4, { horizon: false, fore: true })).toBeCloseTo(0.2, 12);
    expect(projActorPosFade(1, 0.2, 0.4, { horizon: true, fore: true })).toBeCloseTo(0.08, 12);
  });
});

describe('projActorPass: 湧きの一時のフェード(§3-5g)', () => {
  const view = { left: 0, top: 0, right: 430, bottom: 900 };
  it('叩き台は湧く距離(OFFSCREEN_SPAWN_MARGIN=140)', () => {
    expect(PROJ_SPAWN_FADE_PX).toBe(OFFSCREEN_SPAWN_MARGIN);
  });
  it('矩形の中で1・湧く位置(外140px)より外で0・間は単調', () => {
    expect(projSpawnEdgeAlpha(200, 400, view)).toBe(1);
    expect(projSpawnEdgeAlpha(0, 400, view)).toBe(1); // 旧い画面の縁=1
    expect(projSpawnEdgeAlpha(200, -140, view)).toBe(0);
    expect(projSpawnEdgeAlpha(200, -300, view)).toBe(0);
    let prev = 0;
    for (let d = 140; d >= 0; d -= 5) {
      const a = projSpawnEdgeAlpha(200, -d, view);
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = a;
    }
    expect(prev).toBe(1);
  });
  it('掛けるのは雑魚・強個体だけ(ボス級・終端は掛けない)', () => {
    expect(projSpawnFadeApplies({ type: 'zombie' })).toBe(true);
    expect(projSpawnFadeApplies({ type: 'zombie', colorTier: 'red' })).toBe(true);
    expect(projSpawnFadeApplies({ type: 'giantbat' })).toBe(false);
    expect(projSpawnFadeApplies({ type: 'reaper', reaperChaser: true })).toBe(false);
  });
});

describe('projActorPass: 透けの投影後の箱(§3-5j)', () => {
  it('cx=P.x・footY=P.y・halfW=s·boxW/2・top=P.y−s·boxH', () => {
    expect(projSeeThroughBox(10, 300, 0.5, 40, 80)).toEqual({ cx: 10, footY: 300, halfW: 10, top: 260 });
  });
});

describe('staticShadowCap: 止まっている物の影の上限の候補(作る物4)', () => {
  it('projected && !moving だけ', () => {
    expect(isStaticProjectedShadow({ projected: true })).toBe(true);
    expect(isStaticProjectedShadow({ projected: true, moving: true })).toBe(false);
    expect(isStaticProjectedShadow({ projected: false })).toBe(false);
    expect(isStaticProjectedShadow({})).toBe(false);
  });
});

describe('projActorPass: 子の alpha の倍率(予告は world のフェード)', () => {
  it('既定(予告が自分の位置でフェード)では予告は1・それ以外は湧きのフェードだけ', async () => {
    const { projChildAlphaMul } = await import('./projActorPass');
    expect(projChildAlphaMul('telegraph', true, 0.3, 0.7, 0.5)).toBe(1);
    expect(projChildAlphaMul('body', true, 0.3, 0.7, 0.5)).toBe(0.5);
    expect(projChildAlphaMul('fx', true, 0.3, 0.7, 0.5)).toBe(0.5);
  });
  it('?telefade=0 では予告=world の位置のフェード(入れ物×子が ?proj=0 と同じ)・それ以外=投影後のフェード×湧き', async () => {
    const { projChildAlphaMul } = await import('./projActorPass');
    const rest = 0.8, child = 0.6, posW = 0.3, posP = 0.7;
    // ?proj=0: 入れ物 = posW × rest、子 = child
    const proj0 = posW * rest * child;
    // ?proj=1: 入れ物 = rest、子 = child × 倍率
    expect(rest * child * projChildAlphaMul('telegraph', false, posW, posP, 0.5)).toBeCloseTo(proj0, 12);
    expect(projChildAlphaMul('hud', false, posW, posP, 0.5)).toBeCloseTo(0.35, 12);
  });
});
