// research/TELEGRAPH_FIXES.md N10(順13・テストだけ): 噛みの線は「出ない」のではなく、踏み込み lp が小さいと
// 下限(MIN_DRAWN_PX=24)まで縮む。全敵の噛みの州で、描く区間(dfx,dfy→dtx,dty)の長さが下限以上かを確かめる。
// 最悪の場合=密着で発火(焼いた踏み込み lp=0)と、各型の既定の踏み込み(biteLungePx 未設定)の2通り。
import { describe, it, expect } from 'vitest';
import { biteTelegraphLine } from './biteTelegraph';
import { ENEMY_STATS, spawnEnemyAt } from './enemyUtils';
import type { EnemyType } from '../types/game';

const MIN_DRAWN_PX = 24; // biteTelegraph.ts の MIN_DRAWN_PX と同値

const drawnLen = (type: EnemyType, lungePx: number | undefined): number | null => {
  const e = spawnEnemyAt(type, 1000, 1000, 0);
  e.biteAt = 1000; e.biteDirX = 1; e.biteDirY = 0;
  if (lungePx !== undefined) e.biteLungePx = lungePx; else delete e.biteLungePx;
  delete e.chaffMove;
  const l = biteTelegraphLine(e, 1000);
  if (!l) return null;
  return Math.hypot(l.dtx - l.dfx, l.dty - l.dfy);
};

describe('N10 噛みの線の長さ(全敵の噛みの州)', () => {
  const types = Object.keys(ENEMY_STATS) as EnemyType[];
  it('既定の踏み込み(biteLungePx 未設定)では全型で下限以上', () => {
    const short: string[] = [];
    for (const t of types) {
      const len = drawnLen(t, undefined);
      if (len !== null && len < MIN_DRAWN_PX - 1e-6) short.push(`${t}=${len.toFixed(1)}`);
    }
    expect(short).toEqual([]);
  });
  it('密着で発火(lp=0)した時に下限を割る型(=画で読めるか確かめる対象)を記録する', () => {
    const short: string[] = [];
    for (const t of types) {
      const len = drawnLen(t, 0);
      if (len !== null && len < MIN_DRAWN_PX - 1e-6) short.push(`${t}=${len.toFixed(1)}`);
    }
    // 下限を割るのは接触距離そのものが下限より短い型だけ(線の全長=接触距離+踏み込み0)。
    expect(short).toEqual(EXPECTED_SHORT_AT_CONTACT);
  });
});

// ★測った結果(このテストを書いた時点)。ここが空でなくなった/変わったら N10 を (a) に上げる判断材料。
// コウモリは接触距離 23px(BITE_CONTACT_DIST_PX.bat)が下限 24px より1px短い=密着で発火すると線は23px(ほぼ下限)。
// 「出ない」のではなく下限まで縮む場合(設計書 N10 の (b) の記述どおり)。画で読めなければ (a) に上げる。
const EXPECTED_SHORT_AT_CONTACT: string[] = ['bat=23.0'];
