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
 *
 * ★枠のトンネル(社長指示2026-11-21・時間割は utils/introFrameTunnel.ts): ステージ開始のヘリ飛来の間だけ、
 * **縦持ち・横持ち関係なく**、同じ焼いた絵の複製を外側の端を基準に遠近の速さで拡大し(奥からゆっくり→抜ける直前に速く)、
 * 常に2〜3枚を重ねて途切れず流す。
 * 複製は焼いた絵を使い回す(新しい焼き・毎フレームのフィルタは足さない)。片側 INTRO_TUNNEL_MAX_COPIES 枚のプール。
 * 縦画面では演出の間だけ焼き、終わったら焼いた絵を手放す(演出の後の縦画面は何も描かない=今と同じ)。
 */
import { BlurFilter, Container, Sprite, Texture, type RenderTexture } from 'pixi.js';
import { STAGE_FRAMES, stageFramesTunnelWanted, stageFramesWanted, type StageFrameSide } from '../data/stageFrames';
import { INTRO_TUNNEL_END_MS, INTRO_TUNNEL_MAX_COPIES, INTRO_TUNNEL_PORTRAIT_ALPHA_MUL, introTunnelCopies } from '../utils/introFrameTunnel';
import { getTexture } from './pixiTextures';

/** ぼかしの強さ(画面の論理px)。`?framesblur=` で試せる。 */
const FRAME_BLUR_DEFAULT = 4;
const FRAME_BLUR = (() => {
  if (typeof window === 'undefined') return FRAME_BLUR_DEFAULT;
  const q = new URLSearchParams(window.location.search).get('framesblur');
  const v = q === null ? NaN : Number(q);
  return Number.isFinite(v) && v >= 0 ? v : FRAME_BLUR_DEFAULT;
})();
/**
 * 枠のトンネルの複製の重ね方。既定は普通(光らせない=暗い岩・枝の影絵がこちらへ迫ってくる)。
 * 加算は「チカチカ光るだけ」に見えたため既定から外した(社長2026-11-21)。`?tunnelblend=add|screen` で比べられる。
 */
