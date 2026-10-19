import { describe, it, expect } from 'vitest';
import {
  createLabCrawler, stepLabCrawler, crawlerRect, crawlerCenter, crawlerSlamCenter, crawlerSolid,
  crawlerTelegraphProg, crawlerAttackFrame, crawlerShouldWake, crawlerRouteProgress,
  CRAWLER_START_DIST_PX, CRAWLER_MAX_SPEED, CRAWLER_HIT_W, CRAWLER_HIT_H, CRAWLER_WINDUP_MS, CRAWLER_RECOVER_MS,
  CRAWLER_SLAM_RADIUS, CRAWLER_ABSORB_TO_ASCEND, CRAWLER_ASCEND_MS, CRAWLER_ATTACK_IMPACT_FRAME, CRAWLER_WAKE_PROGRESS,
  CRAWLER_SLAM_KB, CRAWLER_MAX_SPEED_Y,
  type LabCrawler, type CrawlerStepInput, type CrawlerTarget,
} from './labCrawler';
import { rectsOverlap, resolveAabb, type Rect } from './obstacles';
import { clampRectToPlayableArea, isRectInPlayableArea, type PlayableAreaCtx } from './playableArea';
import { LAB_CORRIDOR_Y_LIMIT_PX } from './labWalls';
import { LAB_VISION_RANGE } from '../utils/labStealth';

const LAB: PlayableAreaCtx = { farBackdrop: '', labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false };
const PW = 28;
const playerAt = (cx: number, cy: number): Rect => ({ x: cx - PW / 2, y: cy - PW / 2, width: PW, height: PW });
const playerTarget = (p: Rect): CrawlerTarget => ({ id: 'player', isPlayer: true, cx: p.x + p.width / 2, cy: p.y + p.height / 2, r: PW / 2 });
const awake = (c: LabCrawler): LabCrawler => ({ ...c, awake: true });
const input = (gameTime: number, dt: number, player: Rect, extra: Partial<CrawlerStepInput> = {}): CrawlerStepInput => ({
  gameTime, dt, player, targets: [playerTarget(player)], obstacles: [], playable: LAB, ...extra,
});

/** dt秒刻みで total秒回す。プレイヤーは固定。 */
const run = (c0: LabCrawler, player: Rect, totalS: number, dt = 1 / 60, t0 = 0, extra: Partial<CrawlerStepInput> = {}) => {
  let c: LabCrawler | null = c0;
  let t = t0;
  const speeds: number[] = [];
  const steps = Math.round(totalS / dt);
  for (let i = 0; i < steps && c; i++) {
    t += dt * 1000;
    const r = stepLabCrawler(c, input(t, dt, player, extra));
    c = r.next;
    if (c) speeds.push(Math.hypot(c.vx, c.vy));
  }
  return { c, t, speeds };
};

