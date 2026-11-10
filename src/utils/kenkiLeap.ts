// research/BRAWLER_PHANTOM.md §15: 拳鬼の跳びかかり=**ハンターの跳びを流用**(社長「え、新しい技?ハンターが使ってるよ」)。
// 判定だけの純関数(store/PixiJS 非依存)。
//
// 溜め・跳ぶ弧・着地の円の予告(流星)・判定の円・着地の後の隙・時間・範囲は、ハンターの跳びの値と関数のまま
// (utils/groundJump.ts の共通の一歩と gameStore のハンターの値=groundJumpAirMsRaw)。ここに持つのは
// 拳鬼の頭脳の側の「使う場面」だけ(遠距離の詰め手・考える拍ごとの抽選・クールダウン・撃たれ続けている時に上がる)。
import { BRAWLER_KICK_RANGE } from './brawler';

/** 使う距離(拳鬼の中心からプレイヤーの箱の縁まで): 飛び蹴りの届く距離より遠く、この上限より近い。 */
export const KENKI_LEAP_MIN_PX = BRAWLER_KICK_RANGE;
export const KENKI_LEAP_MAX_PX = 900;
/** 次に使えるまで(gameTime・ms)。使った時に MIN〜MAX で引く。 */
export const KENKI_LEAP_COOLDOWN_MIN_MS = 6000;
export const KENKI_LEAP_COOLDOWN_MAX_MS = 8000;
/** 考える拍ごとに使う確率。撃たれ続けている時は上がる。 */
export const KENKI_LEAP_P = 0.3;
export const KENKI_LEAP_P_UNDER_FIRE = 0.65;
/** 「撃たれ続けている」=この間(ms)にこの回数以上当たった。 */
export const KENKI_LEAP_FIRE_WINDOW_MS = 2500;
export const KENKI_LEAP_FIRE_HITS = 2;
/** 覚えておく被弾の数。 */
export const KENKI_LEAP_FIRE_KEEP = 8;

/** 撃たれ続けているか(最近の被弾の時刻=gameTime)。 */
export const kenkiUnderFire = (hitTimes: readonly number[], t: number): boolean =>
  hitTimes.filter(h => t - h >= 0 && t - h <= KENKI_LEAP_FIRE_WINDOW_MS).length >= KENKI_LEAP_FIRE_HITS;

/** 被弾の時刻を覚える(古い順・上限つき)。 */
export const kenkiNoteHit = (hitTimes: number[], t: number): void => {
  hitTimes.push(t);
  if (hitTimes.length > KENKI_LEAP_FIRE_KEEP) hitTimes.splice(0, hitTimes.length - KENKI_LEAP_FIRE_KEEP);
};

/** 使える場面か(距離・クールダウン・待機・秘奥義の最中でない)。 */
export const kenkiLeapEligible = (i: { edgeDist: number; t: number; readyAt: number; idle: boolean; secret: boolean }): boolean =>
  i.idle && !i.secret && i.t >= i.readyAt && i.edgeDist > KENKI_LEAP_MIN_PX && i.edgeDist <= KENKI_LEAP_MAX_PX;

/** 拍ごとの確率。 */
export const kenkiLeapChance = (underFire: boolean): number => (underFire ? KENKI_LEAP_P_UNDER_FIRE : KENKI_LEAP_P);

/** 次に使えるまで。 */
export const kenkiLeapReadyAt = (startAt: number, rand: () => number): number => {
  const r = rand();
  const k = Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0;
  return startAt + KENKI_LEAP_COOLDOWN_MIN_MS + (KENKI_LEAP_COOLDOWN_MAX_MS - KENKI_LEAP_COOLDOWN_MIN_MS) * k;
};
