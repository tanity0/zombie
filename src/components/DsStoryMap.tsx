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
// - 地図で作戦地域を選ぶ(社長 2026-11-25「ボスアイコンで、ステージカテゴリが選択される。ボスアイコンはステージにぶら下がっているイメージ」):
//   場所の印かボスの顔を押すと、そのステージが選択中になる(琥珀の輪が移る・下端の札と場所名・出撃の帯が変わる・画面は移らない)。
//   選択中のステージをもう一度押すと出撃の帯と同じ任務詳細へ(未解放は何もしない・MissionSelect)。何が選べるか・近い方の判定は utils/opsMapSelect。
//   未解放は NEXT の1つ先だけを薄い点線の四角で出す(それ以外の行っていない場所は今どおり出さない)。
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { assetUrl } from '../config/assetUrl';
import { OPS_MAP_H, OPS_MAP_IMAGE, OPS_MAP_PLACES, OPS_MAP_W, storyTrail } from '../data/opsMapPlaces';
import { BOSS_HEAD_CROPS } from '../data/bossHeadCrops';
import { BOSS_FACE_RIM, BOSS_FACE_RIM_PATROL, BossFaceDefs, BossHeadFace, bossFaceRimArc } from './BossHeadFace';
import { layoutMapFaces, type MapBossFace } from '../utils/sortieMapBosses';
import { MAP_PICK_LABEL, LOCKED_PLACE_NAME, pickMapStageHit, type MapPick, type MapStageHit } from '../utils/opsMapSelect';
import type { Stage } from '../data/campaign';
import type { SortieTarget } from '../utils/dsHome';
import { PixelIcon } from './PixelIcon';
import { SwapText } from './SwapText';

const DS_MAP_DISABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('dsmap') === '0';

const AMBER = '#ffb340', AMBER_HI = '#ffd28a';
// 原画の座標(1816×866)で書く。スマホの箱(幅 327〜382px)では 1px ≈ 5 単位。
const U = 5;
// ボスの顔: 直径 約20px(スマホ・社長 2026-11-14「ボスアイコンを少し大きく」16→20)。縁は細い暗い縁+外に一部欠けた細い弧と上の刻み(地図記号の細い線の文法)。
// ステージ固定のボス=冷たい灰(琥珀=行った場所/NEXT と取り違えない)。徘徊の枠=暗い血の赤で、ゆっくり明滅する。
const FACE_D = 20 * U, FACE_GAP = 2.5 * U, FACE_R = FACE_D / 2;
const FACE_RIM = BOSS_FACE_RIM, FACE_RIM_PATROL = BOSS_FACE_RIM_PATROL;
const RIM_R = FACE_R + 1.1 * U, TICK_L = 1.6 * U;
// 押せる範囲: ボスの顔・場所の印は 44px 四方(画面の画素。押した時に地図の拡大率で原画の単位へ直す)。重なる所は押した点に近い方。
const HIT_HALF_PX = 22;
// 選んだステージの顔の縁(白寄り)。選んだ顔を浮かせる・ほかの顔を沈める見た目は index.css の .ds-map-face-pop.is-sel / .is-sink。
const FACE_RIM_SEL = '#efe6d2';
// 未解放(NEXT の1つ先)を選んだ時の輪の色(生成りの灰)。
const LOCKED_INK = '#ddd2b8';
// 選択の輪の半径。前の輪が消える時間(index.css .ds-map-next-ring.is-out と揃える)・もう一度押した時に縮んで弾ける時間(.is-go)。
const RING_R = 7.5 * U, RING_OUT_MS = 300, RING_GO_MS = 300;
// 選んだ顔が浮く量(原画の単位)。場所の印から離れる向き(列が印の下なら下へ・上なら上へ)=印や「前回」の字に食い込まない。
const FACE_LIFT = 12;
type RingItem = { id: string; locked: boolean; n: number; leaving: boolean; fresh: boolean };
// 四隅だけの括弧(中心・半分の大きさ・角の腕の長さ)。
const cornerBrackets = (x: number, y: number, h: number, a: number): string => [
  `M${x - h},${y - h + a} V${y - h} H${x - h + a}`, `M${x + h - a},${y - h} H${x + h} V${y - h + a}`,
  `M${x + h},${y + h - a} V${y + h} H${x + h - a}`, `M${x - h + a},${y + h} H${x - h} V${y + h - a}`,
].join(' ');
const NO_FACES: readonly MapBossFace[] = [];
// 外の弧: 右下を約70°欠く(共通部品 BossHeadFace の弧)。
const rimArc = (x: number, y: number): string => bossFaceRimArc(x, y, RIM_R);
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