describe('ステージ2の這う塊: 配置と起床', () => {
  it('スタートからアイドルの方へ600px・廊下の中央・原点の方を向いて待機', () => {
    const c = createLabCrawler({ x: 7000, y: 10 });
    expect(c.x).toBe(CRAWLER_START_DIST_PX);
    expect(crawlerCenter(c).y).toBe(0);
    expect(c.facingLeft).toBe(true);
    expect(c.awake).toBe(false);
    expect(c.goalX).toBe(-7000);
    const l = createLabCrawler({ x: -6500, y: 0 });
    expect(l.x).toBe(-CRAWLER_START_DIST_PX);
    expect(l.facingLeft).toBe(false);
  });

  it('順路(原点→資料)を20%進むと起きる。手前では起きない', () => {
    const goalX = -7000;
    expect(crawlerRouteProgress(-1400, goalX)).toBeCloseTo(0.2);
    expect(crawlerShouldWake(-1399, goalX)).toBe(false);
    expect(crawlerShouldWake(-1400, goalX)).toBe(true);
    expect(crawlerShouldWake(500, goalX)).toBe(false); // 資料と逆(塊の側)へ行っても起きない
    expect(CRAWLER_WAKE_PROGRESS).toBe(0.2);
  });

  it('近づくと起きる(研究所の休眠敵と同じ視界を、箱の縁から測る・壁越しでは起きない)', () => {
    const c0 = createLabCrawler({ x: 7000, y: 0 });
    const r = crawlerRect(c0);
    const cc = crawlerCenter(c0);
    const near = playerAt(r.x - LAB_VISION_RANGE + 5, cc.y);
    const w = stepLabCrawler(c0, input(1000, 1 / 60, near));
    expect(w.woke).toBe(true);
    expect(w.next!.awake).toBe(true);
    const outside = playerAt(r.x - LAB_VISION_RANGE - 5, cc.y);
    expect(stepLabCrawler(c0, input(1000, 1 / 60, outside)).woke).toBe(false);
    // 帯の縁(箱の上の隙間)を通っても起きる=中心から測ると抜けられた穴を塞ぐ
    const edge = playerAt(cc.x, r.y - 30);
    expect(stepLabCrawler(c0, input(1000, 1 / 60, edge)).woke).toBe(true);
    const wall: Rect = { x: r.x - 60, y: cc.y - 50, width: 20, height: 100 };
    expect(stepLabCrawler(c0, input(1000, 1 / 60, near, { obstacles: [wall] })).woke).toBe(false);
  });

  it('待機中は動かない・攻撃しない(視界の外なら手前に居ても)。起きたら戻らない', () => {
    const c0 = createLabCrawler({ x: 7000, y: 0 });
    const near = playerAt(crawlerRect(c0).x - LAB_VISION_RANGE - 30, 0);
    const r = run(c0, near, 3);
    expect(r.c!.x).toBe(c0.x);
    expect(r.c!.state).toBe('move');
    expect(r.c!.awake).toBe(false);
    // 20%を越えた瞬間に起きる(woke=アテンションの合図)。
    const far = playerAt(-1500, 0);
    const w = stepLabCrawler(c0, input(1000, 1 / 60, far));
    expect(w.woke).toBe(true);
    expect(w.next!.awake).toBe(true);
    // 戻っても寝ない。
    const back = stepLabCrawler(w.next!, input(1100, 1 / 60, playerAt(0, 0)));
    expect(back.next!.awake).toBe(true);
    expect(back.woke).toBe(false);
    // 別のアテンション中は待たされ、明けたら起きる。
    const blocked = stepLabCrawler(c0, input(1000, 1 / 60, far, { wakeBlocked: true }));
    expect(blocked.woke).toBe(false);
    expect(blocked.next!.awake).toBe(false);
  });
});

