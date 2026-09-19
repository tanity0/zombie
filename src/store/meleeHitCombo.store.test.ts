import { describe, it, expect } from 'vitest';
import { useGameStore, MELEE_HIT_COMBO_WINDOW_MS } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { KILL_BANNER_MS } from '../utils/comboMilestone';

// 社長裁定2026-09-13「見せる数字をどうするかってだけ」: 左上 COMBO=近接ヒットの連続数(表示専用)/頭上=倒した数(N KILLS)。
// 中身(スキル・スコア・ダンス段階が読むフィニッシュ回数)は据え置き。
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  const st = useGameStore.getState();
  return { px: st.player.x + st.player.width / 2, py: st.player.y + st.player.height / 2, gt: st.gameTime };
};
const put = (x: number, y: number, gt: number, hp: number): string => {
  const e = { ...spawnEnemyAt('zombie', x, y, gt), health: hp, maxHealth: hp };
  useGameStore.setState(s => ({ enemies: [...s.enemies, e] }));
  return e.id;
};
const banner = () => useGameStore.getState().effects.filter(e => e.kind === 'multiHit');

describe('左上 COMBO(近接ヒットの連続数・表示専用)', () => {
  it('registerMeleeHits は窓内なら積み、窓を過ぎたら数え直す。フィニッシュ回数(中身)は動かない', () => {
    setup();
    const gt = useGameStore.getState().gameTime;
    useGameStore.getState().registerMeleeHits(2);
    let s = useGameStore.getState();
    expect(s.meleeHitComboCount).toBe(2);
    expect(s.meleeHitComboUntil).toBe(gt + MELEE_HIT_COMBO_WINDOW_MS);
    expect(s.meleeFinishComboCount).toBe(0);
    useGameStore.getState().registerMeleeHits(3);
    expect(useGameStore.getState().meleeHitComboCount).toBe(5);
    useGameStore.setState({ gameTime: gt + MELEE_HIT_COMBO_WINDOW_MS + 1 });
    useGameStore.getState().registerMeleeHits(1);
    s = useGameStore.getState();
    expect(s.meleeHitComboCount).toBe(1);
    expect(s.meleeFinishComboCount).toBe(0);
  });
  it('刀の一振りで当てた敵の数だけ増える(倒さなくても)', () => {
    const { px, py, gt } = setup();
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } }));
    const a = put(px + 40, py, gt, 100000), b = put(px + 50, py + 10, gt, 100000);
    useGameStore.getState().performKatanaStrike([a, b], 1, false);
    expect(useGameStore.getState().meleeHitComboCount).toBe(2);
    expect(useGameStore.getState().meleeFinishComboCount).toBe(0); // フィニッシュではない=中身は動かない
  });
});

describe('頭上の倒した数(N KILLS)', () => {
  it('倒すたびに帯が置き直され(常に1枚)、数は連続撃破の数。窓の長さ=2.5秒。節目(10を跨ぐ)は段を持つ', () => {
    const { px, py, gt } = setup();
    for (let i = 0; i < 3; i++) {
      const id = put(px + 200 + i * 30, py, gt, 1);
      useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    }
    const b = banner();
    expect(b.length).toBe(1);
    if (b[0].kind === 'multiHit') { expect(b[0].label).toBe('KILLS'); expect(b[0].count).toBe(3); expect(b[0].duration).toBe(KILL_BANNER_MS); expect(b[0].milestoneTier).toBeUndefined(); }
    useGameStore.setState({ killChainCount: 9, killChainLastAt: Date.now() });
    const id = put(px + 400, py, gt, 1);
    useGameStore.getState().damageEnemy(id, 5, false, false, false, 'gun', 'player');
    const b2 = banner();
    expect(b2.length).toBe(1);
    if (b2[0].kind === 'multiHit') { expect(b2[0].count).toBe(10); expect(b2[0].milestoneTier).toBe(1); }
  });
  it('N HITS の帯は出ない(表示を倒した数に譲った)', () => {
    setup();
    useGameStore.getState().registerMultiHit(7);
    expect(banner().length).toBe(0);
  });
});
