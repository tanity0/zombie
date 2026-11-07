// 塊の叩き潰しの登場(research/LAB_CRAWLER.md §11・社長 2026-10-24)の純関数。受け入れ条件の番号は §11-2。
import { describe, it, expect } from 'vitest';
import {
  labBaitSlots, labBaitShouldFire, labBaitPassed, labBaitLandDist, labBaitLaneY, labBaitWarpX, labBaitCrawlerPosForSlam,
  labBaitLungePos, labBaitSlowParams, stepLabBaitCharge, labBaitCamLead, segHitsRect, segPointDist,
  LAB_BAIT_COUNT, LAB_BAIT_LUNGE_FRAC, LAB_BAIT_SLOW_A, LAB_BAIT_SLOW_B, LAB_BAIT_SLOW_B_GAME_MS, LAB_BAIT_CAM_MAX_FRAC, LAB_BAIT_ZOOM,
  labBaitLungeProgress, labBaitRealMsToHit, labBaitZoomTarget,
} from './labBait';
import { CRAWLER_HIT_W, CRAWLER_SLAM_RADIUS, crawlerSlamCenter, crawlerRect } from './labCrawler';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';

const PLAYER_HALF = 14;

describe('置き方(条件1)', () => {
  it('資料→ゴールを4等分した3点に、上の縁・下の縁へ交互に置く', () => {
    const s = labBaitSlots(-10000, 300, 200, 34);
    expect(s).toHaveLength(LAB_BAIT_COUNT);
    const xs = s.map(p => p.cx);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1]);
    expect(xs[0]).toBeCloseTo(-10000 + 10300 / 4);
    expect(s[0].cy).toBeLessThan(0);
    expect(s[1].cy).toBeGreaterThan(0);
    expect(s[2].cy).toBeLessThan(0);
  });
});

describe('発火(条件2)', () => {
  for (const halfW of [215, 640]) {
    it(`見えている半幅${halfW}: 生け贄がまだ画面の外のうちに発火し、追い越したら発火しない`, () => {
      const px = 0, dir = 1;
      const edge = halfW; // 進む向きの見えている端
      // 端の内側に入っていなければ発火しないのではなく「端+60 の内側」で発火=画面の外で起きる
      expect(labBaitShouldFire(px + edge + 60, px, dir, edge)).toBe(true);
      expect(labBaitShouldFire(px + edge + 61, px, dir, edge)).toBe(false);
      // 発火した瞬間、生け贄の中心は見えている端より外(体の半分以上が外)
      expect(px + edge + 60 - 17).toBeGreaterThan(px + edge);
      expect(labBaitShouldFire(px - 10, px, dir, edge)).toBe(false);
      expect(labBaitPassed(px - 10, px, dir)).toBe(true);
    });
  }
});

describe('突進(条件3・4)', () => {
  it('通り過ぎる筋はプレイヤーの横(重ならない)。帯からはみ出すなら反対側', () => {
    const y = labBaitLaneY(0, -170, 200, 34);
    expect(Math.abs(y - 0)).toBeGreaterThan(PLAYER_HALF + 17);
    expect(y).toBeLessThan(0); // 出た側(上)
    const yEdge = labBaitLaneY(-170, -180, 200, 34); // プレイヤーが上の縁: 上へはみ出す → 下を通る
    expect(yEdge).toBeGreaterThan(-170);
    expect(Math.abs(yEdge)).toBeLessThanOrEqual(200 - 17);
  });
  it('出だしは慣性で速さが乗り、着地点の手前で減速して止まる', () => {
    let x = 0, sp = 0;
    const speeds: number[] = [];
    for (let i = 0; i < 200; i++) {
      const r = stepLabBaitCharge(x, 0, -600, 0, sp, 300, 1 / 60);
      x = r.x; sp = r.speed; speeds.push(sp);
      if (r.arrived) break;
    }
    expect(speeds[0]).toBeLessThan(300 * 0.2);
    expect(Math.max(...speeds)).toBeCloseTo(300, 0);
    expect(speeds[speeds.length - 2]).toBeLessThan(300 * 0.4);
    expect(x).toBeCloseTo(-600);
  });
  it('W へ向かう間は減速しない(通り過ぎる勢いのまま)', () => {
    const r = stepLabBaitCharge(0, 0, -50, 0, 300, 300, 1 / 60, false);
    expect(r.speed).toBe(300);
  });
  it('突進の道(出発→W)はプレイヤーの箱から離れている', () => {
    const lane = labBaitLaneY(0, -170, 200, 34);
    const d = segPointDist(400, -170, 0, lane, 0, 0);
    expect(d).toBeGreaterThan(PLAYER_HALF + 17);
  });
  it('線分と壁の矩形の交差', () => {
    const wall = { x: -10, y: -10, width: 20, height: 20 };
    expect(segHitsRect(-100, 0, 100, 0, wall)).toBe(true);
    expect(segHitsRect(-100, 50, 100, 50, wall)).toBe(false);
    expect(segHitsRect(-100, 50, 100, 50, wall, 45)).toBe(true);
  });
});

