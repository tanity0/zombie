// サブウェポン「格闘」の純関数(research/BRAWLER.md)。判定・時計・状態機械はここ1本。store / pixi は読むだけ。
// 描画も store も import しない(renderer-agnostic)。時計は gameTime(一時停止・会話・アテンションで止まる)。
import type { Enemy } from '../types/game';
import type { Rect } from '../world/obstacles';
import { segmentBlocked } from '../world/obstacles';
import { enemyRangeRect, isCorpse, isReaperFamily, isTerminalReaper, isUntouchable } from './enemyUtils';
import { urlNum } from './urlNum';
import { meleeImpactPoint, bandBoxOverlap } from './meleeImpact';
import { leverGuardStandAlpha, leverGuardArmOffset } from './brawlerLeverGuard';

// ---------------------------------------------------------------------------------------------
// ★テンポ係数(社長承認2026-11-08「KOFみたいなプレイフィールが欲しいんだけど、少し全体的に早い?」)。
// 格闘の時間(段・技の出だしと戻り・飛び蹴りの飛ぶ時間と連続の受付・5段目の溜めと突き抜けと戻り・つながりの受付・
// 先行入力の窓・ステップ・秘奥義の起動/間隔/落下/着地/条件の間・反撃の溜め・固まり・浮き)を**すべてこの係数で伸ばす**。
// 移動距離・当たり判定・倍率・ポイントは変えない(時間だけ)。当てた瞬間の止め(ヒットストップ)は係数を掛けない別の表。
// 実機のつまみ: `?brtempo=1.0` 等(既定 1.3)。値は下の `*_BASE`(=係数1.0の今までの値)× 係数を四捨五入。
// 時間の欄は `export let`(live binding)で、`setBrawlerTempo` が書き直す(テストは明示の係数で書くため)。
// ---------------------------------------------------------------------------------------------
export const BRAWLER_TEMPO_DEFAULT = 1.3;
const BRAWLER_TEMPO_SEARCH = typeof window === 'undefined' ? '' : window.location.search;
/** いまの係数(`setBrawlerTempo` が書き換える)。 */
export let BRAWLER_TEMPO = BRAWLER_TEMPO_DEFAULT;
/** 係数を掛けた時間(ms・四捨五入)。 */
export const brawlerTempoMs = (ms: number, tempo: number = BRAWLER_TEMPO): number => Math.round(ms * tempo);

// ---------------------------------------------------------------------------------------------
// 段の表(§2-2・叩き台)と技の表(§8-3)
// ---------------------------------------------------------------------------------------------
export type BrawlerKb = 'none' | 'small' | 'normal' | 'big';
/** 押さなかった段(1・2・4段目)の小さな押し(今の近接の何倍か)。社長指示2026-11-10「どの攻撃も押さない攻撃でも多少押そう。少しずつズレた方が楽しい」。免疫は張らない(張ると次の段が押せない)。 */
export const BRAWLER_SMALL_KB_MULT = 0.35;
/** ボス級は小さい押しのさらに何倍か(3段目の普通の押しも、ボス級にはこの小さい押しで当てる)。 */
export const BRAWLER_BOSS_SMALL_KB_MULT = 0.5;
export type BrawlerShape = 'single' | 'fist' | 'landing' | 'band';
export interface BrawlerStageSpec {
  stage: 1 | 2 | 3 | 4 | 5;
  /** 前隙(出るまで・ms)。4段目は跳んでいる間。 */
  windupMs: number;
  /** 戻り(ms)。 */
  recoveryMs: number;
  /** ダメージ(近接の基準の倍率)。体勢値の削りにも同じ倍率を掛ける(§8-1)。 */
  mult: number;
  kb: BrawlerKb;
  /** 当てた時のプレイヤー側の止め(ms)=止めが効く敵の止め・震えの長さ(§2-4・§7-3)。 */
  hitstopMs: number;
  shape: BrawlerShape;
  /**
   * 拳鬼(敵側・utils/phantomBrawlerTick)の頭の詰めの最大距離(px)。0=その場。★プレイヤーは読まない(プレイヤーは下の lungePx)。
   * research/BRAWLER.md §31(社長裁定2026-11-12)でプレイヤーの踏み込みだけを作り直した=敵側の挙動は変えないため、旧の値をここに残す。
   */
  dashPx: number;
  /**
   * ★プレイヤーの踏み込み(px・research/BRAWLER.md §31)。出した瞬間の相手へ向かって、この距離まで(相手の縁の手前 BRAWLER_STANDOFF_PX で止まる)
   * 前隙の間に進む。相手が遠ければこの距離だけ進んで空振りする。途中で取り直さない。0=その場。
   */
  lungePx: number;
  /** kb が 'big' の時の押しの勢い(今の近接の何倍か)。無ければ BRAWLER_BIG_KB_MULT(4倍)。段ごとに持つ(§16)。 */
  kbMult?: number;
}
/**
 * ★当てた瞬間の止め(ヒットストップ・ms)。テンポ係数は掛けない(社長承認2026-11-08「当てた瞬間の止めを長く」)。
 * 弱(1・2段目)/ 強・技(3・4段目・飛び蹴り1・2発目)/ 締め(5段目・飛び蹴り3発目・大踏み潰し・秘奥義の締め)。
 * 旧: 弱45 / 3段目80 / 4段目90 / 蹴り1・2発目80 / 締め140 / 秘奥義の締め160。
 */
export const BRAWLER_HITSTOP = { weak: 90, strong: 150, closer: 220 } as const;
// ↑2026-11-12 に 167/253 へ伸ばしたが、社長の意図は画面全体の止めだったので戻した(つながりの計算に使う値=90/150/220 のまま)。
/**
 * ★当たった瞬間の「画面全体の止め」の長さ(ms・壁時計・テンポ係数は掛けない)。社長指示2026-11-12「格闘の技が当たった時のストップ時間を少し長く」
 * (=画面全体が止まる方)。格闘の当たった技すべて(1〜5段・飛び蹴り3連・踵落とし・大踏み潰し・秘奥義の締め)で、自分と相手だけの止め
 * (BRAWLER_HITSTOP)の代わりに画面全体を止める(triggerHitstop)。全体が止まっている間は gameTime も進まないので、つながり・固まり・
 * 入力の間隔はこの長さに影響されない(自分の止めと固まりの式の止めは 0 にする)。四神舞の最中は今どおり自分と相手だけの止め。
 * 気功は弾なので止めなし(今どおり)。
 */
export const BRAWLER_WORLD_STOP = { weak: 110, strong: 180, closer: 260 } as const;
/**
 * ★飛び蹴りの3発目(蹴り飛ばし)の当たりの画面全体の止め(ms・壁時計・テンポ係数は掛けない)。research/BRAWLER.md §33-2「締めの重さは止めで出す」
 * (社長裁定2026-11-12・叩き台)。溜めをなくした代わりに、締めの重さを止めで出す。踵落とし・ほかの締めの止めは BRAWLER_WORLD_STOP.closer のまま。
 */
export const BRAWLER_WORLD_STOP_KICK3 = 340;
/**
 * 画面全体を止める当たりで残す、自分の止め(1ms)と固まりの式の止め(8ms=半フレーム)。gameTime(全体の止めの間は進まない)。
 * 自分の止め 1ms=全体の止めの最中に押した入力を今どおり覚えて、止めが明けた最初のフレームで出すため(0 だとその場で出てしまう)。
 * 固まりの 8ms=その「最初のフレーム」までの遅れ(1フレーム)と、今の止めの明けの遅れ(フレームの境目まで平均で半フレーム)の差を埋める。
 * 実際の AI で動かすつながりのテスト(brawlerLink.store.test.ts)で 6〜10ms の間なら判定が全部今どおり(2〜5 は1つ切れる・16 は入らない物が1つ入る)。
 */
export const BRAWLER_WORLD_STOP_SELF_MS = 1;
export const BRAWLER_WORLD_STOP_LOCK_MS = 8;
/** 自分と相手だけの止め(BRAWLER_HITSTOP の値)から、同じ強さの画面全体の止めの長さを引く。0 は 0。 */
export const brawlerWorldStopMs = (hitstopMs: number): number =>
  hitstopMs <= 0 ? 0
    : hitstopMs >= BRAWLER_HITSTOP.closer ? BRAWLER_WORLD_STOP.closer
      : hitstopMs >= BRAWLER_HITSTOP.strong ? BRAWLER_WORLD_STOP.strong
        : BRAWLER_WORLD_STOP.weak;
/** 5段目の掌底の押しの勢い(今の近接の何倍か)。社長指示2026-11-09「流石に敵が吹き飛びすぎ」で 4→2(約150px→約75px・§16)。大踏み潰し・飛び蹴り3発目・秘奥義の締めは BRAWLER_BIG_KB_MULT(4)のまま。 */
export const BRAWLER_PALM_KB_MULT = 2;
/**
 * ★プレイヤーの基本技の踏み込み(px・research/BRAWLER.md §31「決まった距離を、出した瞬間の向きへ」・社長裁定2026-11-12)。
 * 旧: 弱60(1・2段目)・強60(3段目)・4段目50(+跳んでいる途中の取り直し最大90)。上限の目安: 弱45・強60・4段目70(§31-2)。
 * 決め方: 押しの距離は今のまま。上限以下で、前の技の押しを詰め切る値(弱≥5・強≥5・4段目≥38)以上。値は設計側の決定(2026-11-12・一番短い 5/5/5/38 では前に出ないため)。
 * 道の表の全部のつなぎが雑魚に「しっかりやれば繋がる」(余裕8px以上)ことはテストで確かめる。
 * 固定するテスト= utils/brawlerReach.test.ts(全部のつなぎ)・store/brawlerReach.store.test.ts(実際に回す)。
 * 飛び蹴り(1〜3発目・踵落とし)の飛ぶ距離は今のまま(出した瞬間の相手の手前まで・最大 BRAWLER_KICK_RANGE)。5段目の突き抜けは対象外(0)。
 */
export const BRAWLER_LUNGE_PX = { s1: 22, s2: 22, s3: 32, s4: 50 } as const;
/** 段の表の係数1.0の値(今までの値)。止めは BRAWLER_HITSTOP。 */
export const BRAWLER_STAGES_BASE: readonly BrawlerStageSpec[] = [
  { stage: 1, windupMs: 60, recoveryMs: 140, mult: 0.30, kb: 'small', hitstopMs: BRAWLER_HITSTOP.weak, shape: 'single', dashPx: 60, lungePx: BRAWLER_LUNGE_PX.s1 },
  { stage: 2, windupMs: 60, recoveryMs: 140, mult: 0.40, kb: 'small', hitstopMs: BRAWLER_HITSTOP.weak, shape: 'single', dashPx: 60, lungePx: BRAWLER_LUNGE_PX.s2 },
  { stage: 3, windupMs: 120, recoveryMs: 230, mult: 0.8, kb: 'normal', hitstopMs: BRAWLER_HITSTOP.strong, shape: 'fist', dashPx: 60, lungePx: BRAWLER_LUNGE_PX.s3 },
  { stage: 4, windupMs: 250, recoveryMs: 200, mult: 1.10, kb: 'small', hitstopMs: BRAWLER_HITSTOP.strong, shape: 'landing', dashPx: 50, lungePx: BRAWLER_LUNGE_PX.s4 },
  // 5段目=一閃型の貫通突進(社長指示2026-11-07)。前隙 250 = 溜め 100 + 突き抜け 150。判定は抜け切った瞬間に軌跡の帯で一括(§9-26)。
  // 社長指示2026-11-07「飛距離少しだけ短く」で突き抜け 160→140px・150→130ms(最高速は同じ)。総尺 500 は戻り 270 で保つ(§9-35)。
  // 社長指示2026-11-11「5段目の隙を少しだけ伸ばして」で戻り 270→320(係数1.3で 351→416ms)。前隙・威力・飛距離は変えていない。
  { stage: 5, windupMs: 230, recoveryMs: 320, mult: 1.60, kb: 'big', hitstopMs: BRAWLER_HITSTOP.closer, shape: 'band', dashPx: 0, lungePx: 0, kbMult: BRAWLER_PALM_KB_MULT }, // 押した瞬間の詰めは無し(溜めの後に突き抜ける)
];
/** 段の表(係数を掛けた出だし・戻り)。 */
export let BRAWLER_STAGES: readonly BrawlerStageSpec[] = BRAWLER_STAGES_BASE;
export const brawlerStageSpec = (stage: number): BrawlerStageSpec =>
  BRAWLER_STAGES[Math.max(1, Math.min(5, Math.round(stage))) - 1];

export type { BrawlerTechKind } from './brawlerTypes';
import type { BrawlerState, BrawlerTechKind, BrawlerSecret, BrawlerSecretMove, BrawlerRouteNode, BrawlerMoveKey } from './brawlerTypes';
export type { BrawlerRouteNode, BrawlerMoveKey } from './brawlerTypes';
export interface BrawlerTechSpec {
  kind: BrawlerTechKind;
  cost: number;
  windupMs: number;
  recoveryMs: number;
}
/** 技の表の係数1.0の値(今までの値)。 */
export const BRAWLER_TECHS_BASE: Readonly<Record<BrawlerTechKind, BrawlerTechSpec>> = {
  guard: { kind: 'guard', cost: 3, windupMs: 0, recoveryMs: 1000 }, // 社長指示2026-11-07「カウンターは3ポイントに変更」(旧5)
  stomp: { kind: 'stomp', cost: 5, windupMs: 200, recoveryMs: 462 }, // 社長指示2026-11-11「大踏み潰し2.5倍にして、後隙を600に」=係数1.3で 601ms(旧 400→520ms)
  kiko: { kind: 'kiko', cost: 2, windupMs: 120, recoveryMs: 330 },
  kick: { kind: 'kick', cost: 1, windupMs: 132, recoveryMs: 165 }, // 社長指示2026-11-11『飛び蹴りからの3段、ほんの少しだけゆっくりに』で ×1.1(旧 windupMs 120 / recoveryMs 150)
};
/** 技の表(係数を掛けた出だし・戻り)。 */
export let BRAWLER_TECHS: Readonly<Record<BrawlerTechKind, BrawlerTechSpec>> = BRAWLER_TECHS_BASE;
export const brawlerActionTotalMs = (windupMs: number, recoveryMs: number): number => windupMs + recoveryMs;

// ---------------------------------------------------------------------------------------------
// ★技ごとの固まり(research/BRAWLER.md §20-2・社長指示2026-11-11「隙とか速さとかのフレーム都合でつながらない、みたいな組み方にしたい」)。
// 固まり=当たりの止めが明けてから、相手が動けない長さ。係数1.0の値で持ち、テンポ係数(BRAWLER_TEMPO)を掛けて live binding にする。
// つながるかどうかはこの数字と、技の出だし・後隙・距離で決まる(「この組はつながる」という手書きの表は持たない)。
// ---------------------------------------------------------------------------------------------
/** 固まりを持つ(または持たない=0)技の名札。秘奥義の9連撃は確定の固まりの規則の外。 */
export type BrawlerHoldKey = Exclude<BrawlerMoveKey, 'secret' | 'secret-land'>;
/** 固まりの表の係数1.0の値(ms)。0=締め・気功(固めない)。 */
export const BRAWLER_HOLD_BASE_MS: Readonly<Record<BrawlerHoldKey, number>> = {
  s1: 300, s2: 300, s3: 520, s4: 470, s5: 0,
  kick1: 265, kick2: 310, // kick1: 社長指示2026-11-11『飛び蹴りからの3段、ほんの少しだけゆっくりに』で蹴りを遅くした分、1発目→後隙の後の1段目のつながりを保つため 250→265
  kick3: 0, heel: 300, // 踵落とし(§29): 叩きつけた相手は少し固まる=大踏み潰しへの取り消しが届く(叩き台)
  kickup: 310, // 蹴り上げ(§34-1・§34-8): 飛び蹴りの2発目と同じ(空中追撃=気功へ取り消せる・叩き台)
  suplex: 0, // スープレックス(§34-3): 締め=固めない
  stomp: 230, kiko: 0,
  mogura: 310, // 土竜(§35): 浮かせた相手=蹴り上げと同じ(空中追撃=飛び蹴り・気功へ取り消せる・叩き台)
};
/** 固まりの表(係数を掛けた実ms)。setBrawlerTempo が書き直す。 */
export let BRAWLER_HOLD_MS: Readonly<Record<BrawlerHoldKey, number>> = BRAWLER_HOLD_BASE_MS;

/** 技ポイントの上限(§2-5: Lv1=5 / Lv2=10 / Lv3=20)。 */
export const BRAWLER_POINT_CAP_BY_LEVEL = [0, 5, 10, 20] as const;
export const brawlerPointCap = (level: number): number =>
  BRAWLER_POINT_CAP_BY_LEVEL[Math.max(1, Math.min(3, Math.round(level)))];

// 細かい数値(§2・§3・§7)
export let BRAWLER_CHAIN_RESET_MS = 400; // ×BRAWLER_TEMPO(係数1.0の値)   // 最後に当ててから押さなければ1段目へ(§2-4)
export let BRAWLER_WHIFF_BUFFER_MS = 150; // ×BRAWLER_TEMPO(係数1.0の値)  // 空振りの段は戻りの終わり 150ms 前から先行入力を受ける(§2-1)
/**
 * ★取り消しの受付(research/BRAWLER.md §19-2・社長承認2026-11-10「KOFの案は はい」)。当たりの止めが明けた瞬間からこの間だけ、
 * 道の先(brawlerRouteAllows)の技で後隙を取り消せる。過ぎたら後隙が終わるまで何も出せない。係数1.0で150ms(×1.3=195ms)。
 */
export let BRAWLER_CANCEL_WINDOW_MS = 150; // ×BRAWLER_TEMPO(係数1.0の値)
export const BRAWLER_FIST_RADIUS = 28;       // 3段目の拳の周り(§2-2)
export const BRAWLER_LANDING_RADIUS = 70;    // 4段目の着地点の円(§2-2)
export const BRAWLER_BAND_LEN = 160;         // 5段目の帯(§2-2)
export const BRAWLER_BAND_HALF_W = 22;       // 幅44の半分
/** 5段目の掌の最低の届き(px・§9-75): 突き抜けが壁で止まって通った長さが0でも、体1つ分(自機の当たり判定の幅)は前に出る。箱で測る時だけ使う。 */
export const BRAWLER_PALM_MIN_REACH_PX = 28;
/** 5段目の突き抜け(§2-2・§9-26): 溜め→帯の長さぶん加速して抜ける。溜め = 前隙 − 突き抜け。 */
export let BRAWLER_PALM_DASH_MS = 130; // ×BRAWLER_TEMPO(係数1.0の値)
export const BRAWLER_PALM_PASS_PX = 140;
/** 抜けた先の減速(止めが明けた後に滑って止まる距離と尺)。 */
export const BRAWLER_PALM_SETTLE_PX = 22;
export let BRAWLER_PALM_SETTLE_MS = 120; // ×BRAWLER_TEMPO(係数1.0の値)
/** 吹き飛ばしの向き: 軌跡から横へ外向き+進む向きへ少し(抜けた後ろで左右へ割れる)。 */
export const BRAWLER_PALM_KB_FORWARD = 0.4;
export const BRAWLER_JUMP_VIS_PX = 48;       // 4段目の見た目の跳ぶ高さ(判定は地面のまま・§2-3)
export let BRAWLER_LIFT_MS = 585; // ×BRAWLER_TEMPO(係数1.0の値)          // 4段目の浮かせの足止め(§7-10)。社長承認2026-11-08: 450→585(1.3倍・落下を緩やかに=§12-1)
export const BRAWLER_LIFT_VIS_PX = 26;       // 浮かせの絵の高さ(§7-10)。★§12-1(社長承認2026-11-09)からは下の体の高さの割合で描く(この値は旧の基準として残す)
/** ★浮く絵の高さ(research/BRAWLER.md §12-1・社長承認2026-11-09): 高さの倍率1(4段目の頂点)= 敵の絵の箱の高さ×これ(旧 26px×高さ/110 ≒ 0.24)。大きめ・実機で絞る前提。 */
export const BRAWLER_LIFT_VIS_BODY_K = 0.6; // 社長指示2026-11-15「敵もう少し浮いて欲しい」(旧 0.45)
/** 巨大な敵の上限: 見えている画面の縦×これ(world px)。 */
export const BRAWLER_LIFT_VIS_MAX_VIEW_FRAC = 0.25; // 2026-11-15 BODY_K 0.45→0.6 に合わせて 0.2→0.25(上限に当たる大きい敵=ミーミル等も同じくらい高くなるように)
export const BRAWLER_STOMP_RADIUS = 150;     // 下の大踏み潰し(§3-3)
export const BRAWLER_STOMP_MULT = 2.3; // 社長指示2026-11-12『叩き潰しが強すぎる。0.5 落として』(旧 2.8。その前は 2.5)。それ以前: 社長指示2026-11-11「ごめん、大叩き潰しは2.8倍で。」(同日 3.5→2.5→2.8)。それ以前: // 社長裁定2026-11-11「3;上げる」で 2.4→3.5(技ポイントが一番高い技の見返り)。旧: 2026-11-09 に 2.0→2.4
/**
 * ★大踏み潰しは出した高さで威力が上がる(社長指示2026-11-16「大叩き潰しは、発動した高さでダメージ倍率が上がる。」)。
 * 倍率 = 1 + K × (高さ ÷ REF)、上限 MAX。BRAWLER_STOMP_MULT の上に掛ける(ダメージだけ・体勢値の倍率は今どおり)。
 * 高さ=出だしの空中の高さ(stompFromPx=踵落としから取り消した時の姿勢の jump。絵と同じ純関数 brawlerPoseAt から出る)。地上(0)は ×1=今と同じ。
 * 叩き台(2026-11-16): K=0.5・REF=60px・MAX=2.0(=高さ120pxで頭打ち)。
 */
export const BRAWLER_STOMP_AIR_K = 0.5;
export const BRAWLER_STOMP_AIR_REF_PX = 60;
export const BRAWLER_STOMP_AIR_MULT_MAX = 2.0;
export const brawlerStompAirMult = (heightPx: number | undefined): number => {
  const h = heightPx !== undefined && Number.isFinite(heightPx) ? Math.max(0, heightPx) : 0;
  if (h <= 0) return 1;
  return Math.min(BRAWLER_STOMP_AIR_MULT_MAX, 1 + BRAWLER_STOMP_AIR_K * (h / BRAWLER_STOMP_AIR_REF_PX));
};
export const BRAWLER_STOMP_HITSTOP_MS = BRAWLER_HITSTOP.closer; // 締めの止め(§9-2・社長承認2026-11-08 で 140→220)
export const BRAWLER_KIKO_SPEED = 900;       // 左の気功(§3-4)
export const BRAWLER_KIKO_RANGE = 420;
export const BRAWLER_KIKO_RADIUS = 70;
export const BRAWLER_KIKO_MULT = 1.8; // 社長承認2026-11-09 で 1.5→1.8(爆発の規約 skillExplosionMult は今どおりこの上に掛かる)
export const BRAWLER_KIKO_HIT_PAD = 12;
/**
 * 気功の爆発の押し(社長承認2026-11-07・§9-40)。爆発の既存の規約どおり knockbackEnemy で押す(攻撃中の敵は押さない・ボス級は止めの減衰)。
 * 距離の減衰は処刑と同じ blastKbFalloff(爆心1.6倍〜縁0.35倍)。基準距離 × 倍率 = 爆心で雑魚 約60px・縁で約15px の目安。
 */
export const BRAWLER_KIKO_KB_PX = 37;      // 弾の当たりの半径(体の帯の縁からの距離)
// 右の飛び蹴り(§3-5)。社長指示2026-11-07「飛び蹴りもう少し飛距離伸ばして」で 160→220 / 100→150(約1.4倍)。
export const BRAWLER_KICK_RANGE = 220;
export const BRAWLER_KICK_NO_TARGET_PX = 150;
/** 飛ぶ時間: 旧の届く距離(160)までは前隙どおり 132ms、その先は距離に合わせて最大 165ms まで伸ばす(係数1.0の値。2026-11-11 に ×1.1=旧 120/150。距離の 160 は変えない)。 */
export let BRAWLER_KICK_FLIGHT_MAX_MS = 165; // ×BRAWLER_TEMPO(係数1.0の値)・社長指示2026-11-11『飛び蹴りからの3段、ほんの少しだけゆっくりに』で ×1.1(旧150)
export const brawlerKickFlightMs = (dist: number): number =>
  Math.max(BRAWLER_TECHS.kick.windupMs, Math.min(BRAWLER_KICK_FLIGHT_MAX_MS, BRAWLER_TECHS.kick.windupMs * Math.max(0, dist) / 160));
