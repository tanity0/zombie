// research/AI_HUMANIZE.md B1(記録側=コマ台帳)。「対象州(episodeKey)ごとに、直近10回の本人がその州の
// 着弾にどう対応したか」を録るだけの純関数レイヤ(§1)。**挙動変更ゼロ**——ここは録るだけで、
// 判定・移動・描画には一切書き込まない(呼び出し側は既存の州遷移エッジへ1行差すだけ)。
//
// ## 依存の軽い葉(counterReach.tsと同じ理由・v0.25.3390のTDZ事故の再発防止)
// gameStore.ts はこのファイルを import する側(giantbat/bountyTick/angelBossTick/useGameLoopの記録
// フックから settleEpisode を呼ぶ)なので、**このファイルは gameStore.ts を import しない**。
// ★記述の訂正(検収是正・記述と実態の食い違い): 天使7州+城ボス9州(giant9州)の実寸法は、
// ★未決#14(社長裁定2026-09-02=(a))実装後は**葉モジュール episodeShape.ts が単一の出どころ**
// (`episodeShapeFor`)。gameStore.ts/angelBossTick.ts はそこから寸法定数を再exportして使うだけで、
// もう「呼び出し側がその場でliveShapeを組む」ことはしていない(呼び出し側は episodeShapeFor の
// 戻り値をそのまま liveShape として渡す=数値の複製ゼロ)。
//
// ## 図形の引き先(§1-0)は3段
// ① COUNTER_REACH_DECL に宣言がある州(bounty/thor 17州)= counterReachShapeFor をそのまま呼ぶ
//    (数値複製ゼロ・判定と同じ関数)。
// ② 判定側に実図形はあるが宣言表には無い州(天使7州+giant9州)= 呼び出し側が episodeShapeFor
//    (episodeShape.ts)の戻り値を liveShape として渡す。
// ③ どちらも無い州(giantbat:g-bolt-windup のみ)= body(縁基準)。
import type { Rect } from '../world/obstacles';
import type { Enemy } from '../types/game';
import { distToBandRect } from './geometry';
import {
  counterReachShapeFor, counterReachKindFor, type CounterReachShape, type CounterReachCtx,
} from './counterReach';
export type { CounterReachShape } from './counterReach'; // 呼び出し側(gameStore.ts等)がliveShapeを組む型
import { IMPACT_AT_WINDUP_END_BOSS_STATES, GIANT_IMPACT_AT_WINDUP_END } from './ghostCounterAim';
// research/AI_HUMANIZE.md B2 ★未決#14(社長裁定2026-09-02=(a)): live 16州(天使7+城ボス9)の
// 実図形は葉モジュール episodeShape.ts が持つ(数値の複製禁止=gameStore.ts/angelBossTick.tsの
// 寸法定数はこのファイル経由ではなくepisodeShape.tsが単一の出どころ)。
import { episodeShapeFor, episodeAxisFor, isDeclaredSelfCenteredAxisKey } from './episodeShape';

// =================================================================================================
// EPISODE_KEYS(§1-0・機械検査対象)
// =================================================================================================
/** 対象キーの正本=着弾宣言表2本(ghostCounterAim.ts)から導出。合計34州。紫(カウンター不可)技は
 * 元の表自体が対象外(IMPACT_AT_WINDUP_END_BOSS_STATES/GIANT_IMPACT_AT_WINDUP_ENDに紫技は載らない)。 */
export const EPISODE_KEYS: readonly string[] = [
  ...IMPACT_AT_WINDUP_END_BOSS_STATES,
  ...GIANT_IMPACT_AT_WINDUP_END.map(phase => `giantbat:${phase}`),
];
const EPISODE_KEY_SET: ReadonlySet<string> = new Set(EPISODE_KEYS);
export const isEpisodeKey = (key: string): boolean => EPISODE_KEY_SET.has(key);

/**
 * 写像ヘルパ(§1-0): enemyType → 系統プレフィクス。COUNTER_REACH_DECL のキー方式(`${持ち主}:${state}`)
 * へ変換する。記録側(このファイル)と将来の再生側(B2)で共有できる純関数。
 * bounty-*(バス停/馬乗り/バランス/舞妓)→'bounty' / thor・mimir・jormungand・skadi(裏ボス4体)→'hidden' /
 * 天使(miguel/rafi/uri/suriel/acrasiel/jibril/phillboss)・giantbatは type がそのままキー。
 */
export const reachKeyFor = (enemyType: string, state: string): string => {
  const prefix = enemyType.startsWith('bounty-')
    ? 'bounty'
    : (enemyType === 'thor' || enemyType === 'mimir' || enemyType === 'jormungand' || enemyType === 'skadi')
      ? 'hidden'
      : enemyType;
  return `${prefix}:${state}`;
};

