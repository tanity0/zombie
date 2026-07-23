import React, { useEffect, useRef } from 'react';
import { projectCorridorPillars, CORRIDOR_CFG } from '../utils/corridorProjection';

// ステージ6(洋館)・奥行き通路の【単体プロトタイプ】(?corridor=1・社長相談v0.25.2077)。
// 柱(社長支給・左右ペア)が奥から手前へズームしながら流れてくる循環を実機確認するためだけの
// プレビュー画面。ゲーム本体には一切配線しない(本実装はこの投影式=corridorProjection.tsを
// Pixiの遠景レイヤーへ移植する)。描画はrAFでcanvasへ直描き=React再レンダなし(再レンダ規律)。
// 床は仮のベタ台形(石畳+赤カーペット)。歩行は自動前進(叩き台220px/s)。
const PILLAR_L = `${import.meta.env.BASE_URL}sprites/mansion/pillar-left.png`;
const PILLAR_R = `${import.meta.env.BASE_URL}sprites/mansion/pillar-right.png`;
const BACK = `${import.meta.env.BASE_URL}sprites/mansion/back.png`;
const FLOOR = `${import.meta.env.BASE_URL}sprites/mansion/floor.png`;
// 被写界深度(社長指示v0.25.2087・事前ブラー方式=ランタイムぼかしゼロ): ブラー版素材
// (art-src/mansion/make-blur.mjs生成)とシャープ版を奥行きでクロスフェード。
// 手前通過(d<300→-100で0→1)と遠方(d>1000→2400で0→1・上限0.9)がボケ、中距離=ピント面。
const PILLAR_L_BLUR = `${import.meta.env.BASE_URL}sprites/mansion/pillar-left-blur.png`;
const PILLAR_R_BLUR = `${import.meta.env.BASE_URL}sprites/mansion/pillar-right-blur.png`;
const BACK_BLUR = `${import.meta.env.BASE_URL}sprites/mansion/back-blur.png`;
const FLOOR_BLUR = `${import.meta.env.BASE_URL}sprites/mansion/floor-blur.png`;
const BLUR_PAD = 24; // ブラー版素材の余白(make-blur.mjsのpadと一致させること)
const dofWeight = (d: number): number => {
  const near = Math.max(0, Math.min(1, (300 - d) / 400));   // 手前: d=300で0 → d=-100で1
  const far = Math.max(0, Math.min(1, (d - 1000) / 1400));  // 遠方: d=1000で0 → d=2400で1
  return Math.min(0.9, Math.max(near, far));                 // 完全ボケにはしない(上限0.9)
};
const WALK_SPEED = 220; // 自動前進(world px/s・叩き台)
// 床(Mode-7方式): 見下ろしテクスチャを横スライスで遠近マッピング。1リピート=柱1間隔(spacing)相当の
// 前進量=柱と床の流速が同期。幅は柱中心間より広め(石畳が柱の外へ続く)。
const FLOOR_REPEAT = 520;    // 床テクスチャ縦1枚ぶんの前進量(world px・叩き台=spacingと同値)
const FLOOR_W_MULT = 1.0;    // 床の横幅=柱中心間ちょうど(v0.25.2086: 柱の足元=床の縁。床実幅は承認済み1.61Wのまま)
const FLOOR_STRIP = 2;       // スライス高(px)。小さいほど滑らか・重い(プレビューは2で十分)
// 奥の一枚絵(ステンドグラス窓の壁)の固定奥行き(叩き台)。プレビューでは通路が無限ループなので
// 「常にこの距離だけ先に見えている突き当たり」として描く(本実装では通路の終端に置く想定)。
const BACK_DEPTH = 4200; // もっと奥に(社長指示v0.25.2084→2088・旧2600)
const BACK_ALPHA = 0.9; // 距離フォグに沈めない(窓は光っている=闇の中の目標物)
const BACK_WIDTH_MULT = 1.15; // 通路幅(柱中心間)に対する壁の横幅倍率

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
    const imgs: Record<'l' | 'r' | 'b' | 'f' | 'lB' | 'rB' | 'bB' | 'fB', HTMLImageElement> = {
      l: new Image(), r: new Image(), b: new Image(), f: new Image(),
      lB: new Image(), rB: new Image(), bB: new Image(), fB: new Image(),
    };
    imgs.l.src = PILLAR_L;
    imgs.r.src = PILLAR_R;
    imgs.b.src = BACK;
    imgs.f.src = FLOOR;
    imgs.lB.src = PILLAR_L_BLUR;
    imgs.rB.src = PILLAR_R_BLUR;
    imgs.bB.src = BACK_BLUR;
    imgs.fB.src = FLOOR_BLUR;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 幻想ライティング(社長指示v0.25.2088・参考=教会の壁灯): 柱と柱の間の壁に暖色の灯り。
    // 放射グラデは初期化時に1枚だけ事前レンダし、毎フレームは加算合成のdrawImageのみ(=安い)。
    const glowTex = document.createElement('canvas');
    glowTex.width = glowTex.height = 256;
    {
      const g = glowTex.getContext('2d');
      if (g) {
        const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0, 'rgba(255,214,150,0.9)');
        grad.addColorStop(0.25, 'rgba(255,178,96,0.5)');
        grad.addColorStop(0.6, 'rgba(255,140,60,0.16)');
        grad.addColorStop(1, 'rgba(255,120,40,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 256, 256);
      }
    }

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      travel += WALK_SPEED * dt;
      const W = canvas.width, H = canvas.height;
      const horizonY = H * CORRIDOR_CFG.horizonYr;
      ctx.clearRect(0, 0, W, H);
      // 背景: 上=闇 / 下=床のベース色(床テクスチャの外側)。
      ctx.fillStyle = '#0a0709';
      ctx.fillRect(0, 0, W, horizonY);
      ctx.fillStyle = '#0d0a0e';
      ctx.fillRect(0, horizonY, W, H - horizonY);
      // 床(Mode-7): 画面の各行の奥行き d(y)=focal(1/s-1) を逆算し、見下ろしテクスチャの該当行を
      // 横スライスで遠近マッピング(縦は前進量でスクロール・リピート跨ぎは2分割で描く)。
      const ftex = imgs.f;
      if (ftex.naturalWidth) {
        const texW = ftex.naturalWidth, texH = ftex.naturalHeight;
        const footY0 = H * CORRIDOR_CFG.footYr;
        const denom = footY0 - horizonY;
        const sAt = (y: number) => (y - horizonY) / denom;
        const dAt = (y: number) => CORRIDOR_CFG.focal * (1 / Math.max(0.02, sAt(y)) - 1);
        for (let y = Math.ceil(horizonY) + 2; y < H; y += FLOOR_STRIP) {
          const s = sAt(y);
          const d0 = dAt(y), d1 = dAt(y + FLOOR_STRIP);
          // テクスチャ縦: 手前(d小)ほどv大=カーペット紋様が手前へ流れてくる向き。
          const v0 = ((d0 + travel) % FLOOR_REPEAT + FLOOR_REPEAT) % FLOOR_REPEAT / FLOOR_REPEAT * texH;
          let srcH = Math.max(0.5, (d0 - d1) / FLOOR_REPEAT * texH);
          const fw = 2 * W * CORRIDOR_CFG.aisleHalfXr * s * FLOOR_W_MULT;
          const fx = W / 2 - fw / 2;
          const fade = Math.max(0, Math.min(1, (s - 0.12) / 0.5));
          const srcY = texH - v0 - srcH; // 前進で紋様が手前へ来るようv軸を反転
          // 被写界深度: 遠方の床はブラー版テクスチャへクロスフェード(同寸なのでUVは共通)。
          const w = dofWeight(d0);
          const drawFloorSlice = (tex: HTMLImageElement, alpha: number) => {
            if (alpha <= 0.02) return;
            ctx.globalAlpha = alpha;
            if (srcY < 0) {
              // リピート跨ぎ: 2分割で描く。
              const h1 = srcH + srcY; // 正の部分
              if (h1 > 0) ctx.drawImage(tex, 0, 0, texW, h1, fx, y, fw, FLOOR_STRIP * (h1 / srcH));
              ctx.drawImage(tex, 0, texH + srcY, texW, -srcY, fx, y + FLOOR_STRIP * (Math.max(0, h1) / srcH), fw, FLOOR_STRIP * (-srcY / srcH));
            } else {
              ctx.drawImage(tex, 0, srcY, texW, srcH, fx, y, fw, FLOOR_STRIP);
            }
          };
          drawFloorSlice(ftex, fade);
          if (imgs.fB.naturalWidth) drawFloorSlice(imgs.fB, fade * w);
        }
        ctx.globalAlpha = 1;
      }
      // 壁灯(柱と柱の中間・左右の壁ライン上): 柱の投影を半間隔ずらして流用=同じ循環に乗る。
      // 柱より先に描く=灯りは柱の奥(壁側)にあり、手前の柱に部分的に隠れて流れていく。
      for (const m of projectCorridorPillars(travel + CORRIDOR_CFG.spacing / 2, W, H)) {
        if (m.depth < 60 || m.depth > BACK_DEPTH - 300) continue; // 通過中と最奥はスキップ
        const r = m.h * 0.22;                 // 灯りの半径(柱の高さ比例=遠近追従)
        const ly = m.y - m.h * 0.40;          // 灯りの高さ=柱の中腹(壁灯の位置)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = m.fade * 0.85;
        ctx.drawImage(glowTex, m.x - r, ly - r, r * 2, r * 2);
        // 明るい芯(小さめ同グローを重ねて「光源」らしく)。
        ctx.globalAlpha = m.fade * 0.9;
        ctx.drawImage(glowTex, m.x - r * 0.4, ly - r * 0.4, r * 0.8, r * 0.8);
        // 足元の床への照り返し(横長に潰した同グロー・弱め)。
        ctx.globalAlpha = m.fade * 0.3;
        ctx.drawImage(glowTex, m.x - r * 1.1, m.y - r * 0.35, r * 2.2, r * 0.7);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;

      // 奥の壁(ステンドグラス窓)の描画関数: 柱の描画順(奥→手前)の中でBACK_DEPTHの位置に挟む。
      // 被写界深度: シャープ版+ブラー版(パディング分オフセット)をdofWeightでクロスフェード。
      const drawBack = () => {
        const b = imgs.b;
        if (!b.naturalWidth) return;
        const s = CORRIDOR_CFG.focal / (CORRIDOR_CFG.focal + BACK_DEPTH);
        const footY = H * CORRIDOR_CFG.horizonYr + (H * CORRIDOR_CFG.footYr - H * CORRIDOR_CFG.horizonYr) * s;
        const bw = 2 * W * CORRIDOR_CFG.aisleHalfXr * s * BACK_WIDTH_MULT;
        const bh = (b.naturalHeight / b.naturalWidth) * bw;
        const bx = W / 2 - bw / 2, by = footY - bh;
        const w = dofWeight(BACK_DEPTH);
        ctx.globalAlpha = BACK_ALPHA * (1 - w);
        ctx.drawImage(b, bx, by, bw, bh);
        if (imgs.bB.naturalWidth) {
          const k = bw / b.naturalWidth; // 表示スケール(ブラー版はpadぶん大きい)
          ctx.globalAlpha = BACK_ALPHA * w;
          ctx.drawImage(imgs.bB, bx - BLUR_PAD * k, by - BLUR_PAD * k, imgs.bB.naturalWidth * k, imgs.bB.naturalHeight * k);
        }
      };
      // 柱(奥→手前)。距離フェードはglobalAlphaで黒背景に沈める(仮)。
      // BACK_DEPTHより奥の柱→壁→手前の柱、の順に描く(壁より奥はほぼ闇に沈んでいる)。
      // 被写界深度: 各柱はシャープ版(1-w)+ブラー版(w)のクロスフェード(wはdofWeight(depth))。
      let backDrawn = false;
      for (const p of projectCorridorPillars(travel, W, H)) {
        if (!backDrawn && p.depth < BACK_DEPTH) { drawBack(); backDrawn = true; }
        const img = p.side < 0 ? imgs.l : imgs.r;
        if (!img.naturalWidth) continue;
        const w = (img.naturalWidth / img.naturalHeight) * p.h;
        const dof = dofWeight(p.depth);
        const dx = p.x - w / 2, dy = p.y - p.h;
        if (dof < 0.98) {
          ctx.globalAlpha = p.fade * (1 - dof);
          ctx.drawImage(img, dx, dy, w, p.h);
        }
        const blurImg = p.side < 0 ? imgs.lB : imgs.rB;
        if (dof > 0.02 && blurImg.naturalWidth) {
          const k = p.h / img.naturalHeight; // 表示スケール(ブラー版はpadぶん大きい)
          ctx.globalAlpha = p.fade * dof;
          ctx.drawImage(blurImg, dx - BLUR_PAD * k, dy - BLUR_PAD * k, blurImg.naturalWidth * k, blurImg.naturalHeight * k);
        }
      }
      if (!backDrawn) drawBack();
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
