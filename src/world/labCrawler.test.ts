import { describe, it, expect } from 'vitest';
import {
  createLabCrawler, stepLabCrawler, crawlerRect, crawlerCenter, crawlerSlamCenter, crawlerSolid,
  crawlerTelegraphProg, crawlerAttackFrame, crawlerShouldWake, crawlerRouteProgress,
  CRAWLER_START_DIST_PX, CRAWLER_MAX_SPEED, crawlerSlamDamage, crawlerRushing, CRAWLER_RUSH_RANGE_PX, CRAWLER_RUSH_SPEED, CRAWLER_HIT_W, CRAWLER_HIT_H, CRAWLER_WINDUP_MS, CRAWLER_RECOVER_MS,
  CRAWLER_SLAM_RADIUS, CRAWLER_ASCEND_MS, CRAWLER_ATTACK_IMPACT_FRAME, CRAWLER_WAKE_PROGRESS,
  CRAWLER_SLAM_KB, CRAWLER_MAX_SPEED_Y,
  CRAWLER_HP, CRAWLER_CHASE_SPEED_MULT, CRAWLER_CHASE_SPAWN_MARGIN_PX, CRAWLER_CHASE_FIRST_ATTACK_MS, CRAWLER_COOLDOWN_MS,
  crawlerChaseSpawn, applyCrawlerDamage, crawlerObstacleHits, crawlerGapToPlayer,
  CRAWLER_CHASE_CATCHUP_GAP_PX, CRAWLER_CHASE_SLAM_ADVANCE_FRAC, CRAWLER_VANISH_GOAL_DIST_PX, CRAWLER_VANISH_MS, CRAWLER_VANISH_HOLD_MS, crawlerReachedGoal, crawlerGoalDir, crawlerVanishLook,
  approachCrawlerSpeed, CRAWLER_ACCEL_PX_S2, CRAWLER_DECEL_PX_S2,
  crawlerSlamLunge, CRAWLER_SLAM_LUNGE_IN_MS, CRAWLER_SLAM_LUNGE_OUT_MS, CRAWLER_IMPACT_HOLD_MS,
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

  it('第2版: 取り込んだ数では昇天しない(社長「雑魚10体で昇天する仕様はやめる」)。取り込み(吸い込み)は残る', () => {
    const c0 = { ...awake(createLabCrawler({ x: 7000, y: 0 })), absorbed: 40 };
    const s = crawlerSlamCenter(c0);
    const p = playerAt(-3000, 0);
    const targets = [mob('a', s.x, s.y)];
    const c1 = stepLabCrawler(c0, input(1000, 1 / 60, p, { targets })).next!;
    const hit = stepLabCrawler(c1, input(c1.hitAt, 1 / 60, p, { targets }));
    expect(hit.absorbIds).toEqual(['a']);
    const c3 = stepLabCrawler(hit.next!, input(c1.hitAt + CRAWLER_RECOVER_MS, 1 / 60, p, { targets: [] })).next!;
    expect(c3.state).toBe('move');
    expect(crawlerSolid(c3)).toBe(true);
  });
});

