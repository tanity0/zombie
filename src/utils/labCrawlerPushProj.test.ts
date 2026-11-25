// 研究所 `?proj=1` の変異塊の押し返しの高さ(社長「押し返し判定の高さをすこし低くしたい(少し絵と重なる様に)」2026-11-25)。
// 描く大きさの頭打ち(projCrawlerScale)で絵の上端が判定の上辺より手前に来ていた分、押し返しの箱の奥行きだけを縮める。
// `?proj=0`(gv が無い)は1ビットも変えない・取り込み/叩きつけ(赤い予告)/被弾の箱は変えない。
import { describe, it, expect, afterEach } from 'vitest';
import { rebuildProjGameViews, labFarBackdropHeightFor, setProjGameView, type ProjGameViewsInput, type ProjGameView } from './projGameView';
import { horizonForestFootLocalY, HORIZON_FOREST_UP_BY_STAGE } from './horizonForestLine';
import { horizonActorFadePx } from '../pixi/renderSpec';
import { projLabCrawlerPushH, PROJ_CRAWLER_PUSH_SINK_PX } from './projSpawnFade';
import { projectInto, makeProjPoint, projLocalYOfWorld } from './perspectiveProjection';
import { projCrawlerScale } from './projActorPass';
import {
  createLabCrawler, crawlerRect, crawlerPushRect, crawlerPushHClamp, stepLabCrawler, CRAWLER_HIT_H, CRAWLER_HIT_W,
  type LabCrawler, type CrawlerStepInput,
} from '../world/labCrawler';
import type { PlayableAreaCtx } from '../world/playableArea';
import type { Rect } from '../world/obstacles';

const PH = 28;
interface Sc { W: number; H: number }
const SCREENS: Sc[] = [{ W: 405, H: 878 }, { W: 375, H: 667 }, { W: 1280, H: 720 }];
const labView = (sc: Sc, px: number, py: number, z = 1): ProjGameView => {
  const farH = labFarBackdropHeightFor(sc.H);
  const i: ProjGameViewsInput = {
    camX: px - sc.W / 2, camY: py - sc.H / 2, playerCamX: px - sc.W / 2, playerCamY: py - sc.H / 2, viewW: sc.W, viewH: sc.H,
    viewZoom: z, playerH: PH, playerFootY: py + PH / 2, camZoom: z, camDown: 0.08, zref: 2, near: true,
    farStart: 1200, farEnd: 1500, att: null,
    horizonLocal: horizonForestFootLocalY({ screenH: sc.H, farH, farKey: 'lab', stage5: false, lab: true, upPx: HORIZON_FOREST_UP_BY_STAGE['stage-2'] ?? 0 }),
    fadePx: horizonActorFadePx(sc.H, sc.W), scene: 'lab',
  };
  return rebuildProjGameViews(i, farH).cam;
};
afterEach(() => setProjGameView(null));

/** 主人公の足元から真南 d に塊の足元がある時、押し返しの上辺が主人公の足元にちょうど触れる d(押し返しの釣り合い)。 */
const restDist = (gv: ProjGameView, footX: number, playerFootY: number): number => {
  let lo = 1, hi = CRAWLER_HIT_H;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (projLabCrawlerPushH(gv, footX, playerFootY + m) > m) lo = m; else hi = m;
  }
  return lo;
};

describe('押し返しの箱(world/labCrawler.crawlerPushRect)', () => {
  it('奥行きを省略・CRAWLER_HIT_H なら crawlerRect と同じ箱/縮めても下辺(足元)と幅は同じ', () => {
    const c = { x: 123.5, y: 77.25 };
    expect(crawlerPushRect(c)).toEqual(crawlerRect(c));
    expect(crawlerPushRect(c, CRAWLER_HIT_H)).toEqual(crawlerRect(c));
    const r = crawlerPushRect(c, 200);
    expect(r.height).toBe(200);
    expect(r.width).toBe(CRAWLER_HIT_W);
    expect(r.x).toBe(crawlerRect(c).x);
    expect(r.y + r.height).toBe(c.y);
    expect(crawlerPushHClamp(999)).toBe(CRAWLER_HIT_H);
    expect(crawlerPushHClamp(-5)).toBe(1);
    expect(crawlerPushHClamp(NaN)).toBe(CRAWLER_HIT_H);
  });
});

