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
// ★v0.25.3808(検収監査7巡目 重大2): 上の切り出しでは**足りなかった**。値テストが守るのは純関数の
// **内側**だけで、**そこへ何を束縛するか**(`fromX/toX` を入れ替える・`bossW/bossH` に 0 を渡す・
// 帯の文脈を偽装する)は無検査のまま `useGameLoop.ts` に残っていた=監査の実測で**全緑**。
// よって **`Enemy`/`Player` から引数を組む所まで**この葉へ入れ(`thorDashPushbackFromEnemy`)、
// 配線側は「呼んで `aimAt` に渡す」1文だけにする。引数は8個の名前付きオブジェクトから
// **2個の実体(boss, player)** へ縮み、取り違えの面積そのものが小さくなる。
//
// レンダラ非依存・store非依存の葉。import してよいのは型と world の純関数だけ。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import type { Enemy, Player } from '../types/game';

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

/** 束縛に必要な**ボス側**の最小形(`Enemy` の部分集合)。 */
export type ThorDashPushbackBoss =
  Pick<Enemy, 'x' | 'y' | 'width' | 'height' | 'aiFromX' | 'aiFromY' | 'aiTargetX' | 'aiTargetY'>;
/** 束縛に必要な**プレイヤー側**の最小形(`Player` の部分集合)。 */
export type ThorDashPushbackPlayer = Pick<Player, 'x' | 'y' | 'width' | 'height'>;

/**
 * ★配線から**束縛ごと**引き取った層(v0.25.3808・検収監査7巡目 重大2)。
 * `Enemy`/`Player` を受け取り、`thorDashPushbackTarget` の8引数を**ここで組む**。
 *
 * 束縛の中身(ここが `useGameLoop.ts` から出てきた部分):
 *  - **進行方向** = 突進の起点(`aiFromX/Y`)→ 到達点(`aiTargetX/Y`)。**この向きを入れ替えると
 *    ボスはプレイヤーの向こう側へ前進する**ので、順序はここに固定して値でテストする。
 *  - 起点/到達点が未設定(突進以外の州から呼ばれた等)なら**ボスの現在中心**で埋める
 *    = 方向が作れない ⇒ プレイヤー中心が返る(旧配線と同値)。
 *  - **矩形の寸法はボスの当たり判定**(`width/height`)。0 を渡すと帯クランプが点で効く。
 *  - **弾き返しの基準点はプレイヤーの中心**(左上ではない)。
 *
 * ※基準点をプレイヤー中心に取っていること自体の是非は **§9-6c で社長裁定待ち**(式は変えない)。
 */
export const thorDashPushbackFromEnemy = (
  boss: ThorDashPushbackBoss,
  player: ThorDashPushbackPlayer,
  area: PlayableAreaCtx,
  pushbackPx: number,
): { x: number; y: number } => {
  const bcx = boss.x + boss.width / 2;
  const bcy = boss.y + boss.height / 2;
  return thorDashPushbackTarget({
    fromX: boss.aiFromX ?? bcx, fromY: boss.aiFromY ?? bcy,
    toX: boss.aiTargetX ?? bcx, toY: boss.aiTargetY ?? bcy,
    pcx: player.x + player.width / 2, pcy: player.y + player.height / 2,
    pushbackPx,
    bossW: boss.width, bossH: boss.height,
    area,
  });
};
