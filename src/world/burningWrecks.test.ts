import { describe, it, expect, afterEach } from 'vitest';
import {
  burningWrecksInRegion, isBurningProp, BURNABLE_WRECK_TEX, BURNING_WRECK_FRACTION,
} from './burningWrecks';
import { cityPropsInRegion, cityPropDef, STAGE5_PROPS, STAGE_PROPS } from './cityProps';
import { markObstacleDestroyed, clearDestroyedObstacles } from './destructibles';

afterEach(() => clearDestroyedObstacles());

describe('燃える残骸(ステージ5)', () => {
  it('燃え得る絵は全部 STAGE5_PROPS に在り、デカールではない', () => {
    for (const tex of BURNABLE_WRECK_TEX) {
      const def = STAGE5_PROPS.find(d => d.tex === tex);
      expect(def, tex).toBeDefined();
      expect(def!.decal, tex).toBe(false);
    }
  });

  it('燃えるのは燃え得る種類の一部(およそ BURNING_WRECK_FRACTION)', () => {
    const all = cityPropsInRegion('stage5', -6000, -6000, 6000, 6000);
    const eligible = all.filter(p => { const d = cityPropDef('stage5', p.variant)!; return !d.decal && BURNABLE_WRECK_TEX.has(d.tex); });
    const burning = all.filter(p => isBurningProp('stage5', p));
    expect(eligible.length).toBeGreaterThan(200);
    for (const p of burning) {
      const d = cityPropDef('stage5', p.variant)!;
      expect(d.decal).toBe(false);
      expect(BURNABLE_WRECK_TEX.has(d.tex)).toBe(true);
    }
    const frac = burning.length / eligible.length;
    expect(frac).toBeGreaterThan(BURNING_WRECK_FRACTION - 0.08);
    expect(frac).toBeLessThan(BURNING_WRECK_FRACTION + 0.08);
  });

  it('決定的で、引く範囲に依らない', () => {
    const big = burningWrecksInRegion('stage5', -3000, -3000, 3000, 3000);
    const again = burningWrecksInRegion('stage5', -3000, -3000, 3000, 3000);
    expect(again.map(w => w.id)).toEqual(big.map(w => w.id));
    const small = burningWrecksInRegion('stage5', 0, 0, 1500, 1200);
    const inSmall = big.filter(w => w.footX >= 0 && w.footX <= 1500 && w.footY >= 0 && w.footY <= 1200);
    expect(small.map(w => w.id).sort()).toEqual(inSmall.map(w => w.id).sort());
    expect(small.length).toBeGreaterThan(0);
  });

  it('壊された置物は燃えない(消える)', () => {
    const list = burningWrecksInRegion('stage5', -3000, -3000, 3000, 3000);
    const victim = list[0];
    markObstacleDestroyed(victim.id);
    const after = burningWrecksInRegion('stage5', -3000, -3000, 3000, 3000);
    expect(after.some(w => w.id === victim.id)).toBe(false);
    expect(after.length).toBe(list.length - 1);
  });

  it('他のステージ(散布カタログ)では燃えない', () => {
    for (const farKey of Object.keys(STAGE_PROPS)) {
      if (farKey === 'stage5') continue;
      expect(burningWrecksInRegion(farKey, -3000, -3000, 3000, 3000)).toEqual([]);
      for (const p of cityPropsInRegion(farKey, -3000, -3000, 3000, 3000)) expect(isBurningProp(farKey, p)).toBe(false);
    }
    expect(burningWrecksInRegion('forest', -3000, -3000, 3000, 3000)).toEqual([]);
  });

  it('炎の大きさの元になる絵の矩形は足元から上', () => {
    for (const w of burningWrecksInRegion('stage5', -2000, -2000, 2000, 2000)) {
      expect(w.art.y + w.art.height).toBeCloseTo(w.footY, 5);
      expect(w.art.width).toBeGreaterThan(10);
      expect(w.seed).toBeGreaterThanOrEqual(0);
      expect(w.seed).toBeLessThan(1);
    }
  });
});
