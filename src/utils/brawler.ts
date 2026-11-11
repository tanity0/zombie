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
  /** 頭の詰め(ダッシュ・跳び)の最大距離(px)。0=その場。 */
  dashPx: number;
  /** kb が 'big' の時の押しの勢い(今の近接の何倍か)。無ければ BRAWLER_BIG_KB_MULT(4倍)。段ごとに持つ(§16)。 */
  kbMult?: number;
}
/**
 * ★当てた瞬間の止め(ヒットストップ・ms)。テンポ係数は掛けない(社長承認2026-11-08「当てた瞬間の止めを長く」)。
 * 弱(1・2段目)/ 強・技(3・4段目・飛び蹴り1・2発目)/ 締め(5段目・飛び蹴り3発目・大踏み潰し・秘奥義の締め)。
 * 旧: 弱45 / 3段目80 / 4段目90 / 蹴り1・2発目80 / 締め140 / 秘奥義の締め160。
 */
export const BRAWLER_HITSTOP = { weak: 90, strong: 150, closer: 220 } as const;
/** 5段目の掌底の押しの勢い(今の近接の何倍か)。社長指示2026-11-09「流石に敵が吹き飛びすぎ」で 4→2(約150px→約75px・§16)。大踏み潰し・飛び蹴り3発目・秘奥義の締めは BRAWLER_BIG_KB_MULT(4)のまま。 */
export const BRAWLER_PALM_KB_MULT = 2;
/** 段の表の係数1.0の値(今までの値)。止めは BRAWLER_HITSTOP。 */
export const BRAWLER_STAGES_BASE: readonly BrawlerStageSpec[] = [
  { stage: 1, windupMs: 60, recoveryMs: 140, mult: 0.30, kb: 'small', hitstopMs: BRAWLER_HITSTOP.weak, shape: 'single', dashPx: 60 },
  { stage: 2, windupMs: 60, recoveryMs: 140, mult: 0.40, kb: 'small', hitstopMs: BRAWLER_HITSTOP.weak, shape: 'single', dashPx: 60 },
  { stage: 3, windupMs: 120, recoveryMs: 230, mult: 0.8, kb: 'normal', hitstopMs: BRAWLER_HITSTOP.strong, shape: 'fist', dashPx: 60 },
  { stage: 4, windupMs: 250, recoveryMs: 200, mult: 1.10, kb: 'small', hitstopMs: BRAWLER_HITSTOP.strong, shape: 'landing', dashPx: 50 },
  // 5段目=一閃型の貫通突進(社長指示2026-11-07)。前隙 250 = 溜め 100 + 突き抜け 150。判定は抜け切った瞬間に軌跡の帯で一括(§9-26)。
  // 社長指示2026-11-07「飛距離少しだけ短く」で突き抜け 160→140px・150→130ms(最高速は同じ)。総尺 500 は戻り 270 で保つ(§9-35)。
  { stage: 5, windupMs: 230, recoveryMs: 270, mult: 1.60, kb: 'big', hitstopMs: BRAWLER_HITSTOP.closer, shape: 'band', dashPx: 0, kbMult: BRAWLER_PALM_KB_MULT }, // 押した瞬間の詰めは無し(溜めの後に突き抜ける)
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
  stomp: { kind: 'stomp', cost: 5, windupMs: 200, recoveryMs: 400 },
  kiko: { kind: 'kiko', cost: 2, windupMs: 120, recoveryMs: 330 },
  kick: { kind: 'kick', cost: 1, windupMs: 120, recoveryMs: 150 },
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
  kick1: 250, kick2: 310, kick3: 0,
  stomp: 230, kiko: 0,
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
export const BRAWLER_LIFT_VIS_BODY_K = 0.45;
/** 巨大な敵の上限: 見えている画面の縦×これ(world px)。 */
export const BRAWLER_LIFT_VIS_MAX_VIEW_FRAC = 0.2;
export const BRAWLER_STOMP_RADIUS = 150;     // 下の大踏み潰し(§3-3)
export const BRAWLER_STOMP_MULT = 3.5; // 社長裁定2026-11-11「3;上げる」で 2.4→3.5(技ポイントが一番高い技の見返り)。旧: 2026-11-09 に 2.0→2.4
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
/** 飛ぶ時間: 旧の届く距離(160)までは今までどおり 120ms、その先は距離に合わせて最大 150ms まで伸ばす(最高速は約1割上=速さの感じを落とさない)。 */
export let BRAWLER_KICK_FLIGHT_MAX_MS = 150; // ×BRAWLER_TEMPO(係数1.0の値)
export const brawlerKickFlightMs = (dist: number): number =>
  Math.max(BRAWLER_TECHS.kick.windupMs, Math.min(BRAWLER_KICK_FLIGHT_MAX_MS, BRAWLER_TECHS.kick.windupMs * Math.max(0, dist) / 160));
/** 飛び蹴りの倍率(何発目か=1..3)。社長承認2026-11-09 で 0.7/0.7/0.7 → 0.7/0.8/1.0。秘奥義の9連撃の蹴りは3発目扱い(締めの止め・big の押しと同じ)。 */
export const BRAWLER_KICK_MULTS = [0, 0.7, 0.8, 1.0] as const;
export const brawlerKickMult = (kickN: number): number => BRAWLER_KICK_MULTS[Math.max(1, Math.min(3, Math.round(kickN)))];
export let BRAWLER_KICK_CHAIN_MS = 500; // ×BRAWLER_TEMPO(係数1.0の値)
export const BRAWLER_KICK_MAX = 3;
/**
 * ★飛び蹴りの3発目の溜め(社長承認2026-11-08「飛び蹴りの3発目も少し溜めてから蹴る」)。蹴りに入る前に空中で体が光って沈む。
 * 実時間で約150ms(係数を掛けた後の値)=係数1.0の値は 150/1.3 を丸めた 115。前隙(windupMs)はこの溜め+飛ぶ時間。
 */
export let BRAWLER_KICK3_CHARGE_MS = 115; // ×BRAWLER_TEMPO(係数1.0の値)
/** 溜めの見た目: 跳び上がる高さ・沈む量(px・絵だけ)。 */
export const BRAWLER_KICK3_CHARGE_RISE_PX = 24;
export const BRAWLER_KICK3_CHARGE_SINK_PX = 7;
/** 3発目の溜めの光(0..1・絵だけ)。溜めの間に強まり(easeIn)、飛び出しで速く引く。 */
export const brawlerKickChargeGlow = (s: BrawlerState, t: number): number => {
  if (s.phase !== 'tech' || s.tech !== 'kick' || !(s.kickChargeMs && s.kickChargeMs > 0) || s.resolved) return 0;
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
    BRAWLER_KICK_FLIGHT_MAX_MS: brawlerTempoMs(150, tempo),
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
    BRAWLER_KICK3_CHARGE_MS: brawlerTempoMs(115, tempo),
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
    ...s, phase: 'attack', stage: spec.stage, tech: null, kickN: 0, startAt: t,
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
 * ★飛び蹴りの3発目の狙い直し(社長指示2026-11-11「3段目もジャンプして、そこの高さに追いついて、蹴り飛ばす」・research/BRAWLER.md §19-10)。
 * 3発目は蹴りに入る前に溜める。飛ぶ先を溜め始めの敵の位置で決めたままだと、溜めの間に前の蹴りの押しで滑った敵に届かない
 * (実ループで36本中5本が空振り)。溜めが明けて踏み込みの器が動き出す瞬間(lungeHoldUntil を過ぎた最初の更新)に、1回だけ取り直す。
 * lungeHoldUntil=踏み込みの器を止めている終わり(Date.now・0=止めていない)。
 */
export const brawlerKickReaimDue = (
  s: Pick<BrawlerState, 'phase' | 'tech' | 'kickChargeMs' | 'resolved' | 'kickReaimed' | 'targetId'>, lungeHoldUntil: number, now: number,
): boolean => s.phase === 'tech' && s.tech === 'kick' && (s.kickChargeMs ?? 0) > 0 && !s.resolved && !s.kickReaimed
  && !!s.targetId && lungeHoldUntil > 0 && now >= lungeHoldUntil;
/**
 * 新しい技を始めた状態(ポイントは呼び手が払う)。cancel=技の後隙を取り消して出した(§11-4)=技の流れを続ける。
 * 飛び蹴りの2・3発目は同じ技の続き(流れはそのまま)。それ以外は流れをこの技から始め直す。
 */
export const brawlerStartTech = (s: BrawlerState, kind: BrawlerTechKind, t: number, kickN = 0, cancel = false): BrawlerState => {
  const spec = BRAWLER_TECHS[kind];
  const chain = cancel ? [...(s.techChain ?? (s.tech ? [s.tech] : [])), kind]
    : (kind === 'kick' && kickN > 1 && s.techChain) ? s.techChain : [kind];
  return {
    ...s, phase: 'tech', stage: 0, tech: kind, kickN, startAt: t, techChain: chain, techBuffer: undefined, stepBuffer: undefined,
    // 飛び蹴りの3発目は溜め(BRAWLER_KICK3_CHARGE_MS)を前隙の頭に足す(store は飛ぶ時間を距離で引き直して同じく足す)。
    kickChargeMs: kind === 'kick' && kickN >= BRAWLER_KICK_MAX ? BRAWLER_KICK3_CHARGE_MS : 0,
    windupMs: spec.windupMs + (kind === 'kick' && kickN >= BRAWLER_KICK_MAX ? BRAWLER_KICK3_CHARGE_MS : 0), recoveryMs: spec.recoveryMs,
    stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: false, connected: false, landed: false, linked: false, buffered: false, kickReaimed: false,
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
  kick1: true, kick2: true, kick3: false,
  stomp: true, kiko: false,
};
/** 取り消しで出せる技(通常の段は含めない=段へは段のつなぎだけ)。 */
const BRAWLER_CANCEL_TARGETS: readonly BrawlerRouteNode[] = ['kick1', 'stomp', 'kiko'];
/** 同じ技の種類か(kick1/kick2/kick3 は同じ種類)。 */
const routeKindOf = (n: BrawlerRouteNode): string => (n === 'kick1' || n === 'kick2' || n === 'kick3' ? 'kick' : n);
/** 段のつなぎ(通常の次の段)と飛び蹴りの連続。 */
const BRAWLER_NEXT_LINK: Readonly<Partial<Record<BrawlerRouteNode, BrawlerRouteNode>>> = { s1: 's2', s2: 's3', s3: 's4', s4: 's5', kick1: 'kick2', kick2: 'kick3' };
const BRAWLER_ALL_NODES: readonly BrawlerRouteNode[] = ['idle', 's1', 's2', 's3', 's4', 's5', 'kick1', 'kick2', 'kick3', 'stomp', 'kiko', 'guard'];
/** 印から作った表(手書きの組は持たない)。 */
const buildBrawlerRoutes = (): Readonly<Record<BrawlerRouteNode, readonly BrawlerRouteNode[]>> => {
  const out = {} as Record<BrawlerRouteNode, readonly BrawlerRouteNode[]>;
  for (const from of BRAWLER_ALL_NODES) {
    if (from === 'idle') { out[from] = BRAWLER_ALL_NODES.filter(n => n !== 'idle'); continue; } // 待機からは何でも(今どおり)
    if (from === 'guard') { out[from] = ['guard']; continue; }                                 // 構えの延長だけ
    const to: BrawlerRouteNode[] = [];
    if (BRAWLER_CANCELABLE[from]) to.push(...BRAWLER_CANCEL_TARGETS.filter(n => routeKindOf(n) !== routeKindOf(from)));
    const next = BRAWLER_NEXT_LINK[from];
    if (next && !to.includes(next)) to.push(next);
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
export const brawlerRouteNodeOf = (s: Pick<BrawlerState, 'phase' | 'stage' | 'tech' | 'kickN'>): BrawlerRouteNode =>
  s.phase === 'attack' ? brawlerStageNode(s.stage)
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
export const brawlerShouldBufferTech = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean => {
  // ステップの最中に押した技は覚える(§20-8=ステップが終わった瞬間に、待機から出す)。
  if (!brawlerActing(s) && brawlerStepping(s, t) && !isBrawlerGuardingAt(s, t)) return true;
  if (!brawlerActing(s) || isBrawlerGuardingAt(s, t) || (s.phase === 'tech' && s.tech === 'guard')) return false;
  if (brawlerTechAllowed(s, kind, t)) return false;
  const from = brawlerRouteNodeOf(s);
  if (s.phase === 'tech' && s.tech === 'kick' && kind === 'kick') return !s.resolved && s.kickN < BRAWLER_KICK_MAX;
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
  // 待機: ステップの最中に覚えた技(stepHeld)は、ステップが終わった瞬間に出す(§20-8)。それ以外は捨てる。
  if (!brawlerActing(s)) return s.stepHeld ? (brawlerStepping(s, t) ? 'wait' : 'fire') : 'drop';
  if (brawlerTechAllowed(s, k, t)) return 'fire';
  return brawlerShouldBufferTech(s, k, t) ? 'wait' : 'drop';
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
    return s.resolved && brawlerRouteAllows(brawlerTechNode('kick', s.kickN), brawlerTechNode('kick', s.kickN + 1)) && s.kickN < BRAWLER_KICK_MAX;
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
export const brawlerExtendGuard = (s: BrawlerState, t: number, now: number): BrawlerState => ({
  ...s, phase: 'tech', tech: 'guard', startAt: t, windupMs: 0, recoveryMs: BRAWLER_TECHS.guard.recoveryMs,
  stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: true,
  guardUntil: t + BRAWLER_GUARD_MS, guardSince: t, guardRenewAt: now,
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

/** ステップの距離(px)と時間(ms)。加速→減速(無敵なし)。 */
export const BRAWLER_STEP_PX = 100;
export let BRAWLER_STEP_MS = 180; // ×BRAWLER_TEMPO(係数1.0の値)
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

/** 次の蹴りが何発目か(連続の受付の中なら続き・外なら1発目)。 */
export const brawlerNextKickN = (s: BrawlerState, t: number): number =>
  (s.kickCount > 0 && s.kickCount < BRAWLER_KICK_MAX && t <= s.kickChainUntil) ? s.kickCount + 1 : 1;

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
 * 打ち上がり 25%(速く上がって頂点で速さ0)→ 頂点の漂い 20%(わずかに沈み始める)→ 落下 55%(ゆっくり加速して落ちる)。
 */
export const BRAWLER_LIFT_RISE_FRAC = 0.25;
export const BRAWLER_LIFT_HOVER_FRAC = 0.2;
/** 漂いの間に沈む量(頂点の高さに対する割合)。0=止まって見える(機械的)。 */
export const BRAWLER_LIFT_HOVER_SAG = 0.06;
/**
 * 浮かせの弧(高さの倍率)。u=0..1。start=始まりの高さ・top=頂点の高さ(同じ単位)。
 *  - 上り: start→top を ease-out(頂点で速さ0)。
 *  - 漂い: top から SAG だけ二次で沈む(速さ0から)。
 *  - 落下: 漂いの終わりの速さを引き継いで、二次で加速して 0 へ(つなぎ目で速さが跳ばない)。
 * 追撃の浮き直しも同じ形(start=押し上げた瞬間の高さ=つなぎ目で高さが跳ばない)。
 */
/** 浮きの弧の配分(上り・漂いの割合)。省略=格闘の弧(25%・20%)。 */
export interface LiftArcShape { rise: number; hover: number }
/** ★爆発で浮いた弧(research/BRAWLER.md §14・社長「落ちてくるのを爆発のは少しゆっくりに」): 上り20%・漂い15%・落ち65%。 */
export const BLAST_LIFT_SHAPE: LiftArcShape = { rise: 0.2, hover: 0.15 };
export const brawlerLiftArcRel = (u: number, start: number, top: number, shape?: LiftArcShape): number => {
  if (u <= 0) return start;
  if (u >= 1) return 0;
  const R = shape?.rise ?? BRAWLER_LIFT_RISE_FRAC, H = shape?.hover ?? BRAWLER_LIFT_HOVER_FRAC, F = 1 - R - H, S = BRAWLER_LIFT_HOVER_SAG;
  if (u < R) return start + (top - start) * easeOut(u / R);
  if (u < R + H) { const t = (u - R) / H; return top * (1 - S * t * t); }
  const t = (u - R - H) / F;
  const v0 = 2 * S * F / H;           // 漂いの終わりの沈む速さ(落下の区間の単位へ換算)
  const a = 1 - S - v0;               // 残りを加速で落とす(>0)
  return top * ((1 - S) - v0 * t - a * t * t);
};
/** 浮かせの絵の高さ(地面から・px)。u=0..1。 */
export const brawlerLiftHeight = (u: number): number => BRAWLER_LIFT_VIS_PX * brawlerLiftArcRel(u, 0, 1);

// ---------------------------------------------------------------------------------------------
// 動きの影(スタンド)・社長指示2026-11-07「動きの影パーツを用意したので、これをスタンドの様に薄く光らせて重ねて表示するのはどう?」
// +「むしろ当たり判定のヴィジュアルとしてキャラの上に前のめりに出していいと思う。武器の代わりって感じ。」
// 絵は右向き。tipU/tipV = 打つ手足の先(絵の中の割合)。ここを当たりの所へ合わせて置く(pixi)。heightPx = 表示の高さ(world px)。
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
  punch: { tex: 'fx/brawler-stand-punch', tipU: 0.95, tipV: 0.33, bodyU: 0.42, bodyV: 0.5, heightPx: 80 * BRAWLER_STAND_SCALE },
  heavy: { tex: 'fx/brawler-stand-heavy', tipU: 0.96, tipV: 0.3, bodyU: 0.36, bodyV: 0.5, heightPx: 92 * BRAWLER_STAND_SCALE },
  slam: { tex: 'fx/brawler-stand-slam', tipU: 0.55, tipV: 0.9, bodyU: 0.5, bodyV: 0.5, heightPx: 92 * BRAWLER_STAND_SCALE },
  palm: { tex: 'fx/brawler-stand-palm', tipU: 0.88, tipV: 0.22, bodyU: 0.42, bodyV: 0.5, heightPx: 92 * BRAWLER_STAND_SCALE },
  guard: { tex: 'fx/brawler-stand-guard', tipU: 0.62, tipV: 0.34, bodyU: 0.5, bodyV: 0.5, heightPx: 84 * BRAWLER_STAND_SCALE },
  hadou: { tex: 'fx/brawler-stand-hadou', tipU: 0.93, tipV: 0.3, bodyU: 0.42, bodyV: 0.5, heightPx: 88 * BRAWLER_STAND_SCALE },
  kick: { tex: 'fx/brawler-stand-kick', tipU: 0.96, tipV: 0.3, bodyU: 0.36, bodyV: 0.45, heightPx: 92 * BRAWLER_STAND_SCALE },
};
/**
 * 構えの影の絵(fx/brawler-stand-guard・右向き)の中の「腕」の範囲(絵の中の割合)。レバーガード(§12-1c)の腕で受ける影は、この範囲だけを
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
}
/**
 * いまの影の形(判定は持たない・pixi が読む)。慣性: 前隙で体から前へにじみ出る(加速)→ 当たる瞬間に当たりの所まで伸び切る
 * (止めの間は段の時計が止まる=そこで止まる)→ 戻りで前へ抜けながら減速して消える。構えは出ている間うっすら脈打つ。
 */
export const brawlerStandAt = (s: BrawlerState | undefined, t: number): BrawlerStandFrame | null => {
  if (!s) return null;
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
  if (!hit) {
    const pre = s.windupMs > 0 ? Math.min(1, el / s.windupMs) : 1;
    return { ...base, ext: 0.55 * easeIn(pre), alpha: 0.3 + 0.55 * easeOut(pre) };
  }
  // 弱攻撃(2段目)は戻りの前半で消し切る(短め)・薄め。
  const post = Math.min(1, (el - s.windupMs) / Math.max(1, s.recoveryMs) * (light ? 1.6 : 1));
  return { ...base, ext: 1 + (light ? 0.2 : 0.35) * easeOut(post), alpha: (light ? 0.75 : 0.85) * (1 - easeIn(post)) };
};

/** いまの体の形。連続中は立ち絵へ戻さない(コンボが切れた時だけ立ちへ・§4)。 */
export const brawlerPoseAt = (s: BrawlerState | undefined, t: number): BrawlerPose | null => {
  if (!s) return null;
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
        // 弱: しゃがみの絵のまま体を前へ大きく滑らせ、前へ傾ける。2段目は逆の手(残像と傾きの向き)。
        const hand: 1 | -1 = s.stage === 2 ? -1 : 1;
        const thrust = hit ? 1 - easeOut(post) : easeIn(pre);
        return { ...base, tex: 'ready', lean: 0.12 + 0.16 * thrust, push: 14 * thrust, sqX: 1 + 0.08 * thrust, sqY: 1 - 0.06 * thrust, hand, flip: s.stage === 2 };
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
        return { ...base, tex: 'swing', lean: -0.05 * sink, sqY: 1 - 0.08 * sink, sqX: 1 + 0.05 * sink, shakeX: sh.x, shakeY: sh.y };
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
      // 飛び蹴り: 滞空中はしゃがみ+強い前傾 → 当たった瞬間に振り上げの絵へ変える(#4)。
      const big = s.kickN >= BRAWLER_KICK_MAX;
      const charge = Math.max(0, Math.min(s.windupMs, s.kickChargeMs ?? 0));
      if (!hit && charge > 0) {
        // ★3発目の溜め(社長承認2026-11-08「飛び蹴りの3発目も少し溜めてから蹴る」): 跳び上がって空中で体を縮め、沈みながら光る(慣性つき)。
        const c = Math.min(1, el / charge);
        if (c < 1) {
          const rise = BRAWLER_KICK3_CHARGE_RISE_PX * easeOut(Math.min(1, c / 0.45));
          const sink = BRAWLER_KICK3_CHARGE_SINK_PX * easeIn(Math.max(0, (c - 0.45) / 0.55));
          const crouch = easeOut(c);
          return { ...base, tex: 'ready', jump: rise - sink, lean: 0.15 + 0.2 * crouch, push: -4 * crouch, sqY: 1 - 0.16 * crouch, sqX: 1 + 0.1 * crouch };
        }
        // 溜めの後に飛ぶ: 沈んだ高さから飛ぶ弧へつなぐ(つなぎ目で高さが跳ばない)。
        const f = Math.min(1, (el - charge) / Math.max(1, s.windupMs - charge));
        const h0 = BRAWLER_KICK3_CHARGE_RISE_PX - BRAWLER_KICK3_CHARGE_SINK_PX;
        return { ...base, tex: 'ready', jump: h0 * (1 - f) + 30 * Math.sin(Math.PI * f), lean: 0.55, push: 8 };
      }
      if (!hit) return { ...base, tex: 'ready', jump: (big ? 30 : 18) * Math.sin(Math.PI * Math.min(1, pre)), lean: 0.55, push: 8 };
      const th = 1 - easeOut(post);
      return { ...base, tex: post < 0.45 ? 'swing' : 'ready', lean: 0.25 * th, push: 6 * th, sqY: 1 - 0.12 * th, sqX: 1 + 0.08 * th };
    }
    default: return { ...base, tex: 'ready' };
  }
};

// ★起動時のテンポ係数(`?brtempo=`・既定 1.3)。全部の時間の欄が宣言された後(ファイルの末尾)で1回だけ書き直す。
setBrawlerTempo(urlNum(BRAWLER_TEMPO_SEARCH, 'brtempo', BRAWLER_TEMPO_DEFAULT));
