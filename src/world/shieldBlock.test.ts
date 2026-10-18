import { describe, it, expect } from 'vitest';
import {
  friendlyShieldRect, inShieldShadow, shieldBlocksArea, shieldBlocksLine, clipBeamAtShield, rectGap, SHIELD_AREA_GUARD_PX,
} from './shieldBlock';

// 上向きに置いた盾(横 58 × 厚み 16)。プレイヤーは盾の下(y が大きい側)。
const shield = { x: -29, y: -40, width: 58, height: 16 };
const playerAt = (cx: number, cy: number) => ({ x: cx - 14, y: cy - 14, width: 28, height: 28 });

describe('シールドで技を防ぐ(research/SHIELD_BLOCK.md)', () => {
  it('味方の盾だけを読む(幻影の盾=hostile は無視)', () => {
    expect(friendlyShieldRect([{ weaponType: 'shield', hostile: true, ...shield }])).toBeNull();
    expect(friendlyShieldRect([{ weaponType: 'bullet', ...shield }, { weaponType: 'shield', hostile: false, ...shield }])).toEqual(shield);
    expect(friendlyShieldRect([])).toBeNull();
  });

  it('影: 判定源→相手の線分が盾を通る時だけ。盾の中に居る時は防がない', () => {
    expect(inShieldShadow(0, -300, 0, 0, shield)).toBe(true);
    expect(inShieldShadow(200, -300, 200, 0, shield)).toBe(false); // 横
    expect(inShieldShadow(0, 300, 0, 0, shield)).toBe(false);      // 前から(盾の後ろではない)
    expect(inShieldShadow(0, -300, 0, -32, shield)).toBe(false);   // 相手が盾の中
    expect(inShieldShadow(0, -32, 0, 0, shield)).toBe(false);      // 判定源が盾の中
    expect(inShieldShadow(0, -300, 0, 0, null)).toBe(false);
  });

  it('円・扇: 影 かつ 盾から 40px 以内。41px で当たる', () => {
    const near = playerAt(0, -24 + 14 + SHIELD_AREA_GUARD_PX);   // 盾の下辺(-24)から体の上辺まで 40px
    const far = playerAt(0, -24 + 14 + SHIELD_AREA_GUARD_PX + 1);
    expect(rectGap(near, shield)).toBeCloseTo(40);
    expect(shieldBlocksArea(0, -300, near, shield)).toBe(true);
    expect(shieldBlocksArea(0, -300, far, shield)).toBe(false);
  });

  it('判定源がプレイヤーの足元の技は防げない', () => {
    const p = playerAt(0, 0);
    expect(shieldBlocksArea(0, 0, p, shield)).toBe(false);
    expect(shieldBlocksLine(0, 0, p, shield)).toBe(false);
  });

  it('帯・突進・レーザー: 影なら距離に関係なく防ぐ', () => {
    expect(shieldBlocksLine(0, -300, playerAt(0, 400), shield)).toBe(true);
    expect(shieldBlocksLine(0, -300, playerAt(300, 400), shield)).toBe(false);
  });

  it('光線の長さは中心線が盾に入る所で切る。外れたら・起点が盾の中なら切らない', () => {
    expect(clipBeamAtShield(0, -300, 0, 1, 2600, shield)).toBeCloseTo(260);
    expect(clipBeamAtShield(100, -300, 0, 1, 2600, shield)).toBe(2600);
    expect(clipBeamAtShield(0, -32, 0, 1, 2600, shield)).toBe(2600);
    expect(clipBeamAtShield(0, -300, 0, 1, 100, shield)).toBe(100); // 届かない
    expect(clipBeamAtShield(0, -300, 0, 1, 2600, null)).toBe(2600);
  });
});
