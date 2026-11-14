// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」)の土台(§16-8b 1〜4)のうち、gameStore.ts の
// 共通部(気絶リセット/死亡/凍結dtの繰り下げ)を updateEnemies を実際に回して確かめる
// (実装精度の規律4「配線ロジックは純関数に切り出してテスト」+ 配線自体はここで統合テスト)。
import { describe, it, expect } from 'vitest';
import { useGameStore, buildCorpseFromKill } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

const setupOne = (e: import('../types/game').Enemy) => {
  useGameStore.getState().resetGame('assault');
  const gt = useGameStore.getState().gameTime;
  useGameStore.setState({ enemies: [e], gameTime: gt });
  return gt;
};

describe('★気絶リセットで chaffMove を消す(PACING_PUZZLE.md §16-7 穴2・実装者視点監査A-1)', () => {
  it('crit-stun(黄色)で aiPhase がリセットされる瞬間、chaffMove も同時に消える', () => {
    useGameStore.getState().resetGame('assault');
    const gt = useGameStore.getState().gameTime;
    const e = {
      ...spawnEnemyAt('bat', 100, 100, gt),
      aiPhase: 'b-windup' as const, aiPhaseUntil: gt + 500,
      chaffMove: 'bat-grab' as const, biteAt: gt,
      stunUntil: gt + 5000,
    };
    useGameStore.setState({ enemies: [e], gameTime: gt });
    useGameStore.getState().updateEnemies(1 / 60);
    const after = useGameStore.getState().enemies.find(x => x.id === e.id);
    expect(after?.aiPhase).toBeUndefined(); // 従来どおりのリセット(挙動不変)
    expect(after?.chaffMove).toBeUndefined(); // ★今回追加した分
  });

  it('気絶していない個体には触れない(aiPhaseもchaffMoveも保たれる)', () => {
    useGameStore.getState().resetGame('assault');
    const gt = useGameStore.getState().gameTime;
    const e = {
      ...spawnEnemyAt('bat', 100, 100, gt),
      aiPhase: 'b-windup' as const, aiPhaseUntil: gt + 5000,
      chaffMove: 'bat-grab' as const, biteAt: gt,
    };
    useGameStore.setState({ enemies: [e], gameTime: gt });
    useGameStore.getState().updateEnemies(1 / 60);
    const after = useGameStore.getState().enemies.find(x => x.id === e.id);
    expect(after?.chaffMove).toBe('bat-grab');
  });
});

describe('★死亡(buildCorpseFromKill)でも chaffMove を消す(§16-7b「biteAtを消す経路すべてで同時に消す」)', () => {
  it('死体は§16の技の構え絵を引きずらない', () => {
    const gt = 1000;
    const e = { ...spawnEnemyAt('bat', 0, 0, gt), chaffMove: 'bat-grab' as const, biteAt: gt };
    const corpse = buildCorpseFromKill(e, { x: 0, y: 0, width: 10, height: 10 });
    expect(corpse.biteAt).toBe(0);
    expect(corpse.chaffMove).toBeUndefined();
  });
});

// ★PACING_PUZZLE.md §16-H H-8: 旧「凍結dtの繰り下げ(穴4)」の節は**規則が反転した**ので書き換えた。
//   旧規則 = 止まっている間だけ、その敵の時計を後ろへ「足す」。
//   新規則 = **硬直の間は時計が1msも進まず、明けた瞬間にその時点を0としてCDが始まる**
//            (残りを預かって書き直す=足し算を1度もしない)。
// ここでは**スーパーアーマー(技の実行中は硬直しない)との境目**だけを見る。凍結そのものの
// 受け入れ条件(H-7の1〜7)は src/store/enemyClockFreeze.test.ts が持つ。
describe('★硬直中は時計が止まる(§16-H)/技の実行中は硬直しない(スーパーアーマー)', () => {
  it('★技の実行中は被弾硬直で止まらない(スーパーアーマー)ので、時計も位置も凍らない', () => {
    const gt = setupOne({
      ...spawnEnemyAt('bat', 100, 100, 0),
      chaffMove: 'bat-grab' as const, biteAt: 1, aiPhase: 'b-windup' as const,
      hitStunUntil: Date.now() + 100000,
    } as unknown as import('../types/game').Enemy);
    const before = useGameStore.getState().enemies[0];
    expect(before.biteAt).toBe(1);
    const dt = 1 / 60;
    useGameStore.getState().setGameTime(gt + dt * 1000);
    useGameStore.getState().updateEnemies(dt);
    const after = useGameStore.getState().enemies[0];
    // 技の時計(biteAt)は据え置かれない=素のまま。gameTimeが進んだぶんそのまま進捗になる。
    expect(after.biteAt).toBe(before.biteAt);
    expect(after.frozenClocks).toBeUndefined(); // 凍結扱いになっていない
    expect(useGameStore.getState().enemies[0].hitStunUntil).toBe(before.hitStunUntil);
  });

  it('★技を出していない個体は被弾硬直で凍る(=CDの残りが減らない)', () => {
    const gt = setupOne({
      ...spawnEnemyAt('zombie', 4000, 4000, 0),
      biteAt: 0, biteReadyAt: 3000, aiReadyAt: 5000,
      hitStunUntil: Date.now() + 100000,
    } as unknown as import('../types/game').Enemy);
    const dt = 1 / 60;
    const run = (): void => {
      const t = useGameStore.getState().gameTime;
      useGameStore.getState().setGameTime(t + dt * 1000);
      useGameStore.getState().updateEnemies(dt * 1.2);
    };
    run();
    const t0 = useGameStore.getState().gameTime;
    const rem0 = (useGameStore.getState().enemies[0].biteReadyAt ?? 0) - t0;
    for (let i = 0; i < 30; i++) run();
    const t1 = useGameStore.getState().gameTime;
    expect((useGameStore.getState().enemies[0].biteReadyAt ?? 0) - t1).toBeCloseTo(rem0, 6);
    expect(t1 - t0).toBeGreaterThan(400); // 時間自体は進んでいる
    void gt;
  });

  it('★§12の噛みつきを構えている個体は凍らない(構え中もスーパーアーマー)', () => {
    const gt = setupOne({
      ...spawnEnemyAt('zombie', 100, 100, 0),
      biteAt: 500, aiPhase: 'zrush' as const,
      hitStunUntil: Date.now() + 100000,
    } as unknown as import('../types/game').Enemy);
    const before = useGameStore.getState().enemies[0];
    const dt = 1 / 60;
    useGameStore.getState().setGameTime(gt + dt * 1000);
    useGameStore.getState().updateEnemies(dt);
    const after = useGameStore.getState().enemies[0];
    expect(after.biteAt).toBe(before.biteAt); // 台本の進捗は素のまま
    expect(after.frozenClocks).toBeUndefined();
  });
});
