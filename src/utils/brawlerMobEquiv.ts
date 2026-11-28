// ★格闘の当たりを「雑魚が受けた時と同じ」押し・浮きの時計に写す(社長裁定2026-11-28「プレイヤーも幻影も格闘には雑魚と同じ扱いにしよう」)。
// 孫悟空(幻影)の格闘がプレイヤーに当たった時、プレイヤーの格闘が雑魚に当たった時と同じ距離・同じ長さで押し、同じ止めの長さで浮きの時計を止める。
// 純関数(store/PixiJS 非依存)。雑魚の押しの式は gameStore(brawlerHitPatch → updateEnemies)の写し:
//  - 止めの長さを覚えた押し(強制でない押し): 止めの間もゆっくり押し始め、明けで加速して直線で減る=合計 速さ×(止め+280)²/(2×280)・長さ 止め+280
//    (updateEnemies の kbStopBoost / knockbackStopCreep と同じ合計)。
//  - 強制の押し(大踏み潰し): 止めの間はその場・明けから 280ms の直線の減り=合計 速さ×280/2。
// ダメージ(対人の縮め込み PVP_DAMAGE_SCALE)は扱わない=押し・浮きだけ。
import {
  brawlerStageSpec, brawlerWorldStopMs, BRAWLER_STOMP_HITSTOP_MS, BRAWLER_KICK_HITSTOP_MS, BRAWLER_KICK_MAX, BRAWLER_WORLD_STOP_KICK3,
  BRAWLER_SMALL_KB_MULT, BRAWLER_BIG_KB_MULT, BRAWLER_KICK3_KB_POWER,
} from './brawler';
import { brawlerFinishStopMs, brawlerStageFinishMove, brawlerKickFinishMove } from './brawlerFinishStop';

/** プレイヤーの格闘が雑魚に当たった時の押しの種類と強さ・止め(gameStore の段・大踏み潰し・飛び蹴りの strike の写し)。 */
export interface BrawlerMobHit {
  kind: 'none' | 'small' | 'normal' | 'big';
  /** 今の近接の押しの何倍か(small=BRAWLER_SMALL_KB_MULT・normal=1 か蹴り飛ばしの強さ・big=掌底/大踏み潰しの強さ)。 */
  power: number;
  /** 強制の押し(大踏み潰し=止めの補正を持たない)。 */
  forced: boolean;
  /** 雑魚に掛かる止めの長さ(ms・決め技の延長を含む)=浮きの時計を止める長さ。 */
  stopMs: number;
  /** 押しの式に数える止め(ms・決め技の延長は数えない=gameStore の knockbackStopMs)。 */
  kbStopMs: number;
}
const stopOf = (hitstopMs: number, worldMs: number | undefined, finish: ReturnType<typeof brawlerStageFinishMove>, rhythm: boolean): { stopMs: number; kbStopMs: number } => {
  if (rhythm || hitstopMs <= 0) return { stopMs: Math.max(0, hitstopMs), kbStopMs: Math.max(0, hitstopMs) };
  const base = worldMs ?? brawlerWorldStopMs(hitstopMs);
  return { stopMs: brawlerFinishStopMs(base, finish), kbStopMs: base };
};
/** 段(1〜5)。rhythm=四神舞の最中(止めは段の止めのまま=gameStore brawlerStopPlan と同じ)。 */
export const brawlerMobHitStage = (stage: number, rhythm = false): BrawlerMobHit => {
  const spec = brawlerStageSpec(stage);
  const st = stopOf(spec.hitstopMs, undefined, brawlerStageFinishMove(spec.stage), rhythm);
  const kind = spec.kb;
  const power = kind === 'big' ? (spec.kbMult ?? BRAWLER_BIG_KB_MULT) : kind === 'small' ? BRAWLER_SMALL_KB_MULT : 1;
  return { kind, power, forced: false, ...st };
};
/** 大踏み潰し(土竜=押さない)。 */
export const brawlerMobHitStomp = (mogura: boolean, rhythm = false): BrawlerMobHit => {
  const st = stopOf(BRAWLER_STOMP_HITSTOP_MS, undefined, 'stomp', rhythm);
  return mogura ? { kind: 'none', power: 0, forced: false, ...st } : { kind: 'big', power: BRAWLER_BIG_KB_MULT, forced: true, ...st };
};
/** 飛び蹴りの何発目か(1..3)。踵落とし・蹴り上げは押さない。 */
export const brawlerMobHitKick = (kickN: number, heel: boolean, up: boolean, rhythm = false): BrawlerMobHit => {
  const n = Math.max(1, Math.min(3, Math.round(kickN)));
  const big = n >= BRAWLER_KICK_MAX;
  const hv = big && heel, uv = big && !heel && up;
  const st = stopOf(BRAWLER_KICK_HITSTOP_MS[n], big && !hv && !uv ? BRAWLER_WORLD_STOP_KICK3 : undefined, brawlerKickFinishMove(big, hv, uv), rhythm);
  if (hv || uv) return { kind: 'none', power: 0, forced: false, ...st };
  if (n === 2) return { kind: 'small', power: BRAWLER_SMALL_KB_MULT, forced: false, ...st };
  return { kind: 'normal', power: big ? BRAWLER_KICK3_KB_POWER : 1, forced: false, ...st };
};
/**
 * 雑魚が動く距離(px)と押しの長さ(ms)。kbSpeed=雑魚の近接の押しの速さ(px/s・gameStore KNOCKBACK_SPEED)・kbDurMs=その長さ(KNOCKBACK_DURATION)。
 * 押さない当たりは null。
 */
export const brawlerMobKbTravel = (h: BrawlerMobHit, kbSpeed: number, kbDurMs: number): { px: number; ms: number } | null => {
  if (h.kind === 'none' || !(h.power > 0)) return null;
  const spd = kbSpeed * h.power;
  if (h.forced || h.kbStopMs <= 0) return { px: (spd * kbDurMs) / 2000, ms: kbDurMs };
  const d = h.kbStopMs + kbDurMs;
  return { px: (spd * d * d) / (2000 * kbDurMs), ms: d };
};
/**
 * プレイヤーへの押し(damagePlayer の opts.knockback)。プレイヤーの押しは初速から直線で0へ減る(movePlayer)=距離 速さ×長さ/2。
 * 雑魚と同じ距離・同じ長さになる速さを返す。押さない当たりは 'none'。
 */
export const brawlerMobKbForPlayer = (
  h: BrawlerMobHit, dir: { x: number; y: number }, kbSpeed: number, kbDurMs: number,
): 'none' | { speed: number; dirX: number; dirY: number; ms: number } => {
  const t = brawlerMobKbTravel(h, kbSpeed, kbDurMs);
  if (!t) return 'none';
  return { speed: (2000 * t.px) / t.ms, dirX: dir.x, dirY: dir.y, ms: t.ms };
};
