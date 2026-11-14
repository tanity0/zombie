// GHOST-KATANA-WIRE(v0.25.2518 / research/GHOST_PARITY_LEDGER.md 項目5・6・裁定2「共有方式」)。
// 掟の機械化: 守護霊の刀(一閃)/ワイヤーは**プレイヤーと同じ状態機械・同じ定数**を通ること。
//  - Summon.ghostDash(DashLocomotionState)へ状態が入り、プレイヤーの state は1bitも動かない。
//  - 無敵(ghostInvulnUntil)の窓長がプレイヤーの逆算打刻(invulnerableTime+INVULN_MS)と一致する。
//  - CD(サブウェポン)は**主語ごとの帳簿**(v0.25.2541 §2.11追補で「1つの財布」を廃止)=
//    守護霊のCDは Summon.ghostSubWeaponCooldowns に入り、プレイヤーのCD表は動かない。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGameStore, INVULN_MS,
  KATANA_DASH_MS, KATANA_DASH_RECOVERY_MS, KATANA_DASH_COOLDOWN_MS,
  WIRE_PLANT_DELAY_MS, WIRE_SLAM_MS, WIRE_DIST_BY_LEVEL, WIRE_DASH_MS, WIRE_COOLDOWN_BY_LEVEL,
  combatActorPlayer, isKatanaMode,
} from '../store/gameStore';
import { dashModeAt, dashStateOf } from './dashLocomotion';
import { clearGhostBuildCache } from './ghostBuild';
import type { PlayerBuildSnapshot, Summon, SubWeaponKey } from '../types/game';

const GID = 'ghost-test';

const snap = (subs: SubWeaponKey[], levels: Partial<Record<SubWeaponKey, number>> = {}): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: subs, subWeaponLevels: levels,
});

const ghostAt = (x: number, y: number, build: PlayerBuildSnapshot): Summon => ({
  id: GID, x, y, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: build,
});

const place = (build: PlayerBuildSnapshot) => {
  useGameStore.getState().resetGame('warrior');
  clearGhostBuildCache();
  useGameStore.setState({ summons: [ghostAt(500, 500, build)] });
};
const ghost = () => useGameStore.getState().summons.find(s => s.id === GID);
const gDash = () => dashStateOf(ghost()?.ghostDash);

beforeEach(() => { useGameStore.getState().resetGame('warrior'); clearGhostBuildCache(); });

describe('主語の解決(combatActorPlayer)', () => {
  it('未指定はプレイヤー本体・ghostId指定は「計測時ビルド+実体の座標+ゴーストの刀/ワイヤー状態」', () => {
    place(snap(['katana'], { katana: 3 }));
    const p = combatActorPlayer();
    expect(p?.x).toBe(useGameStore.getState().player.x);
    const g = combatActorPlayer(GID)!;
    expect(g.x).toBe(500);
    expect(isKatanaMode(g)).toBe(true);
    expect(isKatanaMode(useGameStore.getState().player)).toBe(false); // 本人は刀を持っていない
    expect(g.katanaDashUntil).toBe(0);
  });

  it('居ないゴーストのidはnull(解散後の呼び出しで何も起こらない)', () => {
    expect(combatActorPlayer('nope')).toBeNull();
  });
});

