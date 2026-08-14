// PACING_PUZZLE.md §6.38 B1(賞金首)の純関数ユニットテスト+B1.5-6のrunBountyTick状態機械テスト。
// 純関数(bountyEngagedNow等)は「1分退場・戦闘中リセット・抑止ゲート」を式で機械化する。
// runBountyTick本体(store書き込みを伴う)は、idolTick.test.tsと同じ作法(resetGame→盤面を作り
// tickを実際に回す)で状態機械を検証する(B1.5監査の指摘=「漏れの機械化」)。描画はテスト対象外。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  bountyEngagedNow, bountyLingerExpired, bountySpawnBlocked, pickActiveBounty, bountyMaxHealth,
  runBountyTick, createBountyTickState,
  BOUNTY_LINGER_MS, BOUNTY_HIT_ENGAGE_MS, BOUNTY_BASE_HP, BOUNTY_DEPART_FADE_MS, BOUNTY_WAKE_FX_MS,
  BR_ESCORT_COUNT as BR_ESCORT_COUNT_FOR_TEST,
} from './bountyTick';
import { usesMimirLaser } from './mimirLaserTrack';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy, EnemyType } from '../types/game';

describe('bountyEngagedNow — 交戦の定義(§2「dormant=falseかつ(距離<リーシュ半径 or 直近3秒被弾)」)', () => {
  it('dormant中は距離・被弾に関わらず非交戦', () => {
    expect(bountyEngagedNow({ dormant: true, distance: 0, msSinceHit: 0 }, 700)).toBe(false);
  });
  it('リーシュ半径未満なら交戦', () => {
    expect(bountyEngagedNow({ dormant: false, distance: 699, msSinceHit: 999999 }, 700)).toBe(true);
    expect(bountyEngagedNow({ dormant: false, distance: 700, msSinceHit: 999999 }, 700)).toBe(false); // 境界=含まない(<)
  });
  it('リーシュ半径の外でも直近3秒以内の被弾があれば交戦(戦闘中リセットの土台)', () => {
    expect(bountyEngagedNow({ dormant: false, distance: 5000, msSinceHit: BOUNTY_HIT_ENGAGE_MS }, 700)).toBe(true);
    expect(bountyEngagedNow({ dormant: false, distance: 5000, msSinceHit: BOUNTY_HIT_ENGAGE_MS + 1 }, 700)).toBe(false);
  });
});

describe('bountyLingerExpired — 滞在1分(gameTime基準・§2)', () => {
  it('59秒999msでは満了しない・60秒ちょうどで満了する', () => {
    expect(bountyLingerExpired(BOUNTY_LINGER_MS - 1, 0, 0)).toBe(false);
    expect(bountyLingerExpired(BOUNTY_LINGER_MS, 0, 0)).toBe(true);
  });
  it('lastEngagedAt未設定ならspawnedAtを起点にする(一度も交戦しないまま1分で去る)', () => {
    expect(bountyLingerExpired(BOUNTY_LINGER_MS - 1, undefined, 1000)).toBe(false);
    expect(bountyLingerExpired(1000 + BOUNTY_LINGER_MS, undefined, 1000)).toBe(true);
  });
  it('★戦闘中リセット: lastEngagedAtがgameTimeへ更新され続ける限り満了しない(=毎フレーム交戦ならいつまでも残る)', () => {
    // 「戦闘中は毎フレームリセット」を模した検算: 各フレームでlastEngagedAt=現在時刻に更新される想定なら
    // 経過は常に0付近に保たれ、BOUNTY_LINGER_MSにはまず到達しない。
    let lastEngagedAt = 0;
    for (let t = 0; t <= BOUNTY_LINGER_MS * 3; t += 100) {
      expect(bountyLingerExpired(t, lastEngagedAt, 0), `t=${t}`).toBe(false);
      lastEngagedAt = t; // このフレームは交戦中=リセット
    }
  });
});

