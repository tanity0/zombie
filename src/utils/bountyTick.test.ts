// PACING_PUZZLE.md §6.38 B1(賞金首)の純関数ユニットテスト+B1.5-6のrunBountyTick状態機械テスト。
// 純関数(bountyEngagedNow等)は「1分退場・戦闘中リセット・抑止ゲート」を式で機械化する。
// runBountyTick本体(store書き込みを伴う)は、idolTick.test.tsと同じ作法(resetGame→盤面を作り
// tickを実際に回す)で状態機械を検証する(B1.5監査の指摘=「漏れの機械化」)。描画はテスト対象外。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  bountyEngagedNow, bountyLingerExpired, bountySpawnBlocked, pickActiveBounty, bountyMaxHealth,
  runBountyTick,
  BOUNTY_LINGER_MS, BOUNTY_HIT_ENGAGE_MS, BOUNTY_BASE_HP, BOUNTY_DEPART_FADE_MS, BOUNTY_WAKE_FX_MS,
} from './bountyTick';
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
    const step = (ms: number): void => {
      gt += ms;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) runBountyTick(cur, gt, ms / 1000, 1, gt); // headlessではDate.now基準の代わりにgtを流用(相対時間だけ使う)
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
