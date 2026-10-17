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
// **1個の実体(boss)** へ縮み(★v0.25.4087 §9-6c の裁定で player も不要になった)、
// 取り違えの面積そのものが小さくなる。
//
// ★v0.25.3809(検収監査8巡目 重大1/3・低9): さらに3つを配線から引き取った。
//  ・`counterLeapTarget` / `counterLeapOrigin` = **共通層の分岐そのもの**。共通層に
//    `patch.aiTargetX = opts?.aimAt ? A : B` と三項で書いていた間は、**A と B の両側を既定式にする**
//    (=`aimAt` を読むフリだけして捨てる)変異が走査(「`opts?.aimAt` という字面が在るか」)を
//    素通りした。分岐をここへ出し、**`aimAt` を渡したらその座標がそのまま返る**ことを値で固定する。
//  ・`thorPlayableAreaCtx` = **「行ける帯」の文脈の組み立て**。配線側で4フィールドを1つずつ
//    書いていた間は、`labTheme` 以外を `false` に差し替える変異が走査(`labTheme:` の1行だけ)を
//    素通りした。組み立てごとここへ入れ、配線からは**store をそのまま渡す**だけにする。
//
// レンダラ非依存・store非依存の葉。import してよいのは型と world の純関数だけ。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
// ★v0.25.3818(§9-10「等速の線形補間(慣性MUST違反)」裁定(b)): 弾き返しの運びに慣性を入れる。既存の共有イージング(smootherstep)。
import { airHopEase01 } from './airHop';
import type { Enemy } from '../types/game';

/** 「行ける帯」の文脈を組む時に読む**store の4フィールド**(構造だけを要求する=store 非依存)。 */
export interface ThorPlayableAreaState {
  farBackdrop: string;
  stageTheme: string;
  corridorMode: boolean;
  corridorRunInActive: boolean;
}

/**
 * store の状態から「行ける帯」の文脈(`PlayableAreaCtx`)を組む(★v0.25.3809・検収監査8巡目 低9)。
 *
 * なぜ切り出すか: 配線側で4フィールドを1つずつ書いていた間、走査が見ていたのは
 * `labTheme: pst.stageTheme === 'lab'` の**1行だけ**だったので、**残り3つを定数へ差し替える**変異が
 * 緑を通った(監査が実測)。トールの戦場では実質 no-op なので実機影響は出ないが、同じ純関数が
 * 他ボス・他ステージへ横展開された瞬間に効く。組み立てごとここへ入れれば、配線に残るのは
 * 「store をそのまま渡す」1語だけになり、**フィールド単位の細工が構造的にできなくなる**。
 *
 * `m0AdvanceLimitX` は **null 固定**(M0の透明壁はチュートリアル専用で、裏ボス戦には存在しない)。
 * 旧配線もここに null を直書きしていたので**値は1つも変わっていない**。
 */
export const thorPlayableAreaCtx = (s: ThorPlayableAreaState): PlayableAreaCtx => ({
  farBackdrop: s.farBackdrop,
  labTheme: s.stageTheme === 'lab',
  corridorMode: s.corridorMode,
  m0AdvanceLimitX: null,
  corridorRunInActive: s.corridorRunInActive,
});

/**
 * `counter-leap`(トール全技共通のカウンター反応)の**到達点**を返す
 * (★v0.25.3809・検収監査8巡目 重大1)。
 *
 * - `aimAt` が渡されていれば**その座標をそのまま返す**(=突進の弾き返しの行き先)。
 * - 渡されていなければ既定=**プレイヤーから見て今ボスが居る向きへ `distPx`**(近接距離ギリギリ外の
 *   後退ジャンプ)。式は旧実装(共通層に直書きしていた三項の else 側)と1文字も変えていない。
 *
 * なぜ純関数か: 共通層に `patch.aiTargetX = opts?.aimAt ? opts.aimAt.x : 既定式` と書いてある間は、
 * 走査が見られるのは「`opts?.aimAt` という字面が在るか」までで、**三項の両側を既定式にする**変異
 * (=行き先を読むフリだけして捨てる ⇒ 150pxの弾き返しが消え、常に後退ジャンプへ着地する)が
 * 緑を通った(監査が実測)。**分岐そのものをここへ出し、値でアサートする**。
 */
export const counterLeapTarget = (
  aimAt: { x: number; y: number } | undefined,
  pcx: number, pcy: number, bcx: number, bcy: number, distPx: number,
): { x: number; y: number } => {
  if (aimAt) return { x: aimAt.x, y: aimAt.y };
  const lx = bcx - pcx, ly = bcy - pcy;
  const ll = Math.hypot(lx, ly) || 1;
  return { x: pcx + (lx / ll) * distPx, y: pcy + (ly / ll) * distPx };
};

