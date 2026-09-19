// research/AI_HUMANIZE.md §8 裁定済み#16(社長裁定2026-09-02=(a)・打刻を押下基準へ正規化)。
//
// `player.meleeSwingPressedAt`(=「実際に押した時刻」の専用打刻)が、5経路それぞれで
// 正しい値を持つことを確認する:
//   - 前隙のある経路(タッチ=beginMeleeSwing→triggerCounter(pendAt)): pressedAt = 実測の押下時刻
//     (=meleeSwingCommitAtより前隙ぶん早い)。
//   - 前隙の無い経路(PC直呼びtriggerCounter()・刀一閃triggerKatanaDash・スラッシャー追撃):
//     pressedAt = 打刻の呼び出し時刻そのもの(=meleeSwingCommitAtと同じ・シフト無し)。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGameStore, MELEE_WINDUP_MS, SLASHER_CHAIN_TIMEOUT_MS } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

describe('meleeSwingPressedAt(§8裁定済み#16): 打刻を押下基準へ正規化', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('前隙のある経路(タッチ=beginMeleeSwing→triggerCounter(pendAt)): pressedAtは実測の押下時刻で、'
    + 'commitAtより前隙ぶん早い', () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const pendAt = useGameStore.getState().player.pendingSwingAt;
    expect(pendAt).toBe(1_000_000); // 指を離した瞬間の実測値
    now += MELEE_WINDUP_MS; // 前隙ぶん進める(useGameLoopの解決タイミングを模す)
    useGameStore.getState().triggerCounter(pendAt);
    const p = useGameStore.getState().player;
    expect(p.meleeSwingPressedAt).toBe(pendAt); // 押した瞬間そのまま(commitより200ms早い)
    expect(p.meleeSwingCommitAt).toBe(1_000_000 + MELEE_WINDUP_MS);
    expect(p.meleeSwingCommitAt - p.meleeSwingPressedAt).toBe(MELEE_WINDUP_MS);
  });

  it('前隙のある経路(刀装備・タッチ): 通常近接もpressedAt=実測の押下時刻', () => {
    let now = 2_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const pendAt = useGameStore.getState().player.pendingSwingAt;
    now += MELEE_WINDUP_MS;
    useGameStore.getState().triggerCounter(pendAt);
    const p = useGameStore.getState().player;
    expect(p.meleeSwingPressedAt).toBe(pendAt);
    expect(p.meleeSwingCommitAt - p.meleeSwingPressedAt).toBe(MELEE_WINDUP_MS);
  });

  it('前隙の無い経路(PC/マウス直呼びのtriggerCounter()): pressedAt = commitAt(シフト無し)', () => {
    const now = 3_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    useGameStore.getState().triggerCounter(); // swingStartAt省略=PC直呼びと同じ経路
    const p = useGameStore.getState().player;
    expect(p.meleeSwingCommitAt).toBe(3_000_000);
    expect(p.meleeSwingPressedAt).toBe(p.meleeSwingCommitAt); // シフト無し
  });

  it('前隙の無い経路(刀/村雨のスワイプ一閃・triggerKatanaDash): pressedAt = commitAt(シフト無し)', () => {
    const now = 4_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } }));
    expect(useGameStore.getState().triggerKatanaDash(1, 0)).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.meleeSwingCommitAt).toBe(4_000_000);
    expect(p.meleeSwingPressedAt).toBe(p.meleeSwingCommitAt); // シフト無し
  });

  it('前隙の無い経路(スラッシャー追撃・applySlasherChainStrike): pressedAt = commitAt(シフト無し)', () => {
    const now = 5_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    // slasherChainReadyAt(CD明け時刻)は realGameTime 系。realGameTime>=readyAt かつ
    // realGameTime<readyAt+SLASHER_CHAIN_TIMEOUT_MS で「チェーンCD明け」の門を通る。
    useGameStore.setState(s => ({
      realGameTime: 100,
      player: {
        ...s.player,
        skills: [...s.player.skills, 'slasher'],
        skillLevels: { ...(s.player.skillLevels ?? {}), slasher: 3 }, // maxHits=3=nextStep(1)<maxHitsでstep=1のまま残る
        slasherChainReadyAt: 100,
        slasherStrikeStep: 0,
      },
    }));
    const rt = useGameStore.getState().realGameTime;
    const readyAt = useGameStore.getState().player.slasherChainReadyAt;
    expect(rt).toBeGreaterThanOrEqual(readyAt); // 前提: CD明け
    expect(rt).toBeLessThan(readyAt + SLASHER_CHAIN_TIMEOUT_MS); // 前提: タイムアウト前
    useGameStore.getState().triggerCounter(); // slasherChainReadyAt>0の門を通り追撃(applySlasherChainStrike)へ
    const p = useGameStore.getState().player;
    expect(p.slasherStrikeStep).toBe(1); // 追撃が実際に発動した(前提の自己検証)
    expect(p.meleeSwingCommitAt).toBe(5_000_000);
    expect(p.meleeSwingPressedAt).toBe(p.meleeSwingCommitAt); // シフト無し
  });
});
