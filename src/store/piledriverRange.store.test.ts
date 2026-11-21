// パイルドライバー(handgun-t3-piledriver)の社長裁定2026-11-13の2件:
//  1. 「はい」=外れた弾を杭の射程で消す(gameStore.updateProjectiles: 射程の端で止めて当たり判定を受け、次の tick で消す)
//  2. 「はい」=刺さった瞬間に一瞬止める(applyPiledriverHitstop)。★社長指示2026-11-14: 画面全体ではなく刺さった敵の hitStunUntil だけ
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { piledriverRangePx, PILEDRIVER_WEAPON_KEY } from '../utils/weaponUtils';
import { applyPiledriverHitstop, PILEDRIVER_HITSTOP_MS } from '../utils/piledriverImpactFx';
import { getPileHitLog } from '../utils/pileHitLog';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Projectile, Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
setTreesDisabled(true); setTorchesDisabled(true);

const pile = (over: Partial<Projectile> = {}): Projectile => {
  const pl = useGameStore.getState().player;
  const x = pl.x + pl.width / 2 - 6, y = pl.y + pl.height / 2 - 6;
  return {
    id: `pile-${Math.random().toString(36).slice(2)}`,
    x, y, originX: x, originY: y, width: 12, height: 12, speed: 620, damage: 36,
    direction: { x: 1, y: 0 }, weaponType: 'handgun', weaponKey: PILEDRIVER_WEAPON_KEY,
    duration: 1400, createdAt: Date.now(), passthrough: false, hitEnemies: [],
    hostile: false, reflected: false, ...over,
  };
};
/** 弾が飛んでいる間に通った区間(弾の矩形の右端の最大値)と、消えるまでの tick 数。 */
const fly = (p: Projectile) => {
  useGameStore.setState({ projectiles: [p] });
  let maxRight = -Infinity, ticks = 0;
  while (useGameStore.getState().projectiles.some(q => q.id === p.id) && ticks < 200) {
    useGameStore.getState().updateProjectiles(1 / 60);
    const q = useGameStore.getState().projectiles.find(r => r.id === p.id);
    if (q) maxRight = Math.max(maxRight, q.x + q.width);
    ticks++;
  }
  return { maxRight, ticks };
};
/** 弾の矩形が敵の矩形(x0〜x0+w)に一度でも重なるか=当たり得るか(当たり判定は矩形の重なり)。 */
const reachesEnemyAt = (dx: number) => {
  const p = pile();
  const left = p.x + p.width / 2 + dx;
  const { maxRight } = fly(p);
  return maxRight >= left;
};

describe('パイルドライバーの弾は杭の射程で消える(社長裁定2026-11-13「はい」)', () => {
  beforeEach(() => { useGameStore.getState().resetGame('warrior'); useGameStore.setState({ enemies: [] }); });

  it('射程の端より先へは進まず、端に着いた次の tick で消える', () => {
    const p = pile();
    const cx0 = p.x + p.width / 2;
    useGameStore.setState({ projectiles: [p] });
    let last: Projectile | undefined;
    for (let i = 0; i < 200; i++) {
      useGameStore.getState().updateProjectiles(1 / 60);
      const q = useGameStore.getState().projectiles.find(r => r.id === p.id);
      if (!q) break;
      last = q;
      expect(q.x + q.width / 2 - cx0).toBeLessThanOrEqual(piledriverRangePx() + 1e-6);
    }
    expect(useGameStore.getState().projectiles.some(r => r.id === p.id)).toBe(false);
    expect(last && last.x + last.width / 2 - cx0).toBeCloseTo(piledriverRangePx(), 5); // 端で1度は判定を受ける
    // 杭の絵が空振りと分かる記録
    expect(getPileHitLog().some(n => n.id === p.id && n.miss === true)).toBe(true);
  });

  it('射程の外(射程+弾の半分より先)に置いた敵には届かない', () => {
    expect(reachesEnemyAt(piledriverRangePx() + 6 + 4)).toBe(false);
    expect(reachesEnemyAt(400)).toBe(false);
  });

  it('射程の内に置いた敵には今どおり届く', () => {
    expect(reachesEnemyAt(piledriverRangePx() - 20)).toBe(true);
    expect(reachesEnemyAt(40)).toBe(true);
  });

  it('打ち返された弾・他の武器の弾は対象外(今どおり飛ぶ)', () => {
    const r = fly(pile({ reflected: true, duration: 300 }));
    const p0 = pile();
    expect(r.maxRight - (p0.x + p0.width)).toBeGreaterThan(piledriverRangePx() + 20);
    const g = fly(pile({ weaponKey: 'handgun-t3', duration: 300 }));
    expect(g.maxRight - (p0.x + p0.width)).toBeGreaterThan(piledriverRangePx() + 20);
  });

  it('幻影の弾(敵側)も射程で消える(杭の記録は残さない)', () => {
    const p = pile({ hostile: true });
    const { maxRight } = fly(p);
    expect(maxRight - (p.x + p.width)).toBeLessThanOrEqual(piledriverRangePx() + 1e-6);
    expect(getPileHitLog().some(n => n.id === p.id)).toBe(false);
  });
});

