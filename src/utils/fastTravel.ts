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
  attacked: boolean;    // 拠点が襲われている(攻撃者が居る)=行に「交戦中」・一覧の上へ
  hasMerchant: boolean; // 武器商人がこの拠点に居る(商人の行はこの拠点の行にまとめる)
}

/** 着く地点を、ショップがまた開く円(武器庫/商人の会話の円)の少し外=下側に置く距離(px)。 */
export const TRAVEL_ARRIVE_GAP_PX = 34;

export interface TravelInput {
  player: { x: number; y: number };                    // 中心
  merchant: { x: number; y: number; radius: number } | null; // 姿を見せていない時は null
  bases: readonly { id: string; x: number; y: number; status: string; attackerId?: string | null }[];
  armoryRadius: number;
  baseRadius: number;                                  // 拠点の円(ここに居れば「今いる場所」)
}

export const listTravelDestinations = (i: TravelInput): TravelDestination[] => {
  const out: TravelDestination[] = [];
  const captured = [...i.bases].filter(b => b.status === 'captured').sort((a, b) => a.id.localeCompare(b.id)); // 東→南→西→北
  // 武器商人が解放済みの拠点の円の中に居るなら、商人の行は出さずその拠点の行にまとめる(同じ場所を2行にしない)。
  // 半径0の商人は不在(世界の外へ退避した出撃)=行き先に出さない(納品監査A-1)。
  if (i.merchant && !(i.merchant.radius > 0)) i = { ...i, merchant: null };
  const merchantBase = i.merchant
    ? captured.find(b => Math.hypot(i.merchant!.x - b.x, i.merchant!.y - b.y) <= i.baseRadius) ?? null
    : null;
  if (i.merchant && !merchantBase) {
    const m = i.merchant;
    out.push({
      id: 'merchant', label: '武器商人', baseId: null, attacked: false, hasMerchant: true,
      arriveX: m.x, arriveY: m.y + m.radius + TRAVEL_ARRIVE_GAP_PX,
      current: Math.hypot(i.player.x - m.x, i.player.y - m.y) <= m.radius + TRAVEL_ARRIVE_GAP_PX + 40,
    });
  }
  for (const b of captured) {
    out.push({
      id: b.id, label: `${baseDirectionLabel(b.x, b.y)}拠点`, baseId: b.id,
      attacked: !!b.attackerId, hasMerchant: merchantBase?.id === b.id,
      arriveX: b.x, arriveY: b.y + i.armoryRadius + TRAVEL_ARRIVE_GAP_PX,
      current: Math.hypot(i.player.x - b.x, i.player.y - b.y) <= i.baseRadius,
    });
  }
  // 襲われている拠点を上へ(駆けつける判断を先に見せる)。それ以外は 武器商人→東→南→西→北 のまま。
  return out.map((d, k) => ({ d, k })).sort((a, b) => Number(b.d.attacked) - Number(a.d.attacked) || a.k - b.k).map(x => x.d);
};

/** 「移動」タブを出すか: 今いる場所以外に行き先が1つ以上ある時だけ。 */
export const hasTravelTargets = (list: readonly TravelDestination[]): boolean => list.some(d => !d.current);
