// 研究所(ステージ2)のゲームの画面(?proj=1 の湧き・回収・見えている・照準の物差し)と、変異塊の大きさの頭打ちの純関数。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-9(段階6のゲームの画面)・§3-10(段階8・★#46・3-10k の食い違い3)。
import { describe, it, expect, afterEach } from 'vitest';
import {
  projGameSceneFor, rebuildProjGameViews, setProjGameView, getProjGameView, projLabViewCam, projFrameBase, projGroundPersp,
  projCamDownFracFor, projGameViewContains, projGameBoxOnScreen, projGameRowOutsideFootX, projGameSideEdgeX, projGameRowAlpha,
  labFarBackdropHeightFor, getProjLabGameView, LAB_FAR_BOUNDARY_YR, PROJ_GAME_OVERSCAN, PROJ_GAME_DRAWN_ALPHA,
  type ProjGameViewsInput, type ProjGameView,
} from './projGameView';
import { horizonForestFootLocalY, HORIZON_FOREST_UP_BY_STAGE } from './horizonForestLine';
import { horizonActorFadePx } from '../pixi/renderSpec';
import { farBackdropHeightFor } from './spawnRefill';
import { projSoftCapScale, projCrawlerScale, projCrawlerLooseD, PROJ_CRAWLER_SCALE_CAP, PROJ_CRAWLER_SCALE_KNEE } from './projActorPass';
import { projLabSpawnOutsideX, projLabAimHidden, projLabRecycleHold, projLabAimable, projLabCrawlerDrawn, projLabEnemyDrawn } from './projSpawnFade';
import { CRAWLER_ART_BODY_DISPLAY_W, CRAWLER_HIT_H, CRAWLER_HIT_W } from '../world/labCrawler';
import { placeLabSpawn, labEscapePushOut } from './labSpawn';
import { PROJ_GAME_VIEW } from './projFlag';
import type { Enemy } from '../types/game';

const PH = 28;
const CAM_DOWN = 0.08;
const CORR_DOWN = 0.16;
interface Sc { W: number; H: number }
const PHONE: Sc = { W: 405, H: 878 };
const PHONE_SE: Sc = { W: 375, H: 667 };
const PC: Sc = { W: 1280, H: 720 };

/** useGameLoop と同じ組み方(研究所: 遠景の帯 0.30H・下げ量 0・森の足元は研究所の式)。主人公の中心 (px, py)。 */
const labInput = (sc: Sc, px: number, py: number, z = 1): ProjGameViewsInput => {
  const farH = labFarBackdropHeightFor(sc.H);
  return {
    camX: px - sc.W / 2, camY: py - sc.H / 2, playerCamX: px - sc.W / 2, playerCamY: py - sc.H / 2, viewW: sc.W, viewH: sc.H,
    viewZoom: z, playerH: PH, playerFootY: py + PH / 2, camZoom: z, camDown: CAM_DOWN, zref: 2, near: true,
    farStart: 1200, farEnd: 1500, att: null,
    horizonLocal: horizonForestFootLocalY({ screenH: sc.H, farH, farKey: 'lab', stage5: false, lab: true, upPx: HORIZON_FOREST_UP_BY_STAGE['stage-2'] ?? 0 }),
    fadePx: horizonActorFadePx(sc.H, sc.W), scene: 'lab',
  };
};
const labView = (sc: Sc, px = 0, py = 0, z = 1): ProjGameView => {
  const i = labInput(sc, px, py, z);
  return rebuildProjGameViews(i, labFarBackdropHeightFor(sc.H)).cam;
};
const enemy = (x: number, y: number, w = 30, h = 40): Enemy => ({ id: 'e', type: 'zombie', x, y, width: w, height: h } as unknown as Enemy);

afterEach(() => setProjGameView(null));

describe('ゲームの画面を立てる場面(projGameSceneFor)', () => {
  it('屋内・洋館・M0=null/研究所=lab/ほか=outdoor', () => {
    const f = { indoor: false, corridor: false, lab: false, tutorial: false };
    expect(projGameSceneFor(f)).toBe('outdoor');
    expect(projGameSceneFor({ ...f, lab: true })).toBe('lab');
    expect(projGameSceneFor({ ...f, indoor: true })).toBeNull();
    expect(projGameSceneFor({ ...f, corridor: true })).toBeNull();
    expect(projGameSceneFor({ ...f, tutorial: true })).toBeNull();
    expect(projGameSceneFor({ ...f, lab: true, indoor: true })).toBeNull();
  });
  it('研究所の遠景の帯は 0.30H(pixiScene の研究所の枝と同じ値)', () => {
    expect(LAB_FAR_BOUNDARY_YR).toBe(0.30);
    expect(labFarBackdropHeightFor(878)).toBeCloseTo(263.4, 9);
  });
});

