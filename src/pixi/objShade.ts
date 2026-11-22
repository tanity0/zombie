// 試作(?objshade=1・社長が前後を見て採否を決める): 地面に落ちている光と影を、物(木・置物・敵・主人公)にも掛ける。
// 方式=「物の足元の地面の明るさ」を1色として、物の絵(通常合成の Sprite)の tint に掛ける。
//   ・乗算の影(雲の影・木漏れ日の縁の帯・梢の影): 足元の数点で地面と同じ倍率を引き、tint に掛ける。
//   ・加算の光(ステージ1の夜の月明りの溜まり): tint は 1 を超えられないので、同じ絵を加算で1枚重ねる(twin)。
// 掛けた色はフレームの最後に置き、次のフレームの最初に元へ戻す(applyForestPreview と同じ型)=他の描画の tint を汚さない。
// 判定・位置・大きさには触らない(色だけ)。Graphics(予告・HPバー)と加算の絵(光・閃光)には掛けない=赤い予告の色は不変。
import { Container, Graphics, Matrix, Point, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import {
  OBJ_SHADE_FOOT_SPREAD, OBJ_SHADE_MAX_TARGETS, OBJ_SHADE_SCREEN_MARGIN,
  accumulateMultiply, mulTintRgb, sampleRgba, shadeWithStrength, tilingTexel, type Rgb,
} from '../utils/objShade';

interface PixelMap { data: Uint8ClampedArray; w: number; h: number; sx: number; sy: number }
const pixelCache = new WeakMap<object, PixelMap | null>();
/** 焼いたテクスチャ(canvas 由来)の画素を CPU 側で一度だけ読む。読めない物は null(=掛けない)。 */
const pixelsOf = (tex: Texture): PixelMap | null => {
  const src = tex.source as unknown as { resource?: unknown };
  const res = src?.resource as HTMLCanvasElement | undefined;
  if (!res || typeof (res as HTMLCanvasElement).getContext !== 'function') return null;
  if (pixelCache.has(res)) return pixelCache.get(res) ?? null;
  let pm: PixelMap | null = null;
  try {
    const ctx = res.getContext('2d');
    if (ctx) {
      const img = ctx.getImageData(0, 0, res.width, res.height);
      pm = { data: img.data, w: res.width, h: res.height, sx: res.width / Math.max(1, tex.width), sy: res.height / Math.max(1, tex.height) };
    }
  } catch { pm = null; }
  pixelCache.set(res, pm);
  return pm;
};

/** 自分と親が全部見えているか(stage まで)。 */
const shown = (c: Container): boolean => {
  for (let p: Container | null = c; p; p = p.parent) if (!p.visible || p.alpha <= 0) return false;
  return true;
};

interface MulSrc { kind: 'tile' | 'sprite'; obj: TilingSprite | Sprite; inv: Matrix; alpha: number; pm: PixelMap; tint: number; ownerX?: number; ownerY?: number }
interface AddSrc { obj: Sprite; inv: Matrix; alpha: number; pm: PixelMap; tint: number }
interface Tinted { sp: Sprite; orig: number; applied: number }

export interface ObjShadeInputs {
  actorLayer: Container;
  /** 乗算の層(地面に掛けているもの)。TilingSprite=繰り返しの絵、Sprite=1枚絵。 */
  mulTiles: readonly TilingSprite[];
  mulSprites: readonly { sp: Sprite; fx?: number; fy?: number }[];
  /** 加算の光(地面に足しているもの)。 */
  addSprites: readonly Sprite[];
  screenW: number;
  screenH: number;
  /** 効き具合(1=地面と同じ)。 */
  k: number;
  /** 加算の光を物に移す強さ。 */
  lightGain: number;
}

export class ObjShade {
  private tinted: Tinted[] = [];
  private twins = new Map<Sprite, Sprite>();
  private m = new Matrix();
  private pt = new Point();
  private texel: [number, number, number, number] = [0, 0, 0, 0];
  /** 計器(__pixiScene.objShadeStats): 直近フレームで色を掛けた絵の数 / 光を重ねた絵の数 / 影の層の数。 */
  stats = { shaded: 0, lit: 0, mul: 0, add: 0 };

  /** 前フレームに掛けた色を戻す(sync の最初)。他の処理が色を書き換えていたら触らない。 */
  restore(): void {
    for (const t of this.tinted) {
      if (t.sp.destroyed) continue;
      if (Number(t.sp.tint) === t.applied) t.sp.tint = t.orig;
    }
    this.tinted.length = 0;
  }

  private collectMul(inp: ObjShadeInputs): MulSrc[] {
    const out: MulSrc[] = [];
    for (const t of inp.mulTiles) {
      if (t.destroyed || !shown(t)) continue;
      const pm = pixelsOf(t.texture);
      if (!pm) continue;
      const a = t.getGlobalAlpha();
      if (a <= 0.003) continue;
      out.push({ kind: 'tile', obj: t, inv: t.getGlobalTransform(new Matrix()).invert(), alpha: a, pm, tint: Number(t.tint) });
    }
    for (const s of inp.mulSprites) {
      const sp = s.sp;
      if (sp.destroyed || !shown(sp)) continue;
      const pm = pixelsOf(sp.texture);
      if (!pm) continue;
      const a = sp.getGlobalAlpha();
      if (a <= 0.003) continue;
      out.push({ kind: 'sprite', obj: sp, inv: sp.getGlobalTransform(new Matrix()).invert(), alpha: a, pm, tint: Number(sp.tint), ownerX: s.fx, ownerY: s.fy });
    }
    return out;
  }

  private collectAdd(inp: ObjShadeInputs): AddSrc[] {
    const out: AddSrc[] = [];
    for (const sp of inp.addSprites) {
      if (sp.destroyed || !shown(sp)) continue;
      const pm = pixelsOf(sp.texture);
      if (!pm) continue;
      const a = sp.getGlobalAlpha();
      if (a <= 0.003) continue;
      out.push({ obj: sp, inv: sp.getGlobalTransform(new Matrix()).invert(), alpha: a, pm, tint: Number(sp.tint) });
    }
    return out;
  }

  /** 1枚絵のローカル座標 → テクスチャの画素座標(アンカー込み)。 */
  private spriteTexel(sp: Sprite, lx: number, ly: number, pm: PixelMap): { x: number; y: number } {
    const tw = sp.texture.width, th = sp.texture.height;
    return { x: (lx + sp.anchor.x * tw) * pm.sx, y: (ly + sp.anchor.y * th) * pm.sy };
  }

  /** 画面の1点(global)の、乗算の層の倍率。worldX/Y=その物の world 足元(梢の影の持ち主を外す)。 */
  private shadeAt(gx: number, gy: number, mul: readonly MulSrc[], worldX: number, worldY: number, acc: Rgb): Rgb {
    for (const s of mul) {
      if (s.ownerX !== undefined && s.ownerY !== undefined && Math.abs(s.ownerX - worldX) < 2 && Math.abs(s.ownerY - worldY) < 2) continue;
      s.inv.apply({ x: gx, y: gy }, this.pt);
      if (s.kind === 'tile') {
        const t = s.obj as TilingSprite;
        if (this.pt.x < 0 || this.pt.y < 0 || this.pt.x > t.width || this.pt.y > t.height) continue;
        const tx = tilingTexel(this.pt.x, this.pt.y, t.tilePosition.x, t.tilePosition.y, t.tileScale.x, t.tileScale.y);
        sampleRgba(s.pm.data, s.pm.w, s.pm.h, tx.x * s.pm.sx, tx.y * s.pm.sy, true, this.texel);
      } else {
        const tx = this.spriteTexel(s.obj as Sprite, this.pt.x, this.pt.y, s.pm);
        sampleRgba(s.pm.data, s.pm.w, s.pm.h, tx.x, tx.y, false, this.texel);
      }
      accumulateMultiply(acc, this.texel, s.alpha, s.tint);
    }
    return acc;
  }

  /** 画面の1点の加算の光の強さ(0..)と色。 */
  private lightAt(gx: number, gy: number, add: readonly AddSrc[]): { i: number; tint: number } {
    let i = 0, tint = 0xffffff;
    for (const s of add) {
      s.inv.apply({ x: gx, y: gy }, this.pt);
      const tx = this.spriteTexel(s.obj, this.pt.x, this.pt.y, s.pm);
      sampleRgba(s.pm.data, s.pm.w, s.pm.h, tx.x, tx.y, false, this.texel);
      const v = this.texel[3] * s.alpha;
      if (v > 0) { i += v; tint = s.tint; }
    }
    return { i, tint };
  }

  /** 撮影・見比べ用(__pixiScene.objShadeEnabled): false の間は何も掛けない(同じ画面で前後を撮るため)。 */
  enabled = true;

  private lastInp: ObjShadeInputs | null = null;
  /** 計器(撮影・照合用): 画面の1点の、乗算の層の倍率(直近フレームの入力で引く)。 */
  probe(gx: number, gy: number): Rgb | null {
    if (!this.lastInp) return null;
    return this.shadeAt(gx, gy, this.collectMul(this.lastInp), NaN, NaN, { r: 1, g: 1, b: 1 });
  }

  /** 色を掛ける(sync の最後)。 */
  apply(inp: ObjShadeInputs): void {
    this.lastInp = inp;
    this.stats.shaded = 0; this.stats.lit = 0;
    const mul = this.enabled ? this.collectMul(inp) : [];
    const add = this.enabled ? this.collectAdd(inp) : [];
    this.stats.mul = mul.length; this.stats.add = add.length;
    const used = new Set<Sprite>();
    if (mul.length || add.length) {
      const W = inp.screenW, H = inp.screenH, M = OBJ_SHADE_SCREEN_MARGIN;
      const targets: Sprite[] = [];
      let n = 0;
      for (const top of inp.actorLayer.children) {
        if (n >= OBJ_SHADE_MAX_TARGETS) break;
        if (!top.visible || top.alpha <= 0.01 || top instanceof Graphics || top instanceof Text) continue;
        const g = top.getGlobalTransform(this.m);
        const fx = g.tx, fy = g.ty;
        if (fx < -M || fx > W + M || fy < -M || fy > H + M * 3) continue; // 足元が画面の下の外でも、背の高い物は見えている
        targets.length = 0;
        if (top instanceof Sprite) { if (this.paintable(top)) targets.push(top); }
        else {
          for (const c of top.children) {
            if (c instanceof Sprite) { if (this.paintable(c)) targets.push(c); }
            else if (c.visible && !(c instanceof Graphics) && !(c instanceof Text)) {
              for (const d of c.children) if (d instanceof Sprite && this.paintable(d)) targets.push(d);
            }
          }
        }
        if (!targets.length) continue;
        n++;
        // 足元の幅(画面 px): 一番広い絵の幅。
        let wpx = 0;
        for (const sp of targets) wpx = Math.max(wpx, Math.abs(sp.getGlobalTransform(this.m).a) * sp.texture.width);
        const gfx = top.getGlobalTransform(this.m);
        const fxx = gfx.tx, fyy = gfx.ty;
        const off = wpx * OBJ_SHADE_FOOT_SPREAD;
        const r: Rgb = { r: 0, g: 0, b: 0 };
        let li = 0, lt = 0xffffff;
        for (const dx of [-off, 0, off]) {
          const one = this.shadeAt(fxx + dx, fyy, mul, top.x, top.y, { r: 1, g: 1, b: 1 });
          r.r += one.r / 3; r.g += one.g / 3; r.b += one.b / 3;
          if (add.length) { const l = this.lightAt(fxx + dx, fyy, add); li += l.i / 3; if (l.i > 0) lt = l.tint; }
        }
        const sh = shadeWithStrength(r, inp.k);
        const dark = sh.r < 0.997 || sh.g < 0.997 || sh.b < 0.997;
        for (const sp of targets) {
          if (dark) {
            const orig = Number(sp.tint);
            const applied = mulTintRgb(orig, sh);
            if (applied !== orig) {
              sp.tint = applied;
              this.tinted.push({ sp, orig, applied: Number(sp.tint) });
              this.stats.shaded++;
            }
          }
          if (li * inp.lightGain > 0.01) {
            this.twin(sp, Math.min(1, li * inp.lightGain), mulTintRgb(lt, sh));
            used.add(sp);
            this.stats.lit++;
          }
        }
      }
    }
    for (const [target, tw] of this.twins) {
      if (used.has(target)) continue;
      if (target.destroyed || !target.parent) { tw.destroy(); this.twins.delete(target); continue; }
      if (tw.visible) tw.visible = false;
    }
  }

  private paintable(sp: Sprite): boolean {
    if (!sp.visible || sp.alpha <= 0.01 || sp instanceof TilingSprite) return false;
    if (this.isTwin(sp)) return false;
    const bm = sp.blendMode;
    if (bm !== 'normal' && bm !== 'inherit' && bm !== undefined) return false;
    const tex = sp.texture;
    return !!tex && tex.width > 1 && tex.height > 1;
  }

  private twinSet = new WeakSet<Sprite>();
  private isTwin(sp: Sprite): boolean { return this.twinSet.has(sp); }

  /** 加算の光: 同じ絵をもう1枚、加算で真上に重ねる(位置・形は本体の写し)。 */
  private twin(target: Sprite, alpha: number, tint: number): void {
    const parent = target.parent;
    if (!parent) return;
    let tw = this.twins.get(target);
    if (!tw || tw.destroyed) {
      tw = new Sprite(target.texture);
      tw.blendMode = 'add';
      tw.eventMode = 'none';
      tw.label = 'objShadeLight';
      this.twinSet.add(tw);
      this.twins.set(target, tw);
    }
    if (tw.parent !== parent) parent.addChild(tw);
    if (parent.sortableChildren) {
      tw.zIndex = target.zIndex + 0.001;
    } else {
      if (parent.getChildIndex(tw) !== parent.getChildIndex(target) + 1) {
        parent.removeChild(tw);
        parent.addChildAt(tw, parent.getChildIndex(target) + 1);
      }
    }
    if (tw.texture !== target.texture) tw.texture = target.texture;
    tw.anchor.copyFrom(target.anchor);
    tw.position.copyFrom(target.position);
    tw.scale.copyFrom(target.scale);
    tw.skew.copyFrom(target.skew);
    tw.pivot.copyFrom(target.pivot);
    tw.rotation = target.rotation;
    tw.roundPixels = target.roundPixels;
    tw.tint = tint;
    tw.alpha = alpha * target.alpha;
    tw.visible = true;
  }

  destroy(): void {
    this.restore();
    for (const tw of this.twins.values()) if (!tw.destroyed) tw.destroy();
    this.twins.clear();
  }
}

/** 層の並べ替え(?objshade=2・比較用): 光と影の層を物の上(filteredWorld の直後)へ移す。 */
export const moveGroundLightAboveActors = (worldGroup: Container, filteredWorld: Container, layers: readonly Container[]): void => {
  for (const l of layers) if (l.parent === worldGroup) worldGroup.removeChild(l);
  let at = worldGroup.getChildIndex(filteredWorld) + 1;
  for (const l of layers) worldGroup.addChildAt(l, at++);
};