describe('ステージ2の這う塊 第2版: 体力と昇天(社長「HPは37564」「HP0で倒せる(崩れて昇る)」)', () => {
  it('体力37564で始まり、当たった分だけ減る。0になったら昇天(判定なし)、昇天し終えると消える', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    expect(c0.hp).toBe(CRAWLER_HP);
    expect(CRAWLER_HP).toBe(37564);
    const a = applyCrawlerDamage(c0, 564, 1000);
    expect(a.died).toBe(false);
    expect(a.next.hp).toBe(37000);
    const b = applyCrawlerDamage(a.next, 99999, 2000);
    expect(b.died).toBe(true);
    expect(b.next.hp).toBe(0);
    expect(b.next.state).toBe('ascend');
    expect(crawlerSolid(b.next)).toBe(false);
    // 昇天中は追加のダメージを受けない・攻撃しない(目の前に居ても)
    expect(applyCrawlerDamage(b.next, 10, 2100).next).toBe(b.next);
    const pn = playerAt(crawlerSlamCenter(b.next).x, crawlerSlamCenter(b.next).y);
    const c4 = stepLabCrawler(b.next, input(2500, 1 / 60, pn)).next!;
    expect(c4.state).toBe('ascend');
    expect(stepLabCrawler(c4, input(2000 + CRAWLER_ASCEND_MS, 1 / 60, pn)).next).toBeNull();
  });

  it('溜めの最中に倒れたら叩きつけは出ない(赤い予告も消える)', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    const s = crawlerSlamCenter(c0);
    const p = playerAt(s.x, s.y);
    const c1 = stepLabCrawler(c0, input(1000, 1 / 60, p)).next!;
    expect(c1.state).toBe('windup');
    const dead = applyCrawlerDamage(c1, CRAWLER_HP, 1100).next;
    expect(crawlerTelegraphProg(dead, 1100)).toBeNull();
    const r = stepLabCrawler(dead, input(c1.hitAt, 1 / 60, p));
    expect(r.slam).toBeNull();
  });

  it('0以下のダメージは何もしない', () => {
    const c0 = awake(createLabCrawler({ x: 7000, y: 0 }));
    expect(applyCrawlerDamage(c0, 0, 1).next).toBe(c0);
    expect(applyCrawlerDamage(c0, -5, 1).next).toBe(c0);
    expect(applyCrawlerDamage(c0, NaN, 1).next).toBe(c0);
  });
});