/**
 * `counter-leap` の**起点**を返す(★v0.25.3809・検収監査8巡目 重大3)。`counterLeapTarget` と対。
 *
 * - `fromAt` が渡されていれば**その座標をそのまま返す**(=突進の到達フレームで斬り抜けカウンターを
 *   取った時の「このフレームで実際に居る場所」)。
 * - 渡されていなければ既定=**フレーム頭のボス中心**(`bcx/bcy`)。
 *
 * なぜ純関数か: 旧実装は「共通層が `patch.aiFromX` を書いた**後に**呼び出し側が上書きする」という
 * **順序契約**の上に立っており、**代入を呼び出しの前に1行動かすだけで全緑**(監査が実測)。
 * 3つの成立経路のうち**斬り抜け経路だけ**が壊れるので実機で最も気づかれにくい。
 * `aimAt` と対称に引数化すれば、「後から上書きされうる」構造そのものが消える。
 */
export const counterLeapOrigin = (
  fromAt: { x: number; y: number } | undefined, bcx: number, bcy: number,
): { x: number; y: number } => (fromAt ? { x: fromAt.x, y: fromAt.y } : { x: bcx, y: bcy });

/**
 * `counter-leap` の**補間位置(中心座標)**を返す(★v0.25.3810・検収監査9巡目 重大1)。
 * `counterLeapOrigin`(起点)/ `counterLeapTarget`(到達点)と対で、**弾き返しを実際に運ぶ計算**。
 *
 * なぜ純関数か: 9巡かけて固めたのは「到達点を**書く**所」だけで、**それを読んでボスを動かす補間**
 * には値テストも走査も1本も無かった。監査の実測では
 *  ・到達点を読むのをやめて `const tx = bcx, ty = bcy;` にする → **全緑**
 *  ・補間の直後に `patch.x = fx - boss.width/2;` を足して起点へ固定する → **全緑**
 * ⇒ **ボスが1pxも動かない**(v0.25.3785 重大D の完全再現)が、**ワンライナーで**戻せた。
 * 補間そのものをここへ出し、**t=0で起点・t=1で到達点・中間が単調**を値で固定する。
 *
 * `t01` は内側でも 0〜1 へ丸める(呼び出し側の `Math.max/min` が消えても端で暴れない)。
 *
 * ★v0.25.3818(社長裁定 §9-10「等速の線形補間(慣性MUST違反)」= **(b)**): **慣性(ease)を入れた**。時間 `t01` を `airHopEase01`
 * (smootherstep = 両端で速度0)へ通してから距離に掛ける。同じファイルの `jump-attack` /
 * `thor-dash-move` が既に通している関数で、**新しい定数も新しい曲線も発明していない**。
 * `airHopEase01` は t=0 で 0・t=1 で 1 に必ず一致するので、
 * **起点・到達点・所要時間(`counterLeapMs`)・判定は1pxも1msも変わらない**——変わるのは
 * 「150pxをどう配分して運ぶか」(=飛行中の速度カーブ)だけ。
 * ※smootherstep は左右対称なので **t=0.5 はちょうど中点のまま**。慣性が入った証拠は端寄りに出る
 *   (t=0.25 → 進捗 10.35% / t=0.75 → 89.65%)。
 */
export const counterLeapPos = (
  from: { x: number; y: number }, to: { x: number; y: number }, t01: number,
): { x: number; y: number } => {
  const t = airHopEase01(Math.max(0, Math.min(1, t01)));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
};

/**
 * ★§9-9(社長裁定2026-08-30=推薦(b)「線ごと平行移動」): ノックバックで**凍結中に横へ滑った分**を、
 * 突進の線(`aiFrom`→`aiTarget`)へそのまま足して**線ごと平行移動**する純関数。
 *
 * 何が問題だったか: 凍結中(`kbOnlyStop`)は `thor-dash-move` の状態機械が丸ごとスキップされるので
 * 位置は書かれない。一方 `updateEnemies` の押し出しは押し道具(シールドバッシュ714 / 鞭600)で
 * **ボスを実際に横へ滑らせる**(最大約100px)。解除の瞬間、突進ハンドラは `aiFrom→aiTarget` の
 * **絶対位置**を書き戻すので、滑った分が1フレームで消える=**最大約100pxのワープ**(慣性MUST違反)。
 * 線ごと平行移動すれば、走る向き・残り距離・イージング・所要時間・判定は1つも変わらず、
 * **押された位置から続きを走る**(=現実の物理)になる。
 *
 * 自己補正: 「今フレームの実位置」と「今の線が指す補間位置」の差を毎フレーム足すので、平行移動した
 * 次のフレームは差が0になる(蓄積しない)。滑り続けている間だけ差が出る。
 *
 * `moveT01` は**生の進捗**(elapsed / moveMs)。内側で `airHopEase01`(突進ハンドラと同じ曲線)へ通す
 * =補間式を2箇所に持たない。到達点は `clampRectToPlayableArea` を通す(CLAUDE.md「Y方向の掟」:
 * 押し出しで帯の外へ出た線をそのまま走らせない)。
 */
export interface ThorDashLine { fromX: number; fromY: number; toX: number; toY: number }

