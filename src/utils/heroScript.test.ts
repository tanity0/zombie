// research/MUTANT_HERO.md: 英雄(変異)の台本(純関数)のテスト。
import { describe, it, expect } from 'vitest';
import {
  heroNotices, heroHealAfterHits, heroShouldAscend, heroAscendLook,
  HERO_MAX_HP, HERO_START_HP, HERO_HEAL_PER_HIT, HERO_HEAL_PER_KILL, HERO_ASCEND_MS, HERO_ASCEND_RISE_MS, HERO_ASCEND_CLIMAX_MS,
  heroSwingArc, heroPatrolRadius, heroPatrolNext, heroPatrolNearest, HERO_PATROL_STAGES, HERO_PATROL_SPEED, HERO_WALK_SPEED, HERO_GALLOP_SPEED,
  HERO_MOVES, HERO_NEAR, HERO_MID, HERO_AGGRO_RANGE, HERO_LURE_RANGE, heroMoveCandidates, pickHeroMove, pickHeroTarget,
  heroFollowUp, heroStepShape, heroStepHitDelay, circleHitsHeroShape, circleHitsFan, mobPrefersHero, heroFrameFor, heroLiftPx, HERO_SHEETS,
} from './heroScript';
import { AOE_TELEGRAPH_AUDIT } from './bossTelegraph';

describe('技の表', () => {
  it('全技・全段にダメージと溜めがあり、当たる時刻=溜め+動き', () => {
    for (const m of Object.values(HERO_MOVES)) {
      expect(m.steps.length).toBeGreaterThan(0);
      for (const st of m.steps) {
        expect(st.damage).toBeGreaterThan(0);
        expect(st.windupMs).toBeGreaterThan(0);
        expect(heroStepHitDelay(st)).toBe(st.windupMs + st.motionMs);
      }
    }
  });
  it('三連は段ごとに別の予告(3段・2段目が一番速い)', () => {
    const c = HERO_MOVES.combo.steps;
    expect(c).toHaveLength(3);
    expect(c[1].windupMs).toBeLessThan(c[0].windupMs);
    expect(c[1].windupMs).toBeLessThan(c[2].windupMs);
  });
  it('払い上げは極端に遅く、タックルは極端に速い(機械的な等間隔にしない)', () => {
    // 技の出だし(1段目)どうしで比べる。三連の2段目(つなぎの中の速い一撃)は別枠。
    const all = Object.values(HERO_MOVES).map(m => m.steps[0].windupMs);
    expect(HERO_MOVES.upper.steps[0].windupMs).toBeGreaterThanOrEqual(1200);
    expect(HERO_MOVES.tackle.steps[0].windupMs).toBe(Math.min(...all));
  });
  it('跳躍・棹立ちの円は逃げ切り監査(AOE_TELEGRAPH_AUDIT)に載っていて、値が台本と一致', () => {
    const leap = AOE_TELEGRAPH_AUDIT.find(a => a.name.startsWith('mutant-hero-leap'))!;
    const ls = HERO_MOVES.leap.steps[0];
    expect(leap.escapeMs).toBe(heroStepHitDelay(ls));
    expect(ls.shape.kind === 'circle' && ls.shape.radius).toBe(leap.radiusPx);
    const rear = AOE_TELEGRAPH_AUDIT.find(a => a.name.startsWith('mutant-hero-rear'))!;
    const rs = HERO_MOVES.rear.steps[0];
    expect(rear.escapeMs).toBe(heroStepHitDelay(rs));
    expect(rs.shape.kind === 'circle' && rs.shape.radius).toBe(rear.radiusPx);
    expect(rear.standDistPx).toBe(HERO_NEAR);
  });
});

describe('技の選び方', () => {
  it('距離の帯で候補が決まる(後半だけ跳躍→突進が増える)', () => {
    expect(heroMoveCandidates(100, false)).toEqual(['combo', 'upper', 'tackle']);
    expect(heroMoveCandidates(200, false)).toEqual(['overhead', 'sweep', 'rear']);
    expect(heroMoveCandidates(400, false)).toEqual(['leap', 'charge']);
    expect(heroMoveCandidates(400, true)).toContain('leapcharge');
    expect(heroMoveCandidates(HERO_NEAR, false)).toContain('overhead');
    expect(heroMoveCandidates(HERO_MID, false)).toContain('leap');
  });
  it('直前と同じ技は避ける', () => {
    for (let r = 0; r < 1; r += 0.1) expect(pickHeroMove(200, false, 'sweep', r)).not.toBe('sweep');
  });
  it('つなぎ: タックルが当たったら振り下ろし / 突進の後に中距離なら横薙ぎ', () => {
    expect(heroFollowUp('tackle', true, 50)).toBe('overhead');
    expect(heroFollowUp('tackle', false, 50)).toBeNull();
    expect(heroFollowUp('charge', false, 200)).toBe('sweep');
    expect(heroFollowUp('charge', false, 600)).toBeNull();
    expect(heroFollowUp('sweep', true, 200)).toBeNull();
  });
});

