import { describe, it, expect } from 'vitest';
import {
  makeKatanaDashHold, makeTsubameDashHold, katanaDashVirtualAlong, katanaDashAlong, pickKatanaDashHold, katanaDashHeld, firedKatanaDashHold, katanaDashHoldExtend,
  KATANA_DASH_HIT_HOLD_MS, KATANA_DASH_WHIFF_HOLD_MS, SATSUJIN_STRIKE_HOLD_MS,
} from './katanaDashHold';
import { KATANA_SELF_STOP_MS, MELEE_WHIFF_HOLD_MS } from './meleeHitstopTiming';
import { applyHitstopK } from './hitShake';
import { SATSUJIN_STRIKE_MS } from './katanaTsubame';

const H = () => makeKatanaDashHold(1000, { x: 0, y: 0 }, 1, 0, 154, 'fx');

describe('一閃の通り道の途中の止め(utils/katanaDashHold)', () => {
  it('長さ: 敵を通る=刀の自分の止め×一閃の係数・空振り=決めの間・殺陣=短め(次の発の間隔より短い)', () => {
    expect(KATANA_DASH_HIT_HOLD_MS).toBe(applyHitstopK(KATANA_SELF_STOP_MS, 'finisher'));
    expect(KATANA_DASH_WHIFF_HOLD_MS).toBe(MELEE_WHIFF_HOLD_MS);
    expect(SATSUJIN_STRIKE_HOLD_MS).toBeLessThan(KATANA_SELF_STOP_MS);
    expect(SATSUJIN_STRIKE_HOLD_MS).toBeLessThan(SATSUJIN_STRIKE_MS);
  });
  it('進んだ距離は走る向きへの射影', () => {
    const h = makeKatanaDashHold(0, { x: 10, y: 10 }, 0.6, 0.8, 100);
    expect(katanaDashAlong(h, 16, 18)).toBeCloseTo(10);
  });
  it('最初に当たる敵の中心を通ったフレームで止める(一番手前の敵)', () => {
    const h = H();
    const cands = [{ id: 'far', along: 120, halfW: 10 }, { id: 'near', along: 60, halfW: 10 }];
    expect(pickKatanaDashHold(h, 30, 45, cands)).toBeNull(); // まだ中心の手前(半フレーム先=52.5 も届かない)
    expect(pickKatanaDashHold(h, 40, 54, cands)?.kind).toBe('hit'); // 半フレーム先(61)で届く=次で行き過ぎるよりここで止める
    expect(pickKatanaDashHold(h, 50, 64, cands)).toEqual({ kind: 'hit', enemyId: 'near', ms: KATANA_DASH_HIT_HOLD_MS });
  });
  it('走り始めで既に体が重なっている敵は最初のフレームで止める・予定の距離より先の敵では止めない', () => {
    const h = H();
    expect(pickKatanaDashHold(h, 0, 14, [{ id: 'on', along: -5, halfW: 10 }])?.kind).toBe('hit');
    expect(pickKatanaDashHold(h, 0, 14, [{ id: 'on', along: 20, halfW: 10 }])?.kind).toBe('hit');
    expect(pickKatanaDashHold(h, 0, 14, [{ id: 'behind', along: -30, halfW: 10 }])).toBeNull();
    expect(pickKatanaDashHold(h, 150, 160, [{ id: 'beyond', along: 158, halfW: 2 }])).toBeNull();
  });
  it('空振り: 通り道の真ん中を越えたフレームで、先に敵が居なければ決めの間で止める・居れば待つ', () => {
    const h = H();
    expect(pickKatanaDashHold(h, 54, 66, [])).toBeNull(); // 半フレーム先=72 < 77
    expect(pickKatanaDashHold(h, 66, 76, [])).toEqual({ kind: 'whiff', ms: KATANA_DASH_WHIFF_HOLD_MS });
    expect(pickKatanaDashHold(h, 70, 84, [{ id: 'ahead', along: 130, halfW: 10 }])).toBeNull();
    expect(pickKatanaDashHold(h, 120, 134, [{ id: 'ahead', along: 130, halfW: 10 }])?.kind).toBe('hit');
  });
  it('1回の一閃に1回だけ・前へ進んでいないフレームでは止めない', () => {
    const h = firedKatanaDashHold(H(), 1100, 117, 'z');
    expect(pickKatanaDashHold(h, 50, 64, [{ id: 'z', along: 60, halfW: 10 }])).toBeNull();
    expect(pickKatanaDashHold(H(), 50, 50, [{ id: 'z', along: 50, halfW: 10 }])).toBeNull();
  });
  it('止めの間だけ走らない', () => {
    const h = firedKatanaDashHold(H(), 1100, 117);
    expect(katanaDashHeld(H(), 1100)).toBe(false);
    expect(katanaDashHeld(h, 1099)).toBe(false);
    expect(katanaDashHeld(h, 1100)).toBe(true);
    expect(katanaDashHeld(h, 1216)).toBe(true);
    expect(katanaDashHeld(h, 1217)).toBe(false);
    expect(katanaDashHeld(undefined, 1100)).toBe(false);
  });
  it('走り終わり・着地の硬直・居合一閃の走りの間を止めた分だけ延ばす(走る時間の合計=距離は同じ)', () => {
    expect(katanaDashHoldExtend({ katanaDashUntil: 1180, katanaRecoveryUntil: 1380 }, 1100, 117))
      .toEqual({ katanaDashUntil: 1297, katanaRecoveryUntil: 1497 });
    expect(katanaDashHoldExtend({ katanaDashUntil: 1180, katanaRecoveryUntil: 1380, iaiRunUntil: 1180 }, 1100, 117).iaiRunUntil).toBe(1297);
    expect(katanaDashHoldExtend({ katanaDashUntil: 1180, katanaRecoveryUntil: 1380, iaiRunUntil: 900 }, 1100, 117).iaiRunUntil).toBeUndefined();
  });
  it('燕返し(体は動かない): 仮定の通り道の位置は時計から出す=止めの間は進まない・明けたら続きから・全長で止まる・一閃は 0', () => {
    const h = makeTsubameDashHold(1000, { x: 0, y: 0 }, -1, 0, 140, 160, 'fx');
    expect(h.runMs).toBe(160);
    expect(makeKatanaDashHold(1000, { x: 0, y: 0 }, 1, 0, 154).runMs).toBeUndefined();
    expect(katanaDashVirtualAlong(h, 1000)).toBe(0);
    expect(katanaDashVirtualAlong(h, 1080)).toBeCloseTo(70, 6);
    const f = firedKatanaDashHold(h, 1080, 117, 'z');
    expect(katanaDashVirtualAlong(f, 1150)).toBeCloseTo(70, 6); // 止めの間
    expect(katanaDashVirtualAlong(f, 1197)).toBeCloseTo(70, 6); // 明けた瞬間
    expect(katanaDashVirtualAlong(f, 1237)).toBeCloseTo(105, 6); // 続きから同じ速さ
    expect(katanaDashVirtualAlong(f, 1080 + 117 + 80 + 50)).toBe(140); // 走る時間の合計=160ms で全長(距離は同じ)
    expect(katanaDashVirtualAlong(H(), 1100)).toBe(0);
    // 止めの判定は一閃と同じ純関数(仮定の位置を渡す)。
    expect(pickKatanaDashHold(h, katanaDashVirtualAlong(h, 1070), katanaDashVirtualAlong(h, 1080), [{ id: 'z', along: 70, halfW: 10 }]))
      .toEqual({ kind: 'hit', enemyId: 'z', ms: KATANA_DASH_HIT_HOLD_MS });
  });
  it('燕返しのしゃがみも止めた分だけ延ばす(しゃがんでいる時だけ)', () => {
    expect(katanaDashHoldExtend({ katanaDashUntil: 1160, katanaRecoveryUntil: 1360, tsubameCrouchUntil: 1160 }, 1080, 117).tsubameCrouchUntil).toBe(1277);
    expect(katanaDashHoldExtend({ katanaDashUntil: 1160, katanaRecoveryUntil: 1360, tsubameCrouchUntil: 900 }, 1080, 117).tsubameCrouchUntil).toBeUndefined();
  });
});
