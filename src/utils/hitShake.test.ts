import { describe, it, expect } from 'vitest';
import {
  HIT_SHAKE_AIR_MIN_PX, HIT_SHAKE_ZOOM_MAX_MUL, HITSTOP_CREEP_RATE, HITSTOP_MOVE_K,
  enemyDrawLiftPx, isDrawnAirborne, hitShakeZoomMul, hitShakeOffset, meleeShakePatch, extendMeleeShake, isMeleeShake,
  applyHitstopK, comboStageMoveKind, katanaMoveKind, creepDrawSince, WHIP_TIP_SHAKE,
} from './hitShake';
import { whipTipHitApplies, whipTipDamageMult, WHIP_TIP_BOSS_MULT, WHIP_TIP_MOB_MULT, WHIP_TIP_FRAC } from './whipSwing';
import { brawlerShakeWave } from './enemyAirPose';
import { computeViewport } from './viewport';
import { stretchStopMs, KATANA_SELF_STOP_MS } from './meleeHitstopTiming';
import { knifeComboHitStop, KNIFE_COMBO_FEEL, KNIFE_COMBO_CRIT_STOP_MS } from './knifeCombo';
import { whipComboHitStop, WHIP_COMBO_FEEL, WHIP_COMBO_CRIT_SELF_STOP_MS } from './whipCombo';

describe('震えの向きと幅(地上=横だけ・空中=当てた向き)', () => {
  const amp = 3;
  const dx = 0.6, dy = 0.8;
  it('地上の敵は向きの横成分だけ・縦は0', () => {
    const o = hitShakeOffset(amp, dx, dy, false);
    expect(o.x).toBeCloseTo(amp * dx, 9);
    expect(o.y).toBe(0);
  });
  it('空中の敵は当てた向きのまま(縦にも震える)', () => {
    const o = hitShakeOffset(amp, dx, dy, true);
    expect(o.x).toBeCloseTo(amp * dx, 9);
    expect(o.y).toBeCloseTo(amp * dy, 9);
  });
  it('ズームの倍率を幅に掛ける', () => {
    const o = hitShakeOffset(amp, 1, 0, false, 2);
    expect(o.x).toBeCloseTo(6, 9);
  });
  it('震えの包絡は最初が大きく、止めの明け(残り0)で0に収まる', () => {
    const env = (left: number) => Math.max(...[0, 18, 36, 54].map(t => Math.abs(brawlerShakeWave(left, t))));
    expect(env(120)).toBeGreaterThan(env(20));
    expect(brawlerShakeWave(0, 50)).toBe(0);
    expect(brawlerShakeWave(-5, 50)).toBe(0);
  });
});

describe('空中の判定(描画の持ち上げの合計 > 2px)', () => {
  it('合計は内訳の和(描画の位置と同じ値)', () => {
    expect(enemyDrawLiftPx({ finishLiftPx: 1, brLiftPx: 2.5, whipFlyLiftPx: 3 })).toBeCloseTo(6.5, 9);
  });
  it('2px を超えたら空中・2px 以下は地上', () => {
    expect(isDrawnAirborne(0)).toBe(false);
    expect(isDrawnAirborne(HIT_SHAKE_AIR_MIN_PX)).toBe(false);
    expect(isDrawnAirborne(HIT_SHAKE_AIR_MIN_PX + 0.01)).toBe(true);
    // どの高さで浮いていても(格闘の浮き・とどめの跳ね・鞭で飛ぶ)同じ規則
    expect(isDrawnAirborne(enemyDrawLiftPx({ finishLiftPx: 0, brLiftPx: 0, whipFlyLiftPx: 10 }))).toBe(true);
    expect(isDrawnAirborne(enemyDrawLiftPx({ finishLiftPx: 18, brLiftPx: 0, whipFlyLiftPx: 0 }))).toBe(true);
  });
});

