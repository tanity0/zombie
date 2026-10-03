// research/MUTANT_HERO.md: 英雄(変異)の台本(純関数)のテスト。
import { describe, it, expect } from 'vitest';
import {
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
