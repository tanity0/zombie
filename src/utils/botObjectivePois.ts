// v0.25.3052: ボットの目的層(botObjective)へ渡す「寄り道POI」の詰め替え。
//
// なぜ別ファイルか: `botObjective.ts` は **store も world 定数も知らない純関数層**(同ファイル冒頭の掟)。
// 一方この詰め替えは world の半径/費用を要る。両方を知ってよい薄い橋渡しをここに置き、
// **実機(useGameLoop)とヘッドレス(playtestDriver)の両方が同じ関数を呼ぶ**ことで
// 「片方だけ直して挙動がズレる」事故(CLAUDE.md「同じ動作を持つ全員に付ける」)を防ぐ。
import { ARMORY_CIRCLE_RADIUS, ARMORY_SCRAP_COST } from '../world/armory';
import { HOSPITAL_CIRCLE_RADIUS } from '../world/hospital';
import { POLICE_ARENA_RADIUS } from '../world/police';

/** 詰め替えに必要な store の断片だけを要求する(store 型そのものには依存しない)。 */
export interface PoiSourceState {
  hospital: { x: number; y: number } | null;
  hospitalTaken: boolean;
  armory: { x: number; y: number } | null;
  armoryTaken: boolean;
  police: { x: number; y: number } | null;
  policeTaken: boolean;
}

export type BotObjectivePoi = {
  kind: 'armory' | 'hospital' | 'police';
  x: number; y: number; taken: boolean; radius: number; cost?: number;
};

/**
 * この出撃に存在するPOIだけを並べる(null=このステージには無い→出さない)。
 * - 病院/武器庫: サークルに**3秒留まる**と解放(campaign が hold を出す)。
 * - 警察署: 近づくと囲いイベントが起きる=留まるのではなく戦う(campaign は hold を出さない)。
 * - 武器庫だけ `cost` を持つ。払えない間は campaign が後回しにする。
 */
export const botObjectivePois = (s: PoiSourceState): BotObjectivePoi[] => {
  const out: BotObjectivePoi[] = [];
  if (s.hospital) out.push({ kind: 'hospital', x: s.hospital.x, y: s.hospital.y, taken: s.hospitalTaken, radius: HOSPITAL_CIRCLE_RADIUS });
  if (s.armory) out.push({ kind: 'armory', x: s.armory.x, y: s.armory.y, taken: s.armoryTaken, radius: ARMORY_CIRCLE_RADIUS, cost: ARMORY_SCRAP_COST });
  if (s.police) out.push({ kind: 'police', x: s.police.x, y: s.police.y, taken: s.policeTaken, radius: POLICE_ARENA_RADIUS });
  return out;
};
