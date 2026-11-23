import { describe, it, expect } from 'vitest';
import { Graphics, Texture, type GraphicsPath } from 'pixi.js';
import { projAffineFrom, projSimFrom, projDrawStat, PROJ_AFFINE_ALLOWED } from './projDraw';

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
    expect(PROJ_AFFINE_ALLOWED.similarOnly).toEqual(['roundPoly', 'filletRect', 'roundShape']);
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
