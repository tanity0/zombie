// ★近接の当たった所・帯を箱で測る(research/BRAWLER.md §9-75・社長「研究所の塊、当たり判定と壁判定が合ってない?」→「はい」=共通の作りで直す)。
// 大きな箱(研究所の塊 743×300)では殴った所の少し内側、小さな敵では今までどおり箱の中心。
import { describe, it, expect } from 'vitest';
import { meleeImpactPoint, meleeNumberPoint, segmentBoxDist, MELEE_IMPACT_INSET_PX } from './meleeImpact';
import { brawlerBandTargets, BRAWLER_BAND_LEN, BRAWLER_BAND_HALF_W } from './brawler';
import { spawnEnemyAt, enemyRangeRect } from './enemyUtils';
import type { Enemy } from '../types/game';

const CRAWLER = { x: 0, y: 0, width: 743, height: 300 };
const zombie = { x: 100, y: 100, width: 36, height: 36 };
const hunter = { x: 100, y: 100, width: 56, height: 64 };

describe('当たった所(meleeImpactPoint)', () => {
  it('小さな敵(幅・高さが 2×内側の量 以下)は、どこから殴っても箱の中心', () => {
    for (const [fx, fy] of [[0, 0], [400, 118], [118, -300], [130, 500]]) {
      expect(meleeImpactPoint(fx, fy, zombie)).toEqual({ x: 118, y: 118 });
    }
  });
  it('ボス級(56×64)でも中心から数pxしか動かない', () => {
    const p = meleeImpactPoint(0, 0, hunter);
    expect(Math.abs(p.x - 128)).toBeLessThanOrEqual(4);
    expect(Math.abs(p.y - 132)).toBeLessThanOrEqual(8);
  });
  it('塊の左右上下の各面: 殴った所の内側 MELEE_IMPACT_INSET_PX(中心は遠い)', () => {
    expect(meleeImpactPoint(-14, 150, CRAWLER)).toEqual({ x: MELEE_IMPACT_INSET_PX, y: 150 }); // 左
    expect(meleeImpactPoint(757, 150, CRAWLER)).toEqual({ x: 743 - MELEE_IMPACT_INSET_PX, y: 150 }); // 右
    expect(meleeImpactPoint(371, -14, CRAWLER)).toEqual({ x: 371, y: MELEE_IMPACT_INSET_PX }); // 上
    expect(meleeImpactPoint(371, 314, CRAWLER)).toEqual({ x: 371, y: 300 - MELEE_IMPACT_INSET_PX }); // 下
  });
  it('ダメージ数字: 小さな敵は今までどおり(中心の x・箱の上の縁)/塊は拳の真上', () => {
    expect(meleeNumberPoint(0, 0, zombie)).toEqual({ x: 118, y: 100 });
    expect(meleeNumberPoint(0, 0, hunter)).toEqual({ x: meleeImpactPoint(0, 0, hunter).x, y: 100 });
    const n = meleeNumberPoint(757, 150, CRAWLER);
    expect(n.x).toBe(743 - MELEE_IMPACT_INSET_PX);
    expect(150 - n.y).toBeLessThanOrEqual(60);
  });
});

describe('線分と箱の最短距離(segmentBoxDist)', () => {
  it('交われば0・面の外は面までの距離・長さ0は点と箱', () => {
    expect(segmentBoxDist(-50, 150, 50, 150, CRAWLER)).toBe(0);
    expect(segmentBoxDist(-30, 150, -30, 150, CRAWLER)).toBe(30);
    expect(segmentBoxDist(-100, -20, 800, -20, CRAWLER)).toBe(20);
    expect(segmentBoxDist(760, 320, 800, 360, CRAWLER)).toBeCloseTo(Math.hypot(17, 20));
  });
});

describe('5段目の帯は箱でも測る(brawlerBandTargets)', () => {
  const make = (box: { x: number; y: number; width: number; height: number }, type: Enemy['type'] = 'zombie'): Enemy => {
    const e = spawnEnemyAt(type, 0, 0, 0);
    return { ...e, ...box, id: 'e', health: 100, maxHealth: 100 } as Enemy;
  };
  it('塊の各面に張り付いて突き抜けが壁で止まった(長さ0)時も当たる', () => {
    const big = make(CRAWLER);
    const faces: [number, number, number, number][] = [[-14, 150, 1, 0], [757, 150, -1, 0], [371, -14, 0, 1], [371, 314, 0, -1]];
    for (const [px, py, ux, uy] of faces) expect(brawlerBandTargets([big], px, py, ux, uy, [], 0), `${px},${py}`).toEqual(['e']);
  });
  it('小さな敵(ゾンビ): 今当たる敵は必ず当たる(足しただけ)・外れる所はほぼ変わらない', () => {
    /** 直す前の式(当たり判定の帯の中心と max(幅,高さ)/2 で測る)。 */
    const old = (e: Enemy) => {
      const r = enemyRangeRect(e);
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2, half = Math.max(r.width, r.height) / 2;
      return cx >= -half && cx <= BRAWLER_BAND_LEN + half && Math.abs(cy) <= BRAWLER_BAND_HALF_W + half;
    };
    let changed = 0, n = 0;
    for (let cx = -80; cx <= BRAWLER_BAND_LEN + 80; cx += 4) {
      for (let cy = -90; cy <= 90; cy += 4) {
        const e = make({ x: cx - 18, y: cy - 18, width: 36, height: 36 });
        const hit = brawlerBandTargets([e], 0, 0, 1, 0).length === 1;
        if (old(e)) { n += 1; expect(hit, `${cx},${cy}`).toBe(true); }
        else if (hit) changed += 1;
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(changed / n).toBeLessThan(0.05); // 帯の先の角だけ(当たる所の数に対して5%未満)
  });
});
