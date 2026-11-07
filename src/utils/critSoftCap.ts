// PACING_PUZZLE.md §13-3d(★未決 #9・社長裁定2026-08-26「はい」): クリ率の**ソフトキャップ**。
//
// 社長指摘「キャップを設けるのは嘘にならないか」への答え=**ハードキャップは嘘になる**。
// 装備の説明(「クリ率 +15%」)・スキルの説明(「近接クリ率+20%」)がクリ率を**数値で明示している**ため、
// 上限で頭打ちにすると「+20%」の実効が0pt=**書いてある数字が効かない**。
//
// よってソウル系の文法(ステータス補正のソフトキャップ=**止まるのではなく鈍る**)を採る:
//   - KNEE(30%)までは**素通し**=これまでと1ptも変わらない。
//   - 超えた分は指数で鈍り、CEIL(50%)へ**漸近する**(到達しない)。
//   ⇒ どの「+X%」も必ず実効を押し上げる(0にならない)=嘘にならない。同時に「ほぼ確定クリ」が消える。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能。
// 近接(gameStore.meleeHitCritChance)と銃(useGameLoop の着弾ロール)が**同じこの1本**を通る。

export const CRIT_SOFT_CAP_KNEE = 0.30; // ここまでは素通し(序盤〜中盤は無傷)
export const CRIT_SOFT_CAP_CEIL = 0.50; // 漸近する天井。**到達しない**(=100%クリが消える)

// 積み上げの合計(=これまでどおり全項を単純加算した値)を、実効クリ率へ変換する。
// 単調増加・連続・KNEE以下は恒等・常に < CEIL。
export const softCapCritChance = (sum: number): number => {
  const s = Math.max(0, sum);
  if (s <= CRIT_SOFT_CAP_KNEE) return s;
  const span = CRIT_SOFT_CAP_CEIL - CRIT_SOFT_CAP_KNEE;
  return CRIT_SOFT_CAP_KNEE + span * (1 - Math.exp(-(s - CRIT_SOFT_CAP_KNEE) / span));
};

// 独立した2つの確率の「どちらか当たる」を1つの確率へ合成する(= 1-(1-a)(1-b))。
// §13-3d: 銃の旧実装は基礎/トラップ/弱点を**独立3ロールのOR**で判定していた。ソフトキャップは
// 「合成後の実効値」に掛けたいので1つへまとめる必要があり、この式は**ORと数学的に同一**なので
// ソフトキャップに掛からない範囲では確率が1ptも変わらない(挙動不変で移行できる)。
export const orCombineChance = (a: number, b: number): number => 1 - (1 - a) * (1 - b);
