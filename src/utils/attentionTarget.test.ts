import { describe, it, expect } from 'vitest';
import {
  resolveDeferredAttentionFocus, findAttentionTarget, attentionFocusOf, followAttentionFocus,
  ATTENTION_FOLLOW_TAU_MS, type AttentionTarget,
} from './attentionTarget';
import { bossArtCenter, BOSS_SPRITE_FIT } from '../pixi/renderSpec';
import type { Enemy } from '../types/game';

type E = Pick<Enemy, 'id' | 'type' | 'x' | 'y' | 'width' | 'height' | 'health'>;
// 絵の中心が帯の中心とずれる型(表に載っている型)で確かめる=「元の計算と同じ関数」を通っていること。
const artType = Object.keys(BOSS_SPRITE_FIT)[0] as Enemy['type'];
const mk = (id: string, x: number, y: number, health = 100): E => ({ id, type: artType, x, y, width: 80, height: 40, health });

describe('resolveDeferredAttentionFocus(遅れて出す寄りの寄り先)', () => {
  const t: AttentionTarget = { id: 'b1', focus: 'art' };
  it('控えた後に相手が動いても、発火の時の寄り先は相手の今の位置', () => {
    const spawnFocus = bossArtCenter(mk('b1', 100, 100));
    const moved = mk('b1', 700, -300); // 950ms の間(+他のアテンション・店の画面)に動いた
    const f = resolveDeferredAttentionFocus([mk('z', 0, 0), moved], t);
    expect(f).toEqual(bossArtCenter(moved));
    expect(f).not.toEqual(spawnFocus);
  });
  it('相手が消えた・倒れたら出さない(null)', () => {
    expect(resolveDeferredAttentionFocus([mk('z', 0, 0)], t)).toBeNull();
    expect(resolveDeferredAttentionFocus([mk('b1', 0, 0, 0)], t)).toBeNull();
  });
  it("'center' は帯の中心(幻影・アイドルの元の式)", () => {
    const e = mk('p', 10, 20);
    expect(resolveDeferredAttentionFocus([e], { id: 'p', focus: 'center' })).toEqual({ x: 50, y: 40 });
    expect(attentionFocusOf(e, 'art')).toEqual(bossArtCenter(e));
  });
  it('findAttentionTarget は同じ id の生きた相手だけ', () => {
    expect(findAttentionTarget([mk('a', 0, 0), mk('b', 1, 1)], 'b')?.x).toBe(1);
    expect(findAttentionTarget([mk('a', 0, 0, -5)], 'a')).toBeNull();
  });
});

describe('followAttentionFocus(寄り先の追従)', () => {
  it('近ければ書き換えない', () => {
    expect(followAttentionFocus({ x: 0, y: 0 }, { x: 0.1, y: -0.2 }, 16)).toBeNull();
  });
  it('パッと跳ばない(1フレームで一部だけ寄る)が、時間が経てば相手に着く', () => {
    const goal = { x: 100, y: -50 };
    const one = followAttentionFocus({ x: 0, y: 0 }, goal, 16)!;
    expect(one.x).toBeGreaterThan(0);
    expect(one.x).toBeLessThan(30);
    let p = { x: 0, y: 0 };
    for (let i = 0; i < 120; i++) p = followAttentionFocus(p, goal, 16) ?? p;
    expect(Math.abs(p.x - goal.x)).toBeLessThan(0.5);
    expect(Math.abs(p.y - goal.y)).toBeLessThan(0.5);
  });
  it('減速する(慣性: 1歩目の方が後の歩より大きい)・dt=0 は動かない', () => {
    const goal = { x: 100, y: 0 };
    const a = followAttentionFocus({ x: 0, y: 0 }, goal, 16)!;
    const b = followAttentionFocus(a, goal, 16)!;
    expect(a.x).toBeGreaterThan(b.x - a.x);
    expect(followAttentionFocus({ x: 0, y: 0 }, goal, 0)).toBeNull();
    const tau = followAttentionFocus({ x: 0, y: 0 }, goal, ATTENTION_FOLLOW_TAU_MS)!;
    expect(tau.x).toBeCloseTo(100 * (1 - Math.exp(-1)), 5);
  });
});
