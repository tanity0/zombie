// ★近接の「間合いの癖」の計測(research/SAME_ARENA.md §8・社長発案2026-08-25)。
//
// 社長の狙い: 「幻影パリィについても癖を残したい。**(抽選は癖ではないのでできるだけ無くしたい)**」
// +「これって守護霊もそうだと思うんだよなー」
//
// ★なぜ要るか: 幻影も守護霊も、カウンターが成立しうる近接を **820msの固定メトロノーム**で振っている
// (`GHOST_COUNTER_MELEE_PERIOD_MS`)。パリィは「自分のスイング窓が開いているか」だけで決まるので、
// 窓が **400/820 ≒ 49%** 開きっぱなし=**誰と戦っても同じリズム**になり、
// プレイヤーの前隙200ms(< 人間の下限250ms)すら半分弾いてしまう。
// **振る時刻を"その人のリズム"にすれば、パリィは判定ではなく結果になる。**
//
// ★記録の単位=「接敵イベント」: **敵がプレイヤーの近接射程へ入った瞬間**を1件として数え、
// そのたびに何をしたかを見る。距離と時間だけで測れる。
//
// ★抽選の扱い(BOT_AND_GHOST.md §2.18・社長裁定2026-07-31「サイコロも提案の案で」):
//  - **連続量(時間・距離)は抽選を通さない**=スカラーのまま持つ。ここが社長の望みの本体。
//  - **離散の選択だけ袋式**(率は記録どおりに必ず出る)。袋は `utils/commandBag.ts` に実装済み。
//  - **順序の再生(台本方式)は2026-07-31に棄却済み**——相手の動きで進入が起きる以上、
//    こちらの順序を固定すると噛み合わず、かえって不自然になる。だからここでも順序は持たない。
import type { Enemy } from '../types/game';

/** 進入の「直前」とみなす窓(ms)。ここで既に振っていたら「先出し」。 */
export const PRE_SWING_WINDOW_MS = 300;
/** 振ってから「離れた」とみなす窓(ms)。この間に射程外へ出たら「振り逃げ」。 */
export const SWING_LEAVE_WINDOW_MS = 600;

/** 1件の接敵イベント(進入から決着まで)。 */
interface SpacingEpisode {
  enemyId: string;
  enteredAt: number;      // gameTime
  enteredPcx: number;     // 進入時のプレイヤー中心(下がった距離を測る基準)
  enteredPcy: number;
  preSwing: boolean;      // 進入の直前に既に振っていたか
  swungAt: number | null; // 進入後に最初に振った gameTime
  /** ★このイベント中に振った回数(社長の問い「積極的に近接振ってくる癖もちゃんと出る?」)。
   *  「最初の1回」だけだと**1回で満足する人と振り続ける人が同じ data になる**ので、回数も数える。 */
  swings: number;
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
  n: number;              // 決着した接敵イベント数
  swingLagSumMs: number;  // 進入→最初の振り の合計(振った回のみ)
  swingLagCount: number;
  preSwingCount: number;
  swingLeaveCount: number;
  holdCount: number;      // 射程内に居られたのに一度も振らなかった
  swingSum: number;       // 全イベントの振った回数の合計(=積極性)
  backStepSumPx: number;  // 振り逃げた回の「下がった距離」合計
  /** ★一度も振らずに離れた回の「下がった距離」合計(社長の問い2026-08-25
   *  「一切振らずに逃げる人もいると思うけど、その辺も平気?」)。**振り逃げとは別勘定**——
   *  混ぜると「振ってから下がる人」と「そもそも振らない人」が同じ数字になり、癖が消える。 */
  holdBackStepSumPx: number;
  holdBackStepCount: number;
  crossings: number;      // 射程の境界を跨いだ回数(出入り両方)
}

export const createMeleeSpacingState = (): MeleeSpacingState => ({
  episodes: [], inside: new Set(), lastSwingAt: null,
  n: 0, swingLagSumMs: 0, swingLagCount: 0, preSwingCount: 0,
  swingLeaveCount: 0, holdCount: 0, swingSum: 0, backStepSumPx: 0,
  holdBackStepSumPx: 0, holdBackStepCount: 0, crossings: 0,
});

export interface MeleeSpacingTickInput {
  enemies: readonly Pick<Enemy, 'id' | 'x' | 'y' | 'width' | 'height'>[];
  pcx: number;
  pcy: number;
  /** その時の**実射程**(社長裁定=武器で変わる値をそのまま使う。ナイフ74 / 鞭150 など)。 */
  reachPx: number;
  gameTime: number;
  /** このtickにプレイヤーが振ったか(呼び出し側が meleeSwingAt の変化で検出する=時計を混ぜない)。 */
  swungThisTick: boolean;
}

/**
 * 1フレーム分の進行(副作用は `st` のみ・乱数なし)。
 * 進入で episode を開き、①先出し ②進入→振りの遅れ ③振り逃げ ④待ち のどれかで閉じる。
 */
