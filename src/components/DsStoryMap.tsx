// ★作戦室の地図=架空列島の原画+ストーリーの軌跡(research/THEONE_ROUND2.md §2-5)。
// 社長 2026-10-17「地図の位置は固定。ストーリーによって軌跡が増えていく」「この地図使って」。
// - 地図は1枚・固定(どのステージでも同じ)。原画を箱の幅に合わせて全体を見せる(端の場所が切れない=meet・下端に揃える)。
// - クリアした場所を話の順に琥珀の線で結ぶ(古い区間ほど薄い・少し弧)。今いる所(最後にクリアした場所)=白い角+場所の名、
//   次の出撃先へ細かい点線+中抜きの菱形(ゆっくり明滅)+「NEXT」。次の出撃先がクリア済みなら目標は出さない。
// - まだ行っていない場所は出さない(進むほど地図が埋まる)。
// - SVG で重ねる(線は端末の画素で描かれる=PC の拡大でも滲まない)。描画は開いた時だけ=負荷 0/10。
// - `?dsmap=0` で地図を出さない(切り分け用・旧地図と同じスイッチ)。
// - 出会った・まだ倒していないボスの顔(頭だけ丸く切り抜いた小さな絵)を場所の点の下に出す(research/SORTIE_MAP_BOSS_ICONS.md §5)。
//   何を出すかは MissionSelect が決めて props で渡す(ここは描くだけ)。開いた時に慣性つきでふわっと出る(常時の動きは無い)。
import React, { useId, useMemo } from 'react';
import { assetUrl } from '../config/assetUrl';
import { OPS_MAP_H, OPS_MAP_IMAGE, OPS_MAP_PLACES, OPS_MAP_W, storyTrail } from '../data/opsMapPlaces';
import { BOSS_HEAD_CROPS } from '../data/bossHeadCrops';
import { spritePath } from '../utils/spriteLoader';
import { layoutMapFaces, type MapBossFace } from '../utils/sortieMapBosses';
import type { Stage } from '../data/campaign';

const DS_MAP_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dsmap') === '0';

const AMBER = '#ffb340', AMBER_HI = '#ffd28a';
// 原画の座標(1816×866)で書く。スマホの箱(幅 327〜382px)では 1px ≈ 5 単位。
const U = 5;
// ボスの顔: 直径 約16px(スマホ)。縁は細い暗い縁+外に一部欠けた細い弧と上の刻み(地図記号の細い線の文法)。
// ステージ固定のボス=冷たい灰(琥珀=行った場所/NEXT と取り違えない)。徘徊の枠=暗い血の赤で、ゆっくり明滅する。
const FACE_D = 16 * U, FACE_GAP = 2 * U, FACE_R = FACE_D / 2;
const FACE_RIM = '#b9c2cc', FACE_RIM_PATROL = '#a3262b';
const RIM_R = FACE_R + 1.1 * U;
const NO_FACES: readonly MapBossFace[] = [];
// 外の弧: 右下を約70°欠く(角度は SVG の向き=右が0°・下回り)。
const rimArc = (x: number, y: number): string => {
  const a0 = (100 * Math.PI) / 180, a1 = (390 * Math.PI) / 180;
  return `M${x + RIM_R * Math.cos(a0)},${y + RIM_R * Math.sin(a0)} A${RIM_R},${RIM_R} 0 1 1 ${x + RIM_R * Math.cos(a1)},${y + RIM_R * Math.sin(a1)}`;
};
// 出方の間(等間隔にしない): 地点ごとの間・地点の中の顔ごとの間。徘徊は全員の後に少し遅らせる。
const SPOT_BASE_MS = 220, SPOT_STEP_MS = [0, 170, 300, 470, 580, 740, 860, 1010];
const FACE_STEP_MS = [0, 60, 150, 260];
const PATROL_EXTRA_MS = 340, MORE_EXTRA_MS = 420;

// 区間を少し弧にする(往復した線が三角形の星座図に見えない・検収クリエイティブ監査 #3)。i で曲げる向きを交互に。
const arc = (a: readonly [number, number], b: readonly [number, number], i: number): string => {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const k = (i % 2 === 0 ? 1 : -1) * 0.12;
  return `M${a[0]},${a[1]} Q${mx - dy * k},${my + dx * k} ${b[0]},${b[1]}`;
};

