import { describe, it, expect } from 'vitest';
import {
  BRAWLER_FINISH_STOP, brawlerFinishStopMs, brawlerFinishShakeMs, brawlerFinishShakeAmp, brawlerStageFinishMove, brawlerKickFinishMove, brawlerShakeAmpMul,
  brawlerInputDebtMs, brawlerFireDebtMs, brawlerFinishLockExtMs, brawlerFinishKbCapPx,
} from './brawlerFinishStop';

describe('格闘の決め技の止めと震えの係数の表(research/HITSTOP.md §7)', () => {
  it('表は §7 の叩き台のとおり', () => {
    expect(BRAWLER_FINISH_STOP).toEqual({
      secretLand: { stop: 2.0, shakeLen: 1.5, shakeAmp: 1 },
      gouge: { stop: 1.8, shakeLen: 1.8, shakeAmp: 1.6 },
      stomp: { stop: 1.5, shakeLen: 1.2, shakeAmp: 1 },
      heel: { stop: 1.5, shakeLen: 1.2, shakeAmp: 1 },
      kick3: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
      palm: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
      airThrow: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
      suplex: { stop: 1.6, shakeLen: 1.3, shakeAmp: 1 },
    });
    // 決め技は今より長く止める(短くする技は無い)。震えは止めより長くしない。
    for (const k of Object.values(BRAWLER_FINISH_STOP)) {
      expect(k.stop).toBeGreaterThan(1);
      expect(k.shakeLen).toBeGreaterThanOrEqual(1);
      expect(k.shakeLen).toBeLessThanOrEqual(k.stop);
      expect(k.shakeAmp).toBeGreaterThanOrEqual(1);
    }
  });
  it('止めの長さ: 決め技は今 × 係数(整数)・決め技でなければ今のまま・0 は 0', () => {
    expect(brawlerFinishStopMs(260, 'secretLand')).toBe(520);
    expect(brawlerFinishStopMs(180, 'gouge')).toBe(324);
    expect(brawlerFinishStopMs(260, 'stomp')).toBe(390);
    expect(brawlerFinishStopMs(340, 'kick3')).toBe(544);
    expect(brawlerFinishStopMs(260, 'palm')).toBe(416);
    expect(brawlerFinishStopMs(260, null)).toBe(260);
    expect(brawlerFinishStopMs(110)).toBe(110);
    expect(brawlerFinishStopMs(0, 'gouge')).toBe(0);
  });
  it('震えの長さ: 今の止め × 震えの係数(伸ばした止めから戻して掛ける)・決め技でなければ止めと同じ', () => {
    expect(brawlerFinishShakeMs(brawlerFinishStopMs(260, 'secretLand'), 'secretLand')).toBe(390);
    expect(brawlerFinishShakeMs(brawlerFinishStopMs(180, 'gouge'), 'gouge')).toBe(324);
    expect(brawlerFinishShakeMs(brawlerFinishStopMs(260, 'stomp'), 'stomp')).toBe(312);
    expect(brawlerFinishShakeMs(brawlerFinishStopMs(340, 'kick3'), 'kick3')).toBe(442);
    expect(brawlerFinishShakeMs(150, undefined)).toBe(150);
    expect(brawlerFinishShakeMs(0, 'gouge')).toBe(0);
  });
  it('震えの幅: 抉り打ちだけ ×1.6', () => {
    expect(brawlerFinishShakeAmp('gouge')).toBe(1.6);
    expect(brawlerFinishShakeAmp('stomp')).toBe(1);
    expect(brawlerFinishShakeAmp(undefined)).toBe(1);
  });
  it('通常の段は5段目だけ・飛び蹴りは3発目(蹴り飛ばし・踵落とし)だけ。蹴り上げ(掴む蹴り上げを含む)・1・2発目は決め技でない', () => {
    expect([1, 2, 3, 4, 5].map(brawlerStageFinishMove)).toEqual([null, null, null, null, 'palm']);
    expect(brawlerKickFinishMove(false, false, false)).toBeNull(); // 1・2発目
    expect(brawlerKickFinishMove(false, false, true)).toBeNull(); //  蹴り上げ
    expect(brawlerKickFinishMove(true, false, true)).toBeNull(); //   3発目の位置の蹴り上げ
    expect(brawlerKickFinishMove(true, true, false)).toBe('heel');
    expect(brawlerKickFinishMove(true, false, false)).toBe('kick3');
  });
  it('幅の印は今の震えと同じ明けの時だけ効く(後から書かれた別の震えでは 1)', () => {
    expect(brawlerShakeAmpMul({ brawlerShakeUntil: 100, brawlerShakeAmp: 1.6, brawlerShakeAmpUntil: 100 })).toBe(1.6);
    expect(brawlerShakeAmpMul({ brawlerShakeUntil: 140, brawlerShakeAmp: 1.6, brawlerShakeAmpUntil: 100 })).toBe(1);
    expect(brawlerShakeAmpMul({ brawlerShakeUntil: 100 })).toBe(1);
  });
});