/**
 * §1-2: 毎フレーム狙い直す図形の州(位置取りの対象外=タイミングだけ再生)。実在確認済みで
 * `thor:tsuki-windup` の1件だけ(v3で挙げたidol/mk-boomはEPISODE_KEYS外だった=追補監査#16)。
 * B1では定数化のみ(消費はB2の守護霊再生)。
 */
export const TRACKED_SHAPE_KEYS: readonly string[] = ['thor:tsuki-windup'];

/** 州→図形源の分類(§1-0)。①declared=COUNTER_REACH_DECL経由 ②live=呼び出し側がその場で組む
 * ③body-only=図形源なし(縁基準・現状 giantbat:g-bolt-windup のみ)。 */
export type EpisodeShapeCategory = 'declared' | 'live' | 'body-only';

// ①declared(17州・COUNTER_REACH_DECLに宣言がある州=bounty/thor)。
const DECLARED_KEYS: readonly string[] = IMPACT_AT_WINDUP_END_BOSS_STATES.filter(
  k => !k.startsWith('miguel:') && !k.startsWith('uri:') && !k.startsWith('suriel:'),
);
// ②live(天使7州・COUNTER_REACH_DECLに宣言が無いが判定側に実図形がある)。
const ANGEL_LIVE_KEYS: readonly string[] = IMPACT_AT_WINDUP_END_BOSS_STATES.filter(
  k => k.startsWith('miguel:') || k.startsWith('uri:') || k.startsWith('suriel:'),
);
// ②live(giant9州・実寸法は呼び出し側=gameStore.tsが渡す)。
const GIANT_LIVE_STATES: readonly string[] = [
  'g-stomp-windup', 'g-sweep-windup', 'g-slam-windup', 'g-glide-windup', 'g-dive-windup',
  'g-wing-windup', 'g-trishot-windup', 'g-reach-windup', 'g-tailslam-windup',
];
const GIANT_LIVE_KEYS: readonly string[] = GIANT_LIVE_STATES.map(s => `giantbat:${s}`);
// ③body-only(1州・弾を撃つだけで近接図形を持たない)。
const BODY_ONLY_KEYS: readonly string[] = ['giantbat:g-bolt-windup'];

/** 州→図形源の対応表(監査・機械検査用の索引。実際の図形構築は上の3段の説明どおり)。 */
export const EPISODE_SHAPE_DECL: Readonly<Record<string, EpisodeShapeCategory>> = Object.freeze({
  ...Object.fromEntries(DECLARED_KEYS.map(k => [k, 'declared' as const])),
  ...Object.fromEntries(ANGEL_LIVE_KEYS.map(k => [k, 'live' as const])),
  ...Object.fromEntries(GIANT_LIVE_KEYS.map(k => [k, 'live' as const])),
  ...Object.fromEntries(BODY_ONLY_KEYS.map(k => [k, 'body-only' as const])),
});

/**
 * B2(再生側)★未決#14(社長裁定2026-09-02=(a)): 「州→今この瞬間の実図形」を**1本の関数**で返す。
 * settleEpisode の3段分岐(declared/live/body-only)と同じ根拠を再生側でも共有する
 * (①declaredはcounterReachShapeForをそのまま呼ぶ=判定と同じ関数 ②liveはepisodeShapeFor
 * ③body-onlyは{kind:'body'})。**寸法をghostDriver側へ複製しない**(§1-0)。
 * `enemy` はこの技を出している本人(Enemy)そのもの(記録側と同じ材料)。
 * 対象外の州(EPISODE_KEYS外)は null。
 */
export const shapeForEpisodeReplay = (enemyType: string, state: string, enemy: Enemy): CounterReachShape | null => {
  const episodeKey = `${enemyType}:${state}`;
  const category = EPISODE_SHAPE_DECL[episodeKey];
  if (category === undefined) return null;
  if (category === 'body-only') return { kind: 'body' };
  if (category === 'live') return episodeShapeFor(enemyType, state, enemy);
  // declared: 判定側と同じ counterReachShapeFor をそのまま呼ぶ(数値の複製なし)。
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  const reachKey = reachKeyFor(enemyType, state);
  const ctx: CounterReachCtx = {
    bcx: ecx, bcy: ecy, pcx: ecx, pcy: ecy, // 対象17州はどれもプレイヤー座標を使わない(実装時に確認済み)
    aiFromX: enemy.aiFromX, aiFromY: enemy.aiFromY, aiTargetX: enemy.aiTargetX, aiTargetY: enemy.aiTargetY,
    tripleAng: enemy.bountyTripleAng,
  };
  return counterReachShapeFor(reachKey, ctx);
};

/**
 * B2(再生側): その州の「軸」(circle/bodyの差角の基準・§2-8確定事項#7の退化判定に使う)。
 * band系の位置取りには使われない(habitPosのband分岐は帯自身のfx/fy/tx/tyだけで測る)ので、
 * declared側は counterReachShapeFor と同じ既定(aiFromX??ecx等)を返せば十分。
 */
