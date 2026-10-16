import React, { useEffect, useRef } from 'react';
import { useHudScale } from './HudScale';
import { AREA_ZONE_NAMES, activeAreaThresholds, areaIndexForDist } from '../utils/enemyUtils';
import { POI_SECTORS } from '../world/pois';

// ★B2(research/THEONE_ROUND2.md §2・社長「一時停止メニューにマップを追加」)。
// 一時停止を開いた時の1回読み(スナップショット)を canvas に1度だけ描く(毎フレーム描かない=負荷0/10)。
// 凡例は作戦室の等高線地図(DsContourMap)の家族: 自分=白い角(5px+白枠13px・一番大きい・向きは枠の一辺に三角の切り欠き)/
// 拠点=四角(未解放=琥珀の枠・解放済み=白の塗り)/ 宿敵=琥珀の菱形(脅威)/ 発見済みの寄り道=琥珀明の点。形で分ける(色相だけで分けない)。
// 縮尺は「描く物の一番遠い物が入る次の輪」まで(箱の6割が空にならない)。外の輪は欠けた弧として縁に残る。
// 今居る帯は両側の輪を明るくし、帯の中をごく薄く塗る。文字は今居る区域の名だけ(ds-map-tag「DEPTH — ◯◯」。SECTOR は作戦室の場所名の語)。
// DS トークン(--ds-*)は .ds-home にしか無いので、ここでメニューの色へ読み替えて持たせる(枠・地・淡色が無効にならないように)。
export interface PauseMapData {
  player: { x: number; y: number; dirX: number; dirY: number };
  bases: { x: number; y: number; captured: boolean }[];
  pois: { x: number; y: number; kind: 'boss' | 'cave' | 'armory' | 'police' | 'hospital' }[]; // 発見済みだけ
  named: { x: number; y: number }[];
}

const SIZE = 300; // バッキング(正方形)。CSSで箱いっぱいに伸ばす。
const AMBER = '#ffb340', AMBER_HI = '#ffd28a';

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
    const AREA_THRESHOLDS = activeAreaThresholds(); // 境界の数字は写さず、今効いている輪を読む(enemyUtils の注記・検収品質監査 B-1)
    // 縮尺: 描く物(自分・拠点・寄り道・宿敵)の一番遠い物を含む次の輪が収まるまで。最低でも2本目の輪、最大で一番外の輪。
    const far = Math.max(dist, ...data.bases.map(b => Math.hypot(b.x, b.y)), ...data.pois.map(q => Math.hypot(q.x, q.y)), ...data.named.map(n => Math.hypot(n.x, n.y)));
    const fit = AREA_THRESHOLDS.find(r => r > far * 1.04) ?? AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1];
    const outer = Math.max(AREA_THRESHOLDS[1], fit) * 1.06;
    const k = (C - 6) / outer;
    const mx = (x: number) => C + x * k, my = (y: number) => C + y * k;
    // 今居る帯の中をごく薄く塗る(どの帯に居るかが一目で読める)。
    const inner = zone > 0 ? AREA_THRESHOLDS[zone - 1] * k : 0;
    const outerBand = zone < AREA_THRESHOLDS.length ? AREA_THRESHOLDS[zone] * k : C * 2;
    ctx.beginPath(); ctx.arc(C, C, outerBand, 0, Math.PI * 2); if (inner > 0) ctx.arc(C, C, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(255,179,64,0.06)'; ctx.fill('evenodd');
    // 区画の線(東西南北の境=45°の斜め)。
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = 'rgba(255,179,64,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < POI_SECTORS; i++) {
      const a = (Math.PI * 2 * i) / POI_SECTORS - Math.PI / POI_SECTORS;
      ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(C + Math.cos(a) * C * 1.5, C + Math.sin(a) * C * 1.5); ctx.stroke();
    }
    // 区域の輪(点描)。今居る帯の両側の輪だけ明るい。箱の外へ出る輪は縁に欠けた弧として残る。
    AREA_THRESHOLDS.forEach((r, i) => {
      const bounds = i === zone - 1 || i === zone;
      ctx.setLineDash([1.5, 3.5]);
      ctx.strokeStyle = bounds ? 'rgba(255,179,64,0.6)' : 'rgba(255,179,64,0.32)';
      ctx.lineWidth = bounds ? 1.4 : 1;
      ctx.beginPath(); ctx.arc(C, C, r * k, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.setLineDash([]);
    // 拠点=四角(場所)。未解放=琥珀の枠 / 解放済み=白の塗り。
    for (const b of data.bases) {
      const x = mx(b.x), y = my(b.y);
      if (b.captured) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x - 3, y - 3, 6, 6); }
      else { ctx.strokeStyle = AMBER; ctx.lineWidth = 1.2; ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); }
    }
    // 発見済みの寄り道・裏ボスの巣=琥珀明の点。
    for (const q of data.pois) { ctx.fillStyle = AMBER_HI; ctx.beginPath(); ctx.arc(mx(q.x), my(q.y), 2.4, 0, Math.PI * 2); ctx.fill(); }
    // 宿敵=脅威(琥珀の菱形・作戦室の脅威と同じ形)。
    for (const n of data.named) {
      ctx.save(); ctx.translate(mx(n.x), my(n.y)); ctx.rotate(Math.PI / 4); ctx.fillStyle = AMBER; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.restore();
    }
    // 自分=白い角(作戦室と同じ・一番大きい)。向きは白枠の一辺に付く小さな三角(線ではなく形で示す)。
    const px = mx(data.player.x), py = my(data.player.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(px - 6.5, py - 6.5, 13, 13);
    ctx.fillStyle = '#fff'; ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
    const dl = Math.hypot(data.player.dirX, data.player.dirY) || 1;
    const ux = data.player.dirX / dl, uy = data.player.dirY / dl;
    ctx.save(); ctx.translate(px + ux * 9.5, py + uy * 9.5); ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-2, -3.5); ctx.lineTo(-2, 3.5); ctx.closePath(); ctx.fill(); ctx.restore();
  }, [data, res, zone, dist]);
  return (
    <div
      className="ds-map"
      style={{
        // 高さは画面の 18%(110〜240px)で止める=小さい端末(375×667)で右列が溢れない。幅は高さに合わせた正方形(左寄せ)。
        height: 'clamp(110px, 18vh, 240px)', width: 'auto', aspectRatio: '1 / 1', margin: 0,
        // .ds-home の外なので DS トークンをここで与える(枠=メニューの罫・地=メニューの地・淡色=作戦室と同じ)。
        ['--ds-line' as string]: 'var(--menu-line, #26212f)', ['--ds-bg' as string]: '#07060d', ['--ds-dim' as string]: '#79817f',
        ['--ds-amber' as string]: AMBER, ['--ds-amber-hi' as string]: AMBER_HI,
      } as React.CSSProperties}
    >
      <canvas ref={ref} width={SIZE * res} height={SIZE * res} aria-label="地図" />
      <span className="ds-map-tag">DEPTH — {AREA_ZONE_NAMES[zone] ?? ''}</span>
      {/* ★社長(2026-10-16 実機)「現在地をリザルトのところで表示してるみたいに『◯◯m』って表示。地図の4隅のどこかに」: 右下に原点からの距離(px=m・リザルトと同じ数え方)。 */}
      <span className="ds-map-tag" style={{ left: 'auto', right: 8, top: 'auto', bottom: 6, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.72)' }}>
        {Math.round(dist)}<span style={{ marginLeft: 2, opacity: 0.55 }}>m</span>
      </span>
    </div>
  );
};
