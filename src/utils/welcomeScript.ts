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

/**
 * ★**撤去**(社長指示2026-09-19「**このウェルカムイベント、1分で終わらないわ。倒し切るまで続けよう。**」)。
 * 旧: 倒し切っていなくても60秒でウェルカムを打ち切る天井(§17-3 強制始動②)。
 * 今: **①倒し切り**と**③区域を跨いだ**の2条件だけで終わる。時間では終わらない。
 * ★数字は**輪の見た目の期限**としてだけ残す(`beginArenaEvent` の `endsAt` に渡す値。
 *   進行そのものは `welcomeAdvance` が持つので、この値で台本が終わることはもう無い)。
 */
export const WELCOME_RING_ENDS_IN_MS = 10 * 60 * 1000;

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
// B1a. 「このランにウェルカムが関係あるか」の判定(§17-14・単一の正本)
// ============================================================================
//
// useGameLoop.ts の`welcomeApplicable`(台本進行・ディレクター時計の起点)と、gameStore.ts の
// resetGame(護衛NPCを`escorts`へ即置くか`pendingEscorts`へ預けるか)は、**同じ問い**
// 「このランにウェルカムの仕組みが関係あるか」を見ている。判定を2箇所に増やさないため、
// この1関数へ集約し両方から呼ぶ(§17-14 実装精度の規律・社長指示「判定を2箇所に増やさない」)。

export interface WelcomeApplicabilityInput {
  stageId: string;
  welcomeEnabled: boolean; // `?welcome=0`キルスイッチ(呼び出し側がURLを読んで渡す)。falseなら常に非該当。
  labTheme: boolean;
  indoor: boolean;
  danceTest: boolean;
  storyBoss: boolean;
  tutorialStage: boolean;
  endingStage: boolean;
  practiceRun: boolean;
}

/** このランにウェルカム台本が関係あるか(=台本を持つステージ+対象の実行モード)。 */
export const welcomeAppliesToRun = (input: WelcomeApplicabilityInput): boolean =>
  input.welcomeEnabled && !!welcomeStageScript(input.stageId) && !input.labTheme && !input.indoor
  && !input.danceTest && !input.storyBoss && !input.tutorialStage && !input.endingStage && !input.practiceRun;

// ============================================================================
// B1b. 始動ゲート(§17-13・社長指示2026-09-19)
// ============================================================================
//
// 洋館(ステージ6)は CORRIDOR_BOTTOM_LIMIT=50 のためスタートから下へ50pxしか行けないのに、
// ウェルカムの輪(ARENA_EVENT_RADIUS=240)はプレイヤー中心に置かれるので下側190pxが
// 動けない帯へ食い込む=入れない場所を含む檻になる。ステージ6だけ「武器商人より上へ出るまで
// 1段目を湧かせない」始動ゲートを持たせる。

/** 始動ゲートの種類。今は「商人より上(y座標が小さい)へ出る」の1種のみ。 */
export type WelcomeStartGate = 'above-merchant';

/** ステージごとの始動ゲート。持たないステージ(=undefined)は従来どおり出撃直後に始動する。 */
export const WELCOME_START_GATE: Partial<Record<string, WelcomeStartGate>> = {
  'stage-6': 'above-merchant',
};

/**
 * 始動ゲートを満たしたか(純関数)。`playerCenterY`/`merchantY` は呼び出し側(useGameLoop.ts)が
 * `s.player`/`s.weaponMerchant.y` を実行時に読んで渡す(★数値を写さない=商人を動かしても追従する)。
 * ゲートを持たないステージ(`gate` が undefined)は常に満たされている扱い(=即始動・従来どおり)。
 */
export const welcomeStartGateMet = (
  gate: WelcomeStartGate | undefined,
  playerCenterY: number,
  merchantY: number,
): boolean => {
  if (!gate) return true;
  switch (gate) {
    case 'above-merchant':
      // このゲームの y は下ほど大きい=「商人より上」は playerCenterY が小さい側。
      return playerCenterY < merchantY;
    default:
      return true;
  }
};

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
  // ★§17-13-c: 1段目を湧かせた gameTime。まだ湧かせていない(=ゲート待ち含む)間は null。
  // 呼び出し側は毎フレーム、前回の戻り値 `startedAt` をそのまま持ち越して渡す。
  startedAt: number | null;
  // ★§17-13-b: 始動ゲート判定用(ゲートを持たないステージでは未使用)。
  // 商人の座標は呼び出し側が `s.weaponMerchant.y` を実行時に読んで渡す(数値を写さない)。
  playerCenterY: number;
  merchantY: number;
}

