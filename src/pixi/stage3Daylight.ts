// ステージ3(医療科学センター・昼の廃都)の光と影(社長承認2026-11-21)。値と効く条件は utils/stage3Daylight.ts の S3D_*。
// ステージ1の森の夜(stage1Night.ts)・ステージ5の戦場(stage5Battlefield.ts)と同じ部品(stageLook.ts)を使う:
//   - 世界の色行列1枚(`gradeFilter`・暗部〜中間=青/明部=金のスプリットトーン・効き具合が動く間だけ作り直す)
//   - 空(遠景の箱)の色行列1枚(青を少し上げる)
//   - 霧の色(反対側の弱い寒色・濃さはそのまま)+地平の帯の暖かいかすみ(左=太陽の側で強く右で弱い・加算)
//   - 太陽の光の筋 4本(月明りの筋の絵を金色で)+光の当たりの山(左上〜中段左)+筋の中で光る塵(画面の層・加算)
//   - 太陽のまぶしさ(画面の上端の外・にじみの縁だけ・一定)
//   - 木漏れ日: 画面の縁の帯(手前・奥)と木の足元の梢の影(乗算・広い薄い影の中に明るい光の粒)
// どれも影を落とす光ではない(投影影の光源は増やさない)。★描くだけ。ゲームの状態には書かない。

import { ColorMatrixFilter, Container, Point, Sprite, Texture, TilingSprite } from 'pixi.js';
import { getSoftGlowTexture } from './lighting';
import { getMoonShaftTexture } from './moonShaftTexture';
import { AtmospherePaint, FarSkyGrade } from './stageLook';
import { easeInOutSine } from '../utils/weatherWet';
import { moonShaftLightAt, moonDustHeading, moonDustTwinkle, MOON_SHAFT_GAIN, type MoonShaft } from '../utils/moonShafts';
import {
  buildStage3GradeMatrix, buildStage3SkyMatrix, stage3FogTint, layoutSunShafts, sunPos, hazeAcross, hazeAlong,
  bandBlobs, canopyBlobs, dappleSway, hash01, type DappleBlob,
  S3D_SHAFT_COLOR, S3D_SHAFT_ALPHA, S3D_LIGHT_MASS,
  S3D_DUST_COUNT, S3D_DUST_PX, S3D_DUST_ALPHA, S3D_DUST_TINT, S3D_DUST_LIT_GAIN, S3D_DUST_SPEED_MIN, S3D_DUST_SPEED_MAX,
  S3D_GLARE_HALO_SIZE, S3D_GLARE_HALO_ALPHA, S3D_GLARE_HALO_TINT, S3D_GLARE_CORE_SIZE, S3D_GLARE_CORE_ALPHA, S3D_GLARE_CORE_TINT,
  S3D_HAZE_TINT, S3D_HAZE_ALPHA, S3D_HAZE_H,
  S3D_BAND_TEX_W, S3D_BAND_TEX_H, S3D_DAPPLE_SHADE, S3D_BAND_ALPHA, S3D_BAND_ALPHA_2, S3D_BAND_NEAR_H, S3D_BAND_FAR_H,
  S3D_BAND_SCALE_2, S3D_BAND_SHIFT_2, S3D_CANOPY, S3D_CANOPY_MAX,
} from '../utils/stage3Daylight';

