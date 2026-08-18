// PACING_PUZZLE.md §6.38 B1(賞金首)の純関数ユニットテスト+B1.5-6のrunBountyTick状態機械テスト。
// 純関数(bountyEngagedNow等)は「1分退場・戦闘中リセット・抑止ゲート」を式で機械化する。
// runBountyTick本体(store書き込みを伴う)は、idolTick.test.tsと同じ作法(resetGame→盤面を作り
// tickを実際に回す)で状態機械を検証する(B1.5監査の指摘=「漏れの機械化」)。描画はテスト対象外。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  bountyEngagedNow, bountyLingerExpired, bountySpawnBlocked, pickActiveBounty, bountyMaxHealth,
  runBountyTick, createBountyTickState, anyBountyEngaged, bountyNaturalSpawnReady,
  BOUNTY_LINGER_MS, BOUNTY_HIT_ENGAGE_MS, BOUNTY_BASE_HP, BOUNTY_DEPART_FADE_MS,
  BOUNTY_NATURAL_FIRST_MS, BOUNTY_NATURAL_MAX_COUNT, BOUNTY_NATURAL_SPAWN_AT_MS,
  BR_SHOT_UNIT_MS,
  type BountySfx,
} from './bountyTick';
// ★v0.25.3558: 賞金首の数値は bountyScript.ts の可変テーブルが正(ボスメーカーで動かせる)。
// 既定値は移設前と完全一致なので、この下のテストの期待値は1つも変えていない。
import { BOUNTY_RANGED_TUNING as BR_T, BOUNTY_MAIKO_TUNING as MK_T } from './bountyScript';
import { bossLeashDistancePx } from './bossEngagement';
import { usesMimirLaser } from './mimirLaserTrack';
import { AOE_TELEGRAPH_AUDIT, minWindupMs, PLAYER_WALK_PX_PER_SEC } from './bossTelegraph';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { distToSegment } from './geometry';
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

