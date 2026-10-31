// research/NEW_GUNS.md §4(スキャンセンサー)の純関数。§7-6「テストで固定する約束」のうち純関数で言えるもの。
import { describe, it, expect } from 'vitest';
import {
  SCAN_BEAT_MS, SCAN_MARK_MS, SCAN_SWEEP_MS,
  scanBeatIndex, scanBeatPhase, isScanMarked, scanMarkRemainFrac, scanMarkMeleeMult, pickScanMarkTarget,
  scanMarkMeleeCritBonus, scanMarkMeleePostureMult, scanFanSweepFrac, scanMarkUntilFrom,
  SCAN_FAN_GROUND_Y_SCALE, SCAN_FAN_LENGTH_PX, SCAN_FAN_HALF_ANGLE_RAD, scanFanGroundAngle, scanFanScreenPoint,
  scanFanContains, pickScanFanHits, isEliteHeavyStun,
} from './scanSensor';
import type { EnemyType } from '../types/game';

const mob = (until?: number) => ({ type: 'zombie' as EnemyType, scanMarkUntil: until });
const boss = (until?: number) => ({ type: 'mimir' as EnemyType, scanMarkUntil: until });

describe('拍', () => {
  it('1.2秒ごとに番号が変わる(持ち替えと関係ない=gameTimeだけで決まる)', () => {
    expect(scanBeatIndex(0)).toBe(0);
    expect(scanBeatIndex(SCAN_BEAT_MS - 1)).toBe(0);
    expect(scanBeatIndex(SCAN_BEAT_MS)).toBe(1);
    expect(scanBeatIndex(SCAN_BEAT_MS * 5 + 3)).toBe(5);
  });
  it('拍の中の位置は 0..1', () => {
    expect(scanBeatPhase(0)).toBe(0);
    expect(scanBeatPhase(SCAN_BEAT_MS / 2)).toBeCloseTo(0.5);
    expect(scanBeatPhase(SCAN_BEAT_MS * 3 + SCAN_BEAT_MS / 4)).toBeCloseTo(0.25);
  });
});

