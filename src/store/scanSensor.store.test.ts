// research/NEW_GUNS.md §4/§7-6(スキャンセンサー): ストアを実際に動かして「テストで固定する約束」を固定する。
//  - 近接・刀の倍率は段・Lvで変わらない(印付きの1振りのダメージは、段が上がるほど増える)
//  - 1振りで倍率が効くのは1体だけ
//  - 紫・カウンター・打ち返しには掛からない
//  - スキャンを持っている間、ストライカーの ×1.5 が付かない
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, strikerMeleeMult } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { createWeapon, MELEE_KEYS } from '../utils/weaponUtils';
import { SCAN_WEAPON_KEY, SCAN_MARK_MELEE_MULT, SCAN_MARK_KATANA_MULT, SCAN_MARK_RANGED_MULT } from '../utils/scanSensor';
import type { Enemy, EnemyType } from '../types/game';

let now = 5_000_000;

const setup = (klass: 'warrior' | 'rogue' = 'warrior') => {
  useGameStore.getState().resetGame(klass);
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true },
    player: { ...st.player, counterCooldownEnd: 0, pendingSwingAt: 0, health: 100, maxHealth: 100 },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (type: EnemyType, dx: number, dy: number, id: string, marked: boolean, health = 99999): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = health; e.maxHealth = health; e.id = id;
  if (marked) e.scanMarkUntil = useGameStore.getState().gameTime + 3000;
  return e;
};
const hpOf = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)?.health ?? 0;
const setMelee = (key: string) => useGameStore.setState(st => ({
  player: { ...st.player, weapons: [...st.player.weapons.filter(w => !w.isMelee), createWeapon(key)] },
}));
/** 1振り(前隙なしの直呼び)で、その敵が受けたダメージ。 */
const swingDamage = (enemies: Enemy[], id: string): number => {
  useGameStore.setState(st => ({ enemies, player: { ...st.player, counterCooldownEnd: 0 } }));
  const before = hpOf(id);
  useGameStore.getState().triggerCounter();
  return before - hpOf(id);
};

beforeEach(() => {
  now = 5_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 会心を出さない
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§7-6 近接の倍率は段で変わらない(印付きの1振りは段が上がるほど増える)', () => {
  it('ナイフ t1〜t5: 印あり÷印なし = 雑魚×2.75(全段同じ)・印ありのダメージは段ごとに増える', () => {
    setup();
    let prevMarked = 0;
    for (const key of MELEE_KEYS) {
      setMelee(key);
      now += 5000;
      const plain = swingDamage([enemyAt('zombie', 30, 0, 'z', false)], 'z');
      now += 5000;
      const marked = swingDamage([enemyAt('zombie', 30, 0, 'z', true)], 'z');
      expect(plain).toBeGreaterThan(0);
      expect(marked / plain).toBeCloseTo(SCAN_MARK_MELEE_MULT.mob, 5);
      expect(marked).toBeGreaterThan(prevMarked);
      prevMarked = marked;
    }
  });
  it('ボス級(ボス式の会心を受ける型)は ×4.7', () => {
    setup();
    now += 5000;
    const plain = swingDamage([enemyAt('hunter', 30, 0, 'h', false)], 'h');
    now += 5000;
    const marked = swingDamage([enemyAt('hunter', 30, 0, 'h', true)], 'h');
    expect(marked / plain).toBeCloseTo(SCAN_MARK_MELEE_MULT.boss, 5);
  });
});

describe('§7-6 刀の倍率はLvで変わらない', () => {
  it('刀 Lv1〜3: 印あり÷印なし = 雑魚×3.1(全Lv同じ)・印ありのダメージはLvごとに増える', () => {
    setup();
    let prevMarked = 0;
    for (const lv of [1, 2, 3]) {
      useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['katana'], subWeaponLevels: { ...st.player.subWeaponLevels, katana: lv } } }));
      useGameStore.setState({ enemies: [enemyAt('zombie', 30, 0, 'z', false)] });
      let before = hpOf('z');
      useGameStore.getState().performKatanaStrike(['z'], 1, false);
      const plain = before - hpOf('z');
      useGameStore.setState({ enemies: [enemyAt('zombie', 30, 0, 'z', true)] });
      before = hpOf('z');
      useGameStore.getState().performKatanaStrike(['z'], 1, false);
      const marked = before - hpOf('z');
      expect(marked / plain).toBeCloseTo(SCAN_MARK_KATANA_MULT.mob, 5);
      expect(marked).toBeGreaterThan(prevMarked);
      prevMarked = marked;
    }
  });
});

