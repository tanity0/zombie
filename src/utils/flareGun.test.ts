import { describe, it, expect } from 'vitest';
import {
  activeFlareTargets, pruneFlares,
  FLARE_GUN_CD_MS_BY_LEVEL, FLARE_GUN_DURATION_MS, FLARE_GUN_FLIGHT_MS,
  FlareGunFlare,
} from './flareGun';
import { resolveEnemyTarget } from './enemyUtils';
import { ALCHEMY_AGGRO_RANGE } from './summonUtils';
import type { Enemy, Player } from '../types/game';

const flare = (id: string, firedAt: number, x = 500, y = 0): FlareGunFlare => ({
  id, fromX: 0, fromY: 0, x, y,
  firedAt,
  landAt: firedAt + FLARE_GUN_FLIGHT_MS,
  until: firedAt + FLARE_GUN_FLIGHT_MS + FLARE_GUN_DURATION_MS,
});

describe('flareGun 定数(§6.6)', () => {
  it('CD=Lv1:9秒/Lv2:7秒/Lv3:5秒(社長指定v0.25.1740)・引き付け3秒', () => {
    expect(FLARE_GUN_CD_MS_BY_LEVEL[1]).toBe(9000);
    expect(FLARE_GUN_CD_MS_BY_LEVEL[2]).toBe(7000);
    expect(FLARE_GUN_CD_MS_BY_LEVEL[3]).toBe(5000);
    expect(FLARE_GUN_DURATION_MS).toBe(3000);
  });
});

describe('activeFlareTargets', () => {
  it('飛翔中(landAt前)は引き付けない(疑似召喚を返さない)', () => {
    const f = flare('a', 1000);
    expect(activeFlareTargets([f], 1000 + FLARE_GUN_FLIGHT_MS - 1)).toHaveLength(0);
  });

  it('着弾〜3秒の間だけ疑似召喚(kind=normal・中心=着弾点)を返す', () => {
    const f = flare('a', 1000, 500, 200);
    const ts = activeFlareTargets([f], 1000 + FLARE_GUN_FLIGHT_MS);
    expect(ts).toHaveLength(1);
    expect(ts[0].kind).toBe('normal');
    expect(ts[0].x + ts[0].width / 2).toBeCloseTo(500);  // 中心=着弾点
    expect(ts[0].y + ts[0].height / 2).toBeCloseTo(200);
    // 3秒経過で消える
    expect(activeFlareTargets([f], f.until)).toHaveLength(0);
  });
});

describe('pruneFlares', () => {
  it('寿命内は同じ配列を返し(書き込み間引き)、寿命切れは取り除く', () => {
    const a = flare('a', 0);
    const b = flare('b', 5000);
    const arr = [a, b];
    expect(pruneFlares(arr, a.until - 1)).toBe(arr); // 変化なし=同一参照
    const pruned = pruneFlares(arr, a.until);        // a だけ寿命切れ
    expect(pruned.map(f => f.id)).toEqual(['b']);
  });
});

describe('resolveEnemyTarget との統合(疑似召喚として効く)', () => {
  const mkEnemy = (x: number, y: number): Enemy =>
    ({ id: 'e', x, y, width: 20, height: 20, type: 'skeleton' } as unknown as Enemy);
  const mkPlayer = (x: number, y: number): Player =>
    ({ x, y, width: 20, height: 20 } as unknown as Player);

  it('着弾中のフレアが敵からALCHEMY_AGGRO_RANGE内かつプレイヤーより近ければ、敵はフレアを狙う', () => {
    const f = flare('a', 0, 100, 0); // 着弾点(100,0)
    const targets = activeFlareTargets([f], f.landAt);
    // 敵(0,0中心10,10)、プレイヤーは遠く(1000,0)
    const tgt = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(1000, 0), targets, ALCHEMY_AGGRO_RANGE);
    expect(tgt.isSummon).toBe(true);
    expect(tgt.x).toBeCloseTo(100);
    expect(tgt.y).toBeCloseTo(0);
  });

  it('範囲外(380px超)のフレアには引き付けられない(プレイヤーを狙う)', () => {
    const f = flare('a', 0, ALCHEMY_AGGRO_RANGE + 100, 0);
    const targets = activeFlareTargets([f], f.landAt);
    const tgt = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(50, 0), targets, ALCHEMY_AGGRO_RANGE);
    expect(tgt.isSummon).toBe(false);
  });
});
