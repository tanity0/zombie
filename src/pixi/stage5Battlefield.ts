// ステージ5(戦場)の光・色・コントラスト(社長承認2026-11-21)。値と効く条件は utils/stage5Battlefield.ts の S5B_*。
// ステージ1の森の夜(stage1Night.ts)と同じ部品(stageLook.ts)を使い、戦場の性格で掛ける:
//   - 世界の色行列1枚(`gradeFilter`・効き具合が動く間だけ作り直す)
//   - 空(遠景の箱)の色行列1枚
//   - 煙(霧)・近景の残骸の色(毎フレームの最後に掛け、次のフレームの頭で戻す。濃さはそのまま)
//   - 松明の足元の少し奥の火の溜まり(=松明の裏の光・地面の層の一番下に柔らかい丸の絵・加算・2枚重ね)。影を落とす光ではない。
//   - 燃える残骸(BurningWreckLayer・社長指示2026-11-21「燃える残骸足して」): どれが燃えるかは world/burningWrecks.ts。
//     炎(松明と同じ8コマ)・炎の光の暈・火の粉・昇る煙を置物の上に重ね、足元に火の溜まりを落とす。影を落とす光ではない。
// ★描くだけ。ゲームの状態には書かない。

import { ColorMatrixFilter, Container, Graphics, Sprite, type Texture, type TilingSprite } from 'pixi.js';
import { AtmospherePaint, FarSkyGrade, TorchBackLight, lerpTint, mulTint, type GlowHost, type GlowLight } from './stageLook';
import { TORCH_BACK_STAGES } from '../utils/torchBackLight';
import { getSoftGlowTexture } from './lighting';
import { easeInOutSine } from '../utils/weatherWet';
import {
  buildStage5GradeMatrix, buildStage5SkyMatrix, stage5TintMul,
  S5B_FOG_TINT_MUL, S5B_FRONT_TINT_MUL, S5B_FIRE_POOL_EASE, S5B_NIGHT_GRADE_TINT,
  S5B_WRECK_MAX, S5B_WRECK_EASE, S5B_WRECK_LIGHT_COLOR, burningWreckFlames, burningWreckSmoke, burningWreckFlicker, burningWreckZIndex,
} from '../utils/stage5Battlefield';

export interface S5BAtmosphere {
  fog: readonly (Sprite | TilingSprite)[];
  front: readonly (Sprite | TilingSprite | null)[];
  /** 夜の寒色の乗算の絵(色だけ寄せる・濃さはそのまま)。 */
  nightGrade: Sprite | null;
}
/** 同時に描く火の溜まりの上限(松明+燃える残骸 S5B_WRECK_MAX)。 */
const POOL_MAX = 16 + S5B_WRECK_MAX;

export class Stage5BattleLayer {
  readonly gradeFilter = new ColorMatrixFilter();
  private gradeMix = -1;
  private sky = new FarSkyGrade();
  private root = new Container();
  private pools: TorchBackLight;
  private atmo = new AtmospherePaint();
  private wrecks: BurningWreckLayer;