describe('bountySpawnBlocked — 抑止ゲート(B1では用意+テストのみ・配線はB4)', () => {
  const ok = (): Parameters<typeof bountySpawnBlocked>[0] => ({
    bossFightNow: false, activeEvent: false, hiddenBossAlive: false, redNightActive: false,
    area: 2, storyBossOnly: false, labTheme: false, corridorMode: false, tutorialStage: false,
  });
  it('全条件クリアならブロックしない', () => {
    expect(bountySpawnBlocked(ok())).toBe(false);
  });
  it('各条件が単独でブロックする', () => {
    expect(bountySpawnBlocked({ ...ok(), bossFightNow: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), activeEvent: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), hiddenBossAlive: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), redNightActive: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), area: 1 })).toBe(true); // 初心者ゾーン(憲法第4条・エリア0-1)
    expect(bountySpawnBlocked({ ...ok(), area: 0 })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), storyBossOnly: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), labTheme: true })).toBe(true); // v6 B-5
    expect(bountySpawnBlocked({ ...ok(), corridorMode: true })).toBe(true); // v6 B-5
    expect(bountySpawnBlocked({ ...ok(), tutorialStage: true })).toBe(true);
  });
  it('area>=2なら初心者ゾーン条件には掛からない', () => {
    expect(bountySpawnBlocked({ ...ok(), area: 2 })).toBe(false);
  });
});

describe('bountyMaxHealth — 基準2000×実効難易度倍率(§3)', () => {
  it('エリア0・時刻0では基準値そのまま(倍率1.0)', () => {
    expect(bountyMaxHealth(0, 0)).toBe(BOUNTY_BASE_HP);
  });
  it('エリアが深いほど・時間が経つほど増える(単調)', () => {
    const a0 = bountyMaxHealth(0, 0);
    const a4 = bountyMaxHealth(4, 0);
    const t8 = bountyMaxHealth(0, 8 * 60 * 1000); // 8:00=仮想エリア4相当
    expect(a4).toBeGreaterThan(a0);
    expect(t8).toBeGreaterThan(a0);
    expect(t8).toBeCloseTo(a4, -1);
  });
});

