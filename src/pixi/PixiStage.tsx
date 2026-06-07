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
        roundPixels: true,
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
      window.__zombieCapturePng = (filename: string) => {
        app.renderer.render(app.stage);
        const canvas = app.renderer.extract.canvas({
          target: app.stage,
          resolution: 1,
          clearColor: '#0b0b12',
        });
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const lines = window.__zombiePerfDebug ?? [];
          const pad = 8;
          const lineH = 13;
          const boxW = 132;
          const boxH = Math.max(24, lines.length * lineH + pad * 2);
          const x = canvas.width - boxW - 10;
          const y = 10;
          ctx.fillStyle = 'rgba(0,0,0,0.78)';
          ctx.fillRect(x, y, boxW, boxH);
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
          ctx.font = '11px monospace';
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          lines.forEach((line, i) => {
            ctx.fillText(line, x + pad, y + pad + i * lineH);
          });
        }
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        return true;
      };

      app.ticker.add(() => scene.sync());
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (window.__zombieCapturePng) delete window.__zombieCapturePng;
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
