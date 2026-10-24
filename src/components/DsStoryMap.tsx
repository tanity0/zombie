// ★作戦室の地図=架空列島の原画+ストーリーの軌跡(research/THEONE_ROUND2.md §2-5)。
// 社長 2026-10-17「地図の位置は固定。ストーリーによって軌跡が増えていく」「この地図使って」。
// - 地図は1枚・固定(どのステージでも同じ)。原画を箱の幅に合わせて全体を見せる(端の場所が切れない=meet・下端に揃える)。
// - クリアした場所を話の順に琥珀の線で結ぶ(古い区間ほど薄い・少し弧)。今いる所(最後にクリアした場所)=白い角+場所の名、
//   次の出撃先へ細かい点線+中抜きの菱形(ゆっくり明滅)+「NEXT」。次の出撃先がクリア済みなら目標は出さない。
// - まだ行っていない場所は出さない(進むほど地図が埋まる)。
// - SVG で重ねる(線は端末の画素で描かれる=PC の拡大でも滲まない)。描画は開いた時だけ=負荷 0/10。
// - `?dsmap=0` で地図を出さない(切り分け用・旧地図と同じスイッチ)。
import React, { useMemo } from 'react';
import { assetUrl } from '../config/assetUrl';
import { OPS_MAP_H, OPS_MAP_IMAGE, OPS_MAP_W, storyTrail } from '../data/opsMapPlaces';
import type { Stage } from '../data/campaign';

const DS_MAP_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dsmap') === '0';

const AMBER = '#ffb340', AMBER_HI = '#ffd28a';
// 原画の座標(1816×866)で書く。スマホの箱(幅 327〜382px)では 1px ≈ 5 単位。
const U = 5;

// 区間を少し弧にする(往復した線が三角形の星座図に見えない・検収クリエイティブ監査 #3)。i で曲げる向きを交互に。
const arc = (a: readonly [number, number], b: readonly [number, number], i: number): string => {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const k = (i % 2 === 0 ? 1 : -1) * 0.12;
  return `M${a[0]},${a[1]} Q${mx - dy * k},${my + dx * k} ${b[0]},${b[1]}`;
};

