// 比較用 ?objshade=2(作り直し・社長2026-11-22「2も物の上だけ薄くして作り直して」): 雲の影を物の上にも、薄く重ねる。
//
// 並べ方(worldGroup の中):
//   groundBase → 雲の影1枚目(今の位置・地面だけに掛かる) → … → filteredWorld[ world[ background, ground(足元の影・予告の床),
//     actorLayer{ 物の絵 …, 雲の影2枚目(最後の子) } ← 物だけの下書き, 予告・頭上UIの層(RenderLayer), frontObject(弾), effect, lighting ] ]
//
// ・2枚目は actorLayer の最後の子。actorLayer に何もしないフィルタ(AlphaFilter 1)を付けて「物だけの下書き」へ描かせるので、
//   2枚目の乗算は物の画素にしか届かない(地面・床の予告・弾・エフェクトは下書きの外)。
// ・乗算の合成は専用の合成('objshade-mul'): 色=乗算(Pixi の multiply と同じ)・不透明度=下書きの値をそのまま保つ。
//   Pixi の multiply は不透明度を足してしまうので、透明な下書きの上では四角い塗りが出る(前回の「四角く白く抜ける」の正体)。
// ・敵/主人公の容器の中にある赤い予告・体力バー・攻撃の絵(tele/overlay/輪/帯/斬撃…)は、描く順だけを
//   RenderLayer で下書きの後へ回す=2枚目で暗くならない(位置・透明度・表示は今までどおり親の容器に従う)。
// ・ステージ7の雲の影は通常合成の黒(形はα)なので、2枚目は 'objshade-dark'(色=×(1−α)・不透明度を保つ)。
import { AlphaFilter, Container, Point, Rectangle, RenderLayer, Texture, TilingSprite, type Filter, type Renderer } from 'pixi.js';
import { overlayAlphas } from '../utils/objShadeOverlay';

const BLEND_MUL = 'objshade-mul';
const BLEND_DARK = 'objshade-dark';

/** 敵/主人公の見た目のうち、下書きの後へ回すもの(予告・頭上UI・攻撃の絵)。ActorView が構造的に当てはまる。 */
export interface ObjShadeLiftView {
  container: Container;
  tele: Container;
  overlay: Container;
  overlayTop: Container;
  rings?: (Container | undefined)[];
  bands?: (Container | undefined)[];
  bandSlices?: ((Container | undefined)[] | undefined)[];
  slash?: Container;
  clawMarks?: (Container | undefined)[];
  shockwaves?: (Container | undefined)[];
  spikeThrust?: (Container | undefined)[];
  burstFrag?: (Container | undefined)[];
  dashWind?: Container;
  airRing?: Container;
  airStreaks?: (Container | undefined)[];
  playerAirStreaks?: (Container | undefined)[];
}

/** 合成の登録(WebGL の時だけ)。文脈が失われると表が作り直されるので毎フレーム確かめる。 */
const ensureBlendModes = (renderer: Renderer | null): boolean => {
  const r = renderer as unknown as { gl?: WebGLRenderingContext; state?: { blendModesMap?: Record<string, number[]> } } | null;
  const gl = r?.gl, map = r?.state?.blendModesMap;
  if (!gl || !map) return false;
  if (!map[BLEND_MUL]) map[BLEND_MUL] = [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE];
  if (!map[BLEND_DARK]) map[BLEND_DARK] = [gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE];
  return true;
};

const pushAll = (out: Container[], arr: readonly (Container | undefined)[] | undefined) => {
  if (arr) for (const c of arr) if (c) out.push(c);
};

export interface ObjShadeOverlaySync {
  renderer: Renderer | null;
  /** 1枚目(今の雲の影・worldGroup の子)。 */
  src: TilingSprite;
  /** 物に乗る影の濃さ(元の k 倍)。 */
  k: number;
  /** 下書きの描く範囲(actorLayer のローカル座標)。 */
  area: { x: number; y: number; width: number; height: number };
  /** 予告・頭上UIを下書きの後へ回す見た目(敵・主人公)。 */
  views: Iterable<ObjShadeLiftView>;
}

export class ObjShadeOverlay {
  readonly tile: TilingSprite;
  private late = new RenderLayer();
  private filter: Filter = new AlphaFilter({ alpha: 1, resolution: 'inherit' });
  private pt = new Point();
  private lifted: Container[] = [];
  private want: Container[] = [];
  /** 計器(__pixiScene.objShadeOverlayStats)。 */
  stats = { on: false, a1: 0, a2: 0, lifted: 0 };
  /** 撮影用: 同じ画面のまま k を差し替える(null=?objshadek2= の値)。 */
  kOverride: number | null = null;
  enabled = true;

