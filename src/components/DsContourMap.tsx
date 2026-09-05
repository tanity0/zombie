// 等高線マップ(UI_OVERHAUL.md §3-2・DS2の署名)。ビジュアルの正=アーティファクトv3の等高線canvas。
// - バッキングは632×300固定(監査A-5: モックの定数は632×300専用)。CSSで width:100% / height:150px
//   に伸ばす(DPR対応はしない=点描の淡い線は拡縮で馴染む。ボケが気になったら@2x焼き直し=次バッチ)。
// - 描画はstage idごとに1回だけ(useEffect・rAFなし・アニメなし=負荷0/10)。
// - 丘の中心だけstage idハッシュでシード(utils/dsHome.ts)。半径・しきい値・stepは原典定数のまま。
// - ルート・マーカー・ラベルは固定(監査A-9: シードで動かすとラベルの接続線が何も指さなくなる)。
// - `?dsmap=0` でマップ非表示(切り分け用・LowHpVignette.tsx:5と同型のモジュール定数)。
import React, { useEffect, useRef } from 'react';
import {
  CONTOUR_BAND_EPS, CONTOUR_H, CONTOUR_STEP, CONTOUR_THRESHOLDS, CONTOUR_W,
  contourField, contourHills,
} from '../utils/dsHome';

const DS_MAP_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dsmap') === '0';

const DsContourMap: React.FC<{ stageId: string; sectorLabel: string }> = ({ stageId, sectorLabel }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = CONTOUR_W;
    const H = CONTOUR_H;
    const field = contourField(contourHills(stageId));
    ctx.clearRect(0, 0, W, H);
    // マーチングスクエア風の簡易等高線(サンプリング+しきい値の縁を点描・モック原典のまま)。
    for (let li = 0; li < CONTOUR_THRESHOLDS.length; li++) {
      const t = CONTOUR_THRESHOLDS[li];
      ctx.beginPath();
      for (let y = 0; y < H; y += CONTOUR_STEP) {
        for (let x = 0; x < W; x += CONTOUR_STEP) {
          if (Math.abs(field(x, y) - t) < CONTOUR_BAND_EPS) ctx.rect(x, y, 1.2, 1.2);
        }
      }
      ctx.fillStyle = li % 3 === 2 ? 'rgba(255,179,64,0.5)' : 'rgba(255,179,64,0.18)';
      ctx.fill();
    }
    // ルート(アンバーの点線・固定=モックのベジェそのまま)。
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(255,179,64,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(W * 0.08, H * 0.86);
    ctx.bezierCurveTo(W * 0.3, H * 0.75, W * 0.45, H * 0.5, W * 0.66, H * 0.42);
    ctx.stroke();
    ctx.setLineDash([]);
    // 現在地(白角)・脅威(菱形amber)・目標(菱形amber-hi)——位置は固定(モックのまま)。
    const dot = (x: number, y: number, style: 'you' | 'threat' | 'goal') => {
      if (style === 'you') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.strokeRect(x - 6.5, y - 6.5, 13, 13);
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = style === 'threat' ? '#ffb340' : '#ffd28a';
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
      }
    };
    dot(W * 0.08, H * 0.86, 'you');
    dot(W * 0.66, H * 0.42, 'threat');
    dot(W * 0.82, H * 0.72, 'goal');
  }, [stageId]);
  if (DS_MAP_DISABLED) return null;
  return (
    <div className="ds-map">
      <canvas ref={canvasRef} width={CONTOUR_W} height={CONTOUR_H} />
      <span className="ds-map-tag">SECTOR — {sectorLabel}</span>
      {/* ラベル2つ=DOM固定位置・確定文字列(監査A-10)。 */}
      <span className="ds-map-label" style={{ right: 14, top: 34 }}>変異体 目撃地点<i>THREAT REPORT</i></span>
      <span className="ds-map-label" style={{ right: 26, bottom: 22 }}>次の目標<i>SURVEY POINT</i></span>
    </div>
  );
};

export default DsContourMap;
