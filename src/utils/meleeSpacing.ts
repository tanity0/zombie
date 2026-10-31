// ★近接の「間合いの癖」の計測(research/SAME_ARENA.md §8・社長発案2026-08-25)。
//
// 社長の狙い: 「幻影パリィについても癖を残したい。**(抽選は癖ではないのでできるだけ無くしたい)**」
// +「これって守護霊もそうだと思うんだよなー」
//
// ★なぜ要るか: 幻影は、カウンターが成立しうる近接を **820msの周期**で振っている。パリィは「自分のスイング窓が
// 開いているか」だけで決まるので、**誰と戦っても同じリズム**になる。**振る時刻を"その人のリズム"にすれば、
// パリィは判定ではなく結果になる。**(守護霊は対ボスの記録で既に振る時刻が決まっている=対象外・SAME_ARENA §8-B2)
//
// ★v2(2026-10-27・§8-B2 着手前監査の是正): ①接敵は**間合いから出るまで**1件(旧=最初の振りから600msで閉じたため、
// 近接CD 738〜820ms では2回目が入らず「振り続ける癖」が測れていなかった) ②「振って離れた」は**プレイヤー自身が
// 相手から遠ざかった量**で判定(旧=相手が死んで消えた/斬って押し出した、でも成立し、距離に前へ出た踏み込みも入っていた)。
// 相手が一覧から消えて終わった接敵は数えない ③距離は**プレイヤーの中心→相手の当たり判定の矩形の最近点**・
// 射程は**その時の実射程**(社長GO 2026-08-25。旧=固定74px・中心どうし) ④カウンター狙いは「押した時刻−当たる瞬間
// (=カウンターの機会が閉じた時刻)」で持つ(後の先の再現用・社長 2026-10-27「推薦で」)。
// 旧版(v なし)の記録は混ぜずに捨てて測り直す(`blendMeleeSpacing`)。
//
// ★記録の単位=「接敵イベント」: **敵がプレイヤーの近接射程へ入った瞬間**を1件として数え、
// そのたびに何をしたかを見る。距離と時間だけで測れる。
//
// ★抽選の扱い(BOT_AND_GHOST.md §2.18・社長裁定2026-07-31「サイコロも提案の案で」):
//  - **連続量(時間・距離)は抽選を通さない**=スカラーのまま持つ。ここが社長の望みの本体。
//  - **離散の選択だけ袋式**(率は記録どおりに必ず出る・社長 2026-10-27「袋式」)。
//  - **順序の再生(台本方式)は2026-07-31に棄却済み**——相手の動きで進入が起きる以上、
//    こちらの順序を固定すると噛み合わず、かえって不自然になる。だからここでも順序は持たない。
import type { Enemy } from '../types/game';

/** 進入の「直前」とみなす窓(ms)。ここで既に振っていたら「先出し」。 */
export const PRE_SWING_WINDOW_MS = 300;
/** 振ってから「離れた」とみなす窓(ms)。最後の振りからこの間に射程外へ出て、しかも自分で離れていたら「振り逃げ」。 */
export const SWING_LEAVE_WINDOW_MS = 600;
/** 「自分で離れた」とみなす最小の量(px)。相手の当たり判定の縁が動いただけ・押されただけを振り逃げにしない。 */
export const SWING_LEAVE_MIN_PX = 12;
/** 記録の版。消費側(幻影)はこの版の記録だけを読む。 */
export const MELEE_SPACING_V = 2;

/** 1件の接敵イベント(進入から、間合いの外へ出るまで)。 */
interface SpacingEpisode {
  enemyId: string;
  enteredAt: number;      // gameTime
  enteredPcx: number;     // 進入時のプレイヤー中心(振らずに離れた量の基準)
  enteredPcy: number;
  preSwing: boolean;      // 進入の直前に既に振っていたか
  swungAt: number | null; // 進入後に最初に振った gameTime
  /** このイベント中に振った回数(居る間ずっと数える)。 */
  swings: number;
  lastSwingAt: number | null;
  lastSwingPcx: number;   // 最後に振った時のプレイヤー中心(振り逃げの量の基準)
  lastSwingPcy: number;
  resolved: boolean;
}

