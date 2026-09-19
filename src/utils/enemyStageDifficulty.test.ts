// research/STAGE_DIFFICULTY.md(ステージ難度の階段・雑魚): setStageDifficultyMults の不変条件。
// ①係数1.0のとき現行と完全一致 ②HPは hpMult・攻撃は diffDmg(接触+敵弾の両方)に乗る
// ③固定型(CONSTANT_STRENGTH_TYPES / LAB_FIXED_TYPES)には掛からない。
//
// 検証条件:
//  ・buildEnemy は非exportなので **spawnEnemyAt / spawnEnemyAtWithTier 経由**で作る。
//  ・colorTier の抽選で health がブレるため、**原点近く(area0=COLOR_RATE_BY_AREA[0]が全0で必ず無色)**
//    で湧かせるか、tier固定版を使う。
//  ・モジュール変数はテスト間で持ち越るので **beforeEach で (1,1) へ戻す**(setTreesDisabledと同じ既知の弱点)。
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnEnemyAt, spawnEnemyAtWithTier, setStageDifficultyMults, createEnemyProjectile } from './enemyUtils';
import type { EnemyType, Player } from '../types/game';

// area0(軍備配置)=原点近く。色ティアの抽選率が全0なので必ず無色=HPがブレない。
const AREA0 = { x: 100, y: 100 };
const T = 0; // gameTime=0(時間スケーリングも固定)

const spawn = (type: EnemyType) => spawnEnemyAt(type, AREA0.x, AREA0.y, T);

const mkPlayer = (): Player => ({ x: 400, y: 400, width: 32, height: 32 } as unknown as Player);

beforeEach(() => { setStageDifficultyMults(1, 1); });

describe('係数1.0 = 現行と完全一致', () => {
  it('セットしても外しても、雑魚の health / maxHealth / damage / difficultyMultiplier が同値', () => {
    const before = spawn('zombie');
    setStageDifficultyMults(1, 1);
    const after = spawn('zombie');
    expect(after.health).toBe(before.health);
    expect(after.maxHealth).toBe(before.maxHealth);
    expect(after.damage).toBe(before.damage);
    expect(after.difficultyMultiplier).toBe(before.difficultyMultiplier);
  });
});

describe('雑魚のHP/攻撃に階段が乗る', () => {
  it('HP係数は health / maxHealth に乗る(速度・経験値は不変)', () => {
    const base = spawn('zombie');
    setStageDifficultyMults(1.8, 1);
    const scaled = spawn('zombie');
    expect(scaled.health).toBeCloseTo(base.health * 1.8, 6);
    expect(scaled.maxHealth).toBeCloseTo(base.maxHealth * 1.8, 6);
    expect(scaled.damage).toBe(base.damage);          // 攻撃係数は1.0のまま
    expect(scaled.speed).toBe(base.speed);            // 速度は触らない(裁定=HPと攻撃だけ)
    expect(scaled.experienceValue).toBe(base.experienceValue);
  });

  it('攻撃係数は接触ダメージと difficultyMultiplier(敵弾)の両方に乗る', () => {
    const base = spawn('werewolf');
    const basePlant = spawn('plant');
    const baseBullet = createEnemyProjectile(basePlant, mkPlayer(), 0);
    setStageDifficultyMults(1, 1.4);
    const scaled = spawn('werewolf');
    const scaledPlant = spawn('plant');
    const scaledBullet = createEnemyProjectile(scaledPlant, mkPlayer(), 0);
    expect(scaled.health).toBe(base.health);          // HP係数は1.0のまま
    expect(scaled.damage).toBe(Math.round(base.damage * 1.4));
    expect(scaled.difficultyMultiplier).toBeCloseTo((base.difficultyMultiplier ?? 1) * 1.4, 6);
    // ★弾のダメージが据え置きにならないこと(damage行だけに掛けた時に起きる取りこぼし)。
    expect(scaledBullet?.damage).toBe(Math.round((baseBullet?.damage ?? 0) * 1.4));
  });

  it('色ティア固定(レア)でも同じ倍率が乗る(色倍率とは乗算で重なる)', () => {
    const base = spawnEnemyAtWithTier('zombie', AREA0.x, AREA0.y, T, 'red');
    setStageDifficultyMults(1.6, 1.3);
    const scaled = spawnEnemyAtWithTier('zombie', AREA0.x, AREA0.y, T, 'red');
    expect(scaled.health).toBeCloseTo(base.health * 1.6, 6);
    expect(scaled.difficultyMultiplier).toBeCloseTo((base.difficultyMultiplier ?? 1) * 1.3, 6);
  });

  it('pumpkin / hunter は雑魚側の階段に乗る(元から距離・色でスケールする型)', () => {
    const basePumpkin = spawn('pumpkin');
    const baseHunter = spawn('hunter');
    setStageDifficultyMults(1.4, 1.2);
    expect(spawn('pumpkin').health).toBeCloseTo(basePumpkin.health * 1.4, 6);
    expect(spawn('hunter').health).toBeCloseTo(baseHunter.health * 1.4, 6);
  });
});

describe('固定強度タイプ / ラボ敵には掛からない(個別適用との二重を作らない)', () => {
  // CONSTANT_STRENGTH_TYPES(城ボス・賞金首・天使・裏ボス・幻影・reaper・idol)と LAB_FIXED_TYPES。
  const FIXED: EnemyType[] = [
    'giantbat', 'reaper', 'idol', 'miguel', 'suriel', 'mimir', 'thor', 'guardian-phantom',
    'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
    'lab-zombie-1', 'lab-zombie-2', 'lab-zombie-3',
  ];
  it('係数をセットしても実効値(health/maxHealth/damage/difficultyMultiplier)が動かない', () => {
    const base = FIXED.map(t => spawn(t));
    setStageDifficultyMults(1.8, 1.4);
    const scaled = FIXED.map(t => spawn(t));
    FIXED.forEach((t, i) => {
      expect(scaled[i].health, t).toBe(base[i].health);
      expect(scaled[i].maxHealth, t).toBe(base[i].maxHealth);
      expect(scaled[i].damage, t).toBe(base[i].damage);
      expect(scaled[i].difficultyMultiplier, t).toBe(base[i].difficultyMultiplier);
    });
  });
});
