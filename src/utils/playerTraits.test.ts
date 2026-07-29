// BOT_AND_GHOST.md G1(プレイヤー実測層)。純関数+モジュールシングルトンの計測ロジックを検証する。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  tickPlayerTraits, notifyCounterHit, loadPlayerProfile, resetPlayerTraits,
  // G4a(BOT_AND_GHOST.md §2.9)
  notifyMoveCounter, notifyMoveDamage,
  recordWireAnchorUse, recordShieldPlacement, recordShieldBash, recordShieldBashDamage, foldSubStyleTallies,
} from './playerTraits';
import { resetBotTelemetry, recordDamageDealt, recordSubUse } from './botTelemetry';
import type { Enemy } from '../types/game';

// jsdom を使わずに済む最小 localStorage スタブ(tutorialArchive.test.tsと同じ作法)。
const installStorage = () => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
  return map;
};

// thor は isHiddenBoss=true なので bossBandDist が生AABBを使う(enemyFootBox/enemyArtAspect依存を
// 避けてテストを軽くする)。座標は「プレイヤーがボスの帯に密着している」配置に固定。
const mkBoss = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: 'boss-1', x: 100, y: 100, width: 40, height: 40, speed: 0,
  health: 100, maxHealth: 100, damage: 10, type: 'thor', experienceValue: 0,
  lastHit: 0, lastShot: 0,
  ...overrides,
} as unknown as Enemy);

const mkPlayer = (health = 100, maxHealth = 100) => ({
  x: 100, y: 100, width: 20, height: 20, health, maxHealth,
});

const baseInput = (over: Partial<Parameters<typeof tickPlayerTraits>[0]> = {}) => ({
  inCombat: true,
  ghostActive: false,
  ghostRunActive: false,
  gameTime: 0,
  player: mkPlayer(),
  enemies: [mkBoss()],
  movementInput: false,
  ...over,
});

describe('playerTraits: セッション成立/破棄', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('非交戦中は何もしない(保存されない)', () => {
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 0 }));
    expect(loadPlayerProfile()).toBeNull();
  });

  it('交戦合計30秒未満のセッションは混ぜない(保存されない)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 29_999 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_000 })); // 交戦解除でセッション確定
    expect(loadPlayerProfile()).toBeNull();
  });

  it('交戦合計30秒以上のセッションは保存される(初回はEMAでなく実測値そのまま)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile();
    expect(p).not.toBeNull();
    expect(p!.runs).toBe(1);
    expect(p!.mobility).toBe(1); // 全tickで移動入力あり
  });

  it('ゴースト同伴中(ghostActive)は計測を丸ごと止め、開いていたセッションは破棄する', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ gameTime: 30_500, ghostActive: true })); // ここでセッション破棄
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000, ghostActive: true }));
    expect(loadPlayerProfile()).toBeNull();
  });

  it('ゴーストが出うるラン(ghostRunActive=守護霊装備 or ?ghost=1)は計測を丸ごと止める(G3・§2.7制約1)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ gameTime: 60_000, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100, ghostRunActive: true }));
    expect(loadPlayerProfile()).toBeNull(); // 30秒以上交戦していても一切保存されない
  });

  it('ghostRunActiveは開いていたセッションも保存せず破棄する(ゴースト未召喚でも装備した瞬間から止まる)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ gameTime: 30_500, ghostRunActive: true })); // ここでセッション破棄
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000, ghostRunActive: true }));
    expect(loadPlayerProfile()).toBeNull();
  });

  it('resetPlayerTraits(ラン開始)は未確定セッションを持ち越さない', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    resetPlayerTraits();
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000 }));
    expect(loadPlayerProfile()).toBeNull();
  });
});

describe('playerTraits: EMA(α=0.3)混合', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('2回目以降は前回値と新サンプルをα=0.3で混合する', () => {
    // 1回目: mobility=1(全tick移動)を確定させる。
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const first = loadPlayerProfile()!;
    expect(first.mobility).toBe(1);

    // 2回目: mobility=0(全tick静止)を測る。EMA: 1*0.7 + 0*0.3 = 0.7
    resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: false }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: false }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const second = loadPlayerProfile()!;
    expect(second.runs).toBe(2);
    expect(second.mobility).toBeCloseTo(0.7, 5);
  });
});

describe('playerTraits: meleeBias(botTelemetry差分)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('分母(melee+gun)が0なら今回はこのノブだけ前回値を維持する', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    // 何もダメージが記録されていないので既定の種の値(0.4)のまま。
    expect(p.meleeBias).toBeCloseTo(0.4, 5);
  });

  it('セッション区間の差分だけを使う(スナップショット差分方式)', () => {
    // セッション開始「前」に既に積まれていた分は無視されるべき。
    recordDamageDealt('gun', 100);
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    recordDamageDealt('melee', 30);
    recordDamageDealt('gun', 10);
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    // セッション内差分のみ: melee=30, gun=10 → 30/40=0.75
    expect(p.meleeBias).toBeCloseTo(0.75, 5);
  });
});

