// research/TELEGRAPH_FIXES.md N05「ゾンビの紫の追尾」: zrush の体当たり(開始から ZOMBIE_RUSH_BODY_SLAM_MS 未満・
// biteAt が立っていない間)の予告=体の前の紫の短い流星の印。描画(pixiScene)は位相をここから読むだけ。
// ★★赤い予告の4つの掟: ①流星(meteorPhase) ②停止 zpause(=溜め)の開始で出る ③体当たりが切れる時刻
//   (zrush開始+1600ms)ちょうどで消し切る ④体当たりが生きている間ずっと在る。
// 判定の述語は enemyBite.isZombieRushBodySlamNow を**そのまま**読む(印と判定が同じ関数で出入りする)。
import { meteorPhase } from './telegraphStyle';
import { isZombieRushBodySlamNow, ZOMBIE_RUSH_BODY_SLAM_MS, ZOMBIE_RUSH_MS_MIRROR } from './enemyBite';
import type { Enemy } from '../types/game';

/**
 * gameStore.ts の `ZOMBIE_PAUSE_MS`(1000ms=zpause の尺)の複製。循環 import 回避のため値を複製する
 * (enemyBite.ZOMBIE_RUSH_MS_MIRROR と同じ作法。一致は zombieRushMark.test.ts が gameStore の値と比べて固定)。
 */
export const ZOMBIE_PAUSE_MS_MIRROR = 1000;

/**
 * 消しの尺: 体当たりが切れる時刻の手前この尺から消しを進める(雑魚の線の残光 pixiScene.MOB_CUT_MS と同じ短い尺)。
 */
export const ZOMBIE_RUSH_MARK_ERASE_MS = 150;

/** 印の長さ=この先この秒数で進む距離(叩き台=設計書 N05「約0.25秒」)。 */
export const ZOMBIE_RUSH_MARK_LEAD_S = 0.25;

/**
 * 今の印の位相。null=印なし(zpause/zrush の外、または体当たりが生きていない=biteAt が立った・1600ms を越えた)。
 * - zpause: `meteorPhase((gameTime−zpause開始)/ZOMBIE_PAUSE_MS).p` で描き(消しは0)。
 * - zrush(体当たりが生きている間): 描き切ったまま(p=1)。切れる時刻の手前 ERASE から消しを進め、1600ms ちょうどで er=1。
 */
export const zombieRushMarkPhase = (
  e: Pick<Enemy, 'type' | 'aiPhase' | 'aiPhaseUntil' | 'biteAt'>, gameTime: number,
): { prog: number; erase: number } | null => {
  if (e.type !== 'zombie') return null;
  if (e.aiPhase === 'zpause') {
    if (e.biteAt !== undefined && e.biteAt > 0) return null;
    const start = (e.aiPhaseUntil ?? gameTime) - ZOMBIE_PAUSE_MS_MIRROR;
    return { prog: meteorPhase((gameTime - start) / ZOMBIE_PAUSE_MS_MIRROR).p, erase: 0 };
  }
  if (!isZombieRushBodySlamNow(e, gameTime)) return null;
  const start = (e.aiPhaseUntil ?? 0) - ZOMBIE_RUSH_MS_MIRROR;
  const el = gameTime - start;
  const eraseFrom = ZOMBIE_RUSH_BODY_SLAM_MS - ZOMBIE_RUSH_MARK_ERASE_MS;
  const erase = el <= eraseFrom ? 0 : Math.max(0, Math.min(1, (el - eraseFrom) / ZOMBIE_RUSH_MARK_ERASE_MS));
  return { prog: 1, erase };
};
