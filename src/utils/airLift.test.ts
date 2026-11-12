// ★格闘以外の浮き(research/BRAWLER.md §14・社長「浮き入れよう。落ちてくるのを爆発のは少しゆっくりに」)の純関数。
import { describe, it, expect, afterAll } from 'vitest';
import {
  blastLiftPatch, blastLiftCloseness, slasherLiftMove, blastLiftMs, slasherLaunchMinMs,
  BLAST_LIFT_HEIGHT_OF_S3, BLAST_LIFT_MS_MULT, BLAST_LIFT_COST,
  KNIFE_HOLD_MOVE, knifeLiftMove, knifeLiftApplies, knifeNoLiftUntil,
} from './airLift';
import {
  brawlerJuggleHeightRel, brawlerJugglePush, setBrawlerTempoAll, brawlerAirSignal,
  BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_PUSH, BRAWLER_JUGGLE_MIN_F, BRAWLER_JUGGLE_MIN_MS, BRAWLER_JUGGLE_WEIGHT,
  brawlerEnemyClass, brawlerLiftClass,
} from './brawlerCombo';
import { BRAWLER_LIFT_MS, BRAWLER_TEMPO_DEFAULT } from './brawler';

setBrawlerTempoAll(1.3);
afterAll(() => setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT));
const NOW = 1_000_000, GT = 50_000;
const zombie = { type: 'zombie' as const };

describe('爆発の浮き(blastLiftPatch)', () => {
  it('爆心: 高さ=3段目の打ち上げ×0.6・長さ=格闘の浮きの基準×1.3・弧は爆発の形・跳ね返らない', () => {
    const p = blastLiftPatch(zombie, 'mob', 1.0, NOW, GT)!;
    expect(p.brLiftPeak).toBeCloseTo(BRAWLER_JUGGLE_PUSH.s3 * BLAST_LIFT_HEIGHT_OF_S3, 6);
    expect(p.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * BLAST_LIFT_MS_MULT));
    expect(p.liftUntil).toBe(NOW + p.brLiftMs!);
    expect(p.brLiftShape).toBe('blast');
    expect(p.brLiftDropMs).toBe(0);
    expect(p.brLiftFrom).toBe(0);
  });
  it('爆心に近いほど高く長く・縁ではほぼ浮かない(下限未満は浮かない)', () => {
    const near = blastLiftPatch(zombie, 'mob', 0.8, NOW, GT)!;
    const mid = blastLiftPatch(zombie, 'mob', 0.5, NOW, GT)!;
    expect(near.brLiftPeak!).toBeGreaterThan(mid.brLiftPeak!);
    expect(near.brLiftMs!).toBeGreaterThan(mid.brLiftMs!);
    expect(blastLiftPatch(zombie, 'mob', 0.05, NOW, GT)).toBeNull();
    expect(blastLiftPatch(zombie, 'mob', 0, NOW, GT)).toBeNull();
    expect(blastLiftCloseness(50, 100)).toBeCloseTo(0.5);
  });
  it('重さ: 強個体は0.7倍・ボス級は浮かない', () => {
    const mob = blastLiftPatch(zombie, 'mob', 1.0, NOW, GT)!;
    const strong = blastLiftPatch({ type: 'driller' }, 'strong', 1.0, NOW, GT)!;
    expect(strong.brLiftPeak! / mob.brLiftPeak!).toBeCloseTo(0.7, 6);
    expect(blastLiftPatch({ type: 'hunter' }, 'boss', 1.0, NOW, GT)).toBeNull();
  });
  it('予算は格闘と共有で2を使う: 地上=区分の予算−2・空中=残りから2・足りなければ浮かない', () => {
    const g = blastLiftPatch(zombie, 'mob', 1.0, NOW, GT)!;
    expect(g.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - BLAST_LIFT_COST);
    const air = { ...zombie, ...g };
    const t = NOW + 100;
    const again = blastLiftPatch(air, 'mob', 1, t, GT)!;
    expect(again.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2 * BLAST_LIFT_COST);
    expect(again.brLiftFrom!).toBeGreaterThan(0); // 今の高さから浮き直す(つなぎ目で高さが跳ばない)
    expect(blastLiftPatch({ ...air, brLiftBudget: 1 }, 'mob', 1, t, GT)).toBeNull();
    // 格闘の当たりと同じ予算を食い合う(爆発で浮いた敵を格闘で拾うと、残りから引かれる)
    const pick = brawlerJugglePush({ ...air, brLiftBudget: g.brLiftBudget }, 'mob', 's1', t)!;
    expect(pick.brLiftBudget).toBe(g.brLiftBudget! - 1);
    expect(pick.brLiftShape).toBeUndefined(); // 格闘の拾いからは格闘の弧
  });
  it('叩き落とし中・技を出している最中は浮かない', () => {
    const g = blastLiftPatch(zombie, 'mob', 1.0, NOW, GT)!;
    expect(blastLiftPatch({ ...zombie, ...g, brLiftDown: true }, 'mob', 1.0, NOW + 50, GT)).toBeNull();
    expect(blastLiftPatch({ type: 'zombie', aiPhase: 'z-bite1' }, 'mob', 1.0, NOW, GT)).toBeNull();
  });
  it('落ち方は格闘よりゆっくり: 上り20%で頂点・同じ頂点なら落ちの途中で格闘より高い', () => {
    const g = blastLiftPatch(zombie, 'mob', 1.0, NOW, GT)!;
    const ms = g.brLiftMs!, peak = g.brLiftPeak!;
    const blast = { ...g };
    expect(brawlerJuggleHeightRel(blast, NOW + ms * 0.2)).toBeCloseTo(peak, 3);
    // 落ちる時間: 爆発=長さの65%(漂いの後)・格闘の3段目=長さの55%。爆心の爆発の方が落ちが長い(=ゆっくり)。
    const s3 = brawlerJugglePush({}, 'mob', 's3', NOW)!;
    expect(ms * 0.65).toBeGreaterThan(s3.brLiftMs! * 0.55 * 1.5);
    // 落ちの途中(落ちの区間の半分)でまだ頂点の半分以上の高さ(終わりへ向けて加速して落ちる)
    expect(brawlerJuggleHeightRel(blast, NOW + ms * (0.35 + 0.65 * 0.5))).toBeGreaterThan(peak * 0.5);
    expect(brawlerJuggleHeightRel(blast, NOW + ms)).toBe(0);
    expect(peak).toBeGreaterThan(BRAWLER_JUGGLE_MIN_F);
  });
});

