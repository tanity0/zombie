// ★産卵の震え(社長指示2026-09-22「この人は攻撃が無いので、卵を産むときに震える感じにします」)。
// 形はクリエイティブ監査2026-09-22の指摘を反映済み(縦が主 / 独立した痙攣 / 放出の一発 / 連射の起伏)。
import { describe, it, expect } from 'vitest';
import {
  eggTrembleAt, EGG_TREMBLE_NONE,
  EGG_TREMBLE_LEAD_MS, EGG_TREMBLE_TAIL_MS, EGG_TREMBLE_LAST_TAIL_MS,
  EGG_TREMBLE_PX, EGG_TREMBLE_SIDE_FRAC, EGG_BURST_WEIGHT,
} from './eggTremble';

const L = EGG_TREMBLE_LEAD_MS, T = EGG_TREMBLE_TAIL_MS;
const at = (u: number | null, s: number | null, i = 0, last = false) => eggTrembleAt(u, s, i, last, 0.4);
/** 沈みの絶対値の最大を、区間 [a,b] の msSinceLay で走査する。 */
const peakSince = (a: number, b: number, i = 0, last = false) => {
  let m = 0;
  for (let t = a; t <= b; t++) m = Math.max(m, Math.abs(at(null, t, i, last).y));
  return m;
};
const peakUntil = (i = 0) => {
  let m = 0;
  for (let u = L; u >= 0; u--) m = Math.max(m, Math.abs(at(u, null, i).y));
  return m;
};

describe('★★縦が主・横が従(収縮は横へ振れない)', () => {
  it('どの瞬間も 横 は 縦 より小さい', () => {
    for (let u = L; u >= 0; u--) {
      const v = at(u, null, 2);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(Math.abs(v.y) * EGG_TREMBLE_SIDE_FRAC + 1e-9);
    }
  });

  it('★沈みは上限(px)を超えない——いきみと放出が重なる瞬間も', () => {
    for (let t = 0; t <= EGG_TREMBLE_LAST_TAIL_MS; t++) {
      expect(Math.abs(at(null, t, 2, true).y), `since=${t}`).toBeLessThanOrEqual(EGG_TREMBLE_PX);
    }
    // 実際の連射は「次のいきみ」と「前の放出」が同時に効く。その重なりでも天井を越えない。
    for (let u = 0; u <= L; u++) {
      for (const sinceMs of [0, 20, 60, 120, 200]) {
        expect(Math.abs(at(u, sinceMs, 2).y), `until=${u} since=${sinceMs}`).toBeLessThanOrEqual(EGG_TREMBLE_PX);
      }
    }
  });

  it('★浮き上がり(行き過ぎ)は沈みより浅い', () => {
    let up = 0;
    for (let t = 0; t <= EGG_TREMBLE_LAST_TAIL_MS; t++) up = Math.min(up, at(null, t, 2, true).y);
    expect(up).toBeLessThan(0);
    expect(Math.abs(up)).toBeLessThan(EGG_TREMBLE_PX * 0.5);
  });

  it('★端末で見える大きさ(描画枠48px級に対して1割以上沈む)', () => {
    expect(peakSince(0, T)).toBeGreaterThan(48 * 0.1);
  });
});

describe('★★独立した痙攣(連続した揺れにしない)', () => {
  it('いきみの間に「抜ける」谷がある=一定の震えではない', () => {
    const vals: number[] = [];
    for (let u = L; u >= 0; u -= 2) vals.push(at(u, null).y);
    let dirChanges = 0;
    for (let i = 2; i < vals.length; i++) {
      const a = Math.sign(vals[i - 1] - vals[i - 2]), b = Math.sign(vals[i] - vals[i - 1]);
      if (a !== 0 && b !== 0 && a !== b) dirChanges++;
    }
    expect(dirChanges).toBeGreaterThanOrEqual(3);   // 痙攣が複数回走っている
  });

  it('★痙攣の間隔が産卵へ近づくほど詰まる(等間隔ではない)', () => {
    const peaks: number[] = [];
    for (let u = L - 1; u >= 1; u--) {
      const p = at(u + 1, null).y, c = at(u, null).y, n = at(u - 1, null).y;
      if (c > p && c >= n && c > 0.2) peaks.push(L - u);   // 経過時刻での山
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    const gaps: number[] = [];
    for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
    expect(gaps[gaps.length - 1]).toBeLessThan(gaps[0]);   // 後半ほど間隔が短い
  });
});

describe('★★放出の一発と、連射の起伏', () => {
  it('卵が出た直後が一番深く沈む', () => {
    expect(at(null, 0, 2).y).toBeGreaterThan(peakUntil(2) * 0.9);
  });

  it('★行き過ぎて跳ね上がる(沈みが負へ回る=止まり方に慣性がある)', () => {
    let up = 0;
    for (let t = 0; t <= T; t++) up = Math.min(up, at(null, t).y);
    expect(up).toBeLessThan(0);
  });

  it('★1個目より3個目が重い', () => {
    expect(peakSince(0, T, 0)).toBeLessThan(peakSince(0, T, 2));
    expect(EGG_BURST_WEIGHT[0]).toBeLessThan(EGG_BURST_WEIGHT[2]);
  });

  it('★★最後の1個だけ余韻が長い(続く静止が「回復」に見える)', () => {
    expect(Math.abs(at(null, T + 200, 2, true).y)).toBeGreaterThan(0);   // まだ鎮まっていない
    expect(at(null, T + 200, 2, false)).toEqual(EGG_TREMBLE_NONE);       // 連射の途中はもう静か
    expect(at(null, EGG_TREMBLE_LAST_TAIL_MS, 2, true)).toEqual(EGG_TREMBLE_NONE);
  });

  it('連射の途中は緊張が残る(毎回ゼロに戻る同じ形の3コピーにしない)', () => {
    expect(Math.abs(at(L, null, 1).y)).toBeGreaterThan(0);
    expect(at(L, null, 0)).toEqual(EGG_TREMBLE_NONE);   // 1個目の始まりだけは静かに入る
  });
});

describe('★震えない時は1ミリも動かない', () => {
  it('産卵の予定が無い/遠い/止められている間', () => {
    expect(at(null, null)).toEqual(EGG_TREMBLE_NONE);
    expect(at(L + 1, null)).toEqual(EGG_TREMBLE_NONE);
    expect(at(3000, null)).toEqual(EGG_TREMBLE_NONE);     // バースト後の3秒CD中
    expect(at(-50, null)).toEqual(EGG_TREMBLE_NONE);      // 卵が止められている時
  });

  it('個体ごとに横の位相がずれる', () => {
    expect(eggTrembleAt(null, 30, 1, false, 0).x).not.toBe(eggTrembleAt(null, 30, 1, false, 2.1).x);
  });
});
