// 敵同士の軽い押し合い(社長指示v0.25.2320)の不変条件。
// 「少し押し合う」=ハード衝突にしない・移動AIを壊さない、を機械で固定する。
import { describe, it, expect } from 'vitest';
import {
  computeEnemySeparation, isSeparationExempt,
  SEPARATION_MAX_SPEED, SEPARATION_RADIUS_FRAC, SEPARATION_RESOLVE_FRAC,
} from './enemySeparation';
import type { Enemy, EnemyType } from '../types/game';

const NOW = 100000;
const mk = (id: string, x: number, y: number, over: Partial<Enemy> = {}): Enemy =>
  ({ id, x, y, width: 32, height: 32, type: 'zombie' as EnemyType, ...over } as unknown as Enemy);

describe('computeEnemySeparation', () => {
  it('離れている敵は動かさない', () => {
    const sep = computeEnemySeparation([mk('a', 0, 0), mk('b', 300, 0)], 1 / 60, NOW);
    expect(sep.size).toBe(0);
  });

  it('肩が触れた程度(係数の外)では押し合わない=常時ゆらがない', () => {
    // 中心間 = 半径の和(32) ちょうど。しきい値は 32*0.62=19.84 なので対象外。
    const sep = computeEnemySeparation([mk('a', 0, 0), mk('b', 32, 0)], 1 / 60, NOW);
    expect(sep.size).toBe(0);
  });

  it('深く重なったら互いに逆向きへ、同じ量だけ押し合う', () => {
    const sep = computeEnemySeparation([mk('a', 0, 0), mk('b', 8, 0)], 1 / 60, NOW);
    const a = sep.get('a')!, b = sep.get('b')!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a.dx).toBeLessThan(0);   // a は左へ
    expect(b.dx).toBeGreaterThan(0); // b は右へ
    expect(a.dx).toBeCloseTo(-b.dx, 6); // 対称
    expect(a.dy).toBeCloseTo(0, 6);
  });

  it('1フレームでは重なりを解消しきらない(=ハード衝突にしない)', () => {
    const minDist = 32 * SEPARATION_RADIUS_FRAC; // 19.84
    const start = 18; // 浅い重なり(上限速度に当たらない領域)で解消率そのものを見る
    const sep = computeEnemySeparation([mk('a', 0, 0), mk('b', start, 0)], 1 / 60, NOW);
    const moved = start + sep.get('b')!.dx - sep.get('a')!.dx;
    expect(moved).toBeGreaterThan(start); // 離れてはいる
    expect(moved).toBeLessThan(minDist);  // でも1フレームでは届かない
    // 解消率どおり(overlap の SEPARATION_RESOLVE_FRAC ぶんだけ縮まる)。
    expect(moved - start).toBeCloseTo((minDist - start) * SEPARATION_RESOLVE_FRAC, 6);
  });

  it('深い重なりでは上限速度が先に効く(一気に弾かず数フレームかけて解く)', () => {
    const dt = 1 / 60;
    const start = 8; // 中心間8px=かなり深い重なり
    const sep = computeEnemySeparation([mk('a', 0, 0), mk('b', start, 0)], dt, NOW);
    // 解消率だけなら片側2.96pxだが、上限(90px/s → 1フレーム1.5px)で頭打ちになる。
    expect(sep.get('b')!.dx).toBeCloseTo(SEPARATION_MAX_SPEED * dt, 6);
    expect(sep.get('a')!.dx).toBeCloseTo(-SEPARATION_MAX_SPEED * dt, 6);
  });

  it('完全に同じ座標でも決定的に分離する(乱数を使わない=再現する)', () => {
    const run = () => computeEnemySeparation([mk('a', 50, 50), mk('b', 50, 50)], 1 / 60, NOW);
    const s1 = run(), s2 = run();
    expect(s1.get('a')!.dx).toBeCloseTo(s2.get('a')!.dx, 9);
    expect(s1.get('a')!.dx).not.toBe(0);
    expect(s1.get('a')!.dx).toBeCloseTo(-s1.get('b')!.dx, 9);
  });

  it('押し出し量は上限速度で頭打ち(挟まれても弾け飛ばない)', () => {
    const dt = 1 / 60;
    // 同一座標に3体=合算が大きくなる状況。
    const sep = computeEnemySeparation([mk('a', 0, 0), mk('b', 1, 0), mk('c', 0, 1)], dt, NOW);
    for (const v of sep.values()) {
      expect(Math.hypot(v.dx, v.dy)).toBeLessThanOrEqual(SEPARATION_MAX_SPEED * dt + 1e-9);
    }
  });

  it('dt=0 では何も動かさない(ポーズ中に位置が変わらない)', () => {
    expect(computeEnemySeparation([mk('a', 0, 0), mk('b', 4, 0)], 0, NOW).size).toBe(0);
  });
});

