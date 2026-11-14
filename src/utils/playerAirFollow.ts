// ★プレイヤーが空中の敵を殴る時、プレイヤーの絵も宙へ浮かせて敵の高さを追う(描画だけ・判定・移動・当たりの位置・カメラは1pxも変えない)。
// 社長指示2026-11-10「飛び蹴りとか、近接時、空中の敵攻撃する時追尾するプレイヤーも空中に浮かせたい」・research/BRAWLER.md §18。
// ここは高さの曲線(純関数)と「最後に空中の敵へ近接を当てた記録」だけ。store には書かない(記録はこのモジュールの1つの変数・当たりの瞬間にしか書かない)。
// 時計は Date.now 系(ms)。上向きを正とする高さ h(px)と速さ vy(px/ms)。
import { brawlerAirborne, brawlerJuggleHeightRel } from './brawlerCombo';
import { brawlerLiftArcRel } from './brawler';

/** 浮く高さ = 当てた時点での敵の絵の浮いた高さ × この倍率。上限はプレイヤーの体の高さ × CAP。 */
export const PLAYER_AIR_FOLLOW_K = 0.9;
export const PLAYER_AIR_BODY_CAP = 1.3;
/** 上りも落ちも同じ重力(px/ms²)。40px で上り・落ちとも約180ms。上りの初速は v0=√(2gh)=頂点で速さ0になる放物線。 */
export const PLAYER_AIR_GRAVITY = 0.0024;
/** 最後の空中の当たりから、頂点付近で漂う時間(ms)と、漂っている間のゆっくりした沈み(px/ms)。 */
export const PLAYER_AIR_HOVER_MS = 250;
export const PLAYER_AIR_HOVER_SINK = 0.04;
/** 飛び立つ前の沈み(ms)と、その縦の倍率。 */
export const PLAYER_AIR_CROUCH_MS = 40;
export const PLAYER_AIR_CROUCH_SQY = 0.9;
/** 空中の姿勢(伸び縮み): 上がり / 頂点 / 落下。 */
export const PLAYER_AIR_POSE = {
  rise: { sqY: 1.10, sqX: 0.92 },
  apex: { sqY: 0.94, sqX: 1.0 },
  fall: { sqY: 1.06, sqX: 1.0 },
} as const;
/** 敵の方への前傾(rad)。 */
export const PLAYER_AIR_LEAN_RAD = 0.25;
/** 当たり1発ごとの小さな跳ね(px・上げ80ms ease-out・戻し120ms)。 */
export const PLAYER_AIR_BUMP_PX = 5;
export const PLAYER_AIR_BUMP_UP_MS = 80;
export const PLAYER_AIR_BUMP_BACK_MS = 120;
/** 着地の沈みの長さ(ms)と、沈みの深さ(低い落下 → 体の高さから落ちた時)。 */
export const PLAYER_AIR_LAND_MS = 170;
export const PLAYER_AIR_LAND_SQUASH_MIN = 0.08;
export const PLAYER_AIR_LAND_SQUASH_MAX = 0.22;
/** 影(地面の楕円): 体の幅に対する幅・固定のα・縮みの下限(浮きの高さに応じて 1 → これ)。 */
export const PLAYER_AIR_SHADOW_W = 0.6;
export const PLAYER_AIR_SHADOW_ALPHA = 0.5;
export const PLAYER_AIR_SHADOW_SHRINK_MIN = 0.75;
/** 1フレームの進めの上限(ms)。止まった後の復帰で飛ばないように。 */
export const PLAYER_AIR_MAX_DT_MS = 50;

export interface PlayerAirState {
  /** 高さ(px・地面=0)。 */
  h: number;
  /** 上向きの速さ(px/ms)。正=上り・0=頂点/漂い・負=落下。 */
  vy: number;
  /** 飛び立ち前の沈みの終わり(Date.now・未設定=沈んでいない)。 */
  crouchUntil?: number;
}

