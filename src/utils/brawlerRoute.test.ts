// ★フレームで決まるつながり(research/BRAWLER.md §20・社長指示2026-11-11「ちゃんとそこも格闘ゲームにしたい フレーム計算で」)の純関数。受け入れ条件 §20-6 の1〜3。
//   取り消しの規則(技ごとの印 BRAWLER_CANCELABLE から作った表。§20-3 の名札の一覧どおり)/当たっていない技・通常からは取り消せない/受付の外は取り消せない/
//   道に無い技の先行入力は覚えない/構えは待機と秘奥義の締めだけ/ステップの取り消しは当たった1〜4段目だけ/
//   固まりの長さ(止め+技ごとの固まり×減衰・置き換え)と、つながりの計算(brawlerLinkTiming=入る組は余り45ms以上・入らない組は不足45ms以上)。
//   実際の刻みで回す側は store/brawlerLink.store.test.ts。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { BrawlerRouteNode, BrawlerState, BrawlerTechKind } from './brawlerTypes';
import {
  BRAWLER_TEMPO_DEFAULT, BRAWLER_CANCEL_WINDOW_MS, BRAWLER_HITSTOP, BRAWLER_KICK_HITSTOP_MS, BRAWLER_STOMP_HITSTOP_MS, BRAWLER_TECHS,
  BRAWLER_KICK3_CHARGE_MS, BRAWLER_KICK_CHAIN_MS, BRAWLER_CANCELABLE, BRAWLER_HOLD_MS, BRAWLER_HOLD_BASE_MS,
  brawlerRouteAllows, brawlerRouteNodeOf, brawlerStageNode, brawlerTechNode, brawlerSecretClosing, brawlerHitLanded, brawlerCancelWindowOpen,
  brawlerTechCancelOk, brawlerTechAllowed, brawlerShouldBufferTech, brawlerLateCarry, brawlerTechBufferDecision, brawlerStepAllowed, brawlerSecretCarry,
  brawlerStartAttack, brawlerStartTech, brawlerAfterResolve, brawlerFinish, brawlerStageSpec, initialBrawlerState, brawlerKickFlightMs,
  brawlerStepStart, brawlerStepping, brawlerStepHeldPressFire, brawlerPressDecision,
  brawlerHeelInput, brawlerHeelCost, brawlerTechCost, BRAWLER_HEEL_EXTRA_COST, brawlerHeelStandAt, brawlerHeelHitSink, BRAWLER_HEEL_ROT_UP, BRAWLER_HEEL_ROT_DOWN, BRAWLER_HEEL_ROT_PEAK, BRAWLER_HEEL_HIT_SINK_MS,
} from './brawler';
import {
  setBrawlerTempoAll, BRAWLER_COMBO_END_NO_HOLD_BOSS_MS, BRAWLER_COMBO_END_NO_HOLD_STRONG_MS,
  brawlerLockHitMs, brawlerLockIsCloser, brawlerLockHolds, brawlerLockOnHit, brawlerComboEndPatch, brawlerLockHoldMs, brawlerLockDecay,
  brawlerLinkTiming, brawlerMoveStopMs, brawlerKikoTravelForDistMs,
  brawlerLockAlive, brawlerHoldClockAlive, brawlerHoldRemainMs, brawlerHeldNow, brawlerNoHoldNow, brawlerComboEndNoHoldNow,
  brawlerJugglePush, BRAWLER_JUGGLE_DROP_MS, BRAWLER_DOWN_NO_HOLD_MS,
  type BrawlerMoveKey,
} from './brawlerCombo';