describe('ズームの倍率(引いた時だけ大きく・上限×2.5・端末で変わらない)', () => {
  it('基準(1)以上は ×1(寄っても小さくしない)', () => {
    expect(hitShakeZoomMul(1)).toBe(1);
    expect(hitShakeZoomMul(1.05)).toBe(1);
    expect(hitShakeZoomMul(2)).toBe(1);
  });
  it('引いている時は ×1/倍率・上限 ×2.5', () => {
    expect(hitShakeZoomMul(0.5)).toBeCloseTo(2, 9);
    expect(hitShakeZoomMul(0.8)).toBeCloseTo(1.25, 9);
    expect(hitShakeZoomMul(0.4)).toBeCloseTo(HIT_SHAKE_ZOOM_MAX_MUL, 9);
    expect(hitShakeZoomMul(0.2)).toBe(HIT_SHAKE_ZOOM_MAX_MUL);
  });
  it('壊れた値は ×1', () => {
    expect(hitShakeZoomMul(0)).toBe(1);
    expect(hitShakeZoomMul(NaN)).toBe(1);
  });
  it('スマホの寸法でも PC の横長でも、同じ worldGroup の倍率なら同じ結果(端末の見える範囲は stage の倍率で、式に入らない)', () => {
    const phones = [computeViewport(430, 932), computeViewport(375, 667)];
    const pcs = [computeViewport(1280, 720), computeViewport(1920, 1080), computeViewport(1440, 900)];
    for (const z of [1, 1.05, 0.85, 0.6, 0.45, 0.4]) {
      const ref = hitShakeZoomMul(z);
      for (const vp of [...phones, ...pcs]) {
        expect(vp.scale).toBeGreaterThan(0); // 端末ごとに違う(式は読まない)
        expect(hitShakeZoomMul(z)).toBe(ref);
      }
    }
    // スマホの普段(等倍・手放しの寄り)では今の幅のまま
    expect(hitShakeZoomMul(1)).toBe(1);
  });
});

describe('近接の震えの欄', () => {
  it('止めの明けまで・自分→敵の向き・絵の欄だけ(位置・当たり箱の欄は書かない)', () => {
    const p = meleeShakePatch(undefined, 1120, 1000, 30, 40, 0, 0)!;
    expect(p.brawlerShakeUntil).toBe(1120);
    expect(p.meleeShakeUntil).toBe(1120);
    expect(p.brawlerShakeDx).toBeCloseTo(0.6, 9);
    expect(p.brawlerShakeDy).toBeCloseTo(0.8, 9);
    expect(Object.keys(p).sort()).toEqual(['brawlerShakeDx', 'brawlerShakeDy', 'brawlerShakeUntil', 'meleeShakeAmp', 'meleeShakeUntil']);
    expect(isMeleeShake(p)).toBe(true);
  });
  it('止めが明けている(書かれなかった)なら震えない', () => {
    expect(meleeShakePatch(undefined, undefined, 1000, 1, 0, 0, 0)).toBeNull();
    expect(meleeShakePatch(undefined, 1000, 1000, 1, 0, 0, 0)).toBeNull();
  });
  it('走っている震えより短くしない・重なっていれば横', () => {
    const p = meleeShakePatch(1300, 1100, 1000, 5, 5, 5, 5)!;
    expect(p.brawlerShakeUntil).toBe(1300);
    expect(p.brawlerShakeDx).toBe(1); expect(p.brawlerShakeDy).toBe(0);
  });
  it('格闘・空中の弾の震え(印なし)は近接の決まりを使わない', () => {
    expect(isMeleeShake({ brawlerShakeUntil: 1200 })).toBe(false);
    expect(isMeleeShake({ brawlerShakeUntil: 1300, meleeShakeUntil: 1200 })).toBe(false); // 後から格闘が書き直した
  });
  it('まとめ当てで止めが延びたら震えも延びる(近接の震えだけ)', () => {
    expect(extendMeleeShake({ brawlerShakeUntil: 1100, meleeShakeUntil: 1100, hitStunUntil: 1180 }, 1000)).toEqual({ brawlerShakeUntil: 1180, meleeShakeUntil: 1180 });
    expect(extendMeleeShake({ brawlerShakeUntil: 1100, hitStunUntil: 1180 }, 1000)).toBeNull();
    expect(extendMeleeShake({ brawlerShakeUntil: 1100, meleeShakeUntil: 1100, hitStunUntil: 1050 }, 1000)).toBeNull();
    expect(extendMeleeShake({ brawlerShakeUntil: 900, meleeShakeUntil: 900, hitStunUntil: 1180 }, 1000)).toBeNull();
  });
});