/** 飛び蹴りの倍率(何発目か=1..3)。社長承認2026-11-09 で 0.7/0.7/0.7 → 0.7/0.8/1.0。秘奥義の9連撃の蹴りは3発目扱い(締めの止め・big の押しと同じ)。 */
export const BRAWLER_KICK_MULTS = [0, 0.7, 0.8, 1.2] as const; // 3発目 1.0→1.2(社長指示2026-11-11「威力も少し上げて」)
/** ★飛び蹴りの3発目の押しの強さ(普通のノックバックの何倍か)。社長指示2026-11-11「3段目の飛び蹴りはもう少し敵を吹き飛ばして」で 1→1.8。吹き飛ばし(big=4)ではない=ボス級の扱い・固まりの決まりは普通の押しのまま。 */
export const BRAWLER_KICK3_KB_POWER = 1.8;
/** 飛び蹴りの後隙のうち、体がしゃがみの絵に替わる所(0..1)。蹴りの影もここまでに消し切る(体の絵と影が同じ値を読む)。 */
export const BRAWLER_KICK_CROUCH_AT = 0.1;
/** ★飛び蹴りの3発目の後隙の倍率(社長指示2026-11-11「技後の隙も少し伸ばして」)。1・2発目は今どおり。 */
export const BRAWLER_KICK3_RECOVERY_MULT = 1.7; // 社長指示2026-11-11「蹴り飛ばし、踵落としの隙少しだけ延長」で 1.4→1.7(係数1.3で 273→332ms)
export const brawlerKickMult = (kickN: number): number => BRAWLER_KICK_MULTS[Math.max(1, Math.min(3, Math.round(kickN)))];
export let BRAWLER_KICK_CHAIN_MS = 500; // ×BRAWLER_TEMPO(係数1.0の値)
export const BRAWLER_KICK_MAX = 3;
/**
 * ★踵落とし(3発目の派生)の溜め(社長承認2026-11-08「飛び蹴りの3発目も少し溜めてから蹴る」)。蹴りに入る前に空中で体が光って沈む。
 * 実時間で約150ms(係数を掛けた後の値)=係数1.0の値は 150/1.3 を丸めた 115。前隙(windupMs)はこの溜め+飛ぶ時間。
 * ★蹴り飛ばし(踵落としでない3発目)は溜め無し(research/BRAWLER.md §33-2・社長裁定2026-11-12「ポン・ポン・ドン」)。
 *  幻影(孫悟空)の3発目は今どおりこの溜めを使う(utils/phantomBrawlerTick・敵の側は変えない)。
 */
export let BRAWLER_KICK3_CHARGE_MS = 127; // ×BRAWLER_TEMPO(係数1.0の値)・社長指示2026-11-11『飛び蹴りからの3段、ほんの少しだけゆっくりに』で ×1.1(旧115)
/** 溜めの見た目: 跳び上がる高さ・沈む量(px・絵だけ)。 */
export const BRAWLER_KICK3_CHARGE_RISE_PX = 24;
export const BRAWLER_KICK3_CHARGE_SINK_PX = 7;
/**
 * ★当たった蹴りの絵で止まる(research/BRAWLER.md §33-2・社長裁定2026-11-12)。画面全体の止めの最中に始めた次の蹴り(store が kickHoldAt を付ける)は、
 * gameTime が始めた時刻のまま(=止めが明けるまで)は、前の蹴りの「当たった瞬間」の絵(脚を伸ばした絵)で描く。絵だけ=判定の時刻・固まりは変えない。
 */
export const brawlerKickHeldInStop = (s: Pick<BrawlerState, 'phase' | 'tech' | 'kickHoldAt' | 'resolved'>, t: number): boolean =>
  s.phase === 'tech' && s.tech === 'kick' && s.kickHoldAt !== undefined && !s.resolved && t <= s.kickHoldAt;
/** 止めの間に描く「前の蹴りの当たった瞬間」の状態(体と影の絵の駆動だけ)。前の蹴り=1つ前の何発目(1・2発目=踵落としではない)。 */
const brawlerKickHoldView = (s: BrawlerState, t: number): BrawlerState => ({
  ...s, kickN: Math.max(1, s.kickN - 1), kickHeel: false, kickUp: false, kickChargeMs: 0, kickHoldAt: undefined,
  startAt: t - s.windupMs, stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: true, connected: true,
});
/** 3発目の溜めの光(0..1・絵だけ)。溜めの間に強まり(easeIn)、飛び出しで速く引く。止めの最中に始めた蹴り(§33-2)は止めが明けるまで光らない。 */
export const brawlerKickChargeGlow = (s: BrawlerState, t: number): number => {
  if (s.phase !== 'tech' || s.tech !== 'kick' || !(s.kickChargeMs && s.kickChargeMs > 0) || s.resolved || brawlerKickHeldInStop(s, t)) return 0;
  const el = brawlerElapsed(s, t);
  const c = el / s.kickChargeMs;
  if (c < 0) return 0;
  if (c < 1) return 0.25 + 0.75 * c * c;
  return Math.max(0, 1 - (el - s.kickChargeMs) / 90);
};
/** 弾を1つ拾った時に増える技ポイント(社長指示2026-11-07「弾を拾っても技ポイントが増える で」。量は暫定=§9-24)。 */
export const BRAWLER_AMMO_PICKUP_POINTS = 1;
export const BRAWLER_KICK_HITSTOP_MS = [0, BRAWLER_HITSTOP.strong, BRAWLER_HITSTOP.strong, BRAWLER_HITSTOP.closer] as const; // 1・2発目=強 / 3発目=締め(社長承認2026-11-08 で 80/80/140→150/150/220)
export let BRAWLER_GUARD_MS = 1000; // ×BRAWLER_TEMPO(係数1.0の値)        // 上の構え(§3-2)
export let BRAWLER_GUARD_QUICK_MS = 500; // ×BRAWLER_TEMPO(係数1.0の値)   // 受けた直後は次の通常攻撃が前隙なし(社長決定 #7)
export const BRAWLER_BIG_KB_MULT = 4;        // 掌底=今の近接の4倍(§2-2)
export const BRAWLER_STANDOFF_PX = 24;       // 詰めの止まる所(相手の帯の縁から)
/** 5ポイント技の出だしの溜め(画面をわずかに暗くする・§3-1)。 */
export let BRAWLER_SUPER_FLASH_MS = 100; // ×BRAWLER_TEMPO(係数1.0の値)
/**
 * 段ごとの音程(1段目→5段目)。等間隔に下げない=段ごとに個別の値(クリエイティブ監査 #7)。
 * swing=振りの風切り / hit=当たりの音(下の注記)。0番は使わない。
 */
export const BRAWLER_SWING_PITCH = [1, 1.1, 1.02, 0.84, 0.8, 0.68] as const;
/**
 * ★当たりの音は専用の素材(社長支給2026-11-11): 1・2段目=パンチ(brawler-punch)/3〜5段目=掌底などの重い打撃(brawler-heavy)。
 * どちらも**少し早回し**(社長指示「パンチSE 少し早くして」「重めの打撃音 少し早めに」)=全段 1.0 より上。段ごとに少しずつ変える(等間隔にしない)。
 * 旧は1本の素材(shot-damage)を段ごとに高さを変えて使い分けていた(1.18〜0.64)。
 */
export const BRAWLER_HIT_PITCH = [1, 1.2, 1.12, 1.16, 1.1, 1.04] as const;
export const BRAWLER_HIT_GAIN = [1, 0.7, 0.75, 0.95, 0.85, 1.1] as const;
/** 格闘の音1つ(store の音の列へ積む形)。 */
export interface BrawlerSfxCue { key: string; gain: number; rate: number }
/** 通常攻撃の当たりの音(段 1..5・jitter=音程の揺らぎ)。プレイヤーの格闘と拳鬼が同じ物を鳴らす。 */
export const brawlerStageHitSfx = (stage: number, jitter = 1, extraGain = 1): BrawlerSfxCue => {
  const st = Math.max(1, Math.min(5, Math.round(stage)));
  return { key: st <= 2 ? 'brawler-punch' : 'brawler-heavy', gain: BRAWLER_HIT_GAIN[st] * extraGain, rate: BRAWLER_HIT_PITCH[st] * jitter };
};
/** 飛び蹴りが当たった音(社長支給2026-11-11)。3発目(big)は少し低く・大きく。 */
export const brawlerKickHitSfx = (big: boolean, jitter = 1): BrawlerSfxCue =>
  ({ key: 'brawler-kick', gain: big ? 1.1 : 0.85, rate: (big ? 0.9 : 1.0) * jitter });
/** 当たりの白い炸裂の大きさ(world px)と尺(ms)。弱は敵の半分以下・短く。大きいのは強・締めだけ(クリエイティブ監査 #1)。 */
export const BRAWLER_SPARK = {
  weak: { size: 54, ms: 200, glow: 22 },
  strong: { size: 118, ms: 300, glow: 34 },
  land: { size: 96, ms: 260, glow: 30 },
  closer: { size: 170, ms: 360, glow: 42 },
  stomp: { size: 150, ms: 340, glow: 40 },
} as const;
/** 格闘の固有色(§4: 彩度を落とした白金。加算の芯は白)。 */
export const BRAWLER_COLOR = '#f1e6c8';
export const BRAWLER_COLOR_HEX = 0xf1e6c8;
export const BRAWLER_RGBA = (a: number): string => `rgba(241,230,200,${a})`;

/** 係数を掛けた時間の一式(純関数)。係数1.0なら今までの値と一致する。 */
export const brawlerTimesAt = (tempo: number) => ({
    stages: BRAWLER_STAGES_BASE.map(st => ({ ...st, windupMs: brawlerTempoMs(st.windupMs, tempo), recoveryMs: brawlerTempoMs(st.recoveryMs, tempo) })),
    techs: Object.fromEntries((Object.keys(BRAWLER_TECHS_BASE) as BrawlerTechKind[]).map(k => [k, {
      ...BRAWLER_TECHS_BASE[k], windupMs: brawlerTempoMs(BRAWLER_TECHS_BASE[k].windupMs, tempo), recoveryMs: brawlerTempoMs(BRAWLER_TECHS_BASE[k].recoveryMs, tempo),
    }])) as Record<BrawlerTechKind, BrawlerTechSpec>,
    holds: Object.fromEntries((Object.keys(BRAWLER_HOLD_BASE_MS) as BrawlerHoldKey[]).map(k => [k, brawlerTempoMs(BRAWLER_HOLD_BASE_MS[k], tempo)])) as Record<BrawlerHoldKey, number>,
    BRAWLER_CHAIN_RESET_MS: brawlerTempoMs(400, tempo),
    BRAWLER_WHIFF_BUFFER_MS: brawlerTempoMs(150, tempo),
    BRAWLER_CANCEL_WINDOW_MS: brawlerTempoMs(150, tempo),
    BRAWLER_PALM_DASH_MS: brawlerTempoMs(130, tempo),
    BRAWLER_PALM_SETTLE_MS: brawlerTempoMs(120, tempo),
    BRAWLER_LIFT_MS: brawlerTempoMs(585, tempo),
    BRAWLER_KICK_FLIGHT_MAX_MS: brawlerTempoMs(165, tempo), // 社長指示2026-11-11『飛び蹴りからの3段、ほんの少しだけゆっくりに』で ×1.1(旧150)
    BRAWLER_KICK_CHAIN_MS: brawlerTempoMs(500, tempo),
    BRAWLER_GUARD_MS: brawlerTempoMs(1000, tempo),
    BRAWLER_GUARD_QUICK_MS: brawlerTempoMs(500, tempo),
    BRAWLER_SUPER_FLASH_MS: brawlerTempoMs(100, tempo),
    BRAWLER_SECRET_GAP_MS: brawlerTempoMs(400, tempo),
    BRAWLER_SECRET_IGNITE_MS: brawlerTempoMs(600, tempo),
    BRAWLER_SECRET_STRIKE_MS: brawlerTempoMs(170, tempo),
    BRAWLER_SECRET_FALL_MS: brawlerTempoMs(420, tempo),
    BRAWLER_SECRET_LAND_MS: brawlerTempoMs(520, tempo),
    BRAWLER_STEP_MS: brawlerTempoMs(180, tempo),
    BRAWLER_KICK3_CHARGE_MS: brawlerTempoMs(127, tempo), // 社長指示2026-11-11『飛び蹴りからの3段、ほんの少しだけゆっくりに』で ×1.1(旧115)
});
/**
 * テンポ係数を差し替える(格闘の時間の欄を全部書き直す)。起動時に `?brtempo=`(既定 1.3)で1回呼ぶ。
 * 固まり・浮き・反撃の溜め(utils/brawlerCombo)も同じ係数で書き直すので、テストは brawlerCombo の `setBrawlerTempoAll` を使う。
 */
export const setBrawlerTempo = (tempo: number): void => {
  const t = Math.max(0.5, Math.min(3, Number.isFinite(tempo) ? tempo : BRAWLER_TEMPO_DEFAULT));
  const v = brawlerTimesAt(t);
  BRAWLER_TEMPO = t;
  BRAWLER_STAGES = v.stages;
  BRAWLER_TECHS = v.techs;
  BRAWLER_HOLD_MS = v.holds;
  BRAWLER_CHAIN_RESET_MS = v.BRAWLER_CHAIN_RESET_MS;
  BRAWLER_WHIFF_BUFFER_MS = v.BRAWLER_WHIFF_BUFFER_MS;
  BRAWLER_CANCEL_WINDOW_MS = v.BRAWLER_CANCEL_WINDOW_MS;
  BRAWLER_PALM_DASH_MS = v.BRAWLER_PALM_DASH_MS;
  BRAWLER_PALM_SETTLE_MS = v.BRAWLER_PALM_SETTLE_MS;
  BRAWLER_LIFT_MS = v.BRAWLER_LIFT_MS;
  BRAWLER_KICK_FLIGHT_MAX_MS = v.BRAWLER_KICK_FLIGHT_MAX_MS;
  BRAWLER_KICK_CHAIN_MS = v.BRAWLER_KICK_CHAIN_MS;
  BRAWLER_GUARD_MS = v.BRAWLER_GUARD_MS;
  BRAWLER_GUARD_QUICK_MS = v.BRAWLER_GUARD_QUICK_MS;
  BRAWLER_SUPER_FLASH_MS = v.BRAWLER_SUPER_FLASH_MS;
  BRAWLER_SECRET_GAP_MS = v.BRAWLER_SECRET_GAP_MS;
  BRAWLER_SECRET_IGNITE_MS = v.BRAWLER_SECRET_IGNITE_MS;
  BRAWLER_SECRET_STRIKE_MS = v.BRAWLER_SECRET_STRIKE_MS;
  BRAWLER_SECRET_FALL_MS = v.BRAWLER_SECRET_FALL_MS;
  BRAWLER_SECRET_LAND_MS = v.BRAWLER_SECRET_LAND_MS;
  BRAWLER_STEP_MS = v.BRAWLER_STEP_MS;
  BRAWLER_KICK3_CHARGE_MS = v.BRAWLER_KICK3_CHARGE_MS;
  BRAWLER_FLOW_GRACE_MS = BRAWLER_CHAIN_RESET_MS;
};

// ---------------------------------------------------------------------------------------------
// 状態機械(§2-1・§2-4・§7-5)
// ---------------------------------------------------------------------------------------------
export type { BrawlerPhase, BrawlerState } from './brawlerTypes';

export const initialBrawlerState = (): BrawlerState => ({
  phase: 'idle', stage: 0, tech: null, kickN: 0, startAt: 0, windupMs: 0, recoveryMs: 0,
  stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: false, connected: false, buffered: false,
  nextStage: 1, chainUntil: 0, points: 0, guardUntil: 0, quickUntil: 0, kickChainUntil: 0, kickCount: 0,
  dirX: 1, dirY: 0, denyAt: 0, flashAt: 0, guardHitAt: 0, pressAt: 0,
});

/** 行動の時計(止めた分を引いた経過ms)。 */
export const brawlerElapsed = (s: Pick<BrawlerState, 'startAt' | 'stopFrom' | 'stopUntil' | 'stopPrevMs'>, t: number): number => {
  const stopping = s.stopUntil > s.stopFrom ? Math.max(0, Math.min(t, s.stopUntil) - s.stopFrom) : 0;
  return t - s.startAt - s.stopPrevMs - (t >= s.stopFrom ? stopping : 0);
};
export const brawlerInHitstop = (s: Pick<BrawlerState, 'stopFrom' | 'stopUntil'>, t: number): boolean =>
  t >= s.stopFrom && t < s.stopUntil;
/** ★旧「画面全体の止め」を写した止め(stopFreezeUntil・社長指示2026-11-14)の最中か。四神舞の最中の止め(印なし)では false。 */
export const brawlerInFreezeStop = (s: Pick<BrawlerState, 'stopFrom' | 'stopUntil' | 'stopFreezeUntil'>, t: number): boolean =>
  s.stopFreezeUntil !== undefined && s.stopFreezeUntil === s.stopUntil && brawlerInHitstop(s, t);
export const brawlerTotalMs = (s: Pick<BrawlerState, 'windupMs' | 'recoveryMs'>): number => s.windupMs + s.recoveryMs;
export const isBrawlerBusy = (s: BrawlerState | undefined): boolean => !!s && (s.phase !== 'idle' || !!s.secret);
export const isBrawlerGuardingAt = (s: BrawlerState | undefined, gameTime: number): boolean =>
  !!s && s.guardUntil > 0 && gameTime < s.guardUntil;

/** 止めを掛ける(当てた瞬間)。前の止めの分は stopPrevMs へ畳む。 */
export const brawlerApplyHitstop = (s: BrawlerState, t: number, ms: number): BrawlerState => {
  const prev = s.stopUntil > s.stopFrom ? Math.max(0, Math.min(t, s.stopUntil) - s.stopFrom) : 0;
  return { ...s, stopPrevMs: s.stopPrevMs + prev, stopFrom: t, stopUntil: t + Math.max(0, ms) };
};

/** 押した段が出せる段か(つながりが切れていれば1段目)。 */
export const brawlerStageForPress = (s: BrawlerState, t: number): number =>
  (s.nextStage > 1 && t <= s.chainUntil) ? s.nextStage : 1;

/** 新しい通常攻撃を始めた状態(相手・向きは呼び手が決める)。 */
export const brawlerStartAttack = (s: BrawlerState, stage: number, t: number, quick: boolean): BrawlerState => {
  const spec = brawlerStageSpec(stage);
  return {
    ...s, phase: 'attack', stage: spec.stage, tech: null, kickN: 0, kickHeel: false, heelBuffer: false, kickUp: false, kickUpBuffer: false, mogura: false, kickThrow: false, suplexAt: undefined, airSuplexRiseAt: undefined, airSuplexHoldAt: undefined, guardCancelHeld: false, contactGrab: undefined, throwAt: undefined, suplexPendingId: undefined, suplexSwing: undefined, grab: undefined, startAt: t,
    // 前隙なし(受けた直後)でも5段目は突き抜ける時間だけは要る(溜めだけ消える)。
    windupMs: quick ? (spec.stage === 5 ? BRAWLER_PALM_DASH_MS : 0) : spec.windupMs, recoveryMs: spec.recoveryMs,
    stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: false, connected: false, landed: false, linked: false, buffered: false,
    palmFromX: undefined, palmFromY: undefined,
    // 前隙なしは1回きり(受けた直後の最初の1発だけ)。
    quickUntil: quick ? 0 : s.quickUntil,
    // 通常攻撃を押したら蹴りの連続は切れる(§7-5)。秘奥義の順番も数え直し(通常攻撃が挟まった=§10-1)。
    kickChainUntil: 0, kickCount: 0, secretProgress: 0, secretLastEndAt: 0,
    techChain: undefined, // 通常攻撃で技の流れは切れる(技→通常は取り消せない=§11-4・§19-1)
    techBuffer: undefined,
    stepBuffer: undefined, // 先行入力は1つだけ(最後の入力を優先・§12-3b)
  };
};

/**
 * 新しい技を始めた状態(ポイントは呼び手が払う)。cancel=技の後隙を取り消して出した(§11-4)=技の流れを続ける。
 * 飛び蹴りの2・3発目は同じ技の続き(流れはそのまま)。それ以外は流れをこの技から始め直す。
 */
export const brawlerStartTech = (s: BrawlerState, kind: BrawlerTechKind, t: number, kickN = 0, cancel = false, heel = false, up = false): BrawlerState => {
  // ★蹴り上げ(§34-1・§34-8): 蹴りの連続の3発目の位置(空中蹴りの続き)にだけ出る(踵落としとは同時に立たない)。溜めは踵落としと同じ(上下逆の振り上げ)。
  const kickUp = kind === 'kick' && kickN >= BRAWLER_KICK_MAX && up && !heel;
  const kickHeel = kind === 'kick' && kickN >= BRAWLER_KICK_MAX && heel;
  const charged = kickHeel || kickUp;
  // 踵落としから取り消した大踏み潰しは、いまの浮いた高さから落ちる(絵だけ・§29)。
  const stompFromPx = kind === 'stomp' && cancel && brawlerRouteNodeOf(s) === 'heel' ? Math.max(0, brawlerPoseAt(s, t)?.jump ?? 0) : 0;
  const spec = BRAWLER_TECHS[kind];
  const chain = cancel ? [...(s.techChain ?? (s.tech ? [s.tech] : [])), kind]
    : (kind === 'kick' && kickN > 1 && s.techChain) ? s.techChain : [kind];
  return {
    ...s, phase: 'tech', stage: 0, tech: kind, kickN, startAt: t, techChain: chain, techBuffer: undefined, stepBuffer: undefined,
    kickHeel, heelBuffer: false, kickUp, kickUpBuffer: false, mogura: false, kickThrow: false, airSuplexRiseAt: undefined, airSuplexHoldAt: undefined, grab: undefined, suplexAt: undefined, guardCancelHeld: false, contactGrab: undefined,
    throwAt: undefined, suplexPendingId: undefined, suplexSwing: undefined,
    heelAirPx: undefined, kickGroundPx: undefined, // 蹴りの高さの決めは store が出した瞬間に書く(前の技の値を持ち越さない)
    stompFromPx: stompFromPx > 0.5 ? stompFromPx : undefined,
    // 踵落としは溜め(BRAWLER_KICK3_CHARGE_MS)を前隙の頭に足す(store は飛ぶ時間を距離で引き直して同じく足す)。蹴り飛ばしは溜め無し(§33-2)。
    kickChargeMs: charged ? BRAWLER_KICK3_CHARGE_MS : 0,
    windupMs: spec.windupMs + (charged ? BRAWLER_KICK3_CHARGE_MS : 0),
    kickHoldAt: undefined, // 止めの最中に始めた印は store が付ける(§33-2)
    recoveryMs: kind === 'kick' && kickN >= BRAWLER_KICK_MAX ? Math.round(spec.recoveryMs * BRAWLER_KICK3_RECOVERY_MULT) : spec.recoveryMs,
    stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: false, connected: false, landed: false, linked: false, buffered: false,
    // 技の後は1段目(§7-5)。
    nextStage: 1, chainUntil: 0,
    guardUntil: kind === 'guard' ? t + BRAWLER_GUARD_MS : s.guardUntil,
    ...(kind === 'guard' ? { guardSince: t } : {}),
    ...(kind === 'kick' ? { kickCount: kickN } : { kickChainUntil: 0, kickCount: 0 }),
  };
};

/**
 * 押した入力の行き先(§2-1・§7-5)。
 *  start = いま出す / buffer = 先行入力として覚える / drop = 受付の外(捨てる)。
 */
export const brawlerPressDecision = (s: BrawlerState, t: number): 'start' | 'buffer' | 'drop' => {
  // ステップの最中は出せない(§20-8): 押した通常攻撃を1つ覚えて、ステップが終わった瞬間に出す。
  if (s.phase === 'idle') return brawlerStepping(s, t) ? (s.buffered ? 'drop' : 'buffer') : 'start';
  if (s.buffered) return 'drop'; // 1つだけ
  const el = brawlerElapsed(s, t);
  const total = brawlerTotalMs(s);
  if (s.phase === 'tech') return 'buffer'; // 技の最中の押下は覚えて、技が終わったら1段目で出す
  if (s.resolved && s.connected) return 'buffer'; // 当たった瞬間(止めの間を含む)から戻りの終わりまで
  if (el >= total - BRAWLER_WHIFF_BUFFER_MS) return 'buffer'; // 空振り(または判定前)の段は戻りの終わり 150ms 前から
  return 'drop';
};

/** 5段目の突き抜けを踏み出す時刻か(溜めが終わった・まだ踏み出していない)。 */
export const brawlerPalmDashDue = (s: BrawlerState, t: number): boolean =>
  s.phase === 'attack' && s.stage === 5 && !s.resolved && s.palmFromX === undefined
  && brawlerElapsed(s, t) >= Math.max(0, s.windupMs - BRAWLER_PALM_DASH_MS);
/** 5段目で突き抜けている最中か(敵とオブジェクトをすり抜ける・無敵の間)。 */
export const isBrawlerPalmDashing = (s: BrawlerState | undefined): boolean =>
  !!s && s.phase === 'attack' && s.stage === 5 && !s.resolved && s.palmFromX !== undefined;
/**
 * 抜けた後ろの敵を吹き飛ばす向き(単位ベクトル)。軌跡(x0,y0 から ux,uy)の横へ外向き+進む向きへ少し。
 * 軌跡のちょうど上の敵は side(+1/-1)の側へ(呼び手が敵ごとに交互に決める=全員が同じ側へ飛ばない)。
 */
export const brawlerPassKbDir = (
  ecx: number, ecy: number, x0: number, y0: number, ux: number, uy: number, side: 1 | -1,
): { x: number; y: number } => {
  const um = Math.hypot(ux, uy) || 1; ux /= um; uy /= um;
  const cross = (ecx - x0) * uy - (ecy - y0) * ux; // >0 = 進む向きの右手(画面座標)
  const sgn = Math.abs(cross) < 4 ? side : (cross > 0 ? 1 : -1);
  const px = uy * sgn, py = -ux * sgn;
  const vx = px + ux * BRAWLER_PALM_KB_FORWARD, vy = py + uy * BRAWLER_PALM_KB_FORWARD;
  const m = Math.hypot(vx, vy) || 1;
  return { x: vx / m, y: vy / m };
};

/** 弾を拾った時の技ポイント(上限で止める)。増えた時だけ gainAt を打つ(上限なら状態は同じ物を返す)。 */
export const brawlerAfterAmmoPickup = (s: BrawlerState, cap: number, now: number): BrawlerState => {
  const next = Math.min(cap, s.points + BRAWLER_AMMO_PICKUP_POINTS);
  return next === s.points ? s : { ...s, points: next, gainAt: now };
};

/**
 * 食らった時の技ポイント(社長指示2026-11-10「あと格闘は攻撃食らっても技ポイント貯まる にしよう。ただし、ボスは銃弾では貯まらない。」
 * research/BRAWLER.md §12-3c・BRAWLER_PHANTOM.md §16-8)。当てた時と同じ +1・同じ上限。
 * hurt=体力が本当に減った被弾か(0ダメージ=構えで受けた・無敵で弾いた・持続ダメージは呼び手が false を渡す)。
 * 増えた時だけ gainAt を打つ(上限・hurt=false なら状態は同じ物を返す)。
 */
