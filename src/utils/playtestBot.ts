// M9-B: デバッグボットの入力合成(PACING_PUZZLE.md §5.10)。
// 目的はデバッグ(バランス測定ではない)ため、上手さより「想定外の遊び方」を重視した
// ペルソナ5種(叩き台)。純関数(store/Reactに依存しない)= ユニットテスト可能。
// 呼び出し側(headless driver)がこの決定を実際の store アクション(movePlayer/triggerCounter/
// setActiveWeapon)へ反映する。
import type { Enemy, InputState, Player, Projectile } from '../types/game';
// ★v0.25.3554: 「この構えは弾ける」の唯一の出どころを共有する(写すな、共通化しろ)。
import { isDashParryCounterPhase } from './combatTick';
import { isCorpse } from './enemyUtils';

// 'rusher' はPACING_PUZZLE.md §5.20(M19・深層ラッシュ試験専用)のペルソナ。既存の通常スモーク
// (BOT_PERSONAS の巡回)には含めず、専用テストからのみ persona 名で直接呼び出す。
import {
  botSkillProfile, pickTarget, shouldRetreatForHp, isContactDangerous,
  type BotSkill, type BotSkillProfile,
} from './botSkill';

export type BotPersona = 'standard' | 'kiter' | 'stationary' | 'boar' | 'wanderer' | 'rusher' | 'scavenger';

// 'scavenger'(v0.25.2171・弾薬AIディレクター検証専用)も rusher と同じ理由でBOT_PERSONASには
// 含めない(通常戦闘+弾薬優先回収という特化挙動の検証用。専用テストからのみ直接呼び出す)。
export const BOT_PERSONAS: BotPersona[] = ['standard', 'kiter', 'stationary', 'boar', 'wanderer'];

export interface BotDecision {
  input: InputState;
  wantsMelee: boolean;        // このtickに triggerCounter() を呼ぶか
  wantsWeaponSwitch: boolean; // このtickに武器切替を試みるか(所持武器を巡回)
}

const STILL_INPUT: InputState = { up: false, down: false, left: false, right: false };
const MELEE_ENGAGE_DIST = 80;   // この距離以内なら近接(カウンター)を試みる
const SURROUND_RADIUS = 140;    // この距離以内の敵数で「囲まれた」を判定
// 「囲まれた」と判断する敵数。**腕前段階(botSkill)の casual と同値**であること
// (botSkill.test.ts が両者の一致を不変条件として検査している)。段階指定時は sk.surroundCount が使われる。
export const SURROUND_COUNT = 3;

const distTo = (px: number, py: number, e: Enemy): number => Math.hypot(e.x - px, e.y - py);

