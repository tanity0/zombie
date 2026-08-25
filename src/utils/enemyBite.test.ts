import { describe, it, expect } from 'vitest';
import {
  BITE_DEFAULT, BITE_BY_TYPE, biteSpecFor, bitePhaseOf, biteProgress,
  biteLungeFrac, bitePointFrom, isInBiteCircle,
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

describe('★掟1〜3: 判定は「予告した点」の30px円', () => {
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

  it('★判定は予告した点の30px円=踏み込みは判定を伸ばさない(掟1・掟3)', () => {
    // 敵(0,0)・プレイヤー(45,0)。発火時に噛む点は (20,0) に確定する。
    const bp = bitePointFrom(0, 0, 45, 0, 20);
    // 予告した点から見て 25px なので当たる(元の敵位置からは45px=範囲外でも)
    expect(isInBiteCircle(bp.x, bp.y, 45, 0, 30)).toBe(true);
    // 予告した点から 31px 逃げれば空振り(社長「500以内に逃げれば避けれないと意味がない」)
    expect(isInBiteCircle(bp.x, bp.y, 51.1, 0, 30)).toBe(false);
    // 境界(ちょうど30px)は当たる
    expect(isInBiteCircle(bp.x, bp.y, 50, 0, 30)).toBe(true);
  });
});