export const BRAWLER_HURT_POINTS = 1;
export const brawlerAfterHurtPoints = (s: BrawlerState, cap: number, hurt: boolean, now: number): BrawlerState => {
  if (!hurt) return s;
  const next = Math.min(cap, s.points + BRAWLER_HURT_POINTS);
  return next === s.points ? s : { ...s, points: next, gainAt: now };
};

/**
 * 構えを受けで終える(雑魚の攻撃を受けて大踏み潰しへ移る直前・research/BRAWLER.md §12-3d・社長指示2026-11-10)。
 * 受けはここで切れ、受けた直後の前隙なしは「いま」から数える(構えの終わり=いま)。技ポイントは動かさない
 * (2026-11-08 の「カウンター成立で全回復」は撤去=構えで受けても技ポイントは増えない)。
 */
export const brawlerEndGuardForStomp = (s: BrawlerState, t: number): BrawlerState =>
  ({ ...s, guardUntil: 0, quickUntil: t + BRAWLER_GUARD_QUICK_MS });

/** 判定を解いた後の状態(当たった/外れた)。当たった時はポイントと止めも足す。 */
export const brawlerAfterResolve = (
  s: BrawlerState, t: number, hits: number,
  /** landed=「当たった」数(相手の体力を削った当たり・防がれた当たりを除く・§19-1)。未指定=hits と同じ。 */
  opts: { pointCap: number; countPoint: boolean; hitstopMs: number; landed?: number },
): BrawlerState => {
  const connected = hits > 0;
  let next: BrawlerState = { ...s, resolved: true, connected, landed: connected && (opts.landed ?? hits) > 0 };
  if (s.phase === 'attack') {
    next.nextStage = connected ? (s.stage >= 5 ? 1 : s.stage + 1) : 1;
    if (!connected) next.chainUntil = 0;
  }
  if (connected) {
    if (opts.countPoint) next.points = Math.min(opts.pointCap, s.points + 1);
    if (opts.hitstopMs > 0) next = brawlerApplyHitstop(next, t, opts.hitstopMs);
  }
  return next;
};

export type BrawlerTickEvent = 'resolve' | 'end';
/** 時計を進めた時に起きること(判定の時刻・終わり)。状態は変えない(呼び手が resolve/end を処理する)。 */
export const brawlerDueEvent = (s: BrawlerState, t: number): BrawlerTickEvent | null => {
  if (s.phase === 'idle') return null;
  const el = brawlerElapsed(s, t);
  if (!s.resolved && el >= s.windupMs) return 'resolve';
  if (s.resolved && el >= brawlerTotalMs(s) && !brawlerInHitstop(s, t)) return 'end';
  return null;
};

/** 行動を終えた状態。先行入力があれば呼び手が次を始める(戻り値の fire)。 */
export const brawlerFinish = (s: BrawlerState, t: number): { state: BrawlerState; fire: boolean } => {
  const fire = s.buffered;
  const state: BrawlerState = {
    ...s, phase: 'idle', tech: null, buffered: false,
    chainUntil: s.phase === 'attack' && s.connected && s.nextStage > 1 ? t + BRAWLER_CHAIN_RESET_MS : 0,
    nextStage: s.phase === 'attack' && s.connected ? s.nextStage : 1,
    guardUntil: s.tech === 'guard' ? 0 : s.guardUntil,
    // 秘奥義の順番(§10-1): 技の終わりの時刻を覚える(次の技はここから GAP 以内)。通常攻撃が終わった時は数え直し。
    ...(s.phase === 'tech' ? { secretLastEndAt: t } : { secretProgress: 0, secretLastEndAt: 0 }),
    // 蹴りの連続の受付(kickChainUntil)は着いた瞬間に呼び手が張る(§8-3)。ここでは触らない。
  };
  return { state, fire };
};

// ---------------------------------------------------------------------------------------------
// 秘奥義(research/BRAWLER.md §10・社長指示2026-11-08)
// ---------------------------------------------------------------------------------------------
/** 順番(→蹴り ↓大踏み潰し ←気功 ↑構え)。 */
export const BRAWLER_SECRET_ORDER: readonly BrawlerTechKind[] = ['kick', 'stomp', 'kiko', 'guard'];
/** 「間を空けずに」= 前の技の終わりから次の技の発動まで(ms・gameTime)。 */
export let BRAWLER_SECRET_GAP_MS = 400; // ×BRAWLER_TEMPO(係数1.0の値)
/** 起動(激しく爆発して光る)・1発の間隔・発数・天空からの落下・着地の後の余韻(ms)。 */
export let BRAWLER_SECRET_IGNITE_MS = 600; // ×BRAWLER_TEMPO(係数1.0の値)
export let BRAWLER_SECRET_STRIKE_MS = 170; // ×BRAWLER_TEMPO(係数1.0の値)
export const BRAWLER_SECRET_STRIKES = 9;
export let BRAWLER_SECRET_FALL_MS = 420; // ×BRAWLER_TEMPO(係数1.0の値)
export let BRAWLER_SECRET_LAND_MS = 520; // ×BRAWLER_TEMPO(係数1.0の値)
/** 天空の高さ(見た目・world px)。 */
export const BRAWLER_SECRET_SKY_PX = 420;
/** 9連撃・締めの落下の着地点・中断の判定が狙える範囲=画面の端から外へこの分(画面px・ズームの可視域基準)。社長指示2026-11-12(案A)。 */
export const BRAWLER_SECRET_REACH_OUT_PX = 200;
/** フィニッシュの地面叩き(§10-2-3)。 */
export const BRAWLER_SECRET_LAND_RADIUS = 260;
export const BRAWLER_SECRET_LAND_MULT = 3.6; // 社長承認2026-11-09 で 3.0→3.6
export const BRAWLER_SECRET_LAND_HITSTOP_MS = BRAWLER_HITSTOP.closer; // 秘奥義の締め(社長承認2026-11-08 で 160→220)
/** 9連撃で選ぶ技(通常攻撃1〜5段・飛び蹴り・大踏み潰し・気功)。 */
export const BRAWLER_SECRET_MOVES: readonly BrawlerSecretMove[] = [1, 2, 3, 4, 5, 'kick', 'stomp', 'kiko'];

/**
 * 技が実際に出た時の順番の進み(§10-1)。progress = 直前までに揃った数(0..3)、lastEndAt = 直前の技の終わり(0=無し)。
 *  - 順番どおりの次の技が、前の技の終わりから GAP 以内に出れば +1。4つ揃ったら fire(進みは0へ)。
 *  - 飛び蹴りの2・3発目(連続の続き)は数え直さない(進みも時刻もそのまま=最初の→のまま↓を待つ)。
 *  - それ以外(順番違い・間が空いた)は数え直し=0。
 *  - ★1手目の→飛び蹴りは**敵に当たった時だけ**数える(社長指示2026-11-08「1発目は敵に当たっていること」)。出た瞬間は0のままで、
 *    蹴りの判定の結果を `brawlerSecretAfterKick` で足す(先行入力が判定の前に来ても、次の技は蹴りが終わってから=結果が出てから数える)。
 */
export const brawlerSecretStep = (
  progress: number, lastEndAt: number, kind: BrawlerTechKind, kickN: number, t: number,
): { progress: number; fire: boolean } => {
  if (kind === 'kick' && kickN > 1) return { progress, fire: false };
  const inTime = progress > 0 && lastEndAt > 0 && t - lastEndAt <= BRAWLER_SECRET_GAP_MS;
  if (inTime && BRAWLER_SECRET_ORDER[progress] === kind) {
    const next = progress + 1;
    return next >= BRAWLER_SECRET_ORDER.length ? { progress: 0, fire: true } : { progress: next, fire: false };
  }
  return { progress: 0, fire: false };
};
/** 飛び蹴りの判定の後: 当たったら秘奥義の1手目(進み1)。外れたら数えない(進みはそのまま=0)。2・3発目で当たっても1手目になる。 */
export const brawlerSecretAfterKick = (progress: number, connected: boolean): number =>
  connected && progress === 0 ? 1 : progress;

/** 秘奥義を始めた状態(構えを置き換える・構えの窓は張らない)。 */
export const brawlerSecretStart = (s: BrawlerState, t: number, now: number): BrawlerState => ({
  ...s, phase: 'idle', tech: null, stage: 0, buffered: false, guardUntil: 0, quickUntil: 0, kickChainUntil: 0, kickCount: 0,
  nextStage: 1, chainUntil: 0, secretProgress: 0, secretLastEndAt: 0,
  secret: { phase: 'ignite', phaseAt: t, hits: 0, nextAt: t + BRAWLER_SECRET_IGNITE_MS, igniteAt: now },
});
/**
 * ★秘奥義を構え(↑)で取り消せるか(社長指示2026-11-11「秘奥義は出始めだけ無敵時間有り。構えでキャンセル可能」)。
 * 起動と9連撃の間だけ。落下と着地(フィニッシュ)に入ったら取り消せない(天空に居る・締めは出し切る)。
 */
export const brawlerSecretCancelable = (s: BrawlerState | undefined): boolean =>
  !!s?.secret && (s.secret.phase === 'ignite' || s.secret.phase === 'strike');
/** 秘奥義を終えた(フィニッシュ後・中断)状態。技ポイントは強制で0、段は1段目へ(§10-2-4・§10-3)。 */
export const brawlerSecretEnd = (s: BrawlerState): BrawlerState => ({
  ...s, phase: 'idle', tech: null, stage: 0, buffered: false, techBuffer: undefined, stepBuffer: undefined, points: 0, nextStage: 1, chainUntil: 0,
  guardUntil: 0, quickUntil: 0, kickChainUntil: 0, kickCount: 0, secret: undefined, secretProgress: 0, secretLastEndAt: 0,
  stopFrom: 0, stopUntil: 0, stopPrevMs: 0,
});
export type BrawlerSecretEvent = 'strike' | 'fall' | 'land' | 'end';
/** 秘奥義の時計で、いま起きること。 */
export const brawlerSecretDue = (sec: BrawlerSecret, t: number): BrawlerSecretEvent | null => {
  if (t < sec.nextAt) return null;
  if (sec.phase === 'ignite') return 'strike';
  if (sec.phase === 'strike') return sec.hits >= BRAWLER_SECRET_STRIKES ? 'fall' : 'strike';
  if (sec.phase === 'fall') return 'land';
  return 'end';
};
/** 9連撃の1発で出す技(乱数 r=0..1)。 */
export const brawlerSecretPickMove = (r: number): BrawlerSecretMove =>
  BRAWLER_SECRET_MOVES[Math.min(BRAWLER_SECRET_MOVES.length - 1, Math.max(0, Math.floor(r * BRAWLER_SECRET_MOVES.length)))];
/** 9連撃の相手(画面内で当てられる敵の id から乱数で1体。同じ敵が続いてもよい)。居なければ null=中断。 */
export const brawlerSecretPickTarget = (ids: readonly string[], r: number): string | null =>
  ids.length === 0 ? null : ids[Math.min(ids.length - 1, Math.max(0, Math.floor(r * ids.length)))];
/**
 * 9連撃の1発の絵を出すために、状態の行動欄をその技の「当たった直後」に見せかける(ポーズと影は状態から描かれる)。
 * 秘奥義の間は通常の状態機械は回らない(store の tick が秘奥義の側へ分岐する)ので、この欄はただの絵の駆動。
 */
export const brawlerSecretMovePose = (s: BrawlerState, move: BrawlerSecretMove, t: number, dirX: number, dirY: number): BrawlerState => {
  const isStage = typeof move === 'number';
  const windupMs = isStage ? brawlerStageSpec(move).windupMs : BRAWLER_TECHS[move].windupMs;
  return {
    ...s, dirX, dirY, startAt: t - windupMs, windupMs, recoveryMs: BRAWLER_SECRET_STRIKE_MS,
    stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: true, connected: true,
    ...(isStage
      ? { phase: 'attack' as const, stage: move, tech: null, kickN: 0, palmFromX: undefined, palmFromY: undefined }
      : { phase: 'tech' as const, stage: 0, tech: move, kickN: move === 'kick' ? BRAWLER_KICK_MAX : 0, kickChargeMs: 0 }),
  };
};
export const isBrawlerSecretActive = (s: BrawlerState | undefined): boolean => !!s?.secret;

/** 出かかった行動を取り消す(掴まれ・紫・シーカー=§8-4)。先行入力(通常・技)も捨てる。 */
export const brawlerCancel = (s: BrawlerState): BrawlerState => ({
  ...s, phase: 'idle', tech: null, buffered: false, techBuffer: undefined, stepBuffer: undefined, nextStage: 1, chainUntil: 0, secret: undefined,
  guardUntil: 0, kickChainUntil: 0, kickCount: 0,
});
/**
 * ★格闘の技をカウンターされた側の扱い(社長指示2026-11-26「格闘技はカウンターされるとノックバックで。」)。
 * 近接のカウンターの規則(振りの中断+敵と同じ量のノックバック)の「中断」の側。押し(ノックバック)は呼び手が今の近接カウンターの押しをそのまま使う。
 * 連撃の途中・技の途中・飛び蹴りの連続・先行入力は全部ここで切れる。秘奥義なら秘奥義ごと打ち切り(技ポイント0=紫・気絶の取り消しと同じ)。
 * 空中(飛び蹴り・踵落とし・蹴り上げ等の体の高さ)で返された時は、その高さから加速して落ちる(counterFall・絵だけ・慣性)。
 */
export const brawlerCounterInterrupt = (s: BrawlerState, t: number): BrawlerState => {
  const h = Math.max(0, brawlerPoseAt(s, t)?.jump ?? 0);
  const cut = s.secret ? brawlerSecretEnd(s) : brawlerCancel(s);
  return { ...cut, airSuplexRiseAt: undefined, airSuplexHoldAt: undefined, counterFall: h > 0.5 ? { fromPx: h, at: t } : undefined };
};
/** カウンターで断ち切られた後の落下の残りの高さ(px)。加速して落ちる(1−k²)。落ち切ったら0。 */
export const brawlerCounterFallPx = (f: BrawlerState['counterFall'], t: number): number => {
  if (!f) return 0;
  const k = (t - f.at) / BRAWLER_COUNTER_FALL_MS;
  if (!(k >= 0) || k >= 1) return k < 0 ? f.fromPx : 0;
  return f.fromPx * (1 - k * k);
};
/** 被弾した(段は1段目へ・先行入力は捨てる=§2-4)。行動そのものは続く(殴り返されて止まるのは敵の止めの側)。 */
export const brawlerOnHurt = (s: BrawlerState): BrawlerState => ({
  ...s, buffered: false, techBuffer: undefined, stepBuffer: undefined, nextStage: 1, chainUntil: 0,
});
// ---------------------------------------------------------------------------------------------
// ★つながる道(research/BRAWLER.md §19・社長承認2026-11-10「KOFの案は はい」)。
// 「技のあと、ちゃんと隙を入れてあげて、繋がるの(少しキャンセル掛かるとか)と繋がらないのを作る」。
// 規則は brawlerRouteAllows の1か所(§20: 技ごとの印 BRAWLER_CANCELABLE から作る)。プレイヤー(store)と拳鬼(utils/phantomBrawlerAi)が同じ関数を読む。
// ---------------------------------------------------------------------------------------------
/**
 * ★取り消しの印(research/BRAWLER.md §20-3)。当たった「取り消せる技」の後隙は、構え以外のどの技でも取り消せる。
 * 取り消せない技=5段目・飛び蹴り3発目・気功・構え(後隙を晒す)。
 */
export const BRAWLER_CANCELABLE: Readonly<Record<BrawlerRouteNode, boolean>> = {
  idle: false, guard: false,
  s1: true, s2: true, s3: true, s4: true, s5: false,
  kick1: true, kick2: true, kick3: false, heel: true, // 踵落としは大踏み潰しでだけ取り消せる(下の buildBrawlerRoutes)
  kickup: true, // 蹴り上げ(§34-1・§34-8)は気功だけ(下の buildBrawlerRoutes)
  stomp: true, kiko: false,
  mogura: true, // 土竜(§35): 地割りと同じ=飛び蹴り・気功へ取り消せる
};
/** 取り消しで出せる技(通常の段は含めない=段へは段のつなぎだけ)。 */
const BRAWLER_CANCEL_TARGETS: readonly BrawlerRouteNode[] = ['kick1', 'stomp', 'kiko'];
/** 同じ技の種類か(kick1/kick2/kick3 は同じ種類)。 */
const routeKindOf = (n: BrawlerRouteNode): string => (n === 'kick1' || n === 'kick2' || n === 'kick3' || n === 'heel' || n === 'kickup' ? 'kick' : n === 'mogura' ? 'stomp' : n);
/** 段のつなぎ(通常の次の段)と飛び蹴りの連続。 */
const BRAWLER_NEXT_LINK: Readonly<Partial<Record<BrawlerRouteNode, BrawlerRouteNode>>> = { s1: 's2', s2: 's3', s3: 's4', s4: 's5', kick1: 'kick2', kick2: 'kick3' };
/** 飛び蹴りの1発目の続き(↑蹴り上げ)と、2発目の続き(→蹴り飛ばし / ↓踵落とし / ↑蹴り上げ)。 */
const BRAWLER_EXTRA_LINK: Readonly<Partial<Record<BrawlerRouteNode, readonly BrawlerRouteNode[]>>> = { kick2: ['heel', 'kickup'] }; // 蹴り上げは2発目の続きだけ(§34-8)
const BRAWLER_ALL_NODES: readonly BrawlerRouteNode[] = ['idle', 's1', 's2', 's3', 's4', 's5', 'kick1', 'kick2', 'kick3', 'heel', 'kickup', 'stomp', 'mogura', 'kiko', 'guard'];
/** 印から作った表(手書きの組は持たない)。 */
const buildBrawlerRoutes = (): Readonly<Record<BrawlerRouteNode, readonly BrawlerRouteNode[]>> => {
  const out = {} as Record<BrawlerRouteNode, readonly BrawlerRouteNode[]>;
  for (const from of BRAWLER_ALL_NODES) {
    if (from === 'idle') { out[from] = BRAWLER_ALL_NODES.filter(n => n !== 'idle' && n !== 'heel' && n !== 'kickup' && n !== 'mogura'); continue; } // 待機からは何でも(今どおり・踵落としは2発目の続きだけ・蹴り上げも2発目の続きだけ=§34-8)
    if (from === 'heel') { out[from] = ['stomp']; continue; } // 踵落とし→大踏み潰し(着地の隙を取り消す・社長指示2026-11-11)
    // ★蹴り上げ(§34-1)→気功。大踏み潰しへは取り消せない(打ち上げた直後に叩き落とすのは役割が逆)。
    //   次の蹴りは連続の位置が残っている時だけ(brawlerTechAllowed の kickN < BRAWLER_KICK_MAX・§34-6 #2)。3発目の位置の蹴り上げからは気功だけ。
    // ★§34-8: 蹴り上げは常に3発目の位置=蹴りの連続はここで終わり、取り消せるのは気功だけ。
    if (from === 'kickup') { out[from] = ['kiko']; continue; }
    if (from === 'guard') { out[from] = ['guard']; continue; }                                 // 構えの延長だけ
    const to: BrawlerRouteNode[] = [];
    if (BRAWLER_CANCELABLE[from]) to.push(...BRAWLER_CANCEL_TARGETS.filter(n => routeKindOf(n) !== routeKindOf(from)));
    const next = BRAWLER_NEXT_LINK[from];
    if (next && !to.includes(next)) to.push(next);
    for (const extra of BRAWLER_EXTRA_LINK[from] ?? []) if (!to.includes(extra)) to.push(extra);
    out[from] = to; // 気功→構えは secretClose の時だけ(brawlerRouteAllows)
  }
  return out;
};
const BRAWLER_ROUTES = buildBrawlerRoutes();
/**
 * 道の表(§19-1)。from=いまの行動(待機・通常の何段目か・飛び蹴りの何発目か・技)/ to=続けて出す行動。
 * 気功→構えは secretClose(秘奥義の順番が3つ進んでいる)の時だけ。表に無い組は false。
 * ★この関数は「道があるか」だけ。当たったか・受付の内かは brawlerTechCancelOk / 段のつなぎの規則が別に見る。
 */
export const brawlerRouteAllows = (from: BrawlerRouteNode, to: BrawlerRouteNode, o: { secretClose?: boolean } = {}): boolean => {
  if (from === 'kiko' && to === 'guard') return o.secretClose === true;
  return BRAWLER_ROUTES[from].includes(to);
};
/** 通常の段(1..5)の節。 */
export const brawlerStageNode = (stage: number): BrawlerRouteNode =>
  (['s1', 's2', 's3', 's4', 's5'] as const)[Math.max(1, Math.min(5, Math.round(stage))) - 1];
/** 技の節(飛び蹴りは何発目か)。 */
export const brawlerTechNode = (kind: BrawlerTechKind, kickN = 1): BrawlerRouteNode =>
  kind === 'kick' ? (['kick1', 'kick2', 'kick3'] as const)[Math.max(1, Math.min(3, Math.round(kickN))) - 1] : kind;
/** いまの行動の節(待機なら 'idle')。 */
export const brawlerRouteNodeOf = (s: Pick<BrawlerState, 'phase' | 'stage' | 'tech' | 'kickN' | 'kickHeel'> & Pick<Partial<BrawlerState>, 'kickUp' | 'kickThrow' | 'mogura'>): BrawlerRouteNode =>
  s.phase === 'attack' ? brawlerStageNode(s.stage)
    : s.phase === 'tech' && s.tech === 'kick' && s.kickHeel ? 'heel'
    // ★空中投げ・スープレックス(§34-3)へ移った蹴り上げは締め=蹴り飛ばし(3発目)と同じく続きを持たない(§34-6 #5)。
    : s.phase === 'tech' && s.tech === 'kick' && s.kickThrow ? 'kick3'
    : s.phase === 'tech' && s.tech === 'kick' && s.kickUp ? 'kickup'
    : s.phase === 'tech' && s.tech === 'stomp' && s.mogura ? 'mogura'
    : s.phase === 'tech' && s.tech ? brawlerTechNode(s.tech, s.kickN)
      : 'idle';
/** 秘奥義の入力の締め(↑構え)を待っている所か(順番が3つ進んでいる=§10-1・§19-1)。 */
export const brawlerSecretClosing = (s: Pick<BrawlerState, 'secretProgress'>): boolean =>
  (s.secretProgress ?? 0) >= BRAWLER_SECRET_ORDER.length - 1;
/**
 * 「当たった」か(§19-1): 判定を解いて、相手の体力を削った当たり。空振り・構えで受けられた・レバーガードで防がれた当たりは false
 * (呼び手が判定の結果を brawlerAfterResolve の landed で渡す)。
 */
export const brawlerHitLanded = (s: Pick<BrawlerState, 'resolved' | 'connected' | 'landed'>): boolean =>
  s.resolved && s.connected && s.landed !== false;
/** 行動(通常の段・技)の最中か。それ以外(待機・欄の欠けた古い状態)は待機として扱う。 */
const brawlerActing = (s: Pick<BrawlerState, 'phase'>): boolean => s.phase === 'attack' || s.phase === 'tech';
/**
 * 取り消しの受付が開いているか(§19-2)。判定を解いてから(当たりの止めの間は時計が止まる=止めが明けた瞬間から)
 * BRAWLER_CANCEL_WINDOW_MS の間だけ。行動の時計(止めた分を引いた経過)で測る=拳鬼が固められて時計が止まった分も数えない。
 * 当たったか・道があるかは見ない(呼び手が見る)。
 */
export const brawlerCancelWindowOpen = (s: BrawlerState, t: number): boolean => {
  if (!brawlerActing(s) || !s.resolved || brawlerInHitstop(s, t)) return false;
  const since = brawlerElapsed(s, t) - s.windupMs;
  return since >= 0 && since < BRAWLER_CANCEL_WINDOW_MS;
};
/**
 * ★秘奥義の入力の持ち越し(§19-2・§19-4 の6「→↓←↑ が今どおり成立する」のための、実装で決めた所)。
 * 秘奥義の順番(→↓←↑)が進んでいる最中に、順番どおりの次の技を「いまの技の取り消しの受付の外」(受付を過ぎた後・当たらなかった時)に入れた時は、
 * 捨てずに覚えておき、いまの技が終わって**待機へ戻った瞬間に出す**(=待機から出し直した扱い: 後隙は丸ごと晒す・つながりの固まりは延ばさない)。
 * これが無いと、入力の間隔によって2〜4手目が「受付の後・後隙の終わりの前」に落ちて消え、秘奥義が出ない帯ができる
 * (係数1.3で実測: 間隔 420〜580ms・680〜990ms が不成立。今までは 270ms 以上なら成立)。順番の外の技は今の規則どおり捨てる。
 */
export const brawlerSecretCarry = (s: Pick<BrawlerState, 'phase' | 'tech' | 'secretProgress'>, kind: BrawlerTechKind): boolean => {
  const p = s.secretProgress ?? 0;
  return s.phase === 'tech' && p >= 1 && p < BRAWLER_SECRET_ORDER.length
    && s.tech === BRAWLER_SECRET_ORDER[p - 1] && kind === BRAWLER_SECRET_ORDER[p];
};
/**
 * 技の先行入力として覚えるか(§9-60・§19-2)。行動の最中で、いまは出せないが**道の上にあって、まだ出せるようになり得る**技だけ。
 *  - 入れた時点で道に無い技は覚えない(捨てる)。
 *  - 出だし(判定の前)と、当たりの止めの間(受付が開く前)だけ覚える。当たらなかった・受付を過ぎた行動では覚えない。
 *  - 飛び蹴りの連続(蹴り→次の蹴り)は今どおり: 判定の前に入れた次の蹴りを覚える。
 *  - 例外: 秘奥義の順番どおりの次の技(brawlerSecretCarry)は、受付の外でも覚える(後隙の終わりに待機から出す)。
 * 構えの間は構えの延長だけ(覚えない)。新しい入力は覚えている入力を上書きする。
 */
