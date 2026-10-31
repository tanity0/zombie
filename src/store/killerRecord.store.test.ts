// 社長報告2026-10-12「あれ？倒された敵が表示される機能は？」: 噛みつき・接触・弾で倒されても、
// リザルトの「倒した相手」(lastDamagerType)と宿敵の昇格に相手の型が届くこと。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy } from '../types/game';

beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
});

const putEnemy = (id: string, type: Enemy['type'], extra: Partial<Enemy> = {}) => {
  const base = useGameStore.getState().enemies[0];
  const e = { ...(base ?? {}), id, type, x: 0, y: 0, width: 20, height: 20, health: 10, maxHealth: 10, ...extra } as Enemy;
  useGameStore.setState({ enemies: [e] });
};

describe('倒した相手の記録', () => {
  it('接触(個体idだけ渡る)で型と個体が記録される', () => {
    putEnemy('e-contact', 'skeleton');
    useGameStore.getState().damagePlayer(1, '骸骨', 0, 0, undefined, undefined, undefined, 'e-contact', 'e-contact');
    const s = useGameStore.getState();
    expect(s.lastDamagerType).toBe('skeleton');
    expect(s.lastDamagerId).toBe('e-contact');
    expect(s.lastDamagerWasNamed).toBe(false);
  });
  it('弾は発射元の手がかりで記録され、被弾無敵は従来どおり1本(個体別にならない)', () => {
    useGameStore.setState({ enemies: [] });
    useGameStore.getState().damagePlayer(1, '敵の飛び道具', 0, 0, undefined, undefined, undefined, undefined, undefined, { type: 'zombie', id: 'gone' });
    const s = useGameStore.getState();
    expect(s.lastDamagerType).toBe('zombie');
    expect(s.player.iframeBySource?.['gone']).toBeUndefined();
  });
  it('宿敵本人の接触で倒されると「因縁」になる', () => {
    useGameStore.setState({ namedFoe: { type: 'zombie', name: 'ヒュドラ', grudge: 0 } });
    putEnemy('e-named', 'zombie', { isNamed: true });
    const hp = useGameStore.getState().player.health;
    useGameStore.getState().damagePlayer(hp + 100, 'ゾンビ', 0, 0, undefined, undefined, undefined, 'e-named', 'e-named');
    const s = useGameStore.getState();
    expect(s.player.health).toBeLessThanOrEqual(0);
    expect(s.namedFoePromotion?.kind).toBe('grudge');
  });
  it('ふつうの敵の接触で倒されると、その型が新しい宿敵になる', () => {
    useGameStore.setState({ namedFoe: null });
    putEnemy('e-new', 'skeleton');
    const hp = useGameStore.getState().player.health;
    useGameStore.getState().damagePlayer(hp + 100, '骸骨', 0, 0, undefined, undefined, undefined, 'e-new', 'e-new');
    const s = useGameStore.getState();
    expect(s.namedFoePromotion?.kind).toBe('new');
    expect(s.namedFoe?.type).toBe('skeleton');
  });
});