export const stepMeleeSpacing = (st: MeleeSpacingState, input: MeleeSpacingTickInput): void => {
  const { pcx, pcy, reachPx, gameTime } = input;
  if (input.swungThisTick) {
    st.lastSwingAt = gameTime;
    // 開いている episode すべてに1回ぶん数える(=積極性)。最初の1回だけ遅れ(lag)の基準にする。
    for (const ep of st.episodes) {
      if (ep.resolved) continue;
      ep.swings += 1;
      if (ep.swungAt === null) ep.swungAt = gameTime;
    }
  }

  const r2 = reachPx * reachPx;
  const nowInside = new Set<string>();
  for (const e of input.enemies) {
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    const dx = ex - pcx, dy = ey - pcy;
    if (dx * dx + dy * dy <= r2) nowInside.add(e.id);
  }

  // 進入(=イベント開始)。
  for (const id of nowInside) {
    if (st.inside.has(id)) continue;
    st.crossings += 1;
    st.episodes.push({
      enemyId: id, enteredAt: gameTime, enteredPcx: pcx, enteredPcy: pcy,
      // ★先出し: 進入の直前(PRE_SWING_WINDOW_MS以内)に既に振っていた。
      preSwing: st.lastSwingAt !== null && gameTime - st.lastSwingAt <= PRE_SWING_WINDOW_MS,
      swungAt: null, swings: 0, resolved: false,
    });
  }
  // 退出(=境界を跨いだ)。
  for (const id of st.inside) if (!nowInside.has(id)) st.crossings += 1;

  for (const ep of st.episodes) {
    if (ep.resolved) continue;
    const stillInside = nowInside.has(ep.enemyId);
    if (ep.swungAt !== null) {
      // 振った後: SWING_LEAVE_WINDOW_MS 以内に射程外へ出たら「振り逃げ」。
      const since = gameTime - ep.swungAt;
      if (!stillInside && since <= SWING_LEAVE_WINDOW_MS) {
        st.swingLeaveCount += 1;
        st.backStepSumPx += Math.hypot(pcx - ep.enteredPcx, pcy - ep.enteredPcy);
        closeEpisode(st, ep);
      } else if (since > SWING_LEAVE_WINDOW_MS) {
        closeEpisode(st, ep); // 振ったが留まった=振り逃げではない
      }
    } else if (!stillInside) {
      // 一度も振らずに相手が離れた/自分が離れた=「待ち(振らない)」。
      st.holdCount += 1;
      // ★ここでも下がった距離を測る。**「振らない人」の中にも2種類いる**——
      // その場で待ち構える人(≒0px)と、間合いに入られたら振らずに逃げる人(大きい)。
      // holdRate だけだとこの2人が同じになるので、距離で分ける。
      st.holdBackStepSumPx += Math.hypot(pcx - ep.enteredPcx, pcy - ep.enteredPcy);
      st.holdBackStepCount += 1;
      closeEpisode(st, ep);
    }
  }
  // 決着済みは捨てる(セッション中ずっと持たない=メモリを増やさない)。
  if (st.episodes.some(e => e.resolved)) st.episodes = st.episodes.filter(e => !e.resolved);

  st.inside = nowInside;
};

const closeEpisode = (st: MeleeSpacingState, ep: SpacingEpisode): void => {
  ep.resolved = true;
  st.n += 1;
  st.swingSum += ep.swings;
  if (ep.preSwing) st.preSwingCount += 1;
  if (ep.swungAt !== null) {
    st.swingLagSumMs += ep.swungAt - ep.enteredAt;
    st.swingLagCount += 1;
  }
};

/** プロファイルへ焼く形(記録の本体)。**連続量はスカラー / 割合は袋の材料**。 */
export interface MeleeSpacingProfile {
  /** 決着した接敵イベント数(n=0 は「記録なし」=消費側は従来のメトロノームへ落ちる)。 */
  n: number;
  /**
   * ★連続量: 進入→最初の振り までの平均ms(抽選しない)。
   * **一度も振らなかった人は `null`**(0にしない——0は「進入と同時に振る最速の人」を意味してしまい、
   * 「一切振らない人」の真逆に化ける。house style は `playerTraits.ts` の `number | null` と同じ)。
   */
  swingLagMs: number | null;
  /** ★連続量: 射程の境界を跨いだ回数/分(けん制の出入りの多さ・抽選しない)。 */
  reentryPerMin: number;
  /** ★連続量: 振り逃げた時に下がった距離の平均px(抽選しない)。振り逃げが無ければ `null`。 */
  backStepPx: number | null;
  /**
   * ★連続量: **一度も振らずに離れた**時に下がった距離の平均px(抽選しない)。
   * 待ち構える人は≒0、振らずに逃げる人は大きい。該当が無ければ `null`。
   */
  holdBackStepPx: number | null;
  /**
   * ★連続量: 1回の接敵あたり何回振るか(抽選しない)。**「積極的に振ってくる」癖の本体**
   * (社長の問い2026-08-25)。遅れ(swingLagMs)が同じでも、1回で引く人と振り続ける人はここで分かれる。
   */
  swingsPerEpisode: number;
  /** 離散の材料: 進入の直前に既に振っていた割合(袋へ)。 */
  preSwingRate: number;
  /** 離散の材料: 振った後すぐ射程外へ出た割合(袋へ)。 */
  swingLeaveRate: number;
  /** 離散の材料: 一度も振らずに終えた割合(=待ち構える人。袋へ)。 */
  holdRate: number;
}

export const foldMeleeSpacing = (st: MeleeSpacingState, elapsedMs: number): MeleeSpacingProfile => {
  const n = st.n;
  const min = Math.max(elapsedMs, 1) / 60000;
  return {
    n,
    swingLagMs: st.swingLagCount > 0 ? st.swingLagSumMs / st.swingLagCount : null,
    reentryPerMin: st.crossings / min,
    backStepPx: st.swingLeaveCount > 0 ? st.backStepSumPx / st.swingLeaveCount : null,
    holdBackStepPx: st.holdBackStepCount > 0 ? st.holdBackStepSumPx / st.holdBackStepCount : null,
    swingsPerEpisode: n > 0 ? st.swingSum / n : 0,
    preSwingRate: n > 0 ? st.preSwingCount / n : 0,
    swingLeaveRate: n > 0 ? st.swingLeaveCount / n : 0,
    holdRate: n > 0 ? st.holdCount / n : 0,
  };
};