const nearestEnemy = (px: number, py: number, enemies: Enemy[]): Enemy | undefined => {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const e of enemies) {
    const d = distTo(px, py, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
};

/**
 * 処刑優先(スタン敵へ寄る)を許す最大距離(px)。
 *
 * ★v0.25.3553(社長報告「敵がクリティカル状態になると、間に敵がいてもお構いなしに突っ込んでいってる」)。
 *
 * **何が起きていたか**: `nearestStunned` の結果が `stunned ?? skillTarget(...)` で
 * **無条件に標的選択を上書き**していた。腕前設定(`targeting`)も危険度も、**間に何体いるかも見ない**。
 * さらに移動は `approach()` = 標的への直線入力で、**障害物も敵も避けない**。
 * ⇒ 「処刑優先」が他のすべてより強く、**群れを突っ切って気絶敵へ突っ込む**。
 *
 * **直し方**: 処刑優先そのものは残す(気絶=好機、を捨てるのは違う)が、**距離の上限**を付ける。
 * 目の前の気絶敵は従来どおり処刑し、**フィールドを横断してまで取りに行かない**。
 * `MELEE_ENGAGE_DIST`(80=近接が届く距離)の2倍を叩き台とした——1歩踏み込めば届く範囲、という意味。
 * 「間にいる敵の数で諦める」判定は入れていない(距離だけで実害が消える見込み・必要なら後段で足す)。
 */
export const STUNNED_CHASE_MAX_DIST = MELEE_ENGAGE_DIST * 2;

// スタン中(gameTime基準)の敵を優先ターゲットにする(標準ペルソナ=処刑優先)。
// ★v0.25.3553: **STUNNED_CHASE_MAX_DIST 以内のものだけ**が対象(上のコメント参照)。
const nearestStunned = (px: number, py: number, enemies: Enemy[], gameTime: number): Enemy | undefined => {
  let best: Enemy | undefined;
  let bestD = STUNNED_CHASE_MAX_DIST;
  for (const e of enemies) {
    if (e.stunUntil === undefined || e.stunUntil <= gameTime) continue;
    const d = distTo(px, py, e);
    if (d <= bestD) { bestD = d; best = e; }
  }
  return best;
};

const dirInput = (dx: number, dy: number): InputState => ({
  up: dy < -0.3, down: dy > 0.3, left: dx < -0.3, right: dx > 0.3,
});

const approach = (pcx: number, pcy: number, e: Enemy): InputState => {
  const dx = e.x - pcx, dy = e.y - pcy;
  const n = Math.max(0.001, Math.hypot(dx, dy));
  return dirInput(dx / n, dy / n);
};

const retreat = (pcx: number, pcy: number, e: Enemy): InputState => {
  const dx = pcx - e.x, dy = pcy - e.y;
  const n = Math.max(0.001, Math.hypot(dx, dy));
  return dirInput(dx / n, dy / n);
};

// M49-2(§6.25): 危険度ベースの距離維持。standard/scavengerの「狙った的へ寄って殴る」判断を共通化し、
// meleeVsDanger===false の段では危険な敵(isContactDangerous)に対して
// (a) MELEE_ENGAGE_DISTではなくavoidContactDistまでしか近寄らず、(b) wantsMeleeを出さず、
// (c) avoidContactDist圏内に入ったら距離を取る、という「近接を諦めて距離を保つ」挙動にする。
// **危険でない敵には従来どおり**(meleeAllowed=true→keepDist=MELEE_ENGAGE_DIST・通常通り殴る)。
const engageDecision = (
  sk: BotSkillProfile,
  player: Player,
  pcx: number, pcy: number,
  target: Enemy,
  noRetreat: boolean | undefined,
  nearbyCount: number,
  surroundNeed: number,
): BotDecision => {
  const meleeAllowed = sk.meleeVsDanger || !isContactDangerous(target, player.maxHealth);
  const keepDist = (!meleeAllowed && sk.avoidContactDist > 0) ? sk.avoidContactDist : MELEE_ENGAGE_DIST;
  if (!noRetreat && (nearbyCount >= surroundNeed || shouldRetreatForHp(sk, player.health, player.maxHealth))) {
    const d = distTo(pcx, pcy, target);
    return { input: retreat(pcx, pcy, target), wantsMelee: meleeAllowed && d < MELEE_ENGAGE_DIST, wantsWeaponSwitch: false };
  }
  const d = distTo(pcx, pcy, target);
  if (d > keepDist) {
    return { input: approach(pcx, pcy, target), wantsMelee: false, wantsWeaponSwitch: false };
  }
  if (!meleeAllowed) {
    // 危険敵には近接を諦め、これ以上近寄らず距離を取る(近接自殺の直接の対策)。
    return { input: retreat(pcx, pcy, target), wantsMelee: false, wantsWeaponSwitch: false };
  }
  return { input: STILL_INPUT, wantsMelee: true, wantsWeaponSwitch: false };
};

// M26 Step1(§6.2): 手が空いている(入力が無い)tickに、近くのピックアップ(XP/弾薬/回復)へ歩み寄る
// 「拾い」挙動。実プレイヤーが戦闘の隙間にジェムを回収する動きの再現。stationary(棒立ちが仕様)は除外。
// 危険になれば次tickの本来のペルソナ判断(退避等)が優先されるので自己修正される。
export const pickupSeekInput = (
  persona: BotPersona,
  input: InputState,
  pcx: number,
  pcy: number,
  pickups: readonly { x: number; y: number }[],
  maxDist = 240,
): InputState => {
  if (persona === 'stationary') return input;
  if (input.up || input.down || input.left || input.right) return input; // 本来の判断が動いている時は触らない
  let bestX = 0, bestY = 0, bestD = maxDist;
  for (const p of pickups) {
    const d = Math.hypot(p.x + 8 - pcx, p.y + 8 - pcy); // ピックアップは16px角=中心へ+8
    if (d < bestD) { bestD = d; bestX = p.x + 8; bestY = p.y + 8; }
  }
  if (bestD >= maxDist) return input;
  const n = Math.max(0.001, bestD);
  return dirInput((bestX - pcx) / n, (bestY - pcy) / n);
};

// v0.25.2171(弾薬AIディレクター検証用・社長指定): 'scavenger' ペルソナ専用の弾薬ピックアップ優先回収。
// pickupSeekInput(全種類・240px・全ペルソナ共通)はそのまま残した上で、scavenger だけ追加で
// 「ammo-* ピックアップ限定・より広い半径」を手空きtickに探す(既存関数・他ペルソナの挙動は不変)。
// 半径の目安: デフォルトgameBounds(800x600)基準の「半画面」相当(=幅800の半分=400。有効視認の
// 目安として横/縦の半分の平均=350を採用・叩き台)。1.7画面側は同じ「半画面=350」を1画面=700とみなし
// ×1.7=1190(useGameLoop.tsのエアドロップ配置=halfMax×1.1〜1.6=440〜640pxを1190は確実にカバーする)。
// - 通常時: worldDrop有無を問わず ammo-* ピックアップを SCAVENGER_AMMO_SEEK_DIST 以内で探す
//   (画面内相当。「画面外の弾は通常は拾いに行かない」を距離カットで表現)。
// - 枯渇時(呼び出し側が isOutOfAmmo で通知): worldDrop(エアドロップ等)だけ、より広い
//   SCAVENGER_AMMO_DEPLETED_SEEK_DIST まで探索半径を拡張する。
export const SCAVENGER_AMMO_SEEK_DIST = 350;          // 「半画面以内」の叩き台
export const SCAVENGER_AMMO_DEPLETED_SEEK_DIST = 1190; // 「約1.7画面以内」の叩き台(worldDrop限定・枯渇時のみ)

export interface AmmoPickupLike { x: number; y: number; type: string; worldDrop?: boolean }

export const scavengerAmmoSeekInput = (
  persona: BotPersona,
  input: InputState,
  pcx: number,
  pcy: number,
  ammoPickups: readonly AmmoPickupLike[],
  isOutOfAmmo: boolean,
  seekDist = SCAVENGER_AMMO_SEEK_DIST,
  depletedWorldDropSeekDist = SCAVENGER_AMMO_DEPLETED_SEEK_DIST,
): InputState => {
  if (persona !== 'scavenger') return input;
  if (input.up || input.down || input.left || input.right) return input; // 本来の判断/拾いが動いている時は触らない
  let bestX = 0, bestY = 0, bestD = Infinity;
  for (const p of ammoPickups) {
    if (!p.type.startsWith('ammo-')) continue;
    const d = Math.hypot(p.x + 8 - pcx, p.y + 8 - pcy);
    const eligible = d <= seekDist || (isOutOfAmmo && p.worldDrop === true && d <= depletedWorldDropSeekDist);
    if (!eligible) continue;
    if (d < bestD) { bestD = d; bestX = p.x + 8; bestY = p.y + 8; }
  }
  if (!isFinite(bestD)) return input;
  const n = Math.max(0.001, bestD);
  return dirInput((bestX - pcx) / n, (bestY - pcy) / n);
};

// M38(§6.15): 松明を壊してスクラップ供給を作る「松明フォレージ」。手空きのtick(ペルソナ判断+
// 拾い歩き(pickupSeekInput)の後も移動入力が無い時)のみ発火する後段補正で、通常プレイ・松明/
// ドロップ/スクラップの仕様には一切触れない。呼び出し側(playtestDriver/useGameLoopのbotブロック)
// が pickupSeekInput の直後・adjustBotForMines(M34)の手前でこれを通す(優先順位: ピックアップ拾い
// (既存) > 松明。pickupSeekInputが動いたtickは松明に行かない=不干渉)。
// - 歩み寄り: TORCH_SEEK_DIST以内の最寄りの未破壊松明へ dirInput で近づく(pickupSeekInputと同じ流儀)。
// - 叩く: TORCH_SMASH_DIST以内なら wantsMelee=true(スイングは全方位=breakPropsAlongが松明を割り、
//   既存のドロップ抽選(dropBreakablePropLoot)でスクラップ等が出る)。移動は追加しない。
// - stationary(棒立ちが仕様)・rusher(カウンター/寄り道を一切しない低スキル再現=M19の設計意図)は除外。
export const TORCH_SEEK_DIST = 240;  // 拾い歩きのmaxDistと同じ(§6.15 叩き台)
export const TORCH_SMASH_DIST = 60;  // M34のMINE_SMASH_DISTと同値(§6.15 叩き台)

// v0.25.2171(社長指定): 'scavenger' ペルソナは松明フォレージの「気づく」距離を約120pxに絞る
// (他ペルソナのTORCH_SEEK_DIST=240より近距離限定。弾薬回収を優先しつつ、近くにあれば壊しに行く
// 程度の位置づけ)。叩く距離(TORCH_SMASH_DIST)は他ペルソナと同じ既存値を使う。呼び出し側
// (playtestDriver.ts)が persona==='scavenger' の時だけ torchForageInput の seekDist にこれを渡す
// (torchForageInput 自体の実装・他ペルソナ向け既定値は変更しない)。
export const SCAVENGER_TORCH_SEEK_DIST = 120;

export interface TorchForageResult { input: InputState; wantsMelee: boolean }

export const torchForageInput = (
  persona: BotPersona,
  input: InputState,
  pcx: number,
  pcy: number,
  torches: readonly MinePropLike[],
  seekDist = TORCH_SEEK_DIST,
  smashDist = TORCH_SMASH_DIST,
): TorchForageResult => {
  if (persona === 'stationary' || persona === 'rusher') return { input, wantsMelee: false };
  if (input.up || input.down || input.left || input.right) return { input, wantsMelee: false }; // 本来の判断/拾いが動いている時は触らない
  let bestX = 0, bestY = 0, bestD = seekDist;
  for (const t of torches) {
    const d = Math.hypot(t.footX - pcx, t.footY - pcy);
    if (d < bestD) { bestD = d; bestX = t.footX; bestY = t.footY; }
  }
  if (bestD >= seekDist) return { input, wantsMelee: false };
  if (bestD <= smashDist) return { input, wantsMelee: true }; // 叩ける距離: 追加の移動はしない(優先)
  const n = Math.max(0.001, bestD);
  return { input: dirInput((bestX - pcx) / n, (bestY - pcy) / n), wantsMelee: false };
};

// M39(§6.16・社長指示v0.25.1733「用がなければ武器商人ゾーンは避ける」): 商人ゾーン回避。
// ショップは「商人の対話半径(58px)内での近接スイング」で開く=ボットに用は無いので、そもそも
// ゾーンに近寄らない(依頼#3で商人モーダル停止×2ランの再発防止。開いた場合の即クローズ保険
// (v0.25.1732)は最終防衛として別に残る)。ボット入力のみの後段補正・通常プレイ不変。
// - ゾーン内に入ってしまったら外向きへ歩いて出る(手空きでも)。
// - ゾーン外近傍では、進行方向がゾーンを掠める時だけ直交ステアで45°逸れる(M34の卵回避と同じ流儀)。
// - stationary(棒立ちが仕様)は動かさない(スイング誘発時のショップは即クローズ保険が受ける)。
// - 呼び出し側は松明フォレージ/拾い歩きの対象からもゾーン内の物を除外する(用を作らない)。
export const MERCHANT_AVOID_RADIUS = 90; // 対話半径58+余白(叩き台)

export interface MerchantZoneLike { x: number; y: number }

export const avoidMerchantZone = (
  persona: BotPersona,
  input: InputState,
  pcx: number,
  pcy: number,
  merchant: MerchantZoneLike | null,
  avoidRadius = MERCHANT_AVOID_RADIUS,
): InputState => {
  if (!merchant || persona === 'stationary') return input;
  const tx = merchant.x - pcx, ty = merchant.y - pcy;
  const d = Math.hypot(tx, ty);
  if (d >= avoidRadius * 2) return input; // 遠い=無関係
  if (d < avoidRadius) {
    // ゾーン内: 外向きへ出る(d≈0の縮退は+x固定で決定的に)。
    if (d < 0.001) return dirInput(1, 0);
    return dirInput(-tx / d, -ty / d);
  }
  // ゾーン外近傍: 移動中のみ。進行方向の前方にゾーンが掠る時だけ横へ逸れる。
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx === 0 && my === 0) return input;
  const ml = Math.max(0.001, Math.hypot(mx, my));
  const dx = mx / ml, dy = my / ml;
  const front = dx * tx + dy * ty;          // 進行方向成分(px)。負=既に離れる向き
  if (front <= 0) return input;
  const perp = dx * ty - dy * tx;           // 符号付き垂直距離(px)。正=商人が進行の右側
  if (Math.abs(perp) >= avoidRadius) return input; // 進路はゾーンを掠めない
  // 商人と反対側の直交方向を等重で合成=進行を保ったまま45°逸れる(M34と同じ決定的ステア)。
  const lx = perp >= 0 ? dy : -dy;
  const ly = perp >= 0 ? -dx : dx;
  const cx = dx + lx;
  const cy = dy + ly;
  const cl = Math.max(0.001, Math.hypot(cx, cy));
  return dirInput(cx / cl, cy / cl);
};

