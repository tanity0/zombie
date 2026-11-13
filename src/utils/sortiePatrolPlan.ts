// 徘徊の枠(宇宙飛行群・亡霊・拳鬼)の抽選を「作戦室を開いた時」に引き、次の出撃まで持っておく
// (research/SORTIE_MAP_BOSS_ICONS.md §3・社長裁定2026-11-13「出撃前画面表示で抽選タイミングにして、出現が確定したときだけマップに表示」)。
//
// - 作戦室(screen.name==='home')が表示された時、保存が無ければ1回だけ引いて保存する(「なし」も保存する)。
//   開き直し・再起動では引き直さない(出撃するまで同じ結果)。
// - 出撃した時(ゲームループの最初)に保存を取り出して消す。出撃先が保存のステージと同じ時だけそのボスが出る。
// - 保存が無い出撃(=作戦室を通らない「もう一度プレイ」)だけ、今どおりステージに入った時に抽選する(rollRunPatrolSlot)。
// - 練習ラン・ボス戦テスト・ボスメーカーは保存を使わず消さない(呼び出し側=useGameLoop のゲートで分ける)。
import { HERO_PATROL_STAGES } from './heroScript';
import { phantomBrawlerStageEligible } from './phantomBrawlerSpawn';
import { RUN_MUTANT_BOSS_CHANCE, type RunMutantBoss } from './wraithScript';

export const SORTIE_PATROL_KEY = 'sortie.patrol.v1';

export interface SortiePatrolPlan {
  boss: RunMutantBoss;
  /** 出るステージ(boss==='none' なら無し)。 */
  stageId?: string;
}

export interface SortiePatrolRollInput {
  /** 今の進行で出撃できるステージ(順不同)。 */
  sortieableStageIds: readonly string[];
  /** ステージ1の城のボスを一度でも倒したか(拳鬼のステージ1の条件)。 */
  stage1CastleCleared: boolean;
  /** 確認用(?mapbossdemo=1): 20% を飛ばして必ず枠を開く。 */
  forceOpen?: boolean;
}

const pickIndex = (r: number, n: number): number =>
  (Number.isFinite(r) ? Math.max(0, Math.min(n - 1, Math.floor(r * n))) : 0);

/** その1人が出られるステージ(HERO_PATROL_STAGES の並び順)。 */
export const patrolBossStages = (boss: Exclude<RunMutantBoss, 'none'>, input: Pick<SortiePatrolRollInput, 'sortieableStageIds' | 'stage1CastleCleared'>): string[] =>
  HERO_PATROL_STAGES.filter(s => input.sortieableStageIds.includes(s)
    && (boss !== 'brawler' || phantomBrawlerStageEligible(s, input.stage1CastleCleared)));

/**
 * 作戦室での抽選(純関数・乱数は注入)。①20%で枠が開く ②顔ぶれ(出られるステージが1つでもある人だけ・並びは
 * 宇宙飛行群→亡霊→拳鬼)から均等に1人 ③その人が出られるステージから均等に1つ。出られる人が居なければ「なし」。
 */
export const rollSortiePatrolPlan = (input: SortiePatrolRollInput, rng: () => number): SortiePatrolPlan => {
  if (!input.forceOpen && rng() >= RUN_MUTANT_BOSS_CHANCE) return { boss: 'none' };
  const who = (['astro', 'wraith', 'brawler'] as const).filter(b => patrolBossStages(b, input).length > 0);
  if (who.length === 0) return { boss: 'none' };
  const boss = who[pickIndex(rng(), who.length)];
  const stages = patrolBossStages(boss, input);
  return { boss, stageId: stages[pickIndex(rng(), stages.length)] };
};

/** 出撃したステージで、保存した結果から出るボス(ステージが違えば 'none')。純関数。 */
export const patrolBossForRun = (plan: SortiePatrolPlan, stageId: string): RunMutantBoss =>
  (plan.boss !== 'none' && plan.stageId === stageId ? plan.boss : 'none');

/**
 * ランの徘徊の枠を決める(純関数)。保存した結果があればそれを使い(ステージが一致した時だけ出す)、
 * 無ければ今の「ステージに入った時の抽選」(fallbackRoll)を使う。
 */
export const resolveRunPatrol = (plan: SortiePatrolPlan | null, stageId: string, fallbackRoll: () => RunMutantBoss): RunMutantBoss =>
  (plan ? patrolBossForRun(plan, stageId) : fallbackRoll());

const VALID: readonly RunMutantBoss[] = ['astro', 'wraith', 'brawler', 'none'];

/** 保存の読み取り(壊れていれば null=保存なし扱い)。純関数。 */
export const parseSortiePatrolPlan = (raw: string | null): SortiePatrolPlan | null => {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { boss?: unknown; stageId?: unknown };
    if (!v || !VALID.includes(v.boss as RunMutantBoss)) return null;
    const boss = v.boss as RunMutantBoss;
    if (boss === 'none') return { boss };
    if (typeof v.stageId !== 'string') return null;
    return { boss, stageId: v.stageId };
  } catch {
    return null;
  }
};

/** 保存した結果(無ければ null)。 */
export const loadSortiePatrolPlan = (): SortiePatrolPlan | null => {
  try { return parseSortiePatrolPlan(localStorage.getItem(SORTIE_PATROL_KEY)); } catch { return null; }
};

export const saveSortiePatrolPlan = (plan: SortiePatrolPlan): void => {
  try { localStorage.setItem(SORTIE_PATROL_KEY, JSON.stringify(plan)); } catch { /* 保存不可でも進行は止めない */ }
};

/** 作戦室を開いた時: 保存があればそれ、無ければ引いて保存する(`reroll`=確認用に毎回引き直す)。 */
export const ensureSortiePatrolPlan = (input: SortiePatrolRollInput, rng: () => number, reroll = false): SortiePatrolPlan => {
  const saved = reroll ? null : loadSortiePatrolPlan();
  if (saved) return saved;
  const plan = rollSortiePatrolPlan(input, rng);
  saveSortiePatrolPlan(plan);
  return plan;
};

/** 出撃した時: 保存を取り出して消す(無ければ null)。 */
export const takeSortiePatrolPlan = (): SortiePatrolPlan | null => {
  const plan = loadSortiePatrolPlan();
  try { localStorage.removeItem(SORTIE_PATROL_KEY); } catch { /* ignore */ }
  return plan;
};

/** 進行リセット(開発用)から呼ぶ。 */
export const clearSortiePatrolPlan = (): void => {
  try { localStorage.removeItem(SORTIE_PATROL_KEY); } catch { /* ignore */ }
};
