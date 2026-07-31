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
