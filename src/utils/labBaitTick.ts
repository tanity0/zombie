// ステージ2「変異塊」の叩き潰しの登場の配線(research/LAB_CRAWLER.md §11・社長 2026-10-24)。
// 判定と位置の式は world/labBait.ts の純関数。ここは store を読んで書くだけ。labCrawlerTick が塊の1ステップの前後で呼ぶ:
//   labBaitBeforeStep: 生け贄の待機・発火・突進・塊を隠す/這い込みの開始(塊の値を返す)
//   labBaitAfterStep : 這い込みの位置と速さの上書き・二段目のスロー・場面の終わり
import { useGameStore } from '../store/gameStore';
import {
  crawlerCenter, crawlerSolid, crawlerGoalDir, crawlerReachedGoal, crawlerRect, crawlerSlamCenter,
  CRAWLER_HIT_W, CRAWLER_HIT_H, CRAWLER_WINDUP_MS, type LabCrawler,
} from '../world/labCrawler';
import {
  labBaitShouldFire, labBaitPassed, labBaitLandDist, labBaitLaneY, labBaitWarpX, labBaitCrawlerPosForSlam,
  labBaitLungePos, labBaitSlowParams, labBaitRealMsToHit, stepLabBaitCharge, segHitsRect,
  LAB_BAIT_SPEED_MULT, LAB_BAIT_GIVE_UP_MS, LAB_BAIT_SCENE_TAIL_MS, LAB_BAIT_FIRE_MARGIN_PX, LAB_BAIT_ZOOM,
  LAB_BAIT_CAM_MAX_FRAC, LAB_BAIT_SLOW_B_GAME_MS, type LabBaitScene,
} from '../world/labBait';
import { labWallsInRegion, wallRect, labPropsInRegion, propRect, LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { zoomedViewportBounds } from './cameraZoom';
import { LAB_VISION_RANGE } from './labStealth';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy } from '../types/game';
import type { Rect } from '../world/obstacles';

/** 鳴らす音(labCrawlerTick の LabCrawlerSfx を渡す。循環 import を避けて型はここで持つ)。 */
type LabBaitSfx = (key: 'zombie-growl' | 'crawler-windup' | 'crawler-appear' | 'boss-appear', gain: number) => void;

/** W を過ぎたとみなす距離(px)。ここで L へ向きを変える(W では減速しない)。 */
const VIA_W_RADIUS_PX = 40;
/** 着地点に着いたとみなす距離(px)。L はプレイヤーに付いて動くので、ぴったりには着かない(釣り合う距離≈21px)。 */
const ARRIVE_RADIUS_PX = 28;
/** 突進の頭の唸り・すれ違いざまの吠え(距離で弱めない)。 */
const CHARGE_GROWL_GAIN = 0.9;
const PASS_GROWL_GAIN = 0.5;
/** 溜めの間、生け贄はプレイヤーの方へ歩きのこれだけの速さで戻り始める(円からは出ない)。 */
const BAIT_CREEP_MULT = 0.5;
const BAIT_CREEP_MAX_FROM_L_PX = 120;
/** 待っている生け贄を捨てる(普通の敵に戻す)ゴールまでの距離。塊はゴール手前で沈むので、その手前で諦める。 */
const BAIT_GOAL_GIVE_UP_PX = 900;
/** boss-appear は出撃につき初回だけ(登場の重さ)。 */
let bossAppearPlayedRun = -1;

type View = { left: number; right: number; top: number; bottom: number };
const rectInView = (r: Rect, v: View): boolean => r.x < v.right && r.x + r.width > v.left && r.y < v.bottom && r.y + r.height > v.top;
const baitRect = (e: Enemy): Rect => ({ x: e.x, y: e.y, width: e.width, height: e.height });

const playableCtx = (farBackdrop: string): PlayableAreaCtx => ({
  farBackdrop, labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false,
});

/** 生け贄を普通のレベル2に戻す(研究所の視界で起きる・もう発火しない)。起きている個体は眠らせ直さない。 */
const releaseBait = (id: string): void => {
  useGameStore.setState(s => ({
    enemies: s.enemies.map(e => (e.id === id && e.labBait
      ? { ...e, labBait: { k: e.labBait.k, used: true, active: false, charging: false }, aggroRange: LAB_VISION_RANGE, dormant: e.dormant !== false, vx: 0, vy: 0 }
      : e)),
  }));
};