describe('延長の分を受付と相手の固まりの時計から外す(案C)', () => {
  // 止め 1000〜1391(延長 130=今の止めの明けは 1261)。
  const st = { phase: 'tech' as const, startAt: 800, stopUntil: 1391, stopExt: { ms: 130, until: 1391 } };
  it('入力を送る長さ: 延長の最中だけ延長の分・今の止めの最中と止めの後は 0・待機は 0・印が今の止めと違えば 0', () => {
    expect(brawlerInputDebtMs(st, 1200)).toBe(0);
    expect(brawlerInputDebtMs(st, 1261)).toBe(130);
    expect(brawlerInputDebtMs(st, 1390)).toBe(130);
    expect(brawlerInputDebtMs(st, 1391)).toBe(0);
    expect(brawlerInputDebtMs({ ...st, phase: 'idle' }, 1300)).toBe(0);
    expect(brawlerInputDebtMs({ ...st, stopExt: { ms: 130, until: 999 } }, 1300)).toBe(0);
  });
  it('延長で遅れて始まった行動の最中は、その遅れの分(行動が替われば外れる)', () => {
    const a = { phase: 'tech' as const, startAt: 1400, stopUntil: 0, extDebt: { ms: 130, startAt: 1400 } };
    expect(brawlerInputDebtMs(a, 1500)).toBe(130);
    expect(brawlerInputDebtMs({ ...a, startAt: 1600 }, 1650)).toBe(0);
  });
  it('覚えた技の遅れ: 今の止めの明けより前に覚えた=延長の分・延長の最中に覚えた=覚えた時刻から先の分・延長の無い止め=0', () => {
    expect(brawlerFireDebtMs({ ...st, techBufferAt: 1100 }, 1400)).toBe(130);
    expect(brawlerFireDebtMs({ ...st, techBufferAt: 1300 }, 1400)).toBe(100);
    expect(brawlerFireDebtMs({ phase: 'tech', startAt: 800, stopUntil: 1391, techBufferAt: 1100 }, 1400)).toBe(0);
    // 前の行動の遅れも持ち越す(早く覚えていた時)
    expect(brawlerFireDebtMs({ phase: 'tech', startAt: 1400, stopUntil: 0, extDebt: { ms: 130, startAt: 1400 }, techBufferAt: 1450 }, 1700)).toBe(130);
  });
  it('固まりに足す延長: フレームの幅に切り上げ(止めの明けの最初のフレームまで届く)', () => {
    expect(brawlerFinishLockExtMs(130, 16)).toBe(144);
    expect(brawlerFinishLockExtMs(128, 16)).toBe(128);
    expect(brawlerFinishLockExtMs(130, 0)).toBe(130);
    expect(brawlerFinishLockExtMs(0, 16)).toBe(0);
  });
  it('押しの上限: 延長が無い時に同じフレームの幅で動いた距離(連続の積分 v×長さ÷2 を超えない)・幅が分からなければ上限なし', () => {
    const cap = brawlerFinishKbCapPx(532, 260, 16, 280);
    expect(cap).toBeGreaterThan(60);
    expect(cap).toBeLessThanOrEqual(532 * 0.28 / 2);
    expect(brawlerFinishKbCapPx(532, 260, 0, 280)).toBe(Infinity);
  });
});
