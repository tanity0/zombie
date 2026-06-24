import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { FONT_FAMILY, FONT_STACK } from './config/font';

// Apply the chosen game font (?font=) to the DOM via a CSS variable, and kick
// off loading the woff2 immediately so it is ready before the first paint and,
// crucially, before PixiJS bakes its damage-number atlas / draws text.
document.documentElement.style.setProperty('--game-font', FONT_STACK);

// ネイティブ感: 長押し/右クリックのコンテキストメニュー(画像保存・リンク等)を全面抑止する。
// CSS の -webkit-touch-callout だけでは Android WebView/デスクトップで漏れるため、保険でJSでも止める。
window.addEventListener('contextmenu', (e) => e.preventDefault());
try {
  void document.fonts.load(`700 30px "${FONT_FAMILY}"`);
  void document.fonts.load(`500 16px "${FONT_FAMILY}"`);
} catch {
  // document.fonts unsupported (very old browsers) — CSS @font-face still loads on use.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

