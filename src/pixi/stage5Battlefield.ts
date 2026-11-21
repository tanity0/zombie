// ステージ5(戦場)の光・色・コントラスト(社長承認2026-11-21)。値と効く条件は utils/stage5Battlefield.ts の S5B_*。
// ステージ1の森の夜(stage1Night.ts)と同じ部品(stageLook.ts)を使い、戦場の性格で掛ける:
//   - 世界の色行列1枚(`gradeFilter`・効き具合が動く間だけ作り直す)
//   - 空(遠景の箱)の色行列1枚
//   - 煙(霧)・近景の残骸の色(毎フレームの最後に掛け、次のフレームの頭で戻す。濃さはそのまま)
//   - 松明の足元の火の溜まり(地面の層の一番下に柔らかい丸の絵・加算・2枚重ね)。影を落とす光ではない。
// ★描くだけ。ゲームの状態には書かない。

import { ColorMatrixFilter, Container, type Sprite, type TilingSprite } from 'pixi.js';
import { AtmospherePaint, FarSkyGrade, KeyedGlowPool, lerpTint, mulTint, type GlowHost } from './stageLook';
import { easeInOutSine } from '../utils/weatherWet';
import {
  buildStage5GradeMatrix, buildStage5SkyMatrix, stage5TintMul,
  S5B_FOG_TINT_MUL, S5B_FRONT_TINT_MUL, S5B_FIRE_POOLS, S5B_FIRE_POOL_EASE, S5B_NIGHT_GRADE_TINT,
} from '../utils/stage5Battlefield';

export interface S5BAtmosphere {
  fog: readonly (Sprite | TilingSprite)[];
  front: readonly (Sprite | TilingSprite | null)[];
  /** 夜の寒色の乗算の絵(色だけ寄せる・濃さはそのまま)。 */
  nightGrade: Sprite | null;
}
/** 同時に描く火の溜まりの上限(画面内の松明はふつう数本・最大引きでも足りる数)。 */
const POOL_MAX = 16;

export class Stage5BattleLayer {
  readonly gradeFilter = new ColorMatrixFilter();
  private gradeMix = -1;
  private sky = new FarSkyGrade();
  private root = new Container();
  private pools: KeyedGlowPool[];
  private atmo = new AtmospherePaint();

  constructor(groundLayer: Container) {
    this.root.eventMode = 'none';
    this.root.label = 'stage5Battle';
    groundLayer.addChildAt(this.root, 0); // 地面の層の一番下=松明・残骸の絵より必ず下
    this.pools = S5B_FIRE_POOLS.map(p => {
      const layer = new Container();
      layer.eventMode = 'none';
      this.root.addChild(layer);
      return new KeyedGlowPool(layer, { ...p, ease: S5B_FIRE_POOL_EASE, max: POOL_MAX });
    });
  }

  /** 効き具合 mix の色行列にする(変わった時だけ作り直す)。 */
  setGrade(mix: number): void {
    if (mix === this.gradeMix) return;
    this.gradeMix = mix;
    this.gradeFilter.matrix = buildStage5GradeMatrix(mix) as unknown as typeof this.gradeFilter.matrix;
  }

  syncSky(farGroup: Container | null, mix: number): void {
    this.sky.sync(farGroup, mix, buildStage5SkyMatrix);
  }

  /** 火の溜まり。濃さは松明の光だまりの強さ(炎の揺らぎ込み)を慣性で寄せ、効き具合 mix を掛ける。 */
  syncFirePools(h: GlowHost, mix: number): void {
    const k = easeInOutSine(mix);
    for (const p of this.pools) p.sync(h, k);
  }

  /** 煙・近景・夜の乗算の色を、効き具合 mix ぶん掛ける(フレームの最後)。濃さは変えない。 */
  applyAtmosphere(a: S5BAtmosphere, mix: number): void {
    if (mix <= 0) return;
    const fogMul = stage5TintMul(S5B_FOG_TINT_MUL, mix);
    const frontMul = stage5TintMul(S5B_FRONT_TINT_MUL, mix);
    for (const f of a.fog) this.atmo.paint(f, mulTint(Number(f.tint), fogMul), f.alpha);
    for (const f of a.front) if (f) this.atmo.paint(f, mulTint(Number(f.tint), frontMul), f.alpha);
    const g = a.nightGrade;
    if (g) this.atmo.paint(g, lerpTint(Number(g.tint), S5B_NIGHT_GRADE_TINT, easeInOutSine(mix)), g.alpha);
  }

  /** 前フレームに掛けた色を戻す(フレームの頭)。 */
  restoreAtmosphere(): void {
    this.atmo.restore();
  }

  destroy(): void {
    this.restoreAtmosphere();
    this.sky.destroy();
    this.root.destroy({ children: true });
    for (const p of this.pools) p.clear();
    this.gradeFilter.destroy();
  }
}