describe('playerTraits: counterChance(機会/成立)とreactionMs', () => {
  let now = 1_000_000;
  beforeEach(() => {
    installStorage(); resetBotTelemetry(); resetPlayerTraits();
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  it('機会はカウンター可能状態のボスに近接圏内へ入った回数(エッジのみ・滞在中は増えない)', () => {
    const counterableBoss = mkBoss({ bossState: 'issen-windup' as Enemy['bossState'] });
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [counterableBoss] }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [counterableBoss] }));
    tickPlayerTraits(baseInput({ gameTime: 2000, enemies: [counterableBoss] }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [counterableBoss] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    expect(p.counterChance).toBe(0); // 機会はあったが一度も notifyCounterHit されていない
  });

  it('機会中に notifyCounterHit すると成立+反応時間が記録される', () => {
    const counterableBoss = mkBoss({ bossState: 'issen-windup' as Enemy['bossState'] });
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [counterableBoss] })); // 機会オープン(t=1_000_000)
    now = 1_000_300; // 300ms後に成立
    notifyCounterHit();
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [counterableBoss] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    expect(p.counterChance).toBe(1); // 1機会/1成立
    expect(p.reactionMs).toBeCloseTo(300, 0);
  });

  it('reactionMsはclamp[100,800]される', () => {
    const counterableBoss = mkBoss({ bossState: 'issen-windup' as Enemy['bossState'] });
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [counterableBoss] }));
    now = 1_000_000 + 5000; // 5秒(想定外に長い)
    notifyCounterHit();
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [counterableBoss] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    expect(loadPlayerProfile()!.reactionMs).toBe(800);
  });

  it('機会が無い状態でのnotifyCounterHitは無視される(ボス戦以外の通常カウンター混入防止)', () => {
    const nonCounterableBoss = mkBoss({ aiPhase: undefined, bossState: 'chase' });
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [nonCounterableBoss] }));
    notifyCounterHit(); // 機会が開いていないので無視されるはず
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [nonCounterableBoss] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    expect(p.counterChance).toBeCloseTo(0.5, 5); // 機会0件→今回はサンプル無し→種の既定値のまま
  });
});

describe('playerTraits: hitsPerMin', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('交戦中の被弾回数を分あたりへ正規化する', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, player: mkPlayer(100, 100) }));
    tickPlayerTraits(baseInput({ gameTime: 10_000, player: mkPlayer(90, 100) })); // 被弾1
    tickPlayerTraits(baseInput({ gameTime: 20_000, player: mkPlayer(80, 100) })); // 被弾2
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: mkPlayer(80, 100) }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    const p = loadPlayerProfile()!;
    expect(p.hitsPerMin).toBeCloseTo(2, 5); // 60秒で2回被弾=1分あたり2
  });
});

