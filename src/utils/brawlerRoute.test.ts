// ★KOF のようなつながり(research/BRAWLER.md §19・社長承認2026-11-10「KOFの案は はい」)の純関数。受け入れ条件 §19-4 の1。
//   道の表(表のとおりに許す・それ以外は許さない)/当たっていない技・通常からは取り消せない/受付の外は取り消せない/
//   道に無い技の先行入力は覚えない/構えは待機と秘奥義の締めだけ/ステップの取り消しは当たった1〜4段目だけ/
//   ①の長さと②の延ばす先(段・飛び蹴り・気功の距離・大踏み潰し)。実際の AI を回す側は store/brawlerLink.store.test.ts。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { BrawlerRouteNode, BrawlerState, BrawlerTechKind } from './brawlerTypes';
import {
  BRAWLER_TEMPO_DEFAULT, BRAWLER_CANCEL_WINDOW_MS, BRAWLER_HITSTOP, BRAWLER_KICK_HITSTOP_MS, BRAWLER_STOMP_HITSTOP_MS, BRAWLER_TECHS, BRAWLER_KIKO_SPEED,
  BRAWLER_KICK3_CHARGE_MS, BRAWLER_KICK_CHAIN_MS,
  brawlerRouteAllows, brawlerRouteNodeOf, brawlerStageNode, brawlerTechNode, brawlerSecretClosing, brawlerHitLanded, brawlerCancelWindowOpen,
  brawlerTechCancelOk, brawlerTechAllowed, brawlerShouldBufferTech, brawlerTechBufferDecision, brawlerStepAllowed, brawlerSecretCarry,
  brawlerStartAttack, brawlerStartTech, brawlerAfterResolve, brawlerFinish, brawlerStageSpec, initialBrawlerState, brawlerKickFlightMs,
} from './brawler';
import {
  setBrawlerTempoAll, BRAWLER_HOLD_FRAME_MARGIN_MS, BRAWLER_CHAIN_GUARD_MARGIN_MS, BRAWLER_COMBO_END_NO_HOLD_BOSS_MS, BRAWLER_COMBO_END_NO_HOLD_STRONG_MS,
  brawlerLockHitMs, brawlerLockIsCloser, brawlerLockHolds, brawlerLockOnHit, brawlerLockExtendPatch, brawlerLockCutPatch, brawlerComboEndPatch,
  brawlerLockAlive, brawlerHoldClockAlive, brawlerHoldRemainMs, brawlerHeldNow, brawlerNoHoldNow, brawlerComboEndNoHoldNow, brawlerKikoTravelMs,
  brawlerJugglePush, BRAWLER_JUGGLE_DROP_MS, BRAWLER_DOWN_NO_HOLD_MS,
  type BrawlerMoveKey,
} from './brawlerCombo';

