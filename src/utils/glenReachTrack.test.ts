// グレンの触手(reach)の追尾照準が「**切り返しだけが避け方**」になっているかの不変条件。
//
// この技は社長指示v0.25.3145で「ミーミルのレーザーと同じく切り返しで避ける」設計へ差し替えた。
// 数値(速度/慣性/振り切り窓)は実機の体感で何度も動かす前提なので、**動かした結果として
// 避け方が壊れていないこと**を機械で押さえておく。以下の3つが崩れたら技として成立しない:
//   ① 走り続けても捕まる  (逃げ切れるなら追尾の意味が無い)
//   ② 立ち止まっても捕まる (棒立ちが安全なら技の意味が無い)
//   ③ ギリギリの切り返しなら振り切れる (これが唯一の避け方)
//
// ※ここは「何px逃げたか」の絶対値は固定しない(調整のたびにテストが壊れて意味を失う)。
//   **当たるか/避けられるか**だけを見る。境界は帯の半幅+自機半径=42px。
import { describe, it, expect } from 'vitest';
import { stepLaserAim, glenReachTrackCaps, GLEN_REACH_OVERSHOOT } from './mimirLaserTrack';

const V = 104.4;          // プレイヤーの実効歩行速度(bossTelegraph.PLAYER_WALK_PX_PER_SEC)
const WINDUP_MS = 1500;   // GLEN_REACH_WINDUP_MS(1800) / ENEMY_ATTACK_SPEED_MULT(1.2)
const ESCAPE_PX = 28 + 14; // GLEN_REACH_HALF_WIDTH + 自機半径 = 帯から出るのに要るズレ
const DT = 1 / 60;
const caps = glenReachTrackCaps(V);

/** 溜めの間ずっと追尾させ、発動の瞬間の「照準と自分のズレ」を返す(px)。 */
const missAtFire = (playerAt: (tMs: number) => { x: number; y: number }): number => {
  let aim = { x: 0, y: 0, vx: 0, vy: 0 }; // 照準は相手の真上から始まる(store側と同じ)
  for (let t = 0; t < WINDUP_MS; t += DT * 1000) {
    const p = playerAt(t);
    aim = stepLaserAim(aim, p.x, p.y, DT, caps.maxPxS, caps.accel, t / WINDUP_MS, GLEN_REACH_OVERSHOOT);
  }
  const end = playerAt(WINDUP_MS);
  return Math.hypot(aim.x - end.x, aim.y - end.y);
};

/** `flipBeforeMs` ミリ秒前に反転して走り返す動き。 */
const cutBack = (flipBeforeMs: number) => (t: number) => {
  const flipAt = WINDUP_MS - flipBeforeMs;
  const fwd = Math.min(t, flipAt), back = Math.max(0, t - flipAt);
  return { x: (V * fwd) / 1000 - (V * back) / 1000, y: 0 };
};

describe('触手の追尾: 避け方が「切り返し」一択になっている', () => {
  it('①一直線に走り続けても捕まる(逃げ切れない)', () => {
    expect(missAtFire(t => ({ x: (V * t) / 1000, y: 0 }))).toBeLessThan(ESCAPE_PX);
  });

  it('②立ち止まっても捕まる(棒立ちが安全にならない)', () => {
    expect(missAtFire(() => ({ x: 0, y: 0 }))).toBeLessThan(ESCAPE_PX);
  });

  it('③ギリギリの切り返し(発動600ms前の反転)は振り切れる', () => {
    expect(missAtFire(cutBack(600))).toBeGreaterThanOrEqual(ESCAPE_PX);
  });

  it('④早すぎる反転は再捕捉される(「とりあえず反転」では避けられない)', () => {
    expect(missAtFire(cutBack(1400))).toBeLessThan(ESCAPE_PX);
  });

  it('⑤遅すぎる反転は間に合わない(見てからでは遅い)', () => {
    expect(missAtFire(cutBack(100))).toBeLessThan(ESCAPE_PX);
  });

  it('⑥振り切れる窓が「一瞬」ではなく読める広さで開いている', () => {
    // 300〜1200ms前のどこで反転しても避けられる=タイミングゲーではなく読みで成立する。
    for (const flip of [300, 600, 900, 1200]) {
      expect(missAtFire(cutBack(flip))).toBeGreaterThanOrEqual(ESCAPE_PX);
    }
  });
});
