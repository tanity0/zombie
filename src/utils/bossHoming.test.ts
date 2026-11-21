// ボス級が持ち場へ戻る速さ(社長指示2026-10-24「高速である程度だけ戻る」)。
import { describe, it, expect } from 'vitest';
import { bossHomingSpeed, BOSS_HOMING_ESCAPE_PX, BOSS_HOMING_EASE_PX } from './bossHoming';
import { RANGE_BY_CATEGORY } from './weaponUtils';
import { BOUNTY_HOMING_ESCAPE_SPEED_MULT } from './bountyTick';
import { HERO_GALLOP_SPEED, HERO_WALK_SPEED, HERO_HOMING_SPEED_MULT } from './heroScript';
import { ENEMY_STATS } from './enemyUtils';

describe('持ち場へ戻る速さ', () => {
  it('プレイヤーが撃てる距離に居る間だけ速く、外へ出たらゆっくり', () => {
    expect(bossHomingSpeed(BOSS_HOMING_ESCAPE_PX, 10, 99)).toBe(99);
    const mid = bossHomingSpeed(BOSS_HOMING_ESCAPE_PX + BOSS_HOMING_EASE_PX / 2, 10, 99);
    expect(mid).toBeLessThan(99); expect(mid).toBeGreaterThan(10); // 急に落とさない
    expect(bossHomingSpeed(BOSS_HOMING_ESCAPE_PX + BOSS_HOMING_EASE_PX, 10, 99)).toBe(10);
  });
  it('撃てる距離の目安は、銃の自動射撃の最長を最大の引き(0.6)で補正した距離より長い', () => {
    const longest = Math.max(...Object.values(RANGE_BY_CATEGORY));
    expect(BOSS_HOMING_ESCAPE_PX).toBeGreaterThan(longest / 0.6);
  });
  it('走り出しはプレイヤーの歩き(約150まで)より速い=追いかけても撃てる距離に居続けられない', () => {
    expect(HERO_GALLOP_SPEED).toBeGreaterThan(150);
    expect(ENEMY_STATS['bounty-ranged'].speed * BOUNTY_HOMING_ESCAPE_SPEED_MULT).toBeGreaterThan(150);
    expect(HERO_WALK_SPEED * HERO_HOMING_SPEED_MULT).toBeLessThan(HERO_GALLOP_SPEED); // 外ではゆっくり
  });
});
