// PACING_PUZZLE.md §14-4(新たな死神v1)。本体の直進+旋回移動・技「使者」の囲み配置/population
// 管理・ノックバック特例を純関数として切り出す(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に
// 切り出してテスト」)。useGameLoop/gameStore はこれらを呼ぶだけ(座標の実書き込みは呼び出し側)。

export interface Point { x: number; y: number; }
export interface ChaseOrbitResult extends Point { orbiting: boolean; }

/**
 * 死神本体の1フレーム移動(§14-4-2「直進+70px旋回」)。
 * プレイヤー中心(px,py)へ向けて直進し、縁距離(orbitDistPx)を切ったら旋回へ切り替える
 * (時計回り固定・叩き台)。旋回はプレイヤーからの相対ベクトルを弧長/半径ぶん回転させるので、
 * 距離(=旋回半径)を保ったまま円を描く。
 *
 * `straightStepPx`/`orbitStepPx` は呼び出し側が `speed × deltaTime × MOVE_SPEED_MULT` まで
 * 計算済みの「このフレームで進む距離」を渡すこと(このモジュールはdeltaTime/速度を持たない)。
 */
export const stepReaperBody = (
  bx: number, by: number, px: number, py: number,
  straightStepPx: number, orbitStepPx: number, orbitDistPx: number,
): ChaseOrbitResult => {
  const dx = px - bx, dy = py - by;
  const dist = Math.hypot(dx, dy);
  if (dist > orbitDistPx) {
    if (dist < 0.001) return { x: bx, y: by, orbiting: false };
    const nx = dx / dist, ny = dy / dist;
    return { x: bx + nx * straightStepPx, y: by + ny * straightStepPx, orbiting: false };
  }
  // 旋回: プレイヤー中心の相対ベクトル(rx,ry)を弧長/半径ぶんの角度だけ回転する(半径を保存)。
  const radius = Math.max(1, dist);
  const rx = bx - px, ry = by - py;
  const ang = orbitStepPx / radius;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  return { x: px + (rx * cos - ry * sin), y: py + (rx * sin + ry * cos), orbiting: true };
};

/**
 * PACING_PUZZLE.md §14-4-3(中8/中9): 使者の囲み配置の半径。
 * 半径 ≧ hypot(画面w/2,h/2) ÷ spawnZoomTarget + margin(**ズームで割る**=通常湧きの
 * spawnBounds拡張の作法。現行死神の湧き式はズームを見ておらず、最大引き0.40では画面内に
 * ポップする既存の穴だった=ここで是正)。
 */
export const encircleRadiusPx = (
  screenW: number, screenH: number, spawnZoomTarget: number, marginPx: number,
): number => Math.hypot(screenW / 2, screenH / 2) / Math.max(0.0001, spawnZoomTarget) + marginPx;

/** count体をプレイヤー中心(cx,cy)の円周上へ均等配置(角度は起点角から均等割り・§14-4-3叩き台)。 */
export const encirclePoints = (
  count: number, cx: number, cy: number, radius: number, startAngleRad = 0,
): Point[] => {
  const n = Math.max(0, Math.round(count));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = startAngleRad + (i / Math.max(1, n)) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
};

/**
 * 廊下系ステージ(研究所±200px帯・洋館corridorMode)の囲み配置の縮退(§14-4-3叩き台):
 * 円周が成立しないため左右2点+可視域外へ縮退する。
 */
export const corridorEncirclePoints = (cx: number, cy: number, radius: number): Point[] => [
  { x: cx - radius, y: cy },
  { x: cx + radius, y: cy },
];

export interface ServantPopulationState { count: number; lastAddAt: number; }
export interface ServantPopulationResult extends ServantPopulationState { added: boolean; }

/**
 * PACING_PUZZLE.md §14-4-3: 召喚開始から10秒ごとに+1・最大まで。耐久が尽きた使者の即補充は
 * 呼び出し側(死んだら数を減らしてから毎フレームこれを呼ぶ=次のintervalを待たず埋まる設計ではなく、
 * 「減った分はintervalを待たず次回のadd判定でcountが上限未満に戻るだけ」で表現する——
 * 「即補充」は呼び出し側が death 検出時に count を減算し、次にこの関数を呼んだ時 count<max なら
 * 即座に埋まるまでの待ち時間として現れる(この関数自体はintervalの歩進だけを見る純関数)。
 */
export const stepServantPopulation = (
  state: ServantPopulationState, now: number, intervalMs: number, max: number,
): ServantPopulationResult => {
  if (state.count >= max) return { ...state, added: false };
  if (now - state.lastAddAt < intervalMs) return { ...state, added: false };
  return { count: state.count + 1, lastAddAt: now, added: true };
};

/**
 * PACING_PUZZLE.md §14-4-3(裁定済み#6/#8): 使者は「どのような攻撃でもノックバック(CD無し)」
 * =全ヒットが積む(多段あり=束ねない・社長裁定2026-08-28)。他タイプは従来どおり
 * `knockbackImmuneUntil` の免疫CDを見る。damageEnemyの合流点(=この1関数)でhangedmanだけ
 * CDをスキップする特例、として全melee系KB適用サイトがここを通る。
 */
export const knockbackCdReady = (
  e: { type: string; knockbackImmuneUntil?: number }, now: number,
): boolean => e.type === 'hangedman' || now >= (e.knockbackImmuneUntil ?? 0);