describe('杭が刺さった瞬間に刺さった敵だけを止める(社長指示2026-11-14「全体で止めるのではなく、個体の方に変更」)', () => {
  const put = (type: EnemyType, id: string, over: Partial<Enemy> = {}) => {
    const e = { ...spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime), id, dormant: false, ...over } as Enemy;
    useGameStore.setState(st => ({ enemies: [...st.enemies, e] }));
  };
  const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
  beforeEach(() => { useGameStore.getState().resetGame('warrior'); useGameStore.setState({ hitstopUntil: 0, enemies: [] }); });

  it('自分の弾が刺さると、その敵の hitStunUntil だけが立つ(画面全体の止めは立たない・ほかの敵は止まらない)', () => {
    put('zombie', 'z1'); put('zombie', 'z2');
    const t0 = Date.now();
    applyPiledriverHitstop({ hostile: false, reflected: false }, 'z1');
    const until = en('z1').hitStunUntil!;
    expect(until).toBeGreaterThanOrEqual(t0 + PILEDRIVER_HITSTOP_MS);
    expect(until).toBeLessThanOrEqual(Date.now() + PILEDRIVER_HITSTOP_MS);
    expect(en('z2').hitStunUntil).toBeUndefined();
    expect(useGameStore.getState().hitstopUntil).toBe(0);
  });

  it('今の止めの方が長ければ縮めない(max)', () => {
    const far = Date.now() + 5000;
    put('zombie', 'z1', { hitStunUntil: far });
    applyPiledriverHitstop({ hostile: false }, 'z1');
    expect(en('z1').hitStunUntil).toBe(far);
  });

  it('ボス級(hitStunMsFor が 0 の型)には書かない', () => {
    put('reaper', 'b1');
    applyPiledriverHitstop({ hostile: false }, 'b1');
    expect(en('b1').hitStunUntil).toBeUndefined();
  });

  it('守護霊・敵側・打ち返された弾・リズム中は止めない', () => {
    put('zombie', 'z1');
    applyPiledriverHitstop({ hostile: false, ownerGhost: true }, 'z1');
    applyPiledriverHitstop({ hostile: true }, 'z1');
    applyPiledriverHitstop({ hostile: false, reflected: true }, 'z1');
    useGameStore.setState(st => ({ rhythm: { ...st.rhythm, active: true } }));
    applyPiledriverHitstop({ hostile: false }, 'z1');
    expect(en('z1').hitStunUntil).toBeUndefined();
    expect(useGameStore.getState().hitstopUntil).toBe(0);
  });

  it('連射でも積み上がらない(長い方を採る)', () => {
    put('zombie', 'z1');
    applyPiledriverHitstop({ hostile: false }, 'z1');
    applyPiledriverHitstop({ hostile: false }, 'z1');
    expect(en('z1').hitStunUntil!).toBeLessThanOrEqual(Date.now() + PILEDRIVER_HITSTOP_MS);
  });
});
