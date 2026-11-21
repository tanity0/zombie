// ステージごとの光・色・コントラストの上乗せ(ステージ1の森の夜・ステージ5の戦場…)で共有する描画の部品。
// どれも「描くだけ」。ゲームの状態には書かない。値と効く条件は各ステージの utils 側(S1N_* / S5B_*)。
//   - FarSkyGrade: 遠景の箱(空)のフィルタの末尾に色行列1枚を足す/外す(効いている間だけ)
//   - AtmospherePaint: 霧・近景などの色/濃さ/大きさを毎フレームの最後に掛け、次のフレームの頭で戻す
//   - KeyedGlowPool: 光源(松明など)ごとの柔らかい丸の絵(加算・使い回し・慣性で点く/消える)。影を落とす光ではない
//   - TorchBackLight: 松明の裏の光(KeyedGlowPool を1〜2枚重ね・値は utils/torchBackLight.ts の表)

import { ColorMatrixFilter, Container, Sprite, type Filter, type TilingSprite } from 'pixi.js';
import { getSoftGlowTexture } from './lighting';

export const mulTint = (tint: number, k: { r: number; g: number; b: number }): number => {
  const r = Math.round(((tint >> 16) & 255) * k.r);
  const g = Math.round(((tint >> 8) & 255) * k.g);
  const b = Math.round((tint & 255) * k.b);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
};
export const lerpTint = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** 遠景の箱に色行列1枚を足す/外す(mix>0 の間だけ・他所がフィルタを作り直しても末尾に足し直す)。 */
export class FarSkyGrade {
  private filter = new ColorMatrixFilter();
  private mix = -1;
  private group: Container | null = null;

  sync(farGroup: Container | null, mix: number, build: (mix: number) => number[]): void {
    if (mix <= 0 || !farGroup) { this.detach(); return; }
    if (mix !== this.mix) {
      this.mix = mix;
      this.filter.matrix = build(mix) as unknown as typeof this.filter.matrix;
    }
    if (this.group !== farGroup) this.detach();
    const cur = (farGroup.filters as Filter[] | null) ?? [];
    if (!cur.includes(this.filter)) farGroup.filters = [...cur, this.filter];
    this.group = farGroup;
  }

  detach(): void {
    const g = this.group;
    if (!g) return;
    this.group = null;
    if (g.destroyed) return;
    const cur = (g.filters as Filter[] | null) ?? [];
    if (cur.includes(this.filter)) g.filters = cur.filter(f => f !== this.filter);
  }

  destroy(): void {
    this.detach();
    this.filter.destroy();
  }
}

/** 霧・近景などに掛けた色・濃さ・大きさを覚えておき、次のフレームの頭で戻す。 */
export class AtmospherePaint {
  private originals = new Map<Sprite | TilingSprite, { tint: number; alpha: number; sx: number; sy: number }>();

  paint(sp: Sprite | TilingSprite | null, tint: number, alpha: number, scaleMul = 1): void {
    if (!sp || sp.destroyed) return;
    if (!this.originals.has(sp)) this.originals.set(sp, { tint: Number(sp.tint), alpha: sp.alpha, sx: sp.scale.x, sy: sp.scale.y });
    sp.tint = tint;
    sp.alpha = alpha;
    if (scaleMul !== 1) sp.scale.set(sp.scale.x * scaleMul, sp.scale.y * scaleMul);
  }

  restore(): void {
    for (const [sp, o] of this.originals) {
      if (!sp.destroyed) { sp.tint = o.tint; sp.alpha = o.alpha; sp.scale.set(o.sx, o.sy); }
    }
    this.originals.clear();
  }
}