describe('止めの長さの係数(表と掛ける順)', () => {
  it('表(叩き台)', () => {
    expect(HITSTOP_MOVE_K).toEqual({ light: 0.8, normal: 1.0, finisher: 1.3, whipTip: 1.6 });
    expect(comboStageMoveKind(1)).toBe('light');
    expect(comboStageMoveKind(2)).toBe('normal');
    expect(comboStageMoveKind(3)).toBe('finisher');
    expect(comboStageMoveKind(0)).toBe('normal');
    expect(katanaMoveKind('issen')).toBe('finisher');
    expect(katanaMoveKind('tsubame')).toBe('finisher');
    expect(katanaMoveKind('swing')).toBe('normal');
    expect(katanaMoveKind('satsujin')).toBe('normal');
  });
  it('×MELEE_HITSTOP_STRETCH の後に係数・上乗せはその後に足す', () => {
    // 60 → ×1.5=90 → ×0.8=72 → +40
    expect(applyHitstopK(stretchStopMs(60), 'light', 40)).toBe(72 + 40);
    expect(applyHitstopK(stretchStopMs(60), 'normal')).toBe(90);
    expect(applyHitstopK(0, 'whipTip', 10)).toBe(10);
  });
  it('ナイフの段の止め(敵・自分)に係数が掛かる', () => {
    expect(knifeComboHitStop(1, false).enemyMs).toBe(Math.round(stretchStopMs(KNIFE_COMBO_FEEL[1].stopMs) * 0.8));
    expect(knifeComboHitStop(2, false).enemyMs).toBe(stretchStopMs(KNIFE_COMBO_FEEL[2].stopMs));
    expect(knifeComboHitStop(3, false).selfMs).toBe(Math.round(stretchStopMs(KNIFE_COMBO_FEEL[3].selfStopMs) * 1.3));
    // 会心は係数の後に足す(係数で増減しない)
    expect(knifeComboHitStop(3, true).enemyMs - knifeComboHitStop(3, false).enemyMs).toBe(KNIFE_COMBO_CRIT_STOP_MS);
  });
  it('鞭の先端の当たりは段に依らず 1.6', () => {
    for (const st of [1, 2, 3]) {
      expect(whipComboHitStop(st, false, true).selfMs).toBe(Math.round(stretchStopMs(WHIP_COMBO_FEEL[st as 1 | 2 | 3].selfStopMs) * 1.6));
    }
    expect(whipComboHitStop(1, true, true).selfMs - whipComboHitStop(1, false, true).selfMs).toBe(WHIP_COMBO_CRIT_SELF_STOP_MS);
    expect(whipComboHitStop(2, false).enemyMs).toBe(stretchStopMs(WHIP_COMBO_FEEL[2].stopMs));
  });
  it('刀の自分の止め: 一閃は ×1.3', () => {
    expect(applyHitstopK(KATANA_SELF_STOP_MS, katanaMoveKind('issen'))).toBe(Math.round(KATANA_SELF_STOP_MS * 1.3));
    expect(applyHitstopK(KATANA_SELF_STOP_MS, katanaMoveKind('swing'))).toBe(KATANA_SELF_STOP_MS);
  });
});

