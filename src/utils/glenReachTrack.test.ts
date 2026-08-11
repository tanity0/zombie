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
  stepLaserAim, glenReachTrackCaps, GLEN_REACH_OVERSHOOT,
  glenReachSwayRad, GLEN_REACH_SWAY_RAD,
  glenReachBandOffsetRad, GLEN_REACH_START_OFFSET_RAD,
} from './mimirLaserTrack';

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

// v0.25.3154(社長指示「もっとぶるーんぶるーんってはみ出す動きを大きく」): 帯の振り回し。
// ★この機構の生命線は「**最後に必ず0へ戻る**」こと。戻らないと最後にどこを向くかが運になり、
//   予告として成立しない(CLAUDE.md「赤いのに当たらない」の根幹)。ここを機械で固定する。
describe('触手の振り回し(ぶるーん)', () => {
  it('①狙いが固まる前に必ず0へ戻る(最後の向きが運にならない)', () => {
    for (const p of [0.78, 0.85, 0.95, 1.0]) {
      for (const t of [0, 137, 400, 900, 1499]) {
        expect(glenReachSwayRad(p, t)).toBe(0);
      }
    }
  });
  it('②溜めの入り口でも0(出た瞬間にガクッと跳ねない)', () => {
    for (const p of [0, 0.1, 0.22]) expect(glenReachSwayRad(p, 300)).toBe(0);
  });
  it('③窓の中では左右どちらにも振れ、振れ幅は指定値を超えない', () => {
    let seenPlus = false, seenMinus = false, peak = 0;
    for (let t = 0; t < 1500; t += 5) {
      const r = glenReachSwayRad(t / 1500, t);
      if (r > 0.02) seenPlus = true;
      if (r < -0.02) seenMinus = true;
      peak = Math.max(peak, Math.abs(r));
    }
    expect(seenPlus).toBe(true);
    expect(seenMinus).toBe(true);
    expect(peak).toBeLessThanOrEqual(GLEN_REACH_SWAY_RAD + 1e-9);
    expect(peak).toBeGreaterThan(GLEN_REACH_SWAY_RAD * 0.6); // 山の頂点まで届いている
  });
  it('④「ぶるーんぶるーん」=溜めの中で2回以上振れる(1回だけの片振りではない)', () => {
    let crossings = 0, prev = 0;
    for (let t = 0; t < 1500; t += 5) {
      const r = glenReachSwayRad(t / 1500, t);
      if (prev !== 0 && Math.sign(r) !== 0 && Math.sign(r) !== Math.sign(prev)) crossings += 1;
      if (r !== 0) prev = r;
    }
    expect(crossings).toBeGreaterThanOrEqual(2);
  });
  it('⑤乱数を使っていない(同じ状況なら同じ振り方=読める)', () => {
    expect(glenReachSwayRad(0.5, 700)).toBe(glenReachSwayRad(0.5, 700));
  });
});

// v0.25.3155(社長指示「離れたところからスタートして」): 帯は横を向いた状態から始まり、
// 狙いへ寄ってくる。★**照準は動かさない**(照準をずらす案は掃引で全滅=走り続けるだけで避けられた)。
describe('触手の帯: 離れた所から寄ってくる + ぶるーん(合計オフセット)', () => {
  it('①溜めの開始では大きく横を向いている(=離れた所から始まる)', () => {
    expect(Math.abs(glenReachBandOffsetRad(0, 0, 0))).toBeCloseTo(GLEN_REACH_START_OFFSET_RAD, 6);
  });
  it('②振り切り窓が始まるまでに0へ閉じる(寄り切ってから振り回しへ渡す)', () => {
    const { from } = GLEN_REACH_OVERSHOOT;
    // 進行が進むほど開きは小さくなる(単調に寄ってくる=途中で開き直さない)
    let prev = Infinity;
    for (let p = 0; p < from; p += 0.01) {
      const approach = Math.abs(glenReachBandOffsetRad(p, 0, 0) - glenReachSwayRad(p, 0));
      expect(approach).toBeLessThanOrEqual(prev + 1e-9);
      prev = approach;
    }
  });
  it('★③最後は必ず0(帯が照準そのものを指す=最後の向きが運にならない)', () => {
    for (const p of [0.78, 0.9, 1.0]) {
      for (const t of [0, 250, 800, 1499]) {
        for (const i of [0, 1, 2]) expect(glenReachBandOffsetRad(p, t, i)).toBe(0);
      }
    }
  });
  it('④発ごとに左右が入れ替わる(3連発が同じ動きに見えない)', () => {
    const a = glenReachBandOffsetRad(0, 0, 0), b = glenReachBandOffsetRad(0, 0, 1);
    expect(Math.sign(a)).toBe(-Math.sign(b));
    expect(Math.sign(glenReachBandOffsetRad(0, 0, 2))).toBe(Math.sign(a)); // 3発目は1発目と同じ側
  });
  it('⑤窓の中では振り回しがそのまま乗る(寄せの段は終わっている)', () => {
    for (const p of [0.3, 0.5, 0.7]) {
      expect(glenReachBandOffsetRad(p, 300, 0)).toBeCloseTo(glenReachSwayRad(p, 300), 6);
    }
  });
});
