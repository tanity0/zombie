// B10 血の覚醒(research/THEONE_ROUND2.md §3)の**配線**テスト。純関数は utils/bloodAwaken.test.ts。
// 「誰が浴びるか」(本人の近接3関数・銃は距離≤90px)/ 乗る倍率 / 守護霊に持ち越さない / リセット を固定する。
import { bloodFill } from '../utils/bloodAwaken';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { useGameStore, skillBloodAwakenDamageMult, grantMeleeKillRewards } from './gameStore';
import { setSelectedStageId } from '../data/progress';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { computeEffectiveMoveSpeed, type EffectiveMoveSpeedInput } from '../utils/playerMoveSpeed';
import { resolveGhostBuild } from '../utils/ghostBuild';
import { buildPseudoPlayer } from '../utils/playerBuild';
import { fireWeapon, createWeapon } from '../utils/weaponUtils';
import { bloodAwakenMult, BLOOD_AWAKEN_MS } from '../utils/bloodAwaken';
import type { Player } from '../types/game';

const st = () => useGameStore.getState();
const meter = () => st().player.bloodMeter;

/** プレイヤーの目の前(密着)に敵を置く。 */
const spawnInFront = (health: number, dx = 4) => {
  const p = st().player;
  const e = spawnEnemyAt('zombie', p.x + p.width / 2 + dx, p.y + p.height / 2, st().gameTime);
  e.health = health; e.maxHealth = Math.max(e.maxHealth, health);
  useGameStore.setState({ enemies: [e] });
  return e;
};
const setHp = (frac: number) => useGameStore.setState(s => ({ player: { ...s.player, maxHealth: 100, health: 100 * frac } }));
const awaken = (until = st().gameTime + BLOOD_AWAKEN_MS) =>
  useGameStore.setState(s => ({ player: { ...s.player, bloodMeter: 1, bloodAwakenUntil: until, bloodAwakenStartedAt: st().gameTime } }));

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  setSelectedStageId('stage-1');
  useGameStore.getState().resetGame('warrior');
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true },
    player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 },
  }));
  setHp(1);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('初期化(リトライ・ステージ跨ぎで残らない)', () => {
  it('resetGame で血も覚醒も0へ戻る', () => {
    awaken();
    useGameStore.setState(s => ({ player: { ...s.player, bloodLastGainAt: 77 } }));
    useGameStore.getState().resetGame('warrior');
    const p = st().player;
    expect([p.bloodMeter, p.bloodAwakenUntil, p.bloodAwakenStartedAt, p.bloodLastGainAt]).toEqual([0, 0, 0, 0]);
  });
});

describe('近接で浴びる(本人の近接だけ)', () => {
  it('カウンター(ナイフ)で密着キル: +0.12(満タンHP)', () => {
    spawnInFront(1);
    st().triggerCounter();
    expect(meter()).toBeCloseTo(0.12);
    expect(st().player.bloodLastGainAt).toBe(st().gameTime);
  });
  it('体力が低いと器が小さい=自ずと早く満ちる: HP2割なら同じ +0.12 で液体の6割が赤い', () => {
    setHp(0.2);
    spawnInFront(1);
    st().triggerCounter();
    expect(meter()).toBeCloseTo(0.12);
    expect(bloodFill(st().player, st().gameTime)).toBeCloseTo(0.6);
  });
  it('倒せなかった命中は +0.02', () => {
    spawnInFront(99999);
    st().triggerCounter();
    expect(st().enemies[0].health).toBeLessThan(99999); // 当たってはいる
    expect(meter()).toBeCloseTo(0.02);
  });
  it('刀の一閃(本人)のキル: +0.12。オート斬撃(allowFinisher=false)は浴びない', () => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } }));
    const e = spawnInFront(1);
    st().performKatanaStrike([e.id], 1, true);
    expect(meter()).toBeCloseTo(0.12);
    const e2 = spawnInFront(1);
    useGameStore.setState(s => ({ player: { ...s.player, bloodMeter: 0 } }));
    st().performKatanaStrike([e2.id], 1, false);
    expect(meter()).toBe(0);
  });
  it('鞭(本人)のキル: +0.12', () => {
    const e = spawnInFront(1);
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['whip'] } }));
    st().performWhipStrike([e.id]);
    expect(meter()).toBeCloseTo(0.12);
  });
  it('分身・投擲スケボー・grantMeleeKillRewards 単体(旗なし)では浴びない', () => {
    const e = spawnInFront(1);
    const p = st().player;
    const clone = { x: p.x, y: p.y, width: p.width, height: p.height, facingLeft: false, characterClass: p.characterClass, spawnedAt: st().gameTime, attacksDone: 0, nextAttackAt: st().gameTime };
    st().shadowCloneStrike(clone);
    expect(st().enemies.some(x => x.id === e.id && x.health > 0)).toBe(false); // 倒せている
    expect(meter()).toBe(0);
    const e2 = spawnInFront(1);
    st().skaterBoardHit(e2.x + e2.width / 2, e2.y + e2.height / 2, 1, 0);
    expect(meter()).toBe(0);
    const dead = spawnEnemyAt('zombie', 100, 100, st().gameTime); dead.health = 0;
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: dead, finisher: false }], st().player, undefined);
    expect(meter()).toBe(0);
  });
  it('離れたキルは +0.06(距離>120px)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } }));
    const e = spawnInFront(1);
    const p = st().player;
    // 距離 100〜120 は近接の射程内なので、射程の長い刀で遠くを斬る(中心間 200px)。
    e.x = p.x + p.width / 2 + 200 - e.width / 2; e.y = p.y + p.height / 2 - e.height / 2;
    useGameStore.setState({ enemies: [e] });
    st().performKatanaStrike([e.id], 1, true);
    expect(meter()).toBeCloseTo(0.06);
  });
  it('覚醒中は加算しない(10秒の間に溜め直さない)', () => {
    awaken();
    spawnInFront(1);
    st().triggerCounter();
    expect(meter()).toBe(1);
    expect(st().player.bloodAwakenUntil).toBeGreaterThan(st().gameTime);
  });
});

