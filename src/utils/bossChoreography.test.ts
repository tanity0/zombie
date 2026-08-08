import { describe, expect, it } from 'vitest';
import { choreographyRecoverMs, planBossChoreography } from './bossChoreography';

describe('planBossChoreography', () => {
  it('uses two readable beats in phase 1 and three causal beats later', () => {
    expect(planBossChoreography('mimir', 'dash', 1)).toEqual(['dash', 'bite']);
    expect(planBossChoreography('mimir', 'dash', 2)).toEqual(['dash', 'bite', 'burst']);
  });
  it('turns isolated giant and angel moves into complete scripts', () => {
    expect(planBossChoreography('giant', 'wing', 2)).toEqual(['wing', 'bolt', 'sweepbeam']);
    expect(planBossChoreography('acrasiel', 'gaze', 3)).toEqual(['gaze', 'warp', 'burst']);
  });

  it('covers every selectable opening instead of leaving isolated attacks', () => {
    const openings = {
      giant: ['stomp', 'sweep', 'jump', 'dash', 'bolt', 'bite', 'slam', 'glide', 'dive', 'quaddash', 'nova', 'wing', 'sweepbeam'],
      glen: ['stomp', 'sweep', 'jump', 'dash', 'bolt', 'trijump', 'talon', 'boon', 'reach', 'nihil'],
      mimir: ['bite', 'radial', 'burst', 'laser', 'dash'],
      jormungand: ['radial', 'burst', 'dash', 'coil'],
      skadi: ['ice', 'blade', 'dash', 'burst', 'radial', 'cage'],
      thor: ['issen', 'tsuki', 'harai', 'jump'],
      miguel: ['dash', 'harai', 'volley'],
      jibril: ['lantern', 'consecrate', 'volley'],
      rafi: ['bone', 'jump', 'sweep'],
      uri: ['sweep', 'downslash', 'thrust', 'bolt'],
      suriel: ['ringshot', 'ringspin', 'sweep', 'gaze'],
      acrasiel: ['spike', 'spear', 'warp', 'burst', 'gaze'],
    } as const;
    for (const [boss, moves] of Object.entries(openings)) {
      for (const move of moves) {
        // glen: v0.25.3033のフィルタ(reach恒久除外・nihil/trijumpは第二形態のみ)込みで評価。
        // 第二形態(glenBigMoves)なら全開幕に連携が残る。boltの連携は「3連発→触手」の専用予約が担う
        // (bossChoreographyの外=gameStoreのg-bolt-burst終端)ため、この表からreachが消えるのは仕様。
        const opts = boss === 'glen' ? { glenBigMoves: true } : undefined;
        expect(planBossChoreography(boss as keyof typeof openings, move, 3, opts).length).toBeGreaterThan(1);
      }
    }
  });

  it('glen: reach(触手)はどの台本にも現れない(v0.25.3033・社長指示「3連発の後にのみ」)', () => {
    const heads = ['stomp', 'sweep', 'jump', 'dash', 'bolt', 'trijump', 'talon', 'boon', 'nihil'];
    for (const head of heads) {
      for (const opts of [undefined, { glenBigMoves: true }, { glenBigMoves: false }]) {
        const plan = planBossChoreography('glen', head, 3, opts);
        expect(plan.slice(1)).not.toContain('reach');
      }
    }
  });

  it('glen: 第一形態(glenBigMoves無し)の台本にnihil/trijumpが混ざらない(v0.25.3029裁定1い)', () => {
    const heads = ['stomp', 'sweep', 'jump', 'dash', 'bolt', 'talon', 'boon'];
    for (const head of heads) {
      const plan = planBossChoreography('glen', head, 3);
      expect(plan.slice(1)).not.toContain('nihil');
      expect(plan.slice(1)).not.toContain('trijump');
    }
  });
});

describe('choreographyRecoverMs', () => {
  it('compresses links and guarantees a two-hit rest after the string', () => {
    expect(choreographyRecoverMs(900, true)).toBe(300);
    expect(choreographyRecoverMs(900, false)).toBe(1700);
    expect(choreographyRecoverMs(2200, false)).toBe(2200);
  });
});
