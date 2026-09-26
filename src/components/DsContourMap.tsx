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

// クリエイティブ監査第2回・第2手 B-4: 箱を約1.4倍に伸ばす(旧150px→210px、空白の6割を埋める)。
// ラベルの固定px位置は旧箱で校正されていたので、丘の目印(threat=H*0.42/goal=H*0.72)からの
// オンスクリーン座標(canvas座標×箱の縦スケール)を再計算し、旧箱での余白(29px/8px)を保つ。
const CONTOUR_H_STRETCH_BOX = 210;
const CONTOUR_BOX_SCALE = CONTOUR_H_STRETCH_BOX / CONTOUR_H;
const THREAT_LABEL_TOP = Math.round(CONTOUR_H * 0.42 * CONTOUR_BOX_SCALE - 29);
const GOAL_LABEL_BOTTOM = Math.round(CONTOUR_H_STRETCH_BOX - CONTOUR_H * 0.72 * CONTOUR_BOX_SCALE + 8);

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
  // クリエイティブ監査第2回・第2手 B-4: 箱を約1.4倍(150→210px)に伸ばして空白を埋める(.ds-mapの
  // height:150pxはindex.css側=編集不可のCSSファイルなので、ここでinline styleで上書きする)。
  // ラベルの固定px位置は旧150px箱で校正されていた(#1「◆に文字が重なる」の再発防止)ので、
  // 新しい箱の高さに合わせて丘の目印(threat=H*0.42/goal=H*0.72、Hはcanvas座標のCONTOUR_H)からの
  // 相対位置を再計算しておく(見た目だけの調整・当たり判定等には無関係)。
  const MAP_BOX_H = Math.round(CONTOUR_H_STRETCH_BOX);
  return (
    <div className="ds-map" style={{ height: MAP_BOX_H }}>
      <canvas ref={canvasRef} width={CONTOUR_W} height={CONTOUR_H} />
      <span className="ds-map-tag">SECTOR — {sectorLabel}</span>
      {/* ラベル2つ=DOM固定位置・確定文字列(監査A-10)。 */}
      <span className="ds-map-label" style={{ right: 14, top: THREAT_LABEL_TOP }}>変異体 目撃地点<i>THREAT REPORT</i></span>
      {/* bottom = ◆(goal・H*0.72)の少し上に置く(旧150px箱でのbottom:50=8pxの余白を維持)。旧 bottom:22 は
          ◆がラベル1文字目に重なっていた(クリエイティブ監査2026-09-11 #1「『の』が壊れて見える」の正体)。 */}
      <span className="ds-map-label" style={{ right: 26, bottom: GOAL_LABEL_BOTTOM }}>次の目標<i>SURVEY POINT</i></span>
    </div>
  );
};

export default DsContourMap;
