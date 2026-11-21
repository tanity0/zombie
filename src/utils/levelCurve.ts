// レベルアップの必要経験値カーブ。**この式の正本はここ1箇所**。
//
// 経緯(v0.25.3137): 「宝箱で3レベルアップ」を足すにあたり、レベルアップを**外から任意回数**
// 起こす必要が出た。ゲームは「経験値がしきい値を超えたらレベルアップ」で回っているので、
// 3回ぶん超えるだけの経験値を積むのが素直な方法——ただしそのためにカーブの式を呼び出し側へ
// 書き写すと、**同じ値を2箇所に持つ**(TEST_DESIGN.md 型A)になり、片方を直した時に必ずズレる。
// ⇒ 式を純関数にして gameStore.levelUp とここの両方から読む。
//
// 元の式(gameStore.levelUp のインライン実装・挙動は1ビットも変えていない):
//   stepLinear = newLevel < 10 ? 2 : 0
//   next = floor(prev * (newLevel < 10 ? 1.1 : 1.18) + stepLinear)

/** レベルが `newLevel` になった時の「次のレベルまでの必要経験値」。`prev` は直前のしきい値。 */
export const nextLevelThreshold = (newLevel: number, prev: number): number =>
  Math.floor(prev * (newLevel < 10 ? 1.1 : 1.18) + (newLevel < 10 ? 2 : 0));

/**
 * 今の状態から**ちょうど `levels` 回レベルアップさせる**のに足りない経験値。
 * ゲーム側は「超えたら1回上がる → 余剰は繰り越す」で回るので、**この量を足せば**
 * メニューが `levels` 回続けて出る(1回ぶんずつ選ばせる=「3レベルアップ」の意味どおり)。
 *
 * 端数の扱い: しきい値に**ちょうど届いた時点で発動**する実装(`experience >= experienceToNextLevel`)に
 * 合わせ、超過は足さない=**余計なレベルアップを1回も起こさない**。
 */
export const expNeededForLevels = (
  experience: number,
  experienceToNextLevel: number,
  level: number,
  levels: number,
): number => {
  let exp = experience;
  let thr = experienceToNextLevel;
  let lv = level;
  let need = 0;
  for (let i = 0; i < Math.max(0, Math.floor(levels)); i++) {
    if (exp < thr) { need += thr - exp; exp = thr; } // しきい値まで底上げ
    exp -= thr;                                      // 1回ぶん消費(繰り越しは残す)
    lv += 1;
    thr = nextLevelThreshold(lv, thr);
  }
  return need;
};
