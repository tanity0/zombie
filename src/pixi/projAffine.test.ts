import { describe, it, expect } from 'vitest';
import { Graphics, Texture, GraphicsPath as GraphicsPathCtor, type GraphicsPath } from 'pixi.js';
import { projAffineFrom, projSimFrom, projDrawStat, PROJ_AFFINE_ALLOWED, PROJ_AFFINE_SKIPPED } from './projDraw';

// 投影の段階3: 命令をまとめて相似/アフィンで写す部品(projAffineFrom)の番人(品質監査1巡目 B-2)。
//   ① 命令 n0 の fill/stroke が n0 より前の命令と path を共有していても、前の命令の形は動かさない
//   ② 自分の行列を持たない形(roundPoly・filletRect・roundShape)も相似なら写る/許可リストの外は写さない(数えない)
//   ④ 絵の命令(texture)にも濃さの掛け率が掛かる

type Ins = { action: string; data: { path?: GraphicsPath; alpha?: number } };
const ins = (g: Graphics) => g.context.instructions as unknown as Ins[];
const pathData = (p: GraphicsPath | undefined) => (p?.instructions ?? []).map(i => [i.action, ...(i.data as unknown[]).filter(v => typeof v === 'number')]);

describe('projAffineFrom の守り(監査 B-2)', () => {
  it('① n0 より前の命令と共有している path は複製を写し、前の命令の形は動かさない', () => {
    const g = new Graphics();
    g.moveTo(0, 0).lineTo(10, 0).stroke({ width: 1, color: 0xffffff });
    g.fill({ color: 0xff0000 }); // _tick===0 → 直前の stroke の path を使い回す(Pixi の GraphicsContext.fill)
    const I = ins(g);
    expect(I.length).toBe(2);
    expect(I[1].data.path).toBe(I[0].data.path); // 共有している(前提の確認)
    const before = JSON.stringify(pathData(I[0].data.path));
    projSimFrom(g, 1, 0, 0, 100, 50, 2);
    expect(JSON.stringify(pathData(I[0].data.path))).toBe(before); // 前の命令は動かない
    expect(I[1].data.path).not.toBe(I[0].data.path);
    const moved = pathData(I[1].data.path);
    expect(moved[0]).toEqual(['moveTo', 100, 50]);
    expect(moved[1]).toEqual(['lineTo', 120, 50]);
  });

  it('① 共有している形(円=自分の行列を持つ)も、前の命令の行列は動かさない', () => {
    const g = new Graphics();
    g.circle(0, 0, 5).stroke({ width: 1, color: 0xffffff });
    g.fill({ color: 0xff0000 });
    const I = ins(g);
    const mOf = (i: number) => (I[i].data.path!.instructions.find(q => q.action === 'circle')!.data as unknown[])[3] as { tx: number; a: number } | undefined;
    const m0 = JSON.stringify(mOf(0) ?? null);
    projSimFrom(g, 1, 0, 0, 100, 50, 2);
    expect(JSON.stringify(mOf(0) ?? null)).toBe(m0);
    expect(mOf(1)?.tx).toBeCloseTo(100, 12);
    expect(mOf(1)?.a).toBeCloseTo(2, 12);
  });

  it('② 自分の行列を持たない形(roundPoly・filletRect・roundShape)も相似なら写る', () => {
    const g = new Graphics();
    g.roundPoly(10, 0, 5, 6, 1).fill({ color: 0xffffff });
    g.filletRect(0, 0, 4, 2, 1).fill({ color: 0xffffff });
    g.roundShape([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], 1).fill({ color: 0xffffff });
    projAffineFrom(g, 0, 2, 0, 0, 2, 100, 100);
    const I = ins(g);
    const of = (i: number, act: string) => I[i].data.path!.instructions.find(q => q.action === act)!.data as unknown[];
    const rp = of(0, 'roundPoly') as number[];
    expect([rp[0], rp[1], rp[2], rp[4]]).toEqual([120, 100, 10, 2]);
    const fr = of(1, 'filletRect') as number[];
    expect([fr[0], fr[1], fr[2], fr[3], fr[4]]).toEqual([100, 100, 8, 4, 2]);
    const rs = of(2, 'roundShape');
    expect((rs[0] as { x: number; y: number }[])[1]).toMatchObject({ x: 108, y: 100 });
    expect(rs[1]).toBe(2);
    expect(PROJ_AFFINE_ALLOWED.similarOnly).toEqual(['roundPoly', 'filletRect', 'roundShape', 'arcTo']);
    expect(PROJ_AFFINE_ALLOWED.cmds).toEqual(['fill', 'stroke', 'texture']);
  });

  it('② 相似でないアフィンでは自分の行列を持たない形は写さず、部品の命令にも数えない(計器の漏れに残る)', () => {
    const g = new Graphics();
    g.roundPoly(10, 0, 5, 6, 1).fill({ color: 0xffffff });
    const rp = () => JSON.stringify(ins(g)[0].data.path!.instructions.find(q => q.action === 'roundPoly')!.data);
    const before = rp();
    projAffineFrom(g, 0, 2, 0, 0.5, 1, 0, 0);
    expect(rp()).toBe(before);
    expect(projDrawStat(g)?.cmds ?? 0).toBe(0);
  });

  it('2巡目 B-1: 終わりの境目(n1−1 と n1 が同じ path)でも、範囲の後の命令の形は動かさない', () => {
    const g = new Graphics();
    g.moveTo(0, 0).lineTo(10, 0).fill({ color: 0xff0000 });
    g.stroke({ width: 1, color: 0xffffff }); // 直前の fill の path を使い回す
    const I = ins(g);
    expect(I[1].data.path).toBe(I[0].data.path);
    const after = JSON.stringify(pathData(I[1].data.path));
    projSimFrom(g, 0, 0, 0, 100, 50, 2, 2, 1, 1); // 範囲=[0, 1)
    expect(JSON.stringify(pathData(I[1].data.path))).toBe(after);
    expect(pathData(I[0].data.path)[1]).toEqual(['lineTo', 120, 50]);
  });

  it('2巡目 B-1: fill→stroke→fill(前の命令と共有)でも前の形は動かさず、範囲の中は同じ複製を1回だけ写す', () => {
    const g = new Graphics();
    g.moveTo(0, 0).lineTo(10, 0).stroke({ width: 1, color: 0xffffff });
    g.fill({ color: 0xff0000 });
    g.stroke({ width: 2, color: 0x00ff00 });
    const I = ins(g);
    expect(I[1].data.path).toBe(I[0].data.path);
    expect(I[2].data.path).toBe(I[0].data.path);
    const before = JSON.stringify(pathData(I[0].data.path));
    projSimFrom(g, 1, 0, 0, 100, 50, 2);
    expect(JSON.stringify(pathData(I[0].data.path))).toBe(before);
    expect(I[1].data.path).toBe(I[2].data.path); // 範囲の中は同じ複製
    expect(pathData(I[2].data.path)[1]).toEqual(['lineTo', 120, 50]); // 二重に写っていない
  });

  it('2巡目 B-1: addPath の入れ子は複製してから写す(足した元の path を動かさない)', () => {
    const g = new Graphics();
    const src = new GraphicsPathCtor();
    src.moveTo(0, 0).lineTo(10, 0);
    g.path(new GraphicsPathCtor().addPath(src)).stroke({ width: 1, color: 0xffffff });
    const before = JSON.stringify(pathData(src));
    projSimFrom(g, 0, 0, 0, 100, 50, 2);
    expect(JSON.stringify(pathData(src))).toBe(before);
  });

  it('2巡目 B-2: 写せない形を1つでも含む path は全部写さない(半分だけ写さない)・数える', () => {
    const g = new Graphics();
    g.moveTo(0, 0).lineTo(10, 0).roundPoly(10, 0, 5, 6, 1).fill({ color: 0xffffff });
    const before = JSON.stringify(pathData(ins(g)[0].data.path));
    const n0 = PROJ_AFFINE_SKIPPED.n;
    projAffineFrom(g, 0, 2, 0, 0, 1, 0, 0); // 相似でない
    expect(JSON.stringify(pathData(ins(g)[0].data.path))).toBe(before); // lineTo も動かない
    expect(PROJ_AFFINE_SKIPPED.n).toBe(n0 + 1);
  });

  it('2巡目 B-2: 相似でない写しの arc は楕円に潰れた折れ線になる', () => {
    const g = new Graphics();
    g.arc(0, 0, 10, 0, Math.PI).stroke({ width: 1, color: 0xffffff });
    projAffineFrom(g, 0, 2, 0, 0, 0.5, 100, 50);
    const pi = ins(g)[0].data.path!.instructions;
    expect(pi.some(q => q.action === 'arc')).toBe(false);
    const pts = pi.map(q => q.data as number[]);
    expect(pi[0].action).toBe('moveTo');
    expect(pts[0][0]).toBeCloseTo(120, 9); expect(pts[0][1]).toBeCloseTo(50, 9); // 始まり (10, 0) → (120, 50)
    const last = pts[pts.length - 1];
    expect(last[0]).toBeCloseTo(80, 9); expect(last[1]).toBeCloseTo(50, 9); // 終わり (−10, 0) → (80, 50)
    for (const q of pts) expect(((q[0] - 100) / 20) ** 2 + ((q[1] - 50) / 5) ** 2).toBeCloseTo(1, 9); // 楕円(横 20・縦 5)の上
  });

  it('④ 絵の命令にも濃さの掛け率が掛かる・行列は写る', () => {
    const g = new Graphics();
    g.texture(Texture.WHITE, 0xffffff, 0, 0, 4, 4);
    const d = ins(g)[0].data as { alpha: number; transform: { tx: number; a: number } };
    const a0 = d.alpha;
    projAffineFrom(g, 0, 2, 0, 0, 2, 7, 0, 1, 0.5);
    expect(d.alpha).toBeCloseTo(a0 * 0.5, 12);
    expect(d.transform.a).toBeCloseTo(2, 12);
    expect(d.transform.tx).toBeCloseTo(7, 12);
  });
});