describe('ステージ2の這う塊: 移動', () => {
  it('横の最高速度18px/秒を超えない・加減速がある(いきなり最高速にならない)', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    const r = run(c0, playerAt(-3000, 0), 10); // 高さは同じ=縦は動かない
    expect(Math.max(...r.speeds)).toBeLessThanOrEqual(CRAWLER_MAX_SPEED + 1e-9);
    expect(r.speeds[0]).toBeLessThan(CRAWLER_MAX_SPEED * 0.1); // 1フレーム目はほぼ止まっている
    // 0.8秒(時定数)で約6割・3秒でほぼ最高速
    expect(r.speeds[47]).toBeGreaterThan(CRAWLER_MAX_SPEED * 0.5);
    expect(r.speeds[47]).toBeLessThan(CRAWLER_MAX_SPEED * 0.75);
    expect(r.speeds[180]).toBeGreaterThan(CRAWLER_MAX_SPEED * 0.95);
    // 止まる時も慣性(目標0へ減速)
    const stop = run({ ...r.c!, state: 'windup', stateAt: r.t, hitAt: r.t + 99999 }, playerAt(-3000, 0), 0.5, 1 / 60, r.t);
    expect(stop.speeds[0]).toBeGreaterThan(CRAWLER_MAX_SPEED * 0.9);
    expect(stop.speeds[stop.speeds.length - 1]).toBeLessThan(stop.speeds[0]);
  });

  it('画面外(遠く)でもプレイヤーへ近づき続ける', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    const p = playerAt(-4000, 0);
    const r = run(c0, p, 20);
    expect(r.c!.x).toBeLessThan(c0.x - 300);
    expect(r.c!.x).toBeGreaterThan(c0.x - 20 * CRAWLER_MAX_SPEED - 1);
  });

  it('帯の外へ出ない(プレイヤーが帯の端に居ても箱の中心は帯の中)', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    const r = run(c0, playerAt(c0.x - 2000, 5000), 60);
    const cc = crawlerCenter(r.c!);
    expect(Math.abs(cc.y)).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX + 1e-6);
    const r2 = run(c0, playerAt(c0.x - 2000, -5000), 60);
    expect(Math.abs(crawlerCenter(r2.c!).y)).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX + 1e-6);
  });

  it('プレイヤーを壁に挟まない(押し先が壁なら塊の方が止まる)・重なり込まない', () => {
    // プレイヤーのすぐ左に壁。塊は右から這ってくる。
    const p = playerAt(0, -CRAWLER_HIT_H / 2);
    const wall: Rect = { x: p.x - 60, y: -200, width: 60, height: 400 };
    let c: LabCrawler = { ...awake(createLabCrawler({ x: 7000, y: 0 })), x: p.x + PW + CRAWLER_HIT_W / 2 + 2, y: 0, facingLeft: true, nextAttackAt: Infinity };
    let pl = p;
    let t = 0;
    for (let i = 0; i < 60 * 20; i++) {
      t += 1000 / 60;
      const r = stepLabCrawler(c, { gameTime: t, dt: 1 / 60, player: pl, targets: [], obstacles: [wall], playable: LAB });
      c = r.next!;
      if (r.playerPush) pl = { ...pl, x: pl.x + r.playerPush.dx, y: pl.y + r.playerPush.dy };
      expect(rectsOverlap(pl, wall)).toBe(false);
      expect(rectsOverlap(crawlerRect(c), pl)).toBe(false);
    }
  });

  it('壁が無ければ這ってきた塊はプレイヤーを押す(帯の中だけ)', () => {
    const p = playerAt(0, -CRAWLER_HIT_H / 2);
    const c: LabCrawler = { ...awake(createLabCrawler({ x: 7000, y: 0 })), x: p.x + PW + CRAWLER_HIT_W / 2 - 0.5, y: 0, vx: -CRAWLER_MAX_SPEED, facingLeft: true, nextAttackAt: Infinity };
    const r = stepLabCrawler(c, { gameTime: 16, dt: 1 / 60, player: p, targets: [], obstacles: [], playable: LAB });
    expect(r.playerPush).not.toBeNull();
    expect(r.playerPush!.dx).toBeLessThan(0);
  });
});