// 放浪ペルソナ用: ラン開始時に一度だけ選ぶ固定方向(spawn からの一方向へ直進=戦闘無視)。
const WANDER_DIRS: InputState[] = [
  { up: true, down: false, left: false, right: false },
  { up: false, down: false, left: false, right: true },
  { up: false, down: true, left: false, right: false },
  { up: false, down: false, left: true, right: false },
];
export const wanderDirForSeed = (seed: number): InputState => WANDER_DIRS[Math.abs(seed) % WANDER_DIRS.length];

// ---------------------------------------------------------------------------
// ★詰まり脱出(全ペルソナ共通)。社長報告v0.25.3554「木にひっかかるとずっと引っかかってる」。
//
// **何が起きていたか**: 詰まり検知は `rusher` ペルソナの中にしか無かった(下の RusherTrackState)。
// `standard`(既定)には1行も無く、木や壁に押し当たると**同じ入力を出し続けて永久に抜けない**。
//
// **直し方**: 判定を「原点からの最大半径が伸びたか」(rusher専用の指標)ではなく
// **「実際に動けているか」**へ変え、`decideBotInput` の**後段の調整器**(adjustBotForMines /
// avoidMerchantZone と同じ流儀)として全ペルソナ・全モードの**最終入力**へ掛ける。
// こうすると回避・目的地ステア・地雷回避のどの枝から来た入力でも等しく効く。
//
// **窓で見る理由**: 毎フレームの変位で見ると、戦闘で減速しただけの時に誤検知する
// (実測でボットの速度は0〜87px/s=1フレーム1.45px程度まで落ちる)。**10tickごとに位置を採り、
// その間の変位が閾値未満**なら1回「動けていない」と数える。
// ---------------------------------------------------------------------------
export interface BotStuckState {
  lastX: number;        // 直近サンプル時の位置(NaN=未初期化)
  lastY: number;
  tick: number;         // サンプル間隔を数えるtick
  stuckSamples: number; // 連続で「動けていない」と判定されたサンプル数
  escapeTicks: number;  // 脱出入力を出し続ける残りtick(0=通常)
  escapeSign: 1 | -1;   // 回り込む向き(固定・毎回同じ側)
}
export const createBotStuckState = (escapeSign: 1 | -1 = 1): BotStuckState => ({
  lastX: NaN, lastY: NaN, tick: 0, stuckSamples: 0, escapeTicks: 0, escapeSign,
});
/** 位置を採る間隔(tick)。60fps換算で約0.17秒。 */
export const BOT_STUCK_SAMPLE_TICKS = 10;
/** 1サンプル(=10tick)でこのpx未満しか動いていなければ「動けていない」。 */
export const BOT_STUCK_MOVE_EPS = 6;
/** 連続でこの数だけ「動けていない」が続いたら詰まりと判定(=約0.5秒)。 */
export const BOT_STUCK_SAMPLES = 3;
/** 詰まり判定後、脱出入力を出し続けるtick数(≈0.5秒)。1フレームだけだと壁際で振動する。 */
export const BOT_STUCK_ESCAPE_TICKS = 30;

/**
 * 詰まっていたら横へ回り込む入力へ差し替える。**状態はmutateする**(rusher/rankAssessor等と同じ
 * 「明示的な外部状態」方式=呼び出し側がラン単位に1つ持ち、毎tick同じ参照を渡す)。
 * 移動入力が無いtick(意図的な静止)では詰まりを数えない。
 */
