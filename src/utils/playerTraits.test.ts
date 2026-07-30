// BOT_AND_GHOST.md G1(プレイヤー実測層)。純関数+モジュールシングルトンの計測ロジックを検証する。
// v0.25.2476(保存の保留化): endSession/foldSubStyleTallies は保留バッファへ積むだけになったので、
// 既存テストは各確定点の直後に commitPendingTraits()(=旧実装の即時保存の再現)を挟む。既存の
// 期待値が全て無修正で通ること自体が「既定経路(commit)のEMAが旧実装と一致する」ことの固定になる。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  tickPlayerTraits, notifyCounterHit, loadPlayerProfile, resetPlayerTraits,
  // G4a(BOT_AND_GHOST.md §2.9)
  notifyMoveCounter, notifyMoveDamage,
  recordWireAnchorUse, recordShieldPlacement, recordShieldBash, recordShieldBashDamage, foldSubStyleTallies,
  // 保存の保留化(v0.25.2476): リザルトでのcommit/破棄
  hasPendingTraitRecords, commitPendingTraits, settlePendingTraits,
  // G5(BOT_AND_GHOST.md §2.10): ボス別攻略スタイル(軸2)
  notifyBossClear, bossStyleSlotKey, isBetterBossStyleSample, effectiveGhostProfile,
  type PlayerProfile,
} from './playerTraits';
import { resetBotTelemetry, recordDamageDealt, recordSubUse } from './botTelemetry';
import { savePlayerName } from './playerName'; // v0.25.2477: srcName(計測時のプレイヤー名)の固定用
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
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('交戦合計30秒未満のセッションは混ぜない(保存されない)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 29_999 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_000 })); // 交戦解除でセッション確定
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('交戦合計30秒以上のセッションは保存される(初回はEMAでなく実測値そのまま)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
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
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('ゴーストが出うるラン(ghostRunActive=守護霊装備 or ?ghost=1)は計測を丸ごと止める(G3・§2.7制約1)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ gameTime: 60_000, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100, ghostRunActive: true }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull(); // 30秒以上交戦していても一切保存されない
  });

  it('ghostRunActiveは開いていたセッションも保存せず破棄する(ゴースト未召喚でも装備した瞬間から止まる)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ gameTime: 30_500, ghostRunActive: true })); // ここでセッション破棄
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000, ghostRunActive: true }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('resetPlayerTraits(ラン開始)は未確定セッションを持ち越さない', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    resetPlayerTraits();
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000 }));
    commitPendingTraits();
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
    commitPendingTraits();
    const first = loadPlayerProfile()!;
    expect(first.mobility).toBe(1);

    // 2回目: mobility=0(全tick静止)を測る。EMA: 1*0.7 + 0*0.3 = 0.7
    resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: false }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: false }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
    expect(loadPlayerProfile()!.reactionMs).toBe(800);
  });

  it('機会が無い状態でのnotifyCounterHitは無視される(ボス戦以外の通常カウンター混入防止)', () => {
    const nonCounterableBoss = mkBoss({ aiPhase: undefined, bossState: 'chase' });
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [nonCounterableBoss] }));
    notifyCounterHit(); // 機会が開いていないので無視されるはず
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [nonCounterableBoss] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
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
    expect(p!.srcName).toBeUndefined();              // v0.25.2477: srcNameも欠損可(srcClass/snapshotと同じ流儀)
  });
});

// ==== v0.25.2477(社長指示「守護霊にプレイヤーの名前を頭上に表示」): srcName(計測時の名前)の記録 =====