describe('ステージ2の這う塊: 叩きつけ(★赤い予告の掟)', () => {
  const setup = () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    const s = crawlerSlamCenter(c0);
    return { c0, p: playerAt(s.x, s.y) };
  };

  it('予告は溜め開始と同時に出て、当たる時刻に消え切る。当たるのは溜め開始で固定した円', () => {
    const { c0, p } = setup();
    const r0 = stepLabCrawler(c0, input(1000, 1 / 60, p));
    const c1 = r0.next!;
    expect(c1.state).toBe('windup');
    expect(c1.stateAt).toBe(1000);
    expect(c1.hitAt).toBe(1000 + CRAWLER_WINDUP_MS);
    // 出る時刻=溜め開始(その瞬間から描く)
    expect(crawlerTelegraphProg(c1, c1.stateAt)).toBe(0);
    // 当たる直前まで出ていて、当たる時刻に消え切る(1に達する)
    expect(crawlerTelegraphProg(c1, c1.hitAt - 0.001)).toBeCloseTo(1, 4);
    expect(crawlerTelegraphProg(c1, c1.hitAt)).toBeNull();
    // 手が地面に着くコマ=当たる時刻
    expect(crawlerAttackFrame(c1, c1.hitAt - 1)).toBe(CRAWLER_ATTACK_IMPACT_FRAME - 1);
    // プレイヤーが溜め中に逃げても円は追わない
    const moved = playerAt(-500, 0);
    const mid = stepLabCrawler(c1, input(1500, 0.5, moved)).next!;
    expect(mid.slamX).toBe(c1.slamX);
    expect(mid.slamY).toBe(c1.slamY);
    // 当たる時刻のステップで叩きつけが出る
    const hit = stepLabCrawler(mid, input(c1.hitAt, 1 / 60, moved));
    expect(hit.slam).toEqual({ x: c1.slamX, y: c1.slamY, radius: CRAWLER_SLAM_RADIUS });
    expect(hit.next!.state).toBe('recover');
    expect(crawlerAttackFrame(hit.next!, c1.hitAt)).toBe(CRAWLER_ATTACK_IMPACT_FRAME);
    // 当たる時刻より前のステップでは出ない
    expect(stepLabCrawler(mid, input(c1.hitAt - 1, 1 / 60, moved)).slam).toBeNull();
  });

  it('攻撃中は前へ進まない(慣性で減速するだけ・加速しない)', () => {
    const { c0, p } = setup();
    const moving: LabCrawler = { ...c0, vx: -CRAWLER_MAX_SPEED, vy: 0 };
    let c = stepLabCrawler(moving, input(1000, 1 / 60, p)).next!;
    expect(c.state).toBe('windup');
    const x0 = c.x;
    let prev = Math.hypot(c.vx, c.vy);
    let t = 1000;
    while (c.state === 'windup' || c.state === 'recover') {
      t += 1000 / 60;
      c = stepLabCrawler(c, input(t, 1 / 60, p)).next!;
      if (c.state === 'move') break; // 戻りが明けて動き出した(=攻撃が終わった)
      const sp = Math.hypot(c.vx, c.vy);
      expect(sp).toBeLessThanOrEqual(prev + 1e-9);
      prev = sp;
    }
    expect(Math.abs(c.x - x0)).toBeLessThan(CRAWLER_MAX_SPEED * 0.8 + 0.5); // 慣性の滑りぶんだけ(v0×τ)
  });

  it('戻りの後は間を空けてから次の攻撃', () => {
    const { c0, p } = setup();
    const c1 = stepLabCrawler(c0, input(1000, 1 / 60, p)).next!;
    const c2 = stepLabCrawler(c1, input(c1.hitAt, 1 / 60, p)).next!;
    const c3 = stepLabCrawler(c2, input(c1.hitAt + CRAWLER_RECOVER_MS, 1 / 60, p)).next!;
    expect(c3.state).toBe('move');
    expect(stepLabCrawler(c3, input(c3.nextAttackAt - 10, 1 / 60, p)).next!.state).toBe('move');
    expect(stepLabCrawler(c3, input(c3.nextAttackAt, 1 / 60, p)).next!.state).toBe('windup');
  });

  it('吹き飛び(塊から離れる向き・300px)は壁の中・帯の外へ出ない(プレイヤーの移動の鎖=壁→帯)', () => {
    // 吹き飛びの速度は持続時間で1→0へ直線的に減衰(gameStore の knockback と同じ形)。
    const v0 = (CRAWLER_SLAM_KB.distPx * 2) / (CRAWLER_SLAM_KB.ms / 1000);
    const wall: Rect = { x: -260, y: -60, width: 40, height: 120 };
    for (const dir of [{ x: -1, y: 0 }, { x: -0.6, y: 0.8 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      let p = playerAt(0, 150);
      let total = 0;
      for (let ms = 0; ms < CRAWLER_SLAM_KB.ms; ms += 1000 / 60) {
        const sp = v0 * (1 - ms / CRAWLER_SLAM_KB.ms);
        const cand = { ...p, x: p.x + dir.x * sp / 60, y: p.y + dir.y * sp / 60 };
        const r = resolveAabb(cand, [wall]);
        const c = clampRectToPlayableArea(r.x, r.y, p.width, p.height, LAB);
        total += Math.hypot(c.x - p.x, c.y - p.y);
        p = { ...p, x: c.x, y: c.y };
        expect(rectsOverlap(p, wall)).toBe(false);
        expect(isRectInPlayableArea(p.x, p.y, p.width, p.height, LAB)).toBe(true);
      }
      if (dir.x === 0 && dir.y === -1) expect(total).toBeGreaterThan(250); // 塞がれない向きは大きく飛ぶ
    }
  });
});

describe('ステージ2の這う塊: 取り込みと昇天', () => {
  const mob = (id: string, cx: number, cy: number): CrawlerTarget => ({ id, isPlayer: false, cx, cy, r: 14, type: 'zombie', footY: cy + 14, w: 28, h: 28 });

  it('円の中の雑魚を取り込み、円の外は取り込まない', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    const s = crawlerSlamCenter(c0);
    const p = playerAt(-3000, 0);
    const targets = [playerTarget(p), mob('in', s.x, s.y), mob('edge', s.x - CRAWLER_SLAM_RADIUS - 10, s.y), mob('out', s.x - 400, s.y)];
    const c1 = stepLabCrawler(c0, input(1000, 1 / 60, p, { targets })).next!;
    expect(c1.state).toBe('windup'); // 雑魚が手の届く所に居れば攻撃する
    const hit = stepLabCrawler(c1, input(c1.hitAt, 1 / 60, p, { targets }));
    expect(hit.absorbIds.sort()).toEqual(['edge', 'in']);
    expect(hit.next!.absorbed).toBe(2);
    expect(hit.next!.absorbing.map(a => a.id).sort()).toEqual(['edge', 'in']);
  });

  it('10体取り込むと(戻りの後に)昇天が始まり、昇天中は判定なし、終わると消える', () => {
    const c0 = { ...awake(createLabCrawler({ x: 7000, y: 0 })), absorbed: CRAWLER_ABSORB_TO_ASCEND - 1 };
    const s = crawlerSlamCenter(c0);
    const p = playerAt(-3000, 0);
    const targets = [mob('last', s.x, s.y)];
    const c1 = stepLabCrawler(c0, input(1000, 1 / 60, p, { targets })).next!;
    const c2 = stepLabCrawler(c1, input(c1.hitAt, 1 / 60, p, { targets })).next!;
    expect(c2.absorbed).toBe(CRAWLER_ABSORB_TO_ASCEND);
    expect(c2.state).toBe('recover');
    const c3 = stepLabCrawler(c2, input(c1.hitAt + CRAWLER_RECOVER_MS, 1 / 60, p, { targets: [] })).next!;
    expect(c3.state).toBe('ascend');
    expect(crawlerSolid(c3)).toBe(false);
    // 昇天中は攻撃しない(目の前に居ても)
    const pn = playerAt(crawlerSlamCenter(c3).x, crawlerSlamCenter(c3).y);
    const c4 = stepLabCrawler(c3, input(c3.stateAt + 500, 1 / 60, pn)).next!;
    expect(c4.state).toBe('ascend');
    expect(stepLabCrawler(c4, input(c3.stateAt + CRAWLER_ASCEND_MS, 1 / 60, pn)).next).toBeNull();
  });

  it('9体では昇天しない', () => {
    const c0 = { ...awake(createLabCrawler({ x: 7000, y: 0 })), absorbed: CRAWLER_ABSORB_TO_ASCEND - 2 };
    const s = crawlerSlamCenter(c0);
    const p = playerAt(-3000, 0);
    const targets = [mob('a', s.x, s.y)];
    const c1 = stepLabCrawler(c0, input(1000, 1 / 60, p, { targets })).next!;
    const c2 = stepLabCrawler(c1, input(c1.hitAt, 1 / 60, p, { targets })).next!;
    const c3 = stepLabCrawler(c2, input(c1.hitAt + CRAWLER_RECOVER_MS, 1 / 60, p, { targets: [] })).next!;
    expect(c3.state).toBe('move');
  });
});

