// トールの突進(`thor-dash-*`)をカウンターした時の**弾き返しの行き先**だけを持つ純関数
// (research/THOR_ISSEN_REWORK.md §4-1 受け入れ条件3 / §5-2「★弾き返しの効かせ方」)。
//
// なぜ切り出すか(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出してテスト」):
// v0.25.3805 の検収監査6巡目が、この計算を `useGameLoop.ts` に直書きしたままの状態で
// **①弾き返し量のゼロ化(`* 0`) ②符号反転(引き寄せになる)** を実測したところ、
// **テスト4487件すべてが緑を通った**。ソース走査のテストが守れるのは「その字面が在るか」
// までで、**出てくる値**は守れないため。よってここへ出し、**方向・距離・クランプ結果を
// 値でアサートする**(`thorDashPushback.test.ts` ではなく `thorNihil.test.ts` に置いてある
// =突進カウンターの不変条件を1つの読み物にまとめるため)。
//
// レンダラ非依存・store非依存の葉。import してよいのは型と world の純関数だけ。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';

export interface ThorDashPushbackInput {
  /** 突進の起点(`Enemy.aiFromX/aiFromY`)。**「来た方向」はこの2点から作る。** */
  fromX: number; fromY: number;
  /** 突進の到達点(`Enemy.aiTargetX/aiTargetY`)。 */
  toX: number; toY: number;
  /** プレイヤー中心(弾き返しの基準点。流用元のミゲル/ウリと同じ)。 */
  pcx: number; pcy: number;
  /**
   * 弾き返す距離(px)。呼び出し側が `ANGEL_COMMON_TUNING.dashCounterPushbackPx`(=ミゲル/ウリと
   * 共有の合流点)を渡す。**ここで既定値を持たない**=新しい数字の出どころを作らないため。
   */
  pushbackPx: number;
  /** ボスの当たり判定の大きさ(「行ける帯」は矩形で見るので要る)。 */
  bossW: number; bossH: number;
  /** 「行ける帯」の文脈(ステージ条件)。 */
  area: PlayableAreaCtx;
}

/**
 * 弾き返しの**到達点(中心座標)**を返す。呼び出し側はこれを `patch.aiTargetX/aiTargetY` へ入れ、
 * `counter-leap` の補間に運ばせる(**座標=`patch.x/y` は1pxも書かない**=150pxの1フレーム
 * テレポート=慣性MUST違反を作らないため。§5-2「★弾き返しの効かせ方」)。
 *
 * 計算は3段:
 *  1. 突進の進行方向(from→to)の単位ベクトルを作る。
 *  2. **プレイヤー中心から、その進行方向の逆へ `pushbackPx`** ぶん離れた点(=来た方向へ退ける)。
 *  3. 「行ける帯」(`clampRectToPlayableArea`)を通す(CLAUDE.md「Y方向に何かを動かす時の必須チェック」)。
 *     ※トールの戦場(ステージ5)は tutorial/lab/corridor のどれにも当たらないので実質そのまま返る。
 *       通しているのは「行ける帯の定義を1本に保つ」ための作法(§9-8 の事実メモ)。
 *
 * ★起点をプレイヤー中心に取っているのは流用元のミゲルの式そのまま。守護霊(ゴースト)が
 * プレイヤーから離れた場所で取ると「来た方向へ下がる」にならない件は **§9-6c で社長裁定待ち**
 * (ここでは式を変えない=裁定前に見え方を動かさない)。
 */
export const thorDashPushbackTarget = (i: ThorDashPushbackInput): { x: number; y: number } => {
  let bdx = i.toX - i.fromX;
  let bdy = i.toY - i.fromY;
  // 起点と到達点が同じ(=方向が作れない)時は 0 ベクトルのまま進む。結果はプレイヤー中心そのもの
  // (旧実装と同じ挙動。`|| 1` は 0 除算よけであって方向を作るものではない)。
  const bl = Math.hypot(bdx, bdy) || 1;
  bdx /= bl; bdy /= bl;
  const bx2 = i.pcx - bdx * i.pushbackPx;
  const by2 = i.pcy - bdy * i.pushbackPx;
  const placed = clampRectToPlayableArea(bx2 - i.bossW / 2, by2 - i.bossH / 2, i.bossW, i.bossH, i.area);
  return { x: placed.x + i.bossW / 2, y: placed.y + i.bossH / 2 };
};
