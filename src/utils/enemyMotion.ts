// 敵の移動まわりの純関数(社長指示v0.25.2415)。3つとも「見た目」ではなく**ゲーム挙動**なので
// レンダラ非依存のこの層に置き、ユニットテストで固定する(実装精度の規律4)。
//
//  ① ダッシュ/滞空中はオブジェクトを貫通する      → `isPassThroughPhase`
//  ② 着地点が当たり判定のあるオブジェクトの中なら、その横へはみ出させる → `nudgeOutOfSolids`
//  ③ 障害物に当たったら適当に避けて通ろうとする    → `stepAvoid`
import type { Rect } from '../world/obstacles';

// ---------------------------------------------------------------------------------------------
// ① ダッシュ系/滞空はオブジェクトを貫通(社長指示「全てのダッシュ系攻撃はオブジェクトを貫通」)
// ---------------------------------------------------------------------------------------------
// なぜ: 突進や飛び掛かりは「線/円の予告どおりに来る」のが読みの前提(§6.28-3の語彙)。途中の木や
// バスに引っかかって止まると、**予告と実際が食い違う**=予告の意味が壊れる。貫通させれば
// 「赤い線の上は必ず来る」が守られる。滞空(空中)も同じ理由で含める(空を飛んでいる=地上物に当たらない)。
//
// 掟: **当たり判定(プレイヤーへのダメージ)は何も変えていない**。変えるのは「敵自身が壁で止まるか」だけ。
const PASS_THROUGH_PHASES = new Set<string>([
  // 汎用(犬/lab-zombie-2/giantbat旧経路/パンプキン)
  'charge', 'jump',
  // 城ボス(M51/M66)
  'g-dash-charge', 'g-jump-air', 'g-quad-charge', 'g-glide-active', 'g-dive-windup',
]);
export const isPassThroughPhase = (aiPhase: string | undefined): boolean =>
  aiPhase !== undefined && PASS_THROUGH_PHASES.has(aiPhase);

// 裏ボス/ゲート2ボスは bossState 側の状態機械で動くので別表。突進・飛び掛かり・転移の実行中だけ。
const PASS_THROUGH_BOSS_STATES = new Set<string>([
  'issen-dash', 'tsuki', 'jump-attack',        // トール
  'dash', 'jump-attack-air', 'leap',           // ゲート2系(ミゲル踏み込み/ラフィ飛び掛かり)
  'idol-roll',                                 // idol の離脱ローリング
]);
export const isPassThroughBossState = (bossState: string | undefined): boolean =>
  bossState !== undefined && PASS_THROUGH_BOSS_STATES.has(bossState);

// ---------------------------------------------------------------------------------------------
// ② 着地点がオブジェクトの中なら横へはみ出す(社長指示)
// ---------------------------------------------------------------------------------------------
// なぜ: 飛び掛かりの着地点はプレイヤーの位置にロックされる。プレイヤーが木/バス/建物に張り付いて
// いると着地円が丸ごとオブジェクトの中に入り、**赤い円の中に立てない=避けようがない/当たりようがない**
// という意味不明な絵になる。中心をオブジェクトの外へ押し出して、円がちゃんと地面の上に載るようにする。
//
// 押し出す方向は**一番浅く抜けられる向き**(左右上下のうち最短)。「その横にはみ出す」という社長の
// 指示どおり、横方向が最短ならそのまま横へ出る。判定と予告円は同じ値を読むので**両方が一緒に動く**。
export const nudgeOutOfSolids = (
  x: number, y: number, radius: number, solids: readonly Rect[], maxIter = 4,
): { x: number; y: number } => {
  let cx = x, cy = y;
  for (let iter = 0; iter < maxIter; iter++) {
    let hit: Rect | null = null;
    for (const r of solids) {
      // 円(中心cx,cy・半径radius)と矩形の重なり=矩形上の最近点までの距離で判定。
      const nx = Math.max(r.x, Math.min(cx, r.x + r.width));
      const ny = Math.max(r.y, Math.min(cy, r.y + r.height));
      if (Math.hypot(cx - nx, cy - ny) < radius) { hit = r; break; }
    }
    if (!hit) break;
    // 4方向のうち一番浅い抜け方を選ぶ。
    const left = (cx + radius) - hit.x;                 // 左へ出る量
    const right = (hit.x + hit.width) - (cx - radius);  // 右へ出る量
    const up = (cy + radius) - hit.y;                   // 上へ出る量
    const down = (hit.y + hit.height) - (cy - radius);  // 下へ出る量
    const m = Math.min(left, right, up, down);
    if (m === left) cx -= left;
    else if (m === right) cx += right;
    else if (m === up) cy -= up;
    else cy += down;
  }
  return { x: cx, y: cy };
};

