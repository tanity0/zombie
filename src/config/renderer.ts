// Renderer selection for the world view.
//
// The PixiJS scene graph is now the primary (default) renderer and the only
// one under active development. The legacy Canvas2D renderer is still reachable
// via ?renderer=canvas as a fallback/reference, but is no longer maintained.
//
// Selection priority (highest first):
//   1. URL query    ?renderer=pixi  | ?renderer=canvas
//   2. localStorage  key 'zombie:renderer'
//   3. default       'pixi'
//
// The choice is read once at module load so a session never flips renderers
// mid-run. Change it via the URL or localStorage, then reload.

export type RendererKind = 'canvas' | 'pixi';

const STORAGE_KEY = 'zombie:renderer';

const read = (): RendererKind => {
  if (typeof window === 'undefined') return 'pixi';
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
  return 'pixi';
};

const SELECTED: RendererKind = read();

export const isPixiRenderer = (): boolean => SELECTED === 'pixi';
