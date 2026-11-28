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
  resolveSortieRunPatrol, clearSortiePatrolPlan,
} = await import('./sortiePatrolPlan');
const { RUN_MUTANT_BOSS_CHANCE } = await import('./wraithScript');

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++] ?? 0; };
const ALL = ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'];

beforeEach(() => { clearSortiePatrolPlan(); store.clear(); });

describe('作戦室での抽選', () => {
  it('枠の確率を超えたら「なし」(乱数は1回だけ)', () => {
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
  it('確認用の forceOpen は枠の確率を飛ばす(乱数は誰・どこの2回だけ)', () => {
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

describe('出撃のたびの使い方(作戦室→出撃/もう一度プレイ)', () => {
  const input = { sortieableStageIds: ALL, stage1CastleCleared: true };
  const noRoll = () => { throw new Error('引き直してはいけない'); };
  it('対象外のステージへ出撃しても保存は消え、次に作戦室を開けば引き直す', () => {
    ensureSortiePatrolPlan(input, seq(0.9)); // 「なし」
    expect(resolveSortieRunPatrol('stage-2', noRoll)).toBe('none');
    expect(loadSortiePatrolPlan()).toBeNull();
    expect(ensureSortiePatrolPlan(input, seq(0, 0, 0))).toEqual({ boss: 'astro', stageId: 'stage-1' });
  });
  it('もう一度プレイ(作戦室を通らない)は直前の出撃と同じボスが同じステージで出る', () => {
    ensureSortiePatrolPlan(input, seq(0, 0.5, 0.9)); // 亡霊・ステージ5
    expect(resolveSortieRunPatrol('stage-5', noRoll)).toBe('wraith');
    expect(resolveSortieRunPatrol('stage-5', noRoll)).toBe('wraith');
    expect(resolveSortieRunPatrol('stage-5', noRoll)).toBe('wraith');
  });
  // 社長指示2026-11-28「もう一度 の時は出てね」: 前のランで倒した/退散した/時間で帰った、のどれでも、もう一度では同じボスを出す。
  // 結果の決め方はランの成り行きを一切受け取らない(ラン内の出た・倒した・退散の印は useGameLoop が新ランで全部戻す)=ここで固定する。
  it.each(['倒した', '退散した', '時間で帰った'])('前のランで%s場合も、もう一度プレイで同じボスが出る', () => {
    ensureSortiePatrolPlan(input, seq(0, 0.9, 0)); // 孫悟空・ステージ1
    expect(resolveSortieRunPatrol('stage-1', noRoll)).toBe('brawler');
    // (前のランの成り行き: どれであっても保存・メモリには何も書かない)
    expect(resolveSortieRunPatrol('stage-1', noRoll)).toBe('brawler');
    expect(resolveSortieRunPatrol('stage-1', noRoll)).toBe('brawler');
  });
  it('直前が「なし」なら、もう一度プレイも「なし」(引き直さない)', () => {
    ensureSortiePatrolPlan(input, seq(0.9));
    expect(resolveSortieRunPatrol('stage-3', noRoll)).toBe('none');
    expect(resolveSortieRunPatrol('stage-3', noRoll)).toBe('none');
  });
  it('作戦室を経た出撃は、新しく引いた結果に置き換わる', () => {
    ensureSortiePatrolPlan(input, seq(0, 0.5, 0.9));
    expect(resolveSortieRunPatrol('stage-5', noRoll)).toBe('wraith');
    ensureSortiePatrolPlan(input, seq(0.9)); // 作戦室を開き直した=新しく引く(なし)
    expect(resolveSortieRunPatrol('stage-5', noRoll)).toBe('none');
    expect(resolveSortieRunPatrol('stage-5', noRoll)).toBe('none');
  });
  it('起動直後に作戦室を通らない出撃だけ、ステージに入った時に引き、その結果をもう一度プレイでも使う', () => {
    let rolled = 0;
    const fb = () => { rolled++; return 'brawler' as const; };
    expect(resolveSortieRunPatrol('stage-4', fb)).toBe('brawler');
    expect(resolveSortieRunPatrol('stage-4', fb)).toBe('brawler');
    expect(rolled).toBe(1);
  });
});
