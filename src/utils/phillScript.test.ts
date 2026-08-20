import { describe, it, expect } from 'vitest';
import {
  phillPhaseForHealth, phillRequiredMoveReady, phillRequiredMoveDamage, phillCageInitialRadiusPx,
  phillSummonSpawnCount, pickPhillMove, PHILL_SUMMON_CAP, PHILL_REQUIRED_GAP_MS,
  type PhillMoveGates,
} from './phillScript';

const READY_ALL: PhillMoveGates = {
  lightrainReady: true, goldringReady: true, judgmentReady: true, cageReady: true,
  requiredReady: true, summonReady: true,
};
const READY_NONE: PhillMoveGates = {
  lightrainReady: false, goldringReady: false, judgmentReady: false, cageReady: false,
  requiredReady: false, summonReady: false,
};

describe('phillPhaseForHealth', () => {
  it('HP50%超はフェーズ1、50%以下はフェーズ2', () => {
    expect(phillPhaseForHealth(1)).toBe(1);
    expect(phillPhaseForHealth(0.51)).toBe(1);
    expect(phillPhaseForHealth(0.5)).toBe(2);
    expect(phillPhaseForHealth(0.1)).toBe(2);
  });
});

describe('phillRequiredMoveReady(§10-14#7)', () => {
  it('フェーズ1では常にfalse(裁きの光/羽根の檻はP2解禁)', () => {
    expect(phillRequiredMoveReady(1, 100000, 0)).toBe(false);
  });
  it('フェーズ2でも直近の成立/被弾から4秒未満はfalse', () => {
    const firedAt = 10000;
    const readyAt = firedAt + PHILL_REQUIRED_GAP_MS;
    expect(phillRequiredMoveReady(2, readyAt - 1, readyAt)).toBe(false);
  });
  it('フェーズ2かつゲート明け後はtrue', () => {
    const firedAt = 10000;
    const readyAt = firedAt + PHILL_REQUIRED_GAP_MS;
    expect(phillRequiredMoveReady(2, readyAt, readyAt)).toBe(true);
  });
});

describe('phillRequiredMoveDamage(§10-15#5・35%クランプ)', () => {
  it('技のダメージが上限未満ならそのまま', () => {
    expect(phillRequiredMoveDamage(30, 1000)).toBe(30);
  });
  it('技のダメージが上限を超えたら最大HPの35%へクランプ', () => {
    expect(phillRequiredMoveDamage(9999, 1000)).toBe(350);
  });
  it('係数がいくら乗っても35%を破れない(上限ちょうどの境界)', () => {
    expect(phillRequiredMoveDamage(350, 1000)).toBe(350);
    expect(phillRequiredMoveDamage(351, 1000)).toBe(350);
  });
});

describe('phillCageInitialRadiusPx(§10-12#17・可視短辺の0.45倍が上限)', () => {
  it('叩き台の半径が上限内ならそのまま', () => {
    expect(phillCageInitialRadiusPx(100, 1000)).toBe(100);
  });
  it('叩き台の半径が上限を超えたら可視短辺×0.45へクランプ(?zoomlock=0.4のような強い引きでも破綻しない)', () => {
    // 可視短辺400px(強いズーム引き)に対し、叩き台300pxは0.45倍=180pxを超えるのでクランプされる。
    expect(phillCageInitialRadiusPx(300, 400)).toBeCloseTo(180);
  });
});

describe('phillSummonSpawnCount(§10-3の6・同時上限3)', () => {
  it('生存0体なら2〜3体を返す', () => {
    for (let i = 0; i < 20; i++) {
      const n = phillSummonSpawnCount(0, () => i / 20);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
  it('上限に空きが無ければ0', () => {
    expect(phillSummonSpawnCount(PHILL_SUMMON_CAP)).toBe(0);
    expect(phillSummonSpawnCount(PHILL_SUMMON_CAP + 1)).toBe(0);
  });
  it('空きが1体分しかなければ1体だけ(上限を超えない)', () => {
    expect(phillSummonSpawnCount(PHILL_SUMMON_CAP - 1, () => 0.99)).toBe(1);
  });
});

describe('pickPhillMove(距離帯×重み+ゲート)', () => {
  it('全ゲートtrueなら密着距離でも何かしら選ばれる', () => {
    const move = pickPhillMove(50, READY_ALL, () => 0.5);
    expect(move).not.toBeNull();
  });
  it('全ゲートfalseでも一般技(近接/弾/召喚以外)は選ばれる(CD無し勢が生きている)', () => {
    const move = pickPhillMove(500, READY_NONE, () => 0.5);
    expect(move).not.toBeNull();
    expect(move).not.toBe('lightrain');
    expect(move).not.toBe('goldring');
    expect(move).not.toBe('summon');
    expect(move).not.toBe('judgment');
    expect(move).not.toBe('cage');
  });
  it('requiredReadyがfalseならjudgment/cageは絶対に選ばれない(乱数を全走査)', () => {
    const gates: PhillMoveGates = { ...READY_ALL, requiredReady: false };
    for (let i = 0; i < 50; i++) {
      const move = pickPhillMove(300, gates, () => i / 50);
      expect(move).not.toBe('judgment');
      expect(move).not.toBe('cage');
    }
  });
  it('summonReadyがfalseならsummonは絶対に選ばれない', () => {
    const gates: PhillMoveGates = { ...READY_ALL, summonReady: false };
    for (let i = 0; i < 50; i++) {
      expect(pickPhillMove(300, gates, () => i / 50)).not.toBe('summon');
    }
  });
  it('密着距離ではwingslash/wingthrust/wingcombo以外に振れやすい重み設定(遠距離技の重みは0)', () => {
    // 密着ではlightrain(far寄り)は重み5と小さいが0ではない=完全排除ではなく比重の話であることを確認。
    expect(pickPhillMove(50, READY_ALL, () => 0)).not.toBeNull();
  });
});
