// 鞭の絡め取り→振り回し→投げつけ(research/WHIP_FOLLOWUP.md §8)の純関数。
import { describe, it, expect } from 'vitest';
import {
  pickWhipGrabTarget, whipSwingSpinDir, whipSwingMaxAngVel, whipSwingAngVel, whipSwingTurned, whipSwingRadiusAt, whipSwingHitDue,
  boxesOverlap, whipShieldBlocksShot, whipSwingClampRadius, whipSwingMaxMs, whipSwingAutoThrowDue, whipSwingTangent, pickWhipAutoThrowDir,
  whipThrowDecel, whipThrowDurationMs, whipThrowDist, whipThrowSpeed, whipThrowStartSpeed, whipThrowStep, whipSwingReleaseReason,
  whipBlastFalloff, whipThrowBlastPlan, easeStartStop, criticalSpringStep, whipDropDist, WHIP_DROP_MS,
  WHIP_SWING_ACCEL_MS, WHIP_SWING_PERIOD_MS, WHIP_SWING_MAX_MS, WHIP_SWING_SLASHER_MS_PER_LV, WHIP_THROW_MIN_SPEED, WHIP_THROW_END_SPEED_FRAC, WHIP_SWING_TELEPORT_PX,
  WHIP_THROW_DIST_MULT,
  whipSwingRampMult, whipSwingRampFx, WHIP_SWING_RAMP_STEP, WHIP_SWING_RAMP_MAX, WHIP_SWING_RAMP_MAX_HITS,
  whipBodyPropHits, whipBlastPropHits,
  whipGrabberCanGrab, whipGrabberClassOk, putWhipOwnerSwing, whipHeldEnemyIds, type WhipSwingState,
} from './whipSwing';

describe('掴む相手の選び方(§8-1・§8-7)', () => {
  it('当たった中でプレイヤーに一番近い、生き残った掴める1体', () => {
    expect(pickWhipGrabTarget([
      { id: 'far', dist: 80, grabbable: true, alive: true },
      { id: 'near', dist: 20, grabbable: true, alive: true },
    ])).toBe('near');
  });
  it('ボス級(掴めない)は飛ばす・1撃目で死んだ敵は飛ばす(生き残った中で一番近い)・全員だめなら掴まない', () => {
    expect(pickWhipGrabTarget([
      { id: 'boss', dist: 5, grabbable: false, alive: true },
      { id: 'dead', dist: 10, grabbable: true, alive: false },
      { id: 'mob', dist: 60, grabbable: true, alive: true },
    ])).toBe('mob');
    expect(pickWhipGrabTarget([{ id: 'boss', dist: 5, grabbable: false, alive: true }, { id: 'dead', dist: 9, grabbable: true, alive: false }])).toBeNull();
    expect(pickWhipGrabTarget([])).toBeNull();
  });
});