describe('pickActiveBounty — 起きている個体を最優先(pickActiveIdolと同じ作法)', () => {
  const mk = (id: string, type: EnemyType, dormant: boolean): Enemy =>
    ({ id, type, dormant, x: 0, y: 0, width: 10, height: 10, health: 10, maxHealth: 10, speed: 10, damage: 0, lastHit: 0 } as Enemy);
  it('賞金首以外は無視する', () => {
    expect(pickActiveBounty([mk('a', 'zombie', false)])).toBeUndefined();
  });
  it('起きている個体があれば最優先で返す', () => {
    const dormantOne = mk('d', 'bounty-ranged', true);
    const awake = mk('a', 'bounty-melee', false);
    expect(pickActiveBounty([dormantOne, awake])?.id).toBe('a');
  });
  it('休眠しかいなければ先頭の1体を返す', () => {
    const d1 = mk('d1', 'bounty-ranged', true);
    const d2 = mk('d2', 'bounty-melee', true);
    expect(pickActiveBounty([d1, d2])?.id).toBe('d1');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// §6.38 B1.5-6(致命の監査指摘「漏れの機械化」): runBountyTick状態機械を実際に回して検証する
// (idolTick.test.tsのsetupと同じ作法=resetGame→盤面を作りtickを手動で進める)。
// 木/松明は procedural に湧くため setTreesDisabled/setTorchesDisabled で無効化し、衝突を持ち込まない
// (resolveBountyMoveの正しさそのものは既存のresolveOutOfSolids/アイテム着地点と共通=ここでは検証しない)。
// ─────────────────────────────────────────────────────────────────────────
describe('runBountyTick — 状態機械(§6.38 B1.5-6)', () => {
  beforeEach(() => {
    setTreesDisabled(true);
    setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  // gameTimeの起点を0にしない: bounty.lastHitの既定値(0)から見て「直近3秒以内の被弾」に
  // 誤って引っ掛からないようにするため(nowMs=gt・被弾していないのにmsSinceHit<=3000になる事故を防ぐ)。
  const START_GT = 10_000_000;

  /** 賞金首1体+プレイヤーの盤面を作り、tickを手動で進めるヘルパ(idolTick.test.tsのsetupを踏襲)。 */
  const setup = (over: Partial<Enemy> = {}) => {
    const e = spawnEnemyAt('bounty-ranged', 50000, 50000, START_GT); // 原点から遠く離す=施設/街プロップと無縁
    e.dormant = true;
    e.homeX = e.x; e.homeY = e.y;
    e.aggroRange = 200;
    Object.assign(e, over);
    useGameStore.setState(s => ({
      enemies: [e],
      player: { ...s.player, x: 50000 + 5000, y: 50000, health: 9999, maxHealth: 9999 }, // 索敵範囲外に配置
    }));
    let gt = START_GT;
    const s = createBountyTickState();
    const step = (ms: number): void => {
      gt += ms;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) runBountyTick(cur, s, gt, ms / 1000, 1, gt); // headlessではDate.now基準の代わりにgtを流用(相対時間だけ使う)
    };
    return { id: e.id, step, gt: () => gt };
  };

  it('★1分退場: dormantのまま接敵が無いと60秒+フェード後にenemiesから消える', () => {
    const { id, step } = setup();
    // 60秒未満では消えない。
    step(BOUNTY_LINGER_MS - 1000);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeDefined();
    // 60秒到達=退場フェード開始。まだ消えない。
    step(1000);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeDefined();
    // フェード完了未満ではまだ残る。
    step(BOUNTY_DEPART_FADE_MS - 1);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeDefined();
    // フェード完了=消滅。
    step(2);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeUndefined();
  });

  it('★戦闘中リセット: 交戦中(距離<リーシュ半径)を保ち続けると60秒を超えても退場しない', () => {
    // プレイヤーを起床範囲の内側(=交戦中)へ置く。
    const { id, step } = setup();
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 100, y: 50000 } }));
    // 起床(1tick)。
    step(16);
    expect(useGameStore.getState().enemies.find(e => e.id === id)?.dormant).toBe(false);
    // 交戦圏内のまま60秒超を刻み続ける=毎フレームbountyLastEngagedAtがリセットされるので退場しない。
    for (let i = 0; i < 400; i++) step(200); // 400*200ms = 80秒
    const after = useGameStore.getState().enemies.find(e => e.id === id);
    expect(after).toBeDefined();
    expect(after?.dormant).toBe(false);
  });

  // §6.38 B1.5-2(致命): 紫(フルスタン)中は座標もbossStateも進行しない(idolTick.ts:228/236と同型)。
  it('★紫(bossFullStunUntil)中は座標が動かない(カウンターのノックバック座標を上書きしない)', () => {
    const { id, step } = setup();
    // 起床させて追跡させる(=通常は毎tick位置が動く状態を作る)。
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 100, y: 50000 } }));
    step(16); // 起床
    step(16); // 追跡へ移行(bounty-wake演出はまだ残るが、フリーズ確認には無関係)
    const before = useGameStore.getState().enemies.find(e => e.id === id)!;
    expect(before.dormant).toBe(false);
    // 紫(完全気絶)を発生させる: bossFullStunUntil/stunUntilを現在gameTimeより先に設定
    // (=ノックバック等の外部要因で立った状態を模す。runBountyTick自身はこれを立てない)。
    const stunUntil = useGameStore.getState().gameTime + 5000;
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === id ? { ...e, bossFullStunUntil: stunUntil, stunUntil } : e),
    }));
    const frozenX = useGameStore.getState().enemies.find(e => e.id === id)!.x;
    const frozenY = useGameStore.getState().enemies.find(e => e.id === id)!.y;
    // 紫の間、複数tick進めても座標が変わらない。
    for (let i = 0; i < 20; i++) step(100);
    const during = useGameStore.getState().enemies.find(e => e.id === id)!;
    expect(during.x).toBe(frozenX);
    expect(during.y).toBe(frozenY);
    expect(during.bossFullStunUntil).toBe(stunUntil); // 自分では解除しない(解除は他系統の責務)
  });

  // knockbackUntil/liftUntilはDate.now基準。ここではnowMs(=runBountyTickの第5引数)を直接操作して確認する。
  it('★ノックバック中(knockbackUntil)も座標が動かない(chase移動で上書きしない)', () => {
    const { id, step } = setup();
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 100, y: 50000 } }));
    step(16); // 起床
    step(16); // 追跡へ
    const knockbackUntilMs = useGameStore.getState().gameTime + 500; // このテストではnowMsにもgameTimeを流用している
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === id ? { ...e, knockbackUntil: knockbackUntilMs, x: 12345, y: 67890 } : e),
    }));
    // ノックバック中は追跡が上書きしない=座標がそのまま(x=12345,y=67890)で留まる。
    step(50);
    const after = useGameStore.getState().enemies.find(e => e.id === id)!;
    expect(after.x).toBe(12345);
    expect(after.y).toBe(67890);
  });

  it('★帰巣完了→dormant+新しい1分: 離脱→帰巣→到着でdormant化し、以後また1分カウントが始まる', () => {
    const { id, step } = setup();
    // 起床させ、直後に離れる(交戦解除→リーシュ発火)。
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 100, y: 50000 } }));
    step(16); // 起床
    expect(useGameStore.getState().enemies.find(e => e.id === id)?.dormant).toBe(false);
    // 起床演出(bounty-wake)を終わらせてからプレイヤーを大きく離す(リーシュ半径700pxの外)。
    step(BOUNTY_WAKE_FX_MS + 16);
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 5000, y: 50000 } }));
    // 猶予(1.2秒)+帰巣移動が完了するまで刻む(帰巣速度はBOSS_LEASH_RETURN_SPEED_MULT×speed)。
    for (let i = 0; i < 2000; i++) {
      step(50);
      if (useGameStore.getState().enemies.find(e => e.id === id)?.dormant === true) break;
    }
    const arrived = useGameStore.getState().enemies.find(e => e.id === id);
    expect(arrived?.dormant).toBe(true);
    // 障害物衝突(resolveBountyMove・B1.5-4)が街プロップ等で数px押し出す場合があるため、
    // ここでは「巣のすぐ近くに戻った」ことだけを見る(ぴったり一致は求めない=状態機械の検証が主眼)。
    expect(Math.abs(arrived!.x - 50000)).toBeLessThan(10);
    expect(Math.abs(arrived!.y - 50000)).toBeLessThan(10);
    // 到着直後は新しい1分の起点(bountyLastEngagedAt)がリセットされている=まだ59秒では退場しない。
    step(BOUNTY_LINGER_MS - 2000);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeDefined();
    // ★新しい1分が実際に効いていることの確認: さらに1分超が経てば(=到着から1分超)今度こそ
    // 退場フェードが始まり、フェード完了ぶんもう1tick進めれば消える(単に「最初のspawnedAtから測って
    // 1分経ってないだけ」ではないことを、大きく超過させて区別する)。
    step(BOUNTY_LINGER_MS);
    expect(useGameStore.getState().enemies.find(e => e.id === id)?.bountyDepartAt).toBeDefined();
    step(BOUNTY_DEPART_FADE_MS + 100);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeUndefined();
  });
});