describe('ステージ2の這う塊 第2版: 資料を拾った瞬間、前から出てくる', () => {
  it('プレイヤーの前方(資料の奥の向き)・画面のすぐ外に、箱の手前の縁が来る。プレイヤーの方を向き、起きて追跡を始める', () => {
    // 資料は左(goalX<0)。プレイヤーは資料の所(x=-7000)。
    const c0 = createLabCrawler({ x: 7000, y: 0 }); // 待機中(起きていない)でも回り込む
    const p = playerAt(-7000, 40);
    const halfW = 300;
    const c = crawlerChaseSpawn(c0, p, halfW, LAB, 5000)!;
    const r = crawlerRect(c);
    expect(r.x + r.width).toBeCloseTo(-7000 - halfW - CRAWLER_CHASE_SPAWN_MARGIN_PX); // 手前の縁=画面の端の少し外
    expect(c.awake).toBe(true);
    expect(c.chasing).toBe(true);
    expect(c.facingLeft).toBe(false); // 右(プレイヤー=原点の側)を向く
    expect(c.state).toBe('move');
    expect(c.vx).toBe(0); // 慣性: 止まった所から動き出す
    expect(c.nextAttackAt).toBe(5000 + CRAWLER_CHASE_FIRST_ATTACK_MS);
    expect(isRectInPlayableArea(r.x, r.y, r.width, r.height, LAB)).toBe(true);
    expect(rectsOverlap(r, p)).toBe(false);
    // 右に資料がある向きでも同じ(左右対称)
    const c1 = crawlerChaseSpawn(createLabCrawler({ x: -7000, y: 0 }), playerAt(7000, 0), halfW, LAB, 0)!;
    expect(crawlerRect(c1).x).toBeCloseTo(7000 + halfW + CRAWLER_CHASE_SPAWN_MARGIN_PX);
    expect(c1.facingLeft).toBe(true);
  });

  it('取り込み中の絵は持ち越さない・昇天中(倒れかけ)は回り込まない', () => {
    const c0 = { ...awake(createLabCrawler({ x: 7000, y: 0 })), absorbing: [{ id: 'z', type: 'zombie', x: 0, y: 0, w: 28, h: 28, at: 0 }] };
    expect(crawlerChaseSpawn(c0, playerAt(-7000, 0), 300, LAB, 0)!.absorbing).toEqual([]);
    const dying = applyCrawlerDamage(c0, CRAWLER_HP, 0).next;
    expect(crawlerChaseSpawn(dying, playerAt(-7000, 0), 300, LAB, 0)).toBeNull();
  });

  it('追跡の速さ=渡された速さ(プレイヤー×1.1)まで・慣性つき。近くでも突進の速さに切り替わらない', () => {
    expect(CRAWLER_CHASE_SPEED_MULT).toBeCloseTo(1.1);
    const p = playerAt(5000, 0); // ゴール(原点)から遠い所で(ゴール手前では沈んで消えるため)
    const c0 = crawlerChaseSpawn(createLabCrawler({ x: -7000, y: 0 }), p, 300, LAB, 0)!; // 資料は右=塊は右から来る
    const chaseSpeed = 104 * 1.2 * CRAWLER_CHASE_SPEED_MULT;
    const { c, speeds } = run(c0, p, 3, 1 / 60, 0, { chaseSpeed, targets: [] });
    expect(Math.abs(c!.vx)).toBeLessThanOrEqual(chaseSpeed + 1e-6);
    expect(speeds[0]).toBeLessThan(chaseSpeed * 0.2); // いきなり最高速にならない
    // 止まりからは徐々に(社長2026-10-20「止まりからは、徐々にスピードを上げる」): 1秒でまだ半分弱、3秒でほぼ最高速
    expect(Math.abs(speeds[59])).toBeLessThan(chaseSpeed * 0.5);
    expect(Math.abs(speeds[59])).toBeGreaterThan(chaseSpeed * 0.3);
    expect(Math.abs(c!.vx)).toBeGreaterThan(chaseSpeed * 0.9);
    expect(c!.vx).toBeLessThan(0); // プレイヤー(左)へ向かう
    // 突進の距離に入っても速さは追跡の速さのまま(突進135に上がらない)
    const slow = 50;
    const near = { ...c0, x: 5400, vx: 0 };
    const r2 = run(near, p, 3, 1 / 60, 0, { chaseSpeed: slow, targets: [] });
    expect(Math.max(...r2.speeds.map(Math.abs))).toBeLessThanOrEqual(Math.hypot(slow, CRAWLER_MAX_SPEED_Y) + 1e-6);
  });

  it('追跡中も手の届く雑魚には叩きつけを出し、その間は進まない(社長「敵を食べる時は攻撃するので結果的に一瞬止まる」)', () => {
    const p = playerAt(-3000, 0);
    let c = { ...crawlerChaseSpawn(createLabCrawler({ x: 7000, y: 0 }), p, 300, LAB, 0)!, x: -6000, y: CRAWLER_HIT_H / 2, nextAttackAt: 0 };
    // まず追跡の速さまで走らせる
    for (let i = 0; i < 120; i++) c = stepLabCrawler(c, input(i * 16, 1 / 60, p, { chaseSpeed: 150, targets: [] })).next!;
    expect(Math.abs(c.vx)).toBeGreaterThan(100);
    const s = crawlerSlamCenter(c);
    const mobT = { id: 'm', isPlayer: false, cx: s.x, cy: s.y, r: 14, type: 'zombie', footY: s.y + 14, w: 28, h: 28 };
    const t0 = 2000;
    let w = stepLabCrawler(c, input(t0, 1 / 60, p, { chaseSpeed: 150, targets: [mobT] })).next!;
    expect(w.state).toBe('windup');
    // 溜めと戻りの間に速さは0へ落ちていく(加速しない)
    let t = t0; let prev = Math.abs(w.vx);
    while (w.state !== 'move') {
      t += 16;
      w = stepLabCrawler(w, input(t, 1 / 60, p, { chaseSpeed: 150, targets: t < w.hitAt ? [mobT] : [] })).next!;
      if (w.state !== 'move') { expect(Math.abs(w.vx)).toBeLessThanOrEqual(prev + 1e-6); prev = Math.abs(w.vx); }
    }
    expect(prev).toBeLessThan(10); // 一瞬止まる
    expect(w.nextAttackAt).toBeGreaterThanOrEqual(t - 16 + CRAWLER_COOLDOWN_MS - 20);
  });
});

