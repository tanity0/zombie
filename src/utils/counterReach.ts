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
export type CounterReachKind = 'body' | 'band' | 'circle' | 'circle-or-body' | 'none';

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
export const COUNTER_REACH_DECL: Readonly<Record<string, CounterReachKind>> = {
  // ---- 賞金首 バス停(bounty-ranged) ----
  'bounty:br-push-windup': 'band',        // 押しのけ=帯 82×34(監査 C-1)
  'bounty:br-push-recover': 'body',
  'bounty:br-triple-windup': 'band',      // 三段突き=帯 300×34 ×3本(監査 B-1)
  'bounty:br-triple-recover': 'body',
  // ---- 賞金首 馬乗り(bounty-melee) ----
  'bounty:bm-charge-windup': 'body',      // 突進=流星ライン(図形reachは持たない。実行中に接触で取れる=監査D)
  'bounty:bm-charge': 'body',
  'bounty:bm-charge-recover': 'body',
  'bounty:bm-whip360-windup': 'circle',   // 360度ムチ=自分中心円 r=170(v0.25.3571で是正済み)
  'bounty:bm-whip360': 'circle',
  'bounty:bm-combo1-windup': 'band',      // 3段コンボ=帯 130×28(監査 C-2)
  'bounty:bm-combo2-windup': 'band',
  'bounty:bm-combo3-windup': 'band',
  'bounty:bm-combo1-recover': 'body',
  'bounty:bm-combo2-recover': 'body',
  'bounty:bm-combo3-recover': 'body',
  // ★懲罰狙撃=**紫=カウンター不可**(社長裁定 v0.25.3591「狙撃は避けるだけの技にしようかな」)。
  // 予告(帯900×40)は紫で描く=色文法v0.25.2961(赤=カウンター可 / 紫=不可)。溜め中は成立しない。
  'bounty:bm-snipe-windup': 'none',
  'bounty:bm-snipe-recover': 'body',      // 硬直は従来どおり(避け切った後のパニッシュ窓)
  // ---- 賞金首 鋏(bounty-balance) ----
  'bounty:bb-sweep-windup': 'band',       // 薙ぎ払い=帯 250×40(監査 C-3)
  'bounty:bb-sweep-recover': 'body',
  'bounty:bb-triple1-windup': 'band',     // 薙ぎ3連発=帯 200×30(監査 C-4)
  'bounty:bb-triple2-windup': 'band',
  'bounty:bb-triple3-windup': 'band',
  'bounty:bb-triple1-recover': 'body',
  'bounty:bb-triple2-recover': 'body',
  'bounty:bb-quickshot-windup': 'body',   // 高速弾=弾(赤い図形なし)。弾自体は弾反射で返せる
  'bounty:bb-quickshot-recover': 'body',
  'bounty:leap-windup': 'circle',         // 跳びかかり=着地円 r=110(監査 B-4)
  'bounty:leap-recover': 'body',
  // ---- 賞金首 舞妓(bounty-maiko) ----
  'bounty:mk-naginata-windup': 'band',    // 毬の薙ぎ=帯 140×30(v0.25.3585)
  'bounty:mk-naginata1-windup': 'band',
  'bounty:mk-naginata2-windup': 'band',
  'bounty:mk-naginata-recover': 'body',
  'bounty:mk-naginata1-recover': 'body',
  'bounty:mk-naginata2-recover': 'body',
  'bounty:mk-spin-windup': 'circle',      // 毬回し=自分中心円 r=180(v0.25.3585)
  'bounty:mk-spin': 'circle',
  'bounty:mk-spin-recover': 'body',
  'bounty:mk-suiu-windup': 'body',        // 乱舞の入り(ホップ前=まだ着地円が無い)
  'bounty:mk-suiu-hop1': 'circle',        // 水鳥乱舞=現在ホップの着地円(v0.25.3585)
  'bounty:mk-suiu-hop2': 'circle',
  'bounty:mk-suiu-hop3': 'circle',        // 最終段だけ大円(finalRadiusMult)
  'bounty:mk-suiu-recover': 'body',
  'bounty:mk-boom-windup': 'body',        // 手毬打ちの溜め(毬はまだ手元)
  'bounty:mk-boom-out': 'circle',         // 飛んでいる毬の円 r=30(監査 A-5「打ち返す」)
  'bounty:mk-boom-back': 'circle',
  'bounty:mk-boom-recover': 'body',

  // ---- 守護霊ボス「幻影」(research/GHOST_BOSS.md) ----
  // ★v6で `gp:*` の宣言は**全撤去**した。裁定「予告無し・全て同じ」により幻影の攻撃は
  // プレイヤーと同じ即発(windup/recover が存在しない)=**取る対象が無い**ので、
  // カウンターは幻影には成立しない(仕様)。弾の打ち返しだけは共通の赤い二重丸で従来どおり効く。

  // ---- 裏ボス4体(useGameLoop.ts) ----
  'hidden:aim-burst': 'body',             // 弾3連=弾(赤い図形なし。走り込んで体で取るのが設計意図)
  'hidden:aim-radial': 'body',
  'hidden:dash-windup': 'body',           // 突進=流星ライン(実行中 'dash' に接触で取れる)
  'hidden:dash': 'body',
  'hidden:dash-recover': 'body',
  'hidden:laser-windup': 'body',          // レーザーは紫だが「発射直前だけ体当てで壊せる」専用機構(§6.33)
  'hidden:laser-recover': 'body',
  'hidden:bite-windup': 'circle',         // ミーミル 群体の噛みつき=自分中心円 r=216(監査 B-3)
  'hidden:bite-recover': 'body',
  'hidden:coil-windup': 'band',           // ヨルムンガルド うねり=帯 310×40(監査 B-2)
  'hidden:coil-recover': 'body',
  'hidden:cage-windup': 'body',           // 氷結の檻=設置系(§5「要裁定」なので触らない)
  'hidden:cage-recover': 'body',
  'hidden:burst-recover': 'body',
  'hidden:radial-recover': 'body',
  'hidden:skadi-ice-recover': 'body',
  'hidden:skadi-blade-recover': 'body',
  // ---- トール(★v0.25.3780・research/THOR_ISSEN_REWORK.md §8-2) ----
  // 社長裁定「赤いのにカウンターできないは聞くまでもなく直すでしょ」。トールだけは
  // `hiddenBossCounterableNow` が `boss.type !== 'thor'` で**この表を素通り**しており、
  // 溜め中は「体の重なり」でしか成立しなかった(=赤い帯の中に居ても取れない)。
  // 除外を撤去して他ボスと同じ宣言表に乗せ、**赤い予告の図形=成立域**へ揃える。
  'hidden:issen-nihil': 'none',           // ★紫=無の境地。円の中でも体が重なっても成立しない(§1-1)
  // 寸法の書き方は「長さ×**全幅**(半幅N)」で統一する(v0.25.3784: 旧コメントは 310×80 で、
  // halfWidth=80 の意味だったが「全幅80」と誤読できた)。
  'hidden:issen-windup': 'band',          // 一閃=帯 310×160(半幅80。ロック済みの aiFrom→aiTarget)
  'hidden:issen-recover': 'body',
  'hidden:tsuki-windup': 'band',          // 突き=帯 300×30(半幅15。**毎フレーム引き直す**=遅延追従する狙い)
  'hidden:tsuki-recover': 'body',
  'hidden:harai-windup': 'band',          // 払い=帯 310×80(半幅40。ロック済みの並行ライン)
  'hidden:harai-recover': 'body',
  // ★飛び掛かり=**着地円を足した**(★v0.25.3810 で `'body'` → `'circle'`。v0.25.3812 で
  // `'circle-or-body'` へ訂正・§9-12)。社長の包括裁定(§8-2)「赤いのにカウンターできないは
  // **聞くまでもなく**直すでしょ」に該当する件——赤い塗り(`0xff2a2a`)+赤い縁の着地円を描いている
  // (`pixiScene.ts` の `showLandingCircle`)のに、宣言だけ `'body'`=体に当てないと取れなかった。
  // **円でも取れるようになった(体当ての経路はそのまま)**=赤い円を成立域へ**足した**。
  // ※v0.25.3810 の `'circle'` は**置換**で、円と体は包含関係にない別集合なので「体当てで取る」経路を
  //   消していた(着地点はヘイト次第で守護霊の足元にロックされるため、実害があった)。
  // 円の式は同じ着地円を持つラフィ('rafi:jump-windup')・賞金首('bounty:leap-windup')と同型
  // (中心=ロック済みの着地点 `aiTarget` / 半径=`HB_TH.jump.radius`。新しい数字は作っていない)。
  // ★`?thorscript=0`(台本OFF)は着地点がロックされておらず赤い円も描かれないので `'body'` へ落ちる
  //  (`ctx.landingLocked`。§5-8)。
  'hidden:jump-windup': 'circle-or-body',
  'hidden:jump-recover': 'body',
  // ★突進の溜め=**赤い流星ラインを描いているのに、線の上では取れず体に当てないと取れない**。
  // 裏ボスdash/ミゲル踏み込みと同型(全突進が 'body')という理由で据え置いているが、これは
  // **トール2「赤いのにカウンターできない」と同じクラスの件**= **§9-3 で社長裁定待ち**
  // (推薦は 'body' 据え置き側だが、**結論として読まないこと**)。
  'hidden:thor-dash-windup': 'body',
  // ★v0.25.3785(検収監査 中H): 走り(thor-dash-move)も表へ載せた。裏ボスの突進は実行中の州('dash')が
  // 載っているのに、トールの走りだけが表の外で生の rectsOverlap で解決されていた=§5-2の狙い
  // (トールも他ボスと同じ表へ乗せる)から外れる唯一の州だった。宣言は裏ボス 'hidden:dash' と同じ 'body'
  // (流星ラインは判定を持つ図形ではない=判定は突進の体そのもの)なので**成立域は1pxも変わらない**。
  'hidden:thor-dash-move': 'body',
  'hidden:thor-dash-recover': 'body',

  // ---- 天使(州名が6体で衝突するので boss.type をキーにする) ----
  'rafi:sweep': 'band',                   // ラフィ 薙ぎ=帯 310×40(監査 B-6。ミゲル/ウリ/スリィエルと同型)
  'rafi:jump-windup': 'circle',           // ラフィ 跳びかかり=着地円 r=70(監査 B-5)
  'acrasiel:warp-in': 'circle',           // アクラシエル 転移衝撃=赤円(監査 A-4。従来は分岐が無かった)

  // ---- idol(idolTick.ts) ----
  'idol:idol-punch-windup': 'band',       // 拳=帯 90×30(監査 C-5。毎フレーム今のプレイヤー方向へ引き直す帯)
  'idol:idol-punch-recover': 'body',
  // ★狙撃=**紫=カウンター不可**(馬乗りの懲罰狙撃と同じ裁定・同じ輸入元)。
  'idol:idol-snipe-windup': 'none',
  'idol:idol-snipe-recover': 'body',
  'idol:idol-rest': 'body',
  // 残りのidolの技(連射/扇/追尾弾/離脱ロール/手榴弾/射撃8枠)は**赤い図形を持たない**=体の重なりのまま。
  // 弾は弾反射で返せる/ロールは移動/手榴弾は転がる物。密着してターンを奪うのがidolの設計意図(§6.28-20)。
  'idol:idol-aim-windup': 'body', 'idol:idol-aim-recover': 'body',
  'idol:idol-fan-windup': 'body', 'idol:idol-fan-recover': 'body',
  'idol:idol-roll-windup': 'body', 'idol:idol-roll-recover': 'body',
  'idol:idol-orb-windup': 'body', 'idol:idol-orb-recover': 'body',
  'idol:idol-nade-windup': 'body', 'idol:idol-nade-recover': 'body',
  'idol:idol-s1-windup': 'body', 'idol:idol-s1-recover': 'body',
  'idol:idol-s2-windup': 'body', 'idol:idol-s2-recover': 'body',
  'idol:idol-s3-windup': 'body', 'idol:idol-s3-recover': 'body',
  'idol:idol-s4-windup': 'body', 'idol:idol-s4-recover': 'body',
  'idol:idol-s5-windup': 'body', 'idol:idol-s5-recover': 'body',
  'idol:idol-s6-windup': 'body', 'idol:idol-s6-recover': 'body',
  'idol:idol-s7-windup': 'body', 'idol:idol-s7-recover': 'body',
  'idol:idol-s8-windup': 'body', 'idol:idol-s8-recover': 'body',
};

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
export const shouldSkipBossContactParry = (
  enemyType: string, bossState: string | undefined,
): boolean => enemyType === 'thor' && bossState === 'thor-dash-move';

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
