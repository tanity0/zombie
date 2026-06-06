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
  zombie:            [12, 12, 252, 278],
  bat:               [276, 12, 238, 200],
  skeleton:          [526, 12, 200, 283],
  plant:             [738, 12, 247, 280],
  ghost:             [997, 12, 229, 227],
  werewolf:          [1238, 12, 273, 250],
  pumpkin:           [12, 307, 222, 252],
  giantbat:          [246, 307, 321, 269],
  reaper:            [579, 307, 228, 275],
  tree:              [819, 307, 250, 275],
  'pickup-xp-blue':  [1081, 307, 99, 144],
  'pickup-xp-green': [1192, 307, 113, 167],
  'pickup-xp-red':   [1317, 307, 136, 180],
  'pickup-health':   [12, 594, 191, 158],
  'pickup-magnet':   [215, 594, 207, 158],
  'pickup-bomb':     [434, 594, 153, 187],
  'pickup-chest':    [599, 594, 202, 207],
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