describe('塊の登場(条件5・6)', () => {
  for (const halfW of [430 / LAB_BAIT_ZOOM / 2, 1280 / LAB_BAIT_ZOOM / 2]) {
    it(`見えている半幅${Math.round(halfW)}(引きのズーム込み): 隠した位置は画面の外、溜めの終わりは手の着く点=L・L は画面の中・立ち止まったプレイヤーは円の外`, () => {
      const pcx = 0, dir = 1;
      const lx = pcx - dir * labBaitLandDist();
      // 溜めの間もプレイヤーは歩き続ける(歩き150px/s×溜め0.62秒)。カメラは今の距離で寄せる。
      const walked = 150 * 0.62;
      const pcxHit = pcx + dir * walked;
      const leadStart = labBaitCamLead(labBaitLandDist(), halfW, 40, halfW * 2, halfW * 2 * 0.2);
      const leadHit = labBaitCamLead(Math.abs(lx - pcxHit), halfW, 40, halfW * 2, halfW * 2 * 0.2);
      // カメラは後ろへ lead 寄る。進む向きの先読み(最大40)のぶん後ろが狭くなる=最悪の側で見る。
      const behindEdge = halfW + leadStart - 40;
      const sx = labBaitWarpX(pcx, dir, behindEdge);
      const startRect = crawlerRect({ x: sx, y: 150 });
      const viewLeft = pcx - behindEdge;
      expect(startRect.x + startRect.width).toBeLessThan(viewLeft); // 箱が丸ごと画面の外(後ろ)
      const end = labBaitCrawlerPosForSlam(lx, 117, dir);
      const slam = crawlerSlamCenter(end);
      expect(slam.x).toBeCloseTo(lx);
      expect(lx).toBeGreaterThan(viewLeft + 40); // 置き直しの瞬間、L は見えている
      expect(lx).toBeGreaterThan(pcxHit - (halfW + leadHit - 40) + 40); // 当たる瞬間も L は見えている
      expect(pcxHit).toBeLessThan(pcxHit - (halfW + leadHit - 40) + halfW * 2); // プレイヤーも画面の中
      expect(Math.hypot(slam.x - pcxHit, slam.y - 117)).toBeGreaterThan(CRAWLER_SLAM_RADIUS + PLAYER_HALF); // 歩き続けていれば当たらない
      expect(Math.hypot(slam.x - pcx, slam.y - 117)).toBeLessThan(CRAWLER_SLAM_RADIUS + PLAYER_HALF); // 立ち止まると当たる(赤い円を見て前へ)
      // 這い込み: 溜めの前半で寄り切り、後半は動かない
      const a = labBaitLungePos(sx, 150, end.x, end.y, LAB_BAIT_LUNGE_FRAC);
      expect(a.x).toBeCloseTo(end.x);
      const mid = labBaitLungePos(sx, 150, end.x, end.y, LAB_BAIT_LUNGE_FRAC / 2);
      expect(mid.x).toBeGreaterThan(sx);
      expect(mid.x).toBeLessThan(end.x);
      expect(Math.abs(end.x - sx)).toBeGreaterThan(0);
      expect(CRAWLER_HIT_W).toBeGreaterThan(0);
    });
  }
  it('カメラの寄せは上限(画面幅45%・前の2割は残す)を超えない・既定より小さくしない', () => {
    const half = 430 / LAB_BAIT_ZOOM / 2;
    const lead = labBaitCamLead(10000, half, 40, 430, 86);
    expect(lead).toBeLessThanOrEqual(430 * LAB_BAIT_CAM_MAX_FRAC);
    expect(half - lead - 40).toBeGreaterThanOrEqual(0.2 * 2 * half - 1e-6); // 前に見えている幅の2割
    expect(labBaitCamLead(0, 640, 40, 1280, 256)).toBe(256);
  });
});

