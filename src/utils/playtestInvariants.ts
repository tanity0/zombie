// M9-C: デバッグボットの毎tick不変条件アサーション(PACING_PUZZLE.md §5.10)。
// 「バグの網」として検査項目ごとに文字列の違反理由を返す(投げない=呼び出し側が集計/レポートする)。
// 純関数寄り(呼び出し側がstoreスナップショット+前後の差分を渡す)。
//
// 既知のスコープ(playtestDriver.tsのコメントと同じ前提): puzzleActiveNow固定=true・レガシー
// イベント系(ハンター/レスキュー/紅き月/囲い/関所ライブ補正)は対象外。この網に掛からない
// バグの種類はENGINEERING_NOTES.mdに記載。

import type { Enemy, Player } from '../types/game';
import { ENEMY_REMOVE_CAUSE } from '../store/gameStore';
import type { KomaState } from './directorTick';
import type { PuzzleClockState } from './rankAssessor';

const finite = (n: number | undefined): boolean => n === undefined || Number.isFinite(n);

// M9-C-1: 敵の不正消滅なし。'cap'原因の消滅は画面内(=リサイクル境界の内側)であってはならない
// (M6追補2の回帰防止)。呼び出し側がcull直前の敵スナップショット(位置)とリサイクル境界矩形を渡す。
export interface CullRectSnapshot { centerX: number; centerY: number; halfW: number; halfH: number }
export const checkNoOnscreenCapRemoval = (
  removedIds: string[],
  positionsBefore: Map<string, { x: number; y: number; width: number; height: number }>,
  rect: CullRectSnapshot,
): string[] => {
  const violations: string[] = [];
  for (const id of removedIds) {
    if (ENEMY_REMOVE_CAUSE.get(id) !== 'cap') continue;
    const pos = positionsBefore.get(id);
    if (!pos) continue;
    const cx = pos.x + pos.width / 2, cy = pos.y + pos.height / 2;
    const outside = Math.abs(cx - rect.centerX) > rect.halfW || Math.abs(cy - rect.centerY) > rect.halfH;
    if (!outside) violations.push(`enemy ${id} was removed with cause='cap' while still on-screen`);
  }
  return violations;
};

// M9-C-2: §0.5違反なし。邪魔者/特別枠の投入間隔<3秒、または被弾直後1.5秒以内の投入はFAIL。
// 呼び出し側がkoma更新の前後で puzzleCdRef の各タイムスタンプを比較して渡す。
export interface SpawnCadenceSample {
  gameTime: number;
  lastHitAt: number;
  prevNuisanceSpawnAt: number; nextNuisanceSpawnAt: number;
  prevSpecialSpawnAt: number; nextSpecialSpawnAt: number;
}
const MIN_SLOT_INTERVAL_MS = 3000;
const POST_HIT_QUIET_MS = 1500;
export const checkSpawnCadence = (s: SpawnCadenceSample): string[] => {
  const violations: string[] = [];
  const nuisanceSpawned = s.nextNuisanceSpawnAt !== s.prevNuisanceSpawnAt;
  const specialSpawned = s.nextSpecialSpawnAt !== s.prevSpecialSpawnAt;
  if (nuisanceSpawned && s.prevNuisanceSpawnAt > 0 && s.nextNuisanceSpawnAt - s.prevNuisanceSpawnAt < MIN_SLOT_INTERVAL_MS) {
    violations.push(`nuisance spawn interval ${s.nextNuisanceSpawnAt - s.prevNuisanceSpawnAt}ms < ${MIN_SLOT_INTERVAL_MS}ms`);
  }
  if (specialSpawned && s.prevSpecialSpawnAt > 0 && s.nextSpecialSpawnAt - s.prevSpecialSpawnAt < MIN_SLOT_INTERVAL_MS) {
    violations.push(`special spawn interval ${s.nextSpecialSpawnAt - s.prevSpecialSpawnAt}ms < ${MIN_SLOT_INTERVAL_MS}ms`);
  }
  if ((nuisanceSpawned || specialSpawned) && s.gameTime - s.lastHitAt < POST_HIT_QUIET_MS) {
    violations.push(`nuisance/special spawned ${s.gameTime - s.lastHitAt}ms after last hit (< ${POST_HIT_QUIET_MS}ms quiet window)`);
  }
  return violations;
};

// M9-C-3(一部): 盤面不変条件。敵数の無制限な増殖が無いこと(社長裁定=画面内超過は湧き停止+
// 自然消化で収束、強制消去はしない=厳密な上限一致は主張しない。ここでは「暴走していない」だけを見る)。
// コマ順序(relax→harvest→normal→peak)崩れなし。処理待ち延長(elapsedMs)が上限+30秒を超えない。
const KOMA_ORDER: Record<KomaState['kind'], KomaState['kind']> = {
  relax: 'harvest', harvest: 'normal', normal: 'peak', peak: 'relax',
};
export const checkBoardInvariants = (
  enemies: Enemy[],
  koma: KomaState,
  prevKomaKind: KomaState['kind'] | null,
  komaBaseMs: number,
  komaExtensionMaxMs: number,
  runawayCeiling: number,
): string[] => {
  const violations: string[] = [];
  if (enemies.length > runawayCeiling) {
    violations.push(`enemy count ${enemies.length} exceeds runaway ceiling ${runawayCeiling}`);
  }
  if (prevKomaKind !== null && prevKomaKind !== koma.kind && KOMA_ORDER[prevKomaKind] !== koma.kind) {
    violations.push(`koma order broken: ${prevKomaKind} -> ${koma.kind} (expected ${KOMA_ORDER[prevKomaKind]})`);
  }
  if (koma.elapsedMs > komaBaseMs + komaExtensionMaxMs + 30000) {
    violations.push(`koma elapsedMs ${koma.elapsedMs} exceeds base+extension+30s grace (${komaBaseMs + komaExtensionMaxMs + 30000})`);
  }
  return violations;
};

// M9-C-4: 査定の整合。ランクは常に1..7の整数にクランプされていること
// (clampRankの回帰防止=既に構造的に保証されているはずだが実測でも確認する)。
export const checkRankClamp = (clock: PuzzleClockState): string[] => {
  const violations: string[] = [];
  if (!Number.isInteger(clock.rank) || clock.rank < 1 || clock.rank > 7) {
    violations.push(`puzzle rank ${clock.rank} out of [1,7] or non-integer`);
  }
  return violations;
};

// M9-C-5: 状態の健全性。NaN/Infinityなし・弾薬/ゴールドが負にならない・gameTime単調増加。
export const checkStateHealth = (
  player: Player, enemies: Enemy[], goldBalance: number, gameTime: number, prevGameTime: number,
): string[] => {
  const violations: string[] = [];
  if (!finite(player.x) || !finite(player.y) || !finite(player.health)) violations.push('player has non-finite field');
  if (player.ammoHandgun < 0 || player.ammoShotgun < 0 || player.ammoRifle < 0 || player.ammoPhill < 0) {
    violations.push('player ammo went negative');
  }
  if (player.straps < 0) violations.push('player straps went negative');
  if (goldBalance < 0) violations.push('goldBalance went negative');
  if (gameTime < prevGameTime) violations.push(`gameTime decreased (${prevGameTime} -> ${gameTime})`);
  for (const e of enemies) {
    if (!finite(e.x) || !finite(e.y) || !finite(e.vx) || !finite(e.vy) || !finite(e.health)) {
      violations.push(`enemy ${e.id} (${e.type}) has non-finite field`);
    }
  }
  return violations;
};