describe('ステージ2の這う塊: 当たり判定の寸法', () => {
  it('足元基準の箱(下辺=足元)', () => {
    const r = crawlerRect({ x: 100, y: 50 });
    expect(r).toEqual({ x: 100 - CRAWLER_HIT_W / 2, y: 50 - CRAWLER_HIT_H, width: CRAWLER_HIT_W, height: CRAWLER_HIT_H });
  });
});

describe('ステージ2の這う塊: 通路の塞ぎ方(社長決定「bで、ただし上下にも移動する」)', () => {
  const inBandFree = (c: LabCrawler, cy: number): boolean => {
    const p = playerAt(c.x, cy);
    return isRectInPlayableArea(p.x, p.y, p.width, p.height, LAB) && !rectsOverlap(p, crawlerRect(c));
  };
  it('真ん中にいる時は上下にプレイヤーが通れる隙間が残る(それぞれ約50)', () => {
    const c = createLabCrawler({ x: 7000, y: 0 });
    expect(crawlerCenter(c).y).toBe(0);
    const r = crawlerRect(c);
    expect(-LAB_CORRIDOR_Y_LIMIT_PX - (r.y - 0)).toBeLessThan(0);
    expect(r.y - (-LAB_CORRIDOR_Y_LIMIT_PX)).toBe(50);
    expect(LAB_CORRIDOR_Y_LIMIT_PX - (r.y + r.height)).toBe(50);
    expect(50).toBeGreaterThan(PW); // プレイヤーの箱より広い
    expect(inBandFree(c, -LAB_CORRIDOR_Y_LIMIT_PX + 20)).toBe(true);
    expect(inBandFree(c, LAB_CORRIDOR_Y_LIMIT_PX - 20)).toBe(true);
  });
  it('上へ寄った時は上の隙間が閉じる(下だけ広がる)', () => {
    const c: LabCrawler = { ...createLabCrawler({ x: 7000, y: 0 }), y: -LAB_CORRIDOR_Y_LIMIT_PX + CRAWLER_HIT_H / 2 + CRAWLER_HIT_H / 2 };
    // 箱の中心=-50 → 上の隙間0
    expect(crawlerCenter(c).y).toBe(-50);
    for (let cy = -LAB_CORRIDOR_Y_LIMIT_PX; cy <= crawlerRect(c).y; cy += 4) expect(inBandFree(c, cy)).toBe(false);
    expect(inBandFree(c, LAB_CORRIDOR_Y_LIMIT_PX - 20)).toBe(true);
  });
  it('プレイヤーの高さを追う(縦は最高70px/秒・慣性つき・帯の外へ出ない)。待機中は動かない', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    const r = run(c0, playerAt(-3000, -190), 6);
    let maxVy = 0;
    let c: LabCrawler = c0; let t = 0;
    for (let i = 0; i < 60 * 6; i++) {
      t += 1000 / 60;
      c = stepLabCrawler(c, input(t, 1 / 60, playerAt(-3000, i < 180 ? -190 : 190))).next!;
      maxVy = Math.max(maxVy, Math.abs(c.vy));
      expect(Math.abs(c.vx)).toBeLessThanOrEqual(CRAWLER_MAX_SPEED + 1e-9);
      expect(Math.abs(crawlerCenter(c).y)).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX + 1e-6);
    }
    expect(maxVy).toBeLessThanOrEqual(CRAWLER_MAX_SPEED_Y + 1e-9);
    expect(maxVy).toBeGreaterThan(CRAWLER_MAX_SPEED_Y * 0.8);
    expect(crawlerCenter(r.c!).y).toBeLessThan(-150); // 上へ寄った
    const sleeping = run(createLabCrawler({ x: 7000, y: 0 }), playerAt(3000, -190), 3);
    expect(sleeping.c!.y).toBe(CRAWLER_HIT_H / 2);
  });
  it('壁・プロップでは止まらない(肉が乗り越える)=画面外でも追い続ける', () => {
    const c0: LabCrawler = awake(createLabCrawler({ x: 7000, y: 0 }));
    const wall: Rect = { x: 300, y: -60, width: 120, height: 120 };
    const r = run(c0, playerAt(-1000, 0), 60, 1 / 60, 0, { obstacles: [wall] });
    expect(c0.x - r.c!.x).toBeGreaterThan(18 * 60 * 0.9);
  });
});