describe('狙い(中立)', () => {
  const c = (id: string, x: number, y: number, onScreen = true) => ({ id, x, y, onScreen });
  it('範囲内で画面内の一番近い相手(プレイヤーもゾンビも区別しない)', () => {
    expect(pickHeroTarget(0, 0, [c('player', 300, 0), c('z1', 100, 0)], undefined, undefined, 0)?.id).toBe('z1');
    expect(pickHeroTarget(0, 0, [c('player', 100, 0), c('z1', 300, 0)], undefined, undefined, 0)?.id).toBe('player');
    expect(pickHeroTarget(0, 0, [c('z1', 50, 0, false)], undefined, undefined, 0)).toBeNull();
    expect(pickHeroTarget(0, 0, [c('z1', HERO_AGGRO_RANGE + 1, 0)], undefined, undefined, 0)).toBeNull();
  });
  it('粘りの間は相手を変えない(相手が消えた時を除く)', () => {
    const cands = [c('player', 300, 0), c('z1', 100, 0)];
    expect(pickHeroTarget(0, 0, cands, 'player', 1000, 500)?.id).toBe('player');
    expect(pickHeroTarget(0, 0, cands, 'player', 1000, 1500)?.id).toBe('z1');
    expect(pickHeroTarget(0, 0, [c('z1', 100, 0)], 'player', 1000, 500)?.id).toBe('z1');
  });
  it('雑魚が英雄を追うのは、英雄が近い範囲内でプレイヤーより近い時だけ', () => {
    expect(mobPrefersHero(0, 0, 100, 0, 300, 0)).toBe(true);
    expect(mobPrefersHero(0, 0, 300, 0, 100, 0)).toBe(false);
    expect(mobPrefersHero(0, 0, HERO_LURE_RANGE + 10, 0, 2000, 0)).toBe(false);
  });
});

describe('当たりの形', () => {
  it('帯は溜め開始の位置から狙いへ向く(踏み込みの終点も同じ向き)', () => {
    const r = heroStepShape(HERO_MOVES.overhead.steps[0], 0, 0, 100, 0, 1);
    expect(r.shape.kind).toBe('band');
    if (r.shape.kind === 'band') { expect(r.shape.fx).toBe(0); expect(r.shape.tx).toBeCloseTo(260); }
    expect(r.endX).toBeCloseTo(60);
  });
  it('跳躍の着地円は相手の位置(最大360px先)', () => {
    const near = heroStepShape(HERO_MOVES.leap.steps[0], 0, 0, 200, 0, 1);
    expect(near.shape.kind === 'circle' && near.shape.cx).toBeCloseTo(200);
    const far = heroStepShape(HERO_MOVES.leap.steps[0], 0, 0, 800, 0, 1);
    expect(far.shape.kind === 'circle' && far.shape.cx).toBeCloseTo(360);
  });
  it('突進の当たりは終点の扇だけ(道筋は形に入らない)', () => {
    const r = heroStepShape(HERO_MOVES.charge.steps[0], 0, 0, 1000, 0, 1);
    expect(r.shape.kind).toBe('fan');
    if (r.shape.kind === 'fan') expect(r.shape.cx).toBeCloseTo(520);
    // 道の途中(260px)に立っていても当たらない
    expect(circleHitsHeroShape(260, 0, 20, r.shape)).toBe(false);
    expect(circleHitsHeroShape(600, 0, 20, r.shape)).toBe(true);
  });
  it('扇: 縁の外・角度の外は当たらない', () => {
    const a = 0, half = Math.PI / 4;
    expect(circleHitsFan(100, 0, 10, 0, 0, a, half, 200)).toBe(true);
    expect(circleHitsFan(0, 150, 10, 0, 0, a, half, 200)).toBe(false);
    expect(circleHitsFan(260, 0, 10, 0, 0, a, half, 200)).toBe(false);
  });
  it('払い上げは顔の向きの右側へずれる(左向きなら反対)', () => {
    const rr = heroStepShape(HERO_MOVES.upper.steps[0], 0, 0, 100, 0, 1);
    const rl = heroStepShape(HERO_MOVES.upper.steps[0], 0, 0, 100, 0, -1);
    if (rr.shape.kind === 'fan' && rl.shape.kind === 'fan') {
      expect(rr.shape.angle).toBeGreaterThan(0);
      expect(rl.shape.angle).toBeLessThan(0);
    }
  });
});

