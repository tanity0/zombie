/**
 * 経験値の玉の上限(社長指示2026-10-24「上限越えたら消そう」)。
 *
 * 経験値の玉は拾わないと倒した場所に残り続け、長く遊ぶほど溜まっていた(調査メモ research/CODE_AUDIT_2026-10-23_SIM.md S-1)。
 * 上限を超えたら、**プレイヤーからいちばん遠い玉から**消す(画面に映っている玉が目の前で消えないように)。
 * 消すのは経験値の玉だけ。弾・回復・コイン・箱などの拾い物は数が少なく価値があるので対象外。
 */
export const XP_PICKUP_CAP = 150;

export interface CapPickup { id: string; x: number; y: number; type: string }

/** 上限を超えた分の経験値の玉の id(遠い順)。超えていなければ空。 */
export const xpPickupsOverCap = (
  pickups: readonly CapPickup[], playerCx: number, playerCy: number, cap: number = XP_PICKUP_CAP,
): string[] => {
  let n = 0;
  for (const p of pickups) if (p.type === 'experience') n++;
  if (n <= cap) return [];
  const xs = pickups.filter(p => p.type === 'experience')
    .map(p => ({ id: p.id, d: (p.x - playerCx) ** 2 + (p.y - playerCy) ** 2 }))
    .sort((a, b) => b.d - a.d);
  return xs.slice(0, n - cap).map(e => e.id);
};
