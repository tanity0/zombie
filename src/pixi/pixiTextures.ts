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
  zombie:            [12, 12, 213, 235],
  bat:               [237, 12, 201, 170],
  skeleton:          [450, 12, 170, 239],
  plant:             [632, 12, 210, 237],
  ghost:             [854, 12, 193, 192],
  werewolf:          [1059, 12, 230, 212],
  pumpkin:           [1301, 12, 188, 214],
  giantbat:          [12, 263, 270, 227],
  reaper:            [294, 263, 192, 232],
  tree:              [498, 263, 212, 233],
  'pickup-xp-blue':  [722, 263, 85, 124],
  'pickup-xp-green': [819, 263, 98, 142],
  'pickup-xp-red':   [929, 263, 117, 153],
  'pickup-health':   [1058, 263, 162, 135],
  'pickup-magnet':   [1232, 263, 175, 135],
  'pickup-bomb':     [12, 508, 130, 160],
  'pickup-chest':    [154, 508, 171, 176],
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
