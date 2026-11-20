// ★プレイヤーも浮かせる攻撃で浮く(research/BRAWLER.md §36-0・社長指示2026-11-20「まずプレイヤーも攻撃されるとちゃんと浮くようにして
// スーパーアーマー発動時は除外」)。雑魚と同じ規則(高さ・時間・拾える予算=雑魚の値・brawlerJugglePush)。純関数(store/PixiJS 非依存)。
import { brawlerJugglePush, brawlerAirborne, type BrawlerJuggleFields } from './brawlerCombo';
import type { BrawlerMoveKey } from './brawlerTypes';

/**
 * 当たった浮かせる技の後のプレイヤーの浮き。armored=その当たりをスーパーアーマーで耐えた(浮かない)。
 * 浮かない当たり(地上で打ち上げない技・ダウン中など)は null(今の浮きのまま)。
 */
export const playerLaunchPatch = (
  air: BrawlerJuggleFields | undefined, move: BrawlerMoveKey, now: number, armored: boolean,
): BrawlerJuggleFields | null => {
  if (armored) return null;
  const jp = brawlerJugglePush(air ?? {}, 'mob', move, now);
  if (!jp || (jp.brLiftUntil ?? 0) <= now) return null;
  return { ...(air ?? {}), ...jp };
};
/** 浮いている(=動けない・攻撃できない)か。 */
export const playerAirLocked = (p: { brAir?: BrawlerJuggleFields }, now: number): boolean => !!p.brAir && brawlerAirborne(p.brAir, now);
