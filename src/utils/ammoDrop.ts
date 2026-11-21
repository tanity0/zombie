// PACING_PUZZLE.md §5.5 バッチM5(RE4式・社長採用v0.25.1379): キル時弾薬ドロップの弾種選び。
// 「欠乏の演出はするが実質枯渇させない」— 所持銃の弾種のうち残弾割合(リザーブ÷最大)が
// 最小のものを落とす。ドロップ率・総供給量には一切触れない(弾種の配分を変えるだけ)。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { AmmoType } from '../types/game';

export interface OwnedAmmoInfo {
  type: AmmoType;
  reserve: number; // 現在のリザーブ(プール)弾数
  max: number;     // AMMO_MAX[type]
}

// 所持弾種から「残弾割合が最小」の弾種を選ぶ。同率なら構えている銃(activeType)を優先し、
// それも同率グループに無ければ入力順の先頭。PHILL弾(研究所専用)は候補から除外(屋内はそもそも
// ドロップ無効・phillしか持たない場合はnull=呼び出し側が従来フォールバックする)。
export const pickAmmoDropType = (owned: OwnedAmmoInfo[], activeType: AmmoType | undefined): AmmoType | null => {
  const candidates = owned.filter(o => o.type !== 'phill' && o.max > 0);
  if (candidates.length === 0) return null;
  let minRatio = Infinity;
  for (const c of candidates) minRatio = Math.min(minRatio, c.reserve / c.max);
  const EPS = 1e-9; // 浮動小数の同率判定(72分率と24分率の比較等)
  const lowest = candidates.filter(c => c.reserve / c.max <= minRatio + EPS);
  const active = lowest.find(c => c.type === activeType);
  return (active ?? lowest[0]).type;
};

// ★ステージ2(研究所): PHILLガンの弾は敵やランダムドロップでは落ちない(社長指示2026-11-19
// 「ステージ２、PHILLガンの弾は敵やランダムドロップでは落ちない。」)。PHILL弾が手に入るのは道中の固定配置と商人だけ。
// 敵の撃破(弾・近接)・壊せる小物・空からの補給の弾種を決めた**最後**にこれを通す。
// noPhill=false(研究所以外)なら type をそのまま返す(1bitも変えない)。
// type が phill なら、所持弾種のうち phill 以外(並び順の先頭)へ置き換える。無ければ null(=落とさない)。
export const dropAmmoTypeWithoutPhill = (
  type: AmmoType | null | undefined, owned: readonly AmmoType[], noPhill: boolean,
): AmmoType | null => {
  if (!type) return null;
  if (!noPhill || type !== 'phill') return type;
  return owned.find(t => t !== 'phill') ?? null;
};
