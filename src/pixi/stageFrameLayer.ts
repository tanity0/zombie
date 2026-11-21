/**
 * 横長画面の左右の枠(research/STAGE_FRAMES.md・表は data/stageFrames.ts)の描画。
 *
 * - **画面座標**で左端/右端に固定(ワールドではない=カメラ・ズーム・判定に一切触らない)。置き場所は pixiScene の uiLayer
 *   (ワールド・霧・画面の色味の上/周辺減光・被弾の閃光・画面外の矢印の下)。HUD(DOM)はその上。
 * - 高さ=画面の高さいっぱい・縦横比そのまま。ドット絵を nearest で拡大してから**ぼかしを焼く**(手前でピントの外れた前景)。
 *   ぼかしは画面寸法かテクスチャが変わった時だけ1回焼く=毎フレームのフィルタは掛けない。
 * - 横長(w > h)の時だけ。スマホ縦では何も読まず何も描かない(container.visible=false のまま)。
 * - 出る時は慣性つきのフェード(パッと出さない)。
 *
 * 負荷: スプライト最大2枚(焼いた絵)。焼きは寸法が変わった時だけ(BlurFilter 1回)=1/10。
 * メモリ: 焼いた絵は 1080p で 約490×1080×4 ≈ 2.1MB/枚(+原盤 228×512 ≈ 0.47MB)。
 */
import { BlurFilter, Container, Sprite, type RenderTexture, type Texture } from 'pixi.js';
import { STAGE_FRAMES, stageFramesWanted, type StageFrameSide } from '../data/stageFrames';
import { getTexture } from './pixiTextures';

/** ぼかしの強さ(画面の論理px)。`?framesblur=` で試せる。 */
const FRAME_BLUR_DEFAULT = 4;
const FRAME_BLUR = (() => {
  if (typeof window === 'undefined') return FRAME_BLUR_DEFAULT;
  const q = new URLSearchParams(window.location.search).get('framesblur');
  const v = q === null ? NaN : Number(q);
  return Number.isFinite(v) && v >= 0 ? v : FRAME_BLUR_DEFAULT;
})();
/** 出るフェードの尺(ms)。 */
const FRAME_FADE_MS = 700;

export interface StageFrameHooks {
  bake: (w: number, h: number) => RenderTexture;
  release: (rt: RenderTexture) => void;
  render: (c: Container, target: RenderTexture) => void;
}

interface SideView {
  sprite: Sprite;
  rt: RenderTexture | null;
  srcTex: Texture | null;
  bakedH: number;
  alpha: number;
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class StageFrameLayer {
  readonly container = new Container();
  private sides = new Map<StageFrameSide, SideView>();
  private lastNow = 0;

  constructor(private hooks: StageFrameHooks) {
    this.container.eventMode = 'none';
    this.container.label = 'stageFrames';
    this.container.visible = false;
  }

  sync(o: { stageId: string; w: number; h: number; indoor: boolean; corridor: boolean; now: number }): void {
    const dt = this.lastNow > 0 ? Math.min(100, Math.max(0, o.now - this.lastNow)) : 0;
    this.lastNow = o.now;
    if (!stageFramesWanted({ stageId: o.stageId, w: o.w, h: o.h, indoor: o.indoor, corridor: o.corridor })) {
      // 横長でない/対象外: 何も描かない。次に出る時もフェードから。
      this.container.visible = false;
      for (const v of this.sides.values()) v.alpha = 0;
      return;
    }
    const def = STAGE_FRAMES[o.stageId] ?? {};
    let any = false;
    for (const side of ['left', 'right'] as const) {
      const name = def[side];
      const v = this.sides.get(side);
      const tex = name ? getTexture(name) : null; // 届く前は null(遅延組の網が取りに行く)=出さないだけ
      if (!tex) { if (v) { v.sprite.visible = false; v.alpha = 0; } continue; }
      const view = v ?? this.makeSide(side);
      if (view.srcTex !== tex || view.bakedH !== o.h) this.bakeSide(side, view, tex, o.h);
      if (!view.rt) { view.sprite.visible = false; continue; }
      view.alpha = Math.min(1, view.alpha + dt / FRAME_FADE_MS);
      view.sprite.alpha = easeInOut(view.alpha);
      view.sprite.visible = true;
      view.sprite.position.set(side === 'left' ? 0 : o.w - view.rt.width, 0);
      any = true;
    }
    this.container.visible = any;
  }

  private makeSide(side: StageFrameSide): SideView {
    const sprite = new Sprite();
    sprite.eventMode = 'none';
    sprite.visible = false;
    this.container.addChild(sprite);
    const v: SideView = { sprite, rt: null, srcTex: null, bakedH: 0, alpha: 0 };
    this.sides.set(side, v);
    return v;
  }

  /**
   * 原盤を画面の高さへ nearest で拡大し、ぼかして1枚に焼く。
   * ぼかしは絵の外の透明を引き込むので、画面の端(外側の辺・上・下)が薄くならないよう、
   * 絵をぼかし幅ぶん**画面の外へはみ出させて**焼く(はみ出した分は焼きの枠で切れる)。
   */
  private bakeSide(side: StageFrameSide, v: SideView, tex: Texture, h: number): void {
    if (v.rt) { this.hooks.release(v.rt); v.rt = null; }
    v.srcTex = tex;
    v.bakedH = h;
    if (h <= 1 || tex.width <= 1 || tex.height <= 1) return;
    const pad = Math.ceil(FRAME_BLUR * 3) + 2;
    const sc = (h + pad * 2) / tex.height;
    const drawnW = tex.width * sc;
    const outW = Math.max(1, Math.ceil(drawnW - pad));
    const wrap = new Container();
    const sp = new Sprite(tex);
    sp.scale.set(sc);
    // 左=絵の左端を画面の左外へ pad ぶん / 右=絵の右端を画面の右外へ pad ぶん。
    sp.position.set(side === 'left' ? -pad : outW + pad - drawnW, -pad);
    wrap.addChild(sp);
    if (FRAME_BLUR > 0) wrap.filters = [new BlurFilter({ strength: FRAME_BLUR, quality: 4 })];
    const rt = this.hooks.bake(outW, Math.max(1, Math.round(h)));
    this.hooks.render(wrap, rt);
    if (wrap.filters) for (const f of wrap.filters as BlurFilter[]) f.destroy();
    wrap.destroy({ children: true });
    v.rt = rt;
    v.sprite.texture = rt;
  }

  destroy(): void {
    for (const v of this.sides.values()) if (v.rt) this.hooks.release(v.rt);
    this.sides.clear();
    this.container.destroy({ children: true });
  }
}
