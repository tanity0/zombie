import { describe, it, expect } from 'vitest';
import { areaIndexForPos, isBossType, isHiddenBoss, isValidForArea, AREA_COUNT, AREA_MAX_ENEMIES, resolveEnemyTarget, spawnEnemyAt, getEnemyFireProfile, generateEnemy } from './enemyUtils';
import type { Enemy, Player, Summon, GameBounds } from '../types/game';

const mkEnemy = (x: number, y: number): Enemy =>
  ({ x, y, width: 32, height: 32 } as unknown as Enemy);
const mkPlayer = (x: number, y: number): Player =>
  ({ x, y, width: 32, height: 32 } as unknown as Player);
const mkSummon = (x: number, y: number): Summon =>
  ({ x, y, width: 24, height: 24, kind: 'normal' } as unknown as Summon);
const BOUNDS: GameBounds = { width: 800, height: 600 };

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
  it('PACING_REDESIGN.mdバッチ3完成版(Tank化): pumpkin/werewolfは全エリアで通常湧きプールから撤退(重み0)', () => {
    for (let area = 0; area < AREA_COUNT; area++) {
      expect(isValidForArea('werewolf', area), `area ${area}`).toBe(false);
      expect(isValidForArea('pumpkin', area), `area ${area}`).toBe(false);
    }
  });
});

describe('scene featured floor (DISTRIBUTION_REDESIGN.md① + PACING_REDESIGN.mdバッチ1.5 opt-in)', () => {
  // area 0 (origin): pumpkin/werewolf are normally weight-0 (isValidForArea === false).
  const area0Player = mkPlayer(0, 0);

  it('without featured, an area-gated type is never picked', () => {
    for (let i = 0; i < 200; i++) {
      const e = generateEnemy(0, area0Player, BOUNDS, undefined, null, 0, false, 0, []);
      expect(e.type).not.toBe('pumpkin');
      expect(e.type).not.toBe('werewolf');
    }
  });

  it('with featured but floorAllowed=false (gate scenes) — the floor does NOT apply, so an area-gated problem child is never picked (バッチ1.5: closes the gate-scene backdoor)', () => {
    for (let i = 0; i < 300; i++) {
      const e = generateEnemy(0, area0Player, BOUNDS, undefined, null, 0, false, 0, ['pumpkin', 'werewolf'], [], 1, false);
      expect(e.type).not.toBe('pumpkin');
      expect(e.type).not.toBe('werewolf');
    }
  });

  it('with featured AND floorAllowed=true (relief/mowdown scenes) — an area-gated type can be picked (floor bypasses the area gate)', () => {
    const types = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const e = generateEnemy(0, area0Player, BOUNDS, undefined, null, 0, false, 0, ['pumpkin'], [], 1, true);
      types.add(e.type);
    }
    expect(types.has('pumpkin')).toBe(true);
  });

  it('flags sceneSpawn on area-invalid picks (floorAllowed=true) so distance-recycle can exempt them, but not on normal picks', () => {
    let sawFlaggedPumpkin = false;
    for (let i = 0; i < 300; i++) {
      const e = generateEnemy(0, area0Player, BOUNDS, undefined, null, 0, false, 0, ['pumpkin'], [], 1, true);
      if (e.type === 'pumpkin') {
        expect(e.sceneSpawn).toBe(true);
        sawFlaggedPumpkin = true;
      } else {
        // bat/skeleton/zombie are all naturally valid in area 0 — must NOT be flagged.
        expect(e.sceneSpawn).toBeUndefined();
      }
    }
    expect(sawFlaggedPumpkin).toBe(true);
  });
});

describe('rareMult (DISTRIBUTION_REDESIGN.md③: scene/rank-driven rare-tier演出)', () => {
  // area 4 (deep) has the highest base rare rate (blue 0.12) so rareMult=0 is easy to prove absolute.
  const deepPlayer = mkPlayer(8000, 0);

  it('rareMult=0 (relief scenes) never rolls a colored (rare) enemy', () => {
    for (let i = 0; i < 300; i++) {
      const e = generateEnemy(0, deepPlayer, BOUNDS, undefined, null, 0, false, 0, [], [], 0);
      expect(e.colorTier).toBeUndefined();
    }
  });

  it('rareMult>1 (gate scenes) can still roll rare tiers (baseline unbroken)', () => {
    let sawColor = false;
    for (let i = 0; i < 400; i++) {
      const e = generateEnemy(0, deepPlayer, BOUNDS, undefined, null, 0, false, 0, [], [], 1.35);
      if (e.colorTier) sawColor = true;
    }
    expect(sawColor).toBe(true);
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
    expect(isBossType('thor')).toBe(true);
  });
});