describe('ステージ2の這う塊: プレイヤーを敵の壁と挟まない', () => {
  it('押し先が噛みつき敵の足元の壁(playerBlockers)なら押さずに塊が止まる', () => {
    const p = playerAt(0, -CRAWLER_HIT_H / 2);
    const biteWall: Rect = { x: p.x - 30, y: p.y - 10, width: 30, height: 48 }; // プレイヤーのすぐ左
    let c: LabCrawler = { ...awake(createLabCrawler({ x: 7000, y: 0 })), x: p.x + PW + CRAWLER_HIT_W / 2 + 1, y: 0, facingLeft: true, nextAttackAt: Infinity };
    let pl = p;
    let t = 0;
    let pressed = false;
    for (let i = 0; i < 60 * 10; i++) {
      t += 1000 / 60;
      const r = stepLabCrawler(c, { gameTime: t, dt: 1 / 60, player: pl, targets: [], obstacles: [], playerBlockers: [biteWall], playable: LAB });
      c = r.next!;
      if (r.playerPush) pl = { ...pl, x: pl.x + r.playerPush.dx, y: pl.y + r.playerPush.dy };
      expect(rectsOverlap(pl, biteWall)).toBe(false);
      expect(rectsOverlap(crawlerRect(c), pl)).toBe(false);
      pressed ||= c.pressing;
    }
    expect(pressed).toBe(true); // 押し止められている間は「もがく」印が立つ(描画用)
  });
});

