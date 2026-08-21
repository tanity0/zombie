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
import type { Enemy, Player } from '../types/game';

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
 * ★**等速のまま**(旧実装と1文字も変えていない)。イージングを入れるかは §9-10 で社長裁定待ち
 * ——**「等速が正しい」という結論ではない**(CLAUDE.md 慣性MUSTには現に違反している)。
 */
export const counterLeapPos = (
  from: { x: number; y: number }, to: { x: number; y: number }, t01: number,
): { x: number; y: number } => {
  const t = Math.max(0, Math.min(1, t01));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
};

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
 *  - ★v0.25.3809(8巡目 低9): **「行ける帯」の文脈の組み立てもここ**(`thorPlayableAreaCtx`)。
 *    第3引数は組み上がった `PlayableAreaCtx` ではなく**store の状態そのもの**を受け取るので、
 *    配線側でフィールドを1つずつ差し替える細工ができない。
 *
 * ※基準点をプレイヤー中心に取っていること自体の是非は **§9-6c で社長裁定待ち**(式は変えない)。
 */
export const thorDashPushbackFromEnemy = (
  boss: ThorDashPushbackBoss,
  player: ThorDashPushbackPlayer,
  state: ThorPlayableAreaState,
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
    area: thorPlayableAreaCtx(state),
  });
};