// ---------------------------------------------------------------------------------------------
// ③ 障害物に当たったら適当に避けて通る(社長指示「綿密に組まなくていい」)
// ---------------------------------------------------------------------------------------------
// 社長の指定どおりの3段階:
//   進めない → 横へ数px避ける → そっちも駄目なら反対側へ切り替える → それでも駄目なら諦める。
// 諦めた後は一定時間ふつうに突っ込み続ける(=完全に固まらない。壁が動く/プレイヤーが動けば自然に解ける)。
export interface AvoidState {
  /** 進めていない時間(ms)。閾値を超えたら回避へ入る。 */
  blockedMs: number;
  /** 回避中の横方向(+1/-1)。0=回避していない。 */
  dir: 0 | 1 | -1;
  /** 回避を続ける残り時間(ms)。 */
  leftMs: number;
  /** 何回向きを変えたか。2回で諦める。 */
  tries: number;
  /** 諦めている残り時間(ms)。>0 の間は回避しない。 */
  giveUpMs: number;
}

export const createAvoidState = (): AvoidState => ({ blockedMs: 0, dir: 0, leftMs: 0, tries: 0, giveUpMs: 0 });

export const AVOID_BLOCKED_MS = 250;   // これだけ進めなかったら回避へ
export const AVOID_DURATION_MS = 700;  // 1方向を試す時間
export const AVOID_GIVEUP_MS = 2000;   // 2方向とも駄目だった後、諦めている時間
export const AVOID_MOVED_FRAC = 0.35;  // 「進めた」と見なす最低割合(意図した距離に対して)

export interface AvoidTickInput {
  dtMs: number;
  /** 意図した移動距離(px)。0なら止まっているだけ=詰まりとは見なさない。 */
  wantDist: number;
  /** 実際に動けた距離(px)。 */
  movedDist: number;
  /** 進みたい向き(単位ベクトル)。回避の横方向はこれの直交を使う。 */
  dirX: number;
  dirY: number;
  /** 向きを決める時の左右の選び方(0..1)。テストから固定できるように引数で受ける。 */
  rand: number;
}

export interface AvoidTickResult {
  state: AvoidState;
  /** このtickで実際に進むべき向き(単位ベクトル)。回避中は直交方向になる。 */
  moveX: number;
  moveY: number;
}

export const stepAvoid = (state: AvoidState, input: AvoidTickInput): AvoidTickResult => {
  const { dtMs, wantDist, movedDist, dirX, dirY, rand } = input;
  const s: AvoidState = { ...state };
  const straight = { moveX: dirX, moveY: dirY };

  if (s.giveUpMs > 0) {
    s.giveUpMs = Math.max(0, s.giveUpMs - dtMs);
    return { state: s, ...straight }; // 諦め中=ふつうに突っ込む(固まらないための出口)
  }

  // 進めているか。動こうとしていない(wantDist≒0)フレームは判定しない。
  const blocked = wantDist > 0.01 && movedDist < wantDist * AVOID_MOVED_FRAC;
  s.blockedMs = blocked ? s.blockedMs + dtMs : 0;

  if (s.dir !== 0) {
    // 回避中。詰まったままなら向きを切り替え、2回目も駄目なら諦める。
    s.leftMs -= dtMs;
    if (s.blockedMs >= AVOID_BLOCKED_MS) {
      s.blockedMs = 0;
      s.tries += 1;
      if (s.tries >= 2) { s.dir = 0; s.leftMs = 0; s.tries = 0; s.giveUpMs = AVOID_GIVEUP_MS; return { state: s, ...straight }; }
      s.dir = (s.dir === 1 ? -1 : 1);
      s.leftMs = AVOID_DURATION_MS;
    } else if (s.leftMs <= 0) {
      // 抜けられた(or 時間切れ)=通常追跡へ戻る。
      s.dir = 0; s.tries = 0;
      return { state: s, ...straight };
    }
    // 直交方向へ避ける(進行方向の左右)。
    return { state: s, moveX: -dirY * s.dir, moveY: dirX * s.dir };
  }

  if (s.blockedMs >= AVOID_BLOCKED_MS) {
    s.blockedMs = 0;
    s.dir = rand < 0.5 ? 1 : -1;
    s.leftMs = AVOID_DURATION_MS;
    s.tries = 0;
    return { state: s, moveX: -dirY * s.dir, moveY: dirX * s.dir };
  }
  return { state: s, ...straight };
};