const writeBait = (id: string, patch: Partial<Enemy>): void => {
  useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
};

/** 突進の道(出発→W→L)が研究所の壁・遮蔽プロップに当たるか。 */
const pathBlocked = (pts: readonly { x: number; y: number }[], pad: number): boolean => {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad, maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
  const rects = [...labWallsInRegion(minX, minY, maxX, maxY).map(wallRect), ...labPropsInRegion(minX, minY, maxX, maxY).map(propRect)];
  for (let i = 0; i + 1 < pts.length; i++) {
    for (const r of rects) if (segHitsRect(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, r, pad)) return true;
  }
  return false;
};

/** 塊が場面に入れるか。叩きつけ・戻りの最中は待つ(進行中の赤い円を取り消さない)。 */
const crawlerFree = (c: LabCrawler | null, pcx: number): c is LabCrawler =>
  !!c && c.awake && c.chasing && crawlerSolid(c) && !crawlerReachedGoal(c)
  && c.state === 'move'
  && crawlerGoalDir(c) * (crawlerCenter(c).x - pcx) < 0; // 塊がプレイヤーより資料側(後ろ)
/** 塊がまだ場面を続けられるか(昇天・沈み・ゴールに着いたら終わり)。 */
const crawlerAlive = (c: LabCrawler | null): c is LabCrawler => !!c && crawlerSolid(c) && !crawlerReachedGoal(c);

/** 二段のスローを store に直接書く(段ごとに上書き=合成しない)。 */
const setSlow = (sp: { scale: number; durationMs: number; holdMs: number }): void => {
  const now = Date.now();
  useGameStore.setState({ timeSlowStart: now, timeSlowUntil: now + sp.durationMs, timeSlowScale: sp.scale, timeSlowHoldMs: sp.holdMs });
};

/** 這い込み+溜めの開始。円の中心=L(帯の都合で縦だけ寄る)。這い込みの始点=塊の今の位置(見えていた/隠した位置)。 */
const startLunge = (c: LabCrawler, sc: LabBaitScene, gameTime: number, playable: PlayableAreaCtx, sfx?: LabBaitSfx): { crawler: LabCrawler; scene: LabBaitScene } => {
  const end0 = labBaitCrawlerPosForSlam(sc.lx, sc.ly, sc.dir);
  const cl = clampRectToPlayableArea(end0.x - CRAWLER_HIT_W / 2, end0.y - CRAWLER_HIT_H, CRAWLER_HIT_W, CRAWLER_HIT_H, playable);
  const end = { x: cl.x + CRAWLER_HIT_W / 2, y: cl.y + CRAWLER_HIT_H, facingLeft: end0.facingLeft };
  const slam = crawlerSlamCenter(end);
  // 這い込みは後ろ→前の一方向だけ(塊が既に L より前に居たら、その場から叩く)。
  const sx = sc.dir * (end.x - c.x) > 0 ? c.x : end.x;
  const hitAt = gameTime + CRAWLER_WINDUP_MS;
  const crawler: LabCrawler = {
    ...c, x: sx, vx: 0, vy: 0, facingLeft: end.facingLeft,
    state: 'windup', stateAt: gameTime, hitAt, slamX: slam.x, slamY: slam.y, slamMoving: false, pressing: false, chaseCatchUp: false,
    sceneLunge: true,
  };
  // 音とスロー: 這い込みの頭で登場音。溜めの音は「当たる実時刻」に頂点が来るよう遅らせる(素材の頂点=鳴らしてから溜めの長さぶん後)。
  sfx?.('crawler-appear', 1);
  const realToHit = labBaitRealMsToHit(CRAWLER_WINDUP_MS);
  setTimeout(() => sfx?.('crawler-windup', 1), Math.max(0, realToHit - CRAWLER_WINDUP_MS));
  setSlow(labBaitSlowParams(CRAWLER_WINDUP_MS, 'a'));
  const runKey = useGameStore.getState().labEscapeAt;
  if (sfx && bossAppearPlayedRun !== runKey) {
    bossAppearPlayedRun = runKey;
    setTimeout(() => sfx('boss-appear', 0.7), realToHit + 1200);
  }
  return {
    crawler,
    scene: {
      ...sc, phase: 'lunge', lx: slam.x, ly: Math.max(slam.y - 150, Math.min(slam.y + 150, sc.ly)),
      lunge: { sx, sy: c.y, ex: end.x, ey: end.y, at: gameTime, hitAt }, slowB: false,
    },
  };
};