describe('銃で浴びる(キルだけ・距離≤90px)', () => {
  it('近距離の銃キル: +0.06', () => {
    const e = spawnInFront(1, 30);
    st().damageEnemy(e.id, 999, false, false, false, 'gun', 'player');
    expect(meter()).toBeCloseTo(0.06);
  });
  it('遠距離の銃キル・倒せなかった命中は 0', () => {
    const far = spawnInFront(1, 400);
    st().damageEnemy(far.id, 999, false, false, false, 'gun', 'player');
    expect(meter()).toBe(0);
    const tough = spawnInFront(99999, 30);
    st().damageEnemy(tough.id, 10, false, false, false, 'gun', 'player');
    expect(meter()).toBe(0);
  });
  it('サブ(other)・DoT・爆風・守護霊/護衛(channel=null)・犬・守護霊(hate=ghost)は浴びない', () => {
    for (const [ch, hate] of [['other', 'player'], ['dot', 'player'], [null, 'player'], ['gun', 'ghost'], ['gun', 'dog']] as const) {
      const e = spawnInFront(1, 30);
      st().damageEnemy(e.id, 999, false, false, false, ch, hate);
      expect(meter()).toBe(0);
    }
    const b = spawnInFront(1, 30);
    st().damageEnemy(b.id, 999, true); // 爆風(channel 既定='other')
    expect(meter()).toBe(0);
  });
});

describe('覚醒中の倍率の配線', () => {
  it('与ダメ(近接+銃)の合流点 skillBloodAwakenDamageMult: 覚醒中だけ ×1.5・終わりの1秒で戻る', () => {
    const p0 = st().player;
    expect(skillBloodAwakenDamageMult(p0)).toBe(1);
    awaken();
    expect(skillBloodAwakenDamageMult(st().player)).toBe(1.5);
    useGameStore.setState(s => ({ gameTime: s.player.bloodAwakenUntil - 500 }));
    expect(skillBloodAwakenDamageMult(st().player)).toBeCloseTo(1.25);
  });
  it('近接の与ダメ: カウンター1発のダメージが覚醒中は 1.5 倍', () => {
    const e = spawnInFront(99999);
    st().triggerCounter();
    const base = 99999 - st().enemies[0].health;
    expect(base).toBeGreaterThan(0);
    useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0, bloodMeter: 0 } }));
    const e2 = spawnInFront(99999);
    expect(e2.id).not.toBe(e.id);
    awaken();
    st().triggerCounter();
    const boosted = 99999 - st().enemies[0].health;
    expect(boosted / base).toBeCloseTo(1.5, 1);
  });
  it('被ダメ ×2(damagePlayer の skilled の段)', () => {
    const hp0 = st().player.health;
    st().damagePlayer(10, 'test');
    const normal = hp0 - st().player.health;
    useGameStore.setState(s => ({ player: { ...s.player, health: hp0, invulnerable: false } }));
    awaken();
    st().damagePlayer(10, 'test');
    expect(hp0 - st().player.health).toBeCloseTo(normal * 2);
  });
  it('移動速度 ×1.5 はランプの外: 通常歩行の枝だけ。dashOverride・スケーター・スライドには掛けない', () => {
    const base: EffectiveMoveSpeedInput = {
      dashOverrideSpeed: null, slidingSpeed: null, reloading: false, reloadMoveSpeedMult: 1, playerSpeed: 200,
      skaterActive: false, bonusMult: 1.3, rampFrac: 0.5, trapDebuffed: false, pvpMult: 1, meleeRecoverMult: 1,
    };
    const plain = computeEffectiveMoveSpeed(base);
    expect(computeEffectiveMoveSpeed({ ...base, awakenSpeedMult: 1.5 })).toBeCloseTo(plain * 1.5);
    // ランプの途中でも丸ごと1.5倍(ランプで鈍らない)
    expect(computeEffectiveMoveSpeed({ ...base, rampFrac: 0, awakenSpeedMult: 1.5 })).toBeCloseTo(computeEffectiveMoveSpeed({ ...base, rampFrac: 0 }) * 1.5);
    expect(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: 900, awakenSpeedMult: 1.5 })).toBe(computeEffectiveMoveSpeed({ ...base, dashOverrideSpeed: 900 }));
    expect(computeEffectiveMoveSpeed({ ...base, slidingSpeed: 500, awakenSpeedMult: 1.5 })).toBe(computeEffectiveMoveSpeed({ ...base, slidingSpeed: 500 }));
    expect(computeEffectiveMoveSpeed({ ...base, skaterActive: true, awakenSpeedMult: 1.5 })).toBe(computeEffectiveMoveSpeed({ ...base, skaterActive: true }));
    // 省略(=スマホ・通常)は従来と同値
    expect(computeEffectiveMoveSpeed({ ...base, awakenSpeedMult: 1 })).toBe(plain);
  });
  it('弾速 ×1.5 は発射時に確定: 覚醒中に撃った弾だけ速い', () => {
    const p = st().player;
    const gun = { ...createWeapon('handgun-t1'), lastFired: 0 };
    const target = spawnEnemyAt('zombie', p.x, p.y, st().gameTime);
    useGameStore.setState(s => ({ enemies: [target], player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id } }));
    const normal = fireWeapon(gun, st().player, [target]);
    expect(normal.length).toBe(1);
    awaken();
    const boosted = fireWeapon({ ...gun, lastFired: 0 }, st().player, [target]);
    expect(boosted.length).toBe(1);
    expect(boosted[0].speed / normal[0].speed).toBeCloseTo(1.5);
    expect(normal[0].speed).toBeGreaterThan(0); // 先に撃った弾は変わらない
  });
  it('時間の速さ(timeScale)は触らない: 覚醒の倍率に時間の項は無い', () => {
    expect(Object.keys(bloodAwakenMult({ bloodAwakenUntil: 99999 }, 0)).sort()).toEqual(['boost', 'taken']);
  });
});

