import { describe, it, expect } from 'vitest';
import { latticeBands, latticeStageCount, latticeAxisForStage, walkTimeMs, latticeHitSource, latticeCenter } from './skadiLattice';
import { distToBandRect } from './geometry';
import { HIDDEN_SKADI_TUNING } from './hiddenBossScript';

const spec = { bands: 10, spacing: 96, halfWidth: 16 };

describe('氷の格子: 並び', () => {
  it('10本・間隔96・中心の1本が段の中心を通る(縦)', () => {
    const b = latticeBands(500, 300, 'v', 1, spec);
    expect(b).toHaveLength(10);
    expect(b.some(x => x.fx === 500)).toBe(true);
    const xs = b.map(x => x.fx).sort((p, q) => p - q);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBe(96);
    // +側に5本・−側に4本
    expect(xs.filter(x => x > 500)).toHaveLength(5);
    expect(xs.filter(x => x < 500)).toHaveLength(4);
    expect(latticeBands(500, 300, 'v', -1, spec).filter(x => x.fx < 500)).toHaveLength(5);
  });
  it('横の段は縦に並び、刃の長さ=本数×間隔(正方形)', () => {
    const b = latticeBands(0, 0, 'h', 1, spec);
    expect(b.every(x => x.fy === x.ty)).toBe(true);
    expect(b[0].tx - b[0].fx).toBe(960);
    expect(b.some(x => x.fy === 0)).toBe(true);
  });
  it('止まっていると当たる/1歩(半幅+自機の半身)ずれれば隙間', () => {
    const b = latticeBands(0, 0, 'v', 1, spec);
    // 判定=描いている四角(帯の端点を半幅ぶん伸ばした矩形)。自機は半身14の円で見る(useGameLoop と同じ)。
    const hit = (x: number) => b.some(r => distToBandRect({ x, y: 0 }, { x: r.fx, y: r.fy }, { x: r.tx, y: r.ty }, spec.halfWidth) <= 14);
    expect(hit(0)).toBe(true);
    expect(hit(spec.halfWidth + 14 + 1)).toBe(false);
    expect(hit(-(spec.halfWidth + 14 + 1))).toBe(false);
  });
});

describe('氷の格子: 段', () => {
  it('覚醒前2段・覚醒後6段・縦から交互', () => {
    expect(latticeStageCount(1, 1, 3)).toBe(2);
    expect(latticeStageCount(2, 1, 3)).toBe(6);
    expect(latticeStageCount(3, 1, 3)).toBe(6);
    expect([0, 1, 2, 3].map(latticeAxisForStage)).toEqual(['v', 'h', 'v', 'h']);
  });
});

describe('氷の格子: 既定値で「1歩で抜けられる」', () => {
  const L = HIDDEN_SKADI_TUNING.lattice;
  it('隙間に自機(28)が入る', () => {
    expect(L.spacing - 2 * L.halfWidth).toBeGreaterThan(28);
  });
  it('溜め ≥ 反応(250ms)+ 静止から抜ける距離(半幅+自機の半身14)を慣性つきで歩く時間(設計監査 A-1)', () => {
    const walk = walkTimeMs(L.halfWidth + 14, 104.4, 0.06);
    expect(walk).toBeGreaterThan(300); // 慣性込みで約0.35秒(物差しの自己点検)
    expect(250 + walk).toBeLessThanOrEqual(L.windupMs);
  });
});

describe('氷の格子: 弾く向き(設計監査 A-4)', () => {
  it('刃に直交して弾く/真上なら開けている側(−side)へ', () => {
    const v = { fx: 100, fy: -480, tx: 100, ty: 480 };
    expect(latticeHitSource(v, 110, 5, 1)).toEqual({ x: 100, y: 5 });
    const on = latticeHitSource(v, 100, 5, 1);
    expect(Math.sign(100 - on.x)).toBe(-1); // 自機−源 が −side 向き=開けている側へ押される
    const h = { fx: -480, fy: 50, tx: 480, ty: 50 };
    expect(latticeHitSource(h, 7, 60, -1)).toEqual({ x: 7, y: 50 });
  });
});

describe('氷の格子: 段の中心=当たる瞬間の居場所の予測(社長裁定2026-10-02)', () => {
  const L = HIDDEN_SKADI_TUNING.lattice;
  const onBand = (x: number, y: number, c: { x: number; y: number }, axis: 'v' | 'h') =>
    latticeBands(c.x, c.y, axis, 1, L).some(r => distToBandRect({ x, y }, { x: r.fx, y: r.fy }, { x: r.tx, y: r.ty }, L.halfWidth) <= 14);
  it('止まっていれば今の位置', () => {
    expect(latticeCenter(10, 20, 0, 0, L.windupMs)).toEqual({ x: 10, y: 20 });
  });
  it('斜めに歩き続けると、縦の段も横の段も当たる(旧: 全段抜けられた)', () => {
    const v = 104.4 / Math.SQRT2;
    for (const axis of ['v', 'h'] as const) {
      const c = latticeCenter(0, 0, v, v, L.windupMs);
      const t = L.windupMs / 1000;
      expect(onBand(v * t, v * t, c, axis)).toBe(true);
    }
  });
  it('歩いていても、溜めの間に止まれば(慣性込み)隙間に居られる', () => {
    // 右へ歩いていた相手が段の頭で止まる=慣性で約6px(104.4×0.06)だけ進んで止まる → 予測の中心(約68px先)の刃から離れている。
    const c = latticeCenter(0, 0, 104.4, 0, L.windupMs);
    expect(onBand(104.4 * 0.06, 0, c, 'v')).toBe(false);
  });
});
