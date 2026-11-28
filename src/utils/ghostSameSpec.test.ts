// GHOST-SAME-SPEC(v0.25.2541 / research/GHOST_PARITY_LEDGER.md 発注A・B・C)。
// 正本ドクトリン= BOT_AND_GHOST.md §2.11追補(社長裁定2026-07-31):
//   **守護霊は独立した2人目のプレイヤー。共有帳簿・専用枠・例外を新設しない。**
//   迷ったら「実プレイヤーが2人いたらどうなるか」で決める。
// このファイルはその不変条件を機械化する:
//   A: サブCDの帳簿が主語ごと(プレイヤーとゴーストが互いのCDを消費しない)。
//   B: 分身が主語ごと1体(枠の取り合いが無い・ゴーストの分身は自分のクラス絵・本人の台帳を汚さない)。
//   C: センサー地雷のチャージ/設置上限が主語ごと(盤面は世界に1本だが上限はオーナー単位)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGameStore, combatActorPlayer, setActorSubWeaponCooldown, shadowCloneOf,
  SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL, SHADOW_CLONE_DURATION_MS, SHADOW_CLONE_MAX_ATTACKS,
  SHADOW_CLONE_ATTACK_INTERVAL_MS, DRONE_BOOM_COOLDOWN_MS,
} from '../store/gameStore';
import { clearGhostBuildCache } from './ghostBuild';
import { placeSensorMine, SENSOR_MINE_CAP_BY_LEVEL, SENSOR_MINE_CHARGE_COOLDOWN_MS, type SensorMineState } from './sensorMine';
import { playerAsOwner, ghostAsOwner, ownerGhostId } from './subWeaponOwner';
import type { PlayerBuildSnapshot, Summon, SubWeaponKey } from '../types/game';

const GID = 'ghost-same-spec';
const GX = 2400, GY = 2400; // プレイヤー(初期位置)から十分離す

const snap = (
  subs: SubWeaponKey[],
  levels: Partial<Record<SubWeaponKey, number>> = {},
  extra: Partial<PlayerBuildSnapshot> = {},
): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: subs, subWeaponLevels: levels,
  ...extra,
});

const ghostAt = (build: PlayerBuildSnapshot): Summon => ({
  id: GID, x: GX, y: GY, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: build,
});

const place = (build: PlayerBuildSnapshot) => {
  useGameStore.getState().resetGame('warrior');
  clearGhostBuildCache();
  useGameStore.setState({ summons: [ghostAt(build)] });
};
const ghost = () => useGameStore.getState().summons.find(s => s.id === GID);
/** プレイヤーにサブを持たせる(カード経路を通さず直接=テスト用の最短)。 */
const givePlayerSub = (key: SubWeaponKey, level = 1) => {
  useGameStore.setState(s => ({
    player: {
      ...s.player,
      subWeapons: [...s.player.subWeapons, key],
      subWeaponLevels: { ...s.player.subWeaponLevels, [key]: level },
    },
  }));
};

beforeEach(() => { useGameStore.getState().resetGame('warrior'); clearGhostBuildCache(); });

