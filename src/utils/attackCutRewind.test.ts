// ★社長裁定2026-11-12「はい」: カウンター以外の中断(気絶・拘束・持ち上げ/浮き・技への切り替え)でも、本体の攻撃シートは
// 立ち絵へ一瞬で戻らず、カウンターと同じ巻き戻し(`counterRewindFrame` の時計・イージング)で戻る。
// カウンターは従来どおり描画側の `enemyCounterRewindTexture` に任せ(ここでは出さない)、死亡は戻さない。
import { describe, it, expect, beforeEach } from 'vitest';
import { attackFrameAfterLive, attackTailFrame, enemyAttackFrameFor, type AttackTailMemo } from './enemyAttackSheet';
import { COUNTER_REWIND_MS } from './counterRewind';
import { biteSpecFor } from './enemyBite';
import { spawnEnemyAt } from './enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from './combatTick';
import { useGameStore } from '../store/gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const FRAMES = 7, IMPACT = 5, FRAME = 1000 / 60;
const NO = { countered: false, corpse: false };

/** 生きている間の記憶(描画の live 分岐と同じ形)。 */
const liveMemo = (e: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>, gt: number): AttackTailMemo => {
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  const f = enemyAttackFrameFor(e, FRAMES, gt, IMPACT);
  return { at: e.biteAt!, windupMs: spec.windupMs, biteMs: spec.biteMs, lungeMs: spec.lungeMs, ...(f !== null ? { lastFrame: f } : {}) };
};

/** 中断の後を毎フレーム回して出たコマを集める。 */
const after = (memo: AttackTailMemo, from: number, opts = NO, corpseFrom = Infinity) => {
  let m: AttackTailMemo | undefined = memo;
  const out: { frame: number | null; rewinding: boolean }[] = [];
  for (let gt = from; gt <= from + COUNTER_REWIND_MS + 4 * FRAME; gt += FRAME) {
    const r = attackFrameAfterLive(m, FRAMES, gt, IMPACT, { ...opts, corpse: opts.corpse || gt >= corpseFrom });
    m = r.memo;
    out.push({ frame: r.frame, rewinding: r.rewinding });
  }
  return out;
};

describe('attackFrameAfterLive(純関数)', () => {
  it('当たった後は従来の余韻(attackTailFrame)と1コマも変わらない', () => {
    const m: AttackTailMemo = { at: 1000, windupMs: 800, biteMs: 200, lastFrame: IMPACT };
    for (let gt = 2000; gt < 2300; gt += FRAME) {
      expect(attackFrameAfterLive(m, FRAMES, gt, IMPACT, NO).frame).toBe(attackTailFrame(m, FRAMES, gt, IMPACT));
    }
  });

  it('★当たる前に消えた(中断)ら、止まったコマから0へ向かって戻り、巻き戻しの窓の後は出さない', () => {
    const m: AttackTailMemo = { at: 1000, windupMs: 800, biteMs: 200, lastFrame: 4 };
    const out = after(m, 1900);
    expect(out[0]).toEqual({ frame: 4, rewinding: true });
    const fr = out.filter(o => o.frame !== null).map(o => o.frame as number);
    for (let k = 1; k < fr.length; k++) expect(fr[k]).toBeLessThanOrEqual(fr[k - 1]);
    expect(fr.length).toBeLessThan(out.length);
    expect(out[out.length - 1].frame).toBeNull();
  });

  it('カウンターで消えた時はここでは出さない(描画のカウンター巻き戻しに任せる=二重に戻さない)', () => {
    const out = after({ at: 1000, windupMs: 800, biteMs: 200, lastFrame: 4 }, 1900, { countered: true, corpse: false });
    expect(out.every(o => o.frame === null)).toBe(true);
  });

  it('死亡は戻さない(死体の流れに攻撃のコマを混ぜない)。巻き戻しの途中で死んだらそこで止める', () => {
    expect(after({ at: 1000, windupMs: 800, biteMs: 200, lastFrame: 4 }, 1900, { countered: false, corpse: true })
      .every(o => o.frame === null)).toBe(true);
    const mid = after({ at: 1000, windupMs: 800, biteMs: 200, lastFrame: 4 }, 1900, NO, 1900 + 40);
    expect(mid.filter((_, k) => 1900 + k * FRAME >= 1940).every(o => o.frame === null)).toBe(true);
  });

  it('0コマ目(構えの先頭)で中断されたら戻すコマが無い=出さない', () => {
    expect(after({ at: 1000, windupMs: 800, biteMs: 200, lastFrame: 0 }, 1100).every(o => o.frame === null)).toBe(true);
  });
});

describe('★中断の道ごと(判定が実際に書く Enemy から): 巻き戻しで戻る', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });
  const GT = 10_000_000;

  for (const type of ['bat', 'skeleton', 'zombie'] as const) {
    it(`${type}: 気絶・拘束・持ち上げで combatTick が噛みを消すと、余韻ではなく巻き戻しになる`, () => {
      for (const stop of [{ stunUntil: GT + 1000 }, { rootUntil: GT + 1000 }, { liftUntil: Date.now() + 1000 }] as Partial<Enemy>[]) {
        useGameStore.getState().resetGame('assault');
        const spec = biteSpecFor(type, undefined, type === 'zombie' ? 'zrush' : undefined);
        const e0: Enemy = { ...spawnEnemyAt(type, 50_000, 50_000, GT), biteAt: GT - spec.windupMs + 1, biteDirX: 1, biteDirY: 0,
          ...(type === 'zombie' ? { aiPhase: 'zrush' as const } : {}) };
        const memo = liveMemo(e0, GT - FRAME);
        const p = useGameStore.getState().player;
        useGameStore.setState({ gameTime: GT, enemies: [{ ...e0, ...stop }], player: { ...p, x: 50_000 + 300, y: 50_000, health: 9999, maxHealth: 9999 } });
        applyContactDamage(GT, false, 0, NOOP_COMBAT_EFFECTS);
        expect(useGameStore.getState().enemies[0].biteAt ?? 0).toBe(0);
        const out = after(memo, GT);
        expect(out[0].rewinding).toBe(true);
        expect(out[0].frame).toBe(memo.lastFrame);
        expect(out[out.length - 1].frame).toBeNull();
      }
    });
  }
});