describe('ステージ2の這う塊: 叩きつけのコマ割り(見え方だけ・当たる時刻は不変)', () => {
  it('溜めは頂点ほど長く、手が着くコマ7の頭=当たる時刻、着地のコマを止めてから早送り', () => {
    const c = { state: 'windup' as const, stateAt: 0, hitAt: CRAWLER_WINDUP_MS };
    expect(crawlerAttackFrame(c, 0)).toBe(0);
    expect(crawlerAttackFrame(c, 89)).toBe(0);
    expect(crawlerAttackFrame(c, 90)).toBe(1);
    expect(crawlerAttackFrame(c, CRAWLER_WINDUP_MS - 231)).toBe(5);
    expect(crawlerAttackFrame(c, CRAWLER_WINDUP_MS - 229)).toBe(6);
    expect(crawlerAttackFrame(c, CRAWLER_WINDUP_MS - 1)).toBe(6);
    const r = { state: 'recover' as const, stateAt: CRAWLER_WINDUP_MS, hitAt: CRAWLER_WINDUP_MS };
    expect(crawlerAttackFrame(r, CRAWLER_WINDUP_MS)).toBe(CRAWLER_ATTACK_IMPACT_FRAME);
    expect(crawlerAttackFrame(r, CRAWLER_WINDUP_MS + 170)).toBe(CRAWLER_ATTACK_IMPACT_FRAME);
    expect(crawlerAttackFrame(r, CRAWLER_WINDUP_MS + CRAWLER_RECOVER_MS - 1)).toBe(15);
  });
});