describe('ステージ2の這う塊 第2版: 壁を壊して進む(社長「この塊は壁を破壊して進む」)', () => {
  const ob = (id: string, x: number, y: number) => ({ id, rect: { x, y, width: 40, height: 20 } });
  it('起きている塊の箱に重なった壁・プロップだけが壊れる', () => {
    const c = awake(createLabCrawler({ x: 7000, y: 0 }));
    const r = crawlerRect(c);
    const hits = crawlerObstacleHits(c, [
      ob('in', r.x + 10, r.y + 10),
      ob('edge', r.x + r.width - 5, r.y + r.height - 5),
      ob('out', r.x + r.width + 5, r.y),
    ]);
    expect(hits.sort()).toEqual(['edge', 'in']);
  });
  it('待機中(開幕)と昇天中は壊さない', () => {
    const c = createLabCrawler({ x: 7000, y: 0 });
    const r = crawlerRect(c);
    expect(crawlerObstacleHits(c, [ob('in', r.x + 10, r.y + 10)])).toEqual([]);
    const dying = applyCrawlerDamage(awake(c), CRAWLER_HP, 0).next;
    expect(crawlerObstacleHits(dying, [ob('in', r.x + 10, r.y + 10)])).toEqual([]);
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
    expect(crawlerAttackFrame(c, 56)).toBe(0);
    expect(crawlerAttackFrame(c, 57)).toBe(1);
    expect(crawlerAttackFrame(c, CRAWLER_WINDUP_MS - 146)).toBe(5);
    expect(crawlerAttackFrame(c, CRAWLER_WINDUP_MS - 144)).toBe(6);
    expect(crawlerAttackFrame(c, CRAWLER_WINDUP_MS - 1)).toBe(6);
    const r = { state: 'recover' as const, stateAt: CRAWLER_WINDUP_MS, hitAt: CRAWLER_WINDUP_MS };
    expect(crawlerAttackFrame(r, CRAWLER_WINDUP_MS)).toBe(CRAWLER_ATTACK_IMPACT_FRAME);
    expect(crawlerAttackFrame(r, CRAWLER_WINDUP_MS + 120)).toBe(CRAWLER_ATTACK_IMPACT_FRAME);
    expect(crawlerAttackFrame(r, CRAWLER_WINDUP_MS + CRAWLER_RECOVER_MS - 1)).toBe(15);
  });
});

describe('ステージ2の這う塊: 5倍の1体(社長「これ一体で、でかくしてほしい。5倍くらい」)', () => {
  it('当たり判定の幅=描いた胴(165の5倍)の0.9倍・奥行き300', () => {
    expect(CRAWLER_HIT_W).toBe(Math.round(165 * 5 * 0.9));
    expect(CRAWLER_HIT_H).toBe(300);
  });
  it('叩きつけの円は手のひらの所で、箱の外(手の先)まで届く', () => {
    const c = createLabCrawler({ x: 7000, y: 0 });
    const r = crawlerRect(c);
    const s = crawlerSlamCenter(c); // 左向き
    expect(s.x - CRAWLER_SLAM_RADIUS).toBeLessThan(r.x); // 箱の左端より外へ届く
    expect(s.y).toBeGreaterThan(crawlerCenter(c).y); // 手は絵の下の方(箱の手前寄り)
    // 箱の左端に接して、箱の中ほどの高さに立つプレイヤーには当たる
    const p = playerAt(r.x - PW / 2, crawlerCenter(c).y);
    expect(Math.hypot(p.x + PW / 2 - s.x, p.y + PW / 2 - s.y)).toBeLessThanOrEqual(CRAWLER_SLAM_RADIUS + PW / 2);
  });
  it('吹き飛び(300px・塊の中心から離れる向き)で、箱の横に接していたプレイヤーは箱の外へ大きく出る', () => {
    const c = createLabCrawler({ x: 7000, y: 0 });
    const r = crawlerRect(c);
    const cc = crawlerCenter(c);
    const startCx = r.x - PW / 2; // 箱の左端に接している
    const dir = Math.sign(startCx - cc.x);
    const endCx = startCx + dir * CRAWLER_SLAM_KB.distPx;
    expect(r.x - (endCx + PW / 2)).toBeGreaterThanOrEqual(CRAWLER_SLAM_KB.distPx - 1);
  });
});