describe('扇の掃き(慣性)', () => {
  it('0→1 へ単調に進み、0.25秒で掃き終わる', () => {
    const fan = { startAt: 1000 };
    let prev = -1;
    for (let t = 0; t <= SCAN_SWEEP_MS; t += 10) {
      const f = scanFanSweepFrac(fan, 1000 + t);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(scanFanSweepFrac(fan, 1000)).toBe(0);
    expect(scanFanSweepFrac(fan, 1000 + SCAN_SWEEP_MS)).toBe(1);
  });
  it('等速ではない(出だしと終わりがゆっくり=加速→減速)', () => {
    const fan = { startAt: 0 };
    const early = scanFanSweepFrac(fan, SCAN_SWEEP_MS * 0.1);
    const mid = scanFanSweepFrac(fan, SCAN_SWEEP_MS * 0.5) - scanFanSweepFrac(fan, SCAN_SWEEP_MS * 0.4);
    expect(early).toBeLessThan(0.1);
    expect(mid).toBeGreaterThan(0.1);
  });
});

describe('印の期限', () => {
  it('付けた時から3秒。入り直せば「今から3秒」に戻る(重ねても伸びない)', () => {
    expect(scanMarkUntilFrom(500)).toBe(500 + SCAN_MARK_MS);
    expect(isScanMarked(mob(3500), 3499)).toBe(true);
    expect(isScanMarked(mob(3500), 3500)).toBe(false);
    expect(isScanMarked(mob(undefined), 0)).toBe(false);
    expect(scanMarkRemainFrac(mob(3000), 1500)).toBeCloseTo(0.5);
  });
});

describe('§4-2 近接の印の倍率は重ねの数で決まる(ナイフの段・Lvの区別は無い)', () => {
  it('雑魚: 1重ね×1.6〜5重ね×7.2 / ボス級は雑魚の1.7倍 / 刀は近接の3.1/2.75倍 / 鞭は近接と同じ', () => {
    const st = (n: number, b = false) => ({ ...(b ? boss(10) : mob(10)), scanStacks: n });
    expect(scanMarkMeleeMult(st(1), 0, 'melee')).toBeCloseTo(1.6);
    expect(scanMarkMeleeMult(st(5), 0, 'melee')).toBeCloseTo(7.2);
    expect(scanMarkMeleeMult(st(5, true), 0, 'melee')).toBeCloseTo(7.2 * 1.7);
    expect(scanMarkMeleeMult(st(3), 0, 'katana')).toBeCloseTo(4.0 * 3.1 / 2.75);
    expect(scanMarkMeleeMult(st(2), 0, 'whip')).toBeCloseTo(2.8);
  });
  it('溜めるほど得(叩くと使い切るので、重ね1つあたりの上乗せが重ねるほど大きい)', () => {
    const st = (n: number, b = false) => ({ ...(b ? boss(10) : mob(10)), scanStacks: n });
    for (const b of [false, true]) {
      for (let n = 1; n < 5; n++) {
        const per = (k: number) => (scanMarkMeleeMult(st(k, b), 0, 'melee') - 1) / k;
        expect(per(n + 1)).toBeGreaterThan(per(n));
      }
    }
  });
  it('印が切れていれば ×1', () => {
    expect(scanMarkMeleeMult(mob(10), 10, 'melee')).toBe(1);
    expect(scanMarkMeleeMult(mob(undefined), 0, 'katana')).toBe(1);
  });
});

describe('§7-6 1振りで倍率が効くのは1体だけ', () => {
  it('印付きの中で一番近い1体だけを返す(印の無い近い敵は選ばない)', () => {
    const list = [
      { id: 'near-unmarked', scanMarkUntil: undefined, d: 5 },
      { id: 'far-marked', scanMarkUntil: 100, d: 60 },
      { id: 'mid-marked', scanMarkUntil: 100, d: 30 },
    ];
    expect(pickScanMarkTarget(list, 0, e => e.d)).toBe('mid-marked');
  });
  it('印付きが居なければ undefined', () => {
    expect(pickScanMarkTarget([{ id: 'a', scanMarkUntil: undefined, d: 1 }], 0, e => e.d)).toBeUndefined();
  });
});

describe('近接の会心 +15%(印付きの雑魚だけ)/体勢の削り(印付きのボスだけ)', () => {
  it('会心の上乗せは雑魚だけ', () => {
    expect(scanMarkMeleeCritBonus(mob(10), 0)).toBeCloseTo(0.15);
    expect(scanMarkMeleeCritBonus(boss(10), 0)).toBe(0);
    expect(scanMarkMeleeCritBonus(mob(undefined), 0)).toBe(0);
  });
  it("'melee' の削りは 0.04→0.09 相当(ボスだけ)", () => {
    expect(scanMarkMeleePostureMult(boss(10), 0) * 0.04).toBeCloseTo(0.09);
    expect(scanMarkMeleePostureMult(mob(10), 0)).toBe(1);
    expect(scanMarkMeleePostureMult(boss(undefined), 0)).toBe(1);
  });
});

// 社長決定2026-10-18: 扇を地面に倒す(縦 0.36 で潰す)。絵は scanFanScreenPoint で点を置き、判定は scanFanContains。
// 上・下・横・斜めのどの向きでも「絵の内側の点は当たる/外側の点は当たらない」を固定する。
describe('地面に倒した扇: 絵と判定が同じ形', () => {
  const O = { x: 500, y: 400 };
  const dirs: [string, number, number][] = [['上', 0, -1], ['下', 0, 1], ['右', 1, 0], ['左', -1, 0], ['右上', 0.7071, -0.7071], ['左下', -0.6, 0.8]];
  for (const [name, dx, dy] of dirs) {
    it(`${name}向き: 絵の縁の少し内側は当たり、少し外側は当たらない`, () => {
      const base = scanFanGroundAngle(dx, dy);
      for (let i = 0; i <= 10; i++) {
        const a = base - SCAN_FAN_HALF_ANGLE_RAD + (2 * SCAN_FAN_HALF_ANGLE_RAD * i) / 10;
        const aIn = base + (a - base) * 0.97;
        const inner = scanFanScreenPoint(O.x, O.y, aIn, SCAN_FAN_LENGTH_PX * 0.97);
        const outer = scanFanScreenPoint(O.x, O.y, a, SCAN_FAN_LENGTH_PX * 1.03);
        expect(scanFanContains(O.x, O.y, dx, dy, inner.x, inner.y)).toBe(true);
        expect(scanFanContains(O.x, O.y, dx, dy, outer.x, outer.y)).toBe(false);
      }
      // 横の縁の外(開きの外)も当たらない。
      for (const s of [-1, 1]) {
        const side = scanFanScreenPoint(O.x, O.y, base + s * SCAN_FAN_HALF_ANGLE_RAD * 1.1, SCAN_FAN_LENGTH_PX * 0.6);
        expect(scanFanContains(O.x, O.y, dx, dy, side.x, side.y)).toBe(false);
      }
    });
  }
  it('潰して画面へ戻した中心線は照準と同じ向き', () => {
    for (const [, dx, dy] of dirs) {
      const q = scanFanScreenPoint(0, 0, scanFanGroundAngle(dx, dy), 100);
      const l = Math.hypot(q.x, q.y);
      expect(q.x / l).toBeCloseTo(dx / Math.hypot(dx, dy), 6);
      expect(q.y / l).toBeCloseTo(dy / Math.hypot(dx, dy), 6);
    }
  });
  it('縦は 0.36 で潰れる: 上向きの届く距離は 260×0.36、横向きは 260', () => {
    expect(SCAN_FAN_GROUND_Y_SCALE).toBe(0.36);
    expect(scanFanContains(0, 0, 0, -1, 0, -SCAN_FAN_LENGTH_PX * 0.36 + 1)).toBe(true);
    expect(scanFanContains(0, 0, 0, -1, 0, -SCAN_FAN_LENGTH_PX * 0.36 - 1)).toBe(false);
    expect(scanFanContains(0, 0, 1, 0, SCAN_FAN_LENGTH_PX - 1, 0)).toBe(true);
    expect(scanFanContains(0, 0, 1, 0, SCAN_FAN_LENGTH_PX + 1, 0)).toBe(false);
  });
  it('敵は足元(下辺の中央)で見る・余裕は足の幅の半分', () => {
    const w = 20, h = 40;
    // 上向き: 足元が 260×0.36 ちょうど+幅の半分×0.36 以内なら入る。
    const reachY = SCAN_FAN_LENGTH_PX * 0.36;
    const at = (footY: number) => ({ x: -w / 2, y: footY - h, width: w, height: h });
    expect(pickScanFanHits(0, 0, 0, -1, [at(-reachY - (w / 2) * 0.36 + 0.5)]).length).toBe(1);
    expect(pickScanFanHits(0, 0, 0, -1, [at(-reachY - (w / 2) * 0.36 - 0.5)]).length).toBe(0);
  });
});

describe('気絶中の強個体の3倍(印の倍率を受ける相手)', () => {
  const base = { health: 100, maxHealth: 100 };
  it('強個体の気絶=true / 雑魚の気絶(即死)・ボスの気絶(5倍)・気絶していない=false', () => {
    expect(isEliteHeavyStun({ ...base, type: 'pumpkin' as EnemyType, stunUntil: 100 }, 0)).toBe(true);
    expect(isEliteHeavyStun({ ...base, type: 'zombie' as EnemyType, stunUntil: 100 }, 0)).toBe(false);
    expect(isEliteHeavyStun({ ...base, type: 'mimir' as EnemyType, stunUntil: 100 }, 0)).toBe(false);
    expect(isEliteHeavyStun({ ...base, type: 'pumpkin' as EnemyType }, 0)).toBe(false);
    // 紫中の強個体は即死(致命の一撃)=false。
    expect(isEliteHeavyStun({ ...base, type: 'pumpkin' as EnemyType, stunUntil: 100, bossFullStunUntil: 100 }, 0)).toBe(false);
  });
});

import { scanStacksAt, scanMarkAddStack, scanStackReachedFull, SCAN_STACK_MAX } from './scanSensor';
describe('§4-2 印の重ね', () => {
  it('扇に入るたびに1段・最大5段・残り時間は3秒に戻る', () => {
    let e: { scanMarkUntil?: number; scanStacks?: number } = {};
    for (let i = 0; i < 7; i++) e = scanMarkAddStack(e, i * 1200);
    expect(e.scanStacks).toBe(SCAN_STACK_MAX);
    expect(e.scanMarkUntil).toBe(6 * 1200 + 3000);
  });
  it('3秒扇に入らないと1段ずつ減る', () => {
    const e = { scanStacks: 4, scanMarkUntil: 3000 };
    expect(scanStacksAt(e, 2999)).toBe(4);
    expect(scanStacksAt(e, 3000)).toBe(3);
    expect(scanStacksAt(e, 5999)).toBe(3);
    expect(scanStacksAt(e, 6000)).toBe(2);
    expect(scanStacksAt(e, 30000)).toBe(0);
  });
  it('減った後に重ねると、減った段から1段上がる', () => {
    expect(scanMarkAddStack({ scanStacks: 4, scanMarkUntil: 3000 }, 6500).scanStacks).toBe(3);
  });
  it('止まるのは5段へ上がった瞬間だけ', () => {
    expect(scanStackReachedFull(4, 5)).toBe(true);
    expect(scanStackReachedFull(5, 5)).toBe(false);
    expect(scanStackReachedFull(3, 4)).toBe(false);
  });
});

import { isScanCrit, SCAN_CRIT_MS, SCAN_DETONATED, noteScanDetonation, drainScanDetonations } from './scanSensor';
describe('§4-2 5重ねのクリティカル状態と起爆', () => {
  it('クリティカル状態の間は5重ね・3秒で解けたら0に戻る', () => {
    const e = { scanStacks: 5, scanMarkUntil: 1000 + SCAN_CRIT_MS, scanCritUntil: 1000 + SCAN_CRIT_MS };
    expect(isScanCrit(e, 1000)).toBe(true);
    expect(scanStacksAt(e, 1000 + SCAN_CRIT_MS - 1)).toBe(5);
    expect(scanStacksAt(e, 1000 + SCAN_CRIT_MS)).toBe(0);
    expect(isScanCrit(e, 1000 + SCAN_CRIT_MS)).toBe(false);
  });
  it('解けた後のスキャンは1重ねから・クリティカル状態の印は外れる', () => {
    const e = { scanStacks: 5, scanMarkUntil: 4000, scanCritUntil: 4000 };
    const add = scanMarkAddStack(e, 5000);
    expect(add.scanStacks).toBe(1);
    expect(add.scanCritUntil).toBeUndefined();
  });
  it('起爆=重ねとクリティカル状態を消す(予約は次のフレームの頭でまとめて)', () => {
    const marked = { scanStacks: 3, scanMarkUntil: 100 };
    expect(scanStacksAt({ ...marked, ...SCAN_DETONATED }, 0)).toBe(0);
    noteScanDetonation('a', 1, 2); noteScanDetonation('a', 1, 2); noteScanDetonation('b', 3, 4);
    const d = drainScanDetonations();
    expect(d?.size).toBe(2);
    expect(drainScanDetonations()).toBeNull();
  });
});
