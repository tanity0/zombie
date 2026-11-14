// ★社長報告2026-11-12「技が中断されてるはずなのに、アニメーションだけ続いてる時がある。たとえばバットの叩いてくる攻撃」。
// 噛みつきの上に乗る別スプライトの攻撃の絵(コウモリのランタン+炸裂・スケルトンの爪)は、中断の後は出さず(巻き戻しの後に消える)、
// 固まりの間は止まる。中断の道ごとに「判定が書く Enemy」を実際に作って時計へ通す。
import { describe, it, expect, beforeEach } from 'vitest';
import { stepBiteFxClock, zombieBiteFxInterrupted, type BiteFxClock } from './biteFxClock';
import { counterInterruptPatch, biteSpecFor } from './enemyBite';
import { COUNTER_REWIND_MS } from './counterRewind';
import { batSlamFrameWithWindup, BAT_LANTERN_SETTLE_MS, batSlamTotalMs } from './batLanternSwing';
import { spawnEnemyAt } from './enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from './combatTick';
import { useGameStore, buildCorpseFromKill } from '../store/gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const W = 400, B = 200, TAIL = BAT_LANTERN_SETTLE_MS + batSlamTotalMs();
const FRAME = 1000 / 60;

/** 描画と同じ回し方: 毎フレーム step して、出した経過と「炸裂(当たりの絵)を出すか」を集める。 */
const run = (biteAtAt: (gt: number) => number | undefined, from: number, to: number, w = W, b = B) => {
  let c: BiteFxClock | undefined;
  const out: { gt: number; since: number | null; cut: boolean; slam: boolean }[] = [];
  for (let gt = from; gt <= to; gt += FRAME) {
    const s = stepBiteFxClock(c, biteAtAt(gt), gt, w, b, TAIL);
    c = s.clock;
    const slam = s.since !== null && !s.cut && batSlamFrameWithWindup(s.since, s.windupMs, s.since - (s.windupMs + s.biteMs)) !== null;
    out.push({ gt, since: s.since, cut: s.cut, slam });
  }
  return { out, clock: c };
};

describe('stepBiteFxClock(純関数)', () => {
  it('当たるまで生きた噛みは、当たった後も余韻を出し切ってから消える(従来どおり)', () => {
    const at = 1000;
    const { out } = run(gt => (gt < at + W + B ? at : 0), at, at + W + B + TAIL + 100);
    const after = out.filter(o => o.gt >= at + W + B && o.gt <= at + W + B + TAIL - FRAME);
    expect(after.every(o => o.since !== null && !o.cut)).toBe(true);
    expect(after.some(o => o.slam)).toBe(true);
    expect(out[out.length - 1].since).toBeNull();
  });

  it('★当たる前に消えた噛み(中断)は、巻き戻しの窓の後は1フレームも出さない・炸裂は消えた瞬間から出さない', () => {
    const at = 1000, cut = at + W + 80; // 振り下ろしの途中で中断
    const { out, clock } = run(gt => (gt < cut ? at : 0), at, at + W + B + TAIL + 200);
    const afterCut = out.filter(o => o.gt >= cut);
    expect(afterCut.every(o => !o.slam)).toBe(true);
    expect(afterCut.filter(o => o.gt >= cut + COUNTER_REWIND_MS).every(o => o.since === null)).toBe(true);
    // 巻き戻しは止まった所から手前へ(慣性つきで減っていく)。
    const rw = afterCut.filter(o => o.since !== null).map(o => o.since as number);
    expect(rw.length).toBeGreaterThan(0);
    for (let i = 1; i < rw.length; i++) expect(rw[i]).toBeLessThanOrEqual(rw[i - 1]);
    expect(clock).toBeUndefined();
  });

  it('★固まり(判定が biteAt を毎フレーム据え置く)の間は経過が1msも進まない', () => {
    const at0 = 1000, holdFrom = at0 + 150, holdTo = holdFrom + 2000;
    const biteAtAt = (gt: number) => (gt < holdFrom ? at0 : gt < holdTo ? at0 + (gt - holdFrom) : at0 + (holdTo - holdFrom));
    const { out } = run(biteAtAt, at0, holdTo + 50);
    const held = out.filter(o => o.gt >= holdFrom && o.gt < holdTo).map(o => o.since);
    expect(new Set(held.map(v => Math.round((v ?? -1) * 1000))).size).toBe(1);
    expect(held[0]).toBeCloseTo(150, 0);
  });

  it('★生きていた間の尺を覚える(中断/解決で chaffMove が消えて台本の尺が変わっても、余韻は元の尺で出す)', () => {
    const at = 1000;
    const c = stepBiteFxClock(undefined, at, at + 10, 900, 300, TAIL).clock;
    // 当たった直後のフレーム: 台本が既定(W/B)に戻っても、1200ms で当たった扱い(余韻)になる。
    const s = stepBiteFxClock(c, 0, at + 1200, W, B, TAIL);
    expect(s.cut).toBe(false);
    expect(s.windupMs).toBe(900);
    expect(s.since).toBe(1200);
  });
});