// target=開いた時の出撃先(utils/dsHome.sortieTarget)。kind 'next'=NEXT の菱形、'last'=「前回」の字。どちらも元の場所に残す(輪とは別)。
// pick=選択中の作戦地域(琥珀の輪・下端の札と場所名)。locked=地図に出す未解放のステージ(NEXT の1つ先・utils/opsMapSelect)。
// onPick=場所の印かボスの顔を押した時(そのステージの id)。onOthers=地図の下端の「作戦地域一覧」(作戦地域の一覧)。
const LAST_LABEL = MAP_PICK_LABEL.last;
const DsStoryMap: React.FC<{
  stages: readonly Stage[]; cleared: ReadonlySet<string>; target: SortieTarget | null; pick: MapPick | null; locked?: Stage | null;
  sectorLabel: string; bossFaces?: readonly MapBossFace[]; onPick?: (stageId: string) => void; onOthers?: () => void;
}> = ({ stages, cleared, target, pick, locked = null, sectorLabel, bossFaces = NO_FACES, onPick, onOthers }) => {
  const clipBase = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const dest = target ? target.stage : null;
  const isLast = target?.kind === 'last';
  const nextId = dest ? dest.id : null;
  const trail = useMemo(() => storyTrail(stages, cleared, nextId), [stages, cleared, nextId]);
  const names = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s.locationTitle])), [stages]);
  const lockedAt = locked ? OPS_MAP_PLACES[locked.id] : undefined;
  // ボスの顔の列: 点の下に最大4つ横一列(徘徊が先頭)+「+N」。近い地点の列・行った場所の四角・今いる所・NEXT の菱形・未解放の四角とは重ねない(上下へ逃がす)。
  const faceSpots = useMemo(() => {
    const PX = (at: readonly [number, number]) => [at[0] * OPS_MAP_W, at[1] * OPS_MAP_H] as const;
    const avoid = [
      ...trail.visited.map(v => ({ x: PX(v.at)[0], y: PX(v.at)[1], half: 2.6 * U })),
      ...(trail.current ? [{ x: PX(trail.current.at)[0], y: PX(trail.current.at)[1], half: 3.6 * U }] : []),
      ...(trail.next ? [{ x: PX(trail.next.at)[0], y: PX(trail.next.at)[1], half: 4.2 * U }] : []),
      ...(lockedAt ? [{ x: PX(lockedAt)[0], y: PX(lockedAt)[1], half: 2.6 * U }] : []),
      ...bossFaces.flatMap(f => { const at = OPS_MAP_PLACES[f.stageId]; return at ? [{ x: PX(at)[0], y: PX(at)[1], half: 2.6 * U }] : []; }),
    ];
    return layoutMapFaces(bossFaces, id => { const at = OPS_MAP_PLACES[id]; return at ? PX(at) : undefined; },
      { diameter: FACE_D, gap: FACE_GAP, offset: 6 * U, mapW: OPS_MAP_W, mapH: OPS_MAP_H, moreW: 11 * U, markHalf: 3.4 * U, avoid });
  }, [bossFaces, trail, lockedAt]);
  const svgRef = useRef<SVGSVGElement>(null);
  const faceHits = useMemo(() => faceSpots.flatMap(s => s.faces.filter(f => BOSS_HEAD_CROPS[f.face.sprite])
    .map(f => ({ key: f.face.key, stageId: f.face.stageId, x: f.x, y: f.y }))), [faceSpots]);
  // 押せる物=ボスの顔+場所の印(出撃先の印・未解放の四角・行った場所の四角)。同じ場所に複数のステージがある時(ステージ6と EX)は出撃先を先に。
  const stageHits = useMemo<MapStageHit[]>(() => {
    const PX = (at: readonly [number, number]) => [at[0] * OPS_MAP_W, at[1] * OPS_MAP_H] as const;
    const marks: MapStageHit[] = [];
    const tAt = dest ? OPS_MAP_PLACES[dest.id] : undefined;
    if (dest && tAt) marks.push({ stageId: dest.id, x: PX(tAt)[0], y: PX(tAt)[1] });
    if (locked && lockedAt) marks.push({ stageId: locked.id, x: PX(lockedAt)[0], y: PX(lockedAt)[1] });
    for (const v of trail.visited) marks.push({ stageId: v.id, x: PX(v.at)[0], y: PX(v.at)[1] });
    return [...faceHits.map(h => ({ stageId: h.stageId, x: h.x, y: h.y })), ...marks];
  }, [faceHits, dest, locked, lockedAt, trail]);
  // PC(横長・マウス)だけ: カーソルを乗せた顔の弧を少し濃く。スマホ(タッチ)は変えない。押せる物の上ではマウスの指の形。
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverHit, setHoverHit] = useState(false);
  // 選択中の輪(未解放は角の括弧)。選び直すと前の輪は減速しながら薄れて広がって消え(.is-out)、そのあと新しい輪が外から縮んで入る。
  // 開いた時の輪だけは画面の入りに合わせて少し遅らせる(index.css .ds-map-next-ring)。
  const pickId = pick ? pick.stage.id : null;
  const pickLocked = pick?.kind === 'locked';
  const seqRef = useRef(0);
  const [rings, setRings] = useState<readonly RingItem[]>(() => (pickId && OPS_MAP_PLACES[pickId]
    ? [{ id: pickId, locked: pickLocked, n: 0, leaving: false, fresh: false }] : []));
  useEffect(() => {
    setRings(prev => {
      const cur = prev.find(r => !r.leaving);
      if (cur && cur.id === pickId && cur.locked === pickLocked) return prev;
      const out = prev.map(r => (r.leaving ? r : { ...r, leaving: true }));
      return pickId && OPS_MAP_PLACES[pickId] ? [...out, { id: pickId, locked: pickLocked, n: ++seqRef.current, leaving: false, fresh: true }] : out;
    });
  }, [pickId, pickLocked]);
  useEffect(() => {
    if (!rings.some(r => r.leaving)) return;
    const id = window.setTimeout(() => setRings(prev => prev.filter(r => !r.leaving)), RING_OUT_MS);
    return () => window.clearTimeout(id);
  }, [rings]);
  // 選択中をもう一度押した時: 輪が一度縮んで弾けてから進む(進む先は MissionSelect が決める=onPick を少し遅らせて呼ぶ)。
  const [going, setGoing] = useState(false);
  useEffect(() => {
    if (!going || !pickId || !onPick) return;
    const id = window.setTimeout(() => { setGoing(false); onPick(pickId); }, RING_GO_MS);
    return () => window.clearTimeout(id);
  }, [going, pickId, onPick]);
  const onMapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m || !onPick || going) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const id = pickMapStageHit(stageHits, pt.x, pt.y, mapHitHalf(m));
    if (!id) return;
    if (id === pickId && !pickLocked) setGoing(true);
    else onPick(id);
  }, [stageHits, onPick, going, pickId, pickLocked]);
  const onMapHover = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') return;
    const m = svgRef.current?.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const half = mapHitHalf(m);
    const on = pickMapStageHit(stageHits, pt.x, pt.y, half) !== null;
    setHoverHit(prev => (prev === on ? prev : on));
    const k = window.innerWidth > window.innerHeight
      ? pickMapStageHit(faceHits.map(h => ({ stageId: h.key, x: h.x, y: h.y })), pt.x, pt.y, half) : null;
    setHoverKey(prev => (prev === k ? prev : k));
  }, [faceHits, stageHits]);
  if (DS_MAP_DISABLED) return null;
  const P = (at: readonly [number, number]) => [at[0] * OPS_MAP_W, at[1] * OPS_MAP_H] as const;
  const visited = trail.visited.map(v => P(v.at));
  const cur = trail.current ? P(trail.current.at) : null;
  const nxt = trail.next ? P(trail.next.at) : null;
  const sameSpot = !!(cur && nxt && cur[0] === nxt[0] && cur[1] === nxt[1]);
  const right = (x: number) => x > OPS_MAP_W * 0.72;
  // 印を出すか: NEXT は今いる所と同じ地点なら出さない(従来どおり)。「前回」は今いる所(最後にクリアした所)と重なっても出す
  // (全部クリアした後は最終ステージを最後に遊ぶことが多い=重なるのが普通)。重なる時は白い角を残し、菱形は描かず言葉だけ。
  const showMark = !!(nxt && dest && (isLast || !sameSpot));
  const lk = lockedAt ? P(lockedAt) : null;
  // 選択が開いた時の出撃先(NEXT/前回)から離れている間は、その印を一段落とす(薄く・明滅を止める)。
  const onTarget = !!dest && pickId === dest.id;
  // 輪が出撃先の印に重なる時は「NEXT」の字を輪の外へ逃がす(字の置き場所を横へずらす・減速)。
  const markSide = nxt && right(nxt[0]) ? -1 : 1;
  const markShift = onTarget && !sameSpot ? markSide * (RING_R + 2 * U - 5.5 * U) : 0;
  // 選んだステージに顔が居る時だけ、ほかの顔を沈める(顔の無いステージを選んだ時は誰も沈めない)。
  const anySel = !!pickId && bossFaces.some(f => f.stageId === pickId);
  const segs = visited.length - 1;
  // 文字の縁取りは細く(字幕のような太い縁にしない・検収クリエイティブ監査 #8)。
  const textProps = { paintOrder: 'stroke' as const, stroke: 'rgba(7,6,13,0.85)', strokeWidth: 1.4 * U, strokeLinejoin: 'round' as const };
  const ease = { calcMode: 'spline' as const, keyTimes: '0;0.5;1', keySplines: '0.42 0 0.58 1;0.42 0 0.58 1' };
  return (
    // PC の横長: 箱が原画とほぼ同じ比になり、縦の余白(=札の帯)が無くなって SECTOR の札が絵に重なる。
    // 横長の時は中の札を出さず(index.css の .ds-home .ds-map-tag)、箱の外の上に右の列の「PREP ── 準備」と同じ書式の見出しを出す
    // (MissionSelect の .ds-glabel-sector)。縦持ちは今どおり(中の札・箱 210px)。
    <div className="ds-map landscape:!h-[clamp(120px,calc(100svh/var(--hud-s,1)_-_250px),275px)]" style={{ height: 210, background: '#0d0e13' }}>{/* 原画の縁の色=幅に合わせた時の余白が帯に見えない */}
      {/* 地図は下端に揃える=余白は上の SECTOR の札の帯に寄る(検収クリエイティブ監査 #7)。 */}
      <svg viewBox={`0 0 ${OPS_MAP_W} ${OPS_MAP_H}`} preserveAspectRatio="xMidYMax meet"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: hoverHit ? 'pointer' : undefined }} aria-label="作戦地図"
        ref={svgRef} onClick={onPick ? onMapClick : undefined}
        onPointerMove={onMapHover} onPointerLeave={hoverKey || hoverHit ? () => { setHoverKey(null); setHoverHit(false); } : undefined}>
        <image href={assetUrl(OPS_MAP_IMAGE)} x={0} y={0} width={OPS_MAP_W} height={OPS_MAP_H} />
        {/* 未解放(NEXT の1つ先だけ)=四隅だけの欠けた四角(地図の手描きの線と同じ細さ・点線の歯車に見せない)。線の下に敷く。 */}
        {lk && (
          <g pointerEvents="none">
            <rect x={lk[0] - 2.4 * U} y={lk[1] - 2.4 * U} width={4.8 * U} height={4.8 * U} fill="rgba(7,6,13,0.72)" />
            <path d={cornerBrackets(lk[0], lk[1], 2.6 * U, 1.5 * U)} fill="none" stroke="rgba(233,223,200,0.8)" strokeWidth={1.3}
              vectorEffect="non-scaling-stroke" strokeLinecap="square" />
          </g>
        )}
        {/* 軌跡=クリアした場所を話の順に結ぶ琥珀の線。古い区間ほど薄い(時間の流れ・検収クリエイティブ監査 #2)。 */}
        {visited.slice(1).map((p, i) => (
          <path key={i} d={arc(visited[i], p, i)} fill="none" stroke={AMBER} strokeOpacity={segs > 1 ? 0.35 + 0.5 * (i / (segs - 1)) : 0.85}
            strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        ))}
        {/* 次の出撃先へ細かい点線(方向が読める・検収クリエイティブ監査 #5)。 */}
        {cur && nxt && !sameSpot && !isLast && (
          <path d={arc(cur, nxt, segs + 1)} fill="none" stroke={AMBER} strokeOpacity={0.9} strokeWidth={1.3}
            vectorEffect="non-scaling-stroke" strokeDasharray={`${1.6 * U} ${1.4 * U}`} />
        )}
        {/* 行った場所=琥珀の四角(実寸 約4〜5px)。出発点だけ中抜き(検収クリエイティブ監査 #4)。 */}
        {visited.map((p, i) => (i === 0
          ? <rect key={i} x={p[0] - 2.2 * U} y={p[1] - 2.2 * U} width={4.4 * U} height={4.4 * U} fill="rgba(7,6,13,0.6)" stroke={AMBER} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
          : <rect key={i} x={p[0] - 2.2 * U} y={p[1] - 2.2 * U} width={4.4 * U} height={4.4 * U} fill={AMBER} />))}
        {/* 選択中の作戦地域=細い光る輪(印から下へ降ろす線は出さない=社長指示2026-11-25「やめようその矢印」)。
            選ぶたびにその場所で外から縮んで止まり(減速)、以後は菱形と同じ加減速でゆっくり息をする。
            未解放を選んだ時は生成りの灰の点線で、息はしない(まだ行けない)。 */}
        {rings.length > 0 && (
          <g pointerEvents="none">
            {rings.map(r => {
              const at = OPS_MAP_PLACES[r.id];
              if (!at) return null;
              const [rx, ry] = P(at);
              const cls = `ds-map-next-ring${r.leaving ? ' is-out' : r.fresh ? ' is-in' : ''}${!r.leaving && going ? ' is-go' : ''}`;
              return (
                <g key={r.n} className={cls}>
                  {r.locked ? (
                    // 未解放を選んだ時: 輪ではなく、印を囲む欠けた四角(生成りの灰)。息はしない(まだ行けない)。
                    <>
                      <path d={cornerBrackets(rx, ry, 6.2 * U, 2.4 * U)} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={3.2} vectorEffect="non-scaling-stroke" />
                      <path d={cornerBrackets(rx, ry, 6.2 * U, 2.4 * U)} fill="none" stroke={LOCKED_INK} strokeWidth={1.3} vectorEffect="non-scaling-stroke" strokeLinecap="square" />
                    </>
                  ) : (
                    <>
                      <circle cx={rx} cy={ry} r={RING_R} fill="none" stroke={AMBER} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeOpacity={0.12}>
                        <animate attributeName="stroke-opacity" values="0.16;0.04;0.16" dur="2.6s" repeatCount="indefinite" {...ease} />
                      </circle>
                      <circle cx={rx} cy={ry} r={RING_R} fill="none" stroke={AMBER} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeOpacity={0.6}>
                        <animate attributeName="stroke-opacity" values="0.85;0.35;0.85" dur="2.6s" repeatCount="indefinite" {...ease} />
                      </circle>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        )}
        {/* 次の目標=琥珀明の中抜きの菱形(ゆっくり加減速して明滅)+小さな「NEXT」/全部クリアした後の「前回」。選択を移しても元の場所に残す。 */}
        {showMark && nxt && (
          <g pointerEvents="none" className="ds-map-target-mark" style={{ opacity: onTarget || !pickId ? 1 : 0.5 }}>
            {!sameSpot && <rect x={nxt[0] - 2.8 * U} y={nxt[1] - 2.8 * U} width={5.6 * U} height={5.6 * U} fill="rgba(7,6,13,0.7)" stroke={AMBER_HI}
              strokeWidth={1.5} vectorEffect="non-scaling-stroke" transform={`rotate(45 ${nxt[0]} ${nxt[1]})`}>
              {(onTarget || !pickId) && <animate attributeName="stroke-opacity" values="1;0.35;1" dur="2.6s" repeatCount="indefinite" {...ease} />}
            </rect>}
            {/* 今いる所と重なる「前回」は、上にある場所の名と当たらないよう輪の真下へ。輪が重なる時の「NEXT」は輪の外へ。 */}
            <text className="ds-map-target-word" style={{ transform: `translateX(${markShift}px)` }}
              x={sameSpot ? nxt[0] : nxt[0] + markSide * 5.5 * U} y={nxt[1] + (sameSpot ? 16 * U : 1.9 * U)} fontSize={9 * U}
              letterSpacing={1.2 * U}
              fill={AMBER_HI} textAnchor={sameSpot ? 'middle' : right(nxt[0]) ? 'end' : 'start'} {...textProps}>{isLast ? LAST_LABEL : MAP_PICK_LABEL.next}</text>
          </g>
        )}
        {/* 9: 未解放を選んでいる間=目標の印が一度だけ強く光る(灯って膨らみ、減速しながら薄れる・線は引かない)。選び直すたびに1回。 */}
        {pickLocked && nxt && !isLast && (
          <g pointerEvents="none" key={`flash-${rings.find(r => !r.leaving)?.n ?? 0}`}>
            <g className="ds-map-target-flash">
              <circle cx={nxt[0]} cy={nxt[1]} r={4.6 * U} fill={AMBER_HI} fillOpacity={0.22} stroke="none" />
              <rect x={nxt[0] - 3.6 * U} y={nxt[1] - 3.6 * U} width={7.2 * U} height={7.2 * U} fill="none" stroke={AMBER_HI}
                strokeWidth={2} vectorEffect="non-scaling-stroke" transform={`rotate(45 ${nxt[0]} ${nxt[1]})`} />
            </g>
          </g>
        )}
        {/* 今いる所=白い角+場所の名(スマホで約9px=既存の札と同じ大きさ・検収品質監査 A2)。 */}
        {cur && trail.current && (
          <g pointerEvents="none">
            <rect x={cur[0] - 3.4 * U} y={cur[1] - 3.4 * U} width={6.8 * U} height={6.8 * U} fill="rgba(7,6,13,0.55)" stroke="rgba(255,255,255,0.65)"
              strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <rect x={cur[0] - 1.3 * U} y={cur[1] - 1.3 * U} width={2.6 * U} height={2.6 * U} fill="#fff" />
            <text x={cur[0] + (right(cur[0]) ? -5 * U : 5 * U)} y={cur[1] - 4 * U} fontSize={10 * U} letterSpacing={0.6 * U}
              fill="rgba(255,255,255,0.82)" textAnchor={right(cur[0]) ? 'end' : 'start'} {...textProps}>{names[trail.current.id] ?? ''}</text>
          </g>
        )}
        {/* ボスの顔(出会った・倒していない)。頭だけ丸く切り抜く=表(data/bossHeadCrops.ts)の頭の中心・半径で絵を置いて丸で切る。
            明るさは軽く持ち上げて揃える(暗い絵が地図に沈まない)。縁の内側にわずかな光。 */}
        {faceSpots.length > 0 && <BossFaceDefs idBase={clipBase} />}
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
            // 選んだステージの顔がこの列に居れば、点から列への線を琥珀に。選択中がある時、ほかの列の線は薄く。
            const spotSel = anySel && spot.faces.some(f => f.face.stageId === pickId);
            return (
              <g key={`${spot.at[0]},${spot.at[1]}`}>
                {/* 点から列への細い引き線(徘徊が居る列は血の赤)。 */}
                <line className="ds-map-face-fade" style={{ animationDelay: `${spotDelay}ms` }} x1={spot.line.x1} y1={spot.line.y1} x2={spot.line.x2} y2={spot.line.y2}
                  stroke={spotSel ? AMBER : patrolFirst ? FACE_RIM_PATROL : FACE_RIM}
                  strokeOpacity={spotSel ? 0.95 : anySel ? 0.22 : patrolFirst ? 0.9 : 0.5}
                  strokeWidth={spotSel ? 1.3 : patrolFirst ? 1.2 : 0.9} vectorEffect="non-scaling-stroke" />
                {spot.faces.map(({ face, x, y }, fi) => {
                  const crop = BOSS_HEAD_CROPS[face.sprite];
                  if (!crop) return null;
                  const id = `${clipBase}-f${si}-${fi}`;
                  const rim = face.rim ?? (face.patrol ? FACE_RIM_PATROL : FACE_RIM); // 孫悟空=レベルの色
                  const sel = !!pickId && face.stageId === pickId;
                  const w = sel ? 1.5 : face.patrol ? 1.3 : 1;
                  return (
                    <g key={face.key} className="ds-map-face" data-stage={face.stageId} style={{ animationDelay: `${delayOf(fi)}ms` }}>
                     {/* 選んだステージの顔は減速しながら少し浮いて大きく・明るく・影、ほかの顔は沈む(index.css .ds-map-face-pop)。 */}
                     <g className={`ds-map-face-pop${sel ? ' is-sel' : anySel ? ' is-sink' : ''}`}
                       style={{ transformOrigin: `${x}px ${y}px`, ['--lift' as string]: `${spot.below ? FACE_LIFT : -FACE_LIFT}px` }}>
                      <BossHeadFace idBase={clipBase} clipId={id} x={x} y={y} r={FACE_R} sprite={face.sprite} crop={crop} />
                      {/* 外の印: 一部欠けた細い弧+上の小さな刻み。徘徊は暗い血の赤でゆっくり明滅(NEXT の菱形と同じ加減速)。 */}
                      {/* 選んだ顔は弧を太く・白寄りに。PC でカーソルを乗せた顔は弧を少し濃く(徘徊は明滅が勝つので変えない)。 */}
                      <g stroke={sel ? FACE_RIM_SEL : rim} fill="none"
                        style={face.patrol && !sel ? { strokeOpacity: 1 } : { strokeOpacity: sel ? 1 : hoverKey === face.key ? 0.9 : 0.72, transition: 'stroke-opacity 120ms cubic-bezier(0.2, 0.7, 0.3, 1)' }}>
                        <path d={rimArc(x, y)} strokeWidth={w} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                        <line x1={x} y1={y - RIM_R} x2={x} y2={y - RIM_R - TICK_L} strokeWidth={w} vectorEffect="non-scaling-stroke" />
                        {face.patrol && !sel && <animate attributeName="stroke-opacity" values="1;0.3;1" dur="2.6s" repeatCount="indefinite" {...ease} />}
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
      </svg>
      <span className="ds-map-tag">SECTOR — <SwapText value={sectorLabel} /></span>
      {/* 地図の下端に選択中の作戦地域: 札(目標/前回/再訪。未解放は札なし)+場所の名(明朝)。任務名は出撃の帯が持つ(同じ名を2度言わない)。
          右に「作戦地域一覧」(作戦地域の一覧)。選択中が無い時は出さない(出撃の帯が一覧へ行く形に戻る)。
          帯は地図の操作(顔・印)を邪魔しない=押せるのは「作戦地域一覧」だけ。 */}
      {pick && (
        <div className={`ds-map-dest${pickLocked ? ' is-locked' : ''}`} aria-label="選択中の作戦地域">
          {/* 11: 未解放の時は札を出さない(出撃の帯だけが「未解放」と言う)。 */}
          {!pickLocked && <span className={`ds-map-dest-k is-${pick.kind}`}><SwapText value={MAP_PICK_LABEL[pick.kind]} /></span>}
          <span className="ds-map-dest-pl"><SwapText value={pickLocked ? LOCKED_PLACE_NAME : pick.stage.locationTitle} /></span>
          {onOthers && (
            <button type="button" data-nav-id="ops-others" data-testid="ops-others" className="ds-map-dest-ot" onClick={onOthers}>
              作戦地域一覧<PixelIcon name="chevron-right" size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// 原画の単位での当たりの半分(画面の 22px を地図の拡大率で直す)。
const mapHitHalf = (m: DOMMatrix): number => HIT_HALF_PX / (Math.hypot(m.a, m.b) || 1);

export default DsStoryMap;