describe('playerTraits: srcName(計測時のプレイヤー名・v0.25.2477)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('セッション確定でプロファイルに現在のプレイヤー名を記録する', () => {
    savePlayerName('Tanity');
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.srcName).toBe('Tanity');
  });

  it('名前未設定でもendSession時に初期名(player+5桁)が生成されて記録される', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.srcName).toMatch(/^player\d{5}$/);
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
    commitPendingTraits();
    expect(loadPlayerProfile()!.stationaryFrac).toBe(1);
  });

  it('stationaryFrac: 実移動していれば静止に数えない(移動入力ベースのmobilityとは独立)', () => {
    // 1秒ごとに200px動く=200px/s(閾値12px/sを大きく超える)。movementInputはfalseのまま
    // =mobilityは0でもstationaryFracも0(入力ではなく実座標で判定していることの確認)。
    tickPlayerTraits(baseInput({ gameTime: 0, player: playerAt(10_000) }));
    tickPlayerTraits(baseInput({ gameTime: 1000, player: playerAt(10_200) }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, player: playerAt(16_000) }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
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
    commitPendingTraits();
    expect(loadPlayerProfile()!.approachPerMin).toBeCloseTo(2, 5); // 60秒で2回=2/分
  });

  it('approachPerMin: ボス側が近づいて縮んだ距離は数えない(プレイヤー静止なら0)', () => {
    const bossAt = (x: number) => mkBoss({ x });
    tickPlayerTraits(baseInput({ gameTime: 0, player: playerAt(600), enemies: [bossAt(100)] }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, player: playerAt(600), enemies: [bossAt(500)] })); // ボスが400px接近
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: playerAt(600), enemies: [bossAt(500)] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
    expect(loadPlayerProfile()).not.toBeNull();
  };

  it('wire: スラム/プラント比率をラン境界(fold)でEMA記録する', () => {
    createProfileViaSession();
    recordWireAnchorUse('slam');
    recordWireAnchorUse('slam');
    recordWireAnchorUse('slam');
    recordWireAnchorUse('plant');
    foldSubStyleTallies();
    commitPendingTraits();
    const p = loadPlayerProfile()!;
    expect(p.subStyles.wire).toEqual({ n: 4, slamRatio: 0.75 }); // 初記録はサンプルそのまま
    // 2ラン目: 全プラント(比率0)→EMA: 0.75*0.7+0*0.3=0.525
    recordWireAnchorUse('plant');
    recordWireAnchorUse('plant');
    foldSubStyleTallies();
    commitPendingTraits();
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
    commitPendingTraits();
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
    commitPendingTraits();
    expect(loadPlayerProfile()!.subStyles).toEqual(before.subStyles);
    // 破棄はそのラン限り: 次のラン(フラグリセット後)は普通に記録される
    recordWireAnchorUse('slam');
    foldSubStyleTallies();
    commitPendingTraits();
    expect(loadPlayerProfile()!.subStyles.wire.n).toBe(1);
  });

  it('プロファイル未保存ならfoldは保存しない(ゴースト既定プロファイルへの影響=挙動変化を作らない)', () => {
    recordWireAnchorUse('slam');
    foldSubStyleTallies();
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('何も使っていないランのfoldはプロファイルに触らない', () => {
    createProfileViaSession();
    const before = localStorage.getItem('zombie-ghost-profile-v1');
    foldSubStyleTallies();
    commitPendingTraits();
    expect(localStorage.getItem('zombie-ghost-profile-v1')).toBe(before);
  });
});

// ==== 保存の保留化(v0.25.2476 社長裁定「リザルトで今回のプレイを守護霊に反映しない、を選べる」) =====

describe('playerTraits: 保留バッファ(リザルトでのcommit/破棄)', () => {
  let storage: Map<string, string>;
  let now = 1_000_000;
  beforeEach(() => {
    storage = installStorage(); resetBotTelemetry(); resetPlayerTraits();
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  const runOneSession = (gameTime0 = 0) => {
    tickPlayerTraits(baseInput({ gameTime: gameTime0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: gameTime0 + 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: gameTime0 + 30_100 }));
  };

  it('endSessionは即保存せず保留に積む(commitで初めて保存される)', () => {
    runOneSession();
    expect(loadPlayerProfile()).toBeNull();          // まだlocalStorageには無い
    expect(hasPendingTraitRecords()).toBe(true);     // 保留にはある(=チェックボックスの表示条件)
    commitPendingTraits();
    expect(hasPendingTraitRecords()).toBe(false);
    expect(loadPlayerProfile()!.mobility).toBe(1);   // 従来と同じ値で確定
  });

  it('30秒未満/ゴーストランは保留にも積まれない(ボス交戦なし等ではチェックボックスが出ない)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 29_000 })); // 30秒未満
    expect(hasPendingTraitRecords()).toBe(false);
    tickPlayerTraits(baseInput({ gameTime: 100_000, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 200_000, ghostRunActive: true }));
    expect(hasPendingTraitRecords()).toBe(false);    // G3ゲート: そもそも計測されていない
  });

  it('settlePendingTraits(true)=全破棄: セッションもサブ様式も1バイトも保存されない・次ランには影響しない', () => {
    // 1ラン目: 普通にcommitしてプロファイルを作る(サブ様式は既存プロファイルにだけ乗るため)。
    runOneSession();
    settlePendingTraits(false);
    const before = storage.get('zombie-ghost-profile-v1');
    expect(before).toBeDefined();
    // 2ラン目: セッション1件+wire使用を積んで「反映しない」で決算。
    resetPlayerTraits(); resetBotTelemetry();
    runOneSession();
    recordWireAnchorUse('slam');
    expect(hasPendingTraitRecords()).toBe(true);
    settlePendingTraits(true); // 破棄
    expect(storage.get('zombie-ghost-profile-v1')).toBe(before); // 保存文字列が完全不変
    expect(hasPendingTraitRecords()).toBe(false);
    // 破棄はそのランだけ: 3ラン目は普通に記録される(runsが2になる=2ラン目は数えられていない)。
    resetPlayerTraits(); resetBotTelemetry();
    runOneSession();
    settlePendingTraits(false);
    expect(loadPlayerProfile()!.runs).toBe(2);
    expect(loadPlayerProfile()!.subStyles.wire.n).toBe(0); // 破棄したwire使用は消えたまま
  });

  it('resetPlayerTraits(リザルトを経由しない終了)は保留バッファごと破棄する=破棄と同じ・安全側', () => {
    runOneSession();
    expect(hasPendingTraitRecords()).toBe(true);
    resetPlayerTraits(); // ブラウザ閉じ等の代わり(次ラン開始のリセット)
    expect(hasPendingTraitRecords()).toBe(false);
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('決算は1回だけ効く(2回目のsettleはno-op・二重commitでrunsが増えない)', () => {
    runOneSession();
    settlePendingTraits(false);
    expect(loadPlayerProfile()!.runs).toBe(1);
    settlePendingTraits(false); // リザルトのボタン二度押し相当
    expect(loadPlayerProfile()!.runs).toBe(1);
  });

  it('同ラン内の順序は従来どおり「セッション→ラン集計」: 先行セッションが新規作成したプロファイルにサブ様式が乗る', () => {
    runOneSession();
    recordWireAnchorUse('slam');
    settlePendingTraits(false);
    const p = loadPlayerProfile()!;
    expect(p.runs).toBe(1);
    expect(p.subStyles.wire.n).toBe(1); // 旧実装(セッション即保存→resetGameでfold)と同じ結果
  });

  // ★仕様1の固定: 保留分をcommit時に従来と同じ順序で畳めば、既定(反映する)の結果が
  // 従来実装とビットレベルで一致する。従来実装=「各確定点で即 load→EMA→save」なので、
  // 同一シナリオを (A)各確定点で即commit と (B)全部保留→最後に一括commit で流し、
  // localStorageの保存文字列そのものの一致を確認する(数値の丸めも順序も1bitズレない)。
  it('既定経路(commit)の保存結果は旧実装(各確定点で即時保存)とビット一致する', () => {
    const playScenario = (commitEachStep: boolean) => {
      const step = () => { if (commitEachStep) commitPendingTraits(); };
      // v0.25.2477: endSessionは現在のプレイヤー名(srcName)を記録する。名前未設定だとランダム初期名が
      // 生成されて(A)と(B)で別名になり保存文字列が割れるため、両アームとも同じ名前に固定する。
      savePlayerName('bit-fixed');
      // セッション1: 60秒・移動あり・被弾1・melee寄り・カウンター1機会1成立(reactionMs=250)・サブ1回。
      const counterableBoss = mkBoss({ bossState: 'issen-windup' as Enemy['bossState'] });
      now = 1_000_000;
      tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true, enemies: [counterableBoss] }));
      now = 1_000_250;
      notifyCounterHit();
      recordDamageDealt('melee', 70);
      recordDamageDealt('gun', 30);
      recordSubUse('heavy-grenade');
      tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true, enemies: [counterableBoss], player: mkPlayer(90) }));
      tickPlayerTraits(baseInput({ gameTime: 60_000, movementInput: true, enemies: [counterableBoss], player: mkPlayer(90) }));
      tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
      step();
      // セッション2: 40秒・静止・gun寄り(2回目=EMA混合の畳みが実際に起きる)。
      tickPlayerTraits(baseInput({ gameTime: 100_000 }));
      recordDamageDealt('gun', 100);
      tickPlayerTraits(baseInput({ gameTime: 140_000 }));
      tickPlayerTraits(baseInput({ inCombat: false, gameTime: 140_100 }));
      step();
      // ラン集計(サブ様式): wire=slam3/plant1・shield=設置2/バッシュ3/バッシュ与ダメ60。
      recordWireAnchorUse('slam'); recordWireAnchorUse('slam'); recordWireAnchorUse('slam');
      recordWireAnchorUse('plant');
      recordShieldPlacement(); recordShieldPlacement();
      recordShieldBash(3); recordShieldBashDamage(60);
      foldSubStyleTallies();
      step();
    };

    // (A) 旧実装の再現: 各確定点で即commit(=即 load→EMA→save)。
    const storeA = installStorage(); resetBotTelemetry(); resetPlayerTraits();
    playScenario(true);
    const a = storeA.get('zombie-ghost-profile-v1');
    expect(a).toBeDefined();

    // (B) 新実装の既定経路: 全部保留→最後に一括commit。
    const storeB = installStorage(); resetBotTelemetry(); resetPlayerTraits();
    playScenario(false);
    expect(storeB.get('zombie-ghost-profile-v1')).toBeUndefined(); // commit前は無保存
    commitPendingTraits();
    const b = storeB.get('zombie-ghost-profile-v1');

    expect(b).toBe(a); // 保存文字列そのものが一致=ビットレベルで同一
  });
});

