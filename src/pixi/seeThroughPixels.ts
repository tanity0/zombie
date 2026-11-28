// 「裏に回ると手前の物が透ける」のピクセル判定(描画側)。テクスチャのコマから不透明ピクセルの粗い地図を
// 初めて使う時に1回だけ作ってキャッシュし、主人公の体の点がその絵の不透明な部分に乗っているかを調べる。
// 純粋な計算は src/utils/seeThroughMask.ts(テスト済み)。ここは Pixi のテクスチャ/変換を読むだけ=描画は読むだけ。
import type { Container, Sprite, Texture } from 'pixi.js';
import {
  type AlphaMask, type Affine, alphaMaskDims, anyPointOnOpaque, buildAlphaMask, multiplyAffine,
} from '../utils/seeThroughMask';

/** 1フレームに新しく作る地図の上限(初出の絵が一度に多数来ても1フレームを重くしない)。残りは次のフレームへ。 */
const MASK_BUILDS_PER_FRAME = 3;
/** キャッシュの上限(超えたら古い順に捨てる)。1枚は長辺最大512マス=最大32KB(ビット)。 */
const MASK_CACHE_MAX = 400;
/** 親をたどる深さの上限(actorLayer に届かなければ判定できない=四角へフォールバック)。 */
const MAX_PARENT_DEPTH = 8;

type Drawable = CanvasImageSource & { width: number; height: number };

/** 'pending' = まだ作れない(素材の読み込み中/このフレームの上限)。null = 読めない(四角へフォールバック)。 */
type MaskResult = AlphaMask | null | 'pending';

export class SeeThroughPixelProbe {
  private cache = new Map<string, AlphaMask | null>();
  private buildsLeft = MASK_BUILDS_PER_FRAME;
  private canvas: HTMLCanvasElement | null = null;
  /** 計器(`__pixiScene` から読む・診断用): 作った地図の数 / 読めずに四角へ落ちた数。 */
  built = 0;
  failed = 0;

  beginFrame() { this.buildsLeft = MASK_BUILDS_PER_FRAME; }

  /**
   * sprite の絵の不透明な部分に points(stopAt の座標系=世界)のどれかが乗っているか。
   * true/false = ピクセルで判定できた。null = 判定できない(素材が読めない・親が想定外)=呼び手は四角の判定を使う。
   * 地図の作成待ちの間は false(=透けない。数フレームで作れる)。
   */
  covers(sprite: Sprite, stopAt: Container, points: ReadonlyArray<{ x: number; y: number }>): boolean | null {
    const tex = sprite.texture;
    if (!tex || tex.width <= 1 || tex.rotate) return null;
    const m = this.maskFor(tex);
    if (m === 'pending') return false;
    if (!m) return null;
    const toWorld = this.toAncestor(sprite, stopAt);
    if (!toWorld) return null;
    const trim = tex.trim;
    return anyPointOnOpaque(points, toWorld, {
      anchorX: sprite.anchor.x, anchorY: sprite.anchor.y,
      origW: tex.orig.width, origH: tex.orig.height,
      trimX: trim ? trim.x : 0, trimY: trim ? trim.y : 0,
    }, m);
  }

  /** sprite の局所 → stopAt の座標(stopAt 自身の変換は含めない)。stopAt に届かなければ null。 */
  private toAncestor(sprite: Container, stopAt: Container): Affine | null {
    let node: Container | null = sprite;
    let acc: Affine | null = null;
    for (let depth = 0; node && depth < MAX_PARENT_DEPTH; depth++) {
      if (node === stopAt) return acc;
      node.updateLocalTransform();
      const lt = node.localTransform;
      const l: Affine = { a: lt.a, b: lt.b, c: lt.c, d: lt.d, tx: lt.tx, ty: lt.ty };
      acc = acc ? multiplyAffine(l, acc) : l;
      node = node.parent;
    }
    return node === stopAt ? acc : null;
  }

  private maskFor(tex: Texture): MaskResult {
    const src = tex.source;
    const f = tex.frame;
    const key = `${src.uid}:${f.x},${f.y},${f.width},${f.height}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const res = src.resource as unknown;
    const drawable = asDrawable(res);
    if (drawable === 'pending') return 'pending';
    if (!drawable) { this.remember(key, null); this.failed++; return null; }
    if (this.buildsLeft <= 0) return 'pending';
    this.buildsLeft--;
    let mask: AlphaMask | null = null;
    try {
      // 素材の実画素とテクスチャの座標(source.width)の比=解像度。frame は座標なので画素へ直す。
      const pxW = (typeof HTMLImageElement !== 'undefined' && drawable instanceof HTMLImageElement) ? drawable.naturalWidth : drawable.width;
      const k = pxW / Math.max(1, src.width);
      const sx = f.x * k, sy = f.y * k, sw = f.width * k, sh = f.height * k;
      const { cols, rows } = alphaMaskDims(f.width, f.height);
      // 途中の画はマスの2倍まで(大きな絵を原寸で読まない)。小さな絵は原寸のまま=縮めずに数える。
      const iw = Math.max(1, Math.min(Math.round(sw), cols * 2));
      const ih = Math.max(1, Math.min(Math.round(sh), rows * 2));
      const cv = this.canvas ?? (this.canvas = document.createElement('canvas'));
      if (cv.width < iw) cv.width = iw;
      if (cv.height < ih) cv.height = ih;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.clearRect(0, 0, iw, ih);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(drawable, sx, sy, sw, sh, 0, 0, iw, ih);
        const data = ctx.getImageData(0, 0, iw, ih).data; // クロスオリジンで汚れていればここで投げる
        mask = buildAlphaMask(data, iw, ih, cols, rows, f.width, f.height);
      }
    } catch {
      mask = null;
    }
    if (mask) this.built++; else this.failed++;
    this.remember(key, mask);
    return mask;
  }

  private remember(key: string, m: AlphaMask | null) {
    if (this.cache.size >= MASK_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, m);
  }
}

/** 素材が 2D canvas に描けるものなら返す。読み込み中なら 'pending'、描けない種類(動画・GPU専用等)なら null。 */
function asDrawable(res: unknown): Drawable | null | 'pending' {
  if (!res || typeof document === 'undefined') return null;
  if (typeof HTMLImageElement !== 'undefined' && res instanceof HTMLImageElement) {
    return res.complete && res.naturalWidth > 0 ? res : 'pending';
  }
  if (typeof HTMLVideoElement !== 'undefined' && res instanceof HTMLVideoElement) return null; // 動く絵は地図にできない
  if (typeof HTMLCanvasElement !== 'undefined' && res instanceof HTMLCanvasElement) return res.width > 0 ? res : null;
  if (typeof ImageBitmap !== 'undefined' && res instanceof ImageBitmap) return res.width > 0 ? res : null;
  if (typeof OffscreenCanvas !== 'undefined' && res instanceof OffscreenCanvas) return res.width > 0 ? (res as unknown as Drawable) : null;
  return null;
}
