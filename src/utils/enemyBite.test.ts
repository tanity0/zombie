import { describe, it, expect } from 'vitest';
import {
  BITE_DEFAULT, BITE_BY_TYPE, biteSpecFor, bitePhaseOf, biteProgress,
  biteLungeFrac, bitePointFrom, biteReachRect, isInBiteRect,
} from './enemyBite';
import type { Enemy } from '../types/game';

// ★全敵共通の噛みつき(PACING_PUZZLE.md §12)の不変条件。
// 守るのは3つ。どれか1つでも崩れると文法が壊れる:
//  1. 発火の30pxと判定の30pxは**同じ1つの数**(社長「あくまで当たり判定は30px範囲ね」)。
//  2. 判定は**予告した点**で取り、敵の実位置は見ない(壁際で赤と判定がズレない)。
//  3. 踏み込みは**絵**であって判定を伸ばさない。
const at = (biteAt: number | undefined): Pick<Enemy, 'type' | 'biteAt'> =>
  ({ type: 'zombie', biteAt } as Pick<Enemy, 'type' | 'biteAt'>);

describe('噛みつきの台帳', () => {
  it('社長指定の叩き台がそのまま入っている(30px / 300ms / 200ms / 20px)', () => {
    expect(BITE_DEFAULT.rangePx).toBe(30);
    expect(BITE_DEFAULT.windupMs).toBe(300);
    expect(BITE_DEFAULT.biteMs).toBe(200);
    expect(BITE_DEFAULT.lungePx).toBe(20);
    expect(BITE_DEFAULT.windupMs + BITE_DEFAULT.biteMs).toBe(500); // 社長「500msかけて」
  });

  it('★一旦カウンター可(赤)。紫へ切り替える時はこの1箇所だけを触る', () => {
    expect(BITE_DEFAULT.counterable).toBe(true);
  });

  it('今は全敵が既定値(敵ごとの上書きは空)=調整はこの表へ足していく', () => {
    expect(Object.keys(BITE_BY_TYPE)).toEqual([]);
    expect(biteSpecFor('zombie')).toEqual(BITE_DEFAULT);
    expect(biteSpecFor('werewolf')).toEqual(BITE_DEFAULT);
  });
});

describe('噛みつきの区間(300ms溜め → 200ms噛み)', () => {
  it('未発火は none / 溜め / 噛み / 終わったら none(境界を固定)', () => {
    expect(bitePhaseOf(at(undefined), 1000)).toBe('none');
    expect(bitePhaseOf(at(0), 1000)).toBe('none');
    expect(bitePhaseOf(at(1000), 1000)).toBe('windup');   // 0ms
    expect(bitePhaseOf(at(1000), 1299)).toBe('windup');   // 299ms
    expect(bitePhaseOf(at(1000), 1300)).toBe('bite');     // 300ms=噛みへ
    expect(bitePhaseOf(at(1000), 1499)).toBe('bite');     // 499ms
    expect(bitePhaseOf(at(1000), 1500)).toBe('none');     // 500ms=終了
  });

  it('進捗は0..1にクランプされる(赤い点滅と絵の2拍が同じ値を見る)', () => {
    expect(biteProgress(at(1000), 1000)).toBeCloseTo(0);
    expect(biteProgress(at(1000), 1250)).toBeCloseTo(0.5);
    expect(biteProgress(at(1000), 9999)).toBeCloseTo(1);
    expect(biteProgress(at(undefined), 1000)).toBe(0);
  });
});

