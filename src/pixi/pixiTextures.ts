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
    const playerWalkNames = [
      'player-magnum-walk-0',
      'player-magnum-walk-1',
      'player-magnum-walk-2',
      'player-magnum-game-0',
      'player-magnum-game-1',
      'player-magnum-game-2',
      'player-striker-walk-0',
      'player-striker-walk-1',
      'player-striker-walk-2',
      'player-striker-game-0',
      'player-striker-game-1',
      'player-striker-game-2',
      'player-shotgun-walk-0',
      'player-shotgun-walk-1',
      'player-shotgun-walk-2',
      'player-shotgun-game-0',
      'player-shotgun-game-1',
      'player-shotgun-game-2',
      'player-scavenger-walk-0',
      'player-scavenger-walk-1',
      'player-scavenger-walk-2',
      'player-scavenger-game-0',
      'player-scavenger-game-1',
      'player-scavenger-game-2',
      'dog-walk-0',
      'dog-walk-1',
      'treasure-1',
      'treasure-2',
      'treasure-3',
      'treasure-4',
      'treasure-5',
      'treasure-6',
      'weapon-merchant',
      'quest-futari',
      // 設置型シールド: 上下左右の向き別スプライト(向き=防ぐ面)。
      'shield-up',
      'shield-down',
      'shield-left',
      'shield-right',
      // 設置型デコイ(全方向の単体装置スプライト)。
      'decoy',
    ];
    const [atlas, player, torch, castle, magicCircle, whipHurricane, whip, mirrorBall, ...playerWalk] = await Promise.all([
      Assets.load(spritePath('atlas')),
      Assets.load(spritePath('player')),
      Assets.load(spritePath('torch')),
      Assets.load(spritePath('castle')),
      Assets.load(spritePath('magic-circle')),
      Assets.load(spritePath('whip-hurricane')),
      Assets.load(spritePath('whip')),
      Assets.load(spritePath('mirror-ball')),
      ...playerWalkNames.map(name => Assets.load(spritePath(name))),
    ]);
    atlas.source.scaleMode = 'nearest';
    player.source.scaleMode = 'nearest';
    torch.source.scaleMode = 'nearest';
    castle.source.scaleMode = 'nearest';
    mirrorBall.source.scaleMode = 'nearest'; // ピクセル調を維持
    // 魔法陣はソフトな発光なので linear(既定)のまま — nearest にしない。
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
    playerWalk.forEach((tex, i) => {
      textures.set(playerWalkNames[i], tex);
    });
    textures.set('torch', torch);
    textures.set('castle', castle);
    textures.set('magic-circle', magicCircle);
    textures.set('whip-hurricane', whipHurricane);
    textures.set('whip', whip);
    textures.set('mirror-ball', mirrorBall);
    ready = true;
  })();
  return loading;
};

export const texturesReady = (): boolean => ready;

// Texture for an actor/pickup name, or null when there's no art for it (the
// RE-specific pickups and projectiles are drawn procedurally instead).
export const getTexture = (name: string): Texture | null =>
  textures.get(name) ?? null;
