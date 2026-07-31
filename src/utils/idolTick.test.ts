// v0.25.2614(社長報告「ボスモードだからかな？アイドル動かない」): 盤面にアイドルが2体並んだ時の選択。
//
// 事故: ラボ資料のステージでは `resetGame` が**固定・休眠のアイドル**を最奥に置く。そこへ `?idolnow=1`
// が**2体目**をプレイヤーの近くへ強制召喚するので、アイドルが2体並ぶ。コントローラは
// `enemies.find(e => e.type === 'idol')` で**配列の先頭1体しか見ていなかった**ため、先に置かれた
// 遠くの休眠個体が拾われて起床判定に落ち、`runIdolTick` が一度も呼ばれない
// ⇒ **プレイヤーの隣にいる2体目が誰にも動かされず、完全に静止していた。**
//
// 対策は2段構え: ①強制召喚の側で既存アイドルを消してから出す(呼び出し側・useGameLoop)
//              ②ここで起きている個体を優先して選ぶ(万一2体並んでも動く方が制御される)
import { describe, it, expect } from 'vitest';
import { pickActiveIdol } from './idolTick';
import { clampRectToPlayableArea } from '../world/playableArea';
import { LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';
import type { Enemy } from '../types/game';

const mk = (id: string, dormant: boolean): Enemy =>
  ({ id, type: 'idol', dormant } as unknown as Enemy);

describe('pickActiveIdol: 2体並んでも「動く方」を制御する', () => {
  it('起きている個体を優先する(配列の後ろにいても)', () => {
    expect(pickActiveIdol([mk('fixed', true), mk('forced', false)])?.id).toBe('forced');
  });

  it('起きている個体が先頭でも同じ', () => {
    expect(pickActiveIdol([mk('forced', false), mk('fixed', true)])?.id).toBe('forced');
  });

  it('休眠しかいなければ先頭を返す(従来どおり起床判定に回す=通常プレイは不変)', () => {
    expect(pickActiveIdol([mk('a', true), mk('b', true)])?.id).toBe('a');
  });

  it('アイドルが居なければ undefined(他の敵は拾わない)', () => {
    expect(pickActiveIdol([{ id: 'z', type: 'zombie' } as unknown as Enemy])).toBeUndefined();
    expect(pickActiveIdol([])).toBeUndefined();
  });

  it('通常プレイ(アイドル1体)は従来どおりその1体を返す', () => {
    expect(pickActiveIdol([mk('only', true)])?.id).toBe('only');
    expect(pickActiveIdol([mk('only', false)])?.id).toBe('only');
  });
});

// v0.25.2617(社長報告「m2は移動できる範囲が限られてるのに、ボスだけその外に移動してる」):
// ボスはプレイヤーが行けない場所へ出てはいけない。ステージ2は横長廊下で、プレイヤー中心Yが
// ±LAB_CORRIDOR_Y_LIMIT_PX(=200)にクランプされる。idolTick は生の座標を書いていたため帯を越えていた。
// ここでは「行ける帯の定義が1本であること」(プレイヤーとボスが同じ純関数を通ること)を固定する。
describe('憲法: ボスはプレイヤーの行ける帯の外へ出ない', () => {
  const ctx = {
    farBackdrop: 'lab', labTheme: true, corridorMode: false,
    m0AdvanceLimitX: null, corridorRunInActive: false,
  };

  it('廊下帯の外へ出ようとした座標は帯の内側へ戻される(上下とも)', () => {
    const h = 20;
    const up = clampRectToPlayableArea(0, -5000, 40, h, ctx);
    const down = clampRectToPlayableArea(0, 5000, 40, h, ctx);
    // 中心Y = y + h/2 が ±200 に収まる。
    expect(up.y + h / 2).toBeGreaterThanOrEqual(-LAB_CORRIDOR_Y_LIMIT_PX);
    expect(down.y + h / 2).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX);
  });

  it('帯の中の座標は動かさない(通常の移動を邪魔しない)', () => {
    const inside = clampRectToPlayableArea(1234, 0, 40, 20, ctx);
    expect(inside).toEqual({ x: 1234, y: 0 });
  });

  it('横(X)は制限しない=廊下は横に長い', () => {
    expect(clampRectToPlayableArea(999999, 0, 40, 20, ctx).x).toBe(999999);
    expect(clampRectToPlayableArea(-999999, 0, 40, 20, ctx).x).toBe(-999999);
  });

  it('ラボ以外のステージでは何も制限しない(idolのデバッグ召喚が他ステージで動けなくならない)', () => {
    const free = { ...ctx, farBackdrop: 'city', labTheme: false };
    expect(clampRectToPlayableArea(0, 5000, 40, 20, free)).toEqual({ x: 0, y: 5000 });
  });
});