describe('研究所のゲームの画面は pixiScene の研究所の枠と同じ式(下げ量 字の 0)', () => {
  for (const sc of [PHONE, PHONE_SE, PC]) for (const z of [1, 1.2, 0.85]) {
    it(`${sc.W}×${sc.H} z=${z}: 基準点・基準行が projFrameBase(研究所の下げ量)と1ビットも同じ`, () => {
      const i = labInput(sc, 120, -60, z);
      const farH = labFarBackdropHeightFor(sc.H);
      const v = rebuildProjGameViews(i, farH);
      expect(v.scene).toBe('lab');
      const ref = projFrameBase(null, {
        persp: projGroundPersp(), camX: i.camX, camY: i.camY, screenW: sc.W, screenH: sc.H, farH, viewH: sc.H, playerH: PH,
        playerFootY: i.playerFootY, camZoom: z, camDown: CAM_DOWN, zref: 2, near: true, att: null, farStart: 1200, farEnd: 1500,
        overscan: PROJ_GAME_OVERSCAN, downFracAt: (zz: number) => projCamDownFracFor('lab', zz, CAM_DOWN, CORR_DOWN),
      });
      expect(v.cam.f.wRef).toBe(ref.input.wRef);
      expect(v.cam.f.lRef).toBe(ref.input.lRef);
      expect(v.cam.f.farH).toBe(farH);
      // 主人公の足元は等倍(下げ量 0 の基準行)
      const p = projGameBoxOnScreen(v.cam, 120, i.playerFootY, 10, 10, 0);
      expect(p).toBe(true);
    });
  }
  it('研究所の画面は段階6の入口(getProjGameView)に出ない・屋外を置けば研究所の置き場は空く', () => {
    rebuildProjGameViews(labInput(PHONE, 0, 0), labFarBackdropHeightFor(PHONE.H));
    expect(getProjGameView()).toBeNull();
    expect(getProjLabGameView()).not.toBeNull();
    rebuildProjGameViews({ ...labInput(PHONE, 0, 0), scene: 'outdoor' }, farBackdropHeightFor(PHONE.H));
    expect(getProjGameView()?.scene).toBe('outdoor');
    expect(getProjLabGameView()).toBeNull();
    setProjGameView(null);
    expect(getProjGameView()).toBeNull();
  });
  it('屋外(scene 省略)は今の式のまま(scene: outdoor と同じ値)', () => {
    const i = { ...labInput(PHONE, 0, 0), scene: undefined, horizonLocal: 100 };
    const a = rebuildProjGameViews(i, farBackdropHeightFor(PHONE.H));
    const b = rebuildProjGameViews({ ...i, scene: 'outdoor' }, farBackdropHeightFor(PHONE.H));
    expect(a.scene).toBe('outdoor');
    expect(a.cam.f.wRef).toBe(b.cam.f.wRef);
    expect(a.cam.f.lRef).toBe(b.cam.f.lRef);
  });
});

describe('研究所の「見えている」は投影後に画面に写る範囲(南は約 250px で切れる)', () => {
  it('スマホ縦: 主人公の真南 200px は見えている・300px は見えていない(旧い矩形では両方とも見えている)', () => {
    const gv = labView(PHONE);
    const foot = PH / 2;
    expect(projGameViewContains(gv, 0, foot + 200)).toBe(true);
    expect(projGameViewContains(gv, 0, foot + 300)).toBe(false);
    expect(Math.abs(300) < PHONE.H / 2).toBe(true); // 旧い矩形(半高 439)の中
  });
  it('北の行ほど横に広く見える(主人公の少し北の行は主人公の南の行より外まで写る)・地平線の先の行は描かれない', () => {
    const gv = labView(PHONE, 0, 100); // 主人公が帯の南寄り
    expect(projGameSideEdgeX(gv, 1, -200, -200)).toBeNull(); // 帯の北の縁=主人公から 300 北=地平線の先
    const n = projGameSideEdgeX(gv, 1, 60, 60);
    const m = projGameSideEdgeX(gv, 1, 260, 260);
    expect(n).not.toBeNull(); expect(m).not.toBeNull();
    expect(n!).toBeGreaterThan(m! + 30);
  });
});

