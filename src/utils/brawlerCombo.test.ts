// ★格闘の敵側の流れ(research/BRAWLER.md §11): 食らいの固まり・減衰・同じ技の罰・反撃の数と発動・赤い予告の時刻。
import { describe, it, expect } from 'vitest';
import {
  brawlerComboOnHit, brawlerHoldDecay, brawlerComboClock, brawlerRevengeHitsFor, brawlerRevengeShouldStart,
  brawlerRevengeStartPatch, brawlerRevengeDue, brawlerRevengeEndPatch, brawlerRevengeTelegraph, brawlerRevengeDamage,
  brawlerStageMoveKey, brawlerKickMoveKey,
  BRAWLER_HOLD_BASE_MS, BRAWLER_COMBO_GAP_MS, BRAWLER_SAME_MOVE_PENALTY_MS, BRAWLER_COMBO_FLOOR,
  BRAWLER_REVENGE_WINDUP_MS, BRAWLER_REVENGE_HITS_MOB, BRAWLER_REVENGE_NO_HOLD_MS, brawlerComboClass,
  type BrawlerComboFields, type BrawlerMoveKey, isBrawlerTechBusy, BRAWLER_HOLDABLE_PHASES,
  brawlerJugglePush, brawlerAirborne, brawlerJuggleHeightRel, brawlerJuggleLanded, BRAWLER_JUGGLE_DECAY, BRAWLER_JUGGLE_WEIGHT, BRAWLER_JUGGLE_PUSH, type BrawlerJuggleFields,
} from './brawlerCombo';
import { BRAWLER_LIFT_MS, brawlerLiftHeight } from './brawler';
import { meteorPhase } from './telegraphStyle';
import { setBrawlerTempoAll } from './brawlerCombo';
// ★テンポ係数(§9-68): この表の時刻は係数1.0(今までの値)で書いてある。係数1.3の挙動は brawlerTempo.store.test.ts で固める。
setBrawlerTempoAll(1.0); // 記述時(describe の中で時刻を組む所)より先に効かせる=モジュールの頭で呼ぶ

/** 当たりを順に入れて、各当たりの固まりの長さを返す。 */
const run = (type: BrawlerComboFields['type'], hits: { move: BrawlerMoveKey; at: number }[], countRevenge = true) => {
  let e: BrawlerComboFields = { type };
  const holds: number[] = [];
  for (const h of hits) {
    const r = brawlerComboOnHit(e, h.move, h.at, countRevenge);
    e = { ...e, ...r.patch };
    holds.push(r.holdMs);
  }
  return { e, holds };
};

