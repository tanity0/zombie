/**
 * ★ミーミルの歩き・攻撃・レーザーの絵の新旧切り替え(社長指示2026-11-19「**ミーミルの歩きと攻撃モーション差し替え
 * 見比べたいので、今のバージョンもとっといて**」)。**切り替えの窓口はここ1箇所**。
 *
 * - 既定 = **新しい絵**(`sprites/mimir-idle-v2.png` 13コマ / `sprites/mimir-attack-v2.png` 15コマ / `sprites/mimir-laser-v2.png` 15コマ)。
 * - `?mimirart=old` = **元の絵3枚**(`sprites/mimir-idle.png` 13コマ / `sprites/mimir-attack.png` 16コマ / `sprites/mimir-laser.png` 15コマ)。
 * 寸法・コマの割り付け・ずらしの新旧は `enemySheets.ts` の該当行がこの値を見て選ぶ。
 * ★依存を持たない葉のモジュール(`enemySheets.ts` から引かれるため、何も import しない)。
 */
export const MIMIR_ART_OLD: boolean =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mimirart') === 'old';
