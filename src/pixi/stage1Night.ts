// 通常(雨上がりでない)のステージ1の森の夜(社長指示2026-11-21「通常のステージ1に流用できる部分は流用して」)。
// 雨上がり(weatherWet.ts)の見た目のうち、乾いた地面にも通じるものを弱めて掛ける。値と効く条件は utils/weatherWet.ts の S1N_*。
//   - 世界の色行列1枚(`gradeFilter`・効き具合が動く間だけ作り直す)
//   - 霧・近景の森の色(藍へ・濃さはそのまま)と月の暈/グロー(毎フレームの最後に掛け、次のフレームの頭で戻す=雨上がりと同じ型)
//   - 松明の裏の光(地面の層の一番下に柔らかい丸の絵1枚・加算)。影を落とす光ではない。
// ★描くだけ。ゲームの状態には書かない。

import { ColorMatrixFilter, Container, Sprite, type Filter, type TilingSprite } from 'pixi.js';
import { getSoftGlowTexture } from './lighting';
import {
  easeInOutSine, buildStage1NightGradeMatrix, buildStage1NightSkyMatrix, stage1NightTintMul,
  S1N_FOG_TINT_MUL, S1N_FRONT_TINT_MUL,
  S1N_MOON_GLOW_ALPHA_MUL, S1N_MOON_GLOW_SCALE_MUL, S1N_MOON_HALO_ALPHA_MUL, S1N_MOON_HALO_SCALE_MUL,
  TORCH_BACK_UP, TORCH_BACK_W, TORCH_BACK_H, TORCH_BACK_TINT, TORCH_BACK_TINT_MIX, TORCH_STREAK_EASE, S1N_TORCH_BACK_ALPHA,
} from '../utils/weatherWet';

const mulTint = (tint: number, k: { r: number; g: number; b: number }): number => {
  const r = Math.round(((tint >> 16) & 255) * k.r);
  const g = Math.round(((tint >> 8) & 255) * k.g);
  const b = Math.round((tint & 255) * k.b);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
};
const lerpTint = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export interface S1NAtmosphere {
  fog: readonly (Sprite | TilingSprite)[];
  front: readonly (Sprite | TilingSprite | null)[];
  moonGlow: readonly Sprite[];
  moonHalo: readonly Sprite[];
}
export interface S1NLight { id: string; x: number; y: number; color: number; strength: number }
export interface S1NHost {
  view: { left: number; right: number; top: number; bottom: number };
  lights: readonly S1NLight[];
  depthScale: (y: number) => number;
  horizonAlpha: (y: number) => number;
}
interface Back { id: string; sp: Sprite; a: number; seen: boolean }
export interface S1NFlower { id: string; x: number; y: number; h: number; alpha: number }
/** 花の淡い光(月明りの紫の花がほのかに光る): 色・濃さ・大きさ(花の背丈の何倍)・脈の速さ。 */
const FLOWER_GLOW_TINT = 0xa47dff;
const FLOWER_GLOW_ALPHA = 0.45;
const FLOWER_GLOW_SIZE = 1.9;
const FLOWER_GLOW_MAX = 40;
/** 同時に描く松明の裏の光の上限(画面内の松明はふつう数本)。 */
const BACK_MAX = 12;

export class Stage1NightLayer {
  readonly gradeFilter = new ColorMatrixFilter();
  private gradeMix = -1;
  /** 空(遠景の箱)の色行列。効いている間だけ遠景の箱のフィルタの末尾に足す。 */
  private skyFilter = new ColorMatrixFilter();
  private skyMix = -1;
  private skyGroup: Container | null = null;
  private root = new Container();
  private backs: Back[] = [];
  private flowerLayer = new Container();
  private flowerGlows: Sprite[] = [];
  private originals = new Map<Sprite | TilingSprite, { tint: number; alpha: number; sx: number; sy: number }>();

