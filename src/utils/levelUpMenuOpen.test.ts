// 社長報告「たまにスタートしたら中身の無い『レベルアップ 強化を選んでください』の画面が出て止まる」の回帰テスト。
import { describe, it, expect, beforeEach } from 'vitest';
import { decideLevelUpIntro } from './levelUpMenuOpen';
import { useGameStore } from '../store/gameStore';

describe('decideLevelUpIntro: LEVEL UP 演出の後にメニューを開くか', () => {
  const base = { introUntil: 1000, now: 2000, deliveryLocked: false, optionCount: 3 };
  it('待ちが無ければ何もしない', () => {
    expect(decideLevelUpIntro({ ...base, introUntil: 0 })).toBe('idle');
  });
  it('演出が終わり選択肢があれば開く', () => {
    expect(decideLevelUpIntro(base)).toBe('open');
  });
  it('演出中・納品ロック中は保留', () => {
    expect(decideLevelUpIntro({ ...base, now: 500 })).toBe('wait');
    expect(decideLevelUpIntro({ ...base, deliveryLocked: true })).toBe('wait');
  });
  it('選択肢が空なら開かずに待ちを捨てる', () => {
    expect(decideLevelUpIntro({ ...base, optionCount: 0 })).toBe('drop');
    expect(decideLevelUpIntro({ ...base, optionCount: 0, now: 500 })).toBe('drop');
  });
});

describe('resetGame: 前ランの LEVEL UP 演出の待ちを持ち越さない', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('assault');
  });
  it('LEVEL UP の演出の途中で resetGame すると levelUpIntroUntil が 0', () => {
    const p = useGameStore.getState().player;
    useGameStore.setState(s => ({ player: { ...s.player, experience: p.experienceToNextLevel * 2 } }));
    useGameStore.getState().gainExperience(0);
    expect(useGameStore.getState().levelUpIntroUntil).toBeGreaterThan(0); // 演出中
    useGameStore.getState().resetGame('assault');
    const st = useGameStore.getState();
    expect(st.levelUpIntroUntil).toBe(0);
    expect(st.upgradeOptions).toEqual([]);
    expect(st.showUpgradeMenu).toBe(false);
  });
});