/** セッション中の集計。プロファイルへ焼くのは `foldMeleeSpacing`。 */
export interface MeleeSpacingState {
  episodes: SpacingEpisode[];
  /** 直近で射程内に居た敵id(進入/退出の検出用)。 */
  inside: Set<string>;
  /** 直近にプレイヤーが振った gameTime(先出し判定用)。 */
  lastSwingAt: number | null;
  // --- 集計 ---
  n: number;              // 決着した接敵イベント数(相手が消えて終わったものは数えない)
  swingLagSumMs: number;  // 進入→最初の振り の合計(振った回のみ)
  swingLagCount: number;
  preSwingCount: number;
  swingLeaveCount: number;
  holdCount: number;      // 射程内に居られたのに一度も振らなかった(=自分からは振らない)
  swungEpisodes: number;  // 振った接敵の数(1接敵あたりの振りの回数の分母)
  swingSum: number;       // 振った接敵の振った回数の合計(=積極性)
  backStepSumPx: number;  // 振り逃げた回の「自分で離れた量」合計
  /** 一度も振らずに離れた回の「自分で離れた量」合計(待ち構える人≒0 / 振らずに逃げる人=大)。 */
  holdBackStepSumPx: number;
  holdBackStepCount: number;
  crossings: number;      // 射程の境界を跨いだ回数(出入り両方)
  // ---- カウンター狙いの癖(別勘定・社長の指摘2026-08-25) ----
  caOpportunities: number; // 機会(=カウンターが成立しうる攻撃が来ている窓)の数
  /** そのうち**窓の中で押した**回数(1窓1票)。既存の `counterChance` は**成立**しか数えていない。 */
  caSwings: number;
  /** 押した時刻 − 当たる瞬間(=窓が閉じた時刻)の合計(負=当たる前に押した)。 */
  caOffsetSumMs: number;
  caOffsetCount: number;
  caWasOpen: boolean;      // 立ち上がり検知
  caPressAt: number | null; // この窓で最初に押した gameTime
}

export const createMeleeSpacingState = (): MeleeSpacingState => ({
  episodes: [], inside: new Set(), lastSwingAt: null,
  n: 0, swingLagSumMs: 0, swingLagCount: 0, preSwingCount: 0,
  swingLeaveCount: 0, holdCount: 0, swungEpisodes: 0, swingSum: 0, backStepSumPx: 0,
  holdBackStepSumPx: 0, holdBackStepCount: 0, crossings: 0,
  caOpportunities: 0, caSwings: 0, caOffsetSumMs: 0, caOffsetCount: 0,
  caWasOpen: false, caPressAt: null,
});

type SpacingEnemy = Pick<Enemy, 'id' | 'x' | 'y' | 'width' | 'height'>;
type Rect = { x: number; y: number; width: number; height: number };

export interface MeleeSpacingTickInput {
  enemies: readonly SpacingEnemy[];
  pcx: number;
  pcy: number;
  /** その時の**実射程**(社長裁定=武器で変わる値をそのまま使う)。 */
  reachPx: number;
  gameTime: number;
  /** このtickにプレイヤーが振った(打った)か(呼び出し側が打刻の変化で検出する=時計を混ぜない)。 */
  swungThisTick: boolean;
  /** このtickにプレイヤーが近接を**押した**か(カウンター狙いの時刻=押した瞬間。省略=false)。 */
  pressedThisTick?: boolean;
  /**
   * ★その時**カウンターが成立しうる窓**が開いているか。窓の中の振りは間合いの癖から外して別勘定にする
   * (混ぜると「相手の技に反応して振った人」が「間合いに入られたら即振る人」に化ける)。
   */
  counterWindowOpen: boolean;
  /** 相手の当たり判定の矩形(省略=見た目の矩形)。近接・銃と同じ物差し(`enemyRangeRect`)を渡す。 */
  rangeRect?: (e: SpacingEnemy) => Rect;
}

const distToRect = (px: number, py: number, r: Rect): number => {
  const nx = Math.max(r.x, Math.min(px, r.x + r.width));
  const ny = Math.max(r.y, Math.min(py, r.y + r.height));
  return Math.hypot(px - nx, py - ny);
};

/** 基準点(fx,fy)から今の位置までの移動のうち、相手(ex,ey)から遠ざかる向きの成分(正の部分だけ)。 */
const awayFrom = (fx: number, fy: number, px: number, py: number, ex: number, ey: number): number => {
  const ax = fx - ex, ay = fy - ey;
  const al = Math.hypot(ax, ay);
  if (al < 1e-6) return 0;
  return Math.max(0, ((px - fx) * ax + (py - fy) * ay) / al);
};

/**
 * 1フレーム分の進行(副作用は `st` のみ・乱数なし)。
 * 進入で episode を開き、間合いの外へ出た時に ①振り逃げ ②振って留まった ③振らなかった のどれかで閉じる。
 * 先出し(進入の直前に振っていた)はそれと別の軸の旗として数える。
 */
