import { describe, it, expect } from 'vitest';
import {
  WELCOME_SCRIPT, WELCOME_STEP_GAP_MS, WELCOME_FORCE_END_MS, WELCOME_FORCE_END_AREA,
  welcomeStageScript, welcomeStepCount, welcomeUnitsAt, welcomeAdvance,
  WELCOME_START_GATE, welcomeStartGateMet, welcomeAppliesToRun, type WelcomeApplicabilityInput,
} from './welcomeScript';

describe('welcomeStageScript / welcomeStepCount (§17-11 受け入れ条件1)', () => {
  it('S1/S3/S4/S5/S6は3段', () => {
    for (const id of ['stage-1', 'stage-3', 'stage-4', 'stage-5', 'stage-6']) {
      expect(welcomeStepCount(id), id).toBe(3);
      expect(welcomeStageScript(id), id).toHaveLength(3);
    }
  });
  it('S2(ラボ)・S7・EXは台本を持たない(undefined)', () => {
    for (const id of ['stage-2', 'stage-7', 'stage-ex1', 'stage-tutorial', '', 'unknown']) {
      expect(welcomeStepCount(id), id).toBeUndefined();
      expect(welcomeStageScript(id), id).toBeUndefined();
    }
  });
  it('welcomeUnitsAtは範囲外・台本なしでundefined', () => {
    expect(welcomeUnitsAt('stage-1', 3)).toBeUndefined();
    expect(welcomeUnitsAt('stage-2', 0)).toBeUndefined();
  });
});

describe('§17-10 台本の中身(社長確定の表と一致)', () => {
  it('S1: 1段目バット1(赤)/2段目バット1・スケルトン1(赤)/3段目パンプキン1', () => {
    expect(WELCOME_SCRIPT['stage-1']).toEqual([
      [{ type: 'bat', count: 1, tier: 'red' }],
      [{ type: 'bat', count: 1 }, { type: 'skeleton', count: 1, tier: 'red' }],
      [{ type: 'pumpkin', count: 1 }],
    ]);
  });
  it('S4-2段目: ゾンビ1(赤)・バット2・プラント2・叫喚型1(2026-09-18差し替え後)', () => {
    expect(WELCOME_SCRIPT['stage-4']![1]).toEqual([
      { type: 'zombie', count: 1, tier: 'red' }, { type: 'bat', count: 2 },
      { type: 'plant', count: 2 }, { type: 'screamer', count: 1 },
    ]);
  });
  it('赤が1体も居ない段が5つ(S1-3/S3-2/S4-3/S5-3/S6-1)=意図して空けた「たまに」', () => {
    const noRedSteps: [string, number][] = [
      ['stage-1', 2], ['stage-3', 1], ['stage-4', 2], ['stage-5', 2], ['stage-6', 0],
    ];
    for (const [stageId, step] of noRedSteps) {
      const units = welcomeUnitsAt(stageId, step)!;
      expect(units.some(u => u.tier === 'red'), `${stageId}-${step + 1}`).toBe(false);
    }
  });
});

