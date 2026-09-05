// Game font (English / numbers / titles / Pixi text).
//
// LOCKED to Orbitron (社長指示「Orbitronのみで固定」). The previous ?font= /
// localStorage switching is removed so a stale stored preference can no longer
// flip English/numbers to another face — it is always Orbitron now.
//
// We self-host Orbitron (woff2 in public/fonts/) so the look is identical on
// every device and keeps working offline. Japanese glyphs are NOT in the subset
// — they fall back to the system JP fonts in the stack below, which is intended.
//
// This drives BOTH the DOM HUD (via the --game-font CSS variable set in
// main.tsx) and the PixiJS text / damage-number atlas (FONT_STACK).

// Primary @font-face family name (declared in index.css).
export const FONT_FAMILY = 'Orbitron';

// Japanese / system fallbacks appended after Orbitron.
const JP_FALLBACK = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';

// Full family stack used everywhere (DOM via CSS var, Pixi Text, canvas2d).
export const FONT_STACK = `"${FONT_FAMILY}", ${JP_FALLBACK}`;