describe('★中断の道ごと: 判定が書いた Enemy を通すと、攻撃の絵(炸裂)が出なくなる', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });
  const GT = 10_000_000;
  const bat = (): Enemy => ({ ...spawnEnemyAt('bat', 50_000, 50_000, GT), biteAt: GT - 100, biteDirX: 1, biteDirY: 0 });

  const afterPatch = (e0: Enemy, e1: Enemy, gt: number) => {
    const spec = biteSpecFor(e0.type, e0.chaffMove, e0.aiPhase);
    let c = stepBiteFxClock(undefined, e0.biteAt, gt - FRAME, spec.windupMs, spec.biteMs, TAIL).clock;
    const res: { since: number | null; cut: boolean }[] = [];
    for (let k = 0; k * FRAME < COUNTER_REWIND_MS + 3 * FRAME; k++) {
      const s = stepBiteFxClock(c, e1.biteAt, gt + k * FRAME, spec.windupMs, spec.biteMs, TAIL);
      c = s.clock;
      res.push({ since: s.since, cut: s.cut });
    }
    return res;
  };
  const expectStopped = (res: { since: number | null; cut: boolean }[]) => {
    expect(res.every(r => r.since === null || r.cut)).toBe(true);   // 炸裂を出す(cut でない)フレームが無い
    expect(res[res.length - 1].since).toBeNull();                  // 巻き戻しの後は出さない
  };

  it('カウンター成立(counterInterruptPatch)', () => {
    const e0 = bat();
    expectStopped(afterPatch(e0, { ...e0, ...counterInterruptPatch(e0, GT) }, GT));
  });

  it('死亡(buildCorpseFromKill)', () => {
    const e0 = bat();
    expectStopped(afterPatch(e0, buildCorpseFromKill(e0, { x: 0, y: 0, width: 10, height: 10 }), GT));
  });

  it('気絶・拘束・持ち上げ(combatTick の噛みの中断=biteAt を当たる前に0へ)', () => {
    for (const stop of [{ stunUntil: GT + 1000 }, { rootUntil: GT + 1000 }, { liftUntil: Date.now() + 1000 }] as Partial<Enemy>[]) {
      const e0 = bat();
      const p = useGameStore.getState().player;
      useGameStore.setState({
        gameTime: GT, enemies: [{ ...e0, ...stop }],
        player: { ...p, x: 50_000 + 200, y: 50_000, health: 9999, maxHealth: 9999 },
      });
      applyContactDamage(GT, false, 0, NOOP_COMBAT_EFFECTS);
      const e1 = useGameStore.getState().enemies[0];
      expect(e1.biteAt ?? 0).toBe(0);
      expectStopped(afterPatch(e0, e1, GT));
    }
  });
});

describe('zombieBiteFxInterrupted(ゾンビの牙の輪)', () => {
  it('線が当たる前に消え、技も残っていなければ中断', () => {
    expect(zombieBiteFxInterrupted(false, 100, 200, {})).toBe(true);
    expect(zombieBiteFxInterrupted(false, 100, 200, { biteAt: 0, chaffMove: undefined })).toBe(true);
  });
  it('当たった後・線が出ている間・技が残っている間は中断ではない', () => {
    expect(zombieBiteFxInterrupted(false, 200, 200, {})).toBe(false);
    expect(zombieBiteFxInterrupted(true, 100, 200, {})).toBe(false);
    expect(zombieBiteFxInterrupted(false, 100, 200, { biteAt: 50 })).toBe(false);
    expect(zombieBiteFxInterrupted(false, 100, 200, { chaffMove: 'zombie-double' })).toBe(false);
  });
});
