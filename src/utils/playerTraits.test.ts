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
  notifyBossClear, bossStyleSlotKey, isBetterBossStyleSample, bossStylePerfScore, effectiveGhostProfile,
  // GHOST-RESULT-UI(§2.16 A): スロット別決算(採用選択)+リザルト年表のビュー
  selectPendingForSettlement, pendingBossClears,
  type PlayerProfile, type PendingTraitRecord,
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 0 }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('交戦合計30秒未満: 軸1は混ぜない——ただし撃破スロットは残る(v0.25.2579)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 29_999 }));
    notifyBossClear('thor', 'test-stage');
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_000 })); // 交戦解除でセッション確定
    commitPendingTraits();
    const p = loadPlayerProfile();
    // v0.25.2579(社長報告「城ボスを倒したのに記録されない・採用UIも出ない」): 旧実装は30秒フロアが
    // 撃破記録まで丸ごと捨てていた=**最速の勝ち戦ほど消える**。裁定v0.25.2493「基本的に残るのは
    // 撃破だけ。その後死のうが生きようが残る」どおり、撃破スロットだけは交戦時間に関わらず残す。
    expect(p).not.toBeNull();
    expect(p!.runs).toBe(0); // 軸1(セッション)は混ぜない=30秒フロアは従来どおり効いている
    expect(p!.bossStyles?.[bossStyleSlotKey('thor', 'test-stage')]).toBeDefined();
  });

  it('交戦合計30秒未満かつ撃破なしのセッションは丸ごと破棄(従来どおり)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 29_999 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_000 }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('交戦合計30秒以上のセッションは保存される(初回はEMAでなく実測値そのまま)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000, ghostActive: true }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('ゴーストが出うるラン(ghostRunActive=守護霊装備 or ?ghost=1)は計測を丸ごと止める(G3・§2.7制約1)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ gameTime: 60_000, ghostRunActive: true }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100, ghostRunActive: true }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull(); // 30秒以上交戦していても一切保存されない
  });

  it('ghostRunActiveは開いていたセッションも保存せず破棄する(ゴースト未召喚でも装備した瞬間から止まる)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ gameTime: 30_500, ghostRunActive: true })); // ここでセッション破棄
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000, ghostRunActive: true }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('resetPlayerTraits(ラン開始)は未確定セッションを持ち越さない', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    resetPlayerTraits();
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    const first = loadPlayerProfile()!;
    expect(first.mobility).toBe(1);

    // 2回目: mobility=0(全tick静止)を測る。EMA: 1*0.7 + 0*0.3 = 0.7
    resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: false }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: false }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.reactionMs).toBe(800);
  });

  it('機会が無い状態でのnotifyCounterHitは無視される(ボス戦以外の通常カウンター混入防止)', () => {
    const nonCounterableBoss = mkBoss({ aiPhase: undefined, bossState: 'chase' });
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [nonCounterableBoss] }));
    notifyCounterHit(); // 機会が開いていないので無視されるはず
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [nonCounterableBoss] }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    // v0.25.2563: homing(ホーミングの押し時間の平均)も欠損=既定値で埋まる。
    expect(p!.subStyles).toEqual({ wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 }, homing: { n: 0, holdMsAvg: 0 } });
    expect(p!.reactionMs).toBe(300);                 // 既存ノブは保存値のまま
    expect(p!.subUsesPerMin).toBe(2.5);
    expect(p!.srcName).toBeUndefined();              // v0.25.2477: srcNameも欠損可(srcClass/snapshotと同じ流儀)
    expect(p!.dodgeDir).toBeUndefined();             // GHOST-CMD-1B: dodgeDirも欠損可(undefinedのまま=バイアス0)
  });
});

// ==== v0.25.2477(社長指示「守護霊にプレイヤーの名前を頭上に表示」): srcName(計測時の名前)の記録 =====

describe('playerTraits: srcName(計測時のプレイヤー名・v0.25.2477)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('セッション確定でプロファイルに現在のプレイヤー名を記録する', () => {
    savePlayerName('Tanity');
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.srcName).toBe('Tanity');
  });

  it('名前未設定でもendSession時に初期名(player+5桁)が生成されて記録される', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.approachPerMin).toBeCloseTo(2, 5); // 60秒で2回=2/分
  });

  it('approachPerMin: ボス側が近づいて縮んだ距離は数えない(プレイヤー静止なら0)', () => {
    const bossAt = (x: number) => mkBoss({ x });
    tickPlayerTraits(baseInput({ gameTime: 0, player: playerAt(600), enemies: [bossAt(100)] }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, player: playerAt(600), enemies: [bossAt(500)] })); // ボスが400px接近
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: playerAt(600), enemies: [bossAt(500)] }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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

