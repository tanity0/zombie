// ステージ1の「最初の守護霊」は猛者の中からそのボスの1位(STAGE1_FIRST_LOOP.md §7.8・社長 2026-11-19
// 「ステージ１で初めて出てくる守護霊は猛者の中からその分野の1位で」→「分野というかボス」)。
//
// 対象の召喚=守護霊のチュートリアルと組になる1回(1周目=賞金首 / 2周目以降=最初の賞金首か城ボス)。
// その1回だけ、同行者(ロック中は自分の守護霊)の代わりに「そのボスの猛者1位」を呼ぶ。以後の召喚は従来どおり。
// この層は純関数だけ(store/React/PixiJS 非依存)。配線は directorTick.runGhostAndTraitsStep が読むだけ。
import type { EnemyType } from '../types/game';
import { bossStyleSlotKey } from './ghostSlot';
import { BOUNTY_ENEMY_TYPES, isBountyType } from './enemyUtils';
import { stage1GuardianTutorialDue, type GuardianBoundKind } from './stage1FirstLoop';
import {
  FIXED_GUARDIAN_BOSS_SLOT_ORDER, fixedGuardianLeadersForBoss, strongestGuardian, type FixedGuardian,
} from '../data/fixedGuardians';

/** 守護霊が紐付く相手の区分(useGameLoop の guardianBoundKindNow と同じ分け方)。 */
export const guardianBoundKindOfType = (type: EnemyType): GuardianBoundKind =>
  isBountyType(type) ? 'bounty' : type === 'giantbat' ? 'castle' : 'other';

/**
 * この召喚が「ステージ1の最初の守護霊」か。守護霊のチュートリアルを出す条件(stage1GuardianTutorialDue)と
 * 同じ条件を、召喚する瞬間に紐付け先の区分で評価する=チュートリアルと組になる1回だけが真。
 */
export const isStage1FirstGuardianSummon = (i: {
  firstLoop: boolean; locked: boolean; seen: boolean; queued: boolean; bossMaker: boolean; bossType: EnemyType;
}): boolean => !i.bossMaker && stage1GuardianTutorialDue({
  firstLoop: i.firstLoop, locked: i.locked, seen: i.seen, queued: i.queued, boundKind: guardianBoundKindOfType(i.bossType),
});

/**
 * ロック中(またはステージ1の1周目)の出撃で、オンラインの「1位」を先に取っておくスロット。
 * チュートリアルと組になる相手=城ボスと賞金首(4型のどれが来るかは出るまで分からない=全部)。
 */
export const stage1BestGuardianSlots = (stageId: string): string[] =>
  [bossStyleSlotKey('giantbat', stageId), ...[...BOUNTY_ENEMY_TYPES].map(t => bossStyleSlotKey(t, stageId))];

/**
 * 固定の先人守護霊に「そのボスの上位」(守護霊部屋の「AIデータ 上位4人」)があるか。
 * 賞金首は守護霊部屋に出ない(FIXED_GUARDIAN_BOSS_SLOT_ORDER にも無い)=見せているボス別の順位が無い→最強の1体。
 * それ以外のボスは fixedGuardianLeadersForBoss が必ず上位4人を返す(並びに無いスロットも決定的な組へ割り当てる)。
 */
export const hasFixedBossRanking = (slotKey: string): boolean =>
  FIXED_GUARDIAN_BOSS_SLOT_ORDER.includes(slotKey) || !BOUNTY_ENEMY_TYPES.has(slotKey as EnemyType);

/** そのボスの固定の先人守護霊の1位。ボス別の上位が無い相手(賞金首)は最強の1体。 */
export const stage1BestFixedGuardian = (slotKey: string, hasBossRanking: boolean): FixedGuardian =>
  hasBossRanking ? fixedGuardianLeadersForBoss(slotKey)[0] ?? strongestGuardian() : strongestGuardian();

export type Stage1BestGuardianChoice<R> = { kind: 'remote'; candidate: R } | { kind: 'fixed'; guardian: FixedGuardian };

/**
 * 猛者(討伐者の母集団=オンライン実プレイヤー+そのボスの固定上位)の中の1位を決める。
 * - オンラインの1位が取れていれば、固定の1位の score(同じ式: 60×(3×カウンター率−2×被弾率)−クリア秒)と比べ、高い方。
 *   同点はオンライン(実プレイヤー)。オンライン側の perf が無い(旧サーバ)時はオンラインを採る。
 * - オンラインが無い(オフライン・同意なし・そのボスの候補0)時は固定の1位。
 */
export const pickStage1BestGuardian = <R extends { perf?: number | null }>(i: {
  slotKey: string;
  hasBossRanking: boolean;
  online: R | null;
}): Stage1BestGuardianChoice<R> => {
  const fixed = stage1BestFixedGuardian(i.slotKey, i.hasBossRanking);
  if (i.online) {
    const perf = i.online.perf;
    if (typeof perf !== 'number' || !Number.isFinite(perf) || perf >= fixed.performance.score) {
      return { kind: 'remote', candidate: i.online };
    }
  }
  return { kind: 'fixed', guardian: fixed };
};