export const axisForEpisodeReplay = (
  enemyType: string, state: string, enemy: Enemy,
): { fromX: number; fromY: number; toX: number; toY: number } => {
  const episodeKey = `${enemyType}:${state}`;
  const category = EPISODE_SHAPE_DECL[episodeKey];
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  if (category === 'live') return episodeAxisFor(enemyType, state, enemy);
  // 検収是正#1(§2-8確定事項#7=A10): declared自分中心州(記録側=bountyTick.ts settleBountyHabitと
  // 同じ台帳)は軸を退化させる(今の自分=from=to)。前の技の残骸(enemy.aiFromX/aiTargetX)を
  // 絶対角として復元しない——退化州は「角度は今の霊の角度を保つ」(unhabitPosのcurrentAngleRad任せ)。
  if (isDeclaredSelfCenteredAxisKey(enemyType, state)) {
    return { fromX: ecx, fromY: ecy, toX: ecx, toY: ecy };
  }
  return {
    fromX: enemy.aiFromX ?? ecx, fromY: enemy.aiFromY ?? ecy,
    toX: enemy.aiTargetX ?? ecx, toY: enemy.aiTargetY ?? ecy,
  };
};

/** 図形kindから族(§1-4)を導く。記録側(finalizeSettle内のfamilyOf)と同じ分類をB2(再生側)でも使う。 */
export const habitFamilyOfShape = (shape: CounterReachShape): HabitFamilyKey => {
  if (shape.kind === 'band') return 'band';
  if (shape.kind === 'circle' || shape.kind === 'circle-or-body') return 'circle';
  return 'body';
};

// =================================================================================================
// §1-2: 図形ローカル座標への正規化(habitPos)。counterReach.tsの隣に置き、式を判定側と共有する。
// =================================================================================================
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** §1-2 band posB(帯の横軸)のクランプ上限。habitPos(記録)・unhabitPos(逆写像)・quantizePosB(保存)の
 * 3箇所が全てこの1値を共有する(§8裁定済み#19=社長裁定2026-09-03(a)「飽和した位置記録は使わない」の
 * 飽和判定もここから導く=マジックナンバーを増やさない)。 */
export const HABIT_POSB_LIMIT = 1;

/** 判定と同じAABB最近点(縁距離)。phantomTick.edgeDistToと同じ式(textbook AABB最近点・数値複製ではない)。
 * B2(再生側)の逆写像・床クランプでも使うためexportする。 */
export const edgeDistToRect = (px: number, py: number, r: Rect): number => {
  const nx = clamp(px, r.x, r.x + r.width);
  const ny = clamp(py, r.y, r.y + r.height);
  return Math.hypot(px - nx, py - ny);
};

/** 縁距離の単位(px)。MELEE_RADIUS(gameStore.ts)=74の複製値——playerTraits.MELEE_RADIUS_MIRRORと
 * 同じ前例(store非依存を保つための複製・§7-0の作法どおり)。 */
export const HABIT_BODY_UNIT_PX = 74;

/** 差角/π(§1-2)。軸(fromX,fromY)→(toX,toY)が退化(自分中心・向きなし)している時は0固定。 */
const angleDiffOverPi = (
  px: number, py: number, cx: number, cy: number,
  fromX: number, fromY: number, toX: number, toY: number,
): number => {
  const axDx = toX - fromX, axDy = toY - fromY;
  if (Math.hypot(axDx, axDy) < 1e-6) return 0; // §1-2: 自分中心で軸が退化する州は0固定
  const axAng = Math.atan2(axDy, axDx);
  const vAng = Math.atan2(py - cy, px - cx);
  let d = vAng - axAng;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return clamp(d / Math.PI, -1, 1);
};