describe('スラッシャーの追撃の浮き(slasherLiftMove)', () => {
  it('1回目の追撃=3段目(打ち上げ)・2回目以降は空中の敵だけ拾う(最後の大きな押しは叩き落とし)', () => {
    expect(slasherLiftMove(0, false, false)).toBe('s3');
    expect(slasherLiftMove(0, false, true)).toBe('s3');
    expect(slasherLiftMove(1, false, true)).toBe('s2');
    expect(slasherLiftMove(1, false, false)).toBeNull();
    expect(slasherLiftMove(2, true, true)).toBe('s5');
  });
});

describe('空中の合図は頂点に対する割合(brawlerAirSignal・社長承認2026-11-09)', () => {
  it('重い区分・爆発の低い浮きでも頂点で1(満額)・高さそのものの差は残る', () => {
    const boss = brawlerJugglePush({}, 'strong', 's4', NOW)!; // 重い区分=強個体(社長指示2026-11-10「一旦ボスの重みやめよう。雑魚と同じ軽さに。」でボス級は雑魚と同じになった)
    const mob = brawlerJugglePush({}, 'mob', 's4', NOW)!;
    const blast = blastLiftPatch(zombie, 'mob', 0.4, NOW, GT)!;
    for (const a of [boss, mob]) expect(brawlerAirSignal(a, NOW + a.brLiftMs! * 0.25)).toBeCloseTo(1, 3);
    expect(brawlerAirSignal(blast, NOW + blast.brLiftMs! * 0.2)).toBeCloseTo(1, 3);
    expect(brawlerJuggleHeightRel(boss, NOW + boss.brLiftMs! * 0.25)).toBeLessThan(brawlerJuggleHeightRel(mob, NOW + mob.brLiftMs! * 0.25));
  });
  it('上り途中は1未満・着地で0・叩き落としは落ち始めの高さに対する割合(1から減る)', () => {
    const mob = brawlerJugglePush({}, 'mob', 's4', NOW)!;
    const mid = brawlerAirSignal(mob, NOW + mob.brLiftMs! * 0.08);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(0.95);
    expect(brawlerAirSignal(mob, NOW + mob.brLiftMs!)).toBe(0);
    const t = NOW + mob.brLiftMs! * 0.3;
    const down = brawlerJugglePush({ ...mob, brLiftBudget: 0 }, 'mob', 's3', t)!; // 予算切れ=叩き落とし
    expect(down.brLiftDown).toBe(true);
    expect(brawlerAirSignal(down, t + 1)).toBeGreaterThan(0.95);
    expect(brawlerAirSignal(down, t + down.brLiftMs! * 0.7)).toBeLessThan(0.5);
  });
});

