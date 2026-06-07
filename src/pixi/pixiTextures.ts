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
import { ATLAS_RECTS } from '../utils/spriteAtlas';
import { spritePath } from '../utils/spriteLoader';

const textures = new Map<string, Texture>();
let ready = false;
let loading: Promise<void> | null = null;

// Load the atlas + player image and slice every named frame. Idempotent: the
// first caller kicks off the load, later callers await the same promise.
export const ensureTextures = (): Promise<void> => {
  if (ready) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const [atlas, player, torch, ...playerWalk] = await Promise.all([
      Assets.load(spritePath('atlas')),
      Assets.load(spritePath('player')),
      Assets.load(spritePath('torch')),
      Assets.load(spritePath('player-magnum-walk-0')),
      Assets.load(spritePath('player-magnum-walk-1')),
      Assets.load(spritePath('player-magnum-walk-2')),
      Assets.load(spritePath('player-magnum-walk-3')),
      Assets.load(spritePath('player-striker-walk-0')),
      Assets.load(spritePath('player-striker-walk-1')),
      Assets.load(spritePath('player-striker-walk-2')),
      Assets.load(spritePath('player-striker-walk-3')),
    ]);
    atlas.source.scaleMode = 'nearest';
    player.source.scaleMode = 'nearest';
    torch.source.scaleMode = 'nearest';
    playerWalk.forEach((tex) => {
      tex.source.scaleMode = 'nearest';
    });

    for (const [name, [sx, sy, sw, sh]] of Object.entries(ATLAS_RECTS)) {
      textures.set(
        name,
        new Texture({ source: atlas.source, frame: new Rectangle(sx, sy, sw, sh) })
      );
    }
    textures.set('player', player);
    playerWalk.slice(0, 4).forEach((tex, i) => {
      textures.set(`player-magnum-walk-${i}`, tex);
    });
    playerWalk.slice(4, 8).forEach((tex, i) => {
      textures.set(`player-striker-walk-${i}`, tex);
    });
    textures.set('torch', torch);
    ready = true;
  })();
  return loading;
};

export const texturesReady = (): boolean => ready;

// Texture for an actor/pickup name, or null when there's no art for it (the
// RE-specific pickups and projectiles are drawn procedurally instead).
export const getTexture = (name: string): Texture | null =>
  textures.get(name) ?? null;
