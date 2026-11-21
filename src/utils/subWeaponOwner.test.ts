// BOT_AND_GHOST.md §2.8 G2.6: オーナー抽象化の入口(座標・向き・受け手)の検証。
import { describe, it, expect } from 'vitest';
import {
  playerAsOwner, ghostAsOwner, ownerCenterX, ownerCenterY, ownerFootY,
  pickSubAimTarget, type SubAimEnemyLike,
} from './subWeaponOwner';

describe('playerAsOwner: 既定オーナー=プレイヤー(挙動不変の土台)', () => {
  it('座標/寸法はそのまま、facingは生のlastDirection(正規化も既定値適用もしない)', () => {
    const o = playerAsOwner({ x: 10, y: 20, width: 30, height: 40, lastDirection: { x: 3, y: -4 } });
    expect(o.kind).toBe('player');
    expect(o.summonId).toBeNull();
    expect(o.facing).toEqual({ x: 3, y: -4 }); // 生の値のまま(各サブ固有のフォールバックは呼び出し側)
    expect(ownerCenterX(o)).toBe(25);
    expect(ownerCenterY(o)).toBe(40);
    expect(ownerFootY(o)).toBe(60);
  });

  it('lastDirection未設定ならfacing=null(サブごとのフォールバック({x:1,y:0}や{x:0,y:1})を潰さない)', () => {
    expect(playerAsOwner({ x: 0, y: 0, width: 10, height: 10 }).facing).toBeNull();
    expect(playerAsOwner({ x: 0, y: 0, width: 10, height: 10, lastDirection: null }).facing).toBeNull();
  });
});

describe('ghostAsOwner: ゴーストが自分をオーナーとして渡す', () => {
  it('座標/寸法はゴースト本体、facingは水平向き、summonId=受け手の識別', () => {
    const o = ghostAsOwner({ id: 'ghost-1', x: 100, y: 200, width: 20, height: 20, ghostFacing: -1 });
    expect(o.kind).toBe('ghost-ally');
    expect(o.summonId).toBe('ghost-1');
    expect(o.facing).toEqual({ x: -1, y: 0 });
    expect(ownerCenterX(o)).toBe(110);
    expect(ownerCenterY(o)).toBe(210);
  });

  it('ghostFacing未設定は右向き(1)', () => {
    expect(ghostAsOwner({ id: 'g', x: 0, y: 0, width: 10, height: 10 }).facing).toEqual({ x: 1, y: 0 });
  });
});

// v0.25.2472(社長指示「狙い先はゴーストの紐付きボス」): 照準の合流点。
describe('pickSubAimTarget: 狙いを持つサブ(手榴弾/発火ナイフ)のターゲット選択', () => {
  const mkEnemy = (id: string, x: number, type = 'zombie', reaperChaser?: boolean): SubAimEnemyLike =>
    ({ id, x, y: 0, width: 10, height: 10, type, reaperChaser });
  const player = playerAsOwner({ x: 0, y: 0, width: 10, height: 10 });
  const ghost = ghostAsOwner({ id: 'ghost-1', x: 0, y: 0, width: 10, height: 10 });

  it('プレイヤー: 従来どおり最も近い非リーパー敵(ghostBossIdが渡っていても使わない)', () => {
    const enemies = [mkEnemy('far', 300), mkEnemy('near', 50), mkEnemy('boss', 200, 'giantbat')];
    expect(pickSubAimTarget(player, 'boss', enemies)?.id).toBe('near');
  });

  it('プレイヤー: 非追跡リーパーは対象外、reaperChaserは対象(既存の自動照準と同じフィルタ)', () => {
    const enemies = [mkEnemy('reaper', 20, 'reaper'), mkEnemy('z', 100)];
    expect(pickSubAimTarget(player, undefined, enemies)?.id).toBe('z');
    const chasing = [mkEnemy('reaper', 20, 'reaper', true), mkEnemy('z', 100)];
    expect(pickSubAimTarget(player, undefined, chasing)?.id).toBe('reaper');
  });

  it('ゴースト: 紐付きボスが生きていれば距離に関係なくボスを狙う', () => {
    const enemies = [mkEnemy('near', 30), mkEnemy('boss', 500, 'giantbat')];
    expect(pickSubAimTarget(ghost, 'boss', enemies)?.id).toBe('boss');
  });

  it('ゴースト: 紐付きボス不在の瞬間は最寄りへフォールバック', () => {
    const enemies = [mkEnemy('near', 30), mkEnemy('far', 400)];
    expect(pickSubAimTarget(ghost, 'boss-gone', enemies)?.id).toBe('near');
    expect(pickSubAimTarget(ghost, undefined, enemies)?.id).toBe('near');
  });

  it('敵ゼロは undefined(呼び出し側の facing フォールバックへ)', () => {
    expect(pickSubAimTarget(player, undefined, [])).toBeUndefined();
    expect(pickSubAimTarget(ghost, 'boss', [])).toBeUndefined();
  });
});
