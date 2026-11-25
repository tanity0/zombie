// 研究所 `?proj=1`: 塊が追って出てくる位置と生け贄の場面が始まる位置(見えている端までの距離)は `?proj=0` と同じ
// (社長「戻して」2026-11-25)。研究所のゲームの画面(projLabViewCam)が立っていても、出てくる距離は今の矩形の端で測る。
// このファイルだけ PROJ_GAME_VIEW を立てる(projLabViewCam が null でない経路を通すため)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./projFlag', async (orig) => ({ ...(await orig<typeof import('./projFlag')>()), PROJ_GAME_VIEW: true }));

import { useGameStore } from '../store/gameStore';
import { runLabCrawlerTick } from './labCrawlerTick';
import { labBaitBeforeStep } from './labBaitTick';
import { spawnEnemyAt } from './enemyUtils';
import { rebuildProjGameViews, setProjGameView, projLabViewCam, labFarBackdropHeightFor, type ProjGameViewsInput } from './projGameView';
import { horizonForestFootLocalY, HORIZON_FOREST_UP_BY_STAGE } from './horizonForestLine';
import { horizonActorFadePx } from '../pixi/renderSpec';
import { createLabCrawler, crawlerRect, type LabCrawler } from '../world/labCrawler';
import { LAB_BAIT_FIRE_MARGIN_PX } from '../world/labBait';

const PH = 28;
const IDOL = { x: 7000, y: 0 };

/** store のカメラ・画面の大きさで研究所のゲームの画面を立てる(useGameLoop と同じ組み方)。 */
const setLabView = (): void => {
  const st = useGameStore.getState();
  const W = st.gameBounds.width, H = st.gameBounds.height;
  const farH = labFarBackdropHeightFor(H);
  const pcx = st.player.x + st.player.width / 2, pcy = st.player.y + st.player.height / 2;
  const i: ProjGameViewsInput = {
    camX: st.camera.x, camY: st.camera.y, playerCamX: pcx - W / 2, playerCamY: pcy - H / 2, viewW: W, viewH: H,
    viewZoom: st.viewZoom, playerH: PH, playerFootY: st.player.y + st.player.height, camZoom: st.viewZoom, camDown: 0.08, zref: 2, near: true,
    farStart: 1200, farEnd: 1500, att: null,
    horizonLocal: horizonForestFootLocalY({ screenH: H, farH, farKey: 'lab', stage5: false, lab: true, upPx: HORIZON_FOREST_UP_BY_STAGE['stage-2'] ?? 0 }),
    fadePx: horizonActorFadePx(H, W), scene: 'lab',
  };
  rebuildProjGameViews(i, farH);
};

beforeEach(() => {
  setProjGameView(null);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    enemies: [], pumpkinBlasts: [], attention: null, gameTime: 10_000, stageTheme: 'lab', farBackdrop: 'lab',
    labCrawler: createLabCrawler(IDOL),
    player: { ...s.player, x: -14, y: -14, health: 100 },
  }));
});
afterEach(() => setProjGameView(null));

/** 資料を拾った次のフレームで塊が出てくる位置(lab=研究所のゲームの画面を立てるか)。 */
const chaseSpawnAt = (lab: boolean): LabCrawler => {
  useGameStore.setState(st => ({
    labEscapeRun: true, labEscapeAt: 0, returnCircle: null, labCrawler: createLabCrawler(IDOL), attention: null, enemies: [],
    player: { ...st.player, x: -7000 - 14, y: -14 },
    camera: { x: -7000 - st.gameBounds.width / 2, y: -st.gameBounds.height / 2 }, viewZoom: 1,
  }));
  useGameStore.getState().beginLabEscape();
  setProjGameView(null);
  if (lab) setLabView();
  expect(projLabViewCam() !== null).toBe(lab);
  runLabCrawlerTick(10_016, 1 / 60);
  const c = useGameStore.getState().labCrawler!;
  expect(c.chasing).toBe(true);
  return c;
};

describe('?proj=1 研究所: 出てくる距離は ?proj=0 と同じ', () => {
  it('資料を拾った後に塊が前方から出てくる位置が、研究所のゲームの画面の有無で1ビットも変わらない', () => {
    const a = chaseSpawnAt(false);
    const b = chaseSpawnAt(true);
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);
    // 今の矩形の端のすぐ外(画面の左端の外・資料の奥)
    const st = useGameStore.getState();
    expect(crawlerRect(b).x + crawlerRect(b).width).toBeLessThan(st.camera.x);
    expect(crawlerRect(b).x + crawlerRect(b).width).toBeGreaterThan(st.camera.x - 200);
  });

  it('生け贄の据え置き(場面が始まる位置=見えている端+余白)が、研究所のゲームの画面の有無で1ビットも変わらない', () => {
    const holdX = (lab: boolean): number => {
      const c0: LabCrawler = { ...createLabCrawler(IDOL), awake: true, chasing: true, x: -9000, y: 0, goalX: -2000 }; // ゴールは右(goalX<0 で右向き)
      useGameStore.setState(st => ({
        labEscapeRun: true, labEscapeAt: 5_000, gameWon: false, returnCircle: { x: 2000, y: 0, radius: 95 } as never, labBaitScene: null,
        labCrawler: c0, player: { ...st.player, x: -14, y: -14 },
        camera: { x: -st.gameBounds.width / 2, y: -st.gameBounds.height / 2 }, viewZoom: 1,
        attention: { x: 0, y: 0 } as never, // 別のアテンション中=据え置くだけ(発火しない)
      }));
      const st = useGameStore.getState();
      // 生け贄: 主人公の前方(ゴールの向き)・見えている端より少し先・帯の南の行(画面に描かれない所)。
      const e = spawnEnemyAt('lab-zombie-2', st.gameBounds.width / 2 + 5, 150, 1); // 左端が見えている端のすぐ外
      useGameStore.setState({ enemies: [{ ...e, id: 'bait-1', dormant: true, aggroRange: 0, labBait: { k: 0, used: false, active: false } } as never] });
      setProjGameView(null);
      if (lab) setLabView();
      expect(projLabViewCam() !== null).toBe(lab);
      labBaitBeforeStep(c0, 10_000, 1 / 60);
      const b = useGameStore.getState().enemies.find(x => x.id === 'bait-1');
      expect(b).toBeDefined();
      expect(b!.labBait?.used).toBe(false); // 捨てられていない(据え置かれた)
      return b!.x;
    };
    const a = holdX(false);
    const b = holdX(true);
    expect(b).toBe(a);
    const st = useGameStore.getState();
    const pcx = st.player.x + st.player.width / 2;
    const w = st.enemies[0].width;
    // 見えている端(今の矩形)+余白+体の幅 の所(中心)
    expect(a + w / 2).toBeCloseTo(pcx + (st.camera.x + st.gameBounds.width - pcx) + LAB_BAIT_FIRE_MARGIN_PX + w, 6);
  });
});