export const escapeIfStuck = (
  input: InputState,
  state: BotStuckState,
  pcx: number,
  pcy: number,
): InputState => {
  const wantsMove = input.up || input.down || input.left || input.right;
  if (!wantsMove) { state.stuckSamples = 0; state.escapeTicks = 0; return input; }

  // 初回だけ基準点を即座に置く(サンプル境界まで待つと1サンプルぶん検知が遅れる)。
  if (Number.isNaN(state.lastX)) { state.lastX = pcx; state.lastY = pcy; }

  state.tick += 1;
  if (state.tick >= BOT_STUCK_SAMPLE_TICKS) {
    state.tick = 0;
    const moved = Math.hypot(pcx - state.lastX, pcy - state.lastY);
    state.lastX = pcx; state.lastY = pcy;
    if (moved < BOT_STUCK_MOVE_EPS) {
      state.stuckSamples += 1;
      if (state.stuckSamples >= BOT_STUCK_SAMPLES) state.escapeTicks = BOT_STUCK_ESCAPE_TICKS;
    } else {
      state.stuckSamples = 0;
    }
  }

  if (state.escapeTicks <= 0) return input;
  state.escapeTicks -= 1;
  // 進みたい向きへ±90°の横成分を強めに混ぜて回り込む(元の向きも少し残して前進を捨てない)。
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const m = Math.hypot(dx, dy) || 1;
  const ux = dx / m, uy = dy / m;
  const lx = -uy * state.escapeSign, ly = ux * state.escapeSign;
  return dirInput(ux * 0.3 + lx * 0.7, uy * 0.3 + ly * 0.7);
};

// ---------------------------------------------------------------------------
// ★近接分離ステア(社長報告v0.25.3557「なんか割と敵にぶつかってる」)。
//
// **何が起きていたか**: 接触回避(contactDodge)は「危険な敵」(接触ダメージ≥最大HPの20%)しか見ない。
// 通常の雑魚は対象外なので、標的への接近(approach=直線入力)は**群れの中を素通りで突っ切る**。
// masterは engageDist=420 で遠い標的も追う+囲まれ判定が8体と鈍いため、雑魚に体を擦りながら歩く。
//
// **直し方**: ごく近距離(SEPARATION_DIST)の敵**全員**から弱い反発ベクトルを受け、移動入力に混ぜる。
// 近接射程(80px)より内側だけに効かせるので、**殴りに行く動きは阻害しない**(48〜80pxの帯で殴れる)。
// 対象は avoidContactDist>0 の段(=skilled/master)。novice/casual は従来どおり(ぶつかるのも下手さ)。
// ---------------------------------------------------------------------------
export const SEPARATION_DIST = 48;
const SEPARATION_BLEND = 0.55; // 元の移動0.45 : 反発0.55(反発をやや強く=擦り抜けを許さない)

export const separationAdjust = (
  profile: BotSkillProfile,
  input: InputState,
  pcx: number,
  pcy: number,
  enemies: readonly Enemy[],
): InputState => {
  if (profile.avoidContactDist <= 0) return input;
  const wantsMove = input.up || input.down || input.left || input.right;
  if (!wantsMove) return input; // 意図的な静止(殴り射程での停止)は尊重する
  let sx = 0, sy = 0, n = 0;
  for (const e of enemies) {
    if (e.corpseUntil !== undefined) continue;
    const dx = pcx - (e.x + e.width / 2);
    const dy = pcy - (e.y + e.height / 2);
    const d = Math.hypot(dx, dy);
    if (d >= SEPARATION_DIST || d < 0.001) continue;
    const w = 1 - d / SEPARATION_DIST; // 近いほど強く
    sx += (dx / d) * w; sy += (dy / d) * w; n += 1;
  }
  if (n === 0) return input;
  const sm = Math.hypot(sx, sy) || 1;
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const im = Math.hypot(dx, dy) || 1;
  return dirInput(
    (dx / im) * (1 - SEPARATION_BLEND) + (sx / sm) * SEPARATION_BLEND,
    (dy / im) * (1 - SEPARATION_BLEND) + (sy / sm) * SEPARATION_BLEND,
  );
};

// rusherペルソナ(§5.20 M19)の詰まり検知に使う外部状態。呼び出し側(ヘッドレス駆動側)が
// ラン開始時に1つ作って毎tick同じ参照を渡し続ける(rankAssessor等のRef系と同じ「明示的な外部状態」方式)。
export interface RusherTrackState {
  maxRadius: number;    // これまでに到達した原点からの最大距離(px)
  stuckTicks: number;   // 最大距離が更新されていないtick数の連続カウント
  dodgeSign: 1 | -1;    // 詰まった時に混ぜる横成分の向き(固定・毎回同じ側へ回り込む)
}
export const createRusherTrackState = (dodgeSign: 1 | -1 = 1): RusherTrackState => ({
  maxRadius: 0, stuckTicks: 0, dodgeSign,
});
// 詰まり判定のしきい値: 直近この tick 数だけ最大半径が更新されなければ「詰まった」とみなす
// (≈0.5秒@60fps。デバッグボットの挙動チューニング値であり、ゲームバランス定数ではない)。
const RUSHER_STUCK_TICKS = 30;
const RUSHER_ORIGIN_EPS = 4; // 原点にごく近い間は半径方向が不安定なので放浪と同じ固定シード方向を使う

// kiterの「射程バンド維持」の既定射程(px)。ハンドガン(RANGE_BY_CATEGORY.handgun=176)相当。
// 呼び出し側が現在の銃の実射程(gunRangePx)を渡せばそれを使う(このモジュールはstore/weaponUtils非依存を
// 保つため、射程の解決は呼び出し側=playtestDriver/useGameLoopの責務にする)。
const KITER_DEFAULT_RANGE = 176;

// M34(§6.11): 緑卵(地雷=breakableProps type='mine')を「避ける/叩く」。ボット入力のみの後段補正で、
// 通常プレイ・敵AI・卵の仕様には一切触れない。呼び出し側(playtestDriver/useGameLoopのbotブロック)が
// ペルソナ判断+拾い歩き(pickupSeekInput)の後にこれを通す。
// - 叩く: 最寄りの卵が近接リーチ内(接触判定より外の安全距離=MINE_SMASH_DIST)なら wantsMelee=true
//   (スイングは全方位=breakPropsAlongが卵を1ヒットで割る)。叩ける距離なら叩く優先(反発合成はしない)。
// - 避ける: 移動中のみ、進行方向の前方〜近傍(MINE_AVOID_RADIUS)の卵に対し「卵と反対側の直交方向」を
//   移動方向に合成して45°逸れる(8方向入力で確実に効く反発の実装形)。後方の卵は無視(既に離れている)。
//   静止判断(stationary/kiterのバンド内静止等)は動かさない=ペルソナ不変。
// ★v0.25.3489(社長指示「赤くなった緑卵は割り、緑のからは距離を取る」):
// 卵には**2つの状態**があり、扱いを逆にしないと自分でアームさせてしまう。
//   ・緑(未アーム / `armedAt === undefined`): **80px以内に入るとアームされ**、1.5秒後に半径80pxで爆発
//     (`combatTick.applyMineDamage`)。→ **近づかないのが唯一の正解**。
//   ・赤(アーム済み / `armedAt` あり): 導火中。**近接で割れば無害に解除できる**
//     (`combatTick.ts` の注記「近接で割る従来経路は不変=アーム中でも無害に解除できる」)。
//     → **割るのが正解**。放置すると爆発する。
// 旧実装は状態を見ずに「60px以内なら何でも叩く / 70px以内なら避ける」だったため、
//   ① 緑を叩きに行く途中で80px圏に入れてしまい自分でアームさせる
//   ② 回避半径70pxが起爆圏80pxより内側=避け始める前にアームさせる
// の2つを踏んでいた(実測: 18ラン中7ランが地雷死・master3本は全て地雷死)。
export interface MinePropLike { footX: number; footY: number; armedAt?: number }
/** 緑(未アーム)から取る距離。**起爆圏80pxより外**にしないと、避ける前にアームさせてしまう。 */
export const MINE_AVOID_RADIUS = 100;
/** 赤(アーム済み)を割りに行ってよい距離。近接リーチ74px内の安全距離。 */
export const MINE_SMASH_DIST = 60;
/** 緑卵の起爆圏(world/mines.ts の EGG_BLAST_RADIUS と同値の複製=このモジュールはworld非依存を保つ)。 */
export const MINE_ARM_RADIUS = 80;