beforeAll(() => { setBrawlerTempoAll(1.3); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

const NODES: readonly BrawlerRouteNode[] = ['idle', 's1', 's2', 's3', 's4', 's5', 'kick1', 'kick2', 'kick3', 'stomp', 'kiko', 'guard'];
/** §19-1 の表(テストの側にも書く=表を書き換えたら必ずここも見ることになる)。 */
const TABLE: Readonly<Record<BrawlerRouteNode, readonly BrawlerRouteNode[]>> = {
  idle: NODES.filter(n => n !== 'idle'),
  s1: ['s2', 'kick1'], s2: ['s3', 'kiko'], s3: ['s4', 'kick1'], s4: ['s5', 'stomp'], s5: [],
  kick1: ['kick2', 'stomp'], kick2: ['kick3', 'stomp'], kick3: [],
  stomp: ['kiko'], kiko: [], guard: ['guard'],
};
const HS = { s1: BRAWLER_HITSTOP.weak, s2: BRAWLER_HITSTOP.weak, s3: BRAWLER_HITSTOP.strong, s4: BRAWLER_HITSTOP.strong, s5: BRAWLER_HITSTOP.closer } as const;

/** 段を始めて判定を解いた状態(t0 から・hits=触れた数・landed=体力を削った数)。 */
const stageHit = (stage: number, hits = 1, landed = hits, t0 = 1000): { s: BrawlerState; at: number; hs: number } => {
  const a = brawlerStartAttack(initialBrawlerState(), stage, t0, false);
  const at = t0 + a.windupMs;
  const hs = brawlerStageSpec(stage).hitstopMs;
  return { s: brawlerAfterResolve(a, at, hits, { pointCap: 20, countPoint: true, hitstopMs: hs, landed }), at, hs };
};
const techHit = (kind: BrawlerTechKind, kickN = 1, hits = 1, landed = hits, base: BrawlerState = initialBrawlerState(), t0 = 1000) => {
  const a = brawlerStartTech(base, kind, t0, kind === 'kick' ? kickN : 0);
  const at = t0 + a.windupMs;
  const hs = kind === 'stomp' ? BRAWLER_STOMP_HITSTOP_MS : kind === 'kick' ? BRAWLER_KICK_HITSTOP_MS[kickN] : 0;
  const r = brawlerAfterResolve(a, at, hits, { pointCap: 20, countPoint: false, hitstopMs: hs, landed });
  return { s: kind === 'kick' ? { ...r, kickCount: kickN >= 3 ? 0 : kickN, kickChainUntil: kickN >= 3 ? 0 : at + BRAWLER_KICK_CHAIN_MS } : r, at, hs };
};

describe('道の表(§19-1)', () => {
  it('表のとおりに許す・それ以外は許さない(全ての組)', () => {
    for (const from of NODES) for (const to of NODES) {
      if (to === 'idle') continue;
      expect(brawlerRouteAllows(from, to), `${from}→${to}`).toBe(TABLE[from].includes(to));
    }
  });
  it('気功→構えは、秘奥義の入力の締め(順番が3つ進んでいる)の時だけ', () => {
    expect(brawlerRouteAllows('kiko', 'guard')).toBe(false);
    expect(brawlerRouteAllows('kiko', 'guard', { secretClose: false })).toBe(false);
    expect(brawlerRouteAllows('kiko', 'guard', { secretClose: true })).toBe(true);
    expect(brawlerRouteAllows('stomp', 'guard', { secretClose: true })).toBe(false); // 締めの時でも気功からだけ
    expect([0, 1, 2, 3].map(p => brawlerSecretClosing({ secretProgress: p }))).toEqual([false, false, false, true]);
  });
  it('節の引き方: 段・飛び蹴りの何発目か・技・待機', () => {
    expect([1, 2, 3, 4, 5].map(brawlerStageNode)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect([1, 2, 3].map(n => brawlerTechNode('kick', n))).toEqual(['kick1', 'kick2', 'kick3']);
    expect((['stomp', 'kiko', 'guard'] as const).map(k => brawlerTechNode(k))).toEqual(['stomp', 'kiko', 'guard']);
    expect(brawlerRouteNodeOf(initialBrawlerState())).toBe('idle');
    expect(brawlerRouteNodeOf(stageHit(3).s)).toBe('s3');
    expect(brawlerRouteNodeOf(techHit('kick', 2).s)).toBe('kick2');
    expect(brawlerRouteNodeOf(techHit('stomp').s)).toBe('stomp');
  });
});

describe('取り消しの受付と「当たった時だけ」(§19-1・§19-2)', () => {
  it('受付=止めが明けた瞬間から 150ms×係数(195ms)。止めの間・受付の外は閉じている', () => {
    expect(BRAWLER_CANCEL_WINDOW_MS).toBe(195);
    const { s, at, hs } = stageHit(1);
    expect(brawlerCancelWindowOpen(s, at + hs - 1)).toBe(false);              // 止めの間
    expect(brawlerCancelWindowOpen(s, at + hs)).toBe(true);                   // 明けた瞬間
    expect(brawlerCancelWindowOpen(s, at + hs + BRAWLER_CANCEL_WINDOW_MS - 1)).toBe(true);
    expect(brawlerCancelWindowOpen(s, at + hs + BRAWLER_CANCEL_WINDOW_MS)).toBe(false);
    expect(brawlerCancelWindowOpen(brawlerStartAttack(initialBrawlerState(), 1, 0, false), 30)).toBe(false); // 判定の前
    expect(brawlerCancelWindowOpen(initialBrawlerState(), 0)).toBe(false);
  });
  it('通常→技: 道の上・当たった・受付の内 の3つが揃った時だけ(段ごとの道の先)', () => {
    const want: Record<number, readonly BrawlerTechKind[]> = { 1: ['kick'], 2: ['kiko'], 3: ['kick'], 4: ['stomp'], 5: [] };
    for (const stage of [1, 2, 3, 4, 5]) {
      const { s, at, hs } = stageHit(stage);
      const mid = at + hs + 20;
      for (const k of ['kick', 'stomp', 'kiko', 'guard'] as const) {
        const onRoute = want[stage].includes(k);
        expect(brawlerTechAllowed(s, k, mid), `${stage}段目→${k}`).toBe(onRoute);
        expect(brawlerTechCancelOk(s, k, mid), `${stage}段目→${k}`).toBe(onRoute);
        expect(brawlerTechAllowed(s, k, at + 10), `${stage}段目→${k} 止めの間`).toBe(false);
        expect(brawlerTechAllowed(s, k, at + hs + BRAWLER_CANCEL_WINDOW_MS), `${stage}段目→${k} 受付の外`).toBe(false);
      }
      // 当たっていない(空振り・レバーガードで防がれた)通常からは取り消せない
      for (const k of want[stage]) {
        expect(brawlerTechAllowed(stageHit(stage, 0).s, k, mid), `${stage}段目 空振り→${k}`).toBe(false);
        expect(brawlerTechAllowed(stageHit(stage, 1, 0).s, k, mid), `${stage}段目 防がれた→${k}`).toBe(false);
      }
      // 出だし(判定の前)からは何も出せない(旧: 通常攻撃のどこからでも技が出せた)
      const pre = brawlerStartAttack(initialBrawlerState(), stage, 1000, false);
      for (const k of ['kick', 'stomp', 'kiko', 'guard'] as const) expect(brawlerTechAllowed(pre, k, 1010)).toBe(false);
    }
  });
  it('技→技: 飛び蹴り1・2発目→大踏み潰し / 大踏み潰し→気功 だけ(当たった時・受付の内)', () => {
    for (const n of [1, 2]) {
      const { s, at, hs } = techHit('kick', n);
      expect(brawlerTechAllowed(s, 'stomp', at + hs + 1)).toBe(true);
      expect(brawlerTechAllowed(s, 'kiko', at + hs + 1)).toBe(false);
      expect(brawlerTechAllowed(s, 'guard', at + hs + 1)).toBe(false);
      expect(brawlerTechAllowed(techHit('kick', n, 0).s, 'stomp', at + hs + 1)).toBe(false);     // 空振り
      expect(brawlerTechAllowed(techHit('kick', n, 1, 0).s, 'stomp', at + hs + 1)).toBe(false);  // 防がれた
      expect(brawlerTechAllowed(s, 'stomp', at + hs + BRAWLER_CANCEL_WINDOW_MS)).toBe(false);    // 受付の外
    }
    const k3 = techHit('kick', 3);
    for (const k of ['kick', 'stomp', 'kiko', 'guard'] as const) expect(brawlerTechAllowed(k3.s, k, k3.at + k3.hs + 1), `3発目→${k}`).toBe(false);
    const st = techHit('stomp');
    expect(brawlerTechAllowed(st.s, 'kiko', st.at + st.hs + 1)).toBe(true);
    for (const k of ['kick', 'stomp', 'guard'] as const) expect(brawlerTechAllowed(st.s, k, st.at + st.hs + 1), `大踏み潰し→${k}`).toBe(false);
  });
  it('飛び蹴りの連続の出せる条件は今どおり(判定の後・当たっていなくても・止めの間も)', () => {
    for (const n of [1, 2]) {
      expect(brawlerTechAllowed(techHit('kick', n).s, 'kick', 1000 + BRAWLER_TECHS.kick.windupMs + 5)).toBe(true);
      expect(brawlerTechAllowed(techHit('kick', n, 0).s, 'kick', 1000 + BRAWLER_TECHS.kick.windupMs + 5)).toBe(true);
    }
    expect(brawlerTechAllowed(brawlerStartTech(initialBrawlerState(), 'kick', 1000, 1), 'kick', 1010)).toBe(false); // 判定の前
  });
  it('構えは待機と秘奥義の締め(気功から・順番が3つ進んでいる時)だけ。気功は当たりを問わない(撃った時点で受付が開く)', () => {
    expect(brawlerTechAllowed(initialBrawlerState(), 'guard', 0)).toBe(true);
    const base = { ...initialBrawlerState(), secretProgress: 3 };
    const k = brawlerStartTech(base, 'kiko', 1000);
    const fired: BrawlerState = { ...k, resolved: true, secretProgress: 3 }; // 気功は弾=connected は付かない
    expect(brawlerTechAllowed({ ...k, secretProgress: 3 }, 'guard', 1050)).toBe(false);                          // 撃つ前
    expect(brawlerTechAllowed(fired, 'guard', 1000 + k.windupMs)).toBe(true);                                    // 撃った瞬間から
    expect(brawlerTechAllowed(fired, 'guard', 1000 + k.windupMs + BRAWLER_CANCEL_WINDOW_MS - 1)).toBe(true);
    expect(brawlerTechAllowed(fired, 'guard', 1000 + k.windupMs + BRAWLER_CANCEL_WINDOW_MS)).toBe(false);        // 受付の外
    expect(brawlerTechAllowed({ ...fired, secretProgress: 2 }, 'guard', 1000 + k.windupMs + 10)).toBe(false);    // 締めの時ではない
    expect(brawlerTechAllowed({ ...fired, secretProgress: 0 }, 'guard', 1000 + k.windupMs + 10)).toBe(false);
    for (const x of ['kick', 'stomp', 'kiko'] as const) expect(brawlerTechAllowed(fired, x, 1000 + k.windupMs + 10)).toBe(false);
    // 構えの間は構えの延長だけ
    const g = brawlerStartTech(initialBrawlerState(), 'guard', 1000);
    expect(brawlerTechAllowed(g, 'guard', 1100)).toBe(true);
    for (const x of ['kick', 'stomp', 'kiko'] as const) expect(brawlerTechAllowed(g, x, 1100)).toBe(false);
  });
  it('「当たった」= 判定を解いて体力を削った当たり', () => {
    expect(brawlerHitLanded(stageHit(1).s)).toBe(true);
    expect(brawlerHitLanded(stageHit(1, 0).s)).toBe(false);
    expect(brawlerHitLanded(stageHit(1, 1, 0).s)).toBe(false);
    expect(brawlerHitLanded(brawlerStartAttack(initialBrawlerState(), 1, 0, false))).toBe(false);
  });
});

describe('技の先行入力(§19-2)', () => {
  it('入れた時点で道に無い技は覚えない。道の上の技は出だし・止めの間に覚え、受付が開いた瞬間に出る', () => {
    const pre = brawlerStartAttack(initialBrawlerState(), 3, 1000, false);
    expect(brawlerShouldBufferTech(pre, 'kick', 1010)).toBe(true);
    for (const k of ['stomp', 'kiko', 'guard'] as const) expect(brawlerShouldBufferTech(pre, k, 1010), k).toBe(false);
    const { s, at, hs } = stageHit(3);
    const b = { ...s, techBuffer: 'kick' as const };
    expect(brawlerShouldBufferTech(s, 'kick', at + 10)).toBe(true);                // 止めの間
    expect(brawlerTechBufferDecision(b, at + 10)).toBe('wait');
    expect(brawlerTechBufferDecision(b, at + hs)).toBe('fire');                    // 受付が開いた瞬間
    expect(brawlerShouldBufferTech(s, 'kick', at + hs + BRAWLER_CANCEL_WINDOW_MS + 5)).toBe(false); // 受付を過ぎたら覚えない
  });
  it('当たらなかった(空振り・防がれた)時は捨てる・待機へ戻っても出さない', () => {
    for (const landed of [0]) for (const hits of [0, 1]) {
      const { s, at } = stageHit(3, hits, landed);
      const b = { ...s, techBuffer: 'kick' as const };
      expect(brawlerTechBufferDecision(b, at + 1)).toBe('drop');
      expect(brawlerShouldBufferTech(s, 'kick', at + 1)).toBe(false);
    }
    const fin = brawlerFinish({ ...stageHit(3).s, techBuffer: 'kick' as const }, 3000).state;
    expect(brawlerTechBufferDecision({ ...fin, techBuffer: 'kick' }, 3000)).toBe('drop');
  });
  it('秘奥義の入力の持ち越し: 順番どおりの次の技だけは、受付の外(受付を過ぎた後・当たらなかった時)でも覚える=後隙の終わりに待機から出す', () => {
    // 大踏み潰し(順番が2つ進んでいる)→ 気功: 受付を過ぎた後
    const st = techHit('stomp', 0, 1, 1, { ...initialBrawlerState(), secretProgress: 1 });
    const stomp = { ...st.s, secretProgress: 2 };
    const after = st.at + st.hs + BRAWLER_CANCEL_WINDOW_MS + 30;
    expect(brawlerTechAllowed(stomp, 'kiko', after)).toBe(false);          // 受付の外=いまは出ない
    expect(brawlerSecretCarry(stomp, 'kiko')).toBe(true);
    expect(brawlerShouldBufferTech(stomp, 'kiko', after)).toBe(true);       // 覚える
    expect(brawlerTechBufferDecision({ ...stomp, techBuffer: 'kiko' }, after)).toBe('wait'); // 後隙の間は出ない(呼び手が待機へ戻った瞬間に出す)
    expect(brawlerShouldBufferTech(stomp, 'kick', after)).toBe(false);      // 順番の外は覚えない
    expect(brawlerShouldBufferTech(stomp, 'guard', after)).toBe(false);
    // 順番が進んでいない大踏み潰し(秘奥義を狙っていない)では覚えない
    expect(brawlerShouldBufferTech({ ...stomp, secretProgress: 0 }, 'kiko', after)).toBe(false);
    expect(brawlerSecretCarry({ ...stomp, secretProgress: 0 }, 'kiko')).toBe(false);
    // 当たらなかった大踏み潰し(順番は進んでいる=1手目の蹴りは当たっている)でも、次の気功は覚える(今どおり)
    const miss = { ...techHit('stomp', 0, 0, 0, { ...initialBrawlerState(), secretProgress: 1 }).s, secretProgress: 2 };
    expect(brawlerShouldBufferTech(miss, 'kiko', st.at + 50)).toBe(true);
    // 気功(順番が3つ進んでいる)→ 構え: 受付を過ぎた後
    const k = { ...brawlerStartTech({ ...initialBrawlerState(), secretProgress: 3 }, 'kiko', 1000), secretProgress: 3, resolved: true };
    const late = 1000 + k.windupMs + BRAWLER_CANCEL_WINDOW_MS + 30;
    expect(brawlerTechAllowed(k, 'guard', late)).toBe(false);
    expect(brawlerShouldBufferTech(k, 'guard', late)).toBe(true);
    expect(brawlerSecretCarry(k, 'guard')).toBe(true);
    expect(brawlerSecretCarry(k, 'stomp')).toBe(false);
    expect(brawlerSecretCarry(initialBrawlerState(), 'kick')).toBe(false);
  });
  it('秘奥義の締め: 気功の出だしに入れた構えは覚え、撃った瞬間に出る', () => {
    const k = { ...brawlerStartTech({ ...initialBrawlerState(), secretProgress: 3 }, 'kiko', 1000), secretProgress: 3 };
    expect(brawlerShouldBufferTech(k, 'guard', 1050)).toBe(true);
    expect(brawlerShouldBufferTech({ ...k, secretProgress: 2 }, 'guard', 1050)).toBe(false);
    expect(brawlerTechBufferDecision({ ...k, resolved: true, techBuffer: 'guard' }, 1000 + k.windupMs)).toBe('fire');
  });
});

describe('ステップの取り消し(§19-1)', () => {
  it('当たった1〜4段目の後隙だけ。技の後隙・5段目・空振り・防がれた当たりは取り消せない。待機からは今どおり', () => {
    expect(brawlerStepAllowed(initialBrawlerState(), 0)).toBe(true);
    for (const stage of [1, 2, 3, 4, 5]) {
      const { s, at, hs } = stageHit(stage);
      expect(brawlerStepAllowed(s, at + hs + 5), `${stage}段目`).toBe(stage <= 4);
      expect(brawlerStepAllowed(s, at + 5), `${stage}段目 止めの間`).toBe(false);
      expect(brawlerStepAllowed(stageHit(stage, 0).s, at + hs + 5), `${stage}段目 空振り`).toBe(false);
      expect(brawlerStepAllowed(stageHit(stage, 1, 0).s, at + hs + 5), `${stage}段目 防がれた`).toBe(false);
    }
    for (const [k, n] of [['kick', 1], ['kick', 2], ['kick', 3], ['stomp', 0], ['kiko', 0]] as const) {
      const { s, at, hs } = techHit(k, n);
      expect(brawlerStepAllowed(s, at + hs + 5), `${k}${n}`).toBe(false);
    }
  });
});

describe('① 当てた時の固まりの長さ・道ごとの時刻表(§19-3・係数1.3)', () => {
  it('時間の表(係数1.3): 段・技の出だし/後隙/止め・受付・余白', () => {
    expect([1, 2, 3, 4, 5].map(n => [brawlerStageSpec(n).windupMs, brawlerStageSpec(n).recoveryMs, brawlerStageSpec(n).hitstopMs])).toEqual(
      [[78, 182, 90], [78, 182, 90], [156, 299, 150], [325, 260, 150], [299, 351, 220]]);
    expect([BRAWLER_TECHS.kick.windupMs, BRAWLER_TECHS.kick.recoveryMs, BRAWLER_TECHS.stomp.windupMs, BRAWLER_TECHS.stomp.recoveryMs, BRAWLER_TECHS.kiko.windupMs, BRAWLER_TECHS.kiko.recoveryMs])
      .toEqual([156, 195, 260, 520, 156, 429]);
    expect([BRAWLER_KICK_HITSTOP_MS[1], BRAWLER_KICK_HITSTOP_MS[2], BRAWLER_KICK_HITSTOP_MS[3], BRAWLER_STOMP_HITSTOP_MS]).toEqual([150, 150, 220, 220]);
    expect([BRAWLER_CANCEL_WINDOW_MS, BRAWLER_HOLD_FRAME_MARGIN_MS, BRAWLER_CHAIN_GUARD_MARGIN_MS, BRAWLER_KICK3_CHARGE_MS]).toEqual([195, 34, 78, 150]);
    expect([brawlerKickFlightMs(0), brawlerKickFlightMs(160), brawlerKickFlightMs(220)]).toEqual([156, 156, 195]);
  });
  it('①の長さ = max(止め+受付, [1〜4段目は]止め+後隙) + 余白34ms。締め(5段目・飛び蹴り3発目)・気功・秘奥義は0', () => {
    // 当たりの瞬間を0として: 1・2段目=319 / 3段目=483 / 4段目=444 / 飛び蹴り1・2発目=379 / 大踏み潰し=449
    expect(brawlerLockHitMs('s1', HS.s1)).toBe(Math.max(90 + 195, 90 + 182) + 34);
    expect(brawlerLockHitMs('s1', HS.s1)).toBe(319);
    expect(brawlerLockHitMs('s2', HS.s2)).toBe(319);
    expect(brawlerLockHitMs('s3', HS.s3)).toBe(150 + 299 + 34);
    expect(brawlerLockHitMs('s4', HS.s4)).toBe(150 + 260 + 34);
    expect(brawlerLockHitMs('kick1', 150)).toBe(150 + 195 + 34);
    expect(brawlerLockHitMs('kick2', 150)).toBe(379);
    expect(brawlerLockHitMs('stomp', 220)).toBe(220 + 195 + 34);
    for (const m of ['s5', 'kick3', 'kiko', 'secret', 'secret-land'] as const) expect(brawlerLockHitMs(m, 220), m).toBe(0);
    expect((['s5', 'kick3', 'kiko'] as const).every(brawlerLockIsCloser)).toBe(true);
    expect((['s1', 's2', 's3', 's4', 'kick1', 'kick2', 'stomp', 'secret'] as const).some(brawlerLockIsCloser)).toBe(false);
    expect((['s1', 's2', 's3', 's4', 'kick1', 'kick2', 'stomp'] as const).every(brawlerLockHolds)).toBe(true);
    // 係数1.0 でも同じ式
    setBrawlerTempoAll(1.0);
    expect(brawlerLockHitMs('s1', 90)).toBe(Math.max(90 + 150, 90 + 140) + 34);
    expect(brawlerLockHitMs('s3', 150)).toBe(150 + 230 + 34);
    setBrawlerTempoAll(1.3);
  });
  it('続きを出せる時刻と当たる時刻(当たりの瞬間を0として): 道の上の続きは①の固まりの内に出せ、待機から出した表の外の技は①の外で当たる', () => {
    const lock = { s1: 319, s2: 319, s3: 483, s4: 444, kick: 379, stomp: 449 };
    // 段のつなぎ: 次の段は後隙の終わり(止め+後隙)に出る → ①の内(余白34msの手前)
    expect([90 + 182, 90 + 182, 150 + 299, 150 + 260]).toEqual([272, 272, 449, 410]);
    expect(272 < lock.s1 && 449 < lock.s3 && 410 < lock.s4).toBe(true);
    // 取り消しの受付の最後(止め+受付)も①の内
    expect(90 + 195 < lock.s1 && 150 + 195 < lock.s3 && 150 + 195 < lock.s4 && 150 + 195 < lock.kick && 220 + 195 < lock.stomp).toBe(true);
    // 待機から出した表の外の技(§19-5 の計算): 1段目の後の大踏み潰し=272+260=532 / 気功(撃つ時刻)=272+156=428 / 飛び蹴りの後の1段目=345+78=423
    expect(272 + BRAWLER_TECHS.stomp.windupMs).toBeGreaterThan(lock.s1);
    expect(272 + BRAWLER_TECHS.kiko.windupMs).toBeGreaterThan(lock.s1);
    expect(150 + 195 + brawlerStageSpec(1).windupMs).toBe(423);
    expect(423).toBeGreaterThan(lock.kick);
    // 2段目の後に待機から飛び蹴り: 272+156=428 > 319 / 3段目の後に待機から大踏み潰し: 449+260 > 483 / 大踏み潰しの後(後隙740)の待機からの技
    expect(272 + BRAWLER_TECHS.kick.windupMs).toBeGreaterThan(lock.s2);
    expect(449 + BRAWLER_TECHS.stomp.windupMs).toBeGreaterThan(lock.s3);
    expect(220 + BRAWLER_TECHS.stomp.recoveryMs).toBeGreaterThan(lock.stomp);
  });
});

describe('確定の固まりの書き込み(§19-3 ①③⑤・締めの切り詰め)', () => {
  const o = (stopMs: number, x: Partial<{ enemyStopMs: number; canHold: boolean; airborneAfter: boolean }> = {}) =>
    ({ stopMs, enemyStopMs: x.enemyStopMs ?? stopMs, canHold: x.canHold ?? true, airborneAfter: x.airborneAfter ?? false });
  it('初めて当てた技は当たりの瞬間から①の長さ(gameTime)。当てた技を覚える', () => {
    const r = brawlerLockOnHit({}, 's1', 5000, 9e9, o(90));
    expect(r).toEqual({ patch: { brLockUntil: 5000 + 319, brLockMoves: 's1' }, held: true, noHold: false });
    const r2 = brawlerLockOnHit({ ...r.patch }, 's2', 5350, 9e9, o(90));
    expect(r2.patch).toEqual({ brLockUntil: 5350 + 319, brLockMoves: 's1,s2' });
    // 既に長い固まり(続きで延ばした分)があれば短くしない
    expect(brawlerLockOnHit({ brLockUntil: 9000, brLockMoves: 's1' }, 's2', 5350, 9e9, o(90)).patch.brLockUntil).toBe(9000);
  });
  it('③ 同じコンボで2回目の同じ技は固めない', () => {
    const r = brawlerLockOnHit({ brLockUntil: 5100, brLockMoves: 's1,kick1' }, 'kick1', 5000, 9e9, o(150));
    expect(r).toEqual({ patch: {}, held: false, noHold: false });
    expect(brawlerLockOnHit({ brLockMoves: 's1' }, 's1', 5000, 9e9, o(90)).held).toBe(false);
    // 飛び蹴りの1・2発目は別の技
    expect(brawlerLockOnHit({ brLockUntil: 5100, brLockMoves: 's1,kick1' }, 'kick2', 5000, 9e9, o(150)).held).toBe(true);
  });
  it('締め(5段目・飛び蹴り3発目)と気功は固めず、それまでの固まりを「止めの終わり」まで切り詰める。大踏み潰しは締めではない', () => {
    const e = { brLockUntil: 6000, brLockMoves: 's1,s2,s3,s4' };
    expect(brawlerLockOnHit(e, 's5', 5000, 9e9, o(220, { enemyStopMs: 220 })).patch).toEqual({ brLockUntil: 5220, brLockMoves: 's1,s2,s3,s4,s5' });
    expect(brawlerLockOnHit(e, 's5', 5000, 9e9, o(220, { enemyStopMs: 0 })).patch.brLockUntil).toBe(5000);   // ボス級の吹き飛ばし=止め無し
    expect(brawlerLockOnHit(e, 'kick3', 5000, 9e9, o(220, { enemyStopMs: 220 })).patch.brLockUntil).toBe(5220);
    expect(brawlerLockOnHit(e, 'kiko', 5000, 9e9, o(0)).patch.brLockUntil).toBe(5000);
    expect(brawlerLockOnHit({ brLockUntil: 5100, brLockMoves: 's1' }, 's5', 5000, 9e9, o(220)).patch.brLockUntil).toBeUndefined(); // もう短い=触らない
    expect(brawlerLockOnHit({}, 'kiko', 5000, 9e9, o(0))).toEqual({ patch: {}, held: false, noHold: false });     // コンボの外の気功は何も書かない
    const st = brawlerLockOnHit({ brLockUntil: 5300, brLockMoves: 's4' }, 'stomp', 5000, 9e9, o(220, { enemyStopMs: 0 }));
    expect(st).toEqual({ patch: { brLockUntil: 5000 + 449, brLockMoves: 's4,stomp' }, held: true, noHold: false });
  });
  it('攻撃の振りの最中・ダウンの当たり(canHold=false)は固めない。宙に居る当たりは覚える(コンボは続いている)', () => {
    expect(brawlerLockOnHit({}, 's1', 5000, 9e9, o(90, { canHold: false }))).toEqual({ patch: {}, held: false, noHold: false });
    expect(brawlerLockOnHit({}, 's1', 5000, 9e9, o(90, { canHold: false, airborneAfter: true })).patch).toEqual({ brLockMoves: 's1' });
  });
  it('⑤ 固まらない時間(コンボの後=gameTime の欄/ダウンの着地の後=壁時計の欄 のどちらかが生きている間)は何も書かない・覚えない', () => {
    expect(brawlerLockOnHit({ brLockNoHoldUntil: 5001 }, 's1', 5000, 100, o(90))).toEqual({ patch: {}, held: false, noHold: true });
    expect(brawlerLockOnHit({ brNoHoldUntil: 101 }, 's1', 5000, 100, o(90))).toEqual({ patch: {}, held: false, noHold: true });
    expect(brawlerLockOnHit({ brLockNoHoldUntil: 5000, brNoHoldUntil: 100 }, 's1', 5000, 100, o(90)).held).toBe(true); // 明けた瞬間から固まる
    expect(brawlerNoHoldNow({ brLockNoHoldUntil: 5001 }, 5000, 100)).toBe(true);
    expect(brawlerNoHoldNow({ brNoHoldUntil: 101 }, 5000, 100)).toBe(true);
    expect(brawlerNoHoldNow({}, 5000, 100)).toBe(false);
    expect(brawlerComboEndNoHoldNow({ brLockNoHoldUntil: 5001 }, 5000)).toBe(true);
    expect(brawlerComboEndNoHoldNow({}, 5000)).toBe(false);
  });
});

describe('② 続きを出した瞬間に延ばす(§19-3)', () => {
  it('まだ固まっている敵だけを「続きが当たる時刻+余白78ms」まで延ばす', () => {
    const e = { brLockUntil: 5319, brLockMoves: 's1' };
    expect(brawlerLockExtendPatch(e, 's2', 5272 + 78, 5272, 9e9)).toEqual({ brLockUntil: 5272 + 78 + 78 });
    expect(brawlerLockExtendPatch(e, 's2', 5400, 5319, 9e9)).toBeNull();          // 固まりが明けた後に出した続き=出せるがつながらない
    expect(brawlerLockExtendPatch({}, 's2', 5400, 5272, 9e9)).toBeNull();
    expect(brawlerLockExtendPatch({ brLockUntil: 9000, brLockMoves: 's1' }, 's2', 5400, 5272, 9e9)).toBeNull(); // もう長い=触らない
  });
  it('③ 同じコンボでもう当てた技の続きでは延ばさない・⑤ 固まらない時間の間は延ばさない', () => {
    expect(brawlerLockExtendPatch({ brLockUntil: 5319, brLockMoves: 's1,s2' }, 's2', 5400, 5272, 9e9)).toBeNull();
    expect(brawlerLockExtendPatch({ brLockUntil: 5319, brLockMoves: 's1', brLockNoHoldUntil: 6000 }, 's2', 5400, 5272, 9e9)).toBeNull();
    expect(brawlerLockExtendPatch({ brLockUntil: 5319, brLockMoves: 's1', brNoHoldUntil: 200 }, 's2', 5400, 5272, 100)).toBeNull();
  });
  it('延ばす先(当たる時刻)= 出した時の実際の値: 段の出だし/飛び蹴りの飛ぶ時間(3発目は溜め込み)/大踏み潰しの出だし/気功は弾の飛ぶ時間込み', () => {
    const t = 5000;
    const ext = (move: BrawlerMoveKey, hitAt: number) => brawlerLockExtendPatch({ brLockUntil: t + 50, brLockMoves: 'x' }, move, hitAt, t, 9e9)!.brLockUntil! - t;
    expect(ext('s2', t + brawlerStageSpec(2).windupMs)).toBe(78 + 78);
    expect(ext('s4', t + brawlerStageSpec(4).windupMs)).toBe(325 + 78);
    expect(ext('s5', t + brawlerStageSpec(5).windupMs)).toBe(299 + 78);
    expect(ext('kick1', t + brawlerKickFlightMs(100))).toBe(156 + 78);
    expect(ext('kick2', t + brawlerKickFlightMs(220))).toBe(195 + 78);
    expect(ext('kick3', t + BRAWLER_KICK3_CHARGE_MS + brawlerKickFlightMs(220))).toBe(150 + 195 + 78);
    expect(ext('stomp', t + BRAWLER_TECHS.stomp.windupMs)).toBe(260 + 78);
    // 気功: 近い時(弾はすぐ届く)と、届く端の時(420px 先)
    expect(brawlerKikoTravelMs(0, BRAWLER_KIKO_SPEED)).toBe(0);
    expect(brawlerKikoTravelMs(-5, BRAWLER_KIKO_SPEED)).toBe(0);
    expect(Math.round(brawlerKikoTravelMs(90, BRAWLER_KIKO_SPEED))).toBe(100);
    expect(Math.round(brawlerKikoTravelMs(420, BRAWLER_KIKO_SPEED))).toBe(467);
    expect(ext('kiko', t + BRAWLER_TECHS.kiko.windupMs + brawlerKikoTravelMs(0, BRAWLER_KIKO_SPEED))).toBe(156 + 78);
    expect(Math.round(ext('kiko', t + BRAWLER_TECHS.kiko.windupMs + brawlerKikoTravelMs(420, BRAWLER_KIKO_SPEED)))).toBe(156 + 467 + 78);
  });
  it('ステップで後隙を取り消した瞬間に、確定の固まりはそこで切れる', () => {
    expect(brawlerLockCutPatch({ brLockUntil: 5483 }, 5150)).toEqual({ brLockUntil: 5150 });
    expect(brawlerLockCutPatch({ brLockUntil: 5100 }, 5150)).toBeNull();
    expect(brawlerLockCutPatch({}, 5150)).toBeNull();
  });
});

describe('④ コンボの区切りと ⑤ 固まらない時間・⑥ 2つの時計', () => {
  it('固まりでも浮きでもなくなった時にコンボは終わる(当たりの止めは固まりに含む)。ボス級1500ms・強個体800ms・雑魚は無し', () => {
    expect([BRAWLER_COMBO_END_NO_HOLD_BOSS_MS, BRAWLER_COMBO_END_NO_HOLD_STRONG_MS]).toEqual([1500, 800]);
    const e = { brLockMoves: 's1,s2', brLockUntil: 5000 };
    expect(brawlerComboEndPatch({}, 'boss', 6000, 100)).toBeNull();                                   // コンボの外
    expect(brawlerComboEndPatch(e, 'boss', 4999, 100)).toBeNull();                                    // 確定の固まりの最中
    expect(brawlerComboEndPatch({ ...e, brHoldUntil: 101 }, 'boss', 5000, 100)).toBeNull();           // 壁時計の固まり(止め)
    expect(brawlerComboEndPatch({ ...e, hitStunUntil: 101 }, 'mob', 5000, 100)).toBeNull();           // 当たりの止め
    expect(brawlerComboEndPatch({ ...e, brLiftUntil: 101 }, 'boss', 5000, 100)).toBeNull();           // 浮き
    expect(brawlerComboEndPatch(e, 'boss', 5000, 100)).toEqual({ brLockMoves: undefined, brLockNoHoldUntil: 6500 });
    expect(brawlerComboEndPatch(e, 'strong', 5000, 100)).toEqual({ brLockMoves: undefined, brLockNoHoldUntil: 5800 });
    expect(brawlerComboEndPatch(e, 'mob', 5000, 100)).toEqual({ brLockMoves: undefined });
    // もう長い固まらない時間があれば短くしない
    expect(brawlerComboEndPatch({ ...e, brLockNoHoldUntil: 9000 }, 'strong', 5000, 100)!.brLockNoHoldUntil).toBe(9000);
  });
  it('ダウンの着地で固まらない時間が短くならない(遅い方を残す)', () => {
    const air = { brLiftUntil: 2000, brawlerLiftAt: 1000, brLiftMs: 1000, brLiftPeak: 1, brLiftFrom: 0, brLiftBudget: 0 };
    const d1 = brawlerJugglePush({ ...air }, 'boss', 's1', 1500)!;
    expect(d1.brLiftDown).toBe(true);
    expect(d1.brNoHoldUntil).toBe(1500 + BRAWLER_JUGGLE_DROP_MS + BRAWLER_DOWN_NO_HOLD_MS);
    const d2 = brawlerJugglePush({ ...air, brNoHoldUntil: 9000 }, 'boss', 's1', 1500)!;
    expect(d2.brNoHoldUntil).toBe(9000);
  });
  it('固まっているかは2つの時計のどちらか(壁時計の欄/gameTime の欄)。攻撃の振りの最中は固まらない', () => {
    expect(brawlerLockAlive({ brLockUntil: 5001 }, 5000)).toBe(true);
    expect(brawlerLockAlive({ brLockUntil: 5000 }, 5000)).toBe(false);
    expect(brawlerHoldClockAlive({ brLockUntil: 5001 }, 5000, 100)).toBe(true);
    expect(brawlerHoldClockAlive({ brHoldUntil: 101 }, 5000, 100)).toBe(true);
    expect(brawlerHoldClockAlive({ brHoldUntil: 100, brLockUntil: 5000 }, 5000, 100)).toBe(false);
    expect(brawlerHoldRemainMs({ brHoldUntil: 150, brLockUntil: 5300 }, 5000, 100)).toBe(300);
    expect(brawlerHoldRemainMs({ brHoldUntil: 900, brLockUntil: 5300 }, 5000, 100)).toBe(800);
    expect(brawlerHoldRemainMs({}, 5000, 100)).toBe(0);
    expect(brawlerHeldNow({ type: 'zombie', brLockUntil: 5001, aiPhase: 'zrush' }, 5000, 100)).toBe(true);
    expect(brawlerHeldNow({ type: 'zombie', brLockUntil: 5001, aiPhase: 'z-red-pause' }, 5000, 100)).toBe(true);   // 溜めも固まる
    expect(brawlerHeldNow({ type: 'zombie', brLockUntil: 5001, aiPhase: 'z-bite1' }, 5000, 100)).toBe(false);      // 振りの最中
    expect(brawlerHeldNow({ type: 'zombie', brHoldUntil: 101, aiPhase: 'zrush' }, 5000, 100)).toBe(true);
    expect(brawlerHeldNow({ type: 'zombie', aiPhase: 'zrush' }, 5000, 100)).toBe(false);
  });
});
