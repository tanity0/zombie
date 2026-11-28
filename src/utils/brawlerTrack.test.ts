// ★追尾の原則(research/BRAWLER.md §40-4・§39)の純関数: 当たる高さ(utils/brawlerHitHeight)と、プレイヤーの自分の高さ(utils/brawler の brawlerSelfHeightPx)。
// 実際のストアで回す受け入れ条件は store/brawlerTrack.store.test.ts。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initialBrawlerState, brawlerStartTech, brawlerStartAttack, brawlerAfterResolve, brawlerFinish, brawlerSelfHeightPx, brawlerSelfHovering, brawlerCarryAir,
  brawlerAirAllowsTech, brawlerAirAllowsStage, brawlerAirKikoLocked, brawlerHurtCutHover, brawlerKickHovers, brawlerHoverRecoveryMs, brawlerAirFallPx,
  BRAWLER_KICK1_AIR_PX, BRAWLER_KICK2_AIR_PX, BRAWLER_KICKUP_AIR_PX, BRAWLER_AIR_HOVER_MS, BRAWLER_AIR_HOVER_SINK_PX, BRAWLER_HEEL_AIR_PX, BRAWLER_KICK_MAX,
  BRAWLER_TECHS, BRAWLER_TEMPO_DEFAULT, BRAWLER_LIFT_VIS_BODY_K, type BrawlerState,
} from './brawler';
import { setBrawlerTempoAll } from './brawlerCombo';
import {
  brawlerEnemyHitRel, brawlerHitBandOf, brawlerInHitBand, brawlerHitBandMax, BRAWLER_HIT_REL_GROUND_MAX, BRAWLER_HIT_REL_KICK1_MAX,
} from './brawlerHitHeight';
import { BRAWLER_KICKUP_LIFT_K } from './brawlerCombo';

beforeAll(() => setBrawlerTempoAll(1.3));
afterAll(() => setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT));

const lifted = (peak: number, at = 1000, ms = 1000) => ({ brawlerLiftAt: at, brLiftMs: ms, brLiftPeak: peak, brLiftFrom: 0, brLiftUntil: at + ms });

describe('§40-4 ①② 判定用の敵の高さ r(格闘の浮きだけ・体の大きさ/画面の寸法を使わない)', () => {
  it('r=浮きの倍率×BRAWLER_LIFT_VIS_BODY_K。地上=0・鞭の浮きは格闘の判定に関わらない(0)', () => {
    expect(brawlerEnemyHitRel({}, 5000)).toBe(0);
    const e = lifted(1);
    expect(brawlerEnemyHitRel(e, 1000 + 0.18 * 1000)).toBeCloseTo(1 * BRAWLER_LIFT_VIS_BODY_K, 6); // 打ち上がりの頂点
    expect(brawlerEnemyHitRel({ ...e, brLiftShape: 'whip' as const }, 1180)).toBe(0);
    expect(brawlerEnemyHitRel(e, 2500)).toBe(0); // 着地した後
  });
  it('蹴り上げの打ち上げ(地上から)は約0.67=地上の技(0.58)の外・3段目の打ち上げの頂点(0.45)は飛び蹴り1発目(0.45)の内', () => {
    const kickUpTop = 0.7 * BRAWLER_KICKUP_LIFT_K * BRAWLER_LIFT_VIS_BODY_K;
    expect(kickUpTop).toBeCloseTo(0.672, 3);
    expect(kickUpTop).toBeGreaterThan(BRAWLER_HIT_REL_GROUND_MAX);
    expect(0.75 * BRAWLER_LIFT_VIS_BODY_K).toBeLessThanOrEqual(BRAWLER_HIT_REL_KICK1_MAX + 1e-9);
    expect(BRAWLER_HIT_REL_KICK1_MAX).toBeLessThan(BRAWLER_HIT_REL_GROUND_MAX);
  });
  it('技ごとの帯(§40-4 ①の表)', () => {
    for (const n of ['s3', 's4', 's5', 'gouge', 'stomp', 'mogura'] as const) expect(brawlerHitBandOf(n, true), n).toBe('ground');
    expect(brawlerHitBandOf('s1', false)).toBe('ground');
    expect(brawlerHitBandOf('s2', true)).toBe('any'); // 空中で出した1・2段は高さで分けない
    expect(brawlerHitBandOf('kick1', false)).toBe('kick1');
    for (const n of ['kick2', 'kick3', 'heel', 'kickup', 'kiko'] as const) expect(brawlerHitBandOf(n, false), n).toBe('any');
    expect(brawlerHitBandMax('any')).toBe(Infinity);
    const e = lifted(1.12, 1000, 1000);
    const t = 1180; // 頂点(r≈0.67)
    expect(brawlerInHitBand(e, t, 'ground')).toBe(false);
    expect(brawlerInHitBand(e, t, 'kick1')).toBe(false);
    expect(brawlerInHitBand(e, t, 'any')).toBe(true);
    expect(brawlerInHitBand(lifted(0.9), 1180, 'ground')).toBe(true); // r 0.54
  });
});