export const brawlerShouldBufferTech = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean =>
  brawlerShouldBufferTechEarly(s, kind, t) || brawlerLateCarry(s, kind, t);
/**
 * ★判定の後に押した技は、1つだけ覚えて、行動が終わって待機へ戻った瞬間に出す(社長裁定2026-11-11「2:A」「5:1つまで保持。上と同じく」・§25)。
 * 取り消しの受付を過ぎた後・当たらなかった後の後隙で押した技が対象(受付の内なら、その場で取り消して出る)。
 * 待機から出し直した扱い=後隙は丸ごと晒す・固まりは延ばさない・値段は出す瞬間に払う。構えの間は延長だけ(覚えない)。
 * 判定の前(出だし)に押して当たらなかった技は、今どおり捨てる(下の brawlerTechBufferDecision)。
 */
export const brawlerLateCarry = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean =>
  brawlerActing(s) && s.resolved && !isBrawlerGuardingAt(s, t) && !(s.phase === 'tech' && s.tech === 'guard') && !brawlerTechAllowed(s, kind, t)
  // 通常の段の後隙の構えは、後隙の終わりまで待たずに取り消して出る(止めの最中だけ覚える=下の brawlerShouldBufferTechEarly)。
  && !(kind === 'guard' && brawlerStageGuardSlot(s, t));
/** 出だし・当たりの止めの間の先行入力(旧来の規則)。 */
const brawlerShouldBufferTechEarly = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean => {
  // ステップの最中に押した技は覚える(§20-8=ステップが終わった瞬間に、待機から出す)。
  if (!brawlerActing(s) && brawlerStepping(s, t) && !isBrawlerGuardingAt(s, t)) return true;
  if (!brawlerActing(s) || isBrawlerGuardingAt(s, t) || (s.phase === 'tech' && s.tech === 'guard')) return false;
  if (brawlerTechAllowed(s, kind, t)) return false;
  // ★通常の段の後隙の構え(brawlerStageGuardCancelOk): 当たりの止めの最中に入れたら覚えて、止めが明けた瞬間に出す。止めの外なら即座に出る(覚えない)。
  if (kind === 'guard' && brawlerStageGuardSlot(s, t)) return brawlerInHitstop(s, t);
  const from = brawlerRouteNodeOf(s);
  // ★旧「画面全体の止め」を写した止めの最中に押した次の蹴りは覚えて、止めが明けてから出す(旧の止めの間と同じ・社長指示2026-11-14)。
  if (s.phase === 'tech' && s.tech === 'kick' && kind === 'kick') return (!s.resolved || brawlerInFreezeStop(s, t)) && s.kickN < BRAWLER_KICK_MAX && !s.kickThrow;
  const to = brawlerTechNode(kind, 1);
  if (brawlerRouteAllows(from, to, { secretClose: brawlerSecretClosing(s) })) {
    if (!s.resolved) return true; // 出だし: 当たるかはまだ分からない
    // 当たりの止めの間(受付が開く前)。気功は撃った時点で受付が開く=ここへ来るのは受付を過ぎた後。
    if (from !== 'kiko' && brawlerHitLanded(s) && brawlerInHitstop(s, t)) return true;
  }
  return brawlerSecretCarry(s, kind); // 秘奥義の順番どおりの次の技だけは、受付の外でも覚える(後隙の終わりに待機から出す)
};
/**
 * 覚えた技の先行入力をどうするか(§19-2)。null=覚えていない / 'fire'=いま出す(受付が開いた)/ 'wait'=まだ / 'drop'=捨てる。
 * 当たらなかった(空振り・防がれた)・受付を過ぎた・待機へ戻った時は捨てる=後隙の終わりに勝手に出さない。
 * 例外: ステップの最中に覚えた技(stepHeld)は、待機のままステップが終わるまで 'wait'、終わった瞬間に 'fire'(§20-8)。
 * (秘奥義の順番どおりの次の技=brawlerSecretCarry は 'wait' のまま行動の終わりまで残り、呼び手が待機へ戻った瞬間に出す。)
 */
export const brawlerTechBufferDecision = (s: BrawlerState, t: number): 'fire' | 'wait' | 'drop' | null => {
  const k = s.techBuffer;
  if (!k) return null;
  // ★構えの取り消し(§34-6 #8): 受けの成立の止めの最中に入れた技は、止めが明けた(=この時計が回った)瞬間に出す。構えが終わっていたら捨てる。
  if (s.guardCancelHeld) return brawlerGuardCancelOk(s, k, t) ? 'fire' : 'drop';
  // 待機: ステップの最中に覚えた技(stepHeld)は、ステップが終わった瞬間に出す(§20-8)。それ以外は捨てる。
  if (!brawlerActing(s)) return s.stepHeld ? (brawlerStepping(s, t) ? 'wait' : 'fire') : 'drop';
  if (brawlerTechAllowed(s, k, t) || brawlerStageGuardCancelOk(s, k, t)) return 'fire';
  if (s.lateHeld) return 'wait'; // 判定の後に押した技(§25): 行動の終わりまで残り、呼び手が待機へ戻った瞬間に出す
  return brawlerShouldBufferTechEarly(s, k, t) ? 'wait' : 'drop';
};

/** 技ポイントを払えるか。 */
/** 技の値段。血の覚醒中は0=技ポイントを無視して使い放題(社長指示2026-11-08「覚醒中は技ポイント無視して使い放題」)。 */
/** discount=タイムキーパーの割引(utils/brawlerSkills.brawlerTimeKeeperDiscount・§15)。値段は1未満にしない(覚醒中は0=今どおり)。 */
export const brawlerTechCost = (kind: BrawlerTechKind, awakened = false, discount = 0): number =>
  (awakened ? 0 : Math.max(1, BRAWLER_TECHS[kind].cost - Math.max(0, discount)));
export const brawlerCanPay = (s: BrawlerState, kind: BrawlerTechKind, awakened = false, discount = 0): boolean =>
  s.points >= brawlerTechCost(kind, awakened, discount);

/**
 * 取り消し(research/BRAWLER.md §19-1・§19-2)。いまの行動(通常の段・技)の後隙を、技 kind で取り消せるか。
 *  - 道の表(brawlerRouteAllows)にある組だけ。
 *  - **当たった時だけ**(brawlerHitLanded)・**取り消しの受付の内だけ**(brawlerCancelWindowOpen)。
 *  - 気功→構えは秘奥義の入力の締め(順番が3つ進んでいる)の時だけ。気功は弾なので当たりを問わない(撃った時点で受付が開く)。
 *  - 構えからは取り消せない(構えの間は延長だけ)。飛び蹴りの連続(蹴り→次の蹴り)は取り消しではない(brawlerTechAllowed の連続の受付)。
 * 旧(§11-4): 「同じ技以外・1回の流れで各技1回・構えは当たらなくても後隙からいつでも」は道の表に置き換えた。
 */
export const brawlerTechCancelOk = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean => {
  if (!brawlerActing(s) || (s.phase === 'tech' && (!s.tech || s.tech === 'guard'))) return false;
  if (s.phase === 'tech' && s.tech === 'kick' && kind === 'kick') return false;
  const from = brawlerRouteNodeOf(s);
  const to = brawlerTechNode(kind, 1); // 段・潰し・気功から出す蹴りは1発目
  if (!brawlerRouteAllows(from, to, { secretClose: brawlerSecretClosing(s) })) return false;
  if (!brawlerCancelWindowOpen(s, t)) return false;
  return from === 'kiko' ? true : brawlerHitLanded(s);
};
/**
 * 技を今出せるか(払える以外の条件・§19-1)。
 *  - 構えの間は構えの再入力(延長)だけ。
 *  - 待機からは何でも(今どおり)。**ただしステップの最中は何も出せない**(§20-8=覚えて、ステップの終わりに出す)。
 *  - 飛び蹴りの連続(1・2発目 → 次の蹴り)は今どおり: 判定の後ならいつでも(当たりの止めの間も・当たっていなくても)。3発目(締め)からは出せない。
 *  - それ以外(通常→技・技→技)は取り消しの規則(brawlerTechCancelOk=道の上・当たった・受付の内)。
 */
export const brawlerTechAllowed = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean => {
  // 構えの間は構えの再入力(延長)だけ受け付ける(社長指示2026-11-07「カウンター中もカウンター入力を受け付ける(連続延長発動できる)」)。
  if (isBrawlerGuardingAt(s, t)) return kind === 'guard';
  // ステップの最中は段も技も出せない(§20-8・社長承認2026-11-11=ステップでの取り消しに「隙と速さ」の代償を付ける)。
  if (brawlerStepping(s, t)) return false;
  if (!brawlerActing(s)) return true;
  if (s.phase === 'tech' && s.tech === 'kick' && kind === 'kick') {
    // ★旧「画面全体の止め」を写した止めの最中は出さない(覚えて明けてから出す=brawlerShouldBufferTechEarly・社長指示2026-11-14)。
    return s.resolved && !brawlerInFreezeStop(s, t) && brawlerRouteAllows(brawlerTechNode('kick', s.kickN), brawlerTechNode('kick', s.kickN + 1)) && s.kickN < BRAWLER_KICK_MAX && !s.kickThrow;
  }
  return brawlerTechCancelOk(s, kind, t);
};

/**
 * 流れの当たりの数を n 足す。流れが切れていた(または初めて)なら n から数え直す。
 * ★プレイヤーの「N HIT」の表示は、これではなく「つながっているコンボの数」(utils/brawlerCombo の brawlerLinkDisplay・§23)が書く。
 *   これを使うのは拳鬼(自分の流れの数=ダメージ補正)だけ。
 */
export const brawlerFlowOnHit = (s: BrawlerState, n: number): BrawlerState => {
  if (!(n > 0)) return s;
  const fresh = (s.flowHits ?? 0) <= 0 || (s.flowBrokenAt ?? 0) > 0;
  return { ...s, flowHits: (fresh ? 0 : (s.flowHits ?? 0)) + n, flowBrokenAt: 0 };
};
/** 流れが続く猶予(技の終わり・つながりの受付から ms)。通常攻撃のつながりの切れ(400ms)と同じ。 */
export let BRAWLER_FLOW_GRACE_MS = BRAWLER_CHAIN_RESET_MS; // ×BRAWLER_TEMPO(つながりの切れと同じ)
/** ヒット数の表示が消えていく尺(流れが切れてから・ms)。 */
export const BRAWLER_FLOW_FADE_MS = 800;
/**
 * 構えを延長する(構えの最中の再入力・§9-41)。終わる時刻を「再入力の時刻+1秒」に引き直す(積み上げない)。
 * しゃがみの溜めからやり直さない=構えたまま。行動の時計(startAt)は引き直して、構えの終わり=行動の終わりに揃える。
 */
export const brawlerExtendGuard = (s: BrawlerState, t: number, now: number, weak = false): BrawlerState => ({
  ...s, phase: 'tech', tech: 'guard', startAt: t, windupMs: 0, recoveryMs: BRAWLER_TECHS.guard.recoveryMs,
  stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: true,
  guardUntil: t + BRAWLER_GUARD_MS, guardSince: t, guardRenewAt: now, guardWeak: weak, // 払えずに延長した=弱い構えとして延長(払えれば通常)
});

// ---------------------------------------------------------------------------------------------
// ジャスト構え・ステップ(research/BRAWLER.md §12-2・§12-3・社長指示2026-11-08)
// ---------------------------------------------------------------------------------------------
/** 当たる直前この ms 以内に構え(または延長)が出ていた受けは「ジャスト」。 */
export const BRAWLER_JUST_MS = 120;
/** ジャストの時、攻撃してきた相手の気絶に掛ける倍率。 */
export const BRAWLER_JUST_STUN_MULT = 2;
/** ジャストか(構えの始まり・延長の時刻 guardSince から t まで JUST_MS 以内)。t は gameTime。 */
/** windowMs=ジャストの窓(強化「カウンター受付」で延びる=utils/brawlerSkills.brawlerJustWindowMs・§15)。 */
export const brawlerIsJustGuard = (s: Pick<BrawlerState, 'guardSince' | 'guardUntil'>, t: number, windowMs = BRAWLER_JUST_MS): boolean =>
  s.guardSince !== undefined && s.guardUntil > t && t >= s.guardSince && t - s.guardSince <= windowMs;

/** ジャスト構えで受けた時に足す技ポイント(社長指示2026-11-12「ジャストカウンターになったら技ポイントが5溜まる」)。 */
export const BRAWLER_JUST_GUARD_POINTS = 5;
/**
 * ジャスト構えの受けで技ポイントを足す(上限で止める)。構え1回(guardSince ごと・延長は新しい構え)につき1度だけ。
 * just=間引かれない受けでジャストだったか(呼び手が判定済み)。足した構えは justPointsFor に覚える(上限で増えなくても覚える)。
 * 増えた時だけ gainAt を打つ。足さない時は状態は同じ物を返す。
 */
export const brawlerAfterJustGuardPoints = (s: BrawlerState, cap: number, just: boolean, now: number): BrawlerState => {
  if (!just || s.guardSince === undefined || s.justPointsFor === s.guardSince) return s;
  const next = Math.max(s.points, Math.min(cap, s.points + BRAWLER_JUST_GUARD_POINTS)); // 上限で止める(上限を超えて持っていても減らさない)
  return next === s.points ? { ...s, justPointsFor: s.guardSince } : { ...s, points: next, gainAt: now, justPointsFor: s.guardSince };
};

/** ステップの距離(px)と時間(ms)。加速→減速。出始めだけ無敵(BRAWLER_STEP_IFRAME_MS)。 */
export const BRAWLER_STEP_PX = 100;
export let BRAWLER_STEP_MS = 180; // ×BRAWLER_TEMPO(係数1.0の値)
/**
 * ステップの出始めの無敵(ms・壁時計。テンポ係数は掛けない)。社長指示2026-11-12「格闘のステップに無敵時間を入れる。出始めの0.2秒のみ」。
 * ステップの長さ(BRAWLER_STEP_MS)より長ければステップの長さで打ち切る。乗せる先はプレイヤーの被弾無敵(invulnerable/invulnerableTime)。
 */
export const BRAWLER_STEP_IFRAME_MS = 200;
/** ステップの速さの形(経過の割合 p=0..1 → 0..1)。正弦の1山=出だしと終わりが0(慣性)。 */
export const brawlerStepFactor = (p: number): number => (p <= 0 || p >= 1 ? 0 : Math.sin(Math.PI * p));
/** 正弦の1山で距離 dist を ms で進む最大の速さ(px/s)。平均は最大の 2/π。 */
export const brawlerStepSpeed = (dist: number, ms: number): number =>
  Math.max(0, dist) / Math.max(0.001, (ms / 1000) * (2 / Math.PI));
/** ステップの最中か(gameTime)。この間は通常攻撃も技も出せない(§20-8)。 */
export const brawlerStepping = (s: Pick<BrawlerState, 'stepUntil'>, t: number): boolean =>
  s.stepUntil !== undefined && t < s.stepUntil;
/** ステップの最中に覚えた通常攻撃を、いま出すか(ステップが終わった・待機・§20-8)。 */
export const brawlerStepHeldPressFire = (s: BrawlerState, t: number): boolean =>
  s.phase === 'idle' && s.buffered && s.stepHeld === true && !brawlerStepping(s, t);
/**
 * ステップを出せるか(§12-3・§19-1)。待機からは今どおり。後隙を取り消せるのは**当たった1〜4段目の後隙だけ**(止めが明けた後)。
 * 技の後隙・5段目・空振り(防がれた当たり)の後隙は取り消せない=「技のあと、ちゃんと隙」(旧: 通常攻撃と技の後隙ならどれでも取り消せた)。
 * 前隙、止めの間、構えの最中、秘奥義の間、ステップの最中は出せない。
 */
export const brawlerStepAllowed = (s: BrawlerState, t: number): boolean => {
  if (s.secret) return false;
  if (isBrawlerGuardingAt(s, t)) return false;
  if (s.stepUntil !== undefined && t < s.stepUntil) return false;
  if (s.phase === 'idle') return true;
  if (s.phase !== 'attack' || s.stage < 1 || s.stage > 4) return false;
  if (!brawlerHitLanded(s) || brawlerInHitstop(s, t)) return false;
  return brawlerElapsed(s, t) < brawlerTotalMs(s);
};
/**
 * ★技ポイントが足りないフリックを、その向きへのステップに変えるか(社長指示2026-11-12「技ポイントが無い状態でフリックすると、その方向にステップ発動」)。
 * 変えるのは「その技を今出せる(道・受付・構えの延長などポイント以外の条件は通った)のに、値段だけ払えない」時で、しかもステップを今出せる時だけ
 * (brawlerStepAllowed=ステップの入口と同じ)。ステップを出せない時(技の最中・構えの最中など)は今どおり拒否。
 * 呼び手は、秘奥義の最中・方向の決まらない入力・道の外の技・技の先行入力として覚える入力をここへ渡さない(それらは今どおり)。
 * kind='guard'(構え)は変えない(払えない時は弱い構え・utils/brawlerGuard.brawlerGuardModeFor)。
 */
export const brawlerFlickStepInstead = (s: BrawlerState, t: number, canPay: boolean, kind?: BrawlerTechKind): boolean =>
  kind !== 'guard' && !canPay && brawlerStepAllowed(s, t); // ★構えは払えなくても弱い構えとして出る=ステップに変えない(社長指示2026-11-12)
/**
 * 覚えた技(技の先行入力)の、フリックの向き(長さ1)。覚えた入力は技の種類しか持たないので、classifyBrawlerFlick の逆=上下左右の向きに戻す
 * (飛び蹴り=右・気功=左・構え=上・大踏み潰し=下。踵落としは下で入れた入力=下)。斜めに入れた入力も上下左右のどれかになる。
 * 出す瞬間に値段が払えずステップに変える時(社長裁定2026-11-12・案A)の向きに使う。
 */
export const brawlerFlickDirOf = (kind: BrawlerTechKind, heel = false, up = false): { x: number; y: number } =>
  heel || kind === 'stomp' ? { x: 0, y: 1 } : up || kind === 'guard' ? { x: 0, y: -1 } : kind === 'kiko' ? { x: -1, y: 0 } : { x: 1, y: 0 };
/** ステップを始めた状態。後隙を取り消す=その行動を終えた扱い(つながり・秘奥義の数えは終わった時と同じ)。先行入力は捨てる。 */
export const brawlerStepStart = (s: BrawlerState, t: number, now: number): BrawlerState => {
  const base = s.phase === 'idle' ? s : brawlerFinish(s, t).state;
  return { ...base, buffered: false, techBuffer: undefined, stepBuffer: undefined, stepHeld: false, stepUntil: t + BRAWLER_STEP_MS, stepAt: now };
};

/** ステップの先行入力を覚えておく長さ(ms・gameTime)。成立からこの時間以内に受け付けられるようになれば出す(§12-3b・叩き台)。 */
export const BRAWLER_STEP_BUFFER_MS = 200;
/**
 * 受け付けない時間に成立したステップを覚えた状態(§12-3b)。1つだけ・上書き。
 * 先行入力は全部で1つ(§12-4 と同じ考え)=覚えていた通常攻撃・技の先行入力は捨てる(最後の入力を優先)。
 */
export const brawlerBufferStep = (s: BrawlerState, x: number, y: number, t: number): BrawlerState =>
  ({ ...s, buffered: false, techBuffer: undefined, stepBuffer: { x, y, at: t } });
/**
 * 覚えたステップをどうするか(§12-3b)。null=覚えていない / 'fire'=いま出す / 'wait'=まだ受け付けない / 'expire'=期限切れで捨てる。
 * 成立から BRAWLER_STEP_BUFFER_MS ちょうどまでは出せる。時計が戻った(新しい出撃など)時も捨てる。
 */
export const brawlerStepBufferDecision = (s: BrawlerState, t: number): 'fire' | 'wait' | 'expire' | null => {
  const b = s.stepBuffer;
  if (!b) return null;
  if (t < b.at || t - b.at > BRAWLER_STEP_BUFFER_MS) return 'expire';
  return brawlerStepAllowed(s, t) ? 'fire' : 'wait';
};

/**
 * ★踵落とし(社長指示2026-11-11「3段目派生:踵落とし」「2発目の後に下」・research/BRAWLER.md §29)。
 * 飛び蹴りの2発目の続きで下(大踏み潰しの入力)を入れると、3発目が蹴り飛ばしの代わりに踵落としになる。
 * 「2発目の続き」=2発目の最中(判定の前は覚える・後は出る)か、2発目が終わって連続の受付の内。出せるか・覚えるかは次の蹴りと同じ規則。
 * この間の下は大踏み潰しにならない(2発目→大踏み潰しの取り消しは、踵落とし→大踏み潰しへ移った)。
 */
export const brawlerHeelInput = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean =>
  kind === 'stomp' && !isBrawlerGuardingAt(s, t)
  && ((s.phase === 'tech' && s.tech === 'kick' && s.kickN === BRAWLER_KICK_MAX - 1 && !s.kickThrow)
    || (!brawlerActing(s) && brawlerNextKickN(s, t) === BRAWLER_KICK_MAX));
/** 踵落としの値段=飛び蹴りの値段に足す分(社長指示「ポイントは+1必要」)。血の覚醒中は足さない(技ポイントを無視)。 */
export const BRAWLER_HEEL_EXTRA_COST = 1;
export const brawlerHeelCost = (awakened = false, discount = 0): number =>
  brawlerTechCost('kick', awakened, discount) + (awakened ? 0 : BRAWLER_HEEL_EXTRA_COST);
/** 踵落としの威力(蹴り飛ばしと同じ・叩き台)。 */
export const BRAWLER_HEEL_MULT = 1.2;
/** 次の蹴りが何発目か(連続の受付の中なら続き・外なら1発目)。 */
export const brawlerNextKickN = (s: BrawlerState, t: number): number =>
  (s.kickCount > 0 && s.kickCount < BRAWLER_KICK_MAX && t <= s.kickChainUntil) ? s.kickCount + 1 : 1;

/**
 * ★蹴り上げ(社長指示2026-11-19・research/BRAWLER.md §34-1・§34-6・§34-8)。飛び蹴りの2発目(空中蹴り)の続きで上(構えの入力)を入れると、
 * 次の蹴り(3発目)が蹴り上げになる(踵落としと同じ位置)。1発目の後の上は今までどおり構え。蹴りの連続はここで終わる(取り消しは気功だけ)。
 * 「続き」=蹴りの最中(判定の前は覚える・後は出る)か、蹴りが終わって連続の受付の内。踵落としと同じ読み替えの層。
 * ★§34-6 #4: 上が蹴り上げになるのは「直前の蹴りが当たっていて、かつ蹴り上げを払える時」だけ。外れた蹴りの後・払えない時の上は今までどおり構え。
 *   判定の前(当たるかまだ分からない)は蹴り上げとして覚え、出す瞬間に brawlerKickUpReady で見直す(だめなら構えへ戻す=呼び手)。
 */
export const brawlerKickUpSlot = (s: BrawlerState, t: number): boolean =>
  !isBrawlerGuardingAt(s, t) && !s.secret
  // ★§34-8(社長指示2026-11-19「蹴り上げと踵落としは、空中蹴り の後ね」): 2発目(空中蹴り)の続きだけ=踵落としと同じ3発目の位置。1発目の後の上は構え。
  && ((s.phase === 'tech' && s.tech === 'kick' && s.kickN === BRAWLER_KICK_MAX - 1 && !s.kickHeel && !s.kickThrow)
    || (!brawlerActing(s) && brawlerNextKickN(s, t) === BRAWLER_KICK_MAX));
/** 上の入力を蹴り上げとして扱うか(canPay=蹴り上げの値段を払えるか・呼び手が見る)。判定の前の蹴りの最中は true(覚えて出す瞬間に見直す)。 */
export const brawlerKickUpInput = (s: BrawlerState, kind: BrawlerTechKind, t: number, canPay: boolean): boolean =>
  kind === 'guard' && brawlerKickUpSlot(s, t)
  && ((brawlerActing(s) && !s.resolved) || (brawlerHitLanded(s) && canPay));
/** 覚えた蹴り上げを、出す瞬間に本当に蹴り上げで出すか(続きの内・直前の蹴りが当たった・払える)。 */
export const brawlerKickUpReady = (s: BrawlerState, t: number, canPay: boolean): boolean =>
  brawlerKickUpSlot(s, t) && brawlerHitLanded(s) && canPay;
/** 蹴り上げの値段=踵落としと同じ(飛び蹴り+1・血の覚醒中は0・タイムキーパーは飛び蹴りの割引)。 */
export const brawlerKickUpCost = (awakened = false, discount = 0): number => brawlerHeelCost(awakened, discount);
/**
 * ★土竜(research/BRAWLER.md §35・社長指示2026-11-20): 地割りの溜め(出だし)の最中の上で派生。出だしの最初 BRAWLER_MOGURA_IGNORE_MS(実時間)は受け付けない
 * (下フリックの指の残りを拾わない)。そこから当たる瞬間まで。値段=地割り+1(踵落としと同じ考え方・タイムキーパー/血の覚醒も同じ規則)。
 */
export const BRAWLER_MOGURA_IGNORE_MS = 60;
export const BRAWLER_MOGURA_EXTRA_COST = 1;
export const brawlerMoguraCost = (awakened = false, discount = 0): number =>
  brawlerTechCost('stomp', awakened, discount) + (awakened ? 0 : BRAWLER_MOGURA_EXTRA_COST);