/**
 * 塊の1ステップの前: 生け贄の待機・発火・突進・塊を隠す・這い込みの開始。戻り値=このフレームの塊。
 */
export const labBaitBeforeStep = (c: LabCrawler | null, gameTime: number, dtSec: number, sfx?: LabBaitSfx): LabCrawler | null => {
  const st = useGameStore.getState();
  if (st.labEscapeAt <= 0 || st.gameWon) return c;
  const p = st.player;
  const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
  const v = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
  const playable = playableCtx(st.farBackdrop);
  const goalX = st.returnCircle ? st.returnCircle.x : 0;
  const goalDir = c ? crawlerGoalDir(c) : (Math.sign(goalX - pcx) || 1);
  const aheadEdge = goalDir > 0 ? v.right - pcx : pcx - v.left;
  const behindEdge = goalDir > 0 ? pcx - v.left : v.right - pcx;
  const sc = st.labBaitScene;

  // ---- 発火を待っている生け贄 ----
  // 条件が揃うまで「画面の外の前方」に据え置いて毎フレーム判定し直す(一時的な条件で捨てない)。
  // 捨てる(普通の敵に戻す)のは: 塊がもう居ない/追い越した/画面に入った/ゴールの手前まで来た。
  for (const e of st.enemies) {
    const lb = e.labBait;
    if (!lb || lb.used || lb.active) continue;
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    if (!crawlerAlive(c) || labBaitPassed(ecx, pcx, goalDir) || Math.abs(ecx - goalX) < BAIT_GOAL_GIVE_UP_PX) { releaseBait(e.id); continue; }
    if (!labBaitShouldFire(ecx, pcx, goalDir, aheadEdge)) continue;
    if (rectInView(baitRect(e), v)) { releaseBait(e.id); continue; } // 据え置きが間に合わず見えた(ズームの変化等)
    const holdAhead = () => {
      // 画面の外の前方へ据え置く(見えている端+マージン+体の幅)。
      const hx = pcx + goalDir * (aheadEdge + LAB_BAIT_FIRE_MARGIN_PX + e.width);
      writeBait(e.id, { x: hx - e.width / 2, vx: 0, vy: 0 });
    };
    if (sc || st.attention || !crawlerFree(c, pcx)) { holdAhead(); continue; }
    // 通り過ぎる筋: 出た側を優先、道が壁・プロップに当たるなら反対側、どちらも当たるなら据え置いて次のフレームでまた見る。
    const pref = labBaitLaneY(pcy, ecy, LAB_CORRIDOR_Y_LIMIT_PX, e.height);
    const lim = LAB_CORRIDOR_Y_LIMIT_PX - e.height / 2 - 4;
    const lanes = [pref, pcy - (pref - pcy)].filter((y, i, a) => a.indexOf(y) === i && Math.abs(y) <= lim);
    const landX = pcx - goalDir * labBaitLandDist();
    const lane = lanes.find(ly => !pathBlocked([{ x: ecx, y: ecy }, { x: pcx, y: ly }, { x: landX, y: ly }], e.width / 2));
    if (lane === undefined) { holdAhead(); continue; }
    const next: LabBaitScene = {
      k: lb.k, baitId: e.id, phase: 'charge', dir: goalDir, firedAt: gameTime,
      wx: pcx, wy: lane, lx: landX, ly: lane, viaW: false, passed: false, speed: 0,
      hideX: null, hideY: 0, lunge: null, slowB: false, endAt: 0,
    };
    useGameStore.setState({ labBaitScene: next });
    // 走る間は起こす(歩きのコマ・突進の土煙が出る)。AI は store の早期 return で止まったまま・当たらない・狙われない。
    writeBait(e.id, { labBait: { k: lb.k, used: true, active: true, charging: true }, dormant: false });
    sfx?.('zombie-growl', CHARGE_GROWL_GAIN);
    return c; // 走り出しは次のフレームから(このフレームの st は発火前の写し)
  }
  if (!sc) return c;

  // ---- 進行中の場面 ----
  const bait = st.enemies.find(e => e.id === sc.baitId && e.labBait?.active);
  const end = (): LabCrawler | null => {
    if (bait) releaseBait(bait.id);
    useGameStore.setState({ labBaitScene: null });
    return c;
  };
  if (!crawlerAlive(c)) return end();
  const walk = p.walkMoveSpeed ?? p.effectiveMoveSpeed ?? p.speed;
  if (sc.phase === 'lunge') {
    // 溜めの間: 生け贄は振り返り、プレイヤーの方へ歩きの半分で戻り始める(円の中心から離れすぎない=円からは出ない)。
    if (bait && bait.labBait) {
      const bcx = bait.x + bait.width / 2;
      if (sc.dir * (bcx - sc.lx) < BAIT_CREEP_MAX_FROM_L_PX && dtSec > 0) {
        const sp = Math.max(0, walk) * GAME_SPEED * BAIT_CREEP_MULT;
        writeBait(bait.id, { x: bait.x + sc.dir * sp * dtSec, vx: sc.dir * sp, vy: 0, labBait: { ...bait.labBait, charging: false } });
      } else writeBait(bait.id, { vx: 0, vy: 0 });
    }
    return c; // 這い込みの位置は labBaitAfterStep
  }
  if (sc.phase === 'tail') return c;
  if (gameTime - sc.firedAt > LAB_BAIT_GIVE_UP_MS) return end();

  // 隠した塊はそこで待たせる(見えない所)。
  let cc: LabCrawler = sc.hideX !== null ? { ...c, x: sc.hideX, vx: 0, vy: 0 } : c;

  // 着地点はプレイヤーに付いて動く(着いた瞬間にプレイヤーの後ろ D_L)。
  const sc0: LabBaitScene = { ...sc, lx: pcx - sc.dir * labBaitLandDist() };

  if (!bait || !bait.labBait) {
    // (狙われない・当たらないので通常は起きない)生け贄が消えた: 塊はそのまま出てきて L を叩く。
    if (sc.hideX !== null ? cc.state === 'move' : crawlerFree(cc, pcx)) {
      const r = startLunge(cc, sc0, gameTime, playable, sfx);
      useGameStore.setState({ labBaitScene: r.scene });
      return r.crawler;
    }
    useGameStore.setState({ labBaitScene: null });
    return cc;
  }

  const bcx = bait.x + bait.width / 2, bcy = bait.y + bait.height / 2;
  const maxSpeed = Math.max(0, walk) * GAME_SPEED * LAB_BAIT_SPEED_MULT;
  const next: LabBaitScene = { ...sc0 };
  let nx = bcx, ny = bcy;
  if (sc0.phase === 'charge') {
    const toW = !sc0.viaW;
    const tx = toW ? sc0.wx : sc0.lx, ty = toW ? sc0.wy : sc0.ly;
    const r = stepLabBaitCharge(bcx, bcy, tx, ty, sc0.speed, maxSpeed, dtSec, !toW);
    nx = r.x; ny = r.y;
    next.speed = r.speed;
    if (toW && (r.arrived || Math.hypot(sc0.wx - nx, sc0.wy - ny) <= VIA_W_RADIUS_PX)) { next.viaW = true; next.speed = Math.max(r.speed, sc0.speed); }
    else if (!toW && (r.arrived || Math.hypot(sc0.lx - nx, sc0.ly - ny) <= ARRIVE_RADIUS_PX)) next.phase = 'held';
  } else {
    // held: L に留まる(プレイヤーに付いて動く L を追う)。
    const r = stepLabBaitCharge(bcx, bcy, sc0.lx, sc0.ly, sc0.speed, maxSpeed, dtSec, true);
    nx = r.x; ny = r.y; next.speed = r.speed;
  }
  const cl = clampRectToPlayableArea(nx - bait.width / 2, ny - bait.height / 2, bait.width, bait.height, playable);
  const dx = cl.x + bait.width / 2 - bcx, dy = cl.y + bait.height / 2 - bcy;
  const vx = dtSec > 0 ? dx / dtSec : 0, vy = dtSec > 0 ? dy / dtSec : 0;
  writeBait(bait.id, { x: cl.x, y: cl.y, vx, vy, labBait: { ...bait.labBait, charging: next.phase === 'charge' } });

  if (!next.passed && labBaitPassed(cl.x + bait.width / 2, pcx, sc0.dir)) {
    next.passed = true;
    sfx?.('zombie-growl', PASS_GROWL_GAIN); // すれ違いざまに吠える
    // 塊が画面の外なら、この先の引き(ズーム)と後ろへの寄せでも見えない所へ隠す(ワープ・演出なし)。見えていれば隠さない。
    if (!rectInView(crawlerRect(cc), v)) {
      const halfViewOut = st.gameBounds.width / Math.min(1, LAB_BAIT_ZOOM) / 2;
      const futureBehind = Math.max(behindEdge, halfViewOut + st.gameBounds.width * LAB_BAIT_CAM_MAX_FRAC);
      next.hideX = labBaitWarpX(pcx, sc0.dir, futureBehind);
      cc = { ...cc, x: next.hideX, vx: 0, vy: 0 };
    }
  }

  if (next.phase === 'held') {
    // 塊が叩きつけ・戻りの最中なら終わるまで待つ(進行中の赤い円を取り消さない)。
    const ready = next.hideX !== null ? cc.state === 'move' : crawlerFree(cc, pcx);
    if (ready) {
      const r = startLunge(cc, { ...next, speed: 0 }, gameTime, playable, sfx);
      useGameStore.setState({ labBaitScene: r.scene });
      writeBait(bait.id, { labBait: { ...bait.labBait, charging: false } });
      return r.crawler;
    }
  }
  useGameStore.setState({ labBaitScene: next });
  return cc;
};

