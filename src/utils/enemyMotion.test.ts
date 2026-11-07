// 敵の移動まわり3点の不変条件(社長指示v0.25.2415)。
import { describe, it, expect } from 'vitest';
import {
  isPassThroughPhase, isPassThroughBossState, nudgeOutOfSolids,
  createAvoidState, stepAvoid, AVOID_BLOCKED_MS, AVOID_DURATION_MS, AVOID_GIVEUP_MS,
} from './enemyMotion';
import type { AvoidState } from './enemyMotion';

describe('① ダッシュ/滞空はオブジェクトを貫通', () => {
  it('突進・滞空は貫通する(予告どおりに来る、を守るため)', () => {
    for (const p of ['charge', 'jump', 'g-dash-charge', 'g-jump-air', 'g-quad-charge', 'g-glide-active']) {
      expect(isPassThroughPhase(p)).toBe(true);
    }
    expect(isPassThroughBossState('issen-dash')).toBe(true);
  });

  it('溜め・硬直・通常追跡では貫通しない(止まっている/歩いている時まですり抜けたら別のバグ)', () => {
    for (const p of [undefined, 'windup', 'recover', 'g-dash-windup', 'g-stomp-recover', 'g-sweep-active']) {
      expect(isPassThroughPhase(p)).toBe(false);
    }
    expect(isPassThroughBossState('chase')).toBe(false);
    expect(isPassThroughBossState(undefined)).toBe(false);
  });
});

describe('② 着地点がオブジェクトの中なら横へはみ出す', () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };

  it('何にも重なっていなければ動かさない', () => {
    expect(nudgeOutOfSolids(300, 300, 40, [box])).toEqual({ x: 300, y: 300 });
  });

  it('横が一番浅ければ横へ出る(社長指示「その横にはみ出す」)', () => {
    // 右端の少し内側・上下は深い → 右へ抜けるのが最短。
    const r = nudgeOutOfSolids(95, 50, 20, [box]);
    expect(r.x).toBeGreaterThan(95);
    expect(r.y).toBe(50);
  });

  it('押し出した後は必ずオブジェクトの外にいる(半径ぶん離れている)', () => {
    for (const [px, py] of [[50, 50], [10, 90], [99, 1], [0, 0]]) {
      const r = nudgeOutOfSolids(px, py, 25, [box]);
      const nx = Math.max(box.x, Math.min(r.x, box.x + box.width));
      const ny = Math.max(box.y, Math.min(r.y, box.y + box.height));
      expect(Math.hypot(r.x - nx, r.y - ny)).toBeGreaterThanOrEqual(25 - 0.001);
    }
  });
});

describe('③ 障害物に当たったら避ける(諦めるまで)', () => {
  const blockedTick = (dirX = 1, dirY = 0, rand = 0.1) =>
    ({ dtMs: 100, wantDist: 5, movedDist: 0, dirX, dirY, rand });

  it('進めているうちは何もしない(まっすぐ追う)', () => {
    let s = createAvoidState();
    for (let i = 0; i < 20; i++) {
      const r = stepAvoid(s, { dtMs: 100, wantDist: 5, movedDist: 5, dirX: 1, dirY: 0, rand: 0.1 });
      s = r.state;
      expect(r.moveX).toBe(1);
      expect(r.moveY).toBe(0);
    }
    expect(s.dir).toBe(0);
  });

  it('詰まったら横(直交方向)へ避け始める', () => {
    let s = createAvoidState();
    let r = stepAvoid(s, blockedTick());
    // 閾値に届くまでは真っ直ぐのまま
    for (let t = 100; t < AVOID_BLOCKED_MS; t += 100) { s = r.state; r = stepAvoid(s, blockedTick()); }
    expect(r.state.dir).not.toBe(0);
    expect(Math.abs(r.moveY)).toBe(1); // 進行方向(+x)の直交=±y
    expect(r.moveX).toBe(-0);
  });

  it('片側が駄目なら反対側へ切り替え、2回目も駄目なら諦める', () => {
    let s = createAvoidState();
    const dirsSeen = new Set<number>();
    let gaveUp = false;
    for (let i = 0; i < 40; i++) {
      const r = stepAvoid(s, blockedTick());
      s = r.state;
      if (s.dir !== 0) dirsSeen.add(s.dir);
      if (s.giveUpMs > 0) { gaveUp = true; break; }
    }
    expect(dirsSeen.size).toBe(2); // 左右の両方を試した
    expect(gaveUp).toBe(true);     // 両方駄目なら諦める(=固まらない)
    expect(s.dir).toBe(0);
    expect(stepAvoid(s, blockedTick()).moveX).toBe(1); // 諦め中はまっすぐ突っ込む
  });

  it('諦めは永続しない(時間で解ける=壁が動けば再挑戦できる)', () => {
    let s: AvoidState = { ...createAvoidState(), giveUpMs: AVOID_GIVEUP_MS };
    for (let t = 0; t < AVOID_GIVEUP_MS; t += 100) s = stepAvoid(s, blockedTick()).state;
    expect(s.giveUpMs).toBe(0);
  });

  it('避けきれたら通常追跡へ戻る', () => {
    const start: AvoidState = { ...createAvoidState(), dir: 1, leftMs: 100, tries: 0 };
    const r = stepAvoid(start, { dtMs: 200, wantDist: 5, movedDist: 5, dirX: 1, dirY: 0, rand: 0.1 });
    expect(r.state.dir).toBe(0);
    expect(r.moveX).toBe(1);
    expect(AVOID_DURATION_MS).toBeGreaterThan(0);
  });
});
