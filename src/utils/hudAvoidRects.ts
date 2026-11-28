// 画面の縁の目印(矢印)が避ける HUD の矩形(論理座標=ゲームの画面px)。?proj=1 段階6(クリエイティブ監査: 矢印を会話窓に重ねない)。
// これ自体はゲームの状態ではない(store には置かない=viewTransform と同じ作法)。React の部品が自分の位置を測って置き、描画(pixiScene)が読む。
// 書くのは測った時だけ(毎フレームの set() を作らない)。`?proj=0` では誰も書かない=何も変わらない。
export interface HudAvoidRect { left: number; top: number; right: number; bottom: number }

const rects = new Map<string, HudAvoidRect>();

/** 矩形を置く(null=外す)。 */
export const setHudAvoidRect = (key: string, r: HudAvoidRect | null): void => {
  if (!r) { rects.delete(key); return; }
  const o = rects.get(key);
  if (o && o.left === r.left && o.top === r.top && o.right === r.right && o.bottom === r.bottom) return;
  rects.set(key, r);
};

/** 今の矩形(読むだけ)。 */
export const getHudAvoidRects = (): IterableIterator<HudAvoidRect> => rects.values();

/**
 * 縁に沿わせる(純関数): 画面の縁の帯の上の点 (x, y) が矩形(pad 広げた物)に入っていたら、点が乗っている縁に沿って矩形の外の近い側へずらす。
 * 上下の縁の点は横へ、左右の縁の点は縦へ。ずらした先が縁の帯の外(minX..maxX・minY..maxY)なら反対側。どちらも外なら元のまま。
 */
export const slideOutOfRects = (
  x: number, y: number, list: Iterable<HudAvoidRect>, pad: number,
  minX: number, maxX: number, minY: number, maxY: number,
): { x: number; y: number } => {
  let px = x, py = y;
  for (const r of list) {
    const l = r.left - pad, t = r.top - pad, rr = r.right + pad, b = r.bottom + pad;
    if (!(px > l && px < rr && py > t && py < b)) continue;
    const onTB = Math.abs(py - minY) < 1.5 || Math.abs(py - maxY) < 1.5;
    if (onTB) {
      const a = l, c = rr;
      const first = Math.abs(px - a) <= Math.abs(c - px) ? a : c, second = first === a ? c : a;
      if (first >= minX && first <= maxX) px = first; else if (second >= minX && second <= maxX) px = second;
    } else {
      const a = t, c = b;
      const first = Math.abs(py - a) <= Math.abs(c - py) ? a : c, second = first === a ? c : a;
      if (first >= minY && first <= maxY) py = first; else if (second >= minY && second <= maxY) py = second;
    }
  }
  return { x: px, y: py };
};
