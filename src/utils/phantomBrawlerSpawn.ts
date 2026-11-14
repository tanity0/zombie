// research/BRAWLER_PHANTOM.md §6・§13: 固有の幻影「拳鬼」の本編の出現(判定だけの純関数・store/PixiJS 非依存)。
//
// 出方(社長指示2026-11-10「出現は徘徊の枠で、亡霊か宇宙飛行が出てる時は出ない。この3人の中で抽選」):
// 宇宙飛行群・亡霊と同じ「徘徊の枠」(1ランに1回・20%・ステージ1・3・4・5)に入り、枠が開いたら3人から均等に1人。
// 時刻・場所は枠のもの(出撃3秒・プレイヤーから遠い POI)。ステージ1は城のボスを一度倒した後から(それまでは抽選から抜く)。
// ステージのボス戦などの場面に入ったら退散する(その出撃では二度と出ない)。
import type { PhantomUniqueKind } from '../types/game';
import { HERO_PATROL_STAGES } from './heroScript';
import { pickRunMutantBoss, type RunMutantBoss } from './wraithScript';

/** 出るステージ(変異体の HERO_PATROL_STAGES と同じ値だが別に持つ=片方を変えても巻き込まない)。 */
export const PHANTOM_BRAWLER_STAGES: readonly string[] = ['stage-1', 'stage-3', 'stage-4', 'stage-5'];
/** 確認用の強制出現(?brawlerphantomnow=1・対策室)でのプレイヤーからの出る距離(px)。今の幻影の出方と同じ。 */
export const PHANTOM_BRAWLER_DIST_MIN_PX = 380;
export const PHANTOM_BRAWLER_DIST_MAX_PX = 500;
/** 遭遇・出現の記録のキー(型名ではない専用の文字列=汎用の幻影と分ける)。 */
export const PHANTOM_BRAWLER_ENCOUNTER_KEY = 'phantom-brawler';
/** 本編で出る固有の幻影の種類。 */
export const PHANTOM_BRAWLER_KIND: PhantomUniqueKind = 'brawler';

const clamp01 = (r: number): number => (Number.isFinite(r) ? Math.max(0, Math.min(0.999999999, r)) : 0);

/** そのステージで出得るか(ステージ1は城のボスを一度倒した後から)。 */
export const phantomBrawlerStageEligible = (stageId: string, stage1CastleCleared: boolean): boolean =>
  PHANTOM_BRAWLER_STAGES.includes(stageId) && (stageId !== 'stage-1' || stage1CastleCleared);

export interface RunPatrolSlotInput {
  stageId: string;
  /** ステージ1の城のボスを一度でも倒したか(progress.getCastleBossCleared('stage-1'))。 */
  stage1CastleCleared: boolean;
}
/**
 * 徘徊の枠の抽選(1ランに1回)。枠の出るステージ(HERO_PATROL_STAGES)の外は 'none'。枠の中では宇宙飛行群・亡霊・拳鬼から
 * 均等に1人(拳鬼が出られないステージ・ステージ1の城のボス未撃破の時は拳鬼を抜いて2人から)。確率は枠のまま(wraithScript)。
 */
export const rollRunPatrolSlot = (input: RunPatrolSlotInput, rng: () => number): RunMutantBoss => {
  if (!HERO_PATROL_STAGES.includes(input.stageId)) return 'none';
  return pickRunMutantBoss(rng, { brawler: phantomBrawlerStageEligible(input.stageId, input.stage1CastleCleared) });
};

/** 出られない/居られない場面(亡霊の「見失わせる場面」と同じ並び+他のボスとの交戦)。 */
export interface PhantomBrawlerScene {
  /** 幻影以外のボスと交戦中(ステージのボス戦など)。 */
  otherBossEngaged: boolean;
  bossChasing: boolean;
  redNightActive: boolean;
  activeEvent: boolean;
  indoor: boolean;
  returnCircle: boolean;
}

/** 退散する場面か(出ている途中でこの場面に入ったら消える)。 */
export const phantomBrawlerSceneBlocked = (s: PhantomBrawlerScene): boolean =>
  s.otherBossEngaged || s.bossChasing || s.redNightActive || s.activeEvent || s.indoor || s.returnCircle;

export type KenkiPatrolStep = 'none' | 'intro' | 'retreat';
/**
 * 本編(徘徊の枠)で遠くに出した拳鬼の、毎フレームの見せ方。
 * - 退散: 塞がった場面で、**画面に入っている/もう名乗った**なら消える(遠くでまだ会っていない間は消さない=
 *   出撃の頭の「ようこそ」の出来事などで、会う前に消えてしまわない)。
 * - 名乗り: 塞がっていない時に、姿が画面に入った最初のフレームで名前の帯+アテンション(アテンション中は待つ)。
 */
export const kenkiPatrolStep = (s: { onScreen: boolean; introduced: boolean; blocked: boolean; attention: boolean }): KenkiPatrolStep => {
  if (s.blocked) return s.onScreen || s.introduced ? 'retreat' : 'none';
  if (s.onScreen && !s.introduced && !s.attention) return 'intro';
  return 'none';
};

/** 出る場所(プレイヤーの中心からの向きと距離)。行ける帯へのクランプは呼び手。 */
export const phantomBrawlerSpawnOffset = (rng: () => number): { dx: number; dy: number } => {
  const a = clamp01(rng()) * Math.PI * 2;
  const d = PHANTOM_BRAWLER_DIST_MIN_PX + clamp01(rng()) * (PHANTOM_BRAWLER_DIST_MAX_PX - PHANTOM_BRAWLER_DIST_MIN_PX);
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d };
};