describe('§7-6 1振りで倍率が効くのは1体だけ', () => {
  it('印付きが2体届く時、近い方だけ ×2.75・遠い方は素のダメージ', () => {
    setup();
    now += 5000;
    const plain = swingDamage([enemyAt('zombie', 30, 0, 'solo', false)], 'solo');
    now += 5000;
    useGameStore.setState(st => ({ enemies: [enemyAt('zombie', 20, 0, 'near', true), enemyAt('zombie', -50, 0, 'far', true)], player: { ...st.player, counterCooldownEnd: 0 } }));
    const bNear = hpOf('near'), bFar = hpOf('far');
    useGameStore.getState().triggerCounter();
    const dNear = bNear - hpOf('near'), dFar = bFar - hpOf('far');
    expect(dNear / plain).toBeCloseTo(SCAN_MARK_MELEE_MULT.mob, 5);
    expect(dFar).toBeCloseTo(plain, 5);
  });
  it('刀の一閃が2体に当たる時も、近い方だけ ×3.1', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['katana'], subWeaponLevels: { ...st.player.subWeaponLevels, katana: 1 } } }));
    useGameStore.setState({ enemies: [enemyAt('zombie', 30, 0, 'p', false)] });
    let b = hpOf('p');
    useGameStore.getState().performKatanaStrike(['p'], 3, false);
    const plain = b - hpOf('p');
    useGameStore.setState({ enemies: [enemyAt('zombie', 25, 0, 'near', true), enemyAt('zombie', 70, 0, 'far', true)] });
    b = hpOf('near'); const bf = hpOf('far');
    useGameStore.getState().performKatanaStrike(['near', 'far'], 3, false);
    expect((b - hpOf('near')) / plain).toBeCloseTo(SCAN_MARK_KATANA_MULT.mob, 5);
    expect(bf - hpOf('far')).toBeCloseTo(plain, 5);
  });
});

describe('§7-6 中央経路: 銃・サブ・仲間は ×1.6、紫・カウンター・打ち返しには掛からない', () => {
  it('銃の弾(gun)・サブ(other)・守護霊(ghost)は ×1.6', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 300, 0, 'm', true)] });
    let b = hpOf('m');
    useGameStore.getState().damageEnemy('m', 10, false, false, false, 'gun', 'player');
    expect(b - hpOf('m')).toBeCloseTo(10 * SCAN_MARK_RANGED_MULT, 5);
    b = hpOf('m');
    useGameStore.getState().damageEnemy('m', 10, true, false, false, 'other', 'player');
    expect(b - hpOf('m')).toBeCloseTo(10 * SCAN_MARK_RANGED_MULT, 5);
    b = hpOf('m');
    useGameStore.getState().damageEnemy('m', 10, false, false, false, null, 'ghost');
    expect(b - hpOf('m')).toBeCloseTo(10 * SCAN_MARK_RANGED_MULT, 5);
  });
  it('印の無い敵は従来どおり(×1)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 300, 0, 'u', false)] });
    const b = hpOf('u');
    useGameStore.getState().damageEnemy('u', 10, false, false, false, 'gun', 'player');
    expect(b - hpOf('u')).toBe(10);
  });
  it('カウンターの反撃・打ち返した弾には掛からない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 300, 0, 'm', true)] });
    let b = hpOf('m');
    useGameStore.getState().damageEnemy('m', 10, false, true, false, 'other', 'player', 'counter');
    expect(b - hpOf('m')).toBe(10);
    b = hpOf('m');
    useGameStore.getState().damageEnemy('m', 10, false, false, false, 'other', 'player', 'reflect');
    expect(b - hpOf('m')).toBe(10);
  });
  it('紫の報酬(applyBrokenGunReward)が働く時は掛からない', () => {
    setup();
    const gt = useGameStore.getState().gameTime;
    const e = enemyAt('zombie', 300, 0, 'p', true);
    e.colorTier = 'red'; // 体勢値を持つ型
    e.bossFullStunUntil = gt + 5000;
    e.bossBreakRewardRemaining = 100000;
    useGameStore.setState({ enemies: [e] });
    const b = hpOf('p');
    useGameStore.getState().damageEnemy('p', 10, false, false, false, 'gun', 'player');
    expect(b - hpOf('p')).toBe(10 + 10 * 4); // 報酬そのまま(×1.6 を掛けない)
  });
  it('呼び手が「印を使った」旗を渡したら掛からない(近接の二重掛けを防ぐ)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 300, 0, 'm', true)] });
    const b = hpOf('m');
    useGameStore.getState().damageEnemy('m', 10, false, false, false, 'other', 'player', null, 1, 'melee', undefined, true);
    expect(b - hpOf('m')).toBe(10);
  });
});

