// ファストトラベル(research/FAST_TRAVEL.md・社長指示2026-10-13)の純関数。
// 行き先=ショップを開ける場所すべて(武器商人+解放済みの拠点)。研究所の遠隔ショップは行き先を持たない(商人が居ない)。
// store・UI の両方がこの1本を引く(行き先の決め方を2箇所に持たない)。
import { baseDirectionLabel } from './escortOffscreen';

export interface TravelDestination {
  id: string;           // 'merchant' | 'base-0'..'base-3'
  label: string;        // 「武器商人」「東部拠点」…
  arriveX: number;      // 着く地点(プレイヤーの中心)
  arriveY: number;
  current: boolean;     // 今いる場所(押せない)
  baseId: string | null;
}

/** 着く地点を、ショップがまた開く円(武器庫/商人の会話の円)の少し外=下側に置く距離(px)。 */
export const TRAVEL_ARRIVE_GAP_PX = 34;

export interface TravelInput {
  player: { x: number; y: number };                    // 中心
  merchant: { x: number; y: number; radius: number } | null; // 姿を見せていない時は null
  bases: readonly { id: string; x: number; y: number; status: string }[];
  armoryRadius: number;
  baseRadius: number;                                  // 拠点の円(ここに居れば「今いる場所」)
}

export const listTravelDestinations = (i: TravelInput): TravelDestination[] => {
  const out: TravelDestination[] = [];
  if (i.merchant) {
    const m = i.merchant;
    out.push({
      id: 'merchant', label: '武器商人', baseId: null,
      arriveX: m.x, arriveY: m.y + m.radius + TRAVEL_ARRIVE_GAP_PX,
      current: Math.hypot(i.player.x - m.x, i.player.y - m.y) <= m.radius + TRAVEL_ARRIVE_GAP_PX + 40,
    });
  }
  // 並び=東→南→西→北(base-0..3)。未解放は出さない。
  const order = [...i.bases].sort((a, b) => a.id.localeCompare(b.id));
  for (const b of order) {
    if (b.status !== 'captured') continue;
    out.push({
      id: b.id, label: `${baseDirectionLabel(b.x, b.y)}拠点`, baseId: b.id,
      arriveX: b.x, arriveY: b.y + i.armoryRadius + TRAVEL_ARRIVE_GAP_PX,
      current: Math.hypot(i.player.x - b.x, i.player.y - b.y) <= i.baseRadius,
    });
  }
  // 行き先が「今いる場所」だけなら、移動先は無い(=タブを出さない)。
  return out;
};

/** 「移動」タブを出すか: 今いる場所以外に行き先が1つ以上ある時だけ。 */
export const hasTravelTargets = (list: readonly TravelDestination[]): boolean => list.some(d => !d.current);