describe('研究所の湧き(placeLabSpawn の outsideX)', () => {
  const seq = (vals: number[]) => { let k = 0; return () => vals[(k++) % vals.length]; };
  it('outsideX を渡さない(?proj=0)時は今の式と1ビットも同じ', () => {
    for (let t = 0; t < 30; t++) {
      const vals = [t / 30, (t * 7 % 30) / 30, 0.3, 0.8];
      const a = placeLabSpawn(500, 202, 140, 30, 40, 200, null, [], seq(vals));
      const b = placeLabSpawn(500, 202, 140, 30, 40, 200, null, [], seq(vals), 0, null, null);
      expect(b).toEqual(a);
    }
  });
  it('投影の外の x が今の x より遠い時だけ使う(近い時は今の x)・y は帯の中のまま', () => {
    const far = placeLabSpawn(0, 202, 140, 30, 40, 200, null, [], () => 0.2, 0, null, (side) => (side > 0 ? 900 : -900));
    expect(far!.x).toBe(900 + 140);
    const near = placeLabSpawn(0, 202, 140, 30, 40, 200, null, [], () => 0.2, 0, null, (side) => (side > 0 ? 10 : -10));
    expect(near!.x).toBe(0 + 202 + 140);
    expect(far!.y).toBeGreaterThanOrEqual(-200);
    expect(far!.y + 40).toBeLessThanOrEqual(200);
  });
  for (const sc of [PHONE, PHONE_SE, PC]) {
    it(`${sc.W}×${sc.H}: 研究所のゲームの画面で湧いた敵の絵は、どの行でも画面に描かれない`, () => {
      for (const py of [-200, -80, 0, 120, 200]) {
        const gv = labView(sc, 0, py);
        const e = enemy(0, 0);
        for (let t = 0; t < 40; t++) {
          const r = seq([t / 40, 0.5, (t * 13 % 40) / 40]);
          const p = placeLabSpawn(0, sc.W / 2, 140, e.width, e.height, 200, null, [], r, 0, null, projLabSpawnOutsideX(gv, e));
          if (!p) continue;
          expect(projLabRecycleHold({ ...e, x: p.x, y: p.y }, gv)).toBe(false);
        }
      }
    });
  }
  it('projGameRowOutsideFootX: その x の絵は画面の外・少し内側は画面に掛かる', () => {
    const gv = labView(PHONE);
    for (const footY of [-150, 0, 100]) {
      const fx = projGameRowOutsideFootX(gv, 1, footY, 60);
      if (fx === null) continue;
      expect(projGameBoxOnScreen(gv, fx + 1, footY, 60, 80, 0, PROJ_GAME_DRAWN_ALPHA)).toBe(false);
      expect(projGameBoxOnScreen(gv, fx - 5, footY, 60, 80, 0, PROJ_GAME_DRAWN_ALPHA)).toBe(true);
    }
  });
});

