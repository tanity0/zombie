// SKILL_BUILD_REDESIGN.md §28(B7発注文): 眠っていた新スキル9種(§14/§16-5)の判定値・確率テーブルを
// 1箇所に集約した純関数群(CLAUDE.md「実装精度の規律」4: 配線ロジックは純関数に切り出してテスト)。
// レンダラ非依存(PixiJS import禁止)。gameStore.ts/useGameLoop.tsはここの値を読んで書き込むだけ。
//
// 値は全て§28-2の「判定叩き台」をそのまま採用。仕様に無い値(★未決)はコメントで明記し、
// SKILL_BUILD_REDESIGN.md末尾「### ★B7実装中の未決」にも記録している。
//
// 確率が絡むもの(吸血/グラビティショット/エコーショット)はrngを引数注入できる形にしてあり
// (既定Math.random)、ユニットテストで決定的に検証できる(§28-3受け入れ条件1)。

import { MOLOTOV_FIRE_RADIUS } from './molotov';

const clampLv = (level: number): number => Math.max(0, Math.min(3, Math.floor(level || 0)));

// ---- ビッグバレット(normal): 弾サイズ×1.3/1.5/1.7(判定と絵を同時拡大。貫通/跳弾/壁衝突は不変) ----
export const BIG_BULLET_SIZE_MULT_BY_LEVEL: readonly number[] = [1, 1.3, 1.5, 1.7];
export const bigBulletSizeMult = (level: number): number => BIG_BULLET_SIZE_MULT_BY_LEVEL[clampLv(level)];

// ---- アイスショット(normal): 命中で鈍足+キル時氷片3(0.3倍・全Lv) ----
// 社長裁定v0.25.3280「レベル1で40% 2秒/2で50% 2.5秒/3で60% 3秒。ボスは半分の効果で発動」:
// 旧(20%/30%/40%・1s/1s/1.5s・ボス対象外)から強化+ボス解禁(強度のみ半分・時間はそのまま)。
export interface IceShotSlow { pct: number; ms: number }
export const ICE_SHOT_SLOW_BY_LEVEL: readonly IceShotSlow[] = [
  { pct: 0, ms: 0 },
  { pct: 0.4, ms: 2000 },
  { pct: 0.5, ms: 2500 },
  { pct: 0.6, ms: 3000 },
];
export const iceShotSlowParams = (level: number): IceShotSlow => ICE_SHOT_SLOW_BY_LEVEL[clampLv(level)];
// ボスへの鈍足強度倍率(「半分の効果で発動」)。適用側(useGameLoop)がpctに掛けて書き込む。
export const ICE_SHOT_BOSS_EFFECT_MULT = 0.5;
export const ICE_SHOT_SHARD_COUNT = 3;         // 全Lv共通(§28-2)
export const ICE_SHOT_SHARD_DMG_MULT = 0.3;    // 全Lv共通(§28-2)。基準=キル時のこの1発のdmg。

// ---- 吸血(normal): キルで確定発動 HP+2/+4/+6 ----
// ★社長裁定v0.25.3603「吸血はキルで確定発動にする 100%」: 旧仕様(キルの20%・§14/§28 B7)は撤去。
// 旧VAMPIRE_PROC_CHANCE=0.2は事実として記録(率固定=Lvで率が伸びない設計だった)。
export const VAMPIRE_PROC_CHANCE = 1.0;
export const VAMPIRE_HEAL_BY_LEVEL: readonly number[] = [0, 2, 4, 6];
/** キル1回ぶんの吸血回復量。100%発動(v0.25.3603裁定)なのでrngは読まない(引数はABI互換で残置)。 */
export const rollVampireHeal = (level: number, _rng: () => number = Math.random): number => {
  const lv = clampLv(level);
  if (!lv) return 0;
  return VAMPIRE_HEAL_BY_LEVEL[lv];
};

// ---- 延焼弾(rare): 命中で燃焼(秒2×3秒)/Lv2+炎床解禁(小・モロトフ資産流用)/Lv3燃焼(秒4×4秒)+炎床大 ----
export interface IncendiaryBurn { dps: number; durationMs: number; floorRadius: number | null }
// ★未決(B7実装中): 「炎床(大)」の半径は§28-2に数値指定が無い。モロトフの資産(半径22px)を
// そのまま使う「小」に対し、安全側の叩き台として×1.5(=33px)を採用。設計チャットの数値確定待ち。
export const INCENDIARY_FLOOR_LARGE_RADIUS_MULT = 1.5;
export const INCENDIARY_FLOOR_SMALL_RADIUS = MOLOTOV_FIRE_RADIUS;
export const INCENDIARY_FLOOR_LARGE_RADIUS = Math.round(MOLOTOV_FIRE_RADIUS * INCENDIARY_FLOOR_LARGE_RADIUS_MULT);
export const incendiaryBurnParams = (level: number): IncendiaryBurn => {
  const lv = clampLv(level);
  if (lv <= 0) return { dps: 0, durationMs: 0, floorRadius: null };
  if (lv === 1) return { dps: 2, durationMs: 3000, floorRadius: null };
  if (lv === 2) return { dps: 2, durationMs: 3000, floorRadius: INCENDIARY_FLOOR_SMALL_RADIUS };
  return { dps: 4, durationMs: 4000, floorRadius: INCENDIARY_FLOOR_LARGE_RADIUS };
};
export const INCENDIARY_BURN_TICK_MS = 500; // molotovのMOLOTOV_DOT_INTERVAL_MSと揃える(既存踏襲)
// ★未決(B7実装中): 炎床(GroundFire)を「命中のたび」に無条件で設置すると連射武器で無制限に湧く
// (CLAUDE.mdの負荷ルール=bounded/event-onlyに反する)。仕様に無いため安全側で裏CDを設ける。
export const INCENDIARY_FLOOR_CD_MS = 800;