describe('回転(§8-2・慣性)', () => {
  it('回る向き=振りの線のどちら側にいるか(押しのまま回り出す)', () => {
    expect(whipSwingSpinDir(1, 0, 100, 10)).toBe(1);
    expect(whipSwingSpinDir(1, 0, 100, -10)).toBe(-1);
    expect(whipSwingSpinDir(1, 0, 100, 0)).toBe(1);
  });
  it('角速度は 0 から加速し、加速の終わりで最高(1周の長さ)に届いて一定。途中で減らない・跳ばない', () => {
    const w = whipSwingMaxAngVel();
    expect(w).toBeCloseTo(2 * Math.PI / (WHIP_SWING_PERIOD_MS / 1000), 6);
    expect(whipSwingAngVel(0)).toBe(0);
    let prev = 0;
    for (let t = 10; t <= WHIP_SWING_ACCEL_MS; t += 10) {
      const v = whipSwingAngVel(t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(whipSwingAngVel(WHIP_SWING_ACCEL_MS)).toBeCloseTo(w, 6);
    expect(whipSwingAngVel(WHIP_SWING_ACCEL_MS + 500)).toBeCloseTo(w, 6);
    // 加速の終わり際は滑らか(1ms 手前とほぼ同じ)
    expect(whipSwingAngVel(WHIP_SWING_ACCEL_MS - 1)).toBeCloseTo(w, 2);
  });
  it('回った角度は角速度の積分(数値積分と一致)・加速の後は1周の長さで1周', () => {
    let num = 0;
    const dt = 0.5;
    for (let t = 0; t < 800; t += dt) num += whipSwingAngVel(t + dt / 2) * dt / 1000;
    expect(whipSwingTurned(800)).toBeCloseTo(num, 3);
    const a1 = whipSwingTurned(WHIP_SWING_ACCEL_MS + 100);
    const a2 = whipSwingTurned(WHIP_SWING_ACCEL_MS + 100 + WHIP_SWING_PERIOD_MS);
    expect(a2 - a1).toBeCloseTo(2 * Math.PI, 6);
  });
  it('半径は掴んだ位置の距離から回す半径へ、加速と同じ尺で寄る', () => {
    expect(whipSwingRadiusAt(0, 140, 90)).toBe(140);
    expect(whipSwingRadiusAt(WHIP_SWING_ACCEL_MS, 140, 90)).toBe(90);
    expect(whipSwingRadiusAt(WHIP_SWING_ACCEL_MS * 3, 140, 90)).toBe(90);
    const mid = whipSwingRadiusAt(WHIP_SWING_ACCEL_MS / 2, 140, 90);
    expect(mid).toBeLessThan(140); expect(mid).toBeGreaterThan(90);
  });
  it('接線は回る向き', () => {
    const t = whipSwingTangent(0, 1);
    expect(t.x).toBeCloseTo(0); expect(t.y).toBeCloseTo(1);
    const t2 = whipSwingTangent(0, -1);
    expect(t2.y).toBeCloseTo(-1);
  });
});

describe('回して当てる(1周1回・体の箱の重なり)', () => {
  it('同じ敵へは1周ぶんの時間ごとに1回', () => {
    expect(whipSwingHitDue(undefined, 1000)).toBe(true);
    expect(whipSwingHitDue(1000, 1000 + WHIP_SWING_PERIOD_MS - 1)).toBe(false);
    expect(whipSwingHitDue(1000, 1000 + WHIP_SWING_PERIOD_MS)).toBe(true);
  });
  it('箱の重なり', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxesOverlap(a, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
    expect(boxesOverlap(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('壁で半径を縮める(着弾しない・手前に留める)', () => {
  it('居られる一番大きな半径(刻み)・壁が無ければ目標のまま', () => {
    expect(whipSwingClampRadius(90, () => true, 18)).toBe(90);
    // 60 より外は壁
    const r = whipSwingClampRadius(90, rr => rr <= 60, 18, 6);
    expect(r).toBeLessThanOrEqual(60);
    expect(r).toBeGreaterThan(60 - 6);
  });
  it('下限まで縮めても居られなければ下限', () => {
    expect(whipSwingClampRadius(90, () => false, 18)).toBe(18);
    expect(whipSwingClampRadius(10, () => false, 18)).toBe(10); // 目標が下限より小さい(掴んだ直後に近い)=目標
  });
});

describe('最長と自動の投げ', () => {
  it('最長=基本+スラッシャー Lv ぶん', () => {
    expect(whipSwingMaxMs(0)).toBe(WHIP_SWING_MAX_MS);
    expect(whipSwingMaxMs(2)).toBe(WHIP_SWING_MAX_MS + 2 * WHIP_SWING_SLASHER_MS_PER_LV);
    expect(whipSwingMaxMs(9)).toBe(WHIP_SWING_MAX_MS + 3 * WHIP_SWING_SLASHER_MS_PER_LV);
  });
  it('最長の時間で自動で投げる(振り回し中だけ)', () => {
    const s = { startAt: 1000, maxMs: 1500, phase: 'swing' as const };
    expect(whipSwingAutoThrowDue(s, 2499)).toBe(false);
    expect(whipSwingAutoThrowDue(s, 2500)).toBe(true);
    expect(whipSwingAutoThrowDue({ ...s, phase: 'thrown' }, 9999)).toBe(false);
  });
  it('自動の投げの向き=プレイヤーに一番近い敵(本人は外す・見通しが通る敵だけ)。居なければ進行方向、それも無ければ接線', () => {
    // プレイヤー (0,0)・掴んでいる敵 (100,0)。
    const ts = [
      { id: 'self', x: 100, y: 0 },
      { id: 'near', x: -60, y: -80 },                                                       // プレイヤーから 100(一番近い)
      { id: 'a', x: 100, y: 200 }, { id: 'b', x: 110, y: 210 }, { id: 'c', x: 90, y: 205 }, // 固まり(遠い)=選ばない
    ];
    const d = pickWhipAutoThrowDir(100, 0, 0, 0, ts, 'self', () => true, { x: 1, y: 0 }, { x: 0, y: 1 });
    // 向きは掴んでいる敵の位置から一番近い敵へ
    const L = Math.hypot(-160, -80);
    expect(d.x).toBeCloseTo(-160 / L); expect(d.y).toBeCloseTo(-80 / L);
    // 掴んでいる本人がプレイヤーに一番近くても選ばない(本人だけ=進行方向)
    const d0 = pickWhipAutoThrowDir(100, 0, 0, 0, [{ id: 'self', x: 100, y: 0 }], 'self', () => true, { x: 0, y: -3 }, { x: 1, y: 0 });
    expect(d0).toEqual({ x: 0, y: -1 });
    // 一番近い敵が壁の向こう=次に近い見通しの通る敵へ
    const d2 = pickWhipAutoThrowDir(100, 0, 0, 0, ts, 'self', (_x, y) => y > 0, { x: 1, y: 0 }, { x: 0, y: 1 });
    expect(d2.y).toBeGreaterThan(0.99);
    // 誰も居ない=進行方向(長さは1へ揃える)
    expect(pickWhipAutoThrowDir(100, 0, 0, 0, [], 'self', () => true, { x: -2, y: 0 }, { x: 0, y: 1 })).toEqual({ x: -1, y: 0 });
    // 全員見通しが通らない=進行方向
    expect(pickWhipAutoThrowDir(100, 0, 0, 0, ts, 'self', () => false, { x: 0, y: 1 }, { x: 1, y: 0 })).toEqual({ x: 0, y: 1 });
    // 進行方向も無い=接線
    expect(pickWhipAutoThrowDir(100, 0, 0, 0, [], 'self', () => true, null, { x: 0, y: -2 })).toEqual({ x: 0, y: -1 });
  });
  it('投げの最大距離=届く距離の1.75倍(社長指示2026-11-26 2.5→1.75)', () => {
    expect(WHIP_THROW_DIST_MULT).toBe(1.75);
  });
});

describe('投げの速さの減衰と着弾', () => {
  const v0 = 1200, D = 375;
  it('出だしが一番速く少しずつ減速し、最大距離で止める(終わりの速さ=割合)', () => {
    const T = whipThrowDurationMs(v0, D);
    expect(whipThrowSpeed(0, v0, D)).toBe(v0);
    expect(whipThrowSpeed(T, v0, D)).toBeCloseTo(v0 * WHIP_THROW_END_SPEED_FRAC, 6);
    expect(whipThrowSpeed(T / 2, v0, D)).toBeLessThan(v0);
    expect(whipThrowDist(T, v0, D)).toBeCloseTo(D, 6);
    expect(whipThrowDist(T * 2, v0, D)).toBe(D);
    expect(whipThrowDist(0, v0, D)).toBe(0);
    // 等しい時間あたりの進みは減っていく(減速)
    const a = whipThrowDist(T / 4, v0, D), b = whipThrowDist(T / 2, v0, D) - a, c = whipThrowDist((3 * T) / 4, v0, D) - whipThrowDist(T / 2, v0, D);
    expect(b).toBeLessThan(a); expect(c).toBeLessThan(b);
    expect(whipThrowDecel(v0, D)).toBeGreaterThan(0);
  });
  it('出だしの速さ=接線の速さ(下限あり)', () => {
    expect(whipThrowStartSpeed(14, 90)).toBe(1260);
    expect(whipThrowStartSpeed(0, 90)).toBe(WHIP_THROW_MIN_SPEED);
  });
  it('1フレームの当たり: 敵に触れる・壁(手前に置く)・最大距離・まだ飛ぶ', () => {
    const none = () => false;
    expect(whipThrowStep(0, 0, 1, 0, 0, 40, 375, none, none).kind).toBeNull();
    const en = whipThrowStep(0, 0, 1, 0, 0, 40, 375, x => x >= 25, none);
    expect(en.kind).toBe('enemy'); expect(en.x).toBeGreaterThanOrEqual(25);
    const wall = whipThrowStep(0, 0, 1, 0, 0, 40, 375, none, x => x >= 25);
    expect(wall.kind).toBe('wall'); expect(wall.x).toBeLessThan(25);
    expect(whipThrowStep(0, 0, 1, 0, 360, 375, 375, none, none).kind).toBe('max');
    // 速い1フレームでも壁を飛び越さない(刻みで見る)
    const thin = whipThrowStep(0, 0, 1, 0, 0, 200, 375, none, x => x >= 100 && x <= 112); // 刻み(12px)と同じ厚さの壁
    expect(thin.kind).toBe('wall');
  });
});

describe('途中で放す条件', () => {
  const base = { playerAlive: true, locked: false, whipEquipped: true, movedPx: 3 };
  it('プレイヤーが死んだ/操作が止まった/鞭が外れた/瞬間移動した', () => {
    expect(whipSwingReleaseReason(base)).toBeNull();
    expect(whipSwingReleaseReason({ ...base, playerAlive: false })).toBe('dead');
    expect(whipSwingReleaseReason({ ...base, locked: true })).toBe('lock');
    expect(whipSwingReleaseReason({ ...base, whipEquipped: false })).toBe('weapon');
    expect(whipSwingReleaseReason({ ...base, movedPx: WHIP_SWING_TELEPORT_PX + 1 })).toBe('teleport');
    expect(whipSwingReleaseReason({ ...base, movedPx: WHIP_SWING_TELEPORT_PX })).toBeNull();
  });
});

describe('着弾の爆発(§6 の規約・投げた本人も満額)', () => {
  const pt = (id: string, x: number, y: number) => ({ id, anchor: () => ({ x, y }) });
  it('減りは手榴弾と同じ(爆心1・縁0.55)', () => {
    expect(whipBlastFalloff(0, 66)).toBe(1);
    expect(whipBlastFalloff(66, 66)).toBeCloseTo(0.55);
  });
  it('投げた本人は満額・ほかは半径の内側で壁越しでなければ当たる', () => {
    const plan = whipThrowBlastPlan(0, 0, 'self',
      [pt('self', 30, 0), pt('near', 30, 0), pt('far', 100, 0), { ...pt('wall', 10, 0), blocked: () => true }], 66);
    expect(plan).toEqual([
      { targetId: 'self', dist: 0, scale: 1 },
      { targetId: 'near', dist: 30, scale: whipBlastFalloff(30, 66) },
    ]);
    // 本人が死んで着弾(selfId=null)=爆心だけ
    expect(whipThrowBlastPlan(0, 0, null, [pt('self', 0, 0)], 66)).toEqual([{ targetId: 'self', dist: 0, scale: 1 }]);
  });
});

// ★慣性(社長「鞭は動きがギクシャクしない様に慣性に従って自然に動く様に注意してね」)。
describe('振り回しの継ぎ目の慣性', () => {
  const vel = (f: (t: number) => number, t: number) => f(t + 0.5) - f(t - 0.5);
  it('半径の寄り: 掴んだ瞬間と寄り終わりの速さ0(掴んだ瞬間に引き寄せの速さが跳ばない)', () => {
    expect(easeStartStop(0)).toBe(0); expect(easeStartStop(1)).toBe(1);
    const r = (t: number) => whipSwingRadiusAt(t, 140, 90);
    expect(Math.abs(vel(r, 0.5))).toBeLessThan(0.01);
    expect(Math.abs(vel(r, WHIP_SWING_ACCEL_MS - 0.5))).toBeLessThan(0.01);
  });
  it('壁で縮めるばね: 目標へ行き過ぎずに寄り、速さは続く', () => {
    let x = 0, v = 0, maxX = 0;
    const xs: number[] = [];
    for (let i = 0; i < 30; i++) { const s = criticalSpringStep(x, v, 40, 1000 / 60); x = s.x; v = s.v; maxX = Math.max(maxX, x); xs.push(x); }
    expect(maxX).toBeLessThanOrEqual(40 + 1e-9);
    expect(x).toBeGreaterThan(39.5);
    // 1フレームごとの増え方は前のフレームから大きく変わらない(跳ばない)
    for (let i = 2; i < xs.length; i++) expect(Math.abs((xs[i] - xs[i - 1]) - (xs[i - 1] - xs[i - 2]))).toBeLessThan(12);
    // 刻みを変えても同じ所へ着く(フレームの長さに依らない)
    let a = { x: 0, v: 0 }; for (let i = 0; i < 6; i++) a = criticalSpringStep(a.x, a.v, 40, 10);
    const b = criticalSpringStep(0, 0, 40, 60);
    expect(a.x).toBeCloseTo(b.x, 6);
  });
  it('途中で放した後の滑り: 出だしの速さ=回っていた速さ・一定の減速で止まる', () => {
    const v0 = 1257;
    const d = (t: number) => whipDropDist(t, v0);
    expect(vel(d, 0.5) * 1000).toBeCloseTo(v0, -1);
    expect(vel(d, WHIP_DROP_MS - 0.5) * 1000).toBeLessThan(20);
    expect(d(WHIP_DROP_MS + 100)).toBeCloseTo(d(WHIP_DROP_MS), 9);
  });
});

describe('振り回している敵を盾に敵の弾をかき消す', () => {
  const body = { x: 100, y: 100, width: 40, height: 50 };
  const shot = (cx: number, cy: number, extra: Record<string, unknown> = {}) => ({ x: cx - 4, y: cy - 4, width: 8, height: 8, hostile: true, ...extra });
  it('弾の中心が体の箱の中なら消す・外なら消さない', () => {
    expect(whipShieldBlocksShot(shot(120, 120), body)).toBe(true);
    expect(whipShieldBlocksShot(shot(100, 150), body)).toBe(true); // 縁
    expect(whipShieldBlocksShot(shot(98, 120), body)).toBe(false); // 箱には掛かるが中心が外
    expect(whipShieldBlocksShot(shot(200, 120), body)).toBe(false);
  });
  it('紫(カウンターできない弾)・プレイヤー側の弾・敵の手榴弾は消さない', () => {
    expect(whipShieldBlocksShot(shot(120, 120, { noCounter: true }), body)).toBe(false);
    expect(whipShieldBlocksShot(shot(120, 120, { hostile: false }), body)).toBe(false);
    expect(whipShieldBlocksShot(shot(120, 120, { weaponType: 'grenade' }), body)).toBe(false);
  });
});

describe('大車輪の上がり(ぶつかるたびに1.5倍・上限8倍)', () => {
  it('当たった数ごとに 1→1.5→2.25→3.375→5.06→7.59→8 で止まる', () => {
    const seq = [0, 1, 2, 3, 4, 5, 6, 7, 20].map(whipSwingRampMult);
    expect(seq[0]).toBe(1);
    expect(seq[1]).toBeCloseTo(1.5, 6);
    expect(seq[2]).toBeCloseTo(2.25, 6);
    expect(seq[3]).toBeCloseTo(3.375, 6);
    expect(seq[4]).toBeCloseTo(5.0625, 6);
    expect(seq[5]).toBeCloseTo(7.59375, 6);
    expect(seq[6]).toBe(WHIP_SWING_RAMP_MAX);
    expect(seq[7]).toBe(8);
    expect(seq[8]).toBe(8);
    expect(WHIP_SWING_RAMP_STEP).toBe(1.5);
    expect(WHIP_SWING_RAMP_MAX_HITS).toBe(6);
    expect(whipSwingRampMult(-3)).toBe(1);
  });
  it('手応え: 倍率1は何も変えない・上がるほど数字と輪が大きく音が高い・上限だけ一段強い色(縁取り)', () => {
    expect(whipSwingRampFx(1)).toBeNull();
    const fx = [1, 2, 3, 4, 5, 6].map(n => whipSwingRampFx(whipSwingRampMult(n))!);
    for (let i = 1; i < fx.length; i++) {
      expect(fx[i].scale).toBeGreaterThan(fx[i - 1].scale);
      expect(fx[i].ringR).toBeGreaterThan(fx[i - 1].ringR);
      expect(fx[i].sfxRate).toBeGreaterThan(fx[i - 1].sfxRate);
    }
    expect(fx.slice(0, 5).every(f => !f.max && f.outline === undefined)).toBe(true);
    expect(fx[5].max).toBe(true);
    expect(fx[5].outline).toBeDefined();
    expect(fx[5].sfxRate).toBeLessThanOrEqual(1.5);
  });
});

describe('大車輪で置き物を壊す(社長指示2026-11-27)', () => {
  const prop = (id: string, type: string, cx: number, cy: number, w = 20, h = 16) => ({ id, type, x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  it('体の箱が通った道(始点→終点)に重なる松明・緑卵の id を返す・UVの棒は返さない', () => {
    const props = [prop('t', 'torch', 50, 0), prop('m', 'mine', 100, 0), prop('uv', 'uv-bar', 75, 0), prop('far', 'torch', 50, 100)];
    expect(whipBodyPropHits(props, 0, 0, 120, 0, 30, 30).sort()).toEqual(['m', 't']);
  });
  it('1フレームで大きく動いても(体の幅の何倍も)間の置き物を飛び越さない', () => {
    const props = [prop('t', 'torch', 300, 0, 10, 10)];
    expect(whipBodyPropHits(props, 0, 0, 600, 0, 20, 20)).toEqual(['t']);
  });
  it('通った道を包む箱の外は見ない・道の脇は当たらない・置き物が無い時は空', () => {
    expect(whipBodyPropHits([prop('t', 'torch', 300, 40, 10, 10)], 0, 0, 600, 0, 20, 20)).toEqual([]);
    expect(whipBodyPropHits([], 0, 0, 600, 0, 20, 20)).toEqual([]);
    // 斜めの道: 包む箱の中だが道からは外れている
    expect(whipBodyPropHits([prop('t', 'torch', 300, 0, 10, 10)], 0, 0, 600, 600, 20, 20)).toEqual([]);
  });
  it('爆発: 足元が半径の中の松明だけ(緑卵は爆発の既存の経路が割る)', () => {
    const props = [
      { id: 'in', type: 'torch', footX: 30, footY: 40 }, { id: 'edge', type: 'torch', footX: 66, footY: 0 },
      { id: 'out', type: 'torch', footX: 67, footY: 0 }, { id: 'egg', type: 'mine', footX: 0, footY: 0 },
    ];
    expect(whipBlastPropHits(props, 0, 0, 66)).toEqual(['in', 'edge']);
  });
});

describe('掴む人(§8-5・§8-7): 守護霊はプレイヤーと同じ規則・幻影は掴まない・1人1体・同じ敵を二重に掴まない', () => {
  it('幻影(敵側のミラー)は掴まない(通常の鞭の振りのまま)。プレイヤー・守護霊は手が空いていれば掴む', () => {
    expect(whipGrabberCanGrab('phantom', false)).toBe(false);
    expect(whipGrabberCanGrab('player', false)).toBe(true);
    expect(whipGrabberCanGrab('guardian', false)).toBe(true);
  });
  it('掴む人ごとに1体まで(持っている間は次を掴まない)', () => {
    expect(whipGrabberCanGrab('player', true)).toBe(false);
    expect(whipGrabberCanGrab('guardian', true)).toBe(false);
  });
  it('守護霊は雑魚・強個体だけ掴む(ボスの叩きつけは持たない)。プレイヤーは区分で外さない(気絶したボスは叩きつけ)。幻影は何も掴まない', () => {
    expect(whipGrabberClassOk('guardian', 'mob')).toBe(true);
    expect(whipGrabberClassOk('guardian', 'strong')).toBe(true);
    expect(whipGrabberClassOk('guardian', 'boss')).toBe(false);
    expect(whipGrabberClassOk('player', 'boss')).toBe(true);
    expect(whipGrabberClassOk('phantom', 'mob')).toBe(false);
  });
  it('だれかが掴んでいる敵は、一番近くても飛ばす(同じ敵を二人で掴まない)', () => {
    const cands = [
      { id: 'held', dist: 10, grabbable: true, alive: true },
      { id: 'free', dist: 50, grabbable: true, alive: true },
    ];
    expect(pickWhipGrabTarget(cands, new Set(['held']))).toBe('free');
    expect(pickWhipGrabTarget(cands, new Set(['held', 'free']))).toBeNull();
    expect(pickWhipGrabTarget(cands)).toBe('held');
  });
  it('掴まれている敵の集合=プレイヤーの1体+守護霊ごとの1体', () => {
    const ids = whipHeldEnemyIds({ enemyId: 'p' }, { g1: { enemyId: 'a' }, g2: { enemyId: 'b' } });
    expect([...ids].sort()).toEqual(['a', 'b', 'p']);
    expect([...whipHeldEnemyIds(null, {})]).toEqual([]);
  });
  it('守護霊ごとの台帳の書き換え(足す・消す・変わらなければ同じ参照)', () => {
    const sw = { enemyId: 'z' } as WhipSwingState;
    const empty: Record<string, WhipSwingState> = {};
    const m1 = putWhipOwnerSwing(empty, 'g', sw);
    expect(m1).toEqual({ g: sw });
    expect(empty).toEqual({}); // 元は書き換えない
    expect(putWhipOwnerSwing(m1, 'g', sw)).toBe(m1);
    expect(putWhipOwnerSwing(m1, 'g', null)).toEqual({});
    expect(putWhipOwnerSwing(empty, 'g', null)).toBe(empty);
  });
  it('自動で投げる向きは掴んでいる人(守護霊)に一番近い敵の方(プレイヤーと同じ関数・中心だけ守護霊)', () => {
    // 守護霊 (0,0)・掴んだ敵 (50,0)。守護霊に近いのは a(0,100)、遠いのは b(300,0)。
    const d = pickWhipAutoThrowDir(50, 0, 0, 0, [{ id: 'a', x: 0, y: 100 }, { id: 'b', x: 300, y: 0 }, { id: 'held', x: 50, y: 0 }], 'held', () => true, null, { x: 0, y: 1 });
    expect(d.x).toBeCloseTo(-50 / Math.hypot(50, 100), 6);
    expect(d.y).toBeCloseTo(100 / Math.hypot(50, 100), 6);
    expect(whipSwingAutoThrowDue({ startAt: 0, maxMs: WHIP_SWING_MAX_MS, phase: 'swing' }, WHIP_SWING_MAX_MS)).toBe(true);
  });
});
