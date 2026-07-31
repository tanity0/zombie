import { useGameStore as __dbgStore } from './store/gameStore';
// TEMP DIAGNOSTIC (v0.25.2609 suriel boss-mode repro) — revert before commit.
(window as unknown as Record<string, unknown>).__dbg = __dbgStore;
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

// iOS は touch-action / viewport だけだとピンチ拡大・ダブルタップ拡大・テキスト選択ルーペ(虫眼鏡)を
// 取りこぼす(特にホーム画面起動のWKWebView)。操作面をゲームが完全に支配するため、JSで明示的に握り潰す。
// - gesture*：iOS独自のピンチズーム。preventDefault で無効化。
// - ダブルタップ：直前のtouchendから一定時間内の2発目を preventDefault して拡大/ルーペを殺す。
//   ゲーム入力は Pointer Events(joystick/カウンター)で別経路に来るため、これに影響しない。
['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
);
let lastTouchEndTs = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = e.timeStamp;
    if (now - lastTouchEndTs <= 320) e.preventDefault(); // ダブルタップ拡大/虫眼鏡を抑止
    lastTouchEndTs = now;
  },
  { passive: false }
);
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

