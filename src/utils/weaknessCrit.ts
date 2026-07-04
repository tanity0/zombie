// PACING_PUZZLE.md §5.6 バッチM7(社長採用v0.25.1389): チャフ(基本セット3種)の武器弱点クリティカル。
// 序盤ダレの解消=「どれを何で倒すか」のマイクロ判断を作る。ご褒美のみ(ペナルティ・HP/ダメージ
// 倍率の変更は一切なし)。問題児・ボスは対象外(表に無い型は常に0)。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { EnemyType } from '../types/game';

export type WeaponKind = 'gun' | 'melee';

const WEAKNESS_CRIT_BONUS = 0.10;

// 社長確定値: バット=銃/スケルトン=近接/ゾンビ=銃。表に無い型(問題児・ボス等)は対象外。
const CHAFF_WEAKNESS: Partial<Record<EnemyType, WeaponKind>> = {
  bat: 'gun',
  skeleton: 'melee',
  zombie: 'gun',
};

export const weaknessCritBonus = (enemyType: EnemyType, weaponKind: WeaponKind): number =>
  CHAFF_WEAKNESS[enemyType] === weaponKind ? WEAKNESS_CRIT_BONUS : 0;