export interface MineAdjustResult { input: InputState; wantsMelee: boolean }

export const adjustBotForMines = (
  input: InputState,
  wantsMelee: boolean,
  pcx: number,
  pcy: number,
  mines: readonly MinePropLike[],
  avoidRadius = MINE_AVOID_RADIUS,
  smashDist = MINE_SMASH_DIST,
): MineAdjustResult => {
  if (mines.length === 0) return { input, wantsMelee };
  // ★状態で扱いを分ける。赤(アーム済み)=割る / 緑(未アーム)=近づかない。
  const armed = mines.filter(m => m.armedAt !== undefined);
  const green = mines.filter(m => m.armedAt === undefined);
  // ① 赤が叩ける距離にあれば叩く(無害に解除できる。放置すると爆発する)。
  let nearestArmed = Infinity;
  for (const m of armed) {
    const d = Math.hypot(m.footX - pcx, m.footY - pcy);
    if (d < nearestArmed) nearestArmed = d;
  }
  if (nearestArmed <= smashDist) return { input, wantsMelee: true };
  // ② 避ける: 移動していない時は触らない(ペルソナの静止判断を尊重)。
  //    避ける対象は**緑(未アーム)だけ**。赤は割りに行く対象なので回避で遠ざけない
  //    (遠ざけると導火が進んで結局爆発する)。
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx === 0 && my === 0) return { input, wantsMelee };
  const ml = Math.max(0.001, Math.hypot(mx, my));
  const dx = mx / ml, dy = my / ml;
  // 前方(進行方向側)〜近傍の卵に対し、卵のいる側と反対の「横」へ舵を切る(反発の後ろ向き成分は
  // 8方向入力(dirInputの0.3閾値)ではほぼ消えるため、確実に曲がる直交ステアで避ける)。
  let steer = 0; // Σ sign(cross)×重み。正=卵が右側寄り→左(上)へ、負=卵が左側寄り→右(下)へ
  for (const m of green) {
    const tx = m.footX - pcx, ty = m.footY - pcy; // プレイヤー→卵
    const d = Math.hypot(tx, ty);
    if (d >= avoidRadius || d < 0.001) continue;
    const front = dx * (tx / d) + dy * (ty / d);
    if (front <= 0) continue; // 後方の卵は避けない(既に離れる向き=蛇行しない)
    const cross = dx * (ty / d) - dy * (tx / d); // 正=卵が進行の右側(画面座標y下向き)
    steer += (cross >= 0 ? 1 : -1) * front * (1 - d / avoidRadius + 0.5);
  }
  if (steer === 0) return { input, wantsMelee };
  // 卵と反対側の直交方向を等重で合成=進行を保ったまま45°逸れる(決定的)。
  const lx = steer > 0 ? dy : -dy;
  const ly = steer > 0 ? -dx : dx;
  const cx = dx + lx;
  const cy = dy + ly;
  const cl = Math.max(0.001, Math.hypot(cx, cy));
  return { input: dirInput(cx / cl, cy / cl), wantsMelee };
};

// M37(§6.14): 人間反応のカウンター。カウンター可能な脅威(ジャンプ攻撃/突進/敵弾)を検知したら
// ペルソナ別の反応遅延を置いてから wantsMelee=true を出す(=人間が見て反応する時間の再現)。
// 呼び出し側(playtestDriver/useGameLoopのbotブロック)がこれを既存の wantsMelee とOR合成する
// (移動入力には触らない=このバッチの変更はカウンターの有無のみ)。裏ボス/天使の固有攻撃
// (bossState機械)はv1対象外(PACING_PUZZLE.md §6.14)。
const JUMP_THREAT_DIST = 200;   // 敵aiPhase==='jump'をカウンター対象とみなす距離(px)
const CHARGE_THREAT_DIST = 180; // 敵aiPhase==='charge'を対象とみなす距離(px)
// 突進の進行方向(vx,vy)とプレイヤーへ向かう方向のcos類似度がこれ以上なら「自分へ向いている」
// とみなす(叩き台・実機/ソークで調整)。突進は狙い点(aiTargetX/Y)がほぼプレイヤー位置固定+弱
// ホーミングのため、実際に向かってくる突進は概ね1に近い値になる。
const CHARGE_HEADING_MIN_DOT = 0.3;
const PROJECTILE_THREAT_DIST = 160;  // 敵弾をカウンター対象とみなす距離(px)
const PROJECTILE_THREAT_ETA_MS = 400; // 到達予測がこれ未満なら対象(接近中のみ。離れていく弾は無視)

export type CounterThreatKind = 'jump' | 'charge' | 'projectile' | 'boss-phase' | 'contact-close';

export interface CounterReactionProfile {
  reactionMs: number; // 検知から発火までの反応遅延(ms)
  chance: number;      // 検知1回あたりの試行確率(0..1・人間の見逃し)
}

// ペルソナ別プロファイル(叩き台・PACING_PUZZLE.md §6.14の値・社長裁定v0.25.1724で改訂)。
// 未掲載のペルソナは無効: stationary=棒立ちが仕様 / **rusher=「カウンターを一切しない低スキル再現」
// (M19深層ラッシュ試験専用)の設計意図を守るため無効**(v0.25.1723で誤って最強値を与えていた訂正)。
// boar=殴り屋なので最速プロファイル(旧rusher枠の値)。
export const COUNTER_REACTION_PROFILES: Partial<Record<BotPersona, CounterReactionProfile>> = {
  standard: { reactionMs: 250, chance: 0.65 },
  wanderer: { reactionMs: 250, chance: 0.65 },
  boar: { reactionMs: 200, chance: 0.75 },
  kiter: { reactionMs: 300, chance: 0.50 },
  // v0.25.2171: scavengerは「通常どおり戦闘」する持駒なので standard と同じ反応プロファイルを使う。
  scavenger: { reactionMs: 250, chance: 0.65 },
};

