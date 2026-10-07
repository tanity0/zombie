// research/ESCORT_FOLLOW.md §5 のテスト: 区域の判定(余白・スタート地点付近・4方向)/ついてくる↔帰るの切り替え/
// 個体差/後ろ斜めの目標点/慣性・制動・反応の遅れ/見送り/回復/台詞の抑止。
// 画面の寸法を受け取らない関数なので「スマホの寸法で結果が変わらない」は型で保証される(座標の平行移動で同じ結果になることも確かめる)。
import { describe, it, expect } from 'vitest';
import {
  followZoneContains, plainSectorOf, stepFollowMachine, escortFollowProfile, followBehindPoint, stepEscortFollow, followSpeedCap, followHeal,
  followLineMuted,
  FOLLOW_SEE_OFF_MS, FOLLOW_GAP_MIN_PX, FOLLOW_GAP_MAX_PX, FOLLOW_WAKE_MIN_MS, FOLLOW_WAKE_MAX_MS, FOLLOW_OVERLAP_PX,
  FOLLOW_STEP_BACK_PX, FOLLOW_HEAL_DELAY_MS, FOLLOW_HEAL_PER_SEC, FOLLOW_ACCEL_SEC, FOLLOW_SPEED_MULT,
  FOLLOW_LINE_MUTE_AFTER_CAPTURE_MS,
  type FollowStepInput,
} from './escortFollow';
import { AREA_THRESHOLDS } from './enemyUtils';

const R0 = AREA_THRESHOLDS[0]; // 2250
const deg = (d: number) => (d * Math.PI) / 180;
const at = (r: number, angDeg: number) => ({ x: Math.cos(deg(angDeg)) * r, y: Math.sin(deg(angDeg)) * r });
const zone = (r: number, angDeg: number, sector: number, prevIn: boolean) => {
  const p = at(r, angDeg);
  return followZoneContains(p.x, p.y, sector, prevIn, R0);
};

describe('区域の判定(§2-1)', () => {
  it('4方向: 各区域の真ん中は、その区域の軍人にだけ「中」', () => {
    // 角度は画面の座標系(y下向き): 東0°/南90°/西180°/北-90°
    const axes: [number, number][] = [[0, 0], [90, 1], [180, 2], [-90, 3]];
    for (const [a, sec] of axes) {
      for (let s = 0; s < 4; s++) expect(zone(4800, a, s, false), `axis ${a} sector ${s}`).toBe(s === sec);
    }
  });
  it('素の区域割り当て(sectorIndexForAngle)と、余白の外では一致する', () => {
    for (let a = -180; a < 180; a += 7) {
      const p = at(4000, a);
      const sec = plainSectorOf(p.x, p.y);
      // 軸から±39°以内(入りの余白の内側)なら、その区域の「中」
      const axis = sec * 90;
      const diff = Math.abs(((a - axis + 540) % 360) - 180);
      const off = 180 - diff; // 軸からの角度差
      if (off <= 39) expect(followZoneContains(p.x, p.y, sec, false, R0)).toBe(true);
    }
  });
  it('角度の余白: 入るには6°内へ(39°)・出るには6°外へ(51°)。間は前の判定を保つ', () => {
    expect(zone(4000, 38, 0, false)).toBe(true);
    expect(zone(4000, 40, 0, false)).toBe(false);  // 区域の中(45°未満)でも、入りは余白の分だけ奥へ
    expect(zone(4000, 40, 0, true)).toBe(true);    // すでに中なら保つ
    expect(zone(4000, 50, 0, true)).toBe(true);    // 区域の外へ出ても6°までは保つ
    expect(zone(4000, 52, 0, true)).toBe(false);
    expect(zone(4000, 50, 0, false)).toBe(false);
  });
  it('境目を行き来しても切り替わりは1回(パタつかない)', () => {
    let inZ = false, flips = 0;
    // 境目(45°)の前後±4°を往復する
    for (let k = 0; k < 400; k++) {
      const a = 45 + Math.sin(k / 6) * 4;
      const nowIn = zone(4000, a, 0, inZ);
      if (nowIn !== inZ) flips++;
      inZ = nowIn;
    }
    expect(flips).toBeLessThanOrEqual(1);
  });
  it('スタート地点付近は「どの区域にもいない」。半径にも余白(入り+100・出−100)', () => {
    for (let s = 0; s < 4; s++) expect(followZoneContains(0, 0, s, false, R0)).toBe(false);
    expect(zone(R0 + 50, 0, 0, false)).toBe(false);   // 外縁を越えても、+100までは入らない
    expect(zone(R0 + 110, 0, 0, false)).toBe(true);
    expect(zone(R0 - 50, 0, 0, true)).toBe(true);     // 中に居るなら−100までは保つ
    expect(zone(R0 - 110, 0, 0, true)).toBe(false);
  });
  it('円周に沿って歩いても(半径が外縁付近で揺れても)パタつかない', () => {
    let inZ = false, flips = 0;
    for (let k = 0; k < 400; k++) {
      const r = R0 + Math.sin(k / 5) * 80; // 外縁±80
      const nowIn = zone(r, 0, 0, inZ);
      if (nowIn !== inZ) flips++;
      inZ = nowIn;
    }
    expect(flips).toBe(0); // ±80 は入り(+100)にも出(−100)にも届かない
  });
});

