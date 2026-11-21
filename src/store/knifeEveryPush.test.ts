// ★社長指示2026-11-13「近接は毎回押す」「ボスは変えなくていいです」。
// ナイフの通常の振りは、ボス級でない敵(雑魚・強個体)へは押しの免疫(KNOCKBACK_IMMUNE_MS)を見ずに毎回押す。
// 旧: 立ったまま連続で斬ると2発目が押さずに「その場で0.1秒止める」枝へ落ちていた(骸骨 42→0→37px)。
// ボス級は今どおり(1発目のあとの免疫中は押さない)。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';

let now = 21_000_000;
afterEach(() => { vi.restoreAllMocks(); });

const setup = (type: EnemyType) => {
  now = 21_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false },
    breakableProps: [],
    player: { ...st.player, health: 9999, maxHealth: 9999 },
  }));
  const p = useGameStore.getState().player;
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  const z = { ...e, x: cx + 30, y: cy - e.height / 2, id: 'z', health: 9_999_999, maxHealth: 9_999_999, dormant: false } as Enemy;
  useGameStore.setState({ enemies: [z] });
};
const en = () => useGameStore.getState().enemies.find(e => e.id === 'z')!;

const step = (ms: number) => {
  // 16ms刻みで時間を進める(updateEnemies が押しの速度で敵を動かす)。
  for (let t = 0; t < ms; t += 16) {
    now += 16;
    useGameStore.setState(s => ({ gameTime: s.gameTime + 16, realGameTime: (s.realGameTime ?? 0) + 16 }));
    useGameStore.getState().updateEnemies(16);
  }
};

/** 立ったまま1回振る(useGameLoop と同じ形: beginMeleeSwing → 前隙200ms → triggerCounter(pendAt))。 */
const swing = () => {
  // 敵をプレイヤーの横(射程内)へ戻し、押しの状態だけを持ち越す(免疫は消さない)。
  const p = useGameStore.getState().player;
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
  useGameStore.setState(s => ({
    enemies: s.enemies.map(e => e.id === 'z' ? { ...e, x: cx + 30, y: cy - e.height / 2, knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0, hitStunUntil: undefined } : e),
  }));
  expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
  const pendAt = useGameStore.getState().player.pendingSwingAt;
  expect(pendAt).toBeGreaterThan(0);
  now += 200;
  useGameStore.setState(st => ({ player: { ...st.player, pendingSwingAt: 0 } }));
  const r = useGameStore.getState().triggerCounter(pendAt);
  expect(r.hit).toBe(true);
  const after = en();
  return { kvx: after.knockbackVx ?? 0, kvy: after.knockbackVy ?? 0, x0: after.x, y0: after.y };
};

const movedBy = (x0: number, y0: number) => Math.hypot(en().x - x0, en().y - y0);

describe('ナイフの通常の振りは雑魚・強個体を毎回押す', () => {
  for (const type of ['skeleton', 'zombie'] as EnemyType[]) {
    it(`${type}: 立ったまま3連続で斬ると毎回押される`, () => {
      setup(type);
      for (let i = 0; i < 3; i++) {
        const s = swing();
        expect(Math.hypot(s.kvx, s.kvy)).toBeGreaterThan(0); // 押す枝に入った(止める枝は速度0)
        step(400);
        expect(movedBy(s.x0, s.y0)).toBeGreaterThan(10); // 実際に動いた
        // 振りのCD(約820ms)明けまで待つ=押しの免疫(1750ms)の中で次を振る
        step(500);
        expect(now).toBeLessThan(en().knockbackImmuneUntil ?? 0); // 次の振りはまだ免疫中
      }
    });
  }
});

describe('ボス級は今どおり(免疫中は押さない)', () => {
  it('hunter: 1発目は押し、免疫中の2発目は押さない', () => {
    setup('hunter');
    const s1 = swing();
    expect(Math.hypot(s1.kvx, s1.kvy)).toBeGreaterThan(0);
    const immune = en().knockbackImmuneUntil ?? 0;
    step(900);
    expect(now).toBeLessThan(immune); // まだ免疫中
    const s2 = swing();
    expect(s2.kvx).toBe(0);
    expect(s2.kvy).toBe(0);
  });
});

describe('被弾反撃のナイフも雑魚・強個体を毎回押す(社長「はい」2026-11-13)', () => {
  for (const type of ['skeleton', 'zombie'] as EnemyType[]) {
    it(`${type}: 通常の振りの免疫中でも、被弾反撃の1撃が押す`, () => {
      setup(type);
      const s1 = swing();
      expect(Math.hypot(s1.kvx, s1.kvy)).toBeGreaterThan(0);
      step(500);
      const immune = en().knockbackImmuneUntil ?? 0;
      expect(now).toBeLessThan(immune); // まだ免疫中
      // 敵を横へ戻して、被弾反撃の経路(triggerCounter の第2引数 { targetId, mult })で1撃
      const p = useGameStore.getState().player;
      const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
      useGameStore.setState(s => ({
        enemies: s.enemies.map(e => e.id === 'z' ? { ...e, x: cx + 30, y: cy - e.height / 2, knockbackVx: 0, knockbackVy: 0, knockbackUntil: 0, hitStunUntil: undefined } : e),
      }));
      const r = useGameStore.getState().triggerCounter(undefined, { targetId: 'z', mult: 1 });
      expect(r.hit).toBe(true);
      const after = en();
      expect(Math.hypot(after.knockbackVx ?? 0, after.knockbackVy ?? 0)).toBeGreaterThan(0);
    });
  }
});