// ==== GHOST-CMD-1B(§2.18-2 dodgeの味付け): 避け方向の癖のセッション→プロファイル ================
// mkBoss(thor)=x100,y100,40x40 → 中心(120,120)。at(cx,cy)=プレイヤー中心を(cx,cy)へ。
// (300,120)からは敵への半径方向=x軸・接線方向=y軸(moveReaction.test.tsと同じ読みやすい配置)。

describe('playerTraits GHOST-CMD-1B: 避け方向の癖(dodgeDir)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  const thorAt = (bossState: Enemy['bossState']) => mkBoss({ bossState });
  const at = (cx: number, cy: number) => ({ ...mkPlayer(), x: cx - 10, y: cy - 10 });

  // 1セッション=harai1回をdodge(無傷)で確定させる。dodgeEnd=避け先のプレイヤー中心。
  const runSession = (dodgeEndX: number, dodgeEndY: number) => {
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [thorAt('chase')], player: at(300, 120) }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [thorAt('harai-windup')], player: at(300, 120) }));
    tickPlayerTraits(baseInput({ gameTime: 2000, enemies: [thorAt('harai')], player: at(dodgeEndX, dodgeEndY) }));
    tickPlayerTraits(baseInput({ gameTime: 3000, enemies: [thorAt('chase')], player: at(dodgeEndX, dodgeEndY) }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [thorAt('chase')], player: at(dodgeEndX, dodgeEndY) }));
    notifyBossClear('thor', 'test-stage');
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
  };

  it('横移動のdodge → 初回はサンプルそのまま(n=1・lateralRate=1)。BossStyleSlotにも同じ写しが載る', () => {
    runSession(300, 180); // 接線方向(y)へ60px
    const p = loadPlayerProfile()!;
    expect(p.dodgeDir).toEqual({ n: 1, awayRate: 0, lateralRate: 1 });
    expect(p.bossStyles?.[bossStyleSlotKey('thor', 'test-stage')]?.dodgeDir)
      .toEqual({ n: 1, awayRate: 0, lateralRate: 1 });
  });

  it('2回目以降はα=0.3でEMA混合しnは累計(blendMoveReactionTableと同じ数式の1キー版)', () => {
    runSession(300, 180); // 1回目: lateral
    runSession(360, 120); // 2回目: away(敵から離れる)
    const p = loadPlayerProfile()!;
    expect(p.dodgeDir!.n).toBe(2);
    expect(p.dodgeDir!.awayRate).toBeCloseTo(0 * 0.7 + 1 * 0.3, 10);
    expect(p.dodgeDir!.lateralRate).toBeCloseTo(1 * 0.7 + 0 * 0.3, 10);
  });

  it('dodgeが1つも無いセッションはdodgeDirを作らない(欠損=undefinedのまま)', () => {
    // 技を1度も出さない交戦=分類できるdodgeなし。
    tickPlayerTraits(baseInput({ gameTime: 0, enemies: [thorAt('chase')] }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, enemies: [thorAt('chase')] }));
    notifyBossClear('thor', 'test-stage');
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    const p = loadPlayerProfile()!;
    expect(p.dodgeDir).toBeUndefined();
    expect(p.bossStyles?.[bossStyleSlotKey('thor', 'test-stage')]?.dodgeDir).toBeUndefined();
  });

  // effectiveGhostProfile 用の最小プロファイル/スロット(dodgeDirの合成だけを見る)。
  const mkProfile = (dodgeDir?: PlayerProfile['dodgeDir']): PlayerProfile => ({
    v: 1, runs: 1, reactionMs: 300, counterChance: 0.6, preferredDist: 200,
    meleeBias: 0.5, mobility: 0.7, hitsPerMin: 4, subUsesPerMin: 2,
    stationaryFrac: 0.3, approachPerMin: 2, moveReactions: {},
    subStyles: { wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 }, homing: { n: 0, holdMsAvg: 0 } },
    ...(dodgeDir ? { dodgeDir } : {}),
  });
  const mkSlot = (dodgeDir?: PlayerProfile['dodgeDir']) => ({
    reactionMs: null, counterChance: null, preferredDist: null, meleeBias: null, mobility: null,
    hitsPerMin: 1, subUsesPerMin: null, stationaryFrac: null, approachPerMin: null,
    subStyles: mkProfile().subStyles, srcClass: null, snapshot: null, srcName: null, at: 0,
    ...(dodgeDir ? { dodgeDir } : {}),
  });

  it('effectiveGhostProfile: dodgeDirはslot優先・slot欠損は軸1へ・両方欠損はundefined', () => {
    const slotDir = { n: 1, awayRate: 0, lateralRate: 1 };
    const axisDir = { n: 5, awayRate: 0.8, lateralRate: 0.1 };
    const both: PlayerProfile = { ...mkProfile(axisDir), bossStyles: { thor: mkSlot(slotDir) } };
    expect(effectiveGhostProfile(both, 'thor').dodgeDir).toEqual(slotDir);
    const slotMissing: PlayerProfile = { ...mkProfile(axisDir), bossStyles: { thor: mkSlot() } };
    expect(effectiveGhostProfile(slotMissing, 'thor').dodgeDir).toEqual(axisDir);
    const neither: PlayerProfile = { ...mkProfile(), bossStyles: { thor: mkSlot() } };
    expect(effectiveGhostProfile(neither, 'thor').dodgeDir).toBeUndefined();
  });
});

