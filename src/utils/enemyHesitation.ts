/**
 * ★敵の駆け引き(技に入る前のためらい)— research/ENEMY_HESITATION.md の共通の純関数。
 *
 * 社長(2026-11-13)「射程に入ると100%技のモードに入るので、ここは横に旋回するとか、立ち止まってみるとか、
 * ヒステリシスが少しだけ欲しい」。手本はエルデンリング(毎回すぐは殴らない・迷いは短く・1回はさんだら必ず来る)。
 *
 * 使い方(各経路=store の pumpkin/lab-zombie-3/driller/logger/hunter/giantbat、bountyTick の bounty-melee、
 * useGameLoop の mimir/jormungand/skadi):
 *  1. **技が決まった後・その技の溜め(begin)の直前**に `rollHesitation` を1回呼ぶ。null=今どおり技へ(`HES_TECHNIQUE_PATCH` で印を消す)。
 *     パッチが返ったら技は捨て、パッチを敵に書く(印 `hesOwed` が立つ=次に技に入る条件を満たした瞬間は必ず技)。
 *  2. 毎フレーム、技の相に入っていない間は `hesitationActive` を見て、真なら `hesitationInterrupted` で打ち切りを確かめ、
 *     続くなら `hesitationVelocity` の速さで動かす(壁は呼び手の resolveMove・帯は clampRectToPlayableArea)。
 *     打ち切り/時間切れは `HES_CLEAR`(印 `hesOwed` は残す)を書いて、そのフレームは普段の処理へ落とす。
 *
 * ★状態は `aiPhase` を使わない(コウモリ・骸骨等の「`aiPhase === undefined` で技を申告する」前提を壊さない)。
 * ★時計: hesUntil/hesStartAt は gameTime 系、hesStartNow だけ Date.now 系(liftUntil 等の実時間の打ち切りと比べるため)。
 * ★赤い予告は出さない(ためらいは技ではない)。技の溜めの開始=予告の開始は呼び手の begin が今どおり持つ。
 */
import type { EnemyType } from '../types/game';

export type HesKind = 'strafe' | 'watch' | 'backstep';

/** 対象の型(強個体とボス級のうち、射程/抽選で技に入る型)。雑魚・C の型は入れない(設計書 §3)。 */
export const HESITATION_TYPES: ReadonlySet<EnemyType> = new Set<EnemyType>([
  'pumpkin', 'lab-zombie-3', 'driller', 'logger', 'bounty-melee',
  'giantbat', 'mimir', 'jormungand', 'skadi', 'hunter',
]);

/** 叩き台の割合(attack 55% / strafe 20% / watch 12% / backstep 13%)。 */
export const HES_RATE = { strafe: 0.20, watch: 0.12, backstep: 0.13 } as const;
/** 叩き台の長さ(ms)。 */
export const HES_STRAFE_MS: readonly [number, number] = [500, 1200];
export const HES_WATCH_MS: readonly [number, number] = [300, 800];
export const HES_BACKSTEP_MS: readonly [number, number] = [250, 400];
/** 叩き台の動く量(px)。「動きは大きく」= 旋回 40〜90px・後退 30〜50px(半歩〜一歩)。 */
export const HES_STRAFE_PX: readonly [number, number] = [40, 90];
export const HES_BACKSTEP_PX: readonly [number, number] = [30, 50];
/** 速さの上限(素の速さに対する倍率)。遅い敵は時間を延ばさず量が減ってよい(監査2巡目C7)。 */
export const HES_STRAFE_SPEED_CAP = 1.2;
export const HES_BACKSTEP_SPEED_CAP = 1.5;
/**
 * 旋回の左右(監査A-8): 接線の上下の成分の大きさがこれ未満なら左右は乱数、以上なら**上(奥)へ向かう成分が小さい方**
 * (=y が増える側)を選ぶ。地平線フェード・可視域へ自分から入りにいかないため(world 側で完結する規則・叩き台)。
 */
export const HES_STRAFE_FREE_Y = 0.35;
/** 速度の寄せの時定数(s)。入る前の速度(接近の勢い)から ease で乗り換える=慣性 MUST。 */
export const HES_BLEND_TAU_S = 0.12;

/**
 * B のボス(タイマーが引き金)だけ: 相手の中心がこれ以内の時だけ抽選する(監査A-3・叩き台)。
 * A の型は「射程に入った瞬間」が呼ぶ位置なので距離は呼び手の射程そのもの(この表に載せない)。
 */
export const HES_BOSS_ROLL_RANGE_PX: Partial<Record<EnemyType, number>> = {
  giantbat: 300, mimir: 320, jormungand: 320, skadi: 320, hunter: 300,
};