/** 目標の高さ(px)。enemyScalePx=その敵の浮く絵の高さの基準(1倍=何px)・rel=敵の高さの倍率・bodyH=プレイヤーの体の高さ(上限は ×CAP)。 */
export const playerAirTargetPx = (rel: number, enemyScalePx: number, bodyH: number): number =>
  Math.max(0, Math.min(Math.max(0, bodyH) * PLAYER_AIR_BODY_CAP, PLAYER_AIR_FOLLOW_K * Math.max(0, rel) * Math.max(0, enemyScalePx)));

/** 高さ h まで頂点で速さ0になる初速(px/ms)。 */
export const playerAirLaunchSpeed = (h: number): number => Math.sqrt(2 * PLAYER_AIR_GRAVITY * Math.max(0, h));

export type PlayerAirPhase = 'ground' | 'crouch' | 'rise' | 'apex' | 'fall';
export const playerAirPhase = (s: PlayerAirState, now: number): PlayerAirPhase =>
  s.crouchUntil !== undefined && now < s.crouchUntil ? 'crouch' : s.vy > 1e-6 ? 'rise' : s.vy < -1e-6 ? 'fall' : s.h > 0.5 ? 'apex' : 'ground';

export interface PlayerAirStepInput {
  /** いま(Date.now)と前フレームからの経過(ms)。 */
  now: number; dtMs: number;
  /** 敵の高さへの目標(px)。null=最近の空中の当たりが無い。 */
  targetPx: number | null;
  /** 最後の空中の当たりを「効かせる時刻」(Date.now)。ヒットストップが明けた時刻を渡す(その前は動かさない)。null=当たり無し。 */
  hitAt: number | null;
  /**
   * 追いかけも漂いもしない(§18-3・飛び蹴りで当てた後): ヒットストップが明けたら、そのまま重力で落ちて着地する
   * (社長指示2026-11-11「ポンって飛んでって蹴って、着地して」)。ヒットストップ中に動かさないのは同じ。
   */
  noHover?: boolean;
}
export interface PlayerAirStepResult {
  state: PlayerAirState;
  /** この1フレームで飛び立ちの沈みに入った(砂埃・筋の合図)。 */
  takeoff: boolean;
  /** 着地した時の落下の速さ(px/ms・正)。着地していなければ null。 */
  landSpeed: number | null;
}

/**
 * 1フレーム進める。
 *  - 当たり(hitAt)から HOVER の間、目標が今より高ければ飛び上がる(地上なら 40ms 沈んでから・空中ならすぐ。初速は v0=√(2g(目標−今))=頂点で目標に届いて速さ0)。
 *  - 上り: 重力で減速して頂点で止まる。頂点〜HOVER の終わり: ゆっくり沈みながら漂う(目標が上がればまた飛び上がる)。
 *  - HOVER を過ぎたら重力で加速しながら落ちる。着地で landSpeed を返す。落下中に再び当たったら、その高さから上がり直す(途切れない)。
 *  - ヒットストップ中(now < hitAt)は動かさない。
 */
