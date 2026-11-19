// 案山子(変異体対策室の「練習」枠・utils/scarecrow.ts)の配線テスト。
// 体力を減らす合流点(damageEnemy)を通っても倒れない=撃破数が増えない・消えない。追跡AIに入らない=歩いて来ない。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAtWithTier } from '../utils/enemyUtils';
import { beginPracticeRun, endPracticeRun, practiceSlotByKey, SCARECROW_SLOT_KEY } from '../utils/bossPractice';
import { installScarecrowSway } from './scarecrowSway';

installScarecrowSway();

let now = 5_000_000;
const st = () => useGameStore.getState();
const scarecrow = () => st().enemies.find(e => e.type === 'scarecrow');

beforeEach(() => {
  now = 5_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  st().resetGame('soldier');
  beginPracticeRun(practiceSlotByKey(SCARECROW_SLOT_KEY)!, { stageId: 'stage-1', mission: 'revisit', free: false });
  const e = spawnEnemyAtWithTier('scarecrow', 300, 120, 1000, 'none');
  useGameStore.setState(s => ({
    gameTime: 100_000,
    enemies: [{ ...e, id: 'sc-1' }],
    player: { ...s.player, x: 300, y: 400, width: 32, height: 32 },
  }));
});
afterEach(() => { endPracticeRun(); vi.restoreAllMocks(); });

describe('案山子(配線)', () => {
  it('どれだけ撃っても倒れない・撃破数が増えない・被弾の時刻は書かれる', () => {
    const before = scarecrow()!;
    const kills0 = st().gameStats.enemiesKilled;
    for (let i = 0; i < 20; i++) {
      now += 50;
      st().damageEnemy('sc-1', 10_000, false, i % 3 === 0, false, 'gun');
    }
    const after = scarecrow();
    expect(after).toBeDefined();
    expect(after!.health).toBe(before.health);
    expect(after!.health).toBeGreaterThan(0);
    expect(st().gameStats.enemiesKilled).toBe(kills0);
    expect(after!.lastHit).toBe(now); // 揺れ・数字・のけぞりの起点は普段どおり
  });

  it('追跡AIに入らない=プレイヤーが近くに居ても歩いて来ない', () => {
    const x0 = scarecrow()!.x, y0 = scarecrow()!.y;
    for (let i = 0; i < 30; i++) { now += 16; st().updateEnemies(0.016); }
    expect(scarecrow()!.x).toBeCloseTo(x0, 5);
    expect(scarecrow()!.y).toBeCloseTo(y0, 5);
  });
});

describe('案山子の揺れ(被弾の瞬間に store が決める)', () => {
  it('直接の当たり: プレイヤーが左に居れば右へ傾く(反転)・右に居れば左(絵のまま)・揺れは頭から', () => {
    // 案山子の中心 x=318。プレイヤーの中心 x=316(ほぼ真下)→ 左へずらす。
    useGameStore.setState(s => ({ player: { ...s.player, x: 100 } }));
    now += 50;
    st().damageEnemy('sc-1', 10, false, false, false, 'gun');
    expect(scarecrow()!.scarecrowSwayAt).toBe(now);
    expect(scarecrow()!.scarecrowLeanLeft).toBe(false);
    useGameStore.setState(s => ({ player: { ...s.player, x: 600 } }));
    now += 100; // 揺れの途中でも、直接の当たりは始め直す
    st().damageEnemy('sc-1', 10, false, false, false, 'gun');
    expect(scarecrow()!.scarecrowSwayAt).toBe(now);
    expect(scarecrow()!.scarecrowLeanLeft).toBe(true);
  });

  it('持続ダメージ(dot): 揺れの途中なら始め直さず向きも変えない。揺れていなければ揺れ始める', () => {
    useGameStore.setState(s => ({ player: { ...s.player, x: 100 } }));
    now += 50;
    st().damageEnemy('sc-1', 10, false, false, false, 'gun');
    const startedAt = now;
    expect(scarecrow()!.scarecrowLeanLeft).toBe(false);
    useGameStore.setState(s => ({ player: { ...s.player, x: 600 } }));
    now += 100;
    st().damageEnemy('sc-1', 3, false, false, false, 'dot');
    expect(scarecrow()!.scarecrowSwayAt).toBe(startedAt);
    expect(scarecrow()!.scarecrowLeanLeft).toBe(false);
    now += 1000; // 揺れ終わった後の燃焼の一刻み=揺れ始めるが向きは変えない
    st().damageEnemy('sc-1', 3, false, false, false, 'dot');
    expect(scarecrow()!.scarecrowSwayAt).toBe(now);
    expect(scarecrow()!.scarecrowLeanLeft).toBe(false);
    expect(scarecrow()!.health).toBe(scarecrow()!.maxHealth);
  });
});
