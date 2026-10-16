import React, { useEffect, useRef } from 'react';
import { useHudScale } from './HudScale';
import { AREA_THRESHOLDS, AREA_ZONE_NAMES, areaIndexForDist } from '../utils/enemyUtils';
import { POI_SECTORS } from '../world/pois';

// ★B2(research/THEONE_ROUND2.md §2・社長「一時停止メニューにマップを追加」)。
// 一時停止を開いた時の1回読み(スナップショット)を canvas に1度だけ描く(毎フレーム描かない=負荷0/10)。
// 凡例は作戦室の等高線地図(DsContourMap)と同じ: 自分=白い角(5px+白枠13px・一番大きい) / 脅威=琥珀の菱形 / 目標=琥珀明の菱形。
// 線は点描(琥珀 0.18・今居る区域の輪だけ 0.5)。文字は今居る区域の名だけ(ds-map-tag「SECTOR — ◯◯」)。
export interface PauseMapData {
  player: { x: number; y: number; dirX: number; dirY: number };
  bases: { x: number; y: number; captured: boolean }[];
  pois: { x: number; y: number; kind: 'boss' | 'cave' | 'armory' | 'police' | 'hospital' }[]; // 発見済みだけ
  named: { x: number; y: number }[];
}

const SIZE = 300; // バッキング(正方形)。CSSで箱いっぱいに伸ばす。

export const PauseMap: React.FC<{ data: PauseMapData }> = ({ data }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const hudS = useHudScale();
  const res = Math.min(3, Math.max(1, Math.ceil(hudS * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1))));
  const dist = Math.hypot(data.player.x, data.player.y);
  const zone = areaIndexForDist(dist);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    const C = SIZE / 2;
    // 縮尺: 一番外の輪(深層域の境界)が収まる固定(定数で焼かず AREA_THRESHOLDS を読む)。
    const outer = AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] * 1.06;
    const k = (C - 6) / outer;
    const mx = (x: number) => C + x * k, my = (y: number) => C + y * k;
    // 区画の線(東西南北の境=45°の斜め)。
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = 'rgba(255,179,64,0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i < POI_SECTORS; i++) {
      const a = (Math.PI * 2 * i) / POI_SECTORS - Math.PI / POI_SECTORS;
      ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(C + Math.cos(a) * (C - 4), C + Math.sin(a) * (C - 4)); ctx.stroke();
    }
    // 区域の輪(点描)。今居る区域の内側の輪だけ少し明るい。
    AREA_THRESHOLDS.forEach((r, i) => {
      ctx.setLineDash([1.5, 3.5]);
      ctx.strokeStyle = i === zone - 1 ? 'rgba(255,179,64,0.5)' : 'rgba(255,179,64,0.18)';
      ctx.lineWidth = i === zone - 1 ? 1.4 : 1;
      ctx.beginPath(); ctx.arc(C, C, r * k, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.setLineDash([]);
    const diamond = (x: number, y: number, color: string, size = 3) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = color; ctx.fillRect(-size, -size, size * 2, size * 2); ctx.restore();
    };
    // 拠点: 未解放=脅威(琥珀の菱形) / 解放済み=味方(白の小さな角)。
    for (const b of data.bases) {
      if (b.captured) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(mx(b.x) - 2, my(b.y) - 2, 4, 4); }
      else diamond(mx(b.x), my(b.y), '#ffb340');
    }
    // 発見済みの寄り道・裏ボスの巣=目標(琥珀明の菱形)。
    for (const p of data.pois) diamond(mx(p.x), my(p.y), '#ffd28a');
    // 宿敵=脅威(菱形の中に白の点)。
    for (const n of data.named) { diamond(mx(n.x), my(n.y), '#ffb340', 3.5); ctx.fillStyle = '#fff'; ctx.fillRect(mx(n.x) - 1, my(n.y) - 1, 2, 2); }
    // 自分=白い角(作戦室と同じ・一番大きい)+向きの短い線。
    const px = mx(data.player.x), py = my(data.player.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    ctx.strokeRect(px - 6.5, py - 6.5, 13, 13);
    ctx.fillStyle = '#fff'; ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
    const dl = Math.hypot(data.player.dirX, data.player.dirY) || 1;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (data.player.dirX / dl) * 11, py + (data.player.dirY / dl) * 11); ctx.stroke();
  }, [data, res, zone]);
  return (
    <div className="ds-map" style={{ height: 'auto', aspectRatio: '1 / 1', margin: 0 }}>
      <canvas ref={ref} width={SIZE * res} height={SIZE * res} aria-label="地図" />
      <span className="ds-map-tag">SECTOR — {AREA_ZONE_NAMES[zone] ?? ''}</span>
    </div>
  );
};
