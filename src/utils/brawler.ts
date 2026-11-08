// サブウェポン「格闘」の純関数(research/BRAWLER.md)。判定・時計・状態機械はここ1本。store / pixi は読むだけ。
// 描画も store も import しない(renderer-agnostic)。時計は gameTime(一時停止・会話・アテンションで止まる)。
import type { Enemy } from '../types/game';
import type { Rect } from '../world/obstacles';
import { segmentBlocked } from '../world/obstacles';
import { enemyRangeRect, isCorpse, isReaperFamily, isTerminalReaper, isUntouchable } from './enemyUtils';

// ---------------------------------------------------------------------------------------------
// 段の表(§2-2・叩き台)と技の表(§8-3)
// ---------------------------------------------------------------------------------------------
export type BrawlerKb = 'none' | 'normal' | 'big';
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
}
export const BRAWLER_STAGES: readonly BrawlerStageSpec[] = [
  { stage: 1, windupMs: 60, recoveryMs: 140, mult: 0.35, kb: 'none', hitstopMs: 45, shape: 'single', dashPx: 60 },
  { stage: 2, windupMs: 60, recoveryMs: 140, mult: 0.35, kb: 'none', hitstopMs: 45, shape: 'single', dashPx: 60 },
  { stage: 3, windupMs: 120, recoveryMs: 230, mult: 0.8, kb: 'normal', hitstopMs: 80, shape: 'fist', dashPx: 60 },
  { stage: 4, windupMs: 250, recoveryMs: 200, mult: 1.0, kb: 'none', hitstopMs: 90, shape: 'landing', dashPx: 50 },
  // 5段目=一閃型の貫通突進(社長指示2026-11-07)。前隙 250 = 溜め 100 + 突き抜け 150。判定は抜け切った瞬間に軌跡の帯で一括(§9-26)。
  // 社長指示2026-11-07「飛距離少しだけ短く」で突き抜け 160→140px・150→130ms(最高速は同じ)。総尺 500 は戻り 270 で保つ(§9-35)。
  { stage: 5, windupMs: 230, recoveryMs: 270, mult: 1.3, kb: 'big', hitstopMs: 140, shape: 'band', dashPx: 0 }, // 押した瞬間の詰めは無し(溜めの後に突き抜ける)
];
export const brawlerStageSpec = (stage: number): BrawlerStageSpec =>
  BRAWLER_STAGES[Math.max(1, Math.min(5, Math.round(stage))) - 1];

export type { BrawlerTechKind } from './brawlerTypes';
import type { BrawlerState, BrawlerTechKind } from './brawlerTypes';
export interface BrawlerTechSpec {
  kind: BrawlerTechKind;
  cost: number;
  windupMs: number;
  recoveryMs: number;
}
export const BRAWLER_TECHS: Readonly<Record<BrawlerTechKind, BrawlerTechSpec>> = {
  guard: { kind: 'guard', cost: 3, windupMs: 0, recoveryMs: 1000 }, // 社長指示2026-11-07「カウンターは3ポイントに変更」(旧5)
  stomp: { kind: 'stomp', cost: 5, windupMs: 200, recoveryMs: 400 },
  kiko: { kind: 'kiko', cost: 2, windupMs: 120, recoveryMs: 330 },
  kick: { kind: 'kick', cost: 1, windupMs: 120, recoveryMs: 150 },
};
export const brawlerActionTotalMs = (windupMs: number, recoveryMs: number): number => windupMs + recoveryMs;

/** 技ポイントの上限(§2-5: Lv1=5 / Lv2=10 / Lv3=20)。 */
export const BRAWLER_POINT_CAP_BY_LEVEL = [0, 5, 10, 20] as const;
export const brawlerPointCap = (level: number): number =>
  BRAWLER_POINT_CAP_BY_LEVEL[Math.max(1, Math.min(3, Math.round(level)))];