describe('isSeparationExempt(押し合いの対象外)', () => {
  it('ボス系・裏ボス・死神・ハンターは押されない', () => {
    for (const t of ['pumpkin', 'giantbat', 'reaper', 'hunter', 'thor', 'miguel'] as EnemyType[]) {
      expect(isSeparationExempt(mk('x', 0, 0, { type: t }), NOW), t).toBe(true);
    }
  });

  it('fixed(イベント配置)・dormant(索敵中)は押されない', () => {
    expect(isSeparationExempt(mk('x', 0, 0, { fixed: true }), NOW)).toBe(true);
    expect(isSeparationExempt(mk('x', 0, 0, { dormant: true }), NOW)).toBe(true);
  });

  it('ノックバック中は押されない(外力と二重に掛からない)', () => {
    expect(isSeparationExempt(mk('x', 0, 0, { knockbackUntil: NOW + 100 }), NOW)).toBe(true);
    expect(isSeparationExempt(mk('x', 0, 0, { knockbackUntil: NOW - 1 }), NOW)).toBe(false);
  });

  it('通常の雑魚は対象', () => {
    expect(isSeparationExempt(mk('x', 0, 0), NOW)).toBe(false);
  });

  it('対象外の個体はペアに混ざっても一切動かない', () => {
    const sep = computeEnemySeparation(
      [mk('boss', 0, 0, { type: 'giantbat' as EnemyType }), mk('mob', 4, 0)], 1 / 60, NOW,
    );
    expect(sep.size).toBe(0); // 相方が対象外=押し合う相手がいない
  });
});

// ★PACING_PUZZLE.md §16-7 穴3(社長裁定2026-09-16「1」=技の実行中だけ免除する。構え(停止)中は
// 押される)。`isSeparationExempt` には足さない(足すと丸ごと`parts`から抜け、押されないだけで
// なく押しもしなくなる=着手前監査A-5)。`computeEnemySeparation`の内側で非対称に配る。
describe('§16の技の実行中は押されない(非対称・穴3)', () => {
  it('技の実行中(chaffMove定義)の個体は動かず、相手だけが満額で動く', () => {
    // 浅い重なり(19px)にして上限速度(SEPARATION_MAX_SPEED)に当たらない領域で解消率そのものを見る
    // (「1フレームでは重なりを解消しきらない」のテストと同じ作法)。
    const start = 19;
    const sep = computeEnemySeparation(
      [mk('bat', 0, 0, { type: 'bat' as EnemyType, chaffMove: 'bat-grab' }), mk('mob', start, 0)],
      1 / 60, NOW,
    );
    expect(sep.get('bat')).toBeUndefined(); // 技中は動かさない
    const moved = sep.get('mob')!;
    expect(moved.dx).toBeGreaterThan(0); // 相手側は右へ押される
    // 満額(半分ではない)で解消する: overlap(minDist-dist) * RESOLVE_FRAC(0.5)
    const minDist = 32 * SEPARATION_RADIUS_FRAC;
    expect(moved.dx).toBeCloseTo((minDist - start) * SEPARATION_RESOLVE_FRAC, 6);
    // 対称(半分ずつ)なら本来この半分(0.5倍)で済むはずの量より大きい=非対称=満額であることの確認。
    expect(moved.dx).toBeGreaterThan((minDist - start) * SEPARATION_RESOLVE_FRAC / 2);
  });

  it('技を持たない通常の押し合いは従来どおり対称(半分ずつ)', () => {
    const sep = computeEnemySeparation(
      [mk('a', 0, 0, { type: 'bat' as EnemyType }), mk('b', 8, 0)], 1 / 60, NOW,
    );
    expect(sep.get('a')!.dx).toBeCloseTo(-sep.get('b')!.dx, 6);
  });

  it('両方が同時に技実行中でも、どちらか一方だけを完全固定にはしない(半分ずつに戻す)', () => {
    const sep = computeEnemySeparation(
      [
        mk('a', 0, 0, { type: 'bat' as EnemyType, chaffMove: 'bat-grab' }),
        mk('b', 8, 0, { type: 'skeleton' as EnemyType, chaffMove: 'skel-bite' }),
      ],
      1 / 60, NOW,
    );
    expect(sep.get('a')).toBeDefined();
    expect(sep.get('b')).toBeDefined();
    expect(sep.get('a')!.dx).toBeCloseTo(-sep.get('b')!.dx, 6);
  });
});
