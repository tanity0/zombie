// ★被弾反撃(research/HIT_RETALIATION.md)の純関数。窓の開閉の時刻・向きの角度・相手の有効条件・パッドのニュートラル履歴を固定する。
import { describe, it, expect } from 'vitest';
import {
  RETALIATE_WINDOW_MS, RETALIATE_REACH_PX, RETALIATE_ANGLE_DEG, RETALIATE_DAMAGE_MULT, RETALIATE_PAD_NEUTRAL_MS,
  retaliationClosesAt, makeRetaliationWindow, isRetaliationWindowOpen, retaliationAngleOk,
  isRetaliateTargetEligible, isRetaliationBlocked, createPadNeutralTracker, stepPadNeutral,
} from './hitRetaliation';

describe('窓の時刻 — ヒットストップが明けてから300ms', () => {
  it('仕様の数値: 窓300ms・届く距離260px・角度45度・倍率2', () => {
    expect(RETALIATE_WINDOW_MS).toBe(300);
    expect(RETALIATE_REACH_PX).toBe(260);
    expect(RETALIATE_ANGLE_DEG).toBe(45);
    expect(RETALIATE_DAMAGE_MULT).toBe(2);
  });
  it('閉じる時刻 = ストップ明け + 300(当たった瞬間から 軽370 / 中420 / 重490)', () => {
    expect(retaliationClosesAt(1000, 1070)).toBe(1370);
    expect(retaliationClosesAt(1000, 1120)).toBe(1420);
    expect(retaliationClosesAt(1000, 1190)).toBe(1490);
  });
  it('ストップが既に明けている(または無い)なら、今から300ms', () => {
    expect(retaliationClosesAt(1000, 0)).toBe(1300);
    expect(retaliationClosesAt(1000, 900)).toBe(1300);
  });
  it('開く瞬間 = 被弾の瞬間(ヒットストップの最中から受け付ける)・閉じる ms ちょうどは閉じている', () => {
    const w = makeRetaliationWindow('e1', 1000, 1190, 1, 0);
    expect(isRetaliationWindowOpen(w, 999)).toBe(false);
    expect(isRetaliationWindowOpen(w, 1000)).toBe(true);
    expect(isRetaliationWindowOpen(w, 1100)).toBe(true); // ストップの最中
    expect(isRetaliationWindowOpen(w, 1489)).toBe(true);
    expect(isRetaliationWindowOpen(w, 1490)).toBe(false);
    expect(w.stopUntil).toBe(1190);
  });
  it('窓が無ければ閉じている / 向きは単位ベクトルに正規化・重なっていれば真上', () => {
    expect(isRetaliationWindowOpen(null, 1000)).toBe(false);
    const w = makeRetaliationWindow('e1', 0, 0, 30, 40);
    expect(Math.hypot(w.dirX, w.dirY)).toBeCloseTo(1);
    const z = makeRetaliationWindow('e1', 0, 0, 0, 0);
    expect({ x: z.dirX, y: z.dirY }).toEqual({ x: 0, y: -1 });
  });
});

describe('向きの判定 — ±45度以内', () => {
  it('同じ向きは成立 / 真後ろは不成立', () => {
    expect(retaliationAngleOk(1, 0, 5, 0)).toBe(true);
    expect(retaliationAngleOk(-1, 0, 5, 0)).toBe(false);
  });
  it('境目: 45度は成立・46度は不成立(入力の長さには依らない)', () => {
    const rad = (d: number) => (d * Math.PI) / 180;
    expect(retaliationAngleOk(Math.cos(rad(45)) * 3, Math.sin(rad(45)) * 3, 1, 0)).toBe(true);
    expect(retaliationAngleOk(Math.cos(rad(46)), Math.sin(rad(46)), 1, 0)).toBe(false);
    expect(retaliationAngleOk(Math.cos(rad(-44)), Math.sin(rad(-44)), 1, 0)).toBe(true);
  });
  it('向きが無い(ゼロベクトル)なら不成立', () => {
    expect(retaliationAngleOk(0, 0, 1, 0)).toBe(false);
    expect(retaliationAngleOk(1, 0, 0, 0)).toBe(false);
  });
});

