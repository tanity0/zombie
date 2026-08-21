// PACING_PUZZLE.md §10-20#5/#6/#7: EX広間(通路スケールアップ方式)の純関数の不変条件。
import { describe, it, expect } from 'vitest';
import {
  exHallScaleT, exHallLateralClampFromT, exHallLateralClamp, exHallTravel,
  EX_SURIEL_HALL, EX_PHILL_HALL, EX_HALL_TRANSITION_PX, EX_HALL_SCALE,
  EX_SURIEL_TRIGGER_Y, EX_HALL_LATERAL_CLAMP, EX_NORTH_LIMIT_Y, EX_BACK_WORLD_Y,
} from './exHall';
import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';

describe('exHallScaleT — 広間の外/内側', () => {
  it('スタート付近(通常通路)はt=0', () => {
    expect(exHallScaleT(0)).toBe(0);
    expect(exHallScaleT(-500)).toBe(0);
  });
  it('スリィエル広間の内部(南端〜北端)はt=1', () => {
    expect(exHallScaleT(EX_SURIEL_HALL.southY)).toBe(1);
    expect(exHallScaleT(-3000)).toBe(1); // 広間中心
    expect(exHallScaleT(EX_SURIEL_HALL.northY)).toBe(1);
  });
  it('フィル広間の内部もt=1', () => {
    expect(exHallScaleT(EX_PHILL_HALL.southY)).toBe(1);
    expect(exHallScaleT(-5500)).toBe(1);
    expect(exHallScaleT(EX_PHILL_HALL.northY)).toBe(1);
  });
  it('2つの広間の間(通常通路区間)はt=0(遷移帯の外)', () => {
    // スリィエル北端-3700から遷移帯400pxぶん離れた場所は完全に通常幅。
    expect(exHallScaleT(-3700 - EX_HALL_TRANSITION_PX)).toBe(0);
  });
});

describe('exHallScaleT — 遷移帯は連続(急に切り替えない=CLAUDE.md慣性則)', () => {
  it('南端の手前は0→1へ単調に増加する', () => {
    const southY = EX_SURIEL_HALL.southY;
    const t0 = exHallScaleT(southY + EX_HALL_TRANSITION_PX); // 遷移帯の入口
    const tMid = exHallScaleT(southY + EX_HALL_TRANSITION_PX / 2);
    const t1 = exHallScaleT(southY); // 広間の南端ちょうど
    expect(t0).toBeCloseTo(0, 5);
    expect(t1).toBe(1);
    expect(tMid).toBeGreaterThan(t0);
    expect(tMid).toBeLessThan(t1);
  });
});

describe('exHallScaleT — §10-20#5「戦闘開始時にt=1が完了していること」', () => {
  it('スリィエルの発火y(トリガー)では既にt=1(南端-2300 > トリガー-2800なので既に広間の内側)', () => {
    expect(exHallScaleT(EX_SURIEL_TRIGGER_Y)).toBe(1);
  });
});

// PACING_PUZZLE.md §10-20#5 検収監査#1(2巡目・v3752): O(y)=∫₀^y dy'/hallS(y') の不変条件。
// 参照実装として、ここでは独立に「素朴な数値積分(細かいリーマン和)」を書いて閉じた式(exHallTravel)と
// 突き合わせる(手計算の代数ミスを検出する目的。本体側の実装をコピーしない=別経路での検算)。
const numericExHallTravel = (y: number, stepsPerPx = 4): number => {
  if (y >= 0) return -y;
  const n = Math.max(1, Math.round(-y * stepsPerPx));
  const dy = y / n; // 負(0→yへ向かう小さな負のステップ)
  let acc = 0;
  let cur = 0;
  for (let i = 0; i < n; i++) {
    const mid = cur + dy / 2; // 中点則(台形則より誤差が小さい)
    const t = exHallScaleT(mid);
    const hallS = 1 + (EX_HALL_SCALE - 1) * t;
    acc += -dy / hallS; // dy<0なので -dy>0=前進距離ぶんを1/hallSで割り引いて加算
    cur += dy;
  }
  return acc;
};

