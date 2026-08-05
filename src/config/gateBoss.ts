// ゲート2ボス(天使6体)のステージ割り当ての**正本**(v0.25.2857)。
//
// 旧はこの表が `useGameLoop.ts` の中に private であり、`utils/bossTest.ts` が
// 「写した固定表(ズレたらテストが落ちる)」として**2本目**を持っていた。ボスラッシュ(§20-4)が
// 3本目を作る形になるので、ここへ1本化する(CLAUDE.md「写すな、共通化しろ」)。
import type { EnemyType } from '../types/game';

export const GATE2_BOSS_TYPE_BY_STAGE: Partial<Record<string, EnemyType>> = {
  'stage-1': 'miguel', 'stage-3': 'jibril', 'stage-4': 'rafi',
  'stage-5': 'uri', 'stage-6': 'suriel', 'stage-ex1': 'acrasiel',
};

/** ボス型 → そのボストが出るステージID(逆引き)。表に無い型は null。 */
export const stageIdForGateBoss = (bossType: EnemyType): string | null =>
  Object.entries(GATE2_BOSS_TYPE_BY_STAGE).find(([, t]) => t === bossType)?.[0] ?? null;
