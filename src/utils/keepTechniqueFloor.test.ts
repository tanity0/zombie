// ★裁定 #K-1(社長2026-09-20「a」)の機械化。
//
// 社長報告: 「**パンプキンが、絶妙な距離を保ち続けると何もしてこない**」。
// 原因は `keepBlocksTechnique` の下限が**保つ帯の内側**(パンプキンで167〜207px)に置かれていたこと。
// 噛みつきが届くのは60px級なので、その間に**「噛めないし技も出せない」帯**が約100〜140px幅で空いていた。
//
// ★この線は**2つの条件の間にしか置けない**。どちらか片方だけを見て動かすと必ずどちらかが壊れる:
//   ① 噛みつきが始まる距離より**内側**(外に置くと、今回の「何もしてこない帯」が復活する)
//   ② 着地直後の連射を止められるだけ**外側**(元の事故=18pxから跳び続けた、が復活する)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { keepBlocksTechnique, hasKeepRange, KEEP_TECHNIQUE_NEAR_FLOOR_PX } from './keepRange';
import { useGameStore, PUMPKIN_TRIGGER_RANGE } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { enemyContactBox, playerHitbox } from './collisionUtils';
import { biteSpecFor, biteReachRect, isInBiteRect } from './enemyBite';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy, EnemyType } from '../types/game';

/** 元の事故(§16-B B-10): パンプキンは着地直後**18px**から跳び直していた。 */
const LANDING_DIST_PX = 18;
/** 保つ層を持つ型のうち、噛みつきも持つ代表。 */
const TYPES: EnemyType[] = ['pumpkin', 'bat', 'skeleton', 'werewolf'];

describe('★#K-1 技を出せない「密着」の線', () => {
  beforeEach(() => { setTreesDisabled(true); setTorchesDisabled(true); useGameStore.getState().resetGame('assault'); });
  afterEach(() => { setTreesDisabled(false); setTorchesDisabled(false); });

  it('②元の事故を止められる: 着地直後(18px)からは技を出せない', () => {
    for (const t of TYPES) {
      if (!hasKeepRange(t)) continue;
      expect(keepBlocksTechnique(t, 'e1', 1000, PUMPKIN_TRIGGER_RANGE, LANDING_DIST_PX), t).toBe(true);
    }
    expect(KEEP_TECHNIQUE_NEAR_FLOOR_PX).toBeGreaterThan(LANDING_DIST_PX);
  });

  it('★①「噛めないし技も出せない」帯が無い: 噛みつきが始まる距離では技が出せる', () => {
    const p0 = useGameStore.getState().player;
    const ph = playerHitbox(p0);
    const phcx = ph.x + ph.width / 2, phcy = ph.y + ph.height / 2;
    for (const t of TYPES) {
      if (!hasKeepRange(t)) continue;
      // その型の噛みつきが「始まる」最大の中心間距離を、実物の述語で走査して求める。
      const ref = spawnEnemyAt(t, 0, 0, 1000) as Enemy;
      const rb = enemyContactBox(ref);
      const offX = rb.x + rb.width / 2 - ref.x, offY = rb.y + rb.height / 2 - ref.y;
      const spec = biteSpecFor(t);
      let biteStartMax = 0;
      for (let d = 0; d <= 300; d++) {
        const e = spawnEnemyAt(t, phcx + d - offX, phcy - offY, 1000) as Enemy;
        const eb = enemyContactBox(e);
        const rr = biteReachRect(
          { cx: eb.x + eb.width / 2, cy: eb.y + eb.height / 2, w: eb.width, h: eb.height },
          phcx, phcy, spec.rangePx);
        if (isInBiteRect(rr, ph)) biteStartMax = d;
      }
      // 線は噛みつきの発火距離より内側=噛みの届く所と技の出せる所が**重なる**(隙間が無い)。
      expect(KEEP_TECHNIQUE_NEAR_FLOOR_PX, `${t}: 噛みの発火${biteStartMax}px より内側であること`)
        .toBeLessThanOrEqual(biteStartMax);
      // その距離で実際に技が禁止されていないこと。
      expect(keepBlocksTechnique(t, 'e1', 1000, PUMPKIN_TRIGGER_RANGE, biteStartMax), t).toBe(false);
    }
  });

  it('★社長が踏んだ距離(90/120/160px)で技が禁止されない', () => {
    for (const d of [90, 120, 160, 200]) {
      expect(keepBlocksTechnique('pumpkin', 'e1', 1000, PUMPKIN_TRIGGER_RANGE, d), `${d}px`).toBe(false);
    }
  });

  it('★個体差(好みの散らし)で線が動かない: 同じ距離なら全個体で同じ答え', () => {
    for (const d of [49, 51, 120]) {
      const answers = new Set([0, 1, 2, 3, 4, 5].map(k =>
        keepBlocksTechnique('pumpkin', `e${k}`, 1000 + k, PUMPKIN_TRIGGER_RANGE, d)));
      expect(answers.size, `${d}px`).toBe(1);
    }
  });

  it('保つ層を持たない型は従来どおり一度も禁止されない', () => {
    for (const d of [0, 18, 50, 200]) {
      expect(keepBlocksTechnique('zombie', 'e1', 1000, PUMPKIN_TRIGGER_RANGE, d)).toBe(false);
    }
  });
});