// ---------------------------------------------------------------------------
describe('A: サブCD帳簿の分離(§2.11追補 帰結①)', () => {
  it('疑似Playerは守護霊自前のWeapon[]/リロード状態を読む', () => {
    place(snap([]));
    const initial = combatActorPlayer(GID)!;
    const active = initial.weapons.find(w => w.id === initial.activeWeaponId)!;
    const runtime = initial.weapons.map(w => w.id === active.id ? { ...w, magazine: 0 } : w);
    useGameStore.setState(s => ({
      summons: s.summons.map(g => g.id === GID ? {
        ...g,
        ghostWeapons: runtime,
        ghostReloadingWeaponId: active.id,
        ghostReloadEndsAt: 9999,
      } : g),
    }));
    const actor = combatActorPlayer(GID)!;
    expect(actor.weapons.find(w => w.id === actor.activeWeaponId)?.magazine).toBe(0);
    expect(actor.reloadingWeaponId).toBe(active.id);
    expect(actor.reloadEndsAt).toBe(9999);
    expect(useGameStore.getState().player.reloadingWeaponId).toBe('');
  });

  it('疑似Playerが読むCD表は**ゴースト自前**(プレイヤーのCDは見ない)', () => {
    place(snap(['drone-boomerang']));
    // プレイヤー側だけCDを立てても、ゴーストは「明けている」ままでなければならない。
    useGameStore.getState().setSubWeaponCooldown('drone-boomerang', useGameStore.getState().gameTime + 99999);
    const actor = combatActorPlayer(GID)!;
    expect(actor.subWeaponCooldowns['drone-boomerang']).toBeUndefined();
    // 実際に振れる(=プレイヤーのCDに引きずられない)。
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).boomerang).toBe(true);
  });

  it('召喚直後のゴーストは帳簿が空=全サブ即使用可(実プレイヤーの参戦と同じ)', () => {
    place(snap(['drone-boomerang', 'flare-gun']));
    expect(ghost()!.ghostSubWeaponCooldowns).toBeUndefined();
    const r = useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(r.boomerang).toBe(true);
    expect(r.flare).toBe(true);
  });

  it('setActorSubWeaponCooldown: 主語で宛先が分かれる(プレイヤー/ゴースト)', () => {
    place(snap(['drone-boomerang']));
    const gt = useGameStore.getState().gameTime;
    setActorSubWeaponCooldown(undefined, 'decoy', gt + 1000);
    expect(useGameStore.getState().player.subWeaponCooldowns['decoy']).toBe(gt + 1000);
    expect(ghost()!.ghostSubWeaponCooldowns?.['decoy']).toBeUndefined();
    setActorSubWeaponCooldown(GID, 'decoy', gt + 2000);
    expect(ghost()!.ghostSubWeaponCooldowns?.['decoy']).toBe(gt + 2000);
    expect(useGameStore.getState().player.subWeaponCooldowns['decoy']).toBe(gt + 1000); // プレイヤーは動かない
  });

  it('ゴーストが振ってもプレイヤーのCD表は1つも増えない(2人分が独立に回る)', () => {
    place(snap(['drone-boomerang', 'flare-gun', 'junk-weapon']));
    useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(Object.keys(useGameStore.getState().player.subWeaponCooldowns).length).toBe(0);
    expect(ghost()!.ghostSubWeaponCooldowns?.['drone-boomerang'])
      .toBeGreaterThanOrEqual(useGameStore.getState().gameTime + DRONE_BOOM_COOLDOWN_MS - 1);
  });

  it('ownerGhostId: 主語IDの解決(プレイヤー=undefined / ゴースト=summon.id)', () => {
    place(snap([]));
    expect(ownerGhostId(playerAsOwner(useGameStore.getState().player))).toBeUndefined();
    expect(ownerGhostId(ghostAsOwner(ghost()!))).toBe(GID);
  });
});