describe('§7-6 スキャンを持っている間、ストライカーの ×1.5 が付かない', () => {
  it('弾が全部 0 でも、スキャンセンサーを構えていれば ×1', () => {
    setup('rogue');
    const scan = createWeapon(SCAN_WEAPON_KEY);
    useGameStore.setState(st => ({
      player: {
        ...st.player,
        weapons: [scan, ...st.player.weapons.filter(w => w.isMelee)],
        activeWeaponId: scan.id,
        ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0, ammoGlauncher: 0,
      },
    }));
    expect(strikerMeleeMult(useGameStore.getState().player)).toBe(1);
  });
  it('(対照)スキャンセンサー以外の銃が弾切れなら従来どおり ×1.5', () => {
    setup('rogue');
    useGameStore.setState(st => ({
      player: {
        ...st.player,
        weapons: st.player.weapons.map(w => (w.isMelee ? w : { ...w, magazine: 0 })),
        ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0, ammoGlauncher: 0,
      },
    }));
    expect(strikerMeleeMult(useGameStore.getState().player)).toBe(1.5);
  });
});

describe('§4 弾切れとみなさない/ほかが全部弾切れならスキャンへ持ち替える', () => {
  it('スキャンを構えている間は自動で持ち替えない', () => {
    setup();
    const scan = createWeapon(SCAN_WEAPON_KEY);
    const sg = { ...createWeapon('shotgun-t1'), magazine: 3 };
    useGameStore.setState(st => ({ player: { ...st.player, weapons: [scan, sg, ...st.player.weapons.filter(w => w.isMelee)], activeWeaponId: scan.id } }));
    useGameStore.getState().autoSwitchIfDry();
    expect(useGameStore.getState().player.activeWeaponId).toBe(scan.id);
  });
  it('構えた銃が弾切れ(予備も0)で、ほかに撃てる銃が無ければスキャンへ', () => {
    setup();
    const scan = createWeapon(SCAN_WEAPON_KEY);
    const sg = { ...createWeapon('shotgun-t1'), magazine: 0 };
    useGameStore.setState(st => ({
      player: { ...st.player, weapons: [sg, scan, ...st.player.weapons.filter(w => w.isMelee)], activeWeaponId: sg.id, ammoShotgun: 0, ammoHandgun: 0 },
    }));
    useGameStore.getState().autoSwitchIfDry();
    expect(useGameStore.getState().player.activeWeaponId).toBe(scan.id);
  });
});

describe('品質監査#9: 数字の倍率メモは敵の id で渡す(隣の敵に付かない・残らない)', () => {
  it('別の敵の id では掛からず、同じ id で掛かる。使ったメモは消え、残りはフレーム頭で捨てる', async () => {
    const { clearScanMarkNumberNotes, scanMarkNumberNoteCount } = await import('./gameStore');
    setup();
    clearScanMarkNumberNotes(); // 前のテストの残り(このテストでは「フレームの頭」に当たる)
    useGameStore.setState({ enemies: [enemyAt('zombie', 300, 0, 'a', true), enemyAt('zombie', 330, 0, 'b', false)], effects: [] });
    const st = useGameStore.getState();
    st.damageEnemy('a', 10, false, false, false, 'gun', 'player');
    expect(scanMarkNumberNoteCount()).toBe(1);
    st.spawnDamageNumber(0, 0, 10, false, { enemyId: 'b' });
    const n1 = useGameStore.getState().effects.at(-1) as { value: number; outline?: number };
    expect(n1.value).toBe(10);
    expect(n1.outline).toBeUndefined();
    st.spawnDamageNumber(0, 0, 10, false, { enemyId: 'a' });
    const n2 = useGameStore.getState().effects.at(-1) as { value: number; outline?: number };
    expect(n2.value).toBe(16);
    expect(n2.outline).toBeDefined();
    expect(scanMarkNumberNoteCount()).toBe(0);
    st.damageEnemy('a', 10, false, false, false, 'gun', 'player');
    clearScanMarkNumberNotes();
    expect(scanMarkNumberNoteCount()).toBe(0);
  });
});