// ---- 処刑の衝撃波(rare): 近接フィニッシュ時 半径80/100/120・近接表示ダメの30/40/50%(KB共通) ----
export interface ExecutionShock { radius: number; pct: number }
export const EXECUTION_SHOCK_BY_LEVEL: readonly ExecutionShock[] = [
  { radius: 0, pct: 0 },
  { radius: 80, pct: 0.3 },
  { radius: 100, pct: 0.4 },
  { radius: 120, pct: 0.5 },
];
export const executionShockParams = (level: number): ExecutionShock => EXECUTION_SHOCK_BY_LEVEL[clampLv(level)];

// ---- グラビティショット(rare): 射撃ヒットの20/30/40%で爆縮(引き寄せ120px/s×0.4s・半径100/120/140)
// (v0.25.3703・社長指示でキル時→ヒット時へ。抽選関数自体は不変=呼び出し時機だけが変わった) ----
export interface GravityShotProc { chance: number; radius: number }
export const GRAVITY_SHOT_BY_LEVEL: readonly GravityShotProc[] = [
  { chance: 0, radius: 0 },
  { chance: 0.2, radius: 100 },
  { chance: 0.3, radius: 120 },
  { chance: 0.4, radius: 140 },
];
export const GRAVITY_SHOT_PULL_SPEED = 120; // px/s(§16-5判定叩き台。全Lv共通)
export const GRAVITY_SHOT_PULL_MS = 400;    // 0.4s(全Lv共通)
// 社長指示v0.25.3280「グラヴィティはボスも減速させて」: ボスは吸引できない(押し道具ガード)ので、
// 渦の半径内にいる間**移動半減**にする(値はクリ減速と同じ0.5=既存の語彙に揃えた叩き台)。
// 消費は bossSlowMult(全ボス経路13箇所が読む共通チョーク)。クリのCD2倍(bossCritCdMult)には乗せない。
export const GRAVITY_SHOT_BOSS_SLOW_MULT = 0.5;
export const GRAVITY_SHOT_BOSS_SLOW_REFRESH_MS = 150; // 渦内で毎フレーム上書き→離脱/渦消滅から~150msで切れる
/** キル1回ぶんのグラビティショット判定。発動しなければnull。rng注入で決定的にテスト可能。 */
export const rollGravityShotWell = (level: number, rng: () => number = Math.random): { radius: number } | null => {
  const lv = clampLv(level);
  if (!lv) return null;
  const p = GRAVITY_SHOT_BY_LEVEL[lv];
  if (rng() >= p.chance) return null;
  return { radius: p.radius };
};

// ---- エコーショット(super): クリ時50/75/100%で複製弾(同方向・同ダメの2発目) ----
export const ECHO_SHOT_CHANCE_BY_LEVEL: readonly number[] = [0, 0.5, 0.75, 1.0];
/** クリ命中1回ぶんの複製判定。rng注入で決定的にテスト可能。 */
export const rollEchoShot = (level: number, rng: () => number = Math.random): boolean => {
  const lv = clampLv(level);
  return lv > 0 && rng() < ECHO_SHOT_CHANCE_BY_LEVEL[lv];
};

// ---- 弾幕の王(super): 反射弾のダメ・体勢削り×1.5/1.75/2.0(全Lv)+反射弾に貫通1(全Lv・§28-1追加) ----
export const BARRAGE_KING_MULT_BY_LEVEL: readonly number[] = [1, 1.5, 1.75, 2.0];
export const barrageKingMult = (level: number): number => BARRAGE_KING_MULT_BY_LEVEL[clampLv(level)];
export const BARRAGE_KING_PIERCE = 1; // 全Lv共通(§28-1)

// ---- 血の履帯(super): 移動軌跡に棘(幅24px・tick250ms)2秒・秒2/3秒・秒3/4秒・秒4 ----
export interface BloodTread { durationMs: number; dps: number }
export const BLOOD_TREADS_BY_LEVEL: readonly BloodTread[] = [
  { durationMs: 0, dps: 0 },
  { durationMs: 2000, dps: 2 },
  { durationMs: 3000, dps: 3 },
  { durationMs: 4000, dps: 4 },
];
export const bloodTreadsParams = (level: number): BloodTread => BLOOD_TREADS_BY_LEVEL[clampLv(level)];
export const BLOOD_TREADS_WIDTH_PX = 24;                       // §16-5判定叩き台(直径)
export const BLOOD_TREADS_RADIUS_PX = BLOOD_TREADS_WIDTH_PX / 2;
export const BLOOD_TREADS_TICK_MS = 250;                       // §16-5判定叩き台
// ★未決(B7実装中): 棘の「設置間隔」(トレイルの密度)は§28-2/§16-5に数値指定が無い。
// tick間隔(250ms)を流用して1本化(安全側=既存tick値の再利用で新しい数値を発明しない)。
export const BLOOD_TREADS_SPAWN_INTERVAL_MS = 250;
// per-tickダメージはdps(小数にしない・molotovのMOLOTOV_DOT_DAMAGE=flat方式を踏襲)。
// ★未決: tick(250ms=4回/秒)×dps(flat)なので、敵が棘に居座り続けた場合の実効DPSはラベルの
// 「秒2/3/4」の約4倍(8/12/16)になる。ラベルとの整合は設計チャットの数値確認待ち。

// ---- ボムカウンター追加(§28-1): カウンター成立時の自分中心爆発を大爆発に(半径×1.8=叩き台・全Lv) ----
export const BOMB_COUNTER_SELF_BLAST_RADIUS_MULT = 1.8;