// ---------------------------------------------------------------------------
describe('B: 分身(shadow-clone)の主語ごと化(§2.11追補 帰結②)', () => {
  it('ゴーストの近接スイングで分身が出る(枠=Summon側・絵=計測ビルドのクラス)', () => {
    place(snap(['shadow-clone'], {}, { characterClass: 'rogue' }));
    const r = useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(r.clone).toBe(true);
    const c = ghost()!.ghostShadowClone!;
    expect(c).toBeDefined();
    expect(c.x).toBe(GX);            // 生成位置=ゴーストの体
    expect(c.characterClass).toBe('rogue');
    expect(useGameStore.getState().shadowClone).toBeNull(); // プレイヤーの枠は空のまま
  });

  it('枠の取り合いが無い: プレイヤーが分身を出していてもゴーストは出せる(逆も同じ)', () => {
    place(snap(['shadow-clone']));
    // プレイヤーの枠を埋める(store直書き=triggerCounterを通さない最短)。
    useGameStore.setState({
      shadowClone: {
        x: 0, y: 0, width: 32, height: 32, facingLeft: false, characterClass: 'warrior',
        spawnedAt: 0, attacksDone: 0, nextAttackAt: 0,
      },
    });
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).clone).toBe(true);
    expect(ghost()!.ghostShadowClone).toBeDefined();
    expect(useGameStore.getState().shadowClone).not.toBeNull(); // プレイヤーの分身は消えない
  });

  it('自分の枠が埋まっている間は再生成しない(プレイヤーと同じ条件)', () => {
    place(snap(['shadow-clone']));
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).clone).toBe(true);
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).clone).toBe(false);
  });

  it('消滅=自分のCD帳簿へLv別CD(プレイヤーのCD表は動かない)', () => {
    place(snap(['shadow-clone'], { 'shadow-clone': 3 }));
    useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    useGameStore.getState().expireShadowClone(GID);
    expect(ghost()!.ghostShadowClone).toBeUndefined();
    expect(ghost()!.ghostSubWeaponCooldowns?.['shadow-clone'])
      .toBe(useGameStore.getState().gameTime + SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL[3]);
    expect(useGameStore.getState().player.subWeaponCooldowns['shadow-clone']).toBeUndefined();
  });

  it('CD中は出ない / 明ければまた出る(プレイヤーと同じ定数を共有)', () => {
    place(snap(['shadow-clone'], { 'shadow-clone': 1 }));
    useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    useGameStore.getState().expireShadowClone(GID);
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).clone).toBe(false);
    useGameStore.setState(s => ({ gameTime: s.gameTime + SHADOW_CLONE_COOLDOWN_MS_BY_LEVEL[1] }));
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).clone).toBe(true);
  });

  it('shadowCloneOf: 主語ごとの枠を読む', () => {
    place(snap(['shadow-clone']));
    useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(shadowCloneOf(useGameStore.getState(), GID)).not.toBeNull();
    expect(shadowCloneOf(useGameStore.getState())).toBeNull();
    expect(shadowCloneOf(useGameStore.getState(), 'nope')).toBeNull();
  });

  it('寿命/回数の規則はプレイヤーと同じ1組の定数(ゴースト用の別値を作らない)', () => {
    expect(SHADOW_CLONE_DURATION_MS).toBe(5000);
    expect(SHADOW_CLONE_MAX_ATTACKS).toBe(5);
    expect(SHADOW_CLONE_ATTACK_INTERVAL_MS).toBe(1000);
    // 寿命到達=tickで消滅+CD開始(主語=ゴースト)。
    place(snap(['shadow-clone'], { 'shadow-clone': 1 }));
    useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    useGameStore.setState(s => ({ gameTime: s.gameTime + SHADOW_CLONE_DURATION_MS }));
    useGameStore.getState().tickShadowClone(GID);
    expect(ghost()!.ghostShadowClone).toBeUndefined();
    expect(ghost()!.ghostSubWeaponCooldowns?.['shadow-clone']).toBeGreaterThan(0);
  });

  it('ゴーストの分身の一撃は**本人のコンボ台帳を書かない**(★未決1と同じ扱い)', () => {
    place(snap(['shadow-clone']));
    useGameStore.setState(s => ({
      meleeFinishComboCount: 7, meleeFinishComboUntil: s.gameTime + 9999,
      enemies: [],
    }));
    useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    const clone = ghost()!.ghostShadowClone!;
    useGameStore.getState().shadowCloneStrike(clone, GID);
    expect(useGameStore.getState().meleeFinishComboCount).toBe(7); // 本人のコンボは動かない(2026-08-29一本化後は表示コンボで確認)
  });
});