export const stepMeleeSpacing = (st: MeleeSpacingState, input: MeleeSpacingTickInput): void => {
  const { pcx, pcy, reachPx, gameTime } = input;

  // ---- カウンター狙い(別勘定)。立ち上がりで機会を1つ数え、窓の中で最初に押した時刻を控え、閉じた時刻との差を記録する。
  const open = input.counterWindowOpen;
  if (open && !st.caWasOpen) { st.caOpportunities += 1; st.caPressAt = null; }
  if (open && input.pressedThisTick && st.caPressAt === null) { st.caPressAt = gameTime; st.caSwings += 1; }
  if (!open && st.caWasOpen && st.caPressAt !== null) {
    st.caOffsetSumMs += st.caPressAt - gameTime; // 当たる瞬間(=閉じた時刻)からの差
    st.caOffsetCount += 1;
    st.caPressAt = null;
  }
  st.caWasOpen = open;

  // 窓の中の振りは**間合いの癖には数えない**(「窓が開いた時だけ振る人」は間合い側で holdRate=1 になる)。
  if (input.swungThisTick && !open) {
    st.lastSwingAt = gameTime;
    for (const ep of st.episodes) {
      if (ep.resolved) continue;
      ep.swings += 1;
      if (ep.swungAt === null) ep.swungAt = gameTime;
      ep.lastSwingAt = gameTime;
      ep.lastSwingPcx = pcx; ep.lastSwingPcy = pcy;
    }
  }

  const rectOf = input.rangeRect ?? ((e: SpacingEnemy): Rect => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
  const byId = new Map<string, SpacingEnemy>();
  const nowInside = new Set<string>();
  for (const e of input.enemies) {
    byId.set(e.id, e);
    if (distToRect(pcx, pcy, rectOf(e)) <= reachPx) nowInside.add(e.id);
  }

  // 進入(=イベント開始)。
  for (const id of nowInside) {
    if (st.inside.has(id)) continue;
    st.crossings += 1;
    st.episodes.push({
      enemyId: id, enteredAt: gameTime, enteredPcx: pcx, enteredPcy: pcy,
      preSwing: st.lastSwingAt !== null && gameTime - st.lastSwingAt <= PRE_SWING_WINDOW_MS,
      swungAt: null, swings: 0, lastSwingAt: null, lastSwingPcx: pcx, lastSwingPcy: pcy, resolved: false,
    });
  }
  // 退出(=境界を跨いだ)。
  for (const id of st.inside) if (!nowInside.has(id)) st.crossings += 1;

  for (const ep of st.episodes) {
    if (ep.resolved || nowInside.has(ep.enemyId)) continue;
    const e = byId.get(ep.enemyId);
    ep.resolved = true;
    if (!e) continue; // 相手が消えて終わった(倒した・退場)=癖ではないので数えない
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    st.n += 1;
    if (ep.preSwing) st.preSwingCount += 1;
    if (ep.swungAt !== null && ep.lastSwingAt !== null) {
      st.swungEpisodes += 1;
      st.swingSum += ep.swings;
      st.swingLagSumMs += ep.swungAt - ep.enteredAt;
      st.swingLagCount += 1;
      const away = awayFrom(ep.lastSwingPcx, ep.lastSwingPcy, pcx, pcy, ex, ey);
      if (gameTime - ep.lastSwingAt <= SWING_LEAVE_WINDOW_MS && away >= SWING_LEAVE_MIN_PX) {
        st.swingLeaveCount += 1;
        st.backStepSumPx += away;
      }
    } else {
      st.holdCount += 1;
      st.holdBackStepSumPx += awayFrom(ep.enteredPcx, ep.enteredPcy, pcx, pcy, ex, ey);
      st.holdBackStepCount += 1;
    }
  }
  // 決着済みは捨てる(セッション中ずっと持たない=メモリを増やさない)。
  if (st.episodes.some(e => e.resolved)) st.episodes = st.episodes.filter(e => !e.resolved);

  st.inside = nowInside;
};

/** プロファイルへ焼く形(記録の本体)。**連続量はスカラー / 割合は袋の材料**。 */
export interface MeleeSpacingProfile {
  /** 記録の版(`MELEE_SPACING_V`)。無い/違う記録は消費側が読まない。 */
  v?: number;
  /** 決着した接敵イベント数(n=0 は「記録なし」)。 */
  n: number;
  /** 連続量: 進入→最初の振り までの平均ms(抽選しない)。一度も振らなかった人は `null`(0は「最速の人」になってしまう)。 */
  swingLagMs: number | null;
  /** 連続量: 射程の境界を跨いだ回数/分(けん制の出入りの多さ・抽選しない)。 */
  reentryPerMin: number;
  /** 連続量: 振り逃げた時に自分で離れた量の平均px。振り逃げが無ければ `null`。 */
  backStepPx: number | null;
  /** 連続量: 一度も振らずに離れた時に自分で離れた量の平均px(待ち構える人≒0 / 逃げる人=大)。該当が無ければ `null`。 */
  holdBackStepPx: number | null;
  /** 連続量: **振った接敵**1件あたり何回振るか(居る間ずっと数える=「振り続ける癖」の本体)。振った接敵が無ければ0。 */
  swingsPerEpisode: number;
  /** 離散の材料: 進入の直前に既に振っていた割合(**別の軸**=下の3つとは独立)。 */
  preSwingRate: number;
  /** 離散の材料: 振って自分で離れた割合。swingLeaveRate+holdRate ≤ 1、残りが「振って留まった」。 */
  swingLeaveRate: number;
  /** 離散の材料: 一度も振らずに終えた割合(=**自分からは**振らない人)。 */
  holdRate: number;
  /** 離散の材料: カウンターの機会のうち、窓の中で押した割合。機会0なら `null`。 */
  counterAimRate: number | null;
  /** 連続量: 押した時刻 − 当たる瞬間 の平均ms(負=当たる前に押す)。該当0なら `null`。 */
  counterAimOffsetMs: number | null;
}

export const foldMeleeSpacing = (st: MeleeSpacingState, elapsedMs: number): MeleeSpacingProfile => {
  const n = st.n;
  const min = Math.max(elapsedMs, 1) / 60000;
  return {
    v: MELEE_SPACING_V,
    n,
    swingLagMs: st.swingLagCount > 0 ? st.swingLagSumMs / st.swingLagCount : null,
    reentryPerMin: st.crossings / min,
    backStepPx: st.swingLeaveCount > 0 ? st.backStepSumPx / st.swingLeaveCount : null,
    holdBackStepPx: st.holdBackStepCount > 0 ? st.holdBackStepSumPx / st.holdBackStepCount : null,
    swingsPerEpisode: st.swungEpisodes > 0 ? st.swingSum / st.swungEpisodes : 0,
    preSwingRate: n > 0 ? st.preSwingCount / n : 0,
    swingLeaveRate: n > 0 ? st.swingLeaveCount / n : 0,
    holdRate: n > 0 ? st.holdCount / n : 0,
    counterAimRate: st.caOpportunities > 0 ? st.caSwings / st.caOpportunities : null,
    counterAimOffsetMs: st.caOffsetCount > 0 ? st.caOffsetSumMs / st.caOffsetCount : null,
  };
};

/**
 * ★セッション標本をプロファイルへ混ぜる(`blendDodgeDirStat` / `blendPunishProfile` と同じ流儀)。
 * - 標本が無い(`null` / `n===0`)なら**前回値をそのまま**返す(欠損は欠損のまま=消費側がフォールバック)。
 * - 前回値が無い/**版が違う**(v1=測り方の誤りがあった記録)なら標本そのまま(混ぜずに測り直す)。
 * - **null のノブは前回値を保つ**(「測れなかった」を0で上書きしない=v0.25.3909の掟)。
 * - `n` は累計(「どれだけ観測したか」なので足す。率・平均はEMA)。
 */
export const blendMeleeSpacing = (
  prev: MeleeSpacingProfile | undefined,
  sample: MeleeSpacingProfile | null,
  alpha: number,
): MeleeSpacingProfile | undefined => {
  if (!sample || sample.n <= 0) return prev && prev.v === MELEE_SPACING_V ? prev : undefined;
  if (!prev || prev.v !== MELEE_SPACING_V) return sample;
  const ema = (a: number, b: number): number => a * (1 - alpha) + b * alpha;
  const emaN = (a: number | null, b: number | null): number | null =>
    b === null ? a : a === null ? b : ema(a, b);
  return {
    v: MELEE_SPACING_V,
    n: prev.n + sample.n,
    swingLagMs: emaN(prev.swingLagMs, sample.swingLagMs),
    reentryPerMin: ema(prev.reentryPerMin, sample.reentryPerMin),
    backStepPx: emaN(prev.backStepPx, sample.backStepPx),
    holdBackStepPx: emaN(prev.holdBackStepPx, sample.holdBackStepPx),
    swingsPerEpisode: ema(prev.swingsPerEpisode, sample.swingsPerEpisode),
    preSwingRate: ema(prev.preSwingRate, sample.preSwingRate),
    swingLeaveRate: ema(prev.swingLeaveRate, sample.swingLeaveRate),
    holdRate: ema(prev.holdRate, sample.holdRate),
    counterAimRate: emaN(prev.counterAimRate, sample.counterAimRate),
    counterAimOffsetMs: emaN(prev.counterAimOffsetMs, sample.counterAimOffsetMs),
  };
};