/** 地割りから派生する時に足して払う分(=土竜の値段−地割りの値段)。 */
export const brawlerMoguraExtraCost = (awakened = false, discount = 0): number =>
  brawlerMoguraCost(awakened, discount) - brawlerTechCost('stomp', awakened, discount);
/** 上の入力で土竜へ派生できる所か(地割りの出だしの最中・最初の60msの後・当たる前・まだ派生していない)。nowMs=壁時計。 */
export const brawlerMoguraWindow = (s: Pick<BrawlerState, 'phase' | 'tech' | 'resolved' | 'pressAt'> & Pick<Partial<BrawlerState>, 'mogura'>, nowMs: number): boolean =>
  s.phase === 'tech' && s.tech === 'stomp' && !s.resolved && !s.mogura && s.pressAt !== undefined && nowMs - s.pressAt >= BRAWLER_MOGURA_IGNORE_MS;
/** 蹴り上げの威力=踵落としと同じ(§34-1)。 */
export const BRAWLER_KICKUP_MULT = BRAWLER_HEEL_MULT;

/**
 * ★構えを技で取り消す(社長指示2026-11-19「レベル１から構えは技でキャンセル可能」・research/BRAWLER.md §34-2・§34-6 #8)。
 * 構えの最中(出だしから戻りの終わりまで全部)に、構え以外の技(飛び蹴り・気功・大踏み潰し)を入れると、構えを終えてその技を出す。
 * 当たった時だけの規則(brawlerTechCancelOk)は掛けない。構えの再入力(上)は今までどおり延長。払える/払えないは呼び手が見る。
 * プレイヤーだけが使う(拳鬼の道=brawlerTechAllowed は変えない)。
 */
export const brawlerGuardCancelOk = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean =>
  kind !== 'guard' && !s.secret && s.phase === 'tech' && s.tech === 'guard' && isBrawlerGuardingAt(s, t);
/** 通常の段(1〜5段目)の後隙か(判定を解いた後・行動の終わりの前。当たりの止めの最中も含む)。秘奥義の連撃・ステップ・構えの最中は外す。 */
const brawlerStageGuardSlot = (s: BrawlerState, t: number): boolean =>
  !s.secret && s.phase === 'attack' && s.stage >= 1 && s.stage <= 5 && s.resolved
  && !isBrawlerGuardingAt(s, t) && !brawlerStepping(s, t) && brawlerElapsed(s, t) < brawlerTotalMs(s);
/**
 * ★通常の段の後隙を構えで取り消す(社長指示2026-11-26「格闘は通常技からは、構え をキャンセルで出せる」)。
 * 1〜5段目の判定を解いた後(後隙)なら、当たっても空振りでも構え(↑)へ取り消せる。溜め(前隙)の間は出せない(押しても捨てる)。
 * 当たりの止めの最中は出さない=覚えて、止めが明けた瞬間に出す(brawlerShouldBufferTech / brawlerTechBufferDecision・他の取り消しと同じ作法)。
 * 構えへ移れば段は終わる=その段で1回。取り消しの受付(BRAWLER_CANCEL_WINDOW_MS)は掛けない(後隙の終わりまで)。払える/払えないは呼び手が見る。
 * 通常の段以外(技・構え自身)からの構えは今のまま(道の表 brawlerRouteAllows)。プレイヤーだけが使う(拳鬼の道=brawlerTechAllowed は変えない)。
 */
export const brawlerStageGuardCancelOk = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean =>
  kind === 'guard' && brawlerStageGuardSlot(s, t) && !brawlerInHitstop(s, t);
/**
 * 構えを取り消した状態(§34-2): 構えの効果(被害の無効・弾の打ち返し・レーザーの盾・受けの窓=どれも guardUntil を読む)を全部切る。
 * まだ撃っていない反撃の気功(§32)は出さない(§34-6 #8)。受けた直後の前隙なし(quickUntil)は触らない。
 */
export const brawlerEndGuardForCancel = (s: BrawlerState, t?: number, nowMs?: number): BrawlerState => ({
  ...s, guardUntil: 0, guardKiko: undefined, guardCancelHeld: false,
  // 光を一度外へ押して短く消す絵の起点(描画だけ・監査 #9)。t/nowMs が無ければ付けない。
  ...(t !== undefined && nowMs !== undefined ? { guardCancelAt: nowMs, guardCancelRemain: Math.max(0, Math.min(1, (s.guardUntil - t) / BRAWLER_GUARD_MS)) } : {}),
});
/** 構えを取り消した時の光の消え方(監査 #9): 0..1 の残り(取り消した瞬間の光の強さから 150ms で減速しながら消える)と、外へ一度押す膨らみ。 */
export const BRAWLER_GUARD_CANCEL_FADE_MS = 150;
export const brawlerGuardCancelGlow = (since: number, remain0: number): { remain: number; pop: number } => {
  if (!(since >= 0) || since >= BRAWLER_GUARD_CANCEL_FADE_MS) return { remain: 0, pop: 0 };
  const k = since / BRAWLER_GUARD_CANCEL_FADE_MS;
  return { remain: Math.max(0.35, remain0) * (1 - k * k), pop: 1 - k };
};

// ---------------------------------------------------------------------------------------------
// ★空中投げ(格闘+パニッシャー・社長指示2026-11-19・research/BRAWLER.md §34-3)。数値は叩き台。
// ---------------------------------------------------------------------------------------------
/** 掴んでいる間(ms・実時間)。この間は画面全体の止め(triggerHitstop)=ループごと止まる。 */
export const BRAWLER_GRAB_MS = 400;
/** 投げ先を探す距離(px・掴んだ敵の中心から相手の帯の縁まで)。 */
export const BRAWLER_THROW_RANGE = 360;
/** 投げの最高速(px/秒)。出だしで一気に加速してから、この速さで飛ぶ。 */
export const BRAWLER_THROW_SPEED = 1600;
/** 投げの出だしの加速に使う時間の割合(0..1)。 */
export const BRAWLER_THROW_ACCEL_FRAC = 0.18;
/** ぶつかった所の爆撃の半径(skillExplosionMult は呼び手が掛ける)・威力(気功の爆発の何倍か)・押し(気功の爆発の押しの何倍か)。 */
export const BRAWLER_THROW_BLAST_RADIUS = 160;
export const BRAWLER_THROW_BLAST_MULT = 2;
export const BRAWLER_THROW_KB_MULT = 2;
/** スープレックスの威力(踵落とし×これ・近接扱い)。 */
export const BRAWLER_SUPLEX_MULT = BRAWLER_HEEL_MULT * 1.5;
/** ★スープレックスの叩きつけの小爆発(§34-9・社長指示2026-11-20)の半径(px・叩き台。空中投げの爆撃 160 より小さい)。爆発の規約で skillExplosionMult が掛かる。 */
export const BRAWLER_SUPLEX_BLAST_RADIUS = 90;
/**
 * 投げの進み(経過の割合 u=0..1 → 距離の割合 0..1)。出だしの ACCEL_FRAC の間は2乗で加速(速さ0から)、その後は最高速で一定。
 * 慣性: 止まった所から速さを上げて飛ぶ(当たった所で爆撃=そこで止まる)。
 */
export const brawlerThrowProgress = (u: number): number => {
  const a = BRAWLER_THROW_ACCEL_FRAC;
  const q = Math.max(0, Math.min(1, u));
  const v = 1 / (1 - a / 2); // 一定の区間の速さ(全体の距離=1)
  return q < a ? v * q * q / (2 * a) : Math.min(1, v * (a / 2 + (q - a)));
};
/**
 * ★投げられて飛ぶ敵の回り(絵だけ・社長承認2026-11-19・監査 B15)。飛ぶ向きへ頭から縦に転がる(dir=+1 で時計回り)。浮いた敵は回さない、の例外=投げられた敵だけ。
 *  - 飛ぶ間: 止まった所から加速して回る(2乗)。ぶつかる瞬間に THROW_SPIN_TURNS 回(1.5回=逆さまでぶつかる)。
 *  - ぶつかってから爆撃まで(画面全体の止め): その角度のまま(描画の時計が止まる)。
 *  - 爆撃(endAt)の後: ぶつかった時の回る速さを引き継いで減速し、次の正立で止まる(慣性・SETTLE 90〜360ms)。
 * el=投げてからの ms・flyMs=飛ぶ長さ・hitEl=ぶつかった時の el(まだなら undefined)・sinceEnd=爆撃からの ms(まだなら undefined)。返り値=回転(rad)。正立で止まり切ったら0。
 */
export const BRAWLER_THROW_SPIN_TURNS = 1.5;
export const BRAWLER_THROW_SPIN_SETTLE_MIN_MS = 90;
export const BRAWLER_THROW_SPIN_SETTLE_MAX_MS = 360;
/** ぶつかった時(投げてから hitEl ms・壁で早く止まった時は flyMs より短い)の角度の大きさ・回る速さ(rad/ms)・次の正立までの残り・止まるまでの ms。 */
export const brawlerThrowSpinAtHit = (flyMs: number, hitEl: number): { th: number; w: number; rest: number; settleMs: number } => {
  const T = Math.max(1, flyMs);
  const u = Math.max(0, Math.min(1, hitEl / T));
  const full = 2 * Math.PI * BRAWLER_THROW_SPIN_TURNS;
  const th = full * u * u;
  const w = 2 * full * u / T;
  const rest = Math.ceil(th / (2 * Math.PI) - 1e-9) * 2 * Math.PI - th;
  const settleMs = w > 1e-9 ? Math.max(BRAWLER_THROW_SPIN_SETTLE_MIN_MS, Math.min(BRAWLER_THROW_SPIN_SETTLE_MAX_MS, 3 * rest / w)) : BRAWLER_THROW_SPIN_SETTLE_MIN_MS; // 3乗の減速の出だしの速さ=ぶつかる時の速さ
  return { th, w, rest, settleMs };
};
export const brawlerThrowSpin = (el: number, flyMs: number, dir: number, hitEl?: number, sinceEnd?: number): number => {
  if (!(el >= 0)) return 0;
  const side = dir < 0 ? -1 : 1;
  const T = Math.max(1, flyMs);
  const full = 2 * Math.PI * BRAWLER_THROW_SPIN_TURNS;
  if (hitEl === undefined) { const u = Math.min(1, el / T); return side * full * u * u; }
  const h = brawlerThrowSpinAtHit(flyMs, hitEl);
  if (sinceEnd === undefined || !(sinceEnd >= 0)) { const u = Math.min(el, hitEl) / T; return side * full * Math.min(1, u) * Math.min(1, u); }
  if (sinceEnd >= h.settleMs) return 0;
  const k = sinceEnd / h.settleMs;
  return side * (h.th + h.rest * (1 - (1 - k) * (1 - k) * (1 - k)));
};
/** 投げの長さ(ms)。最高速 BRAWLER_THROW_SPEED で一定の区間を飛び、出だしの加速の分だけ平均が遅い。 */
export const brawlerThrowMs = (distPx: number): number =>
  Math.max(1, Math.round(Math.max(0, distPx) / BRAWLER_THROW_SPEED * 1000 / (1 - BRAWLER_THROW_ACCEL_FRAC / 2)));

// ---------------------------------------------------------------------------------------------
// ★密着の構え=掴んでスープレックス/蹴りバク宙(社長指示2026-11-19・research/BRAWLER.md §34-7)。数値は叩き台。
// ---------------------------------------------------------------------------------------------
/** 密着=体の縁どうしの距離がこれ以内(px)。 */
export const BRAWLER_CONTACT_PX = 24;
/** 掴む長さ(ms・gameTime=時間は止めない)。 */
export const BRAWLER_CONTACT_GRAB_MS = 200;
/** 蹴りバク宙で下がる距離(px)と、跳んで下がる長さ(ms)。蹴った瞬間に最速→着地へ減速(踏み込みの器の 'decel')。 */
export const BRAWLER_FLIPKICK_PX = 40; // ★社長指示2026-11-20「サマーソルト離れすぎ、1/3くらいでいいかも」: 実測の下がる距離 約300px → 約80px(踏み込みの器は GAME_SPEED が掛かる=定数の約2倍進む)
export const BRAWLER_FLIPKICK_MS = 420;
/** バク宙の跳ぶ高さ(px・絵だけ)。 */
export const BRAWLER_FLIPKICK_JUMP_PX = 46;
/**
 * 密着している相手(§34-7)。プレイヤーの中心 (px,py)・体の半幅 halfW から、敵の帯の縁までの距離 − halfW ≤ BRAWLER_CONTACT_PX の、一番近い1体。
 * 格闘の相手にできない敵(死体・触れられない=投げられて飛んでいる等)と、空中の敵(airborne=呼び手が渡す・空中投げの領分)は対象外。
 */
export const brawlerContactTarget = (
  enemies: readonly Enemy[], px: number, py: number, halfW: number, airborne: (e: Enemy) => boolean,
): Enemy | null => {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!isBrawlerTargetable(e) || airborne(e)) continue;
    const d = brawlerDistTo(px, py, e) - Math.max(0, halfW);
    if (d > BRAWLER_CONTACT_PX || d >= bestD) continue;
    best = e; bestD = d;
  }
  return best;
};
/** ★密着の掴みの一瞬の時間停止(ms・壁時計・§34-10「ガッと掴むフレーム(ここが時間止まってる時)」・叩き台。空中投げの掴み 400 より短い)。 */
export const BRAWLER_CONTACT_FREEZE_MS = 250;
/** 掴みの一瞬に組み付く姿へ入る長さ(ms・壁時計=時間停止の間も動く・慣性つき)。 */
export const BRAWLER_CONTACT_GRIP_IN_MS = 70;
/**
 * ★掴む時に相手へ食い込んで見せる量(社長指示2026-11-20「掴むとき、両方、少し敵に食い込むように(掴んでる風)みせたい」)。絵だけ・判定と位置は動かさない。
 * 体の縁から相手の縁までの隙間を詰めたうえで、体の幅のこの割合だけ相手の縁を越える(通り抜けて見えない程度)。上限 BRAWLER_CONTACT_GRIP_MAX_PX。
 */
export const BRAWLER_CONTACT_GRIP_OVERLAP_K = 0.25;
export const BRAWLER_CONTACT_GRIP_MAX_PX = 40;
/** 掴む間の寄せ量(px)。gapPx=体の縁から相手の帯の縁までの隙間・bodyW=プレイヤーの体の幅。 */
export const brawlerContactGripPx = (gapPx: number, bodyW: number): number =>
  Math.min(BRAWLER_CONTACT_GRIP_MAX_PX, Math.max(0, gapPx) + Math.max(0, bodyW) * BRAWLER_CONTACT_GRIP_OVERLAP_K);
/** 密着した相手の区分 → 出す技(雑魚=スープレックス / 強個体・ボス級=蹴りバク宙)。 */
export const brawlerContactMode = (cls: 'mob' | 'strong' | 'boss'): 'suplex' | 'flipkick' => (cls === 'mob' ? 'suplex' : 'flipkick');
/**
 * 密着の構えを始めた状態(構えの代わり・§34-7)。締めの蹴り(kickThrow=続きを持たない)の形: 前隙=掴み・後隙=スープレックスは蹴り上げ(3発目)と同じ後隙/
 * 蹴りバク宙は下がる間(着地=行動の終わり=そこから何でも出せる)。構えの窓は張らない(guardUntil は触らない)。値段は呼び手が払う。
 */
export const brawlerStartContactGrab = (s: BrawlerState, t: number, enemyId: string, mode: 'suplex' | 'flipkick'): BrawlerState => {
  const k = brawlerStartTech(s, 'kick', t, BRAWLER_KICK_MAX);
  return {
    ...k, kickThrow: true, kickChargeMs: 0, windupMs: BRAWLER_CONTACT_GRAB_MS,
    recoveryMs: mode === 'flipkick' ? BRAWLER_FLIPKICK_MS : k.recoveryMs,
    kickCount: 0, kickChainUntil: 0, techChain: ['guard'], contactGrab: { enemyId, mode },
    // スープレックス: 掴みの後半で持ち上げて反り始め、反りの頂点=掴みの終わり(判定)で叩きつける(クリエイティブ監査 #3)。
    ...(mode === 'suplex' ? { suplexAt: t + BRAWLER_CONTACT_GRAB_MS - BRAWLER_SUPLEX_RISE_MS } : {}),
    guardUntil: 0, guardKiko: undefined, // 構えではない=被害の無効・打ち返し・受けの窓は無い(§34-7)
  };
};
/** 蹴りバク宙の回転(0..1 の進み → rad・負=後ろへ回る)。1回転・蹴った瞬間が速く、着地で止まる(2乗の減速)。 */
export const brawlerFlipSpin = (q: number): number => {
  const k = Math.max(0, Math.min(1, q));
  // 蹴った直後から速く回り(頂点の前に大半を回し切る)、着地へ減速して止まる(3乗の減速・クリエイティブ監査 #11)。
  return -2 * Math.PI * (1 - (1 - k) ** 3);
};
/** 蹴りバク宙の跳びの頂点の位置(進みの割合)。速く上がって、重く落ちる(左右非対称)。 */
export const BRAWLER_FLIPKICK_APEX = 0.35;
/** 蹴りバク宙の跳びの高さ(0..1 の進み → 0..1)。上がりは減速(速く上がる)・落ちは重力(加速して落ちる=着地の瞬間が一番速い)。 */
export const brawlerFlipArc = (q: number): number => {
  const k = Math.max(0, Math.min(1, q));
  if (k <= BRAWLER_FLIPKICK_APEX) { const u = k / BRAWLER_FLIPKICK_APEX; return 1 - (1 - u) * (1 - u); }
  const u = (k - BRAWLER_FLIPKICK_APEX) / (1 - BRAWLER_FLIPKICK_APEX);
  return 1 - u * u;
};
/** 掴みの体の光(クリエイティブ監査 #4・#8): 掴んだ瞬間に一度膨らみ(80ms)、その後は落ち着いた強さで保つ(脈打たない=構えの光と見分ける)。since=掴んでからの ms。 */
export const brawlerGrabGlow = (since: number): number => {
  if (!(since >= 0)) return 0;
  if (since < 80) { const k = since / 80; return 0.4 + 0.6 * (1 - (1 - k) * (1 - k)); }
  const k = Math.min(1, (since - 80) / 160);
  return 1 - 0.35 * k * k * (3 - 2 * k);
};
/** 掴みの寄り(クリエイティブ監査 #7): 掴みの間に BRAWLER_GRAB_MS かけてゆっくり寄り、放したら BRAWLER_GRAB_ZOOM_OUT_MS で戻る。倍率の上乗せ(0=寄り無し)。 */
export const BRAWLER_GRAB_ZOOM = 0.12;
export const BRAWLER_GRAB_ZOOM_OUT_MS = 260;
export const brawlerGrabZoom = (sinceGrab: number, sinceRelease: number | null): number => {
  const sm = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
  if (sinceRelease === null) return sinceGrab >= 0 ? BRAWLER_GRAB_ZOOM * sm(sinceGrab / BRAWLER_GRAB_MS) : 0;
  if (!(sinceRelease >= 0) || sinceRelease >= BRAWLER_GRAB_ZOOM_OUT_MS) return 0;
  return BRAWLER_GRAB_ZOOM * (1 - sm(sinceRelease / BRAWLER_GRAB_ZOOM_OUT_MS));
};
/** 投げの体の振り(クリエイティブ監査 #2): 放した瞬間から、後ろへ引いて(前半)前へ大きく振り抜き、戻す。since=投げてからの ms(gameTime)。 */
export const BRAWLER_THROW_SWING_MS = 120;
export const BRAWLER_THROW_SETTLE_MS = 110;
export const brawlerThrowSwing = (since: number): { lean: number; push: number; on: boolean } => {
  if (!(since >= 0) || since >= BRAWLER_THROW_SWING_MS + BRAWLER_THROW_SETTLE_MS) return { lean: 0, push: 0, on: false };
  const eo = (u: number) => 1 - (1 - u) * (1 - u);
  if (since < BRAWLER_THROW_SWING_MS * 0.3) { const k = eo(since / (BRAWLER_THROW_SWING_MS * 0.3)); return { lean: -0.4 * k, push: -4 * k, on: true }; }
  if (since < BRAWLER_THROW_SWING_MS) { const k = eo((since - BRAWLER_THROW_SWING_MS * 0.3) / (BRAWLER_THROW_SWING_MS * 0.7)); return { lean: -0.4 + 1.0 * k, push: -4 + 20 * k, on: true }; }
  const k = (since - BRAWLER_THROW_SWING_MS) / BRAWLER_THROW_SETTLE_MS;
  const s = 1 - k * k * (3 - 2 * k);
  return { lean: 0.6 * s, push: 16 * s, on: true };
};

// ---------------------------------------------------------------------------------------------
// 入力の分類(§3-1・§7-5)
// ---------------------------------------------------------------------------------------------
/** フリックの向きを上下左右へ。縦と横の大きい方。同じ大きさは横を優先(§7-5)。画面の上=y負。 */
export const classifyBrawlerFlick = (dx: number, dy: number): BrawlerTechKind | null => {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < 1e-6 && ay < 1e-6) return null;
  if (ax >= ay) return dx < 0 ? 'kiko' : 'kick';
  return dy < 0 ? 'guard' : 'stomp';
};

/** 指離しの直前の短い窓だけを見るフリック判定(VirtualJoystick から移設・タッチと共有)。 */
export const detectFlickFromSamples = (
  samples: readonly { x: number; y: number; t: number }[], windowMs: number, minDist: number, minSpeed: number,
): { x: number; y: number; dt: number } | null => {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) {
    if (s.t >= last.t - windowMs) { first = s; break; }
  }
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const dist = Math.hypot(dx, dy);
  const dt = Math.max(1, last.t - first.t);
  if (dist < minDist || dist / dt < minSpeed) return null;
  return { x: dx / dist, y: dy / dist, dt };
};

// ---------------------------------------------------------------------------------------------
// 相手の選び方・当たりの形(§7-4・§7-9)
// ---------------------------------------------------------------------------------------------
/** 狙える敵(死神の徘徊体・死体を除く)=銃の狙いと同じ式(newGunsTick の aimableEnemies から移設・§8-5)。 */
export const isAimableEnemy = (e: Pick<Enemy, 'type' | 'reaperChaser' | 'corpseUntil'>): boolean =>
  !(isReaperFamily(e.type) && !isTerminalReaper(e)) && !isCorpse(e);
/** 格闘の相手にしてよい敵(§7-4: 死体・触れられない・狙えない敵を除く)。 */
export const isBrawlerTargetable = (e: Enemy): boolean => e.health > 0 && isAimableEnemy(e) && !isUntouchable(e);

/** 点 (px,py) から敵の当たり判定の帯の最近点までの距離(近接の物差し `enemyMeleeDist` と同じ式)。 */
export const brawlerDistTo = (px: number, py: number, e: Enemy): number => {
  const r = enemyRangeRect(e);
  const nx = Math.max(r.x, Math.min(px, r.x + r.width));
  const ny = Math.max(r.y, Math.min(py, r.y + r.height));
  return Math.hypot(px - nx, py - ny);
};
/**
 * 起点から敵が壁の向こうか。見通しの先は箱の**最寄りの点(少し内側)**=小さな敵は今までどおり箱の中心、
 * 大きな箱(研究所の塊)は殴る側の面(§9-75・社長「はい」=共通の作りで直す)。
 */
const blocked = (ox: number, oy: number, e: Enemy, walls: readonly Rect[]): boolean => {
  if (walls.length === 0) return false;
  const c = meleeImpactPoint(ox, oy, e);
  return segmentBlocked(ox, oy, c.x, c.y, walls as Rect[]);
};

/** 一番近い相手(半径の内側・壁の向こうは除く)。 */
export const pickBrawlerTarget = (
  enemies: readonly Enemy[], px: number, py: number, radius: number, walls: readonly Rect[] = [],
): Enemy | null => {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!isBrawlerTargetable(e)) continue;
    const d = brawlerDistTo(px, py, e);
    if (d > radius || d >= bestD) continue;
    if (blocked(px, py, e, walls)) continue;
    best = e; bestD = d;
  }
  return best;
};
/**
 * ★コンボの狙い(社長指示2026-11-12「格闘、コンボ中は最初にヒットした敵を狙い続けるようにして」)。いまコンボが続いていれば、覚えている狙いの id。
 * コンボ=「N HIT」の表示(flowHits>0 で、切れた時刻 flowBrokenAt が立っていない)。切れたら忘れる(undefined)。
 */
export const brawlerComboLockId = (s: Pick<BrawlerState, 'comboTargetId' | 'flowHits' | 'flowBrokenAt'> | undefined): string | undefined =>
  s && s.comboTargetId !== undefined && (s.flowHits ?? 0) > 0 && !((s.flowBrokenAt ?? 0) > 0) ? s.comboTargetId : undefined;
/**
 * 技の狙いの選び方(候補・覚えている狙い・その技の届く範囲 → 選ばれた敵)。覚えている狙いが生きていて(狙える)、届く範囲の中で、壁に隠れていなければ
 * いちばん近い敵より優先する。それ以外(倒れた・消えた・届かない・壁の向こう・狙いが無い)は今までどおりいちばん近い敵(pickBrawlerTarget)。
 * 届く範囲は呼び手の各技の決まりのまま(新しい距離は無い)。
 */
export const pickBrawlerComboTarget = (
  enemies: readonly Enemy[], px: number, py: number, radius: number, walls: readonly Rect[] = [], lockId?: string,
): Enemy | null => {
  if (lockId !== undefined) {
    const e = enemies.find(x => x.id === lockId);
    if (e && isBrawlerTargetable(e) && brawlerDistTo(px, py, e) <= radius && !blocked(px, py, e, walls)) return e;
  }
  return pickBrawlerTarget(enemies, px, py, radius, walls);
};
/**
 * 当たりの後の狙い。当たらなかった=そのまま。覚えている狙い(コンボ中)に当たった=そのまま。
 * それ以外(コンボの最初の当たり・狙いに届かず別の敵に当てた)=その技が狙っていた敵(当たっていれば)、無ければ当たった中でいちばん近い敵。
 */