// ==== GHOST-CMD-2A(§2.18追補 隙コマンド): 隙(気絶/技後硬直/カウンター直後)の計測 ==============
// 窓が閉じた瞬間に1票。票=窓中の近接与ダメ(botTelemetry.damageDealt.melee)の区間差分>0で 'rush'。

describe('playerTraits GHOST-CMD-2A: 隙コマンド(punish)の計測', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  const slotKey = bossStyleSlotKey('thor', 'test-stage');
  // セッションを撃破+30秒フロア越えで確定させ、プロファイルを読む。
  const finish = () => {
    tickPlayerTraits(baseInput({ gameTime: 35_000 }));
    notifyBossClear('thor', 'test-stage');
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 35_100 }));
    commitPendingTraits();
    return loadPlayerProfile()!;
  };

  it('stun窓中に近接ダメージが出たら rush 票(BossStyleSlotにも同じ写しが載る)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [mkBoss({ stunUntil: 3000 })] })); // 窓open
    recordDamageDealt('melee', 25);                                                          // 詰めて叩いた
    tickPlayerTraits(baseInput({ gameTime: 2000, enemies: [mkBoss({ stunUntil: 3000 })] }));
    tickPlayerTraits(baseInput({ gameTime: 3500 }));                                         // 窓close=1票
    const p = finish();
    expect(p.punish?.stun).toEqual({ n: 1, rushRate: 1 });
    expect(p.bossStyles?.[slotKey]?.punish?.stun).toEqual({ n: 1, rushRate: 1 });
  });

  it('stun窓中に近接ダメージが出なければ shoot 票(遠くから撃っていた人を決めつけない)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [mkBoss({ stunUntil: 3000 })] }));
    recordDamageDealt('gun', 40); // 銃は票に影響しない
    tickPlayerTraits(baseInput({ gameTime: 2000, enemies: [mkBoss({ stunUntil: 3000 })] }));
    tickPlayerTraits(baseInput({ gameTime: 3500 }));
    const p = finish();
    expect(p.punish?.stun).toEqual({ n: 1, rushRate: 0 });
  });

  it('窓の外で出た近接ダメージは数えない(起点は窓が開いた瞬間の累計)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    recordDamageDealt('melee', 80); // 窓の外(平時の近接)
    tickPlayerTraits(baseInput({ gameTime: 1000 }));
    tickPlayerTraits(baseInput({ gameTime: 2000, enemies: [mkBoss({ stunUntil: 4000 })] })); // 窓open
    tickPlayerTraits(baseInput({ gameTime: 4500 }));                                          // 窓close
    const p = finish();
    expect(p.punish?.stun).toEqual({ n: 1, rushRate: 0 });
  });

  it('文脈別に独立(recover=技後硬直の票はstunに入らない)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [mkBoss({ bossState: 'harai-recover' })] }));
    recordDamageDealt('melee', 12);
    tickPlayerTraits(baseInput({ gameTime: 2000 })); // 硬直明け=1票
    const p = finish();
    expect(p.punish?.recover).toEqual({ n: 1, rushRate: 1 });
    expect(p.punish?.stun).toBeUndefined();
    expect(p.punish?.afterCounter).toBeUndefined();
  });

  it('afterCounter=カウンター成立から1200ms(プレイヤーはlastCounterSuccessTimeが錨点)', () => {
    const t0 = Date.now();
    const withCounter = (at: number) => ({ ...mkPlayer(), lastCounterSuccessTime: at });
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 1000, player: withCounter(t0) })); // 成立直後=窓open
    recordDamageDealt('melee', 9);
    // 錨点を過去へずらす=窓は閉じている(1200ms経過相当)。
    tickPlayerTraits(baseInput({ gameTime: 2000, player: withCounter(t0 - 5000) }));
    const p = finish();
    expect(p.punish?.afterCounter).toEqual({ n: 1, rushRate: 1 });
  });

  it('隙の窓が1度も開かないセッションは punish を作らない(欠損=undefinedのまま)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 1000 }));
    const p = finish();
    expect(p.punish).toBeUndefined();
    expect(p.bossStyles?.[slotKey]?.punish).toBeUndefined();
  });

  it('2セッション目はα=0.3でEMA混合しnは累計(dodgeDirと同じ数式)', () => {
    // 1回目: rush(rushRate=1)
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [mkBoss({ stunUntil: 3000 })] }));
    recordDamageDealt('melee', 10);
    tickPlayerTraits(baseInput({ gameTime: 3500 }));
    finish();
    // 2回目: shoot(rushRate=0)
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 1000, enemies: [mkBoss({ stunUntil: 3000 })] }));
    tickPlayerTraits(baseInput({ gameTime: 3500 }));
    const p = finish();
    expect(p.punish!.stun!.n).toBe(2);
    expect(p.punish!.stun!.rushRate).toBeCloseTo(1 * 0.7 + 0 * 0.3, 10);
  });

  it('effectiveGhostProfile: punishはslot優先・slot欠損は軸1へ・両方欠損はundefined', () => {
    const base: PlayerProfile = {
      v: 1, runs: 1, reactionMs: 300, counterChance: 0.6, preferredDist: 200,
      meleeBias: 0.5, mobility: 0.7, hitsPerMin: 4, subUsesPerMin: 2,
      stationaryFrac: 0.3, approachPerMin: 2, moveReactions: {},
      subStyles: { wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 }, homing: { n: 0, holdMsAvg: 0 } },
    };
    const slot = (punish?: PlayerProfile['punish']) => ({
      reactionMs: null, counterChance: null, preferredDist: null, meleeBias: null, mobility: null,
      hitsPerMin: 1, subUsesPerMin: null, stationaryFrac: null, approachPerMin: null,
      subStyles: base.subStyles, srcClass: null, snapshot: null, srcName: null, at: 0,
      ...(punish ? { punish } : {}),
    });
    const slotPunish = { stun: { n: 1, rushRate: 1 } };
    const axisPunish = { stun: { n: 9, rushRate: 0.2 } };
    const both: PlayerProfile = { ...base, punish: axisPunish, bossStyles: { thor: slot(slotPunish) } };
    expect(effectiveGhostProfile(both, 'thor').punish).toEqual(slotPunish);
    const slotMissing: PlayerProfile = { ...base, punish: axisPunish, bossStyles: { thor: slot() } };
    expect(effectiveGhostProfile(slotMissing, 'thor').punish).toEqual(axisPunish);
    const neither: PlayerProfile = { ...base, bossStyles: { thor: slot() } };
    expect(effectiveGhostProfile(neither, 'thor').punish).toBeUndefined();
  });
});