describe('welcomeAdvance(§17-11 B2・受け入れ条件2/3/4)', () => {
  // stage-1は始動ゲートを持たない(WELCOME_START_GATEに無い)ので、playerCenterY/merchantYは
  // このdescribe内では意味を持たない(値は何でもよい・ここでは無関係な値を置く)。
  // startedAt:0=「stage-1は出撃直後に1段目が湧いた(=ゲート無しの既定形)」を表す基本形。
  const base = {
    gameTime: 0, stepClearedAt: null, stageId: 'stage-1', areaIndex: 0,
    startedAt: 0, playerCenterY: 0, merchantY: 0,
  };

  it('最初の呼び出し(step=-1)は即1段目を湧かせ、startedAtは0(ゲート無し=出撃時刻)になる', () => {
    const r = welcomeAdvance({ ...base, step: -1, aliveOfWelcome: 0, startedAt: null });
    expect(r).toEqual({ step: 0, spawnNow: welcomeUnitsAt('stage-1', 0), endedAt: null, startedAt: 0 });
  });

  it('段の敵が1体でも生きている間は次の段が湧かない(受け入れ条件2)', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 1, gameTime: 50_000, stepClearedAt: null });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: null, startedAt: 0 });
  });

  it('全滅直後(gap未経過)は待つ', () => {
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 0, gameTime: 1000, stepClearedAt: 1000 + WELCOME_STEP_GAP_MS - 1,
    });
    // stepClearedAt はこの時点で gameTime 以降になってしまう不整合な入力だが、境界を跨ぐ直前の
    // 通常ケース(gameTime===stepClearedAtの直後)を別テストで確認する。ここでは経過0msのケース。
    const r2 = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 0, gameTime: 5000, stepClearedAt: 5000 });
    expect(r2).toEqual({ step: 0, spawnNow: null, endedAt: null, startedAt: 0 });
    expect(r.spawnNow).toBeNull();
  });

  it('全滅+WELCOME_STEP_GAP_MS経過で次の段が湧く', () => {
    const clearedAt = 5000;
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 0, gameTime: clearedAt + WELCOME_STEP_GAP_MS, stepClearedAt: clearedAt,
    });
    expect(r).toEqual({ step: 1, spawnNow: welcomeUnitsAt('stage-1', 1), endedAt: null, startedAt: 0 });
  });

  it('gap未経過(1ms前)ではまだ湧かない', () => {
    const clearedAt = 5000;
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 0, gameTime: clearedAt + WELCOME_STEP_GAP_MS - 1, stepClearedAt: clearedAt,
    });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: null, startedAt: 0 });
  });

  it('最後の段を倒し切った時刻がendedAt(受け入れ条件3前半)', () => {
    const clearedAt = 40_000;
    const endGameTime = clearedAt + WELCOME_STEP_GAP_MS;
    const r = welcomeAdvance({
      ...base, step: 2, aliveOfWelcome: 0, gameTime: endGameTime, stepClearedAt: clearedAt,
    });
    expect(r).toEqual({ step: 2, spawnNow: null, endedAt: endGameTime, startedAt: 0 });
  });

  it('倒し切る前でも60秒でendedAtが立つ(受け入れ条件3後半)', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 3, gameTime: WELCOME_FORCE_END_MS });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: WELCOME_FORCE_END_MS, startedAt: 0 });
  });

  it('60秒未満は強制終了しない', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 3, gameTime: WELCOME_FORCE_END_MS - 1 });
    expect(r.endedAt).toBeNull();
  });

  it('研究対象区域(area>=1)以上へ入ったら即endedAt(受け入れ条件4)', () => {
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 2, gameTime: 3000, areaIndex: WELCOME_FORCE_END_AREA,
    });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: 3000, startedAt: 0 });
  });

  it('area0のままなら強制終了しない', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 2, gameTime: 3000, areaIndex: 0 });
    expect(r.endedAt).toBeNull();
  });

  it('強制終了(60秒/区域)は台本を持たないステージ扱いより先に見ても壊れない(台本なしステージは即終了)', () => {
    const r = welcomeAdvance({ ...base, stageId: 'stage-2', step: -1, aliveOfWelcome: 0, gameTime: 0, startedAt: null });
    expect(r.endedAt).toBe(0);
    expect(r.spawnNow).toBeNull();
  });
});

// PACING_PUZZLE.md §17-13(始動ゲート・社長指示2026-09-19「洋館のウェルカム位置が、下の動けない
// ところに食い込んでるので、武器商人より上に移動したら発動に変えて」)。
describe('welcomeStartGateMet(§17-13-b)', () => {
  it('ゲートが無ければ常に満たされている(即始動・従来どおり)', () => {
    expect(welcomeStartGateMet(undefined, 500, 100)).toBe(true); // playerCenterYの方が大きくても
  });
  it('above-merchant: プレイヤーが商人より上(yが小さい)なら満たされる', () => {
    expect(welcomeStartGateMet('above-merchant', 50, 100)).toBe(true);
  });
  it('above-merchant: プレイヤーが商人と同じか下ならまだ満たされない', () => {
    expect(welcomeStartGateMet('above-merchant', 100, 100)).toBe(false);
    expect(welcomeStartGateMet('above-merchant', 150, 100)).toBe(false);
  });
});