export const brawlerComboTargetAfterHit = (
  lockId: string | undefined, hitIds: readonly string[], aimedId: string | undefined, nearestHitId: string | undefined,
): string | undefined => {
  if (hitIds.length === 0) return lockId;
  if (lockId !== undefined && hitIds.includes(lockId)) return lockId;
  if (aimedId !== undefined && hitIds.includes(aimedId)) return aimedId;
  return nearestHitId !== undefined && hitIds.includes(nearestHitId) ? nearestHitId : hitIds[0];
};

/** 円の中の敵(着地点の円・大踏み潰し・気功の爆発)。 */
export const brawlerCircleTargets = (
  enemies: readonly Enemy[], cx: number, cy: number, radius: number, walls: readonly Rect[] = [],
): string[] => {
  const out: string[] = [];
  for (const e of enemies) {
    if (!isBrawlerTargetable(e)) continue;
    if (brawlerDistTo(cx, cy, e) > radius) continue;
    if (blocked(cx, cy, e, walls)) continue;
    out.push(e.id);
  }
  return out;
};

/** 3段目: 相手1体 + 拳の位置の周りの他の敵。拳=相手の帯の、プレイヤーに一番近い点(相手が居なければ向いている方の手の先)。 */
export const brawlerFistPoint = (px: number, py: number, dirX: number, dirY: number, target: Enemy | null): { x: number; y: number } => {
  if (target) {
    const r = enemyRangeRect(target);
    return { x: Math.max(r.x, Math.min(px, r.x + r.width)), y: Math.max(r.y, Math.min(py, r.y + r.height)) };
  }
  return { x: px + dirX * 30, y: py + dirY * 30 };
};
export const brawlerFistTargets = (
  enemies: readonly Enemy[], px: number, py: number, dirX: number, dirY: number, target: Enemy | null,
  reach: number, walls: readonly Rect[] = [],
): string[] => {
  const out: string[] = [];
  if (target && isBrawlerTargetable(target) && brawlerDistTo(px, py, target) <= reach && !blocked(px, py, target, walls)) out.push(target.id);
  const f = brawlerFistPoint(px, py, dirX, dirY, target);
  for (const e of enemies) {
    if (out.includes(e.id) || !isBrawlerTargetable(e)) continue;
    if (brawlerDistTo(f.x, f.y, e) > BRAWLER_FIST_RADIUS) continue;
    if (blocked(px, py, e, walls)) continue;
    out.push(e.id);
  }
  return out;
};

/** 5段目: 前方の帯(長さ160×幅44)に掛かる敵。向きは単位ベクトル。 */
export const brawlerBandTargets = (
  enemies: readonly Enemy[], px: number, py: number, dirX: number, dirY: number, walls: readonly Rect[] = [],
  len = BRAWLER_BAND_LEN, halfW = BRAWLER_BAND_HALF_W,
): string[] => {
  const m = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / m, uy = dirY / m;
  const out: string[] = [];
  for (const e of enemies) {
    if (!isBrawlerTargetable(e)) continue;
    const r = enemyRangeRect(e);
    const ex = r.x + r.width / 2 - px, ey = r.y + r.height / 2 - py;
    const half = Math.max(r.width, r.height) / 2;
    const along = ex * ux + ey * uy;
    const perp = Math.abs(ex * uy - ey * ux);
    // ★箱でも測る(§9-75): 通った帯(長さは最低でも体1つ分=壁で止まっても掌は前に出る)と当たり判定の箱が重なれば当たり(今当たっている敵は外れない=OR)。
    // 中心だけで測ると、大きな箱(研究所の塊 743×300)の面に張り付いて突き抜けが壁で止まった時、中心まで届かず必ず外れていた。
    // 帯の端は平ら(丸めない)=小さな敵では旧式とほぼ同じ所まで(帯の先・元が半幅ぶん伸びない)。
    const byBox = bandBoxOverlap(px, py, ux, uy, Math.max(len, BRAWLER_PALM_MIN_REACH_PX), halfW, r);
    if (!byBox && (along < -half || along > len + half || perp > halfW + half)) continue;
    if (blocked(px, py, e, walls)) continue;
    out.push(e.id);
  }
  return out;
};

/** 速い踏み込みを刻む1回あたりの最大距離(px)。幹(高さ約12px)を中心ごと越えない大きさ(検収 A-1)。 */
export const BRAWLER_SWEEP_STEP_PX = 6;
/**
 * 1フレームの移動 (dx,dy) を stepPx 以下に刻み、刻みごとに solve(壁・木の押し出し)を通す。
 * 押し出された刻みでそこまでにする(stopped=true)=速い踏み込みが壁を素通りしない。
 */
export const sweepResolve = (
  x0: number, y0: number, dx: number, dy: number, w: number, h: number, stepPx: number,
  solve: (r: Rect) => { x: number; y: number },
  /** false=押し出されても刻みを続ける(壁沿いに滑る=1回で解いた時と同じ・刀の一閃)。既定 true=止まる(格闘)。 */
  stopOnPush = true,
): { x: number; y: number; stopped: boolean } => {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(0.5, stepPx)));
  let x = x0, y = y0;
  let pushed = false;
  for (let i = 0; i < n; i++) {
    const wx = x + dx / n, wy = y + dy / n;
    const r = solve({ x: wx, y: wy, width: w, height: h });
    x = r.x; y = r.y;
    if (Math.abs(r.x - wx) > 0.01 || Math.abs(r.y - wy) > 0.01) {
      pushed = true;
      if (stopOnPush) return { x, y, stopped: true };
    }
  }
  return { x, y, stopped: pushed };
};

/** 詰めの行き先(相手の帯の縁から standOff 手前・最大 maxPx)。相手が居なければ動かない。 */
export const brawlerApproach = (
  px: number, py: number, target: Enemy | null, maxPx: number, standOff = BRAWLER_STANDOFF_PX,
): { dx: number; dy: number; dist: number } => {
  if (!target || maxPx <= 0) return { dx: 0, dy: 0, dist: 0 };
  const r = enemyRangeRect(target);
  const nx = Math.max(r.x, Math.min(px, r.x + r.width));
  const ny = Math.max(r.y, Math.min(py, r.y + r.height));
  const vx = px - nx, vy = py - ny;
  const d = Math.hypot(vx, vy);
  if (!(d > standOff + 0.5)) return { dx: 0, dy: 0, dist: 0 };
  const go = Math.min(maxPx, d - standOff);
  return { dx: (-vx / d) * go, dy: (-vy / d) * go, dist: go };
};

/**
 * ★通常攻撃の段の踏み込み(§31「決まった距離を、出した瞬間の向きへ」)。相手が居れば brawlerApproach(相手の手前で止まる・通り抜けない)。
 * ★4段目(小ジャンプの叩き潰し)は、狙える相手が居ない時も向いている向き(dir)へ決まった距離だけ跳んで進む
 *   (社長実機報告2026-11-19「通常格闘の4段目が真上に飛ぶだけの時が結構ある」: 3段目までで相手が倒れる/届く範囲の外へ出ると相手が無く、
 *    踏み込みが0=その場で真上に跳んでいた)。1〜3段目は今どおり(相手が居なければ進まない)。
 */
export const brawlerStageApproach = (
  stage: number, px: number, py: number, target: Enemy | null, maxPx: number, dir: { x: number; y: number },
): { dx: number; dy: number; dist: number } => {
  if (target || stage !== 4 || !(maxPx > 0)) return brawlerApproach(px, py, target, maxPx);
  const d = Math.hypot(dir.x, dir.y);
  if (!(d > 1e-6)) return { dx: 0, dy: 0, dist: 0 };
  return { dx: (dir.x / d) * maxPx, dy: (dir.y / d) * maxPx, dist: maxPx };
};

/** 向き(相手が居ればその方向・居なければ向いている方)。 */
export const brawlerAimDir = (
  px: number, py: number, target: Enemy | null, facing: { x: number; y: number } | null | undefined,
): { x: number; y: number } => {
  if (target) {
    // ★箱の最寄りの点(少し内側)へ向く(§9-75): 小さな敵は今までどおり中心。大きな箱は殴る面へまっすぐ。
    const c = meleeImpactPoint(px, py, target);
    const dx = c.x - px, dy = c.y - py;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) return { x: dx / d, y: dy / d };
  }
  const fx = facing?.x ?? 1, fy = facing?.y ?? 0;
  const fm = Math.hypot(fx, fy);
  return fm > 0.001 ? { x: fx / fm, y: fy / fm } : { x: 1, y: 0 };
};

// ---------------------------------------------------------------------------------------------
// 踏み込みの器の形(§8-2): 'accel' = 加速して最大速度のまま当たる
// ---------------------------------------------------------------------------------------------
/** 'accel' の加速に使う割合(尺の前半この割合で0→最大へ・以後は最大のまま)。 */
export const BRAWLER_ACCEL_FRAC = 0.45;
/** 'accel' で距離 dist を ms で進む最大速度(px/s)。 */
export const accelLungeSpeed = (dist: number, ms: number): number =>
  Math.max(0, dist) / Math.max(0.001, (ms / 1000) * (1 - BRAWLER_ACCEL_FRAC / 2));
/** 'accel' の速度の掛け率(経過の割合 p=0..1)。 */
export const accelLungeFactor = (p: number): number =>
  p <= 0 ? 0 : p < BRAWLER_ACCEL_FRAC ? p / BRAWLER_ACCEL_FRAC : 1;

// ---------------------------------------------------------------------------------------------
// 絵(pixi が読む・判定は持たない)
// ---------------------------------------------------------------------------------------------
export type BrawlerPoseTex = 'ready' | 'swing' | null;
export interface BrawlerPose {
  tex: BrawlerPoseTex;
  /** 体の回転(rad・負=後ろへ回る・向きの符号は呼び手)。体の中心で回す(描画が足元の anchor から中心へ補う)。蹴りバク宙(§34-7)だけ。 */
  spin?: number;
  /** 体の前傾(ラジアン・向きの符号は呼び手)。 */
  lean: number;
  /** 突く方向への体の滑り(px)。 */
  push: number;
  /** 見た目の跳ぶ高さ(px・上が正)。 */
  jump: number;
  sqX: number;
  sqY: number;
  /** 拳の残像を体のどちら側から出すか(2段目は逆の手=-1)。 */
  hand: 1 | -1;
  /** 絵を左右反転して逆の手を形で見せる(2段目・クリエイティブ監査 #5)。 */
  flip: boolean;
  /** 体の震え(px・横/縦)。大踏み潰しの溜め(力を溜める小刻みな震え)。影も体に重ねて描くので一緒に震える。 */
  shakeX?: number;
  shakeY?: number;
}
const easeOut = (x: number): number => 1 - (1 - x) * (1 - x);
const easeIn = (x: number): number => x * x;
/** 4段目の跳び: 上りは速く・頂点で少し溜め・落下は叩きつけ(非対称)。p=0..1(前隙の中の進み)。 */
export const brawlerJumpHeight = (p: number): number => {
  if (p <= 0 || p >= 1) return 0;
  if (p < 0.4) return BRAWLER_JUMP_VIS_PX * easeOut(p / 0.4);
  if (p < 0.6) return BRAWLER_JUMP_VIS_PX * (1 - 0.06 * ((p - 0.4) / 0.2));
  return BRAWLER_JUMP_VIS_PX * 0.94 * (1 - easeIn((p - 0.6) / 0.4));
};
/**
 * ★大踏み潰しの溜めの震え(社長指示2026-11-08「大踏み潰しはジャンプせず、地面を体が震えた後叩く」)。跳ばない。
 * 力を溜める小刻みな震え: 始めは弱く遅く(振れ幅 easeIn・14Hz)→ 叩く直前が最大で速い(BRAWLER_STOMP_SHAKE_PX・40Hz)。
 * el=前隙の経過(ms)、windupMs=前隙の長さ。返り値は横の振れ(px)。縦は横の 0.35 倍・位相をずらして使う。
 */
export const BRAWLER_STOMP_SHAKE_PX = 3.5;
const STOMP_SHAKE_F0 = 14, STOMP_SHAKE_F1 = 40;
export const brawlerStompShake = (el: number, windupMs: number): { x: number; y: number } => {
  const T = Math.max(1, windupMs) / 1000;
  const t = Math.max(0, Math.min(T, el / 1000));
  const p = t / T;
  const phase = 2 * Math.PI * (STOMP_SHAKE_F0 * t + (STOMP_SHAKE_F1 - STOMP_SHAKE_F0) * t * t / (2 * T)); // 周波数を一定に上げる(チャープ)
  const a = BRAWLER_STOMP_SHAKE_PX * easeIn(p);
  return { x: a * Math.sin(phase), y: a * 0.35 * Math.sin(phase * 1.7 + 0.9) };
};
/**
 * 浮かせの弧の配分(research/BRAWLER.md §12-1・社長承認2026-11-08「格闘ゲームの空中コンボの手触り」)。
 * 打ち上がり 18%(速く上がって頂点で速さ0)→ 頂点の漂い 27%(わずかに沈み始める)→ 落下 55%(ゆっくり落ち始め、着地の直前が一番速い)。
 * ★社長指示2026-11-13「浮の上がるまでのスピードをもう少し早めたい。その分、慣性も少し強めたい」: 上り 25%→18%・漂い 20%→27%
 *   (落下の割合と全体の時間は据え置き=コンボのつながりは変えない)。上りの減速は二次→三次(liftRiseEase)=頂点への寄り付きが強い。
 */
export const BRAWLER_LIFT_RISE_FRAC = 0.18;
export const BRAWLER_LIFT_HOVER_FRAC = 0.27;
/** 漂いの間に沈む量(頂点の高さに対する割合)。0=止まって見える(機械的)。 */
export const BRAWLER_LIFT_HOVER_SAG = 0.06;
/**
 * 浮かせの弧(高さの倍率)。u=0..1。start=始まりの高さ・top=頂点の高さ(同じ単位)。
 * ★社長指示2026-11-25「立ち上がりは早く、頂点がゆっくりで、着地付近はまた早いはず。自然な慣性で」:
 *  - 上り: start→top を三次の ease-out(打たれた瞬間が一番速く、頂点で速さ0・社長指示2026-11-13で二次→三次)。全部の浮きで同じ。
 *  - 漂い: top から SAG だけ二次で沈む(速さ0から)。頂点の近くが一番ゆっくり。
 *  - 落下: 漂いの終わりの高さと速さを引き継いで、BRAWLER_LIFT_FALL_POW 乗(五次)で強く加速して 0 へ。
 *    落ち始めはゆっくり、着地の直前が一番速い(旧: 二次=着地の速さが上りの初速の2割弱しか無く、着地の手前がふわっと遅かった)。
 *    つなぎ目で高さも速さも跳ばない(五次の項は落ち始めで速さ0)。上り・漂い・落ちの配分と全体の時間(着地の時刻)は変えていない。
 * 追撃の浮き直しも同じ形(start=押し上げた瞬間の高さ=つなぎ目で高さが跳ばない)。
 */
/**
 * 浮きの弧の配分(上り・漂いの割合)。省略=格闘の弧(18%・27%)。
 * 上りは全部の浮きで三次の ease-out(打たれた瞬間が一番速い)。★鞭の浮きの「加速してから減速」(旧 riseEase:'inOut')は
 *   社長指示2026-11-25「立ち上がりは早く」で廃止(立ち上がりが遅かった)。
 */
export interface LiftArcShape { rise: number; hover: number }
/**
 * ★爆発で浮いた弧(research/BRAWLER.md §14・社長「落ちてくるのを爆発のは少しゆっくりに」): 上り15%・漂い20%・落ち65%。
 * ★社長指示2026-11-13(上りを速く・その分の慣性を強く): 上り 20%→15%・漂い 15%→20%(落ちの65%は据え置き)。
 */
export const BLAST_LIFT_SHAPE: LiftArcShape = { rise: 0.15, hover: 0.2 };
/**
 * ★鞭の浮きの高さ(格闘の浮き=4段目の打ち上げ1に対する倍率・research/WHIP_FOLLOWUP.md §7「鞭の浮きは高めにしないとかも」・叩き台)。
 * 画面の上限(BRAWLER_LIFT_VIS_MAX_VIEW_FRAC)は、この倍率で割って守る(大きい敵でも画面の縦の割合は格闘の上限まで=brawlerLiftVisBasePx)。
 */
export const WHIP_LIFT_HEIGHT_MULT = 2;
/** 浮きの上り専用の ease-out(三次=頂点への減速が二次より強い・社長指示2026-11-13)。他の easeOut は二次のまま。 */
const liftRiseEase = (x: number): number => 1 - (1 - x) * (1 - x) * (1 - x);
/**
 * 落下の加速の強さ(落ちの区間の時間の何乗で落ちるか)。2=一定の重力(旧)。大きいほど落ち始めがゆっくりで、着地の直前が速い。
 * 5 で着地の直前の速さ=上りの初速の約4割(格闘の弧)・約6割(鞭の弧)。旧の二次は約2割・約3割(社長指示2026-11-25「着地付近はまた早いはず」)。
 */
export const BRAWLER_LIFT_FALL_POW = 5;
export const brawlerLiftArcRel = (u: number, start: number, top: number, shape?: LiftArcShape): number => {
  if (u <= 0) return start;
  if (u >= 1) return 0;
  const R = shape?.rise ?? BRAWLER_LIFT_RISE_FRAC, H = shape?.hover ?? BRAWLER_LIFT_HOVER_FRAC, F = 1 - R - H, S = BRAWLER_LIFT_HOVER_SAG;
  if (u < R) return start + (top - start) * liftRiseEase(u / R);
  if (u < R + H) { const t = (u - R) / H; return top * (1 - S * t * t); }
  const t = (u - R - H) / F;
  const v0 = 2 * S * F / H;           // 漂いの終わりの沈む速さ(落下の区間の単位へ換算)=つなぎ目で速さが跳ばない
  const a = 1 - S - v0;               // 残りを強い加速で落とす(>0・t^POW は落ち始めで速さ0)
  return top * ((1 - S) - v0 * t - a * t ** BRAWLER_LIFT_FALL_POW);
};
/** 浮かせの絵の高さ(地面から・px)。u=0..1。 */
export const brawlerLiftHeight = (u: number): number => BRAWLER_LIFT_VIS_PX * brawlerLiftArcRel(u, 0, 1);

// ---------------------------------------------------------------------------------------------
// 動きの影(スタンド)・社長指示2026-11-07「動きの影パーツを用意したので、これをスタンドの様に薄く光らせて重ねて表示するのはどう?」
// +「むしろ当たり判定のヴィジュアルとしてキャラの上に前のめりに出していいと思う。武器の代わりって感じ。」
// 絵は右向き(社長の小さいドット絵・高さ56〜66ドット=表示とほぼ1:1・2026-11-26 差し替え。tip/body は新しい絵の画素から測った)。
// tipU/tipV = 打つ手足の先(絵の中の割合)。ここを当たりの所へ合わせて置く(pixi)。heightPx = 表示の高さ(world px)。
// ---------------------------------------------------------------------------------------------
export type BrawlerStandKind = 'punch' | 'heavy' | 'slam' | 'palm' | 'guard' | 'hadou' | 'kick';
export interface BrawlerStandSpec {
  tex: string;
  /** 打つ手足の先(絵の中の割合)。 */
  tipU: number; tipV: number;
  /** 影の体の中心(絵の中の割合)。ここを本人の体の中心へ重ねる。 */
  bodyU: number; bodyV: number;
  /** 表示の高さ(world px)。社長指示2026-11-07「全体的に格闘アイコンを少し小さく」で旧値の0.65倍(本人の1.3倍前後)。 */
  heightPx: number;
}
export const BRAWLER_STAND_SCALE = 0.65;
export const BRAWLER_STAND: Readonly<Record<BrawlerStandKind, BrawlerStandSpec>> = {
  punch: { tex: 'fx/brawler-stand2-punch', tipU: 0.95, tipV: 0.31, bodyU: 0.42, bodyV: 0.5, heightPx: 80 * BRAWLER_STAND_SCALE },
  heavy: { tex: 'fx/brawler-stand2-heavy', tipU: 0.955, tipV: 0.31, bodyU: 0.36, bodyV: 0.5, heightPx: 92 * BRAWLER_STAND_SCALE },
  slam: { tex: 'fx/brawler-stand2-slam', tipU: 0.55, tipV: 0.9, bodyU: 0.5, bodyV: 0.5, heightPx: 92 * BRAWLER_STAND_SCALE },
  palm: { tex: 'fx/brawler-stand2-palm', tipU: 0.88, tipV: 0.23, bodyU: 0.42, bodyV: 0.5, heightPx: 92 * BRAWLER_STAND_SCALE },
  guard: { tex: 'fx/brawler-stand2-guard', tipU: 0.62, tipV: 0.34, bodyU: 0.5, bodyV: 0.5, heightPx: 84 * BRAWLER_STAND_SCALE },
  hadou: { tex: 'fx/brawler-stand2-hadou', tipU: 0.93, tipV: 0.3, bodyU: 0.42, bodyV: 0.5, heightPx: 88 * BRAWLER_STAND_SCALE },
  kick: { tex: 'fx/brawler-stand2-kick', tipU: 0.96, tipV: 0.36, bodyU: 0.36, bodyV: 0.45, heightPx: 92 * BRAWLER_STAND_SCALE },
};
/**
 * 構えの影の絵(fx/brawler-stand2-guard・右向き)の中の「腕」の範囲(絵の中の割合)。レバーガード(§12-1c)の腕で受ける影は、この範囲だけを
 * 白金で出す(全身の構えの影=カウンターと読み違えない)。上げた両の拳と前腕が入る(腕だけの素材は無いので、構えの絵から切り出す)。
 */
export const BRAWLER_STAND_GUARD_ARM = { u0: 0.5, v0: 0.07, u1: 1, v1: 0.56 } as const;
/** レバーガードの腕の影の濃さの倍率(白い線画を白金の加算で重ねる)。 */
export const BRAWLER_STAND_GUARD_ARM_ALPHA = 1;
/** レバーガードの腕の影の大きさの倍率(腕だけだと小さくて読めないので、構えの影より少し大きく出す)。 */
export const BRAWLER_STAND_GUARD_ARM_SCALE = 1.25;
/** 下の大踏み潰しの影は着地の円に合わせて大きく(全体を小さくした比率はそのまま掛かる)。 */
export const BRAWLER_STAND_STOMP_MULT = 1.45;
/**
 * 2段目の影(社長指示2026-11-08「2段目は強パンチか掌底の絵 使って」)。反転はしない(拳・掌が前を向いたまま)。
 * 弱攻撃なので小さめ(LIGHT_SCALE)・短め(戻りで早く消える)に出し、3段目・5段目の見せ場を食わない(§9-44)。
 */
export const BRAWLER_STAND_STAGE2_KIND: BrawlerStandKind = 'palm';
export const BRAWLER_STAND_LIGHT_SCALE = 0.82;
export interface BrawlerStandFrame {
  kind: BrawlerStandKind;
  /** 体の前(0)→当たりの所(1)→その先へ抜ける(>1)。 */
  ext: number;
  /** 不透明度(加算で描く)。 */
  alpha: number;
  /** 2段目(弱攻撃): 3段目・5段目の大技より小さめ・短めに出す(§9-44)。 */
  light: boolean;
  /** 下の大踏み潰し(影を大きく)。 */
  big: boolean;
  /** レバーガード(§12-1c)の腕で受ける影(腕だけ・白金)。向きは受けた相手の方(leverGuardDirX/Y)。 */
  lever?: boolean;
  /** レバーガードの腕の位置のずれ(px・相手の方が正)。受けた瞬間に体の方へ押し込まれてから戻る。 */
  armPush?: number;
  /** 影の回し(rad・右向きの絵で正=下へ)。踵落としだけ(向きの傾きに足す)。 */
  rot?: number;
  /** 影を持ち上げる量(px・上が正)。踵落としだけ(上から下ろしてくる動き)。 */
  lift?: number;
}
/**
 * いまの影の形(判定は持たない・pixi が読む)。慣性: 前隙で体から前へにじみ出る(加速)→ 当たる瞬間に当たりの所まで伸び切る
 * (止めの間は段の時計が止まる=そこで止まる)→ 戻りで前へ抜けながら減速して消える。構えは出ている間うっすら脈打つ。
 */
