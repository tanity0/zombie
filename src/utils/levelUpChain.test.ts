// ★v0.25.3980(社長報告「いっきにレベルアップ(2個とか3個)したとき、パワーアップ画面が1回しか
// 出ないかも」): 同一フレームに複数の経験値が入っても levelUp() が連打されず(=upgradeOptionsが
// 上書きされず)、1レベルにつき1回の提示が連鎖することの回帰テスト。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';

describe('複数レベルぶんの経験値: 提示待ち中はlevelUpを保留し、1レベル1提示で連鎖する', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('assault'); // tutorial以外=メニュー提示の通常経路
  });

  it('提示待ち(イントロ中)の追加XPでは2つ目のlevelUpが走らない=選択肢が上書きされない', () => {
    const st = useGameStore.getState();
    // 2レベルぶんを超えるEXPを直接積んでから、付与イベント(0)でチェックだけ走らせる。
    const p = st.player;
    useGameStore.setState(s => ({ player: { ...s.player, experience: p.experienceToNextLevel * 3 } }));
    useGameStore.getState().gainExperience(0);
    const lvAfter1 = useGameStore.getState().player.level;
    expect(lvAfter1).toBe(p.level + 1);                       // 1つ目は即発動
    expect(useGameStore.getState().levelUpIntroUntil).toBeGreaterThan(0); // 提示待ち
    const opts1 = useGameStore.getState().upgradeOptions;
    // 提示待ち中に更にXPイベントが来ても、levelUpは走らない(=選択肢が上書きされない)。
    useGameStore.getState().gainExperience(0);
    expect(useGameStore.getState().player.level).toBe(lvAfter1);
    expect(useGameStore.getState().upgradeOptions).toBe(opts1);
  });

  it('提示が済んだ(メニューが閉じた)後のチェックで、繰り越しぶんの次のlevelUpが走る', () => {
    const st = useGameStore.getState();
    const p = st.player;
    useGameStore.setState(s => ({ player: { ...s.player, experience: p.experienceToNextLevel * 3 } }));
    useGameStore.getState().gainExperience(0);
    const lvAfter1 = useGameStore.getState().player.level;
    // 提示完了を模す(メニューを閉じ・イントロもクリア=useGameLoopの毎フレーム再チェックと同じ前提)。
    useGameStore.setState({ showUpgradeMenu: false, levelUpIntroUntil: 0 });
    useGameStore.getState().gainExperience(0);
    expect(useGameStore.getState().player.level).toBe(lvAfter1 + 1); // 繰り越しぶんが1つずつ連鎖
  });
});