describe('品質監査の反映(§14): ハメにしない・重さ・縁・区分', () => {
  it('長さに重さが効く(強個体は雑魚の0.7倍)・縁ほど0へ寄る(下限は格闘と同じ短い跳ね)', () => {
    expect(blastLiftMs('strong', 1) / blastLiftMs('mob', 1)).toBeCloseTo(BRAWLER_JUGGLE_WEIGHT.strong, 2);
    const kEdge = BRAWLER_JUGGLE_MIN_F / (BRAWLER_JUGGLE_PUSH.s3 * BLAST_LIFT_HEIGHT_OF_S3) + 0.01; // 浮く下限のすぐ上
    expect(blastLiftMs('mob', kEdge)).toBe(BRAWLER_JUGGLE_MIN_MS);
    expect(blastLiftMs('mob', 0.6)).toBeLessThan(blastLiftMs('mob', 0.9));
  });
  it('爆発の浮きで着地した敵は、浮いていた時間と同じ長さだけ爆発では浮かない(押し・ダメージは別)', () => {
    const g = blastLiftPatch(zombie, 'mob', 1, NOW, GT)!;
    const land = NOW + g.brLiftMs!;
    expect(g.brBlastNoLiftUntil).toBe(land + g.brLiftMs!);
    const after = { ...zombie, ...g };
    expect(blastLiftPatch(after, 'mob', 1, land + 10, GT)).toBeNull();
    expect(blastLiftPatch(after, 'mob', 1, g.brBlastNoLiftUntil! + 1, GT)).not.toBeNull();
    // 空中で浮き直すと、空中の始まりは最初の爆発のまま(窓=空中の時間の合計)
    const t = NOW + 300;
    const again = blastLiftPatch(after, 'mob', 1, t, GT)!;
    expect(again.brBlastAirSince).toBe(NOW);
    expect(again.brBlastNoLiftUntil).toBe(again.brLiftUntil! + (again.brLiftUntil! - NOW));
    // 格闘で地上から打ち上げ直した後の爆発は、空中の始まり=格闘の打ち上げ(昔の爆発の時刻を引きずらない)
    const later = g.brBlastNoLiftUntil! + 5000;
    const launched = { ...after, ...brawlerJugglePush(after, 'mob', 's3', later)! };
    expect(launched.brBlastAirSince).toBe(later);
    const mid = blastLiftPatch(launched, 'mob', 1, later + 200, GT)!;
    expect(mid.brBlastAirSince).toBe(later);
  });
  it('★不変条件: 錬金砲(CD 700ms)相当で爆心の爆発を当て続けても、地上にいる時間が4割以上ある', () => {
    let e: Record<string, unknown> = { ...zombie };
    let ground = 0;
    const T = 30_000, dt = 10;
    for (let t = 0; t < T; t += dt) {
      const now = NOW + t;
      if (t % 700 === 0) { const p = blastLiftPatch(e as never, 'mob', 1, now, GT); if (p) e = { ...e, ...p }; }
      if (!(typeof e.brLiftUntil === 'number' && now < (e.brLiftUntil as number))) ground += dt;
    }
    expect(ground / T).toBeGreaterThanOrEqual(0.4);
  });
  it('終端の死神は浮かない・赤い個体は強個体(格闘も同じ区分の1本)', () => {
    expect(brawlerLiftClass({ type: 'reaper', reaperChaser: true })).toBeNull();
    expect(blastLiftPatch({ type: 'reaper' }, brawlerLiftClass({ type: 'reaper', reaperChaser: true }), 1, NOW, GT)).toBeNull();
    expect(brawlerEnemyClass({ type: 'zombie', colorTier: 'red' })).toBe('strong');
    expect(brawlerEnemyClass({ type: 'zombie', colorTier: 'blue' })).toBe('mob');
    expect(brawlerLiftClass({ type: 'zombie', colorTier: 'red' })).toBe('strong');
  });
  it('スラッシャーの1回目の打ち上げの下限=追撃の窓(CD+前隙+余裕)', () => {
    expect(slasherLaunchMinMs(300, 200)).toBe(650);
  });
});

