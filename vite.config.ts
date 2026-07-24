import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
);

// SFXの内容ハッシュ表(v0.25.2161・社長承認): 従来の「?v=版数」一律バストは毎pushで全SEのURLが
// 変わり、更新直後に全音声の再DL+再デコードが走って起動ピーク(=iOSメモリ圧killの一因)を押し上げて
// いた。ファイル内容ハッシュなら「差し替えたSEだけ」URLが変わる。config読込時に走査(51ファイル/
// 3.6MB=瞬時)。表はコードに __SFX_HASHES__ として注入され、audioManager の withVersion が参照する。
const sfxHashes: Record<string, string> = {};
try {
  const sfxDir = fileURLToPath(new URL('./public/audio/sfx', import.meta.url));
  for (const f of readdirSync(sfxDir)) {
    try {
      sfxHashes['audio/sfx/' + f] = createHash('sha1').update(readFileSync(`${sfxDir}/${f}`)).digest('hex').slice(0, 10);
    } catch { /* 読めないファイルはスキップ=版数フォールバック */ }
  }
} catch { /* ディレクトリ不在でも起動は止めない(空表=全て版数フォールバック) */ }

// https://vitejs.dev/config/
export default defineConfig({
  // Repo is served from https://tanity0.github.io/zombie/ on GitHub Pages, so
  // built assets must be referenced under /zombie/ — without this, dist/index.html
  // points at root-absolute /assets/... and the deployed site 404s silently.
  base: '/zombie/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __SFX_HASHES__: JSON.stringify(sfxHashes),
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