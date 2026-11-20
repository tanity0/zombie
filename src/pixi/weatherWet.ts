// ステージの天候「雨上がり」の描画(research/WEATHER_WET.md §2・`?weather=wet` でステージ1の時だけ)。
//
// ★描くだけ。配置は world/weatherPuddles.ts(決まった乱数の純関数)、動きの曲線は utils/weatherWet.ts。
//   ゲームの状態には1バイトも書かない(敵・地形・当たり判定は変えない=「ではない」条件)。
//
// 何をしているか:
//   1. 色調整 … 世界の層(worldGroup)に色行列1枚(`gradeFilter`)。彩度を少し落とし、青く冷たく、暗部を少し持ち上げる。
//   2. 水たまり … 帯2の水たまり(縁つき)を地面の層の一番下へ。帯1の「水面だけ」の対を内側へ重ねて水の層にする。
//      帯2の小物を周りへ少し。
//   3. 映り込み … 空の色(水面の加算)・近くの松明の光だまりのにじみ(既存の映り込み=光だまりの色と強さをそのまま読む)。
//      プレイヤーの近くの水たまりにだけ、キャラの逆さの薄い映り・光の筋・水面を渡る細い光の線を、
//      水面(帯1)の形で切って描く(切り抜きは同時に最大 MAX_SLOTS 枚)。
//   4. 雫と波紋 … 木の下でときどき雫→波紋。水たまりを踏んだら波紋。どちらも使い回しの粒(上限つき)。
//   4b. ポツポツ雨 … 細く短い線をまばらに斜めに落とす(少し加速)。着いた所が水たまりなら水の波紋・地面なら小さな跳ね
//      (4 の波紋の粒をそのまま使う)。線はアクターの上・被写界深度の外の層(danceUiLayer)・粒は上限 RAIN_MAX。
//   5./6. 霧を少し薄く冷たく・空(遠景)を少し明るく … 毎フレームの最後に色を掛け、次のフレームの頭で戻す
//      (pixiScene の applyForestPreview / applyWraithDarkness と同じ型=他の色の書き込みとぶつからない)。
// 影を落とす光は1つも足さない(このプロジェクトで高いのは投影影を落とす光だけ=CLAUDE.md の実測)。

import { ColorMatrixFilter, Container, Point, Sprite, Texture, type Filter, type TilingSprite } from 'pixi.js';
import { getTexture } from './pixiTextures';
import { getSoftGlowTexture } from './lighting';
import {
  puddlesInRegion, puddleAt, isInPuddle, PUDDLE_ART_SCALE, DEBRIS_ART_SCALE, PUDDLE_CELL, type Puddle,
} from '../world/weatherPuddles';
import {
  ripplePose, dripHeight, glintPose, DRIP_FALL_MS, GLINT_MS,
  rainDropSpec, rainPose, rainNextGapMs, RAIN_MAX, RAIN_SPAWN_PER_FRAME, type RainDropSpec,
} from '../utils/weatherWet';

// ---- 叩き台の値(設計書 §0-1「数値は叩き台」) ----
/** 水面(帯1)を縁つきの水たまり(帯2)の内側へ合わせる縮み(帯1は縁まで含む大きさで描かれているため)。 */
const WATER_FIT_X = 0.8;
const WATER_FIT_Y = 0.72;
/** 水面の色(乗算)と濃さ。空を映した冷たい色。 */
const WATER_TINT = 0x9fb6d4;
const WATER_ALPHA = 0.9;
/** 水面と、その上に重ねる映り(空・松明のにじみ・キャラの逆さの映り・光の筋・光の線)の濃さの一律の掛け率。
 *  社長指示2026-11-20「少し薄く」=70%(地面に沈める。縁つきの水たまりの絵と小物はそのまま)。 */