// 細かい数値(§2・§3・§7)
export const BRAWLER_CHAIN_RESET_MS = 400;   // 最後に当ててから押さなければ1段目へ(§2-4)
export const BRAWLER_WHIFF_BUFFER_MS = 150;  // 空振りの段は戻りの終わり 150ms 前から先行入力を受ける(§2-1)
export const BRAWLER_FIST_RADIUS = 28;       // 3段目の拳の周り(§2-2)
export const BRAWLER_LANDING_RADIUS = 70;    // 4段目の着地点の円(§2-2)
export const BRAWLER_BAND_LEN = 160;         // 5段目の帯(§2-2)
export const BRAWLER_BAND_HALF_W = 22;       // 幅44の半分
/** 5段目の突き抜け(§2-2・§9-26): 溜め→帯の長さぶん加速して抜ける。溜め = 前隙 − 突き抜け。 */
export const BRAWLER_PALM_DASH_MS = 130;
export const BRAWLER_PALM_PASS_PX = 140;
/** 抜けた先の減速(止めが明けた後に滑って止まる距離と尺)。 */
export const BRAWLER_PALM_SETTLE_PX = 22;
export const BRAWLER_PALM_SETTLE_MS = 120;
/** 吹き飛ばしの向き: 軌跡から横へ外向き+進む向きへ少し(抜けた後ろで左右へ割れる)。 */
export const BRAWLER_PALM_KB_FORWARD = 0.4;
export const BRAWLER_JUMP_VIS_PX = 48;       // 4段目の見た目の跳ぶ高さ(判定は地面のまま・§2-3)
export const BRAWLER_LIFT_MS = 450;          // 4段目の浮かせの足止め(§7-10)
export const BRAWLER_LIFT_VIS_PX = 26;       // 浮かせの絵の高さ(§7-10)
export const BRAWLER_STOMP_RADIUS = 150;     // 下の大踏み潰し(§3-3)
export const BRAWLER_STOMP_MULT = 2.0;
export const BRAWLER_STOMP_HITSTOP_MS = 140; // ★未決(§9-2): 大踏み潰しの止めは表に無い=締めの止め(掌底)と同じにした
export const BRAWLER_KIKO_SPEED = 900;       // 左の気功(§3-4)
export const BRAWLER_KIKO_RANGE = 420;
export const BRAWLER_KIKO_RADIUS = 70;
export const BRAWLER_KIKO_MULT = 1.5;
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
export const BRAWLER_KICK_FLIGHT_MAX_MS = 150;
export const brawlerKickFlightMs = (dist: number): number =>
  Math.max(BRAWLER_TECHS.kick.windupMs, Math.min(BRAWLER_KICK_FLIGHT_MAX_MS, BRAWLER_TECHS.kick.windupMs * Math.max(0, dist) / 160));
export const BRAWLER_KICK_MULT = 0.7;
export const BRAWLER_KICK_CHAIN_MS = 500;
export const BRAWLER_KICK_MAX = 3;
/** 弾を1つ拾った時に増える技ポイント(社長指示2026-11-07「弾を拾っても技ポイントが増える で」。量は暫定=§9-24)。 */
export const BRAWLER_AMMO_PICKUP_POINTS = 1;
export const BRAWLER_KICK_HITSTOP_MS = [0, 80, 80, 140] as const; // ★未決(§9-2): 1・2発目=強の止め / 3発目=締めの止め
export const BRAWLER_GUARD_MS = 1000;        // 上の構え(§3-2)
export const BRAWLER_GUARD_QUICK_MS = 500;   // 受けた直後は次の通常攻撃が前隙なし(社長決定 #7)
export const BRAWLER_BIG_KB_MULT = 4;        // 掌底=今の近接の4倍(§2-2)
export const BRAWLER_STANDOFF_PX = 24;       // 詰めの止まる所(相手の帯の縁から)
/** 5ポイント技の出だしの溜め(画面をわずかに暗くする・§3-1)。 */
export const BRAWLER_SUPER_FLASH_MS = 100;
/**
 * 段ごとの音程(1段目→5段目)。等間隔に下げない=段ごとに個別の値(クリエイティブ監査 #7)。
 * swing=振りの風切り / hit=肉を打つ音。0番は使わない。
 */
