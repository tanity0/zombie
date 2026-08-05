// ゲーム本編のエントリ。**ボスメーカーは import しない**(BOSS_MAKER.md §19-5)。
// `App` に `playingOverlay` を渡さないので、道具のコードはこのバンドルから木ごと落ちる。
// 道具の入口は `bossmaker.html` → `src/tools/bossmaker/main.tsx`。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { bootstrapRuntime } from './bootstrap';

bootstrapRuntime();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