describe('品質監査#14+社長決定2026-10-18: 気絶中の即死は枠を使わない/強個体の3倍とバッシュは印の倍率を受けて枠を使う', () => {
  it('一番近い印付きが気絶中の雑魚(即死)なら、次に近い印付きが ×2.75', () => {
    setup();
    now += 5000;
    const plain = swingDamage([enemyAt('zombie', 30, 0, 'solo', false)], 'solo');
    now += 5000;
    const stunned = enemyAt('zombie', 15, 0, 'stunned', true);
    stunned.stunUntil = useGameStore.getState().gameTime + 5000;
    useGameStore.setState(st => ({ enemies: [stunned, enemyAt('zombie', -50, 0, 'second', true)], player: { ...st.player, counterCooldownEnd: 0 } }));
    const b = hpOf('second');
    useGameStore.getState().triggerCounter();
    expect((b - hpOf('second')) / plain).toBeCloseTo(SCAN_MARK_MELEE_MULT.mob, 5);
  });
  const stunnedElite = (dx: number, id: string, marked: boolean): Enemy => {
    const e = enemyAt('pumpkin', dx, 0, id, marked);
    e.stunUntil = useGameStore.getState().gameTime + 5000;
    return e;
  };
  it('気絶中の強個体への3倍は、印があると ×2.75(雑魚の倍率)', () => {
    setup();
    now += 5000;
    const plain = swingDamage([stunnedElite(25, 'el', false)], 'el');
    now += 5000;
    const marked = swingDamage([stunnedElite(25, 'el', true)], 'el');
    expect(plain).toBeGreaterThan(0);
    expect(marked / plain).toBeCloseTo(SCAN_MARK_MELEE_MULT.mob, 5);
  });
  it('気絶中の強個体が一番近い印付きなら枠を使う=次に近い印付きは素のダメージ', () => {
    setup();
    now += 5000;
    const plain = swingDamage([enemyAt('zombie', -50, 0, 'solo', false)], 'solo');
    now += 5000;
    useGameStore.setState(st => ({ enemies: [stunnedElite(20, 'el', true), enemyAt('zombie', -50, 0, 'second', true)], player: { ...st.player, counterCooldownEnd: 0 } }));
    const b = hpOf('second');
    useGameStore.getState().triggerCounter();
    expect(b - hpOf('second')).toBeCloseTo(plain, 5);
  });
  // 盾(プレイヤーの右)をバッシュで右へ押し出す。掃過範囲に入った敵が「バッシュの当たり」。
  const withShield = (enemies: Enemy[]) => {
    const c = center();
    const shield = {
      id: 'sh', x: c.x + 18, y: c.y - 20, width: 10, height: 40, speed: 0, damage: 0, direction: { x: 1, y: 0 },
      weaponType: 'shield', duration: 999999, createdAt: now, passthrough: true, hitEnemies: [], hostile: false,
    } as unknown as import('../types/game').Projectile;
    useGameStore.setState(st => ({
      enemies, projectiles: [shield],
      player: { ...st.player, counterCooldownEnd: 0, lastDirection: { x: 1, y: 0 } },
    }));
  };
  it('盾のバッシュも、印があると ×2.75・枠を使う(次に近い印付きは素のダメージ)', () => {
    setup();
    now += 5000;
    withShield([enemyAt('zombie', 45, 0, 'b', false)]);
    let before = hpOf('b');
    useGameStore.getState().triggerCounter();
    const plainBash = before - hpOf('b');
    now += 5000;
    const plainSwing = swingDamage([enemyAt('zombie', 45, 0, 'b', false)], 'b');
    expect(plainBash / plainSwing).toBeCloseTo(3, 5); // 本当にバッシュの枝を通った(近接×3)
    now += 5000;
    withShield([enemyAt('zombie', 45, 0, 'b', true)]);
    before = hpOf('b');
    useGameStore.getState().triggerCounter();
    expect((before - hpOf('b')) / plainBash).toBeCloseTo(SCAN_MARK_MELEE_MULT.mob, 5);
    now += 5000;
    const plain = swingDamage([enemyAt('zombie', -60, 0, 'solo', false)], 'solo');
    now += 5000;
    withShield([enemyAt('zombie', 45, 0, 'b', true), enemyAt('zombie', -60, 0, 'second', true)]);
    const b2 = hpOf('second');
    useGameStore.getState().triggerCounter();
    expect(b2 - hpOf('second')).toBeCloseTo(plain, 5);
  });
});
