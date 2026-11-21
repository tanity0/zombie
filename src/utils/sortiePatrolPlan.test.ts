// 作戦室での徘徊の枠の抽選・保存・消費(research/SORTIE_MAP_BOSS_ICONS.md §3)。乱数は注入。
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const {
  rollSortiePatrolPlan, patrolBossStages, patrolBossForRun, resolveRunPatrol, parseSortiePatrolPlan,
  ensureSortiePatrolPlan, takeSortiePatrolPlan, loadSortiePatrolPlan, SORTIE_PATROL_KEY,
} = await import('./sortiePatrolPlan');
const { RUN_MUTANT_BOSS_CHANCE } = await import('./wraithScript');

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++] ?? 0; };
const ALL = ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'];

beforeEach(() => { store.clear(); });

describe('作戦室での抽選', () => {
  it('20% を超えたら「なし」(乱数は1回だけ)', () => {
    expect(rollSortiePatrolPlan({ sortieableStageIds: ALL, stage1CastleCleared: true }, seq(RUN_MUTANT_BOSS_CHANCE))).toEqual({ boss: 'none' });
  });
  it('枠が開いたら顔ぶれから均等に1人 → その人の出られるステージから均等に1つ', () => {
    const input = { sortieableStageIds: ALL, stage1CastleCleared: true };
    expect(rollSortiePatrolPlan(input, seq(0, 0, 0))).toEqual({ boss: 'astro', stageId: 'stage-1' });
    expect(rollSortiePatrolPlan(input, seq(0, 0.5, 0.99))).toEqual({ boss: 'wraith', stageId: 'stage-5' });
    expect(rollSortiePatrolPlan(input, seq(0, 0.99, 0.3))).toEqual({ boss: 'brawler', stageId: 'stage-3' });
  });
  it('出撃できないステージ・枠の無いステージは選ばない', () => {
    expect(patrolBossStages('astro', { sortieableStageIds: ['stage-1', 'stage-2'], stage1CastleCleared: false })).toEqual(['stage-1']);
  });
  it('拳鬼: ステージ1は城のボス撃破後だけ。出られるステージが無ければ顔ぶれから抜ける', () => {
    const early = { sortieableStageIds: ['stage-1', 'stage-2'], stage1CastleCleared: false };
    expect(patrolBossStages('brawler', early)).toEqual([]);
    // 顔ぶれ=宇宙飛行群・亡霊の2人 → 0.99 は亡霊
    expect(rollSortiePatrolPlan(early, seq(0, 0.99, 0))).toEqual({ boss: 'wraith', stageId: 'stage-1' });
    expect(patrolBossStages('brawler', { ...early, stage1CastleCleared: true })).toEqual(['stage-1']);
  });
  it('出られるステージが誰にも無ければ「なし」', () => {
    expect(rollSortiePatrolPlan({ sortieableStageIds: ['stage-2'], stage1CastleCleared: true }, seq(0, 0, 0))).toEqual({ boss: 'none' });
  });
  it('確認用の forceOpen は 20% を飛ばす(乱数は誰・どこの2回だけ)', () => {
    expect(rollSortiePatrolPlan({ sortieableStageIds: ALL, stage1CastleCleared: true, forceOpen: true }, seq(0, 0))).toEqual({ boss: 'astro', stageId: 'stage-1' });
  });
});

describe('出撃した時の使い方', () => {
  it('保存のステージと同じ時だけ出る', () => {
    expect(patrolBossForRun({ boss: 'wraith', stageId: 'stage-3' }, 'stage-3')).toBe('wraith');
    expect(patrolBossForRun({ boss: 'wraith', stageId: 'stage-3' }, 'stage-4')).toBe('none');
    expect(patrolBossForRun({ boss: 'none' }, 'stage-3')).toBe('none');
  });
  it('保存があれば今の抽選を引かない。無い時だけ引く', () => {
    let rolled = 0;
    const fb = () => { rolled++; return 'astro' as const; };
    expect(resolveRunPatrol({ boss: 'none' }, 'stage-1', fb)).toBe('none');
    expect(rolled).toBe(0);
    expect(resolveRunPatrol(null, 'stage-1', fb)).toBe('astro');
    expect(rolled).toBe(1);
  });
});

describe('保存と消費', () => {
  it('「なし」も保存し、開き直しても引き直さない', () => {
    const input = { sortieableStageIds: ALL, stage1CastleCleared: true };
    const first = ensureSortiePatrolPlan(input, seq(0.9));
    expect(first).toEqual({ boss: 'none' });
    expect(store.get(SORTIE_PATROL_KEY)).toBe(JSON.stringify({ boss: 'none' }));
    expect(ensureSortiePatrolPlan(input, seq(0, 0, 0))).toEqual({ boss: 'none' });
  });
  it('出撃で取り出すと消え、次は引き直す', () => {
    const input = { sortieableStageIds: ALL, stage1CastleCleared: true };
    ensureSortiePatrolPlan(input, seq(0, 0, 0));
    expect(takeSortiePatrolPlan()).toEqual({ boss: 'astro', stageId: 'stage-1' });
    expect(loadSortiePatrolPlan()).toBeNull();
    expect(takeSortiePatrolPlan()).toBeNull();
    expect(ensureSortiePatrolPlan(input, seq(0.9))).toEqual({ boss: 'none' });
  });
  it('確認用の reroll は保存があっても引き直す', () => {
    const input = { sortieableStageIds: ALL, stage1CastleCleared: true };
    ensureSortiePatrolPlan(input, seq(0.9));
    expect(ensureSortiePatrolPlan(input, seq(0, 0, 0), true)).toEqual({ boss: 'astro', stageId: 'stage-1' });
  });
  it('壊れた保存は「保存なし」扱い', () => {
    expect(parseSortiePatrolPlan('{')).toBeNull();
    expect(parseSortiePatrolPlan(JSON.stringify({ boss: 'thor' }))).toBeNull();
    expect(parseSortiePatrolPlan(JSON.stringify({ boss: 'astro' }))).toBeNull();
    expect(parseSortiePatrolPlan(JSON.stringify({ boss: 'astro', stageId: 'stage-4' }))).toEqual({ boss: 'astro', stageId: 'stage-4' });
  });
});