describe('stepLabCrawler の押し返し(playerPushH)', () => {
  const LAB: PlayableAreaCtx = { farBackdrop: '', labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false };
  // 塊の足元 y=150(箱 -150..150)・主人公は真北で足元が箱の上辺へ 0.5 食い込む。塊は少し横へ這っている。
  const c: LabCrawler = { ...createLabCrawler({ x: 7000, y: 0 }), awake: true, x: 0, y: 150, vx: 6, vy: 0, nextAttackAt: Infinity };
  const player: Rect = { x: -14, y: -150 - PH + 0.5, width: PH, height: PH };
  const inp = (extra: Partial<CrawlerStepInput> = {}): CrawlerStepInput => ({
    gameTime: 16, dt: 1 / 60, player, targets: [{ id: 'player', isPlayer: true, cx: 0, cy: player.y + PH / 2, r: PH / 2 }], obstacles: [], playable: LAB, ...extra,
  });
  it('playerPushH を渡さない・CRAWLER_HIT_H を渡す=結果が1ビットも同じ(?proj=0 の経路)', () => {
    const a = stepLabCrawler(c, inp());
    const b = stepLabCrawler(c, inp({ playerPushH: CRAWLER_HIT_H }));
    expect(b).toEqual(a);
    expect(a.playerPush).not.toBeNull(); // 今の箱では押し返される
  });
  it('奥行きを縮めると、縮めた分の中に居る主人公は押し返されない(取り込み・叩きつけの結果は同じ)', () => {
    const a = stepLabCrawler(c, inp());
    const b = stepLabCrawler(c, inp({ playerPushH: 200 }));
    expect(b.playerPush).toBeNull();
    expect(b.slam).toEqual(a.slam);
    expect(b.absorbIds).toEqual(a.absorbIds);
    expect(b.next!.state).toBe(a.next!.state);
  });
  it('縮めた箱の上辺に食い込めば押し返される(上へ・足元が縮めた箱の上辺まで)', () => {
    const p2: Rect = { ...player, y: 150 - 200 - PH + 0.5 };
    const r = stepLabCrawler(c, inp({ player: p2, playerPushH: 200 }));
    expect(r.playerPush).not.toBeNull();
    expect(r.playerPush!.dy).toBeLessThan(0);
    expect(p2.y + r.playerPush!.dy + PH).toBeCloseTo(r.next!.y - 200, 6); // 足元が縮めた箱の上辺にちょうど乗る
  });
});

describe('projLabCrawlerPushH(?proj=1 の研究所だけ縮める)', () => {
  it('gv が無い(?proj=0・屋外・洋館)は常に CRAWLER_HIT_H', () => {
    for (const y of [-400, -150, 0, 150, 400, 900]) expect(projLabCrawlerPushH(null, 0, y)).toBe(CRAWLER_HIT_H);
  });
  for (const sc of SCREENS) {
    it(`${sc.W}×${sc.H}: 頭打ちが効いていない所は今の箱・効いている所は絵の上端から沈む量だけ手前の行が上辺`, () => {
      const py = -150;
      const gv = labView(sc, 0, py);
      const pf = py + PH / 2;
      const pt = makeProjPoint();
      let shrunk = 0;
      for (let d = -300; d <= 600; d += 5) {
        const footY = pf + d;
        const h = projLabCrawlerPushH(gv, 0, footY);
        expect(h).toBeGreaterThanOrEqual(1);
        expect(h).toBeLessThanOrEqual(CRAWLER_HIT_H);
        const p = projectInto(gv.f, 0, footY, pt);
        const k = projCrawlerScale(p.s);
        if (!(k < p.s)) { expect(h).toBe(CRAWLER_HIT_H); continue; }
        if (h < CRAWLER_HIT_H && h > 1) {
          shrunk++;
          // 上辺の行(投影の縦)= 足元の行 − 絵の背丈(CRAWLER_HIT_H × 描く倍率) + 沈む量
          expect(projLocalYOfWorld(gv.f, footY - h)).toBeCloseTo(p.l - CRAWLER_HIT_H * k + PROJ_CRAWLER_PUSH_SINK_PX, 3);
        }
      }
      expect(shrunk).toBeGreaterThan(0);
    });
    it(`${sc.W}×${sc.H}: 塊が南から押してくる時の上辺は塊の足元とともに単調に動く(押し返しががたつかない)・少しだけ低くなる`, () => {
      const py = -150;
      const gv = labView(sc, 0, py);
      const pf = py + PH / 2;
      let prev = -Infinity;
      for (let d = 0; d <= 800; d += 0.5) {
        const top = d - projLabCrawlerPushH(gv, 0, pf + d);
        expect(top).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = top;
      }
      const rest = restDist(gv, 0, pf);
      expect(rest).toBeLessThan(CRAWLER_HIT_H); // 少し重なる(今より手前で止まる)
      expect(rest).toBeGreaterThan(CRAWLER_HIT_H * 0.8); // 少しだけ(判定の大半は残る)
    });
  }
});