describe('ついてくる↔帰るの切り替え(§2-1・§2-4)', () => {
  const base = { captured: true, inBaseCircle: false, pauseUntil: undefined, now: 1000 };
  it('未解放の拠点の軍人は対象外(区域の中でも何も起きない)', () => {
    const r = stepFollowMachine({ ...base, captured: false, zoneIn: true, prev: undefined });
    expect(r.state).toBeUndefined();
    expect(r.started).toBe(false);
  });
  it('区域に入ると follow(開始の瞬間だけ started)', () => {
    const r1 = stepFollowMachine({ ...base, zoneIn: true, prev: undefined });
    expect(r1.state).toBe('follow'); expect(r1.started).toBe(true);
    const r2 = stepFollowMachine({ ...base, zoneIn: true, prev: 'follow' });
    expect(r2.state).toBe('follow'); expect(r2.started).toBe(false);
  });
  it('区域を出ると return。0.6秒の見送りが付く', () => {
    const r = stepFollowMachine({ ...base, zoneIn: false, prev: 'follow' });
    expect(r.state).toBe('return');
    expect(r.pauseUntil).toBe(1000 + FOLLOW_SEE_OFF_MS);
  });
  it('見送りの期限は帰る途中で動かない', () => {
    const r = stepFollowMachine({ ...base, zoneIn: false, prev: 'return', pauseUntil: 1600, now: 1300 });
    expect(r.state).toBe('return'); expect(r.pauseUntil).toBe(1600);
  });
  it('帰る途中でまた区域に入ったら、その場からまたついてくる(started)', () => {
    const r = stepFollowMachine({ ...base, zoneIn: true, prev: 'return', pauseUntil: 1600 });
    expect(r.state).toBe('follow'); expect(r.started).toBe(true);
  });
  it('拠点の円に入ったら状態を消す(帰る時も、ついてくる最中に区域を出た時も)', () => {
    expect(stepFollowMachine({ ...base, zoneIn: false, prev: 'return', inBaseCircle: true }).state).toBeUndefined();
    expect(stepFollowMachine({ ...base, zoneIn: false, prev: 'follow', inBaseCircle: true }).state).toBeUndefined();
  });
  it('通常(状態なし)で区域の外: 拠点の円の中なら何も起きない(巡回のまま)/円の外なら帰る(検収R2 A-1)', () => {
    expect(stepFollowMachine({ ...base, zoneIn: false, prev: undefined, inBaseCircle: true }).state).toBeUndefined();
    expect(stepFollowMachine({ ...base, zoneIn: false, prev: undefined, inBaseCircle: false }).state).toBe('return');
  });
  it('解放が取り消された(未解放へ戻った)ら状態は消える', () => {
    expect(stepFollowMachine({ ...base, captured: false, zoneIn: true, prev: 'follow' }).state).toBeUndefined();
  });
});