  constructor(groundLayer: Container) {
    this.root.eventMode = 'none';
    this.root.label = 'stage1Night';
    groundLayer.addChildAt(this.root, 0);
    this.flowerLayer.eventMode = 'none';
    this.root.addChild(this.flowerLayer); // 地面の層の一番下=松明の絵より必ず下(三脚が明るい地面の前に影絵で立つ)
  }

  /** 効き具合 mix の色行列にする(変わった時だけ作り直す)。 */
  setGrade(mix: number): void {
    if (mix === this.gradeMix) return;
    this.gradeMix = mix;
    this.gradeFilter.matrix = buildStage1NightGradeMatrix(mix) as unknown as typeof this.gradeFilter.matrix;
  }

  /** 遠景の箱に空の色行列を足す/外す(mix>0 の間だけ・他所がフィルタを作り直しても末尾に足し直す)。 */
  syncSky(farGroup: Container | null, mix: number): void {
    if (mix <= 0 || !farGroup) { this.detachSky(); return; }
    if (mix !== this.skyMix) {
      this.skyMix = mix;
      this.skyFilter.matrix = buildStage1NightSkyMatrix(mix) as unknown as typeof this.skyFilter.matrix;
    }
    if (this.skyGroup !== farGroup) this.detachSky();
    const cur = (farGroup.filters as Filter[] | null) ?? [];
    if (!cur.includes(this.skyFilter)) farGroup.filters = [...cur, this.skyFilter];
    this.skyGroup = farGroup;
  }

  private detachSky(): void {
    const g = this.skyGroup;
    if (!g) return;
    this.skyGroup = null;
    if (g.destroyed) return;
    const cur = (g.filters as Filter[] | null) ?? [];
    if (cur.includes(this.skyFilter)) g.filters = cur.filter(f => f !== this.skyFilter);
  }

  private paint(sp: Sprite | TilingSprite | null, tint: number, alpha: number, scaleMul = 1): void {
    if (!sp || sp.destroyed) return;
    if (!this.originals.has(sp)) this.originals.set(sp, { tint: Number(sp.tint), alpha: sp.alpha, sx: sp.scale.x, sy: sp.scale.y });
    sp.tint = tint;
    sp.alpha = alpha;
    if (scaleMul !== 1) sp.scale.set(sp.scale.x * scaleMul, sp.scale.y * scaleMul);
  }

  /** 霧・近景の色と月の暈/グローを、効き具合 mix ぶん掛ける(フレームの最後)。 */
  applyAtmosphere(a: S1NAtmosphere, mix: number): void {
    if (mix <= 0) return;
    const k = easeInOutSine(mix);
    const l = (m: number) => 1 + (m - 1) * k;
    const fogMul = stage1NightTintMul(S1N_FOG_TINT_MUL, mix);
    const frontMul = stage1NightTintMul(S1N_FRONT_TINT_MUL, mix);
    for (const f of a.fog) this.paint(f, mulTint(Number(f.tint), fogMul), f.alpha); // 濃さはそのまま(色だけ)
    for (const f of a.front) if (f) this.paint(f, mulTint(Number(f.tint), frontMul), f.alpha);
    for (const m of a.moonGlow) this.paint(m, Number(m.tint), m.alpha * l(S1N_MOON_GLOW_ALPHA_MUL), l(S1N_MOON_GLOW_SCALE_MUL));
    for (const m of a.moonHalo) this.paint(m, Number(m.tint), m.alpha * l(S1N_MOON_HALO_ALPHA_MUL), l(S1N_MOON_HALO_SCALE_MUL));
  }

  /** 前フレームに掛けた色・大きさを戻す(フレームの頭)。 */
  restoreAtmosphere(): void {
    for (const [sp, o] of this.originals) {
      if (!sp.destroyed) { sp.tint = o.tint; sp.alpha = o.alpha; sp.scale.set(o.sx, o.sy); }
    }
    this.originals.clear();
  }

