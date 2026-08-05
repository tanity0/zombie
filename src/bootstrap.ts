// 起動時の共通処理(v0.25.2849・BOSS_MAKER.md §19-5-c)。
//
// 切り出した理由: エントリが `index.html`(ゲーム本編)と `bossmaker.html`(ボスメーカー)の**2つ**に
// なったため。ここを片方だけ再現し損ねると、**フォントが違う状態で PixiJS がダメージ数字の
// アトラスを焼く**・ピンチ拡大が漏れる等の差が静かに出る。両エントリがこの1本を呼ぶ。
// 中身は旧 `src/main.tsx` の内容そのまま(実行内容は不変=純粋な切り出し)。
import { FONT_FAMILY, FONT_STACK } from './config/font';
import { installPracticeGuard } from './utils/practiceGuard';

export const bootstrapRuntime = (): void => {
  // 練習ラン(ボスラッシュ)なら、ここから先の localStorage 書き込みを全て封じる
  // (BOSS_MAKER.md §20-6 / utils/practiceGuard.ts)。React を描く前に必ず通る。
  installPracticeGuard();

  // Apply the chosen game font (?font=) to the DOM via a CSS variable, and kick
  // off loading the woff2 immediately so it is ready before the first paint and,
  // crucially, before PixiJS bakes its damage-number atlas / draws text.
  document.documentElement.style.setProperty('--game-font', FONT_STACK);

  // ネイティブ感: 長押し/右クリックのコンテキストメニュー(画像保存・リンク等)を全面抑止する。
  // CSS の -webkit-touch-callout だけでは Android WebView/デスクトップで漏れるため、保険でJSでも止める。
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // iOS は touch-action / viewport だけだとピンチ拡大・ダブルタップ拡大・テキスト選択ルーペ(虫眼鏡)を
  // 取りこぼす(特にホーム画面起動のWKWebView)。操作面をゲームが完全に支配するため、JSで明示的に握り潰す。
  // - gesture*：iOS独自のピンチズーム。preventDefault で無効化。
  // - ダブルタップ：直前のtouchendから一定時間内の2発目を preventDefault して拡大/ルーペを殺す。
  //   ゲーム入力は Pointer Events(joystick/カウンター)で別経路に来るため、これに影響しない。
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) =>
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
  );
  let lastTouchEndTs = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = e.timeStamp;
      if (now - lastTouchEndTs <= 320) e.preventDefault(); // ダブルタップ拡大/虫眼鏡を抑止
      lastTouchEndTs = now;
    },
    { passive: false }
  );
  try {
    void document.fonts.load(`700 30px "${FONT_FAMILY}"`);
    void document.fonts.load(`500 16px "${FONT_FAMILY}"`);
  } catch {
    // document.fonts unsupported (very old browsers) — CSS @font-face still loads on use.
  }
};
