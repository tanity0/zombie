// Shared obstacle convention for the top-down world: trees today, and walls /
// rocks / props later. Keep this renderer-agnostic (NO PixiJS imports) — wall
// judgment is game logic; PixiJS only draws.
//
// CONVENTION (the project default unless a task says otherwise):
//   The collision rectangle's BOTTOM edge is the object's "foot". The sprite is
//   drawn up from that same foot (anchor 0.5,1 at footX/footY), so the bottom of
//   the hitbox always coincides with the bottom of the picture and the art rises
//   over the box. Build hitboxes with footRect(); resolve movement with
//   resolveAabb(). Collision is rectangle (AABB) only — no per-pixel tests.

export interface Rect { x: number; y: number; width: number; height: number; }

// A hitbox whose BOTTOM-CENTRE is the foot (footX, footY): the bottom edge sits
// on footY and the box extends upward by `height`.
export const footRect = (
  footX: number, footY: number, width: number, height: number
): Rect => ({
  x: footX - width / 2,
  y: footY - height,
  width,
  height,
});

// AABB overlap test — does playerRect intersect wallRect?
export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

// ★POIの「絵に下から触れたら発動」(社長指示2026-11-02・research/POI_TOUCH_SHRINE.md §1)。
// 当たり判定は resolveAabb で押し出されるので「重なったまま」は起きない。押し出された位置(プレイヤーの上端=
// objRect の下端)を、下端に沿った細い帯で拾う。「下から」=プレイヤーの中心が下端より下(画面の手前=建物の正面)の時だけ。
export const TOUCH_SIDE_PAD = 6; // 帯を左右に広げる量(角をかすめた時も拾う)
export const TOUCH_GAP = 8;      // 帯を下端より下へ伸ばす量(押し出しの丸めや1フレの離れを吸収)
export const touchesFromBelow = (actor: Rect, obj: Rect): boolean => {
  const bottom = obj.y + obj.height;
  if (actor.y + actor.height / 2 <= bottom) return false; // 中心が下端より上=横・裏から
  const band: Rect = { x: obj.x - TOUCH_SIDE_PAD, y: bottom - 4, width: obj.width + TOUCH_SIDE_PAD * 2, height: 4 + TOUCH_GAP };
  return rectsOverlap(actor, band);
};

// 線分(x1,y1)-(x2,y2)が矩形 w と交差するか(Liang-Barsky クリップ)。視線/近接の壁越し判定用。
export const segmentIntersectsRect = (
  x1: number, y1: number, x2: number, y2: number, w: Rect
): boolean => {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;          // 平行: 内側ならOK
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  return clip(-dx, x1 - w.x)
    && clip(dx, (w.x + w.width) - x1)
    && clip(-dy, y1 - w.y)
    && clip(dy, (w.y + w.height) - y1);
};

// いずれかの壁が線分を遮るか。
export const segmentBlocked = (
  x1: number, y1: number, x2: number, y2: number, walls: Rect[]
): boolean => walls.some(w => segmentIntersectsRect(x1, y1, x2, y2, w));

// Push `actor` out of every wall along the axis of least penetration and return
// the corrected top-left. Velocity is intentionally left to the caller, so the
// actor slides along a wall edge instead of sticking.
export const resolveAabb = (actor: Rect, walls: Rect[]): { x: number; y: number } => {
  let x = actor.x;
  let y = actor.y;
  for (const w of walls) {
    const overlapX = Math.min(x + actor.width, w.x + w.width) - Math.max(x, w.x);
    const overlapY = Math.min(y + actor.height, w.y + w.height) - Math.max(y, w.y);
    if (overlapX <= 0 || overlapY <= 0) continue; // not overlapping
    if (overlapX < overlapY) {
      x += (x + actor.width / 2) < (w.x + w.width / 2) ? -overlapX : overlapX;
    } else {
      y += (y + actor.height / 2) < (w.y + w.height / 2) ? -overlapY : overlapY;
    }
  }
  return { x, y };
};

// ★障害物に食い込んだアクターを外へ出す(ステージ2「オブジェに食い込んで沸いてる敵がいる(倒せない 動かない)」2026-11-19)。
// resolveAabb は「動いた1歩ぶん」の押し戻し用で、深く埋まった体を1回で外へ出す保証が無い(壁ごとに順に押すので、
// 押し出した先が隣の壁に入ることもある)。こちらは**どの壁にも重ならず・縦の範囲(yMin..yMax=左上yの許容)に収まる**
// 位置のうち、移動量が一番小さいものを返す。候補=重なっている各矩形の上下左右の外側。重なっていなければ null(何もしない)。
// どの候補も駄目な時は resolveAabb を数回重ねた位置を範囲へ寄せて返す(従来より悪くならない)。
export const unstickFromRects = (
  actor: Rect, walls: Rect[], yMin = -Infinity, yMax = Infinity,
): { x: number; y: number } | null => {
  const hits = walls.filter(w => rectsOverlap(actor, w));
  if (hits.length === 0) return null;
  const clear = (x: number, y: number): boolean =>
    y >= yMin && y <= yMax && !walls.some(w => rectsOverlap({ x, y, width: actor.width, height: actor.height }, w));
  const found: { p: { x: number; y: number } | null; d: number } = { p: null, d: Infinity };
  const consider = (x: number, y: number): void => {
    const d = Math.hypot(x - actor.x, y - actor.y);
    if (d < found.d && clear(x, y)) { found.p = { x, y }; found.d = d; }
  };
  for (const w of hits) {
    consider(w.x - actor.width, actor.y);   // 左へ
    consider(w.x + w.width, actor.y);       // 右へ
    consider(actor.x, w.y - actor.height);  // 上へ
    consider(actor.x, w.y + w.height);      // 下へ
  }
  // 隣の壁に当たって1段では出られない時: 出た先から、もう1段(出た先で重なる矩形の外側)を試す。
  if (!found.p) {
    for (const w of hits) {
      const firsts = [
        { x: w.x - actor.width, y: actor.y }, { x: w.x + w.width, y: actor.y },
        { x: actor.x, y: w.y - actor.height }, { x: actor.x, y: w.y + w.height },
      ];
      for (const f of firsts) {
        for (const w2 of walls) {
          if (!rectsOverlap({ x: f.x, y: f.y, width: actor.width, height: actor.height }, w2)) continue;
          consider(w2.x - actor.width, f.y);
          consider(w2.x + w2.width, f.y);
          consider(f.x, w2.y - actor.height);
          consider(f.x, w2.y + w2.height);
        }
      }
    }
  }
  if (found.p) return found.p;
  let p = { x: actor.x, y: actor.y };
  for (let i = 0; i < 4; i++) p = resolveAabb({ x: p.x, y: p.y, width: actor.width, height: actor.height }, walls);
  return { x: p.x, y: Math.max(yMin, Math.min(yMax, p.y)) };
};
