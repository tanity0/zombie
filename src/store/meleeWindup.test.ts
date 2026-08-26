// ★近接の前隙(社長裁定2026-08-24「近接前隙を200にして」・research/SAME_ARENA.md §7)の不変条件。
//
// 守るのは4つ。どれも壊れると「近接が死ぬ」か「絵が嘘をつく」に直結する:
//  ① 指を離した瞬間に**カウンター窓とCDは開く**(守りは即応)。判定だけが遅れる。
//  ② 前隙の間は**ダメージが出ない**(攻めは約束)。
//  ③ 前隙の解決は**自分が張ったCDに引っかからない**(引っかかると判定が永久に出ない)。
//  ④ 窓とCDの終了時刻は**指を離した時刻**が基準(解決時刻を基準にすると1周期200ms伸びる=弱体化)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGameStore, MELEE_WINDUP_MS, meleeWindupMs, COUNTER_WINDOW, COUNTER_ACCEPT_MS, isCounterActive, COUNTER_COOLDOWN,
  MELEE_LUNGE_PX, MELEE_LUNGE_MS, WHIP_LUNGE_PX, meleeLungePx, knockbackSpeedFor, PLAYER_BASE_SPEED,
} from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const ORIGIN = 50_000;

/** プレイヤーの目の前に雑魚を1体置く(近接が必ず届く距離)。 */
const setup = (): { id: string } => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt('zombie', ORIGIN + 20, ORIGIN, useGameStore.getState().gameTime);
  e.health = 9999; e.maxHealth = 9999;
  useGameStore.setState(s => ({
    enemies: [e],
    player: { ...s.player, x: ORIGIN, y: ORIGIN, health: 9999, maxHealth: 9999,
      counterWindowEnd: 0, counterCooldownEnd: 0, pendingSwingAt: 0, invulnerable: false },
  }));
  void p;
  return { id: e.id };
};