describe('playerTraits: subUsesPerMin(G2.6・botTelemetry.subUses差分)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('交戦中のサブウェポン使用回数(全キー合算)を分あたりへ正規化する', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    recordSubUse('heavy-grenade');
    recordSubUse('decoy');
    tickPlayerTraits(baseInput({ gameTime: 60_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    const p = loadPlayerProfile()!;
    expect(p.subUsesPerMin).toBeCloseTo(2, 5); // 60秒で2回=1分あたり2
  });

  it('セッション区間の差分だけを使う(スナップショット差分方式・開始前の分は無視)', () => {
    recordSubUse('heavy-grenade');
    recordSubUse('heavy-grenade');
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    recordSubUse('turret');
    tickPlayerTraits(baseInput({ gameTime: 60_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    const p = loadPlayerProfile()!;
    expect(p.subUsesPerMin).toBeCloseTo(1, 5); // セッション内は1回だけ
  });

  it('旧フォーマット(subUsesPerMin無し)の保存は既定値(2)で埋めて読める=後方互換', () => {
    const old = {
      v: 1, runs: 3, reactionMs: 300, counterChance: 0.6, preferredDist: 200,
      meleeBias: 0.5, mobility: 0.7, hitsPerMin: 4,
    };
    localStorage.setItem('zombie-ghost-profile-v1', JSON.stringify(old));
    const p = loadPlayerProfile();
    expect(p).not.toBeNull();
    expect(p!.subUsesPerMin).toBe(2); // 欠損は控えめな既定値(SEED)で埋まる
    expect(p!.reactionMs).toBe(300);  // 既存6ノブは保存値のまま
  });

  it('旧フォーマットからの次回保存はEMAで混ざり、新フォーマットになる', () => {
    const old = {
      v: 1, runs: 1, reactionMs: 250, counterChance: 0.5, preferredDist: 180,
      meleeBias: 0.4, mobility: 0.6, hitsPerMin: 3,
    };
    localStorage.setItem('zombie-ghost-profile-v1', JSON.stringify(old));
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    recordSubUse('shield'); // 60秒で1回=サンプル1
    tickPlayerTraits(baseInput({ gameTime: 60_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    const p = loadPlayerProfile()!;
    // 既存保存あり=EMA混合: 前回値(欠損→既定2)*0.7 + 新サンプル(1)*0.3 = 1.7
    expect(p.subUsesPerMin).toBeCloseTo(1.7, 5);
    expect(p.runs).toBe(2);
  });
});

// ==== G4a(BOT_AND_GHOST.md §2.9): 後方互換・移動2ノブ・技への反応表・サブ様式 ====================

describe('playerTraits G4a: 後方互換(旧フォーマットの欠損はG4a既定値で埋まる)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('G4a項目が無い保存(〜v0.25.2453)も読め、欠損は既定値で埋まる', () => {
    const old = {
      v: 1, runs: 3, reactionMs: 300, counterChance: 0.6, preferredDist: 200,
      meleeBias: 0.5, mobility: 0.7, hitsPerMin: 4, subUsesPerMin: 2.5,
    };
    localStorage.setItem('zombie-ghost-profile-v1', JSON.stringify(old));
    const p = loadPlayerProfile();
    expect(p).not.toBeNull();
    expect(p!.stationaryFrac).toBe(0.35);            // SEED
    expect(p!.approachPerMin).toBe(3);               // SEED
    expect(p!.moveReactions).toEqual({});            // 空表
    expect(p!.subStyles).toEqual({ wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 } });
    expect(p!.reactionMs).toBe(300);                 // 既存ノブは保存値のまま
    expect(p!.subUsesPerMin).toBe(2.5);
  });
});

describe('playerTraits G4a: 移動2ノブ(stationaryFrac/approachPerMin)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  const playerAt = (x: number) => ({ x, y: 100, width: 20, height: 20, health: 100, maxHealth: 100 });

  it('stationaryFrac: 実座標が動かないtickは静止として数える(全tick静止=1)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 15_000 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    expect(loadPlayerProfile()!.stationaryFrac).toBe(1);
  });

  it('stationaryFrac: 実移動していれば静止に数えない(移動入力ベースのmobilityとは独立)', () => {
    // 1秒ごとに200px動く=200px/s(閾値12px/sを大きく超える)。movementInputはfalseのまま
    // =mobilityは0でもstationaryFracも0(入力ではなく実座標で判定していることの確認)。
    tickPlayerTraits(baseInput({ gameTime: 0, player: playerAt(10_000) }));
    tickPlayerTraits(baseInput({ gameTime: 1000, player: playerAt(10_200) }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, player: playerAt(16_000) }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    expect(p.stationaryFrac).toBe(0);
    expect(p.mobility).toBe(0);
  });

  it('approachPerMin: プレイヤー自身の移動でボスへ150px以上詰めるたびに1エピソード', () => {
    // ボス(mkBoss)は(100,100)40x40=中心(120,120)。x=600→420→260と2回詰める(各180px>150px)。
    tickPlayerTraits(baseInput({ gameTime: 0, player: playerAt(600) }));
    tickPlayerTraits(baseInput({ gameTime: 20_000, player: playerAt(420) }));  // エピソード1
    tickPlayerTraits(baseInput({ gameTime: 40_000, player: playerAt(260) }));  // エピソード2
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: playerAt(260) }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    expect(loadPlayerProfile()!.approachPerMin).toBeCloseTo(2, 5); // 60秒で2回=2/分
  });

  it('approachPerMin: ボス側が近づいて縮んだ距離は数えない(プレイヤー静止なら0)', () => {
    const bossAt = (x: number) => mkBoss({ x });
    tickPlayerTraits(baseInput({ gameTime: 0, player: playerAt(600), enemies: [bossAt(100)] }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, player: playerAt(600), enemies: [bossAt(500)] })); // ボスが400px接近
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: playerAt(600), enemies: [bossAt(500)] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    expect(loadPlayerProfile()!.approachPerMin).toBe(0);
  });
});