describe('刃先・鞭の先のじわ進みの絵の時計(明けで跳ばない)', () => {
  const stop = 100, ms = 120;
  it('止めの前はそのまま', () => {
    expect(creepDrawSince(50, stop, ms)).toBe(50);
    expect(creepDrawSince(stop, stop, ms)).toBe(stop);
  });
  it('止めの間は等速の6%で進む', () => {
    expect(creepDrawSince(stop + 60, stop, ms)).toBeCloseTo(stop + 60 * HITSTOP_CREEP_RATE, 9);
    expect(HITSTOP_CREEP_RATE).toBe(0.06);
  });
  it('明けの前後で値が連続(跳ばない)・明けた後は「今−止めの長さ+止めの長さ×6%」で等速', () => {
    const a = creepDrawSince(stop + ms - 0.001, stop, ms), b = creepDrawSince(stop + ms + 0.001, stop, ms);
    expect(Math.abs(b - a)).toBeLessThan(0.01);
    expect(creepDrawSince(stop + ms + 50, stop, ms)).toBeCloseTo(stop + ms + 50 - ms + ms * 0.06, 9);
    // 1フレーム(16ms)ごとの進みは、止めの間は小さく・明けた後は等速
    expect(creepDrawSince(stop + 32, stop, ms) - creepDrawSince(stop + 16, stop, ms)).toBeCloseTo(16 * 0.06, 9);
    expect(creepDrawSince(stop + ms + 32, stop, ms) - creepDrawSince(stop + ms + 16, stop, ms)).toBeCloseTo(16, 9);
  });
  it('単調に増える(戻らない)', () => {
    let prev = -1;
    for (let t = 0; t < 400; t += 4) { const v = creepDrawSince(t, stop, ms); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
  it('止めが無い時はそのまま', () => {
    expect(creepDrawSince(250, -1, ms)).toBe(250);
    expect(creepDrawSince(250, stop, 0)).toBe(250);
  });
  it('画面全体の止めの間は凍った時計を渡す=何も進まない', () => {
    const frozen = stop + 30;
    expect(creepDrawSince(frozen, stop, ms)).toBe(creepDrawSince(frozen, stop, ms));
  });
});

describe('鞭の先端の当たり(区分を問わない・止めと揺れを長く・ダメージは今のまま)', () => {
  const reach = 200;
  it('先端の判定は雑魚・強個体・ボスで同じ(外側25%)・本人の振りだけ・幻影は外す', () => {
    expect(whipTipHitApplies(reach * WHIP_TIP_FRAC, reach, false)).toBe(true);
    expect(whipTipHitApplies(reach * WHIP_TIP_FRAC - 1, reach, false)).toBe(false);
    expect(whipTipHitApplies(190, undefined, false)).toBe(false);
    expect(whipTipHitApplies(190, reach, true)).toBe(false);
  });
  it('ダメージ: 雑魚の先端は ×4・雑魚の根元は ×1・ボスの先端は ×5(今のまま)', () => {
    expect(whipTipDamageMult(true, false)).toBe(4);
    expect(WHIP_TIP_MOB_MULT).toBe(4);
    expect(whipTipDamageMult(false, false)).toBe(1);
    expect(whipTipDamageMult(true, true)).toBe(5);
    expect(WHIP_TIP_BOSS_MULT).toBe(5);
    expect(whipTipDamageMult(false, true)).toBe(1);
    expect(whipTipDamageMult(false, false)).toBe(1);
  });
  it('先端の揺れ: 長さ ×1.5・幅 ×1.3(根元は ×1)', () => {
    expect(WHIP_TIP_SHAKE).toEqual({ lenMul: 1.5, ampMul: 1.3 });
    const tip = meleeShakePatch(undefined, 1100, 1000, 10, 0, 0, 0, WHIP_TIP_SHAKE)!;
    const root = meleeShakePatch(undefined, 1100, 1000, 10, 0, 0, 0)!;
    expect(tip.brawlerShakeUntil).toBe(1150);
    expect(root.brawlerShakeUntil).toBe(1100);
    expect(tip.meleeShakeAmp).toBe(1.3);
    expect(root.meleeShakeAmp).toBe(1);
    expect(hitShakeOffset(2, 1, 0, false, 1, 1.3).x).toBeCloseTo(2.6, 9);
    expect(extendMeleeShake({ ...tip, hitStunUntil: 1200 }, 1000, 1.5)).toEqual({ brawlerShakeUntil: 1300, meleeShakeUntil: 1300 });
  });
});
