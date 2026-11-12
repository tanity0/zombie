// シールドの熟練度(防いだ1回ごとに 'shield' へ・社長裁定2026-11-12「案A」)の純関数と配線の台帳。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SHIELD_MASTERY_XP_PER_BLOCK, isPlayerShield, noteShieldBlockMastery, resetShieldBlockMastery, takeShieldBlock, enemyBulletBlockKey,
} from './shieldMastery';
import { beginMasteryRun, getPendingMastery } from './masteryRun';
import { TECHNIQUE_GAP_MS } from './shieldGuardFx';

const SRC = import.meta.glob<string>(['../hooks/useGameLoop.ts', '../store/gameStore.ts'], { query: '?raw', import: 'default', eager: true });
const GAME_LOOP_SRC = SRC['../hooks/useGameLoop.ts'];
const STORE_SRC = SRC['../store/gameStore.ts'];

beforeEach(() => { resetShieldBlockMastery(); beginMasteryRun({ ignored: false }); });

describe('シールドの熟練度(防いだ数で貯める)', () => {
  it('防ぐと 300 が shield に貯まる(重みは掛けない)', () => {
    expect(SHIELD_MASTERY_XP_PER_BLOCK).toBe(300);
    expect(noteShieldBlockMastery('zombie:e1:attack', 1000)).toBe(true);
    expect(getPendingMastery()).toEqual({ shield: 300 });
  });
  it('同じ攻撃(同じキー)が続く間は二重に数えない。途切れたら次の1回', () => {
    noteShieldBlockMastery('mimir:b1:beam', 1000);
    // 毎フレーム来る光線: 16ms おきに 3秒当たり続けても1回
    for (let t = 1016; t < 4000; t += 16) noteShieldBlockMastery('mimir:b1:beam', t);
    expect(getPendingMastery()).toEqual({ shield: 300 });
    // 間隔を超えて当たり直した=次の技
    noteShieldBlockMastery('mimir:b1:beam', 4000 + TECHNIQUE_GAP_MS + 1);
    expect(getPendingMastery()).toEqual({ shield: 600 });
  });
  it('別の攻撃(別のキー)はそれぞれ1回', () => {
    noteShieldBlockMastery('zombie:e1:a', 1000);
    noteShieldBlockMastery('zombie:e2:a', 1000);
    expect(getPendingMastery()).toEqual({ shield: 600 });
  });
  it('キーが無い防ぎも毎フレーム来て二重に数えない', () => {
    expect(takeShieldBlock(undefined, 1000)).toBe(true);
    expect(takeShieldBlock(undefined, 1016)).toBe(false);
  });
  it('散弾の粒(同じ撃ち手・同じ時刻)は1回、次の1発は別に1回', () => {
    const pellet = (i: number, createdAt: number) => ({ id: `p${i}-${createdAt}`, ownerId: 'e1', ownerType: 'hunter', createdAt });
    for (let i = 0; i < 5; i++) noteShieldBlockMastery(enemyBulletBlockKey(pellet(i, 5000)), 5100 + i * 16);
    expect(getPendingMastery()).toEqual({ shield: 300 });
    noteShieldBlockMastery(enemyBulletBlockKey(pellet(0, 5600)), 5700);
    expect(getPendingMastery()).toEqual({ shield: 600 });
  });
  it('貯める盾はプレイヤー本人の物だけ(守護霊・幻影の盾は貯めない)', () => {
    expect(isPlayerShield({ weaponType: 'shield', hostile: false, shieldOwnerKind: 'player' })).toBe(true);
    expect(isPlayerShield({ weaponType: 'shield', hostile: false, shieldOwnerKind: 'ghost-ally' })).toBe(false);
    expect(isPlayerShield({ weaponType: 'shield', hostile: true, shieldOwnerKind: 'phantom' })).toBe(false);
    expect(isPlayerShield(undefined)).toBe(false);
  });
});

describe('配線の台帳(シールドの熟練度)', () => {
  it('シールドバッシュの与ダメでも今どおり shield に貯まる', () => {
    expect(STORE_SRC).toContain("swingMasteryHits.push({ enemy, amount: dmg, key: 'shield' });");
  });
  it('防ぐ経路の3つ(技の共通口・敵弾・突進/跳びかかり)で、プレイヤー本人の盾の時だけ呼ぶ', () => {
    // 技の共通口 noteShieldGuard(範囲・帯・突進・光線・飛ぶ刃・継続技)
    expect(STORE_SRC).toContain('if (isPlayerShield(sp0)) noteShieldBlockMastery(');
    // 突進・跳びかかり(各1件)
    expect(STORE_SRC.split("s.mine && rectsOverlap(").length - 1).toBe(2);
    // 敵弾
    expect(GAME_LOOP_SRC).toContain('if (s.mine) noteShieldBlockMastery(enemyBulletBlockKey(b), Date.now());');
    // 出撃の始まりで「続き」の記録を捨てる
    expect(STORE_SRC).toContain('resetShieldBlockMastery();');
  });
});
