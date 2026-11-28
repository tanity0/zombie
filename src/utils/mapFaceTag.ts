// 作戦室の地図のボスの顔をタップした時の「どのステージか」の札(社長 2026-11-14「ボスアイコンをタップしたら、それはどこのステージなのか？が分かる様にしたい」)。
// どの顔が開くか(タップの当たり・開閉の切り替え)と、札の置き場所だけの純関数(React/PixiJS 非依存)。座標は地図の原画の単位。

/** 地図に出ている顔1つ(当たりの判定用)。 */
export interface MapFaceHit { key: string; x: number; y: number }

/** 札の箱(左上・幅・高さ)。 */
export interface MapTagBox { l: number; t: number; w: number; h: number }

const inBox = (b: MapTagBox, x: number, y: number): boolean => x >= b.l && x <= b.l + b.w && y >= b.t && y <= b.t + b.h;

/**
 * タップした所に一番近い顔(当たり=顔の中心から縦横 hitHalf 以内の正方形)。どれにも入らなければ null。
 * 当たりは見た目の丸より大きく取る(隣の顔と当たりが重なる所は、中心が近い方)。
 */
export const pickMapFace = (faces: readonly MapFaceHit[], x: number, y: number, hitHalf: number): string | null => {
  let best: string | null = null, bestD = Infinity;
  for (const f of faces) {
    if (Math.abs(f.x - x) > hitHalf || Math.abs(f.y - y) > hitHalf) continue;
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bestD) { bestD = d; best = f.key; }
  }
  return best;
};

/**
 * 地図をタップした後に開いている顔。
 * - 開いている札そのものをタップ → 閉じる(札が隣の顔に被っていても、その顔を開き直さない)
 * - 開いている顔をもう一度 → 閉じる / 別の顔 → その顔に切り替え / 顔の無い所 → 閉じる
 */
export const nextOpenMapFace = (open: string | null, faces: readonly MapFaceHit[], x: number, y: number, hitHalf: number, openTag: MapTagBox | null): string | null => {
  if (open && openTag && inBox(openTag, x, y)) return null;
  const tapped = pickMapFace(faces, x, y, hitHalf);
  if (!tapped || tapped === open) return null;
  return tapped;
};

/** 札の文字の幅の見積もり(全角=字の大きさ・半角=0.62倍+字間)。描く前に置き場所を決めるため(実測はしない)。 */
export const estimateTagTextWidth = (text: string, fontSize: number, letterSpacing = 0): number => {
  let w = 0;
  for (const ch of text) w += (ch.charCodeAt(0) < 0x2000 ? 0.62 : 1) * fontSize;
  const n = [...text].length;
  return w + Math.max(0, n - 1) * letterSpacing;
};

export interface MapSpotTagOpts {
  /** 場所の点(原画の単位)と、点の印の半分の大きさ。 */
  at: readonly [number, number]; markHalf: number;
  /** 顔の列: 左端・右端(丸の外の弧まで)・縦の中心、列が点の下か。 */
  rowL: number; rowR: number; rowY: number; below: boolean;
  /** 顔の中心から上の刻みの先まで/下の弧まで。 */
  reachUp: number; reachDown: number;
  /** 札の幅・高さ、印と札の間(=引き線の長さ)。 */
  w: number; h: number; gap: number;
  /** 地図の幅・高さと、端からの余白(札が地図の縁に貼り付かない)。 */
  mapW: number; mapH: number; margin: number;
}

export interface MapTagPlace extends MapTagBox { below: boolean }

/**
 * 札の置き場所=その場所(列)で1つに固定。押した顔から札へは引き線だけを伸ばす。
 * - 列が点の下: 場所の点の真上(点の印の上に間を空けて)。
 * - 列が点の上: 列の中心の真上(顔の上の刻みの先の上に間を空けて)。
 * - 上に入らない(地図の上端)時だけ、列と点の両方より下。横は地図の左右から出るなら内へ寄せ、縦も地図の中へ押し込む(欠けない)。
 */
export const placeMapSpotTag = (o: MapSpotTagOpts): MapTagPlace => {
  const cx = o.below ? o.at[0] : (o.rowL + o.rowR) / 2;
  const l = Math.max(o.margin, Math.min(o.mapW - o.margin - o.w, cx - o.w / 2));
  const aboveBottom = o.below ? o.at[1] - o.markHalf - o.gap : o.rowY - o.reachUp - o.gap;
  const aboveT = aboveBottom - o.h;
  const belowT = Math.max(o.rowY + o.reachDown, o.at[1] + o.markHalf) + o.gap;
  const below = aboveT < o.margin;
  const t = Math.max(o.margin, Math.min(o.mapH - o.margin - o.h, below ? belowT : aboveT));
  return { l, t, w: o.w, h: o.h, below };
};

/**
 * 押した顔から札への引き線。根元は顔の真上(札が上: 上の刻みの先 / 札が下: 下の弧)で、札を内へ寄せても動かない。
 * 先は札の下辺(札が上)か上辺(札が下)の、顔の真上に一番近い所(札の端から inset 内側)。
 */
export const mapTagLeadLine = (faceX: number, faceY: number, reachUp: number, reachDown: number, tag: MapTagPlace, inset: number) => {
  const x2 = Math.max(tag.l + inset, Math.min(tag.l + tag.w - inset, faceX));
  return tag.below
    ? { x1: faceX, y1: faceY + reachDown, x2, y2: tag.t }
    : { x1: faceX, y1: faceY - reachUp, x2, y2: tag.t + tag.h };
};
