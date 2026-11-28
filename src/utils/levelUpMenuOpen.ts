// LEVEL UP 演出の後に選択肢メニューを開くかの判定(useGameLoop から切り出した純関数・依存ゼロの葉)。
// 社長報告「たまにスタートしたら中身の無い『レベルアップ 強化を選んでください』の画面が出て止まる」:
// 選択肢が空のままメニューを開くと、選べる物が無いのに一時停止(upgrade)から抜けられなくなる。
// だから選択肢が空なら開かずに待ちを捨てる('drop')。
export type LevelUpIntroDecision = 'idle' | 'wait' | 'open' | 'drop';

export function decideLevelUpIntro(args: {
  introUntil: number;
  now: number;
  deliveryLocked: boolean;
  optionCount: number;
}): LevelUpIntroDecision {
  const { introUntil, now, deliveryLocked, optionCount } = args;
  if (introUntil <= 0) return 'idle';
  if (optionCount <= 0) return 'drop'; // 空の選択肢では開かない(待ちを残すと毎フレーム同じ判定になるだけ)
  if (now < introUntil || deliveryLocked) return 'wait'; // 演出中/納品ロック中は保留(従来どおり)
  return 'open';
}