// 呼び出し側(ヘッドレスdriver/useGameLoopのbotブロック)がラン単位で1つ作り、毎tick同じ参照を
// 渡し続ける外部状態(RusherTrackStateと同じ流儀)。純関数側はこれを読み書きするだけで、
// store/Reactには一切触れない。
export interface CounterThreatState {
  threatId: string | null;        // 追跡中の脅威(敵id or 弾id)。null=追跡中の脅威なし
  kind: CounterThreatKind | null;
  detectedAt: number;             // 検知した gameTime(ms)
  willAttempt: boolean;           // 検知時に1回だけ抽選した「撃つか」の結果
  fired: boolean;                 // この脅威に対し既に wantsMelee=true を返したか(連打防止)
}

export const createCounterThreatState = (): CounterThreatState => ({
  threatId: null, kind: null, detectedAt: 0, willAttempt: false, fired: false,
});

const jumpIsThreat = (pcx: number, pcy: number, e: Enemy): boolean => {
  if (distTo(pcx, pcy, e) >= JUMP_THREAT_DIST) return false;
  const tx = e.aiTargetX ?? e.x, ty = e.aiTargetY ?? e.y;
  return Math.hypot(tx - pcx, ty - pcy) < JUMP_THREAT_DIST; // 着地点も自分の近く=自分へ向いている
};

const chargeIsThreat = (pcx: number, pcy: number, e: Enemy): boolean => {
  if (distTo(pcx, pcy, e) >= CHARGE_THREAT_DIST) return false;
  const hvx = e.vx ?? 0, hvy = e.vy ?? 0;
  const hl = Math.hypot(hvx, hvy);
  if (hl < 0.001) return false; // 進行方向が定まらない(発生直後等)は判定しない
  const tpx = pcx - e.x, tpy = pcy - e.y; // distTo等と同じ基準(e.x/e.y=raw座標)で揃える
  const tl = Math.hypot(tpx, tpy) || 1;
  const dot = (hvx / hl) * (tpx / tl) + (hvy / hl) * (tpy / tl);
  return dot >= CHARGE_HEADING_MIN_DOT;
};

const projectileIsThreat = (pcx: number, pcy: number, p: Projectile): boolean => {
  if (!p.hostile) return false;
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
  const dx = pcx - cx, dy = pcy - cy;
  const d = Math.hypot(dx, dy);
  if (d >= PROJECTILE_THREAT_DIST || d < 0.001) return false;
  const closing = p.direction.x * p.speed * (dx / d) + p.direction.y * p.speed * (dy / d);
  if (closing <= 0) return false; // 離れていく(既に自分を過ぎた)弾は対象外
  return (d / closing) * 1000 < PROJECTILE_THREAT_ETA_MS;
};

/**
 * ★v0.25.3554(社長指示「マスターは積極的にカウンターを取る。どの攻撃も」)。
 *
 * **何が足りなかったか**: `findCounterThreat` は `aiPhase==='jump'` / `aiPhase==='charge'` /
 * 弾の**3種類しか見ていなかった**。城ボスの `g-*` 系(飛び掛かり滞空・三連跳び・滑空)や
 * ジャイアントの受け流し可能フェーズは**1つも見えていない**——回避側で v0.25.2432 に直した
 * 「ボットは赤を一切避けない人だった」と**同じ穴がカウンター側に残っていた**。
 *
 * ⇒ ゲーム側の「この構えは弾ける」の**唯一の出どころ**である `isDashParryCounterPhase`
 * (combatTick.ts)をそのまま使う(**写すな、共通化しろ**)。近さの条件は既存の
 * `jumpIsThreat`/`chargeIsThreat` と揃えて `COUNTER_BOSS_PHASE_DIST` で見る。
 *
 * **段階で刻む**: 上級(skilled/master)だけがこの拡張分を見る。novice/casual は従来の3種のまま
 * =「能力の質」ではなく「見えている脅威の広さ」で腕前差を出す。
 */
const COUNTER_BOSS_PHASE_DIST = 260;
/** 接近雑魚をカウンター脅威と見る距離(v0.25.3560)。窓400ms×雑魚の突進速度で「振ってから触れる」が成立する帯。 */
export const CONTACT_COUNTER_DIST = 90;
/** これより近ければ向きに関わらず脅威(もう触れる)。 */
const CONTACT_COUNTER_NEAR = 48;

const findCounterThreat = (
  pcx: number, pcy: number, enemies: readonly Enemy[], projectiles: readonly Projectile[],
  seesBossPhases = false,
): { id: string; kind: CounterThreatKind } | null => {
  for (const e of enemies) {
    if (e.aiPhase === 'jump' && jumpIsThreat(pcx, pcy, e)) return { id: e.id, kind: 'jump' };
  }
  for (const e of enemies) {
    if (e.aiPhase === 'charge' && chargeIsThreat(pcx, pcy, e)) return { id: e.id, kind: 'charge' };
  }
  for (const p of projectiles) {
    if (projectileIsThreat(pcx, pcy, p)) return { id: p.id, kind: 'projectile' };
  }
  // ★v0.25.3560(社長報告3回目「カウンターもしない。敵が歩いてくるのに棒立ちで当たる」の根本):
  // このゲームの近接カウンターの実体は applyContactDamage の「窓が開いている間に敵が触れたら弾く」。
  // つまり**歩いて寄ってくる雑魚・ゾンビの突進(zrush)こそが最多のカウンター機会**なのに、
  // 検知は jump/charge/弾(+ボスの構え)だけで、**接近してくる普通の敵を一度も脅威として見ていなかった**。
  // 人間のプレイヤーは敵が触れる寸前に振って弾く——それをここで再現する:
  // 「近距離(CONTACT_COUNTER_DIST)で、こちらへ向かって動いている敵」を脅威にする。
  // 段階差は従来どおり試行確率(novice 25%〜master 100%)と反応遅延が付ける。
  for (const e of enemies) {
    if (isCorpse(e)) continue;
    if (e.type === 'reaper' && !e.reaperChaser) continue;
    if (e.aiPhase === 'jump') continue; // 空中は接触判定ごと無い(専用の検知が上にある)
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    const dx = pcx - ecx, dy = pcy - ecy;
    const d = Math.hypot(dx, dy);
    if (d >= CONTACT_COUNTER_DIST || d < 0.001) continue;
    // こちらへ向かっているか(速度との内積>0)。至近(体1つ分)は向きに関わらず脅威。
    const closing = (dx * (e.vx ?? 0) + dy * (e.vy ?? 0)) > 0;
    if (closing || d < CONTACT_COUNTER_NEAR) return { id: e.id, kind: 'contact-close' };
  }
  if (seesBossPhases) {
    for (const e of enemies) {
      if (e.aiPhase === 'jump' || e.aiPhase === 'charge') continue; // 上で見た(距離条件が違うので二重に拾わない)
      // ★v0.25.3557(社長報告「masterで回したけど…カウンターもしない」の修正):
      // v0.25.3554の初版は isDashParryCounterPhase を**そのまま**使ったが、あの述語は
      // 「パリィが成立しうる全フェーズ」で、**'crouch'(溜め)と 'recover'(硬直)を含む**。
      // その結果、パンプキンのしゃがみ/werewolfの溜めが260px先に居るだけで triggerCounter を撃ち、
      // **空振りのたびにカウンターCD(窓400+CD420ms)が焼かれ、本物のジャンプ着地/突進が来た時には
      // CD中で取れない**という自滅ループになっていた(=「カウンターしない」の正体)。
      // ⇒ **来る攻撃が無いフェーズでは構えない**: 'crouch'/'recover'(汎用)と 'g-*-recover'(城ボス硬直)を
      // 除外し、実際に攻撃が飛んでくるフェーズ(滞空・突進・薙ぎのactive等)だけを脅威として見る。
      // 硬直へのパニッシュは「カウンター」ではなく通常近接(接近ロジック)の仕事。
      if (e.aiPhase === 'crouch' || e.aiPhase === 'recover') continue;
      if (typeof e.aiPhase === 'string' && e.aiPhase.endsWith('-recover')) continue;
      if (!isDashParryCounterPhase(e)) continue;
      const d = Math.hypot((e.x + e.width / 2) - pcx, (e.y + e.height / 2) - pcy);
      if (d <= COUNTER_BOSS_PHASE_DIST) return { id: e.id, kind: 'boss-phase' };
    }
  }
  return null;
};

