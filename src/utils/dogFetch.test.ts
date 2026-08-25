import { describe, it, expect } from 'vitest';
import { DOG_EXCLUDED_TYPES, dogEligiblePickups } from './dogFetch';
import type { Pickup, PickupType } from '../types/game';

// ★社長裁定2026-08-25「犬がそのレベルで拾うものをそのまま移せばいい」=
// プレイヤーが拾える物 == 幻影が消せる物。**リストが1本であること自体が仕様**なので、
// 中身をここで固定する(2本に割れたら落ちる)。仕様の正=research/SAME_ARENA.md §3-d-4。
const at = (type: PickupType, x: number, y: number, extra: Partial<Pickup> = {}): Pickup => ({
  id: `${type}-${x}-${y}`, x, y, type, value: 1, ...extra,
} as Pickup);

const base = { cx: 0, cy: 0, radius: 100, nowMs: 10_000, skipHealth: false };

describe('ドッグが触る物の台帳(utils/dogFetch)', () => {
  it('★任務が詰む物は触らない(card-key / lab-clear-item)+開ける物・使う物も対象外', () => {
    expect([...DOG_EXCLUDED_TYPES].sort()).toEqual(
      ['card-key', 'lab-clear-item', 'quick-magazine', 'weapon-crate'].sort(),
    );
    const picks = DOG_EXCLUDED_TYPES.map(t => at(t, 0, 0));
    expect(dogEligiblePickups({ ...base, pickups: picks })).toEqual([]);
  });

  it('★箱系(宝箱・金箱・トレジャー・武器ドロップ)は触れる(社長裁定=除外リストを増やさない)', () => {
    const picks: Pickup[] = [at('chest', 0, 0), at('bounty-chest', 1, 0), at('treasure', 2, 0), at('weapon-drop', 3, 0)];
    expect(dogEligiblePickups({ ...base, pickups: picks })).toHaveLength(4);
  });

  it('半径の外は対象外(境界=半径ちょうどは入る)', () => {
    // 拾い物の中心は (x+8, y+8)。半径100の円で内外を1件ずつ置く。
    const inside = at('experience', 92 - 8, 0 - 8);   // 中心(92,0)
    const outside = at('experience', 101 - 8, 0 - 8); // 中心(101,0)
    const got = dogEligiblePickups({ ...base, pickups: [inside, outside] });
    expect(got.map(p => p.id)).toEqual([inside.id]);
  });

  it('投げられて飛行中の物は着地するまで触らない', () => {
    const flying = at('experience', 0, 0, { throwStartAt: 9_500, throwDuration: 1_000 });
    const landed = at('experience', 1, 0, { throwStartAt: 8_000, throwDuration: 1_000 });
    const got = dogEligiblePickups({ ...base, pickups: [flying, landed] });
    expect(got.map(p => p.id)).toEqual([landed.id]);
  });

  it('skipHealth=true の時だけ回復を外す(★幻影は常に false=満タンでも消しに行く)', () => {
    const picks = [at('health', 0, 0), at('experience', 1, 0)];
    expect(dogEligiblePickups({ ...base, pickups: picks, skipHealth: true })).toHaveLength(1);
    expect(dogEligiblePickups({ ...base, pickups: picks, skipHealth: false })).toHaveLength(2);
  });
});