describe('個体差(§2-3)', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `escort-${i}`);
  it('間隔60〜90px・反応の遅れ150〜250ms・左右は個体で固定(同じIDなら毎回同じ)', () => {
    for (const id of ids) {
      const p = escortFollowProfile(id);
      expect(p.gapPx).toBeGreaterThanOrEqual(FOLLOW_GAP_MIN_PX);
      expect(p.gapPx).toBeLessThanOrEqual(FOLLOW_GAP_MAX_PX);
      expect(p.wakeMs).toBeGreaterThanOrEqual(FOLLOW_WAKE_MIN_MS);
      expect(p.wakeMs).toBeLessThanOrEqual(FOLLOW_WAKE_MAX_MS);
      expect(escortFollowProfile(id)).toEqual(p);
    }
  });
  it('8人で間隔が全員同じにはならない', () => {
    const gaps = new Set(ids.map(id => Math.round(escortFollowProfile(id).gapPx)));
    expect(gaps.size).toBeGreaterThan(3);
  });
});

describe('目標点=移動方向の後ろ斜め(§5b S-2)', () => {
  it('プレイヤーの前には決して出ない・個体の間隔だけ離れる・左右は side で決まる', () => {
    for (let a = 0; a < 360; a += 15) {
      const dir = { x: Math.cos(deg(a)), y: Math.sin(deg(a)) };
      for (const side of [1, -1] as const) {
        const t = followBehindPoint({ x: 100, y: 50 }, dir, 75, side);
        const rel = { x: t.x - 100, y: t.y - 50 };
        expect(Math.hypot(rel.x, rel.y)).toBeCloseTo(75, 5);
        expect(rel.x * dir.x + rel.y * dir.y).toBeLessThan(0); // 後ろ側
        // 横成分の向きが side で反転する
        const lat = rel.x * -dir.y + rel.y * dir.x;
        expect(Math.sign(lat)).toBe(side);
      }
    }
  });
  it('止まっている時は「最後の移動方向」を渡す(同じ向きなら同じ点)。向きが無ければ右向きを仮定', () => {
    const d = { x: 0, y: -1 };
    expect(followBehindPoint({ x: 0, y: 0 }, d, 60, 1)).toEqual(followBehindPoint({ x: 0, y: 0 }, d, 60, 1));
    const t = followBehindPoint({ x: 0, y: 0 }, null, 60, 1);
    expect(t.x).toBeLessThan(0);
  });
});

const profile = { gapPx: 70, wakeMs: 200, side: 1 as const };
const mk = (over: Partial<FollowStepInput> = {}): FollowStepInput => ({
  state: 'follow', x: 0, y: 0, speed: 0, wakeAt: undefined, now: 0, dtSec: 1 / 60,
  player: { x: 0, y: 0 }, playerDir: { x: 1, y: 0 }, base: { x: 5000, y: 0 }, profile,
  followVmax: 130, returnVmax: 73, ...over,
});

