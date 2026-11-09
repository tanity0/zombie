// ★格闘以外の浮き(research/BRAWLER.md §14・社長「浮き入れよう。落ちてくるのを爆発のは少しゆっくりに」)の純関数。
import { describe, it, expect, afterAll } from 'vitest';
import {
  blastLiftPatch, blastLiftCloseness, slasherLiftMove,
  BLAST_LIFT_HEIGHT_OF_S3, BLAST_LIFT_MS_MULT, BLAST_LIFT_COST,
} from './airLift';
import {
  brawlerJuggleHeightRel, brawlerJugglePush, setBrawlerTempoAll,
  BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_PUSH, BRAWLER_JUGGLE_MIN_F,
} from './brawlerCombo';
import { BRAWLER_LIFT_MS, BRAWLER_TEMPO_DEFAULT } from './brawler';

setBrawlerTempoAll(1.3);
afterAll(() => setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT));
const NOW = 1_000_000, GT = 50_000;
const zombie = { type: 'zombie' as const };

describe('爆発の浮き(blastLiftPatch)', () => {
  it('爆心: 高さ=3段目の打ち上げ×0.6・長さ=格闘の浮きの基準×1.3・弧は爆発の形・跳ね返らない', () => {
    const p = blastLiftPatch(zombie, 'mob', 0, 100, NOW, GT)!;
    expect(p.brLiftPeak).toBeCloseTo(BRAWLER_JUGGLE_PUSH.s3 * BLAST_LIFT_HEIGHT_OF_S3, 6);
    expect(p.brLiftMs).toBe(Math.round(BRAWLER_LIFT_MS * BLAST_LIFT_MS_MULT));
    expect(p.liftUntil).toBe(NOW + p.brLiftMs!);
    expect(p.brLiftShape).toBe('blast');
    expect(p.brLiftDropMs).toBe(0);
    expect(p.brLiftFrom).toBe(0);
  });
  it('爆心に近いほど高く長く・縁ではほぼ浮かない(下限未満は浮かない)', () => {
    const near = blastLiftPatch(zombie, 'mob', 20, 100, NOW, GT)!;
    const mid = blastLiftPatch(zombie, 'mob', 50, 100, NOW, GT)!;
    expect(near.brLiftPeak!).toBeGreaterThan(mid.brLiftPeak!);
    expect(near.brLiftMs!).toBeGreaterThan(mid.brLiftMs!);
    expect(blastLiftPatch(zombie, 'mob', 95, 100, NOW, GT)).toBeNull();
    expect(blastLiftPatch(zombie, 'mob', 120, 100, NOW, GT)).toBeNull();
    expect(blastLiftCloseness(50, 100)).toBeCloseTo(0.5);
  });
  it('重さ: 強個体は0.7倍・ボス級は浮かない', () => {
    const mob = blastLiftPatch(zombie, 'mob', 0, 100, NOW, GT)!;
    const strong = blastLiftPatch({ type: 'driller' }, 'strong', 0, 100, NOW, GT)!;
    expect(strong.brLiftPeak! / mob.brLiftPeak!).toBeCloseTo(0.7, 6);
    expect(blastLiftPatch({ type: 'hunter' }, 'boss', 0, 100, NOW, GT)).toBeNull();
  });
  it('予算は格闘と共有で2を使う: 地上=区分の予算−2・空中=残りから2・足りなければ浮かない', () => {
    const g = blastLiftPatch(zombie, 'mob', 0, 100, NOW, GT)!;
    expect(g.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - BLAST_LIFT_COST);
    const air = { ...zombie, ...g };
    const t = NOW + 100;
    const again = blastLiftPatch(air, 'mob', 0, 100, t, GT)!;
    expect(again.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2 * BLAST_LIFT_COST);
    expect(again.brLiftFrom!).toBeGreaterThan(0); // 今の高さから浮き直す(つなぎ目で高さが跳ばない)
    expect(blastLiftPatch({ ...air, brLiftBudget: 1 }, 'mob', 0, 100, t, GT)).toBeNull();
    // 格闘の当たりと同じ予算を食い合う(爆発で浮いた敵を格闘で拾うと、残りから引かれる)
    const pick = brawlerJugglePush({ ...air, brLiftBudget: g.brLiftBudget }, 'mob', 's1', t)!;
    expect(pick.brLiftBudget).toBe(g.brLiftBudget! - 1);
    expect(pick.brLiftShape).toBeUndefined(); // 格闘の拾いからは格闘の弧
  });
  it('叩き落とし中・技を出している最中は浮かない', () => {
    const g = blastLiftPatch(zombie, 'mob', 0, 100, NOW, GT)!;
    expect(blastLiftPatch({ ...zombie, ...g, brLiftDown: true }, 'mob', 0, 100, NOW + 50, GT)).toBeNull();
    expect(blastLiftPatch({ type: 'zombie', aiPhase: 'z-bite1' }, 'mob', 0, 100, NOW, GT)).toBeNull();
  });
  it('落ち方は格闘よりゆっくり: 上り20%で頂点・同じ頂点なら落ちの途中で格闘より高い', () => {
    const g = blastLiftPatch(zombie, 'mob', 0, 100, NOW, GT)!;
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