describe('exHallTravel(O(y)) — 検収監査#1(2巡目): 数値積分との一致', () => {
  it('広間の外(通常通路)ではraw travelそのもの(-y)と一致する', () => {
    expect(exHallTravel(0)).toBeCloseTo(0, 9); // -y=-0(浮動小数点上は0と等価)なのでtoBeではなくtoBeCloseTo
    expect(exHallTravel(-500)).toBe(500);
    expect(exHallTravel(-1900)).toBeCloseTo(1900, 6); // スリィエル遷移帯の入口ちょうど
  });
  it.each([-100, -1900, -2100, -2300, -3000, -3700, -3900, -4100, -4250, -4400, -4600, -4800, -5500, -6000, -6300])(
    'y=%i で数値積分と一致する(誤差1px未満)', (y) => {
      expect(exHallTravel(y)).toBeCloseTo(numericExHallTravel(y), 0);
    });
});

describe('exHallTravel(O(y)) — 単調性(hallS>0が常に成り立つため経路非依存で単調に増加)', () => {
  it('yが0から-6400まで細かく進むほどOも単調に増加する(逆走しない)', () => {
    let prev = exHallTravel(0);
    for (let y = -10; y >= -6400; y -= 10) {
      const cur = exHallTravel(y);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });
});

describe('exHallTravel(O(y)) — 区間境界の連続性', () => {
  const boundaries = [
    EX_SURIEL_HALL.southY + EX_HALL_TRANSITION_PX, EX_SURIEL_HALL.southY, EX_SURIEL_HALL.northY,
    EX_SURIEL_HALL.northY - EX_HALL_TRANSITION_PX,
    EX_PHILL_HALL.southY + EX_HALL_TRANSITION_PX, EX_PHILL_HALL.southY, EX_PHILL_HALL.northY,
  ];
  it.each(boundaries)('境界y=%iの前後でOが連続(跳躍しない)', (y) => {
    const eps = 0.01;
    const before = exHallTravel(y + eps);
    const at = exHallTravel(y);
    const after = exHallTravel(y - eps);
    expect(Math.abs(at - before)).toBeLessThan(0.1);
    expect(Math.abs(after - at)).toBeLessThan(0.1);
  });
});

describe('exHallTravel(O(y)) — 「足が滑らない」受け入れ条件: 局所的な流速(dO/d前進距離)=1/hallS', () => {
  it.each([-100, -2100, -2300, -3000, -3700, -3900, -4600, -4800, -5500, -6000])(
    'y=%i 近傍の傾き(dO/dw、w=-y)が1/hallS(y)に一致する', (y) => {
      const h = 0.5;
      const slope = (exHallTravel(y - h) - exHallTravel(y + h)) / (2 * h); // dO/dw(w=-y)
      const expected = 1 / (1 + (EX_HALL_SCALE - 1) * exHallScaleT(y));
      expect(slope).toBeCloseTo(expected, 2);
    });
});

describe('EX_BACK_WORLD_Y / exHallTravel — 奥壁を同じO空間に置ける(検収監査#1(2巡目)③)', () => {
  it('EX_BACK_WORLD_Yは北端クランプの300px奥', () => {
    expect(EX_BACK_WORLD_Y).toBe(EX_NORTH_LIMIT_Y - 300);
  });
  it('exHallTravel(EX_BACK_WORLD_Y)は北端(EX_NORTH_LIMIT_Y)のO値より大きい(=奥壁は北端より奥)', () => {
    expect(exHallTravel(EX_BACK_WORLD_Y)).toBeGreaterThan(exHallTravel(EX_NORTH_LIMIT_Y));
  });
});

describe('exHallLateralClampFromT / exHallLateralClamp', () => {
  it('t=0は通常通路の横クランプ(CORRIDOR_LATERAL_CLAMP)そのもの', () => {
    expect(exHallLateralClampFromT(0)).toBe(CORRIDOR_LATERAL_CLAMP);
  });
  it('t=1は広間の横クランプ(EX_HALL_LATERAL_CLAMP)そのもの', () => {
    expect(exHallLateralClampFromT(1)).toBe(EX_HALL_LATERAL_CLAMP);
  });
  it('yからのショートハンドがexHallScaleT経由と一致する', () => {
    expect(exHallLateralClamp(-3000)).toBe(EX_HALL_LATERAL_CLAMP);
    expect(exHallLateralClamp(0)).toBe(CORRIDOR_LATERAL_CLAMP);
  });
});