export const brawlerStandAt = (s: BrawlerState | undefined, t: number): BrawlerStandFrame | null => {
  if (!s) return null;
  if (brawlerKickHeldInStop(s, t)) return brawlerStandAt(brawlerKickHoldView(s, t), t); // 止めの間は当たった蹴りの影のまま(§33-2)
  // 秘奥義(§10): 影も強く光る。起動=腕ガードが脈打つ / 落下=地面叩きが上から降りる / 着地=大きな地面叩きが伸び切って抜ける。
  if (s.secret && s.secret.phase !== 'strike') {
    const sec = s.secret;
    const q = Math.max(0, t - sec.phaseAt);
    if (sec.phase === 'ignite') return { kind: 'guard', ext: 1, alpha: Math.min(1, 0.55 + 0.35 * Math.abs(Math.sin(q / 70))), light: false, big: true };
    if (sec.phase === 'fall') return { kind: 'slam', ext: 0.9 * easeIn(Math.min(1, q / BRAWLER_SECRET_FALL_MS)), alpha: 0.95, light: false, big: true };
    const p = Math.min(1, q / BRAWLER_SECRET_LAND_MS);
    return { kind: 'slam', ext: 1 + 0.3 * easeOut(p), alpha: 1 - easeIn(p), light: false, big: true };
  }
  if (s.phase === 'idle') {
    // ★レバーガード(§12-1c): 受けた瞬間から短く、腕で受ける影(構えの絵の腕だけ・白金)を相手の方へ出す。全身の構えの影(カウンター)は出さない。
    //   受けた瞬間に体の方へ押し込まれてから戻る(慣性)。待機・歩きの間だけ=段・技に入ればその影が勝つ。
    const el = s.leverGuardAt !== undefined ? t - s.leverGuardAt : -1;
    const a = leverGuardStandAlpha(el);
    return a > 0 ? { kind: 'guard', ext: 1, alpha: a, light: false, big: false, lever: true, armPush: leverGuardArmOffset(el) } : null;
  }
  let kind: BrawlerStandKind;
  if (s.phase === 'attack') {
    kind = s.stage <= 1 ? 'punch' : s.stage === 2 ? BRAWLER_STAND_STAGE2_KIND : s.stage === 3 ? 'heavy' : s.stage === 4 ? 'slam' : 'palm';
  } else {
    if (!s.tech) return null;
    kind = s.tech === 'guard' ? 'guard' : s.tech === 'stomp' ? 'slam' : s.tech === 'kiko' ? 'hadou' : 'kick';
  }
  const el = Math.max(0, brawlerElapsed(s, t));
  const light = s.phase === 'attack' && s.stage === 2;
  const base = { kind, light, big: s.tech === 'stomp' };
  if (kind === 'guard') {
    const remain = s.guardUntil > t ? (s.guardUntil - t) / BRAWLER_GUARD_MS : 0;
    const appear = easeOut(Math.min(1, el / 90));
    const out = remain < 0.12 ? remain / 0.12 : 1; // 終わり際に減速して消える
    return { ...base, ext: 1, alpha: (0.5 + 0.08 * Math.sin(el / 110)) * appear * out };
  }
  const hit = el >= s.windupMs;
  // ★踵落とし(§29・社長指示2026-11-11「蹴りの絵を少し上から回して下ろしてくる見せ方にして、踵落としっぽく」): 蹴りの影を、脚を振り上げた向きから
  //   振り下ろした向きへ回す。溜めの間は振り上げたまま、飛んでいる間に加速して振り下ろし、当たった後は少しだけ振り抜く(慣性)。
  // ★密着の構え(§34-7): 掴み・スープレックスの間は蹴りの影を出さない。蹴りバク宙は当たる瞬間から、振り上げた蹴り(踵落としの逆向き)の影を出して消す。
  if (kind === 'kick' && s.contactGrab && (s.contactGrab.mode === 'suplex' || !hit0(s, el))) return null;
  const heelF = kind === 'kick' && s.kickHeel ? brawlerHeelStandAt(s, el) : kind === 'kick' && (s.kickUp || s.contactGrab) ? brawlerKickUpStandAt(s, el) : undefined; // 蹴り上げ(§34-1)=踵落としの上下逆
  if (!hit) {
    const pre = s.windupMs > 0 ? Math.min(1, el / s.windupMs) : 1;
    return { ...base, ext: 0.55 * easeIn(pre), alpha: 0.3 + 0.55 * easeOut(pre), ...(heelF ?? {}) };
  }
  // ★飛び蹴り: 体がしゃがみの絵に替わる時(後隙の BRAWLER_KICK_CROUCH_AT)までに、蹴りの影を消し切る
  //   (社長指示2026-11-11「蹴りの後しゃがむ時は蹴りの絵は消して」)。止めの間(当たった瞬間)は伸び切ったまま見せ、後隙に入ったら前へ抜けながら素早く消える。
  if (kind === 'kick') {
    const kp = (el - s.windupMs) / Math.max(1, s.recoveryMs);
    if (kp >= BRAWLER_KICK_CROUCH_AT) return null;
    const k = Math.max(0, kp / BRAWLER_KICK_CROUCH_AT);
    return { ...base, ext: 1 + 0.35 * easeOut(k), alpha: 0.85 * (1 - easeIn(k)), ...(heelF ?? {}) };
  }
  // 弱攻撃(2段目)は戻りの前半で消し切る(短め)・薄め。
  const post = Math.min(1, (el - s.windupMs) / Math.max(1, s.recoveryMs) * (light ? 1.6 : 1));
  return { ...base, ext: 1 + (light ? 0.2 : 0.35) * easeOut(post), alpha: (light ? 0.75 : 0.85) * (1 - easeIn(post)) };
};

const hit0 = (s: Pick<BrawlerState, 'windupMs'>, el: number): boolean => el >= s.windupMs;
/**
 * 踵落としの影の動き(クリエイティブ監査2026-11-11)。体ごと大きく回すと側転に見えるので、回しは控えめにして、
 * 「上から下ろしてくる」は縦の移動(lift)で見せる。回しの中心は腰(描画が anchor を下げる)。
 *  - 溜めの前半: 2発目の終わりの向き(0)から振り上げる(減速)。後半: 振り上げた頂点から少し沈んで溜める。
 *  - 飛ぶ間: 終わり際に一気に振り下ろす(3乗)。当たった後: 振り抜いてから少し戻る(踵が跳ね返る)。
 * rot=rad(右向きの絵で負=振り上げ・正=振り下ろし)/ lift=影を持ち上げる量(px・上が正)/ ext=前への伸び(当たる瞬間に1)。
 */
// ★社長指示2026-11-12「踵落としは、斜め上に傾いてる蹴りのシルエットを時計回りに少し回すイメージ」: 斜め上に傾いた蹴り(UP)から、
//   振り下ろしで時計回りに少しだけ(0.4rad)回し、当たる瞬間は水平の少し手前(DOWN)。当たった後は少しだけ振り抜いて少し戻る(水平を越えて下向きにしない)。
//   体は空中に残るので、影の下がり(LIFT+SINK)も小さく(8px)、当たった後は体の高さに居る(影の縦は描画で体の絵の位置=姿勢の jump に付く)。
//   (旧: DOWN=+0.4 / FOLLOW=0.25 / BACK=0.12 / LIFT=20 / SINK=6 =水平を越えて下へ大きく回り、26px 落ちていた。)
export const BRAWLER_HEEL_ROT_PEAK = -0.62;
export const BRAWLER_HEEL_ROT_UP = -0.5;
export const BRAWLER_HEEL_ROT_DOWN = -0.1;
export const BRAWLER_HEEL_ROT_FOLLOW = 0.08;
export const BRAWLER_HEEL_ROT_BACK = 0.04;
/**
 * ★踵落としの体の傾き=蹴りの影の回し(brawlerHeelStandAt の rot)×この係数(社長裁定2026-11-12「まわして」)。同じ時刻・同じ向きで、量は影より小さく:
 * 溜めで後ろへ反り(lean 負・最大 0.62×0.55≈0.34rad)、振り下ろしで時計回りに戻り、当たる瞬間は少し反りが残る(≈−0.055)。当たった後は後隙の進みで0へ戻して着地へつなぐ。
 * 体ごと大きく回すと側転に見える(以前の指摘)ので最大0.4rad 未満。0.55=テンポ係数1.0(溜め127ms)でも1フレーム(16ms)の跳びが0.15未満に収まる上限側。
 */
export const BRAWLER_HEEL_BODY_ROT_K = 0.55;
export const BRAWLER_HEEL_LIFT_PX = 8;
export const BRAWLER_HEEL_SINK_PX = 0;
/**
 * ★踵落としは空中で浮いたまま振り下ろし、直後も自分は空中に残る(社長指示2026-11-12「あくまで、空中で浮いたまま踵落としして、
 * 直後は自分は空中に残るイメージ。敵だけ下に叩きつけられる」)。絵だけ(体の高さ=姿勢の jump)。判定・無敵・移動は変えない(空中の扱いにもしない)。
 * 溜めの終わりの高さから飛ぶ間にこの高さへ加速→減速で移り、振り下ろしの瞬間もこの高さ。後隙の前半は留まり、後半で加速→減速しながら降りて後隙の終わりに着地する。
 * 高さ=30px の根拠: 飛び蹴り3発目の弧の頂点(30)と同じ。敵の浮いた絵の高さは rel×min(敵の体高×BRAWLER_LIFT_VIS_BODY_K(0.6), 画面高×0.25)で、
 * 描画の空中追従(playerAirTargetPx=0.9×それ)は、雑魚(ゾンビの体高 ≈ 126)が2発目の蹴りの浮き(rel ≈ 0.7)に居る時 ≈ 0.9×0.7×76 ≈ 48px
 * (2026-11-15 に BODY_K を 0.45→0.6 にした後の値。0.45 の時は ≈ 36px で、この 30px は蹴る瞬間に敵とほぼ同じ高さだった。いまは雑魚より約18px低い。
 *  重い区分は浮きが低いので、今も敵に近い〜少し上で踏みつける形)。
 * (旧 BRAWLER_HEEL_HOVER_PX=10: 弧で地面近くへ下がってから10pxで浮いていた=自分も一緒に落ちて見えた。)
 * ★2026-11-16 から、この 30px は「下限」。相手が浮いていれば、当たる時刻の相手の高さへ動ける距離の中で向かう高さ(heelAirPx・brawlerHeelAirOf)。
 */
export const BRAWLER_HEEL_AIR_PX = 30;
/** 踵落としの飛ぶ間のうち、溜めの終わりの高さから踵落としの高さへ移る割合(残りはその高さのまま振り下ろす)。 */
export const BRAWLER_HEEL_AIR_RISE_F = 0.6;
/** 後隙のうち浮いたまま留まる割合(残りで沈んで着地)。 */
export const BRAWLER_HEEL_HOVER_HOLD = 0.5;
/** 踵落としの後隙の進み(0..1)→ 浮いた高さ(px)。 */
export const brawlerHeelHoverPx = (post: number, airPx: number = BRAWLER_HEEL_AIR_PX): number => {
  const q = Math.max(0, Math.min(1, post));
  if (q <= BRAWLER_HEEL_HOVER_HOLD) return airPx;
  const k = (q - BRAWLER_HEEL_HOVER_HOLD) / (1 - BRAWLER_HEEL_HOVER_HOLD);
  return airPx * (1 - k * k * (3 - 2 * k));
};
/**
 * 踵落としの空中の高さ(px)。store が出した瞬間に書いた heelAirPx(相手の高さへ向かう高さ・下限 BRAWLER_HEEL_AIR_PX)・無ければ BRAWLER_HEEL_AIR_PX。
 * ★社長指示2026-11-16「高さに追いつく技も相手の高さに合わせに行って」。
 */
export const brawlerHeelAirOf = (s: Pick<BrawlerState, 'heelAirPx'>): number =>
  s.heelAirPx !== undefined && Number.isFinite(s.heelAirPx) ? Math.max(BRAWLER_HEEL_AIR_PX, s.heelAirPx) : BRAWLER_HEEL_AIR_PX;
/** 踵落としから取り消した大踏み潰しの、浮いた高さからの落下(溜めのこの割合で着地・加速して落ちる)。 */
export const BRAWLER_STOMP_FROM_AIR_FALL = 0.45;
export const brawlerHeelStandAt = (
  s: Pick<BrawlerState, 'windupMs' | 'recoveryMs' | 'kickChargeMs'>, el: number,
): { rot: number; lift: number; ext: number } => {
  const charge = Math.min(s.windupMs, s.kickChargeMs ?? 0);
  if (el < charge) {
    const c = charge > 0 ? Math.max(0, el / charge) : 1;
    if (c < 0.6) { const k = easeOut(c / 0.6); return { rot: BRAWLER_HEEL_ROT_PEAK * k, lift: BRAWLER_HEEL_LIFT_PX * k, ext: 0.25 }; }
    const k = (c - 0.6) / 0.4;
    return { rot: BRAWLER_HEEL_ROT_PEAK + (BRAWLER_HEEL_ROT_UP - BRAWLER_HEEL_ROT_PEAK) * k * k * (3 - 2 * k), lift: BRAWLER_HEEL_LIFT_PX, ext: 0.25 };
  }
  if (el < s.windupMs) {
    const q = s.windupMs > charge ? Math.max(0, Math.min(1, (el - charge) / (s.windupMs - charge))) : 1;
    const q3 = q * q * q;
    return {
      rot: BRAWLER_HEEL_ROT_UP + (BRAWLER_HEEL_ROT_DOWN - BRAWLER_HEEL_ROT_UP) * q3,
      lift: BRAWLER_HEEL_LIFT_PX - (BRAWLER_HEEL_LIFT_PX + BRAWLER_HEEL_SINK_PX) * q3,
      ext: 0.25 + 0.75 * q3,
    };
  }
  const k = Math.max(0, Math.min(1, (el - s.windupMs) / Math.max(1, s.recoveryMs * BRAWLER_KICK_CROUCH_AT)));
  const rot = k < 0.45
    ? BRAWLER_HEEL_ROT_DOWN + BRAWLER_HEEL_ROT_FOLLOW * easeOut(k / 0.45)
    : BRAWLER_HEEL_ROT_DOWN + BRAWLER_HEEL_ROT_FOLLOW - BRAWLER_HEEL_ROT_BACK * easeOut((k - 0.45) / 0.55);
  return { rot, lift: -BRAWLER_HEEL_SINK_PX, ext: 1 + 0.15 * easeOut(k) };
};
/**
 * ★蹴り上げの影の動き(research/BRAWLER.md §34-1「踵落としの下から上バージョン すべて逆」)。踵落とし(brawlerHeelStandAt)の上下を逆にした形:
 *  - 溜めの前半: 前の蹴りの終わりの向き(0)から脚を下げて構える(減速)。後半: 下げ切った所から少し戻して溜める(影も少し沈む)。
 *  - 飛ぶ間: 終わり際に一気に振り上げる(3乗)。当たる瞬間に上へ伸び切る(斜め上)。当たった後: 振り抜いてから少し戻る。
 * rot=rad(右向きの絵で正=下げる・負=振り上げ)/ lift=影を持ち上げる量(px・上が正=当たる瞬間に上へ)/ ext=前への伸び(当たる瞬間に1)。
 * 体ごと回すと側転に見えるので、回しの最大は踵落としと同じくらい(0.6rad 前後)。
 */
export const BRAWLER_KICKUP_ROT_PEAK = 0.55;
export const BRAWLER_KICKUP_ROT_DOWN = 0.42;
export const BRAWLER_KICKUP_ROT_UP = -0.62;
export const BRAWLER_KICKUP_ROT_FOLLOW = -0.3; // 振り抜きを大きく(クリエイティブ監査 #11)
export const BRAWLER_KICKUP_ROT_BACK = 0.05;
export const BRAWLER_KICKUP_SINK_PX = 8;
export const BRAWLER_KICKUP_RISE_PX = 14;
/** 蹴り上げの体の跳び(px・絵だけ)。沈んだ所から伸び上がり、当たる瞬間が一番高い。空中の相手の高さへは描画の跳びが追う。 */
export const BRAWLER_KICKUP_JUMP_PX = 34;
/**
 * ★蹴り上げは踵落としの上下逆のまま、振りだけ鋭く短く(社長承認2026-11-19・監査 B16)。当たる時刻(windupMs)は変えない=判定・ダメージは同じ。
 *  - 構え(溜めの前半)で脚を下げ切るのを早く(踵落とし 0.6 → 0.4)。
 *  - 飛ぶ間は下げた所で溜めたまま待ち、終わりの SNAP_F だけで振り上げる(4乗=踵落としの3乗より立ち上がりが急)。
 *  - 振り抜き(当たった後)も早く(踵落とし 0.45 → 0.3)。
 */
export const BRAWLER_KICKUP_COIL_F = 0.4;
export const BRAWLER_KICKUP_SNAP_F = 0.55;
export const BRAWLER_KICKUP_FOLLOW_F = 0.3;
/** 蹴り上げの振り上げの進み(0..1)。q=飛ぶ間の進み。SNAP_F より前は0(溜めたまま)、そこから4乗で当たる瞬間に1。 */
export const brawlerKickUpSnap = (q: number): number => {
  const a = Math.max(0, Math.min(1, (q - (1 - BRAWLER_KICKUP_SNAP_F)) / BRAWLER_KICKUP_SNAP_F));
  return a * a * a * a;
};
export const brawlerKickUpStandAt = (
  s: Pick<BrawlerState, 'windupMs' | 'recoveryMs' | 'kickChargeMs'>, el: number,
): { rot: number; lift: number; ext: number } => {
  const charge = Math.min(s.windupMs, s.kickChargeMs ?? 0);
  if (el < charge) {
    const c = charge > 0 ? Math.max(0, el / charge) : 1;
    const cf = BRAWLER_KICKUP_COIL_F;
    if (c < cf) { const k = easeOut(c / cf); return { rot: BRAWLER_KICKUP_ROT_PEAK * k, lift: -BRAWLER_KICKUP_SINK_PX * k, ext: 0.25 }; }
    const k = (c - cf) / (1 - cf);
    return { rot: BRAWLER_KICKUP_ROT_PEAK + (BRAWLER_KICKUP_ROT_DOWN - BRAWLER_KICKUP_ROT_PEAK) * k * k * (3 - 2 * k), lift: -BRAWLER_KICKUP_SINK_PX, ext: 0.25 };
  }
  if (el < s.windupMs) {
    const q0 = s.windupMs > charge ? Math.max(0, Math.min(1, (el - charge) / (s.windupMs - charge))) : 1;
    const q3 = brawlerKickUpSnap(q0);
    return {
      rot: BRAWLER_KICKUP_ROT_DOWN + (BRAWLER_KICKUP_ROT_UP - BRAWLER_KICKUP_ROT_DOWN) * q3,
      lift: -BRAWLER_KICKUP_SINK_PX + (BRAWLER_KICKUP_SINK_PX + BRAWLER_KICKUP_RISE_PX) * q3,
      ext: 0.25 + 0.75 * q3,
    };
  }
  const k = Math.max(0, Math.min(1, (el - s.windupMs) / Math.max(1, s.recoveryMs * BRAWLER_KICK_CROUCH_AT)));
  const ff = BRAWLER_KICKUP_FOLLOW_F;
  const rot = k < ff
    ? BRAWLER_KICKUP_ROT_UP + BRAWLER_KICKUP_ROT_FOLLOW * easeOut(k / ff)
    : BRAWLER_KICKUP_ROT_UP + BRAWLER_KICKUP_ROT_FOLLOW + BRAWLER_KICKUP_ROT_BACK * easeOut((k - ff) / (1 - ff));
  return { rot, lift: BRAWLER_KICKUP_RISE_PX + 4 * easeOut(k), ext: 1 + 0.15 * easeOut(k) };
};
/**
 * スープレックス(§34-3・§34-7)の体の反り(クリエイティブ監査 #3): 持ち上げて反り(RISE)→ 頂点で叩きつける(当たり・地割れ・揺れはこの瞬間)→
 * 頂点で HOLD 留まる → ゆっくり戻る(RETURN)。反りの最大(rad・lean 負=後ろ)と、後ろへの体の滑り(px)。時間は gameTime の ms。
 */
export const BRAWLER_SUPLEX_ARCH = 1.4;
export const BRAWLER_SUPLEX_PUSH_PX = 24;
export const BRAWLER_SUPLEX_RISE_MS = 100;
export const BRAWLER_SUPLEX_HOLD_MS = 80;
export const BRAWLER_SUPLEX_RETURN_MS = 340;
/** 掴んで寄せる体の前傾と、寄せる量(反りに入る前・クリエイティブ監査 #1・#11)。 */
export const BRAWLER_GRAB_LEAN = 0.3;
export const BRAWLER_GRAB_PUSH_PX = 12;
/** スープレックスの反り(0..1)。el=反りを始めてから(suplexAt からの ms)。頂点=RISE。 */
export const brawlerSuplexArch = (el: number): number => {
  if (!(el >= 0)) return 0;
  if (el < BRAWLER_SUPLEX_RISE_MS) { const k = el / BRAWLER_SUPLEX_RISE_MS; return k * k * (3 - 2 * k); }
  if (el < BRAWLER_SUPLEX_RISE_MS + BRAWLER_SUPLEX_HOLD_MS) return 1;
  const k = (el - BRAWLER_SUPLEX_RISE_MS - BRAWLER_SUPLEX_HOLD_MS) / BRAWLER_SUPLEX_RETURN_MS;
  if (k >= 1) return 0;
  return 1 - k * k * (3 - 2 * k);
};
/**
 * ★スープレックスの投げ越し(絵だけ・社長実機報告2026-11-19)。相手の絵を、反りに合わせて頭の上を越えて背中側へ運び、反りの頂点で背中側の地面へ叩きつける
 * (逆さま=180°)。頂点で留まった後、叩きつけた所から元の位置へ戻しながら起き上がる(回りは同じ向きへ続けて1回転で戻る)。
 * el=反りの始まり(suplexAt)からの ms・(mx,my)=背中側の着地点までのずれ。返り値=絵のずれ(dx,dy)・持ち上げ(lift・上が正)・回転(rad)。null=投げ越しの外。
 * ★敵の絵を回すのはスープレックスの投げ越しだけの例外(クリエイティブ監査の指示)。判定・位置は動かさない。
 */
export const BRAWLER_SUPLEX_SWING_LIFT_PX = 64;
export const brawlerSuplexSwing = (el: number, mx: number, my: number): { dx: number; dy: number; lift: number; rot: number } | null => {
  const total = BRAWLER_SUPLEX_RISE_MS + BRAWLER_SUPLEX_HOLD_MS + BRAWLER_SUPLEX_RETURN_MS;
  if (!(el >= 0) || el >= total) return null;
  const side = mx < 0 ? -1 : 1; // 背中側へ回る向き(左へ運ぶ=反時計回り)
  if (el < BRAWLER_SUPLEX_RISE_MS) {
    const q = el / BRAWLER_SUPLEX_RISE_MS;
    const p = q * q; // 持ち上げてから加速して叩きつける(叩きつける瞬間が一番速い)
    const h = (1 - Math.cos(Math.PI * p)) / 2;
    return { dx: mx * h, dy: my * h, lift: BRAWLER_SUPLEX_SWING_LIFT_PX * Math.sin(Math.PI * p), rot: side * Math.PI * p };
  }
  // ★§34-12(社長「投げるときは行くけど、戻っていく」): 叩きつけた瞬間に相手の位置そのものを着地点へ移す(store)=ここから先はずれ0(元の位置へ戻さない)。
  //   逆さまのまま一瞬留まり、その場で同じ向きへ回って起き上がる。
  if (el < BRAWLER_SUPLEX_RISE_MS + BRAWLER_SUPLEX_HOLD_MS) return { dx: 0, dy: 0, lift: 0, rot: side * Math.PI };
  const r = (el - BRAWLER_SUPLEX_RISE_MS - BRAWLER_SUPLEX_HOLD_MS) / BRAWLER_SUPLEX_RETURN_MS;
  const k = r * r * (3 - 2 * r);
  return { dx: 0, dy: 0, lift: 0, rot: side * Math.PI * (1 + k) };
};
/**
 * 背中側の着地点までのずれ(相手の中心から)。★社長実機報告2026-11-20「スープレックス、まだ敵が反対側に行かないときがある」で作り直した:
 *  - 側は**左右で決める**(プレイヤーの絵は左右にしか向かない=反りも左右)。相手がプレイヤーの右に居れば左へ、左に居れば右へ。
 *    ほぼ真上・真下(左右のずれ SIDE_DEADZONE_PX 以内)の時だけ face(±1=今向いている向き)の反対。旧は「中心どうしの向きの反対」=真上下の相手は上下へ運んで、反対側へ行って見えなかった。
 *  - 距離は相手の体の幅から決める(BACK_BASE_PX+相手の幅×BACK_W_K・最小30/最大130)。旧は中心どうしの距離(密着だと約40px)=大きな絵の相手はプレイヤーと重なって、同じ側に残って見えた。
 *  - 上下は相手の反対側へ少しだけ(差の半分)。
 * (px,py)=プレイヤーの中心・(ex,ey)=相手の中心・enemyW=相手の当たりの幅。
 */
export const BRAWLER_SUPLEX_SIDE_DEADZONE_PX = 6;
export const BRAWLER_SUPLEX_BACK_BASE_PX = 40;
export const BRAWLER_SUPLEX_BACK_W_K = 0.9;
export const brawlerSuplexLanding = (px: number, py: number, ex: number, ey: number, face: number, enemyW = 0): { mx: number; my: number } => {
  const hx = ex - px;
  const side = Math.abs(hx) > BRAWLER_SUPLEX_SIDE_DEADZONE_PX ? Math.sign(hx) : face >= 0 ? 1 : -1;
  const back = Math.max(30, Math.min(130, Math.max(Math.abs(hx), BRAWLER_SUPLEX_BACK_BASE_PX + Math.max(0, enemyW) * BRAWLER_SUPLEX_BACK_W_K)));
  const lx = px - side * back, ly = py - (ey - py) * 0.5;
  return { mx: lx - ex, my: ly - ey };
};
/** 相手が真上・真下の時の左右(着地点の側と、プレイヤーが向く向きを揃える)。+1=相手は右(=左へ投げ越す)。 */
export const brawlerSuplexSide = (px: number, ex: number, face: number): 1 | -1 =>
  Math.abs(ex - px) > BRAWLER_SUPLEX_SIDE_DEADZONE_PX ? (ex >= px ? 1 : -1) : face >= 0 ? 1 : -1;
/** スープレックスの体(反りの頂点の前は掴んで寄せた前傾から反りへつなぐ=頂点で前傾が抜け切る)。 */
const suplexPose = (base: BrawlerPose, el: number, grabPushPx: number): BrawlerPose => {
  const a = brawlerSuplexArch(el);
  const g = el < BRAWLER_SUPLEX_RISE_MS ? 1 - a : 0;
  return {
    ...base, tex: a > 0.35 ? 'swing' : 'ready',
    lean: BRAWLER_GRAB_LEAN * g - BRAWLER_SUPLEX_ARCH * a, push: grabPushPx * g - BRAWLER_SUPLEX_PUSH_PX * a,
    sqY: 1 - 0.1 * g + 0.1 * a, sqX: 1 + 0.06 * g - 0.06 * a,
  };
};
/**
 * 踵落としを受けた地上の敵の絵の沈み(px・下が正。描画だけ・判定は動かない)。叩きつけられて沈み、減速して戻る。
 * el=当たってからの時間(ms)。
 */