export interface GlowLight { id: string; x: number; y: number; color: number; strength: number }
export interface GlowHost {
  view: { left: number; right: number; top: number; bottom: number };
  lights: readonly GlowLight[];
  depthScale: (y: number) => number;
  horizonAlpha: (y: number) => number;
}
export interface KeyedGlowSpec {
  /** 寸法(world px・遠近前)と、足元から奥(画面の上)へずらす量。 */
  w: number; h: number; up: number;
  /** 濃さ(光源の強さ 0..1 に掛ける)。 */
  alpha: number;
  /** 光源の色から tint へ寄せる割合。 */
  tint: number; tintMix: number;
  /** 濃さを目標へ寄せる割合(1フレームあたり)=点く/消える時にパッと変わらない(慣性)。 */
  ease: number;
  /** 同時に描く上限。 */
  max: number;
}
interface GlowSlot { id: string; sp: Sprite; a: number; seen: boolean }

/** 光源ごとの柔らかい丸の絵(加算)。光源の強さ(炎の揺らぎ込み)を慣性で寄せ、効き具合 k(加減速済み)を掛ける。 */
export class KeyedGlowPool {
  private slots: GlowSlot[] = [];
  constructor(private parent: Container, private spec: KeyedGlowSpec) {}

  sync(h: GlowHost, k: number): void {
    const S = this.spec;
    for (const b of this.slots) b.seen = false;
    const v = h.view;
    if (k > 0) {
      for (const l of h.lights) {
        if (l.x < v.left - 60 || l.x > v.right + 60 || l.y < v.top - 40 || l.y > v.bottom + 20) continue;
        let b = this.slots.find(q => q.id === l.id);
        if (!b) {
          b = this.slots.find(q => !q.seen && q.a <= 0.004 && !h.lights.some(x => x.id === q.id));
          if (!b) {
            if (this.slots.length >= S.max) continue;
            const sp = new Sprite(getSoftGlowTexture());
            sp.anchor.set(0.5);
            sp.blendMode = 'add';
            this.parent.addChild(sp);
            b = { id: l.id, sp, a: 0, seen: false };
            this.slots.push(b);
          }
          b.id = l.id; b.a = 0;
        }
        b.seen = true;
        b.a += (Math.min(1, l.strength) * h.horizonAlpha(l.y) - b.a) * S.ease;
        const d = h.depthScale(l.y);
        const sp = b.sp;
        sp.visible = b.a > 0.004;
        sp.tint = lerpTint(l.color, S.tint, S.tintMix);
        sp.position.set(l.x, l.y - S.up * d);
        sp.width = S.w * d;
        sp.height = S.h * d;
        sp.alpha = S.alpha * b.a * k;
      }
    }
    for (const b of this.slots) {
      if (b.seen) continue;
      b.a += (0 - b.a) * S.ease; // 画面から外れた/消えた光源・効きが抜けた時は慣性で消える
      if (b.a <= 0.004) { b.a = 0; b.sp.visible = false; continue; }
      b.sp.alpha *= 1 - S.ease;
    }
  }

  clear(): void { this.slots = []; }
}

/** 丸の絵1枚ぶんの寸法・濃さ・色(world px・遠近前。utils/torchBackLight.ts の表の1行)。 */
export type GlowPoolShape = Omit<KeyedGlowSpec, 'ease' | 'max'>;

/**
 * 松明の裏の光(utils/torchBackLight.ts の表の1ステージぶん)。丸の絵を1〜2枚重ね(各1つの KeyedGlowPool)、
 * 足元の少し奥(画面の上)の地面を照らす=松明の絵より下の層(地面の層)に置く。影を落とす光ではない。
 */
export class TorchBackLight {
  private pools: KeyedGlowPool[];
  constructor(parent: Container, shapes: readonly GlowPoolShape[], ease: number, max: number) {
    this.pools = shapes.map(p => {
      const layer = new Container();
      layer.eventMode = 'none';
      parent.addChild(layer);
      return new KeyedGlowPool(layer, { ...p, ease, max });
    });
  }

  /** k = 効き具合(加減速済み 0..1)。 */
  sync(h: GlowHost, k: number): void {
    for (const p of this.pools) p.sync(h, k);
  }

  clear(): void { for (const p of this.pools) p.clear(); }
}
