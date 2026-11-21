// 通常(雨上がりでない)のステージ1の森の夜(社長指示2026-11-21「通常のステージ1に流用できる部分は流用して」)。
// 雨上がり(weatherWet.ts)の見た目のうち、乾いた地面にも通じるものを弱めて掛ける。値と効く条件は utils/weatherWet.ts の S1N_*。
//   - 世界の色行列1枚(`gradeFilter`・効き具合が動く間だけ作り直す)
//   - 霧・近景の森の色(藍へ・濃さはそのまま)と月の暈/グロー(毎フレームの最後に掛け、次のフレームの頭で戻す=雨上がりと同じ型)
//   - 松明の裏の光(地面の層の一番下に柔らかい丸の絵1枚・加算)。影を落とす光ではない。
// ★描くだけ。ゲームの状態には書かない。

import { ColorMatrixFilter, Container, Sprite, type TilingSprite } from 'pixi.js';
import { getSoftGlowTexture } from './lighting';
import { AtmospherePaint, FarSkyGrade, TorchBackLight, mulTint, type GlowHost, type GlowLight } from './stageLook';
import { TORCH_BACK_STAGES } from '../utils/torchBackLight';
import {
  easeInOutSine, buildStage1NightGradeMatrix, buildStage1NightSkyMatrix, stage1NightTintMul,
  S1N_FOG_TINT_MUL, S1N_FRONT_TINT_MUL,
  S1N_MOON_GLOW_ALPHA_MUL, S1N_MOON_GLOW_SCALE_MUL, S1N_MOON_HALO_ALPHA_MUL, S1N_MOON_HALO_SCALE_MUL,
  TORCH_STREAK_EASE,
} from '../utils/weatherWet';

export interface S1NAtmosphere {
  fog: readonly (Sprite | TilingSprite)[];
  front: readonly (Sprite | TilingSprite | null)[];
  moonGlow: readonly Sprite[];
  moonHalo: readonly Sprite[];
}
export type S1NLight = GlowLight;
export type S1NHost = GlowHost;
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
  private sky = new FarSkyGrade();
  private root = new Container();
  private backs: TorchBackLight;
  private flowerLayer = new Container();
  private flowerGlows: Sprite[] = [];
  private atmo = new AtmospherePaint();

  constructor(groundLayer: Container) {
    this.root.eventMode = 'none';
    this.root.label = 'stage1Night';
    groundLayer.addChildAt(this.root, 0);
    this.flowerLayer.eventMode = 'none';
    this.root.addChild(this.flowerLayer); // 地面の層の一番下=松明の絵より必ず下(三脚が明るい地面の前に影絵で立つ)
    // 花の光の上(=従来どおり花の層の後ろに足す順)。値は utils/torchBackLight.ts の表(ステージ1=従来の値)。
    this.backs = new TorchBackLight(this.root, TORCH_BACK_STAGES['stage-1'].pools, TORCH_STREAK_EASE, BACK_MAX);
  }

  /** 効き具合 mix の色行列にする(変わった時だけ作り直す)。 */
  setGrade(mix: number): void {
    if (mix === this.gradeMix) return;
    this.gradeMix = mix;
    this.gradeFilter.matrix = buildStage1NightGradeMatrix(mix) as unknown as typeof this.gradeFilter.matrix;
  }

  /** 遠景の箱に空の色行列を足す/外す(mix>0 の間だけ・他所がフィルタを作り直しても末尾に足し直す)。 */
  syncSky(farGroup: Container | null, mix: number): void {
    this.sky.sync(farGroup, mix, buildStage1NightSkyMatrix);
  }

  private paint(sp: Sprite | TilingSprite | null, tint: number, alpha: number, scaleMul = 1): void {
    this.atmo.paint(sp, tint, alpha, scaleMul);
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
    this.atmo.restore();
  }

  /** 松明の裏の光。濃さは松明の光だまりの強さ(炎の揺らぎ込み)を慣性で寄せ、効き具合 mix を掛ける。 */
  syncTorchBacks(h: S1NHost, mix: number): void {
    this.backs.sync(h, easeInOutSine(mix));
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
    this.sky.destroy();
    this.root.destroy({ children: true });
    this.backs.clear();
    this.gradeFilter.destroy();
  }
}
