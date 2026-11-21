// シールドの熟練度: 盾が技を防ぐ共通口(noteShieldGuard)をストアで動かし、貯まる量と二重に数えないことを固定する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, noteShieldGuard } from './gameStore';
import { beginMasteryRun, getPendingMastery } from '../utils/masteryRun';
import type { Projectile } from '../types/game';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const shield = (patch: Partial<Projectile> = {}): Projectile => ({
  id: 'proj-shield-test', x: 100, y: 100, width: 58, height: 16,
  speed: 0, damage: 0, direction: { x: 0, y: -1 }, weaponType: 'shield', weaponKey: 'sub-shield',
  duration: 5000, createdAt: Date.now(), passthrough: false, hitEnemies: [], hostile: false, reflected: false,
  shieldHp: 30, shieldMaxHp: 30, shieldOwnerKind: 'player', shieldOwnerId: null,
  ...patch,
});
const rect = { x: 100, y: 100, width: 58, height: 16 };

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
  useGameStore.setState({ enemies: [], projectiles: [], shieldGuardFx: [] });
  beginMasteryRun({ ignored: false });
});

describe('noteShieldGuard × 熟練度', () => {
  it('プレイヤーの盾が防ぐと 300、同じ攻撃をもう一度受け止めても増えない', () => {
    useGameStore.setState({ projectiles: [shield()] });
    const attacker = { type: 'zombie' as const, id: 'e1', bossState: 'swing' };
    noteShieldGuard(rect, { attacker, kind: 'hit' });
    noteShieldGuard(rect, { attacker, kind: 'hit' });
    expect(getPendingMastery()).toEqual({ shield: 300 });
    noteShieldGuard(rect, { attacker: { type: 'zombie', id: 'e2', bossState: 'swing' }, kind: 'hit' });
    expect(getPendingMastery()).toEqual({ shield: 600 });
  });
  it('守護霊の盾では貯めない', () => {
    useGameStore.setState({ projectiles: [shield({ shieldOwnerKind: 'ghost-ally', ownerGhost: true })] });
    noteShieldGuard(rect, { attacker: { type: 'zombie', id: 'e1' }, kind: 'hit' });
    expect(getPendingMastery()).toEqual({});
  });
  it('盾が無ければ貯めない', () => {
    noteShieldGuard(rect, { attacker: { type: 'zombie', id: 'e1' }, kind: 'hit' });
    expect(getPendingMastery()).toEqual({});
  });
});