describe('相手の再確認 — 普通の近接で斬れる敵だけ', () => {
  const ok = { health: 10, type: 'zombie' as const };
  it('生きていて260px以内なら有効 / 261pxは無効', () => {
    expect(isRetaliateTargetEligible(ok, 260)).toBe(true);
    expect(isRetaliateTargetEligible(ok, 261)).toBe(false);
  });
  it('死んでいる・死体・眠っている・空中の跳び・昇天中は無効', () => {
    expect(isRetaliateTargetEligible({ ...ok, health: 0 }, 10)).toBe(false);
    expect(isRetaliateTargetEligible({ ...ok, corpseUntil: 5 }, 10)).toBe(false);
    expect(isRetaliateTargetEligible({ ...ok, dormant: true }, 10)).toBe(false);
    expect(isRetaliateTargetEligible({ ...ok, aiPhase: 'jump' }, 10)).toBe(false);
    expect(isRetaliateTargetEligible({ ...ok, bossState: 'hero-ascend' }, 10)).toBe(false);
  });
  it('横切りの死神は無効 / 深奥チェイサー(終端の死神)は有効', () => {
    expect(isRetaliateTargetEligible({ ...ok, type: 'reaper' }, 10)).toBe(false);
    expect(isRetaliateTargetEligible({ ...ok, type: 'reaper', reaperChaser: true }, 10)).toBe(true);
  });
  it('届く距離は引数で変えられる(着地の再確認は近接の射程を渡す)', () => {
    expect(isRetaliateTargetEligible(ok, 80, 74)).toBe(false);
    expect(isRetaliateTargetEligible(ok, 70, 74)).toBe(true);
  });
});

describe('反撃が出せない状態 — 1つでも立てば不発(従来の入力経路へ)', () => {
  const none = { inputLocked: false, attention: false, meleeLocked: false, skaterRiding: false, rhythm: false, pvpIncapacitated: false, seekerBlocked: false };
  it('何も立っていなければ出せる', () => { expect(isRetaliationBlocked(none)).toBe(false); });
  it.each(Object.keys(none))('%s が立てば不発', (k) => {
    expect(isRetaliationBlocked({ ...none, [k]: true })).toBe(true);
  });
});

describe('パッドのニュートラル履歴 — 直近150ms以内にデッドゾーン内だった状態から倒れた時だけ', () => {
  const DEAD = 0.2;
  it('ニュートラル → 相手の方へ倒す: 倒した最初のフレームで入力として返る', () => {
    const t = createPadNeutralTracker();
    expect(stepPadNeutral(t, 0, 0, 1000, DEAD)).toBeNull();
    const r = stepPadNeutral(t, 0.9, 0, 1016, DEAD);
    expect(r).not.toBeNull();
    expect(r!.x).toBeCloseTo(1);
  });
  it('150ms以内なら倒した後の数フレームも有効 / 151ms後は無効(ニュートラルから離れすぎ)', () => {
    const t = createPadNeutralTracker();
    stepPadNeutral(t, 0, 0, 1000, DEAD);
    expect(stepPadNeutral(t, 0.9, 0, 1000 + RETALIATE_PAD_NEUTRAL_MS, DEAD)).not.toBeNull();
    const t2 = createPadNeutralTracker();
    stepPadNeutral(t2, 0, 0, 1000, DEAD);
    expect(stepPadNeutral(t2, 0.9, 0, 1000 + RETALIATE_PAD_NEUTRAL_MS + 1, DEAD)).toBeNull();
  });
  it('倒しっぱなしで歩いている(ニュートラルが無い)間は入力にならない', () => {
    const t = createPadNeutralTracker();
    for (let i = 0; i < 20; i++) expect(stepPadNeutral(t, 0.9, 0, 1000 + i * 16, DEAD)).toBeNull();
  });
  it('一度も中心を通っていない状態(初期)から倒しても入力にならない', () => {
    const t = createPadNeutralTracker();
    expect(stepPadNeutral(t, 0.5, 0.5, 1000, DEAD)).toBeNull();
  });
  it('左から右へ一気に倒した(中心の標本が無い): 逆向きへ振れた瞬間を中心通過として扱い、入力になる', () => {
    const t = createPadNeutralTracker();
    stepPadNeutral(t, -0.95, 0, 1000, DEAD); // 左へ倒しっぱなし(ニュートラルなし)
    stepPadNeutral(t, -0.95, 0, 1016, DEAD);
    const r = stepPadNeutral(t, 0.95, 0, 1032, DEAD); // 次のフレームで右いっぱい
    expect(r).not.toBeNull();
    expect(r!.x).toBeCloseTo(1);
  });
  it('同じ向きのままの強弱の揺れは中心通過にならない', () => {
    const t = createPadNeutralTracker();
    stepPadNeutral(t, 0.95, 0, 1000, DEAD);
    expect(stepPadNeutral(t, 0.5, 0, 1400, DEAD)).toBeNull();
  });
  it('デッドゾーンの境目: 0.2ちょうどはまだ中(外ではない)', () => {
    const t = createPadNeutralTracker();
    expect(stepPadNeutral(t, 0.2, 0, 1000, DEAD)).toBeNull();
    expect(stepPadNeutral(t, 0.21, 0, 1010, DEAD)).not.toBeNull();
  });
});
