// 作戦室の地図の NEXT の印から出撃の帯まで降ろす細い線の道筋(research/UIUX_PROPOSAL.md P1)。描画に依らない純関数。
// 座標は画面の px(地図を包む箱の左上が原点・下向きが +y)。
// - 印の真下に文字(地図の下端の場所の名・「ほかの地域」)が無ければ、まっすぐ下へ。
// - 印の x が文字に掛かる時は、文字の上端の手前でなだらかに横へ寄って文字の外側(近い方の脇)を降りる。
// - 脇へ逃げる先が地図の枠の外になる/別の文字に掛かる時は、その脇は使わない。両方使えなければまっすぐ(文字の上を通る)。

export interface LeadBox { l: number; r: number; t: number; b: number }

export interface NextLeadInput {
  x: number; // 印の x
  y0: number; // 線の始まり(印の下)
  y1: number; // 線の終わり(出撃の帯の上の縁)
  avoid: readonly LeadBox[]; // よける文字の箱
  pad: number; // 文字の脇との間
  above: number; // 脇へ寄せ切る高さ(文字の上端との間)
  minX: number; // 脇へ逃げてよい範囲(地図の枠の内側)
  maxX: number;
}

export interface NextLeadRoute { d: string; bendX: number | null }

const f = (n: number) => Math.round(n * 10) / 10;

export const nextLeadRoute = (p: NextLeadInput): NextLeadRoute => {
  const straight = { d: `M${f(p.x)},${f(p.y0)} V${f(p.y1)}`, bendX: null };
  // 印の下にあって、印の x に掛かる文字(上にある物から見る)。
  const hit = p.avoid
    .filter(b => b.b > p.y0 && b.t < p.y1 && p.x > b.l - p.pad && p.x < b.r + p.pad)
    .sort((a, b) => a.t - b.t)[0];
  if (!hit) return straight;
  const clear = (x: number) => x >= p.minX && x <= p.maxX
    && !p.avoid.some(b => b !== hit && b.b > hit.t - p.above && b.t < p.y1 && x > b.l - p.pad && x < b.r + p.pad);
  const sides = [hit.l - p.pad, hit.r + p.pad].filter(clear).sort((a, b) => Math.abs(a - p.x) - Math.abs(b - p.x));
  const nx = sides[0];
  if (nx === undefined) return straight;
  const jy = Math.max(p.y0 + 2, hit.t - p.above);
  // 寄せはなだらかな S 字(地図の軌跡の弧と同じ柔らかさ)。横へ寄る量に応じて縦の長さを取り、文字の上端の手前で寄せ切る。
  const h = Math.max(0, Math.min(Math.max(Math.abs(nx - p.x) * 0.9, 12), jy - p.y0));
  const ys = jy - h, ym = jy - h / 2;
  const d = `M${f(p.x)},${f(p.y0)} V${f(ys)} C${f(p.x)},${f(ym)} ${f(nx)},${f(ym)} ${f(nx)},${f(jy)} V${f(p.y1)}`;
  return { d, bendX: nx };
};