const threatStillValid = (
  threatId: string, kind: CounterThreatKind, pcx: number, pcy: number,
  enemies: readonly Enemy[], projectiles: readonly Projectile[],
): boolean => {
  if (kind === 'projectile') {
    const p = projectiles.find(pp => pp.id === threatId);
    return !!p && projectileIsThreat(pcx, pcy, p);
  }
  if (kind === 'contact-close') {
    const ce = enemies.find(ee => ee.id === threatId);
    if (!ce || isCorpse(ce)) return false;
    const d = Math.hypot((ce.x + ce.width / 2) - pcx, (ce.y + ce.height / 2) - pcy);
    return d <= CONTACT_COUNTER_DIST * 1.5; // 少し離れただけでは追跡を保つ(振り直し連打を防ぐ)
  }
  if (kind === 'boss-phase') {
    const be = enemies.find(ee => ee.id === threatId);
    if (!be || !isDashParryCounterPhase(be)) return false;
    // ★v0.25.3557: 検知側(findCounterThreat)と同じ除外(crouch/recover系は脅威でない)。
    if (be.aiPhase === 'crouch' || be.aiPhase === 'recover') return false;
    if (typeof be.aiPhase === 'string' && be.aiPhase.endsWith('-recover')) return false;
    return Math.hypot((be.x + be.width / 2) - pcx, (be.y + be.height / 2) - pcy) <= COUNTER_BOSS_PHASE_DIST;
  }
  const e = enemies.find(ee => ee.id === threatId);
  if (!e || e.aiPhase !== kind) return false;
  return kind === 'jump' ? jumpIsThreat(pcx, pcy, e) : chargeIsThreat(pcx, pcy, e);
};

// 脅威検知→反応遅延→試行確率の抽選→カウンター発火、を1tick分進める。state は呼び出し側で
// ラン単位に1つ保持し、毎tick同じ参照を渡すこと(mutateする)。既存のカウンターCD
// (counterCooldownEnd)を尊重=CD中は発火しない(遅延経過済みでもCD明けまで待つ)。
export const decideCounterReaction = (
  persona: BotPersona,
  state: CounterThreatState,
  pcx: number,
  pcy: number,
  enemies: readonly Enemy[],
  projectiles: readonly Projectile[],
  gameTime: number,
  counterCooldownEnd: number,
  rand: () => number = Math.random,
  // v0.25.2338: 腕前の段階(botSkill)。**未指定なら従来どおりペルソナ固有のプロファイル**を使う
  // (既存の実測値を動かさない)。指定時は反応遅延と試行確率だけを段階の値で上書きする。
  // **ペルソナがカウンターを持たない場合(stationary/rusher)は段階を上げても撃たない**
  // = 段階は「能力の質」を変えるだけで、能力そのものを増やさない(設計の掟)。
  skill?: BotSkill,
): boolean => {
  const base = COUNTER_REACTION_PROFILES[persona];
  if (!base) return false;
  const sp = skill ? botSkillProfile(skill) : null;
  const profile = sp ? { reactionMs: sp.reactionMs, chance: sp.counterChance } : base;

  // 追跡中の脅威が消えた/条件を外れたら解除(遅延中に消えたら撃たない=ここで打ち切られる)。
  if (state.threatId !== null && !threatStillValid(state.threatId, state.kind as CounterThreatKind, pcx, pcy, enemies, projectiles)) {
    state.threatId = null; state.kind = null; state.fired = false;
  }

  // 新規検知(追跡中の脅威が無い時のみ=1脅威ずつ処理。検知ごとに1回だけ抽選する)。
  if (state.threatId === null) {
    // ★v0.25.3554: 上級(skilled/master)だけがボスの構え(isDashParryCounterPhase)まで見る。
    const found = findCounterThreat(pcx, pcy, enemies, projectiles, sp?.seesBossCounterPhases === true);
    if (found) {
      state.threatId = found.id; state.kind = found.kind;
      state.detectedAt = gameTime;
      state.willAttempt = rand() < profile.chance;
      state.fired = false;
    }
  }

  if (state.threatId === null || !state.willAttempt || state.fired) return false;
  if (gameTime - state.detectedAt < profile.reactionMs) return false; // 反応遅延中
  if (gameTime < counterCooldownEnd) return false; // 既存CD中は撃たない(連打防止)
  state.fired = true;
  return true;
};

