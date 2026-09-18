// PACING_PUZZLE.md §17(ウェルカム台本・社長指示2026-09-17)。
//
// ステージ入りの「最初の関門」: 段の敵を全部倒したら次の段へ、最後の段を倒し切ったら
// ディレクター(AIディレクター/コマ台本パズル)の全てが始まる。§17-10 が台本の正本(社長確定)。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能(実装精度の規律4)。
// 配線側(useGameLoop.ts)はこのファイルの `welcomeAdvance` の指示に従って
// spawn/ended を実行するだけで、進行の判定ロジック自体はここに1本化する(§17-11 B2「配線ロジックは
// 純関数に切り出してテスト」)。

import type { EnemyType, EnemyColorTier } from '../types/game';

// ============================================================================
// B1. 台本の台帳
// ============================================================================

export interface WelcomeUnit {
  type: EnemyType;
  count: number;
  tier?: EnemyColorTier; // 省略=色なし固定(抽選しない)。§17-10「指名されていない個体は色ティアなし」。
}

// 段と段の間の叩き台(§17-2「短い間(叩き台1.2秒)」)。本文の数値はここ以外に書かない。
export const WELCOME_STEP_GAP_MS = 1200;

// §17-3 強制始動②「その場に留まって粘る人」用の天井。倒し切っていなくても60秒でウェルカムを打ち切る。
export const WELCOME_FORCE_END_MS = 60000;

// §17-3③「研究対象区域(area 1)以上へ入ったら強制始動」。areaIndexForDist(enemyUtils.ts)の
// 0=軍備配置/1=研究対象区域/2=デンジャー…と揃える(新しい閾値を作らない・W-7)。
export const WELCOME_FORCE_END_AREA = 1;

// §17-10 社長がそのまま確定した表。段は上から順に、倒し切ったら次へ進む。
// S2(ラボ)・S7・EX は台本を持たない(§17-5)。
export const WELCOME_SCRIPT: Partial<Record<string, WelcomeUnit[][]>> = {
  'stage-1': [
    [{ type: 'bat', count: 1, tier: 'red' }],
    [{ type: 'bat', count: 1 }, { type: 'skeleton', count: 1, tier: 'red' }],
    [{ type: 'pumpkin', count: 1 }],
  ],
  'stage-3': [
    [{ type: 'bat', count: 2 }, { type: 'plant', count: 1, tier: 'red' }],
    [{ type: 'zombie', count: 1 }, { type: 'pumpkin', count: 1 }],
    [{ type: 'bat', count: 1 }, { type: 'skeleton', count: 1 }, { type: 'zombie', count: 1, tier: 'red' }],
  ],
  'stage-4': [
    [
      { type: 'bat', count: 1, tier: 'red' }, { type: 'bat', count: 1 },
      { type: 'skeleton', count: 1, tier: 'red' }, { type: 'zombie', count: 1 }, { type: 'plant', count: 1 },
    ],
    // ★S4の2段目は差し替え済み(社長指示2026-09-18「ゾンビ1赤 バット2 プラント2 咆哮1」)。
    // 咆哮1=screamer(叫喚型・変異体)。特別枠(SPECIAL_SLOTS)を通さず台本から直接湧かす(§17-11 B3)。
    [
      { type: 'zombie', count: 1, tier: 'red' }, { type: 'bat', count: 2 },
      { type: 'plant', count: 2 }, { type: 'screamer', count: 1 },
    ],
    [{ type: 'driller', count: 1 }, { type: 'zombie', count: 1 }],
  ],
  'stage-5': [
    [{ type: 'pumpkin', count: 1 }, { type: 'plant', count: 2, tier: 'red' }],
    [{ type: 'zombie', count: 2, tier: 'red' }, { type: 'bat', count: 2, tier: 'red' }, { type: 'plant', count: 2 }],
    [{ type: 'logger', count: 1 }, { type: 'plant', count: 2 }],
  ],
  'stage-6': [
    [{ type: 'logger', count: 1 }, { type: 'driller', count: 1 }],
    [{ type: 'pumpkin', count: 2 }, { type: 'plant', count: 2, tier: 'red' }],
    [{ type: 'zombie', count: 2, tier: 'red' }, { type: 'driller', count: 1 }, { type: 'plant', count: 1, tier: 'red' }],
  ],
};

/** このステージの台本(段の配列)。台本を持たないステージ(S2/S7/EX等)は undefined。 */
export const welcomeStageScript = (stageId: string): WelcomeUnit[][] | undefined => WELCOME_SCRIPT[stageId];

/** このステージの段数。台本を持たないステージは undefined。 */
export const welcomeStepCount = (stageId: string): number | undefined => welcomeStageScript(stageId)?.length;

