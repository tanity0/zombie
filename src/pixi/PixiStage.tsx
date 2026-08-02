import React, { useEffect, useRef } from 'react';
import { Application, Assets } from 'pixi.js';
import { buildLayers } from './layers';
import { ensureTextures } from './pixiTextures';
import { PixiScene } from './pixiScene';
import { useGameStore } from '../store/gameStore';
import { setAudioSuspended } from '../audio/audioManager';
import { computeViewport } from '../utils/viewport';
import { loadProgressBegin, loadProgressDone, loadProgressResetWindow, getLoadProgress, getLoadInFlight, trackLoad } from '../utils/loadProgress';
import { preloadCorridorTextures, CORRIDOR_TEXTURE_NAMES } from './corridorLayer';
import { SORTIE_STAGE_TEXTURE_PATHS, sortieTexturesNeeded } from './stageTextures';

import { setAppliedResolution } from '../config/renderer';

// 描画解像度の上限(電池対策)。スマホ(タッチ端末)は塗り面積=GPU負荷を抑えるため低め、PCは高画質のまま。
// 塗るピクセル数は倍率の2乗で効くので、スマホ 2.0→1.5 で約44%削減。?rescap= でURL上書き(検証/微調整)。
const resolutionCap = (): number => {
  if (typeof window !== 'undefined') {
    const q = Number(new URLSearchParams(window.location.search).get('rescap'));
    if (Number.isFinite(q) && q > 0) return q; // 明示指定が最優先
  }
  let mobile = false;
  if (typeof navigator !== 'undefined') {
    const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
    if (uaData && typeof uaData.mobile === 'boolean') mobile = uaData.mobile;
    else if (typeof window !== 'undefined' && window.matchMedia) mobile = window.matchMedia('(pointer: coarse)').matches;
  }
  // スマホ=1(社長裁定 v0.25.1447): 粗ドット規格のキャラは1ドット≈4画面pxで解像度差のにじみを
  // 呑み込めるため、実機比較(rescap 1/1.5/2/3)で「1は3とほぼ同等・1.5と2はまだら」と判定。
  // 電池・発熱も最軽(塗り面積は1.5比44%)。PC=2.0(高画質)は据え置き。?rescap= で随時上書き可。
  return mobile ? 1 : 2;
};

// (実解像度の診断値は config/renderer.ts の setAppliedResolution 経由で公開する)

interface PixiStageProps {
  width: number;
  height: number;
  // WebGLコンテキストロスト時に親(Game)へ通知→keyを変えて本コンポーネントを再マウント=レンダラ再構築。
  onContextLost?: () => void;
}