describe('動き(§2-3 慣性・制動・反応の遅れ)', () => {
  it('止まっている所からは反応の遅れ(個体の150〜250ms)を置いてから動き出す', () => {
    let s = mk({ x: -300, y: 0, player: { x: 0, y: 0 } });
    let t = 0, firstMove = -1;
    for (let k = 0; k < 60; k++) {
      const r = stepEscortFollow({ ...s, now: t });
      if (r.moved && firstMove < 0) firstMove = t;
      s = { ...s, x: r.x, y: r.y, speed: r.speed, wakeAt: r.wakeAt };
      t += 1000 / 60;
    }
    expect(firstMove).toBeGreaterThanOrEqual(profile.wakeMs - 1);
    expect(firstMove).toBeLessThanOrEqual(profile.wakeMs + 1000 / 60 + 1);
  });
  it('速さは0.3秒かけて上がる(最初のフレームで最高速にならない)', () => {
    let s = mk({ x: -500, y: 0, wakeAt: -1 });
    const r1 = stepEscortFollow(s);
    expect(r1.speed).toBeGreaterThan(0);
    expect(r1.speed).toBeLessThan(130 * 0.1);
    let sp = r1.speed;
    s = { ...s, x: r1.x, y: r1.y, speed: r1.speed, wakeAt: undefined };
    for (let k = 0; k < Math.ceil(FOLLOW_ACCEL_SEC * 60) + 2; k++) {
      const r = stepEscortFollow(s); sp = r.speed; s = { ...s, x: r.x, y: r.y, speed: r.speed };
    }
    expect(sp).toBeCloseTo(130, 0);
  });
  it('止まる時は制動距離から減速し、目標でちょうど止まる(食い込まない・瞬停しない)', () => {
    const tgt = followBehindPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, profile.gapPx, profile.side);
    let s = mk({ x: tgt.x - 400, y: tgt.y, wakeAt: -1 });
    let prevSpeed = 0, maxDrop = 0, peak = 0, overshoot = 0;
    for (let k = 0; k < 600; k++) {
      const r = stepEscortFollow({ ...s, now: k * 16 });
      maxDrop = Math.max(maxDrop, prevSpeed - r.speed);
      peak = Math.max(peak, r.speed);
      overshoot = Math.max(overshoot, r.x - tgt.x);
      prevSpeed = r.speed;
      s = { ...s, x: r.x, y: r.y, speed: r.speed, wakeAt: r.wakeAt };
    }
    expect(Math.hypot(s.x - tgt.x, s.y - tgt.y)).toBeLessThanOrEqual(0.5); // 目標で止まった
    expect(overshoot).toBeLessThanOrEqual(0.01);                                                  // 食い込まない
    expect(peak).toBeCloseTo(130, 0);
    expect(maxDrop).toBeLessThanOrEqual((130 / FOLLOW_ACCEL_SEC) * (1 / 60) + 1e-6);              // 1フレームの減速は加速度の分まで(瞬停しない)
  });
  it('止まったフレームでは moved=false・speed=0(止めコマ)。小さなズレでは歩き出さない', () => {
    const tgt = followBehindPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, profile.gapPx, profile.side);
    const rest = stepEscortFollow(mk({ x: tgt.x + 5, y: tgt.y }));
    expect(rest.moved).toBe(false); expect(rest.speed).toBe(0);
    // 追いつかせて止める
    let s = mk({ x: tgt.x - 200, y: tgt.y, wakeAt: -1 });
    let lastMoved = true;
    for (let k = 0; k < 600; k++) {
      const r = stepEscortFollow({ ...s, now: k * 16 });
      lastMoved = r.moved;
      s = { ...s, x: r.x, y: r.y, speed: r.speed, wakeAt: r.wakeAt };
    }
    expect(lastMoved).toBe(false);
    expect(s.speed).toBe(0);
  });
  it('動くプレイヤーを追うと、最高速はプレイヤーの今の速さ×1.15を超えない。座標を平行移動しても同じ(画面端で変わらない)', () => {
    const vp = 104;
    const run = (ox: number, oy: number) => {
      let px = ox, s = mk({ x: ox - 150, y: oy, wakeAt: -1, followVmax: followSpeedCap(vp), player: { x: ox, y: oy } });
      let maxSp = 0; const trace: number[] = [];
      for (let k = 0; k < 600; k++) {
        px += vp / 60;
        const r = stepEscortFollow({ ...s, now: k * 16, player: { x: px, y: oy } });
        maxSp = Math.max(maxSp, r.speed); trace.push(r.speed);
        s = { ...s, x: r.x, y: r.y, speed: r.speed, wakeAt: r.wakeAt };
      }
      return { maxSp, trace, gap: px - s.x };
    };
    const a = run(0, 0), b = run(-48000, 31000); // 画面の端も世界の端も同じ
    expect(a.maxSp).toBeLessThanOrEqual(vp * FOLLOW_SPEED_MULT + 1e-6);
    expect(a.trace.length).toBe(b.trace.length);
    a.trace.forEach((v, k) => expect(b.trace[k]).toBeCloseTo(v, 6));
    expect(a.gap).toBeGreaterThan(0);
    // 定常では追いつき、プレイヤーと同じ速さで歩く
    expect(a.trace[a.trace.length - 1]).toBeCloseTo(vp, 0);
  });
  it('体が重なったら半歩(約20px)退く', () => {
    let s = mk({ x: 10, y: 0, wakeAt: -1, player: { x: 0, y: 0 }, playerDir: { x: 1, y: 0 } });
    // プレイヤーの体の中(10px)に居る=重なり
    expect(Math.hypot(s.x, s.y)).toBeLessThan(FOLLOW_OVERLAP_PX);
    expect(stepEscortFollow(s).yielding).toBe(true);
    let lastYieldX = s.x;
    for (let k = 0; k < 120; k++) {
      const r = stepEscortFollow({ ...s, now: k * 16 });
      if (!r.yielding) break;                     // 退く目標が終わった(重なりが解けた)
      lastYieldX = r.x;
      s = { ...s, x: r.x, y: r.y, speed: r.speed, wakeAt: r.wakeAt };
    }
    expect(lastYieldX - 10).toBeGreaterThan(FOLLOW_STEP_BACK_PX * 0.5); // プレイヤーから離れる向きへ動いた
    expect(Math.hypot(s.x, s.y)).toBeGreaterThanOrEqual(FOLLOW_OVERLAP_PX - 1); // 体が重ならない所まで離れた
  });
  it('プレイヤーの体の近くを通る時は横へ逸れ、体の中を突き抜けない', () => {
    // プレイヤーの向こう側(前)へ目標がある状況: プレイヤーは左向きへ動いた所(後ろ=右)で、軍人は左から来る
    const player = { x: 0, y: 0 };
    let s = mk({ x: -120, y: 0, wakeAt: -1, player, playerDir: { x: -1, y: 0 }, followVmax: 130 });
    let minD = Infinity;
    for (let k = 0; k < 600; k++) {
      const r = stepEscortFollow({ ...s, now: k * 16 });
      minD = Math.min(minD, Math.hypot(r.x - player.x, r.y - player.y));
      s = { ...s, x: r.x, y: r.y, speed: r.speed, wakeAt: r.wakeAt };
    }
    expect(minD).toBeGreaterThan(FOLLOW_OVERLAP_PX * 0.6);
  });
});

