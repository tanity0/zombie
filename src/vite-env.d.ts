/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
// public/ 全素材の内容ハッシュ表(vite.config.tsがビルド時にgitのblob SHA-1から作って注入・v0.25.2277)。
// キー=BASE_URLを除いた相対パス('sprites/xxx.png' / 'audio/sfx/xxx.mp3')、値=sha1先頭10桁。
// 参照は src/config/assetUrl.ts 経由(直接触らない)。
declare const __ASSET_HASHES__: Record<string, string>;
