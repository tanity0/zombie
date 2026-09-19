import { describe, it, expect } from 'vitest';
import { tickPersistentBeams, pickBeamHits, type PersistentBeam, type BeamHittableEnemy } from './persistentBeam';

const beam = (over: Partial<PersistentBeam> = {}): PersistentBeam => ({
  id: 'b1', ax: 0, ay: 0, bx: 100, by: 0, halfWidth: 7,
  createdAt: 0, durationMs: 3000, pulseMs: 200, damage: 6, nextPulseAt: 0,
  ...over,
});

const enemy = (id: string, x: number, y: number, w = 40, h = 40): BeamHittableEnemy => ({ id, x, y, width: w, height: h });

describe('tickPersistentBeams(寿命/パルスの1フレーム判定)', () => {
  it('空配列はそのまま(パルスも空)', () => {
    const r = tickPersistentBeams([], 0);
    expect(r.beams).toEqual([]);
    expect(r.pulses).toEqual([]);
  });

  it('nextPulseAt <= gameTime ならパルス発火し、nextPulseAtがpulseMsぶん進んで生存する', () => {
    const b = beam({ nextPulseAt: 0 });
    const r = tickPersistentBeams([b], 0);
    expect(r.pulses).toEqual([b]); // 発火時点のスナップショット(元の値のまま)
    expect(r.beams).toHaveLength(1);
    expect(r.beams[0].nextPulseAt).toBe(200);
  });

  it('nextPulseAtに満たない間はパルスなしでそのまま生存', () => {
    const b = beam({ nextPulseAt: 500 });
    const r = tickPersistentBeams([b], 100);
    expect(r.pulses).toEqual([]);
    expect(r.beams).toEqual([b]);
  });

  it('★3秒/200msごとで15パルス出る(金環の仕様値と一致)', () => {
    let beams: PersistentBeam[] = [beam({ createdAt: 0, durationMs: 3000, pulseMs: 200, nextPulseAt: 0 })];
    let pulseCount = 0;
    for (let t = 0; t < 3000; t += 100) { // 100ms刻みで進める(パルス間隔200msと非同期でも取りこぼさない)
      const r = tickPersistentBeams(beams, t);
      pulseCount += r.pulses.length;
      beams = r.beams;
    }
    expect(pulseCount).toBe(15);
  });

  it('寿命切れ(gameTime >= createdAt+durationMs)は配列から落ちる', () => {
    const b = beam({ createdAt: 0, durationMs: 3000, nextPulseAt: 2800 });
    const r = tickPersistentBeams([b], 3000);
    expect(r.beams).toEqual([]);
    expect(r.pulses).toEqual([]); // 寿命切れと同時のパルスは出ない(先に寿命判定)
  });

  it('複数の線分を独立に扱う(1本だけパルス発火)', () => {
    const a = beam({ id: 'a', nextPulseAt: 0 });
    const b = beam({ id: 'b', nextPulseAt: 500 });
    const r = tickPersistentBeams([a, b], 0);
    expect(r.pulses.map(x => x.id)).toEqual(['a']);
    expect(r.beams).toHaveLength(2);
  });

  it('追尾(毎パルス終点を更新)は呼び出し側の責務——tick自体はax/ay/bx/byに触らない', () => {
    const b = beam({ nextPulseAt: 0, bx: 100, by: 0 });
    const r = tickPersistentBeams([b], 0);
    expect(r.beams[0].bx).toBe(100);
    expect(r.beams[0].by).toBe(0);
  });
});

describe('pickBeamHits(判定式: distToSegment(敵中心,a,b) <= halfWidth + max(w,h)/2)', () => {
  it('線の真上(中心が線上)なら半幅0でも当たる', () => {
    const hits = pickBeamHits(0, 0, 100, 0, 0, [enemy('e1', 50 - 20, -20, 40, 40)]); // 中心=(50,0)
    expect(hits.map(e => e.id)).toEqual(['e1']);
  });

  it('★敵の半径を足さないと当たらない距離でも、半径込みなら当たる(社長仕様「別の敵が射線へ入れば当たる」)', () => {
    // 中心は線から30px離れている。halfWidth=7だけなら外れるが、40x40の敵の半径20を足せば27>=距離...
    const enemyAt = enemy('e1', 50 - 20, 30 - 20, 40, 40); // 中心=(50,30)
    expect(pickBeamHits(0, 0, 100, 0, 7, [enemyAt])).toEqual([]); // 30 > 7+20=27 → 外れる
    const biggerEnemy = enemy('e2', 50 - 30, 30 - 30, 60, 60); // 半径30・中心(50,30)
    expect(pickBeamHits(0, 0, 100, 0, 7, [biggerEnemy]).map(e => e.id)).toEqual(['e2']);
  });

  it('線分の外側(端の外)は伸びない(カプセルではなく端で止まる線分の距離)', () => {
    const far = enemy('e1', 150 - 5, -5, 10, 10); // 中心=(150,0)。線の端(100,0)から50px
    expect(pickBeamHits(0, 0, 100, 0, 7, [far])).toEqual([]);
  });

  it('半幅ちょうどは当たる(<=は境界含む)', () => {
    const e = enemy('e1', 50, -1, 0, 2); // 中心=(50,0)。w/h=0/2→半径1。距離0+半径1<=halfWidth1で境界一致
    expect(pickBeamHits(0, 0, 100, 0, 1, [e]).map(x => x.id)).toEqual(['e1']);
  });

  it('複数の敵から当たったものだけ返す(順序維持)', () => {
    const hit1 = enemy('hit1', -10, -10, 20, 20);   // 中心(0,0)=線上
    const miss = enemy('miss', 490, -10, 20, 20);   // 中心(500,0)=線の外
    const hit2 = enemy('hit2', 90, -10, 20, 20);    // 中心(100,0)=線の終点
    expect(pickBeamHits(0, 0, 100, 0, 5, [hit1, miss, hit2]).map(e => e.id)).toEqual(['hit1', 'hit2']);
  });
});