// ---------------------------------------------------------------------------
describe('C: センサー地雷(sensor-mine)の主語ごと化(§2.11追補 帰結③)', () => {
  const mine = (id: string, placedAt: number, ownerGhostId?: string): SensorMineState =>
    ({ id, x: 0, y: 0, placedAt, triggeredAt: 0, ...(ownerGhostId ? { ownerGhostId } : {}) });

  it('placeSensorMine: 上限は**同じオーナーの地雷だけ**を数える', () => {
    // プレイヤー3個(Lv1上限)+ゴーストが置く → プレイヤーの地雷は消えない。
    const mines = [mine('p1', 100), mine('p2', 200), mine('p3', 300)];
    const next = placeSensorMine(mines, mine('g1', 400, 'G'), SENSOR_MINE_CAP_BY_LEVEL[1]);
    expect(next.map(m => m.id)).toEqual(['p1', 'p2', 'p3', 'g1']);
  });

  it('placeSensorMine: 自分の上限に達したら**自分の最古**だけを置換する', () => {
    const mines = [mine('g1', 100, 'G'), mine('p1', 150), mine('g2', 200, 'G'), mine('g3', 300, 'G')];
    const next = placeSensorMine(mines, mine('g4', 400, 'G'), SENSOR_MINE_CAP_BY_LEVEL[1]);
    expect(next.map(m => m.id)).toEqual(['p1', 'g2', 'g3', 'g4']); // 消えたのは g1 のみ
  });

  it('プレイヤー単独の盤面では従来と1bit同じ(最古置換)', () => {
    const mines = [mine('a', 100), mine('b', 200), mine('c', 300)];
    expect(placeSensorMine(mines, mine('d', 400), 3).map(m => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('ゴーストのスイングで設置され、チャージは**ゴースト自前**が減る(プレイヤーの残チャージは不変)', () => {
    place(snap(['sensor-mine'], { 'sensor-mine': 1 }));
    givePlayerSub('sensor-mine', 1);
    const r = useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(r.mine).toBe(true);
    const mines = useGameStore.getState().sensorMines;
    expect(mines.length).toBe(1);
    expect(mines[0].ownerGhostId).toBe(GID);
    expect(mines[0].x).toBe(GX + 16);                      // ゴーストの足元(中心X)
    expect(mines[0].y).toBe(GY + 32);                      // 同 足元Y
    expect(useGameStore.getState().sensorMineCharges).toEqual([]); // プレイヤーのチャージは無傷
    expect(ghost()!.ghostSensorMineCharges?.length).toBe(1);
  });

  it('チャージを使い切ったら置けない/回復すればまた置ける(プレイヤーと同じ10秒・同じ上限)', () => {
    place(snap(['sensor-mine'], { 'sensor-mine': 1 }));
    for (let i = 0; i < SENSOR_MINE_CAP_BY_LEVEL[1]; i++) {
      expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).mine).toBe(true);
    }
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).mine).toBe(false); // チャージ切れ
    useGameStore.setState(s => ({ gameTime: s.gameTime + SENSOR_MINE_CHARGE_COOLDOWN_MS }));
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).mine).toBe(true);
  });

  it('盤面の上限はオーナーごと: ゴーストが上限まで置いてもプレイヤーの地雷は消えない', () => {
    place(snap(['sensor-mine'], { 'sensor-mine': 1 }));
    // プレイヤーの地雷を3個(Lv1上限)先に置いた状態を作る。
    useGameStore.setState({
      sensorMines: [mine('p1', 10), mine('p2', 20), mine('p3', 30)],
    });
    for (let i = 0; i < SENSOR_MINE_CAP_BY_LEVEL[1]; i++) useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    const ids = useGameStore.getState().sensorMines.map(m => m.id);
    expect(ids.filter(id => id.startsWith('p')).length).toBe(3);
    expect(useGameStore.getState().sensorMines.filter(m => m.ownerGhostId === GID).length)
      .toBe(SENSOR_MINE_CAP_BY_LEVEL[1]);
  });
});
