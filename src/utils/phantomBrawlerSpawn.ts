// research/BRAWLER_PHANTOM.md §6・§13: 固有の幻影「拳鬼」の本編の出現(判定だけの純関数・store/PixiJS 非依存)。
//
// 出方: ステージ1・3・4・5の出撃で、1出撃に1回まで・25%・出撃60〜240秒の間に乱入(プレイヤーから380〜500px)。
// ステージ1は城のボスを一度倒した後から。倒した後も出る(再戦)。ステージのボス戦などの場面では出ず、
// 出ている途中でその場面になったら退散する(その出撃では二度と出ない)。
import type { PhantomUniqueKind } from '../types/game';

/** 出るステージ(変異体の HERO_PATROL_STAGES と同じ値だが別に持つ=片方を変えても巻き込まない)。 */
export const PHANTOM_BRAWLER_STAGES: readonly string[] = ['stage-1', 'stage-3', 'stage-4', 'stage-5'];
/** 対象ステージの出撃ごとに出る確率(叩き台)。 */
export const PHANTOM_BRAWLER_CHANCE = 0.25;
/** 出る時刻の窓(出撃からの gameTime・ms)。 */
export const PHANTOM_BRAWLER_WINDOW_MIN_MS = 60_000;
export const PHANTOM_BRAWLER_WINDOW_MAX_MS = 240_000;
/** 時刻が来た時に出られなかった時の見直しの間隔(ms)。 */
export const PHANTOM_BRAWLER_RETRY_MS = 5_000;
/** プレイヤーからの出る距離(px)。今の幻影の出方と同じ。 */
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

export interface PhantomBrawlerRunInput {
  stageId: string;
  /** ステージ1の城のボスを一度でも倒したか(progress.getCastleBossCleared('stage-1'))。 */
  stage1CastleCleared: boolean;
  /** 練習ラン(変異体対策室・ガントレット)/ボスメーカー/ボス戦テスト/`?nospawn`。どれかなら出さない。 */
  practiceOrTest: boolean;
}

/**
 * 出撃の頭で1回だけ引く。出る出撃なら出る時刻(gameTime・ms)、出ないなら null。
 * 乱数は2回引く(①出るか ②いつ)。テストで固定できるよう注入する。
 */
export const rollPhantomBrawlerRun = (input: PhantomBrawlerRunInput, rng: () => number): number | null => {
  if (input.practiceOrTest) return null;
  if (!phantomBrawlerStageEligible(input.stageId, input.stage1CastleCleared)) return null;
  if (clamp01(rng()) >= PHANTOM_BRAWLER_CHANCE) return null;
  return Math.round(PHANTOM_BRAWLER_WINDOW_MIN_MS
    + clamp01(rng()) * (PHANTOM_BRAWLER_WINDOW_MAX_MS - PHANTOM_BRAWLER_WINDOW_MIN_MS));
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

/** 出撃1回ぶんの予定(useGameLoop の ref が持つ)。 */
export interface PhantomBrawlerRunPlan {
  /** 出撃の頭で引いたか。 */
  rolled: boolean;
  /** 出る時刻(gameTime)。null=この出撃では出ない。 */
  at: number | null;
  /** もう出た(倒された・退散したを含む)=この出撃では二度と出ない。 */
  done: boolean;
  /** 次に見直す時刻(出られなかった時)。 */
  nextCheckAt: number;
}
export const createPhantomBrawlerPlan = (): PhantomBrawlerRunPlan => ({ rolled: false, at: null, done: false, nextCheckAt: 0 });

export type PhantomBrawlerSpawnStep = 'none' | 'spawn' | 'retry';
/**
 * いま出すか。時刻前・出ない出撃・出た後は 'none'。時刻が来て場面が塞がっている(または幻影が既に居る=汎用の幻影と
 * 重ねない・アテンション中)なら 'retry'(5秒後に見直す)。
 */
export const phantomBrawlerSpawnStep = (
  plan: PhantomBrawlerRunPlan, gameTime: number, scene: PhantomBrawlerScene,
  phantomPresent: boolean, attention: boolean,
): PhantomBrawlerSpawnStep => {
  if (!plan.rolled || plan.done || plan.at === null) return 'none';
  if (gameTime < plan.at || gameTime < plan.nextCheckAt) return 'none';
  if (phantomPresent || attention || phantomBrawlerSceneBlocked(scene)) return 'retry';
  return 'spawn';
};

/** 出る場所(プレイヤーの中心からの向きと距離)。行ける帯へのクランプは呼び手。 */
export const phantomBrawlerSpawnOffset = (rng: () => number): { dx: number; dy: number } => {
  const a = clamp01(rng()) * Math.PI * 2;
  const d = PHANTOM_BRAWLER_DIST_MIN_PX + clamp01(rng()) * (PHANTOM_BRAWLER_DIST_MAX_PX - PHANTOM_BRAWLER_DIST_MIN_PX);
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d };
};
