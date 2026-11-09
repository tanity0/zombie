// ★卵を割る当たり(社長実機報告2026-11-09「銃の弾や爆発、一部格闘の技などで緑の卵が割れない。」)の純関数。
// 弾は撃った人の体の高さを飛ぶ。同じ地面に転がっている卵の上を素通りしないこと、速い弾が1フレームで飛び越さないことを固定する。
import { describe, it, expect } from 'vitest';
import { mineRect, eggShotRect, sweptBoxHitsRect, eggInCapsule, eggInFan, eggInBeam, circleHitsEgg, EGG_DRAW_H, EGG_DRAW_W } from './mines';

const PLAYER_H = 28; // 自機の当たり判定(PLAYER_HITBOX)
const egg = { footX: 100, footY: 200, scale: 1 };
/** 同じ地面に立つゾンビ(36×36)の体の真ん中へ向かう弾(6×6・左上座標)。足元から 14(自機の真ん中)〜18px(ゾンビの真ん中)の高さを飛ぶ。 */
const bulletAt = (cx: number, groundY: number) => ({ x: cx - 3, y: groundY - 17 - 3, width: 6, height: 6 });

describe('弾と卵(描かれた卵の箱で当てる)', () => {
  it('同じ地面の卵の真上を体の高さで通る弾は当たる(足元の18×12では当たらなかった)', () => {
    const b = bulletAt(100, 200);
    const foot = mineRect(egg);
    const hitFoot = b.x < foot.x + foot.width && b.x + b.width > foot.x && b.y < foot.y + foot.height && b.y + b.height > foot.y;
    expect(hitFoot).toBe(false); // 直す前の当たり=素通り
    expect(sweptBoxHitsRect(undefined, b, eggShotRect(egg))).toBe(true);
  });
  it('箱は描かれた大きさ(22×29・足元から上)', () => {
    const r = eggShotRect(egg);
    expect(r).toEqual({ x: 100 - EGG_DRAW_W / 2, y: 200 - EGG_DRAW_H, width: EGG_DRAW_W, height: EGG_DRAW_H });
  });
  it('卵の上を大きく外れた弾は当たらない', () => {
    expect(sweptBoxHitsRect(undefined, { x: 96, y: 200 - 60, width: 8, height: 8 }, eggShotRect(egg))).toBe(false);
    expect(sweptBoxHitsRect(undefined, { x: 140, y: 186, width: 8, height: 8 }, eggShotRect(egg))).toBe(false);
  });
  it('速い弾(1フレームで60px)が卵を飛び越しても、前の位置からの掃引で当たる', () => {
    const prev = { x: 60, y: 182 }, cur = { x: 120, y: 182, width: 8, height: 8 };
    expect(sweptBoxHitsRect(undefined, cur, eggShotRect(egg))).toBe(false); // 今の位置だけなら外れ
    expect(sweptBoxHitsRect(prev, cur, eggShotRect(egg))).toBe(true);
  });
  it('掃引でも、卵の脇を通り過ぎる弾は当たらない', () => {
    expect(sweptBoxHitsRect({ x: 60, y: 120 }, { x: 140, y: 120, width: 8, height: 8 }, eggShotRect(egg))).toBe(false);
  });
});

describe('円・帯・光線・扇', () => {
  it('爆発の円(足元で測る): 半径の内側は割れる・外は割れない', () => {
    expect(eggInCapsule(egg, 100 + 79, 200, 1, 0, 0, 80)).toBe(true);
    expect(eggInCapsule(egg, 100 + 81, 200, 1, 0, 0, 80)).toBe(false);
  });
  it('光線は体の高さを通る: 同じ地面の卵の上を通る光線で割れる・遠くを通る光線では割れない', () => {
    const y = 200 - PLAYER_H / 2;
    expect(eggInBeam(egg, 0, y, 300, y, 6)).toBe(true);
    expect(eggInBeam(egg, 0, y - 60, 300, y - 60, 6)).toBe(false);
    expect(eggInBeam(egg, 0, y, 80, y, 6)).toBe(false); // 届かない
  });
  it('扇: 向きの中・届きの中だけ', () => {
    expect(eggInFan(egg, 0, 200, 1, 0, 120, 0.4)).toBe(true);
    expect(eggInFan(egg, 0, 200, -1, 0, 120, 0.4)).toBe(false);
    expect(eggInFan(egg, 0, 200, 1, 0, 60, 0.4)).toBe(false);
  });
  it('円(塊弾・回る弾・矢の雨): 卵の描かれた箱に触れたら割れる', () => {
    expect(circleHitsEgg(egg, 100, 200 - 40, 12)).toBe(true);
    expect(circleHitsEgg(egg, 100, 200 - 60, 12)).toBe(false);
  });
});
