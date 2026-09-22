// ★**シートを3区間に割ってコマを選ぶ**核(依存ゼロの葉)。
//
// ★なぜ1本にまとめるか(v0.25.4574): 跳ぶ技(しゃがむ/滞空/着地)と薙ぎ払い(溜め/薙ぎ/戻り)は、
// **絵の意味は違うが選び方は同じ**——「区間ごとに割り当てたコマ数を、その区間の進み具合(0..1)で
// 線形に引く。最後の区間が終わったら null」。片方に不変条件(境目でコマが飛ばない・全コマを1度は通る)を
// 積んでもう片方へ写さないと、**同じ穴を2つ持つ**ことになる。核を1本にして検査も1本にする。
//
// ★**尺は持たない。** どの区間が何msかは**判定側(store)が持っている時計**を呼び手が読む
// (`PUMPKIN_CROUCH_MS` / `LOGGER_SWEEP_WINDUP_MS` 等)。ここに尺を置くと
// 「絵は終わっているのに判定はまだ続いている」が起きる(赤い予告の掟③と同じ考え方)。
//
// ★**位相は線形。** 加減速は絵の側に描かれているので、ここで ease を重ねると二重になる。

/** 3区間それぞれのコマ数。先頭から順に並んでいる前提。 */
export type SectionCounts = readonly [number, number, number];

export const sectionsTotal = (c: SectionCounts): number => c[0] + c[1] + c[2];

/**
 * コマ番号を返す。`null` = このシートを出さない(立ち絵/歩きへ戻す)。
 *
 * @param counts 区間ごとのコマ数
 * @param index  いまどの区間か(0/1/2)
 * @param prog   その区間の進み具合 0..1。★**最後の区間だけは 1 を超えたら `null`**
 *               (=絵が終わった。途中の区間は行き過ぎても最後のコマで待つ——
 *               判定がまだその区間に居るのに絵だけ消えるのを防ぐ)
 */
export const sectionFrame = (
  counts: SectionCounts, index: 0 | 1 | 2, prog: number,
): number | null => {
  if (sectionsTotal(counts) <= 1) return null;
  const count = counts[index];
  if (count <= 0) return null;
  if (index === 2 && prog >= 1) return null;             // 最後の区間を出し切った
  const base = index === 0 ? 0 : index === 1 ? counts[0] : counts[0] + counts[1];
  const i = Math.floor(Math.max(0, Math.min(0.999999, prog)) * count);
  return base + Math.min(count - 1, Math.max(0, i));
};

/** ★中断(盾で弾かれる等)で「その区間の最後のコマ」に留めたい時の番号。 */
export const sectionLastFrame = (counts: SectionCounts, index: 0 | 1 | 2): number => {
  const base = index === 0 ? 0 : index === 1 ? counts[0] : counts[0] + counts[1];
  return Math.max(0, base + Math.max(0, counts[index] - 1));
};
