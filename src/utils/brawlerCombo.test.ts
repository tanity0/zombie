// ★格闘の敵側の流れ(research/BRAWLER.md §11): 流れの数え(反撃の数・ダメージ補正の数)・反撃の発動・赤い予告の時刻・浮かせ追撃。
// ★§19(2026-11-10): 固まりの減衰・同じ技の罰・固まりの基本の長さの表は撤去した(置き換え先=確定の固まり。純関数のテストは brawlerRoute.test.ts)。
// ★§20(2026-11-11): 固まりは「止め+技ごとの固まり×コンボの減衰」で当たりの瞬間に置き換えて書く。同じ技2回目も固める(減衰が止める)。ここの表は係数1.0の値。
import { describe, it, expect } from 'vitest';
import {
  brawlerComboOnHit, brawlerLockOnHit, brawlerLockHitMs, brawlerComboEndPatch, brawlerLinkOnHit, brawlerLinkMax, brawlerLinkDisplay,
  brawlerStageMoveKey, brawlerKickMoveKey,
  BRAWLER_SECRET_HOLD_MS, BRAWLER_COMBO_GAP_MS, type BrawlerLockFields,
  type BrawlerComboFields, type BrawlerMoveKey, isBrawlerTechBusy, BRAWLER_HOLDABLE_PHASES,
  brawlerJugglePush, brawlerAirborne, brawlerJuggleHeightRel, brawlerJuggleLanded, BRAWLER_JUGGLE_WEIGHT, BRAWLER_JUGGLE_WEIGHT_STUN_BOSS, BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_COST, BRAWLER_JUGGLE_DROP_MS, BRAWLER_DOWN_NO_HOLD_MS, type BrawlerJuggleFields,
} from './brawlerCombo';
import { BRAWLER_LIFT_MS, brawlerLiftHeight } from './brawler';
import { setBrawlerTempoAll } from './brawlerCombo';
// ★テンポ係数(§9-68): この表の時刻は係数1.0(今までの値)で書いてある。係数1.3の挙動は brawlerTempo.store.test.ts で固める。
setBrawlerTempoAll(1.0); // 記述時(describe の中で時刻を組む所)より先に効かせる=モジュールの頭で呼ぶ

/** 当たりを順に入れて、流れの数えを進める。 */
const run = (type: BrawlerComboFields['type'], hits: { move: BrawlerMoveKey; at: number }[]) => {
  let e: BrawlerComboFields = { type };
  for (const h of hits) e = { ...e, ...brawlerComboOnHit(e, h.move, h.at).patch };
  return { e };
};
/** 確定の固まり(§19-3)を当たりの順に書く(gameTime=壁時計と同じ進みで見る)。各当たりの「当たりの瞬間からの固まりの長さ」を返す(固めなければ 0)。 */
const STOP: Record<string, number> = { s1: 90, s2: 90, s3: 150, s4: 150, s5: 220, kick1: 150, kick2: 150, kick3: 220, stomp: 220, kiko: 0 };
const lockRun = (hits: { move: BrawlerMoveKey; at: number }[], cls: 'mob' | 'strong' | 'boss' = 'mob') => {
  let e: BrawlerLockFields = {};
  const holds: number[] = [];
  for (const h of hits) {
    // 当たりの前に、コンボが終わっていれば区切る(実機では毎フレーム見るので、区切りの時刻=固まりが明けた瞬間)。
    const endAt = e.brLockUntil !== undefined && e.brLockUntil <= h.at ? e.brLockUntil : h.at;
    e = { ...e, ...(brawlerComboEndPatch(e, cls, endAt, endAt) ?? {}) };
    const r = brawlerLockOnHit(e, h.move, h.at, h.at, { stopMs: STOP[h.move] ?? 0, enemyStopMs: STOP[h.move] ?? 0, canHold: true, airborneAfter: false });
    e = { ...e, ...r.patch };
    holds.push(r.held ? (e.brLockUntil ?? h.at) - h.at : 0);
  }
  return { e, holds };
};

