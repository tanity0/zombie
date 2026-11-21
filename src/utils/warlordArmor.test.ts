// 侍の甲冑(社長指示2026-11-02): 武将セットを揃えると、小烏丸無し=青(自動斬撃×1.5)/有り=赤(さらに一閃×2)。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useGameStore, warlordArmor, warlordAutoSlashMult, warlordIssenMult, WARLORD_AUTO_SLASH_MULT, WARLORD_ISSEN_MULT } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';

const FULL = { body: 'special-body', arms: 'special-arms', accessory: 'special-accessory' };
const base = () => { useGameStore.getState().resetGame('warrior'); return useGameStore.getState().player; };

describe('侍の甲冑', () => {
  it('武将セット3点で青、小烏丸もあれば赤。欠けていれば無し', () => {
    const p = base();
    expect(warlordArmor({ ...p, equipment: FULL as never, subWeapons: ['katana'] })).toBe('blue');
    expect(warlordArmor({ ...p, equipment: FULL as never, subWeapons: ['murasame'] })).toBe('red');
    expect(warlordArmor({ ...p, equipment: { ...FULL, accessory: null } as never, subWeapons: ['murasame'] })).toBeNull();
    expect(warlordArmor({ ...p, equipment: FULL as never, subWeapons: ['murasame'], pseudoActor: true })).toBeNull();
  });
  it('青=自動斬撃×1.5・一閃は等倍 / 赤=自動斬撃×1.5・一閃×2', () => {
    const p = base();
    const blue = { ...p, equipment: FULL as never, subWeapons: ['katana' as const] };
    const red = { ...p, equipment: FULL as never, subWeapons: ['murasame' as const] };
    expect(warlordAutoSlashMult(blue)).toBe(WARLORD_AUTO_SLASH_MULT);
    expect(warlordIssenMult(blue)).toBe(1);
    expect(warlordAutoSlashMult(red)).toBe(WARLORD_AUTO_SLASH_MULT);
    expect(warlordIssenMult(red)).toBe(WARLORD_ISSEN_MULT);
    expect(warlordAutoSlashMult(p)).toBe(1);
    expect(warlordIssenMult(p)).toBe(1);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  it('倍率は当たった敵への打撃にそのまま乗る(strikeMult)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // クリティカルを出さない
    const p = base();
    const px = p.x + p.width / 2, py = p.y + p.height / 2;
    const hit = (mult: number) => {
      useGameStore.getState().resetGame('warrior');
      useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } }));
      const e = { ...spawnEnemyAt('zombie', px + 40, py, 0), health: 1e6, maxHealth: 1e6 };
      useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
      useGameStore.getState().performKatanaStrike([e.id], 1, false, undefined, mult);
      return 1e6 - useGameStore.getState().enemies.find(x => x.id === e.id)!.health;
    };
    const d1 = hit(1), d15 = hit(WARLORD_AUTO_SLASH_MULT);
    expect(d1).toBeGreaterThan(0);
    expect(d15 / d1).toBeCloseTo(WARLORD_AUTO_SLASH_MULT, 1);
  });
});
