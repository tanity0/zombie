import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
);

// public/ 全素材の内容ハッシュ表(v0.25.2277・社長指示「更新されたものだけダウンロードさせたい」)。
//
// 経緯: 素材URLのキャッシュバストは長らく「?v=ASSET_VERSION」(手で上げる1個のグローバル版数)
// だった。これだと**1ファイル差し替えのために番号を上げた瞬間、スプライト81MB+音声83MBの全URLが
// 変わって全部再DL**になる。SFXだけは先に内容ハッシュ化してあった(v0.25.2161・__SFX_HASHES__)ので、
// 今回それを public/ 全体へ一般化する。
//
// ハッシュの取り方: **gitのインデックスが持つ blob SHA-1 をそのまま使う**。
//  - 速い: 229MB を毎回sha1すると数秒〜十数秒(計測14.5s)かかるが、これは約4ms。
//    dev起動のたびに全素材を読み直さない。
//  - 安定: clone し直しても同じ値になる(mtime方式だとCIのcloneごとに変わり毎デプロイ全再DLになる)。
//  - 正確: gitのblob SHA-1は「ファイル内容のハッシュ」そのもの。中身が変われば必ず変わる。
// 未コミットで書き換え済みのファイルだけは、実内容を読んでハッシュし直す(通常0件・差し替え直後の保険)。
// 表に無いファイル(未追跡・git不在)は従来どおり ASSET_VERSION でバストする=安全側フォールバック。
const assetHashes: Record<string, string> = {};
try {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 }).toString();
  // -z: NUL区切り(非ASCIIファイル名をgitがクォートするのを避ける)。1レコード= "<mode> <sha> <stage>\t<path>"
  for (const rec of git(['ls-files', '-sz', '--', 'public']).split('\0')) {
    const tab = rec.indexOf('\t');
    if (tab < 0) continue;
    const sha = rec.slice(0, tab).split(' ')[1];
    const path = rec.slice(tab + 1);
    if (!sha || !path.startsWith('public/')) continue;
    assetHashes[path.slice('public/'.length)] = sha.slice(0, 10);
  }
  for (const path of git(['diff', '--name-only', '-z', '--', 'public']).split('\0')) {
    if (!path.startsWith('public/')) continue;
    try {
      assetHashes[path.slice('public/'.length)] =
        createHash('sha1').update(readFileSync(`${root}${path}`)).digest('hex').slice(0, 10);
    } catch { /* 消えている/読めないファイルはスキップ=版数フォールバック */ }
  }
} catch { /* gitが無い環境でも起動は止めない(空表=全て版数フォールバック) */ }

// https://vitejs.dev/config/
export default defineConfig({
  // Repo is served from https://tanity0.github.io/zombie/ on GitHub Pages, so
  // built assets must be referenced under /zombie/ — without this, dist/index.html
  // points at root-absolute /assets/... and the deployed site 404s silently.
  base: '/zombie/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __ASSET_HASHES__: JSON.stringify(assetHashes),
  },
  // マルチページ(BOSS_MAKER.md §19-5): 本編 `index.html` と 開発用ツール `bossmaker.html` の2つ。
  // ボスメーカーのUIは `App` に `playingOverlay` を渡す道具側エントリからしか到達できないので、
  // **本編のバンドルからは木ごと落ちる**(=製品ビルドに開発用の約2,400行が載らない)。
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        bossmaker: fileURLToPath(new URL('./bossmaker.html', import.meta.url)),
      },
    },
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