describe('固まりの長さ(§20-4・旧 §11-1 の基本の長さの表を置き換えた)', () => {
  it('当たりの瞬間から「止め + 技ごとの固まり」。締め・気功は0(係数1.0)', () => {
    expect(brawlerLockHitMs('s1', 90)).toBe(90 + 300);
    expect(brawlerLockHitMs('s2', 90)).toBe(90 + 300);
    expect(brawlerLockHitMs('s3', 150)).toBe(150 + 520);
    expect(brawlerLockHitMs('s4', 150)).toBe(150 + 470);
    expect(brawlerLockHitMs('kick1', 150)).toBe(150 + 250);
    expect(brawlerLockHitMs('kick2', 150)).toBe(150 + 310);
    expect(brawlerLockHitMs('stomp', 220)).toBe(220 + 230);
    for (const k of ['s5', 'kick3', 'kiko', 'secret', 'secret-land'] as const) expect(brawlerLockHitMs(k, 220)).toBe(0);
    expect(BRAWLER_SECRET_HOLD_MS).toBe(300); // 秘奥義の9連撃の1発(壁時計の固まり・§17 の止めの下で今どおり)
  });
  it('名札: 段 1..5 → s1..s5、飛び蹴り 1..3 → kick1..kick3', () => {
    expect([1, 2, 3, 4, 5].map(brawlerStageMoveKey)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect([1, 2, 3].map(brawlerKickMoveKey)).toEqual(['kick1', 'kick2', 'kick3']);
  });
  it('★ボス級も雑魚と同じ固まりの長さ(社長指示2026-11-08「ボスも、雑魚と共通の止まりにしよう 数値だけ今のまま」)', () => {
    // 固まりの長さは区分に依らない(式は区分を見ない)。違うのはコンボの後の固まらない時間(ボス級1500・強個体800・雑魚なし)。
    const hits = (['s1', 's2', 's3', 's4'] as const).map((move, i) => ({ move, at: i * 250 }));
    expect(lockRun(hits, 'boss').holds).toEqual(lockRun(hits, 'mob').holds);
  });
});

describe('止め続けられない(§20-4 の減衰・⑤固まらない時間・旧 §11-2 の減衰と同じ技の罰を置き換えた)', () => {
  it('当て続ける間、固まりは当たりごとに置き換わる(5発目までは満額)。流れの時計は GAP(700ms)当たらなければ始め直す', () => {
    const { holds } = lockRun([{ move: 's1', at: 0 }, { move: 's2', at: 250 }, { move: 's3', at: 550 }, { move: 's4', at: 1100 }]);
    expect(holds).toEqual([390, 390, 670, 620]);
    const { e } = run('zombie', [{ move: 's1', at: 0 }, { move: 's2', at: 250 }, { move: 's3', at: 550 }, { move: 's4', at: 1100 }]);
    expect(e.brFlowHits).toBe(4);
    const after = brawlerComboOnHit(e, 's1', 1100 + BRAWLER_COMBO_GAP_MS + 1);
    expect(after.patch.brFlowHits).toBe(1);
  });
  it('同じ技の2回目も固める(同じ技の罰は無い)。止めるのは減衰(固まりを書いた当たりの6発目から×0.8ずつ)。締め(5段目・3発目)は固めず数えない', () => {
    expect(lockRun([{ move: 's1', at: 0 }, { move: 's1', at: 200 }]).holds).toEqual([390, 390]);
    expect(lockRun([{ move: 'kick1', at: 0 }, { move: 'kick1', at: 250 }]).holds).toEqual([400, 400]);
    expect(lockRun((['s1', 's2', 's3', 's4', 's5'] as const).map((move, i) => ({ move, at: i * 250 }))).holds).toEqual([390, 390, 670, 620, 0]);
    expect(lockRun([{ move: 'kick1', at: 0 }, { move: 'kick2', at: 250 }, { move: 'kick3', at: 500 }]).holds).toEqual([400, 460, 0]);
    // 1段目を8回: 5発目まで 90+300 / 6発目 90+240 / 7発目 90+192 / 8発目 90+154
    const eight = lockRun(Array.from({ length: 8 }, (_, i) => ({ move: 's1' as const, at: i * 100 })));
    expect(eight.holds).toEqual([390, 390, 390, 390, 390, 330, 282, 244]);
    expect(eight.e.brLockHits).toBe(8);
    // 締め・気功を挟んでも数えない
    expect(lockRun([{ move: 's1', at: 0 }, { move: 's5', at: 100 }, { move: 'kiko', at: 150 }]).e.brLockHits).toBe(1);
  });
  it('コンボの後: ボス級は1500ms・強個体は800ms 固まらない。雑魚は固まらない時間なし', () => {
    // 1段目(固まり390ms)が明けた後に、また1段目から
    const again = (cls: 'mob' | 'strong' | 'boss', gap: number) => lockRun([{ move: 's1', at: 0 }, { move: 's1', at: 390 + gap }], cls).holds[1];
    expect(again('boss', 100)).toBe(0);
    expect(again('boss', 1499)).toBe(0);
    expect(again('boss', 1500)).toBe(390);
    expect(again('strong', 799)).toBe(0);
    expect(again('strong', 800)).toBe(390);
    expect(again('mob', 0)).toBe(390);
  });
});

// 反撃(振り払い・§11-3)と、その赤い予告のテストは撤去した(社長指示2026-11-11「格闘の敵の反撃は外して」)。

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
      'b-windup', 'b-lunge', 'b-grab', 's-arc', 's-bite', 'z-red-pause', 'z-lunge-in', 'z-bite1', 'z-stagger', 'z-bite2', 'lich-blink', 'g-stomp-windup', 'unknown-phase']) {
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
  it('地上では3段目(アッパー・§13-2)と4段目が浮かせる。雑魚1.0 / 強個体0.7 / ボス級0.7(気絶・紫の間に浮かせた時だけ1.0) を高さと時間に掛ける・予算 6/5/4', () => {
    expect(brawlerJugglePush({}, 'mob', 's1', 0)).toBeNull();
    expect(brawlerJugglePush({}, 'mob', 'kick1', 0)).toBeNull();
    expect(brawlerJugglePush({}, 'mob', 'kick3', 0)).toBeNull();
    // 飛び蹴りの2発目は地上から少しだけ打ち上げる(社長指示2026-11-11)。高さ0.7(3段目より少し低い)×重さ・時間も同じ比
    // (0.7=3発目が当たる時にまだ浮いている滞空・§19-10)。
    expect(brawlerJugglePush({}, 'mob', 'kick2', 0)!.brLiftPeak).toBeCloseTo(0.7);
    expect(brawlerJugglePush({}, 'strong', 'kick2', 0)!.brLiftPeak).toBeCloseTo(0.49);
    expect(brawlerJugglePush({}, 'mob', 'kick2', 0)!.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * 0.7));
    expect(brawlerJugglePush({}, 'mob', 's3', 0)!.brLiftPeak).toBeCloseTo(0.75);
    expect(BRAWLER_JUGGLE_BUDGET).toEqual({ mob: 6, strong: 5, boss: 4 });
    expect([brawlerJugglePush({}, 'mob', 's4', 0)!.brLiftBudget, brawlerJugglePush({}, 'strong', 's3', 0)!.brLiftBudget, brawlerJugglePush({}, 'boss', 's4', 0)!.brLiftBudget]).toEqual([6, 5, 4]);
    const m = brawlerJugglePush({}, 'mob', 's4', 0)!, st = brawlerJugglePush({}, 'strong', 's4', 0)!, b = brawlerJugglePush({}, 'boss', 's4', 0)!;
    expect(BRAWLER_JUGGLE_WEIGHT).toEqual({ mob: 1.0, strong: 0.7, boss: 0.7 }); // ボス級は強個体と同じ(2026-11-10 は雑魚と同じ 1.0 だった)
    expect(BRAWLER_JUGGLE_WEIGHT_STUN_BOSS).toBe(1.0);                           // 気絶・紫の間に地上から浮かせた時だけ軽い
    expect([m.brLiftPeak, st.brLiftPeak, b.brLiftPeak]).toEqual([1, 0.7, 0.7]);
    expect([m.brLiftLight, st.brLiftLight, b.brLiftLight]).toEqual([false, false, false]);
    expect(m.brLiftMs).toBe(BRAWLER_LIFT_MS);
    expect(st.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * 0.7));
    expect(b.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * 0.7)); // ボス級も強個体と同じ長さ
    // 気絶・紫の間に地上から浮かせたボス級は軽い(雑魚と同じ高さと長さ・brLiftLight)。雑魚・強個体は気絶を見ない。
    const bl = brawlerJugglePush({}, 'boss', 's4', 0, true)!;
    expect([bl.brLiftPeak, bl.brLiftMs, bl.brLiftLight]).toEqual([1, BRAWLER_LIFT_MS, true]);
    expect(brawlerJugglePush({}, 'mob', 's4', 0, true)!.brLiftPeak).toBe(1);
    expect(brawlerJugglePush({}, 'strong', 's4', 0, true)!.brLiftPeak).toBe(0.7);
    // 空中の押し上げ: 軽く浮かせたコンボ(brLiftLight)は1.0のまま、そうでなければ0.7
    const pl = brawlerJugglePush(apply({}, bl), 'boss', 's1', 100)!, ph = brawlerJugglePush(apply({}, b), 'boss', 's1', 100)!;
    expect(pl.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * 0.5));
    expect(ph.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * 0.5 * 0.7));
    expect(m.liftUntil).toBe(m.brLiftUntil); // 動けない間=全ての敵の制御が読む liftUntil
  });
  it('★§13-2 予算: 空中の当たりで浮き直し、弱1・強/技2を使う。足りない当たりで落ちてダウン(拾えない・着地まで動けない・着地の後しばらく固まらない)', () => {
    expect([BRAWLER_JUGGLE_COST.s1, BRAWLER_JUGGLE_COST.s2, BRAWLER_JUGGLE_COST.kiko]).toEqual([1, 1, 1]);
    expect([BRAWLER_JUGGLE_COST.s3, BRAWLER_JUGGLE_COST.kick1, BRAWLER_JUGGLE_COST.kick2, BRAWLER_JUGGLE_COST.secret]).toEqual([2, 2, 2, 2]);
    expect([BRAWLER_JUGGLE_COST.s4, BRAWLER_JUGGLE_COST.stomp]).toEqual([1, 0]); // 実装で決めた所(§9-73)
    let e: BrawlerJuggleFields = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    let t = 100;
    const left: number[] = [];
    for (const mv of ['kick1', 's1', 's2', 'kiko', 's1'] as BrawlerMoveKey[]) { const p = brawlerJugglePush(e, 'mob', mv, t)!; expect(p.brLiftDown, mv).toBe(false); e = apply(e, p); left.push(e.brLiftBudget!); t += 120; }
    expect(left).toEqual([4, 3, 2, 1, 0]);                          // 0 までは拾える
    const d = brawlerJugglePush(e, 'mob', 's1', t)!;                // 足りない当たり=ダウン
    expect(d.brLiftDown).toBe(true);
    expect(d.liftUntil).toBe(t + BRAWLER_JUGGLE_DROP_MS);           // 着地まで動けない
    expect(d.brNoHoldUntil).toBe(t + BRAWLER_JUGGLE_DROP_MS + BRAWLER_DOWN_NO_HOLD_MS); // 起き上がり
    const ed = apply(e, d);
    expect(brawlerAirborne(ed, t + 10)).toBe(true);
    expect(brawlerJugglePush(ed, 'mob', 's1', t + 10)).toBeNull();  // ダウン中は拾えない
    // ボス級は4: 弱い当たりで4回拾えて、5回目で落ちる
    let b: BrawlerJuggleFields = apply({}, brawlerJugglePush({}, 'boss', 's4', 0));
    for (let i = 0; i < 4; i++) { const p = brawlerJugglePush(b, 'boss', 's1', 50 + i * 50)!; expect(p.brLiftDown).toBe(false); b = apply(b, p); }
    expect(brawlerJugglePush(b, 'boss', 's1', 300)!.brLiftDown).toBe(true);
    // 強個体は5
    let st: BrawlerJuggleFields = apply({}, brawlerJugglePush({}, 'strong', 's3', 0));
    for (let i = 0; i < 5; i++) st = apply(st, brawlerJugglePush(st, 'strong', 's2', 50 + i * 40));
    expect(st.brLiftDown).toBe(false);
    expect(brawlerJugglePush(st, 'strong', 's2', 400)!.brLiftDown).toBe(true);
  });
  it('★§13-2 地面バウンド: 空中の大踏み潰しは1コンボに1回だけ跳ね返る(落ちて小さく浮く=拾える)。2回目は叩き落とし', () => {
    let e: BrawlerJuggleFields = { ...apply({}, brawlerJugglePush({}, 'mob', 's4', 0)), brComboStart: 7 };
    const h = brawlerJuggleHeightRel(e, 150);
    const b1 = brawlerJugglePush(e, 'mob', 'stomp', 150)!;
    expect(b1.brLiftDown).toBe(false);
    expect(b1.brBounceCombo).toBe(7);
    e = apply(e, b1);
    expect(brawlerJuggleHeightRel(e, 150)).toBeCloseTo(h, 6);                       // つなぎ目
    expect(brawlerJuggleHeightRel(e, 150 + b1.brLiftDropMs! - 1)).toBeLessThan(h * 0.05); // 地面まで落ちる
    expect(brawlerJuggleHeightRel(e, 150 + b1.brLiftDropMs! + 60)).toBeGreaterThan(0.05); // 跳ね返る
    const b2 = brawlerJugglePush(e, 'mob', 'stomp', 150 + b1.brLiftDropMs! + 80)!;
    expect(b2.brLiftDown).toBe(true);                                               // 同じ流れの2回目は叩き落とし
    // 流れが変われば(別のコンボ)また跳ねる
    const e3: BrawlerJuggleFields = { ...apply({}, brawlerJugglePush({}, 'mob', 's4', 1000)), brComboStart: 9, brBounceCombo: 7 };
    expect(brawlerJugglePush(e3, 'mob', 'stomp', 1100)!.brLiftDown).toBe(false);
  });
  it('押し上げは高さを今の高さから引き継ぐ(途切れない)・空中で吹き飛ばす技は浮きを終えて落ちる', () => {
    const e0 = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    const h = brawlerJuggleHeightRel(e0, 200);
    const e1 = apply(e0, brawlerJugglePush(e0, 'mob', 's1', 200));
    expect(brawlerJuggleHeightRel(e1, 200)).toBeCloseTo(h, 5);
    const drop = brawlerJugglePush(e0, 'mob', 's5', 200)!;
    expect(drop.liftUntil).toBe(400);                     // §13-2: 締めの叩き落としもダウン=着地まで動けない
    const e2 = apply(e0, drop);
    expect(brawlerAirborne(e2, 201)).toBe(true);
    expect(drop.brLiftDown).toBe(true);
    expect(brawlerJuggleHeightRel(e2, 200)).toBeCloseTo(h, 5);
    expect(brawlerJuggleHeightRel(e2, 400)).toBe(0);
    // 着地の砂埃は絵の弧が地面に着いた時
    expect(brawlerJuggleLanded(e2, 399)).toBe(false);
    expect(brawlerJuggleLanded(e2, 400)).toBe(true);
  });
  // ★§12-1(社長承認2026-11-08「格闘ゲームの空中コンボの手触り」): 打ち上がり25% → 頂点の漂い20% → 落下55%・基本 585ms。
  const sample = (f: (u: number) => number, n = 400) => Array.from({ length: n + 1 }, (_, i) => ({ u: i / n, h: f(i / n) }));
  const apexU = (pts: { u: number; h: number }[]) => pts.reduce((a, b) => (b.h > a.h ? b : a)).u;
  it('浮きの時間の表: 基本 585ms(旧450の1.3倍)×重さ×押し上げ量(§13-2: 0.75^n は予算に置き換え)・下限 140ms・空中で吹き飛ばすと 200ms で落ちる', () => {
    expect(BRAWLER_LIFT_MS).toBe(585);
    expect(brawlerJugglePush({}, 'mob', 's4', 0)!.brLiftMs).toBe(585);
    expect(brawlerJugglePush({}, 'strong', 's4', 0)!.brLiftMs).toBe(410);
    expect(brawlerJugglePush({}, 'boss', 's4', 0)!.brLiftMs).toBe(410); // ボス級は強個体と同じ 0.7
    expect(brawlerJugglePush({}, 'boss', 's4', 0, true)!.brLiftMs).toBe(585); // 気絶・紫の間に浮かせた時だけ雑魚と同じ
    const e0 = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    const p1 = brawlerJugglePush(e0, 'mob', 's1', 100)!;
    expect(p1.brLiftMs).toBe(Math.round(585 * 0.5));
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
  it('追撃で浮き直した弧も同じ形: 頂点は区間の25〜45%・つなぎ目で高さが跳ばない(§13-2: 回数の減りは予算が受け持つ)', () => {
    let e: BrawlerJuggleFields = apply({}, brawlerJugglePush({}, 'mob', 's4', 0));
    let t = 0;
    const rises: number[] = []; const mss: number[] = [];
    for (let i = 0; i < 4; i++) {
      t += Math.round((e.brLiftMs ?? 0) * 0.3);                          // 頂点の少し後で殴る
      const before = brawlerJuggleHeightRel(e, t);
      const p = brawlerJugglePush(e, 'mob', 's3', t);
      if (!p || p.brLiftDown) break; // 予算が尽きた当たりはダウン(浮き直さない)
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
    expect(rises.length).toBeGreaterThanOrEqual(2); // 予算6=3段目(2)を3回まで(3回目でダウン)
    for (let i = 1; i < rises.length; i++) expect(rises[i]).toBeGreaterThan(0); // 必ず少しは上がり直す
  });
  it('ボスの技の最中(bossState が追いかけ以外)は技の最中=浮かない', () => {
    expect(isBrawlerTechBusy({ bossState: 'chase' }, 0)).toBe(false);
    expect(isBrawlerTechBusy({ bossState: 'issen-windup' }, 0)).toBe(true);
  });
});

// ★つながっているコンボの数(表示・research/BRAWLER.md §23・社長指示2026-11-11「その意味のない数字のどっちか使おう」)
describe('つながっているコンボの数(「N HIT」の表示)', () => {
  it('当たるたびに +1・当たる直前に動けた敵は 1 から数え直す(固まり・当たりの止め・浮きの間はつながっている)', () => {
    expect(brawlerLinkOnHit({}, 5000, 100)).toBe(1);
    expect(brawlerLinkOnHit({ brComboHits: 4, brLockUntil: 6000 }, 5000, 100)).toBe(5);   // 確定の固まりの最中
    expect(brawlerLinkOnHit({ brComboHits: 4, brHoldUntil: 200 }, 5000, 100)).toBe(5);    // 壁時計の固まり(秘奥義・ボス級の止め)
    expect(brawlerLinkOnHit({ brComboHits: 4, hitStunUntil: 200 }, 5000, 100)).toBe(5);   // 当たりの止め
    expect(brawlerLinkOnHit({ brComboHits: 4, brLiftUntil: 200 }, 5000, 100)).toBe(5);    // 浮いている
    expect(brawlerLinkOnHit({ brComboHits: 4, brLockUntil: 4000, hitStunUntil: 50, brLiftUntil: 50, brHoldUntil: 50 }, 5000, 100)).toBe(1); // 全部明けていた
    expect(brawlerLinkOnHit({ brComboHits: 4 }, 5000, 100)).toBe(1);
  });
  it('気絶・紫の間はつながっている(固まりが明けていても)・攻撃を振っている最中の当たりの止めはつながりに数えない', () => {
    expect(brawlerLinkOnHit({ brComboHits: 3, stunUntil: 6000 }, 5000, 100)).toBe(4);
    expect(brawlerLinkOnHit({ brComboHits: 3, bossFullStunUntil: 6000 }, 5000, 100)).toBe(4);
    expect(brawlerLinkOnHit({ brComboHits: 3, stunUntil: 4000 }, 5000, 100)).toBe(1); // 気絶が明けた
    expect(brawlerLinkOnHit({ brComboHits: 3, hitStunUntil: 200, aiPhase: 'attack' }, 5000, 100)).toBe(1); // 振りの最中=止まっていない
    expect(brawlerLinkOnHit({ brComboHits: 3, hitStunUntil: 200, aiPhase: 'windup' }, 5000, 100)).toBe(4); // 溜めは止まる
    expect(brawlerLinkOnHit({ brComboHits: 3, brLockUntil: 6000, aiPhase: 'attack' }, 5000, 100)).toBe(4); // 固まりが書かれているなら動けない
  });
  it('画面に出す数=生きている・いま動けない敵のうち、いちばん多くつながっている数', () => {
    const held = { health: 10, brHoldUntil: 200 };
    expect(brawlerLinkMax([], 5000, 100)).toBe(0);
    expect(brawlerLinkMax([{ health: 10 }, { ...held, brComboHits: 2 }, { ...held, brComboHits: 5 }], 5000, 100)).toBe(5);
    expect(brawlerLinkMax([{ ...held, health: 0, brComboHits: 9 }, { ...held, brComboHits: 9, corpseUntil: 1 }, { ...held, brComboHits: 3 }], 5000, 100)).toBe(3); // 倒れた敵は数えない
    expect(brawlerLinkMax([{ health: 10, brComboHits: 9 }, { ...held, brComboHits: 2 }], 5000, 100)).toBe(2); // 動けるようになった敵の数は出さない
  });
  it('表示の状態: 数が変わったら出し直す・誰もつながっていなければ切れた時刻を打つ・変わらなければ何もしない', () => {
    expect(brawlerLinkDisplay({}, 1, 500)).toEqual({ flowHits: 1, flowBrokenAt: 0 });
    expect(brawlerLinkDisplay({ flowHits: 3, flowBrokenAt: 0 }, 3, 500)).toBeNull();
    expect(brawlerLinkDisplay({ flowHits: 3, flowBrokenAt: 0 }, 4, 500)).toEqual({ flowHits: 4, flowBrokenAt: 0 });
    expect(brawlerLinkDisplay({ flowHits: 7, flowBrokenAt: 0 }, 2, 500)).toEqual({ flowHits: 2, flowBrokenAt: 0 }); // 多い方の敵が切れた
    expect(brawlerLinkDisplay({ flowHits: 4, flowBrokenAt: 0 }, 0, 500)).toEqual({ flowHits: 4, flowBrokenAt: 500 }); // 最後の数のまま沈む
    expect(brawlerLinkDisplay({ flowHits: 4, flowBrokenAt: 500 }, 0, 900)).toBeNull();
    expect(brawlerLinkDisplay({ flowHits: 4, flowBrokenAt: 500 }, 4, 900)).toEqual({ flowHits: 4, flowBrokenAt: 0 }); // 切れた後の同じ数は出し直す
    expect(brawlerLinkDisplay({}, 0, 500)).toBeNull();
  });
});