describe('絵のコマ', () => {
  it('構えで技を見分ける: 振り下ろしは頭上(斬撃10)・横薙ぎは水平(斬撃3)・払い上げは下段(斬撃15)で止まる', () => {
    const w = (move: 'overhead' | 'sweep' | 'upper') => heroFrameFor({ state: 'hero-windup', move, step: 0, u: 0.9, sinceMs: 0 });
    expect(w('overhead')).toEqual({ sheet: 'slash', frame: 10 });
    expect(w('sweep')).toEqual({ sheet: 'slash', frame: 3 });
    expect(w('upper')).toEqual({ sheet: 'slash', frame: 15 });
  });
  it('棹立ちは前脚が着く瞬間(溜めの終わり)で12', () => {
    expect(heroFrameFor({ state: 'hero-windup', move: 'rear', step: 0, u: 0.999, sinceMs: 0 })).toEqual({ sheet: 'rear', frame: 12 });
    expect(heroFrameFor({ state: 'hero-windup', move: 'rear', step: 0, u: 0.75, sinceMs: 0 })).toEqual({ sheet: 'rear', frame: 7 });
  });
  it('コマ番号はシートの範囲内', () => {
    const states = ['hero-idle', 'hero-roar', 'hero-turn', 'hero-windup', 'hero-motion', 'hero-strike', 'hero-recover'];
    for (const mv of Object.keys(HERO_MOVES) as (keyof typeof HERO_MOVES)[]) {
      for (let step = 0; step < HERO_MOVES[mv].steps.length; step++) {
        for (const st of states) {
          for (const u of [0, 0.3, 0.7, 0.99]) {
            const f = heroFrameFor({ state: st, move: mv, step, u, sinceMs: u * 5000 });
            if (f) { expect(f.frame).toBeGreaterThanOrEqual(0); expect(f.frame).toBeLessThan(HERO_SHEETS[f.sheet].frames); }
          }
        }
      }
    }
  });
  it('跳躍の高さは滞空の間だけ(着地で0)', () => {
    expect(heroLiftPx({ bossState: 'hero-motion', heroMove: 'leap', heroStateAt: 0, bossStateUntil: 400 }, 200)).toBeGreaterThan(50);
    expect(heroLiftPx({ bossState: 'hero-motion', heroMove: 'leap', heroStateAt: 0, bossStateUntil: 400 }, 400)).toBeCloseTo(0);
    expect(heroLiftPx({ bossState: 'hero-windup', heroMove: 'leap', heroStateAt: 0, bossStateUntil: 400 }, 200)).toBe(0);
    expect(heroLiftPx({ bossState: 'hero-motion', heroMove: 'charge', heroStateAt: 0, bossStateUntil: 400 }, 200)).toBe(0);
  });
});

describe('寄りズーム(社長裁定: プレイヤーを狙っている間だけ)', () => {
  it('プレイヤーか守護霊を狙っている時だけ寄る', async () => {
    const { heroZoomEligible } = await import('./heroScript');
    expect(heroZoomEligible({ type: 'mutant-hero', heroTargetId: 'player', health: 10 })).toBe(true);
    expect(heroZoomEligible({ type: 'mutant-hero', heroTargetId: 'ghost', health: 10 })).toBe(true);
    expect(heroZoomEligible({ type: 'mutant-hero', heroTargetId: 'enemy-zombie-1', health: 10 })).toBe(false);
    expect(heroZoomEligible({ type: 'mutant-hero', heroTargetId: undefined, health: 10 })).toBe(false);
    expect(heroZoomEligible({ type: 'mutant-hero', heroTargetId: 'player', health: 0 })).toBe(false);
    expect(heroZoomEligible({ type: 'zombie', heroTargetId: 'player', health: 10 })).toBe(false);
  });
});

