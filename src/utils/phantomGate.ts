// research/GHOST_BOSS.md v6「4. 被弾=phantomGate」: **幻影が受ける打撃を1本の純関数で裁く葉**。
//
// ## 何のためにあるか
// 幻影は「AIが操作するもう1人のプレイヤー」なので、**プレイヤーと同じ被弾ルール**で殴られる:
//  ① 被弾無敵(i-frame): 直近の有効被弾から `INVULN_MS` の間はHPが減らない(プレイヤーと同じ定数)。
//  ② パリィ: 近接系の打撃を `counterChance`(台帳=プレイヤーの「カウンター」の鏡)で弾き返す。
// この2つは**ダメージの合流点が7系統に分かれている**(damageEnemy / 近接カウンター3枝 / 分身 /
// 刀 / 鞭 / スケボー)ため、1経路でも素通りがあれば「無敵が存在しない」に等しい。
// ⇒ **全系統がこの1本を通る**形にして、取りこぼしを構造的に潰す。
//
// ## 掟
// - **型以外を import しない**(依存ゼロの葉)。必要な値は全部引数で受ける
//   (invulnMs / counterChance / rand / gameTime / enemy の当該フィールド)。
//   `counterReach.ts` と同じ理由: 葉が store を引くと循環importで起動全損(v0.25.3390)。
// - **時計は gameTime 1本**(ENGINEERING_NOTES.md「時計の混在」)。`lastHit` は Date.now 基準なので
//   使わず、専用の `gpHitAt`(gameTime)を持つ。混ぜて比較しない。
// - **幻影以外の敵には恒等**(通常敵のダメージ・副作用に1bitも影響しない)。テストで固定する。
import type { Enemy } from '../types/game';

/** ゲートが裁く対象の型名。`enemyUtils.isGuardianPhantom` と同じ1つの文字列を見る。 */
export const PHANTOM_GATE_TYPE = 'guardian-phantom';

/**
 * 打撃の出どころ。**パリィできるのは 'melee' だけ**。
 *  - 'melee'   … プレイヤー(と分身/守護霊)の近接スイング全般=パリィ可。
 *  - 'counter' … カウンター反撃(確定クリ)=パリィ不可(意図的・GHOST_BOSS.md M3)。
 *  - 'ranged'  … 銃弾・サブウェポン・爆発など=パリィ不可(躱すのは弾回避の仕事)。
 */
export type PhantomHitSource = 'melee' | 'counter' | 'ranged';

export interface PhantomHitGateInput {
  /** 殴られた敵の型。'guardian-phantom' 以外はこの関数は何もしない(恒等)。 */
  enemyType: string;
  /** 元のダメージ量。 */
  amount: number;
  source: PhantomHitSource;
  /** シミュ時刻(ms)。下の3フィールドと同じ時計。 */
  gameTime: number;
  /** プレイヤーと同じ被弾無敵の長さ(呼び出し側が gameStore の INVULN_MS を渡す)。 */
  invulnMs: number;
  /** パリィ成立率(0..1)。呼び出し側が台帳 `strongestGuardian().profile.counterChance` を渡す。 */
  counterChance: number;
  /** パリィが再び出せるようになるまでの間隔(ms)。 */
  parryCdMs: number;
  /** 直近に**有効な**ダメージが入った時刻(gameTime)。未被弾なら undefined。 */
  gpHitAt?: number;
  /** パリィのクールダウン終了時刻(gameTime)。 */
  gpParryCdUntil?: number;
  /** [0,1) の乱数(テストで固定できるよう注入口にする)。 */
  rand?: () => number;
}

export interface PhantomHitGateResult {
  /** 実効ダメージ(無効化されたら0)。 */
  damage: number;
  /**
   * **副作用を出してよいか**。false のとき呼び出し側は
   * `slashAt` / `meleeHitEnemyIds` / `meleeDamageNumbers` に積まず、`lastHit` も打たず、
   * ノックバック・固めも立てない(GHOST_BOSS.md R3/M1)。戻り値 `hit/finish/killed` にも数えない。
   */
  effects: boolean;
  /** 無敵で弾いた(絵=小さな白点滅・ヒットSEなし)。 */
  blocked: boolean;
  /** パリィで弾いた(絵=青白いスパーク+弾き音・次tickで即反撃)。 */
  parried: boolean;
  /** 敵へ合成するパッチ(打刻のみ。HPは呼び出し側が持つ)。 */
  patch: Partial<Enemy>;
}

/** 幻影以外(=大多数)のための恒等結果。オブジェクトは毎回作る(呼び出し側が patch を展開するため)。 */
const passThrough = (amount: number): PhantomHitGateResult =>
  ({ damage: amount, effects: true, blocked: false, parried: false, patch: {} });

/**
 * 幻影が受ける1発を裁く。**適用順**は呼び出し側の責任:
 * 「死体/空中の早期return の直後・紫の報酬予算(applyBrokenGunReward/applyBrokenMeleeFatal)と
 * 紅き夜補正より前」(0ダメージ化したヒットが報酬予算を食わないため)。
 */
export const phantomHitGate = (input: PhantomHitGateInput): PhantomHitGateResult => {
  if (input.enemyType !== PHANTOM_GATE_TYPE) return passThrough(input.amount);

  // ① 被弾無敵(プレイヤーと同じ i-frame)。無敵中はHPも副作用も動かさない。
  const hitAt = input.gpHitAt;
  if (hitAt !== undefined && input.gameTime - hitAt < input.invulnMs) {
    return { damage: 0, effects: false, blocked: true, parried: false, patch: { gpBlockedAt: input.gameTime } };
  }

  // ② パリィ(近接系だけ)。CD中は抽選しない=連続で弾き続けない。
  if (input.source === 'melee'
    && input.counterChance > 0
    && input.gameTime >= (input.gpParryCdUntil ?? 0)
    && (input.rand ?? Math.random)() < input.counterChance) {
    return {
      damage: 0, effects: false, blocked: false, parried: true,
      // gpParriedAt は**次tickの phantomTick が消費する合図**(ハンドシェイク=二重書き手を作らない)。
      patch: { gpParriedAt: input.gameTime, gpParryCdUntil: input.gameTime + input.parryCdMs },
    };
  }

  // ③ 通った。ここで i-frame の起点を打つ(=次の1秒は0になる)。
  return { damage: input.amount, effects: true, blocked: false, parried: false, patch: { gpHitAt: input.gameTime } };
};
