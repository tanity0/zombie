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
      const farTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/distant-night-panorama.jpg`);
      // ステージ3の遠景(昼の廃都パノラマ=正午ステージ)。森テーマのまま遠景だけ差し替えるのに使う。
      const stage3FarTexture = await Assets
        .load(`${import.meta.env.BASE_URL}backgrounds/stage3-distant-city-day.jpg`)
        .catch(() => null);
      const groundTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/ground-moss-dirt.jpg`);
      const horizonForestTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/horizon-forest-band.png`);
      const frontForestTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/front-forest-foreground.png`);
      frontForestTexture.source.scaleMode = 'linear';
      // ラボ床(研究所スキン)は森の地面と同じ経路で確実に読み込む(マニフェスト getTexture の不具合回避)。
      const labGroundTexture = await Assets
        .load(`${import.meta.env.BASE_URL}sprites/lab-floor/lab-floor-stage2.png`)
        .catch(() => null);
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
      scene.setLabGroundTexture(labGroundTexture); // 研究所スキンの床に使用(最優先)
      scene.setFarBackdropTexture('city', stage3FarTexture); // ステージ3の遠景差し替え用
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
