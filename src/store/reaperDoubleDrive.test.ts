// PACING_PUZZLE.md §14-4(補修バッチA-1・二重駆動の解消)の再発防止網。
//
// 死神本体(isTerminalReaper)/使者(isHangedman)は専用ムーバ(useGameLoop.tsのstepReaperBody/
// 使者の直進)が毎フレーム座標を直接書く。updateEnemies(gameStore.ts)の汎用チェイスがこの2タイプの
// 座標にも触れると、専用ムーバが書いた移動の上にもう一度チェイス移動が乗る「二重駆動」になり、
// 検収監査で確定したとおり本体は仕様の約2倍速・使者は約2.4倍速で寄る実害が出る
// (70px旋回が密着高速回転に化ける/詠唱静止・体勢崩れ停止が効かない、の元凶)。
//
// このテストはリポジトリの検収実測と同じ方法(reaper/hangedmanを置いてupdateEnemiesだけを回す)で
// 「updateEnemies単独では移動量が0になる」ことを固定する。KBスライド(唯一の適用点=
// gameStore.ts:11593付近)はこの早期returnより手前を通るため引き続き動くことも合わせて確認する。
import { describe, it, expect, vi } from 'vitest';
import { useGameStore, KNOCKBACK_DURATION } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

describe('updateEnemies — 死神本体/使者は汎用チェイスの対象外(補修バッチA-1)', () => {
  it('死神本体(reaperChaser=true)はupdateEnemiesだけでは1pxも動かない', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const body = spawnEnemyAt('reaper', player.x + 500, player.y + 500, useGameStore.getState().gameTime);
    body.reaperChaser = true;
    useGameStore.setState({ enemies: [body] });
    const before = useGameStore.getState().enemies[0];

    useGameStore.getState().updateEnemies(1 / 60);

    const after = useGameStore.getState().enemies[0];
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('使者(hangedman)もupdateEnemiesだけでは1pxも動かない(KB非発火時)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const servant = spawnEnemyAt('hangedman', player.x + 300, player.y + 300, useGameStore.getState().gameTime);
    useGameStore.setState({ enemies: [servant] });
    const before = useGameStore.getState().enemies[0];

    useGameStore.getState().updateEnemies(1 / 60);

    const after = useGameStore.getState().enemies[0];
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('★罠(A-1の必須条件): 使者のノックバックはこの早期returnより手前で適用されるため、\n     updateEnemies内で正しくノックバックスライドする(KBまで巻き込んで殺していないことの確認)', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const servant = spawnEnemyAt('hangedman', player.x + 300, player.y + 300, useGameStore.getState().gameTime);
    servant.knockbackVx = 200;
    servant.knockbackVy = 0;
    servant.knockbackUntil = Date.now() + KNOCKBACK_DURATION;
    useGameStore.setState({ enemies: [servant] });
    const before = useGameStore.getState().enemies[0];

    useGameStore.getState().updateEnemies(1 / 60);

    const after = useGameStore.getState().enemies[0];
    expect(after.x).toBeGreaterThan(before.x); // KBスライドで+x方向へ動く=KB経路は生きている

    spy.mockRestore();
  });
});