describe('扇の振りの道(heroSwingArc)', () => {
  const D = Math.PI / 180;
  const upper = (a: number) => Math.sin(a);
  it('左右どちらへ斬っても、上側の縁から下側の縁へ振り下ろす', () => {
    for (const ang of [0, Math.PI, 30 * D, 150 * D, -150 * D]) {
      const { start, end } = heroSwingArc(ang, 70 * D, false);
      expect(upper(start)).toBeLessThanOrEqual(upper(end)); // 画面は下ほど y が大きい
      // 中心線を通る(start→end の途中に angle がある)
      const mid = (start + end) / 2;
      expect(Math.abs(Math.atan2(Math.sin(mid - ang), Math.cos(mid - ang)))).toBeLessThan(1e-9);
    }
  });
  it('真上・真下へ斬る時は向いている側の縁から振る(狙いが少し動いても入れ替わらない)', () => {
    for (const ang of [-Math.PI / 2, -Math.PI / 2 + 5 * D, Math.PI / 2 - 5 * D]) {
      expect(Math.cos(heroSwingArc(ang, 70 * D, false, 1).start)).toBeGreaterThan(0);
      expect(Math.cos(heroSwingArc(ang, 70 * D, false, -1).start)).toBeLessThan(0);
    }
  });
  it('払い上げだけは下側から上側へ', () => {
    for (const ang of [0, Math.PI]) {
      const { start, end } = heroSwingArc(ang, 50 * D, true);
      expect(upper(start)).toBeGreaterThanOrEqual(upper(end));
    }
  });
});

describe('本編の周回(社長指示2026-10-04)', () => {
  it('出るのはステージ1・3・4・5だけ', () => {
    expect([...HERO_PATROL_STAGES].sort()).toEqual(['stage-1', 'stage-3', 'stage-4', 'stage-5']);
  });
  it('半径はデンジャーゾーン(区域2)の輪の真ん中', () => {
    expect(heroPatrolRadius([2250, 4500, 7500, 11250])).toBe(6000);
  });
  it('画面で見て反時計回り(角度が減る向き)に進み、輪の上に乗る', () => {
    const R = 6000;
    for (const a0 of [0, 1, 2.5, -2]) {
      const n = heroPatrolNext(Math.cos(a0) * R, Math.sin(a0) * R, R, 200);
      let d = Math.atan2(n.y, n.x) - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
      expect(d).toBeLessThan(0);
      expect(Math.hypot(n.x, n.y)).toBeCloseTo(R, 6);
    }
  });
  it('輪から外れた所からは、同じ向きの輪の上へ帰る', () => {
    const p = heroPatrolNearest(3000, 4000, 6000);
    expect(p.x).toBeCloseTo(3600, 6); expect(p.y).toBeCloseTo(4800, 6);
  });
  it('ゆっくり(歩きより遅い)。見つけた/戻る時は駆ける(歩きより速い)', () => {
    expect(HERO_PATROL_SPEED).toBeLessThan(HERO_WALK_SPEED);
    expect(HERO_GALLOP_SPEED).toBeGreaterThan(HERO_WALK_SPEED * 2);
  });
});

describe('英雄の気づき(社長裁定2026-10-05「前方扇状で、後方は見ない。攻撃されると気付く」)', () => {
  const c = (id: string, x: number, y: number, onScreen = true) => ({ id, x, y, onScreen });
  const none = { currentId: undefined, struckPlayer: false, struckGhost: false, struckMob: false };
  it('プレイヤーは前方の扇(900px)なら画面外でも見つけ、後ろはすぐ隣でも見ない', () => {
    expect(heroNotices(0, 0, 1, 0, c('player', 800, 0, false), none)).toBe(true);
    expect(heroNotices(0, 0, 1, 0, c('player', 950, 0), none)).toBe(false);
    expect(heroNotices(0, 0, 1, 0, c('player', -40, 0), none)).toBe(false);
    expect(heroNotices(0, 0, 1, 0, c('player', 0, 60), none)).toBe(false);
  });
  it('殴られたら後ろでも気づく(守護霊も同じ)', () => {
    expect(heroNotices(0, 0, 1, 0, c('player', -40, 0), { ...none, struckPlayer: true })).toBe(true);
    expect(heroNotices(0, 0, 1, 0, c('ghost', -40, 0), { ...none, struckGhost: true })).toBe(true);
    expect(heroNotices(0, 0, 1, 0, c('ghost', -40, 0), { ...none, struckPlayer: true })).toBe(false);
  });
  it('敵は画面内だけ。誰からか分からない被弾では近く(480px)の敵に気づく', () => {
    expect(heroNotices(0, 0, 1, 0, c('z1', 300, 0, false), none)).toBe(false);
    expect(heroNotices(0, 0, 1, 0, c('z1', 300, 0), none)).toBe(true);
    expect(heroNotices(0, 0, 1, 0, c('z1', -100, 0), none)).toBe(false);
    expect(heroNotices(0, 0, 1, 0, c('z1', -100, 0), { ...none, struckMob: true })).toBe(true);
  });
  it('今の相手は1350pxまでは扇の外でも追う', () => {
    expect(heroNotices(0, 0, 1, 0, c('player', -1000, 0), { ...none, currentId: 'player' })).toBe(true);
    expect(heroNotices(0, 0, 1, 0, c('player', -1400, 0), { ...none, currentId: 'player' })).toBe(false);
  });
});