describe('守護霊・幻影の疑似Playerに持ち越さない', () => {
  const awakenedLive = (): Player => ({ ...st().player, bloodMeter: 1, bloodAwakenUntil: st().gameTime + BLOOD_AWAKEN_MS, bloodAwakenStartedAt: st().gameTime, bloodLastGainAt: st().gameTime });
  it('ビルド記録なし(=live を借りる旧プロファイル)でも血は0', () => {
    const live = awakenedLive();
    const g = resolveGhostBuild(undefined, live);
    expect(g.player.bloodMeter).toBe(0);
    expect(g.player.bloodAwakenUntil).toBe(0);
    expect(skillBloodAwakenDamageMult(g.player)).toBe(1);
  });
  it('スナップショット付きでも血は0。buildPseudoPlayer も落とす', () => {
    const live = awakenedLive();
    const snap = { maxHealth: 120, speed: 200, level: 3 };
    expect(buildPseudoPlayer(snap, live).bloodAwakenUntil).toBe(0);
    expect(resolveGhostBuild(snap, live).player.bloodMeter).toBe(0);
  });
});

describe('血の滴(spawnBloodDrip): 足の線で止まり、小さな点として 0.3秒だけ残る', () => {
  const bodyRect = { x: 1000, y: 500, width: 40, height: 80 };
  const dripIds = () => st().effects.filter(e => e.kind === 'particle' && e.id.startsWith('fx-bloodp-'));
  it('停止中に出した滴は、足の線(体の下端)を越えて落ちない', () => {
    let now = 9_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    useGameStore.setState({ effects: [] });
    st().spawnBloodDrip(bodyRect, 0, 0, 0);
    expect(dripIds().length).toBe(1);
    const foot = bodyRect.y + bodyRect.height;
    let maxY = -Infinity;
    for (let i = 0; i < 40; i++) { // 約 0.64秒ぶん進める(寿命内・着地まで十分)
      now += 16;
      st().updateEffects(0.016);
      for (const e of dripIds()) if (e.kind === 'particle') maxY = Math.max(maxY, e.y);
    }
    expect(maxY).toBeLessThanOrEqual(foot + 1e-9); // 足の線を越えない
  });
  it('着地した滴は小さな点(速度 0・寿命 300ms)に替わり、300ms 後に消える', () => {
    let now = 9_100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    useGameStore.setState({ effects: [] });
    st().spawnBloodDrip(bodyRect, 0, 0, 0);
    const before = dripIds()[0];
    if (before.kind !== 'particle') throw new Error('particle expected');
    const bigSize = before.size;
    let dot: (typeof before) | undefined;
    for (let i = 0; i < 40 && !dot; i++) {
      now += 16;
      st().updateEffects(0.016);
      const d = dripIds().find(e => e.id.endsWith('-dot'));
      if (d && d.kind === 'particle') dot = d;
    }
    expect(dot).toBeDefined();
    expect(dot!.y).toBeCloseTo(bodyRect.y + bodyRect.height);
    expect(dot!.vy).toBe(0);
    expect(dot!.duration).toBe(300);
    expect(dot!.size).toBeLessThan(bigSize);
    expect(dot!.settleY).toBeUndefined(); // 点は二度と着地しない
    now += 301;
    st().updateEffects(0.016);
    expect(dripIds().length).toBe(0);
  });
});
