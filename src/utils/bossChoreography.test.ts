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
      thor: ['issen', 'tsuki', 'harai', 'jump', 'dash'],
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

// ★research/THOR_ISSEN_REWORK.md §4(社長裁定2026-08-21「突進足して。で、突 突 を付けて」)。
describe('トールの新起点「突進」(v0.25.3780)', () => {
  // ★§9-13 実施(社長指示「突 突 を付けて」): 突進の起点だけ長さの特例で **Phase1 でも3手**。
  it("planBossChoreography('thor','dash',phase) が全フェーズで ['dash','tsuki','tsuki']", () => {
    expect(planBossChoreography('thor', 'dash', 1)).toEqual(['dash', 'tsuki', 'tsuki']);
    expect(planBossChoreography('thor', 'dash', 2)).toEqual(['dash', 'tsuki', 'tsuki']);
    expect(planBossChoreography('thor', 'dash', 3)).toEqual(['dash', 'tsuki', 'tsuki']);
  });

  it('★既存4起点(issen/tsuki/harai/jump)が1文字も変わっていない', () => {
    expect(planBossChoreography('thor', 'issen', 3)).toEqual(['issen', 'harai', 'tsuki']);
    expect(planBossChoreography('thor', 'tsuki', 3)).toEqual(['tsuki', 'issen', 'harai']);
    expect(planBossChoreography('thor', 'harai', 3)).toEqual(['harai', 'tsuki', 'issen']);
    expect(planBossChoreography('thor', 'jump', 3)).toEqual(['jump', 'harai', 'tsuki']);
    // Phase1(先頭2手)も不変
    expect(planBossChoreography('thor', 'issen', 1)).toEqual(['issen', 'harai']);
    expect(planBossChoreography('thor', 'jump', 1)).toEqual(['jump', 'harai']);
  });

  it('★他ボスの台本が1つも変わっていない(長さと中身)', () => {
    expect(planBossChoreography('miguel', 'dash', 3)).toEqual(['dash', 'harai', 'volley']);
    expect(planBossChoreography('mimir', 'dash', 3)).toEqual(['dash', 'bite', 'burst']);
    expect(planBossChoreography('jormungand', 'dash', 3)).toEqual(['dash', 'coil', 'burst']);
    expect(planBossChoreography('skadi', 'dash', 3)).toEqual(['dash', 'ice', 'blade']);
    expect(planBossChoreography('giant', 'dash', 3)).toEqual(['dash', 'stomp', 'bolt']);
    expect(planBossChoreography('glen', 'dash', 3)).toEqual(['dash', 'talon']); // reachは恒久除外(v0.25.3033)
  });

  it('同じ技(tsuki)が連続する台本を、キューの取り出し(slice)が潰さない', () => {
    // 実戦のキューは `plan(...).slice(1)` を積んで先頭から1つずつ消費する。重複を潰す実装ではない。
    const plan = planBossChoreography('thor', 'dash', 2);
    const queue = plan.slice(1);
    expect(queue).toEqual(['tsuki', 'tsuki']);
    const [first, ...rest] = queue;
    expect(first).toBe('tsuki');
    expect(rest).toEqual(['tsuki']); // 2手目も残る(重複が消えていない)
  });

  // ★§9-13 の値テスト: 特例は「トールの突進起点1本だけ」に閉じていること。
  // 「長さの特例が漏れていない」ことの機械検査=**dash起点だけ phase1 で3手 / 他4起点は2手**。
  it('★長さの特例: 突進起点だけ phase1 で3手・既存4起点は phase1 で2手のまま', () => {
    expect(planBossChoreography('thor', 'dash', 1).length).toBe(3);
    for (const opening of ['issen', 'tsuki', 'harai', 'jump']) {
      expect(planBossChoreography('thor', opening, 1).length).toBe(2);
    }
  });

  it('★phase2以降はトールの全5起点が3手(特例の有無で差が出ない)', () => {
    for (const opening of ['dash', 'issen', 'tsuki', 'harai', 'jump']) {
      for (const phase of [2, 3]) {
        expect(planBossChoreography('thor', opening, phase).length).toBe(3);
      }
    }
  });

  it('★特例が他ボスへ漏れていない: 全ボスの dash 起点は phase1 で2手のまま(トールを除く)', () => {
    const dashBosses = ['giant', 'mimir', 'jormungand', 'skadi', 'miguel'] as const;
    for (const boss of dashBosses) {
      expect(planBossChoreography(boss, 'dash', 1).length).toBe(2);
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
