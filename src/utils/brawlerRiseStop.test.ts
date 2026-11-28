// ★止めの間は打ち上げも上がり始めない(社長指示2026-11-27「上がる方も止めて」・utils/brawlerCombo brawlerStopLiftShift)。
// 打ち上げ直後の止めの間は高さが変わらず、明けてから同じ弧で上がる。当たる高さの帯(utils/brawlerHitHeight)と空中か地上かの判定は、遅らせる前の弧の時計で見る。
import { describe, it, expect } from 'vitest';
import {
  brawlerStopLiftShift, brawlerShiftLift, brawlerJuggleHeightRel, brawlerRiseStopMs, brawlerJudgedAirborne, brawlerAirborne, brawlerJugglePush,
  type BrawlerJuggleFields,
} from './brawlerCombo';
import { brawlerEnemyHitRel } from './brawlerHitHeight';

const NOW = 1_000_000;
const STOP = 180;
/** 地上の雑魚を4段目で打ち上げた弧(この当たりで書いた弧)。 */
const launch = (): BrawlerJuggleFields & { liftUntil?: number } => brawlerJugglePush({}, 'mob', 's4', NOW)! as BrawlerJuggleFields & { liftUntil?: number };

describe('打ち上げの止め(brawlerStopLiftShift)', () => {
  it('打ち上げ直後の止めの間は高さが変わらず、明けてから同じ弧で上がる', () => {
    const e0 = launch();
    const sh = brawlerStopLiftShift(e0, NOW, undefined, NOW + STOP)!;
    expect(sh).not.toBeNull();
    const e = { ...e0, ...sh };
    expect(e.brawlerLiftAt).toBe(NOW + STOP);
    expect(e.brLiftUntil).toBe(e0.brLiftUntil! + STOP);
    expect(e.liftUntil).toBe(e0.liftUntil! + STOP);
    // 止めの間: 地面の高さのまま
    for (let t = NOW; t <= NOW + STOP; t += 16) expect(brawlerJuggleHeightRel(e, t)).toBe(0);
    // 明けてから: 止めなかった弧を止めの長さだけ遅らせたものと同じ(同じ弧)
    for (let k = 1; k < 40; k++) {
      const dt = k * 16;
      expect(brawlerJuggleHeightRel(e, NOW + STOP + dt)).toBeCloseTo(brawlerJuggleHeightRel(e0, NOW + dt), 12);
    }
    expect(brawlerJuggleHeightRel(e, NOW + STOP + 16)).toBeGreaterThan(0);
    // 遅らせた長さを残す(この弧の名札=遅らせた後の始まり)
    expect(brawlerRiseStopMs(e)).toBe(STOP);
  });
  it('空中の浮き直し(今の高さから上がる弧)も止めの間はその高さのまま', () => {
    const air = { ...launch() };
    const t1 = NOW + 200;
    const re = brawlerJugglePush(air, 'mob', 's1', t1)!;
    const e0 = { ...air, ...re };
    const h0 = brawlerJuggleHeightRel(e0, t1);
    expect(h0).toBeGreaterThan(0);
    const e = { ...e0, ...brawlerStopLiftShift(e0, t1, undefined, t1 + STOP)! };
    for (let t = t1; t <= t1 + STOP; t += 16) expect(brawlerJuggleHeightRel(e, t)).toBeCloseTo(h0, 12);
    expect(brawlerJuggleHeightRel(e, t1 + STOP + 48)).toBeCloseTo(brawlerJuggleHeightRel(e0, t1 + 48), 12);
  });
  it('当たる高さの帯と空中か地上かは、遅らせる前の弧の時計で見る(絵は遅れる)', () => {
    const e0 = launch();
    const e = { ...e0, ...brawlerStopLiftShift(e0, NOW, undefined, NOW + STOP)! };
    for (const dt of [0, 50, 120, 300, 500]) expect(brawlerEnemyHitRel(e, NOW + dt)).toBeCloseTo(brawlerEnemyHitRel(e0, NOW + dt), 12);
    // 止めの前の弧が着地した後、絵はまだ宙(止めの分だけ遅れて着地)・判定は地上
    const t = e0.brLiftUntil! + 10;
    expect(brawlerAirborne(e, t)).toBe(true);
    expect(brawlerJudgedAirborne(e, t)).toBe(false);
    expect(brawlerJudgedAirborne(e, e0.brLiftUntil! - 10)).toBe(true);
  });
  it('止めで遅らせた後、前の止めの中で当たり直した(弧を書き直さない)時は延びた分だけずらし、遅らせた長さにも足す', () => {
    const e0 = launch();
    const e1 = { ...e0, ...brawlerStopLiftShift(e0, NOW, undefined, NOW + STOP)! };
    const t = NOW + 50;
    const sh = brawlerStopLiftShift(e1, t, NOW + STOP, t + STOP)!; // 明けが NOW+STOP → t+STOP へ=延びたのは 50
    expect(sh.brawlerLiftAt).toBe(NOW + STOP + 50);
    expect(brawlerRiseStopMs({ ...e1, ...sh })).toBe(STOP + 50);
  });
  it('新しい弧を書いたら(brawlerLiftAt が変わったら)遅らせた長さは無効', () => {
    const e0 = launch();
    const e1 = { ...e0, ...brawlerStopLiftShift(e0, NOW, undefined, NOW + STOP)! };
    const e2 = { ...e1, ...brawlerJugglePush(e1, 'mob', 's1', NOW + 400)! };
    expect(brawlerRiseStopMs(e2)).toBe(0);
  });
  it('時計をずらす所(空中投げの時間停止など)は名札も同じだけずらす=遅らせた長さはそのまま', () => {
    const e0 = launch();
    const e1 = { ...e0, ...brawlerStopLiftShift(e0, NOW, undefined, NOW + STOP)! };
    const e2 = { ...e1, ...brawlerShiftLift(e1, NOW + 300, 400)! };
    expect(brawlerRiseStopMs(e2)).toBe(STOP);
    expect(brawlerEnemyHitRel(e2, NOW + 300 + 400 + 30)).toBeCloseTo(brawlerEnemyHitRel(e1, NOW + 300 + 30), 12);
  });
  it('叩き落とし(上へ浮かせない弧)は今どおり止めの全部ずらすが、遅らせた長さは残さない', () => {
    const air = { ...launch() };
    const t1 = NOW + 250;
    const dn = brawlerJugglePush({ ...air, brLiftBudget: 0 }, 'mob', 's1', t1)!; // 予算切れ=ダウン
    expect(dn.brLiftDown).toBe(true);
    const e0 = { ...air, ...dn };
    const sh = brawlerStopLiftShift(e0, t1, undefined, t1 + STOP)!;
    expect(sh.brawlerLiftAt).toBe(t1 + STOP);
    expect(brawlerRiseStopMs({ ...e0, ...sh })).toBe(0);
  });
});
