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
// ★**位相は既定で線形**(コマを等分に割る)。加減速は絵の側に描かれている前提。
//
// ★★**ただし「等分」が合わない絵がある**(社長指示2026-09-24「**次の部分が早く突いてるように見えるように、
// 速さを調整してください。普通に流すと突きがゆったりしてると思います**」)。
// 削岩型の突きのシートは**同じ姿勢のコマが4枚並ぶ「溜めの間」**を持っていて、等分で流すと
// **溜めも突きも同じ速さ**になり、突きが伸びない。⇒ **コマごとに「表示の長さの比」を持てる**ようにする
// (`weights`。省略すると従来どおり等分)。
// ★**区間の境目は動かない**(重みは区間の**中**だけを配り直す)ので、
// **掟③(消え切る時刻=当たる時刻=薙ぎ/突き区間の先頭コマ)は重みを入れても保たれる。**

/** 3区間それぞれのコマ数。先頭から順に並んでいる前提。 */
export type SectionCounts = readonly [number, number, number];

export const sectionsTotal = (c: SectionCounts): number => c[0] + c[1] + c[2];

/**
 * ★コマごとの**表示の長さの比**(シート全体のコマ数ぶん・省略すると等分)。
 * 比なので単位は無い——`[1,1,4]` なら3枚目が他の4倍長く出る。**尺は持たない**(区間の尺は判定側)。
 */
export type SectionWeights = readonly number[];

/** 重み付きで「いまどのコマか」を引く。`w` が空/合計0なら等分に落ちる。 */
const weightedIndex = (w: SectionWeights, prog: number): number => {
  const n = w.length;
  if (n <= 0) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, w[i]);
  if (!(total > 0)) return Math.min(n - 1, Math.max(0, Math.floor(prog * n)));
  const t = Math.max(0, Math.min(0.999999, prog)) * total;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += Math.max(0, w[i]);
    if (t < acc) return i;
  }
  return n - 1;
};

/**
 * コマ番号を返す。`null` = このシートを出さない(立ち絵/歩きへ戻す)。
 *
 * @param counts 区間ごとのコマ数
 * @param index  いまどの区間か(0/1/2)
 * @param prog   その区間の進み具合 0..1。★**最後の区間だけは 1 を超えたら `null`**
 *               (=絵が終わった。途中の区間は行き過ぎても最後のコマで待つ——
 *               判定がまだその区間に居るのに絵だけ消えるのを防ぐ)
 * @param weights シート全体のコマごとの表示の長さの比(省略=等分)。
 *                長さがコマ数と違う時は**使わない**(等分へ落ちる)=表を書き間違えても絵が飛ばない。
 */
export const sectionFrame = (
  counts: SectionCounts, index: 0 | 1 | 2, prog: number, weights?: SectionWeights,
): number | null => {
  const total = sectionsTotal(counts);
  if (total <= 1) return null;
  const count = counts[index];
  if (count <= 0) return null;
  if (index === 2 && prog >= 1) return null;             // 最後の区間を出し切った
  const base = index === 0 ? 0 : index === 1 ? counts[0] : counts[0] + counts[1];
  const w = weights !== undefined && weights.length === total
    ? weights.slice(base, base + count) : null;
  const i = w !== null
    ? weightedIndex(w, prog)
    : Math.floor(Math.max(0, Math.min(0.999999, prog)) * count);
  return base + Math.min(count - 1, Math.max(0, i));
};

/** ★中断(盾で弾かれる等)で「その区間の最後のコマ」に留めたい時の番号。 */
export const sectionLastFrame = (counts: SectionCounts, index: 0 | 1 | 2): number => {
  const base = index === 0 ? 0 : index === 1 ? counts[0] : counts[0] + counts[1];
  return Math.max(0, base + Math.max(0, counts[index] - 1));
};
