import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { HIT_STUN_MS_MOB, HIT_STUN_MS_STRONG, KNOCKBACK_WEIGHT_STRONG, KILL_CHAIN_WINDOW_MS } from '../utils/combatFeel';

// 戦闘の手触り(社長指示2026-09-13「では入れてみて」)の配線テスト: 純関数(utils/combatFeel.test.ts)ではなく
// damageEnemy / updateEnemies / knockbackEnemy に**実際に効いているか**を見る(実装精度の規律4)。
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  const st = useGameStore.getState();
  const px = st.player.x + st.player.width / 2;
  const py = st.player.y + st.player.height / 2;
  return { px, py, gt: st.gameTime };
};
const put = (e: ReturnType<typeof spawnEnemyAt>) => {
  useGameStore.setState(s => ({ enemies: [...s.enemies.filter(x => x.id !== e.id), e] }));
  return e.id;
};
const enemy = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;

describe('戦闘の手触り① 局所ストップ(damageEnemy→updateEnemies)', () => {
  it('雑魚はプレイヤーの銃ダメージで hitStunUntil(約60ms)が立ち、DoTでは立たない', () => {
    const { px, py, gt } = setup();
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000 });
    const t0 = Date.now();
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    const u = enemy(id).hitStunUntil ?? 0;
    expect(u).toBeGreaterThanOrEqual(t0 + HIT_STUN_MS_MOB - 5);
    expect(u).toBeLessThanOrEqual(Date.now() + HIT_STUN_MS_MOB + 5);
    const id2 = put({ ...spawnEnemyAt('zombie', px + 260, py, gt), health: 1000, maxHealth: 1000 });
    useGameStore.getState().damageEnemy(id2, 5, false, false, false, 'dot', 'player');
    expect(enemy(id2).hitStunUntil).toBeUndefined();
  });

  it('強個体(pumpkin)は約40ms、ボス級(thor)は立たない', () => {
    const { px, py, gt } = setup();
    const t0 = Date.now();
    const idP = put({ ...spawnEnemyAt('pumpkin', px + 300, py, gt), health: 100000, maxHealth: 100000 });
    useGameStore.getState().damageEnemy(idP, 5, false, false, false, 'gun', 'player');
    const uP = enemy(idP).hitStunUntil ?? 0;
    expect(uP).toBeGreaterThanOrEqual(t0 + HIT_STUN_MS_STRONG - 5);
    expect(uP).toBeLessThanOrEqual(Date.now() + HIT_STUN_MS_STRONG + 5);
    const idT = put({ ...spawnEnemyAt('thor', px + 400, py, gt), health: 100000, maxHealth: 100000 });
    useGameStore.getState().damageEnemy(idT, 5, false, false, false, 'gun', 'player');
    expect(enemy(idT).hitStunUntil).toBeUndefined();
  });

  it('止まっている間は updateEnemies で動かず、ノックバックの期限は止めたぶん後ろへずれる', () => {
    const { px, py, gt } = setup();
    const far = Date.now() + 100000;
    const id = put({
      ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000,
      hitStunUntil: far, knockbackUntil: far + 280, knockbackVx: 200, knockbackVy: 0,
    });
    const before = enemy(id);
    useGameStore.getState().updateEnemies(1 / 60);
    const after = enemy(id);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.knockbackUntil).toBeCloseTo((before.knockbackUntil ?? 0) + 1000 / 60, 3);
  });
});

describe('戦闘の手触り① 重さ(knockbackEnemy)', () => {
  it('強個体は雑魚の半分の速度で飛ぶ(区分の3型とも)', () => {
    const { px, py, gt } = setup();
    const idZ = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1000, maxHealth: 1000 });
    useGameStore.getState().knockbackEnemy(idZ, 1, 0, 1, 3);
    const vZ = enemy(idZ).knockbackVx ?? 0;
    expect(vZ).toBeGreaterThan(0);
    for (const t of ['pumpkin', 'driller', 'logger'] as const) {
      const id = put({ ...spawnEnemyAt(t, px + 300, py, gt), health: 100000, maxHealth: 100000 });
      useGameStore.getState().knockbackEnemy(id, 1, 0, 1, 3);
      expect(enemy(id).knockbackVx ?? 0).toBeCloseTo(vZ * KNOCKBACK_WEIGHT_STRONG, 5);
    }
  });
});

describe('戦闘の手触り② 連続撃破の段(damageEnemy post-set)', () => {
  it('プレイヤーのキルで数が積まれ、3体目で段1・段が上がった瞬間だけ tierAt が更新される', () => {
    const { px, py, gt } = setup();
    const kill = (i: number) => {
      const id = put({ ...spawnEnemyAt('zombie', px + 200 + i * 40, py, gt), health: 1, maxHealth: 1 });
      return useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    };
    expect(kill(0)).toBe(true);
    expect(kill(1)).toBe(true);
    let s = useGameStore.getState();
    expect(s.killChainCount).toBe(2);
    expect(s.killChainTier).toBe(0);
    const tierAtBefore = s.killChainTierAt;
    expect(kill(2)).toBe(true);
    s = useGameStore.getState();
    expect(s.killChainCount).toBe(3);
    expect(s.killChainTier).toBe(1);
    expect(s.killChainTierAt).toBeGreaterThan(tierAtBefore);
    const tierAt1 = s.killChainTierAt;
    expect(kill(3)).toBe(true);
    s = useGameStore.getState();
    expect(s.killChainTier).toBe(1);
    expect(s.killChainTierAt).toBe(tierAt1); // 同じ段の内側では動かない
  });

  it('窓(2.5秒)を過ぎたキルは1から数え直す', () => {
    const { px, py, gt } = setup();
    useGameStore.setState({ killChainCount: 7, killChainLastAt: Date.now() - KILL_CHAIN_WINDOW_MS - 50, killChainTier: 2 });
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    const s = useGameStore.getState();
    expect(s.killChainCount).toBe(1);
    expect(s.killChainTier).toBe(0);
  });

  it('敵側(hateSource≠player)のキルは数えない', () => {
    const { px, py, gt } = setup();
    const id = put({ ...spawnEnemyAt('zombie', px + 200, py, gt), health: 1, maxHealth: 1 });
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'other', 'enemy');
    expect(useGameStore.getState().killChainCount).toBe(0);
  });
});

describe('戦闘の手触り③ 反動(triggerKick / spawnCasing)', () => {
  it('triggerKick は方向を正規化して保存し、spawnCasing は重力つきの粒を作る', () => {
    setup();
    const t0 = Date.now();
    useGameStore.getState().triggerKick(6, 120, -3, 0);
    const s = useGameStore.getState();
    expect(s.kickMag).toBe(6);
    expect(s.kickDur).toBe(120);
    expect(s.kickDirX).toBe(-1);
    expect(s.kickDirY).toBe(0);
    expect(s.kickUntil).toBeGreaterThanOrEqual(t0 + 120);
    const n0 = useGameStore.getState().effects.length;
    useGameStore.getState().spawnCasing(0, 0, 1, 0, '#d4a03a', 2.2, 1);
    const fx = useGameStore.getState().effects;
    expect(fx.length).toBe(n0 + 1);
    const c = fx[fx.length - 1];
    expect(c.kind).toBe('particle');
    if (c.kind === 'particle') {
      expect(c.gravity ?? 0).toBeGreaterThan(0);
      expect(c.color).toBe('#d4a03a');
    }
  });
});