describe('ステージ2の這う塊: 社長調整2026-10-19(ダメージ50%・近くで突進)', () => {
  it('叩きつけのダメージ=最大体力の50%(満タンから1発では倒れない・2発で倒れる)', () => {
    expect(crawlerSlamDamage(120)).toBe(60);
    expect(crawlerSlamDamage(131)).toBe(66);
    expect(120 - crawlerSlamDamage(120)).toBeGreaterThan(0);
    expect(120 - 2 * crawlerSlamDamage(120)).toBeLessThanOrEqual(0);
  });
  it('近く(箱の縁から突進の距離以内)では突進、遠くではゆっくり', () => {
    const c = createLabCrawler({ x: 7000, y: 0 });
    const r = crawlerRect(c);
    const near = { x: r.x + r.width + CRAWLER_RUSH_RANGE_PX - 10, y: -14, width: 28, height: 28 };
    const far = { x: r.x + r.width + CRAWLER_RUSH_RANGE_PX + 50, y: -14, width: 28, height: 28 };
    expect(crawlerRushing(c, near)).toBe(true);
    expect(crawlerRushing(c, far)).toBe(false);
    expect(CRAWLER_RUSH_SPEED).toBeGreaterThan(104); // プレイヤーの素の速さより速い
  });
});


describe('ステージ2の這う塊 第2版(品質監査A1): 追跡中にプレイヤーを狙う叩きつけは進みながら溜める', () => {
  it('溜めの前半は追跡の速さで進み、赤い円も一緒に動く。後半は止まり円も止まる(社長決定=中間案0.5)。当たるのは最後に描いた円', () => {
    expect(CRAWLER_CHASE_SLAM_ADVANCE_FRAC).toBe(0.5);
    const chaseSpeed = 150;
    let c: LabCrawler = { ...crawlerChaseSpawn(createLabCrawler({ x: 7000, y: 0 }), playerAt(-7000, 0), 300, LAB, 0)!, x: -6000, y: CRAWLER_HIT_H / 2, nextAttackAt: 0, facingLeft: false, vx: chaseSpeed };
    const dt = 1 / 60;
    let t = 0;
    const p = playerAt(crawlerSlamCenter(c).x, 0);
    c = stepLabCrawler(c, input(t, dt, p, { chaseSpeed })).next!;
    expect(c.state).toBe('windup');
    expect(c.slamMoving).toBe(true);
    expect(crawlerTelegraphProg(c, t)).toBe(0); // 溜め開始で出る
    const half = c.stateAt + (c.hitAt - c.stateAt) * CRAWLER_CHASE_SLAM_ADVANCE_FRAC;
    const start = { x: c.slamX };
    let atHalf: number | null = null;
    let lastDrawn = { x: c.slamX, y: c.slamY };
    let slam: { x: number; y: number } | null = null;
    while (!slam) {
      t += dt * 1000;
      const r = stepLabCrawler(c, input(t, dt, p, { chaseSpeed }));
      if (r.slam) { slam = r.slam; break; }
      c = r.next!;
      if (t < half - 20) expect(Math.abs(c.vx)).toBeGreaterThan(chaseSpeed * 0.9); // 前半は進む
      if (atHalf === null && t >= half + 20) atHalf = c.slamX;
      lastDrawn = { x: c.slamX, y: c.slamY };
    }
    expect(atHalf! - start.x).toBeGreaterThan(30); // 前半で円は前へ動いた
    expect(lastDrawn.x).toBeCloseTo(atHalf!, 5); // 後半は円が止まる
    expect(slam.x).toBeCloseTo(lastDrawn.x); // 当たる円=最後に描いた円
  });

  it('真っすぐ走って逃げれば、溜めの後半の間に円の外へ出られる(10%遅いプレイヤーでも)', () => {
    const chaseSpeed = 150;
    let c: LabCrawler = { ...crawlerChaseSpawn(createLabCrawler({ x: 7000, y: 0 }), playerAt(-7000, 0), 300, LAB, 0)!, x: -6000, y: CRAWLER_HIT_H / 2, nextAttackAt: 0, facingLeft: false, vx: chaseSpeed };
    const dt = 1 / 60;
    let t = 0;
    // 後ろから追いつかれる時、プレイヤーが最初に入るのは円の前の縁(塊は後ろから来る)。
    let px = crawlerSlamCenter(c).x + CRAWLER_SLAM_RADIUS + 6;
    const py = crawlerSlamCenter(c).y;
    c = stepLabCrawler(c, input(t, dt, playerAt(px, py), { chaseSpeed })).next!;
    expect(c.state).toBe('windup');
    let slam: { x: number; y: number } | null = null;
    while (!slam) {
      t += dt * 1000;
      px += (chaseSpeed / 1.1) * dt;
      const r = stepLabCrawler(c, input(t, dt, playerAt(px, py), { chaseSpeed }));
      if (r.slam) { slam = r.slam; break; }
      c = r.next!;
    }
    expect(Math.hypot(px - slam.x, py - slam.y)).toBeGreaterThan(CRAWLER_SLAM_RADIUS + 14); // 外せる
  });

  it('雑魚を狙った時は従来どおり止まって食べる(円も溜め開始で固定)', () => {
    const c0 = { ...crawlerChaseSpawn(createLabCrawler({ x: 7000, y: 0 }), playerAt(-7000, 0), 300, LAB, 0)!, x: -6000, y: CRAWLER_HIT_H / 2, nextAttackAt: 0, facingLeft: false, vx: 150 };
    const s = crawlerSlamCenter(c0);
    const mob: CrawlerTarget = { id: 'm', isPlayer: false, cx: s.x, cy: s.y, r: 14, type: 'zombie', footY: s.y + 14, w: 28, h: 28 };
    const p = playerAt(-3000, 0);
    let c = stepLabCrawler(c0, input(0, 1 / 60, p, { chaseSpeed: 150, targets: [mob, playerTarget(p)] })).next!;
    expect(c.state).toBe('windup');
    expect(c.slamMoving).toBe(false);
    const fixed = { x: c.slamX, y: c.slamY };
    for (let i = 1; i < 20; i++) c = stepLabCrawler(c, input(i * 16, 1 / 60, p, { chaseSpeed: 150, targets: [mob] })).next!;
    expect({ x: c.slamX, y: c.slamY }).toEqual(fixed);
    expect(Math.abs(c.vx)).toBeLessThan(150 * 0.6); // 減速している
  });

  it('資料の前(追跡していない)はプレイヤーを狙っても止まる(従来どおり)', () => {
    const c0 = { ...awake(createLabCrawler({ x: 7000, y: 0 })), nextAttackAt: 0 };
    const s = crawlerSlamCenter(c0);
    const c = stepLabCrawler(c0, input(0, 1 / 60, playerAt(s.x, s.y))).next!;
    expect(c.state).toBe('windup');
    expect(c.slamMoving).toBe(false);
  });
});

