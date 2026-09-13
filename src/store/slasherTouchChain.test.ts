// 回帰(v0.25.4003・社長報告2026-08-28「スラッシャーが連撃うまくできない」):
// チェーン受付はtriggerCounter(PC直呼び)にしか無く、タッチの入り口(beginMeleeSwing)は
// 通常CD門(820ms)が先にタップを飲むため、チェーンCD(300ms)リズムのタップが予約もされずに
// 捨てられていた=タッチだけ連撃が構造的に出ない。この試験はタッチ入り口の受付を固定する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, SLASHER_CHAIN_TIMEOUT_MS } from './gameStore';

const armSlasherChain = (opts: { realGameTime: number; chainReadyAt: number }) => {
  useGameStore.setState(state => ({
    realGameTime: opts.realGameTime,
    player: {
      ...state.player,
      skills: state.player.skills.includes('slasher') ? state.player.skills : [...state.player.skills, 'slasher'],
      skillLevels: { ...state.player.skillLevels, slasher: 3 }, // Lv3=追撃3段(Lv1だと1段でチェーン終了し検証が曖昧になる)
      slasherChainReadyAt: opts.chainReadyAt,
      slasherStrikeStep: 0,
      slasherReach: 74,
      slasherQueuedTap: false,
      pendingSwingAt: 0,
      // 初撃直後を再現: 通常近接CDはまだ明けていない(タッチ退行の再現条件)
      counterCooldownEnd: Date.now() + 700,
    },
  }));
};

describe('スラッシャー連撃: タッチ入り口(beginMeleeSwing)の受付', () => {
  beforeEach(() => {
    useGameStore.setState(state => ({
      enemies: [],
      player: { ...state.player, slasherChainReadyAt: 0, slasherStrikeStep: 0, slasherQueuedTap: false, pendingSwingAt: 0, counterCooldownEnd: 0 },
    }));
  });

  it('★回帰: チェーンCD中のタップは通常CD門に飲まれず「予約」される(先行入力v3254)', () => {
    armSlasherChain({ realGameTime: 1000, chainReadyAt: 1200 }); // CDまだ200ms残り
    const swung = useGameStore.getState().beginMeleeSwing();
    expect(swung).toBe(false);
    expect(useGameStore.getState().player.slasherQueuedTap).toBe(true); // 旧実装はここがfalse(黙って捨てていた)
    expect(useGameStore.getState().player.slasherChainReadyAt).toBe(1200); // チェーンは生きている
  });

  it('★回帰: チェーンCD明けのタップは通常CD中でも追撃が出る(空振りでも成立=v3934)', () => {
    armSlasherChain({ realGameTime: 1400, chainReadyAt: 1200 }); // CD明け・タイムアウト前
    const swung = useGameStore.getState().beginMeleeSwing();
    expect(swung).toBe(true); // 旧実装は通常CD門でfalse(タッチだけ追撃が出なかった)
    const p = useGameStore.getState().player;
    expect(p.slasherStrikeStep).toBe(1);           // 追撃1段目を消化
    expect(p.slasherChainReadyAt).toBeGreaterThan(1400); // チェーン継続(次のCDが張られた)
  });

  it('時間切れのタップはチェーンを破棄して通常経路へ(2/3減衰を引きずらない)', () => {
    armSlasherChain({ realGameTime: 1200 + SLASHER_CHAIN_TIMEOUT_MS + 1, chainReadyAt: 1200 });
    useGameStore.getState().beginMeleeSwing();
    const p = useGameStore.getState().player;
    expect(p.slasherChainReadyAt).toBe(0);
    expect(p.slasherQueuedTap).toBe(false);
  });
});
