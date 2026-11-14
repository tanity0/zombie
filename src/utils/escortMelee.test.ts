import { describe, it, expect } from 'vitest';
import { stepEscortMelee, inEscortMeleeArc, escortKnifeHit, ESCORT_KNIFE_DAMAGE, ESCORT_KNIFE_CRIT, ESCORT_MELEE_ENTER_PX, ESCORT_MELEE_EXIT_PX, ESCORT_MELEE_WINDUP_MS, ESCORT_MELEE_BLADE_MS, ESCORT_MELEE_CYCLE_MS, type EscortMeleeFields } from './escortMelee';
import { createWeapon } from './weaponUtils';
import { MELEE_RADIUS, COUNTER_WINDOW, COUNTER_COOLDOWN, CRIT_DAMAGE_MULT } from '../store/gameStore';

const R = { x: 1, y: 0 };
const run = (dists: (number | null)[], stepMs = 50, canAct = true) => {
  let st: EscortMeleeFields = {};
  const out: { t: number; mode: boolean; hit: boolean; start: boolean }[] = [];
  dists.forEach((d, i) => {
    const t = i * stepMs;
    const r = stepEscortMelee(st, d, d === null ? null : R, t, canAct);
    st = r.patch;
    out.push({ t, mode: r.mode, hit: r.hitNow, start: r.swingStarted });
  });
  return out;
};

describe('進軍NPCの近接(research/ESCORT_MELEE.md)', () => {
  it('数値はプレイヤーの tier1 ナイフ・近接の間合い・1振りの周期と同じ', () => {
    const k = createWeapon('knife-t1');
    expect(ESCORT_KNIFE_DAMAGE).toBe(k.damage);
    expect(ESCORT_KNIFE_CRIT).toBe(k.critChance);
    expect(ESCORT_MELEE_ENTER_PX).toBe(MELEE_RADIUS);
    expect(ESCORT_MELEE_WINDUP_MS + ESCORT_MELEE_BLADE_MS).toBe(COUNTER_WINDOW);
    expect(ESCORT_MELEE_CYCLE_MS).toBe(COUNTER_WINDOW + COUNTER_COOLDOWN);
  });

  it('間合いの外=構えない(銃を撃つ)', () => {
    expect(run([200, 120, ESCORT_MELEE_ENTER_PX + 1]).every(o => !o.mode && !o.start)).toBe(true);
    expect(run([null, null]).every(o => !o.mode)).toBe(true);
  });

  it('間合いに入ると構えて振り始め、溜め(200ms)明けに1回だけ当たる', () => {
    const o = run(Array(20).fill(50)); // 50ms刻みで1秒
    expect(o[0].mode && o[0].start).toBe(true);
    const hits = o.filter(x => x.hit).map(x => x.t);
    expect(hits[0]).toBe(ESCORT_MELEE_WINDUP_MS);
    // 次の振りは周期(820ms)後=1秒の中では2振り目の当たりはまだ来ない
    expect(hits.length).toBe(1);
    expect(o.filter(x => x.start).map(x => x.t)).toEqual([0, 850]); // 820ms後の最初のフレーム
  });

  it('入るより出る方が広い(境目でちらつかない)', () => {
    const o = run([60, ESCORT_MELEE_ENTER_PX + 10, ESCORT_MELEE_EXIT_PX - 1, ESCORT_MELEE_EXIT_PX + 1].map(d => d), 500);
    expect(o.map(x => x.mode)).toEqual([true, true, true, false]);
  });

  it('振っている最中に敵が離れても、最後まで振り切ってから銃へ戻る', () => {
    const o = run([50, 300, 300, 300, 300, 300, 300, 300, 300, 300], 50);
    expect(o.slice(0, 8).every(x => x.mode)).toBe(true); // 溜め+刃=400ms
    expect(o[8].mode).toBe(false);
  });

  it('倒れている/滑っている間は振らない', () => {
    expect(run(Array(10).fill(50), 50, false).some(o => o.start || o.hit)).toBe(false);
  });

  it('当たる扇は振った向き ±70°', () => {
    expect(inEscortMeleeArc(1, 0, 10, 0)).toBe(true);
    expect(inEscortMeleeArc(1, 0, 10, 10)).toBe(true);   // 45°
    expect(inEscortMeleeArc(1, 0, 10, 40)).toBe(false);  // 76°
    expect(inEscortMeleeArc(1, 0, -10, 0)).toBe(false);  // 背中
  });

  it('クリティカルはプレイヤーと同じ倍率', () => {
    expect(escortKnifeHit(() => 0, CRIT_DAMAGE_MULT)).toEqual({ damage: Math.round(ESCORT_KNIFE_DAMAGE * CRIT_DAMAGE_MULT), crit: true });
    expect(escortKnifeHit(() => 0.99, CRIT_DAMAGE_MULT)).toEqual({ damage: ESCORT_KNIFE_DAMAGE, crit: false });
  });
});

describe('構えに入った最初の振りを人ごとにずらす', () => {
  it('enterDelayMs ぶん遅れて最初の振りが出る(0なら即)', () => {
    const r0 = stepEscortMelee({}, 50, { x: 1, y: 0 }, 1000, true, 0);
    expect(r0.swingStarted).toBe(true);
    const r1 = stepEscortMelee({}, 50, { x: 1, y: 0 }, 1000, true, 140);
    expect(r1.swingStarted).toBe(false);
    expect(r1.mode).toBe(true);
    const r2 = stepEscortMelee(r1.patch, 50, { x: 1, y: 0 }, 1140, true, 140);
    expect(r2.swingStarted).toBe(true);
  });
});
