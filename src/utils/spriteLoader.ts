// Sprite loading + atlas support.
//
// Primary source is a single `atlas.png`. The sprites in it are NOT on a
// regular grid — they were generated at varying sizes — so each one is keyed
// to an explicit source rectangle (detected from the atlas's transparent
// gutters). When the atlas is loaded and the requested name has a rect, we
// draw it via the 9-arg `drawImage` form, scaled to fit the caller's target
// box while preserving aspect ratio and anchoring to the bottom-center (so
// feet line up with the ground shadow).
//
// Anything without a rect (the hand-picked `player.png`) falls through to the
// per-file loader at `public/sprites/<name>.png`.

const cache = new Map<string, HTMLImageElement | null>();

const base = import.meta.env.BASE_URL; // resolves to '/vs/' in production
const spriteAssetVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export const spritePath = (name: string): string =>
  `${base}sprites/${name}.png?v=${encodeURIComponent(spriteAssetVersion)}`;

const ATLAS_NAME = 'atlas';

// Source rectangles inside atlas.png as [sx, sy, sw, sh]. `player` is
// deliberately absent so it falls through to the per-file loader.
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

export const getSprite = (name: string): HTMLImageElement | null => {
  const path = spritePath(name);
  if (cache.has(path)) return cache.get(path) ?? null;
  cache.set(path, null);
  const img = new Image();
  img.onload = () => cache.set(path, img);
  img.onerror = () => cache.set(path, null);
  img.src = path;
  return null;
};

// Eagerly kick off loads for a set of names so they're cached before the
// first frame that needs them. Call once at app startup. The atlas is always
// preloaded so the very first frame can already use it.
export const preloadSprites = (names: string[]) => {
  getSprite(ATLAS_NAME);
  names.forEach(getSprite);
};

// Draw a sprite. Atlas first (for any name that has a rect), then per-file
// fallback. Smoothing is disabled so pixel edges stay crisp at any scale.
// Returns true if something was drawn.
export const drawSprite = (
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  flipH = false
): boolean => {
  const rect = ATLAS_RECTS[name];
  const atlas = rect ? getSprite(ATLAS_NAME) : null;
  if (rect && atlas) {
    const [sx, sy, sw, sh] = rect;
    // Fit the source into the target box preserving aspect ratio (contain).
    const scale = Math.min(width / sw, height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    // Bottom-center anchor: horizontally centered, feet on the box's bottom
    // edge so the sprite sits on its ground shadow.
    const dx = x + (width - dw) / 2;
    const dy = y + (height - dh);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flipH) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(atlas, sx, sy, sw, sh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  const img = getSprite(name);
  if (!img) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flipH) {
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, width, height);
  } else {
    ctx.drawImage(img, x, y, width, height);
  }
  ctx.restore();
  return true;
};