describe('ステージ2の這う塊 第2版(品質監査A4): 横に広い画面では回り込んだ直後だけ追いつく', () => {
  it('スマホ縦持ち(見えている端=約215)では追いつきは起きない=速さは1.1倍のまま(従来と同じ)', () => {
    const p = playerAt(5000, 0);
    const c0 = crawlerChaseSpawn(createLabCrawler({ x: -7000, y: 0 }), p, 215, LAB, 0)!;
    expect(c0.chaseCatchUp).toBe(false);
    const chaseSpeed = 137;
    const { speeds } = run(c0, p, 2, 1 / 60, 0, { chaseSpeed, targets: [] });
    expect(Math.max(...speeds)).toBeLessThanOrEqual(Math.hypot(chaseSpeed, CRAWLER_MAX_SPEED_Y) + 1e-6);
  });

  it('PC(見えている端=約640)では基準距離まで速く寄り、来たら1.1倍へ戻る(雑魚で離れても追いつきは戻らない)', () => {
    const p = playerAt(5000, 0);
    const c0 = crawlerChaseSpawn(createLabCrawler({ x: -7000, y: 0 }), p, 640, LAB, 0)!;
    expect(c0.chaseCatchUp).toBe(true);
    const chaseSpeed = 137;
    let c: LabCrawler = c0;
    let maxV = 0;
    for (let i = 0; i < 600 && c.chaseCatchUp; i++) {
      c = stepLabCrawler(c, input(i * 16, 1 / 60, p, { chaseSpeed, targets: [] })).next!;
      maxV = Math.max(maxV, Math.abs(c.vx));
    }
    expect(maxV).toBeGreaterThan(chaseSpeed * 1.2); // 1.1倍より速く寄った
    expect(c.chaseCatchUp).toBe(false);
    expect(crawlerGapToPlayer(c, p)).toBeLessThanOrEqual(CRAWLER_CHASE_CATCHUP_GAP_PX + 5);
    // 離れても(遠くへ置き直しても)追いつきは戻らない
    const far = { ...c, x: c.x + 2000 };
    const c2 = stepLabCrawler(far, input(20000, 1 / 60, p, { chaseSpeed, targets: [] })).next!;
    expect(c2.chaseCatchUp).toBe(false);
  });
});

