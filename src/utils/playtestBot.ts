// M9-B: デバッグボットの入力合成(PACING_PUZZLE.md §5.10)。
// 目的はデバッグ(バランス測定ではない)ため、上手さより「想定外の遊び方」を重視した
// ペルソナ5種(叩き台)。純関数(store/Reactに依存しない)= ユニットテスト可能。
// 呼び出し側(headless driver)がこの決定を実際の store アクション(movePlayer/triggerCounter/
// setActiveWeapon)へ反映する。
import type { Enemy, InputState, Player, Projectile } from '../types/game';

// 'rusher' はPACING_PUZZLE.md §5.20(M19・深層ラッシュ試験専用)のペルソナ。既存の通常スモーク
// (BOT_PERSONAS の巡回)には含めず、専用テストからのみ persona 名で直接呼び出す。
import { botSkillProfile, pickTarget, shouldRetreatForHp, type BotSkill } from './botSkill';

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

// スタン中(gameTime基準)の敵を優先ターゲットにする(標準ペルソナ=処刑優先)。
const nearestStunned = (px: number, py: number, enemies: Enemy[], gameTime: number): Enemy | undefined => {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const e of enemies) {
    if (e.stunUntil === undefined || e.stunUntil <= gameTime) continue;
    const d = distTo(px, py, e);
    if (d < bestD) { bestD = d; best = e; }
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
export interface MinePropLike { footX: number; footY: number }
export const MINE_AVOID_RADIUS = 70; // 反発を効かせる距離(px・叩き台)
export const MINE_SMASH_DIST = 60;   // これ以内なら叩いて割る(接触より外・近接リーチ74内の安全距離・叩き台)

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
  // 最寄りの卵(叩く判定用)。
  let nearestD = Infinity;
  for (const m of mines) {
    const d = Math.hypot(m.footX - pcx, m.footY - pcy);
    if (d < nearestD) nearestD = d;
  }
  // 叩ける距離なら叩く(優先)。移動入力はそのまま(スイングは移動と独立・全方位)。
  if (nearestD <= smashDist) return { input, wantsMelee: true };
  // 避ける: 移動していない時は触らない(ペルソナの静止判断を尊重)。
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx === 0 && my === 0) return { input, wantsMelee };
  const ml = Math.max(0.001, Math.hypot(mx, my));
  const dx = mx / ml, dy = my / ml;
  // 前方(進行方向側)〜近傍の卵に対し、卵のいる側と反対の「横」へ舵を切る(反発の後ろ向き成分は
  // 8方向入力(dirInputの0.3閾値)ではほぼ消えるため、確実に曲がる直交ステアで避ける)。
  let steer = 0; // Σ sign(cross)×重み。正=卵が右側寄り→左(上)へ、負=卵が左側寄り→右(下)へ
  for (const m of mines) {
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

export type CounterThreatKind = 'jump' | 'charge' | 'projectile';

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

const findCounterThreat = (
  pcx: number, pcy: number, enemies: readonly Enemy[], projectiles: readonly Projectile[],
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
    const found = findCounterThreat(pcx, pcy, enemies, projectiles);
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
      const input = d < range * 0.55 ? retreat(pcx, pcy, target)
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
      const stunned = nearestStunned(pcx, pcy, enemies, gameTime);
      const target = stunned ?? skillTarget(enemies);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: tickIndex % 1200 === 0 };
      // v0.25.2338: 段階つきの臆病さ。HPが退避ラインを割ったら、囲まれていなくても距離を取る
      // (casual以下は retreatHpFrac=0 なので常に false = 従来の挙動)。
      const nearbyCount = enemies.filter(e => distTo(pcx, pcy, e) < SURROUND_RADIUS).length;
      if (!noRetreat && (nearbyCount >= surroundNeed || shouldRetreatForHp(sk, player.health, player.maxHealth))) {
        const d = distTo(pcx, pcy, target);
        return { input: retreat(pcx, pcy, target), wantsMelee: d < MELEE_ENGAGE_DIST, wantsWeaponSwitch: false };
      }
      const d = distTo(pcx, pcy, target);
      if (d > MELEE_ENGAGE_DIST) {
        return { input: approach(pcx, pcy, target), wantsMelee: false, wantsWeaponSwitch: false };
      }
      return { input: STILL_INPUT, wantsMelee: true, wantsWeaponSwitch: false };
    }

    case 'standard':
    default: {
      // 近い敵を撃ち(自動射撃に任せる)・囲まれたら離れ・スタン敵は処刑優先。
      const stunned = nearestStunned(pcx, pcy, enemies, gameTime);
      const target = stunned ?? skillTarget(enemies);
      if (!target) return { input: STILL_INPUT, wantsMelee: false, wantsWeaponSwitch: tickIndex % 1200 === 0 };
      // v0.25.2338: 段階つきの臆病さ。HPが退避ラインを割ったら、囲まれていなくても距離を取る
      // (casual以下は retreatHpFrac=0 なので常に false = 従来の挙動)。
      const nearbyCount = enemies.filter(e => distTo(pcx, pcy, e) < SURROUND_RADIUS).length;
      if (!noRetreat && (nearbyCount >= surroundNeed || shouldRetreatForHp(sk, player.health, player.maxHealth))) {
        const d = distTo(pcx, pcy, target);
        return { input: retreat(pcx, pcy, target), wantsMelee: d < MELEE_ENGAGE_DIST, wantsWeaponSwitch: false };
      }
      const d = distTo(pcx, pcy, target);
      if (d > MELEE_ENGAGE_DIST) {
        return { input: approach(pcx, pcy, target), wantsMelee: false, wantsWeaponSwitch: false };
      }
      return { input: STILL_INPUT, wantsMelee: true, wantsWeaponSwitch: false };
    }
  }
};
