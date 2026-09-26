import { describe, it, expect } from 'vitest';
import {
  assignHomingShotgunTargetsByAzimuth, homingPelletTurnRateRadPerSec, HOMING_PELLET_TURN_RADIUS_PX,
} from './homingShotgun';

describe('homingPelletTurnRateRadPerSec(旋回半径40px相当を弾速から導く)', () => {
  it('弾速705px/s(=470×1.5)なら 705/40 = 17.625rad/s', () => {
    expect(homingPelletTurnRateRadPerSec(705)).toBeCloseTo(705 / 40, 6);
    expect(homingPelletTurnRateRadPerSec(705)).toBeCloseTo(17.625, 3);
  });

  it('誘導ロケット相当(弾速200px/s・旋回5rad/s)と同じ半径になる', () => {
    // radius = speed / turnRate。ロケット: 200/5=40。ペレットの式も同じ半径40pxを再現する。
    const rocketRadius = 200 / 5;
    expect(rocketRadius).toBe(HOMING_PELLET_TURN_RADIUS_PX);
    const pelletTurnRate = homingPelletTurnRateRadPerSec(705);
    expect(705 / pelletTurnRate).toBeCloseTo(HOMING_PELLET_TURN_RADIUS_PX, 6);
  });

  it('弾速0以下は0(旋回しようがない)', () => {
    expect(homingPelletTurnRateRadPerSec(0)).toBe(0);
    expect(homingPelletTurnRateRadPerSec(-10)).toBe(0);
  });
});

describe('assignHomingShotgunTargetsByAzimuth(方位で組む対象割り振り)', () => {
  it('対象なし(0体)なら全弾undefined', () => {
    const result = assignHomingShotgunTargetsByAzimuth([-0.6, -0.3, 0, 0.3, 0.6], []);
    expect(result).toHaveLength(5);
    expect(result.every(id => id === undefined)).toBe(true);
  });

  it('1体だけなら全弾が同じ1体に集中する(UNIQUE_WEAPONS.md §16-2「1体なら全弾集中」)', () => {
    const result = assignHomingShotgunTargetsByAzimuth([-0.6, -0.3, 0, 0.3, 0.6], [{ id: 'e1', azimuthRad: 0.2 }]);
    expect(result).toHaveLength(5);
    expect(result.every(id => id === 'e1')).toBe(true);
  });

  it('複数体なら方位角の順に、拡散角の順のペレットを対応させる(左のペレット→左の敵)', () => {
    // ペレット拡散角3発と対象3体で1:1対応させ、対応の向きを見る(対象は方位角バラバラな順で渡す)。
    const result = assignHomingShotgunTargetsByAzimuth(
      [-0.6, 0, 0.6],
      [
        { id: 'right', azimuthRad: 1.5 },  // 真右寄り(最大)
        { id: 'left', azimuthRad: -1.5 },  // 真左寄り(最小)
        { id: 'center', azimuthRad: 0 },
      ],
    );
    expect(result[0]).toBe('left');   // 一番左のペレット → 一番左寄りの敵
    expect(result[1]).toBe('center');
    expect(result[2]).toBe('right');  // 一番右のペレット → 一番右寄りの敵
  });

  it('真横の敵にも端ではないペレットが対応しうる(方位で組むことで曲がり切れる範囲に収まる)', () => {
    // 3体を方位角で並べ、5発を均等に近い方位へ対応させる=round-robinは維持。
    const result = assignHomingShotgunTargetsByAzimuth(
      [-0.6, -0.3, 0, 0.3, 0.6],
      [{ id: 'a', azimuthRad: -0.5 }, { id: 'b', azimuthRad: 0 }, { id: 'c', azimuthRad: 0.5 }],
    );
    expect(result).toEqual(['a', 'b', 'c', 'a', 'b']);
  });

  it('count=0(空のペレット配列)なら空配列', () => {
    expect(assignHomingShotgunTargetsByAzimuth([], [{ id: 'a', azimuthRad: 0 }])).toEqual([]);
  });
});
