// 素材URLのキャッシュバスト(v0.25.2277・社長指示「更新されたものだけダウンロードさせたい」)。
//
// 素材は `public/` に置いてあり、ブラウザには `?v=` 付きのURLで渡す。この `?v=` が変わると
// ブラウザは「別のファイル」とみなして再ダウンロードする。
//  - 旧: `?v=ASSET_VERSION`(手で上げるグローバル版数1個)。**1枚差し替えるために番号を上げると
//    スプライト81MB+音声83MBが丸ごと再DL**になっていた。
//  - 新: `?v=<そのファイルの内容ハッシュ>`。中身が変わったファイルのURLだけが変わる=
//    **差し替えた分だけ再DL**。他は端末のキャッシュがそのまま効く。
//
// ハッシュ表は vite.config.ts がビルド時に git のインデックス(blob SHA-1)から作り、
// `__ASSET_HASHES__` として注入する。表に無いファイル(未追跡・git不在のビルド環境)は
// 従来どおり ASSET_VERSION でバストする=安全側フォールバック。
//
// 【重要】新しい素材を足す時に ASSET_VERSION を上げる必要はもう無い。同名差し替えでも
// gitにコミットした時点でハッシュが変わるので自動で更新される。ASSET_VERSION は
// 「ハッシュが取れなかった時の保険」と「全素材を強制的に再DLさせたい時の非常ボタン」に降格。
import { ASSET_VERSION } from './assetVersion';

// 注意: `define` は識別子を**そのままJSONリテラルへテキスト置換**するので、`__ASSET_HASHES__` を
// 2回書くと34KBの表がバンドルに2回入る。参照は必ずこの1箇所だけにする(未注入環境=
// ReferenceError は catch して空表)。
let injected: Record<string, string> = {};
try { injected = __ASSET_HASHES__; } catch { /* 未注入(素のNode等)なら空表=版数フォールバック */ }
const HASHES = injected;

/**
 * ハッシュ表から `?v=` に載せる値を選ぶ(純関数・テスト対象)。
 * @param hashes public/ 相対パス → 内容ハッシュ
 * @param publicPath BASE_URL を除いた相対パス('sprites/x.png')。先頭の `/` は無視する。
 * @param fallback 表に無い時に使う値
 */
export const pickAssetVersion = (
  hashes: Record<string, string>,
  publicPath: string,
  fallback: string
): string => {
  const rel = publicPath.replace(/^\/+/, '').split('?')[0];
  return hashes[rel] || fallback;
};

/** public/ 相対パス('sprites/x.png')→ `?v=` に載せる版。 */
export const assetVersionFor = (publicPath: string): string =>
  pickAssetVersion(HASHES, publicPath, ASSET_VERSION);

/** public/ 相対パス('sprites/x.png')→ BASE_URL + キャッシュバスト付きの完全URL。 */
export const assetUrl = (publicPath: string): string => {
  const rel = publicPath.replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${rel}?v=${encodeURIComponent(assetVersionFor(rel))}`;
};

/**
 * 既に BASE_URL 付きの完全URLになっているものへ後付けする版(audioManager のSFX表など、
 * URLを先に組んでしまっている呼び出し側向け)。
 */
export const withAssetVersion = (src: string): string => {
  const base = import.meta.env.BASE_URL ?? '/';
  const rel = src.startsWith(base) ? src.slice(base.length) : src;
  return `${src}${src.includes('?') ? '&' : '?'}v=${encodeURIComponent(assetVersionFor(rel))}`;
};
