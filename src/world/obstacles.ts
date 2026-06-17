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
