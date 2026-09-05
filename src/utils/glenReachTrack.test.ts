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
import {
  stepLaserAim, glenReachTrackCaps, GLEN_REACH_OVERSHOOT, glenReachAimStart,
} from './mimirLaserTrack';
import {
  GLEN_REACH_WINDUP_MS, GLEN_REACH_HALF_WIDTH, ENEMY_ATTACK_SPEED_MULT, GLEN_REACH_INTERVAL_MS,
} from '../store/gameStore';

const V = 104.4;          // プレイヤーの実効歩行速度(bossTelegraph.PLAYER_WALK_PX_PER_SEC)
// ★実装の定数を**そのまま読む**(テストに写すと、調整した時に片方だけ古くなって嘘の合格になる)。
const WINDUP_MS = GLEN_REACH_WINDUP_MS / ENEMY_ATTACK_SPEED_MULT;
const ESCAPE_PX = GLEN_REACH_HALF_WIDTH + 14; // 自機半径。帯から出るのに要るズレ
const DT = 1 / 60;
const caps = glenReachTrackCaps(V);
const BOSS = { x: -500, y: 0 }; // 触手の間合い(420〜1000px)の内側

/** 溜めの間ずっと追尾させ、発動の瞬間の「照準と自分のズレ」を返す(px)。 */
const missAtFire = (playerAt: (tMs: number) => { x: number; y: number }): number => {
  // 照準は**狙いから横へ離れた位置**・速度0から始まる=振り子の初期位置(store側と同じ)。
  const s0 = glenReachAimStart(BOSS.x, BOSS.y, playerAt(0).x, playerAt(0).y, 0);
  let aim = { x: s0.x, y: s0.y, vx: 0, vy: 0 };
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
    // 溜めが長くなった(v0.25.3157)ので「早すぎ」は 2000ms 前より前。
    expect(missAtFire(cutBack(2000))).toBeLessThan(ESCAPE_PX);
  });

  // v0.25.3159b(社長指示「触手2.3秒のところで次の触手発動(つまり少し被る)」)
  it('⑧次の触手は前の触手の溜めが終わる前に生える(=必ず被る)', () => {
    const windEff = GLEN_REACH_WINDUP_MS / ENEMY_ATTACK_SPEED_MULT;
    const gapEff = GLEN_REACH_INTERVAL_MS / ENEMY_ATTACK_SPEED_MULT;
    expect(gapEff).toBeLessThan(windEff);          // 被らないと社長指示を満たさない
    expect(windEff - gapEff).toBeGreaterThan(100); // 「少し」でも見て分かる長さはある
  });

  it('⑤遅すぎる反転は間に合わない(見てからでは遅い)', () => {
    expect(missAtFire(cutBack(100))).toBeLessThan(ESCAPE_PX);
  });

  it('⑥振り切れる窓が「一瞬」ではなく読める広さで、しかも**途切れずに**開いている', () => {
    // 200〜1700ms前は**どこで反転しても**避けられる(=1500msの連続した窓)。
    // ★連続であることが肝: 掃引では「直前は避けられ、中盤は捕まり、序盤はまた避けられる」という
    //   飛び飛びの窓になる組もあった。**避け方が読めないのは、地味なのより悪い**ので採らない。
    for (let flip = 200; flip <= 1700; flip += 100) {
      expect(missAtFire(cutBack(flip))).toBeGreaterThanOrEqual(ESCAPE_PX);
    }
  });

  it('⑦振り子になっている(照準が狙いを横切って戻ってくる)', () => {
    // 立ち止まっている相手に対して、照準が**左右に横切る**=振り子。1回も横切らなければ
    // 「遅れて寄ってくるだけ」で、社長が却下した"わざとらしくない"動きにならない。
    const s0 = glenReachAimStart(BOSS.x, BOSS.y, 0, 0, 0);
    let aim = { x: s0.x, y: s0.y, vx: 0, vy: 0 };
    let cross = 0, prev = 0, amp = 0;
    for (let t = 0; t < WINDUP_MS; t += DT * 1000) {
      aim = stepLaserAim(aim, 0, 0, DT, caps.maxPxS, caps.accel, t / WINDUP_MS, GLEN_REACH_OVERSHOOT);
      const lat = aim.y - 0; // ボスは真横(-500,0)なので、横ズレ=y
      amp = Math.max(amp, Math.abs(lat));
      if (prev !== 0 && Math.sign(lat) !== Math.sign(prev) && Math.abs(lat) > 5) cross += 1;
      if (Math.abs(lat) > 5) prev = lat;
    }
    expect(cross).toBeGreaterThanOrEqual(2);   // 行って戻る=最低2回
    expect(amp).toBeGreaterThan(120);          // 見て分かる振れ幅
  });
});
