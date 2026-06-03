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
    host: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173
    }
  },
});