describe('playerTraits G4a: サブ様式カウンタ(ラン単位・ボス交戦区間に限定しない)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  // fold はプロファイル未保存時に保存しない(挙動不変の掟=新規作成するとゴースト既定が変わるため)
  // ので、先にボス交戦セッション1回でプロファイルを作る。
  const createProfileViaSession = () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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
    notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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

  it('撃破なし/ゴーストランは保留に積まれない。撃破ありは30秒未満でも積まれる(v0.25.2579)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 29_000 })); // 30秒未満・撃破なし=破棄
    expect(hasPendingTraitRecords()).toBe(false);
    // v0.25.2579(社長報告「城ボスを倒したのに記録されない」): 撃破があれば30秒未満でも
    // 撃破スロットが保留に積まれる=採用チェックが出る(裁定v0.25.2493「撃破は残る」)。
    tickPlayerTraits(baseInput({ gameTime: 50_000 }));
    notifyBossClear('thor', 'test-stage');
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_000 })); // 交戦10秒で撃破
    expect(hasPendingTraitRecords()).toBe(true);
    settlePendingTraits(true); // 破棄して次の検証へ
    tickPlayerTraits(baseInput({ gameTime: 100_000, ghostRunActive: true }));
    notifyBossClear('thor', 'test-stage'); // G3ゲート: ゴーストランはそもそも計測されない
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 200_000, ghostRunActive: true }));
    expect(hasPendingTraitRecords()).toBe(false);
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
      notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
      tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
      step();
      // セッション2: 40秒・静止・gun寄り(2回目=EMA混合の畳みが実際に起きる)。
      tickPlayerTraits(baseInput({ gameTime: 100_000 }));
      recordDamageDealt('gun', 100);
      tickPlayerTraits(baseInput({ gameTime: 140_000 }));
      notifyBossClear('thor', 'test-stage'); // v0.25.2493: 撃破セッションのみ混ぜる裁定(セッション未開時はno-op)
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

    // ビット一致の保証対象は**軸1+subStyles部分**。bossStylesはG5仕様4(スロットのsubStyles写しは
    // 「同じcommitバッチ内のsubStyleレコード」から解決)により、確定点の粒度=commitの切り方で写しが
    // 変わり得るため対象外(v0.25.2493でセッションに撃破印が必須になったのに伴う比較範囲の明確化)。
    const axis1Of = (s: string | undefined): string => {
      const o = JSON.parse(s!) as Record<string, unknown>;
      delete o.bossStyles;
      return JSON.stringify(o);
    };
    expect(axis1Of(b)).toBe(axis1Of(a)); // 軸1+subStylesの保存文字列が一致=EMAの数学と順序は不変
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

  // v0.25.2603(社長式): 基準を**評点(高いほど良い)**へ差し替え。同点は撃破タイムでタイブレーク。
  it('isBetterBossStyleSample: 初記録は必ず採用/評点が高い方/同点は速い方/新サンプルnullは不採用', () => {
    expect(isBetterBossStyleSample(undefined, 5, false)).toBe(true); // 既存slot無し=初記録は必ず残す
    expect(isBetterBossStyleSample(undefined, null, false)).toBe(true); // 評点が出せない初記録も残す
    expect(isBetterBossStyleSample(null, 1.5)).toBe(true);       // 旧レコード(評点なし)=新形式へ入れ替え
    expect(isBetterBossStyleSample(null, null)).toBe(true);      // 計測対象外のボス=最新の撃破が残る
    expect(isBetterBossStyleSample(1.0, 2.5)).toBe(true);        // 評点が高い→上書き
    expect(isBetterBossStyleSample(2.5, 1.0)).toBe(false);       // 評点が低い→保持しない
    expect(isBetterBossStyleSample(2.0, null)).toBe(false);      // 比較不能=既存を守る
    // 同点はタイム(速い方)。タイムが無ければ新しい方。
    expect(isBetterBossStyleSample(2.0, 2.0, true, 50_000, 40_000)).toBe(true);  // 速い→上書き
    expect(isBetterBossStyleSample(2.0, 2.0, true, 40_000, 50_000)).toBe(false); // 遅い→保持しない
    expect(isBetterBossStyleSample(2.0, 2.0)).toBe(true);        // タイム不明=新しい方
  });

  it('bossStylePerfScore: 60×(3×カウンター率 − 2×被弾率) − 秒数', () => {
    const M = 60_000; // 1分
    // 全部カウンター=基礎3点 → 60*3 − 60秒 = 120
    expect(bossStylePerfScore({ 'g-jump': { exposures: 4, counters: 4, hits: 0 } }, M)).toBeCloseTo(120, 5);
    // 全部避け(カウンターも被弾も0)=基礎0点 → 0 − 60秒 = −60。**避けは加点しない**(社長裁定)。
    expect(bossStylePerfScore({ 'g-jump': { exposures: 4, counters: 0, hits: 0 } }, M)).toBeCloseTo(-60, 5);
    // 全部被弾=基礎−2点 → −120 − 60秒 = −180
    expect(bossStylePerfScore({ 'g-jump': { exposures: 4, counters: 0, hits: 4 } }, M)).toBeCloseTo(-180, 5);
    // 10技を8カウンター2回避・無傷 → 60*(3*0.8) − 60 = 144 − 60 = 84
    expect(bossStylePerfScore({ 'g-jump': { exposures: 10, counters: 8, hits: 0 } }, M)).toBeCloseTo(84, 5);
    // 弾を撃つ技(g-bolt)は避け/被弾を数えない=カウンターできた回だけ分子・分母に入る=基礎3点。
    expect(bossStylePerfScore({ 'g-bolt': { exposures: 10, counters: 2, hits: 5 } }, M)).toBeCloseTo(120, 5);
    // 技に一度も晒されていない=比較不能(null)。時間0も比較不能。
    expect(bossStylePerfScore({}, M)).toBeNull();
    expect(bossStylePerfScore({ 'g-bolt': { exposures: 6, counters: 0, hits: 3 } }, M)).toBeNull();
    expect(bossStylePerfScore({ 'g-jump': { exposures: 4, counters: 4, hits: 0 } }, 0)).toBeNull();
  });

  // 社長裁定: 全技カウンターの価値は3分。カウンターを最重視しつつ、極端な長期戦は速攻に負ける。
  it('評点はカウンター・ミス・速さを3分/2分の重みで比較する', () => {
    const run = (c: number, h: number, sec: number) => {
      const N = 20, counters = Math.round(N * c), hits = Math.round(N * h);
      return bossStylePerfScore({ 'g-jump': { exposures: N, counters, hits } }, sec * 1000)!;
    };
    const perfect = run(0.9, 0.0, 70);      // カウンター90%・無傷・70秒
    const perfectSlow = run(0.9, 0.0, 200); // 同じ腕で長期戦
    const rush = run(0.3, 0.1, 25);         // 超速攻だがカウンターは少ない
    const brute = run(0.1, 0.4, 45);        // 力押し(被弾だらけ)
    // カウンターが一番強い: 完璧なランは、どんな速攻より上。
    expect(perfect).toBeGreaterThan(rush);
    // 3分の重みに下げたため、極端な長期戦は速攻に負ける。
    expect(perfectSlow).toBeLessThan(rush);
    // ミスの多い力押しは最下位。
    expect(brute).toBeLessThan(rush);
    // 同じ腕なら速い方が上(時間はちゃんと効く)。
    expect(perfect).toBeGreaterThan(perfectSlow);
  });

  const mkAxis1Profile = (): PlayerProfile => ({
    v: 1, runs: 3, reactionMs: 300, counterChance: 0.6, preferredDist: 200,
    meleeBias: 0.5, mobility: 0.7, hitsPerMin: 4, subUsesPerMin: 2,
    stationaryFrac: 0.3, approachPerMin: 2,
    moveReactions: { 'thor-harai': { n: 5, counterRate: 0.5, hitRate: 0.1 } },
    subStyles: { wire: { n: 2, slamRatio: 0.5 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 }, homing: { n: 0, holdMsAvg: 0 } },
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
          subStyles: { wire: { n: 9, slamRatio: 1 }, shield: { n: 9, bashPerPlacement: 9, bashDamageFrac: 1 }, homing: { n: 3, holdMsAvg: 2100 } },
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
    expect(out.subStyles).toEqual({ wire: { n: 9, slamRatio: 1 }, shield: { n: 9, bashPerPlacement: 9, bashDamageFrac: 1 }, homing: { n: 3, holdMsAvg: 2100 } });
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

  it('撃破が無いセッションは何も保存されない(軸1にも混ぜない・v0.25.2493社長裁定「残るのは撃破だけ」)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull(); // 旧仕様(軸1だけ混ざる)から変更: 丸ごと破棄
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

  it('対象外の型(isEngageableBoss=false)の撃破通知は撃破と数えない=セッションごと破棄(v0.25.2493)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('reaper', 'stage-1'); // 死神はENGAGEABLE_BOSS_TYPES対象外
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull(); // 撃破印なし=何も保存されない
  });

  // PACING_PUZZLE.md §6.38 v6 B-2(賞金首): isEngageableBossではあるがisGhostEligibleBossではないので
  // 同じく撃破と数えない(倒す義務のない相手をゴースト週間の対象に混ぜない)。
  it('賞金首(isEngageableBossだがisGhostEligibleBoss=false)の撃破通知も撃破と数えない', () => {
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('bounty-ranged', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('セッション外(session=null)でのnotifyBossClearは無視される=そのセッションは撃破なし扱い(v0.25.2493)', () => {
    notifyBossClear('thor', 'stage-1'); // まだ交戦していない=session無し
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull();
  });

  it('ゴーストランではsessionが常にnullなのでnotifyBossClearは自動的に無視される(§2.7と同じゲート)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, ghostRunActive: true }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 60_000, ghostRunActive: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100, ghostRunActive: true }));
    commitPendingTraits();
    expect(loadPlayerProfile()).toBeNull(); // 軸1も未保存(既存G3挙動)なのでbossStylesも当然無い
  });

  it('撃破タイム(v0.25.2493): 交戦開始→撃破の時間がスロットに記録される(撃破後の残り時間は含まない)', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 45_000, movementInput: true }));
    notifyBossClear('thor', 'stage-1'); // この瞬間の経過=45秒が撃破タイム
    tickPlayerTraits(baseInput({ gameTime: 60_000, movementInput: true })); // 撃破後も交戦が続いた分
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles!.thor.clearTimeMs).toBe(45_000);
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
    // 1ラン目: mimir撃破込みで普通にcommitしてプロファイルを作る(v0.25.2493: 撃破が無いと何も保存されないため)。
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('mimir', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    settlePendingTraits(false);
    expect(loadPlayerProfile()!.bossStyles!.mimir).toBeDefined();
    const before = JSON.stringify(loadPlayerProfile());

    // 2ラン目: thor撃破込みで「反映しない」を選ぶ→プロファイルは1ラン目のまま1bitも動かない。
    resetPlayerTraits(); resetBotTelemetry();
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000 }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    settlePendingTraits(true); // 破棄
    expect(JSON.stringify(loadPlayerProfile())).toBe(before); // thorスロットは乗らず全体不変
  });

  // v0.25.2603(社長式): 基準が**評点**(技への反応)へ変わった。この計測ハーネスは技エピソードを
  // 起こさない=評点は常にnull → 「比較の土台が無いボスは最新の撃破が残る」経路の回帰になる。
  it('評点が出せないボスは最新の撃破が残る(比較の土台が無い=居座らせない)', () => {
    // ラン1: 60秒で2回被弾して撃破。
    tickPlayerTraits(baseInput({ gameTime: 0, player: mkPlayer(100, 100), enemies: [mkBoss()] }));
    tickPlayerTraits(baseInput({ gameTime: 10_000, player: mkPlayer(90, 100), enemies: [mkBoss()] }));
    tickPlayerTraits(baseInput({ gameTime: 20_000, player: mkPlayer(80, 100), enemies: [mkBoss()] }));
    notifyBossClear('thor', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 60_000, player: mkPlayer(80, 100), enemies: [mkBoss()] }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    commitPendingTraits();
    expect(loadPlayerProfile()!.bossStyles!.thor.hitsPerMin).toBeCloseTo(2, 5);
    expect(loadPlayerProfile()!.bossStyles!.thor.perfScore).toBeUndefined(); // 評点は出せていない

    // ラン2: 60秒で5回被弾(前より下手)でも、比較の土台が無いので**最新が残る**。
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
    expect(loadPlayerProfile()!.bossStyles!.thor.hitsPerMin).toBeCloseTo(5, 5);
  });

  it('subStylesの写し: 同ランにsubStyleレコードが有れば軸1のEMAとは異なるラン実測レート(EMAなし)を使う', () => {
    // ラン1: mimir撃破込みでプロファイル作成(v0.25.2493: 撃破必須)+wire使用(スラム3回=slamRatio1)で
    // 軸1の「前回値」を作る。
    tickPlayerTraits(baseInput({ gameTime: 0 }));
    notifyBossClear('mimir', 'stage-1');
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

  it('軸1の計測・EMA・保存は「どのボスを撃破したか」で変わらない(bossStyleの中身が違っても軸1はビット一致)', () => {
    // v0.25.2493: 撃破の無いセッションは丸ごと破棄されるため、比較は「撃破したボスが違う2アーム」で行う。
    // (A) mimir撃破のラン。srcNameは未設定だとランダム初期名が生成され両アームで別名になるため固定する。
    const storeA = installStorage(); resetBotTelemetry(); resetPlayerTraits();
    savePlayerName('axis1-fixed');
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    notifyBossClear('mimir', 'stage-1');
    tickPlayerTraits(baseInput({ gameTime: 30_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 30_100 }));
    commitPendingTraits();
    const a = storeA.get('zombie-ghost-profile-v1');
    const aParsed = JSON.parse(a!) as PlayerProfile & Record<string, unknown>;
    expect(aParsed.bossStyles).toBeDefined();
    delete (aParsed as Record<string, unknown>).bossStyles; // 比較対象は軸1部分のみ

    // (B) 同じ操作でthor撃破(bossStylesのキーが違うだけで軸1は変わらないはず)。
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

// ============================================================================
// GHOST-RESULT-UI(BOT_AND_GHOST.md §2.16 A): スロット別決算(リザルトの「採用」チェック)+
// 同行守護霊の保存 + リザルト年表のビュー。
// ============================================================================

// 30秒以上の交戦セッションを1本張って、その中で指定スロットを撃破する共通手順。
const runClearSession = (
  clears: { type: Parameters<typeof notifyBossClear>[0]; stageId: string; ally?: Parameters<typeof notifyBossClear>[2] }[],
  startAt = 0,
) => {
  tickPlayerTraits(baseInput({ gameTime: startAt, movementInput: true }));
  for (const c of clears) notifyBossClear(c.type, c.stageId, c.ally ?? null);
  tickPlayerTraits(baseInput({ gameTime: startAt + 30_000, movementInput: true }));
  tickPlayerTraits(baseInput({ inCombat: false, gameTime: startAt + 30_100 }));
};

describe('playerTraits §2.16 A: 採用選択(selectPendingForSettlement)', () => {
  const session = { kind: 'session' } as unknown as PendingTraitRecord;
  const sub = { kind: 'subStyle' } as unknown as PendingTraitRecord;
  const boss = (slotKey: string) => ({ kind: 'bossStyle', slotKey } as unknown as PendingTraitRecord);

  it('undefined(年表を出さないラン)は1件も落とさない=従来どおり全採用', () => {
    const recs = [session, boss('thor'), sub];
    expect(selectPendingForSettlement(recs, undefined)).toEqual(recs);
  });

  it('撃破が保留に無いランは採用選択の対象外=そのまま通す(サブ様式だけのラン)', () => {
    expect(selectPendingForSettlement([sub], [])).toEqual([sub]);
  });

  it('全不採用は全破棄(=「今回のプレイを守護霊に反映しない」と同義)', () => {
    expect(selectPendingForSettlement([session, boss('thor'), sub], [])).toEqual([]);
  });

  it('一部採用は採用スロットのbossStyleだけ残し、軸1(session/subStyle)は反映する', () => {
    const recs = [session, boss('thor'), boss('mimir'), sub];
    // v0.25.2603(社長裁定A): 残った撃破には adopted:true の印が付く(commit側が無条件で上書きする)。
    expect(selectPendingForSettlement(recs, ['mimir']))
      .toEqual([session, { ...boss('mimir'), adopted: true }, sub]);
  });
});

describe('playerTraits §2.16 A: settlePendingTraitsの採用引数(結線)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('採用したボスのスロットだけが保存され、軸1も反映される', () => {
    runClearSession([{ type: 'thor', stageId: 'stage-1' }, { type: 'mimir', stageId: 'stage-1' }]);
    settlePendingTraits(false, ['mimir']);
    const p = loadPlayerProfile()!;
    expect(Object.keys(p.bossStyles!)).toEqual(['mimir']);
    expect(p.runs).toBe(1); // 軸1(共通傾向)は採用1件以上なので反映される
  });

  it('全不採用(空配列)は軸1にもスロットにも1bitも書かない', () => {
    runClearSession([{ type: 'thor', stageId: 'stage-1' }]);
    settlePendingTraits(false, []);
    expect(loadPlayerProfile()).toBeNull();
  });

  it('採用引数を渡さない(従来経路)なら全スロットが保存される=旧挙動のまま', () => {
    runClearSession([{ type: 'thor', stageId: 'stage-1' }, { type: 'giantbat', stageId: 'stage-5' }]);
    settlePendingTraits(false);
    expect(Object.keys(loadPlayerProfile()!.bossStyles!).sort()).toEqual(['giantbat@stage-5', 'thor']);
  });

  it('optOut=trueは採用引数より強い(全破棄)', () => {
    runClearSession([{ type: 'thor', stageId: 'stage-1' }]);
    settlePendingTraits(true, ['thor']);
    expect(loadPlayerProfile()).toBeNull();
  });

  it('不採用にしたボスは既存の記録を上書きしない(前の記録がそのまま残る)', () => {
    // 1ラン目: thorを普通に記録。
    runClearSession([{ type: 'thor', stageId: 'stage-1' }]);
    settlePendingTraits(false, ['thor']);
    const first = loadPlayerProfile()!.bossStyles!.thor;
    // 2ラン目: 同じthorを撃破するが不採用にする(撃破タイムが変わっていても記録は動かない)。
    resetPlayerTraits();
    runClearSession([{ type: 'thor', stageId: 'stage-1' }, { type: 'mimir', stageId: 'stage-1' }]);
    settlePendingTraits(false, ['mimir']);
    expect(loadPlayerProfile()!.bossStyles!.thor).toEqual(first);
  });
});

describe('playerTraits §2.16 A: 同行守護霊の保存(撃破の瞬間の写し)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  const ally = { name: 'tanity', build: { maxHealth: 120, speed: 8, level: 9 }, isOwn: true };

  it('撃破時に渡した同行者(名前+ビルド写し)がスロットへ保存される', () => {
    runClearSession([{ type: 'thor', stageId: 'stage-1', ally }]);
    settlePendingTraits(false, ['thor']);
    expect(loadPlayerProfile()!.bossStyles!.thor.ally).toEqual(ally);
  });

  it('同行者が居ない撃破はallyを保存しない(欠損=カード非表示)', () => {
    runClearSession([{ type: 'thor', stageId: 'stage-1' }]);
    settlePendingTraits(false, ['thor']);
    expect(loadPlayerProfile()!.bossStyles!.thor.ally).toBeUndefined();
  });

  it('スロットごとに別々の同行者が付く(同じセッションでも撃破ごとの写し)', () => {
    const other = { name: 'someone', isOwn: false };
    runClearSession([
      { type: 'thor', stageId: 'stage-1', ally },
      { type: 'mimir', stageId: 'stage-1', ally: other },
    ]);
    settlePendingTraits(false, ['thor', 'mimir']);
    const p = loadPlayerProfile()!;
    expect(p.bossStyles!.thor.ally).toEqual(ally);
    expect(p.bossStyles!.mimir.ally).toEqual(other);
  });
});

