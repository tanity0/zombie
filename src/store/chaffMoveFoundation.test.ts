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

describe('★凍結dtの繰り下げ(PACING_PUZZLE.md §16-7 穴4・実装者視点監査A-3)', () => {
  // ★v0.25.4453: この穴の**解き方が変わった**(社長裁定2026-09-17「攻撃中スーパーアーマー」)。
  // 旧: 被弾硬直で技も止まる → 止まったぶん §16 の時計を繰り下げて進捗を守る。
  // 新: **技の実行中はそもそも被弾硬直で止まらない**(`isEnemyAttacking` が true の間はゲートを通らない)
  //     ⇒ 時計は普通に進むので繰り下げる必要が無い。**穴は上流で塞がった。**
  // `deferFrozenClocksBy` は**技を出していない個体**用の安全網として残っている(そこに§16の時計は無い)。
  it('★技の実行中は被弾硬直で止まらない(スーパーアーマー)ので、時計も位置も凍らない', () => {
    const gt = setupOne({
      ...spawnEnemyAt('bat', 100, 100, 0),
      chaffMove: 'bat-grab' as const, biteAt: 1, aiPhase: 'b-windup' as const,
      hitStunUntil: Date.now() + 100000, // 止まっている間(updateEnemiesで動かない=戦闘の手触り①)
    } as unknown as import('../types/game').Enemy);
    const before = useGameStore.getState().enemies[0];
    expect(before.biteAt).toBe(1);
    const dt = 1 / 60;
    useGameStore.getState().setGameTime(gt + dt * 1000);
    useGameStore.getState().updateEnemies(dt);
    const after = useGameStore.getState().enemies[0];
    // 技の時計(biteAt)は繰り下がらない=素のまま。gameTimeが進んだぶんそのまま進捗になる。
    expect(after.biteAt).toBe(before.biteAt);
    // 止まっていない(=スーパーアーマー)。踏み込み/構えの移動がそのまま出る。
    expect(useGameStore.getState().enemies[0].hitStunUntil).toBe(before.hitStunUntil);
  });

  it('★§12の噛みつき(chaffMove未定義)は1bitも変えない(hitStunUntil中もbiteAtは動かさない)', () => {
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
    expect(after.biteAt).toBe(before.biteAt); // 従来どおり無変更(受け入れ条件1)
  });
});
