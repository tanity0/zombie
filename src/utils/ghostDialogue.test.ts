// ★v0.25.3989(社長報告「守護霊登場時のセリフと退場時のセリフが通信に出てこない」): 回帰テスト。
// 実測で確定した真因=守護霊の登場セリフはボス交戦の立ち上がり(=出現カットインと同じ瞬間)に積まれ、
// 表示2.8秒(NPC_DIALOGUE_MS)が**アテンションの裏でまるごと経過**していた(シミュは演出中も走る)。
// 修正=アテンション中は通信の時計を凍結し、明けたエッジで表示中の行の尺を張り直す。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, NPC_DIALOGUE_MS } from '../store/gameStore';
import { runGhostAndTraitsStep } from './directorTick';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const step = () => {
  const s = useGameStore.getState();
  runGhostAndTraitsStep(
    { ghostProfileRef: { current: null } },
    { gameTime: s.gameTime, player: s.player, ghostDebugEnabled: true },
  );
};

describe('守護霊のセリフ×通信(アテンション凍結・v0.25.3989)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
    useGameStore.setState({ enemies: [], summons: [], npcDialogueQueue: [], npcDialogue: null, npcDialogueNextAt: 0, attention: null });
    step();
  });

  it('召喚で登場セリフがキューに入り、表示まで届く', () => {
    const p = useGameStore.getState().player;
    const boss = spawnEnemyAt('mimir', p.x + 300, p.y, useGameStore.getState().gameTime);
    useGameStore.setState(s => ({ enemies: [boss], gameTime: s.gameTime + 100, npcDialogueQueue: [] }));
    step();
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(1);
    useGameStore.getState().updateNpcDialogue(useGameStore.getState().gameTime + 50);
    expect(useGameStore.getState().npcDialogue?.text).toBeTruthy();
  });

  it('アテンション(カットイン)中は通信が進まず、明けてからフルの尺で表示される', () => {
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.getState().enqueueNpcDialogue([{ name: '守護霊', text: '援護します!' }]);
    // 出現カットイン中(attention有り): 表示への昇格が起きない=裏で尺を消費しない。
    useGameStore.setState({ attention: { x: 0, y: 0, startReal: Date.now(), fromCamX: 0, fromCamY: 0, holdMs: 900 } });
    useGameStore.getState().updateNpcDialogue(gt0 + 100);
    useGameStore.getState().updateNpcDialogue(gt0 + 3000); // 旧実装ならこの間に2.8秒がまるごと過ぎていた
    expect(useGameStore.getState().npcDialogue).toBeNull();
    expect(useGameStore.getState().npcDialogueQueue.length).toBe(1);
    // 明けたら昇格し、そこからNPC_DIALOGUE_MSのフル尺で読める。
    useGameStore.setState({ attention: null });
    useGameStore.getState().updateNpcDialogue(gt0 + 3100);
    const cur = useGameStore.getState().npcDialogue;
    expect(cur?.text).toBe('援護します!');
    expect((cur?.until ?? 0) - (gt0 + 3100)).toBe(NPC_DIALOGUE_MS);
  });

  it('表示中にアテンションが始まっても、明けたエッジで尺が張り直される(読み時間を失わない)', () => {
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.getState().enqueueNpcDialogue([{ name: '守護霊', text: 'ここまでのようだ' }]);
    useGameStore.getState().updateNpcDialogue(gt0 + 10); // 昇格(表示開始)
    expect(useGameStore.getState().npcDialogue?.text).toBe('ここまでのようだ');
    useGameStore.setState({ attention: { x: 0, y: 0, startReal: Date.now(), fromCamX: 0, fromCamY: 0, holdMs: 900 } });
    useGameStore.getState().updateNpcDialogue(gt0 + 5000); // 凍結(旧実装なら期限切れで消えていた)
    expect(useGameStore.getState().npcDialogue?.text).toBe('ここまでのようだ');
    useGameStore.setState({ attention: null });
    useGameStore.getState().updateNpcDialogue(gt0 + 5100);
    const cur = useGameStore.getState().npcDialogue;
    expect(cur?.text).toBe('ここまでのようだ');
    expect((cur?.until ?? 0) - (gt0 + 5100)).toBe(NPC_DIALOGUE_MS); // 張り直し=フル尺
  });
});