describe('ステージ2の這う塊 第2版(社長「振り返って追いかけてはこない」「ゴール手前まで来ると消える」)', () => {
  it('資料の後の追跡は一方向: プレイヤーが後ろ(資料側)へ回っても向きを変えず、同じ速さでゴールの方へ這い続ける。縦は寄らない', () => {
    // 資料は左(goalX=-7000)・ゴールの方=右(+1)。塊はプレイヤーの左から出る。
    const c0 = crawlerChaseSpawn(createLabCrawler({ x: 7000, y: 0 }), playerAt(-7000, 0), 300, LAB, 0)!;
    expect(crawlerGoalDir(c0)).toBe(1);
    expect(c0.facingLeft).toBe(false);
    let c: LabCrawler = { ...c0, nextAttackAt: 1e9 };
    // プレイヤーを塊の後ろ(さらに左)・上の方へ置く
    const behind = playerAt(c0.x - 900, -150);
    const y0 = c.y;
    for (let i = 0; i < 180; i++) c = stepLabCrawler(c, input(i * 16, 1 / 60, behind, { chaseSpeed: 150, targets: [] })).next!;
    expect(c.facingLeft).toBe(false); // 振り返らない
    expect(c.vx).toBeGreaterThan(150 * 0.9); // ゴールの方へ同じ速さで
    expect(c.x).toBeGreaterThan(c0.x + 200);
    expect(c.y).toBeCloseTo(y0, 0); // 後ろのプレイヤーの高さへは寄らない
  });

  it('前の縁が原点から600pxの所まで来たら沈んで消える(判定なし・攻撃しない)。尺が済むと居なくなる', () => {
    const p = playerAt(-300, 0); // ゴールの前で待つ
    // 前の縁(右の縁)を -600 の少し手前に置く
    let c: LabCrawler = { ...crawlerChaseSpawn(createLabCrawler({ x: 7000, y: 0 }), playerAt(-7000, 0), 300, LAB, 0)!, nextAttackAt: 1e9 };
    c = { ...c, x: -CRAWLER_VANISH_GOAL_DIST_PX - CRAWLER_HIT_W / 2 - 30, vx: 150 };
    expect(crawlerReachedGoal(c)).toBe(false);
    let t = 0;
    while (c.state !== 'vanish') { t += 16; c = stepLabCrawler(c, input(t, 1 / 60, p, { chaseSpeed: 150, targets: [] })).next!; }
    expect(crawlerReachedGoal(c)).toBe(true);
    expect(crawlerSolid(c)).toBe(false);
    const at = c.stateAt;
    const r = stepLabCrawler(c, input(at + 500, 1 / 60, playerAt(crawlerSlamCenter(c).x, crawlerSlamCenter(c).y)));
    expect(r.next!.state).toBe('vanish'); // 目の前でも攻撃しない
    expect(r.playerPush).toBeNull();
    expect(stepLabCrawler(r.next!, input(at + CRAWLER_VANISH_MS, 1 / 60, p)).next).toBeNull();
  });

  it('沈んで消える見え方: 光は無く(関数が光を返さない)、沈み・後ろへ引き・暗くなり・最後に消える(慣性つき)', () => {
    const a = crawlerVanishLook(0), m = crawlerVanishLook(CRAWLER_VANISH_MS * 0.5), z = crawlerVanishLook(CRAWLER_VANISH_MS);
    expect(a.sink).toBe(0); expect(a.alpha).toBe(1);
    expect(m.sink).toBeGreaterThan(0.2); expect(m.sink).toBeLessThan(0.8);
    expect(z.sink).toBeCloseTo(1); expect(z.alpha).toBeCloseTo(0); expect(z.slide).toBeCloseTo(1);
    expect(Object.keys(a).sort()).toEqual(['alpha', 'dark', 'scratchFrame', 'sink', 'slide']); // 光の項目は無い
    expect(a.scratchFrame).not.toBeNull(); // 頭の止まり=手で床を掻く
    expect(crawlerVanishLook(CRAWLER_VANISH_HOLD_MS - 1).slide).toBe(0);
    expect(m.scratchFrame).toBeNull();
  });

  it('資料の前(追跡していない)は従来どおりプレイヤーの方へ振り返る・原点の近くでも消えない', () => {
    const c0 = { ...awake(createLabCrawler({ x: 7000, y: 0 })), nextAttackAt: 1e9 };
    const r = run(c0, playerAt(2000, 0), 1, 1 / 60, 0, { targets: [] });
    expect(r.c!.facingLeft).toBe(false);
    expect(r.c!.state).toBe('move');
  });
});

