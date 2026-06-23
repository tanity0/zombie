// Game font selection (English / numbers / titles / Pixi text).
//
// We self-host the fonts (woff2 in public/fonts/) so the look is identical on
// every device and keeps working offline once the app is packaged. Japanese
// glyphs are NOT in these subsets — they fall back to the system JP fonts in
// the family stack below, which is intended.
//
// Selection priority (highest first):
//   1. URL query    ?font=orbitron | ?font=rajdhani
//   2. localStorage  key 'zombie:font'
//   3. default       'orbitron'  (confirmed game font)
//
// Read once at module load so a session never flips fonts mid-run. Change via
// the URL or localStorage, then reload. This drives BOTH the DOM HUD (via the
// --game-font CSS variable set in main.tsx) and the PixiJS text/damage atlas.

export type FontKind = 'orbitron' | 'rajdhani';

const STORAGE_KEY = 'zombie:font';

const read = (): FontKind => {
  if (typeof window === 'undefined') return 'orbitron';
  try {
    const q = new URLSearchParams(window.location.search).get('font');
    if (q === 'orbitron' || q === 'rajdhani') {
      window.localStorage.setItem(STORAGE_KEY, q);
      return q;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'orbitron' || stored === 'rajdhani') return stored;
  } catch {
    // localStorage can throw in privacy modes — fall through to the default.
  }
  return 'orbitron';
};

export const ACTIVE_FONT: FontKind = read();

// Primary @font-face family name (declared in index.css).
export const FONT_FAMILY: string = ACTIVE_FONT === 'orbitron' ? 'Orbitron' : 'Rajdhani';

// Japanese / system fallbacks appended after the chosen Latin font.
const JP_FALLBACK = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';

// Full family stack used everywhere (DOM via CSS var, Pixi Text, canvas2d).
export const FONT_STACK = `"${FONT_FAMILY}", ${JP_FALLBACK}`;
