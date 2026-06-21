import React, { useEffect, useRef } from 'react';
import { Application, Assets } from 'pixi.js';
import { buildLayers } from './layers';
import { ensureTextures } from './pixiTextures';
import { PixiScene } from './pixiScene';

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
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
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

      if (host) {
        app.canvas.style.position = 'absolute';
        app.canvas.style.top = '0';
        app.canvas.style.left = '0';
        app.canvas.style.touchAction = 'none';
        host.appendChild(app.canvas);
      }

      const layers = buildLayers(app.stage, groundTexture, farTexture, horizonForestTexture, frontForestTexture);
      const scene = new PixiScene(layers);
      scene.setRenderer(app.renderer); // 可視可能ゾーンの暗幕(RenderTexture合成)に使用
      scene.resize(width, height);

      sceneRef.current = scene;

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

      // ステージ別/ラボの追加テクスチャは後から並列ロード→注入(黒画面を伸ばさない)。
      void (async () => {
        const load = (p: string) => Assets.load(`${BASE}${p}`).catch(() => null);
        const [labGround, s3Far, s3Ground, s3Horizon, s3Near, s1Near, s2Far] = await Promise.all([
          load('sprites/lab-floor/lab-floor-stage2.png'),
          load('backgrounds/stage3-distant-city-day.jpg'),
          load('backgrounds/stage3-ground-cobble.jpg'),
          load('backgrounds/stage3-horizon-city.png'),
          load('backgrounds/stage3-near-horizon-city.png'),
          load('backgrounds/stage1-near-forest.png'),
          load('backgrounds/stage2-lab-far.jpg'),
        ]);
        if (cancelled || sceneRef.current !== scene) return;
        scene.setLabGroundTexture(labGround);            // 研究所スキンの床
        scene.setFarBackdropTexture('lab', s2Far);       // ステージ2(lab)の遠景
        scene.setFarBackdropTexture('city', s3Far);      // ステージ3の遠景
        scene.setStage3Ground(s3Ground);                 // ステージ3の床(石畳)
        scene.setStage3Horizon(s3Horizon);               // ステージ3の地平帯(廃墟都市)
        scene.setNearHorizonTexture('city', s3Near);     // 遠景森2: 廃墟都市(ステージ3)
        scene.setNearHorizonTexture('forest', s1Near);   // 遠景森2: 森シルエット(ステージ1)
      })();
    })().catch((e) => { console.error('[PixiStage] init error:', e); });

    return () => {
      cancelled = true;
      const a = appRef.current;
      const tick = tickerCallbackRef.current;
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
    scene.resize(width, height);
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
