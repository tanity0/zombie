// v0.25.3052: ボットの目的層(botObjective)へ渡す「寄り道POI」の詰め替え。
//
// なぜ別ファイルか: `botObjective.ts` は **store も world 定数も知らない純関数層**(同ファイル冒頭の掟)。
// 一方この詰め替えは world の半径/費用を要る。両方を知ってよい薄い橋渡しをここに置き、
// **実機(useGameLoop)とヘッドレス(playtestDriver)の両方が同じ関数を呼ぶ**ことで
// 「片方だけ直して挙動がズレる」事故(CLAUDE.md「同じ動作を持つ全員に付ける」)を防ぐ。
import { ARMORY_SCRAP_COST } from '../world/armory';

/**
 * ★社長指示2026-11-02「poi全部、オブジェクトの絵に下から触れると発動」(research/POI_TOUCH_SHRINE.md §1/§3 A4):
 * 3種とも**建物の足元(下端)に正面から触れた瞬間**に発動する。ボットの目的地は建物の土台の**内側**(足元から上へ)に置く。
 * steerTo は目的地の ARRIVE_DIST(70)手前で止まるので、足元ちょうどを狙うと触れる前に止まってしまう(監査A4)。
 * 内側の点を狙えば、南から来たボットは土台に押し付けられて(当たり判定で止まり)そのまま触れる。
 * radius=0 = 「円の中で留まる」を使わない(触れれば発動する)。
 */
export const POI_TOUCH_TARGET_INSET = 60;

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
 * - 3種とも: 建物の入口に正面から触れると発動(旧: 病院/武器庫=円に3秒・警察署=囲いの円に入る)。
 * - 警察署は触れた後に囲いが起きる=①の arenaPlan が引き取る。
 * - 武器庫だけ `cost` を持つ。払えない間は campaign が後回しにする。
 */
export const botObjectivePois = (s: PoiSourceState): BotObjectivePoi[] => {
  const out: BotObjectivePoi[] = [];
  const at = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - POI_TOUCH_TARGET_INSET });
  if (s.hospital) out.push({ kind: 'hospital', ...at(s.hospital), taken: s.hospitalTaken, radius: 0 });
  if (s.armory) out.push({ kind: 'armory', ...at(s.armory), taken: s.armoryTaken, radius: 0, cost: ARMORY_SCRAP_COST });
  if (s.police) out.push({ kind: 'police', ...at(s.police), taken: s.policeTaken, radius: 0 });
  return out;
};