beforeAll(() => { setBrawlerTempoAll(1.3); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

const NODES: readonly BrawlerRouteNode[] = ['idle', 's1', 's2', 's3', 's4', 's5', 'kick1', 'kick2', 'kick3', 'heel', 'stomp', 'kiko', 'guard'];
/** §20-3 の名札の一覧(テストの側にも書く=規則を書き換えたら必ずここも見ることになる)。 */
const TABLE: Readonly<Record<BrawlerRouteNode, readonly BrawlerRouteNode[]>> = {
  idle: NODES.filter(n => n !== 'idle' && n !== 'heel'),
  s1: ['s2', 'kick1', 'stomp', 'kiko'], s2: ['s3', 'kick1', 'stomp', 'kiko'], s3: ['s4', 'kick1', 'stomp', 'kiko'], s4: ['s5', 'kick1', 'stomp', 'kiko'], s5: [],
  kick1: ['kick2', 'stomp', 'kiko'], kick2: ['kick3', 'heel', 'stomp', 'kiko'], kick3: [], heel: ['stomp'],
  stomp: ['kick1', 'kiko'], kiko: [], guard: ['guard'],
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

describe('取り消しの規則(§20-3)', () => {
  it('印(BRAWLER_CANCELABLE)は s1〜s4・kick1・kick2・踵落とし・stomp だけ', () => {
    expect(NODES.filter(n => BRAWLER_CANCELABLE[n])).toEqual(['s1', 's2', 's3', 's4', 'kick1', 'kick2', 'heel', 'stomp']);
  });
  it('一覧のとおりに許す・それ以外は許さない(全ての組)。通常の段へは段のつなぎだけ', () => {
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
  it('通常→技: 取り消せる印・当たった・受付の内 の3つが揃った時だけ(1〜4段目から kick/stomp/kiko・5段目は無し・構えは出せない)', () => {
    const want: Record<number, readonly BrawlerTechKind[]> = { 1: ['kick', 'stomp', 'kiko'], 2: ['kick', 'stomp', 'kiko'], 3: ['kick', 'stomp', 'kiko'], 4: ['kick', 'stomp', 'kiko'], 5: [] };
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
  it('技→技: 飛び蹴り1・2発目→大踏み潰し・気功 / 大踏み潰し→飛び蹴り・気功 (当たった時・受付の内。自分と同じ技の種類へは出せない・構えは出せない)', () => {
    for (const n of [1, 2]) {
      const { s, at, hs } = techHit('kick', n);
      expect(brawlerTechAllowed(s, 'stomp', at + hs + 1)).toBe(true);
      expect(brawlerTechAllowed(s, 'kiko', at + hs + 1)).toBe(true);
      expect(brawlerTechAllowed(s, 'guard', at + hs + 1)).toBe(false);
      expect(brawlerTechAllowed(techHit('kick', n, 0).s, 'stomp', at + hs + 1)).toBe(false);     // 空振り
      expect(brawlerTechAllowed(techHit('kick', n, 1, 0).s, 'stomp', at + hs + 1)).toBe(false);  // 防がれた
      expect(brawlerTechAllowed(s, 'stomp', at + hs + BRAWLER_CANCEL_WINDOW_MS)).toBe(false);    // 受付の外
    }
    const k3 = techHit('kick', 3);
    for (const k of ['kick', 'stomp', 'kiko', 'guard'] as const) expect(brawlerTechAllowed(k3.s, k, k3.at + k3.hs + 1), `3発目→${k}`).toBe(false);
    const st = techHit('stomp');
    expect(brawlerTechAllowed(st.s, 'kiko', st.at + st.hs + 1)).toBe(true);
    expect(brawlerTechAllowed(st.s, 'kick', st.at + st.hs + 1)).toBe(true);
    for (const k of ['stomp', 'guard'] as const) expect(brawlerTechAllowed(st.s, k, st.at + st.hs + 1), `大踏み潰し→${k}`).toBe(false);
    const ki = techHit('kiko');
    for (const k of ['kick', 'stomp', 'kiko'] as const) expect(brawlerTechCancelOk({ ...ki.s, resolved: true }, k, ki.at + 1), `気功→${k}`).toBe(false);
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
  it('判定の前: 道に無い技は覚えない。道の上の技は出だし・止めの間に覚え、受付が開いた瞬間に出る。判定の後(受付を過ぎた後隙)に押した技は1つ覚えて行動の終わりまで残る(§25)', () => {
    const pre = brawlerStartAttack(initialBrawlerState(), 3, 1000, false);
    for (const k of ['kick', 'stomp', 'kiko'] as const) expect(brawlerShouldBufferTech(pre, k, 1010), k).toBe(true);
    expect(brawlerShouldBufferTech(pre, 'guard', 1010)).toBe(false);
    const { s, at, hs } = stageHit(3);
    const b = { ...s, techBuffer: 'kick' as const };
    expect(brawlerShouldBufferTech(s, 'kick', at + 10)).toBe(true);                // 止めの間
    expect(brawlerTechBufferDecision(b, at + 10)).toBe('wait');
    expect(brawlerTechBufferDecision(b, at + hs)).toBe('fire');                    // 受付が開いた瞬間
    const afterWin = at + hs + BRAWLER_CANCEL_WINDOW_MS + 5;
    expect(brawlerTechAllowed(s, 'kick', afterWin)).toBe(false);                   // 受付を過ぎた=その場では出ない(取り消しではない)
    expect(brawlerShouldBufferTech(s, 'kick', afterWin)).toBe(true);               // §25: 後隙で押した技は覚える
    expect(brawlerLateCarry(s, 'kick', afterWin)).toBe(true);
    expect(brawlerLateCarry(s, 'kick', at + hs + 5)).toBe(false);                  // 受付の内は取り消しで即座に出る
    expect(brawlerTechBufferDecision({ ...b, lateHeld: true }, afterWin)).toBe('wait'); // 行動の終わりまで残る(待機へ戻った瞬間に呼び手が出す)
    expect(brawlerTechBufferDecision({ ...b, lateHeld: true }, afterWin)).not.toBe('drop');
  });
  it('判定の前に押して当たらなかった(空振り・防がれた)技は捨てる。判定の後(後隙)に押した技は、空振りでも覚えて行動の終わりまで残る。覚えていない/捨てた技は待機へ戻っても出ない', () => {
    for (const landed of [0]) for (const hits of [0, 1]) {
      const { s, at } = stageHit(3, hits, landed);
      const b = { ...s, techBuffer: 'kick' as const };
      expect(brawlerTechBufferDecision(b, at + 1)).toBe('drop');
      expect(brawlerShouldBufferTech(s, 'kick', at + 1)).toBe(true);               // §25: 判定の後に押した技は当たりを問わず覚える
      expect(brawlerTechBufferDecision({ ...b, lateHeld: true }, at + 1)).toBe('wait'); // 後隙の終わりまで残る
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
    expect(brawlerSecretCarry(stomp, 'kick')).toBe(false);                  // 順番の外は秘奥義の持ち越しではない
    expect(brawlerSecretCarry(stomp, 'guard')).toBe(false);
    // §25: 順番の外の技も、判定の後に押したものは1つ覚える(秘奥義の持ち越しと別の経路=lateHeld)。判定の前なら従来どおり捨てる
    expect(brawlerShouldBufferTech(stomp, 'kick', after)).toBe(true);
    expect(brawlerShouldBufferTech({ ...stomp, secretProgress: 0 }, 'kiko', after)).toBe(true);
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

describe('固まりの長さ(§20-2・§20-4・係数1.3)', () => {
  it('時間の表(係数1.3): 段・技の出だし/後隙/止め・受付', () => {
    expect([1, 2, 3, 4, 5].map(n => [brawlerStageSpec(n).windupMs, brawlerStageSpec(n).recoveryMs, brawlerStageSpec(n).hitstopMs])).toEqual(
      [[78, 182, 90], [78, 182, 90], [156, 299, 150], [325, 260, 150], [299, 416, 220]]);
    expect([BRAWLER_TECHS.kick.windupMs, BRAWLER_TECHS.kick.recoveryMs, BRAWLER_TECHS.stomp.windupMs, BRAWLER_TECHS.stomp.recoveryMs, BRAWLER_TECHS.kiko.windupMs, BRAWLER_TECHS.kiko.recoveryMs])
      .toEqual([172, 215, 260, 601, 156, 429]); // 飛び蹴り 156/195→172/215(社長指示2026-11-11「飛び蹴りからの3段、ほんの少しだけゆっくりに」で ×1.1)
    expect([BRAWLER_KICK_HITSTOP_MS[1], BRAWLER_KICK_HITSTOP_MS[2], BRAWLER_KICK_HITSTOP_MS[3], BRAWLER_STOMP_HITSTOP_MS]).toEqual([150, 150, 220, 220]);
    expect([BRAWLER_CANCEL_WINDOW_MS, BRAWLER_KICK3_CHARGE_MS]).toEqual([195, 165]); // 3発目の溜め 150→165(×1.1)
    expect([brawlerKickFlightMs(0), brawlerKickFlightMs(160), brawlerKickFlightMs(220)]).toEqual([172, 172, 215]); // 156/195→172/215(×1.1)
  });
  it('固まりの表: 係数1.0の値(§20-2)と、テンポ係数を掛けた実ms(live binding)', () => {
    expect(BRAWLER_HOLD_BASE_MS).toEqual({ s1: 300, s2: 300, s3: 520, s4: 470, s5: 0, kick1: 265, kick2: 310, kick3: 0, heel: 300, stomp: 230, kiko: 0 });
    expect(BRAWLER_HOLD_MS).toEqual({ s1: 390, s2: 390, s3: 676, s4: 611, s5: 0, kick1: 345, // 2026-11-11 飛び蹴り1発目の固まり 325→345(250→265)
      kick2: 403, kick3: 0, heel: 390, stomp: 299, kiko: 0 });
    setBrawlerTempoAll(1.0);
    expect(BRAWLER_HOLD_MS).toEqual(BRAWLER_HOLD_BASE_MS);
    setBrawlerTempoAll(1.3);
    expect(BRAWLER_HOLD_MS.s3).toBe(676);
  });
  it('長さ = プレイヤーの止め + 固まり×減衰。固まり0の技(5段目・飛び蹴り3発目・気功)と秘奥義は 0(固まりは書かない)', () => {
    expect(brawlerLockHitMs('s1', HS.s1)).toBe(90 + 390);
    expect(brawlerLockHitMs('s2', HS.s2)).toBe(480);
    expect(brawlerLockHitMs('s3', HS.s3)).toBe(150 + 676);
    expect(brawlerLockHitMs('s4', HS.s4)).toBe(150 + 611);
    expect(brawlerLockHitMs('kick1', 150)).toBe(150 + 345); // 2026-11-11 飛び蹴り1発目の固まり 325→345(250→265)
    expect(brawlerLockHitMs('kick2', 150)).toBe(150 + 403);
    expect(brawlerLockHitMs('stomp', 220)).toBe(220 + 299);
    for (const m of ['s5', 'kick3', 'kiko', 'secret', 'secret-land'] as const) expect(brawlerLockHitMs(m, 220), m).toBe(0);
    expect((['s5', 'kick3', 'kiko'] as const).every(brawlerLockIsCloser)).toBe(true);
    expect((['s1', 's2', 's3', 's4', 'kick1', 'kick2', 'stomp', 'secret'] as const).some(brawlerLockIsCloser)).toBe(false);
    expect((['s1', 's2', 's3', 's4', 'kick1', 'kick2', 'stomp'] as const).every(brawlerLockHolds)).toBe(true);
    // 区分は式に入らない(関数は区分を引数に取らない)。係数1.0でも同じ式
    setBrawlerTempoAll(1.0);
    expect(brawlerLockHitMs('s1', 90)).toBe(90 + 300);
    expect(brawlerLockHitMs('s3', 150)).toBe(150 + 520);
    setBrawlerTempoAll(1.3);
  });
  it('コンボの減衰: 5発目までは1.0、6発目×0.8、7発目×0.64…(固まりの数字にだけ掛ける・四捨五入。止めは減らさない)', () => {
    expect([1, 2, 3, 4, 5].map(brawlerLockDecay)).toEqual([1, 1, 1, 1, 1]);
    expect(brawlerLockDecay(6)).toBeCloseTo(0.8);
    expect(brawlerLockDecay(7)).toBeCloseTo(0.64);
    expect(brawlerLockDecay(8)).toBeCloseTo(0.512);
    expect([5, 6, 7, 8].map(n => brawlerLockHoldMs('s1', n))).toEqual([390, 312, 250, 200]);
    expect(brawlerLockHitMs('s1', 90, 8)).toBe(90 + 200);
    expect(brawlerLockHoldMs('s5', 8)).toBe(0);
  });
});

describe('確定の固まりの書き込み(§20-4・置き換え・数え・切り詰め)', () => {
  const o = (stopMs: number, x: Partial<{ enemyStopMs: number; canHold: boolean; airborneAfter: boolean; countHit: boolean }> = {}) =>
    ({ stopMs, enemyStopMs: x.enemyStopMs ?? stopMs, canHold: x.canHold ?? true, airborneAfter: x.airborneAfter ?? false, ...(x.countHit === undefined ? {} : { countHit: x.countHit }) });
  it('当たりの瞬間から「止め+固まり」(gameTime)。固まりを書いた当たりを数える', () => {
    const r = brawlerLockOnHit({}, 's1', 5000, 9e9, o(90));
    expect(r).toEqual({ patch: { brLockUntil: 5000 + 480, brLockHits: 1 }, held: true, noHold: false });
    const r2 = brawlerLockOnHit({ ...r.patch }, 's2', 5350, 9e9, o(90));
    expect(r2.patch).toEqual({ brLockUntil: 5350 + 480, brLockHits: 2 });
  });
  it('置き換え: 前の固まりが長くても短くても、新しい当たりの長さになる(続きを出しても延びない・同じ技でも固める)', () => {
    expect(brawlerLockOnHit({ brLockUntil: 9000, brLockHits: 1 }, 's2', 5350, 9e9, o(90)).patch.brLockUntil).toBe(5350 + 480);
    expect(brawlerLockOnHit({ brLockUntil: 5100, brLockHits: 1 }, 's2', 5350, 9e9, o(90)).patch.brLockUntil).toBe(5350 + 480);
    const again = brawlerLockOnHit({ brLockUntil: 5100, brLockHits: 2 }, 'kick1', 5000, 9e9, o(150));
    expect(again).toEqual({ patch: { brLockUntil: 5000 + 495, brLockHits: 3 }, held: true, noHold: false }); // kick1 の固まり 325→345   // 同じ技の2回目も固める
    expect(brawlerLockOnHit({ brLockHits: 1 }, 's1', 5000, 9e9, o(90)).held).toBe(true);
  });
  it('減衰: 固まりを書いた当たりの6発目から固まりが短くなる(5発目までは満額)', () => {
    expect(brawlerLockOnHit({ brLockHits: 4 }, 's1', 5000, 9e9, o(90)).patch).toEqual({ brLockUntil: 5000 + 90 + 390, brLockHits: 5 });
    expect(brawlerLockOnHit({ brLockHits: 5 }, 's1', 5000, 9e9, o(90)).patch).toEqual({ brLockUntil: 5000 + 90 + 312, brLockHits: 6 });
    expect(brawlerLockOnHit({ brLockHits: 7 }, 's1', 5000, 9e9, o(90)).patch).toEqual({ brLockUntil: 5000 + 90 + 200, brLockHits: 8 });
    // 会心のフィニッシュ(countHit=false)は数えない(長さは今の数えで決まる)
    expect(brawlerLockOnHit({ brLockHits: 5 }, 's1', 5000, 9e9, o(90, { countHit: false })).patch).toEqual({ brLockUntil: 5000 + 90 + 312, brLockHits: 5 });
    expect(brawlerLockOnHit({}, 's1', 5000, 9e9, o(90, { countHit: false })).patch).toEqual({ brLockUntil: 5000 + 480, brLockHits: 0 }); // 印は立てる(区切りで消える)
  });
  it('締め(5段目・飛び蹴り3発目)と気功は固めず・数えず、それまでの固まりを「止めの終わり」まで切る', () => {
    const e = { brLockUntil: 6000, brLockHits: 4 };
    expect(brawlerLockOnHit(e, 's5', 5000, 9e9, o(220, { enemyStopMs: 220 })).patch).toEqual({ brLockUntil: 5220, brLockHits: 4 });
    expect(brawlerLockOnHit(e, 's5', 5000, 9e9, o(220, { enemyStopMs: 0 })).patch.brLockUntil).toBe(5000);   // ボス級の吹き飛ばし=止め無し
    expect(brawlerLockOnHit(e, 'kick3', 5000, 9e9, o(220, { enemyStopMs: 220 })).patch.brLockUntil).toBe(5220);
    expect(brawlerLockOnHit(e, 'kiko', 5000, 9e9, o(0)).patch.brLockUntil).toBe(5000);
    expect(brawlerLockOnHit({ brLockUntil: 5100, brLockHits: 1 }, 's5', 5000, 9e9, o(220)).patch.brLockUntil).toBeUndefined(); // もう短い=触らない
    expect(brawlerLockOnHit({}, 'kiko', 5000, 9e9, o(0))).toEqual({ patch: {}, held: false, noHold: false });     // コンボの外の気功は何も書かない
    const st = brawlerLockOnHit({ brLockUntil: 5300, brLockHits: 3 }, 'stomp', 5000, 9e9, o(220, { enemyStopMs: 0 }));
    expect(st).toEqual({ patch: { brLockUntil: 5000 + 220 + 299, brLockHits: 4 }, held: true, noHold: false });   // 大踏み潰しはボス級の吹き飛ばしでもプレイヤーの止めから作る
  });
  it('固めない当たり(攻撃の振りの最中・ダウン=canHold=false)は新しい固まりを書かず、それまでの固まりを止めの終わりまで切る。宙に居る当たりはコンボの印を立てる', () => {
    expect(brawlerLockOnHit({}, 's1', 5000, 9e9, o(90, { canHold: false }))).toEqual({ patch: {}, held: false, noHold: false });
    expect(brawlerLockOnHit({}, 's1', 5000, 9e9, o(90, { canHold: false, airborneAfter: true })).patch).toEqual({ brLockHits: 0 });
    // 前の当たりの長い固まりを残さない(空中で締めを当てて落とした相手が、着地の後も固まり続けない)
    expect(brawlerLockOnHit({ brLockUntil: 6000, brLockHits: 2 }, 's4', 5000, 9e9, o(150, { canHold: false, enemyStopMs: 150 })).patch).toEqual({ brLockUntil: 5150, brLockHits: 2 });
  });
  it('⑤ 固まらない時間(コンボの後=gameTime の欄/ダウンの着地の後=壁時計の欄 のどちらかが生きている間)は何も書かない・数えない', () => {
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

describe('ステップの最中は段も技も出せない(§20-8・社長承認2026-11-11)', () => {
  const idle = initialBrawlerState();
  const stepping = { ...brawlerStepStart(idle, 1000, 0) }; // stepUntil = 1000 + BRAWLER_STEP_MS
  const end = stepping.stepUntil!;
  it('通常攻撃: ステップの最中は覚える(1つだけ)。ステップが終わったら今どおりすぐ出せる', () => {
    expect(brawlerStepping(stepping, 1000)).toBe(true);
    expect(brawlerStepping(stepping, end - 1)).toBe(true);
    expect(brawlerStepping(stepping, end)).toBe(false);
    expect(brawlerPressDecision(stepping, 1050)).toBe('buffer');
    expect(brawlerPressDecision({ ...stepping, buffered: true }, 1050)).toBe('drop');
    expect(brawlerPressDecision(stepping, end)).toBe('start');
    expect(brawlerPressDecision(idle, 1050)).toBe('start');
    // 覚えた通常攻撃は、ステップが終わった瞬間に出す(ステップの最中に覚えた物だけ)
    const held = { ...stepping, buffered: true, stepHeld: true };
    expect(brawlerStepHeldPressFire(held, end - 1)).toBe(false);
    expect(brawlerStepHeldPressFire(held, end)).toBe(true);
    expect(brawlerStepHeldPressFire({ ...held, stepHeld: false }, end)).toBe(false);
  });
  it('技: ステップの最中は出せない・覚える。ステップが終わった瞬間に出す。ステップの外で残った技の覚えは捨てる(今どおり)', () => {
    for (const k of ['kick', 'stomp', 'kiko', 'guard'] as const) {
      expect(brawlerTechAllowed(stepping, k, 1050), k).toBe(false);
      expect(brawlerShouldBufferTech(stepping, k, 1050), k).toBe(true);
      expect(brawlerTechAllowed(stepping, k, end), k).toBe(true);
      expect(brawlerShouldBufferTech(stepping, k, end), k).toBe(false);
    }
    const held = { ...stepping, techBuffer: 'stomp' as const, stepHeld: true };
    expect(brawlerTechBufferDecision(held, 1050)).toBe('wait');
    expect(brawlerTechBufferDecision(held, end)).toBe('fire');
    expect(brawlerTechBufferDecision({ ...held, stepHeld: false }, end)).toBe('drop');
    expect(brawlerStepStart({ ...idle, stepHeld: true }, 0, 0).stepHeld).toBe(false);
  });
});

describe('つながりの計算(§20-6 の3・係数1.3・近い相手)', () => {
  const MARGIN = 45;
  const near = { kickFlightMs: 172 }; // 近い飛び蹴りの飛ぶ時間(係数1.3)。2026-11-11 に ×1.1(旧156)
  /** 入る=余り45ms以上 / 入らない=不足45ms以上。 */
  const connects = (from: BrawlerMoveKey, to: BrawlerMoveKey, how: 'recovery-end' | 'cancel-now' | 'cancel-late', x: Parameters<typeof brawlerLinkTiming>[3] = near) => {
    const r = brawlerLinkTiming(from, to, how, x);
    return r;
  };
  it('止め・後隙・受付の値(計算の入力)が表どおり', () => {
    expect((['s1', 's2', 's3', 's4', 's5', 'kick1', 'kick2', 'kick3', 'stomp', 'kiko'] as const).map(brawlerMoveStopMs)).toEqual([90, 90, 150, 150, 220, 150, 150, 220, 220, 0]);
    expect(Math.round(brawlerKikoTravelForDistMs(60))).toBe(33);
    expect(Math.round(brawlerKikoTravelForDistMs(300))).toBe(300);
  });
  it('入る: 1→2・2→3・3→4・4→5(後隙の終わりに出す)', () => {
    const pairs = [['s1', 's2'], ['s2', 's3'], ['s3', 's4'], ['s4', 's5']] as const;
    for (const [a, b] of pairs) {
      const r = connects(a, b, 'recovery-end');
      expect(r.connects, `${a}→${b}`).toBe(true);
      expect(r.marginMs, `${a}→${b}`).toBeGreaterThanOrEqual(MARGIN);
    }
    expect(connects('s1', 's2', 'recovery-end')).toMatchObject({ nextHitAt: 350, lockEndsAt: 480, marginMs: 130 });
    expect(connects('s2', 's3', 'recovery-end')).toMatchObject({ nextHitAt: 428, lockEndsAt: 480, marginMs: 52 });
    expect(connects('s3', 's4', 'recovery-end')).toMatchObject({ nextHitAt: 774, lockEndsAt: 826, marginMs: 52 });
    expect(connects('s4', 's5', 'recovery-end')).toMatchObject({ nextHitAt: 709, lockEndsAt: 761, marginMs: 52 });
  });
  it('入る: 1段目→すぐ取り消して 大踏み潰し・飛び蹴り・気功(近い)', () => {
    for (const to of ['stomp', 'kick1', 'kiko'] as const) {
      const r = connects('s1', to, 'cancel-now', { kickFlightMs: 172, kikoDistPx: 60 });
      expect(r.routeOk, to).toBe(true);
      expect(r.marginMs, to).toBeGreaterThanOrEqual(MARGIN);
    }
    expect(connects('s1', 'stomp', 'cancel-now')).toMatchObject({ nextHitAt: 350, marginMs: 130 });
  });
  it('入る: 1段目・2段目→後隙の後の飛び蹴り(飛ぶ時間172ms=近い)', () => {
    for (const a of ['s1', 's2'] as const) expect(connects(a, 'kick1', 'recovery-end')).toMatchObject({ nextHitAt: 444, marginMs: 36, connects: true }); // 蹴りを遅くした分だけ余りが減った(52→36・基準45を下回るがつながる=発注者裁定2026-11-11で受け入れ)
  });
  it('入る: 飛び蹴り1発目→すぐ2発目(近い)/ 2発目→すぐ3発目(近い・浮かなかった時)/ 1発目→後隙の後の1段目', () => {
    expect(connects('kick1', 'kick2', 'cancel-now')).toMatchObject({ nextHitAt: 322, lockEndsAt: 495, marginMs: 173, routeOk: true }); // 2026-11-11 ×1.1+kick1 の固まり 325→345 で 306/475/169→322/495/173
    expect(connects('kick2', 'kick3', 'cancel-now')).toMatchObject({ nextHitAt: 487, lockEndsAt: 553, marginMs: 66, routeOk: true }); // 2026-11-11 ×1.1 で 456/97→487/66
    expect(connects('kick1', 's1', 'recovery-end')).toMatchObject({ nextHitAt: 443, lockEndsAt: 495, marginMs: 52, connects: true }); // 後隙 195→215 の分を kick1 の固まり 325→345 で埋めた(余り52のまま)
    for (const r of [connects('kick1', 'kick2', 'cancel-now'), connects('kick2', 'kick3', 'cancel-now'), connects('kick1', 's1', 'recovery-end')]) expect(r.marginMs).toBeGreaterThanOrEqual(MARGIN);
  });
  it('入らない: 1段目→受付の終わり際(止めの後195ms)に取り消した大踏み潰し', () => {
    const r = connects('s1', 'stomp', 'cancel-late');
    expect(r).toMatchObject({ pressAt: 90 + 195, nextHitAt: 545, lockEndsAt: 480, marginMs: -65, connects: false });
    expect(r.marginMs).toBeLessThanOrEqual(-MARGIN);
  });
  it('入らない: 1段目・2段目→後隙の後の大踏み潰し', () => {
    for (const a of ['s1', 's2'] as const) {
      const r = connects(a, 'stomp', 'recovery-end');
      expect(r).toMatchObject({ nextHitAt: 532, marginMs: -52, connects: false });
      expect(r.marginMs).toBeLessThanOrEqual(-MARGIN);
    }
  });
  it('入らない: 5段目・飛び蹴り3発目・気功の後の何でも(固まりは止めの終わりまで)', () => {
    const afters = ['s1', 'kick1', 'stomp', 'kiko'] as const;
    for (const from of ['s5', 'kick3', 'kiko'] as const) {
      for (const to of afters) {
        for (const how of ['recovery-end', 'cancel-now'] as const) {
          const r = connects(from, to, how, { kickFlightMs: 172, kikoDistPx: 60 });
          expect(r.lockEndsAt, `${from}→${to}`).toBe(brawlerMoveStopMs(from));
          expect(r.connects, `${from}→${to} ${how}`).toBe(false);
          expect(r.marginMs, `${from}→${to} ${how}`).toBeLessThanOrEqual(-MARGIN);
        }
      }
    }
    expect(connects('s5', 's1', 'recovery-end')).toMatchObject({ lockEndsAt: 220, nextHitAt: 220 + 416 + 78 });
  });
  it('減衰: 6発目に当てた1段目の後の2段目は入る(固まり390×0.8)/ 8発目の後の2段目は入らない(×0.512・不足約60ms)', () => {
    const six = connects('s1', 's2', 'recovery-end', { fromHitNo: 6 });
    expect(six).toMatchObject({ lockEndsAt: 90 + 312, nextHitAt: 350, marginMs: 52, connects: true });
    const eight = connects('s1', 's2', 'recovery-end', { fromHitNo: 8 });
    expect(eight).toMatchObject({ lockEndsAt: 90 + 200, nextHitAt: 350, marginMs: -60, connects: false });
    expect(six.marginMs).toBeGreaterThanOrEqual(MARGIN);
    expect(eight.marginMs).toBeLessThanOrEqual(-MARGIN);
    // 7発目は境目(不足約10ms)なので固定しない(数字の確認だけ)
    expect(Math.abs(connects('s1', 's2', 'recovery-end', { fromHitNo: 7 }).marginMs)).toBeLessThan(MARGIN);
  });
  it('距離で変わる: 1段目→すぐ取り消した気功は、相手まで60pxなら入る・300pxなら入らない', () => {
    const close = connects('s1', 'kiko', 'cancel-now', { kikoDistPx: 60 });
    const far = connects('s1', 'kiko', 'cancel-now', { kikoDistPx: 300 });
    expect(close.connects).toBe(true);
    expect(close.marginMs).toBeGreaterThanOrEqual(MARGIN);
    expect(far.connects).toBe(false);
    expect(far.marginMs).toBeLessThanOrEqual(-MARGIN);
    expect(Math.round(close.nextHitAt)).toBe(Math.round(90 + 156 + 33));
    expect(Math.round(far.nextHitAt)).toBe(90 + 156 + 300);
  });
  it('距離で変わる: 近い飛び蹴り(172ms)はつながり、遠い飛び蹴り(215ms)は後隙の後だとつながらない(2段目→後隙の後の飛び蹴り)', () => {
    expect(connects('s2', 'kick1', 'recovery-end', { kickFlightMs: 172 }).connects).toBe(true);
    expect(connects('s2', 'kick1', 'recovery-end', { kickFlightMs: 215 })).toMatchObject({ nextHitAt: 487, marginMs: -7, connects: false }); // 2026-11-11 ×1.1 で 467/13/つながる→487/-7/つながらない(発注者裁定で受け入れ)
  });
  it('取り消しの規則(routeOk)は同じ関数を読む: 気功からの取り消しは無し・待機からは常に出せる', () => {
    expect(connects('s5', 'kick1', 'cancel-now').routeOk).toBe(false);
    expect(connects('kiko', 'stomp', 'cancel-now').routeOk).toBe(false);
    expect(connects('s2', 'kiko', 'cancel-now').routeOk).toBe(true);
    expect(connects('stomp', 'kick1', 'cancel-now').routeOk).toBe(true);
    expect(connects('stomp', 'stomp', 'cancel-now').routeOk).toBe(false);
    expect(connects('s5', 's1', 'recovery-end').routeOk).toBe(true);
  });
});

describe('④ コンボの区切りと ⑤ 固まらない時間・⑥ 2つの時計', () => {
  it('固まりでも浮きでもなくなった時にコンボは終わる(当たりの止めは固まりに含む)。ボス級1500ms・強個体800ms・雑魚は無し', () => {
    expect([BRAWLER_COMBO_END_NO_HOLD_BOSS_MS, BRAWLER_COMBO_END_NO_HOLD_STRONG_MS]).toEqual([1500, 800]);
    const e = { brLockHits: 2, brLockUntil: 5000 };
    expect(brawlerComboEndPatch({}, 'boss', 6000, 100)).toBeNull();                                   // コンボの外
    expect(brawlerComboEndPatch(e, 'boss', 4999, 100)).toBeNull();                                    // 確定の固まりの最中
    expect(brawlerComboEndPatch({ ...e, brHoldUntil: 101 }, 'boss', 5000, 100)).toBeNull();           // 壁時計の固まり(止め)
    expect(brawlerComboEndPatch({ ...e, hitStunUntil: 101 }, 'mob', 5000, 100)).toBeNull();           // 当たりの止め
    expect(brawlerComboEndPatch({ ...e, brLiftUntil: 101 }, 'boss', 5000, 100)).toBeNull();           // 浮き
    expect(brawlerComboEndPatch(e, 'boss', 5000, 100)).toEqual({ brLockHits: undefined, brLockNoHoldUntil: 6500 });
    expect(brawlerComboEndPatch(e, 'strong', 5000, 100)).toEqual({ brLockHits: undefined, brLockNoHoldUntil: 5800 });
    expect(brawlerComboEndPatch(e, 'mob', 5000, 100)).toEqual({ brLockHits: undefined });
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

describe('§31 途中の取り直しをやめた(社長裁定2026-11-12「位置取り次第ではハズレることもある」)', () => {
  // 旧: 飛び蹴りの3発目の溜め明けの取り直し(§19-10)と、4段目の跳んでいる途中の取り直し(§29)。行動の状態に取り直しの旗は残っていない。
  it('3発目の蹴り・4段目を始めた状態に、取り直しの旗が無い', () => {
    const k3 = brawlerStartTech(initialBrawlerState(), 'kick', 1000, 3) as unknown as Record<string, unknown>;
    const s4 = brawlerStartAttack(initialBrawlerState(), 4, 1000, false) as unknown as Record<string, unknown>;
    expect('kickReaimed' in k3).toBe(false);
    expect('slamTracked' in s4).toBe(false);
  });
});

describe('踵落とし(飛び蹴りの2発目の続きで下・社長指示2026-11-11・§29)', () => {
  const kick = (n: number, resolved: boolean): BrawlerState => ({ ...brawlerStartTech({ ...initialBrawlerState(), points: 9, kickCount: n - 1, kickChainUntil: 9e9 }, 'kick', 1000, n), resolved, connected: resolved, landed: resolved });
  it('下が踵落としになるのは、2発目の最中と、2発目が終わって連続の受付の内だけ', () => {
    expect(brawlerHeelInput(kick(2, false), 'stomp', 1050)).toBe(true);
    expect(brawlerHeelInput(kick(2, true), 'stomp', 1300)).toBe(true);
    expect(brawlerHeelInput(kick(1, true), 'stomp', 1300)).toBe(false);
    expect(brawlerHeelInput(kick(3, true), 'stomp', 1300)).toBe(false);
    expect(brawlerHeelInput(kick(2, true), 'kick', 1300)).toBe(false);
    const idleIn = { ...initialBrawlerState(), kickCount: 2, kickChainUntil: 2000 };
    expect(brawlerHeelInput(idleIn, 'stomp', 1500)).toBe(true);
    expect(brawlerHeelInput(idleIn, 'stomp', 2001)).toBe(false);
    expect(brawlerHeelInput(initialBrawlerState(), 'stomp', 1000)).toBe(false);
  });
  it('踵落としの状態は飛び蹴りの3発目のまま(溜め・後隙は蹴り飛ばしと同じ)。名札と道だけ違う', () => {
    const a = brawlerStartTech(kick(2, true), 'kick', 2000, 3, false, true);
    const b = brawlerStartTech(kick(2, true), 'kick', 2000, 3, false, false);
    expect(a.kickHeel).toBe(true);
    expect(b.kickHeel).toBe(false);
    expect([a.windupMs, a.recoveryMs, a.kickChargeMs]).toEqual([b.windupMs, b.recoveryMs, b.kickChargeMs]);
    expect(brawlerRouteNodeOf(a)).toBe('heel');
    expect(brawlerRouteNodeOf(b)).toBe('kick3');
    // 1・2発目に踵落としの印は付かない。次の行動で印は消える。
    expect(brawlerStartTech(initialBrawlerState(), 'kick', 0, 1, false, true).kickHeel).toBe(false);
    expect(brawlerStartAttack(a, 1, 3000, false).kickHeel).toBe(false);
    expect(brawlerStartTech(a, 'stomp', 3000, 0, true).kickHeel).toBe(false);
  });
  it('踵落としは当たれば大踏み潰しでだけ取り消せる(蹴り飛ばしは取り消せない)', () => {
    const heel = { ...brawlerStartTech(kick(2, true), 'kick', 2000, 3, false, true), resolved: true, connected: true, landed: true };
    const tIn = 2000 + heel.windupMs + 10;
    expect(brawlerTechCancelOk(heel, 'stomp', tIn)).toBe(true);
    expect(brawlerTechCancelOk(heel, 'kiko', tIn)).toBe(false);
    expect(brawlerTechCancelOk({ ...heel, kickHeel: false }, 'stomp', tIn)).toBe(false);
    expect(brawlerTechCancelOk({ ...heel, landed: false, connected: false }, 'stomp', tIn)).toBe(false);
    expect(brawlerTechAllowed(heel, 'kick', tIn)).toBe(false);
  });
  it('値段は飛び蹴り+1(血の覚醒中は0)', () => {
    expect(brawlerHeelCost()).toBe(brawlerTechCost('kick') + BRAWLER_HEEL_EXTRA_COST);
    expect(brawlerHeelCost(true)).toBe(0);
  });
  it('影: 0 から斜め上へ振り上げ→少し沈んで溜め→飛ぶ間に時計回りに少し回し、当たる瞬間に伸び切る(水平の少し手前)', () => {
    const s = brawlerStartTech(kick(2, true), 'kick', 2000, 3, false, true);
    const c = s.kickChargeMs ?? 0;
    expect(brawlerHeelStandAt(s, 0).rot).toBeCloseTo(0);
    expect(brawlerHeelStandAt(s, c * 0.6).rot).toBeCloseTo(BRAWLER_HEEL_ROT_PEAK);
    expect(brawlerHeelStandAt(s, c).rot).toBeCloseTo(BRAWLER_HEEL_ROT_UP);
    const hit = brawlerHeelStandAt(s, s.windupMs);
    expect(hit.rot).toBeCloseTo(BRAWLER_HEEL_ROT_DOWN);
    expect(hit.ext).toBeCloseTo(1);
    // ★斜め上の蹴りを時計回りに少し回す(社長指示2026-11-12): 当たる瞬間は水平の少し手前・回しは少し
    expect(hit.rot).toBeLessThan(0);
    expect(hit.rot).toBeGreaterThanOrEqual(-0.2);
    const turn = hit.rot - brawlerHeelStandAt(s, c).rot;
    expect(turn).toBeGreaterThanOrEqual(0.3);
    expect(turn).toBeLessThanOrEqual(0.6);
    // 当たった後も水平を大きく越えて下向きにしない
    for (let el = s.windupMs; el <= s.windupMs + s.recoveryMs; el += 1) expect(brawlerHeelStandAt(s, el).rot).toBeLessThanOrEqual(0.15);
    // 1msごとに角度が跳ばない(溜め→飛ぶ→当たった後のつなぎ目も)
    let prev = brawlerHeelStandAt(s, 0).rot;
    for (let el = 1; el <= s.windupMs + s.recoveryMs; el += 1) { const r = brawlerHeelStandAt(s, el).rot; expect(Math.abs(r - prev)).toBeLessThan(0.05); prev = r; }
    // 体は空中に残る: 影の下がりは小さい(体から離れて下へ落ちない)
    expect(brawlerHeelStandAt(s, c).lift).toBeGreaterThan(0);
    expect(brawlerHeelStandAt(s, c).lift - hit.lift).toBeLessThanOrEqual(10);
    expect(hit.lift).toBeGreaterThanOrEqual(0);
    // 飛ぶ間は振り下ろす一方(戻らない)・伸びる一方
    let pr = -Infinity, pe = -Infinity;
    for (let el = c; el < s.windupMs; el += 5) { const f = brawlerHeelStandAt(s, el); expect(f.rot).toBeGreaterThanOrEqual(pr - 1e-9); expect(f.ext).toBeGreaterThanOrEqual(pe - 1e-9); pr = f.rot; pe = f.ext; }
  });
  it('受けた地上の敵の沈み: 0 から沈んで 0 へ戻る(端で途切れない)', () => {
    expect(brawlerHeelHitSink(0)).toBeCloseTo(0);
    expect(brawlerHeelHitSink(60)).toBeGreaterThan(5);
    expect(brawlerHeelHitSink(BRAWLER_HEEL_HIT_SINK_MS - 1)).toBeLessThan(0.1);
    expect(brawlerHeelHitSink(BRAWLER_HEEL_HIT_SINK_MS)).toBe(0);
    expect(brawlerHeelHitSink(-5)).toBe(0);
  });
});
