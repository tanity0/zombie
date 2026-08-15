// PACING_PUZZLE.md §6.38 v12「バス停の新技『三段突き』」+★社長裁定(2026-08-15)の純関数テスト。
// 受け入れ条件のうち機械化できるもの(選択上限≦実効到達・予告≧公平の物差し・3本の帯の横方向の
// 連続性)をここで固定する。判定側(bountyTick.ts)の配線テストは bountyTick.test.ts 側。
import { describe, it, expect } from 'vitest';
import {
  BR_TRIPLE_MIN, BR_TRIPLE_MAX, BR_TRIPLE_REACH, BR_TRIPLE_HALF_WIDTH, BR_TRIPLE_STEP,
  BR_TRIPLE_WINDUP_MS, BR_TRIPLE_SPREAD_RAD, BR_TRIPLE_SPREAD_DEG,
  BR_TRIPLE_THRUST_MS, BR_TRIPLE_RETURN_MS, BR_TRIPLE_GAP_MS,
  BR_TRIPLE_STEP_MS, BR_TRIPLE_LAST_STEP_MS, BR_TRIPLE_ACTIVE_MS,
  BR_TRIPLE_PLAYER_RADIUS_MIRROR,
  brTripleAngles, brTripleStepDurationMs, brTripleLungeEase01, brTripleEffectiveReachPx,
} from './bountyTriple';
import { PLAYER_WALK_PX_PER_SEC } from './bossTelegraph';

describe('brTripleAngles — 左→中→右(社長裁定#3「判定側と描画側が同じ純関数から導く」)', () => {
  it('中央=渡した角度そのまま、左右は±BR_TRIPLE_SPREAD_RAD', () => {
    const [left, center, right] = brTripleAngles(0);
    expect(center).toBe(0);
    expect(left).toBeCloseTo(-BR_TRIPLE_SPREAD_RAD, 10);
    expect(right).toBeCloseTo(BR_TRIPLE_SPREAD_RAD, 10);
  });
  it('スプレッドは20度(社長指定)', () => {
    expect(BR_TRIPLE_SPREAD_DEG).toBe(20);
    expect(BR_TRIPLE_SPREAD_RAD).toBeCloseTo((20 * Math.PI) / 180, 10);
  });
  it('任意の中心角を渡しても左右は同じ相対オフセットを保つ(狙いだけがズレる)', () => {
    const base = 1.2345;
    const [left, center, right] = brTripleAngles(base);
    expect(center).toBe(base);
    expect(right - center).toBeCloseTo(BR_TRIPLE_SPREAD_RAD, 10);
    expect(center - left).toBeCloseTo(BR_TRIPLE_SPREAD_RAD, 10);
  });
});

describe('brTripleStepDurationMs / タイミング内訳(監査で出た未指定の埋め=A-6是正どおり)', () => {
  it('各段=突き出し90ms+戻り60ms、段間70ms(1・2段目のみ)', () => {
    expect(BR_TRIPLE_THRUST_MS).toBe(90);
    expect(BR_TRIPLE_RETURN_MS).toBe(60);
    expect(BR_TRIPLE_GAP_MS).toBe(70);
    expect(BR_TRIPLE_STEP_MS).toBe(220); // 90+60+70
    expect(BR_TRIPLE_LAST_STEP_MS).toBe(150); // 90+60(段間なし)
  });
  it('1・2段目=220ms、3段目=150ms(段間を持たずそのまま硬直へ)', () => {
    expect(brTripleStepDurationMs(0)).toBe(220);
    expect(brTripleStepDurationMs(1)).toBe(220);
    expect(brTripleStepDurationMs(2)).toBe(150);
  });
  it('3段合計=590ms(監査A-6是正どおり)', () => {
    expect(BR_TRIPLE_ACTIVE_MS).toBe(590);
    expect(brTripleStepDurationMs(0) + brTripleStepDurationMs(1) + brTripleStepDurationMs(2)).toBe(590);
  });
});