export const BRAWLER_SWING_PITCH = [1, 1.1, 1.02, 0.84, 0.8, 0.68] as const;
export const BRAWLER_HIT_PITCH = [1, 1.18, 1.08, 0.88, 0.82, 0.64] as const;
export const BRAWLER_HIT_GAIN = [1, 0.7, 0.75, 0.95, 0.85, 1.1] as const;
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
export const isBrawlerBusy = (s: BrawlerState | undefined): boolean => !!s && s.phase !== 'idle';
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
    stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: false, connected: false, buffered: false,
    palmFromX: undefined, palmFromY: undefined,
    // 前隙なしは1回きり(受けた直後の最初の1発だけ)。
    quickUntil: quick ? 0 : s.quickUntil,
    // 通常攻撃を押したら蹴りの連続は切れる(§7-5)。
    kickChainUntil: 0, kickCount: 0,
  };
};

/** 新しい技を始めた状態(ポイントは呼び手が払う)。 */
export const brawlerStartTech = (s: BrawlerState, kind: BrawlerTechKind, t: number, kickN = 0): BrawlerState => {
  const spec = BRAWLER_TECHS[kind];
  return {
    ...s, phase: 'tech', stage: 0, tech: kind, kickN, startAt: t,
    windupMs: spec.windupMs, recoveryMs: spec.recoveryMs,
    stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: false, connected: false, buffered: false,
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
  if (s.phase === 'idle') return 'start';
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

/** 判定を解いた後の状態(当たった/外れた)。当たった時はポイントと止めも足す。 */
export const brawlerAfterResolve = (
  s: BrawlerState, t: number, hits: number, opts: { pointCap: number; countPoint: boolean; hitstopMs: number },
): BrawlerState => {
  const connected = hits > 0;
  let next: BrawlerState = { ...s, resolved: true, connected };
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
    // 蹴りの連続の受付(kickChainUntil)は着いた瞬間に呼び手が張る(§8-3)。ここでは触らない。
  };
  return { state, fire };
};

/** 出かかった行動を取り消す(掴まれ・紫・シーカー=§8-4)。先行入力も捨てる。 */
export const brawlerCancel = (s: BrawlerState): BrawlerState => ({
  ...s, phase: 'idle', tech: null, buffered: false, nextStage: 1, chainUntil: 0,
  guardUntil: 0, kickChainUntil: 0, kickCount: 0,
});
/** 被弾した(段は1段目へ・先行入力は捨てる=§2-4)。行動そのものは続く(殴り返されて止まるのは敵の止めの側)。 */
export const brawlerOnHurt = (s: BrawlerState): BrawlerState => ({
  ...s, buffered: false, nextStage: 1, chainUntil: 0,
});

/** 技ポイントを払えるか。 */
export const brawlerCanPay = (s: BrawlerState, kind: BrawlerTechKind): boolean => s.points >= BRAWLER_TECHS[kind].cost;

/** 技を今出せるか(払える以外の条件)。構えは途中で解除できない・技の最中は出さない(飛び蹴りの連続は着いた後だけ)。 */
export const brawlerTechAllowed = (s: BrawlerState, kind: BrawlerTechKind, t: number): boolean => {
  // 構えの間は構えの再入力(延長)だけ受け付ける(社長指示2026-11-07「カウンター中もカウンター入力を受け付ける(連続延長発動できる)」)。
  if (isBrawlerGuardingAt(s, t)) return kind === 'guard';
  if (s.phase === 'tech') {
    if (kind !== 'kick' || s.tech !== 'kick' || !s.resolved) return false;
    return s.kickCount < BRAWLER_KICK_MAX;
  }
  return true; // 待機・通常攻撃のどこからでも(必殺技キャンセル)
};
/**
 * 構えを延長する(構えの最中の再入力・§9-41)。終わる時刻を「再入力の時刻+1秒」に引き直す(積み上げない)。
 * しゃがみの溜めからやり直さない=構えたまま。行動の時計(startAt)は引き直して、構えの終わり=行動の終わりに揃える。
 */
export const brawlerExtendGuard = (s: BrawlerState, t: number, now: number): BrawlerState => ({
  ...s, phase: 'tech', tech: 'guard', startAt: t, windupMs: 0, recoveryMs: BRAWLER_TECHS.guard.recoveryMs,
  stopFrom: 0, stopUntil: 0, stopPrevMs: 0, resolved: true,
  guardUntil: t + BRAWLER_GUARD_MS, guardSince: t, guardRenewAt: now,
});

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
const centerOf = (e: Pick<Enemy, 'x' | 'y' | 'width' | 'height'>) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
const blocked = (ox: number, oy: number, e: Enemy, walls: readonly Rect[]): boolean => {
  if (walls.length === 0) return false;
  const c = centerOf(e);
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
    if (along < -half || along > len + half) continue;
    const perp = Math.abs(ex * uy - ey * ux);
    if (perp > halfW + half) continue;
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
    const c = centerOf(target);
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
/** 大踏み潰しの跳び(溜めの後 0.42〜1)。4段目より高い(#6)。上りは速く・頂点は短く・叩きつけは加速。 */
export const BRAWLER_STOMP_VIS_PX = 66;
export const brawlerStompHeight = (p: number): number => {
  if (p <= 0.42 || p >= 1) return 0;
  const q = (p - 0.42) / 0.58;
  if (q < 0.5) return BRAWLER_STOMP_VIS_PX * easeOut(q / 0.5);
  if (q < 0.62) return BRAWLER_STOMP_VIS_PX;
  return BRAWLER_STOMP_VIS_PX * (1 - easeIn((q - 0.62) / 0.38));
};
/** 浮かせの絵の高さ: 上りは速く・頂点で少し止まり・落ちは加速(§7-10)。u=0..1。 */
export const brawlerLiftHeight = (u: number): number => {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.3) return BRAWLER_LIFT_VIS_PX * easeOut(u / 0.3);
  if (u < 0.5) return BRAWLER_LIFT_VIS_PX;
  return BRAWLER_LIFT_VIS_PX * (1 - easeIn((u - 0.5) / 0.5));
};

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
}
/**
 * いまの影の形(判定は持たない・pixi が読む)。慣性: 前隙で体から前へにじみ出る(加速)→ 当たる瞬間に当たりの所まで伸び切る
 * (止めの間は段の時計が止まる=そこで止まる)→ 戻りで前へ抜けながら減速して消える。構えは出ている間うっすら脈打つ。
 */