describe('WELCOME_START_GATE(§17-13-b・受け入れ条件16)', () => {
  it('ステージ6だけabove-merchantを持つ', () => {
    expect(WELCOME_START_GATE['stage-6']).toBe('above-merchant');
  });
  it('他の台本ステージ(S1/S3/S4/S5)はゲートを持たない(=出撃直後に始動・従来どおり)', () => {
    for (const id of ['stage-1', 'stage-3', 'stage-4', 'stage-5']) {
      expect(WELCOME_START_GATE[id], id).toBeUndefined();
    }
  });
});

describe('welcomeAdvance: ステージ6の始動ゲート(§17-13受け入れ条件16/17/18)', () => {
  const base = { gameTime: 0, stepClearedAt: null, stageId: 'stage-6', areaIndex: 0 };

  it('受け入れ条件16: ゲート未達成(商人より下)の間は1段目が湧かない・startedAtもnullのまま', () => {
    const r = welcomeAdvance({
      ...base, step: -1, aliveOfWelcome: 0, startedAt: null, playerCenterY: 200, merchantY: 100,
    });
    expect(r).toEqual({ step: -1, spawnNow: null, endedAt: null, startedAt: null });
  });

  it('ゲート未達成のままどれだけ時間が経っても(60秒超でも)強制終了しない(startedAtがnullなので②は数えない)', () => {
    const r = welcomeAdvance({
      ...base, step: -1, aliveOfWelcome: 0, startedAt: null,
      gameTime: WELCOME_FORCE_END_MS * 10, playerCenterY: 200, merchantY: 100,
    });
    expect(r.endedAt).toBeNull();
    expect(r.spawnNow).toBeNull();
    expect(r.step).toBe(-1);
  });

  it('受け入れ条件16/17: ゲート達成(商人より上)の瞬間に1段目が湧き、輪の中心(=プレイヤー)は商人より上=帯へ食い込まない', () => {
    const gameTime = 12_345;
    const r = welcomeAdvance({
      ...base, step: -1, aliveOfWelcome: 0, startedAt: null, gameTime, playerCenterY: 90, merchantY: 100,
    });
    expect(r).toEqual({ step: 0, spawnNow: welcomeUnitsAt('stage-6', 0), endedAt: null, startedAt: gameTime });
  });

  it('受け入れ条件18: 60秒の強制終了は「1段目が湧いた時刻(startedAt)」から数える(出撃時刻からではない)', () => {
    const startedAt = 30_000; // ゲート達成にそれだけ実時間が掛かった想定
    // startedAtから59999ms(1ms前)ではまだ終了しない
    const r1 = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 3, startedAt, gameTime: startedAt + WELCOME_FORCE_END_MS - 1,
      playerCenterY: 0, merchantY: 100,
    });
    expect(r1.endedAt).toBeNull();
    // startedAtから60000msでendedAtが立つ
    const r2 = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 3, startedAt, gameTime: startedAt + WELCOME_FORCE_END_MS,
      playerCenterY: 0, merchantY: 100,
    });
    expect(r2).toEqual({ step: 0, spawnNow: null, endedAt: startedAt + WELCOME_FORCE_END_MS, startedAt });
    // 出撃からの絶対時刻(startedAtを無視した60秒)ではまだ終了しないことの確認
    // (gameTime単体がWELCOME_FORCE_END_MSを超えていても、startedAtからの経過が60秒未満なら終了しない)
    const r3 = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 3, startedAt, gameTime: WELCOME_FORCE_END_MS + 1,
      playerCenterY: 0, merchantY: 100,
    });
    expect(r3.endedAt).toBeNull();
  });

  it('ゲート待ち中でも研究対象区域(area>=1)へ入れば即終了する(③はゲートと無関係に効く)', () => {
    const r = welcomeAdvance({
      ...base, step: -1, aliveOfWelcome: 0, startedAt: null, gameTime: 3000,
      areaIndex: WELCOME_FORCE_END_AREA, playerCenterY: 200, merchantY: 100,
    });
    expect(r.endedAt).toBe(3000);
    expect(r.spawnNow).toBeNull();
  });
});

