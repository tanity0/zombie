// research/SHIELD_BLOCK.md §8(盾の代償・社長 2026-10-18 訂正): 盾が技を防ぐと、防いだ相手の区分に応じて耐久が削れる。
//   ボス級(ステージのボス・裏ボス・終端の死神・賞金首・幻影・城ボス・使者・英雄/旗手)の技 = 1回防ぐごとに 10
//   強個体(パンプキン/削岩型/伐採人/研究所の大型/ハンター)・雑魚 = 0(削れない)
//   光線(壁): 光線が盾に当たっている間、毎秒 10(フレームの割合)。いまある光線は全部ボス級。
// 純関数(store/useGameLoop/各 Tick が同じ表を引く)。盾への接触ダメージ表(useGameLoop.shieldContactDamage)とは別の表。
import type { EnemyType } from '../types/game';
import { isBodyWallBoss, isHangedman, isTrueBossType } from './enemyUtils';

/** ボス級の技を1回防ぐごとに盾の耐久が削れる量。 */
export const SHIELD_GUARD_COST_BOSS = 10;
/** 光線が盾に当たっている間、毎秒削れる量(フレームの割合で減らす)。 */
export const SHIELD_BEAM_DRAIN_PER_SEC = 10;
/** 1フレームに掛ける時間の上限(秒)。一時停止明けの巨大な dt で一気に割れないように。 */
export const SHIELD_BEAM_DRAIN_DT_MAX = 0.05;

/** ボス級か(ステージのボス・裏ボス・終端/死神・賞金首・幻影・城ボス・使者・英雄/旗手)。 */
export const isShieldChipAttacker = (type: EnemyType | undefined): boolean =>
  type !== undefined && (isTrueBossType(type) || type === 'giantbat' || isBodyWallBoss(type) || isHangedman(type));

/** 技を1回防いだ時に削れる耐久。ボス級=10 / 強個体・雑魚・不明=0。 */
export const shieldGuardCostFor = (type: EnemyType | undefined): number =>
  isShieldChipAttacker(type) ? SHIELD_GUARD_COST_BOSS : 0;

/** 光線が盾に当たった1フレームで削れる耐久(dtSec は上限で切る)。ボス級でなければ 0。 */
export const shieldBeamDrainFor = (type: EnemyType | undefined, dtSec: number): number =>
  isShieldChipAttacker(type) ? SHIELD_BEAM_DRAIN_PER_SEC * Math.max(0, Math.min(SHIELD_BEAM_DRAIN_DT_MAX, dtSec)) : 0;
