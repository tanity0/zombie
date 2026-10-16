import React, { useEffect, useRef, useState } from 'react';
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
  pois: { x: number; y: number; kind: 'boss' | 'cave' | 'armory' | 'police' | 'hospital'; taken: boolean }[]; // 発見済みだけ。taken=取り終えた(裏ボスは討伐済み)
  threats: { x: number; y: number }[]; // §2-3: この出撃で出会ったボス級(強個体を除く)・宿敵の今の位置
}

const SIZE = 300; // バッキング(正方形)。CSSで箱いっぱいに伸ばす。
const AMBER = '#ffb340', AMBER_HI = '#ffd28a';
const DETOUR = '#9fdcea'; // 寄り道の点(青白=琥珀の脅威・白の自分/拠点と色で分かれる)
const GROUND = '#07060d'; // 地の色(--ds-bg と同じ)。記号の縁取りに使う

export const PauseMap: React.FC<{ data: PauseMapData }> = ({ data }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [narrow, setNarrow] = useState(false);
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
    const far = Math.max(dist, ...data.bases.map(b => Math.hypot(b.x, b.y)), ...data.pois.map(q => Math.hypot(q.x, q.y)), ...data.threats.map(n => Math.hypot(n.x, n.y)));
    const fit = AREA_THRESHOLDS.find(r => r > far * 1.04) ?? AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1];
    const outer = Math.max(AREA_THRESHOLDS[1], fit) * 1.06;
    const k = (C - 6) / outer;
    // ★記号の大きさは「画面のpx」で下限を持つ(§2-3・品質監査 A-3 / クリエイティブ監査 #1)。キャンバスは 300 で描いて箱へ縮めるので、
    // 小さい箱(110px=0.37倍)では記号が2〜3pxまで潰れて見分けられなかった。縮む分だけ記号を太らせる(箱が 225px 以上なら等倍)。
    const shown = cv.clientWidth || SIZE * 0.5;
    setNarrow(shown < 150);
    const m = Math.max(1, (0.75 * SIZE) / shown);
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
      if (b.captured) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x - 3 * m, y - 3 * m, 6 * m, 6 * m); }
      else { ctx.strokeStyle = AMBER; ctx.lineWidth = 1.2 * m; ctx.strokeRect(x - 3.5 * m, y - 3.5 * m, 7 * m, 7 * m); }
    }
    // 発見済みの寄り道・裏ボスの巣=**1色の点**(社長 2026-10-17「POIは区別しなくていい。全体的に大雑把な区分けでいい」)。
    // 地図の区分は4つだけ: 自分=白の枠 / 拠点=四角 / 寄り道=青白の点 / 脅威=琥珀の菱形。色を琥珀から離して脅威と取り違えない。
    // 取り終えた所は塗らずに輪だけ(まだ行く価値がある所が一目で分かる)。
    // 記号は地の色で一回り縁取ってから描く=輪の線や他の記号に溶けない(検収クリエイティブ監査 #1/#6)。
    for (const q of data.pois) {
      const col = DETOUR;
      const x = mx(q.x), y = my(q.y);
      ctx.fillStyle = GROUND; ctx.beginPath(); ctx.arc(x, y, 3.8 * m, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, (q.taken ? 2.2 : 2.6) * m, 0, Math.PI * 2);
      // 取り終えた所=輪だけ。細いと小さい箱で色が読めないので太めに・薄くしない(検収クリエイティブ監査 #4)。
      if (q.taken) { ctx.strokeStyle = col; ctx.lineWidth = 1.6 * m; ctx.stroke(); }
      else { ctx.fillStyle = col; ctx.fill(); }
    }
    // 自分=白い角(作戦室と同じ・一番大きい)。向きは白枠の一辺に付く小さな三角(線ではなく形で示す)。
    const px = mx(data.player.x), py = my(data.player.y);
    // 自分の枠の中を地の色で抜いてから描く=近くの菱形が枠に食い込んで「自分が琥珀色」に見えない(検収クリエイティブ監査 #1)。
    ctx.fillStyle = GROUND; ctx.fillRect(px - 7.5 * m, py - 7.5 * m, 15 * m, 15 * m);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = m;
    ctx.strokeRect(px - 6.5 * m, py - 6.5 * m, 13 * m, 13 * m);
    ctx.fillStyle = '#fff'; ctx.fillRect(px - 2.5 * m, py - 2.5 * m, 5 * m, 5 * m);
    const dl = Math.hypot(data.player.dirX, data.player.dirY) || 1;
    const ux = data.player.dirX / dl, uy = data.player.dirY / dl;
    ctx.save(); ctx.translate(px + ux * 9.5 * m, py + uy * 9.5 * m); ctx.rotate(Math.atan2(uy, ux)); ctx.scale(m, m);
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-2, -3.5); ctx.lineTo(-2, 3.5); ctx.closePath(); ctx.fill(); ctx.restore();
    // 出会ったボス級・宿敵=脅威。★自分より後に描く=ボス戦で近くに居る時に自分の記号の下へ潜らない(検収品質監査 A-2)。(琥珀の菱形・作戦室の脅威と同じ形=今の地図の記号をそのまま使う)。
    for (const n of data.threats) {
      const h = 3.5 * m;
      ctx.save(); ctx.translate(mx(n.x), my(n.y)); ctx.rotate(Math.PI / 4);
      const o = 1.2 * m; ctx.fillStyle = GROUND; ctx.fillRect(-h - o, -h - o, (h + o) * 2, (h + o) * 2);
      ctx.fillStyle = AMBER; ctx.fillRect(-h, -h, h * 2, h * 2);
      // 芯を明るくする=同じ琥珀系の拠点の枠・武器庫/洞窟の点と明るさで分かれる(検収クリエイティブ監査 #2)。
      const c = 1.3 * m; ctx.fillStyle = AMBER_HI; ctx.fillRect(-c, -c, c * 2, c * 2);
      ctx.restore();
    }
  }, [data, res, zone, dist]);
  return (
    <div
      className="ds-map"
      style={{
        // 高さは画面の 18%(110〜240px)で止める=小さい端末(375×667)で右列が溢れない。幅は高さに合わせた正方形(左寄せ)。
        height: 'clamp(110px, 18vh, 240px)', width: 'auto', aspectRatio: '1 / 1', margin: 0,
        // 親が縦並びで子を横いっぱいに伸ばすので、伸ばさない(伸びると aspectRatio が効かず輪が楕円になっていた)。
        alignSelf: 'flex-start',
        // .ds-home の外なので DS トークンをここで与える(枠=メニューの罫・地=メニューの地・淡色=作戦室と同じ)。
        ['--ds-line' as string]: 'var(--menu-line, #26212f)', ['--ds-bg' as string]: '#07060d', ['--ds-dim' as string]: '#79817f',
        ['--ds-amber' as string]: AMBER, ['--ds-amber-hi' as string]: AMBER_HI,
      } as React.CSSProperties}
    >
      <canvas ref={ref} width={SIZE * res} height={SIZE * res} aria-label="地図" />
      {/* 小さい箱(150px 未満)では「DEPTH —」を外して区域名だけ=2行に折れて上の3割を塞がない(検収クリエイティブ監査 #7) */}
      <span className="ds-map-tag" style={{ whiteSpace: 'nowrap' }}>{narrow ? '' : 'DEPTH — '}{AREA_ZONE_NAMES[zone] ?? ''}</span>
      {/* ★社長(2026-10-16 実機)「現在地をリザルトのところで表示してるみたいに『◯◯m』って表示。地図の4隅のどこかに」: 右下に原点からの距離(px=m・リザルトと同じ数え方)。 */}
      <span className="ds-map-tag" style={{ left: 'auto', right: 8, top: 'auto', bottom: 6, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.72)' }}>
        {Math.round(dist)}<span style={{ marginLeft: 2, opacity: 0.55 }}>m</span>
      </span>
    </div>
  );
};