describe('項目5: 一閃(triggerKatanaDash)を守護霊が同じ状態機械で撃つ', () => {
  it('刀ビルドなら発動し、ghostDashへ距離/硬直/CDが入る(プレイヤーは不変)', () => {
    place(snap(['katana'], { katana: 1 }));
    const before = useGameStore.getState().player;
    const t0 = Date.now();
    expect(useGameStore.getState().triggerKatanaDash(1, 0, GID)).toBe(true);
    const d = gDash();
    expect(d.katanaDashUntil).toBeGreaterThanOrEqual(t0 + KATANA_DASH_MS);
    expect(d.katanaRecoveryUntil).toBeGreaterThanOrEqual(t0 + KATANA_DASH_MS + KATANA_DASH_RECOVERY_MS);
    expect(d.katanaDashCooldownEnd).toBeGreaterThanOrEqual(t0 + KATANA_DASH_MS + KATANA_DASH_COOLDOWN_MS);
    expect(d.katanaDashDirX).toBeCloseTo(1, 6);
    // プレイヤー側の刀状態・無敵は一切動かない
    const after = useGameStore.getState().player;
    expect(after.katanaDashUntil).toBe(before.katanaDashUntil);
    expect(after.invulnerable).toBe(before.invulnerable);
    expect(after.counterCooldownEnd).toBe(before.counterCooldownEnd);
  });

  it('一閃中の無敵窓はプレイヤーの逆算打刻(invulnerableTime+INVULN_MS)と同じ長さ', () => {
    place(snap(['katana']));
    const t0 = Date.now();
    useGameStore.getState().triggerKatanaDash(0, 1, GID);
    const invulnUntil = ghost()?.ghostInvulnUntil ?? 0;
    // プレイヤー式: invulnerableTime = now - (INVULN_MS - KATANA_DASH_MS) → 解除は now + KATANA_DASH_MS
    const playerEquivalent = (t0 - Math.max(0, INVULN_MS - KATANA_DASH_MS)) + INVULN_MS;
    expect(invulnUntil).toBeGreaterThanOrEqual(playerEquivalent);
    expect(invulnUntil).toBeLessThan(playerEquivalent + 50);
  });

  it('刀を持たないビルドでは発動しない(=従来のナイフ役のまま)', () => {
    place(snap([]));
    expect(useGameStore.getState().triggerKatanaDash(1, 0, GID)).toBe(false);
    expect(gDash().katanaDashUntil).toBe(0);
  });

  it('硬直中は次の一閃を出せない(モーションキャンセル不可・プレイヤーと同条件)', () => {
    place(snap(['katana']));
    expect(useGameStore.getState().triggerKatanaDash(1, 0, GID)).toBe(true);
    expect(useGameStore.getState().triggerKatanaDash(1, 0, GID)).toBe(false);
  });

  it('村雨(CD無し)は硬直明けだけで撃てる=CD終了が一閃終了と同時', () => {
    place(snap(['murasame']));
    const t0 = Date.now();
    useGameStore.getState().triggerKatanaDash(1, 0, GID);
    const d = gDash();
    expect(d.katanaDashCooldownEnd).toBeLessThan(t0 + KATANA_DASH_MS + KATANA_DASH_COOLDOWN_MS);
    expect(d.katanaDashCooldownEnd).toBeGreaterThanOrEqual(t0 + KATANA_DASH_MS);
  });

  it('ロコモーション上書きが有効になる(=移動の主語がゴーストに乗る)', () => {
    place(snap(['katana']));
    useGameStore.getState().triggerKatanaDash(1, 0, GID);
    expect(dashModeAt(gDash(), Date.now())).toBe('katana-dash');
    // 一閃が終われば着地硬直へ、硬直も切れれば上書きなし
    expect(dashModeAt(gDash(), Date.now() + KATANA_DASH_MS + 1)).toBe('katana-recovery');
    expect(dashModeAt(gDash(), Date.now() + KATANA_DASH_MS + KATANA_DASH_RECOVERY_MS + 1)).toBeNull();
  });
});

describe('項目6: ワイヤーアンカー(triggerWireAnchor)を守護霊が同じ状態機械で使う', () => {
  it('敵が居なければ地点プラント: ghostDashへ刺し位置と待ち時間が入る', () => {
    place(snap(['wire-anchor'], { 'wire-anchor': 1 }));
    const t0 = Date.now();
    expect(useGameStore.getState().triggerWireAnchor(1, 0, GID)).toBe(true);
    const d = gDash();
    expect(d.wireAnchored).toBe(true);
    expect(d.wireAnchorX).toBeCloseTo(500 + 32 / 2 + WIRE_DIST_BY_LEVEL[1], 6); // ゴースト中心から固定距離
    expect(d.wirePlantUntil).toBeGreaterThanOrEqual(t0 + WIRE_PLANT_DELAY_MS);
    // プレイヤーのワイヤー状態は動かない
    expect(useGameStore.getState().player.wireAnchored).toBe(false);
  });

  // v0.25.2541(§2.11追補・GHOST-SAME-SPEC 発注A): 「1つの財布」は廃止=CDは**主語ごとの帳簿**。
  // ゴーストのワイヤーCDはゴースト自前(Summon.ghostSubWeaponCooldowns)に入り、プレイヤーは動かない。
  it('CDは主語ごとの帳簿(ゴースト自前)に入り、プレイヤーのCD表は動かない', () => {
    place(snap(['wire-anchor'], { 'wire-anchor': 1 }));
    useGameStore.getState().triggerWireAnchor(1, 0, GID);
    const g = useGameStore.getState().summons.find(s => s.id === GID)!;
    const cd = g.ghostSubWeaponCooldowns?.['wire-anchor'] ?? 0;
    const gameTime = useGameStore.getState().gameTime;
    expect(cd).toBeCloseTo(gameTime + WIRE_PLANT_DELAY_MS + WIRE_DASH_MS + WIRE_COOLDOWN_BY_LEVEL[1], 6);
    expect(useGameStore.getState().player.subWeaponCooldowns['wire-anchor']).toBeUndefined();
    // 自分のCD中は再発動しない(プレイヤーと同条件)
    expect(useGameStore.getState().triggerWireAnchor(1, 0, GID)).toBe(false);
  });

  it('待ちが明けたら startWireDash がゴーストの高速移動を始める(無敵付き)', () => {
    place(snap(['wire-anchor'], { 'wire-anchor': 1 }));
    useGameStore.getState().triggerWireAnchor(1, 0, GID);
    // 待ち完了を模す(useGameLoopのワイヤーtickが同じ条件で呼ぶ)
    useGameStore.setState(s => ({
      summons: s.summons.map(x => x.id === GID
        ? { ...x, ghostDash: { ...dashStateOf(x.ghostDash), wirePlantUntil: 0 } } : x),
    }));
    const t0 = Date.now();
    useGameStore.getState().startWireDash(GID);
    const d = gDash();
    expect(d.wireAnchored).toBe(false);
    expect(d.wireDashUntil).toBeGreaterThanOrEqual(t0 + WIRE_DASH_MS);
    expect(d.wireDashSpeed).toBeGreaterThan(0);
    expect(dashModeAt(d, Date.now())).toBe('wire-dash');
    expect(ghost()?.ghostInvulnUntil ?? 0).toBeGreaterThanOrEqual(t0 + WIRE_DASH_MS);
  });

  it('離脱ジャンプ(startWireHop)も同じ防御規格(無敵)で走る', () => {
    place(snap(['wire-anchor'], { 'wire-anchor': 3 }));
    const t0 = Date.now();
    useGameStore.getState().startWireHop(700, 700, GID);
    const d = gDash();
    expect(d.wireHopTargetX).toBe(700);
    expect(d.wireHopUntil).toBeGreaterThan(t0);
    expect(dashModeAt(d, Date.now())).toBe('wire-hop');
    expect(ghost()?.ghostInvulnUntil ?? 0).toBeGreaterThan(t0);
    expect(useGameStore.getState().player.wireHopUntil).toBe(0); // プレイヤーは不変
  });

  it('線上に敵が居ればスラム(即発動・斬り下ろし対象を保持)', () => {
    place(snap(['wire-anchor'], { 'wire-anchor': 1 }));
    useGameStore.setState({
      enemies: [{
        id: 'e1', type: 'zombie', x: 600, y: 505, width: 20, height: 20,
        health: 30, maxHealth: 30, speed: 10, damage: 1, experienceValue: 1,
      } as never],
    });
    const t0 = Date.now();
    expect(useGameStore.getState().triggerWireAnchor(1, 0, GID)).toBe(true);
    const d = gDash();
    expect(d.wireSlamEnemyId).toBe('e1');
    expect(d.wireDashUntil).toBeGreaterThanOrEqual(t0 + WIRE_SLAM_MS);
    expect(d.wireSlamFromX).toBeCloseTo(500 + 16, 6); // ホップの戻り方向はゴースト中心が起点
    expect(ghost()?.ghostInvulnUntil ?? 0).toBeGreaterThanOrEqual(t0 + WIRE_SLAM_MS);
  });

  it('刀ビルドの守護霊はワイヤーを使えない(プレイヤーと同じ排他)', () => {
    place(snap(['katana', 'wire-anchor']));
    expect(useGameStore.getState().triggerWireAnchor(1, 0, GID)).toBe(false);
  });
});