// =================================================================================================
// §6.38 B2a: バス停(bounty-ranged)/馬乗り(bounty-melee)の技。runBountyTickの状態機械を実際に回す
// (idolTick.test.tsと同じ作法)。描画はテスト対象外(掟)。
// =================================================================================================
describe('runBountyTick — B2a 技の状態機械', () => {
  beforeEach(() => {
    setTreesDisabled(true);
    setTorchesDisabled(true);
    useGameStore.getState().resetGame('assault');
  });

  const START_GT = 10_000_000;

  /** setupと同型だが型を選べる(バス停/馬乗りの技テスト用)。 */
  const setupType = (type: EnemyType, playerOffset: { x: number; y: number }, over: Partial<Enemy> = {}) => {
    const e = spawnEnemyAt(type, 50000, 50000, START_GT);
    e.dormant = false; // 技テストは交戦中から始める(起床演出待ちを省く)
    e.homeX = e.x; e.homeY = e.y;
    e.aggroRange = 200;
    e.lastHit = START_GT; // 交戦(bountyEngagedNow)を確実に成立させる
    Object.assign(e, over);
    useGameStore.setState(s => ({
      enemies: [e],
      player: { ...s.player, x: e.x + playerOffset.x, y: e.y + playerOffset.y, health: 9999, maxHealth: 9999 },
    }));
    let gt = START_GT;
    const s = createBountyTickState();
    const step = (ms: number): void => {
      gt += ms;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) runBountyTick(cur, s, gt, ms / 1000, 1, gt);
    };
    return { id: e.id, step, gt: () => gt, state: s };
  };

  describe('バス停(bounty-ranged)', () => {
    it('近すぎると押しのけ(br-push-windup)を発火する', () => {
      const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 }); // BR_PUSH_RANGE(110)未満
      step(16);
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-push-windup');
    });

    it('押しのけ完走: windup→push→recoverを経てchaseへ戻り、pumpkinBlastsへ判定を積む(判定=絵の一致)', () => {
      // プレイヤーが動かないため押しのけ→chase→(再び近接)押しのけ…が回り続ける想定の盤面。
      // 「一度でもchaseへ戻ったか」を見る(押しのけ範囲に居続ける限り再発火するのは仕様どおり)。
      const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 });
      const before = useGameStore.getState().pumpkinBlasts.length;
      const seen = new Set<string | undefined>();
      for (let i = 0; i < 60; i++) { // 500ms windup+120ms active+700ms recoverを1周ぶん十分上回る
        step(50);
        seen.add(useGameStore.getState().enemies.find(e => e.id === id)?.bossState);
      }
      expect(seen.has('chase')).toBe(true); // windup→push→recoverを経てchaseへ復帰した
      expect(useGameStore.getState().pumpkinBlasts.length).toBeGreaterThan(before);
    });

    it('押しのけはカウンター可能(windup中のカウンター成立でchaseへ即復帰=v3128の掟)', () => {
      const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 });
      step(16);
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-push-windup');
      // カウンター成立の条件(rectsOverlap+counterWindowEnd)を満たす: プレイヤーを重ねてカウンター窓を開く。
      const bounty = useGameStore.getState().enemies.find(e => e.id === id)!;
      useGameStore.setState(s => ({
        player: { ...s.player, x: bounty.x, y: bounty.y, counterWindowEnd: Date.now() + 5000 },
      }));
      const hpBefore = useGameStore.getState().enemies.find(e => e.id === id)!.health;
      step(16);
      const after = useGameStore.getState().enemies.find(e => e.id === id);
      expect(after?.bossState).toBe('chase'); // 技が中断されchaseへ復帰(v3128)
      expect(after!.health).toBeLessThan(hpBefore); // カウンター反撃ダメージが入っている
    });

    it('取り巻き召喚: 交戦開始1回だけ2体・再召喚なし', () => {
      const { step } = setupType('bounty-ranged', { x: 700, y: 0 }); // kite圏内=押しのけ/レーザーどちらも発火しない距離
      const before = useGameStore.getState().enemies.length;
      step(16);
      const afterFirst = useGameStore.getState().enemies.length;
      expect(afterFirst).toBe(before + BR_ESCORT_COUNT_FOR_TEST);
      for (let i = 0; i < 20; i++) step(50);
      expect(useGameStore.getState().enemies.length).toBe(afterFirst); // 増え続けない=再召喚なし
    });

    it('輸入=ミーミル型レーザー: usesMimirLaser経由で共有状態(laser-windup→laser-fire→laser-recover)を回す', () => {
      const { id, step } = setupType('bounty-ranged', { x: 600, y: 0 }, { mimirLaserReadyAt: 0 });
      // kite圏内(BR_KITE_MIN=340超)+押しのけ範囲外(110超)+レーザーCD明け=laser-windupへ入る。
      step(16);
      const afterFirst = useGameStore.getState().enemies.find(e => e.id === id);
      expect(afterFirst?.bossState).toBe('laser-windup');
      expect(usesMimirLaser(afterFirst!.type)).toBe(true); // §4②「輸入」がB0の型ゲートを実際に使っている
      // windup(3000ms)+fire(1500ms)+recover(900)を十分上回るまで刻む。
      for (let i = 0; i < 120; i++) step(50);
      const after = useGameStore.getState().enemies.find(e => e.id === id);
      expect(after?.bossState).toBe('chase');
      expect(after?.mimirLaserReadyAt).toBeGreaterThan(useGameStore.getState().gameTime - 1); // 通常CDが課される
    });
  });

  describe('馬乗り(bounty-melee)', () => {
    it('密着帯(BM_MELEE_MAX以内)で3段コンボ(速→速→遅)を発火する', () => {
      const { id, step } = setupType('bounty-melee', { x: 80, y: 0 });
      step(16);
      const s1 = useGameStore.getState().enemies.find(e => e.id === id);
      expect(s1?.bossState).toBe('bm-combo1-windup');
    });

    it('3段コンボ完走: 1→2→3段目まで進み、各段でpumpkinBlastsへ判定を積んでからchaseへ戻る(終端=パニッシュ窓)', () => {
      const { id, step } = setupType('bounty-melee', { x: 80, y: 0 });
      const seenStates = new Set<string | undefined>();
      let blastCount = 0;
      for (let i = 0; i < 80; i++) {
        step(50);
        const cur = useGameStore.getState().enemies.find(e => e.id === id);
        seenStates.add(cur?.bossState);
        blastCount = Math.max(blastCount, useGameStore.getState().pumpkinBlasts.length);
      }
      expect(seenStates.has('bm-combo1-windup')).toBe(true);
      expect(seenStates.has('bm-combo2-windup')).toBe(true);
      expect(seenStates.has('bm-combo3-windup')).toBe(true);
      expect(seenStates.has('bm-combo3-recover')).toBe(true);
      expect(blastCount).toBeGreaterThanOrEqual(3); // 3段=3回の判定
      // プレイヤーが動かないため終端(chase)後に再び密着帯へ入って次のコンボが再発火する想定の盤面
      // (押しのけ同様「一度でもchaseへ戻ったか」を見る=終端パニッシュ窓が実在することの確認)。
      expect(seenStates.has('chase')).toBe(true);
    });

    it('輸入=懲罰狙撃: 遠距離に2秒(BM_FAR_MS)留まると自動発火する(§4③「近寄らざるを得ない」)', () => {
      // 突進の間合い(BM_CHARGE_REACH=420)より十分遠くから始める(近づくにつれ突進帯に入るより先に
      // 懲罰が発火することを見るため。bounty.speed=50px/s×2sで100px縮まっても420pxより遠いまま)。
      const { id, step } = setupType('bounty-melee', { x: 700, y: 0 });
      // 2秒未満ではまだ発火しない。
      for (let i = 0; i < 39; i++) step(50); // 1950ms
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).not.toBe('bm-snipe-windup');
      step(100); // 2050ms到達
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('bm-snipe-windup');
    });

    it('突進(輸入=werewolf windup→charge): windup後、突進中は距離が縮む', () => {
      const { id, step } = setupType('bounty-melee', { x: 350, y: 0 }); // コンボ帯外・懲罰帯未満(近くも遠くもない)
      // 中立からbossNextActionAt到達で突進を選ぶ(BOUNTY_NEUTRAL_MSは350ms=下の刻みで十分超える)。
      let sawChargeWindup = false;
      let sawCharge = false;
      let distAtChargeStart = Infinity;
      let distAfterCharge = -Infinity;
      for (let i = 0; i < 200; i++) {
        step(30);
        const cur = useGameStore.getState().enemies.find(e => e.id === id);
        if (!cur) break;
        const p = useGameStore.getState().player;
        const d = Math.hypot((p.x + p.width / 2) - (cur.x + cur.width / 2), (p.y + p.height / 2) - (cur.y + cur.height / 2));
        if (cur.bossState === 'bm-charge-windup' && !sawChargeWindup) { sawChargeWindup = true; distAtChargeStart = d; }
        if (cur.bossState === 'bm-charge') { sawCharge = true; distAfterCharge = d; }
        if (sawCharge && cur.bossState !== 'bm-charge') break; // 突進が終わったら打ち切り
      }
      expect(sawChargeWindup).toBe(true);
      expect(sawCharge).toBe(true);
      expect(distAfterCharge).toBeLessThan(distAtChargeStart); // 突進で距離が縮んでいる
    });
  });
});