const readParam = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try { return new URLSearchParams(window.location.search).get(key); } catch { return null; }
};
/** ★切り分けツマミ `?hes=0`: ためらいを丸ごと切る(入れる前と同じ動き)。 */
export const HES_ON: boolean = readParam('hes') !== '0';
/** ★確認用ツマミ `?hesdemo=1`: 抽選を必ずためらいにする(旋回/様子見/後退は割合の比のまま)。2回続けて迷わない規則は残す。 */
export const HES_DEMO: boolean = readParam('hesdemo') === '1';

/** テストだけが差し替える乱数(null=Math.random)。store の配線テストが抽選を固定するために使う。 */
let randOverride: (() => number) | null = null;
export const setHesitationRandForTest = (fn: (() => number) | null): void => { randOverride = fn; };
export const hesRand = (): number => (randOverride ? randOverride() : Math.random());

/** 敵に持たせる欄(Enemy の同名の欄)。 */
export interface HesFields {
  hesKind?: HesKind;
  hesUntil?: number;
  hesStartAt?: number;
  hesStartNow?: number;
  hesDirX?: number;
  hesDirY?: number;
  /** 動きの山の速さ(px/s)。watch は 0。 */
  hesPeak?: number;
  hesOwed?: boolean;
}

/** ためらいの動きを消す(印 `hesOwed` は残す=明けたら技)。 */
export const HES_CLEAR: HesFields = {
  hesKind: undefined, hesUntil: undefined, hesStartAt: undefined, hesStartNow: undefined,
  hesDirX: undefined, hesDirY: undefined, hesPeak: undefined,
};
/** 技の溜めに入った時に書く(印も消す)。 */
export const HES_TECHNIQUE_PATCH: HesFields = { ...HES_CLEAR, hesOwed: undefined };

export const isHesitationType = (type: EnemyType): boolean => HESITATION_TYPES.has(type);

export interface RollInput {
  type: EnemyType;
  /** 直前にためらったか(印)。真なら抽選しない=必ず技。 */
  owed: boolean | undefined;
  gameTime: number;
  nowMs: number;
  /** 敵の中心。 */
  ecx: number; ecy: number;
  /** その経路が技の相手として使っている点(store=apx/apy、ボス=chaseTgt 等)。 */
  tx: number; ty: number;
  /** 素の速さ(px/s)。 */
  baseSpeed: number;
  rand: () => number;
  /** B のボスだけ: 相手との距離(固定の距離の表と比べる)。A の型は省略。 */
  bossDist?: number;
  /** テスト用(既定は URL のツマミ)。 */
  enabled?: boolean;
  demo?: boolean;
}

const lerp = (r: readonly [number, number], u: number): number => r[0] + (r[1] - r[0]) * u;

/**
 * 技に入ってよいと判断した瞬間に1回。null=今どおり技へ。パッチ=ためらう(技は捨てる)。
 * 乱数は 種類→長さ→量→(旋回なら)左右 の順に引く。
 */
export const rollHesitation = (i: RollInput): HesFields | null => {
  if (!(i.enabled ?? HES_ON)) return null;
  if (!isHesitationType(i.type)) return null;
  if (i.owed) return null; // 2回続けて迷わない(裁定2)
  const bossRange = HES_BOSS_ROLL_RANGE_PX[i.type];
  if (i.bossDist !== undefined && bossRange !== undefined && !(i.bossDist <= bossRange)) return null; // 遠い時は今どおり
  const demo = i.demo ?? HES_DEMO;
  const hesTotal = HES_RATE.strafe + HES_RATE.watch + HES_RATE.backstep;
  const r0 = i.rand();
  // demo は抽選をためらい側の比へ引き伸ばす(割合の比は保つ)。
  const r = demo ? r0 * hesTotal : r0 - (1 - hesTotal);
  if (r < 0) return null; // attack(55%)
  const kind: HesKind = r < HES_RATE.strafe ? 'strafe' : r < HES_RATE.strafe + HES_RATE.watch ? 'watch' : 'backstep';
  const durRange = kind === 'strafe' ? HES_STRAFE_MS : kind === 'watch' ? HES_WATCH_MS : HES_BACKSTEP_MS;
  const durMs = Math.round(lerp(durRange, i.rand()));
  const base: HesFields = {
    hesKind: kind, hesUntil: i.gameTime + durMs, hesStartAt: i.gameTime, hesStartNow: i.nowMs,
    hesDirX: 0, hesDirY: 0, hesPeak: 0, hesOwed: true,
  };
  if (kind === 'watch') return base;
  const dx = i.tx - i.ecx, dy = i.ty - i.ecy;
  const dl = Math.hypot(dx, dy);
  // 相手へ向かう単位(重なっている時は下向き扱い=後退は上へ、旋回は横へ)。
  const ux = dl > 1e-6 ? dx / dl : 0, uy = dl > 1e-6 ? dy / dl : 1;
  const amount = lerp(kind === 'strafe' ? HES_STRAFE_PX : HES_BACKSTEP_PX, i.rand());
  let dirX: number, dirY: number;
  if (kind === 'strafe') {
    // 接線(相手を中心に横へ)。左右は乱数、ただし上下の成分が大きい時は上(奥)へ向かわない方。
    const tX = -uy, tY = ux;
    const side = i.rand() < 0.5 ? 1 : -1;
    const sgn = Math.abs(tY) < HES_STRAFE_FREE_Y ? side : (tY >= 0 ? 1 : -1);
    dirX = tX * sgn; dirY = tY * sgn;
  } else {
    dirX = -ux; dirY = -uy; // 相手から離れる向き
  }
  // 速さの山: sin の山で量 D を時間 T で動く=山 = D·π/(2T)。上限は素の速さ×倍率。
  const cap = Math.max(0, i.baseSpeed) * (kind === 'strafe' ? HES_STRAFE_SPEED_CAP : HES_BACKSTEP_SPEED_CAP);
  const peak = Math.min((amount * Math.PI) / (2 * (durMs / 1000)), cap);
  return { ...base, hesDirX: dirX, hesDirY: dirY, hesPeak: peak };
};