  /** 松明の裏の光。濃さは松明の光だまりの強さ(炎の揺らぎ込み)を慣性で寄せ、効き具合 mix を掛ける。 */
  syncTorchBacks(h: S1NHost, mix: number): void {
    const k = easeInOutSine(mix);
    for (const b of this.backs) b.seen = false;
    const v = h.view;
    if (k > 0) {
      for (const l of h.lights) {
        if (l.x < v.left - 60 || l.x > v.right + 60 || l.y < v.top - 40 || l.y > v.bottom + 20) continue;
        let b = this.backs.find(q => q.id === l.id);
        if (!b) {
          b = this.backs.find(q => !q.seen && q.a <= 0.004 && !h.lights.some(x => x.id === q.id));
          if (!b) {
            if (this.backs.length >= BACK_MAX) continue;
            const sp = new Sprite(getSoftGlowTexture());
            sp.anchor.set(0.5);
            sp.blendMode = 'add';
            this.root.addChild(sp);
            b = { id: l.id, sp, a: 0, seen: false };
            this.backs.push(b);
          }
          b.id = l.id; b.a = 0;
        }
        b.seen = true;
        b.a += (Math.min(1, l.strength) * h.horizonAlpha(l.y) - b.a) * TORCH_STREAK_EASE;
        const d = h.depthScale(l.y);
        const sp = b.sp;
        sp.visible = b.a > 0.004;
        sp.tint = lerpTint(l.color, TORCH_BACK_TINT, TORCH_BACK_TINT_MIX);
        sp.position.set(l.x, l.y - TORCH_BACK_UP * d);
        sp.width = TORCH_BACK_W * d;
        sp.height = TORCH_BACK_H * d;
        sp.alpha = S1N_TORCH_BACK_ALPHA * b.a * k;
      }
    }
    for (const b of this.backs) {
      if (b.seen) continue;
      b.a += (0 - b.a) * TORCH_STREAK_EASE; // 画面から外れた/消えた松明・効きが抜けた時は慣性で消える
      if (b.a <= 0.004) { b.a = 0; b.sp.visible = false; continue; }
      b.sp.alpha *= 1 - TORCH_STREAK_EASE;
    }
  }

  /** 花のほのかな光(地面の層=花の絵の下に柔らかい丸の絵1枚・加算・使い回し)。濃さは効き具合と花の見え方を掛け、ゆっくり脈打つ。 */
  syncFlowerGlows(flowers: readonly S1NFlower[], mix: number, now: number): void {
    const k = easeInOutSine(mix);
    let used = 0;
    if (k > 0) {
      for (const f of flowers) {
        if (used >= FLOWER_GLOW_MAX) break;
        if (f.alpha < 0.05) continue;
        let sp = this.flowerGlows[used];
        if (!sp) {
          sp = new Sprite(getSoftGlowTexture());
          sp.anchor.set(0.5);
          sp.blendMode = 'add';
          sp.tint = FLOWER_GLOW_TINT;
          this.flowerLayer.addChild(sp);
          this.flowerGlows.push(sp);
        }
        used++;
        const seed = (f.x * 0.013 + f.y * 0.007) % 6.283;
        const pulse = 0.8 + 0.2 * Math.sin(now * 0.0011 + seed); // ゆっくり(sin=加減速つき)
        sp.visible = true;
        sp.position.set(f.x, f.y - f.h * 0.5);
        sp.width = f.h * FLOWER_GLOW_SIZE;
        sp.height = f.h * FLOWER_GLOW_SIZE * 0.8;
        sp.alpha = FLOWER_GLOW_ALPHA * k * f.alpha * pulse;
      }
    }
    for (let i = used; i < this.flowerGlows.length; i++) this.flowerGlows[i].visible = false;
  }

  destroy(): void {
    this.restoreAtmosphere();
    this.detachSky();
    this.skyFilter.destroy();
    this.root.destroy({ children: true });
    this.backs = [];
    this.gradeFilter.destroy();
  }
}