/** 蹴りを n 発目として、空中(高さ h0)から出した状態(store が書く airFromPx・滞空の後隙も同じに)。 */
const kickState = (t: number, kickN: number, h0: number, o: { heel?: boolean; up?: boolean } = {}): BrawlerState => {
  const s = brawlerStartTech({ ...initialBrawlerState(), points: 20 }, 'kick', t, kickN, false, !!o.heel, !!o.up);
  return { ...s, airFromPx: h0 > 0 ? h0 : undefined, recoveryMs: brawlerKickHovers(s) ? brawlerHoverRecoveryMs(s.recoveryMs) : s.recoveryMs };
};
const hit = (s: BrawlerState): BrawlerState => brawlerAfterResolve(s, s.startAt + s.windupMs, 1, { pointCap: 20, countPoint: false, hitstopMs: 0 });

describe('§40-4 ④ プレイヤーの自分の高さ(技ごとの決まった高さ・相手に合わせない)', () => {
  it('飛び蹴り1発目: 当たる瞬間に28px・後隙で着地。空中から出した時はその高さから28pxへ', () => {
    const s = kickState(1000, 1, 0);
    expect(brawlerSelfHeightPx(s, 1000)).toBe(0);
    expect(brawlerSelfHeightPx(s, 1000 + s.windupMs)).toBeCloseTo(BRAWLER_KICK1_AIR_PX, 6);
    expect(brawlerSelfHeightPx(s, 1000 + s.windupMs + s.recoveryMs)).toBeCloseTo(0, 6);
    const a = kickState(1000, 1, 70);
    expect(brawlerSelfHeightPx(a, 1000)).toBeCloseTo(70, 6);
    expect(brawlerSelfHeightPx(a, 1000 + a.windupMs)).toBeCloseTo(BRAWLER_KICK1_AIR_PX, 6);
  });
  it('空中蹴り(2発目): 96pxまで上がり、後隙(=滞空 450ms×係数)の前半は一定・後半わずかに沈む', () => {
    const s = hit(kickState(1000, 2, 28));
    expect(s.recoveryMs).toBe(BRAWLER_AIR_HOVER_MS);
    const h = (dt: number) => brawlerSelfHeightPx(s, 1000 + s.windupMs + dt);
    expect(h(0)).toBeCloseTo(BRAWLER_KICK2_AIR_PX, 6);
    expect(h(BRAWLER_AIR_HOVER_MS * 0.6)).toBeCloseTo(BRAWLER_KICK2_AIR_PX, 6);
    expect(h(BRAWLER_AIR_HOVER_MS)).toBeCloseTo(BRAWLER_KICK2_AIR_PX - BRAWLER_AIR_HOVER_SINK_PX, 6);
    expect(brawlerSelfHovering(s, 1000 + s.windupMs + 10)).toBe(true);
    expect(brawlerSelfHovering(s, 1000 + s.windupMs - 10)).toBe(false);
    // 上りは加速→減速(慣性): 途中で一定の速さにならない
    const r = [0.1, 0.5, 0.9].map(f => brawlerSelfHeightPx(s, 1000 + s.windupMs * f));
    expect(r[1] - r[0]).toBeGreaterThan(r[2] - r[1]);
  });
  it('蹴り上げ: 出した高さで構え、振り上げで120pxへ・その後滞空。蹴り飛ばし(3発目): いまの高さのまま蹴り、後隙で落ちる', () => {
    const u = hit(kickState(1000, BRAWLER_KICK_MAX, 96, { up: true }));
    expect(brawlerSelfHeightPx(u, 1000 + 1)).toBeCloseTo(96, 6);
    expect(brawlerSelfHeightPx(u, 1000 + u.windupMs)).toBeCloseTo(BRAWLER_KICKUP_AIR_PX, 6);
    expect(brawlerSelfHovering(u, 1000 + u.windupMs + 50)).toBe(true);
    const k3 = hit(kickState(1000, BRAWLER_KICK_MAX, 96));
    expect(brawlerKickHovers(k3)).toBe(false);
    expect(brawlerSelfHeightPx(k3, 1000 + k3.windupMs)).toBeCloseTo(96, 6);
    expect(brawlerSelfHeightPx(k3, 1000 + k3.windupMs + 100)).toBeCloseTo(brawlerAirFallPx(96, 0, 100), 6);
  });
  it('踵落とし: 出した時の自分の高さで振り下ろす(地上から出した時は下限30px)', () => {
    const a = kickState(1000, BRAWLER_KICK_MAX, 96, { heel: true });
    expect(brawlerSelfHeightPx(a, 1000 + a.windupMs)).toBeCloseTo(96, 6);
    const g = kickState(1000, BRAWLER_KICK_MAX, 0, { heel: true });
    expect(brawlerSelfHeightPx(g, 1000 + g.windupMs)).toBeCloseTo(BRAWLER_HEEL_AIR_PX, 6);
  });
  it('空中の気功: 撃つ間はその高さで止まり、撃った後は落ちる。空中の1・2段: 出した高さのまま', () => {
    const k = { ...brawlerStartTech({ ...initialBrawlerState(), points: 20 }, 'kiko', 1000), airFromPx: 90, airKiko: true };
    expect(brawlerSelfHeightPx(k, 1000 + k.windupMs - 1)).toBe(90);
    expect(brawlerSelfHeightPx(k, 1000 + k.windupMs + 120)).toBeCloseTo(brawlerAirFallPx(90, 0, 120), 6);
    expect(brawlerAirKikoLocked(k, 1000 + k.windupMs + 120)).toBe(true);
    const a = { ...brawlerStartAttack(initialBrawlerState(), 1, 1000, false), airFromPx: 50 };
    expect(brawlerSelfHeightPx(a, 1050)).toBe(50);
  });
  it('空中から出した地割り: 溜めの前半で真下へ落ちて着地(当たる時は地面)', () => {
    const s = { ...brawlerStartTech({ ...initialBrawlerState(), points: 20 }, 'stomp', 1000), airFromPx: 96 };
    expect(brawlerSelfHeightPx(s, 1000)).toBeCloseTo(96, 6);
    expect(brawlerSelfHeightPx(s, 1000 + s.windupMs * 0.5)).toBe(0);
    expect(brawlerSelfHeightPx(s, 1000 + s.windupMs)).toBe(0);
  });
});

