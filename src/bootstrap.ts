// 起動時の共通処理(v0.25.2849・BOSS_MAKER.md §19-5-c)。
//
// 切り出した理由: エントリが `index.html`(ゲーム本編)と `bossmaker.html`(ボスメーカー)の**2つ**に
// なったため。ここを片方だけ再現し損ねると、**フォントが違う状態で PixiJS がダメージ数字の
// アトラスを焼く**・ピンチ拡大が漏れる等の差が静かに出る。両エントリがこの1本を呼ぶ。
// 中身は旧 `src/main.tsx` の内容そのまま(実行内容は不変=純粋な切り出し)。
import { FONT_FAMILY, FONT_STACK } from './config/font';
import { installPracticeGuard } from './utils/practiceGuard';

// 同梱書体の読み込み待ち(上限つき)。main.tsx が最初の render の前に待つ。bootstrapRuntime() を呼ぶ前は未解決。
let fontsReadyResolve: (p: Promise<void>) => void = () => {};
export const fontsReady: Promise<void> = new Promise<void>((resolve) => { fontsReadyResolve = (p) => { void p.then(resolve, () => resolve()); }; });

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
    const loads: Promise<unknown>[] = [];
    const warm = (font: string, text?: string) => { loads.push(document.fonts.load(font, text).catch(() => undefined)); };
    warm(`700 30px "${FONT_FAMILY}"`);
    warm(`500 16px "${FONT_FAMILY}"`);
    // 作戦室DS2化(UI_OVERHAUL.md §3-0): DS計器の英字=Rajdhani 3ウェイトも同じ場所で温める
    // (字間.3〜.42emの計器がロード前後で組み直されるチラつき対策)。グローバルフォントは不変。
    warm('300 13px "Rajdhani"');
    warm('500 13px "Rajdhani"');
    warm('600 13px "Rajdhani"');
    // 日本語の同梱書体(社長裁定2026-09-12・v0.25.4253): 本文=BIZ UDPGothic、見出し/カットイン=Shippori Mincho B1。
    // Pixi のコールアウト/名前札も FONT_STACK 経由で同じ書体を使うので、焼く前に和文グリフ込みで温める。
    warm('400 16px "BIZ UDPGothic"', '通常変異体の目撃地点');
    warm('700 16px "BIZ UDPGothic"', '通常変異体の目撃地点');
    warm('400 30px "Shippori Mincho B1"', '作戦地域出撃一時停止');
    warm('600 30px "Shippori Mincho B1"', '作戦地域出撃一時停止');
    // (v0.25.4255・監査B「初回起動で書体が差し替わる瞬間が見える」) 最初の描画は全書体が揃うまで待つ。上限 2.5 秒=遅い回線でも
    // 起動を人質にしない。待ち切れなかった分は従来どおり swap で後から差し替わる。
    fontsReadyResolve(Promise.race([Promise.allSettled(loads).then(() => undefined), new Promise<void>((r) => setTimeout(r, 2500))]));
  } catch {
    // document.fonts unsupported (very old browsers) — CSS @font-face still loads on use.
    fontsReadyResolve(Promise.resolve());
  }
};