describe('食らいの固まりの長さ(§11-1)', () => {
  it('基本の長さ: 1・2段目300 / 3段目450 / 4段目450 / 飛び蹴り1・2発目350 / 気功300 / 9連撃300。吹き飛ばす技は0', () => {
    expect(BRAWLER_HOLD_BASE_MS).toMatchObject({ s1: 300, s2: 300, s3: 450, s4: 450, kick1: 350, kick2: 350, kiko: 300, secret: 300 });
    for (const k of ['s5', 'kick3', 'stomp', 'secret-land'] as const) expect(BRAWLER_HOLD_BASE_MS[k]).toBe(0);
    expect(brawlerComboOnHit({ type: 'zombie' }, 's1', 1000).holdMs).toBe(300);
    expect(brawlerComboOnHit({ type: 'zombie' }, 's3', 1000).holdMs).toBe(450);
    expect(brawlerComboOnHit({ type: 'zombie' }, 'kick1', 1000).holdMs).toBe(350);
    expect(brawlerComboOnHit({ type: 'zombie' }, 's5', 1000).holdMs).toBe(0);
  });
  it('名札: 段 1..5 → s1..s5、飛び蹴り 1..3 → kick1..kick3', () => {
    expect([1, 2, 3, 4, 5].map(brawlerStageMoveKey)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect([1, 2, 3].map(brawlerKickMoveKey)).toEqual(['kick1', 'kick2', 'kick3']);
  });
  it('★ボス級も雑魚と同じ固まり・減衰・同じ技の罰(社長指示2026-11-08「ボスも、雑魚と共通の止まりにしよう 数値だけ今のまま」)。振り払いだけは無い', () => {
    let b: Parameters<typeof brawlerComboOnHit>[0] = { type: 'thor' };
    let m: Parameters<typeof brawlerComboOnHit>[0] = { type: 'zombie' };
    const moves = ['s1', 's2', 's1', 's3', 's4', 's1', 's2', 's3', 's1', 's2'] as const;
    let t = 1000;
    for (const mv of moves) {
      const rb = brawlerComboOnHit(b, mv, t), rm = brawlerComboOnHit(m, mv, t);
      expect(rb.holdMs).toBe(rm.holdMs);                  // 同じ長さ・同じ減衰・同じ罰
      expect(rb.patch.brComboPenalty).toBe(rm.patch.brComboPenalty);
      expect(rb.patch.brRevengePending).toBe(false);      // ボス級は振り払わない(数は Infinity に届かない)
      b = { ...b, ...rb.patch }; m = { ...m, ...rm.patch };
      t += 250;
    }
    expect(m.brRevengePending).toBe(true);                // 雑魚は7回で振り払いの予約
  });
});

describe('減衰(§11-2)', () => {
  it('固まり = 基本 × max(0.4, 1 − 時計/3000)', () => {
    expect(brawlerHoldDecay(0)).toBe(1);
    expect(brawlerHoldDecay(1500)).toBeCloseTo(0.5);
    expect(brawlerHoldDecay(1800)).toBeCloseTo(0.4);
    expect(brawlerHoldDecay(5000)).toBe(BRAWLER_COMBO_FLOOR);
  });
  it('当たり続けると短くなり、600ms 当たらなければ時計は0へ戻る', () => {
    const { e, holds } = run('zombie', [
      { move: 's1', at: 0 }, { move: 's2', at: 250 }, { move: 's3', at: 550 }, { move: 's4', at: 1100 },
    ]);
    expect(holds[0]).toBe(300);
    expect(holds[1]).toBe(Math.round(300 * (1 - 250 / 3000)));
    expect(holds[2]).toBe(Math.round(450 * (1 - 550 / 3000)));
    expect(holds[3]).toBe(Math.round(450 * (1 - 1100 / 3000)));
    expect(brawlerComboClock(e, 1100)).toBe(1100);
    // 途切れた(600ms 超)=始め直し
    const after = brawlerComboOnHit(e, 's1', 1100 + BRAWLER_COMBO_GAP_MS + 1);
    expect(after.holdMs).toBe(300);
    expect(after.patch.brComboHits).toBe(1);
  });
  it('5段を出し切る頃には固まりが4割近くまで落ちる(=次の流れは止め切れない)', () => {
    const { holds } = run('zombie', [
      { move: 's1', at: 0 }, { move: 's2', at: 245 }, { move: 's3', at: 550 }, { move: 's4', at: 1110 }, { move: 's5', at: 1630 },
      { move: 'kick1', at: 1900 }, { move: 'kick2', at: 2250 },
    ]);
    expect(holds[4]).toBe(0); // 5段目は吹き飛ばす
    expect(holds[5]).toBeLessThanOrEqual(Math.round(350 * 0.4) + 1);
    expect(holds[6]).toBe(Math.round(350 * BRAWLER_COMBO_FLOOR));
  });
});

describe('同じ技の罰(§11-2)', () => {
  it('同じ流れで同じ段・同じ技を当て直すと時計に +400ms(5段の順は罰を受けない)', () => {
    const order = run('zombie', [{ move: 's1', at: 0 }, { move: 's2', at: 300 }]);
    const same = run('zombie', [{ move: 's1', at: 0 }, { move: 's1', at: 300 }]);
    expect(order.e.brComboPenalty).toBe(0);
    expect(same.e.brComboPenalty).toBe(BRAWLER_SAME_MOVE_PENALTY_MS);
    expect(order.holds[1]).toBe(Math.round(300 * (1 - 300 / 3000)));
    expect(same.holds[1]).toBe(Math.round(300 * (1 - 700 / 3000)));
    expect(same.holds[1]).toBeLessThan(order.holds[1]);
  });
  it('1段目の連打は5段の順より早く抜けられる(4発目の固まりで比べる)', () => {
    const spam = run('zombie', [0, 300, 600, 900].map(at => ({ move: 's1' as const, at })));
    const flow = run('zombie', (['s1', 's2', 's1', 's2'] as const).map((move, i) => ({ move, at: i * 300 })));
    const chain = run('zombie', (['s1', 's2', 's3', 's4'] as const).map((move, i) => ({ move, at: i * 300 })));
    expect(spam.e.brComboPenalty).toBe(3 * BRAWLER_SAME_MOVE_PENALTY_MS);
    expect(spam.holds[3] / 300).toBeLessThan(flow.holds[3] / 300);
    expect(chain.e.brComboPenalty).toBe(0);
    expect(spam.holds[3] / 300).toBeLessThan(chain.holds[3] / 450);
  });
  it('飛び蹴りの3連は1発ごとに名札が違う=罰を受けない', () => {
    const k = run('zombie', [{ move: 'kick1', at: 0 }, { move: 'kick2', at: 300 }, { move: 'kick3', at: 600 }]);
    expect(k.e.brComboPenalty).toBe(0);
  });
});

describe('反撃(§11-3)', () => {
  it('反撃の数: 雑魚・強個体とも7(社長指示「強個体も雑魚と同じにして」)・ボス級は無し', () => {
    expect(brawlerRevengeHitsFor('zombie')).toBe(BRAWLER_REVENGE_HITS_MOB);
    expect(BRAWLER_REVENGE_HITS_MOB).toBe(7);
    for (const t of ['pumpkin', 'driller', 'logger', 'lab-zombie-3', 'reaper'] as const) {
      expect(brawlerComboClass(t)).toBe('strong');
      expect(brawlerRevengeHitsFor(t)).toBe(7);
    }
    expect(brawlerComboClass('hunter')).toBe('boss');
    expect(brawlerRevengeHitsFor('thor')).toBe(Infinity);
  });
  it('雑魚も強個体も7発目で予約・6発では予約しない', () => {
    const six = run('zombie', Array.from({ length: 6 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    expect(six.e.brRevengePending).toBe(false);
    const seven = run('zombie', Array.from({ length: 7 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    expect(seven.e.brRevengePending).toBe(true);
    const strong6 = run('pumpkin', Array.from({ length: 6 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    expect(strong6.e.brRevengePending).toBe(false);
    const strong7 = run('pumpkin', Array.from({ length: 7 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    expect(strong7.e.brRevengePending).toBe(true);
    // 固まりの長さも雑魚と同じ
    expect(brawlerComboOnHit({ type: 'driller' }, 's3', 0).holdMs).toBe(brawlerComboOnHit({ type: 'zombie' }, 's3', 0).holdMs);
  });
  it('数えない当たり(秘奥義)は反撃の数に足さない', () => {
    const r = run('zombie', Array.from({ length: 9 }, (_, i) => ({ move: 'secret' as const, at: i * 170 })), false);
    expect(r.e.brComboHits).toBe(0);
    expect(r.e.brRevengePending).toBe(false);
  });
  it('流れが途切れたら反撃の数も0から', () => {
    const a = run('zombie', Array.from({ length: 6 }, (_, i) => ({ move: brawlerStageMoveKey((i % 4) + 1), at: i * 200 })));
    const b = brawlerComboOnHit(a.e, 's1', 1000 + BRAWLER_COMBO_GAP_MS + 200);
    expect(b.patch.brComboHits).toBe(1);
    expect(b.patch.brRevengePending).toBe(false);
  });
  it('発動: 予約済み・技を出していない時だけ。溜め350ms → 当たる。当たった後1.2秒は固まらない', () => {
    expect(brawlerRevengeShouldStart({ type: 'zombie', brRevengePending: true }, false)).toBe(true);
    expect(brawlerRevengeShouldStart({ type: 'zombie', brRevengePending: true }, true)).toBe(false);
    expect(brawlerRevengeShouldStart({ type: 'zombie', brRevengePending: false }, false)).toBe(false);
    expect(brawlerRevengeShouldStart({ type: 'thor', brRevengePending: true }, false)).toBe(false);
    const st = brawlerRevengeStartPatch(5000);
    expect(st).toMatchObject({ aiPhase: 'br-revenge', aiStartedAt: 5000, aiPhaseUntil: 5000 + BRAWLER_REVENGE_WINDUP_MS, brRevengePending: false });
    expect(brawlerRevengeDue(st, 5349)).toBe(false);
    expect(brawlerRevengeDue(st, 5350)).toBe(true);
    const end = brawlerRevengeEndPatch(9000);
    expect(end.brNoHoldUntil).toBe(9000 + BRAWLER_REVENGE_NO_HOLD_MS);
    expect(end.brComboHits).toBe(0);
    expect(end.aiPhase).toBeUndefined();
    // 振り払いの後は固まらない(数と時計は始め直し)
    const after = brawlerComboOnHit({ type: 'zombie', ...end }, 's1', 9500);
    expect(after.holdMs).toBe(0);
    expect(brawlerComboOnHit({ type: 'zombie', ...end }, 's1', 9000 + BRAWLER_REVENGE_NO_HOLD_MS + 1).holdMs).toBe(300);
  });
  it('威力は接触/噛みつきの ×1.5', () => {
    expect(brawlerRevengeDamage(10)).toBe(15);
  });
});

describe('★★赤い予告の4つの掟(振り払い)', () => {
  const start = 10_000, hit = start + BRAWLER_REVENGE_WINDUP_MS;
  it('②出る時刻 = 溜めの開始(その瞬間から出ていて、1ms前は出ていない)', () => {
    expect(brawlerRevengeTelegraph(start, hit, start).visible).toBe(true);
    expect(brawlerRevengeTelegraph(start, hit, start - 1).visible).toBe(false);
    expect(brawlerRevengeTelegraph(start, hit, start).prog).toBe(0);
  });
  it('③消え切る時刻 = 当たる時刻(er が1になるのは当たる瞬間ちょうど・1ms前はまだ残っている)', () => {
    const atHit = brawlerRevengeTelegraph(start, hit, hit);
    expect(atHit.er).toBe(1);
    expect(atHit.visible).toBe(false);
    const before = brawlerRevengeTelegraph(start, hit, hit - 1);
    expect(before.visible).toBe(true);
    expect(before.er).toBeLessThan(1);
    // 当たる時刻 = 状態機械が判定を積む時刻(aiPhaseUntil)
    const st = brawlerRevengeStartPatch(start);
    expect(st.aiPhaseUntil).toBe(hit);
    expect(brawlerRevengeDue(st, hit)).toBe(true);
    expect(brawlerRevengeDue(st, hit - 1)).toBe(false);
  });
  it('①流星: 位相は meteorPhase(描いてから外→内へ流れて消える)', () => {
    for (const t of [0, 0.2, 0.45, 0.6, 0.9, 1]) {
      const g = brawlerRevengeTelegraph(start, hit, start + t * BRAWLER_REVENGE_WINDUP_MS);
      const m = meteorPhase(t, 0.45);
      expect(g.p).toBeCloseTo(m.p);
      expect(g.er).toBeCloseTo(m.er);
    }
  });
});

describe('「本当に技を出している最中」の仕分け(社長実機報告2026-11-08・§9-59)', () => {
  const gt = 1000;
  it('移動・待ち・後退・様子見・硬直の相は技ではない=固める', () => {
    for (const ph of ['zpause', 'zrush', 'z-wait', 'z-recover', 'z-retreat', 'b-approach', 'b-orbit', 'b-release',
      's-crouch', 's-recover', 's-retreat', 'crouch', 'recover', 'dash-recover', 'w-retreat', 'driller-thrust-recover', 'logger-sweep-recover']) {
      expect(BRAWLER_HOLDABLE_PHASES.has(ph), ph).toBe(true);
      expect(isBrawlerTechBusy({ aiPhase: ph }, gt), ph).toBe(false);
    }
    expect(isBrawlerTechBusy({}, gt)).toBe(false);
    // §16の技の続きの後退・硬直(chaffMove が立ったまま)も固める
    expect(isBrawlerTechBusy({ aiPhase: 's-retreat', chaffMove: 'skel-bite' }, gt)).toBe(false);
  });
  it('予告の溜め・攻撃の相・噛みつきの構え・§16の技は技の最中=固めない。表に無い相も技の最中', () => {
    for (const ph of ['windup', 'charge', 'jump', 'scream', 'driller-thrust-windup', 'driller-thrust-active', 'logger-sweep-windup', 'logger-sweep-active',
      'b-windup', 'b-lunge', 'b-grab', 's-arc', 's-bite', 'z-red-pause', 'z-lunge-in', 'z-bite1', 'z-stagger', 'z-bite2', 'lich-blink', 'br-revenge', 'g-stomp-windup', 'unknown-phase']) {
      expect(isBrawlerTechBusy({ aiPhase: ph }, gt), ph).toBe(true);
    }
    expect(isBrawlerTechBusy({ aiPhase: 'zrush', biteAt: 900 }, gt)).toBe(true);
    expect(isBrawlerTechBusy({ chaffMove: 'zombie-double' }, gt)).toBe(true);
  });
  it('会心の気絶中は技の最中ではない(isEnemyAttacking と同じ)', () => {
    expect(isBrawlerTechBusy({ aiPhase: 'z-red-pause', stunUntil: gt + 1 }, gt)).toBe(false);
  });
});

describe('浮かせ追撃(research/BRAWLER.md §12-1・社長「段々重くなる 雑魚は軽い 強個体は少し重い ボスは重い」)', () => {
  const apply = (e: BrawlerJuggleFields, p: ReturnType<typeof brawlerJugglePush>) => ({ ...e, ...(p ?? {}) });
  it('地上では4段目だけが浮かせる。雑魚1.0 / 強個体0.7 / ボス級0.4 を高さと時間に掛ける', () => {
    expect(brawlerJugglePush({}, 'mob', 's1', 0)).toBeNull();
    expect(brawlerJugglePush({}, 'mob', 'kick1', 0)).toBeNull();
    const m = brawlerJugglePush({}, 'mob', 's4', 0)!, st = brawlerJugglePush({}, 'strong', 's4', 0)!, b = brawlerJugglePush({}, 'boss', 's4', 0)!;
    expect(BRAWLER_JUGGLE_WEIGHT).toEqual({ mob: 1.0, strong: 0.7, boss: 0.4 });
    expect([m.brLiftPeak, st.brLiftPeak, b.brLiftPeak]).toEqual([1, 0.7, 0.4]);
    expect(m.brLiftMs).toBe(BRAWLER_LIFT_MS);
    expect(st.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * 0.7));
    expect(b.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * 0.4));
    expect(m.liftUntil).toBe(m.brLiftUntil); // 動けない間=全ての敵の制御が読む liftUntil
  });
  it('浮いている間の当たりで浮きが続き、押し上げるたびに 0.75^n 倍に軽くなる・いずれ落ちる', () => {
    let e: BrawlerJuggleFields = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    expect(brawlerAirborne(e, 100)).toBe(true);
    const peaks: number[] = [];
    let t = 100;
    for (let i = 0; i < 10; i++) {
      const p = brawlerJugglePush(e, 'mob', 's3', t);
      if (!p) break;
      e = apply(e, p); peaks.push(p.brLiftPeak!);
      t += 120;
    }
    expect(peaks[0]).toBeCloseTo(BRAWLER_JUGGLE_PUSH.s3 * BRAWLER_JUGGLE_DECAY);
    expect(peaks[1]).toBeCloseTo(BRAWLER_JUGGLE_PUSH.s3 * BRAWLER_JUGGLE_DECAY ** 2);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    expect(peaks.length).toBeLessThan(10); // 永久には浮かない
  });
  it('押し上げは高さを今の高さから引き継ぐ(途切れない)・空中で吹き飛ばす技は浮きを終えて落ちる', () => {
    const e0 = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    const h = brawlerJuggleHeightRel(e0, 200);
    const e1 = apply(e0, brawlerJugglePush(e0, 'mob', 's1', 200));
    expect(brawlerJuggleHeightRel(e1, 200)).toBeCloseTo(h, 5);
    const drop = brawlerJugglePush(e0, 'mob', 's5', 200)!;
    expect(drop.liftUntil).toBe(200);
    const e2 = apply(e0, drop);
    expect(brawlerAirborne(e2, 201)).toBe(false);
    expect(brawlerJuggleHeightRel(e2, 200)).toBeCloseTo(h, 5);
    expect(brawlerJuggleHeightRel(e2, 400)).toBe(0);
    // 着地の砂埃は絵の弧が地面に着いた時
    expect(brawlerJuggleLanded(e2, 399)).toBe(false);
    expect(brawlerJuggleLanded(e2, 400)).toBe(true);
  });
  // ★§12-1(社長承認2026-11-08「格闘ゲームの空中コンボの手触り」): 打ち上がり25% → 頂点の漂い20% → 落下55%・基本 585ms。
  const sample = (f: (u: number) => number, n = 400) => Array.from({ length: n + 1 }, (_, i) => ({ u: i / n, h: f(i / n) }));
  const apexU = (pts: { u: number; h: number }[]) => pts.reduce((a, b) => (b.h > a.h ? b : a)).u;
  it('浮きの時間の表: 基本 585ms(旧450の1.3倍)×重さ×0.75^n・下限 140ms・空中で吹き飛ばすと 200ms で落ちる', () => {
    expect(BRAWLER_LIFT_MS).toBe(585);
    expect(brawlerJugglePush({}, 'mob', 's4', 0)!.brLiftMs).toBe(585);
    expect(brawlerJugglePush({}, 'strong', 's4', 0)!.brLiftMs).toBe(410);
    expect(brawlerJugglePush({}, 'boss', 's4', 0)!.brLiftMs).toBe(234);
    const e0 = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    const p1 = brawlerJugglePush(e0, 'mob', 's1', 100)!;
    expect(p1.brLiftMs).toBe(Math.round(585 * 0.5 * 0.75));
    expect(p1.liftUntil).toBe(100 + p1.brLiftMs!); // 動けない間=絵の弧と同じ長さ
    expect(brawlerJugglePush(e0, 'mob', 's5', 100)!.brLiftMs).toBe(200);
  });
  it('高さの曲線: 頂点は25〜45%の区間・落下(頂点→地面)は打ち上がりより長い・上りは速く落ちはゆっくり始まる', () => {
    const pts = sample(brawlerLiftHeight);
    const a = apexU(pts);
    expect(a).toBeGreaterThanOrEqual(0.25 - 1e-9);
    expect(a).toBeLessThanOrEqual(0.45);
    expect(1 - a).toBeGreaterThan(a);                                    // 落ちる時間 > 上がる時間
    const top = brawlerLiftHeight(a);
    expect(brawlerLiftHeight(0.1)).toBeGreaterThan(top * 0.6);           // 上り: 最初の10%で6割以上
    expect(brawlerLiftHeight(0.55)).toBeGreaterThan(top * 0.85);         // 落ちの頭(頂点の漂いの直後)はまだ高い=ゆっくり始まる
    expect(brawlerLiftHeight(0.45)).toBeGreaterThan(top * 0.9);          // 漂いの間はほぼ頂点
    expect(brawlerLiftHeight(1)).toBe(0);
    // 落下は加速する(後半ほど1刻みの落ちが大きい)
    const d1 = brawlerLiftHeight(0.6) - brawlerLiftHeight(0.65), d2 = brawlerLiftHeight(0.9) - brawlerLiftHeight(0.95);
    expect(d2).toBeGreaterThan(d1);
    // つなぎ目で高さも速さも跳ばない(隣り合う刻みの差が滑らか)
    for (let i = 2; i < pts.length; i++) {
      const v1 = pts[i - 1].h - pts[i - 2].h, v2 = pts[i].h - pts[i - 1].h;
      expect(Math.abs(v2 - v1)).toBeLessThan(top * 0.01);
    }
  });
  it('追撃で浮き直した弧も同じ形: 頂点は区間の25〜45%・つなぎ目で高さが跳ばない・追撃ごとに短く低くなる', () => {
    let e: BrawlerJuggleFields = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    let t = 0;
    const rises: number[] = []; const mss: number[] = [];
    for (let i = 0; i < 4; i++) {
      t += Math.round((e.brLiftMs ?? 0) * 0.3);                          // 頂点の少し後で殴る
      const before = brawlerJuggleHeightRel(e, t);
      const p = brawlerJugglePush(e, 'mob', 's3', t);
      if (!p) break;
      e = apply(e, p);
      expect(brawlerJuggleHeightRel(e, t)).toBeCloseTo(before, 9);     // つなぎ目
      expect(brawlerJuggleHeightRel(e, t + 1)).toBeCloseTo(before, 1);
      const ms = e.brLiftMs!, t0 = t;
      const pts = sample(u => brawlerJuggleHeightRel(e, t0 + u * ms));
      const a = apexU(pts);
      expect(a).toBeGreaterThanOrEqual(0.25 - 1e-9);
      expect(a).toBeLessThanOrEqual(0.45);
      rises.push(brawlerJuggleHeightRel(e, t0 + ms * 0.25) - before);
      mss.push(ms);
    }
    expect(rises.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < rises.length; i++) {
      expect(rises[i]).toBeLessThan(rises[i - 1]);                       // 上がり直す量は減る
      expect(mss[i]).toBeLessThan(mss[i - 1]);                           // 浮きは短くなる
    }
  });
  it('ボスの技の最中(bossState が追いかけ以外)は技の最中=浮かない', () => {
    expect(isBrawlerTechBusy({ bossState: 'chase' }, 0)).toBe(false);
    expect(isBrawlerTechBusy({ bossState: 'issen-windup' }, 0)).toBe(true);
  });
});