describe('区域を出た時(§2-4)', () => {
  it('見送り中は進行方向へ滑りながら減速して止まる(瞬停しない)。0.6秒後に拠点へ歩き出す', () => {
    const pauseUntil = 600;
    let s = mk({ state: 'return', x: 0, y: 0, speed: 130, pauseUntil, heading: { x: 1, y: 0 }, wakeAt: undefined });
    let prev = 130; let drop = 0; const x0 = s.x;
    let t = 0;
    for (; t < pauseUntil; t += 1000 / 60) {
      const r = stepEscortFollow({ ...s, now: t });
      expect(r.seeingOff).toBe(true);
      drop = Math.max(drop, prev - r.speed); prev = r.speed;
      s = { ...s, x: r.x, y: r.y, speed: r.speed, heading: { x: 1, y: 0 } };
    }
    expect(s.speed).toBe(0);                       // 見送りの間に止まった
    expect(s.x).toBeGreaterThan(x0);               // 少し滑った
    expect(s.x - x0).toBeLessThan(130 * 0.3);      // 制動距離の範囲
    expect(drop).toBeLessThanOrEqual((130 / FOLLOW_ACCEL_SEC) / 60 + 1e-6);
    // 見送りが明けたら拠点(+x)へ歩く。帰る時は反応の遅れなしで、速さは0から立ち上がる
    const r2 = stepEscortFollow({ ...s, now: pauseUntil + 1 });
    expect(r2.seeingOff).toBe(false);
    expect(r2.moved).toBe(true);
    expect(r2.speed).toBeLessThan(73 * 0.1);
    let q = { ...s, now: pauseUntil + 1 };
    for (let k = 0; k < 120; k++) { const r = stepEscortFollow(q); q = { ...q, x: r.x, y: r.y, speed: r.speed, now: q.now + 16 }; }
    expect(q.speed).toBeCloseTo(73, 0);            // 帰る速さ=今の前進と同じ
    expect(q.x).toBeGreaterThan(s.x + 50);
  });
  it('帰る時は拠点の円の手前で止まらない(巡回へ速さを引き継ぐ)', () => {
    const s = mk({ state: 'return', x: 4500, y: 0, speed: 73, pauseUntil: 0, now: 10 });
    const r = stepEscortFollow(s);
    expect(r.speed).toBeCloseTo(73, 5);
  });
});