// ==== G5(BOT_AND_GHOST.md §2.10): 守護霊アルバム=2軸プロファイル ==================================

describe('playerTraits G5: 新規純関数(bossStyleSlotKey/ベスト保持判定/effectiveGhostProfile)', () => {
  it('bossStyleSlotKey: giantbatだけステージ別、他typeはtypeそのまま', () => {
    expect(bossStyleSlotKey('giantbat', 'stage-2')).toBe('giantbat@stage-2');
    expect(bossStyleSlotKey('giantbat', 'stage-5')).toBe('giantbat@stage-5');
    expect(bossStyleSlotKey('thor', 'stage-2')).toBe('thor');
    expect(bossStyleSlotKey('idol', 'stage-9')).toBe('idol'); // stageIdは無視される
  });

  it('isBetterBossStyleSample(ベスト保持判定): 既存slot無しは採用/被弾少ない方保持/同値は新/新サンプルnullは不採用', () => {
    expect(isBetterBossStyleSample(undefined, 5)).toBe(true);  // 既存slot無し=採用
    expect(isBetterBossStyleSample(null, 5)).toBe(true);       // 既存slotはあるがサンプル無し=採用
    expect(isBetterBossStyleSample(5, 3)).toBe(true);          // 新の方が被弾/分が少ない→上書き
    expect(isBetterBossStyleSample(3, 5)).toBe(false);         // 新の方が多い→保持しない
    expect(isBetterBossStyleSample(5, 5)).toBe(true);          // 同値は新しい方
    expect(isBetterBossStyleSample(5, null)).toBe(false);      // 新サンプルがnullなら上書きしない
  });

  const mkAxis1Profile = (): PlayerProfile => ({
    v: 1, runs: 3, reactionMs: 300, counterChance: 0.6, preferredDist: 200,
    meleeBias: 0.5, mobility: 0.7, hitsPerMin: 4, subUsesPerMin: 2,
    stationaryFrac: 0.3, approachPerMin: 2,
    moveReactions: { 'thor-harai': { n: 5, counterRate: 0.5, hitRate: 0.1 } },
    subStyles: { wire: { n: 2, slamRatio: 0.5 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 } },
    srcClass: 'warrior', srcName: 'Axis1Name', snapshot: { maxHealth: 100, speed: 5, level: 3 },
  });

  it('effectiveGhostProfile: 対象slotが無ければ軸1をそのまま返す(同一参照)', () => {
    const profile = mkAxis1Profile();
    expect(effectiveGhostProfile(profile, 'thor')).toBe(profile);
    // bossStylesは有るが該当キーが無いケースも同様。
    const withOtherSlot: PlayerProfile = {
      ...profile,
      bossStyles: { giantbat: { reactionMs: 1, counterChance: 1, preferredDist: 1, meleeBias: 1, mobility: 1,
        hitsPerMin: 1, subUsesPerMin: 1, stationaryFrac: 1, approachPerMin: 1, subStyles: profile.subStyles,
        srcClass: null, snapshot: null, srcName: null, at: 0 } },
    };
    expect(effectiveGhostProfile(withOtherSlot, 'thor')).toBe(withOtherSlot);
  });

  it('effectiveGhostProfile: slot有りはノブ単位で優先し、nullノブだけ軸1へフォールバックする', () => {
    const profile: PlayerProfile = {
      ...mkAxis1Profile(),
      bossStyles: {
        thor: {
          reactionMs: 150, counterChance: null, preferredDist: 120, meleeBias: null, mobility: 0.9,
          hitsPerMin: 1, subUsesPerMin: null, stationaryFrac: 0.1, approachPerMin: null,
          subStyles: { wire: { n: 9, slamRatio: 1 }, shield: { n: 9, bashPerPlacement: 9, bashDamageFrac: 1 } },
          srcClass: 'mage', snapshot: { maxHealth: 50, speed: 9, level: 1 }, srcName: 'BossKiller', at: 12345,
        },
      },
    };
    const out = effectiveGhostProfile(profile, 'thor');
    expect(out.reactionMs).toBe(150);       // slot優先
    expect(out.counterChance).toBe(0.6);    // null→軸1へフォールバック
    expect(out.preferredDist).toBe(120);
    expect(out.meleeBias).toBe(0.5);        // フォールバック
    expect(out.mobility).toBe(0.9);
    expect(out.hitsPerMin).toBe(1);
    expect(out.subUsesPerMin).toBe(2);      // フォールバック
    expect(out.stationaryFrac).toBe(0.1);
    expect(out.approachPerMin).toBe(2);     // フォールバック
    // subStylesはslotで丸ごと置換(ノブ単位フォールバックはしない)。
    expect(out.subStyles).toEqual({ wire: { n: 9, slamRatio: 1 }, shield: { n: 9, bashPerPlacement: 9, bashDamageFrac: 1 } });
    expect(out.srcClass).toBe('mage');
    expect(out.srcName).toBe('BossKiller');
    expect(out.snapshot).toEqual({ maxHealth: 50, speed: 9, level: 1 });
    // moveReactionsは共有のまま(軸2に複製しない)=軸1の参照がそのまま出る。
    expect(out.moveReactions).toBe(profile.moveReactions);
    expect(out.runs).toBe(3); // 軸1のまま
  });
});

