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
    // 単体PNG。scaleMode 未指定は既定(linear)のまま(魔法陣/鞭のソフト発光用)。
    // nearest=ピクセルアート、linear=高解像度を縮小描画するもの(球/ヘリ)。
    const standalone: { name: string; scaleMode?: 'nearest' | 'linear' }[] = [
      { name: 'player', scaleMode: 'nearest' },
      { name: 'torch', scaleMode: 'nearest' },
      { name: 'castle', scaleMode: 'nearest' },
      { name: 'magic-circle' },        // 既定(linear)のまま
      { name: 'whip-hurricane' },      // 既定のまま
      { name: 'whip' },                // 既定のまま
      { name: 'mirror-ball', scaleMode: 'linear' },
      { name: 'helicopter', scaleMode: 'nearest' }, // ぼかさない(平滑化なし=くっきり)

      ...playerWalkNames.map((name) => ({ name, scaleMode: 'nearest' as const })),
    ];

    // 1アセットのロード失敗が全体を巻き込まないよう個別に握りつぶす。失敗した絵は
    // 未登録(getTexture=null)になり、その描画だけスキップ/手続き描画にフォールバック。
    // 以前は Promise.all で1つでも失敗すると ready が永久に立たず画面が真っ暗になっていた。
    const loadOne = async (name: string): Promise<Texture | null> => {
      try {
        return await Assets.load(spritePath(name));
      } catch (e) {
        console.warn(`[pixiTextures] failed to load sprite "${name}":`, e);
        return null;
      }
    };

    await Promise.all([
      // アトラス(敵/木/一部拾い物)。読めたらフレームを切り出す。失敗時はその絵だけ欠落。
      (async () => {
        const atlas = await loadOne('atlas');
        if (!atlas) return;
        atlas.source.scaleMode = 'nearest';
        for (const [name, [sx, sy, sw, sh]] of Object.entries(ATLAS_RECTS)) {
          textures.set(
            name,
            new Texture({ source: atlas.source, frame: new Rectangle(sx, sy, sw, sh) })
          );
        }
      })(),
      ...standalone.map(async ({ name, scaleMode }) => {
        const tex = await loadOne(name);
        if (!tex) return;
        if (scaleMode) tex.source.scaleMode = scaleMode;
        textures.set(name, tex);
      }),
    ]);

    ready = true; // 一部失敗しても描画は継続(真っ暗を防ぐ)。
  })();
  return loading;
};

export const texturesReady = (): boolean => ready;

// Texture for an actor/pickup name, or null when there's no art for it (the
// RE-specific pickups and projectiles are drawn procedurally instead).
export const getTexture = (name: string): Texture | null =>
  textures.get(name) ?? null;