describe('回復(§5b S-1)', () => {
  const e = { health: 30, maxHealth: 100, lastHitAt: 1000 } as { health: number; maxHealth: number; lastHitAt?: number; downedAt?: number };
  it('直近の被弾から8秒は回復しない。過ぎたら毎秒最大体力の3%', () => {
    expect(followHeal(e, 'follow', 1000 + FOLLOW_HEAL_DELAY_MS - 1, 1)).toBe(30);
    expect(followHeal(e, 'follow', 1000 + FOLLOW_HEAL_DELAY_MS, 1)).toBeCloseTo(30 + 100 * FOLLOW_HEAL_PER_SEC, 8);
    expect(followHeal(e, 'follow', 20000, 1 / 60)).toBeCloseTo(30 + 3 / 60, 8);
  });
  it('倒れている間・帰る間・ついてこない間は回復しない/最大を超えない/被弾歴なしでも回復する', () => {
    expect(followHeal({ ...e, downedAt: 5 }, 'follow', 20000, 1)).toBe(30);
    expect(followHeal(e, 'return', 20000, 1)).toBe(30);
    expect(followHeal(e, undefined, 20000, 1)).toBe(30);
    expect(followHeal({ ...e, health: 99 }, 'follow', 20000, 5)).toBe(100);
    expect(followHeal({ health: 50, maxHealth: 100 }, 'follow', 0, 1)).toBeGreaterThan(50);
    expect(followHeal({}, 'follow', 20000, 1)).toBeUndefined(); // M0の随行(体力なし)は何もしない
  });
});

describe('台詞(§2-3)', () => {
  it('解放の直後(3秒以内)は出さない。それ以降・解放時刻が無ければ出す', () => {
    expect(followLineMuted(1000, 1000 + FOLLOW_LINE_MUTE_AFTER_CAPTURE_MS - 1)).toBe(true);
    expect(followLineMuted(1000, 1000 + FOLLOW_LINE_MUTE_AFTER_CAPTURE_MS)).toBe(false);
    expect(followLineMuted(undefined, 5)).toBe(false);
  });
});

describe('nextFollowHeading(検収D1 A-2: その場の向き替えで目標点が跳ばない)', () => {
  it('同じ向きへ30px動いた時だけ更新し、その場の小刻みな動きでは変わらない', async () => {
    const { nextFollowHeading, FOLLOW_HEADING_STEP_PX } = await import('./escortFollow');
    let h = nextFollowHeading(undefined, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(h.dx).toBe(1);
    // ±8px で左右に揺れる(戦闘のシャッフル)
    for (let i = 0; i < 20; i++) h = nextFollowHeading(h, { x: i % 2 ? 8 : -8, y: 0 }, { x: i % 2 ? 1 : -1, y: 0 });
    expect(h.dx).toBe(1);
    h = nextFollowHeading(h, { x: 0, y: -FOLLOW_HEADING_STEP_PX - 1 }, { x: 0, y: -1 });
    expect(h.dy).toBeLessThan(-0.9);
  });
});

describe('stepFollowMachine 自己回復(検収R2 A-1)', () => {
  it('状態が消えていても、解放済みで区域の外・拠点の外なら帰る(巡回の枝へ遠くから入らない)', async () => {
    const { stepFollowMachine } = await import('./escortFollow');
    const r = stepFollowMachine({ captured: true, zoneIn: false, prev: undefined, inBaseCircle: false, now: 1000, pauseUntil: undefined } as never);
    expect(r.state).toBe('return');
    expect(r.started).toBe(false);
    const inside = stepFollowMachine({ captured: true, zoneIn: false, prev: undefined, inBaseCircle: true, now: 1000, pauseUntil: undefined } as never);
    expect(inside.state).toBeUndefined();
  });
});