export const brawlerStandAt = (s: BrawlerState | undefined, t: number): BrawlerStandFrame | null => {
  if (!s || s.phase === 'idle') return null;
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
      // 大踏み潰し: 長めの溜め(しゃがみで沈む)→ 4段目より高く跳んで → 叩きつけ(#6)。
      if (!hit) {
        if (pre < 0.42) { const q = pre / 0.42; return { ...base, tex: 'ready', sqY: 1 - 0.2 * easeOut(q), sqX: 1 + 0.12 * easeOut(q) }; }
        return { ...base, tex: 'swing', jump: brawlerStompHeight(pre), sqY: 1.06, sqX: 0.96 };
      }
      const land = Math.max(0, 1 - post * 2.5);
      return { ...base, tex: 'ready', sqY: 1 - 0.28 * land, sqX: 1 + 0.22 * land };
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
      if (!hit) return { ...base, tex: 'ready', jump: (big ? 30 : 18) * Math.sin(Math.PI * Math.min(1, pre)), lean: 0.55, push: 8 };
      const th = 1 - easeOut(post);
      return { ...base, tex: post < 0.45 ? 'swing' : 'ready', lean: 0.25 * th, push: 6 * th, sqY: 1 - 0.12 * th, sqX: 1 + 0.08 * th };
    }
    default: return { ...base, tex: 'ready' };
  }
};
