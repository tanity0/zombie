// Visual spec: how a gameplay hitbox maps to its on-screen drawing box.
//
// CORE RULE — the sprite's look is decoupled from the collision box. Gameplay
// (collision, ranges, ammo, counters) only ever uses Player/Enemy width/height
// from the store. Nothing here feeds back into the simulation; it only decides
// how big to draw a sprite and where its FEET sit, which is also the value used
// for Y-sorting. Swap real sprites in later by changing only these numbers.

import type { Enemy, Player } from '../types/game';

// The player sprite reads as chunky pixel art by drawing larger than its
// hitbox. The visual box is centred on the hitbox CENTRE, so the feet hang
// below the hitbox bottom (matches the Canvas2D renderer exactly).
export const PLAYER_VISUAL_SCALE = 1.7;

// A foot-anchored draw box in WORLD space. `footX/footY` is the bottom-centre
// the sprite is pinned to (also its Y-sort key); `boxW/boxH` is the box the
// texture is "contain"-fitted into.
export interface FootBox {
  footX: number;
  footY: number;
  boxW: number;
  boxH: number;
}

export const playerFootBox = (p: Player): FootBox => {
  const boxW = p.width * PLAYER_VISUAL_SCALE;
  const boxH = p.height * PLAYER_VISUAL_SCALE;
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;
  return { footX: cx, footY: cy + boxH / 2, boxW, boxH };
};

export const enemyFootBox = (e: Enemy): FootBox => ({
  footX: e.x + e.width / 2,
  footY: e.y + e.height,
  boxW: e.width,
  boxH: e.height,
});

// Ground-shadow width per enemy (heavy bosses get a wider, darker pool). Mirror
// of the Canvas2D `drawGroundShadow` calls.
export const enemyShadow = (e: Enemy): { width: number; alpha: number } => {
  const heavy = e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin';
  return { width: e.width * (heavy ? 1.15 : 1), alpha: heavy ? 0.5 : 0.4 };
};
