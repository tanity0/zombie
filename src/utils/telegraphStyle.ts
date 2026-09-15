/**
 * 赤予告の「呼吸」を敵の区分で3種に(research/CREATIVE_AUDIT_2026-09-11.md #25(b)・
 * 社長裁定2026-09-12「赤予告はb」)。
 *
 * **ではない(絶対・CLAUDE.md「攻撃ヴィジュアルの2分類」①危険を伝える絵=判定に揃える」)**:
 * 判定に関わる値(溜め=windupの時間・当たり判定の形/幅=halfWidth・radius・発火の瞬間・
 * 「消え切り=判定の瞬間」の一致)は1つも変えない。ここで差し替えるのは**見え方の時間配分と質感だけ**:
 * ①描き切る位置 `drawFrac`(`meteorPhase` の `METEOR_DRAW_FRAC` 相当)
 * ②流れる帯の相対幅 `haloRel`(`CIRCLE_SWEEP_HALF_W` 相当。円/扇の「流れる光の帯」の太さ=
 *   判定半径ではない)
 * ③脈動の周期 `pulseMs`(`sin(now / 110)` の 110 相当)
 * ④流れの ease の強さ `easePow`(`circleSweepBand` の `t ** easePow`。値が大きいほど終盤へ
 *   加速が寄る=「重く」感じる)
 *
 * 区分(CLAUDE.md「敵の仕様は種類(区分)で固める」)は既存ヘルパーの合成で作る。新しい型名の
 * 列挙は増やさない——**終端の集合だけ**は例外的に、campaign.ts の `hiddenBoss` に載る型
 * (mimir/jormungand/skadi/thor)+城ボス(giantbat)+EXボス(phillboss)から作る
 * (isHiddenBoss 等の既存述語は「裏ボス全般」という別目的の広い集合なので、ここでは使わない)。
 *
 * ★追記(品質監査1巡目・2026-09-12): 円/扇/線には初回で届いたが、**帯(カプセル)は
 * `BAND_SWEEP_ON=true` の既定経路(`drawSweepBand`→`bandSweepCenter`)に1pxも届いていなかった**
 * (`meteorPhase` の差し替えは `?bsweep=0` の旧経路にしか効かない)。`bandHalfW` を追加し、
 * 円の `haloRel` と同じ比の値を帯にも使う(`drawSweepBand`・`drawAngelZoneCapsule`・
 * `zoneCapsuleTick`・`drawTelegraphBand` へ配線)。
 */
import type { EnemyType } from '../types/game';
import { isBossType } from './enemyUtils';
import { POSTURE_ELITE_TYPES } from './bossPosture';

export interface TelegraphStyle {
  /** 描き切る位置(0〜1)。この割合までで描き切り、残りで消し切る(meteorPhase の D)。 */
  drawFrac: number;
  /** 流れる帯の相対幅(判定半径に対する比。circleSweepBand の halfW に使う「流れる光の帯」の太さ)。 */
  haloRel: number;
  /**
   * 帯(カプセル)の窓の相対幅(帯の全長に対する比。bandSweepCenter の halfW に使う値)。
   * ★追記(品質監査1巡目): 円の `haloRel` と同じ比の値を使う(区分ごとに独立の値を発明しない)。
   */
  bandHalfW: number;
  /** 脈動の周期(ms)。sin(now / pulseMs)。 */
  pulseMs: number;
  /** 流れの ease の強さ(circleSweepBand/bandSweepCenter の t の指数。大きいほど終盤へ加速が寄り「重く」見える)。 */
  easePow: number;
}

/** 雑魚(既定)=今の値。1pxも変えない。 */
export const TELEGRAPH_STYLE_MOB: TelegraphStyle = { drawFrac: 0.45, haloRel: 0.34, bandHalfW: 0.34, pulseMs: 110, easePow: 2 };
/** 強個体(体勢値を持つ型・CLAUDE.md「敵の仕様は区分で固める」パンプキン/削岩型/伐採人 等)。 */
export const TELEGRAPH_STYLE_ELITE: TelegraphStyle = { drawFrac: 0.40, haloRel: 0.30, bandHalfW: 0.30, pulseMs: 95, easePow: 2 };
/** ボス級(isBossType かつ終端でないもの・賞金首含む)。 */
export const TELEGRAPH_STYLE_BOSS: TelegraphStyle = { drawFrac: 0.50, haloRel: 0.40, bandHalfW: 0.40, pulseMs: 130, easePow: 2.5 };
/** 終端(ステージ最奥のボス=Stage.hiddenBoss+城ボス+EXボス)。 */
export const TELEGRAPH_STYLE_TERMINAL: TelegraphStyle = { drawFrac: 0.58, haloRel: 0.48, bandHalfW: 0.48, pulseMs: 170, easePow: 3 };

