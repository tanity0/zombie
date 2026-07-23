import React, { useEffect, useRef } from 'react';
import { projectCorridorPillars, CORRIDOR_CFG } from '../utils/corridorProjection';

// ステージ6(洋館)・奥行き通路の【単体プロトタイプ】(?corridor=1・社長相談v0.25.2077)。
// 柱(社長支給・左右ペア)が奥から手前へズームしながら流れてくる循環を実機確認するためだけの
// プレビュー画面。ゲーム本体には一切配線しない(本実装はこの投影式=corridorProjection.tsを
// Pixiの遠景レイヤーへ移植する)。描画はrAFでcanvasへ直描き=React再レンダなし(再レンダ規律)。
// 床は仮のベタ台形(石畳+赤カーペット)。歩行は自動前進(叩き台220px/s)。
const PILLAR_L = `${import.meta.env.BASE_URL}sprites/mansion/pillar-left.png`;
const PILLAR_R = `${import.meta.env.BASE_URL}sprites/mansion/pillar-right.png`;
const WALK_SPEED = 220; // 自動前進(world px/s・叩き台)

const MansionCorridorPreview: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let travel = 0;
    let prev = performance.now();
    const imgs: Record<'l' | 'r', HTMLImageElement> = { l: new Image(), r: new Image() };
    imgs.l.src = PILLAR_L;
    imgs.r.src = PILLAR_R;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      travel += WALK_SPEED * dt;
      const W = canvas.width, H = canvas.height;
      const horizonY = H * CORRIDOR_CFG.horizonYr;
      ctx.clearRect(0, 0, W, H);
      // 背景: 上=闇 / 下=石床のベタ(仮)。
      ctx.fillStyle = '#0a0709';
      ctx.fillRect(0, 0, W, horizonY);
      ctx.fillStyle = '#17121a';
      ctx.fillRect(0, horizonY, W, H - horizonY);
      // 赤カーペット(仮): 消失点から広がる台形。
      ctx.fillStyle = '#3d0e12';
      ctx.beginPath();
      ctx.moveTo(W / 2 - W * 0.015, horizonY);
      ctx.lineTo(W / 2 + W * 0.015, horizonY);
      ctx.lineTo(W / 2 + W * 0.34, H);
      ctx.lineTo(W / 2 - W * 0.34, H);
      ctx.closePath();
      ctx.fill();
      // 柱(奥→手前)。距離フェードはglobalAlphaで黒背景に沈める(仮)。
      for (const p of projectCorridorPillars(travel, W, H)) {
        const img = p.side < 0 ? imgs.l : imgs.r;
        if (!img.naturalWidth) continue;
        const w = (img.naturalWidth / img.naturalHeight) * p.h;
        ctx.globalAlpha = p.fade;
        ctx.drawImage(img, p.x - w / 2, p.y - p.h, w, p.h);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9990 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
        corridor preview(叩き台) v{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}
      </span>
    </div>
  );
};

export default MansionCorridorPreview;
