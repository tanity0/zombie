// ステージ1の最初の守護霊=猛者のボス別1位(社長 2026-11-19)の配線テスト。
// runGhostAndTraitsStep が「チュートリアルと組になる1回」だけ1位を呼び、以後は従来どおり(ロック中=自分の守護霊)に戻ることを固定する。
// オンラインはテスト環境では取れない(API 未設定)=固定の1位へ落ちる経路を通る。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { runGhostAndTraitsStep } from './directorTick';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { createStage1LoopState } from './stage1FirstLoop';
import { fixedGuardianLeadersForBoss, strongestGuardian } from '../data/fixedGuardians';
import { bossStyleSlotKey } from './ghostSlot';
import { getSelectedStageId } from '../data/progress';
import type { EnemyType } from '../types/game';

const step = () => {
  const s = useGameStore.getState();
  runGhostAndTraitsStep(
    { ghostProfileRef: { current: null } },
    { gameTime: s.gameTime, player: s.player, ghostDebugEnabled: false },
  );
};

const engage = (type: EnemyType) => {
  const p = useGameStore.getState().player;
  const boss = spawnEnemyAt(type, p.x + 300, p.y, useGameStore.getState().gameTime);
  boss.bossState = 'chase';
  useGameStore.setState(s => ({ enemies: [boss], summons: [], gameTime: s.gameTime + 100 }));
  step();
  return { boss, ghost: useGameStore.getState().summons.find(su => su.kind === 'ghost-ally') };
};

describe('ステージ1の最初の守護霊=猛者のボス別1位(召喚の配線)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().setStage1GuardianLock(true);
    useGameStore.getState().resetGame('assault');
    useGameStore.setState({ enemies: [], summons: [], stage1GuardianLock: true, stage1Loop: null });
    step();
  });

  it('2周目以降(未読): 最初の城ボスへの召喚は、そのボスの固定1位(他人の霊として・討伐者と同じ扱い)', () => {
    const top = fixedGuardianLeadersForBoss(bossStyleSlotKey('giantbat', getSelectedStageId()))[0];
    const { ghost } = engage('giantbat');
    expect(ghost).toBeDefined();
    expect(ghost?.ghostName).toBe(top.name);
    expect(ghost?.ghostIsOwn).toBe(false);
    expect(useGameStore.getState().ghostSourceThisRun).toBe('top');
    // 対価は従来どおり(紐付いたボスのHP×1.6)。
    expect(useGameStore.getState().enemies[0].ghostHpBoosted).toBe(true);
  });

  it('1周目: 賞金首への召喚は最強の固定守護霊(賞金首はボス別の上位を持たない)。積み済みなら通常(自分の守護霊)', () => {
    useGameStore.setState({ stage1Loop: createStage1LoopState(0) });
    const first = engage('bounty-melee');
    expect(first.ghost?.ghostName).toBe(strongestGuardian().name);
    expect(first.ghost?.ghostIsOwn).toBe(false);

    // チュートリアルを積んだ後(=最初の1回は済んだ)の召喚は従来どおり=ロック中は自分の守護霊。
    useGameStore.setState(s => ({ stage1Loop: s.stage1Loop ? { ...s.stage1Loop, guardianTutQueued: true } : null }));
    const second = engage('bounty-melee');
    expect(second.ghost?.ghostIsOwn).toBe(true);
    expect(useGameStore.getState().ghostSourceThisRun).toBe('own');
  });

  it('ロックが外れた出撃(ステージ1クリア後)は対象外=選択どおり(ここでは同行者なし=召喚しない)', () => {
    useGameStore.setState({ stage1GuardianLock: false, companionSkill: null });
    const { ghost } = engage('giantbat');
    expect(ghost).toBeUndefined();
  });
});