  constructor(private actorLayer: Container, world: Container) {
    this.tile = new TilingSprite({ texture: Texture.EMPTY, width: 1, height: 1 });
    this.tile.eventMode = 'none';
    this.tile.label = 'objShadeOverlay';
    this.tile.zIndex = 1e12; // actorLayer は足元Yで並べ替える=一番大きい値で必ず最後の子
    this.tile.visible = false;
    actorLayer.addChild(this.tile);
    this.late.label = 'objShadeLate';
    world.addChildAt(this.late, world.getChildIndex(actorLayer) + 1);
  }

  sync(p: ObjShadeOverlaySync): void {
    const src = p.src;
    const ok = this.enabled && ensureBlendModes(p.renderer) && src.visible && !!src.parent && src.alpha > 0.003 && !src.destroyed;
    this.stats.on = ok;
    if (!ok) { this.off(); return; }
    const al = this.actorLayer;
    if (!al.filters || (al.filters as Filter[])[0] !== this.filter) al.filters = [this.filter];
    const fa = (al.filterArea as Rectangle | undefined) ?? new Rectangle();
    fa.x = p.area.x; fa.y = p.area.y; fa.width = p.area.width; fa.height = p.area.height;
    if (!al.filterArea) al.filterArea = fa;

    const t = this.tile;
    if (t.texture !== src.texture) t.texture = src.texture;
    const dark = src.blendMode === 'normal';
    const bm = (dark ? BLEND_DARK : BLEND_MUL) as unknown as TilingSprite['blendMode'];
    if (t.blendMode !== bm) t.blendMode = bm;
    // 同じ画面位置に置く(world は拡大縮小しないので並進だけ写せば模様が地面の1枚目とぴったり重なる)。
    al.toLocal(src.position, src.parent ?? undefined, this.pt);
    t.position.copyFrom(this.pt);
    t.width = src.width; t.height = src.height;
    t.tileScale.copyFrom(src.tileScale);
    t.tilePosition.copyFrom(src.tilePosition);
    t.tint = src.tint;
    // 2枚目は物だけの下書きの中=地面へ届かない → 1枚目は元のまま(overlayAlphas の layer2OnGround=false)。
    const { a1, a2 } = overlayAlphas(src.alpha, this.kOverride ?? p.k, 0.5, false);
    t.alpha = a2;
    this.stats.a1 = a1; this.stats.a2 = a2;
    t.visible = true;

    // 予告・頭上UIを下書きの後へ(順は物の足元Yの順=今までと同じ前後関係を予告どうしで保つ)。
    const want = this.want; want.length = 0;
    const vs: ObjShadeLiftView[] = [];
    for (const v of p.views) if (v.container.parent === al && !v.container.destroyed) vs.push(v);
    vs.sort((a, b) => a.container.zIndex - b.container.zIndex);
    for (const v of vs) {
      const n0 = want.length;
      want.push(v.tele);
      pushAll(want, v.rings); pushAll(want, v.bands);
      if (v.bandSlices) for (const arr of v.bandSlices) pushAll(want, arr);
      if (v.slash) want.push(v.slash);
      pushAll(want, v.clawMarks); pushAll(want, v.shockwaves); pushAll(want, v.spikeThrust); pushAll(want, v.burstFrag);
      if (v.dashWind) want.push(v.dashWind);
      if (v.airRing) want.push(v.airRing);
      pushAll(want, v.airStreaks); pushAll(want, v.playerAirStreaks);
      want.push(v.overlay, v.overlayTop);
      // 容器の直下にある物だけ(よそへ付け替えられた絵は触らない)。
      let w = n0;
      for (let i = n0; i < want.length; i++) { const c = want[i]; if (c.parent === v.container && !c.destroyed) want[w++] = c; }
      want.length = w;
    }
    let same = want.length === this.lifted.length;
    if (same) for (let i = 0; i < want.length; i++) if (want[i] !== this.lifted[i]) { same = false; break; }
    if (!same) {
      this.late.detachAll();
      if (want.length) this.late.attach(...want);
      this.markDirty();
      this.lifted = want.slice();
    }
    this.stats.lifted = this.lifted.length;
  }

  /** 2枚目を止めて全部元へ(下書きのフィルタも外す)。 */
  off(): void {
    if (this.tile.visible) this.tile.visible = false;
    const al = this.actorLayer;
    if (al.filters && (al.filters as Filter[]).includes(this.filter)) al.filters = (al.filters as Filter[]).filter((f) => f !== this.filter);
    if (this.lifted.length) {
      this.late.detachAll();
      this.markDirty();
      this.lifted = [];
    }
    this.stats.lifted = 0;
  }

  /** detachAll は描く順の作り直しを頼まないので自分で頼む。 */
  private markDirty(): void {
    const rg = this.late as unknown as { renderGroup?: { structureDidChange: boolean } | null; parentRenderGroup?: { structureDidChange: boolean } | null };
    const g = rg.renderGroup ?? rg.parentRenderGroup;
    if (g) g.structureDidChange = true;
  }

  destroy(): void {
    this.off();
    this.late.destroy();
    this.tile.destroy();
    this.filter.destroy();
  }
}