export const thorDashLineShift = (
  line: ThorDashLine,
  actualCx: number, actualCy: number,
  moveT01: number,
  bossW: number, bossH: number,
  area: PlayableAreaCtx,
): ThorDashLine => {
  const ease = airHopEase01(Math.max(0, Math.min(1, moveT01)));
  const expX = line.fromX + (line.toX - line.fromX) * ease;
  const expY = line.fromY + (line.toY - line.fromY) * ease;
  const dx = actualCx - expX, dy = actualCy - expY;
  if (dx === 0 && dy === 0) return line;
  const placed = clampRectToPlayableArea(
    line.toX + dx - bossW / 2, line.toY + dy - bossH / 2, bossW, bossH, area,
  );
  return {
    fromX: line.fromX + dx, fromY: line.fromY + dy,
    toX: placed.x + bossW / 2, toY: placed.y + bossH / 2,
  };
};

export interface ThorDashPushbackInput {
  /** 突進の起点(`Enemy.aiFromX/aiFromY`)。**「来た方向」はこの2点から作る。** */
  fromX: number; fromY: number;
  /** 突進の到達点(`Enemy.aiTargetX/aiTargetY`)。 */
  toX: number; toY: number;
  /**
   * 弾き返しの基準点=**ボスの現在中心**(★§9-6c 社長裁定2026-08-30=推薦(a))。
   * 旧はプレイヤー中心(流用元のミゲル/ウリの式)。ミゲルの走行カウンターは**プレイヤー専用**
   * だったので「プレイヤーの手前=来た方向」で一致していたが、守護霊も突進を取れるようになった今は
   * **プレイヤーから離れた場所で取るとボスが前進しうる**(社長の言葉「来た方向へ弾き返す」に反する)。
   * ボスの現在中心を起点にすれば、**誰が取っても必ず来た方向へ pushbackPx ぶん下がる**。
   */
  originX: number; originY: number;
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
 *  2. **ボスの現在中心から、その進行方向の逆へ `pushbackPx`** ぶん離れた点(=来た方向へ退ける)。
 *  3. 「行ける帯」(`clampRectToPlayableArea`)を通す(CLAUDE.md「Y方向に何かを動かす時の必須チェック」)。
 *     ※トールの戦場(ステージ5)は tutorial/lab/corridor のどれにも当たらないので実質そのまま返る。
 *       通しているのは「行ける帯の定義を1本に保つ」ための作法(§9-8 の事実メモ)。
 *
 * ★起点は**ボスの現在中心**(§9-6c 社長裁定=推薦(a)・v0.25.4087)。旧はプレイヤー中心だった
 * (流用元のミゲルの式)。誰が取っても「来た方向へ下がる」を満たすのは前者だけ。
 */
export const thorDashPushbackTarget = (i: ThorDashPushbackInput): { x: number; y: number } => {
  let bdx = i.toX - i.fromX;
  let bdy = i.toY - i.fromY;
  // 起点と到達点が同じ(=方向が作れない)時は 0 ベクトルのまま進む。結果は起点(ボスの現在中心)
  // そのもの(`|| 1` は 0 除算よけであって方向を作るものではない)。
  const bl = Math.hypot(bdx, bdy) || 1;
  bdx /= bl; bdy /= bl;
  const bx2 = i.originX - bdx * i.pushbackPx;
  const by2 = i.originY - bdy * i.pushbackPx;
  const placed = clampRectToPlayableArea(bx2 - i.bossW / 2, by2 - i.bossH / 2, i.bossW, i.bossH, i.area);
  return { x: placed.x + i.bossW / 2, y: placed.y + i.bossH / 2 };
};

/** 束縛に必要な**ボス側**の最小形(`Enemy` の部分集合)。 */
export type ThorDashPushbackBoss =
  Pick<Enemy, 'x' | 'y' | 'width' | 'height' | 'aiFromX' | 'aiFromY' | 'aiTargetX' | 'aiTargetY'>;

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
 *  - **弾き返しの基準点はボスの現在中心**(§9-6c 裁定=推薦(a)・v0.25.4087。旧はプレイヤー中心)。
 *  - ★v0.25.3809(8巡目 低9): **「行ける帯」の文脈の組み立てもここ**(`thorPlayableAreaCtx`)。
 *    第3引数は組み上がった `PlayableAreaCtx` ではなく**store の状態そのもの**を受け取るので、
 *    配線側でフィールドを1つずつ差し替える細工ができない。
 *
 * ※基準点は §9-6c の社長裁定(推薦(a))で**ボスの現在中心**に確定した(v0.25.4087)。
 */
export const thorDashPushbackFromEnemy = (
  boss: ThorDashPushbackBoss,
  state: ThorPlayableAreaState,
  pushbackPx: number,
): { x: number; y: number } => {
  const bcx = boss.x + boss.width / 2;
  const bcy = boss.y + boss.height / 2;
  return thorDashPushbackTarget({
    fromX: boss.aiFromX ?? bcx, fromY: boss.aiFromY ?? bcy,
    toX: boss.aiTargetX ?? bcx, toY: boss.aiTargetY ?? bcy,
    // ★§9-6c(社長裁定=推薦(a)): 起点は**ボスの現在中心**。プレイヤーは引数から外してある
    // =「基準点を取り違える」細工の面積そのものを消す(v0.25.4087)。
    originX: bcx, originY: bcy,
    pushbackPx,
    bossW: boss.width, bossH: boss.height,
    area: thorPlayableAreaCtx(state),
  });
};
