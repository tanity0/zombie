// 憲法テスト(TEST_DESIGN.md 型C「同じ動作を持つ全員に付け忘れ」+ 型A「値の二重管理」)。v0.25.3086。
//
// 事故の再現:
//  ・型A(v3077): 城ボスの飛び掛かりは**滞空の絵だけ** PUMPKIN_JUMP_MS(実効833ms)を読み、
//    実際の滞空は GIANT_JUMP_AIR_MS(実効320ms)だった=**空中高くに居るのに着地**していた。
//  ・型C(v3077): グレンの連続ジャンプだけ高さの計算が無く、地面を滑っていた。
// どちらも「跳ぶ技の一覧」と「滞空時間の出どころ」が1つに無かったのが原因。
import { describe, it, expect } from 'vitest';
import {
  AIR_MOVES, airMoveFor, PUMPKIN_JUMP_MS, GIANT_JUMP_AIR_MS, GLEN_TRIJUMP_AIR_MS,
} from './gameStore';

describe('憲法: 跳ぶ技の台帳(AIR_MOVES)', () => {
  it('★実装が扱う跳ぶ技が全て載っている(1つでも欠けると、その技だけ浮かない=型Cの事故)', () => {
    const phases = AIR_MOVES.map(m => m.phase).sort();
    expect(phases).toEqual(['g-jump-air', 'g-trijump-air', 'jump']);
  });

  it('各行が自己整合(滞空時間>0・高さ>0・phaseの重複なし)', () => {
    const seen = new Set<string>();
    for (const m of AIR_MOVES) {
      expect(m.airMsRaw, `${m.label}: 滞空時間が0`).toBeGreaterThan(0);
      expect(m.hopPx, `${m.label}: 浮きの高さが0=地面を滑る`).toBeGreaterThan(0);
      expect(seen.has(m.phase), `${m.phase} が重複`).toBe(false);
      seen.add(m.phase);
    }
  });

  it('★回帰(v0.25.3077): 各技の滞空時間は**その技の判定側の定数**と一致する', () => {
    // ここが割れると「絵はまだ空中/判定はもう着地」になる。値を2箇所で持たないための固定。
    expect(airMoveFor('jump')!.airMsRaw).toBe(PUMPKIN_JUMP_MS);
    expect(airMoveFor('g-jump-air')!.airMsRaw).toBe(GIANT_JUMP_AIR_MS);
    expect(airMoveFor('g-trijump-air')!.airMsRaw).toBe(GLEN_TRIJUMP_AIR_MS);
    // 事故そのもの: 城ボスの滞空に汎用ジャンプの尺を使ってはいけない(2.6倍も長い)。
    expect(airMoveFor('g-jump-air')!.airMsRaw).not.toBe(PUMPKIN_JUMP_MS);
  });

  it('表に無い状態は「跳んでいない」として扱う(浮かせない)', () => {
    expect(airMoveFor('g-glide-active')).toBeUndefined(); // 滑空は本体が地を這う技=別扱い
    expect(airMoveFor('chase')).toBeUndefined();
    expect(airMoveFor(undefined)).toBeUndefined();
  });
});