describe('★近接の前隙(SAME_ARENA.md §7)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  it('①②: 指を離した瞬間に窓とCDが開き、判定はまだ出ない', () => {
    const { id } = setup();
    const hpBefore = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    const t0 = Date.now();
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const p = useGameStore.getState().player;
    // ① 窓は今すぐ開く(守りは即応)。
    // 隻狼型(v0.25.3943): 受付は押した瞬間から COUNTER_ACCEPT_MS(200ms)。
    expect(p.counterWindowEnd).toBeGreaterThanOrEqual(t0 + COUNTER_ACCEPT_MS - 50);
    expect(p.counterCooldownEnd).toBeGreaterThan(t0);
    expect(p.pendingSwingAt).toBeGreaterThan(0);
    // ② まだ誰も斬れていない(攻めは約束)。
    expect(useGameStore.getState().enemies.find(e => e.id === id)!.health).toBe(hpBefore);
  });

  it('②: 前隙中は二度振れない(連打で判定を前倒しできない)', () => {
    setup();
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    expect(useGameStore.getState().beginMeleeSwing()).toBe(false);
  });

  it('③: 前隙の解決は自分が張ったCDに阻まれない(阻まれると近接が永久に出ない)', () => {
    const { id } = setup();
    useGameStore.getState().beginMeleeSwing();
    const pendAt = useGameStore.getState().player.pendingSwingAt;
    // 解決時刻(= pendAt + 前隙)は、自分で張ったCDの真っ只中にある。
    expect(pendAt + MELEE_WINDUP_MS).toBeLessThan(useGameStore.getState().player.counterCooldownEnd);
    const hpBefore = useGameStore.getState().enemies.find(e => e.id === id)!.health;
    const r = useGameStore.getState().triggerCounter(pendAt);
    expect(r.swung).toBe(true);
    expect(useGameStore.getState().enemies.find(e => e.id === id)!.health).toBeLessThan(hpBefore);
  });

  it('④: 窓・CDの終了時刻は「指を離した時刻」が基準(解決で後ろへずれない)', () => {
    setup();
    useGameStore.getState().beginMeleeSwing();
    const pendAt = useGameStore.getState().player.pendingSwingAt;
    useGameStore.getState().triggerCounter(pendAt);
    const p = useGameStore.getState().player;
    // 隻狼型(v0.25.3943): 受付窓は [押した瞬間, +COUNTER_ACCEPT_MS]。CDのサイクル(COUNTER_WINDOW基準)は不変。
    expect(p.counterWindowStart).toBe(pendAt);
    expect(p.counterWindowEnd).toBe(pendAt + COUNTER_ACCEPT_MS);
    expect(p.counterCooldownEnd).toBe(pendAt + COUNTER_WINDOW + COUNTER_COOLDOWN);
    // 絵の起点も前隙の起点に揃っている(200ms後に振り直さない)。
    expect(p.meleeSwingAt).toBe(pendAt);
  });

  // ★隻狼型の受付(社長裁定2026-08-26「せきろうにしようか」・v0.25.3943)
  it('隻狼型: 受付は押した瞬間から200ms。早置きは窓が先に切れて失敗する', () => {
    setup();
    useGameStore.getState().beginMeleeSwing();
    const p = useGameStore.getState().player;
    const t0 = p.pendingSwingAt;
    expect(isCounterActive(p, t0)).toBe(true);                          // 押した瞬間=成立(発生0F)
    expect(isCounterActive(p, t0 + COUNTER_ACCEPT_MS)).toBe(true);      // 窓の端まで成立
    expect(isCounterActive(p, t0 + COUNTER_ACCEPT_MS + 1)).toBe(false); // 早置き→当たりが遅れて来たら失敗
    expect(isCounterActive(p, t0 + 399)).toBe(false);                   // 旧仕様(刃が出ている間)の後半は不成立
  });

  it('前隙は200ms(社長裁定)。この値がしゃがみ絵の長さの唯一の出どころ', () => {
    expect(MELEE_WINDUP_MS).toBe(200);
  });

  // ★踏み込み(社長裁定2026-08-24・SAME_ARENA.md §7-4)
  it('踏み込みは前隙の頭で始まり、前隙より早く終わる(=足を着いてから振る)', () => {
    setup();
    useGameStore.setState(s => ({ player: { ...s.player, lastDirection: { x: 1, y: 0 } } }));
    const t0 = Date.now();
    useGameStore.getState().beginMeleeSwing();
    const p = useGameStore.getState().player;
    expect(p.lungeVx).toBeGreaterThan(0);          // 向いている方向へ
    expect(p.lungeVy).toBe(0);
    expect(p.lungeUntil).toBeGreaterThanOrEqual(t0);
    // ★社長の狙い「早めに着地させれば回避にも使える」= 踏み込みは前隙の中で**先に終わる**。
    expect(MELEE_LUNGE_MS).toBeLessThan(MELEE_WINDUP_MS);
  });

  it('踏み込みは向きの逆でも同じ長さ(入力に対する結果が一定=前に出るか分からない、にしない)', () => {
    setup();
    useGameStore.setState(s => ({ player: { ...s.player, lastDirection: { x: -1, y: 0 }, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
    useGameStore.getState().beginMeleeSwing();
    const p = useGameStore.getState().player;
    expect(p.lungeVx).toBeLessThan(0); // 後退中に振れば後ろへ踏み込む(=斬る向きと一致)
    expect(Math.abs(p.lungeVx)).toBeCloseTo(knockbackSpeedFor(MELEE_LUNGE_PX, MELEE_LUNGE_MS), 3);
  });

  // ★社長指示2026-08-24「鞭は踏み込み20で」。武器ごとの値は meleeLungePx に集約する
  // (前隙の meleeWindupMs と同じ作法=測る側3箇所が必ずこの関数を通る)。
  it('鞭の踏み込みは20px・それ以外は50px(武器別は1つの関数に集約)', () => {
    const p = useGameStore.getState().player;
    expect(meleeLungePx({ ...p, subWeapons: [] })).toBe(MELEE_LUNGE_PX);
    expect(meleeLungePx({ ...p, subWeapons: ['whip'] })).toBe(WHIP_LUNGE_PX);
    expect(WHIP_LUNGE_PX).toBe(20);
    // 鞭はリーチ150px(素の近接74pxの倍)なので、踏み込みは短くて良い=長物の性格が一貫する。
    expect(WHIP_LUNGE_PX).toBeLessThan(MELEE_LUNGE_PX);
  });

  it('踏み込みの速度は素の足より十分速い(=回避として成立する)', () => {
    const spd = knockbackSpeedFor(MELEE_LUNGE_PX, MELEE_LUNGE_MS) / 2; // 平均速度(初速最大→0の線形)
    expect(spd).toBeGreaterThan(PLAYER_BASE_SPEED * 3);
  });

  // ★社長裁定2026-08-24「200でいこ」: 一度 鞭だけ250msにしたが撤回。**全武器200ms**。
  // 測る側は必ず meleeWindupMs を通す(直読みが増えると、武器別にした時に片方だけ直って
  // 絵と判定がズレる)。この不変条件を値で固定しておく。
  it('前隙は全武器200ms(測る側は meleeWindupMs を通る)', () => {
    const p = useGameStore.getState().player;
    expect(meleeWindupMs({ ...p, subWeapons: [] })).toBe(MELEE_WINDUP_MS);
    expect(meleeWindupMs({ ...p, subWeapons: ['whip'] })).toBe(MELEE_WINDUP_MS);
  });
});