export const decideBotInput = (
  persona: BotPersona,
  player: Player,
  enemies: Enemy[],
  gameTime: number,
  tickIndex: number,
  wanderSeed: number,
  rusherState?: RusherTrackState,
  gunRangePx?: number,
  // v0.25.2171: 呼び出し側(playtestDriver.ts)が「全所持銃のmagazine+reserve合計が0」を通知する。
  // scavengerペルソナのみが参照する(他ペルソナは未使用=挙動不変)。
  isOutOfAmmo?: boolean,
  // v0.25.2338: 腕前の段階。**未指定 or 'casual' なら従来と完全に同じ挙動**
  // (casual = 最寄り狙い・囲まれ判定3体 = 既存の定数と同値)。
  skill?: BotSkill,
  // v0.25.2340: 退避を止めて攻めきる(囲いイベント中)。**未指定=false=従来どおり退避する**。
  // 強制的な囲いは逃げても終わらない(台本敵を倒すまで解除されない)ので、中では攻めるのが正解。
  noRetreat?: boolean,
): BotDecision => {
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const sk = botSkillProfile(skill);
  // 段階つきの標的選択と囲まれ判定。casual では pickTarget('nearest') = nearestEnemy と同義。
  const skillTarget = (list: Enemy[]): Enemy | undefined => pickTarget(sk.targeting, pcx, pcy, list, gameTime);
  const surroundNeed = sk.surroundCount;

  switch (persona) {
    case 'rusher': {
      // 原点から外向き(半径が増える方向)へ最大速度で直進。カウンター/カイト/武器切替は一切しない
      // (自動射撃のみに任せる=実プレイの「前進しながら撃つ」低スキル挙動の再現)。
      const radius = Math.hypot(pcx, pcy);
      let dx: number, dy: number;
      if (radius < RUSHER_ORIGIN_EPS) {
        // 原点直後は半径方向が定まらないので、放浪ペルソナと同じ固定シード方向で離脱する。
        const seed = wanderDirForSeed(wanderSeed);
        dx = (seed.right ? 1 : 0) - (seed.left ? 1 : 0);
        dy = (seed.down ? 1 : 0) - (seed.up ? 1 : 0);
      } else {
        dx = pcx / radius;
        dy = pcy / radius;
      }
      if (rusherState) {
        if (radius > rusherState.maxRadius + 0.5) {
          rusherState.maxRadius = radius;
          rusherState.stuckTicks = 0;
        } else {
          rusherState.stuckTicks += 1;
        }
        if (rusherState.stuckTicks >= RUSHER_STUCK_TICKS) {
          // 詰まった(木/壁等で最大半径が更新されない): 外向きベクトルへ±90°の横成分を混ぜて回り込む。
          const lateralX = -dy * rusherState.dodgeSign;
          const lateralY = dx * rusherState.dodgeSign;
          dx = dx * 0.5 + lateralX * 0.5;
          dy = dy * 0.5 + lateralY * 0.5;
        }
      }
      return { input: dirInput(dx, dy), wantsMelee: false, wantsWeaponSwitch: false };
    }

    case 'wanderer':
      // 戦闘を完全に無視し、ラン開始時に決めた一方向へ直進(深部へ)。
      return { input: wanderDirForSeed(wanderSeed), wantsMelee: false, wantsWeaponSwitch: false };

    case 'stationary': {
      // 移動しない。近接圏内の敵にだけ反応する(棒立ちでも殴りはする)。
      const target = nearestEnemy(pcx, pcy, enemies);
      const engage = !!target && distTo(pcx, pcy, target) < MELEE_ENGAGE_DIST;
      return { input: STILL_INPUT, wantsMelee: engage, wantsWeaponSwitch: tickIndex % 600 === 0 };
    }

    case 'kiter': {
      // 引き撃ち専: 最寄り敵を「銃の射程バンド内」に保ちながら下がる。近接は使わない。
      // M26 Step1修正(v0.25.1678): 旧実装は無条件退避で、プレイヤー(87)が通常敵(zombie42等)を永遠に
      // 引き離し、射程ゲート(fireWeaponはrange内の敵にしか撃たない)に誰も入らず5分でキル0だった
      // (Step0計測で発覚)。近すぎ=退避 / 遠すぎ=接近 / バンド内=静止して撃たせる、が本来の引き撃ち。
      const target = nearestEnemy(pcx, pcy, enemies);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: false };
      const range = gunRangePx ?? KITER_DEFAULT_RANGE;
      const d = distTo(pcx, pcy, target);
      // M49-2(§6.25): 危険な的からは avoidContactDist(160・casual以下は0=従来と同値)未満まで
      // 詰めない。危険でない的は従来どおり(range*0.55のまま=不変条件「危険敵がいない時は
      // 従来と完全に同値」)。
      const nearThreshold = isContactDangerous(target, player.maxHealth)
        ? Math.max(range * 0.55, sk.avoidContactDist)
        : range * 0.55;
      const input = d < nearThreshold ? retreat(pcx, pcy, target)
        : d > range * 0.9 ? approach(pcx, pcy, target)
        : STILL_INPUT;
      return { input, wantsMelee: false, wantsWeaponSwitch: tickIndex % 900 === 0 };
    }

    case 'boar': {
      // 常に最寄り敵へ突進し、カウンター(近接)を多用する「猪」。
      const target = nearestEnemy(pcx, pcy, enemies);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: false };
      const d = distTo(pcx, pcy, target);
      return { input: approach(pcx, pcy, target), wantsMelee: d < MELEE_ENGAGE_DIST, wantsWeaponSwitch: false };
    }

    case 'scavenger': {
      // v0.25.2171(社長指定・弾薬AIディレクター検証専用): 基本の交戦判断は standard と同じ
      // (スタン敵処刑優先・囲まれたら退避・近接圏内で殴る)。弾薬の拾い足し(画面内優先・枯渇時
      // worldDropまで足を伸ばす)は呼び出し側(playtestDriver.ts)が scavengerAmmoSeekInput /
      // 松明フォレージのseekDist override で後段合成する(このswitchでは行わない)。
      // ただし「枯渇時にそれも無ければ近接で応戦(逃げ回らない)」だけはここで表現: isOutOfAmmoなら
      // 囲まれても退避せず、常に最寄り敵へ突進して近接で応戦する(boarと同じ攻めの姿勢)。
      if (isOutOfAmmo) {
        const target = nearestEnemy(pcx, pcy, enemies);
        if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: false };
        const d = distTo(pcx, pcy, target);
        return { input: approach(pcx, pcy, target), wantsMelee: d < MELEE_ENGAGE_DIST, wantsWeaponSwitch: false };
      }
      // M49-2(§6.25改訂 攻撃側ダイヤル): engageDist より遠い敵は追わない対象から外す
      // (casual以下は260px=既存の実測レンジで通常はほぼ無制限=挙動不変。novice/casualの明示的な
      // 数値化についてはPACING_PUZZLE.md ★未決参照)。
      const engageable = enemies.filter(e => distTo(pcx, pcy, e) <= sk.engageDist);
      const stunned = nearestStunned(pcx, pcy, engageable, gameTime);
      const target = stunned ?? skillTarget(engageable);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: tickIndex % 1200 === 0 };
      // v0.25.2338: 段階つきの臆病さ。HPが交戦切り上げライン(disengageHp)を割ったら、囲まれて
      // いなくても距離を取る。M49-2: 危険な的には近接を諦めて距離を保つ(engageDecision参照)。
      const nearbyCount = enemies.filter(e => distTo(pcx, pcy, e) < SURROUND_RADIUS).length;
      return engageDecision(sk, player, pcx, pcy, target, noRetreat, nearbyCount, surroundNeed);
    }

    case 'standard':
    default: {
      // 近い敵を撃ち(自動射撃に任せる)・囲まれたら離れ・スタン敵は処刑優先。
      // M49-2(§6.25改訂 攻撃側ダイヤル): engageDist より遠い敵は追わない対象から外す。
      const engageable = enemies.filter(e => distTo(pcx, pcy, e) <= sk.engageDist);
      const stunned = nearestStunned(pcx, pcy, engageable, gameTime);
      const target = stunned ?? skillTarget(engageable);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: tickIndex % 1200 === 0 };
      // v0.25.2338: 段階つきの臆病さ。HPが交戦切り上げライン(disengageHp)を割ったら、囲まれて
      // いなくても距離を取る。M49-2: 危険な的には近接を諦めて距離を保つ(engageDecision参照)。
      const nearbyCount = enemies.filter(e => distTo(pcx, pcy, e) < SURROUND_RADIUS).length;
      return engageDecision(sk, player, pcx, pcy, target, noRetreat, nearbyCount, surroundNeed);
    }
  }
};
