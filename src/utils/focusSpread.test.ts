import { describe, it, expect } from 'vitest';
import {
  resolveFocusSpreadRad, narrowFocusSpreadRad, focusSpreadAfterHit,
  FOCUS_SPREAD_INITIAL_RAD, FOCUS_SPREAD_FLOOR_RAD, FOCUS_SPREAD_STEP_RAD, FOCUS_SPREAD_RESET_MS,
} from './focusSpread';

describe('resolveFocusSpreadRad', () => {
  it('未命中(currentRad/lastHitAt未設定)は初期値', () => {
    expect(resolveFocusSpreadRad(undefined, undefined, 1000)).toBe(FOCUS_SPREAD_INITIAL_RAD);
  });

  it('直近の命中からリセット時間未満なら現在値を維持', () => {
    expect(resolveFocusSpreadRad(0.94, 1000, 1000 + FOCUS_SPREAD_RESET_MS - 1)).toBe(0.94);
  });

  it('リセット時間ちょうどでは維持(> のみリセット)', () => {
    expect(resolveFocusSpreadRad(0.94, 1000, 1000 + FOCUS_SPREAD_RESET_MS)).toBe(0.94);
  });

  it('リセット時間を超えたら初期値へ戻る', () => {
    expect(resolveFocusSpreadRad(0.36, 1000, 1000 + FOCUS_SPREAD_RESET_MS + 1)).toBe(FOCUS_SPREAD_INITIAL_RAD);
  });
});

describe('narrowFocusSpreadRad', () => {
  it('1命中ごとに-0.18', () => {
    expect(narrowFocusSpreadRad(1.30)).toBeCloseTo(1.12, 5);
  });

  it('下限0.36でクランプされる', () => {
    expect(narrowFocusSpreadRad(FOCUS_SPREAD_FLOOR_RAD)).toBe(FOCUS_SPREAD_FLOOR_RAD);
    expect(narrowFocusSpreadRad(0.40)).toBeCloseTo(FOCUS_SPREAD_FLOOR_RAD, 5);
  });

  it('初期値1.30から命中を重ねると1.30→1.12→0.94→0.76→0.58→0.40→0.36(下限)', () => {
    let rad = FOCUS_SPREAD_INITIAL_RAD;
    const seq = [rad];
    for (let i = 0; i < 6; i++) {
      rad = narrowFocusSpreadRad(rad);
      seq.push(rad);
    }
    expect(seq[1]).toBeCloseTo(1.12, 5);
    expect(seq[5]).toBeCloseTo(0.40, 5);
    expect(seq[6]).toBeCloseTo(FOCUS_SPREAD_FLOOR_RAD, 5);
    expect(FOCUS_SPREAD_STEP_RAD).toBeCloseTo(0.18, 5);
  });
});

// ★社長仕様「命中した**射撃**ごとに1段階」= 1トリガー1回(ペレット単位ではない)。
// 1トリガー5ペレットなので、ペレット単位だと1トリガーで 1.30→0.40 まで詰まり、
// 「連続命中するほど収束していく」という武器の芯が消える(段数は 5.22 しかない)。
describe('focusSpreadAfterHit: 狭まりは1トリガー1回', () => {
  it('同じトリガー(同じcreatedAt)の2発目以降は null を返す=storeを書かない', () => {
    const w = { focusSpreadRad: undefined, focusSpreadLastHitAt: undefined, focusSpreadLastTriggerAt: undefined };
    const first = focusSpreadAfterHit(w, 1000, 5000);
    expect(first).not.toBeNull();
    expect(first!.focusSpreadRad).toBeCloseTo(FOCUS_SPREAD_INITIAL_RAD - FOCUS_SPREAD_STEP_RAD, 5);
    // 同一トリガーの残り4ペレットは何も起こさない
    for (let i = 0; i < 4; i++) expect(focusSpreadAfterHit(first!, 1000, 5000)).toBeNull();
  });

  it('別トリガーなら狭まる。下限0.36までに6トリガー要る(1トリガーでは詰まりきらない)', () => {
    let st: { focusSpreadRad?: number; focusSpreadLastHitAt?: number; focusSpreadLastTriggerAt?: number } = {};
    let now = 1000;
    const seen: number[] = [];
    for (let trigger = 1; trigger <= 6; trigger++) {
      now += 700; // クールダウン相当(FOCUS_SPREAD_RESET_MSのリセットには掛からない)
      const next = focusSpreadAfterHit(st, now, now);
      expect(next).not.toBeNull();
      st = next!;
      seen.push(next!.focusSpreadRad);
    }
    expect(seen[0]).toBeCloseTo(1.12, 5);
    expect(seen[4]).toBeCloseTo(0.40, 5);
    expect(seen[5]).toBeCloseTo(FOCUS_SPREAD_FLOOR_RAD, 5); // 6トリガー目で下限
  });

  it('2.5秒あくと、次の命中は初期値から1段階ぶん(積み上げが消える)', () => {
    const st = { focusSpreadRad: 0.40, focusSpreadLastHitAt: 1000, focusSpreadLastTriggerAt: 1000 };
    const next = focusSpreadAfterHit(st, 9000, 1000 + FOCUS_SPREAD_RESET_MS + 1);
    expect(next!.focusSpreadRad).toBeCloseTo(FOCUS_SPREAD_INITIAL_RAD - FOCUS_SPREAD_STEP_RAD, 5);
  });
});

// ★2026-09-07(社長報告「収束型ショットガンが収束してない」)の再発防止。
// 原因は**時計の混在**——命中側は gameTime を書くのに、発射側は Date.now() で引いていた。
// 差が常に1.7e12msになり、リセット窓を毎回超えて**毎射初期値へ戻っていた**(=一度も収束していない)。
// この形は「同じ時計で引けば維持され、違う時計で引くと必ずリセットされる」ことで機械的に固定できる。
describe('★時計の混在の再発防止', () => {
  it('同じ時計(gameTime)なら、リセット窓の中で狭まった散り角が維持される', () => {
    const st = { focusSpreadRad: 0.94, focusSpreadLastHitAt: 1000, focusSpreadLastTriggerAt: 1000 };
    // 700ms後(発射間隔1回ぶん)=窓の中なので維持される
    expect(resolveFocusSpreadRad(st.focusSpreadRad, st.focusSpreadLastHitAt, 1700)).toBe(0.94);
  });

  it('違う時計(Date.now相当)で引くと必ず初期値へ戻る=収束しない挙動になる', () => {
    const st = { focusSpreadRad: 0.94, focusSpreadLastHitAt: 1000 }; // gameTimeで書かれた値
    const wallClockNow = 1_700_000_000_000; // Date.now() 相当
    expect(resolveFocusSpreadRad(st.focusSpreadRad, st.focusSpreadLastHitAt, wallClockNow))
      .toBe(FOCUS_SPREAD_INITIAL_RAD);
  });
});