describe('除外1/4: 守護霊の刀は演出・計測をプレイヤー起因にしない', () => {
  it('オート斬撃(performKatanaStrike)はヒットストップ/スローを起こさず、コンボ台帳も動かさない', () => {
    place(snap(['katana'], { katana: 3 }));
    useGameStore.setState({
      enemies: [{
        id: 'e1', type: 'zombie', x: 520, y: 505, width: 20, height: 20,
        health: 8, maxHealth: 30, speed: 10, damage: 1, experienceValue: 1,
        stunUntil: 1e12, // 気絶中=フィニッシュ経路(プレイヤーならヒットストップが出る)
      } as never],
      meleeFinishComboCount: 0, meleeFinishComboUntil: 0,
    });
    const res = useGameStore.getState().performKatanaStrike(['e1'], 3, true, GID);
    expect(res.hit).toBe(true);
    expect(res.finish).toBe(true);
    const st = useGameStore.getState();
    expect(st.hitstopUntil ?? 0).toBe(0);        // 除外1: 時間停止なし
    expect(st.timeSlowUntil ?? 0).toBe(0);       // 除外1: スローなし
    expect(st.meleeFinishComboCount).toBe(0);    // 本人のコンボ台帳は動かさない(knifeCombo*は2026-08-29に表示コンボへ一本化済み)
    expect(st.gameStats.enemiesKilled).toBe(1);  // キル集計は damageEnemy 経路と同じ扱いで積む
  });

  it('対照: 同じ一閃をプレイヤーが決めるとヒットストップとコンボ台帳が動く(除外の効きを担保)', () => {
    useGameStore.getState().resetGame('warrior');
    const p = useGameStore.getState().player;
    useGameStore.setState({
      player: { ...p, subWeapons: ['katana'], subWeaponLevels: { katana: 3 } },
      enemies: [{
        id: 'e1', type: 'zombie', x: p.x + 20, y: p.y, width: 20, height: 20,
        health: 8, maxHealth: 30, speed: 10, damage: 1, experienceValue: 1,
        stunUntil: 1e12,
      } as never],
      meleeFinishComboCount: 0, meleeFinishComboUntil: 0, hitstopUntil: 0,
    });
    const res = useGameStore.getState().performKatanaStrike(['e1'], 3, true);
    expect(res.finish).toBe(true);
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThan(0);
    expect(useGameStore.getState().meleeFinishComboCount).toBe(1);
  });

  it('刀を持たないビルドではオート斬撃自体が成立しない', () => {
    place(snap([]));
    const res = useGameStore.getState().performKatanaStrike(['e1'], 1, false, GID);
    expect(res).toEqual({ hit: false, finish: false, killed: 0 });
  });
});
