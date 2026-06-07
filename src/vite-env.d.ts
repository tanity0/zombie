/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  __zombieCapturePng?: (filename: string) => boolean;
  __zombiePerfDebug?: string[];
}