const TUNNEL_BLEND = (() => {
  if (typeof window === 'undefined') return 'normal';
  const q = new URLSearchParams(window.location.search).get('tunnelblend');
  return q === 'add' || q === 'screen' ? q : 'normal';
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
  /** 枠のトンネルの複製(プール・同じ rt を使い回す)。 */
  copies: Sprite[];
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class StageFrameLayer {
  readonly container = new Container();
  private sides = new Map<StageFrameSide, SideView>();
  private lastNow = 0;
  /** 通常の枠(横長の常時表示)。 */
  private readonly baseLayer = new Container();
  /** 枠のトンネルの複製(通常の枠の上=手前)。 */
  private readonly tunnelLayer = new Container();

  constructor(private hooks: StageFrameHooks) {
    this.container.eventMode = 'none';
    this.container.label = 'stageFrames';
    this.container.visible = false;
    this.baseLayer.eventMode = 'none';
    this.tunnelLayer.eventMode = 'none';
    this.container.addChild(this.baseLayer, this.tunnelLayer);
  }

  /**
   * @param o.introMs 登場演出の頭からの経過 ms(登場演出中でなければ null)。枠のトンネルの時刻。
   */
  sync(o: { stageId: string; w: number; h: number; indoor: boolean; corridor: boolean; now: number; introMs?: number | null }): void {
    const dt = this.lastNow > 0 ? Math.min(100, Math.max(0, o.now - this.lastNow)) : 0;
    this.lastNow = o.now;
    const baseWanted = stageFramesWanted({ stageId: o.stageId, w: o.w, h: o.h, indoor: o.indoor, corridor: o.corridor });
    const introMs = o.introMs ?? null;
    const tunnelOn = introMs !== null && introMs < INTRO_TUNNEL_END_MS
      && stageFramesTunnelWanted({ stageId: o.stageId, indoor: o.indoor, corridor: o.corridor });
    if (!baseWanted && !tunnelOn) {
      // 横長でない/対象外/トンネルも無い: 何も描かない。次に出る時もフェードから。
      // 縦画面でトンネルのために焼いた絵はここで手放す(演出の後の縦画面は今と同じ=何も持たない)。
      this.container.visible = false;
      for (const v of this.sides.values()) {
        v.alpha = 0;
        v.sprite.visible = false;
        for (const c of v.copies) c.visible = false;
        if (v.rt && o.w <= o.h) { v.sprite.texture = Texture.EMPTY; for (const c of v.copies) c.texture = Texture.EMPTY; this.hooks.release(v.rt); v.rt = null; v.srcTex = null; v.bakedH = 0; }
      }
      return;
    }
    const def = STAGE_FRAMES[o.stageId] ?? {};
    const copies = tunnelOn ? introTunnelCopies(introMs as number) : [];
    let any = false;
    for (const side of ['left', 'right'] as const) {
      const name = def[side];
      const v = this.sides.get(side);
      const tex = name ? getTexture(name) : null; // 届く前は null(遅延組の網が取りに行く)=出さないだけ
      if (!tex) { if (v) { v.sprite.visible = false; v.alpha = 0; for (const c of v.copies) c.visible = false; } continue; }
      const view = v ?? this.makeSide(side);
      if (view.srcTex !== tex || view.bakedH !== o.h) this.bakeSide(side, view, tex, o.h);
      if (!view.rt) { view.sprite.visible = false; for (const c of view.copies) c.visible = false; continue; }
      const x0 = side === 'left' ? 0 : o.w - view.rt.width;
      if (baseWanted) {
        view.alpha = Math.min(1, view.alpha + dt / FRAME_FADE_MS);
        view.sprite.alpha = easeInOut(view.alpha);
        view.sprite.visible = true;
        view.sprite.position.set(x0, 0);
        any = true;
      } else {
        view.alpha = 0;
        view.sprite.visible = false;
      }
      // トンネル: 外側の端(左=x0 / 右=画面の右端)と画面の縦の中央を基準に拡大(端寄せのまま)。
      for (let i = 0; i < view.copies.length; i++) {
        const c = view.copies[i];
        const pose = copies[i];
        if (!pose || pose.alpha <= 0.004) { c.visible = false; continue; }
        if (c.texture !== view.rt) c.texture = view.rt;
        c.scale.set(pose.scale);
        c.position.set(side === 'left' ? 0 : o.w, o.h / 2);
        c.alpha = pose.alpha * (o.w <= o.h ? INTRO_TUNNEL_PORTRAIT_ALPHA_MUL : 1);
        c.visible = true;
        any = true;
      }
    }
    this.container.visible = any;
  }

  private makeSide(side: StageFrameSide): SideView {
    const sprite = new Sprite();
    sprite.eventMode = 'none';
    sprite.visible = false;
    this.baseLayer.addChild(sprite);
    // トンネルの複製: introTunnelCopies は新しい順(小さい=奥)に返す。古い(大きい=手前)ほど上に重ねるため、
    // プールの i 番目を tunnelLayer の下から i 番目に置く(=i が大きいほど上)。
    const copies: Sprite[] = [];
    for (let i = 0; i < INTRO_TUNNEL_MAX_COPIES; i++) {
      const c = new Sprite();
      c.eventMode = 'none';
      c.visible = false;
      c.anchor.set(side === 'left' ? 0 : 1, 0.5);
      c.blendMode = TUNNEL_BLEND;
      this.tunnelLayer.addChild(c);
      copies.push(c);
    }
    const v: SideView = { sprite, rt: null, srcTex: null, bakedH: 0, alpha: 0, copies };
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
    for (const c of v.copies) c.texture = rt;
  }

  destroy(): void {
    for (const v of this.sides.values()) if (v.rt) this.hooks.release(v.rt);
    this.sides.clear();
    this.container.destroy({ children: true });
  }
}