const WATER_FADE = 0.7;
/** 空の映り(水面の形の加算)。光が無い所でもうっすら空が映る。 */
const SKY_TINT = 0x34507a;
const SKY_ALPHA = 0.16;
/** 松明の光だまりが水たまりへにじむ距離(world px)と強さ。 */
const LIGHT_REACH = 300;
const LIGHT_GAIN = 0.75;
/** キャラの逆さの映り。 */
const REFL_TINT = 0xa4bad6;
const REFL_ALPHA = 0.55;
const REFL_PER_SLOT = 3;
/** 小物の色(地面の色に寄せて沈める)。 */
const DEBRIS_DIM = { r: 0.62, g: 0.64, b: 0.7 };
/** 切り抜き(映り・光の筋・光の線)を同時に描く水たまりの上限。 */
const MAX_SLOTS = 5;
/** 光の線: 何msおきに1本(乱数で幅を持たせる)。同時に2本まで。 */
const GLINT_EVERY_MS = 2200;
const GLINT_MAX = 2;
/** 波紋の上限(使い回し)。ポツポツ雨の着地ぶんを足して 24→40。 */
const RIPPLE_MAX = 40;
/** 雨粒の色(冷たい白)・太さ(world px・遠近前)。 */
const RAIN_TINT = 0xd8e4f6;
const RAIN_WIDTH = 1.1;
/** 雫: 何msおきに1粒(画面内の木から)。同時に最大8粒。 */
const DRIP_EVERY_MS = 420;
const DRIP_MAX = 8;
/** 踏んだ時の波紋: 同じキャラは最短この間隔・この距離を歩くごと。 */
const STEP_RIPPLE_MS = 260;
const STEP_RIPPLE_DIST = 14;
/** 霧の薄さ(α倍率)と冷たさ(色の乗算)。 */
const FOG_ALPHA_MUL = 0.68;
const FOG_COOL = { r: 0.84, g: 0.94, b: 1 };
/** 近景の森の冷たさ(世界の色行列が掛からない層なので、色だけ合わせる)。 */
const FRONT_COOL = { r: 0.86, g: 0.93, b: 1 };
/** 月の光・暈を少し強く(雲が切れて空が澄んだ)。 */
const MOON_GLOW_MUL = 1.3;
const MOON_HALO_MUL = 1.45;

