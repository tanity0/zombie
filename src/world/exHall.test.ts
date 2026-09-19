// PACING_PUZZLE.md §10-20#5/#6/#7: EX広間(通路スケールアップ方式)の純関数の不変条件。
import { describe, it, expect } from 'vitest';
import {
  exHallScaleT, exHallLateralClampFromT, exHallLateralClamp, exHallTravel,
  EX_SURIEL_HALL, EX_PHILL_HALL, EX_HALL_TRANSITION_PX, EX_HALL_SCALE,
  EX_SURIEL_TRIGGER_Y, EX_HALL_LATERAL_CLAMP, EX_NORTH_LIMIT_Y, EX_BACK_WORLD_Y,
  EX_HALL_RAMP_SUBSEGMENTS, exPhillNorthCenterLimitY,
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

// PACING_PUZZLE.md §10-20-FB1-1検収監査#1(FB1バッチ・2巡目「手前まで広めて」=移動可能域の拡張):
// EX_PHILL_HALL.southYを直接動かしたので、絵のS倍(exHallScaleT)・移動クランプ(exHallLateralClamp)・
// 流速(exHallTravel)が**この同じブレークポイント表から自動で追随する**ことを固定する。
describe('EX_PHILL_HALL拡張(検収監査#1) — 絵/クランプ/流速が同じブレークポイント表に自動追随する', () => {
  it('フィル広間の南端は旧値(-4800)より300px手前(-4500)に拡張されている', () => {
    expect(EX_PHILL_HALL.southY).toBe(-4500);
  });
  it('旧南端(-4800)は拡張後は広間の内部=t=1(=以前は境界だった位置が今は余裕を持って内側)', () => {
    expect(exHallScaleT(-4800)).toBe(1);
  });
  it('新しい南端(EX_PHILL_HALL.southY)ちょうどで絵のスケールt=1が完了している', () => {
    expect(exHallScaleT(EX_PHILL_HALL.southY)).toBe(1);
  });
  it('新しい南端で横クランプが広間フル幅(EX_HALL_LATERAL_CLAMP)まで拡幅されている', () => {
    expect(exHallLateralClamp(EX_PHILL_HALL.southY)).toBe(EX_HALL_LATERAL_CLAMP);
  });
  it('新しい南端の遷移帯入口(旧南端相当より更に手前)ではまだ通常通路幅(t=0)のまま', () => {
    expect(exHallScaleT(EX_PHILL_HALL.southY + EX_HALL_TRANSITION_PX)).toBeCloseTo(0, 9);
  });
  it('exHallTravelもEX_PHILL_HALL.southYの拡張に追随する(新しい南端の内側=局所傾き1/EX_HALL_SCALE)', () => {
    // 広間の内部(南端の少し奥=既にt=1の平坦区間)で、O(y)の局所傾き(dO/d前進距離)が
    // 1/EX_HALL_SCALEと一致すること=新しい南端がそのまま「広間フル幅」として積分に反映されている。
    const y = EX_PHILL_HALL.southY - 100; // 新南端の100px奥(広間の内部・平坦区間)
    const h = 0.5;
    const slope = (exHallTravel(y - h) - exHallTravel(y + h)) / (2 * h);
    expect(slope).toBeCloseTo(1 / EX_HALL_SCALE, 6);
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

// PACING_PUZZLE.md §10-20#5 検収監査#1(3巡目・v3753): ランプはsmoothstepをNサブ区間(既定32)で
// 近似する区分線形関数(CLAUDE.md慣性則「等速で始まり瞬間停止する動きの禁止」への対応)。
describe('exHallScaleT — ランプはsmoothstepのNサブ区間近似(検収監査#1・3巡目)', () => {
  it('ランプイン(南端手前)の各サブ区間の境界でsmoothstepの標本値と厳密一致する', () => {
    const southY = EX_SURIEL_HALL.southY;
    const tInStart = southY + EX_HALL_TRANSITION_PX;
    for (let i = 0; i <= EX_HALL_RAMP_SUBSEGMENTS; i++) {
      const frac = i / EX_HALL_RAMP_SUBSEGMENTS;
      const y = tInStart - EX_HALL_TRANSITION_PX * frac;
      const expected = frac * frac * (3 - 2 * frac); // smoothstep(frac)
      expect(exHallScaleT(y)).toBeCloseTo(expected, 9);
    }
  });

  it('ランプアウト(北端の先)の各サブ区間の境界でもsmoothstepの標本値と厳密一致する', () => {
    const northY = EX_SURIEL_HALL.northY;
    for (let i = 0; i <= EX_HALL_RAMP_SUBSEGMENTS; i++) {
      const frac = 1 - i / EX_HALL_RAMP_SUBSEGMENTS;
      const y = northY - EX_HALL_TRANSITION_PX * (i / EX_HALL_RAMP_SUBSEGMENTS);
      const expected = frac * frac * (3 - 2 * frac);
      expect(exHallScaleT(y)).toBeCloseTo(expected, 9);
    }
  });

  const slopeAt = (y0: number, y1: number): number => (exHallScaleT(y1) - exHallScaleT(y0)) / (y0 - y1);

  it('ランプ入口(frac→0)の傾きはランプ中央(frac≈0.5)よりずっと緩やか(=急に動き出さない・瞬間停止しない)', () => {
    const southY = EX_SURIEL_HALL.southY;
    const tInStart = southY + EX_HALL_TRANSITION_PX;
    const step = EX_HALL_TRANSITION_PX / EX_HALL_RAMP_SUBSEGMENTS;
    const slopeEdge = slopeAt(tInStart, tInStart - step); // 最初のサブ区間(frac 0→1/N)
    const midY = southY + EX_HALL_TRANSITION_PX / 2;
    const slopeMid = slopeAt(midY + step / 2, midY - step / 2); // 中央付近(frac≈0.5=smoothstepの最大傾き)
    expect(slopeEdge).toBeGreaterThan(0); // 完全な瞬間停止ではない(僅かでも動いている)
    expect(slopeEdge).toBeLessThan(slopeMid / 3); // だが中央よりずっと緩やか=ease(smoothstep近似の特徴)
  });

  it('ランプ出口(frac→1・広間へ入る直前)の傾きも同様に緩やか(=瞬間停止しない)', () => {
    const southY = EX_SURIEL_HALL.southY;
    const step = EX_HALL_TRANSITION_PX / EX_HALL_RAMP_SUBSEGMENTS;
    const slopeNearEnd = slopeAt(southY + step, southY); // 広間へ入る直前の最後のサブ区間
    const midY = southY + EX_HALL_TRANSITION_PX / 2;
    const slopeMid = slopeAt(midY + step / 2, midY - step / 2);
    expect(slopeNearEnd).toBeGreaterThan(0);
    expect(slopeNearEnd).toBeLessThan(slopeMid / 3);
  });
});

describe('exHallScaleT / exHallTravel — 同一のブレークポイント表から導出されている(検収監査#1・3巡目)', () => {
  it('ランプ内側の全サブ区間境界で、exHallTravelの局所傾き(dO/d前進距離)が' +
     'exHallScaleT由来のhallSの逆数と精度良く一致する(評価点のズレが無いことの直接確認)', () => {
    const southY = EX_SURIEL_HALL.southY;
    const tInStart = southY + EX_HALL_TRANSITION_PX;
    for (let i = 1; i < EX_HALL_RAMP_SUBSEGMENTS; i++) { // 端点(i=0,N)は有限差分が区間外へ出るため除外
      const y = tInStart - EX_HALL_TRANSITION_PX * (i / EX_HALL_RAMP_SUBSEGMENTS);
      const h = 0.05;
      const slope = (exHallTravel(y - h) - exHallTravel(y + h)) / (2 * h);
      const t = exHallScaleT(y);
      const hallS = 1 + (EX_HALL_SCALE - 1) * t;
      expect(slope).toBeCloseTo(1 / hallS, 3);
    }
  });
});

// PACING_PUZZLE.md §10-20-FB1-1(実機FB「フィルの戦場が端っこ過ぎる...ボスも上端は越えない程度に」)。
// ★検収監査#4(FB1バッチ・2巡目): world層はpixi/renderSpec.tsをimportしない=fitW/fitAspect/fitCyは
// テスト側でも呼び出し側と同じ値(BOSS_SPRITE_FIT.phillboss相当)を直接渡す。
const PHILL_FIT_W = 0.25, PHILL_FIT_ASPECT = 1024 / 768, PHILL_FIT_CY = 0.97;

describe('exPhillNorthCenterLimitY — スプライト上端が可視域上端を越えない北限(中心y)', () => {
  const playerCenterY = -5200;
  const viewportH = 800;
  const limit = (zoom: number, bossWidthPx: number, viewportHeightPx: number, cy = PHILL_FIT_CY) =>
    exPhillNorthCenterLimitY(playerCenterY, zoom, bossWidthPx, viewportHeightPx, PHILL_FIT_W, PHILL_FIT_ASPECT, cy);

  it('妥当な範囲の値を返す(退化・NaN・巨大値にならない)', () => {
    const v = limit(1, 60, viewportH);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeLessThan(playerCenterY); // プレイヤーより北(小さいy)側に許容域がある
    expect(v).toBeGreaterThan(playerCenterY - viewportH); // だが画面高を超えて北へ飛ぶような値でもない
  });

  it('ズームアウト(zoom<1)ほど北限が緩む(より北まで許容=limitCenterYが小さくなる・画面が広く映るため)', () => {
    expect(limit(0.5, 60, viewportH)).toBeLessThan(limit(1, 60, viewportH));
  });

  it('ズームイン(zoom>1)ほど北限が厳しくなる(より南までしか許容しない)', () => {
    expect(limit(1.3, 60, viewportH)).toBeGreaterThan(limit(1, 60, viewportH));
  });

  it('スプライト(bossWidthPx)が大きいほど北限が厳しくなる(より南までしか許容しない=単調増加)', () => {
    expect(limit(1, 80, viewportH)).toBeGreaterThan(limit(1, 40, viewportH));
  });

  it('playerCenterYが動いた分、北限もそのまま平行移動する(オフセットの形)', () => {
    const base = limit(1, 60, viewportH);
    const shifted = exPhillNorthCenterLimitY(playerCenterY - 500, 1, 60, viewportH, PHILL_FIT_W, PHILL_FIT_ASPECT, PHILL_FIT_CY);
    expect(shifted).toBeCloseTo(base - 500, 6);
  });

  it('画面高(viewportHeightPx)が大きいほど北限が緩む(より北まで許容=見える範囲が広いため)', () => {
    expect(limit(1, 60, 1000)).toBeLessThan(limit(1, 60, 600));
  });

  it('fitCy(絵の中でスプライト上端が判定中心よりどれだけ上にあるか)が大きいほど北限が厳しくなる=単調増加', () => {
    expect(limit(1, 60, viewportH, 1.2)).toBeGreaterThan(limit(1, 60, viewportH, 0.7));
  });
});
