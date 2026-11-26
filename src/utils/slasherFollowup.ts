// ★スラッシャーの追い打ち(社長指示2026-11-26「刀は一閃、燕返しが自動連撃になる 0.1秒で入る。格闘はそれで。早く追加連撃が入る。
// 鞭は刀と同じく一撃ごとに追加の連撃が瞬時に入る。つまりどれも入力は増えないイメージ。で、近接もこれにする」)。
// 判定だけを置く純関数(store にも描画にも依存しない)。数値は叩き台。
//  - 近接の一撃(ナイフの各段・刀の一閃/燕返し・格闘の各段・鞭の各段)が当たった敵へ、追い打ちが自動で INTERVAL_MS おきに入る。入力は増えない。
//  - 回数=Lv1 1回 / Lv2 2回 / Lv3 3回(旧の「最大2/3/4連」=元の一撃+追い打ち)。
//  - 追い打ちの威力=元の一撃がその敵に与えた値 × DECAY^k(k=1,2,3)。元の一撃の倍率(会心・段・先端・大車輪など)はそのまま引き継ぐ。
//  - 最後の追い打ちだけ敵を吹き飛ばす(FORCE_KB_PX・Lv3 は FINAL_BIG_MULT 倍)。それ以外の追い打ちは押さない。

/** 追い打ちの間隔(ms・実時間)。 */
export const SLASHER_FOLLOWUP_INTERVAL_MS = 100;
/** 1回ごとの威力の減り(前の当たりの 2/3)。 */
export const SLASHER_FOLLOWUP_DECAY = 2 / 3;
/** 最後の追い打ちの吹き飛ばしの実距離(px・旧スラッシャーの強制ノックバックと同じ値)。 */
export const SLASHER_FORCE_KB_PX = 25;
/** Lv3 の最後の追い打ちの吹き飛ばしの倍率(旧スラッシャーの最終段と同じ値)。 */
export const SLASHER_FINAL_KB_MULT = 2;
/** 追い打ちの回数の上限(Lv3)。 */
export const SLASHER_MAX_FOLLOWUPS = 3;

export type SlasherWeapon = 'knife' | 'katana' | 'brawler' | 'whip';

/** 元の一撃が当たった1体(seed=その敵に与えた値から、追い打ちへ引き継がない倍率=空中・印・対人の縮みを外した値)。 */
export interface SlasherFollowupHit { id: string; seed: number }

/** 予約された追い打ち1回ぶん。at=出す時刻(実時間 ms)・k=何回目か(1始まり)・count=この一撃の追い打ちの回数。 */
export interface SlasherFollowup {
  at: number;
  k: number;
  count: number;
  lv: number;
  weapon: SlasherWeapon;
  /** 元の一撃の向き(絵の向き・吹き飛ばしの向きの既定)。 */
  dirX: number;
  dirY: number;
  hits: readonly SlasherFollowupHit[];
}

/** Lv から追い打ちの回数(0=持っていない)。 */
export const slasherFollowupCount = (lv: number): number =>
  lv >= 3 ? SLASHER_MAX_FOLLOWUPS : lv >= 2 ? 2 : lv >= 1 ? 1 : 0;
/** k 回目(1始まり)の追い打ちの威力の倍率(元の一撃に対して)。 */
export const slasherFollowupMult = (k: number): number => Math.pow(SLASHER_FOLLOWUP_DECAY, Math.max(1, k));
/** k 回目が最後か。 */
export const slasherFollowupIsFinal = (k: number, count: number): boolean => k >= count;
/** k 回目の吹き飛ばしの実距離(px・0=押さない)。最後だけ押す・Lv3 は大きめ。 */
export const slasherFollowupKbPx = (lv: number, k: number, count: number): number =>
  slasherFollowupIsFinal(k, count) ? SLASHER_FORCE_KB_PX * (lv >= 3 ? SLASHER_FINAL_KB_MULT : 1) : 0;

/**
 * 元の一撃が当たった時に追い打ちを予約する。now=当たった時刻(実時間)・hits=当たった敵(生き残った敵だけ・seed>0)。
 * 返り値=1回目から最後までの予約(時刻の早い順)。Lv0・当たり無しなら空。
 */
export const planSlasherFollowups = (
  now: number, lv: number, weapon: SlasherWeapon, dirX: number, dirY: number, hits: readonly SlasherFollowupHit[],
): SlasherFollowup[] => {
  const count = slasherFollowupCount(lv);
  const live = hits.filter(h => h.seed > 0 && Number.isFinite(h.seed));
  if (count <= 0 || live.length === 0) return [];
  const dm = Math.hypot(dirX, dirY);
  const ux = dm > 1e-6 ? dirX / dm : 1, uy = dm > 1e-6 ? dirY / dm : 0;
  const out: SlasherFollowup[] = [];
  for (let k = 1; k <= count; k++) {
    out.push({ at: now + SLASHER_FOLLOWUP_INTERVAL_MS * k, k, count, lv, weapon, dirX: ux, dirY: uy, hits: live });
  }
  return out;
};

/** 時刻が来た追い打ちと、まだの追い打ちに分ける(順序は保つ)。予約が無ければ同じ配列を返す。 */
export const takeDueSlasherFollowups = (
  queue: readonly SlasherFollowup[], now: number,
): { due: SlasherFollowup[]; rest: readonly SlasherFollowup[] } => {
  if (queue.length === 0) return { due: [], rest: queue };
  const due: SlasherFollowup[] = [];
  const rest: SlasherFollowup[] = [];
  for (const f of queue) (f.at <= now ? due : rest).push(f);
  return due.length === 0 ? { due, rest: queue } : { due, rest };
};

/** 長く止まっていた(ポーズ等)予約を捨てる目安(ms)。これより古い予約は出さずに捨てる。 */
export const SLASHER_FOLLOWUP_STALE_MS = 1000;
