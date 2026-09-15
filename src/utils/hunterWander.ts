// ハンター変異体: 索敵中(dormant)は静止せず、低速の「徘徊」で移動する(社長指示)。
// ランダムっぽく見せて実はプレイヤーへじわじわ接近する=乱数ウェイポイントを数秒おきに
// 再抽選し、抽選のたびに候補方向へプレイヤー方向を3割だけ混ぜる。純関数化してユニット
// テスト可能にする(実装精度の規律4: 配線ロジックは純関数へ切り出す)。
export interface HunterWanderState {
  wanderTargetX: number;
  wanderTargetY: number;
  wanderNextAt: number; // 次に再抽選する gameTime(ms)
}

const HUNTER_WANDER_SPEED_MULT = 0.35;      // 通常速度に対する徘徊速度の比率
const HUNTER_WANDER_BIAS = 0.3;             // 新ウェイポイント抽選時にプレイヤー方向へ混ぜる比率
const HUNTER_WANDER_STEP_MIN = 140;         // 1ウェイポイントの距離(px)レンジ
const HUNTER_WANDER_STEP_MAX = 260;
const HUNTER_WANDER_RETARGET_MIN_MS = 2000; // 次の再抽選までの間隔(ms)レンジ
const HUNTER_WANDER_RETARGET_MAX_MS = 4000;
const HUNTER_WANDER_ARRIVE_EPS = 8;         // ウェイポイント到達とみなす距離(px)

export const pickHunterWanderWaypoint = (
  ecx: number, ecy: number, pcx: number, pcy: number, gameTime: number, rand: () => number = Math.random,
): HunterWanderState => {
  const randomAngle = rand() * Math.PI * 2;
  const randomDx = Math.cos(randomAngle), randomDy = Math.sin(randomAngle);
  const tdx = pcx - ecx, tdy = pcy - ecy;
  const tn = Math.max(0.001, Math.hypot(tdx, tdy));
  const towardDx = tdx / tn, towardDy = tdy / tn;
  const bdx0 = randomDx * (1 - HUNTER_WANDER_BIAS) + towardDx * HUNTER_WANDER_BIAS;
  const bdy0 = randomDy * (1 - HUNTER_WANDER_BIAS) + towardDy * HUNTER_WANDER_BIAS;
  const bn = Math.max(0.001, Math.hypot(bdx0, bdy0));
  const bdx = bdx0 / bn, bdy = bdy0 / bn;
  const dist = HUNTER_WANDER_STEP_MIN + rand() * (HUNTER_WANDER_STEP_MAX - HUNTER_WANDER_STEP_MIN);
  const retarget = HUNTER_WANDER_RETARGET_MIN_MS + rand() * (HUNTER_WANDER_RETARGET_MAX_MS - HUNTER_WANDER_RETARGET_MIN_MS);
  return {
    wanderTargetX: ecx + bdx * dist,
    wanderTargetY: ecy + bdy * dist,
    wanderNextAt: gameTime + retarget,
  };
};

// 現在のウェイポイントが無い/期限切れ/到達済みなら再抽選し、ウェイポイントへ向かう速度ベクトルを返す。
export const hunterWanderStep = (
  ecx: number, ecy: number, speed: number, pcx: number, pcy: number,
  gameTime: number,
  wander: HunterWanderState | null,
  rand: () => number = Math.random,
): { vx: number; vy: number; wander: HunterWanderState } => {
  const stale = !wander || gameTime >= wander.wanderNextAt
    || Math.hypot(wander.wanderTargetX - ecx, wander.wanderTargetY - ecy) <= HUNTER_WANDER_ARRIVE_EPS;
  const w: HunterWanderState = stale ? pickHunterWanderWaypoint(ecx, ecy, pcx, pcy, gameTime, rand) : wander!;
  const dx = w.wanderTargetX - ecx, dy = w.wanderTargetY - ecy;
  const n = Math.max(0.001, Math.hypot(dx, dy));
  const spd = speed * HUNTER_WANDER_SPEED_MULT;
  return { vx: (dx / n) * spd, vy: (dy / n) * spd, wander: w };
};