describe('スロー(条件7)', () => {
  it('二段: 這い込みと溜めの大半は重さの残る倍率、手が落ちる最後の区間で一番遅くなり、当たる瞬間が一番遅い所に入る', () => {
    const W = 620;
    const a = labBaitSlowParams(W, 'a');
    expect(a.scale).toBe(LAB_BAIT_SLOW_A);
    // 一段目の保持がちょうど「二段目に入るゲーム時刻」まで続く
    expect(a.holdMs * LAB_BAIT_SLOW_A).toBeCloseTo(W - LAB_BAIT_SLOW_B_GAME_MS);
    const b = labBaitSlowParams(LAB_BAIT_SLOW_B_GAME_MS, 'b');
    let game = 0, real = 0;
    while (game < LAB_BAIT_SLOW_B_GAME_MS && real < 10000) { game += computeTimeSlowScale(real, 0, b.durationMs, b.scale, b.holdMs); real += 1; }
    expect(computeTimeSlowScale(real, 0, b.durationMs, b.scale, b.holdMs)).toBeCloseTo(LAB_BAIT_SLOW_B);
    expect(labBaitRealMsToHit(W)).toBeCloseTo((W - LAB_BAIT_SLOW_B_GAME_MS) / LAB_BAIT_SLOW_A + LAB_BAIT_SLOW_B_GAME_MS / LAB_BAIT_SLOW_B);
  });
});

describe('這い込みの二拍(慣性)', () => {
  it('前へ6割→一拍止まる→詰めて少し行き過ぎて戻る。各区間は止まりから加速して止まる', () => {
    expect(labBaitLungeProgress(0, 0.02)).toBe(0);
    expect(labBaitLungeProgress(0.01, 0.02)).toBeLessThan(0.001); // 出だしは0から(湧いて見えない)
    expect(labBaitLungeProgress(0.6, 0.02)).toBeCloseTo(0.6);
    expect(labBaitLungeProgress(0.7, 0.02)).toBeCloseTo(0.6);
    expect(labBaitLungeProgress(0.92, 0.02)).toBeCloseTo(1.02);
    expect(labBaitLungeProgress(1, 0.02)).toBeCloseTo(1);
  });
  it('場面の間だけ引く(突進の頭から)', () => {
    expect(labBaitZoomTarget(null)).toBeNull();
    const base = { k: 1, baitId: 'b', dir: 1, firedAt: 0, wx: 0, wy: 0, lx: 0, ly: 0, viaW: false, speed: 0, hideX: null, hideY: 0, lunge: null, slowB: false, endAt: 0 };
    expect(labBaitZoomTarget({ ...base, phase: 'charge', passed: false })).toBe(LAB_BAIT_ZOOM);
    expect(labBaitZoomTarget({ ...base, phase: 'charge', passed: true })).toBe(LAB_BAIT_ZOOM);
    expect(labBaitZoomTarget({ ...base, phase: 'lunge', passed: true })).toBe(LAB_BAIT_ZOOM);
  });
});
