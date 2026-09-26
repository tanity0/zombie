// v0.25.2480: npcSfxDistGain(useGameLoopから移設した純関数)の性質の固定。
// 式そのものは v0.25.2155(護衛NPC)以来無変更=このテストは移設時の等価性を守る回帰網。
import { describe, it, expect } from 'vitest';
import { npcSfxDistGain } from './npcSfx';

const cam = { x: 0, y: 0 };
const gb = { width: 800, height: 600 };

describe('npcSfxDistGain: 画面外=0 / 近=1 / 遠いほど減衰(床0.08)', () => {
  it('画面外(カメラ矩形の外)は0=無音', () => {
    expect(npcSfxDistGain(-1, 300, 400, 300, cam, gb)).toBe(0);
    expect(npcSfxDistGain(801, 300, 400, 300, cam, gb)).toBe(0);
    expect(npcSfxDistGain(400, 601, 400, 300, cam, gb)).toBe(0);
  });
  it('プレイヤーと同位置(距離0)は等倍1.0', () => {
    expect(npcSfxDistGain(400, 300, 400, 300, cam, gb)).toBe(1);
  });
  it('遠いほど小さく、画面内なら床0.08を下回らない', () => {
    // v0.25.3030: 判定は監査v0.25.3008で「カメラ矩形」→「プレイヤー中心の同寸矩形」へ変更済み
    // (ズーム連動カメラ下げでプレイヤー周辺が矩形外=無音になる不具合の修正)。遠点はプレイヤー
    // (400,300)中心の矩形内に置く(旧: プレイヤー(0,0)から(790,590)=矩形外で0になっていた)。
    const near = npcSfxDistGain(450, 300, 400, 300, cam, gb);
    const far = npcSfxDistGain(790, 590, 400, 300, cam, gb);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0.08);
    expect(near).toBeLessThan(1);
  });
});
