// 刀のオート斬撃(KATANA_SLASH_INTERVAL_MS ごとに1体斬る)の標的選択。
// useGameLoop にインラインで書かれていた選択ロジックを、**主語(プレイヤー/守護霊)に依存しない
// 純関数**として切り出したもの(research/GHOST_PARITY_LEDGER.md 裁定2=刀は共有方式・
// CLAUDE.md 実装精度の規律4「配線ロジックは純関数に切り出してテスト」)。
//
// 掟: 優先順位・射程の扱いは元コードから1つも変えていない。
//  - 距離は enemyMeleeDist(裏ボスは帯AABBの最近点)を注入して使う(gameStore依存を持たないため引数)。
//  - 自動射撃と同じ優先順位: **スタン中の敵は後回し**(最後の手段=一閃のフィニッシュ余地を残す)。
//  - 通常リーパー(reaperChaser でない reaper)は対象外。
import type { Enemy } from '../types/game';
import { isCorpse, isReaperFamily, isTerminalReaper } from './enemyUtils';

export const pickKatanaSlashTarget = (
  cx: number,
  cy: number,
  rangePx: number,
  enemies: readonly Enemy[],
  gameTime: number,
  meleeDist: (px: number, py: number, e: Enemy) => number,
): string | null => {
  let best: { id: string; d2: number } | null = null;
  let bestStunned: { id: string; d2: number } | null = null;
  for (const e of enemies) {
    if (isReaperFamily(e.type) && !isTerminalReaper(e)) continue;
    if (isCorpse(e)) continue; // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-2): オート斬撃の標的から除外
    const d = meleeDist(cx, cy, e);
    if (d > rangePx) continue;
    const d2 = d * d;
    const stunned = e.stunUntil !== undefined && gameTime < e.stunUntil;
    if (stunned) {
      if (!bestStunned || d2 < bestStunned.d2) bestStunned = { id: e.id, d2 };
    } else if (!best || d2 < best.d2) {
      best = { id: e.id, d2 };
    }
  }
  return (best ?? bestStunned)?.id ?? null;
};
