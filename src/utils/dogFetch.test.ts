import { describe, it, expect } from 'vitest';
import { DOG_EXCLUDED_TYPES, dogEligiblePickups, dogLostReturnPatch } from './dogFetch';
import type { Pickup, PickupType } from '../types/game';

// ★社長裁定2026-08-25「犬がそのレベルで拾うものをそのまま移せばいい」=
// プレイヤーが拾える物 == 幻影が消せる物。**リストが1本であること自体が仕様**なので、
// 中身をここで固定する(2本に割れたら落ちる)。仕様の正=research/SAME_ARENA.md §3-d-4。
const at = (type: PickupType, x: number, y: number, extra: Partial<Pickup> = {}): Pickup => ({
  id: `${type}-${x}-${y}`, x, y, type, value: 1, ...extra,
} as Pickup);

const base = { cx: 0, cy: 0, radius: 100, nowMs: 10_000, skipHealth: false };

describe('ドッグが触る物の台帳(utils/dogFetch)', () => {
  it('★任務が詰む物は触らない(card-key / lab-clear-item)+開ける物3種・使う物も対象外', () => {
    // ★社長裁定2026-08-25「犬は箱を触らない」: 武器箱だけでなく**宝箱・金箱**も除外。
    // 金箱は武器箱が5%の抽選で変化したもの=同じ箱なのに扱いが割れていた(v0.25.3644の足し忘れ)。
    expect([...DOG_EXCLUDED_TYPES].sort()).toEqual(
      ['bounty-chest', 'card-key', 'chest', 'lab-clear-item', 'quick-magazine', 'weapon-crate'].sort(),
    );
    const picks = DOG_EXCLUDED_TYPES.map(t => at(t, 0, 0));
    expect(dogEligiblePickups({ ...base, pickups: picks })).toEqual([]);
  });

  it('★箱(宝箱・金箱)は触らないが、拾う物(トレジャー・武器ドロップ)は触る', () => {
    // 「犬は"拾う物"を拾う。"開ける物"には触らない」の1本。境界をここで固定する。
    const boxes: Pickup[] = [at('chest', 0, 0), at('bounty-chest', 1, 0)];
    expect(dogEligiblePickups({ ...base, pickups: boxes })).toEqual([]);
    const loot: Pickup[] = [at('treasure', 2, 0), at('weapon-drop', 3, 0)];
    expect(dogEligiblePickups({ ...base, pickups: loot })).toHaveLength(2);
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

// 社長裁定2026-09-13「ドッグが拾い物そのものを追う」(マグネットとの取り合い対策)。
import { dogTrackTarget } from './dogFetch';
describe('dogTrackTarget(狙いの追跡)', () => {
  const pk = (id: string, x: number, y: number, extra: Partial<Pickup> = {}): Pickup => ({ id, type: 'strap', x, y, value: 1, ...extra } as Pickup);
  it('狙いが在れば現在の中心へ向く(マグネットに引かれて動いた後の位置)', () => {
    expect(dogTrackTarget([pk('a', 100, 50)], 'a', 0)).toEqual({ kind: 'follow', x: 108, y: 58 });
  });
  it('狙いが消えていれば lost(=CD を消費せず中止)', () => {
    expect(dogTrackTarget([pk('b', 0, 0)], 'a', 0)).toEqual({ kind: 'lost' });
  });
  it('狙い無し/投擲中は keep(座標据え置き)', () => {
    expect(dogTrackTarget([pk('a', 0, 0)], null, 0)).toEqual({ kind: 'keep' });
    expect(dogTrackTarget([pk('a', 0, 0, { throwStartAt: 0, throwDuration: 500 })], 'a', 100)).toEqual({ kind: 'keep' });
  });
});

describe('狙いが消えた犬は戻り切るまで同じ仕事のまま(社長報告2026-10-28「犬が大量に出てくる」)', () => {
  it('中止しても仕事は残り、戻りの尺のあとで空く。その間は拾わない(collected)・狙いも持たない', () => {
    const p = dogLostReturnPatch(10_000, 580);
    expect(p).toEqual({ aborted: true, collected: true, targetId: null, finishAt: 10_580 });
  });
});

// ── 熟練度: ドッグは拾った数で貯める(社長指示2026-11-12)。噛みつきの与ダメでも今どおり貯まる(両方)。 ──
import { DOG_MASTERY_XP_PER_PICKUP, dogFetchMasteryXp, noteDogFetchMastery } from './dogFetch';
import { beginMasteryRun, getPendingMastery, getMasteryReport } from './masteryRun';

const GAME_LOOP_SRC = Object.values(import.meta.glob<string>('../hooks/useGameLoop.ts', { query: '?raw', import: 'default', eager: true }))[0];

describe('ドッグの熟練度(拾った数で貯める)', () => {
  it('1個拾うと 300 が dog に貯まる(重みは掛けない)。複数なら個数ぶん', () => {
    expect(DOG_MASTERY_XP_PER_PICKUP).toBe(300);
    beginMasteryRun({ ignored: false });
    noteDogFetchMastery(1);
    expect(getPendingMastery()).toEqual({ dog: 300 });
    noteDogFetchMastery(3);
    expect(getPendingMastery()).toEqual({ dog: 1200 });
    expect(getMasteryReport()).toEqual({ dog: 1200 });
  });
  it('0個(何も拾えなかった)では貯まらない', () => {
    beginMasteryRun({ ignored: false });
    noteDogFetchMastery(0);
    expect(dogFetchMasteryXp(-1)).toBe(0);
    expect(dogFetchMasteryXp(Number.NaN)).toBe(0);
    expect(getPendingMastery()).toEqual({});
  });
  it('無視する出撃では pending へ足さない(報告用の表には足す=与ダメと同じ道)', () => {
    beginMasteryRun({ ignored: true });
    noteDogFetchMastery(1);
    expect(getPendingMastery()).toEqual({});
    expect(getMasteryReport()).toEqual({ dog: 300 });
  });
  it('配線: 回収が成立した所で1回だけ呼ぶ。中止(引き返し)の枝・幻影のドッグ・次の狙い選びの枝では呼ばない', () => {
    const calls = GAME_LOOP_SRC.split('noteDogFetchMastery(').length - 1;
    expect(calls).toBe(1);
    const at = GAME_LOOP_SRC.indexOf('noteDogFetchMastery(eligiblePickups.length)');
    const aborted = GAME_LOOP_SRC.indexOf('if (activeFetch?.aborted) {');
    const active = GAME_LOOP_SRC.indexOf('} else if (activeFetch) {', aborted);
    const collect = GAME_LOOP_SRC.indexOf('eligiblePickups.forEach(p => collectPickup(p.id));', active);
    const nextTarget = GAME_LOOP_SRC.indexOf('} else if (gameTime >= dogReadyAt) {', active);
    expect(aborted).toBeGreaterThan(0);
    expect(active).toBeGreaterThan(aborted);
    expect(collect).toBeGreaterThan(active);
    expect(at).toBeGreaterThan(collect);
    expect(at).toBeLessThan(nextTarget);
  });
  it('噛みつきの与ダメでも今どおり dog に貯まる(withMastery(\'dog\') のまま)', () => {
    expect(GAME_LOOP_SRC).toContain("withMastery('dog', () => damageEnemy(enemy.id, dogDmg");
  });
});
