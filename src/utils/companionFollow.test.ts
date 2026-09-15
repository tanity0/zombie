// チュートリアル随行NPCの追従チェーン(stepFollowChain)のユニット。
import { describe, it, expect } from 'vitest';
import { stepFollowChain, FOLLOW_GAP_PX } from './companionFollow';

const leader = { x: 0, y: 0 };

describe('stepFollowChain(軍人→衛生兵の数珠つなぎ追従)', () => {
  it('gap の外に居る時だけ近づき、gap 境界で止まる(押し合わない)', () => {
    const far = [{ x: 300, y: 0, face: 1 }];
    // 充分な時間を与えると gap ちょうどまで詰める
    const settled = stepFollowChain(leader, far, 10, 200);
    expect(Math.hypot(settled[0].x, settled[0].y)).toBeCloseTo(FOLLOW_GAP_PX, 5);
    // gap 内では動かない
    const near = [{ x: FOLLOW_GAP_PX - 10, y: 0, face: 1 }];
    const stay = stepFollowChain(leader, near, 1, 200);
    expect(stay[0].x).toBe(FOLLOW_GAP_PX - 10);
    expect(stay[0].moving).toBe(false);
  });

  it('1フレームの移動量は speed×dt でクランプされる(ワープしない)', () => {
    const far = [{ x: 1000, y: 0, face: 1 }];
    const stepped = stepFollowChain(leader, far, 0.016, 100); // 1.6px/frame
    expect(1000 - stepped[0].x).toBeLessThanOrEqual(100 * 0.016 + 1e-9);
    expect(stepped[0].moving).toBe(true);
  });

  it('2人目は1人目を追う(リーダー直行ではない)+左移動で face が左を向く', () => {
    const fs = [
      { x: 200, y: 0, face: 1 },   // 軍人
      { x: 500, y: 0, face: 1 },   // 衛生兵(軍人を追う)
    ];
    const next = stepFollowChain(leader, fs, 0.5, 100);
    // 衛生兵の目標は「更新後の軍人」= x=150 付近。左へ動くので face=-1
    expect(next[1].x).toBeLessThan(500);
    expect(next[1].face).toBe(-1);
    // 衛生兵は軍人を目標に動く(同速なので間隔は広がらない=数珠つなぎが切れない)
    const dToSoldier = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
    expect(dToSoldier).toBeLessThanOrEqual(300);
    // 目標が「更新後の軍人(150)」なら移動量50で450へ。リーダー(0)直行でも同値だが、
    // 数珠つなぎの検証は gap 内停止側で担保(軍人の gap 内に入ったら止まる)
    const settled = stepFollowChain(leader, fs, 10, 100);
    const gapToSoldier = Math.hypot(settled[1].x - settled[0].x, settled[1].y - settled[0].y);
    expect(gapToSoldier).toBeGreaterThanOrEqual(63); // 軍人基準の gap で停止(リーダー基準なら 64 より大きく離れる)
  });
});
