// ★近接の「当たった所」(社長実機報告2026-11-09「研究所の塊、当たり判定と壁判定が合ってない?」→「近接が当たらない(格闘でやってる)」
// →「塊のは当たりエフェクトが無いとか?」・社長「はい」=共通の作りで直す)。
//
// 近接(格闘・ナイフ・刀)の炸裂・火花・ダメージ数字・壁の見通しを、敵の箱の**中心**ではなく
// **攻撃の起点から見た箱の最寄りの点(少しだけ内側)**で測る/出す。
// 内側へ寄せる量は箱の半分を上限にする=**小さな敵(幅・高さが 2×INSET 以下)では今までどおり箱の中心**になり、
// 大きな箱(研究所の塊 743×300 など)だけ、殴った所の少し内側になる。描画にも store にも依存しない純関数。

export interface ImpactBox { x: number; y: number; width: number; height: number }

/** 箱の縁から内側へ寄せる量(px)。箱の半分を超えない(小さな敵は中心のまま)。 */
export const MELEE_IMPACT_INSET_PX = 24;
/** ダメージ数字を当たった所からどれだけ上に出すか(px)。箱の上の縁より上には出さない=小さな敵は今までどおり箱の上の縁。 */
export const MELEE_NUMBER_LIFT_PX = 48;

const clamp = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

/** 攻撃の起点 (fx,fy) から見た、箱の最寄りの点を内側へ寄せた点。 */
export const meleeImpactPoint = (fx: number, fy: number, b: ImpactBox, inset = MELEE_IMPACT_INSET_PX): { x: number; y: number } => {
  const ix = Math.min(b.width / 2, inset), iy = Math.min(b.height / 2, inset);
  return { x: clamp(fx, b.x + ix, b.x + b.width - ix), y: clamp(fy, b.y + iy, b.y + b.height - iy) };
};

/** ダメージ数字の出す点(当たった所の真上・箱の上の縁より上には出さない)。小さな敵では今までどおり(箱の中心の x・上の縁)。 */
export const meleeNumberPoint = (fx: number, fy: number, b: ImpactBox): { x: number; y: number } => {
  const p = meleeImpactPoint(fx, fy, b);
  return { x: p.x, y: Math.max(b.y, p.y - MELEE_NUMBER_LIFT_PX) };
};

/** 線分 a→b と箱の最短距離(交われば 0)。帯の当たり(5段目の突き抜け・一閃)を箱の縁で測る。 */
export const segmentBoxDist = (ax: number, ay: number, bx: number, by: number, r: ImpactBox): number => {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
  // 交差(スラブ法)
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1, hit = true;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as const) {
    if (p === 0) { if (q < 0) { hit = false; break; } continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) { hit = false; break; } if (t > t0) t0 = t; }
    else { if (t < t0) { hit = false; break; } if (t < t1) t1 = t; }
  }
  if (hit && t0 <= t1) return 0;
  const ptBox = (px: number, py: number) => Math.hypot(px - clamp(px, x0, x1), py - clamp(py, y0, y1));
  const ptSeg = (px: number, py: number) => {
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  };
  return Math.min(ptBox(ax, ay), ptBox(bx, by), ptSeg(x0, y0), ptSeg(x1, y0), ptSeg(x0, y1), ptSeg(x1, y1));
};

/**
 * 向きのある帯(起点・単位ベクトル・長さ・半幅)と箱が重なるか(分離軸)。端は丸めない(平ら)=小さな敵では中心で測る旧式と同じか内側。
 * 帯の先・元を半幅ぶん伸ばす丸い端(線分との最短距離)だと、小さな敵への届きが前後に半幅ずつ伸びてしまうので使わない。
 */
export const bandBoxOverlap = (
  px: number, py: number, ux: number, uy: number, len: number, halfW: number, b: ImpactBox,
): boolean => {
  const cx = b.x + b.width / 2 - px, cy = b.y + b.height / 2 - py;
  const nx = -uy, ny = ux;
  const ca = cx * ux + cy * uy, ea = (b.width * Math.abs(ux) + b.height * Math.abs(uy)) / 2;
  if (ca + ea < 0 || ca - ea > len) return false;
  const cn = cx * nx + cy * ny, en = (b.width * Math.abs(nx) + b.height * Math.abs(ny)) / 2;
  if (cn + en < -halfW || cn - en > halfW) return false;
  // 箱の軸(x・y): 帯の4隅の範囲
  const xs = [0, ux * len].flatMap(a => [a + nx * halfW, a - nx * halfW]);
  const ys = [0, uy * len].flatMap(a => [a + ny * halfW, a - ny * halfW]);
  if (Math.max(...xs) < b.x - px || Math.min(...xs) > b.x + b.width - px) return false;
  if (Math.max(...ys) < b.y - py || Math.min(...ys) > b.y + b.height - py) return false;
  return true;
};
