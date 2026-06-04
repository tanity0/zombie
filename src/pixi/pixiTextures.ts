// PixiJS texture provider for the world renderer.
//
// Reuses the EXACT same art the Canvas2D renderer uses: a single `atlas.png`
// (enemies, tree, atlas-backed pickups) plus a standalone `player.png`. Each
// atlas entry is a sub-Texture carved out with an explicit source frame, so
// swapping in real sprites later is just a matter of editing the frames (or
// pointing a name at its own PNG).
//
// Nearest-neighbour scaling keeps the pixel art crisp at any zoom, matching
// the Canvas2D path's `imageSmoothingEnabled = false`.

import { Assets, Rectangle, Texture } from 'pixi.js';
import { spritePath } from '../utils/spriteLoader';

// Mirror of ATLAS_RECTS in spriteLoader.ts. Kept as a separate copy so the
// Canvas2D path stays completely untouched by the Pixi spike. [sx, sy, sw, sh]
const ATLAS_RECTS: Record<string, [number, number, number, number]> = {
  bat:               [300, 97, 233, 139],
  skeleton:          [556, 50, 153, 222],
  zombie:            [768, 54, 198, 218],
  plant:             [1012, 50, 215, 225],
  ghost:             [1258, 49, 178, 225],
  werewolf:          [56, 311, 228, 253],
  pumpkin:           [297, 341, 218, 216],
  giantbat:          [515, 301, 338, 265],
  reaper:            [868, 295, 238, 264],
  tree:              [1121, 303, 203, 258],
  'pickup-xp-blue':  [106, 631, 80, 105],
  'pickup-xp-green': [317, 602, 114, 156],
  'pickup-xp-red':   [544, 586, 148, 180],
  'pickup-health':   [752, 583, 160, 177],
  'pickup-magnet':   [972, 608, 189, 154],
  'pickup-bomb':     [1267, 577, 129, 188],
  'pickup-chest':    [70, 789, 179, 184],
};

const textures = new Map<string, Texture>();
let ready = false;
let loading: Promise<void> | null = null;

// Load the atlas + player image and slice every named frame. Idempotent: the
// first caller kicks off the load, later callers await the same promise.
export const ensureTextures = (): Promise<void> => {
  if (ready) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const [atlas, player] = await Promise.all([
      Assets.load(spritePath('atlas')),
      Assets.load(spritePath('player')),
    ]);
    atlas.source.scaleMode = 'nearest';
    player.source.scaleMode = 'nearest';

    for (const [name, [sx, sy, sw, sh]] of Object.entries(ATLAS_RECTS)) {
      textures.set(
        name,
        new Texture({ source: atlas.source, frame: new Rectangle(sx, sy, sw, sh) })
      );
    }
    textures.set('player', player);
    ready = true;
  })();
  return loading;
};

export const texturesReady = (): boolean => ready;

// Texture for an actor/pickup name, or null when there's no art for it (the
// RE-specific pickups and projectiles are drawn procedurally instead).
export const getTexture = (name: string): Texture | null =>
  textures.get(name) ?? null;
