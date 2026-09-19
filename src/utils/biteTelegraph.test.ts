import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import { biteTelegraphLine } from './biteTelegraph';
import { biteSpecFor, biteLungeFrac, BITE_CONTACT_DIST_PX } from './enemyBite';

const mk = (over: Partial<Enemy> = {}): Enemy => ({
  id: 'e1', type: 'zombie', x: 0, y: 0, width: 40, height: 60,
  health: 420, maxHealth: 420, speed: 40, damage: 10, lastHit: 0,
  ...over,
} as Enemy);

describe('雑魚の軽い攻撃の予告(流星ライン)', () => {
  it('噛んでいない敵には線を出さない', () => {
    expect(biteTelegraphLine(mk(), 1000)).toBeNull();
  });

  it('★終点は「発火の瞬間にプレイヤーが立っていた点」と一致する', () => {
    // 発火時の中心間距離 120px。踏み込みは (120 − 接触距離) が焼かれている。
    const contact = BITE_CONTACT_DIST_PX.zombie;
    const e = mk({
      biteAt: 1000, biteDirX: 1, biteDirY: 0, biteLungePx: 120 - contact,
      chaffMove: 'zombie-double', aiPhase: 'z-bite1',
    });
    const l = biteTelegraphLine(e, 1000)!;           // 発火の瞬間(まだ踏み込んでいない)
    const ecx = e.x + e.width / 2;
    expect(l.fx).toBeCloseTo(ecx, 5);
    expect(l.tx - l.fx).toBeCloseTo(120, 5);          // = 発火時の中心間距離
  });

  it('★踏み込んで敵が動いても、線は世界に固定されたまま動かない', () => {
    const e0 = mk({
      biteAt: 1000, biteDirX: 1, biteDirY: 0, biteLungePx: 80,
      chaffMove: 'zombie-double', aiPhase: 'z-bite1',
    });
    const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const l0 = biteTelegraphLine(e0, 1000)!;
    // 噛みの途中まで進め、敵をそのぶん前へ動かす(状態機械がやっていることの再現)。
    const t = 1000 + spec.windupMs + spec.biteMs / 2;
    // その時刻の踏み込み曲線ぶんだけ敵を前へ動かす(状態機械がやっていることの再現)。
    const moved = mk({ ...e0, x: e0.x + 80 * biteLungeFrac(e0, t) });
    const l1 = biteTelegraphLine(moved, t)!;
    expect(l1.fx).toBeCloseTo(l0.fx, 5);
    expect(l1.tx).toBeCloseTo(l0.tx, 5);
  });

  it('★進捗1(=判定の瞬間)まで通しで、溜めの終わりで描き切る割合になっている', () => {
    const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const e = mk({ biteAt: 1000, biteDirX: 0, biteDirY: 1, biteLungePx: 40, chaffMove: 'zombie-double', aiPhase: 'z-bite1' });
    const atWindupEnd = biteTelegraphLine(e, 1000 + spec.windupMs - 1)!;
    expect(atWindupEnd.drawFrac).toBeCloseTo(spec.windupMs / (spec.windupMs + spec.biteMs), 5);
    // 溜めの終わり ≒ drawFrac(そこで線が満ちる)
    expect(atWindupEnd.prog).toBeCloseTo(atWindupEnd.drawFrac, 2);
  });

  it('★色の出どころは判定と同じ台帳(カウンター可=赤 / 不可=紫)', () => {
    // §16のゾンビ2連=カウンター可(赤)
    const red = biteTelegraphLine(mk({ biteAt: 1000, biteDirX: 1, biteDirY: 0, chaffMove: 'zombie-double', aiPhase: 'z-bite1' }), 1000)!;
    expect(red.counterable).toBe(true);
    // §12の噛みつき=カウンター不可(紫)
    const purple = biteTelegraphLine(mk({ biteAt: 1000, biteDirX: 1, biteDirY: 0 }), 1000)!;
    expect(purple.counterable).toBe(false);
  });

  it('★本物のボスと城ボスには出さない(自前の予告と二重にしない)', () => {
    for (const type of ['thor', 'mimir', 'giantbat'] as const) {
      expect(biteTelegraphLine(mk({ type, biteAt: 1000, biteDirX: 1, biteDirY: 0 }), 1000)).toBeNull();
    }
  });
});
