// カウンター成立域(reach)の**唯一の宣言場所** — research/COUNTER_REACH_AUDIT.md の是正(v0.25.3591)
//
// ## 何のためのファイルか
// 社長ゴール(言葉のまま):「(カウンターが)身体に触れているかで見ていて、実際カウンターできない技が
// 多い」。確立済みの文法は **「赤い予告の図形=カウンターの成立域」**(v0.25.2601 城ボスの着地円 /
// v0.25.3571 馬乗りの360度・突進 / v0.25.3585 舞妓の3技)。ところが各系統の既定は
// 「ボスの体とプレイヤーの体が重なっているか」(rectsOverlap)のままで、**帯や円の技は構造的に
// カウンターできなかった**(監査の違反16件)。
//
// 同じ穴を3回(v3571 / v3585 / 監査)踏んだので、**人の注意ではなく表**で止める:
//  - **どの州(bossState)がどの図形で成立するか**を、この1ファイルの `COUNTER_REACH_DECL` に宣言する。
//  - 実際の判定は `counterReachShapeFor()` が同じ表を根拠に図形を組み、`inCounterReach()` が評価する
//    (=各系統の tick は「表を引く」だけ。写経した if の並びを各所に増やさない)。
//  - `counterReach.test.ts` が **①州リストとの完全性**(新しい技の州を足したら宣言も必須)と
//    **②宣言と実装の一致**(表が 'band' と言う州は本当に帯を返す)を機械検査する。
//
// ## 寸法はここに書かない(重要)
// 数字は必ず技のテーブル(bountyScript / hiddenBossScript / angelScript / idolScript)を**その場で読む**。
// ここへ複製すると「赤いのに当たらない」が再発する(ボスメーカーで動かした値が判定にだけ反映されない)。
//
// ## このファイルは依存の軽い葉(store を import しない)
// 理由は bountyDims.ts 冒頭の「gameStore → levelUpGate → bountyTick → gameStore の循環importで
// 本番バンドルがTDZ=起動直後真っ暗」(v0.25.3390)。import してよいのは幾何とチューニング表だけ。
import { distToBandRect } from './geometry';
import { rectsOverlap, type Rect } from '../world/obstacles';
import {
  BOUNTY_RANGED_TUNING as BR_T, BOUNTY_MELEE_TUNING as BM_T,
  BOUNTY_BALANCE_TUNING as BB_T, BOUNTY_MAIKO_TUNING as MK_T,
} from './bountyScript';
import { BR_TRIPLE_HALF_WIDTH, BR_TRIPLE_REACH, brTripleAngles } from './bountyTriple';
import { HIDDEN_JORMUNGAND_TUNING as HB_JO, HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';
import { MIMIR_BITE_RADIUS } from './bodyCenteredAoe';
import { ANGEL_RAFI_TUNING as RF_T, ANGEL_ACRASIEL_TUNING as AC_T } from './angelScript';
import { IDOL_TUNING } from './idolScript';

// =================================================================================================
// 図形(shape)
// =================================================================================================
/**
 * 成立域の形。'none' = **紫=カウンター不可**の技(赤い予告を持たない/裁定で不可と決めたもの)。
 *
 * ★'circle-or-body'(v0.25.3812): **円と体は包含関係にない別集合**なので、'body' を 'circle' へ
 * 差し替えると「赤い円が出た=体当てで取れなくなる」という**経路の置換**になる。赤い予告を
 * 成立域へ**足す**のが目的の州(=着地円が離れた場所に出る技)は、この2つを OR で足す。
 */
export type { CounterReachKind } from './counterReachDecl';
import type { CounterReachKind } from './counterReachDecl';

/** 帯(カプセル)1本。判定側の `distToBandRect` と同じ2点+半幅を渡す。 */
export interface CounterBand { fx: number; fy: number; tx: number; ty: number; halfWidth: number }

export type CounterReachShape =
  /** 従来どおり「体の重なり」(赤い図形を持たない技=突進ライン・弾の予告・硬直など)。 */
  | { kind: 'body' }
  /** 帯。三段突きのように複数本ある技は bands に並べる(どれか1本に入っていれば成立)。 */
  | { kind: 'band'; bands: readonly CounterBand[] }
  /** 円(自分中心の円 / 着地円 / 飛んでいる毬の円 — 中心の出どころが違うだけで判定は同じ)。 */
  | { kind: 'circle'; cx: number; cy: number; radius: number }
  /**
   * 円 **または** 体の重なり(★v0.25.3812)。赤い円の中でも取れるし、従来どおりボスの体に
   * 当てても取れる(**既存の経路を奪わずに赤い円を足す**)。
   */
  | { kind: 'circle-or-body'; cx: number; cy: number; radius: number }
  /** カウンター不可(紫)。 */
  | { kind: 'none' };

/** 図形を組むのに要る「今の盤面」。呼び出し側(各系統の tick)が埋める。 */
export interface CounterReachCtx {
  /** 技を出しているボスの**現在の**中心(帯や自分中心円の起点)。 */
  bcx: number; bcy: number;
  /** 予告のロック2点(Enemy.aiFromX/Y → aiTargetX/Y)。未設定ならボス中心へフォールバックする。 */
  aiFromX?: number; aiFromY?: number; aiTargetX?: number; aiTargetY?: number;
  /** プレイヤー(=狙いの対象)の中心。**毎フレーム狙い直す技**(idolの拳)だけが使う。 */
  pcx: number; pcy: number;
  /** 三段突きの角度(溜めの頭でロックした `Enemy.bountyTripleAng`)。 */
  tripleAng?: number;
  /** 手毬打ちの毬の現在位置(往復の途中。判定と同じ式で呼び出し側が出す)。 */
  ballX?: number; ballY?: number;
  /**
   * ★v0.25.3812: **着地点(`aiTarget`)が、この州の溜め開始時にロック済みか**。
   * トールの飛び掛かりは `?thorscript=0`(台本OFF)だと**溜め終了の瞬間**にしか着地点をロックせず、
   * 溜め中の `aiTarget` は**前の技の残骸**(一閃/突きの到達点)。しかも `pixiScene` の
   * `showLandingCircle` も台本OFFでは溜め中に赤い円を描かない ⇒ その `aiTarget` を成立域にすると
   * **「画面に赤が1つも無い場所でカウンターが成立する」**(CLAUDE.md「この一致だけは妥協しない」の禁則)。
   * よって台本OFFでは 'body'(従来挙動)へ落とす。
   * **ゲートは葉へ持ち込まない**(このファイルは store も bossScript のフラグも import しない)ので、
   * 呼び出し側が事実を1フラグで渡す。**未指定=false=従来どおり体の重なり**(安全側)。
   */
  landingLocked?: boolean;
}

// =================================================================================================
// 宣言表(★ここが正本)
// =================================================================================================
// キー = `${持ち主}:${bossState}`。
//  - `bounty:` / `hidden:` / `idol:` … 州名が系統内で一意なので系統をキーにする。
//  - 天使だけは**6体で州名が衝突する**(rafi と uri の 'sweep-windup' は別寸法)ので **boss.type** をキーにする。
// 値 = その州でカウンターが成立する図形。**赤い予告の図形と必ず同じもの**にする。
// ★v0.25.5043: 宣言表の実体は counterReachDecl.ts(依存ゼロの葉)へ移した。ここは再輸出=従来の import 先はそのまま。
// 理由: 守護霊の記録(playerTraits)が「機会=カウンターが通る州」をこの表で判定するが、このファイルは技の寸法表
// (idolScript 等 → config/bossHealth → data/fixedGuardians → playerTraits)を import していて循環になる。
export { COUNTER_REACH_DECL } from './counterReachDecl';
import { COUNTER_REACH_DECL } from './counterReachDecl';

// ---- 裏ボス4体のカウンター可能州(★v0.25.3591で useGameLoop.ts からここへ移した) ----------------
// 移した理由は**テストできるようにするため**。useGameLoop.ts はReactフック(pixi/DOM込み)なので
// ユニットテストから読めず、州リストと宣言表の突き合わせ(=新しい技の宣言漏れ検知)ができなかった。
// 中身は移設前と1バイトも同じ(§6.28-13 #8/§6.28-21★3)。
export const HIDDEN_COUNTER_WINDUP_STATES: readonly string[] = [
  'aim-burst', 'aim-radial', 'dash-windup', 'laser-windup', 'bite-windup', 'coil-windup', 'cage-windup',
  // ★v0.25.3780(§8-2): トールもこの一覧へ。**他ボスは同名の州を持たないので挙動は1つも変わらない**
  // (mimir/jormungand/skadi は issen-*/tsuki-*/harai-*/jump-*/thor-dash-* のどれにも入らない)。
  // ★`issen-nihil` は**載せない**(紫=カウンター不可)。
  'issen-windup', 'tsuki-windup', 'harai-windup', 'jump-windup', 'thor-dash-windup',
];
export const HIDDEN_COUNTER_RECOVER_STATES: readonly string[] = [
  'burst-recover', 'radial-recover', 'dash-recover', 'laser-recover',
  'wheel-recover', // ミーミルの紫の車輪(research/MIMIR_WHEEL.md)。溜め/発射は紫=カウンター不可なので載せない
  'lattice-recover', // スカジの氷の格子(research/SKADI_LATTICE.md)。溜めは紫=カウンター不可なので載せない
  'skadi-ice-recover', 'skadi-blade-recover', 'bite-recover', 'coil-recover', 'cage-recover',
  // ★v0.25.3780(§8-2): トールの硬直(従来どおり「体の重なり」で成立=宣言は 'body')。
  'issen-recover', 'tsuki-recover', 'harai-recover', 'jump-recover', 'thor-dash-recover',
  // §6.33: 'laser-broken' は載せない(監査指摘6)。中断の報酬(カウンター成立扱い)は既に
  // 支払い済みで、ここに載せると1本のレーザーからカウンター報酬が2回出る+1700msの
  // パニッシュ窓が体当てで短縮される。laser-broken中は普通に殴る(それが報酬)。
];
/** 実行中(active)にもカウンターを開く裏ボスの州(突進の走り=その技の判定に委ねる)。 */
// ★v0.25.3785(検収監査 中H): トールの走り(thor-dash-move)も同じ列へ。**他ボスは同名の州を持たない**
// ので mimir/jormungand/skadi の挙動は1つも変わらない。成立域は宣言 'body' = 旧実装(ハンドラ内の
// 生の rectsOverlap)と同じ図形なので、プレイヤー側の取り方も変わらない。
// (弾き返し=突進の成立時に `thorCounterHit` へ `aimAt` を渡す形で効かせる。v0.25.3810 で
//  中間層 `thorDashCounterHit` は廃止=3つの呼び出し側が共通層を直接呼ぶ。)
export const HIDDEN_COUNTER_ACTIVE_STATES: readonly string[] = ['dash', 'thor-dash-move'];

/**
 * **ボス接触受け流し(`combatTick` の `bossContactParries`)へ落としてはいけない**州かどうか
 * (★v0.25.3809・検収監査8巡目 重大4)。
 *
 * `true` を返す州は、受け流し(体幹削り+`rootUntil` 900ms)を**通さない**。理由は
 * research/THOR_ISSEN_REWORK.md §5-2 やること④ = **フレーム内の競合順序が固定で不利**だから:
 * ボスtickは**フレーム頭の座標**で重なりを見て、その後に座標を進める / 接触側は**進めた後の座標**で
 * 見る ⇒「突進が到達したフレーム」は必ず受け流しが先に取る。受け流しが `rootUntil` を立てると
 * `frozen` がそれを拾って `bossState='chase'` にするので、**突進のカウンター(Counter!/クリ反撃/
 * counter-leap/弾き返し/専用CD)が丸ごと出ない**(v0.25.3785 重大A)。
 *
 * ★なぜ純関数か(8巡目 重大4): v0.25.3808〜3817 の間、この述語は `combatTick` の**到達不能な行**に
 * あった(暫定措置で走行中の接触が forEach の冒頭で return していたため)。**それを守るテストが
 * 1本も無く、宣言ごと削除しても全緑**だった(監査が実測)=次の「デッドコード掃除」で消え、
 * 裁定の瞬間に実バグが黙って戻る導火線だったので、純関数にして**値でアサート**した。
 * **★v0.25.3818 の社長裁定 §9-6「突進の走行中の体当たり」=(B)「当てる」で除外が外れ、
 * この述語は再び毎フレーム走る現役の分岐に戻っている**(=消すと重大Aがそのまま復活する)。
 *
 * **挙動は1bitも変えていない**(`enemy.type === 'thor' && enemy.bossState === 'thor-dash-move'` と同値)。
 */
/**
 * ★カウンター憲法(社長裁定2026-08-26・v0.25.3948): 「**今この州でカウンターが成立しうるか**」の
 * 近似(守護霊のAI用)。憲法で面成立(溜め/硬直/待機/気絶/空中)が消えたため、旧
 * `isBossCounterableNowApprox`(語尾=windup/recover判定)で窓を待つと**成立しない窓に棒立ちして
 * 予告を食らう**(検収監査2巡目(A))。残った成立経路の州だけを列挙する:
 * - 実行中の判定時置換カウンター(トール/天使/賞金首の各activeハンドラ)
 * - 体当たり技の接触パリィ/受け流し(charge / g-dash-charge / 体当たりboss州)
 * 爆風パリィ・弾反射は「州」ではなく瞬間なので、待ち行動の対象にしない(回避が正解)。
 * ※州名は各ボスで共有されるものがある(harai/tate/sweep等)=同名他ボスも機会ありと見なす近似で良い
 *   (AIの行動選択用であって判定ではない)。実リストとの同期は counterReach.test.ts が機械検査する。
 */
export const COUNTER_OPPORTUNITY_STATES: readonly string[] = [
  // 裏ボス系ACTIVE(useGameLoop)+体当たりboss州(combatTickの受け流し)
  'dash', 'thor-dash-move', 'issen-dash', 'tsuki', 'harai', 'jump-attack', 'jump-attack-air',
  // 賞金首ACTIVE(bountyTick)+体当たり
  'bm-charge', 'bm-whip360', 'mk-spin', 'leap', 'leap-air',
  // 天使の実行中(判定時置換 or 体当たり)
  'mdash-move', 'tate', 'sweep', 'downslash', 'thrust', 'ring-active', 'ring-spin',
];
export const isCounterOpportunityNow = (
  enemy: { type: string; aiPhase?: string; bossState?: string },
): boolean =>
  (enemy.bossState !== undefined && COUNTER_OPPORTUNITY_STATES.includes(enemy.bossState))
  || enemy.aiPhase === 'charge'
  || (enemy.type === 'giantbat' && enemy.aiPhase === 'g-dash-charge');

export const shouldSkipBossContactParry = (
  enemyType: string, bossState: string | undefined,
): boolean => (enemyType === 'thor' && bossState === 'thor-dash-move')
  // ★v0.25.3949: 賞金首の突進(bm-charge)も同型——bountyTick側のフル報酬カウンター(ACTIVEリスト)に
  // 委ね、受け流しに先取りさせない(賞金首が受け流し対象に入った同版の対)。
  || bossState === 'bm-charge';

/**
 * ★§9-6b(社長裁定2026-08-30=推薦(a)): トールの突進の**走行中(`thor-dash-move`)の接触ダメージを、
 * カウンター窓が開いている間だけ免除**する。
 *
 * なぜ要るか: 走行中の重なりは2箇所が別々の時刻の座標で見ている——共通カウンターブロック(ボスtick)は
 * **フレーム頭**の座標、接触ダメージ(`applyContactDamage`)は**そのフレームで進めた後**の座標。
 * よって重なり始めのフレームは「接触側だけが重なっている」状態になり、**カウンターが成立する1フレーム前に
 * 必ず1発もらう**(トール4技のうちこの技だけ手触りが割れる)。窓が開いている瞬間だけ接触を落とせば、
 * 「読み勝ったのに削られる」が消え、**窓を開けていない時は従来どおり当たる**=§9-6の裁定(当てる)は不変。
 *
 * 純関数にしてある理由(CLAUDE.md 実装精度の規律4): 配線に `&& !(… && counterActiveNow)` を書き足すだけだと、
 * 条件の片側を落とす変異がテストを素通りする(この案件で実測済みの型)。
 */
export const skipThorDashRunContactDamage = (
  enemyType: string, bossState: string | undefined, counterWindowOpen: boolean,
): boolean => enemyType === 'thor' && bossState === 'thor-dash-move' && counterWindowOpen;

/** 宣言を引く(未宣言=従来どおり体の重なり)。**新しい技は必ず表へ足す**(テストが落ちて教える)。 */
export const counterReachKindFor = (key: string): CounterReachKind => COUNTER_REACH_DECL[key] ?? 'body';

// =================================================================================================
// 図形の組み立て(表と同じ根拠で1箇所に置く)
// =================================================================================================
const band = (fx: number, fy: number, tx: number, ty: number, halfWidth: number): CounterReachShape =>
  ({ kind: 'band', bands: [{ fx, fy, tx, ty, halfWidth }] });

/**
 * 州から成立域の図形を組む。**寸法は必ず技のテーブルをその場で読む**(赤い予告と同じ数字)。
 * ctx に必要な値が無い州は素直に 'body' へ落ちる(=従来挙動)。
 */
export const counterReachShapeFor = (key: string, ctx: CounterReachCtx): CounterReachShape => {
  const fx = ctx.aiFromX ?? ctx.bcx, fy = ctx.aiFromY ?? ctx.bcy;
  const tx = ctx.aiTargetX ?? ctx.bcx, ty = ctx.aiTargetY ?? ctx.bcy;
  switch (key) {
    // ---- 賞金首 ----
    case 'bounty:br-push-windup':
      return band(fx, fy, tx, ty, BR_T.push.halfWidth);
    case 'bounty:br-triple-windup': {
      // 3本の帯。角度=溜めの頭でロックした bountyTripleAng(描画 pixiScene と同じ式・同じ関数)。
      const ang = brTripleAngles(ctx.tripleAng ?? Math.atan2(ctx.pcy - ctx.bcy, ctx.pcx - ctx.bcx));
      return {
        kind: 'band',
        bands: ang.map(a => ({
          fx: ctx.bcx, fy: ctx.bcy,
          tx: ctx.bcx + Math.cos(a) * BR_TRIPLE_REACH, ty: ctx.bcy + Math.sin(a) * BR_TRIPLE_REACH,
          halfWidth: BR_TRIPLE_HALF_WIDTH,
        })),
      };
    }
    case 'bounty:bm-whip360-windup':
    case 'bounty:bm-whip360':
      return { kind: 'circle', cx: ctx.bcx, cy: ctx.bcy, radius: BM_T.whip360.radius };
    case 'bounty:bm-combo1-windup':
    case 'bounty:bm-combo2-windup':
    case 'bounty:bm-combo3-windup':
      return band(fx, fy, tx, ty, BM_T.combo.halfWidth);
    case 'bounty:bm-snipe-windup':
      return { kind: 'none' };
    case 'bounty:bb-sweep-windup':
      return band(fx, fy, tx, ty, BB_T.sweep.halfWidth);
    case 'bounty:bb-triple1-windup':
    case 'bounty:bb-triple2-windup':
    case 'bounty:bb-triple3-windup':
      return band(fx, fy, tx, ty, BB_T.sweepTriple.halfWidth);
    case 'bounty:leap-windup':
      return { kind: 'circle', cx: tx, cy: ty, radius: BB_T.leap.radius };
    case 'bounty:mk-naginata-windup':
    case 'bounty:mk-naginata1-windup':
    case 'bounty:mk-naginata2-windup':
      return band(fx, fy, tx, ty, MK_T.naginata.halfWidth);
    case 'bounty:mk-spin-windup':
    case 'bounty:mk-spin':
      return { kind: 'circle', cx: ctx.bcx, cy: ctx.bcy, radius: MK_T.spin.radius };
    case 'bounty:mk-suiu-hop1':
    case 'bounty:mk-suiu-hop2':
      return { kind: 'circle', cx: tx, cy: ty, radius: MK_T.suiu.radius };
    case 'bounty:mk-suiu-hop3':
      return { kind: 'circle', cx: tx, cy: ty, radius: MK_T.suiu.radius * MK_T.suiu.finalRadiusMult };
    case 'bounty:mk-boom-out':
    case 'bounty:mk-boom-back':
      return { kind: 'circle', cx: ctx.ballX ?? tx, cy: ctx.ballY ?? ty, radius: MK_T.boom.hitRadius };

    // ---- 守護霊ボス「幻影」= v6で撤去(予告が存在しないのでカウンターの成立域も無い) ----

    // ---- 裏ボス ----
    case 'hidden:bite-windup':
      return { kind: 'circle', cx: ctx.bcx, cy: ctx.bcy, radius: MIMIR_BITE_RADIUS };
    case 'hidden:coil-windup':
      return band(fx, fy, tx, ty, HB_JO.coil.halfWidth);
    // ---- トール(v0.25.3780) ----
    case 'hidden:issen-nihil':
      return { kind: 'none' };            // ★紫=カウンター不可(§1-1・裁定「紫の文法」)
    case 'hidden:issen-windup':
      return band(fx, fy, tx, ty, HB_TH.issen.halfWidth);
    case 'hidden:harai-windup':
      return band(fx, fy, tx, ty, HB_TH.harai.halfWidth);
    case 'hidden:jump-windup':
      // ★v0.25.3810(§9-12・§8-2の包括裁定): 赤い着地円**も**成立域。中心はロック済みの着地点
      // (`aiTarget`。pixiScene の `showLandingCircle` が同じ2値で赤い円を描く)、半径は技のテーブル。
      // 円の式はラフィ/賞金首の跳びかかりと**同じ**(`cx: tx, cy: ty, radius`)。
      // ★v0.25.3812: kind は `'circle-or-body'`=**円を足しただけで体当ての経路は残る**。
      // 着地点が未ロック(台本OFF)なら赤い円がそもそも描かれないので 'body' へ落ちる(§5-8)。
      return ctx.landingLocked
        ? { kind: 'circle-or-body', cx: tx, cy: ty, radius: HB_TH.jump.radius }
        : { kind: 'body' };
    case 'hidden:tsuki-windup': {
      // 突きの赤帯は**狙い点そのものを終点にしない**(狙い点=プレイヤー位置で射程より近い/遠い)。
      // 始点=ボス中心、終点=狙いへの単位ベクトル×range。実行(`tsuki`)で作られる帯と同じ式
      // (useGameLoop の tsuki-windup→tsuki 遷移・pixiScene の予告と3つとも同じ組み方)。
      const dx = tx - ctx.bcx, dy = ty - ctx.bcy;
      const l = Math.hypot(dx, dy) || 1;
      return band(
        ctx.bcx, ctx.bcy,
        ctx.bcx + (dx / l) * HB_TH.tsuki.range, ctx.bcy + (dy / l) * HB_TH.tsuki.range,
        HB_TH.tsuki.halfWidth,
      );
    }

    // ---- 天使 ----
    case 'rafi:sweep':
      return band(fx, fy, tx, ty, RF_T.sweep.halfWidth);
    case 'rafi:jump-windup':
      return { kind: 'circle', cx: tx, cy: ty, radius: RF_T.jump.radius };
    case 'acrasiel:warp-in':
      return { kind: 'circle', cx: tx, cy: ty, radius: AC_T.warp.impactRadius };

    // ---- idol ----
    case 'idol:idol-punch-windup': {
      // 拳の帯は**毎フレーム今のプレイヤー方向へ**引き直される(pixiScene の予告と同じ式)。
      const ang = Math.atan2(ctx.pcy - ctx.bcy, ctx.pcx - ctx.bcx);
      return band(
        ctx.bcx, ctx.bcy,
        ctx.bcx + Math.cos(ang) * IDOL_TUNING.shape.punchRange,
        ctx.bcy + Math.sin(ang) * IDOL_TUNING.shape.punchRange,
        IDOL_TUNING.shape.punchHalfWidth,
      );
    }
    case 'idol:idol-snipe-windup':
      return { kind: 'none' };

    default:
      return { kind: 'body' };
  }
};

// =================================================================================================
// 評価
// =================================================================================================
/**
 * 成立域の中に居るか。プレイヤー半径は既存の各系統と同じ `max(w,h)/2`(帯・円)/ 矩形の重なり(体)。
 * ※「窓が開いているか」(counterWindowEnd)は呼び出し側が見る——ここは幾何だけを見る純関数。
 */
export const inCounterReach = (shape: CounterReachShape, playerRect: Rect, bossRect: Rect): boolean => {
  if (shape.kind === 'none') return false;
  if (shape.kind === 'body') return rectsOverlap(bossRect, playerRect);
  const pcx = playerRect.x + playerRect.width / 2, pcy = playerRect.y + playerRect.height / 2;
  const pRad = Math.max(playerRect.width, playerRect.height) / 2;
  if (shape.kind === 'circle') return Math.hypot(pcx - shape.cx, pcy - shape.cy) <= shape.radius + pRad;
  // ★v0.25.3812: 円 **または** 体。円('circle')と体('body')は包含関係にない別集合なので、
  // 赤い円を足す時に 'circle' へ差し替えると体当ての経路が消える(=置換になる)。OR で足す。
  if (shape.kind === 'circle-or-body') {
    return Math.hypot(pcx - shape.cx, pcy - shape.cy) <= shape.radius + pRad
      || rectsOverlap(bossRect, playerRect);
  }
  return shape.bands.some(b =>
    distToBandRect({ x: pcx, y: pcy }, { x: b.fx, y: b.fy }, { x: b.tx, y: b.ty }, b.halfWidth) <= pRad);
};

/** 州 → 図形 → 判定 を1本で(各系統の tick はこれだけを呼ぶ)。 */
export const inCounterReachFor = (
  key: string, ctx: CounterReachCtx, playerRect: Rect, bossRect: Rect,
): boolean => inCounterReach(counterReachShapeFor(key, ctx), playerRect, bossRect);