export const stepPlayerAir = (s: PlayerAirState, inp: PlayerAirStepInput): PlayerAirStepResult => {
  const dt = Math.max(0, Math.min(PLAYER_AIR_MAX_DT_MS, inp.dtMs));
  const { now } = inp;
  let { h, vy, crouchUntil } = s;
  let takeoff = false;
  let landSpeed: number | null = null;
  if (inp.hitAt !== null && now < inp.hitAt) return { state: s, takeoff, landSpeed }; // ヒットストップ中
  const since = inp.hitAt === null ? Infinity : now - inp.hitAt;
  const following = !inp.noHover && inp.targetPx !== null && since <= PLAYER_AIR_HOVER_MS;
  // 飛び上がり(目標が今より高い・上っていない時)。
  if (following && inp.targetPx! - h > 1 && vy <= 1e-6) {
    if (h <= 0.5) {
      if (crouchUntil === undefined) { crouchUntil = now + PLAYER_AIR_CROUCH_MS; takeoff = true; }
    } else vy = playerAirLaunchSpeed(inp.targetPx! - h);
  }
  if (crouchUntil !== undefined) {
    if (now >= crouchUntil) {
      crouchUntil = undefined;
      if (following && inp.targetPx! - h > 1) vy = playerAirLaunchSpeed(inp.targetPx! - h);
    } else return { state: { h, vy: 0, crouchUntil }, takeoff, landSpeed }; // 沈んでいる間は地面のまま
  }
  if (vy > 1e-6) { // 上り(等加速度の厳密解=刻みが粗くても頂点で行き過ぎない)
    const tUp = vy / PLAYER_AIR_GRAVITY;
    if (tUp <= dt) { h += (vy * tUp) / 2; vy = 0; }
    else { h += vy * dt - 0.5 * PLAYER_AIR_GRAVITY * dt * dt; vy -= PLAYER_AIR_GRAVITY * dt; }
  } else if (!inp.noHover && since <= PLAYER_AIR_HOVER_MS && h > 0) { // 漂い
    vy = 0;
    h = Math.max(0, h - PLAYER_AIR_HOVER_SINK * dt);
  } else if (h > 0) { // 落下
    const v1 = vy - PLAYER_AIR_GRAVITY * dt;
    h += vy * dt - 0.5 * PLAYER_AIR_GRAVITY * dt * dt;
    vy = v1;
    if (h <= 0) { landSpeed = -vy; h = 0; vy = 0; }
  }
  return { state: { h, vy, crouchUntil }, takeoff, landSpeed };
};

/**
 * ★飛び蹴りが空中の敵を追う時の跳び(§18-3・社長指示2026-11-11「ポンって飛んでって蹴って」「3段目もジャンプして、そこの高さに追いついて、蹴り飛ばす」)。
 * 飛んでいる間(f=飛ぶ時間の進み 0..1)に、飛び出した時の高さ h0 から「当たる時の敵の高さ」target(px)へ。当たる時刻(f=1)に必ず target に居る。
 * 形は蹴りごとに変える(クリエイティブ監査2026-11-11: 3発とも同じ曲線で「上がり切って止まった所に足を置く」のを避ける):
 *  - 1発目: 低く速く。target の少し上(×1.08)まで f=0.8 で上がり、少し降りながら当てる。
 *  - 2発目: 空中からの小跳び(行き過ぎなし・頂点で速さ0の放物線)。
 *  - 3発目: 大きく跳び越えて(×1.2・f=0.7)、加速しながら蹴り下ろす。
 * 地面から跳ぶ時は、最初の crouchF の間は地面で沈む(膝を溜めてから伸びる)。敵が h0 より低い時は行き過ぎなしで同じ形で下りる。
 */
export interface PlayerKickJumpShape { over: number; peakF: number; crouchF: number }
export const playerKickJumpShape = (kickN: number, fromGround: boolean): PlayerKickJumpShape => ({
  over: kickN >= 3 ? 1.2 : kickN <= 1 ? 1.08 : 1,
  peakF: kickN >= 3 ? 0.7 : kickN <= 1 ? 0.8 : 1,
  crouchF: fromGround ? 0.12 : 0,
});
/**
 * 跳びの高さ(px)と、縦の動きの向き(dir: 1=上っている / 0=頂点付近 / −1=下りている=姿勢と上昇の筋が読む)・地面で沈んでいる間か(crouch)。
 * capPx=行き過ぎの上限(体の高さ×1.3)。
 */