const DsStoryMap: React.FC<{ stages: readonly Stage[]; cleared: ReadonlySet<string>; next: Stage | null; sectorLabel: string; bossFaces?: readonly MapBossFace[] }> = ({ stages, cleared, next, sectorLabel, bossFaces = NO_FACES }) => {
  const clipBase = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  // 次の出撃先がクリア済み(全部クリアした後に最終ステージへ戻る等)なら次の目標は描かない(検収品質監査 A1)。
  const nextId = next && !cleared.has(next.id) ? next.id : null;
  const trail = useMemo(() => storyTrail(stages, cleared, nextId), [stages, cleared, nextId]);
  const names = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s.locationTitle])), [stages]);
  // ボスの顔の列: 点の下に最大4つ横一列(徘徊が先頭)+「+N」。近い地点の列・行った場所の四角・今いる所・NEXT の菱形とは重ねない(上下へ逃がす)。
  const faceSpots = useMemo(() => {
    const PX = (at: readonly [number, number]) => [at[0] * OPS_MAP_W, at[1] * OPS_MAP_H] as const;
    const avoid = [
      ...trail.visited.map(v => ({ x: PX(v.at)[0], y: PX(v.at)[1], half: 2.6 * U })),
      ...(trail.current ? [{ x: PX(trail.current.at)[0], y: PX(trail.current.at)[1], half: 3.6 * U }] : []),
      ...(trail.next ? [{ x: PX(trail.next.at)[0], y: PX(trail.next.at)[1], half: 4.2 * U }] : []),
      ...bossFaces.flatMap(f => { const at = OPS_MAP_PLACES[f.stageId]; return at ? [{ x: PX(at)[0], y: PX(at)[1], half: 2.6 * U }] : []; }),
    ];
    return layoutMapFaces(bossFaces, id => { const at = OPS_MAP_PLACES[id]; return at ? PX(at) : undefined; },
      { diameter: FACE_D, gap: FACE_GAP, offset: 6 * U, mapW: OPS_MAP_W, mapH: OPS_MAP_H, moreW: 11 * U, markHalf: 3.4 * U, avoid });
  }, [bossFaces, trail]);
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
    // PC の横長: 箱が原画とほぼ同じ比になり、縦の余白(=札の帯)が無くなって SECTOR の札が絵に重なる。
    // 横長の時は中の札を出さず(index.css の .ds-home .ds-map-tag)、箱の外の上に右の列の「PREP ── 準備」と同じ書式の見出しを出す
    // (MissionSelect の .ds-glabel-sector)。縦持ちは今どおり(中の札・箱 210px)。
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
        {/* ボスの顔(出会った・倒していない)。頭だけ丸く切り抜く=表(data/bossHeadCrops.ts)の頭の中心・半径で絵を置いて丸で切る。
            明るさは軽く持ち上げて揃える(暗い絵が地図に沈まない)。縁の内側にわずかな光。 */}
        {faceSpots.length > 0 && (
          <defs>
            <filter id={`${clipBase}-lift`} colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude={1} exponent={0.8} offset={0} />
                <feFuncG type="gamma" amplitude={1} exponent={0.8} offset={0} />
                <feFuncB type="gamma" amplitude={1} exponent={0.8} offset={0} />
              </feComponentTransfer>
              <feComponentTransfer>
                <feFuncR type="linear" slope={1.14} intercept={-0.04} />
                <feFuncG type="linear" slope={1.14} intercept={-0.04} />
                <feFuncB type="linear" slope={1.14} intercept={-0.04} />
              </feComponentTransfer>
            </filter>
            <radialGradient id={`${clipBase}-glow`}>
              <stop offset="0.68" stopColor="#ffecd2" stopOpacity={0} />
              <stop offset="1" stopColor="#ffecd2" stopOpacity={0.26} />
            </radialGradient>
          </defs>
        )}
        {(() => {
          // 出る時刻: 地点ごとに間を空け(等間隔にしない)、徘徊はステージ固定の全員が出た後に少し遅らせる。
          let lastFixed = 0;
          const delays = faceSpots.map((spot, si) => spot.faces.map(({ face }, fi) => {
            const d = SPOT_BASE_MS + (SPOT_STEP_MS[si] ?? si * 150) + (FACE_STEP_MS[fi] ?? fi * 90);
            if (!face.patrol) lastFixed = Math.max(lastFixed, d);
            return d;
          }));
          return faceSpots.map((spot, si) => {
            const patrolFirst = spot.faces[0]?.face.patrol === true;
            const delayOf = (fi: number) => (spot.faces[fi].face.patrol ? lastFixed + PATROL_EXTRA_MS : delays[si][fi]);
            const spotDelay = Math.min(...spot.faces.map((_, fi) => delayOf(fi)));
            const lastDelay = Math.max(...spot.faces.map((_, fi) => delayOf(fi)));
            return (
              <g key={`${spot.at[0]},${spot.at[1]}`}>
                {/* 点から列への細い引き線(徘徊が居る列は血の赤)。 */}
                <line className="ds-map-face-fade" style={{ animationDelay: `${spotDelay}ms` }} x1={spot.line.x1} y1={spot.line.y1} x2={spot.line.x2} y2={spot.line.y2}
                  stroke={patrolFirst ? FACE_RIM_PATROL : FACE_RIM} strokeOpacity={patrolFirst ? 0.9 : 0.5} strokeWidth={patrolFirst ? 1.2 : 0.9} vectorEffect="non-scaling-stroke" />
                {spot.faces.map(({ face, x, y }, fi) => {
                  const crop = BOSS_HEAD_CROPS[face.sprite];
                  if (!crop) return null;
                  const k = FACE_R / (crop.r * crop.h);
                  const id = `${clipBase}-f${si}-${fi}`;
                  const rim = face.patrol ? FACE_RIM_PATROL : FACE_RIM;
                  return (
                    <g key={face.key} className="ds-map-face" style={{ animationDelay: `${delayOf(fi)}ms` }}>
                      <clipPath id={id}><circle cx={x} cy={y} r={FACE_R} /></clipPath>
                      <circle cx={x} cy={y} r={FACE_R} fill="#14131a" />
                      <image href={spritePath(face.sprite)} x={x - crop.u * crop.w * k} y={y - crop.v * crop.h * k}
                        width={crop.w * k} height={crop.h * k} clipPath={`url(#${id})`} preserveAspectRatio="none" filter={`url(#${clipBase}-lift)`} />
                      <circle cx={x} cy={y} r={FACE_R} fill={`url(#${clipBase}-glow)`} />
                      <circle cx={x} cy={y} r={FACE_R} fill="none" stroke="rgba(7,6,13,0.9)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
                      {/* 外の印: 一部欠けた細い弧+上の小さな刻み。徘徊は暗い血の赤でゆっくり明滅(NEXT の菱形と同じ加減速)。 */}
                      <g stroke={rim} strokeOpacity={face.patrol ? 1 : 0.72} fill="none">
                        <path d={rimArc(x, y)} strokeWidth={face.patrol ? 1.3 : 1} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                        <line x1={x} y1={y - RIM_R} x2={x} y2={y - RIM_R - 1.6 * U} strokeWidth={face.patrol ? 1.3 : 1} vectorEffect="non-scaling-stroke" />
                        {face.patrol && <animate attributeName="stroke-opacity" values="1;0.3;1" dur="2.6s" repeatCount="indefinite" {...ease} />}
                      </g>
                    </g>
                  );
                })}
                {spot.more > 0 && (
                  <text className="ds-map-face-fade" style={{ animationDelay: `${lastDelay + MORE_EXTRA_MS}ms` }} x={spot.moreX} y={spot.moreY + 3 * U}
                    fontSize={8.5 * U} fill={FACE_RIM} textAnchor="start" {...textProps}>+{spot.more}</text>
                )}
              </g>
            );
          });
        })()}
      </svg>
      <span className="ds-map-tag">SECTOR — {sectorLabel}</span>
    </div>
  );
};

export default DsStoryMap;