  constructor(groundLayer: Container, actorLayer: Container) {
    this.wrecks = new BurningWreckLayer(actorLayer);
    this.root.eventMode = 'none';
    this.root.label = 'stage5Battle';
    groundLayer.addChildAt(this.root, 0); // 地面の層の一番下=松明・残骸の絵より必ず下
    // 松明の裏の光(値は utils/torchBackLight.ts の表=S5B_FIRE_POOLS)。燃える残骸の足元の溜まりも同じ絵。
    this.pools = new TorchBackLight(this.root, TORCH_BACK_STAGES['stage-5'].pools, S5B_FIRE_POOL_EASE, POOL_MAX);
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

  /** 燃える残骸の炎・暈・火の粉・煙。戻り値=足元の火の溜まりの光源(syncFirePools の lights へ足す)。 */
  syncBurningWrecks(list: readonly BurningWreckView[], mix: number, now: number, painter: FlamePainter): readonly GlowLight[] {
    return this.wrecks.sync(list, easeInOutSine(mix), now, painter);
  }

  /** 火の溜まり。濃さは松明の光だまりの強さ(炎の揺らぎ込み)を慣性で寄せ、効き具合 mix を掛ける。 */
  syncFirePools(h: GlowHost, mix: number): void {
    this.pools.sync(h, easeInOutSine(mix));
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
    this.wrecks.destroy();
    this.pools.clear();
    this.gradeFilter.destroy();
  }
}

/** 燃える残骸1つぶんの、このフレームの入力(描画側が置物の絵から作る)。 */
export interface BurningWreckView {
  id: string;
  footX: number;
  footY: number;
  /** 置物の絵の並び順(zIndex=world の足元Y)。炎はこのすぐ奥に並べる(footY は置く位置で、?proj=1 では投影後=並び順には使えない)。 */
  propZ: number;
  /** 置物の絵の幅・高さ(world px・遠近前)。 */
  artW: number;
  artH: number;
  seed: number;
  /** 遠近の倍率(置物と同じ depthScale)。 */
  d: number;
  /** 置物の絵の今の濃さ(地平線の覆い・裏回りの透け込み)。 */
  alpha: number;
}
/** 炎の絵を置く手段(松明・火炎瓶と同じ placeFlame / drawFlameEmbers を借りる)。 */
export interface FlamePainter {
  frames: readonly Texture[] | null;
  place: (sp: Sprite, frames: Texture[], x: number, baseY: number, height: number, now: number, seed: number) => void;
  embers: (g: Graphics, x: number, y: number, r: number, seedX: number, seedY: number, now: number, alpha: number) => void;
  smoke: Texture | null;
}
const WRECK_FLAMES = 3;
const WRECK_SMOKES = 2;
interface WreckSlot {
  id: string; c: Container; halo: Sprite; flames: Sprite[]; smoke: Sprite[]; embers: Graphics;
  a: number; seen: boolean; last: BurningWreckView | null;
}

/**
 * 燃える残骸の炎(置物の上・足元のYでアクターと前後を並べる)。使い回し・上限 S5B_WRECK_MAX。
 * 点く/消える(画面に入る/出る・壊れる・効きが抜ける)は濃さを慣性で寄せる。足元の火の溜まり用の光源を返す。
 */
export class BurningWreckLayer {
  private slots: WreckSlot[] = [];
  private lights: GlowLight[] = [];
  constructor(private parent: Container) {}

  private makeSlot(): WreckSlot {
    const c = new Container();
    c.eventMode = 'none';
    c.label = 'burningWreck';
    const halo = new Sprite(getSoftGlowTexture());
    halo.anchor.set(0.5);
    halo.blendMode = 'add';
    const smoke: Sprite[] = [];
    for (let i = 0; i < WRECK_SMOKES; i++) { const sp = new Sprite(); sp.anchor.set(0.5); sp.visible = false; smoke.push(sp); }
    const flames: Sprite[] = [];
    for (let i = 0; i < WRECK_FLAMES; i++) { const sp = new Sprite(); sp.visible = false; flames.push(sp); }
    const embers = new Graphics();
    embers.blendMode = 'add';
    c.addChild(...smoke, halo, ...flames, embers); // 煙が一番奥(炎の後ろから昇る)
    this.parent.addChild(c);
    return { id: '', c, halo, flames, smoke, embers, a: 0, seen: false, last: null };
  }

