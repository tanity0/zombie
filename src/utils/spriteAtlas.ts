// Source rectangles inside public/sprites/atlas.png as [sx, sy, sw, sh].
//
// Shared by both renderers:
// - Canvas fallback: src/utils/spriteLoader.ts
// - PixiJS renderer: src/pixi/pixiTextures.ts
//
// Keep `player` out of this map. It intentionally loads from the standalone
// public/sprites/player.png file so player swaps do not require atlas rebuilds.
export const ATLAS_RECTS = {
  zombie: [12, 12, 252, 278],
  bat: [276, 12, 238, 200],
  skeleton: [526, 12, 200, 283],
  plant: [738, 12, 247, 280],
  ghost: [997, 12, 229, 227],
  werewolf: [1238, 12, 273, 250],
  pumpkin: [12, 307, 222, 252],
  giantbat: [246, 307, 321, 269],
  reaper: [579, 307, 228, 275],
  tree: [819, 307, 250, 275],
  'pickup-xp-blue': [1081, 307, 99, 144],
  'pickup-xp-green': [1192, 307, 113, 167],
  'pickup-xp-red': [1317, 307, 136, 180],
  'pickup-health': [12, 594, 191, 158],
  'pickup-magnet': [215, 594, 207, 158],
  'pickup-bomb': [434, 594, 153, 187],
  'pickup-chest': [599, 594, 202, 207],
} as const satisfies Record<string, readonly [number, number, number, number]>;