describe('研究所の照準の対象・回収の止め・画面の端', () => {
  it('南の見えない帯の敵は照準の対象から外れる・見えている敵は外れない・画面が無ければ外さない', () => {
    const gv = labView(PHONE);
    expect(projLabAimHidden(enemy(-15, 120), 0, gv)).toBe(false);
    expect(projLabAimHidden(enemy(-15, 400), 0, gv)).toBe(true);
    expect(projLabAimHidden(enemy(-15, 400), 0, null)).toBe(false);
  });
  it('変異塊は描画と同じ頭打ちの大きさで測る(上限前の s 倍だと、南の手前で画面に入っていない塊を「描かれている」と誤る)', () => {
    const gv = labView(PHONE, 0, -186); // 主人公が帯の北の縁・塊は南
    let found = 0;
    for (let fy = 100; fy <= 900; fy += 10) {
      const capped = projLabCrawlerDrawn(gv, 40, fy);
      const raw = projGameBoxOnScreen(gv, 40, fy, CRAWLER_ART_BODY_DISPLAY_W, CRAWLER_HIT_H, 0, PROJ_GAME_DRAWN_ALPHA);
      if (raw && !capped) found++;
      if (capped) expect(raw).toBe(true); // 頭打ちの箱は上限前の箱の中
    }
    expect(found).toBeGreaterThan(0);
    // 代理の敵(型 'lab-crawler')は塊の絵の箱で測る
    const proxy = enemy(40 - CRAWLER_HIT_W / 2, 600 - CRAWLER_HIT_H, CRAWLER_HIT_W, CRAWLER_HIT_H);
    (proxy as { type: string }).type = 'lab-crawler';
    expect(projLabEnemyDrawn(gv, proxy)).toBe(projLabCrawlerDrawn(gv, 40, 600));
  });
  it('projLabAimable: 画面が無ければ同じ配列(?proj=0)', () => {
    const list = [enemy(0, 0), enemy(0, 900)];
    expect(projLabAimable(list)).toBe(list);
  });
  it('逃走経路の雑魚: 置いた側の外へだけ押す(外向き・今より近くにはしない)', () => {
    const out = (side: 1 | -1) => (side > 0 ? 500 : -560);
    expect(labEscapePushOut(405, 0, 30, 40, 0, out)).toBe(515);
    expect(labEscapePushOut(900, 0, 30, 40, 0, out)).toBe(900);
    expect(labEscapePushOut(-405, 0, 30, 40, 0, out)).toBe(-545);
    expect(labEscapePushOut(405, 0, 30, 40, 0, null)).toBe(405);
    expect(labEscapePushOut(405, 0, 30, 40, 0, () => null)).toBe(405);
  });
  it('行の濃さ: 地平線より北の行は 0', () => {
    const gv = labView(PHONE);
    expect(projGameRowAlpha(gv, -2000)).toBe(0);
    expect(projGameRowAlpha(gv, 200)).toBe(1);
    expect(projGameRowAlpha(gv, 0)).toBeGreaterThan(0.5);
  });
});

describe('?proj=0 では研究所の入口は1つも開かない', () => {
  it('PROJ_GAME_VIEW は既定 false・研究所の画面を置いても projLabViewCam は null', () => {
    expect(PROJ_GAME_VIEW).toBe(false);
    rebuildProjGameViews(labInput(PHONE, 0, 0), labFarBackdropHeightFor(PHONE.H));
    expect(getProjLabGameView()?.scene).toBe('lab');
    expect(getProjGameView()).toBeNull(); // 段階6の入口(約50か所)は研究所では無効のまま(品質監査 D1)
    expect(projLabViewCam()).toBeNull();
    expect(projLabAimHidden(enemy(0, 900), 0)).toBe(false);
    expect(projLabRecycleHold(enemy(0, 0))).toBe(false);
  });
});

describe('変異塊の大きさの頭打ち(projCrawlerScale)', () => {
  it('knee まではそのまま・越えると cap へ滑らかに漸近(値と傾きが連続・単調・cap を越えない)', () => {
    expect(projCrawlerScale(1)).toBe(1);
    expect(projCrawlerScale(PROJ_CRAWLER_SCALE_KNEE)).toBe(PROJ_CRAWLER_SCALE_KNEE);
    const e = 1e-4;
    const d0 = (projCrawlerScale(PROJ_CRAWLER_SCALE_KNEE) - projCrawlerScale(PROJ_CRAWLER_SCALE_KNEE - e)) / e;
    const d1 = (projCrawlerScale(PROJ_CRAWLER_SCALE_KNEE + e) - projCrawlerScale(PROJ_CRAWLER_SCALE_KNEE)) / e;
    expect(Math.abs(d0 - d1)).toBeLessThan(1e-3);
    let prev = 0;
    for (let s = 0.3; s < 8; s += 0.01) {
      const k = projCrawlerScale(s);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeLessThanOrEqual(PROJ_CRAWLER_SCALE_CAP);
      expect(k).toBeLessThanOrEqual(s + 1e-12);
      prev = k;
    }
    expect(projCrawlerScale(3.9)).toBeGreaterThan(PROJ_CRAWLER_SCALE_CAP - 0.05);
  });
  it('後掛けの d は k=s/d が頭打ちの倍率になる値(頭打ちの前は 1)', () => {
    for (const s of [0.5, 1, 1.3, 2, 3.9]) expect(s / projCrawlerLooseD(s)).toBeCloseTo(projCrawlerScale(s), 12);
    expect(projCrawlerLooseD(1)).toBe(1);
  });
  it('projSoftCapScale: cap ≤ knee は min', () => {
    expect(projSoftCapScale(3, 2, 2)).toBe(2);
    expect(projSoftCapScale(1.5, 2, 2)).toBe(1.5);
  });
});