  /** k = 効き具合(加減速済み 0..1)。戻り値=足元の火の溜まりの光源(KeyedGlowPool へ渡す)。 */
  sync(list: readonly BurningWreckView[], k: number, now: number, painter: FlamePainter): readonly GlowLight[] {
    this.lights.length = 0;
    for (const b of this.slots) b.seen = false;
    if (k > 0) {
      for (const w of list) {
        let b = this.slots.find(q => q.id === w.id);
        if (!b) {
          b = this.slots.find(q => !q.seen && q.a <= 0.004 && !list.some(x => x.id === q.id));
          if (!b) {
            if (this.slots.length >= S5B_WRECK_MAX) continue;
            b = this.makeSlot();
            this.slots.push(b);
          }
          b.id = w.id; b.a = 0;
        }
        b.seen = true;
        b.last = w;
        b.a += (w.alpha * k - b.a) * S5B_WRECK_EASE;
        this.draw(b, w, now, painter);
      }
    }
    for (const b of this.slots) {
      if (b.seen) continue;
      b.a += (0 - b.a) * S5B_WRECK_EASE; // 画面から外れた/壊れた/効きが抜けた=慣性で消える
      if (b.a <= 0.004 || !b.last) { b.a = 0; b.c.visible = false; b.embers.clear(); continue; }
      this.draw(b, b.last, now, painter);
    }
    return this.lights;
  }

  private draw(b: WreckSlot, w: BurningWreckView, now: number, painter: FlamePainter): void {
    const a = b.a;
    b.c.visible = a > 0.004;
    if (!b.c.visible) { b.embers.clear(); return; }
    b.c.zIndex = burningWreckZIndex(w.propZ); // 置物の並び順のすぐ奥=残骸が炎を背に影絵で立つ(松明の炎が台座の奥なのと同じ)。footY(?proj=1 では投影後)からは決めない
    b.c.alpha = a;
    const d = w.d;
    const fl = burningWreckFlicker(now, w.seed);
    const flames = burningWreckFlames(w.artW, w.artH, w.seed, now);
    const frames = painter.frames as Texture[] | null;
    let topY = w.footY, mainH = 0, cx = w.footX;
    for (let i = 0; i < WRECK_FLAMES; i++) {
      const sp = b.flames[i];
      const f = flames[i];
      if (!f || !frames) { sp.visible = false; continue; }
      const baseY = w.footY - f.base * d;
      const h = f.h * d;
      painter.place(sp, frames, w.footX + f.dx * d, baseY, h, now, w.seed * 37 + i * 2.3);
      if (h > mainH) { mainH = h; cx = w.footX + f.dx * d; }
      topY = Math.min(topY, baseY - h);
    }
    if (mainH <= 0) { mainH = w.artH * 0.8 * d; topY = w.footY - w.artH * d; }
    const centerY = topY + mainH * 0.55;
    // 炎の光の暈(加算・柔らかい丸)。置物の絵の上で炎が周りを照らす。
    const haloW = Math.max(w.artW * 1.7, 130) * d * fl;
    b.halo.position.set(cx, centerY);
    b.halo.tint = 0xffa04a;
    b.halo.width = haloW;
    b.halo.height = haloW * 0.86;
    b.halo.alpha = 0.4 * fl;
    // 火の粉(松明と同じ描き方・炎の大きさに合わせる)。
    b.embers.clear();
    painter.embers(b.embers, cx, centerY, 5.5 * d * Math.max(0.8, mainH / (60 * d)), w.footX, w.footY, now, 1);
    // 昇る煙(使える絵がある時だけ)。
    for (let j = 0; j < WRECK_SMOKES; j++) {
      const sp = b.smoke[j];
      const sm = painter.smoke ? burningWreckSmoke(w.artW, w.seed, j, now) : null;
      if (!sm || !painter.smoke) { sp.visible = false; continue; }
      sp.texture = painter.smoke;
      sp.visible = true;
      sp.position.set(cx + sm.dx * d, topY + mainH * 0.25 - sm.rise * d);
      sp.width = sp.height = sm.size * d;
      sp.rotation = sm.rot;
      sp.tint = 0x3a2c26;
      sp.alpha = sm.alpha;
    }
    this.lights.push({ id: 'burn:' + w.id, x: w.footX, y: w.footY, color: S5B_WRECK_LIGHT_COLOR, strength: a * (0.82 + 0.18 * fl) });
  }

  destroy(): void {
    for (const b of this.slots) b.c.destroy({ children: true });
    this.slots = [];
  }
}
