// BOT_AND_GHOST.md §2.8 G2.6: オーナー抽象化の入口(座標・向き・受け手)の検証。
import { describe, it, expect } from 'vitest';
import { playerAsOwner, ghostAsOwner, ownerCenterX, ownerCenterY, ownerFootY } from './subWeaponOwner';

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