describe('playerTraits §2.16 B: リザルト年表のビュー(pendingBossClears)', () => {
  beforeEach(() => { installStorage(); resetBotTelemetry(); resetPlayerTraits(); });

  it('撃破順に生値(撃破タイム/被弾per分/カウンター成功率)を返す', () => {
    tickPlayerTraits(baseInput({ gameTime: 0, movementInput: true }));
    tickPlayerTraits(baseInput({ gameTime: 20_000, movementInput: true }));
    notifyBossClear('thor', 'stage-1');
    notifyBossClear('giantbat', 'stage-5');
    tickPlayerTraits(baseInput({ gameTime: 60_000, movementInput: true }));
    tickPlayerTraits(baseInput({ inCombat: false, gameTime: 60_100 }));
    const view = pendingBossClears();
    expect(view.map(v => v.slotKey)).toEqual(['thor', 'giantbat@stage-5']);
    expect(view[0].clearTimeMs).toBe(20_000);
    expect(view[0].hitsPerMin).toBe(0); // 被弾なし
    expect(view[0].counterChance).toBeNull(); // 機会が無ければnull(未計測)
  });

  it('撃破が無いラン/決算後は空(年表セクションを出さない条件)', () => {
    expect(pendingBossClears()).toEqual([]);
    runClearSession([{ type: 'thor', stageId: 'stage-1' }]);
    expect(pendingBossClears()).toHaveLength(1);
    settlePendingTraits(false, ['thor']);
    expect(pendingBossClears()).toEqual([]);
  });
});