describe('brTripleLungeEase01 — 踏み込み(3段を1つの弧として加速→減速=CLAUDE.md MUST)', () => {
  it('端点は0→1(始点で未移動・終点で全移動)', () => {
    expect(brTripleLungeEase01(0, BR_TRIPLE_ACTIVE_MS)).toBe(0);
    expect(brTripleLungeEase01(BR_TRIPLE_ACTIVE_MS, BR_TRIPLE_ACTIVE_MS)).toBe(1);
  });
  it('負の経過・超過経過は0/1にクランプされる(境界安全)', () => {
    expect(brTripleLungeEase01(-100, BR_TRIPLE_ACTIVE_MS)).toBe(0);
    expect(brTripleLungeEase01(BR_TRIPLE_ACTIVE_MS + 1000, BR_TRIPLE_ACTIVE_MS)).toBe(1);
  });
  it('加速→減速(等速でない): 序盤の増分より中盤の増分の方が大きい(smoothstepの掟)', () => {
    const e0 = brTripleLungeEase01(0, BR_TRIPLE_ACTIVE_MS);
    const e1 = brTripleLungeEase01(BR_TRIPLE_ACTIVE_MS * 0.1, BR_TRIPLE_ACTIVE_MS);
    const eMidLo = brTripleLungeEase01(BR_TRIPLE_ACTIVE_MS * 0.45, BR_TRIPLE_ACTIVE_MS);
    const eMidHi = brTripleLungeEase01(BR_TRIPLE_ACTIVE_MS * 0.55, BR_TRIPLE_ACTIVE_MS);
    const earlyDelta = e1 - e0;
    const midDelta = eMidHi - eMidLo;
    expect(midDelta).toBeGreaterThan(earlyDelta); // 中盤(最速点付近)の方が序盤より速い=加速している
  });
  it('単調増加(逆流しない)', () => {
    let prev = -1;
    for (let t = 0; t <= BR_TRIPLE_ACTIVE_MS; t += 30) {
      const v = brTripleLungeEase01(t, BR_TRIPLE_ACTIVE_MS);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('★受け入れ条件(社長裁定#2の検算式・機械化できるもの)', () => {
  it('選択上限(460) ≦ 実効到達(300+34+14+120=468) = 空振り確定域なし', () => {
    expect(BR_TRIPLE_MAX).toBe(460);
    const effective = brTripleEffectiveReachPx();
    expect(effective).toBe(BR_TRIPLE_REACH + BR_TRIPLE_HALF_WIDTH + BR_TRIPLE_PLAYER_RADIUS_MIRROR + BR_TRIPLE_STEP);
    expect(effective).toBe(468);
    expect(BR_TRIPLE_MAX).toBeLessThanOrEqual(effective);
  });

  it('予告900ms ≧ 必要ms((468−380)/104.4*1000≒843) = 公平の物差し合格', () => {
    const effective = brTripleEffectiveReachPx();
    const requiredMs = ((effective - BR_TRIPLE_MIN) / PLAYER_WALK_PX_PER_SEC) * 1000;
    expect(requiredMs).toBeCloseTo(842.5, 0); // ≒843ms(設計書の記載どおり)
    expect(BR_TRIPLE_WINDUP_MS).toBeGreaterThanOrEqual(requiredMs);
  });

  it('選択距離帯は既存のキート帯(340〜560)の内側(社長裁定の主張どおり)', () => {
    const BR_KITE_MIN_MIRROR = 340, BR_KITE_MAX_MIRROR = 560; // bountyTick.tsの複製値(store非依存の層のため)
    expect(BR_TRIPLE_MIN).toBeGreaterThanOrEqual(BR_KITE_MIN_MIRROR);
    expect(BR_TRIPLE_MAX).toBeLessThanOrEqual(BR_KITE_MAX_MIRROR);
  });

  it('3本の帯は横方向に「概ね」隙間なく連続する(距離帯を計算し、成り立たない範囲があれば明記)', () => {
    // 判定はdistToSegment(プレイヤー中心, 帯の両端) <= halfWidth + プレイヤー半径(gameStore.ts
    // combatTick.applyPumpkinBlastDamageの共通経路と同じ式)。隣り合う2本(例: 中央と左)は、原点
    // (ボス中心)を共有する2直線なので、半径rでの垂直距離 = r * sin(spread) で厳密に求まる。
    // 「隙間なし」= その垂直距離 <= 自分の許容(halfWidth+pr) + 隣の許容(halfWidth+pr)。
    const pr = BR_TRIPLE_PLAYER_RADIUS_MIRROR;
    const tolerance = 2 * (BR_TRIPLE_HALF_WIDTH + pr);
    const gapFreeUntilR = tolerance / Math.sin(BR_TRIPLE_SPREAD_RAD);
    // 帯の全長(BR_TRIPLE_REACH=300px)のうち、隙間なく連続するのはこの半径までという結論を固定する。
    expect(gapFreeUntilR).toBeCloseTo(280.7, 0);
    expect(gapFreeUntilR).toBeLessThan(BR_TRIPLE_REACH); // ★成り立たない距離帯がある(先端側)
    // 先端(r=REACH)での実際の隙間幅(px)。設計書の指示どおり数値で明記する。
    const sepAtReach = BR_TRIPLE_REACH * Math.sin(BR_TRIPLE_SPREAD_RAD);
    const gapAtReach = sepAtReach - tolerance;
    expect(gapAtReach).toBeCloseTo(6.6, 1); // 先端(帯の最外周)でだけ約6.6pxの隙間が残る
    // ただし帯の全長300pxのうち280.7pxまで(全長の約93.6%)は隙間なく連続する=
    // 「横に避けても3本の帯に引っかかる」という社長の狙いは実質的に成立している。
    expect(gapFreeUntilR / BR_TRIPLE_REACH).toBeGreaterThan(0.9);
  });
});