describe('bountySpawnBlocked — 抑止ゲート(B1で用意・B4でuseGameLoop.tsの自然湧きへ配線)', () => {
  const ok = (): Parameters<typeof bountySpawnBlocked>[0] => ({
    bossFightNow: false, bossAlive: false, activeEvent: false, hiddenBossAlive: false, redNightActive: false,
    area: 2, storyBossOnly: false, labTheme: false, corridorMode: false, tutorialStage: false,
  });
  it('全条件クリアならブロックしない', () => {
    expect(bountySpawnBlocked(ok())).toBe(false);
  });
  it('各条件が単独でブロックする', () => {
    expect(bountySpawnBlocked({ ...ok(), bossFightNow: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), bossAlive: true })).toBe(true);
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

describe('anyBountyEngaged — v6 A-2(B4): 3系統(囲い/紅き夜/叫喚)先送りの束ね関数', () => {
  const mkBounty = (patch: Partial<Enemy> = {}): Enemy => ({
    ...spawnEnemyAt('bounty-ranged', 0, 0, 0),
    id: 'b1', dormant: false, lastHit: -999999, ...patch,
  });
  const player = { x: 0, y: 0, width: 32, height: 32 };

  it('賞金首が場に居なければfalse(他イベントを妨げない)', () => {
    expect(anyBountyEngaged([], player, 0)).toBe(false);
  });
  it('dormant中はfalse(交戦していない)', () => {
    expect(anyBountyEngaged([mkBounty({ dormant: true, x: 0, y: 0 })], player, 0)).toBe(false);
  });
  it('リーシュ半径未満に居れば交戦中=true', () => {
    const leash = bossLeashDistancePx('bounty-ranged', false);
    const b = mkBounty({ x: leash - 50, y: 0 });
    expect(anyBountyEngaged([b], player, 0)).toBe(true);
  });
  it('リーシュ半径の外でも直近3秒以内の被弾があれば交戦中=true', () => {
    const leash = bossLeashDistancePx('bounty-ranged', false);
    const b = mkBounty({ x: leash + 5000, y: 0, lastHit: 1000 });
    expect(anyBountyEngaged([b], player, 1000 + BOUNTY_HIT_ENGAGE_MS)).toBe(true);
    expect(anyBountyEngaged([b], player, 1000 + BOUNTY_HIT_ENGAGE_MS + 1)).toBe(false);
  });
});

describe('bountyNaturalSpawnReady — 自然湧きの固定スケジュール(§2「頻度」・v8.3=3:00と7:00)', () => {
  const ok = (): Parameters<typeof bountyNaturalSpawnReady>[0] => ({
    gameTime: BOUNTY_NATURAL_FIRST_MS, spawnCount: 0,
    bountyAlive: false, spawnBlocked: false, calmOk: true,
  });
  it('全条件クリアなら発火してよい', () => {
    expect(bountyNaturalSpawnReady(ok())).toBe(true);
  });
  it('初回は3:00未満なら不可(v8.3)', () => {
    expect(BOUNTY_NATURAL_SPAWN_AT_MS[0]).toBe(180000);
    expect(bountyNaturalSpawnReady({ ...ok(), gameTime: BOUNTY_NATURAL_FIRST_MS - 1 })).toBe(false);
  });
  it('1ランに最大2回=spawnCountが上限に達したら不可', () => {
    expect(bountyNaturalSpawnReady({ ...ok(), spawnCount: BOUNTY_NATURAL_MAX_COUNT, gameTime: 10000000 })).toBe(false);
  });
  it('2体目は7:00まで不可(v8.3・固定スケジュール)', () => {
    expect(BOUNTY_NATURAL_SPAWN_AT_MS[1]).toBe(420000);
    expect(bountyNaturalSpawnReady({ ...ok(), spawnCount: 1, gameTime: 420000 - 1 })).toBe(false);
    expect(bountyNaturalSpawnReady({ ...ok(), spawnCount: 1, gameTime: 420000 })).toBe(true);
  });
  it('同時1体まで=既に賞金首が場に居るなら不可', () => {
    expect(bountyNaturalSpawnReady({ ...ok(), bountyAlive: true })).toBe(false);
  });
  it('抑止ゲート(bountySpawnBlocked)が掛かっていれば不可', () => {
    expect(bountyNaturalSpawnReady({ ...ok(), spawnBlocked: true })).toBe(false);
  });
  // ★v0.25.3550(社長裁定「b」=時刻優先): 旧「緩コマ中は告知しない(calmOk)」は**廃止**。
  it('★【回帰・v0.25.3550】コマ種別は解禁判定に影響しない(時刻優先)', () => {
    // 旧仕様は「通常コマでだけ出す(第5条)」だったが、4コマの位相と固定スケジュール(3:00/7:00)が
    // 構造的に噛み合わず、**180秒はどの通常コマにも入らない**ため賞金首①が3:00に出られなかった。
    // 通常コマの窓: 1周目=80s〜120〜150s / 2周目=240〜300s〜(緩・収穫はきっかり40s、
    // 通常・ピークは40s+片付き最大30s)。社長裁定で時刻表を優先し、コマ判定を外した。
    expect(bountyNaturalSpawnReady({ ...ok(), calmOk: false })).toBe(true);
    expect(bountyNaturalSpawnReady({ ...ok(), calmOk: undefined })).toBe(true);
  });

  it('★【不変条件】3:00ちょうどで解禁される(位相ズレで出られない状態に戻さない)', () => {
    // 社長報告「3分に出てこない」の回帰。時刻・回数・同時数・抑止ゲートだけで判定すること。
    expect(bountyNaturalSpawnReady({
      gameTime: BOUNTY_NATURAL_SPAWN_AT_MS[0], spawnCount: 0,
      bountyAlive: false, spawnBlocked: false,
    })).toBe(true);
    // 1秒前はまだ不可(しきい値そのものは動かしていない)。
    expect(bountyNaturalSpawnReady({
      gameTime: BOUNTY_NATURAL_SPAWN_AT_MS[0] - 1, spawnCount: 0,
      bountyAlive: false, spawnBlocked: false,
    })).toBe(false);
  });

  it('★【不変条件】抑止ゲート・同時1体・回数上限は従来どおり効く(時刻優先は"無条件"ではない)', () => {
    expect(bountyNaturalSpawnReady({ ...ok(), spawnBlocked: true })).toBe(false);
    expect(bountyNaturalSpawnReady({ ...ok(), bountyAlive: true })).toBe(false);
    expect(bountyNaturalSpawnReady({ ...ok(), spawnCount: BOUNTY_NATURAL_MAX_COUNT })).toBe(false);
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
    step(16); // 追跡へ移行(§6.38 v9で起床即chase=既に追跡中)
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

  // ★v0.25.3497回帰テスト(社長裁定「ノックバックもだけど、技だけキャンセルされなければええで」):
  // v0.25.3476の「ノックバック=技を中断」を取り消す。ノックバック"だけ"で止まっている間は
  // ①技(bossState/bossStateUntil)は保たれる ②時計が凍結ぶんだけ後ろへずれる(=解除後に続きから、
  // かつ解除の瞬間にstale windupが即着弾しない)。気絶/拘束/浮き/紫は従来どおり中断のまま。
  it('★ノックバック連打でも技はキャンセルされない(社長裁定v0.25.3497)', () => {
    const { id, step } = setup();
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 100, y: 50000 } }));
    step(16); // 起床
    step(16); // 追跡へ
    const until0 = useGameStore.getState().gameTime + 5000;
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === id
        ? { ...e, bossState: 'br-push-windup', bossStateUntil: until0 }
        : e),
    }));
    // 毎フレーム knockbackUntil を押し出し続ける(連射の最悪ケース)。
    for (let i = 0; i < 20; i++) {
      const gt = useGameStore.getState().gameTime;
      useGameStore.setState(s => ({
        enemies: s.enemies.map(e => e.id === id ? { ...e, knockbackUntil: gt + 500 } : e),
      }));
      step(100);
      const during = useGameStore.getState().enemies.find(e => e.id === id)!;
      expect(during.bossState, `i=${i}`).toBe('br-push-windup'); // ★技が消えない
    }
    const after = useGameStore.getState().enemies.find(e => e.id === id)!;
    // 時計が凍結ぶん(20×100ms)後ろへずれている=「止まっていた時間は溜めに数えない」。
    expect(after.bossStateUntil).toBeGreaterThan(until0);
    // 期限は現在時刻より未来のまま=解除の瞬間にstale windupが即着弾しない。
    expect(after.bossStateUntil!).toBeGreaterThan(useGameStore.getState().gameTime);
  });

  // 紫(体勢崩し)は従来どおり技を中断する(「止める」ではなく「崩す」効果なので扱いが違う)。
  it('紫(bossFullStun)は従来どおり技を中断してchaseへ戻す', () => {
    const { id, step } = setup();
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 100, y: 50000 } }));
    step(16); step(16);
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === id
        ? { ...e, bossState: 'br-push-windup', bossStateUntil: useGameStore.getState().gameTime + 5000,
            bossFullStunUntil: useGameStore.getState().gameTime + 3000 }
        : e),
    }));
    step(100);
    const during = useGameStore.getState().enemies.find(e => e.id === id)!;
    expect(during.bossState).toBe('chase');
    expect(during.bossStateUntil).toBeUndefined();
  });

  it('★帰巣完了→dormant+新しい1分: 離脱→帰巣→到着でdormant化し、以後また1分カウントが始まる', () => {
    const { id, step } = setup();
    // 起床させ、直後に離れる(交戦解除→リーシュ発火)。
    useGameStore.setState(s => ({ player: { ...s.player, x: 50000 + 100, y: 50000 } }));
    step(16); // 起床
    expect(useGameStore.getState().enemies.find(e => e.id === id)?.dormant).toBe(false);
    // §6.38 v9で起床演出は撤去=即chase。ここでプレイヤーを大きく離す(リーシュ半径700pxの外)。
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

  /** setupと同型だが型を選べる(バス停/馬乗りの技テスト用)。sfxOverrideは既定NOOP(選択SE確認用)。 */
  const setupType = (
    type: EnemyType, playerOffset: { x: number; y: number }, over: Partial<Enemy> = {},
    sfxOverride?: BountySfx,
  ) => {
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
      if (cur) runBountyTick(cur, s, gt, ms / 1000, 1, gt, sfxOverride);
    };
    return { id: e.id, step, gt: () => gt, state: s };
  };

  describe('バス停(bounty-ranged)', () => {
    // ★v0.25.3517: 近距離は「押しのけ100%」ではなく**重み抽選**(三段突き60/押しのけ40)になった。
    // 押しのけ単体の挙動を見るテストは、乱数を押しのけ側(>=0.6)へ固定して引く。
    it('近すぎると押しのけ(br-push-windup)を発火する(乱数=押しのけ側)', () => {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9);
      try {
        const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 }); // BR_PUSH_RANGE(110)未満
        step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-push-windup');
      } finally { rnd.mockRestore(); }
    });

    // ★v0.25.3519(社長指示「近距離の台本は、押しのけ と バックロール→三段つき」):
    // 近距離のもう1つは**台本**=1手目のロールから始まり、ロールが明けると三段突きの溜めへ繋がる。
    it('★近距離の台本: バックロール→三段突き(乱数=台本側)', () => {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1);
      try {
        const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 });
        step(16);
        const rolled = useGameStore.getState().enemies.find(e => e.id === id)!;
        expect(rolled.bossState).toBe('br-roll'); // 1手目=後方ロール
        const x0 = rolled.x;
        step(100);
        // プレイヤーは +60px 側に居るので、ロールは**その反対=−x**へ進む(=後方へ引く)。
        expect(useGameStore.getState().enemies.find(e => e.id === id)!.x).toBeLessThan(x0);
        step(200); // BR_ROLL_MS(180)を超える
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
      } finally { rnd.mockRestore(); }
    });

    // ★【不変条件】近距離では三段突きへ**直行しない**(社長報告v0.25.3534「三段突きの前にバックロール
    // してない」の再発防止)。原因は v0.25.3518 で BR_TRIPLE_MIN を 380→0 にした副作用で、
    // 中距離用の直行分岐が密着でも成立し、**近距離の台本(ロール→三段突き)を飛ばしていた**こと。
    // ⇒ 近距離から 'chase' を抜ける先は **br-roll / br-push-windup / それ以外(中立)** のいずれかで、
    //   **br-triple-windup が直接来てはいけない**。乱数を全域で振っても破れないことを確かめる。
    it('★【不変条件】近距離(BR_PUSH_RANGE内)からは br-triple-windup へ直行しない', () => {
      for (const r of [0.0, 0.2, 0.4, 0.59, 0.6, 0.8, 0.99]) {
        const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
        try {
          const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 }); // BR_PUSH_RANGE(110)未満
          step(16);
          const st = useGameStore.getState().enemies.find(e => e.id === id)?.bossState;
          expect(st).not.toBe('br-triple-windup');
        } finally { rnd.mockRestore(); }
      }
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
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9); // v0.25.3517: 近距離の抽選を押しのけ側へ固定
      const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 });
      step(16);
      rnd.mockRestore();
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

    // §6.38実機FB5/FB6(致命): 体勢ブレイク(紫・bossFullStunUntil)が実行中の技を「技中断」扱いで
    // 即キャンセルすること(v3128のカウンター中断と同型)。裁定: フルスタン成立で即bossState='chase'
    // へ戻し、予告(windup系bossState)を消す。旧実装はbossStateを一切書き換えず、紫の間ずっと
    // 予告が残り続け(FB6)、凍結明けにstale windupがそのまま暴発する/止まって見える(FB5)。
    it('★FB6: フルスタン(紫)成立でwindup中の技が即chaseへ中断される(予告が消える)', () => {
      // v0.25.3517: 近距離が重み抽選になったので押しのけ側へ固定(この試験の主題は「紫で中断されるか」で、
      // どの技が出たかは本質ではない)。
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9);
      const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 }); // BR_PUSH_RANGE未満=windup開始
      step(16);
      rnd.mockRestore();
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-push-windup');
      const gtNow = useGameStore.getState().gameTime;
      useGameStore.setState(s => ({
        enemies: s.enemies.map(e => e.id === id
          ? { ...e, bossFullStunUntil: gtNow + 5000, stunUntil: gtNow + 5000 } : e),
      }));
      step(16);
      const during = useGameStore.getState().enemies.find(e => e.id === id)!;
      expect(during.bossState).toBe('chase'); // windupが技中断され即chaseへ(=予告も消える)
      expect(during.bossStateUntil).toBeUndefined();
      // 紫が続く間、毎フレームchaseのまま(新しい技は出ない=座標も進行も止まる=B1.5-2と両立)。
      step(16);
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('chase');
    });

    it('★FB5: 紫が明けるとchaseから正常に再開し、また技を出せる(stale windupの暴発/停止なし)', () => {
      const { id, step } = setupType('bounty-ranged', { x: 60, y: 0 });
      step(16);
      const gtNow = useGameStore.getState().gameTime;
      useGameStore.setState(s => ({
        enemies: s.enemies.map(e => e.id === id
          ? { ...e, bossFullStunUntil: gtNow + 300, stunUntil: gtNow + 300 } : e),
      }));
      step(16); // 中断確認
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('chase');
      // 紫の時間(300ms)を刻み切る。
      step(300);
      // 紫解除は他系統(tickBossPosture)の責務なのでここで模す(gameFullStunUntilを手動で外す)。
      useGameStore.setState(s => ({
        enemies: s.enemies.map(e => e.id === id ? { ...e, bossFullStunUntil: undefined, stunUntil: undefined } : e),
      }));
      // 解除後、複数tick進めれば再びwindupを発火できる(=止まったままにならない)。
      let sawWindupAgain = false;
      for (let i = 0; i < 10; i++) {
        step(50);
        // v0.25.3517: 近距離の技は押しのけ/三段突きの2択になったので、どちらでも「再発火した」と見る
        // (押しのけはCD2500msを持つようになったため、押しのけ限定にすると観測できない窓がある)。
        const stNow = useGameStore.getState().enemies.find(e => e.id === id)?.bossState;
        if (stNow === 'br-push-windup' || stNow === 'br-triple-windup') sawWindupAgain = true;
      }
      expect(sawWindupAgain).toBe(true);
    });

    it('取り巻き召喚: 交戦開始1回だけ2体・再召喚なし', () => {
      const { step } = setupType('bounty-ranged', { x: 700, y: 0 }); // kite圏内=押しのけ/レーザーどちらも発火しない距離
      const before = useGameStore.getState().enemies.length;
      step(16);
      const afterFirst = useGameStore.getState().enemies.length;
      expect(afterFirst).toBe(before + BR_T.escort.count);
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

    // §6.38 v10「バス停の中立射撃に緩急」の統合テスト(tickRangedの配線)。純関数側の統計検証は
    // bountyShots.test.tsで既に行っているので、ここでは「実際にtickRangedを回した時に配線どおり
    // 効くか」だけを見る(実装精度の規律4「配線ロジックも純関数と同じコミットでテストする」)。
    describe('中立射撃の型3種(§6.38 v10)', () => {
      // kite圏内(340〜560)に置き、レーザーCDを未来へ飛ばして押しのけ/レーザーどちらの割り込みも
      // 起きない盤面を作る(「割り込みが一度も入らない中立のみ」の受け入れ条件と同条件)。
      // ★x=500(旧450から移動・§6.38 v12): 三段突きの選択距離帯(380〜460)を避ける
      // (450はその内側=このdescribeが検証したい「中立のみ」の前提が三段突きの新規割り込みで崩れるため)。
      const setupNeutralOnly = (over: Partial<Enemy> = {}) =>
        setupType('bounty-ranged', { x: 500, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, ...over });

      it('★受け入れ条件: 割り込みなしの中立のみで1分あたり54.5発±1(社長裁定「案A」の検算)', () => {
        const { step } = setupNeutralOnly();
        const totalMs = 900_000; // 15分ぶん(平均サイクル長2566.7msの約350周)=テスト実行時間と
        // 標本数のバランス。1分あたりの発射数は下の許容幅(54.5±2.5)で確認する。
        const stepMs = 60;
        let elapsed = 0;
        let fired = 0;
        while (elapsed < totalMs) {
          step(stepMs);
          elapsed += stepMs;
          // projectiles配列を毎回スパンして計上し、都度[]へ戻す(O(n^2)の配列コピーを避けて
          // テストの実行時間を抑える。addProjectileが積む件数だけを数えたいので中身は不要)。
          const projs = useGameStore.getState().projectiles;
          if (projs.length > 0) {
            fired += projs.length;
            useGameStore.setState({ projectiles: [] });
          }
        }
        const perMinute = (fired / totalMs) * 60000;
        expect(perMinute).toBeGreaterThan(52);
        expect(perMinute).toBeLessThan(57);
      });

      it('3型すべて出る(#1): fanの同時3発・chargeの弾速1.5倍・burstの単発をそれぞれ弾の実データから検出する', () => {
        const { step } = setupNeutralOnly();
        // 1tickでの発射をイベント単位で見る: 同時3件増える=fan、1件増える=burstかcharge(charge=
        // 弾速1.5倍・areaSpeedMultが掛かってもburst/chargeの相対比1.5倍は保たれる)。
        let lastProjs = useGameStore.getState().projectiles;
        let sawFan = false;
        const singleShotSpeeds: number[] = [];
        for (let i = 0; i < 4000; i++) {
          step(20);
          const projs = useGameStore.getState().projectiles;
          const added = projs.slice(lastProjs.length);
          if (added.length === 3) sawFan = true;
          else if (added.length === 1) singleShotSpeeds.push(added[0].speed);
          lastProjs = projs;
        }
        // 単発速度の最小値=burst(通常速度)の基準。1.2倍超が居ればcharge(1.5倍)が出た証拠。
        expect(singleShotSpeeds.length).toBeGreaterThan(1);
        const minSpd = Math.min(...singleShotSpeeds);
        const sawBurst = singleShotSpeeds.some(spd => spd <= minSpd * 1.2);
        const sawCharge = singleShotSpeeds.some(spd => spd > minSpd * 1.2);
        expect(sawBurst).toBe(true);
        expect(sawFan).toBe(true);
        expect(sawCharge).toBe(true);
      });

      it('標識の構え(aiFromX/Y・aiTargetX/Y)が中立射撃でも書かれる(#5実バグ修正)', () => {
        const { id, step } = setupNeutralOnly();
        step(16);
        const after = useGameStore.getState().enemies.find(e => e.id === id);
        expect(after?.aiFromX).toBeDefined();
        expect(after?.aiFromY).toBeDefined();
        expect(after?.aiTargetX).toBeDefined();
        expect(after?.aiTargetY).toBeDefined();
      });

      it('距離340px(BR_KITE_MIN)未満ではfanが選ばれない(#1・監査指摘)', () => {
        // 速度0で固定し、距離を200px(<340・かつ>110=押しのけ範囲外)に保ったまま長時間サイクルを
        // 回す。fanは3発同時=1回の発射で3件のprojectilesが増える(burst/chargeは1件ずつ)。よって
        // 「1回の発射でprojectilesが3件以上まとめて増える瞬間」が一度も無いことを確認すれば
        // fan不選択を検証できる。
        const { step } = setupType('bounty-ranged', { x: 200, y: 0 }, { speed: 0 }); // dist=200<BR_KITE_MIN
        let lastCount = useGameStore.getState().projectiles.length;
        let sawFanLikeBurst = false;
        for (let i = 0; i < 4000; i++) {
          step(20);
          const cur = useGameStore.getState().projectiles.length;
          if (cur - lastCount >= 3) sawFanLikeBurst = true; // fanの同時3発だけがこの増分を作る
          lastCount = cur;
        }
        expect(sawFanLikeBurst).toBe(false);
      });

      it('溜め中(charge)は速度が0へ向けて減衰し、発射後は再び速度が戻る(慣性・瞬間停止禁止=CLAUDE.md MUST)', () => {
        // 型の抽選は確率任せだと「テスト時間内に一度もchargeが選ばれない」ことがあり得て不安定になる
        // (実測: 60秒でも一度も出ない試行が発生した)ため、ここではBountyTickState(state)を直接
        // 上書きしてchargeサイクルの溜め中/発射後recoverを強制的に作る。抽選そのものの検証は
        // bountyShots.test.tsの統計テストが担い、ここは「tickRangedがs.brPattern==='charge'の時に
        // 実際にbrChargeWindupSpeedMult/brChargeRecoverSpeedMultを移動速度へ配線しているか」だけを見る。
        const { id, step, state, gt } = setupType(
          'bounty-ranged', { x: 650, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER }, // 560<dist<700=approach継続+leash内
        );
        // runBountyTickの最初の1回はactiveId初期化でresetBountyRunState(stateの全リセット)が走る
        // ため、まず0ms分だけ回してそれを消費してから強制上書きする(でないと直後の上書きが消える)。
        step(0);
        // 溜め中を強制する: brPattern='charge'・brShotsRemaining=1(未発射)・bossNextActionAt=
        // 現在時刻+350ms(=発射時刻・#4)・brCycleEndAt=現在時刻+1100ms(=次サイクル開始時刻・#3)。
        state.brPattern = 'charge';
        state.brShotsRemaining = 1;
        state.brCycleEndAt = gt() + BR_SHOT_UNIT_MS;
        useGameStore.setState(s => ({
          enemies: s.enemies.map(e => e.id === id ? { ...e, bossNextActionAt: gt() + 350 } : e),
        }));
        const speeds: number[] = [];
        for (let i = 0; i < 34; i++) { // 340ms分(10ms刻み)=まだ発射していない(350ms未満)ことを保証する余裕
          step(10);
          const cur = useGameStore.getState().enemies.find(e => e.id === id);
          speeds.push(Math.hypot(cur?.vx ?? 0, cur?.vy ?? 0));
        }
        // まだ溜め中(未発射)であること=このサンプルが確実にwindup区間だけであることの前提確認。
        expect(state.brShotsRemaining).toBe(1);
        // 単調とまでは要求しない(離散刻み+resolveMoveの丸めを許容)が、終盤は序盤よりはっきり遅い
        // (ease-outで1→0へ減速)ことを確認する。
        const earlyAvg = speeds.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const lateAvg = speeds.slice(-5).reduce((a, b) => a + b, 0) / 5;
        expect(lateAvg).toBeLessThan(earlyAvg * 0.3);

        // 発射をまたぐ(残り10ms+余裕分)。以後750msで速度が戻ることを見る。
        for (let i = 0; i < 3; i++) step(10);
        expect(state.brPattern).toBe('charge');
        expect(state.brShotsRemaining).toBe(0); // 発射済み=recoverへ入っている
        const recoverSpeeds: number[] = [];
        for (let i = 0; i < 75; i++) { // 750ms分(10ms刻み)=recover完了まで
          step(10);
          const cur = useGameStore.getState().enemies.find(e => e.id === id);
          recoverSpeeds.push(Math.hypot(cur?.vx ?? 0, cur?.vy ?? 0));
        }
        const recoverEarlyAvg = recoverSpeeds.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const recoverLateAvg = recoverSpeeds.slice(-5).reduce((a, b) => a + b, 0) / 5;
        expect(recoverLateAvg).toBeGreaterThan(recoverEarlyAvg * 2); // ease-inで0→1、序盤より終盤が明らかに速い
      });

      it('割り込み後に射撃サイクルが持ち越されない(#7): 押しのけが挟まるとサイクル状態がクリアされる', () => {
        // 押しのけ範囲(BR_PUSH_RANGE=110)内にプレイヤーを置き、毎tick押しのけが発火し続ける盤面。
        // 中立(chase)へ戻る度にresetBrShotCycleが呼ばれる=stateのbrPattern/brShotsRemainingが
        // 「押しのけ発火直前に何か進行中だったとしても」常にクリアされていることを確認する。
        const { step, state } = setupType('bounty-ranged', { x: 60, y: 0 }); // BR_PUSH_RANGE未満
        for (let i = 0; i < 80; i++) step(50); // windup(500)+push(120)+recover(700)を何周分か回す
        // 押しのけがwindup中はサイクルへ入る前にreturnするため、brPatternは常にnull寄り
        // (中立へ辿り着けていない=そもそもサイクルが開始されない)。resetBrShotCycleが機能していれば
        // 残弾は0のまま蓄積しない。
        expect(state.brShotsRemaining).toBe(0);
      });
    });

    // §6.38 v12(社長指示2026-08-15「バス停の新技『三段突き』」)+★社長裁定(2026-08-15)の配線テスト。
    // 純関数側(角度・タイミング・受け入れ条件の検算)は bountyTriple.test.ts。ここは
    // 「実際にtickRangedを回した時に配線どおり効くか」だけを見る(実装精度の規律4)。
    describe('三段突き(§6.38 v12・社長裁定2026-08-15)', () => {
      it('選択距離帯(380〜460)でwindupを発火し、選択時にsfx.alert()が鳴る', () => {
        const alert = vi.fn();
        const { id, step } = setupType(
          'bounty-ranged', { x: 420, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER },
          { alert, fire: () => {}, counter: () => {}, reward: () => {} },
        );
        step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
        expect(alert).toHaveBeenCalled();
      });

      // ★v0.25.3516(社長指示「三段突きは0から全部出る様にして」): 下限を380→0にしたので、
      // 200pxでも**発火するのが正**(旧テストは「発火しない」を固定していたので反転させる)。
      // 上限超(600px)で出ないことは不変=遠すぎる所からは出ない。
      it('下限は0=近距離(200px)でも発火する / 上限超(600px)では発火しない', () => {
        const near = setupType('bounty-ranged', { x: 200, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        for (let i = 0; i < 5; i++) near.step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === near.id)?.bossState).toBe('br-triple-windup');

        const far = setupType('bounty-ranged', { x: 600, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        for (let i = 0; i < 5; i++) far.step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === far.id)?.bossState).not.toBe('br-triple-windup');
      });

      // ★v0.25.3517(社長指示「近接も重み変えて」): 至近は押しのけの独占ではなく**重み抽選**。
      // 乱数を振り分けて「両方出うる」ことを固定する(どちらかに固定されたらこのテストが落ちる)。
      it('至近(押しのけ圏内)でも押しのけ/ロール台本の両方が出る=1本道でない', () => {
        for (const [r, expected] of [[0.1, 'br-roll'], [0.9, 'br-push-windup']] as const) {
          const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
          try {
            const near = setupType('bounty-ranged', { x: 60, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
            for (let i = 0; i < 5; i++) near.step(16);
            expect(useGameStore.getState().enemies.find(e => e.id === near.id)?.bossState, `rand=${r}`).toBe(expected);
          } finally { rnd.mockRestore(); }
        }
      });

      it('選択距離帯の上限側(380〜460)で発火する(境界含む)', () => {
        // playerOffset.{x,y}はplayer.{x,y}への単純加算(中心合わせではない)。bounty-ranged=44x44・
        // player=28x28なので、x/yとも(bounty.半径-player.半径)=(22-14)=8だけ補正しないと中心間距離が
        // 8px分ズレる(境界を厳密に検証するため両軸を補正=x方向のみ+8・y方向は+8で中心を揃える)。
        for (const dist of [380, 420, 460]) {
          const { id, step } = setupType('bounty-ranged', { x: dist + 8, y: 8 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER });
          step(16);
          expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
        }
      });

      it('完走: windup→1→2→3→recover→chaseの順で進み、静止したプレイヤーへ3回判定を積む(帯寸法=設計値)', () => {
        const { id, step } = setupType('bounty-ranged', { x: 420, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        const seen = new Set<string | undefined>();
        const before = useGameStore.getState().pumpkinBlasts.length;
        // windup(900)+3段(590)+硬直(900)=2390msを十分上回るまで刻む。
        for (let i = 0; i < 60; i++) {
          step(50);
          seen.add(useGameStore.getState().enemies.find(e => e.id === id)?.bossState);
        }
        expect(seen.has('br-triple-windup')).toBe(true);
        expect(seen.has('br-triple-1')).toBe(true);
        expect(seen.has('br-triple-2')).toBe(true);
        expect(seen.has('br-triple-3')).toBe(true);
        expect(seen.has('br-triple-recover')).toBe(true);
        expect(seen.has('chase')).toBe(true);
        const newBlasts = useGameStore.getState().pumpkinBlasts.slice(before);
        const tripleBlasts = newBlasts.filter(b => b.capsule?.halfWidth === 34);
        expect(tripleBlasts.length).toBe(3); // 3段=3回(多段ヒット無し)
        for (const b of tripleBlasts) expect(b.damage).toBe(9); // BR_TRIPLE_DAMAGE
      });

      it('狙い(bountyTripleAng)は溜め明けに1回だけロックされ、以後の3段で追尾しない', () => {
        const { id, step } = setupType('bounty-ranged', { x: 420, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
        // windup完走までプレイヤーを真横(90度方向)へ移動させる(狙いが追い続けるかを見る)。
        for (let i = 0; i < 20; i++) {
          step(50);
          const cur = useGameStore.getState().enemies.find(e => e.id === id);
          if (cur?.bossState !== 'br-triple-windup') break;
          useGameStore.setState(s => ({ player: { ...s.player, x: cur.x, y: cur.y + 300 } }));
        }
        const afterWindup = useGameStore.getState().enemies.find(e => e.id === id)!;
        expect(afterWindup.bossState).not.toBe('br-triple-windup'); // windupを抜けている
        const lockedAng = afterWindup.bountyTripleAng;
        expect(lockedAng).toBeDefined();
        // ロック後にプレイヤーを再び逆側(真横)へ動かしても、角度は変化しない(追尾しない)。
        useGameStore.setState(s => ({ player: { ...s.player, x: afterWindup.x, y: afterWindup.y - 300 } }));
        step(16);
        const later = useGameStore.getState().enemies.find(e => e.id === id)!;
        expect(later.bountyTripleAng).toBe(lockedAng);
      });

      it('クールダウン(6000ms)明けまで再選択されない', () => {
        const { id, step, state } = setupType('bounty-ranged', { x: 420, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
        expect(state.tripleReadyAt).toBeGreaterThan(useGameStore.getState().gameTime);
        // 技を完走させてchaseへ戻す(windup900+3段590+硬直900=2390ms)。踏み込み(最大120px)で
        // プレイヤーとの距離が縮むため、以後は毎tick選択距離帯(dist=420相当)へ位置を戻して
        // 「距離は満たしているのにCDで出ない/CD明けで出る」だけを見る(自然なkiteの復帰待ちに
        // 依存しない)。
        const reposition = (): void => {
          const b = useGameStore.getState().enemies.find(e => e.id === id);
          if (!b) return;
          useGameStore.setState(s => ({
            player: { ...s.player, x: b.x + b.width / 2 - s.player.width / 2 + 420, y: b.y },
          }));
        };
        for (let i = 0; i < 60; i++) { step(50); reposition(); }
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('chase');
        // CDが明けるまでは再びbr-triple-windupへ入らない(距離条件は毎tick満たしている)。
        let sawTripleAgain = false;
        for (let i = 0; i < 40; i++) { // 40*50=2000ms(まだCD=6000ms明けていない)
          step(50); reposition();
          if (useGameStore.getState().enemies.find(e => e.id === id)?.bossState === 'br-triple-windup') sawTripleAgain = true;
        }
        expect(sawTripleAgain).toBe(false);
        // CDが明けたら再発火できる。
        for (let i = 0; i < 100; i++) { // さらに5000ms分(合計CDを十分超える)
          step(50); reposition();
          if (useGameStore.getState().enemies.find(e => e.id === id)?.bossState === 'br-triple-windup') sawTripleAgain = true;
        }
        expect(sawTripleAgain).toBe(true);
      });

      it('カウンター可(windup中): 成立でchaseへ即中断し残段を出さない(v3128の掟+v0.25.3477の作法)', () => {
        const { id, step } = setupType('bounty-ranged', { x: 420, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
        const bounty = useGameStore.getState().enemies.find(e => e.id === id)!;
        useGameStore.setState(s => ({
          player: { ...s.player, x: bounty.x, y: bounty.y, counterWindowEnd: Date.now() + 5000 },
        }));
        const hpBefore = useGameStore.getState().enemies.find(e => e.id === id)!.health;
        step(16);
        const after = useGameStore.getState().enemies.find(e => e.id === id);
        expect(after?.bossState).toBe('chase'); // 技が中断されchaseへ復帰(v3128)
        expect(after!.health).toBeLessThan(hpBefore); // カウンター反撃ダメージが入っている
        // 中断後、残りの段(br-triple-2/3)が出ないことを続けて確認する。
        let sawLaterStep = false;
        for (let i = 0; i < 20; i++) {
          step(16);
          const st2 = useGameStore.getState().enemies.find(e => e.id === id)?.bossState;
          if (st2 === 'br-triple-2' || st2 === 'br-triple-3') sawLaterStep = true;
        }
        expect(sawLaterStep).toBe(false);
      });

      it('フルスタン(紫)成立でwindup中の技が即chaseへ中断される(FB6と同型)', () => {
        const { id, step } = setupType('bounty-ranged', { x: 420, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        step(16);
        expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
        const gtNow = useGameStore.getState().gameTime;
        useGameStore.setState(s => ({
          enemies: s.enemies.map(e => e.id === id
            ? { ...e, bossFullStunUntil: gtNow + 5000, stunUntil: gtNow + 5000 } : e),
        }));
        step(16);
        const during = useGameStore.getState().enemies.find(e => e.id === id)!;
        expect(during.bossState).toBe('chase');
        expect(during.bossStateUntil).toBeUndefined();
      });

      it('踏み込みは等速・瞬間停止でない(加速→減速): 3段の実行中、ボスは滑らかに前進する', () => {
        const { id, step } = setupType('bounty-ranged', { x: 420, y: 0 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER, speed: 0 });
        step(16);
        for (let i = 0; i < 30; i++) { // windup(900ms)を消化しきる
          const cur = useGameStore.getState().enemies.find(e => e.id === id);
          if (cur?.bossState !== 'br-triple-windup') break;
          step(50);
        }
        const startPos = useGameStore.getState().enemies.find(e => e.id === id)!;
        expect(startPos.bossState).toBe('br-triple-1');
        const x0 = startPos.x, y0 = startPos.y;
        const dists: number[] = [];
        for (let i = 0; i < 20; i++) { // 200ms分(10ms刻み)=3段実行の序盤
          step(10);
          const cur = useGameStore.getState().enemies.find(e => e.id === id)!;
          dists.push(Math.hypot(cur.x - x0, cur.y - y0));
        }
        // 単調に前進する(逆流しない)。
        for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1] - 0.01);
        // 終盤は移動していること(止まったままではない=技として機能している)。
        expect(dists[dists.length - 1]).toBeGreaterThan(0);
      });

      // 社長指示2026-08-15「今の距離ではプレイヤーに届かない。もっと高速で近づいてから使う」で追加。
      // REACH/HALF_WIDTH/STEP/選択距離(380〜460)/溜め(900ms)は変えていない(bountyTriple.test.ts側で
      // 固定済み)。ここは「実際にtickRangedを回した時に、溜め中に接近し、届くようになったか」だけを見る。
      describe('接近(社長指示2026-08-15「高速で近づいてから突く」)', () => {
        it('溜め中は静止せず、プレイヤーへ高速で距離を詰める(逆流しない・加速→減速=瞬間停止しない)', () => {
          // 選択上限(460)から開始=最も詰める距離が大きいケース。
          const { id, step } = setupType('bounty-ranged', { x: 460 + 8, y: 8 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER });
          step(16);
          expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('br-triple-windup');
          const start = useGameStore.getState().enemies.find(e => e.id === id)!;
          const x0 = start.x, y0 = start.y;
          const dists: number[] = [];
          for (let i = 0; i < 60; i++) { // windup(900ms)を15ms刻みで消化
            step(15);
            const cur = useGameStore.getState().enemies.find(e => e.id === id);
            if (!cur || cur.bossState !== 'br-triple-windup') break;
            dists.push(Math.hypot(cur.x - x0, cur.y - y0));
          }
          expect(dists.length).toBeGreaterThan(10); // windup中に十分な回数観測できている
          // 逆流しない(単調前進)。
          for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1] - 0.01);
          // 静止したまま溜めていない(=社長指摘の直し。旧実装はここが常に0だった)。
          expect(dists[dists.length - 1]).toBeGreaterThan(50);
          // 加速→減速(CLAUDE.md MUST): 1歩あたりの移動量(delta)が、序盤より中盤で大きく、
          // 中盤より終盤で小さい(=等速でも瞬間停止でもない)。
          const deltas = dists.map((d, i) => (i === 0 ? d : d - dists[i - 1]));
          const early = deltas[1];
          const midIdx = Math.floor(deltas.length / 2);
          const late = deltas[deltas.length - 1];
          expect(deltas[midIdx]).toBeGreaterThan(early);
          expect(deltas[midIdx]).toBeGreaterThan(late);
        });

        // 判定=絵の一致(CLAUDE.md「赤いのに当たらない禁止」)を、実際にhitCapsuleへ積まれた帯の座標を
        // combatTick.applyPumpkinBlastDamageと同じ式(distToSegment<=halfWidth+プレイヤー半径)で
        // 検算する。「中央の突き(狙った方向)が棒立ちのプレイヤーに届くか」が受け入れ条件の核心
        // (左右の突きは横の回避を防ぐための帯であり、正面に立ち止まったプレイヤーへ届く設計ではない
        // =PACING_PUZZLE.md §6.38 v12「3本の帯が横を覆う」)。
        const centerHitsStationaryPlayer = (startDist: number): boolean => {
          const { id, step } = setupType(
            'bounty-ranged', { x: startDist + 8, y: 8 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER },
          );
          step(16);
          const before = useGameStore.getState().pumpkinBlasts.length;
          for (let i = 0; i < 150; i++) {
            step(15);
            const cur = useGameStore.getState().enemies.find(e => e.id === id);
            if (cur?.bossState === 'chase' && i > 80) break;
          }
          const pl = useGameStore.getState().player;
          const pcx = pl.x + pl.width / 2, pcy = pl.y + pl.height / 2;
          const pr = Math.max(pl.width, pl.height) / 2;
          const tripleBlasts = useGameStore.getState().pumpkinBlasts.slice(before).filter(b => b.capsule?.halfWidth === 34);
          expect(tripleBlasts.length).toBe(3); // 3段とも判定が積まれている(中断されていない)
          const center = tripleBlasts[1]!; // 左→中→右の順で積まれる(brTripleAnglesと同順)
          const d = distToSegment({ x: pcx, y: pcy }, { x: center.capsule!.fx, y: center.capsule!.fy }, { x: center.capsule!.tx, y: center.capsule!.ty });
          return d <= center.capsule!.halfWidth + pr;
        };

        it('選択距離の下限(380px)で棒立ちのプレイヤーへ中央の突きが届く', () => {
          expect(centerHitsStationaryPlayer(380)).toBe(true);
        });
        it('選択距離の上限(460px)で棒立ちのプレイヤーへ中央の突きが届く(旧実装はここで空振りしていた)', () => {
          expect(centerHitsStationaryPlayer(460)).toBe(true);
        });

        // ★公平性の再計算(社長裁定「歩いて避けられない設計になってもよい・数字は報告に明記」)。
        // 選択上限(460px=最も厳しいケース)から、溜め中(900ms)ずっとプレイヤーが実測の歩行速度
        // (PLAYER_WALK_PX_PER_SEC=104.4px/s・bossTelegraph.tsの物差し)で直線に逃げ続けても、
        // 中央の突きが届くかを実測する。届く=「もう歩くだけでは避けられない技になった」ことの実測。
        it('選択上限(460px)から溜め中ずっと全力で逃げても、中央の突きは届く(=歩いて避けられない・数字は報告に明記)', () => {
          const { id, step } = setupType('bounty-ranged', { x: 460 + 8, y: 8 }, { mimirLaserReadyAt: Number.MAX_SAFE_INTEGER });
          step(16);
          const before = useGameStore.getState().pumpkinBlasts.length;
          for (let i = 0; i < 150; i++) {
            step(15);
            const cur = useGameStore.getState().enemies.find(e => e.id === id);
            if (!cur) break;
            if (cur.bossState === 'br-triple-windup') {
              // プレイヤーの実測歩行速度で、ボスから直線に逃げ続ける(bossTelegraph.tsの物差し=
              // 「見てから歩いて逃げる」の想定そのもの)。
              const pl = useGameStore.getState().player;
              const bcx = cur.x + cur.width / 2, bcy = cur.y + cur.height / 2;
              const pcx = pl.x + pl.width / 2, pcy = pl.y + pl.height / 2;
              const dist = Math.hypot(pcx - bcx, pcy - bcy) || 1;
              const ux = (pcx - bcx) / dist, uy = (pcy - bcy) / dist;
              const moveDist = PLAYER_WALK_PX_PER_SEC * 0.015; // 15ms刻み
              useGameStore.setState(st => ({ player: { ...st.player, x: st.player.x + ux * moveDist, y: st.player.y + uy * moveDist } }));
            }
            if (cur.bossState === 'chase' && i > 80) break;
          }
          const pl = useGameStore.getState().player;
          const pcx = pl.x + pl.width / 2, pcy = pl.y + pl.height / 2;
          const pr = Math.max(pl.width, pl.height) / 2;
          const tripleBlasts = useGameStore.getState().pumpkinBlasts.slice(before).filter(b => b.capsule?.halfWidth === 34);
          expect(tripleBlasts.length).toBe(3);
          const center = tripleBlasts[1]!;
          const d = distToSegment({ x: pcx, y: pcy }, { x: center.capsule!.fx, y: center.capsule!.fy }, { x: center.capsule!.tx, y: center.capsule!.ty });
          expect(d).toBeLessThanOrEqual(center.capsule!.halfWidth + pr);
        });
      });
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

  describe('鋏(bounty-balance)', () => {
    it('近距離(BB_NEAR_MAX以内)で薙ぎ払い(bb-sweep-windup)を発火する', () => {
      const { id, step } = setupType('bounty-balance', { x: 80, y: 0 });
      step(16);
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('bb-sweep-windup');
    });

    it('薙ぎ払い完走: pumpkinBlastsへ判定を積んでchaseへ戻る', () => {
      const { id, step } = setupType('bounty-balance', { x: 80, y: 0 });
      const before = useGameStore.getState().pumpkinBlasts.length;
      const seen = new Set<string | undefined>();
      for (let i = 0; i < 60; i++) { step(50); seen.add(useGameStore.getState().enemies.find(e => e.id === id)?.bossState); }
      expect(seen.has('chase')).toBe(true);
      expect(useGameStore.getState().pumpkinBlasts.length).toBeGreaterThan(before);
    });

    it('遠距離で跳びかかり(輸入=pumpkin): windup(しゃがみ)→air(移動)→recoverを経て着地円の判定を積む', () => {
      const { id, step } = setupType('bounty-balance', { x: 500, y: 0 });
      const before = useGameStore.getState().pumpkinBlasts.length;
      let sawWindup = false, sawAir = false, sawRecover = false;
      for (let i = 0; i < 400; i++) {
        step(50);
        const cur = useGameStore.getState().enemies.find(e => e.id === id);
        if (cur?.bossState === 'leap-windup') sawWindup = true;
        if (cur?.bossState === 'leap-air') sawAir = true;
        if (sawAir && cur?.bossState === 'leap-recover') { sawRecover = true; break; }
      }
      expect(sawWindup).toBe(true);
      expect(sawAir).toBe(true);
      expect(sawRecover).toBe(true);
      expect(useGameStore.getState().pumpkinBlasts.length).toBeGreaterThan(before);
    });
  });

  describe('舞妓(bounty-maiko)', () => {
    it('型A(HP>50%)の近距離は毬の薙ぎ単発(mk-naginata-windup)を発火する', () => {
      const { id, step } = setupType('bounty-maiko', { x: 60, y: 0 });
      step(16);
      const e = useGameStore.getState().enemies.find(x => x.id === id);
      expect(e?.bossState).toBe('mk-naginata-windup');
      expect([700, 1150]).toContain((e?.bossStateUntil ?? 0) - useGameStore.getState().gameTime);
    });

    it('型切替: HP50%以下になるとmk-reposeを経て型B(bossPhase=2)へ1回だけ切り替わる', () => {
      const { id, step } = setupType('bounty-maiko', { x: 700, y: 0 }, { health: 1000, maxHealth: 2000 });
      step(16);
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossState).toBe('mk-repose');
      step(MK_T.reposeMs + 16);
      const after = useGameStore.getState().enemies.find(e => e.id === id);
      expect(after?.bossPhase).toBe(2);
      expect(after?.bossState).toBe('chase');
      // 型B確定後、体力が回復してももう型Aへは戻らない(1回だけの片道切替)。
      useGameStore.setState(s2 => ({
        enemies: s2.enemies.map(e => e.id === id ? { ...e, health: e.maxHealth } : e),
      }));
      step(16);
      expect(useGameStore.getState().enemies.find(e => e.id === id)?.bossPhase).toBe(2);
    });

    it('型Bの近距離は毬の薙ぎ・連(mk-naginata1→mk-naginata2)の2段になる', () => {
      const { id, step } = setupType('bounty-maiko', { x: 60, y: 0 }, { bossPhase: 2 });
      step(16);
      const e1 = useGameStore.getState().enemies.find(x => x.id === id);
      expect(e1?.bossState).toBe('mk-naginata1-windup');
      let sawStep2 = false;
      for (let i = 0; i < 60; i++) {
        step(50);
        if (useGameStore.getState().enemies.find(x => x.id === id)?.bossState === 'mk-naginata2-windup') { sawStep2 = true; break; }
      }
      expect(sawStep2).toBe(true);
    });

    it('毬回し(自分中心円)は強制発火させると円内のプレイヤーへダメージを与え続ける', () => {
      const { id, step } = setupType('bounty-maiko', { x: 40, y: 0 }, { bossState: 'mk-spin', bossStateUntil: undefined });
      useGameStore.setState(s2 => ({
        enemies: s2.enemies.map(e => e.id === id ? { ...e, bossStateUntil: useGameStore.getState().gameTime + 500 } : e),
      }));
      const hpBefore = useGameStore.getState().player.health;
      step(16);
      expect(useGameStore.getState().player.health).toBeLessThan(hpBefore);
    });

    it('毬回しはAOE_TELEGRAPH_AUDITに登録され、換算式②(見てから歩いて避けられる)を満たす', () => {
      const entry = AOE_TELEGRAPH_AUDIT.find(a => a.name.includes('毬回し'));
      expect(entry).toBeDefined();
      if (entry && entry.intentionallyUnavoidable === undefined) {
        // ★起点(社長指示v0.25.3465/3466)を渡す。毬回しは **dist>150 の中距離でしか選ばれない**ので
        // 起点=150(技の選択条件の下限)。ここを渡さないと「プレイヤーが円の中心に立っている」前提の
        // 過大な必要msで測ってしまう(中央の監査テストと同じ式に揃える)。
        expect(entry.escapeMs).toBeGreaterThanOrEqual(minWindupMs(entry.radiusPx, entry.standDistPx ?? 0));
      }
    });

    it('水鳥乱舞(型B専用大技): 強制発火させるとhop1→hop2→hop3→recoverの順で進み、3回判定を積む', () => {
      const { id, step } = setupType('bounty-maiko', { x: 700, y: 0 }, { bossPhase: 2, bossState: 'mk-suiu-windup', bossStateUntil: undefined });
      useGameStore.setState(s2 => ({
        enemies: s2.enemies.map(e => e.id === id ? { ...e, bossStateUntil: useGameStore.getState().gameTime + 500 } : e),
      }));
      const before = useGameStore.getState().pumpkinBlasts.length;
      const seen = new Set<string | undefined>();
      for (let i = 0; i < 200; i++) {
        step(50);
        seen.add(useGameStore.getState().enemies.find(e => e.id === id)?.bossState);
      }
      expect(seen.has('mk-suiu-hop1')).toBe(true);
      expect(seen.has('mk-suiu-hop2')).toBe(true);
      expect(seen.has('mk-suiu-hop3')).toBe(true);
      expect(seen.has('mk-suiu-recover')).toBe(true);
      expect(seen.has('chase')).toBe(true);
      expect(useGameStore.getState().pumpkinBlasts.length).toBeGreaterThanOrEqual(before + 3);
    });

    it('水鳥乱舞のホップ間隔(予告)は換算式②の必要msを満たす(見てから歩いて避けられる)', () => {
      // MK_T.suiu.hopInterval(下限側)+MK_T.suiu.travelMs >= minWindupMs(半径+自機半径)。
      const need = minWindupMs(MK_T.suiu.radius + 14);
      const hopIntervalMin = Math.min(...MK_T.suiu.hopInterval);
      expect(hopIntervalMin + MK_T.suiu.travelMs).toBeGreaterThanOrEqual(need);
    });

    it('手毬打ち(遠距離・ブーメラン): 強制発火させるとwindup→out→back→recoverを経てchaseへ戻る', () => {
      const { id, step } = setupType('bounty-maiko', { x: 700, y: 0 }, { bossState: 'mk-boom-windup', bossStateUntil: undefined });
      useGameStore.setState(s2 => ({
        enemies: s2.enemies.map(e => e.id === id
          ? { ...e, bossStateUntil: useGameStore.getState().gameTime + 750, aiFromX: e.x, aiFromY: e.y, aiTargetX: e.x + 500, aiTargetY: e.y } : e),
      }));
      const seen = new Set<string | undefined>();
      for (let i = 0; i < 80; i++) {
        step(50);
        seen.add(useGameStore.getState().enemies.find(e => e.id === id)?.bossState);
      }
      expect(seen.has('mk-boom-out')).toBe(true);
      expect(seen.has('mk-boom-back')).toBe(true);
      expect(seen.has('mk-boom-recover')).toBe(true);
      expect(seen.has('chase')).toBe(true);
    });
  });
});


describe('★【回帰・v0.25.3549】城ボスと賞金首の同時出現', () => {
  // 社長報告「小ボスと城ボスが5分に同時に出てきてます」。
  // 城ボスは5:00に**城の位置へ湧く**ので、プレイヤーが着くまで bossFightNow(=交戦距離判定)はfalse。
  // その「湧いたが未交戦」の窓に、3:00から繰り越された賞金首が入り込んでいた。
  const base = (): Parameters<typeof bountySpawnBlocked>[0] => ({
    bossFightNow: false, bossAlive: false, activeEvent: false, hiddenBossAlive: false, redNightActive: false,
    area: 2, storyBossOnly: false, labTheme: false, corridorMode: false, tutorialStage: false,
  });

  it('★城ボスが湧いていれば、まだ交戦していなくても賞金首は出ない', () => {
    expect(bountySpawnBlocked({ ...base(), bossFightNow: false, bossAlive: true })).toBe(true);
  });

  it('★【不変条件】裏ボスと城ボスで扱いが揃っている(片方だけ交戦基準にしない)', () => {
    // 裏ボスは最初から「存命」で見ていたのに、城ボスだけ「交戦中」基準だったのが穴だった。
    expect(bountySpawnBlocked({ ...base(), hiddenBossAlive: true })).toBe(true);
    expect(bountySpawnBlocked({ ...base(), bossAlive: true })).toBe(true);
  });

  it('ボスが場に居なければ従来どおり出せる', () => {
    expect(bountySpawnBlocked(base())).toBe(false);
  });
});
