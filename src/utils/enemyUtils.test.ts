import { describe, it, expect } from 'vitest';
import { areaIndexForPos, isBossType, isHiddenBoss, isValidForArea, AREA_COUNT, AREA_MAX_ENEMIES, resolveEnemyTarget, spawnEnemyAt, getEnemyFireProfile } from './enemyUtils';
import type { Enemy, Player, Summon } from '../types/game';

const mkEnemy = (x: number, y: number): Enemy =>
  ({ x, y, width: 32, height: 32 } as unknown as Enemy);
const mkPlayer = (x: number, y: number): Player =>
  ({ x, y, width: 32, height: 32 } as unknown as Player);
const mkSummon = (x: number, y: number): Summon =>
  ({ x, y, width: 24, height: 24, kind: 'normal' } as unknown as Summon);

describe('areaIndexForPos', () => {
  it('returns area by radial distance from the origin', () => {
    expect(areaIndexForPos(0, 0)).toBe(0);
    expect(areaIndexForPos(1499, 0)).toBe(0);
    expect(areaIndexForPos(1500, 0)).toBe(1);
    expect(areaIndexForPos(0, 3000)).toBe(2);
    expect(areaIndexForPos(5000, 0)).toBe(3);
    expect(areaIndexForPos(7500, 0)).toBe(4);
  });
  it('clamps to the deepest area far out', () => {
    expect(areaIndexForPos(99999, 99999)).toBe(AREA_COUNT - 1);
  });
});

describe('AREA_MAX_ENEMIES', () => {
  it('matches the per-area cap spec (5/7/10/10/10) and covers every area', () => {
    expect(AREA_MAX_ENEMIES).toEqual([5, 7, 10, 10, 10]);
    expect(AREA_MAX_ENEMIES).toHaveLength(AREA_COUNT);
  });
});

describe('AREA_WEIGHT v2 (分布図再構築・DISTRIBUTION_REDESIGN.md②)', () => {
  it('never lets chaff (bat/skeleton) go extinct in deep areas (kill-flow guard)', () => {
    for (let area = 0; area < AREA_COUNT; area++) {
      expect(isValidForArea('bat', area)).toBe(true);
      expect(isValidForArea('skeleton', area)).toBe(true);
    }
  });
  it('zombie stays valid everywhere (its ratio drops deep, but never to zero)', () => {
    for (let area = 0; area < AREA_COUNT; area++) {
      expect(isValidForArea('zombie', area)).toBe(true);
    }
  });
  it('area-gated types are unchanged by the redesign (ghost/werewolf/pumpkin still absent early)', () => {
    expect(isValidForArea('ghost', 0)).toBe(false);
    expect(isValidForArea('ghost', 1)).toBe(false);
    expect(isValidForArea('werewolf', 0)).toBe(false);
    expect(isValidForArea('pumpkin', 0)).toBe(false);
    expect(isValidForArea('pumpkin', 1)).toBe(false);
    expect(isValidForArea('pumpkin', 2)).toBe(false);
  });
});

describe('resolveEnemyTarget (seeker hidden behavior)', () => {
  it('targets the player normally when not hidden', () => {
    const t = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(100, 0), [], 400);
    expect(t.hidden).toBe(false);
    expect(t.isSummon).toBe(false);
    expect(t.x).toBeCloseTo(116); // player center
  });
  it('when player hidden and no summon in range → hidden=true (no target)', () => {
    const t = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(100, 0), [], 400, true);
    expect(t.hidden).toBe(true);
  });
  it('when player hidden but a summon is in aggro range → targets the summon', () => {
    const t = resolveEnemyTarget(mkEnemy(0, 0), mkPlayer(100, 0), [mkSummon(50, 0)], 400, true);
    expect(t.hidden).toBe(false);
    expect(t.isSummon).toBe(true);
  });
});

describe('isBossType', () => {
  it('flags boss/elite types only', () => {
    expect(isBossType('giantbat')).toBe(true);
    expect(isBossType('pumpkin')).toBe(true);
    expect(isBossType('reaper')).toBe(true);
    expect(isBossType('zombie')).toBe(false);
    expect(isBossType('plant')).toBe(false);
  });
  it('counts the hidden bosses as bosses', () => {
    expect(isBossType('mimir')).toBe(true);
    expect(isBossType('jormungand')).toBe(true);
  });
});

describe('hidden boss (mimir/jormungand) spec', () => {
  it('isHiddenBoss flags only the two hidden bosses', () => {
    expect(isHiddenBoss('mimir')).toBe(true);
    expect(isHiddenBoss('jormungand')).toBe(true);
    expect(isHiddenBoss('giantbat')).toBe(false);
    expect(isHiddenBoss('reaper')).toBe(false);
  });
  it('has individually-tuned HP (社長指示), 2x giant contact damage, faster-than-giant walk speed', () => {
    // 裏ボスは hpMult を掛けず health を直接 maxHealth に(個別指定)。
    const giant = spawnEnemyAt('giantbat', 0, 0, 0);
    const mimir = spawnEnemyAt('mimir', 0, 0, 0);
    const jorm = spawnEnemyAt('jormungand', 0, 0, 0);
    const skadi = spawnEnemyAt('skadi', 0, 0, 0);
    expect(mimir.maxHealth).toBe(6666);
    expect(jorm.maxHealth).toBe(7500);
    expect(skadi.maxHealth).toBe(10000);
    // ダメージは giant の2倍据え置き。歩行速度は社長指示で少し上げた(70→90 base)=giant より速い。3裏ボスは同速。
    expect(jorm.damage).toBe(giant.damage * 2);
    expect(mimir.damage).toBe(giant.damage * 2);
    expect(jorm.speed).toBeGreaterThan(giant.speed);
    expect(mimir.speed).toBe(jorm.speed);
    expect(skadi.speed).toBe(jorm.speed);
  });
  it('hitbox = a wide footprint strip (3x body is visual-only, decoupled in pixi)', () => {
    // 社長指示で「当たり判定=足元の四角(帯)」に変更。巨体(約3倍)の見た目は pixi の BOSS_SPRITE_FIT で
    // 描画のみ拡大し、AABB(width/height)はこの帯=接地footprint。よって幅は広いが高さは低い(平たい矩形)。
    const giant = spawnEnemyAt('giantbat', 0, 0, 0);
    const jorm = spawnEnemyAt('jormungand', 0, 0, 0);
    const mimir = spawnEnemyAt('mimir', 0, 0, 0);
    // footprint は通常ボス(giant)より広い接地幅を持つ。
    expect(jorm.width).toBeGreaterThanOrEqual(giant.width * 3); // 346 >= 180
    expect(mimir.width).toBeGreaterThanOrEqual(giant.width * 2); // 165 >= 120
    // 帯は平たい(高さ<幅)=足元の四角であることを担保。
    expect(jorm.height).toBeLessThan(jorm.width);
    expect(mimir.height).toBeLessThan(mimir.width);
  });
  it('exposes a fire profile (bullets driven by the controller)', () => {
    expect(getEnemyFireProfile(spawnEnemyAt('jormungand', 0, 0, 0))).not.toBeNull();
    expect(getEnemyFireProfile(spawnEnemyAt('mimir', 0, 0, 0))).not.toBeNull();
  });
});
