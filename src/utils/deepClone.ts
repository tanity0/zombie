// 数値テーブルのディープコピー(v0.25.2849・ボスメーカーの切り分けで `bossTuning.ts` から切り出した)。
//
// 切り出した理由: `bossTuning.ts`(欄の台帳)は**ボスメーカー専用**で `src/tools/bossmaker/` へ
// 移したが、この関数だけは**ゲーム側**(`idolScript.ts`)も使う。ゲームが道具を import すると
// 「道具を落とす」切り分けが成立しないので、共有部品としてここへ置く(BOSS_MAKER.md §19-4)。
//
// 対象は「数値/文字列/真偽/配列/プレーンオブジェクト」のみ。チューニング表はこの範囲で作る。

/** 深いクローン(数値/文字列/真偽/配列/プレーンオブジェクトのみ。テーブルはこの範囲で作る)。 */
export const deepCloneTuning = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map(deepCloneTuning) as unknown as T;
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = deepCloneTuning(val);
    return out as T;
  }
  return v;
};