describe('welcomeAdvance: ゲート無しステージは1ビットも変わらない(§17-13-c)', () => {
  it('stage-1(ゲート無し)は最初の呼び出しでstartedAtが常に0になる(playerCenterY/merchantYの値に依らない)', () => {
    const r1 = welcomeAdvance({
      step: -1, aliveOfWelcome: 0, gameTime: 0, stepClearedAt: null, stageId: 'stage-1', areaIndex: 0,
      startedAt: null, playerCenterY: 99999, merchantY: -99999, // above-merchantなら満たさない値だが無関係
    });
    expect(r1.startedAt).toBe(0);
    expect(r1.spawnNow).toEqual(welcomeUnitsAt('stage-1', 0));
  });
});

// PACING_PUZZLE.md §17-12-e(ウェルカム台本のサークル化): 旧`welcomeSpawnAt`(画面外の輪から湧かす
// 自前ヘルパー)は削除した。湧き(spawnEnemyAtWithTier + forcedColorTier)は配線側(useGameLoop.ts)が
// 既存の囲いイベントと同じ作法で直接行うため、このファイルには湧きヘルパーが無い(=テストも無い)。
// `forcedColorTier: 'none'`(受け入れ条件10)は湧きの実体である `spawnEnemyAtWithTier`/`buildEnemy`
// 側(enemyUtils.test.ts)でカバーする。

// PACING_PUZZLE.md §17-14(社長指示「ウェルカム終わるまでは画面に存在させない」)。
// useGameLoop.ts の welcomeApplicable と gameStore.ts の resetGame(escorts/pendingEscorts振り分け)は
// 両方ともこの1関数を呼ぶ(判定を2箇所に増やさない)。ここでは「全部trueの土台」から1つずつ
// 条件を崩してfalseになることを確認する=各フラグが実際に効いていることの網。
describe('welcomeAppliesToRun (§17-14)', () => {
  const applicableBase: WelcomeApplicabilityInput = {
    stageId: 'stage-1',
    welcomeEnabled: true,
    labTheme: false,
    indoor: false,
    danceTest: false,
    storyBoss: false,
    tutorialStage: false,
    endingStage: false,
    practiceRun: false,
  };

  it('台本を持つステージ(stage-1)+対象の実行モードなら真', () => {
    expect(welcomeAppliesToRun(applicableBase)).toBe(true);
  });

  it.each([
    ['台本を持たないステージ(stage-2)', { stageId: 'stage-2' }],
    ['台本を持たないステージ(stage-7)', { stageId: 'stage-7' }],
    ['台本を持たないステージ(stage-ex1)', { stageId: 'stage-ex1' }],
    ['?welcome=0キルスイッチ', { welcomeEnabled: false }],
    ['ラボ', { labTheme: true }],
    ['屋内', { indoor: true }],
    ['仮ダンスモード', { danceTest: true }],
    ['ストーリーボス専用(M7/EX)', { storyBoss: true }],
    ['チュートリアル', { tutorialStage: true }],
    ['エンディング', { endingStage: true }],
    ['練習ラン', { practiceRun: true }],
  ] as const)('%sは偽になる', (_label, patch) => {
    expect(welcomeAppliesToRun({ ...applicableBase, ...patch })).toBe(false);
  });
});
