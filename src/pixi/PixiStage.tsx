import React, { useEffect, useRef } from 'react';
import { Application, Assets } from 'pixi.js';
import { buildLayers } from './layers';
import { ensureTextures } from './pixiTextures';
import { PixiScene } from './pixiScene';

interface PixiStageProps {
  width: number;
  height: number;
}

// PixiJS world renderer (phase-1 spike). Drop-in alternative to <GameCanvas>:
// it reads the SAME store every ticker frame and never writes gameplay state.
// useGameLoop stays the sole simulation clock; this only draws.
//
// The React HUD renders unchanged as DOM on top of this canvas.
const PixiStage: React.FC<PixiStageProps> = ({ width, height }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<PixiScene | null>(null);

  // One-time init. Async (Pixi v8 + texture load); a cancel flag guards the
  // StrictMode double-mount / fast-unmount race.
  useEffect(() => {
    let cancelled = false;
    const app = new Application();

    (async () => {
      await app.init({
        width,
        height,
        antialias: false, // pixel art — keep edges crisp
        background: 0x0b0b12,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      await ensureTextures();
      const farTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/distant-night-panorama.jpg`);
      const groundTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/ground-moss-dirt.jpg`);
      const horizonForestTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/horizon-forest-band.png`);
      const frontForestTexture = await Assets.load(`${import.meta.env.BASE_URL}backgrounds/front-forest-foreground.png`);
      if (cancelled) {
        app.destroy(true);
        return;
      }

      const host = hostRef.current;
      if (host) {
        app.canvas.style.position = 'absolute';
        app.canvas.style.top = '0';
        app.canvas.style.left = '0';
        app.canvas.style.touchAction = 'none';
        host.appendChild(app.canvas);
      }

      const layers = buildLayers(app.stage, groundTexture, farTexture, horizonForestTexture, frontForestTexture);
      const scene = new PixiScene(layers);
      scene.resize(width, height);

      appRef.current = app;
      sceneRef.current = scene;

      app.ticker.add(() => scene.sync());
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
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