describe('hidden boss (mimir/jormungand/skadi/thor) spec', () => {
  it('isHiddenBoss flags only the four hidden bosses', () => {
    expect(isHiddenBoss('mimir')).toBe(true);
    expect(isHiddenBoss('jormungand')).toBe(true);
    expect(isHiddenBoss('skadi')).toBe(true);
    expect(isHiddenBoss('thor')).toBe(true);
    expect(isHiddenBoss('giantbat')).toBe(false);
    expect(isHiddenBoss('reaper')).toBe(false);
  });
  it('has individually-tuned HP (社長指示), 2x giant contact damage, faster-than-giant walk speed', () => {
    // 裏ボスは hpMult を掛けず health を直接 maxHealth に(個別指定)。
    const giant = spawnEnemyAt('giantbat', 0, 0, 0);
    const mimir = spawnEnemyAt('mimir', 0, 0, 0);
    const jorm = spawnEnemyAt('jormungand', 0, 0, 0);
    const skadi = spawnEnemyAt('skadi', 0, 0, 0);
    const thor = spawnEnemyAt('thor', 0, 0, 0);
    expect(mimir.maxHealth).toBe(6666);
    expect(jorm.maxHealth).toBe(7500);
    expect(skadi.maxHealth).toBe(10000);
    expect(thor.maxHealth).toBe(11000);
    // ダメージは giant の2倍据え置き。歩行速度は社長指示で少し上げた(70→90 base)=giant より速い。
    // mimir/jormungand/skadiは同速。トールだけ社長個別指示(通常速度=プレイヤーの5/4)で別値。
    expect(jorm.damage).toBe(giant.damage * 2);
    expect(mimir.damage).toBe(giant.damage * 2);
    expect(thor.damage).toBe(giant.damage * 2);
    expect(jorm.speed).toBeGreaterThan(giant.speed);
    expect(mimir.speed).toBe(jorm.speed);
    expect(skadi.speed).toBe(jorm.speed);
    // トール: 最終速度(ENEMY_SPEED_MULT=2/3適用後)がPLAYER_BASE_SPEED(87)×5/4=108.75に近い。
    expect(thor.speed).toBeCloseTo(87 * 1.25, 0);
  });
  it('hitbox = a wide footprint strip (3x body is visual-only, decoupled in pixi)', () => {
    // 社長指示で「当たり判定=足元の四角(帯)」に変更。巨体(約3倍)の見た目は pixi の BOSS_SPRITE_FIT で
    // 描画のみ拡大し、AABB(width/height)はこの帯=接地footprint。よって幅は広いが高さは低い(平たい矩形)。
    const giant = spawnEnemyAt('giantbat', 0, 0, 0);
    const jorm = spawnEnemyAt('jormungand', 0, 0, 0);
    const mimir = spawnEnemyAt('mimir', 0, 0, 0);
    const thor = spawnEnemyAt('thor', 0, 0, 0);
    // footprint は通常ボス(giant)より広い接地幅を持つ。
    expect(jorm.width).toBeGreaterThanOrEqual(giant.width * 3); // 346 >= 180
    expect(mimir.width).toBeGreaterThanOrEqual(giant.width * 2); // 165 >= 120
    expect(thor.width).toBeGreaterThanOrEqual(giant.width * 2); // 280 >= 120
    // 帯は平たい(高さ<幅)=足元の四角であることを担保。
    expect(jorm.height).toBeLessThan(jorm.width);
    expect(mimir.height).toBeLessThan(mimir.width);
    expect(thor.height).toBeLessThan(thor.width);
  });
  it('exposes a fire profile (bullets driven by the controller)', () => {
    expect(getEnemyFireProfile(spawnEnemyAt('jormungand', 0, 0, 0))).not.toBeNull();
    expect(getEnemyFireProfile(spawnEnemyAt('mimir', 0, 0, 0))).not.toBeNull();
    expect(getEnemyFireProfile(spawnEnemyAt('thor', 0, 0, 0))).not.toBeNull();
  });
});

describe('generateEnemy chaff mix (PACING_REDESIGN.mdバッチ3.5-A)', () => {
  const player = mkPlayer(0, 0); // area 0(bat/skeleton/zombieは全エリアで重み>0)
  const draw = (mix?: { bat: number; skeleton: number; zombie: number }) =>
    generateEnemy(0, player, BOUNDS, undefined, null, 0, false, 0, [], [], 1, false, [], mix).type;

  it('with no mix, draws only from the normal area-weighted pool (bat/skeleton/zombie at area 0)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(draw());
    for (const t of seen) expect(['bat', 'skeleton', 'zombie']).toContain(t);
  });

  it('a heavily zombie-weighted mix skews the draw toward zombie far above its natural area-weight share', () => {
    const counts = { bat: 0, skeleton: 0, zombie: 0 } as Record<string, number>;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const t = draw({ bat: 5, skeleton: 5, zombie: 90 });
      if (t in counts) counts[t]++;
    }
    // 素の分布(area0: bat100*1.0, skeleton55*1.0, zombie45*0.6=27)ではzombieは最小勢力のはずが、
    // mix指定でzombie90%が支配的になる。
    expect(counts.zombie).toBeGreaterThan(counts.bat);
    expect(counts.zombie).toBeGreaterThan(counts.skeleton);
    expect(counts.zombie / N).toBeGreaterThan(0.7);
  });

  it('a bat-heavy mix roughly matches the requested ratio over many draws', () => {
    const counts = { bat: 0, skeleton: 0, zombie: 0 } as Record<string, number>;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const t = draw({ bat: 70, skeleton: 25, zombie: 5 });
      if (t in counts) counts[t]++;
    }
    expect(counts.bat / N).toBeGreaterThan(0.55); // 統計的なブレを見込んだ緩い下限(狙いは0.70)
    expect(counts.zombie / N).toBeLessThan(0.15);
  });
});
