import React, { useEffect, useRef } from 'react';
import { Application, Assets } from 'pixi.js';
import { buildLayers } from './layers';
import { ensureTextures } from './pixiTextures';
import { PixiScene } from './pixiScene';
import { useGameStore } from '../store/gameStore';
import { setAudioSuspended } from '../audio/audioManager';
import { computeViewport } from '../utils/viewport';
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
}

// PixiJS world renderer — the default and only actively-developed renderer.
// (The legacy Canvas2D <GameCanvas> stays reachable via ?renderer=canvas as a
// fallback/reference only.) It reads the SAME store every ticker frame and
// never writes gameplay state. useGameLoop stays the sole simulation clock;
// this only draws.
//
// The React HUD renders unchanged as DOM on top of this canvas.
const PixiStage: React.FC<PixiStageProps> = ({ width, height }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<PixiScene | null>(null);
  const tickerCallbackRef = useRef<(() => void) | null>(null);
  const pauseUnsubRef = useRef<(() => void) | null>(null);   // isPaused購読の解除(電池対策)
  const visHandlerRef = useRef<(() => void) | null>(null);   // visibilitychangeハンドラ(電池対策)

  // One-time init. Async (Pixi v8 + texture load); a cancel flag guards the
  // StrictMode double-mount / fast-unmount race.
  useEffect(() => {
    let cancelled = false;
    let syncErrorLogged = false;
    const host = hostRef.current;
    const app = new Application();
    appRef.current = app; // 早期に保持: 非同期init中にunmountしても cleanup で確実に破棄できる

    (async () => {
      await app.init({
        width,
        height,
        antialias: false, // pixel art — keep edges crisp
        roundPixels: true,
        background: 0x0b0b12,
        resolution: Math.min(window.devicePixelRatio || 1, resolutionCap()),
        autoDensity: true,
      });
      setAppliedResolution(app.renderer.resolution); // 診断表示用(実際に効いている値)
      if (cancelled) return;
      await ensureTextures();
      const BASE = import.meta.env.BASE_URL;
      // コア背景4枚だけ並列で待ってシーンを即起動(黒画面を最短化)。ステージ別の追加テクスチャは
      // シーン開始後に非同期注入する(セッターは遅延注入対応=後から差し替わる)。
      const [farTexture, groundTexture, horizonForestTexture, frontForestTexture] = await Promise.all([
        Assets.load(`${BASE}backgrounds/distant-night-panorama.jpg`),
        Assets.load(`${BASE}backgrounds/ground-moss-dirt.jpg`),
        Assets.load(`${BASE}backgrounds/horizon-forest-band.png`),
        Assets.load(`${BASE}backgrounds/front-forest-foreground.png`),
      ]);
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

      // 初フレームを画面に出した合図。useGameLoop はこれを待ってから登場演出の時計を開始する
      // (冷間リロードで WebGL init/テクスチャ読込中に演出が黒画面で進む=「まっくら」を防ぐ)。
      try { useGameStore.getState().setRendererReady(true); } catch { /* ignore */ }

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
      const load = (p: string) => Assets.load(`${BASE}${p}`).catch(() => null);
      void (async () => {
        const [labGround, s3Far, s3Ground, s3Horizon, s3Near, s1Near, s2Far, s2Near, s4Far, s4Front, s4Ground, s4Horizon, s3Front, s5Far, s5Horizon, s5Near, s5Front, s5Ground, tutFar, tutGround, tutFlow1, tutFlow2, tutRocks, tutNearRocks, tutFrontRocks] = await Promise.all([
          load('sprites/lab-floor/lab-floor-stage2.png'),
          load('backgrounds/stage3-distant-city-day.jpg'),
          load('backgrounds/stage3-ground-cobble2.jpg'),
          load('backgrounds/stage3-horizon-city.png'),
          load('backgrounds/stage3-near-horizon-city.png'),
          load('backgrounds/stage1-near-forest.png'),
          load('backgrounds/stage2-lab-far.jpg'),
          load('backgrounds/stage2-near-horizon2.png'),
          load('backgrounds/stage4-far.jpg'),
          load('backgrounds/stage4-front2.png'),
          load('backgrounds/stage4-ground.jpg'),
          load('backgrounds/stage4-horizon.png'),
          load('backgrounds/stage3-front-rooftops.png'),
          load('backgrounds/stage5-far.jpg'),
          load('backgrounds/stage5-horizon.png'),
          load('backgrounds/stage5-near-horizon.png'),
          load('backgrounds/stage5-front.png'),
          load('backgrounds/stage5-ground.jpg'),
          load('backgrounds/tutorial-far.jpg'),
          load('backgrounds/tutorial-ground.jpg'),
          load('sprites/tutorial-river-flow-1.png'),
          load('sprites/tutorial-river-flow-2.png'),
          load('backgrounds/tutorial-horizon-rocks.png'),
          load('backgrounds/tutorial-near-rocks.png'),
          load('backgrounds/tutorial-front-rocks.png'),
        ]);
        if (cancelled || sceneRef.current !== scene) return;
        scene.setLabGroundTexture(labGround);            // 研究所スキンの床
        scene.setFarBackdropTexture('lab', s2Far);       // ステージ2(lab)の遠景
        scene.setFarBackdropTexture('city', s3Far);      // ステージ3の遠景
        scene.setFarBackdropTexture('snow', s4Far);      // ステージ4の遠景(雪原の要塞)
        scene.setFarBackdropTexture('stage5', s5Far);    // ステージ5の遠景(紅き月の城塞・社長提供)
        scene.setFarBackdropTexture('tutorial', tutFar); // チュートリアルの遠景(洞窟・社長提供)
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
        scene.setGroundOverride('snow', s4Ground);       // 地面: 雪原(ステージ4)
        scene.setGroundOverride('stage5', s5Ground);     // 地面: 戦場跡(ステージ5・社長提供)
        scene.setHorizonOverride('snow', s4Horizon);     // 地平帯(遠景森1): 氷壁帯(ステージ4・下フェード)
        scene.setHorizonOverride('stage5', s5Horizon);   // 地平帯(遠景森1): 城塞の壁(ステージ5・社長提供)
        scene.setHorizonOverride('tutorial', tutRocks);  // 地平帯(遠景森1): 岩帯(チュートリアル・川に頭が少し被る配置)
      })();
    })().catch((e) => {
      console.error('[PixiStage] init error:', e);
      // フェイルセーフ: 初期化が例外で止まっても、ロードオーバーレイが永久に残らないよう ready にする
      // (背景/テクスチャ読込失敗・WebGL初期化失敗等)。描画は不完全でもソフトロックは防ぐ。
      try { if (!cancelled) useGameStore.getState().setRendererReady(true); } catch { /* ignore */ }
    });

    return () => {
      cancelled = true;
      try { useGameStore.getState().setRendererReady(false); } catch { /* ignore */ } // 次マウント(再戦)も初フレームまで保持
      const a = appRef.current;
      const tick = tickerCallbackRef.current;
      try { pauseUnsubRef.current?.(); } catch { /* ignore */ }
      pauseUnsubRef.current = null;
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