describe('踏み込みの見た目(★プレイヤーの踏み込みとは逆の形)', () => {
  it('ゆっくり出て、噛む瞬間に伸び切る(溜め終わりで半分・最後に1)', () => {
    expect(biteLungeFrac(at(1000), 1000)).toBeCloseTo(0);
    // 溜めは ease-in: 中間(150ms)ではまだ 1/8 しか出ていない=「じわっと」
    expect(biteLungeFrac(at(1000), 1150)).toBeLessThan(0.2);
    expect(biteLungeFrac(at(1000), 1300)).toBeCloseTo(0.5); // 溜め終わり=半分
    expect(biteLungeFrac(at(1000), 1500)).toBeCloseTo(1);   // 噛み切って伸び切る
  });

  it('★単調増加(引っ込んでから出る、のような不自然な動きをしない)', () => {
    let prev = -1;
    for (let t = 0; t <= 500; t += 10) {
      const f = biteLungeFrac(at(1000), 1000 + t);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

describe('★判定の四角(社長2026-08-25「プレイヤーが居る側にだけ30px伸ばす」)', () => {
  const box = { cx: 0, cy: 0, w: 100, h: 50 }; // 社長の例: 100×50 の敵

  it('上にプレイヤーが居れば上へ30px伸び、下左右は伸びない', () => {
    const r = biteReachRect(box, 0, -200, 30);
    expect(r).toEqual({ x: -50, y: -55, w: 100, h: 80 }); // 高さ50→80(上へだけ)
  });

  it('右にプレイヤーが居れば右へだけ伸びる', () => {
    const r = biteReachRect(box, 200, 0, 30);
    expect(r).toEqual({ x: -50, y: -25, w: 130, h: 50 });
  });

  it('左・下も同じ(伸びるのは1辺だけ)', () => {
    expect(biteReachRect(box, -200, 0, 30)).toEqual({ x: -80, y: -25, w: 130, h: 50 });
    expect(biteReachRect(box, 0, 200, 30)).toEqual({ x: -50, y: -25, w: 100, h: 80 });
  });

  it('斜めは寄っている方の軸で決める(|dx| と |dy| の大きい方)', () => {
    expect(biteReachRect(box, 100, 10, 30).w).toBe(130);  // 横寄り=横へ
    expect(biteReachRect(box, 10, 100, 30).h).toBe(80);   // 縦寄り=縦へ
  });

  it('★体の大きい敵ほど自然に遠くまで届く(中心距離ではなく体の縁から測るため)', () => {
    // ゾンビ相当(幅20×高36の帯)と、その2倍の体。どちらも縁から30px先まで届く。
    const small = biteReachRect({ cx: 0, cy: 0, w: 20, h: 36 }, 0, -100, 30);
    const big = biteReachRect({ cx: 0, cy: 0, w: 40, h: 72 }, 0, -100, 30);
    expect(-small.y).toBe(18 + 30);  // 小さい体: 半分の高さ18 + 30
    expect(-big.y).toBe(36 + 30);    // 大きい体: 半分の高さ36 + 30
  });

  it('★焼いた四角の中に居れば当たり、外へ逃げれば空振り(境界を固定)', () => {
    const r = biteReachRect(box, 0, -200, 30);
    expect(isInBiteRect(r, 0, -55)).toBe(true);   // 上端ちょうど=当たる
    expect(isInBiteRect(r, 0, -55.1)).toBe(false); // 1px外=空振り
    expect(isInBiteRect(r, 0, 0)).toBe(true);      // 体の中
    expect(isInBiteRect(r, 60, -30)).toBe(false);  // 横は伸びていないので外
  });
});

describe('踏み込みの見た目の点(絵だけに使う)', () => {
  it('噛む点=敵の中心からプレイヤー方向へ lungePx だけ進んだ所', () => {
    const p = bitePointFrom(0, 0, 100, 0, 20);
    expect(p.x).toBeCloseTo(20);
    expect(p.y).toBeCloseTo(0);
    // 斜めでも距離は lungePx のまま
    const q = bitePointFrom(0, 0, 100, 100, 20);
    expect(Math.hypot(q.x, q.y)).toBeCloseTo(20);
  });

  it('プレイヤーと同座標なら敵の位置に落とす(0除算で飛ばない)', () => {
    expect(bitePointFrom(50, 50, 50, 50, 20)).toEqual({ x: 50, y: 50 });
  });

  it('踏み込みの点は絵のためのもの(判定はこれを使わない)', () => {
    // 判定は上の四角。ここは「絵がどこまで出るか」を決めるだけ。
    const bp = bitePointFrom(0, 0, 45, 0, 20);
    expect(Math.hypot(bp.x, bp.y)).toBeCloseTo(20);
  });
});