describe('英雄の体力と昇天(社長指示2026-10-05)', () => {
  it('上限20000・出てくる時は半分の10000', () => {
    expect(HERO_MAX_HP).toBe(20000);
    expect(HERO_START_HP).toBe(HERO_MAX_HP / 2);
  });
  it('当てると1体100・倒すと1体300回復し、上限で止まる', () => {
    // 社長指示2026-10-05: 当てると1体100(3体なら300)・倒すと1体300。
    expect(HERO_HEAL_PER_HIT).toBe(100);
    expect(HERO_HEAL_PER_KILL).toBe(300);
    expect(heroHealAfterHits(10000, HERO_MAX_HP, 3, 0)).toBe(10300);
    expect(heroHealAfterHits(10000, HERO_MAX_HP, 1, 2)).toBe(10700);
    expect(heroHealAfterHits(19950, HERO_MAX_HP, 2, 0)).toBe(HERO_MAX_HP);
    expect(heroHealAfterHits(10000, HERO_MAX_HP, 0, 0)).toBe(10000);
  });
  it('全回復で昇天する(昇天中はもう一度は始まらない・固定の上限でない英雄は昇天しない)', () => {
    expect(heroShouldAscend({ health: HERO_MAX_HP, maxHealth: HERO_MAX_HP })).toBe(true);
    expect(heroShouldAscend({ health: HERO_MAX_HP - 1, maxHealth: HERO_MAX_HP })).toBe(false);
    expect(heroShouldAscend({ health: HERO_MAX_HP, maxHealth: HERO_MAX_HP, bossState: 'hero-ascend' })).toBe(false);
    expect(heroShouldAscend({ health: 4000, maxHealth: 4000 })).toBe(false);
  });
  it('昇天: 踏み潰しの前脚を上げる所(棹立ち7)まで回して止める', () => {
    expect(heroFrameFor({ state: 'hero-ascend', step: 0, u: 0, sinceMs: 0 })).toEqual({ sheet: 'rear', frame: 0 });
    expect(heroFrameFor({ state: 'hero-ascend', step: 0, u: 0, sinceMs: HERO_ASCEND_RISE_MS * 0.99 })).toEqual({ sheet: 'rear', frame: 7 });
    expect(heroFrameFor({ state: 'hero-ascend', step: 0, u: 0, sinceMs: 4000 })).toEqual({ sheet: 'rear', frame: 7 });
  });
  it('昇天の見え方: 頭は静かに柱が差し、山場(消える直前)で一番強く光り、5秒で消え切る。体は浮かない', () => {
    const at0 = heroAscendLook(0), climax = heroAscendLook(HERO_ASCEND_CLIMAX_MS), end = heroAscendLook(HERO_ASCEND_MS);
    expect(at0.alpha).toBe(1); expect(at0.beam).toBe(0); expect(at0.flare).toBe(0);
    expect(climax.flare).toBeGreaterThan(heroAscendLook(2500).flare); // 消える所が山
    expect(heroAscendLook(4400).beam).toBeGreaterThan(1);            // 柱が一瞬強まる
    expect(end.alpha).toBe(0); expect(end.beam).toBe(0); expect(end.flare).toBe(0);
    expect(heroLiftPx({ bossState: 'hero-ascend', heroStateAt: 0 }, 3000)).toBe(0);
    let prev = 1;
    for (let t = 0; t <= HERO_ASCEND_MS; t += 100) { const a = heroAscendLook(t).alpha; expect(a).toBeLessThanOrEqual(prev + 1e-9); prev = a; }
  });
});