const DsStoryMap: React.FC<{ stages: readonly Stage[]; cleared: ReadonlySet<string>; next: Stage | null; sectorLabel: string }> = ({ stages, cleared, next, sectorLabel }) => {
  // 次の出撃先がクリア済み(全部クリアした後に最終ステージへ戻る等)なら次の目標は描かない(検収品質監査 A1)。
  const nextId = next && !cleared.has(next.id) ? next.id : null;
  const trail = useMemo(() => storyTrail(stages, cleared, nextId), [stages, cleared, nextId]);
  const names = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s.locationTitle])), [stages]);
  if (DS_MAP_DISABLED) return null;
  const P = (at: readonly [number, number]) => [at[0] * OPS_MAP_W, at[1] * OPS_MAP_H] as const;
  const visited = trail.visited.map(v => P(v.at));
  const cur = trail.current ? P(trail.current.at) : null;
  const nxt = trail.next ? P(trail.next.at) : null;
  const sameSpot = !!(cur && nxt && cur[0] === nxt[0] && cur[1] === nxt[1]);
  const segs = visited.length - 1;
  // 文字の縁取りは細く(字幕のような太い縁にしない・検収クリエイティブ監査 #8)。
  const textProps = { paintOrder: 'stroke' as const, stroke: 'rgba(7,6,13,0.85)', strokeWidth: 1.4 * U, strokeLinejoin: 'round' as const };
  const right = (x: number) => x > OPS_MAP_W * 0.72;
  const ease = { calcMode: 'spline' as const, keyTimes: '0;0.5;1', keySplines: '0.42 0 0.58 1;0.42 0 0.58 1' };
  return (
    <div className="ds-map landscape:!h-[clamp(120px,calc(100svh/var(--hud-s,1)_-_250px),275px)]" style={{ height: 210, background: '#0d0e13' }}>{/* 原画の縁の色=幅に合わせた時の余白が帯に見えない */}
      {/* 地図は下端に揃える=余白は上の SECTOR の札の帯に寄る(検収クリエイティブ監査 #7)。 */}
      <svg viewBox={`0 0 ${OPS_MAP_W} ${OPS_MAP_H}`} preserveAspectRatio="xMidYMax meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label="作戦地図">
        <image href={assetUrl(OPS_MAP_IMAGE)} x={0} y={0} width={OPS_MAP_W} height={OPS_MAP_H} />
        {/* 軌跡=クリアした場所を話の順に結ぶ琥珀の線。古い区間ほど薄い(時間の流れ・検収クリエイティブ監査 #2)。 */}
        {visited.slice(1).map((p, i) => (
          <path key={i} d={arc(visited[i], p, i)} fill="none" stroke={AMBER} strokeOpacity={segs > 1 ? 0.35 + 0.5 * (i / (segs - 1)) : 0.85}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        ))}
        {/* 次の出撃先へ細かい点線(方向が読める・検収クリエイティブ監査 #5)。 */}
        {cur && nxt && !sameSpot && (
          <path d={arc(cur, nxt, segs + 1)} fill="none" stroke={AMBER} strokeOpacity={0.9} strokeWidth={1.3}
            vectorEffect="non-scaling-stroke" strokeDasharray={`${1.6 * U} ${1.4 * U}`} />
        )}
        {/* 行った場所=琥珀の四角(実寸 約4〜5px)。出発点だけ中抜き(検収クリエイティブ監査 #4)。 */}
        {visited.map((p, i) => (i === 0
          ? <rect key={i} x={p[0] - 2.2 * U} y={p[1] - 2.2 * U} width={4.4 * U} height={4.4 * U} fill="rgba(7,6,13,0.6)" stroke={AMBER} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
          : <rect key={i} x={p[0] - 2.2 * U} y={p[1] - 2.2 * U} width={4.4 * U} height={4.4 * U} fill={AMBER} />))}
        {/* 次の目標=琥珀明の中抜きの菱形(ゆっくり加減速して明滅)+小さな「NEXT」(行き先の名は左上の SECTOR にある=重ねて言わない・#1/#6)。 */}
        {nxt && !sameSpot && (
          <g>
            <rect x={nxt[0] - 2.8 * U} y={nxt[1] - 2.8 * U} width={5.6 * U} height={5.6 * U} fill="rgba(7,6,13,0.7)" stroke={AMBER_HI}
              strokeWidth={1.5} vectorEffect="non-scaling-stroke" transform={`rotate(45 ${nxt[0]} ${nxt[1]})`}>
              <animate attributeName="stroke-opacity" values="1;0.35;1" dur="2.6s" repeatCount="indefinite" {...ease} />
            </rect>
            <text x={nxt[0] + (right(nxt[0]) ? -5.5 * U : 5.5 * U)} y={nxt[1] + 1.9 * U} fontSize={9 * U} letterSpacing={2 * U}
              fill={AMBER_HI} textAnchor={right(nxt[0]) ? 'end' : 'start'} {...textProps}>NEXT</text>
          </g>
        )}
        {/* 今いる所=白い角+場所の名(スマホで約9px=既存の札と同じ大きさ・検収品質監査 A2)。 */}
        {cur && trail.current && (
          <g>
            <rect x={cur[0] - 3.4 * U} y={cur[1] - 3.4 * U} width={6.8 * U} height={6.8 * U} fill="rgba(7,6,13,0.55)" stroke="rgba(255,255,255,0.65)"
              strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect x={cur[0] - 1.3 * U} y={cur[1] - 1.3 * U} width={2.6 * U} height={2.6 * U} fill="#fff" />
            <text x={cur[0] + (right(cur[0]) ? -5 * U : 5 * U)} y={cur[1] - 4 * U} fontSize={10 * U} letterSpacing={0.6 * U}
              fill="rgba(255,255,255,0.82)" textAnchor={right(cur[0]) ? 'end' : 'start'} {...textProps}>{names[trail.current.id] ?? ''}</text>
          </g>
        )}
      </svg>
      <span className="ds-map-tag">SECTOR — {sectorLabel}</span>
    </div>
  );
};

export default DsStoryMap;