// ★ナイフの当たりの浮き(社長指示2026-11-12「あと近接でも敵の攻撃が止まる&浮くようにして」・裁定「近接は止めるだけ」)。
describe('ナイフの浮き(knifeLiftMove / knifeLiftApplies / knifeNoLiftUntil)', () => {
  it('割り当て: 地上=3段目の打ち上げ・空中=2段目の拾い(スラッシャーの追撃と同じ)・固まりは1段目', () => {
    expect(knifeLiftMove(false)).toBe('s3');
    expect(knifeLiftMove(true)).toBe('s2');
    expect(knifeLiftMove(false)).toBe(slasherLiftMove(0, false, false));
    expect(knifeLiftMove(true)).toBe(slasherLiftMove(1, false, true));
    expect(KNIFE_HOLD_MOVE).toBe('s1');
  });
  it('技の最中(溜め・攻撃の振り)は浮かせない・技の後の硬直や移動の相は浮かせる', () => {
    expect(knifeLiftApplies({ ...zombie }, NOW, GT, NOW)).toBe(true);
    expect(knifeLiftApplies({ ...zombie, aiPhase: 'z-red-pause' }, NOW, GT, NOW)).toBe(false); // 溜め
    expect(knifeLiftApplies({ ...zombie, aiPhase: 'z-bite1' }, NOW, GT, NOW)).toBe(false);     // 攻撃の振り
    expect(knifeLiftApplies({ ...zombie, aiPhase: 'zrush', biteAt: GT + 300 }, NOW, GT, NOW)).toBe(false); // 噛みの構え
    expect(knifeLiftApplies({ type: 'hunter', bossState: 'jump-windup' } as never, NOW, GT, NOW)).toBe(false); // ボスの技の最中
    expect(knifeLiftApplies({ ...zombie, aiPhase: 'z-recover' }, NOW, GT, NOW)).toBe(true);
    expect(knifeLiftApplies({ ...zombie, aiPhase: 'z-red-pause', stunUntil: GT + 1000 }, NOW, GT, NOW)).toBe(true); // 会心の気絶中は技ではない
  });
  it('爆発の窓(着地の後、浮いていた時間と同じ長さ)の中では地上から浮かない・空中の拾いは窓に関係なく浮く', () => {
    expect(knifeLiftApplies({ ...zombie, brBlastNoLiftUntil: NOW + 1 }, NOW, GT, NOW)).toBe(false);
    expect(knifeLiftApplies({ ...zombie, brBlastNoLiftUntil: NOW }, NOW, GT, NOW)).toBe(true);
    expect(knifeLiftApplies({ ...zombie, brBlastNoLiftUntil: NOW + 500, brLiftUntil: NOW + 100 }, NOW, GT, NOW)).toBe(true);
  });
  it('コンボの後の固まらない時間の間は地上から浮かない(格闘と同じ)', () => {
    expect(knifeLiftApplies({ type: 'driller', brLockNoHoldUntil: GT + 1 } as never, NOW, GT, NOW)).toBe(false);
  });
  it('この振りで既にカウンターの浮きが掛かった敵は浮かせ直さない(予算を2回使わない)', () => {
    expect(knifeLiftApplies({ ...zombie, lastCounteredAt: NOW - 50, brLiftUntil: NOW + 500 }, NOW, GT, NOW - 100)).toBe(false);
    expect(knifeLiftApplies({ ...zombie, lastCounteredAt: NOW - 150, brLiftUntil: NOW + 500 }, NOW, GT, NOW - 100)).toBe(true); // 前の振りのカウンター
  });
  it('窓の終わり=浮きの終わり+空中が始まってからの長さ(爆発の式)・前の窓より短くしない', () => {
    expect(knifeNoLiftUntil({}, NOW + 570, NOW)).toBe(NOW + 1140);
    expect(knifeNoLiftUntil({ brLiftUntil: NOW + 50, brBlastAirSince: NOW - 300 }, NOW + 400, NOW)).toBe(NOW + 400 + 700);
    expect(knifeNoLiftUntil({ brBlastNoLiftUntil: NOW + 5000 }, NOW + 570, NOW)).toBe(NOW + 5000);
  });
});
