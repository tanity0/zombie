// idol(stage-2隠しボス)の配置(§6.28-20・社長指示「ゴール資料の真逆位置」)の不変条件。
// MAPは手書きなので必ず編集される。編集でこれらが壊れたら即座に落ちるようにしておく。
import { describe, it, expect } from 'vitest';
import { rectsOverlap, type Rect } from './obstacles';
import {
  LAB_BOUNDS, LAB_WALLS, LAB_DOORS, LAB_ROOMS,
  LAB_IDOL_SPAWN, LAB_IDOL_FACING_LEFT, LAB_IDOL_AGGRO_RANGE, idolFacesLeft,
  LAB_PLAYER_SPAWN, LAB_MERCHANT, LAB_CARD_KEY, LAB_WEAPON_CRATE, LAB_CLEAR_ITEM, LAB_BUTTON,
} from './labMap';

const pointRect = (x: number, y: number, half = 1): Rect => ({ x: x - half, y: y - half, width: half * 2, height: half * 2 });

describe('LAB_IDOL_SPAWN(idolの設置座標=ゴール資料Xの点対称セル)', () => {
  it('床セルの上にある(壁・扉と重ならない)', () => {
    const p = pointRect(LAB_IDOL_SPAWN.x, LAB_IDOL_SPAWN.y, 4);
    expect(LAB_WALLS.some(w => rectsOverlap(p, w))).toBe(false);
    expect(LAB_DOORS.some(d => rectsOverlap(p, d.rect))).toBe(false);
  });

  it('LAB_BOUNDSの中心に対してLAB_CLEAR_ITEMと厳密に点対称である', () => {
    const centerX = LAB_BOUNDS.x + LAB_BOUNDS.width / 2;
    const centerY = LAB_BOUNDS.y + LAB_BOUNDS.height / 2;
    expect(LAB_IDOL_SPAWN.x).toBe(2 * centerX - LAB_CLEAR_ITEM.x);
    expect(LAB_IDOL_SPAWN.y).toBe(2 * centerY - LAB_CLEAR_ITEM.y);
  });

  it('置かれる部屋に他のランドマーク(P/M/K/W/X/B)が無い', () => {
    const room = LAB_ROOMS.find(r => rectsOverlap(pointRect(LAB_IDOL_SPAWN.x, LAB_IDOL_SPAWN.y), r.rect));
    expect(room).toBeDefined();
    const landmarks: Rect[] = [
      pointRect(LAB_PLAYER_SPAWN.x, LAB_PLAYER_SPAWN.y),
      pointRect(LAB_MERCHANT.x, LAB_MERCHANT.y),
      pointRect(LAB_CARD_KEY.x, LAB_CARD_KEY.y),
      pointRect(LAB_WEAPON_CRATE.x, LAB_WEAPON_CRATE.y),
      pointRect(LAB_CLEAR_ITEM.x, LAB_CLEAR_ITEM.y),
      pointRect(LAB_BUTTON.x, LAB_BUTTON.y),
    ];
    for (const lm of landmarks) {
      expect(rectsOverlap(lm, room!.rect)).toBe(false);
    }
  });

  it('索敵範囲(LAB_IDOL_AGGRO_RANGE)は正の値', () => {
    expect(LAB_IDOL_AGGRO_RANGE).toBeGreaterThan(0);
  });
});

describe('idolFacesLeft(設置時の向き=プレイヤーのスポーン地点を向く・社長指示)', () => {
  it('idolがプレイヤースポーンより右にいれば左向き', () => {
    expect(idolFacesLeft({ x: 0 }, { x: 100 })).toBe(true);
  });
  it('idolがプレイヤースポーンより左にいれば右向き', () => {
    expect(idolFacesLeft({ x: 100 }, { x: 0 })).toBe(false);
  });
  it('x が等しい(真上/真下)場合は右向き(既定の未反転)扱い', () => {
    expect(idolFacesLeft({ x: 50 }, { x: 50 })).toBe(false);
  });

  it('現在のマップでは実際に左向きになる(idol=列22行9・プレイヤー=列2行9で同じ行・右寄り)', () => {
    expect(LAB_IDOL_FACING_LEFT).toBe(true);
    expect(idolFacesLeft(LAB_PLAYER_SPAWN, LAB_IDOL_SPAWN)).toBe(LAB_IDOL_FACING_LEFT);
  });
});