export interface WelcomeAdvanceResult {
  step: number;
  spawnNow: WelcomeUnit[] | null; // このフレームで湧かせるべき段の顔ぶれ。無ければ null。
  endedAt: number | null; // ウェルカムが終了した gameTime。まだ終了していなければ null。
  // ★§17-13-c: 更新後のstartedAt。呼び出し側は次フレームへそのまま持ち越す(refに保存)。
  startedAt: number | null;
}

/**
 * ウェルカム台本の進行を1フレームぶん進める(純関数)。呼び出し側(useGameLoop.ts)は
 * 戻り値の `spawnNow` を見て実際に円内へ湧かせ(§17-12-d)、`endedAt` が立ったら
 * ディレクターの時計(directorTime)を動かし始める。`startedAt` は次フレームへそのまま持ち越す。
 *
 * 終了は3条件のどれか(§17-3・§17-11 B2): ①台本を倒し切った ②1段目が湧いてから60秒
 * (§17-13-c。1段目がまだ湧いていない=ゲート待ち中は数えない) ③研究対象区域(area 1)以上へ
 * 入った。②③はどちらも「残りの段は出さずに打ち切る」(§17-3「残った敵は消さない」——
 * このファイルは進行の判定だけを持ち、敵を消す処理はしない)。
 */
export const welcomeAdvance = (params: WelcomeAdvanceParams): WelcomeAdvanceResult => {
  const { step, aliveOfWelcome, gameTime, stepClearedAt, stageId, areaIndex, startedAt, playerCenterY, merchantY } = params;
  const totalSteps = welcomeStepCount(stageId);

  // 台本を持たないステージ(S2/S7/EX等)は即終了扱い(呼び出し側は本来そもそも呼ばない=保険)。
  if (totalSteps === undefined || totalSteps === 0) {
    return { step, spawnNow: null, endedAt: gameTime, startedAt };
  }

  // ③強制終了(§17-3)。倒し切り判定より先に見る=区域を跨いだら即打ち切る。
  // ★**②(60秒の天井)は撤去した**(社長指示2026-09-19「1分で終わらないわ。倒し切るまで続けよう」)。
  //   残るのは**①倒し切り**と**③区域を跨いだ**の2つだけ。③は「プレイヤーが先へ行ってしまった時に
  //   輪が開きっぱなしにならない」ための保険なので残す(時間では終わらない)。
  if (areaIndex >= WELCOME_FORCE_END_AREA) {
    return { step, spawnNow: null, endedAt: gameTime, startedAt };
  }

  // 最初の1回: まだ何も湧かせていない。
  if (step < 0) {
    // ★§17-13-b: 始動ゲートが有るステージは、満たすまで1段目を湧かせない(spawnNow: null)。
    const gate = WELCOME_START_GATE[stageId];
    if (gate && !welcomeStartGateMet(gate, playerCenterY, merchantY)) {
      return { step: -1, spawnNow: null, endedAt: null, startedAt: null };
    }
    // ゲートを満たした(またはゲートが無い)ので1段目を湧かせ、startedAtを確定する。
    // ★ゲートが無いステージは0固定(=出撃時刻そのもの・§17-13-c「1ビットも変わらない」)。
    const newStartedAt = gate ? gameTime : 0;
    return { step: 0, spawnNow: welcomeUnitsAt(stageId, 0) ?? null, endedAt: null, startedAt: newStartedAt };
  }

  // 現在の段がまだ片付いていない(生きている個体がいる)= 何もしない。
  if (aliveOfWelcome > 0 || stepClearedAt === null) {
    return { step, spawnNow: null, endedAt: null, startedAt };
  }

  // 全滅済み。段間の間(WELCOME_STEP_GAP_MS)が明けるまで待つ。
  if (gameTime - stepClearedAt < WELCOME_STEP_GAP_MS) {
    return { step, spawnNow: null, endedAt: null, startedAt };
  }

  // 間が明けた。最後の段だった → ①倒し切り終了。
  if (step >= totalSteps - 1) {
    return { step, spawnNow: null, endedAt: gameTime, startedAt };
  }

  // 次の段へ進む。
  const nextStep = step + 1;
  return { step: nextStep, spawnNow: welcomeUnitsAt(stageId, nextStep) ?? null, endedAt: null, startedAt };
};