export const playerKickJump = (
  h0: number, target: number, f: number, shape: PlayerKickJumpShape, capPx: number,
): { h: number; dir: 1 | 0 | -1; crouch: boolean } => {
  const u0 = Math.max(0, Math.min(1, f));
  if (shape.crouchF > 0 && u0 < shape.crouchF) return { h: Math.max(0, h0), dir: 0, crouch: true };
  const u = shape.crouchF > 0 ? (u0 - shape.crouchF) / (1 - shape.crouchF) : u0;
  const rising = target >= h0;
  const top = Math.max(target, Math.min(Math.max(target, capPx), target * shape.over));
  if (!rising || shape.peakF >= 1 || top <= target + 0.5) {
    const h = h0 + (target - h0) * (1 - (1 - u) * (1 - u)); // 頂点で速さ0の放物線(下りも同じ形)
    return { h: Math.max(0, h), dir: rising ? (u < 0.6 ? 1 : 0) : -1, crouch: false };
  }
  if (u <= shape.peakF) {
    const a = u / shape.peakF;
    return { h: Math.max(0, h0 + (top - h0) * (1 - (1 - a) * (1 - a))), dir: a < 0.7 ? 1 : 0, crouch: false };
  }
  const b = (u - shape.peakF) / (1 - shape.peakF);
  return { h: Math.max(0, top + (target - top) * b * b), dir: -1, crouch: false }; // 加速しながら蹴り下ろす
};
/** 蹴りが当たった後、その高さで止まる長さ(ms)と、蹴った反動の小さな浮き(px)。止めは短く=敵が落ちているのに自分だけ宙で止まらない。 */
export const PLAYER_KICK_HOLD_MS = 60;
export const PLAYER_KICK_RECOIL_PX = 6;
/**
 * ★3発目の溜めの間の着地(§18-3・社長指示2026-11-11「蹴って、着地して、3段目が出る」)。
 * 前の蹴りで浮いた高さ h0 から、溜めの PLAYER_KICK_LAND_FRAC までに加速しながら落ちて着地する(u=溜めの進み÷その割合・0..1)。
 * 残りの溜めは地面で沈んで力を溜め、そこから跳ぶ。重力の落下(約180ms/40px)だと溜め(約195ms)の内に着地し切れないので、溜めの長さに合わせる。
 */
export const PLAYER_KICK_LAND_FRAC = 0.7;
export const playerKickLandPx = (h0: number, u: number): number => {
  const q = Math.max(0, Math.min(1, u));
  return Math.max(0, h0) * (1 - q * q);
};
/** その着地の瞬間の落下の速さ(px/ms)。landMs=着地までの長さ。着地の沈みの強さ(playerAirLandStrength)へ渡す。 */
export const playerKickLandSpeed = (h0: number, landMs: number): number => (2 * Math.max(0, h0)) / Math.max(1, landMs);
/** 跳びを出すしきい値(px)。当たる時の敵がこれより低い(ほぼ地面)・自分も地面なら、今どおりの地上の蹴りの跳ねのまま。 */
export const PLAYER_KICK_JUMP_MIN_PX = 4;

/** 当たり1発ごとの小さな跳ね(px)。0〜80ms で ease-out に上がり、続く120msで滑らかに戻る。 */
export const playerAirBumpPx = (sinceHitMs: number): number => {
  if (!(sinceHitMs >= 0) || sinceHitMs >= PLAYER_AIR_BUMP_UP_MS + PLAYER_AIR_BUMP_BACK_MS) return 0;
  if (sinceHitMs < PLAYER_AIR_BUMP_UP_MS) { const u = sinceHitMs / PLAYER_AIR_BUMP_UP_MS; return PLAYER_AIR_BUMP_PX * (1 - (1 - u) * (1 - u)); }
  const q = (sinceHitMs - PLAYER_AIR_BUMP_UP_MS) / PLAYER_AIR_BUMP_BACK_MS;
  return PLAYER_AIR_BUMP_PX * (1 - q * q * (3 - 2 * q));
};

