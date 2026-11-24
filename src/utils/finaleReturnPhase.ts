// 帰還フェーズ(城跡の帰還サークル)を出すかの判定(useGameLoop の「帰還フェーズ」から切り出した純関数)。
// フィナーレボス撃破(finaleDefeated)で城跡付近に帰還サークルを出す。ただしストーリーボス専用ラン
// (storyBossMode=ステージ7のグレン)は、撃破後の会話が終わったら帰還サークルなしで直接クリアへ進む
// (社長指示2026-11-24「ステージ7、帰還サークル出さずに、会話終了と共にエンディングへ」)ので出さない。
export interface FinaleReturnPhaseInput {
  finaleDefeated: boolean;
  hasReturnCircle: boolean;
  gameWon: boolean;
  storyBossMode: boolean;
}

export const shouldBeginFinaleReturnPhase = (s: FinaleReturnPhaseInput): boolean =>
  s.finaleDefeated && !s.hasReturnCircle && !s.gameWon && !s.storyBossMode;