/** 今ためらいの動きの最中か(gameTime 系)。 */
export const hesitationActive = (e: HesFields, gameTime: number): boolean =>
  e.hesKind !== undefined && e.hesUntil !== undefined && gameTime < e.hesUntil;

/** 打ち切りの判定に読む敵の欄。 */
export interface HesInterruptSource extends HesFields {
  meleeHitAt?: number;          // gameTime 系(近接の被弾=近接の押しもここで拾う)
  lastCounteredAt?: number;     // Date.now 系
  stunUntil?: number;           // gameTime 系
  bossFullStunUntil?: number;   // gameTime 系
  liftUntil?: number;           // Date.now 系
  knockbackShoveUntil?: number; // Date.now 系(押し道具)
}

/**
 * ★打ち切り(監査A-2): 近接の被弾・カウンター・気絶・紫の気絶・浮き・押し道具の押しだけ。
 * **銃弾の被弾・銃の knockbackUntil/hitStunUntil では打ち切らない**(銃撃では攻撃は何も止まらない)。
 * どの欄も「ためらいが始まった後に書かれた」時だけ数える(期限の欄は 始まり < 期限 で判定=始まる前に明けた分は数えない。
 * 気絶・浮き・押しの最中はためらいを始められない=始まりより後に明ける期限は、始まった後に書かれたもの)。
 * 明けた後に呼ばれても打ち切り(気絶の間は呼び手の早期 return でこの関数まで来ない=明けた最初のフレームで打ち切る)。
 */
export const hesitationInterrupted = (e: HesInterruptSource): boolean => {
  const g0 = e.hesStartAt;
  const r0 = e.hesStartNow;
  if (g0 === undefined) return false;
  if (e.meleeHitAt !== undefined && e.meleeHitAt >= g0) return true;
  if (e.stunUntil !== undefined && e.stunUntil > g0) return true;
  if (e.bossFullStunUntil !== undefined && e.bossFullStunUntil > g0) return true;
  if (r0 !== undefined) {
    if (e.lastCounteredAt !== undefined && e.lastCounteredAt >= r0) return true;
    if (e.liftUntil !== undefined && e.liftUntil > r0) return true;
    if (e.knockbackShoveUntil !== undefined && e.knockbackShoveUntil > r0) return true;
  }
  return false;
};

/** 時刻 t(gameTime)での速さの山の速度(旋回/後退=sin の山・様子見=0)。 */
const profileAt = (e: HesFields, t: number): { x: number; y: number } => {
  if (e.hesKind === 'watch' || e.hesStartAt === undefined || e.hesUntil === undefined || !(e.hesUntil > e.hesStartAt)) return { x: 0, y: 0 };
  const u = Math.max(0, Math.min(1, (t - e.hesStartAt) / (e.hesUntil - e.hesStartAt)));
  const sp = Math.sin(Math.PI * u) * (e.hesPeak ?? 0);
  return { x: (e.hesDirX ?? 0) * sp, y: (e.hesDirY ?? 0) * sp };
};

/**
 * ためらい中の1歩の速度(px/s)。旋回/後退は sin の山(ease-in で動き出し ease-out で止まる=量どおり動いて止まる)、様子見は 0。
 * 入る前の速度(接近の勢い)は「山からのずれ」として時定数 HES_BLEND_TAU_S で抜ける(パッと止まらない・山の形は崩さない)。
 */
export const hesitationVelocity = (
  e: HesFields, gameTime: number, prevVx: number, prevVy: number, dtS: number,
): { vx: number; vy: number } => {
  const cur = profileAt(e, gameTime);
  const prev = profileAt(e, gameTime - dtS * 1000);
  const decay = dtS > 0 ? Math.exp(-dtS / HES_BLEND_TAU_S) : 1;
  return { vx: cur.x + (prevVx - prev.x) * decay, vy: cur.y + (prevVy - prev.y) * decay };
};
