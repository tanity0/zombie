// ゲーム本編のエントリ。**ボスメーカーは import しない**(BOSS_MAKER.md §19-5)。
// `App` に `playingOverlay` を渡さないので、道具のコードはこのバンドルから木ごと落ちる。
// 道具の入口は `bossmaker.html` → `src/tools/bossmaker/main.tsx`。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { bootstrapRuntime, fontsReady } from './bootstrap';

bootstrapRuntime();

// 同梱書体が揃ってから最初の描画(上限 2.5 秒・bootstrap.ts 参照)。書体が後から差し替わる瞬間を画面に出さないため。
void fontsReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
