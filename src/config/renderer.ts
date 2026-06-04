// Renderer selection for the world view.
//
// Phase-1 PixiJS spike: the world (background, actors, projectiles, pickups,
// shadows, and the world-space effects[] queue) can be drawn either by the
// original Canvas2D renderer or by the new PixiJS scene graph. The React HUD
// is unchanged in both modes — it overlays the canvas as DOM.
//
// Selection priority (highest first):
//   1. URL query    ?renderer=pixi  | ?renderer=canvas
//   2. localStorage  key 'zombie:renderer'
//   3. default       'canvas'  (Canvas2D stays the default until the Pixi
//                               path has proven itself)
//
// The choice is read once at module load so a session never flips renderers
// mid-run. Change it via the URL or localStorage, then reload.

export type RendererKind = 'canvas' | 'pixi';

const STORAGE_KEY = 'zombie:renderer';

const read = (): RendererKind => {
  if (typeof window === 'undefined') return 'canvas';
  try {
    const q = new URLSearchParams(window.location.search).get('renderer');
    if (q === 'pixi' || q === 'canvas') {
      window.localStorage.setItem(STORAGE_KEY, q);
      return q;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'pixi' || stored === 'canvas') return stored;
  } catch {
    // localStorage can throw in privacy modes — fall through to the default.
  }
  return 'canvas';
};

const SELECTED: RendererKind = read();

export const getRenderer = (): RendererKind => SELECTED;
export const isPixiRenderer = (): boolean => SELECTED === 'pixi';