/** 空中の姿勢の伸び縮み(縦・横)。沈み・上り・頂点・落下で変える。地上は 1。 */
export const playerAirPoseTarget = (phase: PlayerAirPhase): { sqY: number; sqX: number } =>
  phase === 'ground' ? { sqY: 1, sqX: 1 }
    : phase === 'crouch' ? { sqY: PLAYER_AIR_CROUCH_SQY, sqX: 1 + (1 - PLAYER_AIR_CROUCH_SQY) * 0.6 }
      : PLAYER_AIR_POSE[phase];

/** 着地の強さ(0..1)=落下の速さ ÷ 体の高さから落ちた時の速さ。 */
export const playerAirLandStrength = (landSpeed: number, bodyH: number): number => {
  const vBody = playerAirLaunchSpeed(Math.max(1, bodyH));
  return Math.max(0, Math.min(1, landSpeed / vBody));
};
/** 着地の沈みの深さ(低い落下 0.08 → 体の高さから 0.22)。 */
export const playerAirLandDepth = (strength: number): number =>
  PLAYER_AIR_LAND_SQUASH_MIN + (PLAYER_AIR_LAND_SQUASH_MAX - PLAYER_AIR_LAND_SQUASH_MIN) * Math.max(0, Math.min(1, strength));
/** 着地の沈み(縦の倍率・1=変化なし)。着地の瞬間から速く沈み、ゆっくり戻る。 */
export const playerAirLandSquashY = (sinceLandMs: number, depth: number): number => {
  if (!(sinceLandMs >= 0) || sinceLandMs >= PLAYER_AIR_LAND_MS) return 1;
  const u = sinceLandMs / PLAYER_AIR_LAND_MS;
  return 1 - depth * Math.sin(Math.PI * Math.pow(u, 0.6));
};

/** 影(地面の楕円)の幅の縮み(1=縮まない・浮きの高さ airK 0..1 で 0.75 まで)。幅・αは固定値(敵と同じ縮め方は使わない)。 */
export const playerAirShadowShrink = (airK: number): number =>
  1 - (1 - PLAYER_AIR_SHADOW_SHRINK_MIN) * Math.max(0, Math.min(1, airK));

// ---- 浮いている間は敵の方へ寄る(社長承認2026-11-10・§18-3) ----
/** 寄せる量の最大(体幅に対する割合)。浮いた高さが体の高さに届いた時に満額・地上では0。 */
export const PLAYER_AIR_SHIFT_BODY_W = 0.3;
/** 寄せ・戻しの時定数(ms)。跳ばずに寄って跳ばずに戻る(指数で寄せる=慣性)。 */
export const PLAYER_AIR_SHIFT_TAU_MS = 70;
/** 寄せの目標(px・向き dir=+1/-1 を掛けた符号つき)。浮いた高さの割合に比例。 */
export const playerAirShiftTarget = (h: number, bodyH: number, bodyW: number, dir: number): number =>
  (dir >= 0 ? 1 : -1) * PLAYER_AIR_SHIFT_BODY_W * Math.max(0, bodyW) * Math.max(0, Math.min(1, h / Math.max(1, bodyH)));
/** 寄せを時間で目標へ寄せる(指数)。 */
export const playerAirShiftStep = (cur: number, target: number, dtMs: number): number =>
  cur + (target - cur) * (1 - Math.exp(-Math.max(0, Math.min(100, dtMs)) / PLAYER_AIR_SHIFT_TAU_MS));

// ---- 浮いている間に出る番が来た「地面を叩く砂埃」を、プレイヤーの絵が着地する瞬間まで保留する(社長承認2026-11-10・§18-3) ----
/** これより高く浮いている間は保留(px)。 */
export const PLAYER_AIR_DUST_HOLD_PX = 3;
/** 保留の寿命(ms)。出撃の切り替えやリセットで残さない保険=この時間を過ぎた保留は出さずに捨てる。 */
export const PLAYER_AIR_DUST_PENDING_MAX_MS = 4000;
export interface GroundDustGate { wasActive: boolean; pendingAt?: number }
/**
 * 砂埃の「出す/出さない」の門。active=今の描画が出す条件(今までどおり)・airPx=プレイヤーの絵の浮いた高さ。
 *  - 浮いていない時は eff=active のまま(今までと同じ)。
 *  - 浮いている間に出る番(active の立ち上がり)が来たら保留し、浮いている間は出さない。絵が着地した瞬間に eff=true を1回返す(元の砂埃を頭から・薄くも短くもしない)。
 *  - 保留は寿命を過ぎたら捨てる(出さない)。
 */
