// PACING_PUZZLE.md §6.28-4 バッチM53: ミゲル(stage-1 ゲート2)の技選択=純関数。
// 「間合いから次の技を選ぶ」判断ロジック(実装精度の規律4)。レンダラ非依存・store非依存
// (angelBossTick.ts からのみ import される。逆import禁止=循環回避、giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-4 を参照。

export type MiguelMove = 'volley' | 'harai' | 'dash';

// 斬り系(harai→tate)を出せる距離(既存 HARAI_TRIGGER_DIST と同値=angelBossTick.ts側で共有)。
export const MIGUEL_HARAI_TRIGGER_DIST = 250;

// ≤250pxの時、弾3連(volley)を選ぶ確率(既存 MIGUEL_VOLLEY_CHANCE と同値)。残りは横払い(harai)。
export const MIGUEL_VOLLEY_CHANCE = 0.6;

// §6.28-4「#4 踏み込みを足す理由」: >250pxかつdashReadyの時、弾ではなく踏み込みを選ぶ確率。
// 設計書はdashの発生条件のみを定め、volleyとの配分比までは明記していない(★未決事項に記録)。
// ≤250側の配分(volley 60% / harai 40%)と対称になるよう、同じ MIGUEL_VOLLEY_CHANCE から
// 導出する(新しい確率を発明しない=既存値の再利用)。
export const MIGUEL_DASH_CHANCE = 1 - MIGUEL_VOLLEY_CHANCE; // 0.4

// chase中の技選択(既存スケジューラと同じ「等確率」ではなく重み付き=現行 volley/harai の配分をそのまま継承)。
export const pickMiguelMove = (
  distance: number,
  dashReady: boolean,
  rand: () => number = Math.random,
): MiguelMove => {
  if (distance <= MIGUEL_HARAI_TRIGGER_DIST) {
    return rand() < MIGUEL_VOLLEY_CHANCE ? 'volley' : 'harai';
  }
  if (dashReady && rand() < MIGUEL_DASH_CHANCE) return 'dash';
  return 'volley';
};

// §6.28-4 連携: 踏み込み(dash)の後、相手が250px以内に居れば確率100%で横払いへ直結する。
export const miguelDashFollowupEligible = (distanceAfterDash: number): boolean =>
  distanceAfterDash <= MIGUEL_HARAI_TRIGGER_DIST;