describe('playerTraits G4a: 技への反応表(セッション経由のe2e)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  const thorAt = (bossState: Enemy['bossState']) => mkBoss({ bossState });

  it('技の解決1回=n1・無反応=dodge(counterRate/hitRateとも0)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [thorAt('chase')] }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [thorAt('harai-windup')] }));
    tickPlayerTraits(baseInput({ gameTime: 2000, enemies: [thorAt('harai')] }));
    tickPlayerTraits(baseInput({ gameTime: 3000, enemies: [thorAt('chase')] }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [thorAt('chase')] })); // 残響も確定済み
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    expect(p.moveReactions['thor-harai']).toEqual({ n: 1, counterRate: 0, hitRate: 0 });
  });

  it('notifyMoveDamage(被弾タグ)はhit・notifyMoveCounter(成立7箇所)はcounterで、counterが優先', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [thorAt('tsuki-windup')] }));
    notifyMoveDamage('thor-tsuki');
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [thorAt('tsuki')] }));
    notifyMoveCounter();
    tickPlayerTraits(baseInput({ gameTime: 2000, enemies: [thorAt('chase')] }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [thorAt('chase')] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    const p = loadPlayerProfile()!;
    expect(p.moveReactions['thor-tsuki']).toEqual({ n: 1, counterRate: 1, hitRate: 0 });
  });

  it('セッション外(非交戦)のnotifyは無視される(記録専用フックの安全弁)', () => {
    notifyMoveCounter();
    notifyMoveDamage('thor-harai');
    expect(loadPlayerProfile()).toBeNull();
  });
});

describe('playerTraits G4a: サブ様式カウンタ(ラン単位・ボス交戦区間に限定しない)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  // fold はプロファイル未保存時に保存しない(挙動不変の掟=新規作成するとゴースト既定が変わるため)
  // ので、先にボス交戦セッション1回でプロファイルを作る。
  const createProfileViaSession = () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    expect(loadPlayerProfile()).not.toBeNull();
  };

  it('wire: スラム/プラント比率をラン境界(fold)でEMA記録する', () => {
    createProfileViaSession();
    recordWireAnchorUse('slam');
    recordWireAnchorUse('slam');
    recordWireAnchorUse('slam');
    recordWireAnchorUse('plant');
    foldSubStyleTallies();
    const p = loadPlayerProfile()!;
    expect(p.subStyles.wire).toEqual({ n: 4, slamRatio: 0.75 }); // 初記録はサンプルそのまま
    // 2ラン目: 全プラント(比率0)→EMA: 0.75*0.7+0*0.3=0.525
    recordWireAnchorUse('plant');
    recordWireAnchorUse('plant');
    foldSubStyleTallies();
    const p2 = loadPlayerProfile()!;
    expect(p2.subStyles.wire.n).toBe(6);
    expect(p2.subStyles.wire.slamRatio).toBeCloseTo(0.525, 5);
  });

  it('shield: 設置あたりバッシュ回数+バッシュ与ダメ割合(分母=ラン総与ダメージ)を記録する', () => {
    createProfileViaSession();
    recordShieldPlacement();
    recordShieldPlacement();
    recordShieldBash();
    recordShieldBash();
    recordShieldBash();
    recordShieldBashDamage(60);
    recordDamageDealt('melee', 60);  // バッシュ分(実装ではmeleeチャネルに含まれる)
    recordDamageDealt('gun', 140);   // 総与ダメ=200
    foldSubStyleTallies();
    const p = loadPlayerProfile()!;
    expect(p.subStyles.shield.n).toBe(2);
    expect(p.subStyles.shield.bashPerPlacement).toBeCloseTo(1.5, 5);
    expect(p.subStyles.shield.bashDamageFrac).toBeCloseTo(0.3, 5); // 60/200
  });

  it('ゴーストが出うるランのサブ様式は丸ごと破棄する(§2.7制約1と同じゲート)', () => {
    createProfileViaSession();
    const before = loadPlayerProfile()!;
    recordWireAnchorUse('slam');
    tickPlayerTraits(baseInput({ gameTime: 40_000, ghostRunActive: true })); // このランはゴースト有効
    foldSubStyleTallies();
    expect(loadPlayerProfile()!.subStyles).toEqual(before.subStyles);
    // 破棄はそのラン限り: 次のラン(フラグリセット後)は普通に記録される
    recordWireAnchorUse('slam');
    foldSubStyleTallies();
    expect(loadPlayerProfile()!.subStyles.wire.n).toBe(1);
  });

  it('プロファイル未保存ならfoldは保存しない(ゴースト既定プロファイルへの影響=挙動変化を作らない)', () => {
    recordWireAnchorUse('slam');
    foldSubStyleTallies();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('何も使っていないランのfoldはプロファイルに触らない', () => {
    createProfileViaSession();
    const before = localStorage.getItem('zombie-ghost-profile-v1');
    foldSubStyleTallies();
    expect(localStorage.getItem('zombie-ghost-profile-v1')).toBe(before);
  });
});