/**
 * 終端(ステージ最奥のボス)の型。
 * - `mimir`/`jormungand`/`skadi`/`thor`: `src/data/campaign.ts` の各ステージ `hiddenBoss` フィールド
 *   (深層域の裏ボス4体)。
 * - `giantbat`: 城ボス(通常ステージ終盤に現れる大型個体。campaign.ts の敵図鑑コメント
 *   「ステージ終盤に現れる大型個体」)。
 * - `phillboss`: EXボス「フィル(変異体)」(campaign.ts stage-ex1 の最奥ボス)。
 * `idol`(stage-2隠しボス)・ゲート2天使(miguel/jibril/rafi/uri/suriel/acrasiel)は
 * `isHiddenBoss` 等の別目的の広い集合には含まれるが、`Stage.hiddenBoss`/城ボス/EXボスの
 * いずれでもないため、ここには含めない(=ボス級として扱う)。
 */
const TERMINAL_ENEMY_TYPES = new Set<EnemyType>(['mimir', 'jormungand', 'skadi', 'thor', 'giantbat', 'phillboss']);

/**
 * 敵の型から赤予告のスタイルを引く純関数。
 *
 * 優先順位(高い方が勝つ): 終端 → 強個体(体勢値を持つ「エリート雑魚」型) → ボス級(それ以外の
 * isBossType) → 雑魚。**強個体をボス級より先に見る**のがポイント: `POSTURE_ELITE_TYPES`
 * (pumpkin/driller/logger/lab-zombie-3/reaper)は `isBossType` にも該当するが、CLAUDE.md
 * 「敵の仕様は区分で固める」節が明記するとおりこれらは「本物のボス」ではなく強個体(エリート雑魚)
 * なので、ボス級の判定より前に確定させる。
 */
export const telegraphStyleFor = (type: EnemyType): TelegraphStyle => {
  if (TERMINAL_ENEMY_TYPES.has(type)) return TELEGRAPH_STYLE_TERMINAL;
  if (POSTURE_ELITE_TYPES.has(type)) return TELEGRAPH_STYLE_ELITE;
  if (isBossType(type)) return TELEGRAPH_STYLE_BOSS;
  return TELEGRAPH_STYLE_MOB;
};

/**
 * ★追記(品質監査1巡目・2026-09-12「meteorPhase を純関数へ出して」): 溜め進行(0→1)から
 * 「描き(p)」と「消し(er)」を導く純関数。旧実装は `PixiScene`(pixiScene.ts)の private static
 * メソッドだったため、ここへ出してユニットテストの対象にする。`pixiScene.ts` 側の
 * `PixiScene.meteorPhase` は後方互換のためこの関数へ委譲するだけの薄いラッパーとして残す
 * (13箇所の呼び出しを書き換えない=差分を最小に保つ)。
 *
 * `drawFrac`(既定 `TELEGRAPH_METEOR_DRAW_FRAC_DEFAULT`=0.45・今の挙動): 描き切る位置 D の上書き。
 * **溜め時間・判定の一致は不変**——「同じ溜めの中で、どこまでで描き切るか」という時間配分だけを動かす。
 * 任意の `0 < D < 1` で `prog=1` のとき `er=1` になる(=描き切ってから消し切るまでの間に必ず
 * 「消え切った瞬間」が来る=判定発生の瞬間と一致する構造が壊れない)。
 */
export const TELEGRAPH_METEOR_DRAW_FRAC_DEFAULT = 0.45;

export const meteorPhase = (
  prog: number, drawFrac: number = TELEGRAPH_METEOR_DRAW_FRAC_DEFAULT,
): { p: number; er: number } => {
  const t = Math.max(0, Math.min(1, prog));
  const D = drawFrac;
  return t <= D
    ? { p: t / D, er: 0 }
    : { p: 1, er: (t - D) / (1 - D) };
};