/**
 * 塊の1ステップの後: 這い込み(位置と速さ)の上書き・二段目のスロー・場面の終わり。戻り値=書く塊。
 */
export const labBaitAfterStep = (nc: LabCrawler | null, gameTime: number, dtSec: number): LabCrawler | null => {
  const st = useGameStore.getState();
  const sc = st.labBaitScene;
  if (!sc) return nc;
  if (!nc || !crawlerSolid(nc) || crawlerReachedGoal(nc)) {
    const b = st.enemies.find(e => e.id === sc.baitId && e.labBait?.active);
    if (b) releaseBait(b.id);
    useGameStore.setState({ labBaitScene: null });
    return nc ? { ...nc, sceneLunge: false } : nc;
  }
  if (sc.hideX !== null && (sc.phase === 'charge' || sc.phase === 'held')) {
    // 隠した塊はそこで待たせる(追跡の1ステップで動いた分を戻す)。
    return { ...nc, x: sc.hideX, vx: 0, vy: 0 };
  }
  if (sc.phase === 'lunge' && sc.lunge) {
    if (nc.state === 'windup' && nc.stateAt === sc.lunge.at) {
      const span = Math.max(1, sc.lunge.hitAt - sc.lunge.at);
      const u = (gameTime - sc.lunge.at) / span;
      const pos = labBaitLungePos(sc.lunge.sx, sc.lunge.sy, sc.lunge.ex, sc.lunge.ey, u);
      const prev = labBaitLungePos(sc.lunge.sx, sc.lunge.sy, sc.lunge.ex, sc.lunge.ey, u - (dtSec * 1000) / span);
      const vx = dtSec > 0 ? (pos.x - prev.x) / dtSec : 0;
      // 手が落ちる最後の区間で二段目のスロー(一番遅い所で当たる)。
      if (!sc.slowB && sc.lunge.hitAt - gameTime <= LAB_BAIT_SLOW_B_GAME_MS) {
        setSlow(labBaitSlowParams(sc.lunge.hitAt - gameTime, 'b'));
        useGameStore.setState({ labBaitScene: { ...sc, slowB: true } });
      }
      return { ...nc, x: pos.x, y: pos.y, vx, vy: 0 };
    }
    useGameStore.setState({ labBaitScene: { ...sc, phase: 'tail', endAt: gameTime + LAB_BAIT_SCENE_TAIL_MS } });
    return nc;
  }
  if (sc.phase === 'tail') {
    if (sc.endAt > 0 && gameTime >= sc.endAt) {
      const b = st.enemies.find(e => e.id === sc.baitId && e.labBait?.active);
      if (b) releaseBait(b.id);
      useGameStore.setState({ labBaitScene: null });
      return { ...nc, sceneLunge: false };
    }
    return nc.state === 'move' && nc.sceneLunge ? { ...nc, sceneLunge: false } : nc;
  }
  return nc;
};
