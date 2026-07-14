// M26-L(実機オートパイロット・PACING_PUZZLE.md §6.3)/ M26 Step1(ヘッドレス成長ループ)共用:
// ボットのレベルアップ自動選択ポリシー。叩き台=一様ランダム。シード付き決定的乱数(mulberry32)で
// 再現性を確保する(Math.random 直呼びは仕様で禁止=同シード同ランで同じ選択列になること)。
// 純関数(store/React非依存)=ユニットテスト可能(実装精度の規律4)。

// 標準的な mulberry32 PRNG。同じ seed からは常に同じ数列([0,1))を返す。
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// options から1つ選ぶ(一様ランダム・叩き台)。空配列は呼び出し側でガードする前提
// (showUpgradeMenu && upgradeOptions.length > 0 の時だけ呼ぶ)。境界は防御的にクランプ。
export const pickUpgrade = <T>(options: readonly T[], rand: () => number): T =>
  options[Math.min(options.length - 1, Math.max(0, Math.floor(rand() * options.length)))];