describe('§40-4 ④⑧ 行動の切り替わりでの高さの持ち越し(brawlerCarryAir)・空中で出せる技', () => {
  it('新しい行動はその瞬間の高さを持つ・空中で終わった行動は待機の落下へ(高さと速さを持ち越す)', () => {
    const k2 = hit(kickState(1000, 2, 28));
    const tEnd = 1000 + k2.windupMs + k2.recoveryMs;
    const fin = brawlerFinish(k2, tEnd).state;
    const idle = brawlerCarryAir(k2, fin, tEnd);
    expect(idle.airFall?.fromPx).toBeCloseTo(brawlerSelfHeightPx(k2, tEnd), 6);
    expect(brawlerSelfHeightPx(idle, tEnd)).toBeCloseTo(idle.airFall!.fromPx, 6);
    expect(brawlerSelfHeightPx(idle, tEnd + 100)).toBeLessThan(idle.airFall!.fromPx);
    expect(brawlerSelfHeightPx(idle, tEnd + 2000)).toBe(0);
    // 落下の途中で出した1段目は、その高さを持つ
    const t2 = tEnd + 60;
    const atk = brawlerCarryAir(idle, brawlerStartAttack(idle, 1, t2, false), t2);
    expect(atk.airFromPx).toBeCloseTo(brawlerSelfHeightPx(idle, t2), 6);
    expect(atk.airFall).toBeUndefined();
    // 地上で始めた行動は空中の印を持たない
    const g = brawlerCarryAir(initialBrawlerState(), brawlerStartAttack(initialBrawlerState(), 1, 10, false), 10);
    expect(g.airFromPx).toBeUndefined();
    expect(g.airKiko).toBeUndefined();
  });
  it('§39 の a: 空中で出せるのは飛び蹴り(全部)・地割り/土竜・気功・1・2段。構えは出ない(2発目の続きの上=蹴り上げは蹴りとして出る)', () => {
    expect(['kick', 'stomp', 'kiko'].every(k => brawlerAirAllowsTech(k as 'kick'))).toBe(true);
    expect(brawlerAirAllowsTech('guard')).toBe(false);
    expect(brawlerAirAllowsTech('gouge')).toBe(false);
    expect([1, 2, 3, 4, 5].map(brawlerAirAllowsStage)).toEqual([true, true, false, false, false]);
  });
  it('滞空中に食らう=滞空が切れて、いまの高さから落ちる', () => {
    const k2 = hit(kickState(1000, 2, 28));
    const t = 1000 + k2.windupMs + 100;
    const cut = brawlerHurtCutHover(k2, t);
    expect(cut.phase).toBe('idle');
    expect(cut.airFall?.fromPx).toBeCloseTo(BRAWLER_KICK2_AIR_PX, 6);
    // 滞空の外(前隙の間)は今の被弾の扱いのまま(行動は続く)
    expect(brawlerHurtCutHover(k2, 1000 + 10)).toBe(k2);
  });
  it('飛ぶ時間は技ごとに固定(距離から出さない): 蹴りの前隙は技の表のまま', () => {
    expect(kickState(1000, 1, 0).windupMs).toBe(BRAWLER_TECHS.kick.windupMs);
  });
});