export const groundDustGate = (g: GroundDustGate, active: boolean, airPx: number, now: number): { eff: boolean; next: GroundDustGate } => {
  let pendingAt = g.pendingAt;
  if (active && !g.wasActive && airPx > PLAYER_AIR_DUST_HOLD_PX) pendingAt = now;
  let eff = active;
  if (pendingAt !== undefined) {
    const age = now - pendingAt;
    if (airPx > PLAYER_AIR_DUST_HOLD_PX && age <= PLAYER_AIR_DUST_PENDING_MAX_MS) eff = false;
    else { eff = age <= PLAYER_AIR_DUST_PENDING_MAX_MS ? true : active; pendingAt = undefined; }
  }
  return { eff, next: { wasActive: active, pendingAt } };
};

// ---- 最後に空中の敵へ近接を当てた記録 ----
export interface AirMeleeHit { at: number; enemyId: string; rel: number }
let lastAirMeleeHit: AirMeleeHit | null = null;
/** 近接(格闘の段・技・ナイフ・刀・鞭・気功の爆発)が敵に当たる瞬間に呼ぶ。浮いていなければ何もしない(銃は呼ばない)。 */
export const noteAirMeleeHit = (e: Parameters<typeof brawlerJuggleHeightRel>[0] & { id: string }, now: number): void => {
  if (!brawlerAirborne(e, now)) return;
  lastAirMeleeHit = { at: now, enemyId: e.id, rel: brawlerJuggleHeightRel(e, now) };
};
export const getLastAirMeleeHit = (): AirMeleeHit | null => lastAirMeleeHit;
export const resetAirMeleeHit = (): void => { lastAirMeleeHit = null; };

// ---------------------------------------------------------------------------------------------
// research/BRAWLER_PHANTOM.md §4-9: 格闘の幻影のアッパー(3段目)・跳び踏み潰し(4段目)を食らった時、プレイヤーの絵だけ浮く
// (操作は奪わない・判定・移動・カメラは地面のまま)。上の「追いかけの浮き」とは別の1本(取り合わない)。描画は max で合わせる。
// ---------------------------------------------------------------------------------------------
/** 浮く高さ = プレイヤーの体の高さ × この倍率。 */
export const PLAYER_LAUNCH_BODY_K = 0.6;
let playerLaunchedAt = Number.NEGATIVE_INFINITY;
let playerLaunchMs = 585;
/** 打ち上げられた瞬間(Date.now)と、浮きの長さ(格闘の浮きの尺=BRAWLER_LIFT_MS)。当たりの瞬間にだけ書く。 */
export const notePlayerLaunched = (now: number, ms: number): void => { playerLaunchedAt = now; playerLaunchMs = Math.max(1, ms); };
/** いまの見た目の浮きの高さ(px)。弧は格闘の浮きと同じ形(速く上がり・頂点で漂い・ゆっくり落ちる)。 */
export const playerLaunchHeightPx = (now: number, bodyH: number): number => {
  const u = (now - playerLaunchedAt) / playerLaunchMs;
  if (!(u >= 0 && u < 1)) return 0;
  return Math.max(0, bodyH * PLAYER_LAUNCH_BODY_K * brawlerLiftArcRel(u, 0, 1));
};
/** テスト・ラン境界用。 */
export const resetPlayerLaunch = (): void => { playerLaunchedAt = Number.NEGATIVE_INFINITY; };