export const BRAWLER_HEEL_HIT_SINK_PX = 8;
export const BRAWLER_HEEL_HIT_SINK_MS = 320;
export const brawlerHeelHitSink = (el: number): number => {
  if (!(el >= 0) || el >= BRAWLER_HEEL_HIT_SINK_MS) return 0;
  const down = 50;
  if (el < down) return BRAWLER_HEEL_HIT_SINK_PX * easeOut(el / down);
  const k = (el - down) / (BRAWLER_HEEL_HIT_SINK_MS - down);
  return BRAWLER_HEEL_HIT_SINK_PX * (1 - k * k * (3 - 2 * k));
};
/** 飛び蹴りの後傾(社長裁定2026-11-12・足が前・頭が後ろ)。描画で face を掛ける=左向きでも頭が後ろ。 */
const KICK_BACK_LEAN = 0.55;
/** 溜め無しの飛び蹴り: 踏み切りから後傾へ入れる時間(ms・飛ぶ時間のこの割合を超えない)。 */
const KICK_LEAN_IN_MS = 96;
const KICK_LEAN_IN_FRAC = 0.75;
/** 3発目: 溜めのこの割合から前傾→後傾へ移り始め、飛びの頭(ms・飛ぶ時間のこの割合まで)で後傾に着く。 */
const KICK3_LEAN_TURN_AT = 0.25;
const KICK3_LEAN_TAIL_MS = 100;
const KICK_LEAN_TAIL_FRAC = 0.6;
/** いまの体の形。連続中は立ち絵へ戻さない(コンボが切れた時だけ立ちへ・§4)。 */
/** nowMs=壁時計(描画が渡す)。空中投げの掴みの間(ループごと止まる=gameTime は進まない)の体の寄せを慣性つきで入れるのに使う。無し=寄せ切った形。 */
const brawlerPoseAtRaw = (s: BrawlerState | undefined, t: number, nowMs?: number): BrawlerPose | null => {
  if (!s) return null;
  if (brawlerKickHeldInStop(s, t)) return brawlerPoseAtRaw(brawlerKickHoldView(s, t), t); // 止めの間は当たった蹴りの絵のまま(§33-2)
  const base: BrawlerPose = { tex: null, lean: 0, push: 0, jump: 0, sqX: 1, sqY: 1, hand: 1, flip: false };
  // 秘奥義(§10): 起動=沈んで溜め→振り上げて爆ぜる / 落下=天空から加速して落ちる / 着地=深く潰れて戻る。9連撃は各技の形(下の通常の分岐)。
  if (s.secret) {
    const sec = s.secret;
    const q = Math.max(0, t - sec.phaseAt);
    if (sec.phase === 'ignite') {
      const p = Math.min(1, q / BRAWLER_SECRET_IGNITE_MS);
      if (p < 0.35) { const k = easeOut(p / 0.35); return { ...base, tex: 'ready', sqY: 1 - 0.18 * k, sqX: 1 + 0.12 * k }; }
      const k = easeOut(Math.min(1, (p - 0.35) / 0.25));
      return { ...base, tex: 'swing', sqY: 1 + 0.12 * k - 0.06 * Math.max(0, p - 0.6), sqX: 1 - 0.06 * k, jump: 6 * k * (1 - p) };
    }
    if (sec.phase === 'fall') {
      const p = Math.min(1, q / BRAWLER_SECRET_FALL_MS);
      return { ...base, tex: 'swing', jump: BRAWLER_SECRET_SKY_PX * (1 - easeIn(p)), sqY: 1.12, sqX: 0.9 };
    }
    if (sec.phase === 'land') {
      const p = Math.min(1, q / BRAWLER_SECRET_LAND_MS);
      const land = Math.max(0, 1 - p * 2.2);
      return { ...base, tex: 'ready', sqY: 1 - 0.32 * land, sqX: 1 + 0.26 * land };
    }
  }
  if (s.phase === 'idle') {
    // ★スープレックスの反りが後隙より長く残った時は、待機に戻っても反りを戻し切るまで描く(絵だけ・後隙=操作の時間は変えない)。
    if (s.suplexAt !== undefined && t >= s.suplexAt && brawlerSuplexArch(t - s.suplexAt) > 0) return suplexPose(base, t - s.suplexAt, 0);
    // つながりの受付が残っている間はしゃがみ(構え)で待つ。
    if (s.nextStage > 1 && t <= s.chainUntil) return { ...base, tex: 'ready', lean: 0.05 };
    if (s.tech === null && s.kickChainUntil > t) return { ...base, tex: 'ready', lean: 0.06 };
    return null;
  }
  const el = Math.max(0, brawlerElapsed(s, t));
  const w = Math.max(1, s.windupMs);
  const total = Math.max(1, brawlerTotalMs(s));
  const pre = Math.min(1, el / w);                                   // 前隙の進み
  const post = s.windupMs > 0 && el < s.windupMs ? 0 : Math.min(1, (el - s.windupMs) / Math.max(1, total - s.windupMs)); // 戻りの進み
  const hit = el >= s.windupMs;
  if (s.phase === 'attack') {
    switch (s.stage) {
      case 1:
      case 2: {
        // 弱: しゃがみの絵のまま体を前へ大きく滑らせ、前へ傾ける。2段目は逆の手(残像は逆側)。
        // ★社長裁定2026-11-12: 2段目の絵の左右反転は後ろ向きに見える→やめて、前傾を浅くして「体をひねった」形にする(1段目の約半分)。
        const hand: 1 | -1 = s.stage === 2 ? -1 : 1;
        const thrust = hit ? 1 - easeOut(post) : easeIn(pre);
        const lean = s.stage === 2 ? 0.05 + 0.08 * thrust : 0.12 + 0.16 * thrust;
        return { ...base, tex: 'ready', lean, push: 14 * thrust, sqX: 1 + 0.08 * thrust, sqY: 1 - 0.06 * thrust, hand, flip: false };
      }
      case 3: {
        // 強(アッパー): しゃがみで溜め → 振り上げの絵で突き上げる。
        if (!hit) return { ...base, tex: 'ready', lean: 0.1 + 0.1 * pre, push: -4 * pre, sqY: 1 - 0.1 * pre, sqX: 1 + 0.05 * pre };
        const up = 1 - easeOut(post);
        return { ...base, tex: 'swing', lean: -0.06 * up, push: 10 * up, sqY: 1 + 0.1 * up, sqX: 1 - 0.05 * up };
      }
      case 4: {
        // 小ジャンプ踏み潰し: 振り上げの絵で跳ぶ → 着地で体を潰して揺れ。
        if (!hit) {
          const squat = pre < 0.12 ? pre / 0.12 : 0;
          return { ...base, tex: 'swing', jump: brawlerJumpHeight(pre), sqY: 1 - 0.14 * squat, sqX: 1 + 0.08 * squat };
        }
        const land = Math.max(0, 1 - post * 3);
        const wob = Math.sin(post * Math.PI * 4) * 0.05 * (1 - post);
        return { ...base, tex: 'ready', sqY: 1 - 0.22 * land + wob, sqX: 1 + 0.16 * land - wob * 0.6, lean: 0.04 };
      }
      case 5: {
        // 一閃型の掌底(§9-26): 溜め=引いて沈む → 突き抜け=伸び切った形で前へ倒れ込む(体は本当に動く=push は小さく)
        // → 抜けた先で伸び切った形のまま一拍止まり、ゆっくり戻す(#5)。
        const charge = Math.max(0, s.windupMs - BRAWLER_PALM_DASH_MS);
        if (!hit && el < charge) { const q = Math.min(1, el / Math.max(1, charge)); return { ...base, tex: 'ready', lean: -0.06 * q, push: -10 * easeOut(q), sqX: 1 - 0.07 * q, sqY: 1 - 0.05 * q }; }
        if (!hit) { const q = Math.min(1, (el - charge) / BRAWLER_PALM_DASH_MS); const k = easeOut(Math.min(1, q * 2.5)); return { ...base, tex: 'ready', lean: 0.48 * k, push: 10 * k, sqX: 1 + 0.18 * k, sqY: 1 - 0.1 * k }; }
        const HOLD = 0.4;
        const th = post < HOLD ? 1 : 1 - easeIn((post - HOLD) / (1 - HOLD)) * 0.35 - easeOut((post - HOLD) / (1 - HOLD)) * 0.65;
        return { ...base, tex: 'ready', lean: 0.48 * th, push: 10 * th, sqX: 1 + 0.16 * th, sqY: 1 - 0.1 * th };
      }
      default: return { ...base, tex: 'ready' };
    }
  }
  switch (s.tech) {
    case 'guard': {
      const breath = Math.sin(el / 90) * 0.012;
      return { ...base, tex: 'ready', sqY: 0.94 + breath, sqX: 1.04 - breath };
    }
    case 'stomp': {
      // ★大踏み潰し(社長指示2026-11-08「大踏み潰しはジャンプせず、地面を体が震えた後叩く」): 跳ばない。
      // 溜め=振りかぶった絵(拳を頭上へ)でその場に構え、少し沈みながら小刻みに震える(始めは弱く・叩く直前が最大)。
      // 叩く=しゃがみの絵へ切り替え、前へ倒れ込んで拳を地面へ振り下ろす(深く潰れて揺れ戻る)。
      if (!hit) {
        const sh = brawlerStompShake(el, s.windupMs);
        const sink = easeOut(pre);
        // 踵落としの浮いた高さから取り消した時: その高さから加速して落ち、溜めの前半で着地する(高さが跳ばない)。
        const fromAir = (s.stompFromPx ?? 0) > 0 ? (s.stompFromPx ?? 0) * (1 - easeIn(Math.min(1, pre / BRAWLER_STOMP_FROM_AIR_FALL))) : 0;
        return { ...base, tex: 'swing', lean: -0.05 * sink, sqY: 1 - 0.08 * sink, sqX: 1 + 0.05 * sink, shakeX: sh.x, shakeY: sh.y, ...(fromAir > 0 ? { jump: fromAir } : {}) };
      }
      const land = Math.max(0, 1 - post * 2.5);
      const wob = Math.sin(post * Math.PI * 4) * 0.04 * (1 - post);
      return { ...base, tex: 'ready', lean: 0.22 * land, push: 6 * land, sqY: 1 - 0.3 * land + wob, sqX: 1 + 0.22 * land - wob * 0.6 };
    }
    case 'kiko': {
      // 気功: 溜め=振り上げ(頭上に集める)→ 放つ=しゃがみ+前傾で突き出す(#4)。
      if (!hit) return { ...base, tex: 'swing', lean: -0.08 * pre, push: -6 * pre, sqY: 1 + 0.05 * pre };
      const th = 1 - easeOut(post);
      return { ...base, tex: 'ready', lean: 0.3 * th, push: 16 * th, sqX: 1 + 0.1 * th, sqY: 1 - 0.06 * th };
    }
    case 'kick': {
      // ★密着の構え(§34-7): 掴み=踏ん張って体を寄せる → スープレックス=後ろへ反る(下の suplexAt)/ 蹴りバク宙=蹴ってクルっと1回転しながら下がって着地。
      // ★空中投げの掴み(§34-3・クリエイティブ監査 #1): 掴んでいる間(ループごと止まる)は、相手へ前傾して体を寄せて踏ん張る。壁時計で慣性つきに入れる。
      if (s.grab) {
        const k = nowMs === undefined ? 1 : easeOut(Math.max(0, Math.min(1, (nowMs - s.grab.at) / 120)));
        return { ...base, tex: 'ready', lean: BRAWLER_GRAB_LEAN * k, push: (s.grab.reachPx ?? 0) * k, sqY: 1 - 0.1 * k, sqX: 1 + 0.05 * k };
      }
      // スープレックス(空中投げ・密着の構え): 反りを始めてからは反りの形(頂点で叩きつけ)。
      if (s.suplexAt !== undefined && t >= s.suplexAt) return suplexPose(base, t - s.suplexAt, s.grab ? 0 : (s.contactGrab?.gripPx ?? BRAWLER_GRAB_PUSH_PX));
      // ★投げ(クリエイティブ監査 #2): 放した瞬間から、後ろへ引いて投げる向きへ大きく振り抜く(向き=dirX/dirY=投げた向き)。
      if (s.throwAt !== undefined) {
        const sw = brawlerThrowSwing(t - s.throwAt);
        if (sw.on) return { ...base, tex: 'swing', lean: sw.lean, push: sw.push, sqX: 1 + 0.08 * Math.max(0, sw.lean), sqY: 1 - 0.06 * Math.max(0, sw.lean) };
      }
      if (s.contactGrab) {
        // 掴み: 前傾して体を寄せて掴む(監査 #11=前傾・寄せを倍に)。
        if (!hit) {
          // スープレックスは反り始め(掴みの後半)までに寄せ切る=反りへ途切れずにつなぐ。蹴りバク宙は掴みの全体で寄せる。
          const span = s.contactGrab.mode === 'suplex' ? Math.max(1, s.windupMs - BRAWLER_SUPLEX_RISE_MS) : w;
          // ★§34-10: 掴んだ瞬間は時間停止(技の時計が進まない)=壁時計で一気に組み付く姿へ入れる(ガッ)。止めが明けたらその姿のまま反りへ。
          const grip = s.contactGrab.at === undefined ? 0 : nowMs === undefined ? 1 : easeOut(Math.max(0, Math.min(1, (nowMs - s.contactGrab.at) / BRAWLER_CONTACT_GRIP_IN_MS)));
          const k = Math.max(grip, easeOut(Math.min(1, el / span)));
          // 食い込む寄せ(gripPx)。スープレックスは反りの式が寄せから反りへつなぐ(suplexPose)。サマーソルトは掴みの間に寄せを戻して蹴り出す(蹴る瞬間に0=跳ばない)。
          const gp = s.contactGrab.gripPx ?? BRAWLER_GRAB_PUSH_PX;
          const back = s.contactGrab.mode === 'flipkick' ? (() => { const q = Math.max(0, Math.min(1, el / w)); return q * q * (3 - 2 * q); })() : 0;
          return { ...base, tex: 'ready', lean: BRAWLER_GRAB_LEAN * k * (1 - back), push: gp * k * (1 - back), sqY: 1 - 0.1 * k, sqX: 1 + 0.06 * k };
        }
        if (s.contactGrab.mode === 'flipkick') {
          // 速く上がって重く落ちる跳び・頂点の前に大半を回し切って着地へ減速する1回転(監査 #11)。
          const land = post > 0.85 ? Math.sin(Math.PI * Math.min(1, (post - 0.85) / 0.15)) : 0;
          return {
            ...base, tex: post < 0.8 ? 'swing' : 'ready', lean: 0, spin: brawlerFlipSpin(post), push: 0,
            jump: BRAWLER_FLIPKICK_JUMP_PX * brawlerFlipArc(post / 0.95), sqY: 1 - 0.16 * land, sqX: 1 + 0.1 * land,
          };
        }
        return { ...base, tex: 'ready', lean: BRAWLER_GRAB_LEAN, push: BRAWLER_GRAB_PUSH_PX };
      }
      // 飛び蹴り: 滞空中はしゃがみ+強い前傾 → 当たった瞬間に振り上げの絵へ変える(#4)。
      const big = s.kickN >= BRAWLER_KICK_MAX;
      const charge = Math.max(0, Math.min(s.windupMs, s.kickChargeMs ?? 0));
      // ★社長裁定2026-11-12: 蹴りは足が前・頭が後ろ=飛んでいる間と当たった後は後ろへ傾ける(lean 負)。踵落としは蹴りの影の回しに合わせて回す(heelLean)。
      //   傾きは瞬間で切り替えず加減速つきで入れる(慣性): 溜めの後半〜飛びの頭で前傾→後傾へ、溜め無しは踏み切りから後傾へ立ち上げる。
      const heel = !!s.kickHeel;
      const flightMs = Math.max(1, s.windupMs - charge);
      const smooth = (x: number): number => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
      // 踵落としの体の傾き=蹴りの影の回しと同じ時刻の曲線×係数(BRAWLER_HEEL_BODY_ROT_K)。lean 負=後ろへ反る・増える=時計回り(右向き)。
      // 蹴り上げ(§34-1)も同じ係数で影の回しに合わせる(溜めで前へ屈み・振り上げで後ろへ反る=踵落としの逆)。
      const up = !!s.kickUp;
      const heelLean = (): number => BRAWLER_HEEL_BODY_ROT_K * (up ? brawlerKickUpStandAt(s, el).rot : brawlerHeelStandAt(s, el).rot);
      const rot = heel || up;
      if (!hit && charge > 0) {
        // ★3発目の溜め(社長承認2026-11-08「飛び蹴りの3発目も少し溜めてから蹴る」): 跳び上がって空中で体を縮め、沈みながら光る(慣性つき)。
        //   いま溜めるのは踵落としと幻影(孫悟空)の3発目だけ(プレイヤーの蹴り飛ばしは溜め無し=§33-2)。
        const c = Math.min(1, el / charge);
        if (c < 1) {
          const rise = BRAWLER_KICK3_CHARGE_RISE_PX * easeOut(Math.min(1, c / 0.45));
          const sink = BRAWLER_KICK3_CHARGE_SINK_PX * easeIn(Math.max(0, (c - 0.45) / 0.55));
          const crouch = easeOut(c);
          const fwd = 0.15 + 0.2 * crouch;
          const b = rot ? 0 : smooth((el - charge * KICK3_LEAN_TURN_AT) / (charge * (1 - KICK3_LEAN_TURN_AT) + Math.min(KICK3_LEAN_TAIL_MS, KICK_LEAN_TAIL_FRAC * flightMs)));
          const lean = rot ? heelLean() : fwd * (1 - b) - KICK_BACK_LEAN * b;
          // 蹴り上げ: 跳び上がらず、低く沈んで溜める(下から上へ振り上げる前の踏ん張り)。
          if (up) return { ...base, tex: 'ready', jump: 0, lean, push: -4 * crouch, sqY: 1 - 0.22 * crouch, sqX: 1 + 0.14 * crouch };
          return { ...base, tex: 'ready', jump: rise - sink, lean, push: -4 * crouch, sqY: 1 - 0.16 * crouch, sqX: 1 + 0.1 * crouch };
        }
        // 溜めの後に飛ぶ: 沈んだ高さから飛ぶ弧へつなぐ(つなぎ目で高さが跳ばない)。
        const f = Math.min(1, (el - charge) / Math.max(1, s.windupMs - charge));
        const h0 = BRAWLER_KICK3_CHARGE_RISE_PX - BRAWLER_KICK3_CHARGE_SINK_PX;
        // 踵落とし: 弧を描いて下がらず、溜めの終わりの高さから踵落としの高さへ加速→減速で移り、振り下ろしの瞬間もその高さ
        //   =後隙の浮き(同じ高さ)へ途切れずにつなぐ(社長指示2026-11-12「空中で浮いたまま踵落とし」)。
        const heelJump = h0 + (brawlerHeelAirOf(s) - h0) * smooth(f / BRAWLER_HEEL_AIR_RISE_F); // 高さ=相手の高さへ向かう高さ(下限30・社長指示2026-11-16)
        // 前傾→後傾のつなぎは溜めの後半から飛びの頭まで続く(つなぎ目で傾きが跳ばない)。溜め明けの前傾は溜めの最後の値(0.35)。
        const tail = Math.min(KICK3_LEAN_TAIL_MS, KICK_LEAN_TAIL_FRAC * flightMs);
        const b = smooth((el - charge * KICK3_LEAN_TURN_AT) / (charge * (1 - KICK3_LEAN_TURN_AT) + tail));
        const lean = rot ? heelLean() : 0.35 * (1 - b) - KICK_BACK_LEAN * b;
        // 蹴り上げ: 沈んだ所から伸び上がって飛ぶ(上へ向かう跳び=加速して上がり、当たる瞬間が一番高い)。空中の相手の高さへは描画の跳び(playerKickJump)が追う。
        if (up) return { ...base, tex: f < 0.55 ? 'ready' : 'swing', jump: BRAWLER_KICKUP_JUMP_PX * Math.sin(Math.PI * 0.5 * f), lean, push: 8, sqY: 1 + 0.06 * f, sqX: 1 - 0.04 * f };
        return { ...base, tex: 'ready', jump: heel ? heelJump : h0 * (1 - f) + 30 * Math.sin(Math.PI * f), lean, push: 8 };
      }
      if (!hit) {
        const lean = rot ? heelLean() : -KICK_BACK_LEAN * smooth(el / Math.min(KICK_LEAN_IN_MS, KICK_LEAN_IN_FRAC * flightMs));
        return { ...base, tex: 'ready', jump: (big ? 30 : 18) * Math.sin(Math.PI * Math.min(1, pre)), lean, push: 8 };
      }
      const th = 1 - easeOut(post);
      // ★蹴った後は、すぐしゃがみの絵へ(社長指示2026-11-11「全段、蹴った後、一瞬しゃがみの絵を入れて。隙は変えず。蹴ったまま落ちていくのが変」)。
      //   当たった瞬間(止めの間)は振り上げの絵のまま → 後隙に入ったらすぐしゃがんで着地する(深く沈んで戻る=慣性)。旧は後隙の前半45%が振り上げの絵だった。
      const land = Math.sin(Math.PI * Math.min(1, post / 0.6)) * (post < 0.6 ? 1 : 0);
      return {
        ...base, tex: post < BRAWLER_KICK_CROUCH_AT ? 'swing' : 'ready', lean: (rot ? heelLean() : -0.25) * th, push: 6 * th, sqY: 1 - 0.12 * th - 0.14 * land, sqX: 1 + 0.08 * th + 0.1 * land,
        ...(s.kickHeel ? { jump: brawlerHeelHoverPx(post, brawlerHeelAirOf(s)) } : {}), // 踵落としの後は空中に残る(振り下ろした高さのまま)→後隙の後半で降りて着地
        ...(up ? { jump: BRAWLER_KICKUP_JUMP_PX * (1 - smooth(post / 0.45)) } : {}), // 蹴り上げ: 振り上げた高さから加減速で降りる(高さが跳ばない)
      };
    }
    default: return { ...base, tex: 'ready' };
  }
};
/**
 * ★空中のスープレックスの上昇(research/BRAWLER.md §34-11・社長指示2026-11-20「空中でのスープレックスは、掴んだ後、少し上昇してからスープレックスで」)。絵だけ(判定の位置は動かさない)。
 * el=上がり始め(掴みが明けた瞬間)からの ms。AIR_SUPLEX_RISE_MS のうち、最初の(RISE−HANG)で減速しながら +RISE_PX まで上がり、頂点で HANG だけ止まる(慣性)。
 * 反り(BRAWLER_SUPLEX_RISE_MS)の間はその高さのまま、叩きつけた後は fall=true ならプレイヤーが加速して元の高さへ落ちる(AIR_SUPLEX_FALL_MS)/ false(掴まれた相手)なら0
 * (叩きつけた後の相手は背中側の地面=投げ越しの式が置く)。返り値=持ち上げ(px・上が正)。
 */
export const BRAWLER_AIR_SUPLEX_RISE_PX = 40;
export const BRAWLER_AIR_SUPLEX_RISE_MS = 180;
export const BRAWLER_AIR_SUPLEX_HANG_MS = 40;
export const BRAWLER_AIR_SUPLEX_FALL_MS = 220;
/** カウンターされて断ち切られた後、空中から地面まで落ちる時間(空中のスープレックスの後の落下と同じ長さ・同じ加速の形)。 */
export const BRAWLER_COUNTER_FALL_MS = BRAWLER_AIR_SUPLEX_FALL_MS;
export const brawlerAirSuplexRise = (el: number, fall = true): number => {
  if (!(el >= 0)) return 0;
  const up = BRAWLER_AIR_SUPLEX_RISE_MS - BRAWLER_AIR_SUPLEX_HANG_MS;
  if (el < up) { const q = el / up; return BRAWLER_AIR_SUPLEX_RISE_PX * (1 - (1 - q) * (1 - q) * (1 - q)); }
  const slam = BRAWLER_AIR_SUPLEX_RISE_MS + BRAWLER_SUPLEX_RISE_MS;
  if (el < slam) return BRAWLER_AIR_SUPLEX_RISE_PX;
  if (!fall) return 0;
  const k = (el - slam) / BRAWLER_AIR_SUPLEX_FALL_MS;
  return k >= 1 ? 0 : BRAWLER_AIR_SUPLEX_RISE_PX * (1 - k * k);
};
export const brawlerPoseAt = (s: BrawlerState | undefined, t: number, nowMs?: number): BrawlerPose | null => {
  const raw = brawlerPoseAtRaw(s, t, nowMs);
  // カウンターで断ち切られた空中からの落下(絵だけ)。待機に戻っていても、落ち切るまでは落ちる姿(しゃがみ=空中の落下の絵)で高さを残す。
  const fall = s ? brawlerCounterFallPx(s.counterFall, t) : 0;
  const pose = fall > 0
    ? (raw ? { ...raw, jump: Math.max(raw.jump ?? 0, fall) } : { tex: 'ready' as const, lean: 0, push: 0, jump: fall, sqX: 1, sqY: 1, hand: 1 as const, flip: false })
    : raw;
  if (!pose || !s || s.airSuplexRiseAt === undefined) return pose;
  const lift = brawlerAirSuplexRise(t - s.airSuplexRiseAt);
  return lift > 0 ? { ...pose, jump: (pose.jump ?? 0) + lift } : pose;
};

// ★起動時のテンポ係数(`?brtempo=`・既定 1.3)。全部の時間の欄が宣言された後(ファイルの末尾)で1回だけ書き直す。
setBrawlerTempo(urlNum(BRAWLER_TEMPO_SEARCH, 'brtempo', BRAWLER_TEMPO_DEFAULT));