/** 世界の色行列(彩度を少し落とす→青く冷たく→暗部を持ち上げる)。値は 0..1 の単位。 */
const buildGradeMatrix = (): number[] => {
  const keep = 0.82; // 彩度の残り
  const lr = 0.299 * (1 - keep), lg = 0.587 * (1 - keep), lb = 0.114 * (1 - keep);
  const desat = [
    [lr + keep, lg, lb],
    [lr, lg + keep, lb],
    [lr, lg, lb + keep],
  ];
  const gain = [0.93, 0.985, 1.07];   // 青く冷たく
  const lift = [0.028, 0.034, 0.05]; // 暗部を少し持ち上げる(青寄り)
  const m: number[] = [];
  for (let c = 0; c < 3; c++) {
    const k = gain[c] * (1 - lift[c]);
    m.push(desat[c][0] * k, desat[c][1] * k, desat[c][2] * k, 0, lift[c]);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
};

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
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** 雨粒の線の絵(1回だけ焼く・素材ファイルではない): 尾(上)は透明→先(下)ほど濃い。左右の縁は薄く(細い線がギザつかない)。 */
let rainTex: Texture | null = null;
const getRainStreakTexture = (): Texture => {
  if (rainTex) return rainTex;
  const w = 4, hgt = 48;
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < w; x++) {
    const edge = x === 0 || x === w - 1 ? 0.35 : 1;
    const g = ctx.createLinearGradient(0, 0, 0, hgt);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, `rgba(255,255,255,${0.45 * edge})`);
    g.addColorStop(0.8, `rgba(255,255,255,${0.9 * edge})`);
    g.addColorStop(1, `rgba(255,255,255,${edge})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1, hgt);
  }
  rainTex = Texture.from(c);
  return rainTex;
};

export interface WetActor {
  id: string;
  sprite: Sprite;
}
export interface WetLight {
  x: number;
  y: number;
  color: number;
  /** 0..1 */
  strength: number;
}
export interface WetTree {
  footX: number;
  footY: number;
  scale: number;
}
export interface WetHost {
  /** 演出の時計(ms・Date.now 系)。 */
  now: number;
  /** 地面に置く物の色(夜=暗く・花や木と同じ envTint)。 */
  envTint: number;
  view: { left: number; top: number; right: number; bottom: number };
  /** 実際に画面に映っている世界の矩形(ズーム込み・余白なし)。雨粒の着地点はこの中から選ぶ(無ければ view)。 */
  rainView?: { left: number; top: number; right: number; bottom: number };
  world: Container;
  depthScale: (y: number) => number;
  horizonAlpha: (y: number) => number;
  actors: readonly WetActor[];
  lights: readonly WetLight[];
  trees: readonly WetTree[];
  bases: readonly { x: number; y: number; r: number }[];
  focusX: number;
  focusY: number;
}
export interface WetAtmosphere {
  fog: readonly (Sprite | TilingSprite)[];
  front: readonly (Sprite | TilingSprite | null)[];
  moonGlow: readonly Sprite[];
  moonHalo: readonly Sprite[];
  farGroup: Container | null;
}

interface PuddleView {
  p: Puddle;
  ground: Sprite;
  water: Sprite;
  sky: Sprite;
  debris: Sprite[];
  /** このフレームの見た目の倍率(遠近込み)。 */
  d: number;
  alpha: number;
  lightA: number; // 平滑したにじみの強さ
  lightColor: number;
  lightX: number;
}
interface Slot {
  root: Container;
  mask: Sprite;
  refl: Sprite[];
  streak: Sprite;
  glint: Sprite;
  /** 前フレームに受け持った水たまり(映りの濃さを慣性で寄せるため)。 */
  pid: string | null;
  reflA: number[];
}
interface ActorBox { id: string; sp: Sprite; x: number; foot: number; w: number; h: number; flip: boolean }
interface Ripple { sp: Sprite; at: number; x: number; y: number; water: boolean; s: number; on: boolean }
interface Drip { sp: Sprite; at: number; x: number; y: number; s: number; on: boolean }
interface Glint { pid: string; at: number; dir: 1 | -1 }
interface RainDrop { sp: Sprite; at: number; x: number; y: number; spec: RainDropSpec; on: boolean }

export class WeatherWetLayer {
  readonly gradeFilter: ColorMatrixFilter;
  private skyFilter: ColorMatrixFilter;
  private root = new Container();
  private puddleLayer = new Container();
  private slotLayer = new Container();
  private debrisLayer = new Container();
  private rippleLayer = new Container();
  private dripLayer = new Container();
  /** 雨粒の線(アクターの上・被写界深度の外の層へ置く=キャラの手前も降る)。 */
  private rainLayer = new Container();
  private rain: RainDrop[] = [];
  private nextRainAt = 0;
  private views = new Map<string, PuddleView>();
  private slots: Slot[] = [];
  private ripples: Ripple[] = [];
  private drips: Drip[] = [];
  private glints: Glint[] = [];
  private nextGlintAt = 0;
  private nextDripAt = 0;
  private steps = new Map<string, { pid: string | null; x: number; y: number; at: number }>();
  private cacheKey = '';
  private cached: Puddle[] = [];
  private originals = new Map<Sprite | TilingSprite, { tint: number; alpha: number }>();
  private farGroupWithFilter: Container | null = null;
  private pA = new Point();
  private pB = new Point();
  private visible = true;

  constructor(groundLayer: Container, overLayer?: Container) {
    this.root.eventMode = 'none';
    this.rainLayer.eventMode = 'none';
    this.rainLayer.label = 'weatherWetRain';
    (overLayer ?? this.root).addChild(this.rainLayer);
    this.root.label = 'weatherWet';
    this.root.addChild(this.puddleLayer, this.slotLayer, this.debrisLayer, this.rippleLayer, this.dripLayer);
    // 地面の層の一番下(足元の影・光だまりより下)。
    groundLayer.addChildAt(this.root, 0);
    this.gradeFilter = new ColorMatrixFilter();
    this.gradeFilter.matrix = buildGradeMatrix() as unknown as typeof this.gradeFilter.matrix;
    // 空(遠景)は少し明るく・わずかに冷たく(雲が切れて澄んだ空)。
    this.skyFilter = new ColorMatrixFilter();
    this.skyFilter.matrix = [
      1.06, 0, 0, 0, 0.012,
      0, 1.1, 0, 0, 0.02,
      0, 0, 1.16, 0, 0.034,
      0, 0, 0, 1, 0,
    ] as unknown as typeof this.skyFilter.matrix;
    for (let i = 0; i < MAX_SLOTS; i++) this.slots.push(this.makeSlot());
  }

  private makeSlot(): Slot {
    const root = new Container();
    root.eventMode = 'none';
    const mask = new Sprite(Texture.EMPTY);
    mask.anchor.set(0.5);
    const refl: Sprite[] = [];
    for (let i = 0; i < REFL_PER_SLOT; i++) {
      const r = new Sprite(Texture.EMPTY);
      r.anchor.set(0.5, 1);
      r.tint = REFL_TINT;
      r.visible = false;
      refl.push(r);
    }
    const streak = new Sprite(getSoftGlowTexture());
    streak.anchor.set(0.5);
    streak.blendMode = 'add';
    streak.visible = false;
    const glint = new Sprite(Texture.WHITE);
    glint.anchor.set(0.5);
    glint.blendMode = 'add';
    glint.tint = 0xe8f2ff;
    glint.visible = false;
    root.addChild(...refl, streak, glint, mask); // 型は切り抜く側の子(兄弟に置くと描かれない・pixiScene の crawlerFlash と同じ)
    root.mask = mask;
    root.visible = false;
    this.slotLayer.addChild(root);
    return { root, mask, refl, streak, glint, pid: null, reflA: refl.map(() => 0) };
  }

  setVisible(on: boolean): void {
    if (this.visible === on) return;
    this.visible = on;
    this.root.visible = on;
    this.rainLayer.visible = on;
    if (!on) this.detachSky();
  }

  // ---- 水たまりの一覧(区画が変わった時だけ作り直す=毎フレーム木を走査しない) ----
  private puddlesFor(h: WetHost): Puddle[] {
    const m = PUDDLE_CELL * 0.5;
    const cx0 = Math.floor((h.view.left - m) / PUDDLE_CELL), cx1 = Math.floor((h.view.right + m) / PUDDLE_CELL);
    const cy0 = Math.floor((h.view.top - m) / PUDDLE_CELL), cy1 = Math.floor((h.view.bottom + m) / PUDDLE_CELL);
    const key = `${cx0},${cy0},${cx1},${cy1}|${h.bases.map(b => `${Math.round(b.x)},${Math.round(b.y)}`).join(';')}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.cached = puddlesInRegion(cx0 * PUDDLE_CELL, cy0 * PUDDLE_CELL, (cx1 + 1) * PUDDLE_CELL - 1, (cy1 + 1) * PUDDLE_CELL - 1, { bases: h.bases });
    }
    return this.cached;
  }

  sync(h: WetHost): void {
    if (!this.visible) return;
    const puddles = this.puddlesFor(h);
    const seen = new Set<string>();
    const v = h.view;
    for (const p of puddles) {
      if (p.x + p.rx < v.left - 40 || p.x - p.rx > v.right + 40 || p.y + p.ry < v.top - 40 || p.y - p.ry > v.bottom + 40) continue;
      const ha = h.horizonAlpha(p.y);
      if (ha <= 0.001) continue;
      const pv = this.viewFor(p);
      if (!pv) continue;
      seen.add(p.id);
      this.placePuddle(pv, h, ha);
    }
    for (const [id, pv] of this.views) {
      if (seen.has(id)) continue;
      pv.ground.destroy(); pv.water.destroy(); pv.sky.destroy();
      for (const d of pv.debris) d.destroy();
      this.views.delete(id);
    }
    const boxes: ActorBox[] = [];
    for (const a of h.actors) {
      const bx = this.actorBox(a, h.world);
      if (!bx) continue;
      if (bx.x < v.left - 100 || bx.x > v.right + 100 || bx.foot < v.top - 100 || bx.foot > v.bottom + 200) continue;
      boxes.push(bx);
    }
    this.syncSlots(h, boxes);
    this.syncSteps(h, boxes);
    this.syncDrips(h);
    this.syncRain(h);
    this.syncRipples(h);
  }

  private viewFor(p: Puddle): PuddleView | null {
    const hit = this.views.get(p.id);
    if (hit) return hit;
    const gTex = getTexture(`weather/${p.variant}`);
    const wTex = getTexture(`weather/${p.variant}-water`);
    const debrisTex = p.debris.map(d => getTexture(`weather/${d.variant}`));
    if (!gTex || !wTex || debrisTex.some(t => !t)) return null; // 届くまでは出さない(網が取りに行っている)
    const ground = new Sprite(gTex);
    ground.anchor.set(0.5);
    const water = new Sprite(wTex);
    water.anchor.set(0.5);
    const sky = new Sprite(wTex);
    sky.anchor.set(0.5);
    sky.blendMode = 'add';
    sky.tint = SKY_TINT;
    this.puddleLayer.addChild(ground, water, sky);
    const debris: Sprite[] = [];
    for (const t of debrisTex) {
      const sp = new Sprite(t!);
      sp.anchor.set(0.5, 1);
      this.debrisLayer.addChild(sp);
      debris.push(sp);
    }
    const pv: PuddleView = { p, ground, water, sky, debris, d: 1, alpha: 1, lightA: 0, lightColor: SKY_TINT, lightX: p.x };
    this.views.set(p.id, pv);
    return pv;
  }

  private placePuddle(pv: PuddleView, h: WetHost, ha: number): void {
    const p = pv.p;
    const d = h.depthScale(p.y);
    pv.d = d;
    pv.alpha = ha;
    const s = PUDDLE_ART_SCALE * p.scale * d;
    const fx = p.flip ? -1 : 1;
    pv.ground.position.set(p.x, p.y);
    pv.ground.scale.set(s * fx, s);
    pv.ground.alpha = ha;
    pv.ground.tint = h.envTint;
    // 水面(帯1)は縁の内側へ。帯1は縁まで含む大きさで描かれているので、縮めて中心を揃える。
    const gw = pv.ground.texture.width, gh = pv.ground.texture.height;
    const ww = pv.water.texture.width || 1, wh = pv.water.texture.height || 1;
    const wsx = (gw * WATER_FIT_X * s) / ww, wsy = (gh * WATER_FIT_Y * s) / wh;
    for (const sp of [pv.water, pv.sky]) {
      sp.position.set(p.x, p.y - gh * s * 0.02);
      sp.scale.set(wsx * fx, wsy);
    }
    pv.water.alpha = WATER_ALPHA * WATER_FADE * ha;
    pv.water.tint = mulTint(WATER_TINT, { r: ((h.envTint >> 16) & 255) / 255, g: ((h.envTint >> 8) & 255) / 255, b: (h.envTint & 255) / 255 });
    // 近くの光だまり(松明)のにじみ。強さと色を慣性で寄せる(灯の揺らぎで水面がチラつかない)。
    let best = 0, bestColor = SKY_TINT, bestX = p.x, sum = 0;
    for (const l of h.lights) {
      const dist = Math.hypot(l.x - p.x, (l.y - p.y) * 1.4);
      if (dist >= LIGHT_REACH) continue;
      const k = (1 - dist / LIGHT_REACH) ** 2 * l.strength;
      sum += k;
      if (k > best) { best = k; bestColor = l.color; bestX = l.x; }
    }
    const target = Math.min(1, sum * LIGHT_GAIN);
    pv.lightA += (target - pv.lightA) * 0.12;
    pv.lightColor = best > 0 ? bestColor : pv.lightColor;
    pv.lightX = bestX;
    pv.sky.tint = lerpTint(SKY_TINT, pv.lightColor, Math.min(1, pv.lightA * 1.4));
    pv.sky.alpha = (SKY_ALPHA + pv.lightA * 0.55) * WATER_FADE * ha;
    for (let i = 0; i < pv.debris.length; i++) {
      const dd = p.debris[i];
      const sp = pv.debris[i];
      if (!dd || !sp) continue;
      const ds = h.depthScale(dd.y);
      sp.position.set(dd.x, dd.y);
      sp.scale.set(DEBRIS_ART_SCALE * ds * (dd.flip ? -1 : 1), DEBRIS_ART_SCALE * ds);
      sp.alpha = h.horizonAlpha(dd.y);
      sp.tint = mulTint(h.envTint, DEBRIS_DIM); // 小物は地面に沈める(白い小石が光って浮かない)
    }
  }

  // ---- 切り抜き(映り・光の筋・光の線) ----
  private actorBox(a: WetActor, world: Container): ActorBox | null {
    const sp = a.sprite;
    if (sp.destroyed || !sp.visible || sp.alpha <= 0.02 || !sp.texture || sp.texture.width <= 1) return null;
    let c: Container | null = sp;
    while (c) { if (!c.visible) return null; c = c.parent; }
    const b = sp.getBounds();
    if (b.width <= 0 || b.height <= 0) return null;
    this.pA.set(b.minX, b.minY);
    this.pB.set(b.maxX, b.maxY);
    world.toLocal(this.pA, undefined, this.pA);
    world.toLocal(this.pB, undefined, this.pB);
    return { id: a.id, sp, x: (this.pA.x + this.pB.x) / 2, foot: this.pB.y, w: this.pB.x - this.pA.x, h: this.pB.y - this.pA.y, flip: sp.worldTransform.a < 0 };
  }

  private syncSlots(h: WetHost, boxes: readonly ActorBox[]): void {
    const now = h.now;
    // 光の線: ときどき、画面内の大きめの水たまりへ1本。
    this.glints = this.glints.filter(g => now - g.at < GLINT_MS && this.views.has(g.pid));
    if (now >= this.nextGlintAt && this.glints.length < GLINT_MAX) {
      const cand = [...this.views.values()].filter(pv => pv.p.rx > 30 && pv.alpha > 0.5
        && pv.p.x > h.view.left && pv.p.x < h.view.right && pv.p.y > h.view.top && pv.p.y < h.view.bottom
        && !this.glints.some(g => g.pid === pv.p.id));
      if (cand.length) this.glints.push({ pid: cand[Math.floor(Math.random() * cand.length)].p.id, at: now, dir: Math.random() < 0.5 ? 1 : -1 });
      this.nextGlintAt = now + GLINT_EVERY_MS * rand(0.6, 1.6);
    }
    // 切り抜きを受け持つ水たまりを選ぶ: キャラが映る所(注目点に近い順)→光の線→光の強い所。
    type Pick = { pv: PuddleView; acts: ActorBox[]; glint: Glint | null };
    const picks: Pick[] = [];
    const reflectors: Pick[] = [];
    for (const pv of this.views.values()) {
      const p = pv.p;
      const rx = p.rx * pv.d, ry = p.ry * pv.d;
      const acts = boxes.filter(b => Math.abs(b.x - p.x) < rx + b.w * 0.5
        && b.foot > p.y - ry - b.h * 0.8 && b.foot < p.y + ry * 0.6);
      if (acts.length) reflectors.push({ pv, acts, glint: null });
    }
    reflectors.sort((a, b) => Math.hypot(a.pv.p.x - h.focusX, a.pv.p.y - h.focusY) - Math.hypot(b.pv.p.x - h.focusX, b.pv.p.y - h.focusY));
    for (const r of reflectors) { if (picks.length < MAX_SLOTS) picks.push(r); }
    for (const g of this.glints) {
      const hit = picks.find(pk => pk.pv.p.id === g.pid);
      if (hit) { hit.glint = g; continue; }
      const pv = this.views.get(g.pid);
      if (pv && picks.length < MAX_SLOTS) picks.push({ pv, acts: [], glint: g });
    }
    const lit = [...this.views.values()].filter(pv => pv.lightA > 0.18 && !picks.some(pk => pk.pv === pv))
      .sort((a, b) => b.lightA - a.lightA);
    for (const pv of lit) { if (picks.length < MAX_SLOTS) picks.push({ pv, acts: [], glint: null }); }

    // 同じ水たまりは同じ枠へ(映りの濃さの慣性が途切れない)。
    const free = this.slots.filter(sl => !picks.some(pk => pk.pv.p.id === sl.pid));
    const assigned = new Map<Slot, Pick>();
    for (const pk of picks) {
      const same = this.slots.find(sl => sl.pid === pk.pv.p.id);
      if (same) assigned.set(same, pk);
    }
    for (const pk of picks) {
      if ([...assigned.values()].includes(pk)) continue;
      const sl = free.shift();
      if (!sl) break;
      sl.reflA.fill(0);
      assigned.set(sl, pk);
    }
    for (const sl of this.slots) {
      const pk = assigned.get(sl);
      if (!pk) { sl.root.visible = false; sl.pid = null; sl.reflA.fill(0); continue; }
      sl.pid = pk.pv.p.id;
      this.drawSlot(sl, pk.pv, pk.acts, pk.glint, now);
    }
  }

  private drawSlot(
    sl: Slot, pv: PuddleView,
    acts: readonly ActorBox[],
    glint: Glint | null, now: number,
  ): void {
    const p = pv.p;
    sl.root.visible = true;
    sl.mask.texture = pv.water.texture;
    sl.mask.position.copyFrom(pv.water.position);
    sl.mask.scale.copyFrom(pv.water.scale);
    const rx = p.rx * pv.d, ry = p.ry * pv.d;
    // 逆さの映り(足元から下へ・薄く冷たく)。濃さは慣性で寄せる(入る・出るがパッと切り替わらない)。
    for (let i = 0; i < sl.refl.length; i++) {
      const r = sl.refl[i];
      const a = acts[i];
      const target = a ? REFL_ALPHA * WATER_FADE * pv.alpha : 0;
      sl.reflA[i] += (target - sl.reflA[i]) * 0.18;
      if (!a) { r.visible = sl.reflA[i] > 0.01; r.alpha = sl.reflA[i]; continue; }
      const tex = a.sp.texture;
      r.texture = tex;
      const tw = tex.width || 1, th = tex.height || 1;
      r.position.set(a.x, a.foot);
      r.scale.set((a.w / tw) * (a.flip ? -1 : 1), -(a.h / th) * 0.85);
      r.visible = true;
      r.alpha = sl.reflA[i];
    }
    // 光の筋(松明の光が水面に縦に伸びる)。
    if (pv.lightA > 0.05) {
      const k = Math.min(1, pv.lightA);
      sl.streak.visible = true;
      sl.streak.tint = pv.lightColor;
      sl.streak.position.set(Math.max(p.x - rx * 0.6, Math.min(p.x + rx * 0.6, pv.lightX)), p.y);
      sl.streak.width = Math.max(8, rx * 0.32);
      sl.streak.height = ry * 2.4;
      sl.streak.alpha = 0.55 * WATER_FADE * k * pv.alpha * (0.9 + 0.1 * Math.sin(now / 340 + p.x));
    } else sl.streak.visible = false;
    // 光の線(水面の端から端へ、加速して減速しながらゆっくり渡る)。
    const gp = glint ? glintPose(now - glint.at) : null;
    if (glint && gp) {
      sl.glint.visible = true;
      sl.glint.position.set(p.x + gp.pos * rx * 1.15 * glint.dir, p.y);
      sl.glint.rotation = -0.5 * glint.dir;
      sl.glint.width = Math.max(2, 2.2 * pv.d);
      sl.glint.height = ry * 3.2;
      sl.glint.alpha = 0.6 * WATER_FADE * gp.alpha * pv.alpha;
    } else sl.glint.visible = false;
  }

  // ---- 波紋 ----
  private spawnRipple(x: number, y: number, water: boolean, s: number, now: number): void {
    let r = this.ripples.find(q => !q.on);
    if (!r) {
      if (this.ripples.length >= RIPPLE_MAX) {
        r = this.ripples.reduce((o, q) => (q.at < o.at ? q : o)); // 一番古いものを使い回す
      } else {
        const sp = new Sprite(Texture.EMPTY);
        sp.anchor.set(0.5);
        this.rippleLayer.addChild(sp);
        r = { sp, at: 0, x: 0, y: 0, water: true, s: 1, on: false };
        this.ripples.push(r);
      }
    }
    r.at = now; r.x = x; r.y = y; r.water = water; r.s = s; r.on = true;
  }

  private syncRipples(h: WetHost): void {
    for (const r of this.ripples) {
      if (!r.on) { r.sp.visible = false; continue; }
      const pose = ripplePose(h.now - r.at);
      if (!pose) { r.on = false; r.sp.visible = false; continue; }
      const tex = getTexture(`weather/ripple-${r.water ? 'water' : 'ground'}-${pose.frame}`);
      if (!tex) { r.sp.visible = false; continue; }
      r.sp.texture = tex;
      r.sp.visible = true;
      r.sp.position.set(r.x, r.y);
      const sc = DEBRIS_ART_SCALE * h.depthScale(r.y) * r.s * pose.scale; // 波紋は雫の大きさ=水たまりを大きくしても据え置き
      r.sp.scale.set(sc, sc);
      r.sp.alpha = pose.alpha * (r.water ? 0.6 : 0.45) * h.horizonAlpha(r.y);
    }
  }

  /** 水たまりを踏んだら波紋(入った瞬間と、中を歩いている間は一定の距離ごと)。 */
  private syncSteps(h: WetHost, boxes: readonly ActorBox[]): void {
    const now = h.now;
    const alive = new Set<string>();
    const scaled = [...this.views.values()];
    for (const bx of boxes) {
      const a = bx;
      alive.add(a.id);
      let hit: PuddleView | null = null;
      for (const pv of scaled) {
        if (isInPuddle({ x: pv.p.x, y: pv.p.y, rx: pv.p.rx * pv.d, ry: pv.p.ry * pv.d }, bx.x, bx.foot)) { hit = pv; break; }
      }
      const st = this.steps.get(a.id);
      const pid = hit ? hit.p.id : null;
      if (!st) { this.steps.set(a.id, { pid, x: bx.x, y: bx.foot, at: now }); continue; }
      if (hit) {
        const moved = Math.hypot(bx.x - st.x, bx.foot - st.y);
        const entered = st.pid !== pid;
        if ((entered && moved > 1) || (moved >= STEP_RIPPLE_DIST && now - st.at >= STEP_RIPPLE_MS)) {
          this.spawnRipple(bx.x, bx.foot, true, 0.8, now);
          st.x = bx.x; st.y = bx.foot; st.at = now;
        }
      } else { st.x = bx.x; st.y = bx.foot; }
      st.pid = pid;
    }
    for (const id of this.steps.keys()) if (!alive.has(id)) this.steps.delete(id);
  }

  // ---- 木の下の雫 ----
  private syncDrips(h: WetHost): void {
    const now = h.now;
    if (now >= this.nextDripAt) {
      this.nextDripAt = now + DRIP_EVERY_MS * rand(0.4, 1.8);
      const inView = h.trees.filter(t => t.footX > h.view.left && t.footX < h.view.right && t.footY > h.view.top && t.footY < h.view.bottom + 40);
      if (inView.length && this.drips.filter(d => d.on).length < DRIP_MAX) {
        const t = inView[Math.floor(Math.random() * inView.length)];
        const ds = h.depthScale(t.footY);
        const x = t.footX + rand(-85, 85) * t.scale * ds;
        const y = t.footY + rand(-14, 34) * t.scale * ds;
        let d = this.drips.find(q => !q.on);
        if (!d) {
          const sp = new Sprite(Texture.WHITE);
          sp.anchor.set(0.5, 1);
          sp.tint = 0xd6e6ff;
          this.dripLayer.addChild(sp);
          d = { sp, at: 0, x: 0, y: 0, s: 1, on: false };
          this.drips.push(d);
        }
        d.at = now; d.x = x; d.y = y; d.s = ds; d.on = true;
      }
    }
    for (const d of this.drips) {
      if (!d.on) { d.sp.visible = false; continue; }
      const hgt = dripHeight(now - d.at);
      if (hgt == null) {
        d.on = false; d.sp.visible = false;
        const pv = puddleAt([...this.views.values()].map(v => ({ x: v.p.x, y: v.p.y, rx: v.p.rx * v.d, ry: v.p.ry * v.d })), d.x, d.y);
        this.spawnRipple(d.x, d.y, !!pv, pv ? 0.6 : 0.5, now);
        continue;
      }
      const k = (now - d.at) / DRIP_FALL_MS;
      d.sp.visible = true;
      d.sp.position.set(d.x, d.y - hgt * d.s);
      d.sp.width = 1.6 * d.s;
      d.sp.height = (3 + 7 * k) * d.s; // 速くなるほど尾が伸びる
      d.sp.alpha = 0.75 * Math.min(1, k * 4) * h.horizonAlpha(d.y);
    }
  }

  // ---- ポツポツ雨 ----
  private syncRain(h: WetHost): void {
    const now = h.now;
    const v = h.rainView ?? h.view;
    const w = Math.max(0, v.right - v.left), hh = Math.max(0, v.bottom - v.top);
    // 遅れが1秒を超えたら追いかけない(タブ復帰・重いフレームで一度に降らせない)。
    if (now - this.nextRainAt > 1000) this.nextRainAt = now;
    let budget = RAIN_SPAWN_PER_FRAME;
    while (now >= this.nextRainAt && budget-- > 0) {
      this.nextRainAt += rainNextGapMs(w * hh, Math.random);
      let d = this.rain.find(q => !q.on);
      if (!d) {
        if (this.rain.length >= RAIN_MAX) break;
        const sp = new Sprite(getRainStreakTexture());
        sp.anchor.set(0.5, 1); // 線の下端=雨粒の先
        sp.tint = RAIN_TINT;
        sp.visible = false;
        this.rainLayer.addChild(sp);
        d = { sp, at: 0, x: 0, y: 0, spec: rainDropSpec(Math.random), on: false };
        this.rain.push(d);
      }
      // 着地点は可視域の中(下は少し外まで=画面の下端へ落ちる粒も描く)。地平線の向こうには降らせない。
      const x = v.left + Math.random() * w;
      const y = v.top + Math.random() * (hh + 60);
      if (h.horizonAlpha(y) <= 0.02) continue;
      d.at = now; d.x = x; d.y = y; d.spec = rainDropSpec(Math.random); d.on = true;
    }
    for (const d of this.rain) {
      if (!d.on) { d.sp.visible = false; continue; }
      const pose = rainPose(now - d.at, d.spec);
      const ds = h.depthScale(d.y);
      if (!pose) {
        d.on = false; d.sp.visible = false;
        const pv = puddleAt([...this.views.values()].map(q => ({ x: q.p.x, y: q.p.y, rx: q.p.rx * q.d, ry: q.p.ry * q.d })), d.x, d.y);
        this.spawnRipple(d.x, d.y, !!pv, pv ? 0.42 + Math.random() * 0.16 : 0.3 + Math.random() * 0.1, now);
        continue;
      }
      const sl = d.spec.slant;
      d.sp.visible = true;
      // 斜めに落ちる: 高さ h の所では着地点より上流(左)へ h*slant ずれている。
      d.sp.position.set(d.x - pose.h * sl * ds, d.y - pose.h * ds);
      d.sp.rotation = -Math.atan(sl); // 尾が左上へ伸びる=右下へ流れる向き
      d.sp.width = RAIN_WIDTH * ds;
      d.sp.height = pose.len * ds;
      d.sp.alpha = d.spec.alpha * pose.alpha * h.horizonAlpha(d.y);
    }
  }

  // ---- 霧・近景・月・空(毎フレームの最後に掛け、次のフレームの頭で戻す) ----
  private paint(sp: Sprite | TilingSprite | null, tint: number, alpha: number): void {
    if (!sp || sp.destroyed) return;
    if (!this.originals.has(sp)) this.originals.set(sp, { tint: Number(sp.tint), alpha: sp.alpha });
    sp.tint = tint;
    sp.alpha = alpha;
  }

  applyAtmosphere(a: WetAtmosphere): void {
    if (!this.visible) return;
    for (const f of a.fog) this.paint(f, mulTint(Number(f.tint), FOG_COOL), f.alpha * FOG_ALPHA_MUL);
    for (const f of a.front) if (f) this.paint(f, mulTint(Number(f.tint), FRONT_COOL), f.alpha);
    for (const m of a.moonGlow) this.paint(m, Number(m.tint), m.alpha * MOON_GLOW_MUL);
    for (const m of a.moonHalo) this.paint(m, Number(m.tint), m.alpha * MOON_HALO_MUL);
    // 空は遠景の箱に色行列を1枚足す(1回だけ・外す時は detachSky)。
    if (a.farGroup && this.farGroupWithFilter !== a.farGroup) {
      this.detachSky();
      const cur = (a.farGroup.filters as Filter[] | null) ?? [];
      a.farGroup.filters = [...cur, this.skyFilter];
      this.farGroupWithFilter = a.farGroup;
    } else if (a.farGroup) {
      const cur = (a.farGroup.filters as Filter[] | null) ?? [];
      if (!cur.includes(this.skyFilter)) a.farGroup.filters = [...cur, this.skyFilter]; // 他所が作り直した時
    }
  }

  restoreAtmosphere(): void {
    for (const [sp, o] of this.originals) {
      if (!sp.destroyed) { sp.tint = o.tint; sp.alpha = o.alpha; }
    }
    this.originals.clear();
  }

  private detachSky(): void {
    const g = this.farGroupWithFilter;
    if (!g) return;
    this.farGroupWithFilter = null;
    if (g.destroyed) return;
    const cur = (g.filters as Filter[] | null) ?? [];
    if (cur.includes(this.skyFilter)) g.filters = cur.filter(f => f !== this.skyFilter);
  }

  destroy(): void {
    this.restoreAtmosphere();
    this.detachSky();
    this.root.destroy({ children: true });
    if (!this.rainLayer.destroyed) this.rainLayer.destroy({ children: true });
    this.rain = [];
    this.views.clear();
    this.gradeFilter.destroy();
    this.skyFilter.destroy();
  }
}
