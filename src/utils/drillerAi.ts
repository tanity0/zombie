// PACING_PUZZLE.md §9(新型雑魚「削岩型」= 槍持ちカイト型・社長指示 2026-08-20)+
// §14(降格死神「伐採人」= §9の写し+差分4点・社長指示2026-08-28)。
// レンダラ非依存の純関数群=ヘッドレスでユニットテスト可能(CLAUDE.md 実装精度の規律4)。
//
// このファイルが持つ責務は2つ(どちらも配線側の判定ロジックを純関数へ切り出したもの):
//  ①「同格」湧き分け: pumpkin枠を実体化する瞬間に pumpkin/driller/logger どれの絵を出すか(§9-3/§14-3#2)。
//  ②カイトAI: 好み帯(接近/後退/構え)と、近接被弾による離脱の判定(§9-4)。伐採人固有の間合い・
//    薙ぎ払いの判定は loggerAi.ts(このファイルの写し+差分)。retreatの機構(drillerRetreatUntil/
//    DRILLER_RETREAT_MS/DRILLER_RETREAT_SPEED_MULT/isDrillerRetreating)はloggerも共有=そのままここを使う。
// 台本・帳簿(FORMATION_TABLE/scriptSpawned/ProblemChild等)は不変で、'pumpkin' のまま消化する
// (§9-3「実体化のみ差し替え」)。純関数はその実体化の瞬間だけに使う。

import type { EnemyType } from '../types/game';

/** §9-3/§14-3裁定済み#2: pumpkin枠を実体化する瞬間、pumpkin/driller/logger のどれを実際に湧かせるか。
 * allowDriller/allowLogger=false(対象ステージ外 or 計測路)ならそれぞれの型は出さない。
 * - どちらも false → 常にpumpkin。
 * - allowLoggerのみ true(stage-3) → pumpkin/logger 50%分け合い(叩き台)。
 * - 両方 true(stage-4〜7) → pumpkin/driller/logger 3等分(叩き台=§9-6/§14-3「バランスの最終値ではない」)。
 * - allowDrillerのみ true は現行のステージ集合(§14-3#2)では起こらないが、安全側にpumpkin/driller
 *   50%(旧仕様)へフォールバックしておく。
 */
export const resolvePumpkinTier = (
  allowDriller: boolean,
  allowLogger: boolean,
  rand: () => number = Math.random,
): 'pumpkin' | 'driller' | 'logger' => {
  if (allowDriller && allowLogger) {
    const r = rand();
    if (r < 1 / 3) return 'driller';
    if (r < 2 / 3) return 'logger';
    return 'pumpkin';
  }
  if (allowLogger) return rand() < 0.5 ? 'logger' : 'pumpkin';
  if (allowDriller) return rand() < 0.5 ? 'driller' : 'pumpkin';
  return 'pumpkin';
};

// §9-3/§9-7#7/§9-8#5: driller を許可するステージ(stage-4〜7)。
const DRILLER_ALLOWED_STAGES = new Set(['stage-4', 'stage-5', 'stage-6', 'stage-7']);
// §14-3裁定済み#2: logger を許可するステージ(stage-3〜7。「ステージ3から」)。
const LOGGER_ALLOWED_STAGES = new Set(['stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7']);

/** §9-3+§9-7#7+§9-8#5: resolvePumpkinTier に渡す allowDriller の算出。
 * 対象ステージ(stage-4/5/6/7)かつ計測路(ボスメーカー/ガントレット)でない時だけtrue。
 * ★§9-8#5(訂正): 通常のボス練習ランは中立化の対象外(係数が乗る=プレイヤーの実力扱い)。
 * ただし練習ランはnoSpawnで通常湧き自体が止まるため実質no-op(害なし)。
 * 中立化ゲートの対象はボスメーカー/ガントレットのみ。
 */
export const allowDrillerForRun = (
  stageId: string | null | undefined,
  isMeasurementRun: boolean,
): boolean => !isMeasurementRun && !!stageId && DRILLER_ALLOWED_STAGES.has(stageId);

/** §14-3裁定済み#2+§9-7#7+§9-8#5: resolvePumpkinTier に渡す allowLogger の算出。
 * allowDrillerForRun と同型(対象ステージがstage-3〜7に広いだけ)。計測路(ボスメーカー/ガントレット)
 * では常にfalse=§9-7#7「計測路は常にpumpkin」をloggerにも継承する。
 */
export const allowLoggerForRun = (
  stageId: string | null | undefined,
  isMeasurementRun: boolean,
): boolean => !isMeasurementRun && !!stageId && LOGGER_ALLOWED_STAGES.has(stageId);

// §9-4: 好みの間合い(px)。190px超=接近 / 130px未満=後退 / 帯内(130〜190)=構え(移動を止める)。
export const DRILLER_APPROACH_DIST = 190;
export const DRILLER_BACKOFF_DIST = 130;

export type DrillerZone = 'approach' | 'backoff' | 'hold';

/** §9-4: 間合い判定(通常時=突き3州でも離脱でもない時の移動方向)。 */
export const drillerZoneFor = (distance: number): DrillerZone => {
  if (distance > DRILLER_APPROACH_DIST) return 'approach';
  if (distance < DRILLER_BACKOFF_DIST) return 'backoff';
  return 'hold';
};

// §9-4/§9-7#6: 突きの発動距離(この距離以内かつCD満了で突きを開始)。
export const DRILLER_THRUST_RANGE = 200;

/** §9-4: 突き発動条件(距離のみ。CD満了は呼び出し側=aiReadyAtで見る)。 */
export const drillerCanThrust = (distance: number): boolean => distance <= DRILLER_THRUST_RANGE;

// §9-4/§9-7#6: 近接被弾による離脱(retreat)の持続時間・速度倍率。
export const DRILLER_RETREAT_MS = 2000;
export const DRILLER_RETREAT_SPEED_MULT = 1.5;

/** §9-7#6: 近接被弾で離脱中か(gameTime基準)。 */
export const isDrillerRetreating = (
  drillerRetreatUntil: number | undefined,
  gameTime: number,
): boolean => drillerRetreatUntil !== undefined && gameTime < drillerRetreatUntil;

// §14-2④(伐採人・logger): 「近接被弾で退く」の機構(drillerRetreatUntilフィールド・
// isDrillerRetreating・DRILLER_RETREAT_MS/SPEED_MULT)をそのまま共有する。この述語1本を
// gameStore.ts の近接被弾ハンドラ(ナイフ/刀/鞭のスイング+applyDrillerRetreat)の型ガードに使う。
const RETREAT_ELIGIBLE_TYPES = new Set<EnemyType>(['driller', 'logger']);
export const isRetreatEligibleType = (t: EnemyType): boolean => RETREAT_ELIGIBLE_TYPES.has(t);

// §9-8②+§14-2(伐採人の薙ぎ払い3州も同型): aiPhase駆動の技を実行中は距離リサイクルで飛ばさない
// (windup中にロック済みの赤帯だけを残すと「赤いのに当たらない」になる=絶対禁止)。
// directorTick.ts runOffscreenRecycleAndCull のリサイクル除外条件から呼ぶ。
const MID_ATTACK_PHASES = new Set([
  'driller-thrust-windup', 'driller-thrust-active', 'driller-thrust-recover',
  'logger-sweep-windup', 'logger-sweep-active', 'logger-sweep-recover',
]);
export const isKiteMidAttackPhase = (aiPhase: string | undefined): boolean =>
  aiPhase !== undefined && MID_ATTACK_PHASES.has(aiPhase);