/** 斑を1つ描く(回して潰した放射グラデーション)。wrapW>0 なら横に継ぎ目なく(左右にも描く)。 */
const drawBlob = (ctx: CanvasRenderingContext2D, b: DappleBlob, color: string, wrapW: number): void => {
  for (const ox of wrapW > 0 ? [-wrapW, 0, wrapW] : [0]) {
    ctx.save();
    ctx.translate(b.x + ox, b.y);
    ctx.rotate(b.rot);
    ctx.scale(b.rx / b.ry, 1);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.ry);
    g.addColorStop(0, `rgba(${color},1)`);
    g.addColorStop(Math.max(0.01, 1 - b.soft), `rgba(${color},0.95)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, b.ry, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
};
const shadeRgb = (dark: number): string =>
  `${Math.round(255 * dark * S3D_DAPPLE_SHADE.r)},${Math.round(255 * dark * S3D_DAPPLE_SHADE.g)},${Math.min(255, Math.round(255 * dark * S3D_DAPPLE_SHADE.b))}`;

const bandTex: (Texture | null)[] = [null, null];
/** 縁の帯の絵(i=0 手前: 縁=下 / i=1 奥: 縁=上)。白地に「広い薄い影」と、その中の「明るい丸い光の粒」。初回だけ焼く。 */
const getBandTexture = (i: 0 | 1): Texture => {
  const hit = bandTex[i];
  if (hit) return hit;
  const W = S3D_BAND_TEX_W, H = S3D_BAND_TEX_H;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  // 縁の付け根の、ごく薄い広い影(縁から内へ滑らかに消える)。
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(${shadeRgb(0.86)},1)`);
  g.addColorStop(0.45, `rgba(${shadeRgb(0.93)},0.6)`);
  g.addColorStop(1, `rgba(${shadeRgb(1)},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const { shade, spots } = bandBlobs(W, H, i === 0 ? 11 : 29);
  ctx.globalCompositeOperation = 'darken'; // 影どうしが重なっても暗さは積まない
  for (const b of shade) drawBlob(ctx, b, shadeRgb(b.dark), W);
  ctx.globalCompositeOperation = 'lighten'; // 影の中に光の粒を抜く(白=乗算で無変化)
  for (const b of spots) drawBlob(ctx, b, '255,252,240', W);
  ctx.globalCompositeOperation = 'source-over';
  // 内側の端は必ず白(帯の継ぎ目を見せない)。
  const f = ctx.createLinearGradient(0, H * 0.75, 0, H);
  f.addColorStop(0, 'rgba(255,255,255,0)');
  f.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = f; ctx.fillRect(0, H * 0.75, W, H * 0.25);
  // 縁そのもの(地平の際)も白から立ち上げる=帯の端に横一文字の線を出さない。
  const e = ctx.createLinearGradient(0, 0, 0, H * 0.12);
  e.addColorStop(0, 'rgba(255,255,255,1)');
  e.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = e; ctx.fillRect(0, 0, W, H * 0.12);
  if (i === 0) { // 焼いた向きは縁=上。手前の帯は縁=下(上下を入れ替える)
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const x2 = c2.getContext('2d')!;
    x2.translate(0, H); x2.scale(1, -1); x2.drawImage(c, 0, 0);
    bandTex[i] = Texture.from(c2);
  } else {
    bandTex[i] = Texture.from(c);
  }
  return bandTex[i]!;
};

const canopyTex: (Texture | null)[] = [null, null, null];
/** 梢の影の絵(3種・128 四方・白地=乗算で無変化。縁は必ず白)。初回だけ焼く。 */
const getCanopyTexture = (i: number): Texture => {
  const hit = canopyTex[i];
  if (hit) return hit;
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
  const { shade, spots } = canopyBlobs(S, 101 + i * 37);
  ctx.globalCompositeOperation = 'darken';
  for (const b of shade) drawBlob(ctx, b, shadeRgb(b.dark), 0);
  ctx.globalCompositeOperation = 'lighten';
  for (const b of spots) drawBlob(ctx, b, '255,252,240', 0);
  // 外周を白へ(四角い縁を出さない)。
  ctx.globalCompositeOperation = 'source-over';
  const r = ctx.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.5);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  canopyTex[i] = Texture.from(c);
  return canopyTex[i]!;
};

let hazeTex: Texture | null = null;
/** 地平の帯のかすみの絵(横=左が濃く右が薄い・縦=真ん中が濃く上下へ消える)。初回だけ焼く。 */
const getHazeTexture = (): Texture => {
  if (hazeTex) return hazeTex;
  const W = 128, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
    img.data[o + 3] = Math.round(255 * hazeAcross((x + 0.5) / W) * hazeAlong((y + 0.5) / H));
  }
  ctx.putImageData(img, 0, 0);
  hazeTex = Texture.from(c);
  return hazeTex;
};

interface Dust { sp: Sprite; x: number; y: number; vx: number; vy: number; seed: number; speed: number }
/** 木1本ぶんの、このフレームの入力(描画側が木の絵から作る)。 */
export interface S3DTreeView { id: string; x: number; y: number; w: number; h: number; alpha: number }
interface CanopySlot { id: string; sp: Sprite; a: number; seen: boolean }

export class Stage3DaylightLayer {
  readonly gradeFilter = new ColorMatrixFilter();
  private gradeMix = -1;
  private sky = new FarSkyGrade();
  private atmo = new AtmospherePaint();
  /** 光の筋・光の当たりの山・塵(画面の層)。 */
  private shaftRoot = new Container();
  private mass: Sprite;
  private shaftSprites: Sprite[] = [];
  private shafts: MoonShaft[] = [];
  private dust: Dust[] = [];
  private dustW = 0;
  private dustH = 0;
  private lastNow = 0;
  /** 太陽のまぶしさ(画面の層・周辺減光より上)。 */
  private glareRoot = new Container();
  private halo: Sprite;
  private core: Sprite;
  /** 木漏れ日: 縁の帯(手前・奥 × 2枚)と梢の影は、地面と同じ層(雲の影の直上)。 */
  private bands: TilingSprite[] = [];
  private canopyRoot = new Container();
  private canopies: CanopySlot[] = [];
  /** 地平の帯の暖かいかすみ(world の層・遠景の際の直上=遊ぶ面の後ろ)。 */
  private haze: Sprite;
  private pt = new Point();

  constructor(uiLayer: Container, shaftAfter: Container, glareAfter: Container, worldGroup: Container, cloudShadow: TilingSprite, hazeBefore: Container) {
    const after = (c: Container) => (c.parent === uiLayer ? uiLayer.getChildIndex(c) + 1 : uiLayer.children.length);
    this.shaftRoot.eventMode = 'none';
    this.shaftRoot.label = 'stage3SunShafts';
    this.shaftRoot.visible = false;
    uiLayer.addChildAt(this.shaftRoot, after(shaftAfter));
    this.glareRoot.eventMode = 'none';
    this.glareRoot.label = 'stage3SunGlare';
    this.glareRoot.visible = false;
    uiLayer.addChildAt(this.glareRoot, after(glareAfter));
    const glow = (parent: Container, tint: number) => {
      const sp = new Sprite(getSoftGlowTexture());
      sp.anchor.set(0.5);
      sp.blendMode = 'add';
      sp.eventMode = 'none';
      sp.tint = tint;
      parent.addChild(sp);
      return sp;
    };
    this.mass = glow(this.shaftRoot, S3D_LIGHT_MASS.tint);
    this.halo = glow(this.glareRoot, S3D_GLARE_HALO_TINT);
    this.core = glow(this.glareRoot, S3D_GLARE_CORE_TINT);
    let at = cloudShadow.parent === worldGroup ? worldGroup.getChildIndex(cloudShadow) + 1 : 0;
    for (const i of [0, 0, 1, 1] as const) {
      const t = new TilingSprite({ texture: getBandTexture(i), width: 1, height: 1 });
      t.blendMode = 'multiply';
      t.eventMode = 'none';
      t.label = 'stage3Dapple';
      t.visible = false;
      worldGroup.addChildAt(t, at++);
      this.bands.push(t);
    }
    this.canopyRoot.eventMode = 'none';
    this.canopyRoot.label = 'stage3Canopy';
    // world の層に置くと被写界深度のフィルタの中(透明の下地)で乗算することになり四角く白く抜けるので、地面と同じ層(雲の影の直上)に置き、
    // world と同じ位置・倍率を毎フレーム写す(syncCanopies)。
    worldGroup.addChildAt(this.canopyRoot, at++);
    this.haze = new Sprite(getHazeTexture());
    this.haze.blendMode = 'add';
    this.haze.eventMode = 'none';
    this.haze.tint = S3D_HAZE_TINT;
    this.haze.label = 'stage3Haze';
    this.haze.visible = false;
    worldGroup.addChildAt(this.haze, hazeBefore.parent === worldGroup ? worldGroup.getChildIndex(hazeBefore) : 0);
  }

  /** 効き具合 mix の色行列にする(変わった時だけ作り直す)。 */
  setGrade(mix: number): void {
    if (mix === this.gradeMix) return;
    this.gradeMix = mix;
    this.gradeFilter.matrix = buildStage3GradeMatrix(mix) as unknown as typeof this.gradeFilter.matrix;
  }

  syncSky(farGroup: Container | null, mix: number): void {
    this.sky.sync(farGroup, mix, buildStage3SkyMatrix);
  }

  /** 霧の色(フレームの最後)。濃さは変えない。 */
  applyAtmosphere(fog: readonly (Sprite | TilingSprite)[], mix: number): void {
    if (mix <= 0) return;
    for (const f of fog) this.atmo.paint(f, stage3FogTint(Number(f.tint), mix), f.alpha);
  }

  /** 前フレームに掛けた色を戻す(フレームの頭)。 */
  restoreAtmosphere(): void {
    this.atmo.restore();
  }

  /**
   * 光の筋・光の当たりの山・塵。w×h=画面(uiLayer の座標)。camDx/camDy=このフレームのカメラの動き(画面 px)=塵は世界に留まる。
   * show=筋を出してよいか(従来の筋が隠れる場面では一緒に隠す)。
   */
  syncShafts(w: number, h: number, now: number, mix: number, camDx: number, camDy: number, show: boolean): void {
    const k = easeInOutSine(mix);
    const on = k > 0 && show;
    if (this.shaftRoot.visible !== on) this.shaftRoot.visible = on;
    const dt = this.lastNow > 0 ? Math.min(50, Math.max(0, now - this.lastNow)) : 16;
    this.lastNow = now;
    if (!on) return;
    const short = Math.min(w, h);
    this.mass.position.set(w * S3D_LIGHT_MASS.x, h * S3D_LIGHT_MASS.y);
    this.mass.width = this.mass.height = short * S3D_LIGHT_MASS.size;
    this.mass.alpha = S3D_LIGHT_MASS.alpha * k;
    this.shafts = layoutSunShafts(w, h, now);
    while (this.shaftSprites.length < this.shafts.length) {
      const sp = new Sprite(getMoonShaftTexture(0));
      sp.anchor.set(0.5, 0);
      sp.blendMode = 'add';
      sp.eventMode = 'none';
      sp.tint = S3D_SHAFT_COLOR;
      this.shaftRoot.addChildAt(sp, 1 + this.shaftSprites.length); // 光の当たりの山の上・塵より下
      this.shaftSprites.push(sp);
    }
    for (let i = 0; i < this.shaftSprites.length; i++) {
      const sp = this.shaftSprites[i];
      const sh = this.shafts[i];
      if (!sh) { sp.visible = false; continue; }
      sp.texture = getMoonShaftTexture(sh.tex);
      sp.visible = true;
      sp.position.set(sh.x, sh.y);
      sp.rotation = -Math.atan2(sh.dx, sh.dy); // 絵の下向き(0,1)を筋の向き(dx,dy)へ
      sp.width = sh.w;
      sp.height = Math.hypot(sh.dx, sh.dy);
      sp.scale.x = (sh.flip ? -1 : 1) * Math.abs(sp.scale.x);
      sp.alpha = Math.min(1, S3D_SHAFT_ALPHA * sh.a * MOON_SHAFT_GAIN * k);
    }
    this.syncDust(w, h, dt, now, k, camDx, camDy);
  }

  private syncDust(w: number, h: number, dt: number, now: number, k: number, camDx: number, camDy: number): void {
    const m = 40;
    const place = (d: Dust) => {
      let bx = Math.random() * w, by = Math.random() * h, best = -1;
      for (let t = 0; t < 4; t++) {
        const x = -m + Math.random() * (w + 2 * m), y = -m + Math.random() * (h + 2 * m);
        const l = moonShaftLightAt(x, y, this.shafts);
        if (l > best) { best = l; bx = x; by = y; }
      }
      d.x = bx; d.y = by; d.vx = 0; d.vy = 0;
    };
    if (!this.dust.length || w !== this.dustW || h !== this.dustH) {
      this.dustW = w; this.dustH = h;
      while (this.dust.length < S3D_DUST_COUNT) {
        const sp = new Sprite(getSoftGlowTexture());
        sp.anchor.set(0.5);
        sp.blendMode = 'add';
        sp.eventMode = 'none';
        sp.tint = S3D_DUST_TINT;
        this.shaftRoot.addChild(sp);
        this.dust.push({ sp, x: 0, y: 0, vx: 0, vy: 0, seed: Math.random(), speed: S3D_DUST_SPEED_MIN + Math.random() * (S3D_DUST_SPEED_MAX - S3D_DUST_SPEED_MIN) });
      }
      for (const d of this.dust) place(d);
    }
    const sec = dt / 1000;
    const steer = Math.min(1, sec * 0.5);
    for (const d of this.dust) {
      const hd = moonDustHeading(now, d.seed);
      d.vx += (Math.cos(hd) * d.speed - d.vx) * steer;
      d.vy += (Math.sin(hd) * d.speed * 0.6 - d.vy) * steer;
      d.x += d.vx * sec + camDx;
      d.y += d.vy * sec + camDy;
      if (d.x < -m || d.x > w + m || d.y < -m || d.y > h + m) place(d);
      const lit = Math.min(1, moonShaftLightAt(d.x, d.y, this.shafts) * S3D_DUST_LIT_GAIN);
      const a = S3D_DUST_ALPHA * lit * moonDustTwinkle(now, d.seed) * k;
      d.sp.visible = a > 0.01;
      if (!d.sp.visible) continue;
      d.sp.position.set(d.x, d.y);
      d.sp.alpha = Math.min(1, a);
      d.sp.width = d.sp.height = S3D_DUST_PX * (0.7 + 0.6 * d.seed);
    }
  }

  /** 太陽のまぶしさ(画面の上端の外の太陽・にじみの縁だけが画面に入る・明るさは一定)。 */
  syncGlare(w: number, h: number, mix: number): void {
    const k = easeInOutSine(mix);
    const on = k > 0;
    if (this.glareRoot.visible !== on) this.glareRoot.visible = on;
    if (!on) return;
    const { x: sx, y: sy } = sunPos(w, h);
    const short = Math.min(w, h);
    this.halo.position.set(sx, sy);
    this.halo.width = this.halo.height = short * S3D_GLARE_HALO_SIZE;
    this.halo.alpha = S3D_GLARE_HALO_ALPHA * k;
    this.core.position.set(sx, sy);
    this.core.width = this.core.height = short * S3D_GLARE_CORE_SIZE;
    this.core.alpha = S3D_GLARE_CORE_ALPHA * k;
  }

  /**
   * 木漏れ日の縁の帯(手前=画面の下の縁・奥=地平の際)。雲の影が出ていない時(屋内・洋館など)は出さない。
   * 横は地面と一緒に動き(camX)、縦は画面の縁に付く(手前の茂み・遠景の建物は画面に付いている)。揺れは突風の時だけ。
   */
  syncBands(worldGroup: Container, cloudShadow: TilingSprite, screenH: number, camX: number, now: number, mix: number): void {
    const k = easeInOutSine(mix);
    const on = k > 0 && cloudShadow.visible;
    for (const b of this.bands) if (b.visible !== on) b.visible = on;
    if (!on) return;
    this.pt.set(0, screenH);
    worldGroup.toLocal(this.pt, undefined, this.pt);
    const bottomY = this.pt.y;
    const topY = cloudShadow.position.y;
    const span = Math.max(1, bottomY - topY);
    const x = cloudShadow.position.x, w = cloudShadow.width;
    const sw = dappleSway(now);
    for (let i = 0; i < 4; i++) {
      const b = this.bands[i];
      const near = i < 2, second = i % 2 === 1;
      const bh = span * (near ? S3D_BAND_NEAR_H : S3D_BAND_FAR_H);
      const sc = second ? S3D_BAND_SCALE_2 : 1;
      const full = bh * sc; // 絵1枚ぶんの高さ
      // 上下の端は絵の 3% 内側までにする=繰り返しの継ぎ目(反対の端の行)を拾って横一文字の線が出ない。
      b.position.set(x, near ? bottomY - full * 0.97 : topY);
      b.width = w;
      b.height = full * 0.94;
      const ty = full / S3D_BAND_TEX_H;
      b.tileScale.set(ty * (near ? 1.6 : 1.2), ty);
      const pw = S3D_BAND_TEX_W * b.tileScale.x;
      const shift = second ? S3D_BAND_SHIFT_2 * pw : 0;
      b.tilePosition.set(((sw.x * (second ? -0.7 : 1) - camX + shift) % pw), -full * 0.03);
      b.alpha = (second ? S3D_BAND_ALPHA_2 : S3D_BAND_ALPHA) * k;
    }
  }

  /** 木の足元の梢の影(地面の層・乗算・使い回し)。点く/消える時は慣性で寄せる。揺れは突風の時だけ。 */
  syncCanopies(world: Container, worldGroup: Container, trees: readonly S3DTreeView[], mix: number, now: number): void {
    const k = easeInOutSine(mix);
    this.canopyRoot.visible = k > 0;
    if (k > 0) {
      this.pt.set(0, 0);
      world.toGlobal(this.pt, this.pt);
      worldGroup.toLocal(this.pt, undefined, this.pt);
      this.canopyRoot.position.copyFrom(this.pt);
      const ga = worldGroup.worldTransform.a || 1;
      this.canopyRoot.scale.set(world.worldTransform.a / ga, world.worldTransform.d / (worldGroup.worldTransform.d || 1));
    }
    for (const c of this.canopies) c.seen = false;
    if (k > 0) {
      for (const t of trees) {
        if (t.alpha < 0.05) continue;
        let c = this.canopies.find(q => q.id === t.id);
        if (!c) {
          c = this.canopies.find(q => !q.seen && q.a <= 0.004 && !trees.some(x => x.id === q.id));
          if (!c) {
            if (this.canopies.length >= S3D_CANOPY_MAX) continue;
            const sp = new Sprite(getCanopyTexture(0));
            sp.anchor.set(0.5);
            sp.blendMode = 'multiply';
            sp.eventMode = 'none';
            this.canopyRoot.addChild(sp);
            c = { id: t.id, sp, a: 0, seen: false };
            this.canopies.push(c);
          }
          c.id = t.id; c.a = 0;
        }
        c.seen = true;
        c.a += (t.alpha - c.a) * 0.12;
        const seed = hash01(t.x * 0.013 + t.y * 0.007, 0.5);
        const sw = dappleSway(now, seed);
        const sp = c.sp;
        sp.texture = getCanopyTexture(Math.floor(seed * 3) % 3);
        sp.visible = c.a > 0.004;
        sp.position.set(t.x + t.w * S3D_CANOPY.dx + sw.x, t.y + t.h * S3D_CANOPY.dy + sw.y);
        sp.rotation = S3D_CANOPY.rot + (seed - 0.5) * 0.5;
        sp.width = t.w * S3D_CANOPY.w * (0.9 + 0.2 * seed);
        sp.height = t.w * S3D_CANOPY.h * (0.9 + 0.2 * (1 - seed));
        sp.alpha = S3D_CANOPY.alpha * c.a * k;
      }
    }
    for (const c of this.canopies) {
      if (c.seen) continue;
      c.a *= 0.88;
      if (c.a <= 0.004) { c.a = 0; c.sp.visible = false; continue; }
      c.sp.alpha = S3D_CANOPY.alpha * c.a * k;
    }
  }

  /** 地平の帯の暖かいかすみ(左=太陽の側で強く、右で弱い)。地平線(雲の影の上端)を真ん中に。 */
  syncHaze(cloudShadow: TilingSprite, screenH: number, worldScaleY: number, mix: number): void {
    const k = easeInOutSine(mix);
    const on = k > 0 && cloudShadow.visible;
    if (this.haze.visible !== on) this.haze.visible = on;
    if (!on) return;
    const hh = (screenH * S3D_HAZE_H) / Math.max(0.05, worldScaleY);
    this.haze.position.set(cloudShadow.position.x, cloudShadow.position.y - hh / 2);
    this.haze.width = cloudShadow.width;
    this.haze.height = hh;
    this.haze.alpha = S3D_HAZE_ALPHA * k;
  }

  destroy(): void {
    this.restoreAtmosphere();
    this.sky.destroy();
    this.shaftRoot.destroy({ children: true });
    this.glareRoot.destroy({ children: true });
    for (const b of this.bands) b.destroy();
    this.canopyRoot.destroy({ children: true });
    this.haze.destroy();
    this.gradeFilter.destroy();
  }
}
