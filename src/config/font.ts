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
// 社長裁定2026-09-12(v0.25.4253): 日本語は端末ゴシックではなく同梱の BIZ UDPGothic(OFL・index.css の @font-face・
// public/fonts/game/)。「日本語がどのサイトでも見る文字」なのがブラウザ感の主因だったため。端末書体は同梱が読めない時の保険。
const JP_FALLBACK = '"BIZ UDPGothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif';

// 和文の明朝(見出し・ボス名カットイン・斬のコールアウト等)。同梱の Shippori Mincho B1(SemiBold 1本)を先頭に。
export const JP_SERIF_STACK = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif';
// カットイン/エンディング用(英字は Georgia のまま・和文だけ同梱明朝)。
export const CUTIN_SERIF_STACK = `Georgia, ${JP_SERIF_STACK}`;

// Full family stack used everywhere (DOM via CSS var, Pixi Text, canvas2d).
export const FONT_STACK = `"${FONT_FAMILY}", ${JP_FALLBACK}`;