/** 指定した段(0始まり)の顔ぶれ。範囲外・台本なしは undefined。 */
export const welcomeUnitsAt = (stageId: string, step: number): WelcomeUnit[] | undefined =>
  welcomeStageScript(stageId)?.[step];

// ============================================================================
// B2. 進行の状態機械
// ============================================================================
//
// PACING_PUZZLE.md §17-12-e(ウェルカム台本のサークル化・社長決定2026-09-18): 旧B1bの
// `welcomeSpawnAt`(画面外の輪から湧かす自前ヘルパー)は削除した。段の敵はプレイヤー中心
// 半径240pxの円内(既存の囲い系イベントと同じ `placeInRing(0.5)` の作法)に湧かせるので、
// 画面外配置ロジックは要らない。実際の湧き(`spawnEnemyAtWithTier` + `beginArenaEvent`)は
// 配線側(useGameLoop.ts)で行う——他の囲いイベント(horde/boss)の配置コードと同じ場所・同じ
// 作法に揃えるため(§17-12-d「新しい配置式を発明しない」)。

export interface WelcomeAdvanceParams {
  // 直前まで「湧かせ済み」だった段(0始まり)。まだ何も湧かせていない最初の呼び出しは -1。
  step: number;
  // 現在生きているウェルカム個体(isWelcome)の数。次の段が湧くまでは現在の段のぶんだけが盤面にいる想定。
  aliveOfWelcome: number;
  gameTime: number;
  // 現在の段が全滅した gameTime。まだ全滅していない(=aliveOfWelcome>0)か、
  // まだ何も湧かせていない(step===-1)間は null。
  stepClearedAt: number | null;
  stageId: string;
  areaIndex: number;
}

export interface WelcomeAdvanceResult {
  step: number;
  spawnNow: WelcomeUnit[] | null; // このフレームで湧かせるべき段の顔ぶれ。無ければ null。
  endedAt: number | null; // ウェルカムが終了した gameTime。まだ終了していなければ null。
}

/**
 * ウェルカム台本の進行を1フレームぶん進める(純関数)。呼び出し側(useGameLoop.ts)は
 * 戻り値の `spawnNow` を見て実際に円内へ湧かせ(§17-12-d)、`endedAt` が立ったら
 * ディレクターの時計(directorTime)を動かし始める。
 *
 * 終了は3条件のどれか(§17-3・§17-11 B2): ①台本を倒し切った ②出撃から60秒
 * ③研究対象区域(area 1)以上へ入った。②③はどちらも「残りの段は出さずに打ち切る」
 * (§17-3「残った敵は消さない」——このファイルは進行の判定だけを持ち、敵を消す処理はしない)。
 */
export const welcomeAdvance = (params: WelcomeAdvanceParams): WelcomeAdvanceResult => {
  const { step, aliveOfWelcome, gameTime, stepClearedAt, stageId, areaIndex } = params;
  const totalSteps = welcomeStepCount(stageId);

  // 台本を持たないステージ(S2/S7/EX等)は即終了扱い(呼び出し側は本来そもそも呼ばない=保険)。
  if (totalSteps === undefined || totalSteps === 0) {
    return { step, spawnNow: null, endedAt: gameTime };
  }

  // ②③強制終了(§17-3の3条件のうち2つ)。倒し切り判定より先に見る=粘っても区域を跨いでも即打ち切る。
  if (gameTime >= WELCOME_FORCE_END_MS || areaIndex >= WELCOME_FORCE_END_AREA) {
    return { step, spawnNow: null, endedAt: gameTime };
  }

  // 最初の1回: まだ何も湧かせていないので、1段目を即座に湧かせる。
  if (step < 0) {
    return { step: 0, spawnNow: welcomeUnitsAt(stageId, 0) ?? null, endedAt: null };
  }

  // 現在の段がまだ片付いていない(生きている個体がいる)= 何もしない。
  if (aliveOfWelcome > 0 || stepClearedAt === null) {
    return { step, spawnNow: null, endedAt: null };
  }

  // 全滅済み。段間の間(WELCOME_STEP_GAP_MS)が明けるまで待つ。
  if (gameTime - stepClearedAt < WELCOME_STEP_GAP_MS) {
    return { step, spawnNow: null, endedAt: null };
  }

  // 間が明けた。最後の段だった → ①倒し切り終了。
  if (step >= totalSteps - 1) {
    return { step, spawnNow: null, endedAt: gameTime };
  }

  // 次の段へ進む。
  const nextStep = step + 1;
  return { step: nextStep, spawnNow: welcomeUnitsAt(stageId, nextStep) ?? null, endedAt: null };
};
