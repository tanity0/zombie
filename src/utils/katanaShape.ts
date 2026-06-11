// 刀サブウェポンの見た目を1か所で定義する。背面の背負い刀(Pixi Graphics)と
// HUDのアイコン(SVG)の両方がこの同じドット配置を使うので、HUDには「背負って
// いる刀のデザインをそのまま縮小したもの」が出る。
//
// 正規化座標 [0,1]×[0,1](y は下向き)に、赤い鞘・金の鍔・黒赤巻きの柄を持つ
// 少し反った刀を縦やや斜めに配置する。dir=+1 が基本、-1 で左右反転(キャラの
// 向きに合わせる)。

export interface KatanaRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  alpha: number;
}

// 鞘(赤)・刃陰(暗赤)・鍔(金)・柄(黒/赤巻き)。
const SHEATH = 0xb91c1c;
const SHEATH_SHADE = 0x7f1d1d;
const MOUTH = 0xf1f5f9; // 鯉口(白)
const TSUBA = 0xd4a017;
const TSUBA_HI = 0xfde68a;
const WRAP_DARK = 0x111827;
const WRAP_RED = 0xb91c1c;
const POMMEL = 0x374151;

export const buildKatanaShape = (dir: number): KatanaRect[] => {
  const rects: KatanaRect[] = [];
  const u = 0.085; // 1ドットの正規化サイズ

  // 背骨(刀の中心線)。背負い刀らしく強めの斜め(柄=上側、鞘先=下側)に、
  // 軽い反りを足す。dir で左右反転(肩の側を切り替え)。
  const top = 0.03;
  const bottom = 0.99;
  const yAt = (t: number) => top + (bottom - top) * t;
  const xAt = (t: number) => {
    const diagonal = 0.76 - 0.50 * t;                // 上0.76 → 下0.26 の対角
    const sori = Math.sin(t * Math.PI) * 0.07;       // 反り(中央が膨らむ)
    const base = diagonal + sori;
    return dir > 0 ? base : 1 - base;                // 向きで左右反転
  };

  // 鞘(赤)。t = 0.30 → 1.0 まで長めに。
  const NS = 13;
  for (let i = 0; i <= NS; i++) {
    const t = 0.30 + (1.0 - 0.30) * (i / NS);
    const x = xAt(t);
    const y = yAt(t);
    rects.push({ x: x - u * 0.78, y: y - u * 0.62, w: u * 1.56, h: u * 1.32, color: SHEATH, alpha: 0.97 });
    rects.push({ x: x + dir * u * 0.32, y: y - u * 0.62, w: u * 0.46, h: u * 1.32, color: SHEATH_SHADE, alpha: 0.85 });
  }

  // 鯉口(鞘の口、白い細帯)
  {
    const t = 0.31;
    const x = xAt(t);
    const y = yAt(t);
    rects.push({ x: x - u * 0.9, y: y - u * 0.72, w: u * 1.8, h: u * 0.42, color: MOUTH, alpha: 0.9 });
  }

  // 鍔(金、横に張り出す)
  {
    const t = 0.27;
    const x = xAt(t);
    const y = yAt(t);
    rects.push({ x: x - u * 1.2, y: y - u * 0.48, w: u * 2.4, h: u * 0.92, color: TSUBA, alpha: 0.97 });
    rects.push({ x: x - u * 1.2, y: y - u * 0.48, w: u * 2.4, h: u * 0.32, color: TSUBA_HI, alpha: 0.8 });
  }

  // 柄(黒地に赤巻き)。t = 0.06 → 0.25。
  const NH = 5;
  for (let i = 0; i <= NH; i++) {
    const t = 0.06 + (0.25 - 0.06) * (i / NH);
    const x = xAt(t);
    const y = yAt(t);
    rects.push({ x: x - u * 0.62, y: y - u * 0.56, w: u * 1.24, h: u * 1.12, color: i % 2 === 0 ? WRAP_DARK : WRAP_RED, alpha: 0.97 });
  }

  // 柄頭
  {
    const t = 0.04;
    const x = xAt(t);
    const y = yAt(t);
    rects.push({ x: x - u * 0.66, y: y - u * 0.6, w: u * 1.32, h: u * 0.72, color: POMMEL, alpha: 0.95 });
  }

  return rects;
};