describe('手が着くコマの前のめり(描画だけ・2巡目#1)', () => {
  const base = { ...createLabCrawler({ x: 7000, y: 0 }), state: 'windup' as const, stateAt: 0, hitAt: 620, slamMoving: true };
  it('動きながらの叩きつけだけ: 当たる直前に加速して出て、着地の止まりの間は出たまま、戻りで加減速つきに戻る', () => {
    expect(crawlerSlamLunge(base, 100)).toBe(0);
    const a = crawlerSlamLunge(base, 620 - CRAWLER_SLAM_LUNGE_IN_MS * 0.5);
    const b = crawlerSlamLunge(base, 619);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    const rec = { ...base, state: 'recover' as const, stateAt: 620 };
    expect(crawlerSlamLunge(rec, 620 + CRAWLER_IMPACT_HOLD_MS - 1)).toBe(1);
    const m = crawlerSlamLunge(rec, 620 + CRAWLER_IMPACT_HOLD_MS + CRAWLER_SLAM_LUNGE_OUT_MS / 2);
    expect(m).toBeGreaterThan(0); expect(m).toBeLessThan(1);
    expect(crawlerSlamLunge(rec, 620 + CRAWLER_IMPACT_HOLD_MS + CRAWLER_SLAM_LUNGE_OUT_MS + 1)).toBe(0);
    expect(crawlerSlamLunge({ ...base, slamMoving: false }, 619)).toBe(0);
    expect(CRAWLER_IMPACT_HOLD_MS).toBeGreaterThan(0);
  });
});

describe('塊の横の速さの慣性(社長指示2026-10-20「止まりからは、徐々にスピードを上げる」)', () => {
  it('止まりからは一定の加速度でじわじわ速くなり、目標を越えない', () => {
    let v = 0; const out: number[] = [];
    for (let i = 0; i < 180; i++) { v = approachCrawlerSpeed(v, -115, 1 / 60); out.push(v); }
    expect(Math.abs(out[0])).toBeCloseTo(CRAWLER_ACCEL_PX_S2 / 60, 6);
    expect(Math.abs(out[59])).toBeCloseTo(CRAWLER_ACCEL_PX_S2, 6); // 1秒で加速度ぶん
    expect(Math.abs(out[179])).toBe(115);
    for (const x of out) expect(x).toBeGreaterThanOrEqual(-115);
  });
  it('緩める・逆向きは強い減速度で(巨体も少しずつ止まる)', () => {
    expect(approachCrawlerSpeed(-115, 0, 1 / 60)).toBeCloseTo(-115 + CRAWLER_DECEL_PX_S2 / 60, 6);
    expect(approachCrawlerSpeed(-50, 100, 1 / 60)).toBeCloseTo(-50 + CRAWLER_DECEL_PX_S2 / 60, 6);
    expect(approachCrawlerSpeed(10, 100, 0)).toBe(10);
  });
});
