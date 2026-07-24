/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
// SFXファイルの内容ハッシュ表(vite.config.tsがビルド時に走査して注入・v0.25.2161)。
// キー=BASE_URLを除いた相対パス('audio/sfx/xxx.mp3')、値=sha1先頭10桁。
declare const __SFX_HASHES__: Record<string, string>;