/** 複数帯のうち最寄りの1本のindexを返す(§1-2「複数本は最寄りの1本で測る」)。 */
const nearestBandIndex = (px: number, py: number, bands: readonly { fx: number; fy: number; tx: number; ty: number; halfWidth: number }[]): number => {
  let best = 0, bestD = Infinity;
  bands.forEach((b, i) => {
    const d = distToBandRect({ x: px, y: py }, { x: b.fx, y: b.fy }, { x: b.tx, y: b.ty }, b.halfWidth);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
};

export interface HabitPosResult { posA: number; posB: number; sub: number }

/**
 * 図形パラメータ(判定側と同型=CounterReachShape)をそのまま受け取り、本人位置(px,py)を
 * ローカル座標(posA/posB/sub)へ正規化する(§1-2)。`none`(紫)は対象外=nullを返す。
 * axis(fromX/Y→toX/Y)は「予告の軸」(circle/bodyの差角の基準)。呼び出し側は
 * `aiFromX ?? bcx, aiFromY ?? bcy, aiTargetX ?? bcx, aiTargetY ?? bcy` を渡す(counterReachShapeForの
 * fx/fy/tx/tyと同じ既定=食い違いを起こさない)。
 */
export const habitPos = (
  shape: CounterReachShape,
  px: number, py: number,
  axisFromX: number, axisFromY: number, axisToX: number, axisToY: number,
  bossRect: Rect,
): HabitPosResult | null => {
  if (shape.kind === 'none') return null;
  if (shape.kind === 'band') {
    if (shape.bands.length === 0) return null;
    const idx = nearestBandIndex(px, py, shape.bands);
    const b = shape.bands[idx];
    const dx = b.tx - b.fx, dy = b.ty - b.fy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { posA: 0, posB: 0, sub: clamp(idx, 0, 3) };
    const ux = dx / len, uy = dy / len;
    const rx = px - b.fx, ry = py - b.fy;
    const t = (rx * ux + ry * uy) / len;
    const perp = -rx * uy + ry * ux;
    return {
      posA: clamp(t, 0, 2),
      posB: clamp(perp / Math.max(1e-6, b.halfWidth), -HABIT_POSB_LIMIT, HABIT_POSB_LIMIT),
      sub: clamp(idx, 0, 3),
    };
  }
  if (shape.kind === 'circle' || shape.kind === 'circle-or-body') {
    const dist = Math.hypot(px - shape.cx, py - shape.cy);
    return {
      posA: clamp(dist / Math.max(1e-6, shape.radius), 0, 2),
      posB: angleDiffOverPi(px, py, shape.cx, shape.cy, axisFromX, axisFromY, axisToX, axisToY),
      sub: 0,
    };
  }
  // body: 縁距離(判定と同じAABB最近点)/74
  const edge = edgeDistToRect(px, py, bossRect);
  return {
    posA: clamp(edge / HABIT_BODY_UNIT_PX, 0, 2),
    posB: angleDiffOverPi(px, py, (bossRect.x + bossRect.width / 2), (bossRect.y + bossRect.height / 2), axisFromX, axisFromY, axisToX, axisToY),
    sub: 0,
  };
};

/** §1-2「自分中心で軸が退化する州(bm-whip360/mk-spin/bite等)は0固定」の判定そのもの
 * (habitPosのangleDiffOverPiと同じ基準)。B2(再生側)が同じ判定で「今の角度を保つ」か
 * 「軸+posBから絶対角を作る」かを分ける(§2-8確定事項#7=A10)。 */
export const isAxisDegenerate = (axisFromX: number, axisFromY: number, axisToX: number, axisToY: number): boolean =>
  Math.hypot(axisToX - axisFromX, axisToY - axisFromY) < 1e-6;

/**
 * habitPos の逆写像(B2・研究書§2-1)。ローカル座標(posA/posB/sub)から図形上の世界座標へ戻す。
 * `currentAngleRad`(円kindのみ使用): 軸が退化している州(§2-8確定事項#7)は絶対角を発明せず
 * **今の霊の角度を保つ**——呼び出し側が「霊の現在位置→円中心」の角度(rad)を渡す。
 * 戻り値 null = 逆写像できない(band で bands が空、または shape.kind==='none')。
 */
export const unhabitPos = (
  shape: CounterReachShape,
  posA: number, posB: number, sub: number,
  axisFromX: number, axisFromY: number, axisToX: number, axisToY: number,
  bossRect: Rect,
  currentAngleRad: number,
): { x: number; y: number } | null => {
  if (shape.kind === 'none') return null;
  if (shape.kind === 'band') {
    if (shape.bands.length === 0) return null;
    const b = shape.bands[clamp(sub, 0, shape.bands.length - 1)] ?? shape.bands[0];
    const dx = b.tx - b.fx, dy = b.ty - b.fy;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x: b.fx, y: b.fy };
    const ux = dx / len, uy = dy / len;
    const tLen = clamp(posA, 0, 2) * len;
    const perpPx = clamp(posB, -HABIT_POSB_LIMIT, HABIT_POSB_LIMIT) * b.halfWidth;
    // perp = -rx*uy+ry*ux(habitPos側)の逆: 単位法線は(-uy,ux)。
    return {
      x: b.fx + ux * tLen + (-uy) * perpPx,
      y: b.fy + uy * tLen + ux * perpPx,
    };
  }
  // circle / circle-or-body / body: 半径(または縁距離)×角度で復元する。
  const cx = shape.kind === 'body' ? bossRect.x + bossRect.width / 2 : shape.cx;
  const cy = shape.kind === 'body' ? bossRect.y + bossRect.height / 2 : shape.cy;
  const degenerate = isAxisDegenerate(axisFromX, axisFromY, axisToX, axisToY);
  const axisAngle = Math.atan2(axisToY - axisFromY, axisToX - axisFromX);
  // §2-8確定事項#7(A10): 軸退化(自分中心の技)は絶対角を発明せず今の角度を保つ。
  const angle = degenerate ? currentAngleRad : axisAngle + clamp(posB, -1, 1) * Math.PI;
  if (shape.kind === 'body') {
    // 検収是正#2(単位取り違え): habitPosのbody分岐は**縁距離**(edgeDistToRect=AABB最近点)/74を
    // posAとして保存している。旧実装はここでposA*74を**中心から**測っており、300×300のボスなら
    // 縁から74px(posA=1.00)を逆写像すると中心から74px=**体内**に戻っていた(v0.25.2567の再演)。
    // 正しい逆写像=「中心から角度angleへ伸ばした光線がAABBの境界(縁)に当たる距離」+ posA*74。
    // 軸整列(顔面)方向は往復で厳密一致・角の方向は近似(AABBは円ではないため厳密逆写像は存在しない)。
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const hw = bossRect.width / 2, hh = bossRect.height / 2;
    const tx = Math.abs(cosA) > 1e-6 ? hw / Math.abs(cosA) : Infinity;
    const ty = Math.abs(sinA) > 1e-6 ? hh / Math.abs(sinA) : Infinity;
    const edgeDist = Math.min(tx, ty); // 中心→AABB境界(縁)までの距離(この角度方向)
    const dist = edgeDist + clamp(posA, 0, 2) * HABIT_BODY_UNIT_PX;
    return { x: cx + cosA * dist, y: cy + sinA * dist };
  }
  const dist = clamp(posA, 0, 2) * shape.radius;
  return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
};

// =================================================================================================
// §1-1: コマ1件のフィールド(量子化保存)
// =================================================================================================
export interface HabitEpisode {
  /** 図形ローカル位置・主軸。0..200(=0.00..2.00の100倍整数)。 */
  posA: number;
  /** 図形ローカル位置・横軸。-100..100(=-1.00..1.00の100倍整数)。 */
  posB: number;
  /** 多帯州の帯index(0..3)。単図形州は0。 */
  sub: number;
  /** 押下相対時刻(ms)=押下−T。未押下はnull。-1500..500にクランプ。 */
  pressOfs: number | null;
  /** その瞬間の自分のHP<=30%なら1(30%は叩き台・§7-8実測主義)。 */
  ctxHp: 0 | 1;
  /** 直近2秒以内に被弾していたら1(2秒は叩き台・§7-8実測主義)。 */
  ctxHit: 0 | 1;
  /** そのランでこの州の着弾に遭った何回目か(1..20でカンスト)。 */
  seq: number;
}

/** リング保存件数(§1・ラン跨ぎ)。 */
export const HABIT_RING_SIZE = 10;

/**
 * research/AI_HUMANIZE.md §8 裁定済み#16(社長裁定2026-09-02=(a)・打刻を押下基準へ正規化):
 * `pressOfs`(コマ台帳HabitEpisode・族別集計HabitFamilyRaw双方)の**意味の版**。旧版(この定数の
 * 導入前=タグ無し)は経路によって「押下+MELEE_WINDUP_MS」と「押下そのもの」が混在した打刻で、
 * 意味が1本化されていない=**壊れているのではなく解釈が変わった**。よって古い版のコマは
 * (プロファイル自体は壊さずに)読み込み時に捨てる(`playerTraits.loadPlayerProfile`)。
 * この版を上げる基準=「pressOfsの意味(打刻の起点)が変わった時だけ」。posA/posB/sub/ctxHp/ctxHit/seq
 * の意味が変わる時は別の対応(このタグでは救えない=EPISODE_SHAPE_DECL側の話)。
 */
export const HABIT_EPISODE_FORMAT_VERSION = 2;

const quantizePosA = (v: number): number => Math.round(clamp(v, 0, 2) * 100);
const quantizePosB = (v: number): number => Math.round(clamp(v, -HABIT_POSB_LIMIT, HABIT_POSB_LIMIT) * 100);

/** 量子化後posBの飽和しきい値(=クランプ上限HABIT_POSB_LIMITをquantizePosB自身へ通しただけ。100を
 * 別途書かない=上のHABIT_POSB_LIMITと同じ出どころ)。 */
const HABIT_POSB_SATURATED_ABS = quantizePosB(HABIT_POSB_LIMIT);

/**
 * §8裁定済み#19(社長裁定2026-09-03=(a)「飽和した位置記録は使わない」・A-2是正):
 * 帯(band)のposBは±1にクランプされるため、帯の縁ぎりぎりに立っていた記録と大きく避けた記録が
 * 同じ量子化値へ潰れる(逆写像すると常に帯の縁=判定の中へ戻ってしまう=「避けた記録」が
 * 「当たる場所に立つ」に化ける)。量子化後posBがクランプ上限に張り付いているコマは、立ち位置の
 * 目標として信頼できないので候補から外す。**円/体(posA=距離側の飽和は外側=安全側)には使わない**
 * (呼び出し側がband族の時だけ呼ぶこと)。
 */
export const isHabitPosBSaturated = (posB: number): boolean => Math.abs(posB) >= HABIT_POSB_SATURATED_ABS;

// =================================================================================================
// §1-4: 族別集計(band/circle/body・軸1・量子化保存)
// =================================================================================================
export type HabitFamilyKey = 'band' | 'circle' | 'body';
export const HABIT_FAMILY_KEYS: readonly HabitFamilyKey[] = ['band', 'circle', 'body'];
/** §1-4「発動条件: その族のコマ総数≥5」。 */
export const HABIT_FAMILY_MIN_N = 5;

/** 保存型(量子化済み・軸1)。avgPosA/avgPosBはposA/posBと同じ量子化(0..200 / -100..100)、
 * avgPressOfsはms整数(未押下は集計対象外=n=0ならnull)、pressRatePct=押下率×100(0..100整数)。 */
export interface HabitFamilyStat {
  n: number;
  avgPosA: number;
  avgPosB: number;
  avgPressOfs: number | null;
  pressRatePct: number;
}

/** 集計中の生値(平均前・count保持)。runフォールド時にHabitFamilyStatへ変換する。 */
export interface HabitFamilyRaw {
  count: number;
  sumPosA: number;
  sumPosB: number;
  pressCount: number;
  sumPressOfs: number;
}
const createFamilyRaw = (): HabitFamilyRaw => ({ count: 0, sumPosA: 0, sumPosB: 0, pressCount: 0, sumPressOfs: 0 });

export const familyRawToStat = (r: HabitFamilyRaw): HabitFamilyStat | null => {
  if (r.count < HABIT_FAMILY_MIN_N) return null; // §1-4の発動条件未達=このセッションは寄与しない
  return {
    n: r.count,
    avgPosA: quantizePosA(r.sumPosA / r.count),
    avgPosB: quantizePosB(r.sumPosB / r.count),
    avgPressOfs: r.pressCount > 0 ? Math.round(r.sumPressOfs / r.pressCount) : null,
    pressRatePct: Math.round((r.pressCount / r.count) * 100),
  };
};

// =================================================================================================
// 押下リング(§1-3): meleeSwingCommitAtのエッジをgameTimeで直近4件へ積む。
// =================================================================================================
const PRESS_RING_SIZE = 4;
/** §1-0: 帰属の確定はT+300ms後追い。 */
const ATTRIBUTION_LEAD_MS = 300;
/** §1-3: 帰属窓は[T-1500ms, T+300ms]。 */
const WINDOW_BEFORE_MS = 1500;

let pressRing: number[] = []; // gameTime(押下エッジ時刻)。古い→新しいの順。
let lastSeenCommitAt: number | null = null;

/**
 * `meleeSwingCommitAt`(Date.now基準の打刻)のエッジを検知し、そのgameTimeを押下リングへ積む。
 * 毎tick呼ぶ(交戦の有無に関わらず=境界での取りこぼしを避ける)。エッジ検知はplayerTraits.tsの
 * `lastSeenSwingCommitAt` と同じ作法(絶対時刻の引き算をしない・初回tickは誤検知させない)。
 *
 * research/AI_HUMANIZE.md §8 裁定済み#16(社長裁定2026-09-02=(a)・打刻を押下基準へ正規化):
 * `pressedAt`(=呼び出し側が渡す「実際に押した時刻」・meleeSwingPressedAt)を第3引数で受け取り、
 * `commitAt − pressedAt`(前隙のある経路だけ正の値=実測の前隙。前隙が無ければ0)を**同じms単位のまま
 * gameTimeから引く**——これで積むのは常に「押した瞬間のgameTime」になる。**どの経路で打刻されたかは
 * 打刻の時点でしか分からない**ので、シフト量は呼び出し側(gameStore.ts)が渡した実測値から出す
 * (経路名で判定しない=固定のMELEE_WINDUP_MSを一律に引かない。詳細はgameStore.tsの
 * `noteMeleeSwingPressedAt` 呼び出し側コメント)。第3引数省略(旧呼び出し/テスト)=`commitAt`と
 * 同値扱い=シフト0(後方互換)。
 */
export const notePressEdge = (gameTime: number, commitAt: number, pressedAt: number = commitAt): void => {
  if (lastSeenCommitAt !== null && commitAt !== lastSeenCommitAt) {
    const windupShiftMs = commitAt - pressedAt;
    pressRing.push(gameTime - windupShiftMs);
    if (pressRing.length > PRESS_RING_SIZE) pressRing.shift();
  }
  lastSeenCommitAt = commitAt;
};

/** 帰属窓[T-1500,T+300]内でTに最も近い押下を1件引いて消費する(タイは早い方)。無ければnull。 */
const attributePress = (T: number): number | null => {
  let bestIdx = -1, bestAbs = Infinity, bestT = 0;
  for (let i = 0; i < pressRing.length; i++) {
    const t = pressRing[i];
    const ofs = t - T;
    if (ofs < -WINDOW_BEFORE_MS || ofs > ATTRIBUTION_LEAD_MS) continue;
    const abs = Math.abs(ofs);
    if (abs < bestAbs || (abs === bestAbs && t < bestT)) { bestAbs = abs; bestIdx = i; bestT = t; }
  }
  if (bestIdx === -1) return null;
  const matchedT = pressRing[bestIdx];
  pressRing.splice(bestIdx, 1); // §1-3: 1つの押下は最も近い1コマにだけ帰属(消費)
  return clamp(matchedT - T, -1500, 500);
};

// =================================================================================================
// 記録フック本体(settleEpisode)
// =================================================================================================
interface PendingHabitSettle {
  episodeKey: string;
  T: number;
  attributeAt: number;
  posA: number; posB: number; sub: number;
  ctxHp: 0 | 1; ctxHit: 0 | 1; seq: number;
  family: HabitFamilyKey;
}
let pendingSettles: PendingHabitSettle[] = [];

const seqCounters = new Map<string, number>();
const nextSeq = (key: string): number => {
  const n = Math.min(20, (seqCounters.get(key) ?? 0) + 1);
  seqCounters.set(key, n);
  return n;
};

// ラン単位のコマ蓄積(episodeKey→直近10件・生追記)。resetRunHabitStateでラン境界ごとに空にする。
const runEpisodes = new Map<string, HabitEpisode[]>();
const familyRaw: Record<HabitFamilyKey, HabitFamilyRaw> = {
  band: createFamilyRaw(), circle: createFamilyRaw(), body: createFamilyRaw(),
};
let runIsGhost = false;


const finalizeSettle = (p: PendingHabitSettle, pressOfs: number | null): void => {
  const ep: HabitEpisode = {
    posA: quantizePosA(p.posA), posB: quantizePosB(p.posB), sub: p.sub,
    pressOfs: pressOfs === null ? null : Math.round(clamp(pressOfs, -1500, 500)),
    ctxHp: p.ctxHp, ctxHit: p.ctxHit, seq: p.seq,
  };
  const arr = runEpisodes.get(p.episodeKey) ?? [];
  arr.push(ep);
  if (arr.length > HABIT_RING_SIZE) arr.shift();
  runEpisodes.set(p.episodeKey, arr);

  const f = familyRaw[p.family];
  f.count += 1;
  f.sumPosA += p.posA; // 量子化前の生値で平均する(丸め誤差の蓄積を避ける。保存時にfamilyRawToStatで量子化)
  f.sumPosB += p.posB;
  if (pressOfs !== null) { f.pressCount += 1; f.sumPressOfs += pressOfs; }
};

export interface SettleEpisodeInput {
  /** T(=着弾/満了時刻)。gameTime。 */
  gameTime: number;
  enemyType: string;
  state: string;
  /** ボス中心(現在)。 */
  bcx: number; bcy: number;
  /** 本人(プレイヤー)中心@T。 */
  pcx: number; pcy: number;
  aiFromX?: number; aiFromY?: number; aiTargetX?: number; aiTargetY?: number;
  tripleAng?: number; ballX?: number; ballY?: number; landingLocked?: boolean;
  bossRect: Rect;
  /** ②live専用: 呼び出し側がその場で組んだ実図形(判定側の定数を直接参照したもの)。①③は省略可。 */
  liveShape?: CounterReachShape;
  playerHealth: number; playerMaxHealth: number;
  lastDamagedAtGame: number | undefined;
}

/**
 * 州満了の瞬間に呼ぶ(§1-0「1コマ=1州の満了」)。**満了前に別遷移(キャンセル)した州は
 * 呼ばない側の責務**(呼び出し側は`gameTime>=bossStateUntil`等の自然満了の分岐にだけ差す)。
 * ここではT時点の仮レコードを積むだけ(posA/posB/sub/ctxHp/ctxHit/seqは即確定・pressOfsだけ
 * T+300ms後追いで確定=§1-0)。
 */
export const settleEpisode = (input: SettleEpisodeInput): void => {
  const episodeKey = `${input.enemyType}:${input.state}`;
  if (!EPISODE_KEY_SET.has(episodeKey)) return; // 対象外(呼び出し側の配線誤りでも暴れない=安全側)
  const category = EPISODE_SHAPE_DECL[episodeKey];
  let shape: CounterReachShape;
  if (category === 'declared') {
    const reachKey = reachKeyFor(input.enemyType, input.state);
    const ctx: CounterReachCtx = {
      bcx: input.bcx, bcy: input.bcy, pcx: input.pcx, pcy: input.pcy,
      aiFromX: input.aiFromX, aiFromY: input.aiFromY, aiTargetX: input.aiTargetX, aiTargetY: input.aiTargetY,
      tripleAng: input.tripleAng, ballX: input.ballX, ballY: input.ballY, landingLocked: input.landingLocked,
    };
    shape = counterReachShapeFor(reachKey, ctx);
    // §1-2: circle-or-body の body フォールバック(台本OFF等)は座標系混入防止で録らない。
    if (shape.kind === 'body' && counterReachKindFor(reachKey) === 'circle-or-body') return;
  } else if (category === 'live') {
    if (!input.liveShape) return; // 呼び出し側の配線漏れ(安全側=録らない)
    shape = input.liveShape;
  } else {
    shape = { kind: 'body' };
  }
  const fx = input.aiFromX ?? input.bcx, fy = input.aiFromY ?? input.bcy;
  const tx = input.aiTargetX ?? input.bcx, ty = input.aiTargetY ?? input.bcy;
  const pos = habitPos(shape, input.pcx, input.pcy, fx, fy, tx, ty, input.bossRect);
  if (pos === null) return; // none(紫)等
  const ctxHp: 0 | 1 = input.playerMaxHealth > 0 && input.playerHealth / input.playerMaxHealth <= 0.3 ? 1 : 0; // 30%は叩き台(§7-8実測主義)
  // ★検収是正(中4・番兵0): player.lastDamagedAtGame は gameStore の既定値が0(=まだ被弾していない)。
  // 0を「被弾時刻」として扱うと、ラン開始2秒以内(gameTime<=2000)に満了する州が「直近2秒以内に
  // 被弾していた」に化ける(0という時刻に被弾したと誤読するため)。`>0`ガードで未被弾を除外する。
  // 2000msの窓自体も叩き台(§7-8実測主義)。
  const ctxHit: 0 | 1 = input.lastDamagedAtGame !== undefined && input.lastDamagedAtGame > 0
    && input.gameTime - input.lastDamagedAtGame <= 2000 ? 1 : 0;
  pendingSettles.push({
    episodeKey, T: input.gameTime, attributeAt: input.gameTime + ATTRIBUTION_LEAD_MS,
    posA: pos.posA, posB: pos.posB, sub: pos.sub, ctxHp, ctxHit,
    seq: nextSeq(episodeKey), family: habitFamilyOfShape(shape),
  });
};

/**
 * 毎tick呼ぶ(交戦の有無に関わらず)。帰属窓が閉じた保留(T+300ms経過)を確定してrunEpisodesへ積む。
 * 呼ぶ順は`notePressEdge`の**後**(同じtickの押下を帰属候補に含めるため)。
 */
export const tickHabitEpisodeMaintenance = (gameTime: number): void => {
  if (pendingSettles.length === 0) return;
  const stillPending: PendingHabitSettle[] = [];
  for (const p of pendingSettles) {
    if (gameTime < p.attributeAt) { stillPending.push(p); continue; }
    finalizeSettle(p, attributePress(p.T));
  }
  pendingSettles = stillPending;
};

/** §2.7 制約1と同じゲート: このランでゴースト系が有効だった(playerTraits.subStyleGhostRunと同型)。 */
export const markHabitGhostRun = (): void => { runIsGhost = true; };

/** ラン単位の蓄積を読み出して空にする(commit判断=playerTraits.ts側)。ゴーストランは丸ごとnull。
 * 何も録れていない(episodesが空かつどの族も0件)場合もnull=プロファイルに触らない。
 * ★検収是正(中5・§1-4): familyは**しきい値ゲート無しの生カウント**(HabitFamilyRaw)で返す
 * (旧実装はここでHABIT_FAMILY_MIN_Nをラン内件数へ掛けており、1ランに5件出ない族が累計されず永久に
 * 積まれなかった)。累計と発動しきい値の適用は呼び出し側(playerTraits.applyPendingHabits)の責務。 */
export const takeRunHabitFold = (): {
  episodes: Readonly<Record<string, readonly HabitEpisode[]>>;
  family: Readonly<Partial<Record<HabitFamilyKey, HabitFamilyRaw>>>;
} | null => {
  const wasGhost = runIsGhost;
  const episodesSnapshot: Record<string, HabitEpisode[]> = {};
  runEpisodes.forEach((v, k) => { episodesSnapshot[k] = [...v]; });
  const familySnapshot: Partial<Record<HabitFamilyKey, HabitFamilyRaw>> = {};
  for (const fk of HABIT_FAMILY_KEYS) {
    const raw = familyRaw[fk];
    if (raw.count > 0) familySnapshot[fk] = { ...raw };
  }
  resetRunHabitState();
  if (wasGhost) return null;
  if (Object.keys(episodesSnapshot).length === 0 && Object.keys(familySnapshot).length === 0) return null;
  return { episodes: episodesSnapshot, family: familySnapshot };
};

/** ラン境界(gameStore.resetGame)で呼ぶ。前ランの未確定分を持ち越さない(pendingSettlesの末尾<300msは
 * 安全側で切り捨て=次ランへ跨がせない)。localStorageには触らない。 */
export const resetRunHabitState = (): void => {
  pendingSettles = [];
  runEpisodes.clear();
  familyRaw.band = createFamilyRaw();
  familyRaw.circle = createFamilyRaw();
  familyRaw.body = createFamilyRaw();
  seqCounters.clear();
  runIsGhost = false;
  pressRing = [];
  lastSeenCommitAt = null;
};
