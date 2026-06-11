import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
);

// https://vitejs.dev/config/
export default defineConfig({
  // Repo is served from https://tanity0.github.io/zombie/ on GitHub Pages, so
  // built assets must be referenced under /zombie/ — without this, dist/index.html
  // points at root-absolute /assets/... and the deployed site 404s silently.
  base: '/zombie/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 5173,
    // host:true で全インターフェイス公開(同一LANの実機テスト用)。
    // hmr.host は指定しない: 指定するとスマホ側で ws://localhost に繋ぎに行き
    // HMR が切れて「コードを直しても反映されない」状態になる。未指定なら
    // Vite がページの origin(PCのLAN IP)から自動判定し、PC/実機の両方で繋がる。
    host: true,
  },
});