describe('playerTraits G5: notifyBossClear→endSession→commitの結線', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('撃破が無いランはbossStylesに1bitも触らない', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles).toBeUndefined();
  });

  it('セッション中のnotifyBossClearはcommit時にセッション確定値のコピーとしてスロット化される', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    const p = loadPlayerProfile()!;
    expect(p.bossStyles?.thor).toBeDefined();
    const slot = p.bossStyles!.thor;
    expect(slot.mobility).toBe(1);
    expect(slot.mobility).toBe(p.mobility); // 軸1と同じセッション確定値(PendingSessionRecordと同一計算)
    expect(slot.subStyles).toEqual(p.subStyles); // このランはsubStyle未使用=commit後の軸1コピー
    expect(typeof slot.at).toBe('number');
  });

  it('対象外の型(isEngageableBoss=false)は撃破通知してもスロットを作らない', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('reaper', 'stage-1'); // 死神はENGAGEABLE_BOSS_TYPES対象外
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles).toBeUndefined();
  });

  it('セッション外(session=null)でのnotifyBossClearは無視される', () => {
    notifyBossClear('thor', 'stage-1'); // まだ交戦していない=session無し
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles).toBeUndefined();
  });

  it('ゴーストランではsessionが常にnullなのでnotifyBossClearは自動的に無視される(§2.7と同じゲート)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, ghostRunActive: true }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 60_000, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100, ghostRunActive: true }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull(); // 軸1も未保存(既存G3挙動)なのでbossStylesも当然無い
  });

  it('同一slotKeyの重複通知は1件に重複排除される', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('thor', 'stage-1');
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(Object.keys(loadPlayerProfile()!.bossStyles!)).toEqual(['thor']);
  });

  it('同じセッション内で複数の異なるボスを撃破すると両方のslotに同じサンプルが積まれる(城ボスはステージ別キー)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    notifyBossClear('thor', 'stage-1');
    notifyBossClear('giantbat', 'stage-2');
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    const p = loadPlayerProfile()!;
    expect(p.bossStyles?.thor).toBeDefined();
    expect(p.bossStyles?.['giantbat@stage-2']).toBeDefined();
    expect(p.bossStyles!.thor.mobility).toBe(p.bossStyles!['giantbat@stage-2'].mobility);
  });

  it('settlePendingTraits(true)=全破棄はbossStylesにも1bitも触らない', () => {
    // 1ラン目: 撃破無しで普通にcommitしてプロファイルを作る。
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    settlePendingTraits(false);
    expect(loadPlayerProfile()!.bossStyles).toBeUndefined();

    // 2ラン目: ボス撃破込みで「反映しない」を選ぶ。
    resetPlayerTraits(); resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    settlePendingTraits(true); // 破棄
    expect(loadPlayerProfile()!.bossStyles).toBeUndefined(); // 何も乗らない
  });

  it('ベスト保持: 被弾/分が少ない撃破で上書きし、多い撃破では上書きしない', () => {
    // ラン1: 60秒で2回被弾(hitsPerMin=2)して撃破。
    tickPlayerTraits(baseInput({ gameTime: 0, player: mkPlayer(100, 100), enemies: [mkBoss()] }));
    tickPlayerTraits(baseInput({ gameTime: 10_000, player: mkPlayer(90, 100), enemies: [mkBoss()] }));
    tickPlayerTraits(baseInput({ gameTime: 20_000, player: mkPlayer(80, 100), enemies: [mkBoss()] }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: mkPlayer(80, 100), enemies: [mkBoss()] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles!.thor.hitsPerMin).toBeCloseTo(2, 5);

    // ラン2: 60秒で1回被弾(hitsPerMin=1・より上手い)で撃破→上書きされるはず。
    resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0, player: mkPlayer(100, 100) }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, player: mkPlayer(90, 100) }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: mkPlayer(90, 100) }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles!.thor.hitsPerMin).toBeCloseTo(1, 5);

    // ラン3: 60秒で5回被弾(hitsPerMin=5・より下手)で撃破→上書きされないはず(ラン2の1のまま)。
    resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0, player: mkPlayer(100, 100) }));
    tickPlayerTraits(baseInput({ gameTime: 10_000, player: mkPlayer(90, 100) }));
    tickPlayerTraits(baseInput({ gameTime: 20_000, player: mkPlayer(80, 100) }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, player: mkPlayer(70, 100) }));
    tickPlayerTraits(baseInput({ gameTime: 40_000, player: mkPlayer(60, 100) }));
    tickPlayerTraits(baseInput({ gameTime: 50_000, player: mkPlayer(50, 100) }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: mkPlayer(50, 100) }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles!.thor.hitsPerMin).toBeCloseTo(1, 5); // ラン2のまま
  });

  it('subStylesの写し: 同ランにsubStyleレコードが有れば軸1のEMAとは異なるラン実測レート(EMAなし)を使う', () => {
    // ラン1: プロファイル作成 + wire使用(スラム3回=slamRatio1)を先に確定させ、軸1の「前回値」を作る。
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    recordWireAnchorUse('slam'); recordWireAnchorUse('slam'); recordWireAnchorUse('slam');
    foldSubStyleTallies();
    commitPendingTraits();
    expect(loadPlayerProfile()!.subStyles.wire).toEqual({ n: 3, slamRatio: 1 });

    // ラン2: thorを撃破しつつ、今回はプラントのみ(スラム比率0)を使う。
    resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    recordWireAnchorUse('plant'); recordWireAnchorUse('plant'); recordWireAnchorUse('plant');
    foldSubStyleTallies();
    commitPendingTraits();

    const p = loadPlayerProfile()!;
    // 軸1はEMAで混ざる: 1*0.7 + 0*0.3 = 0.7
    expect(p.subStyles.wire).toEqual({ n: 6, slamRatio: 0.7 });
    // スロットは「そのラン実測レート」そのまま(このランは全プラント=0)。EMAされていないことの確認。
    expect(p.bossStyles!.thor.subStyles.wire).toEqual({ n: 3, slamRatio: 0 });
  });

  it('軸1の計測・EMA・保存はボス撃破の有無で変わらない(bossStyle併存でも軸1はビット一致)', () => {
    // (A) 撃破無しの通常ラン。srcNameは未設定だとランダム初期名が生成され両アームで別名になるため固定する
    // (既存の「既定経路(commit)の保存結果は旧実装とビット一致する」テストと同じ配慮)。
    const storeA = installStorage(); resetBotTelemetry(); resetPlayerTraits();
    savePlayerName('axis1-fixed');
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    const a = storeA.get('zombie-ghost-profile-v1');
    const aParsed = JSON.parse(a!) as PlayerProfile & Record<string, unknown>;
    delete (aParsed as Record<string, unknown>).bossStyles; // 比較対象は軸1部分のみ

    // (B) 同じ操作+撃破1件(bossStylesが増えるだけで軸1は変わらないはず)。
    const storeB = installStorage(); resetBotTelemetry(); resetPlayerTraits();
    savePlayerName('axis1-fixed');
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    const b = storeB.get('zombie-ghost-profile-v1');
    const bParsed = JSON.parse(b!) as PlayerProfile & Record<string, unknown>;
    expect(bParsed.bossStyles).toBeDefined(); // (B)だけbossStylesが増えている
    delete (bParsed as Record<string, unknown>).bossStyles;

    expect(bParsed).toEqual(aParsed); // 軸1部分は完全一致(bossStyleの有無は軸1に影響しない)
  });
});
