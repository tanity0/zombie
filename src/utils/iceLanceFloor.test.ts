import { describe, it, expect } from 'vitest';
import {
  iceLanceFloorPulseDamage, ICE_LANCE_FLOOR_HALFWIDTH, ICE_LANCE_FLOOR_DURATION_MS, ICE_LANCE_FLOOR_PULSE_MS,
  createIceLanceFloor, tickIceLanceFloors, type IceLanceFloor, type IceLanceProjectileLike,
} from './iceLanceFloor';

describe('iceLanceFloor(氷槍ライフル・UNIQUE_WEAPONS.md §16-2)', () => {
  it('直撃58ダメージなら床の1パルスは20%=12(四捨五入)', () => {
    expect(iceLanceFloorPulseDamage(58)).toBe(12); // 58*0.2=11.6→12
  });

  it('最低1(端数切り捨てで0にならない)', () => {
    expect(iceLanceFloorPulseDamage(1)).toBe(1);
  });

  it('寸法定数: 幅28px(半幅14)/1.2秒/200msごと', () => {
    expect(ICE_LANCE_FLOOR_HALFWIDTH).toBe(14);
    expect(ICE_LANCE_FLOOR_DURATION_MS).toBe(1200);
    expect(ICE_LANCE_FLOOR_PULSE_MS).toBe(200);
  });
});

const proj = (id: string, x: number, y: number, w = 9, h = 9): IceLanceProjectileLike => ({ id, x, y, width: w, height: h });

describe('createIceLanceFloor(発射直後・まだ何も伸びていない床)', () => {
  it('ax/ay=bx/by=発射点、frozen=false', () => {
    const f = createIceLanceFloor('f1', 'p1', 10, 20, ICE_LANCE_FLOOR_HALFWIDTH, ICE_LANCE_FLOOR_PULSE_MS, 12, 0);
    expect(f).toMatchObject({ id: 'f1', projectileId: 'p1', frozen: false, ax: 10, ay: 20, bx: 10, by: 20, damage: 12 });
  });
});

describe('tickIceLanceFloors(検収監査A-1是正: 弾の後ろに伸びる床)', () => {
  it('対応する弾が生きている間は毎tick終点(bx/by)を弾の中心位置へ追従させる(まだダメージは出さない)', () => {
    const f = createIceLanceFloor('f1', 'p1', 0, 0, 14, 200, 12, 0);
    // 弾の中心は x+width/2, y+height/2
    const live = [proj('p1', 96, -2, 8, 4)]; // 中心=(100,0)
    const r = tickIceLanceFloors([f], live, 50);
    expect(r.floors).toHaveLength(1);
    expect(r.floors[0]).toMatchObject({ frozen: false, ax: 0, ay: 0, bx: 100, by: 0 });
    expect(r.pulses).toEqual([]); // 伸びている間はダメージを出さない(弾より先に当たらない=A-1)
    expect(r.changed).toBe(true);
  });

  it('★A-1是正の中核: 弾が途中で消えたら、その時点(=最後に追従した位置)までしか伸びない', () => {
    let floors: IceLanceFloor[] = [createIceLanceFloor('f1', 'p1', 0, 0, 14, 200, 12, 0)];
    // t=50: 弾はまだ100pxまでしか飛んでいない(全長1890pxではない)
    let r = tickIceLanceFloors(floors, [proj('p1', 96, -2, 8, 4)], 50); // 中心(100,0)
    floors = r.floors;
    expect(floors[0].bx).toBe(100);
    // t=60: 弾が消えた(命中/壁/寿命切れのどれでもよい——projectiles配列から消えたという事実だけを見る)
    r = tickIceLanceFloors(floors, [], 60);
    floors = r.floors;
    expect(floors).toHaveLength(1);
    expect(floors[0]).toMatchObject({ frozen: true, ax: 0, ay: 0, bx: 100, by: 0 }); // 100pxのまま=1890pxまで伸びない
    expect(floors[0].createdAt).toBe(60); // 凍結時刻を起点に寿命を数え直す
    // 凍結と同時に1発目が出て(金環と同じ思想)、tickPersistentBeamsがnextPulseAtをpulseMs(200)ぶん進める
    expect(floors[0].nextPulseAt).toBe(260);
    expect(r.pulses).toHaveLength(1); // 凍結した瞬間、その場で1発目が出る(伸びた範囲=100pxの床にだけ)
    expect(r.changed).toBe(true);
  });

  it('凍結後は共通土台(tickPersistentBeams)どおり1.2秒/200msごとにパルスが出て、寿命切れで消える', () => {
    let floors: IceLanceFloor[] = [createIceLanceFloor('f1', 'p1', 0, 0, 14, 200, 12, 0)];
    // 即座に弾が消える=t=0で凍結
    let r = tickIceLanceFloors(floors, [], 0);
    floors = r.floors;
    expect(r.pulses).toHaveLength(1); // 凍結と同時に1発目
    let pulseCount = 1;
    for (let t = 200; t < 1200; t += 200) {
      r = tickIceLanceFloors(floors, [], t);
      floors = r.floors;
      pulseCount += r.pulses.length;
    }
    expect(pulseCount).toBe(6); // 0,200,400,600,800,1000の6発(1.2秒÷200ms)
    r = tickIceLanceFloors(floors, [], 1200); // 寿命切れ
    expect(r.floors).toEqual([]);
  });

  it('複数の床を独立に扱う(片方は伸長中、片方は既に凍結済み)', () => {
    const growing = createIceLanceFloor('f1', 'p1', 0, 0, 14, 200, 12, 0);
    const frozen: IceLanceFloor = { ...createIceLanceFloor('f2', 'p2', 0, 0, 14, 200, 12, 0), frozen: true, bx: 50, by: 0, nextPulseAt: 1000 };
    const r = tickIceLanceFloors([growing, frozen], [proj('p1', 46, -2, 8, 4)], 100); // p1中心=(50,0)。p2は既に消えている
    expect(r.floors).toHaveLength(2);
    const g = r.floors.find(f => f.id === 'f1')!;
    const fr = r.floors.find(f => f.id === 'f2')!;
    expect(g).toMatchObject({ frozen: false, bx: 50 }); // 伸長継続
    expect(fr).toMatchObject({ frozen: true, bx: 50 }); // 凍結済みは弾を見ない(nextPulseAt未到達なので変化なし)
    expect(r.pulses).toEqual([]); // まだどちらも発火しない
  });
});
