// PACING_PUZZLE.md §9(新型雑魚「削岩型」= 槍持ちカイト型・社長指示 2026-08-20)。
// レンダラ非依存の純関数群=ヘッドレスでユニットテスト可能(CLAUDE.md 実装精度の規律4)。
//
// このファイルが持つ責務は2つ(どちらも配線側の判定ロジックを純関数へ切り出したもの):
//  ①「同格」湧き分け: pumpkin枠を実体化する瞬間に pumpkin/driller どちらの絵を出すか(§9-3)。
//  ②カイトAI: 好み帯(接近/後退/構え)と、近接被弾による離脱の判定(§9-4)。
// 台本・帳簿(FORMATION_TABLE/scriptSpawned/ProblemChild等)は不変で、'pumpkin' のまま消化する
// (§9-3「実体化のみ差し替え」)。この2つの純関数はその実体化の瞬間だけに使う。

/** §9-3: pumpkin枠を実体化する瞬間、pumpkin/driller どちらを実際に湧かせるか。
 * allowDriller=false(対象ステージ外 or 計測路)なら常にpumpkinを返す。
 * allowDriller=true なら50%でdrillerに差し替える(叩き台の比率=§9-6「バランスの最終値ではない」)。
 */
export const resolvePumpkinTier = (
  allowDriller: boolean,
  rand: () => number = Math.random,
): 'pumpkin' | 'driller' => (allowDriller && rand() < 0.5 ? 'driller' : 'pumpkin');

// §9-3/§9-7#7/§9-8#5: driller を許可するステージ(stage-4〜7)。
const DRILLER_ALLOWED_STAGES = new Set(['stage-4', 'stage-5', 'stage-6', 'stage-7']);

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