// PixiJS world renderer — the default and only actively-developed renderer.
// (The legacy Canvas2D <GameCanvas> stays reachable via ?renderer=canvas as a
// fallback/reference only.) It reads the SAME store every ticker frame and
// never writes gameplay state. useGameLoop stays the sole simulation clock;
// this only draws.
//
// The React HUD renders unchanged as DOM on top of this canvas.
const PixiStage: React.FC<PixiStageProps> = ({ width, height, onContextLost }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<PixiScene | null>(null);
  const tickerCallbackRef = useRef<(() => void) | null>(null);
  const pauseUnsubRef = useRef<(() => void) | null>(null);   // isPaused購読の解除(電池対策)
  const visHandlerRef = useRef<(() => void) | null>(null);   // visibilitychangeハンドラ(電池対策)
  const ctxLostCleanupRef = useRef<(() => void) | null>(null); // webglcontextlostリスナ解除
  const onContextLostRef = useRef(onContextLost);            // リスナから常に最新のコールバックを呼ぶ
  onContextLostRef.current = onContextLost;

  // One-time init. Async (Pixi v8 + texture load); a cancel flag guards the
  // StrictMode double-mount / fast-unmount race.
  useEffect(() => {
    let cancelled = false;
    let syncErrorLogged = false;
    let readyFailsafe = 0; // ローディング解除のフェイルセーフタイマー(下記)
    const host = hostRef.current;
    const app = new Application();
    appRef.current = app; // 早期に保持: 非同期init中にunmountしても cleanup で確実に破棄できる

    (async () => {
      // 出撃ローディングの%(v0.25.1827): この初期化で読む素材をウィンドウ計上する。
      // 通常はキャッシュ済みで一瞬だが、キャッシュ未温(初回/デプロイ直後)は実進捗が見える。
      // 分母(ユニット総数)はここで一括登録=以後はdoneだけ→%は単調増加(v0.25.1829: 逆行修正)。
      // 内訳: スプライトマニフェスト一式=1 + コア背景4 + ステージ別テクスチャ。
      loadProgressResetWindow();
      // 出撃ステージに必要なステージ別テクスチャだけをロード対象にする(v0.25.2166)。
      const neededStageTextures = sortieTexturesNeeded();
      loadProgressBegin(1 + 4 + neededStageTextures.size);
      await app.init({
        width,
        height,
        antialias: false, // pixel art — keep edges crisp
        roundPixels: true,
        // ★v0.25.2787(遠景の1pxの線の切り分け): `?bgtest=1` で下地をマゼンタにする。
        // **線がマゼンタになれば「層と層の間の隙間」で確定**(隙間から下地が覗いている)。
        // 変わらなければ隙間ではなく、どれかの層が実際にその線を描いている。
        background: (typeof window !== 'undefined'
          && new URLSearchParams(window.location.search).get('bgtest') === '1') ? 0xff00ff : 0x0b0b12,
        resolution: Math.min(window.devicePixelRatio || 1, resolutionCap()),
        autoDensity: true,
      });
      setAppliedResolution(app.renderer.resolution); // 診断表示用(実際に効いている値)
      if (cancelled) return;
      await ensureTextures();
      loadProgressDone(); // マニフェスト一式=1ユニット
      const BASE = import.meta.env.BASE_URL;
      // コア背景4枚だけ並列で待ってシーンを即起動(黒画面を最短化)。ステージ別の追加テクスチャは
      // シーン開始後に非同期注入する(セッターは遅延注入対応=後から差し替わる)。
      const [farTexture, groundTexture, horizonForestTexture, frontForestTexture] = await Promise.all([
        Assets.load(`${BASE}backgrounds/distant-night-panorama.jpg`),
        Assets.load(`${BASE}backgrounds/ground-moss-dirt.jpg`),
        Assets.load(`${BASE}backgrounds/horizon-forest-band.png`),
        Assets.load(`${BASE}backgrounds/front-forest-foreground.png`),
      ]);
      loadProgressDone(4);
      frontForestTexture.source.scaleMode = 'linear';
      if (cancelled) return;

      const layers = buildLayers(app.stage, groundTexture, farTexture, horizonForestTexture, frontForestTexture);
      const scene = new PixiScene(layers);
      scene.setRenderer(app.renderer); // 可視可能ゾーンの暗幕(RenderTexture合成)に使用
      // 固定設計ビュー: レンダラは端末px(width×height)のまま、シーンは論理寸法で描き、stage を scale 倍して端末へフィット。
      // これで全端末ほぼ同じ視野(FOV)になり、黒帯も出ない。詳細は utils/viewport.ts。
      const vp = computeViewport(width, height);
      app.stage.scale.set(vp.scale);
      scene.resize(vp.logicalW, vp.logicalH);

      sceneRef.current = scene;
      // devビルド限定: シーングラフ診断用ハンドル(ヘッドレス調査でレイヤー状態を覗く)。prodには出ない。
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pixiScene = scene;

      // ゲーム画面キャプチャの提供者(チュートリアルポップアップの挿絵=実画面・v0.25.1831)。
      // 「見えている画面そのまま」を撮るため、1フレーム描画した直後のキャンバスを dataURL 化する
      // (extract(stage)だとオーバースキャンの霧レイヤー等でstage境界が画面より広く、中央帯だけの
  // 変な切り抜きになる)。preserveDrawingBuffer無しでもrender直後の同期toDataURLは有効。
      useGameStore.getState().setCaptureFrame(() => {
        try {
          // 撮影前にsceneをstoreの現在状態へ同期してから描く。tickerの同期より後に呼ばれる保証が
          // 無いため、同期せず撮ると直近tickerフレーム(実機では更に古いフレーム)が写り
          // 「スクショが巻き戻る」(社長報告v0.25.1838)。
          scene.sync();
          app.render();
          const c = app.canvas as HTMLCanvasElement;
          return c.toDataURL ? c.toDataURL('image/png') : null;
        } catch {
          return null;
        }
      });

      // コア(森)の初回フレームを作ってから即キャンバス表示=黒画面を出さない。
      // 重要(黒画面対策): キャンバスの表示は「ステージ別テクスチャの読み込み」を待たない。
      // 待つと、稀にそのロードが遅延した時にキャンバス未挿入のまま=真っ暗になる(社長報告)。
      try { scene.sync(); } catch { /* 初回syncの失敗は握りつぶす(tickで継続) */ }
      try { app.render(); } catch { /* ignore */ }

      if (host) {
        app.canvas.style.position = 'absolute';
        app.canvas.style.top = '0';
        app.canvas.style.left = '0';
        app.canvas.style.touchAction = 'none';
        host.appendChild(app.canvas);
      }

      // WebGLコンテキストロストの自動復旧(v0.25.2160・実機の「黒画面だけどUIは生きてる」対策)。
      // iOSはメモリ圧等でWebGLコンテキストを落とす。放置するとキャンバスだけ真っ黒のまま
      // HUD(DOM)とシミュ(useGameLoop)は生存=報告の症状そのもの。restoredはiOSでは来ない
      // ことが多い+RenderTexture/ベイク済みプールの復元は信頼できないため、restore待ちはせず
      // 少し置いて(メモリ回収の猶予0.7s)レンダラごと作り直す(親がkeyを変えて再マウント)。
      // シミュ状態は全てstore側にあるので、再構築後はゲームの続きがそのまま描ける。
      {
        const canvas = app.canvas as HTMLCanvasElement;
        let ctxLostHandled = false;
        const onCtxLost = (e: Event) => {
          e.preventDefault();
          if (cancelled || ctxLostHandled) return;
          ctxLostHandled = true;
          console.error('[PixiStage] WebGL context lost — rebuilding renderer');
          try { useGameStore.getState().setRendererReady(false); } catch { /* ignore */ } // 再構築中はローディングを被せる
          window.setTimeout(() => {
            if (!cancelled) { try { onContextLostRef.current?.(); } catch { /* ignore */ } }
          }, 700);
        };
        canvas.addEventListener('webglcontextlost', onCtxLost);
        ctxLostCleanupRef.current = () => canvas.removeEventListener('webglcontextlost', onCtxLost);
      }

      // ローディング解除(rendererReady)は「ステージ別テクスチャの注入完了+シーン反映後」に出す
      // (v0.25.1826・社長指示「一瞬森が映るのを絶対にどうにかしたい」)。従来はここ(森ベースの初フレーム)で
      // 解除していたため、キャッシュ未温だと注入前の素の森スキンが見えていた(全スキンステージ共通)。
      // キャンバス自体は挿入済み=解除まではローディングオーバーレイの下で描画が回る(黒画面にはならない)。
      // 注入が遅延/失敗しても残り続けないよう4秒で強制解除(App側の6秒タイムアウトと二重保険)。
      // 洋館通路(stage-6)は通路テクスチャ(計~10MB)も待つため、フェイルセーフを長めに取る(v0.25.2122)。
      // v0.25.2224の社長報告「ステージ開始してすぐが読み込み終わってない」対策: 旧実装は**進捗に関係なく
      // 4秒で強制解除**していたため、バージョン更新直後(=?v= でキャッシュが全部冷える)にモバイル回線だと
      // 4秒では終わらず、素材が届く前に画面が出ていた。**「一定時間まったく進捗が無い」時だけ解除**に変更する
      // (読み込みが進んでいる限り待つ=正常な低速回線を切らない。本当に停滞した時だけ従来どおり救済)。
      {
        const corridor = useGameStore.getState().corridorMode;
        const stallMs = corridor ? 15000 : 6000;
        const hardCapMs = corridor ? 60000 : 30000; // 応答の来ない通信で永久に待たないための最後の砦
        const t0 = performance.now();
        let lastP = getLoadProgress();
        let lastAt = t0;
        readyFailsafe = window.setInterval(() => {
          if (cancelled) { window.clearInterval(readyFailsafe); return; }
          const now = performance.now();
          const p = getLoadProgress();
          if (p !== lastP) { lastP = p; lastAt = now; }                 // 進捗あり=待つ
          // **まだ返ってきていない通信があるなら停滞ではない**(並列DLでは完了まで進捗が動かないため。
          // v0.25.2225の停滞判定だけだと遅い回線で誤発火し、読み込み途中の画面が出ていた=社長報告v0.25.2230)。
          else if (getLoadInFlight() > 0) lastAt = now;
          if (now - lastAt < stallMs && now - t0 < hardCapMs) return;
          window.clearInterval(readyFailsafe);
          try { useGameStore.getState().setRendererReady(true); } catch { /* ignore */ }
        }, 500);
      }

      // 1フレームの例外で描画が固まって真っ暗になるのを防ぐ(ログは初回だけ。再生は継続)。
      const tick = () => {
        try {
          scene.sync();
        } catch (e) {
          if (!syncErrorLogged) { syncErrorLogged = true; console.error('[PixiStage] sync error (suppressed after first):', e); }
        }
      };
      tickerCallbackRef.current = tick;
      app.ticker.add(tick);

      // 電池対策: 一時停止中(メニュー等)・裏(hidden)では描画tickerを止める=GPUを焼かない。
      //   ・isPaused: メニュー/一時停止中は静止画でいい=描画停止(見た目の劣化なし)。
      //   ・hidden:   タブ/アプリが裏に回ったら描画停止＋BGM一時停止。復帰で再開。
      const applyTickerState = () => {
        const a = appRef.current;
        if (!a) return;
        const shouldRun = !useGameStore.getState().isPaused && !document.hidden;
        if (shouldRun) { if (!a.ticker.started) a.ticker.start(); }
        else if (a.ticker.started) a.ticker.stop();
      };
      pauseUnsubRef.current = useGameStore.subscribe((s, prev) => {
        if (s.isPaused !== prev.isPaused) applyTickerState();
      });
      const onVis = () => { setAudioSuspended(document.hidden); applyTickerState(); };
      visHandlerRef.current = onVis;
      document.addEventListener('visibilitychange', onVis);
      applyTickerState();

      // ステージ別/ラボの追加テクスチャは「表示後」に非同期注入(セッターは遅延注入対応)。
      // 起動時 preloadBackgrounds でキャッシュ済みなので通常はマイクロタスクで解決=初回tick前に注入完了
      // ≒フラッシュ無し。万一キャッシュ未温(稀)でも、表示済みなので黒画面にはならず一瞬森が見えるだけ。
      // 各ステージ別テクスチャ(SORTIE_STAGE_TEXTURE_PATHS)。ユニットはinit冒頭で必要分だけ登録済み。
      // 出撃ステージに不要なパスはロードせずnull(セッターはnull許容=そのステージでは描かれない)。
      // trackLoad で「実行中の通信」として数える=並列DL中にフェイルセーフが誤発火しない(v0.25.2230)。
      // 進捗は**ファイル途中でも刻む**(社長報告v0.25.2231「29から進まない」): 1ファイル=1ユニットのまま、
      // Pixi の onProgress(0..1)の増分を小数で加算する。M2は7枚で計6MBあり、完了時にしか%が動かないと
      // 長時間フリーズしたように見えていた(実際は落ちている最中)。
      const load = (p: string) => {
        if (!neededStageTextures.has(p)) return Promise.resolve(null);
        let reported = 0;
        const bump = (frac: number) => {
          const f = Math.max(0, Math.min(1, frac));
          if (f > reported) { loadProgressDone(f - reported); reported = f; }
        };
        return trackLoad(
          Assets.load(`${BASE}${p}`, bump).catch(() => null).finally(() => bump(1))
        );
      };
      void (async () => {
        // 注意: 分割代入の並びは SORTIE_STAGE_TEXTURE_PATHS の並びと1:1対応(位置結合)。追加時は両方を同順で。
        const [labGround, s3Far, s3Ground, s3Horizon, s3Near, s1Near, s2Far, s2Near, s2Front, s2Front2, s2FarGlass, s2FarFrame, s4Far, s4Front, s4Ground, s4Horizon, s3Front, s5Far, s5Horizon, s5Near, s5Front, s5Ground, tutFar, tutGround, tutFlow1, tutFlow2, tutRocks, tutNearRocks, tutFrontRocks, s7Far, s7Clouds, s1Sky, s1Castle, s1Moon] =
          await Promise.all(SORTIE_STAGE_TEXTURE_PATHS.map(load));
        if (cancelled || sceneRef.current !== scene) return;
        scene.setLabGroundTexture(labGround);            // 研究所スキンの床
        scene.setFarBackdropTexture('lab', s2Far);       // ステージ2(lab)の遠景
        scene.setFarBackdropTexture('city', s3Far);      // ステージ3の遠景
        scene.setFarBackdropTexture('snow', s4Far);      // ステージ4の遠景(雪原の要塞)
        scene.setFarBackdropTexture('stage5', s5Far);    // ステージ5の遠景(紅き月の城塞・社長提供)
        scene.setFarBackdropTexture('tutorial', tutFar); // チュートリアルの遠景(洞窟・社長提供)
        scene.setFarBackdropTexture('stage7', s7Far);    // M7の遠景(星雲・社長提供v0.25.1907)
        scene.setStage7CloudAnim(s7Clouds);              // M7の遠景に重ねる雲=6コマアニメ(社長提供v0.25.1913)
        scene.setStage1SkyAnim(s1Sky);                   // M1の遠景=星空6コマアニメ(社長提供v0.25.1931)
        scene.setStage1CastleTexture(s1Castle);          // M1の星空に重ねる城/山/霧の森(社長提供v0.25.1934)
        scene.setStage1MoonTexture(s1Moon);              // M1の光源=月(クロマキー透過・社長提供v0.25.1951)
        scene.setGroundOverride('tutorial', tutGround);  // 地面: 洞窟の岩土(チュートリアル・社長提供)
        scene.setRiverFlowTextures(tutFlow1, tutFlow2);  // 川の流れ筋2層(チュートリアル・社長提供)
        scene.setStage3Ground(s3Ground);                 // ステージ3の床(石畳)
        scene.setStage3Horizon(s3Horizon);               // ステージ3の地平帯(廃墟都市)
        scene.setNearHorizonTexture('city', s3Near);     // 遠景森2: 廃墟都市(ステージ3)
        scene.setNearHorizonTexture('forest', s1Near);   // 遠景森2: 森シルエット(ステージ1)
        scene.setNearHorizonTexture('lab', s2Near);      // 遠景森2: ステージ2(lab)
        scene.setNearHorizonTexture('stage5', s5Near);   // 遠景森2: 戦場の残骸(ステージ5・社長提供)
        scene.setNearHorizonTexture('tutorial', tutNearRocks); // 遠景森2: 岩帯2(チュートリアル・社長提供)
        scene.setStage3Front(s3Front);                   // 近景森: 屋根帯(ステージ3・mask不変方式)
        scene.setFrontOverride('snow', s4Front);         // 近景森: 氷壁(ステージ4・不透明)
        scene.setFrontOverride('stage5', s5Front);       // 近景森: 戦場の残骸(ステージ5・社長提供)
        scene.setFrontOverride('tutorial', tutFrontRocks); // 近景森: 画面手前・下寄せの岩(チュートリアル・ぼかし)
        scene.setFrontOverride('lab', s2Front);          // 近景森: 什器シルエット(ステージ2・クロマキー透過・社長提供v0.25.2184)
        scene.setFrontOverride2('lab', s2Front2);        // 近景森2(一番手前): 廃研究棟の壁/残骸(ステージ2・クロマキー透過・社長提供v0.25.2192)
        scene.setLabFarWindowTextures(s2FarGlass, s2FarFrame); // 遠景の窓(ガラス奥+フレーム手前・ステージ2・社長提供v0.25.2199)
        scene.setGroundOverride('snow', s4Ground);       // 地面: 雪原(ステージ4)
        scene.setGroundOverride('stage5', s5Ground);     // 地面: 戦場跡(ステージ5・社長提供)
        scene.setHorizonOverride('snow', s4Horizon);     // 地平帯(遠景森1): 氷壁帯(ステージ4・下フェード)
        scene.setHorizonOverride('stage5', s5Horizon);   // 地平帯(遠景森1): 城塞の壁(ステージ5・社長提供)
        scene.setHorizonOverride('tutorial', tutRocks);  // 地平帯(遠景森1): 岩帯(チュートリアル・川に頭が少し被る配置)
        // ステージ6(洋館通路): 通路テクスチャもローディング解除の条件に含める(v0.25.2122・
        // 社長報告「ローディング終わっても画像が読み込み終わってない」対策)。corridorModeはresetGame済み。
        if (useGameStore.getState().corridorMode) {
          loadProgressBegin(CORRIDOR_TEXTURE_NAMES.length);
          await preloadCorridorTextures(() => loadProgressDone());
          if (cancelled || sceneRef.current !== scene) return;
        }
        // ここまでで全ステージ別素材の注入が済んだ=以後は各レイヤーのホールドを解除してよい
        // (未着だった素材はここで森へフォールバック確定。v0.25.2279・社長報告「たまにステージ1が
        // チラッと映る」対策。ホールド自体は pixiScene の syncLab 側)。
        scene.setStageTexturesInjected();
        // 注入をこのフレームのシーンへ反映してからローディングを外す=素の森スキンを1フレームも見せない。
        try { scene.sync(); app.render(); } catch { /* ignore */ }
        window.clearTimeout(readyFailsafe);
        try { useGameStore.getState().setRendererReady(true); } catch { /* ignore */ }
      })();
    })().catch((e) => {
      console.error('[PixiStage] init error:', e);
      // フェイルセーフ: 初期化が例外で止まっても、ロードオーバーレイが永久に残らないよう ready にする
      // (背景/テクスチャ読込失敗・WebGL初期化失敗等)。描画は不完全でもソフトロックは防ぐ。
      // レイヤーのホールドもここで必ず解除する(注入まで辿り着けなかった時に永久に隠れたままに
      // しない=黒い空/黒い地面で固まらせない。v0.25.2279)。
      try { sceneRef.current?.setStageTexturesInjected(); } catch { /* ignore */ }
      window.clearTimeout(readyFailsafe);
      try { if (!cancelled) useGameStore.getState().setRendererReady(true); } catch { /* ignore */ }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(readyFailsafe);
      try { useGameStore.getState().setCaptureFrame(null); } catch { /* ignore */ } // 破棄済みrendererでのキャプチャを防ぐ
      try { useGameStore.getState().setRendererReady(false); } catch { /* ignore */ } // 次マウント(再戦)も初フレームまで保持
      const a = appRef.current;
      const tick = tickerCallbackRef.current;
      try { pauseUnsubRef.current?.(); } catch { /* ignore */ }
      pauseUnsubRef.current = null;
      try { ctxLostCleanupRef.current?.(); } catch { /* ignore */ }
      ctxLostCleanupRef.current = null;
      try { if (visHandlerRef.current) document.removeEventListener('visibilitychange', visHandlerRef.current); } catch { /* ignore */ }
      visHandlerRef.current = null;
      try { setAudioSuspended(false); } catch { /* ignore */ } // 復帰側で確実にBGMを戻す
      try { if (a && tick) a.ticker.remove(tick); } catch { /* ignore */ }
      tickerCallbackRef.current = null;
      try { sceneRef.current?.destroy(); } catch { /* ignore */ }
      sceneRef.current = null;
      try { a?.destroy(true); } catch { /* ignore */ }
      appRef.current = null;
      try { host?.replaceChildren(); } catch { /* ignore */ }
    };
    // Init runs once; resize is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize on prop change.
  useEffect(() => {
    const app = appRef.current;
    const scene = sceneRef.current;
    if (!app || !scene) return;
    app.renderer.resize(width, height);
    // 固定設計ビュー: 端末サイズが変わっても論理ビューは固定FOVに保つ(scale だけ追従)。
    const vp = computeViewport(width, height);
    app.stage.scale.set(vp.scale);
    scene.resize(vp.logicalW, vp.logicalH);
  }, [width, height]);

  // Suppress page scroll/zoom gestures over the canvas (mirrors GameCanvas).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    host.addEventListener('touchmove', prevent, { passive: false });
    host.addEventListener('touchstart', prevent, { passive: false });
    return () => {
      host.removeEventListener('touchmove', prevent);
      host.removeEventListener('touchstart', prevent);
    };
  }, []);

  return <div ref={hostRef} className="absolute top-0 left-0" style={{ touchAction: 'none' }} />;
};

export default PixiStage;
