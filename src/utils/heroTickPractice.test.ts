// 英雄の昇天(全回復で去る終わり方)を store の上で回して確かめる(astroTick.test.ts と同じ作法)。
// 対策室(練習ラン=practice フラグ)では: 昇天も決着=練習が終わる打刻が立つ / スキルを渡さない・入手表示を出さない。
// 本編(practice=false)では: 従来どおりスキル「英雄」を渡し、入手トーストを出す(練習の打刻は立たない)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { runHeroTick, createHeroTickState } from './heroTick';
import { HERO_MAX_HP, HERO_ASCEND_MS } from './heroScript';

const START_GT = 10_000_000;

const setup = (practice: boolean) => {
  const st0 = useGameStore.getState();
  const gb = st0.gameBounds;
  const e = spawnEnemyAt('mutant-hero', 200, 0, START_GT);
  // 全回復した状態=次の1フレームで昇天に入る。
  Object.assign(e, { dormant: false, health: HERO_MAX_HP, maxHealth: HERO_MAX_HP, bossState: 'chase', lastHit: 0 });
  useGameStore.setState(s => ({
    enemies: [e],
    player: { ...s.player, x: -s.player.width / 2, y: -s.player.height / 2 },
    camera: { x: -gb.width / 2, y: -gb.height / 2 },
    viewZoom: 1,
    gameTime: START_GT,
    ownedSkills: s.ownedSkills.filter(k => k !== 'hero'),
    lastWeaponGet: null,
    practiceWinPendingSince: null,
  }));
  let gt = START_GT;
  const s = createHeroTickState();
  const step = (ms: number): void => {
    gt += ms;
    useGameStore.setState({ gameTime: gt });
    const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
    if (cur) runHeroTick(cur, s, gt, ms / 1000, gt, undefined, practice);
  };
  const me = () => useGameStore.getState().enemies.find(x => x.id === e.id);
  return { step, me };
};

describe('英雄の昇天: 対策室と本編', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('assault');
    setTreesDisabled(true);
    setTorchesDisabled(true);
  });

  it('対策室: 昇天し切ったら練習の決着が打刻され、スキルも入手表示も出ない', () => {
    const t = setup(true);
    t.step(16);
    expect(t.me()?.bossState).toBe('hero-ascend');
    // 昇天の途中ではまだ終わらない(姿が消え切るまで待つ)。
    expect(useGameStore.getState().practiceWinPendingSince).toBeNull();
    for (let ms = 0; ms <= HERO_ASCEND_MS + 200 && t.me(); ms += 50) t.step(50);
    expect(t.me()).toBeUndefined();
    const st = useGameStore.getState();
    expect(st.practiceWinPendingSince).not.toBeNull();
    expect(st.ownedSkills).not.toContain('hero');
    expect(st.lastWeaponGet).toBeNull();
  });

  it('本編: 昇天でスキル「英雄」を得て入手表示が出る。練習の打刻は立たない', () => {
    const t = setup(false);
    t.step(16);
    expect(t.me()?.bossState).toBe('hero-ascend');
    const st = useGameStore.getState();
    expect(st.ownedSkills).toContain('hero');
    expect(st.lastWeaponGet?.kind).toBe('poi-skill');
    for (let ms = 0; ms <= HERO_ASCEND_MS + 200 && t.me(); ms += 50) t.step(50);
    expect(t.me()).toBeUndefined();
    expect(useGameStore.getState().practiceWinPendingSince).toBeNull();
  });
});
