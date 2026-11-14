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
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../config/assetUrl';
import { OPS_MAP_H, OPS_MAP_IMAGE, OPS_MAP_PLACES, OPS_MAP_W, storyTrail } from '../data/opsMapPlaces';
import { BOSS_HEAD_CROPS } from '../data/bossHeadCrops';
import { spritePath } from '../utils/spriteLoader';
import { layoutMapFaces, type MapBossFace } from '../utils/sortieMapBosses';
import { estimateTagTextWidth, mapTagLeadLine, nextOpenMapFace, pickMapFace, placeMapSpotTag, type MapTagPlace } from '../utils/mapFaceTag';
import type { Stage } from '../data/campaign';

const DS_MAP_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dsmap') === '0';

const AMBER = '#ffb340', AMBER_HI = '#ffd28a';
// 原画の座標(1816×866)で書く。スマホの箱(幅 327〜382px)では 1px ≈ 5 単位。
const U = 5;
// ボスの顔: 直径 約20px(スマホ・社長 2026-11-14「ボスアイコンを少し大きく」16→20)。縁は細い暗い縁+外に一部欠けた細い弧と上の刻み(地図記号の細い線の文法)。
// ステージ固定のボス=冷たい灰(琥珀=行った場所/NEXT と取り違えない)。徘徊の枠=暗い血の赤で、ゆっくり明滅する。
const FACE_D = 20 * U, FACE_GAP = 2.5 * U, FACE_R = FACE_D / 2;
const FACE_RIM = '#b9c2cc', FACE_RIM_PATROL = '#a3262b';
const RIM_R = FACE_R + 1.1 * U, TICK_L = 1.6 * U;
// 顔をタップ(PC はクリック)した時の札=そのボスが居るステージの場所の名(ステージ一覧の見出し・今いる所の名と同じ locationTitle)。
// 当たりは見た目より大きく(縦横 約32px 四方)。札はその場所(列)で1つに固定し、押した顔の上の刻みの先から細い引き線でつなぐ。
// 札の字は今いる所の名と同じ白・細い縁取りで、枠は付けず、字の下に暗いにじみと細い下線1本(顔に被っても読める)。
const HIT_HALF = Math.max(16 * U, RIM_R + TICK_L);
const TAG_FS = 10 * U, TAG_LS = 1.2 * U, TAG_PX = 3 * U, TAG_H = 15 * U, TAG_GAP = 4 * U, TAG_MARGIN = 2 * U;
const MARK_HALF = 3.4 * U; // 場所の点の印の半分(引き線・札の間を測る元)
const FACE_RIM_OPEN = '#e6ecf2';
const FACE_OPEN_SCALE = 1.15; // 開いた顔の拡大(index.css .ds-map-face-pop.is-open と揃える=引き線の根元を拡大後の刻みの先に置く)
const TAG_OUT_MS = 140;
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
  // ---- 顔をタップした時の札(どのステージか)。開くのは1つだけ。消える札は減速しながら消えてから外す。 ----
  const svgRef = useRef<SVGSVGElement>(null);
  const faceHits = useMemo(() => faceSpots.flatMap(s => s.faces.filter(f => BOSS_HEAD_CROPS[f.face.sprite]).map(f => ({ key: f.face.key, x: f.x, y: f.y }))), [faceSpots]);
  const tagPlaces = useMemo(() => {
    const out: Record<string, { box: MapTagPlace; text: string; cx: number; patrol: boolean; at: readonly [number, number]; lead: { x1: number; y1: number; x2: number; y2: number } }> = {};
    for (const s of faceSpots) {
      const shown = s.faces.filter(f => BOSS_HEAD_CROPS[f.face.sprite]);
      if (shown.length === 0) continue;
      const rowL = shown[0].x - RIM_R, rowR = shown[shown.length - 1].x + RIM_R;
      for (const { face, x, y } of shown) {
        const text = names[face.stageId] ?? '';
        if (!text) continue;
        const w = estimateTagTextWidth(text, TAG_FS, TAG_LS) + 2 * TAG_PX;
        const box = placeMapSpotTag({ at: s.at, markHalf: MARK_HALF, rowL, rowR, rowY: y, below: s.below, reachUp: RIM_R + TICK_L, reachDown: RIM_R,
          w, h: TAG_H, gap: TAG_GAP, mapW: OPS_MAP_W, mapH: OPS_MAP_H, margin: TAG_MARGIN });
        out[face.key] = { box, text, cx: box.l + box.w / 2, patrol: face.patrol === true, at: s.at, lead: mapTagLeadLine(x, y, (RIM_R + TICK_L) * FACE_OPEN_SCALE, RIM_R * FACE_OPEN_SCALE, box, TAG_PX) };
      }
    }
    return out;
  }, [faceSpots, names]);
  // PC(横長・マウス)だけ: カーソルを乗せた顔の弧を少し濃く。スマホ(タッチ)は変えない。
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [tags, setTags] = useState<readonly { key: string; n: number; leaving: boolean }[]>([]);
  const tagSeq = useRef(0);
  const openKey = tags.find(t => !t.leaving)?.key ?? null;
  const setOpen = useCallback((next: string | null) => {
    setTags(prev => {
      const cur = prev.find(t => !t.leaving)?.key ?? null;
      if (cur === next) return prev;
      const out = prev.map(t => (t.leaving ? t : { ...t, leaving: true }));
      return next ? [...out, { key: next, n: ++tagSeq.current, leaving: false }] : out;
    });
  }, []);
  useEffect(() => {
    if (!tags.some(t => t.leaving)) return;
    const id = window.setTimeout(() => setTags(prev => prev.filter(t => !t.leaving)), TAG_OUT_MS);
    return () => window.clearTimeout(id);
  }, [tags]);
  // 顔が消えた(地図の中身が変わった)ら閉じる。地図の外を押しても閉じる(押した物の操作は妨げない=止めも横取りもしない)。
  useEffect(() => { if (openKey && !tagPlaces[openKey]) setOpen(null); }, [openKey, tagPlaces, setOpen]);
  useEffect(() => {
    if (!openKey) return;
    const onDown = (ev: PointerEvent) => { if (svgRef.current && ev.target instanceof Node && !svgRef.current.contains(ev.target)) setOpen(null); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [openKey, setOpen]);
  const onMapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m || (faceHits.length === 0 && !openKey)) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    setOpen(nextOpenMapFace(openKey, faceHits, pt.x, pt.y, HIT_HALF, openKey ? tagPlaces[openKey]?.box ?? null : null));
  }, [faceHits, openKey, tagPlaces, setOpen]);
  const onMapHover = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' || window.innerWidth <= window.innerHeight) return;
    const m = svgRef.current?.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const k = pickMapFace(faceHits, pt.x, pt.y, HIT_HALF);
    setHoverKey(prev => (prev === k ? prev : k));
  }, [faceHits]);
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
      <svg viewBox={`0 0 ${OPS_MAP_W} ${OPS_MAP_H}`} preserveAspectRatio="xMidYMax meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label="作戦地図"
        ref={svgRef} onClick={faceHits.length > 0 || openKey ? onMapClick : undefined}
        onPointerMove={faceHits.length > 0 ? onMapHover : undefined} onPointerLeave={hoverKey ? () => setHoverKey(null) : undefined}>
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
            <filter id={`${clipBase}-tagbg`} x="-30%" y="-80%" width="160%" height="260%">
              <feGaussianBlur stdDeviation={2.4 * U} />
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
                  const isOpen = openKey === face.key;
                  return (
                    <g key={face.key} className="ds-map-face" style={{ animationDelay: `${delayOf(fi)}ms` }}>
                     {/* 開いた顔は慣性つきで少し大きく(行き過ぎて戻る)、開いている間ほかの顔は沈める(index.css .ds-map-face-pop)。 */}
                     <g className={`ds-map-face-pop${isOpen ? ' is-open' : openKey ? ' is-dim' : ''}`} style={{ transformOrigin: `${x}px ${y}px` }}>
                      <clipPath id={id}><circle cx={x} cy={y} r={FACE_R} /></clipPath>
                      <circle cx={x} cy={y} r={FACE_R} fill="#14131a" />
                      <image href={spritePath(face.sprite)} x={x - crop.u * crop.w * k} y={y - crop.v * crop.h * k}
                        width={crop.w * k} height={crop.h * k} clipPath={`url(#${id})`} preserveAspectRatio="none" filter={`url(#${clipBase}-lift)`} />
                      <circle cx={x} cy={y} r={FACE_R} fill={`url(#${clipBase}-glow)`} />
                      <circle cx={x} cy={y} r={FACE_R} fill="none" stroke="rgba(7,6,13,0.9)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
                      {/* 外の印: 一部欠けた細い弧+上の小さな刻み。徘徊は暗い血の赤でゆっくり明滅(NEXT の菱形と同じ加減速)。 */}
                      {/* 開いた顔は弧を太く・白寄りに。PC でカーソルを乗せた顔は弧を少し濃く(徘徊は明滅が勝つので変えない)。 */}
                      <g stroke={isOpen ? FACE_RIM_OPEN : rim} fill="none"
                        style={face.patrol ? { strokeOpacity: 1 } : { strokeOpacity: isOpen ? 1 : hoverKey === face.key ? 0.9 : 0.72, transition: 'stroke-opacity 120ms cubic-bezier(0.2, 0.7, 0.3, 1)' }}>
                        <path d={rimArc(x, y)} strokeWidth={isOpen ? 1.6 : face.patrol ? 1.3 : 1} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                        <line x1={x} y1={y - RIM_R} x2={x} y2={y - RIM_R - TICK_L} strokeWidth={isOpen ? 1.6 : face.patrol ? 1.3 : 1} vectorEffect="non-scaling-stroke" />
                        {face.patrol && <animate attributeName="stroke-opacity" values="1;0.3;1" dur="2.6s" repeatCount="indefinite" {...ease} />}
                      </g>
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
        {/* 当たり(見た目の丸より大きい・PC はマウスの指の形)。判定は onMapClick が近い方で決める=この四角は形だけ。 */}
        {faceHits.map(h => (
          <rect key={`hit-${h.key}`} x={h.x - HIT_HALF} y={h.y - HIT_HALF} width={2 * HIT_HALF} height={2 * HIT_HALF} fill="transparent" style={{ cursor: 'pointer' }} />
        ))}
        {/* 札=そのボスが居るステージの場所の名(その場所の列で1つの位置)。開くと場所の点が一度だけ明るくなり、押した顔の刻みの先から
            引き線が先に伸び、字が後から追う。消える時は薄れるだけ(index.css .ds-map-ftag)。 */}
        {tags.map(t => {
          const g = tagPlaces[t.key];
          if (!g) return null;
          const { box, lead } = g;
          const line = g.patrol ? FACE_RIM_PATROL : FACE_RIM;
          return (
            <g key={t.n} className={`ds-map-ftag ${box.below ? 'is-below' : 'is-above'}${t.leaving ? ' is-out' : ''}`} pointerEvents="none">
              <rect className="ds-map-ftag-mark" x={g.at[0] - MARK_HALF} y={g.at[1] - MARK_HALF} width={2 * MARK_HALF} height={2 * MARK_HALF}
                fill="none" stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              <line className="ds-map-ftag-lead" style={{ transformOrigin: `${lead.x1}px ${lead.y1}px` }} x1={lead.x1} y1={lead.y1} x2={lead.x2} y2={lead.y2}
                stroke={line} strokeOpacity={g.patrol ? 0.95 : 0.8} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <g className="ds-map-ftag-body">
                <rect x={box.l} y={box.t} width={box.w} height={box.h} fill="rgba(7,6,13,0.75)" filter={`url(#${clipBase}-tagbg)`} />
                <line x1={box.l + TAG_PX / 2} y1={box.below ? box.t : box.t + box.h} x2={box.l + box.w - TAG_PX / 2} y2={box.below ? box.t : box.t + box.h}
                  stroke={line} strokeOpacity={g.patrol ? 0.95 : 0.7} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <text x={g.cx} y={box.t + box.h / 2} dominantBaseline="central" fontSize={TAG_FS} letterSpacing={TAG_LS} fill="rgba(255,255,255,0.82)" textAnchor="middle" {...textProps}>{g.text}</text>
              </g>
            </g>
          );
        })}
      </svg>
      <span className="ds-map-tag">SECTOR — {sectorLabel}</span>
    </div>
  );
};

export default DsStoryMap;
