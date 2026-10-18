// research/SHIELD_BLOCK.md(シールドで技を防ぐ・第5版)の配線を、ストアを実際に動かして固定する。
// 純関数(影・40px・光線の切り)自体は src/world/shieldBlock.test.ts。ここは「どの経路で・何が起きないか」を見る:
//   ①共通路の円(40px 以内/41px)・帯の起点(横切る帯)・光線=壁(プレイヤーと守護霊)・盾が無い時は1bitも変わらない
//   ②巨人の g-quad / g-nova は防いだフレームに掛け金(giantActiveHit)を立てない
//   ③氷刃は盾に触れたら消える
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useGameStore, GIANT_QUAD_BREATH_SWEEP_RAD, GIANT_QUAD_BREATH_LENGTH, GIANT_NOVA_RADIUS_START,
} from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { noteShieldBeam, noteShieldGuard } from './gameStore';
import { splitBeamAtShield } from '../world/shieldBlock';
import { applyPumpkinBlastDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { EnemyType, Projectile, Summon } from '../types/game';

const O = 50_000;
const START_GT = 10_000_000;
const SHIELD_W = 58, SHIELD_H = 16;

const shieldAt = (cx: number, cy: number, patch: Partial<Projectile> = {}): Projectile => ({
  id: 'proj-shield-test', x: cx - SHIELD_W / 2, y: cy - SHIELD_H / 2, width: SHIELD_W, height: SHIELD_H,
  speed: 0, damage: 0, direction: { x: 0, y: -1 }, weaponType: 'shield', weaponKey: 'sub-shield',
  duration: 5000, createdAt: Date.now(), passthrough: false, hitEnemies: [], hostile: false, reflected: false,
  shieldHp: 30, shieldMaxHp: 30, shieldOwnerKind: 'player', shieldOwnerId: null,
  ...patch,
});
const pr = () => { const p = useGameStore.getState().player; return Math.max(p.width, p.height) / 2; };
const playerTop = () => { const p = useGameStore.getState().player; return p.y; };
const hp = () => useGameStore.getState().player.health;
const resolveBlast = () => applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });
const guardFx = () => useGameStore.getState().shieldGuardFx;

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
  useGameStore.setState(s => ({
    gameTime: START_GT,
    player: {
      ...s.player, x: O - s.player.width / 2, y: O - s.player.height / 2,
      health: 100, maxHealth: 100, invulnerable: false, invulnerableTime: 0, counterWindowEnd: 0,
    },
    enemies: [], projectiles: [], pumpkinBlasts: [], shieldGuardFx: [],
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('共通路(applyPumpkinBlastDamage)× 盾: 円', () => {
  // 爆心は盾の真上 300px。盾の下辺とプレイヤーの体の上辺の隙間を gap にして置く。
  const circleWithShieldGap = (gap: number, shieldPatch: Partial<Projectile> = {}) => {
    const shieldCy = playerTop() - gap - SHIELD_H / 2;
    useGameStore.setState({
      projectiles: [shieldAt(O, shieldCy, shieldPatch)],
      pumpkinBlasts: [{ x: O, y: O - 300, radius: 400, damage: 10, enemyId: 'z' }],
    });
    resolveBlast();
  };

  it('影 かつ 盾から 40px 以内なら防ぐ(ダメージ0・押し出し無し・防いだ印が積まれる)', () => {
    circleWithShieldGap(40);
    expect(hp()).toBe(100);
    expect(useGameStore.getState().player.knockbackUntil ?? 0).toBeLessThanOrEqual(0);
    expect(guardFx()).toHaveLength(1);
    // 接点 = 爆心→プレイヤーの線分が盾の矩形に入る点(盾の中心ではなく、攻撃した側の面)。
    expect(guardFx()[0]).toMatchObject({ x: O, kind: 'hit' });
    expect(guardFx()[0].y).toBeCloseTo(playerTop() - 40 - SHIELD_H);
    expect(guardFx()[0].dy).toBeGreaterThan(0.9); // 攻撃は上→下へ進む
  });
  it('41px では当たる(40px の線引き)', () => {
    circleWithShieldGap(41);
    expect(hp()).toBeLessThan(100);
    expect(guardFx()).toHaveLength(0);
  });
  it('盾が無い時は従来どおり当たる(1bitも変わらない)', () => {
    useGameStore.setState({ pumpkinBlasts: [{ x: O, y: O - 300, radius: 400, damage: 10, enemyId: 'z' }] });
    resolveBlast();
    expect(hp()).toBeLessThan(100);
    expect(guardFx()).toHaveLength(0);
  });
  it('幻影の盾(hostile)は何も止めない', () => {
    circleWithShieldGap(20, { hostile: true });
    expect(hp()).toBeLessThan(100);
  });
  it('防いだ当たりはカウンター窓が開いていてもパリィを起こさない(当たりの分岐の外=何も起きない)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, counterWindowEnd: Date.now() + 5000, counterWindowStart: Date.now() - 10 } }));
    circleWithShieldGap(20);
    expect(hp()).toBe(100);
    expect(useGameStore.getState().player.lastCounterSuccessTime ?? 0).toBe(0);
  });
});

describe('共通路 × 盾: 帯は起点で決まる(影だけ・距離なし)', () => {
  // プレイヤーを横切る水平の帯(中心=プレイヤー)。
  const bandAcross = (origin?: { x: number; y: number }) => ({
    x: O, y: O, radius: 20, damage: 10, enemyId: 'z',
    capsule: { fx: O - 150, fy: O, tx: O + 150, ty: O, halfWidth: 20 },
    ...(origin ? { origin } : {}),
  });

  it('起点(本人)とプレイヤーの間に盾があれば、距離が離れていても防ぐ', () => {
    useGameStore.setState({ projectiles: [shieldAt(O, O - 120)], pumpkinBlasts: [bandAcross({ x: O, y: O - 300 })] });
    resolveBlast();
    expect(hp()).toBe(100);
    expect(guardFx()).toHaveLength(1);
  });
  it('横に置いた盾では防げない(影ではない)', () => {
    useGameStore.setState({ projectiles: [shieldAt(O + 100, O - 60)], pumpkinBlasts: [bandAcross({ x: O, y: O - 300 })] });
    resolveBlast();
    expect(hp()).toBeLessThan(100);
  });
  it('origin を持たない帯は帯の始点(fx,fy)を起点にする', () => {
    useGameStore.setState({ projectiles: [shieldAt(O - 80, O)], pumpkinBlasts: [bandAcross()] });
    resolveBlast();
    expect(hp()).toBe(100);
  });
  it('長さ0の帯(着地)は円として扱う: 影でも盾から 41px 以上離れていれば当たる', () => {
    const shieldCy = playerTop() - 41 - SHIELD_H / 2;
    useGameStore.setState({
      projectiles: [shieldAt(O, shieldCy)],
      pumpkinBlasts: [{ x: O, y: O - 300, radius: 20, damage: 10, enemyId: 'z', capsule: { fx: O, fy: O - 300, tx: O, ty: O - 300, halfWidth: 400 } }],
    });
    resolveBlast();
    expect(hp()).toBeLessThan(100);
  });
});

describe('共通路 × 盾: 光線は壁(プレイヤーも守護霊も同じ長さ)', () => {
  // 上(O-400)から下(O+400)へ縦に走る光線。盾は O-100 に横置き。
  const beam = (extra: Record<string, unknown> = {}) => ({
    x: O, y: O, radius: 20, damage: 10, enemyId: 'z', beam: true as const,
    capsule: { fx: O, fy: O - 400, tx: O, ty: O + 400, halfWidth: 20 },
    ...extra,
  });
  const addGhostAt = (x: number, y: number) => {
    const now = Date.now();
    const ghost: Summon = {
      id: 'ghost-test', x: x - 12, y: y - 12, width: 24, height: 24, speed: 200,
      health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
      createdAt: now, lastHit: 0,
    } as never;
    const z = spawnEnemyAt('zombie', O + 2000, O + 2000, START_GT);
    z.id = 'z';
    useGameStore.setState(s => ({ summons: [...s.summons, ghost], enemies: [z, ...s.enemies] }));
  };
  const ghostHp = () => useGameStore.getState().summons.find(s => s.id === 'ghost-test')!.health;

  it('光線は盾の所で終わる: 盾の先に居るプレイヤーには当たらない', () => {
    useGameStore.setState({ projectiles: [shieldAt(O, O - 100)], pumpkinBlasts: [beam()] });
    resolveBlast();
    expect(hp()).toBe(100);
    expect(guardFx()).toHaveLength(1);
  });
  it('盾の手前(光線の元側)に居るプレイヤーには当たる', () => {
    useGameStore.setState(s => ({ player: { ...s.player, y: O - 250 - s.player.height / 2 } }));
    useGameStore.setState({ projectiles: [shieldAt(O, O - 100)], pumpkinBlasts: [beam()] });
    resolveBlast();
    expect(hp()).toBeLessThan(100);
  });
  it('盾が無ければ光線は全長のまま当たる', () => {
    useGameStore.setState({ pumpkinBlasts: [beam()] });
    resolveBlast();
    expect(hp()).toBeLessThan(100);
  });
  it('守護霊も同じ長さで切られる: 盾の先に居る守護霊には当たらない', () => {
    useGameStore.setState(s => ({ player: { ...s.player, x: O + 2000 } })); // プレイヤーは光線の外
    addGhostAt(O, O - 40);
    useGameStore.setState({ projectiles: [shieldAt(O, O - 100)], pumpkinBlasts: [beam()] });
    resolveBlast();
    expect(ghostHp()).toBe(100);
  });
  it('beam 印の無い帯は、守護霊を従来どおり巻き込む(盾が防ぐのはプレイヤーの当たりだけ)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, x: O + 2000 } }));
    addGhostAt(O, O - 40);
    useGameStore.setState({ projectiles: [shieldAt(O, O - 100)], pumpkinBlasts: [beam({ beam: undefined })] });
    resolveBlast();
    expect(ghostHp()).toBeLessThan(100);
  });
  it('盾が無ければ守護霊にも全長で当たる', () => {
    useGameStore.setState(s => ({ player: { ...s.player, x: O + 2000 } }));
    addGhostAt(O, O - 40);
    useGameStore.setState({ pumpkinBlasts: [beam()] });
    resolveBlast();
    expect(ghostHp()).toBeLessThan(100);
  });
});

describe('巨人の g-nova / g-quad × 盾: 防いだフレームは掛け金を立てない', () => {
  const tick = (gt: number, dt = 1 / 60) => {
    useGameStore.getState().setGameTime(gt);
    useGameStore.getState().updateEnemies(dt);
  };
  const blastsOf = (key: string) => useGameStore.getState().pumpkinBlasts.filter(b => b.moveKey === key);
  const giantAt = (over: Record<string, unknown>) => {
    const g = { ...spawnEnemyAt('giantbat', 0, 0, START_GT), ...over };
    g.x = O - g.width / 2; g.y = O - g.height / 2; g.id = 'g';
    g.health = 99999; g.maxHealth = 99999;
    useGameStore.setState({ enemies: [g] });
    return g;
  };
  const giant = () => useGameStore.getState().enemies.find(e => e.id === 'g')!;

  it('g-nova: 盾に防がれたフレームは当たらず giantActiveHit も立たない。盾が消えれば同じ技で当たる', () => {
    // 輪の半径は技の頭で START(=60)。プレイヤーを輪の上(ボス中心の真下 60px)へ置く。
    giantAt({ aiPhase: 'g-nova-active', aiPhaseUntil: START_GT + 5000, aiStartedAt: START_GT, giantActiveHit: false });
    useGameStore.setState(s => ({ player: { ...s.player, y: O + GIANT_NOVA_RADIUS_START - s.player.height / 2 } }));
    // 盾はボス中心とプレイヤーの間(40px 以内)。
    const pTop = playerTop();
    useGameStore.setState({ projectiles: [shieldAt(O, pTop - 10 - SHIELD_H / 2)] });
    tick(START_GT);
    expect(blastsOf('g-nova')).toHaveLength(0);
    expect(giant().giantActiveHit).toBeFalsy();
    expect(guardFx().length).toBeGreaterThan(0);
    // 陰から出た(盾が消えた)次のフレーム: 同じ技でまた当たりうる。
    useGameStore.setState({ projectiles: [], pumpkinBlasts: [] });
    tick(START_GT);
    expect(blastsOf('g-nova')).toHaveLength(1);
    expect(giant().giantActiveHit).toBe(true);
  });

  it('g-quad(ブレス): 帯の起点(ボス)から見て盾の影なら当たらず、掛け金を立てない', () => {
    // 現在角が +x を向く瞬間(bt=0)になるよう、狙い点の向きを開始角から半分戻す。
    const base = GIANT_QUAD_BREATH_SWEEP_RAD / 2;
    giantAt({
      aiPhase: 'g-quad-breath-active', aiPhaseUntil: START_GT + 5000, aiStartedAt: START_GT, giantActiveHit: false,
      aiFromX: O, aiFromY: O,
      aiTargetX: O + Math.cos(base) * 100, aiTargetY: O + Math.sin(base) * 100,
    });
    useGameStore.setState(s => ({ player: { ...s.player, x: O + 150 - s.player.width / 2 } }));
    expect(GIANT_QUAD_BREATH_LENGTH).toBeGreaterThan(150 + pr());
    useGameStore.setState({ projectiles: [shieldAt(O + 80, O)] });
    tick(START_GT);
    expect(blastsOf('g-quad')).toHaveLength(0);
    expect(giant().giantActiveHit).toBeFalsy();
    expect(guardFx().length).toBeGreaterThan(0);
    useGameStore.setState({ projectiles: [], pumpkinBlasts: [] });
    tick(START_GT);
    expect(blastsOf('g-quad')).toHaveLength(1);
    expect(giant().giantActiveHit).toBe(true);
  });

  it('盾が無い時の g-nova は従来どおり1回当たって掛け金が立つ', () => {
    giantAt({ aiPhase: 'g-nova-active', aiPhaseUntil: START_GT + 5000, aiStartedAt: START_GT, giantActiveHit: false });
    useGameStore.setState(s => ({ player: { ...s.player, y: O + GIANT_NOVA_RADIUS_START - s.player.height / 2 } }));
    tick(START_GT);
    expect(blastsOf('g-nova')).toHaveLength(1);
    expect(giant().giantActiveHit).toBe(true);
    expect(guardFx()).toHaveLength(0);
  });
});

describe('飛ぶ物(氷刃・骨刃・羽根)× 盾: 触れたら消える', () => {
  const blade = (x: number, y: number) => ({
    id: 'sb1', x, y, angle: 0, launchAt: 0, launched: true, vx: 700, vy: 0, expireAt: START_GT + 5000, enemyId: 'z', visual: 'ice' as const,
  });
  const tick = () => {
    useGameStore.getState().setGameTime(START_GT);
    useGameStore.getState().updateEnemies(1 / 60);
  };
  const setupOwner = () => {
    const z = spawnEnemyAt('zombie', O + 3000, O + 3000, START_GT);
    z.id = 'z'; z.health = 99999;
    useGameStore.setState({ enemies: [z] });
  };

  it('盾の矩形に触れた刃は消える(ダメージ・爆発は起きない)', () => {
    setupOwner();
    useGameStore.setState({ skadiIceBlades: [blade(O - 95, O)], projectiles: [shieldAt(O - 60, O)] });
    tick();
    expect(useGameStore.getState().skadiIceBlades).toHaveLength(0);
    expect(useGameStore.getState().pumpkinBlasts.filter(b => b.enemyId === 'z')).toHaveLength(0);
    expect(hp()).toBe(100);
    expect(guardFx().length).toBeGreaterThan(0);
  });
  it('盾が無ければ同じ位置の刃は飛び続ける', () => {
    setupOwner();
    useGameStore.setState({ skadiIceBlades: [blade(O - 95, O)] });
    tick();
    expect(useGameStore.getState().skadiIceBlades).toHaveLength(1);
    expect(guardFx()).toHaveLength(0);
  });
  it('幻影の盾(hostile)では消えない', () => {
    setupOwner();
    useGameStore.setState({ skadiIceBlades: [blade(O - 95, O)], projectiles: [shieldAt(O - 60, O, { hostile: true })] });
    tick();
    expect(useGameStore.getState().skadiIceBlades).toHaveLength(1);
  });
});

describe('防いだ印(shieldGuardFx)', () => {
  it('resetGame で空に戻る', () => {
    useGameStore.setState({ shieldGuardFx: [{ x: 1, y: 2, dx: 0, dy: 1, kind: 'hit', cost: 0 }], shieldBreakFx: [{ x: 1, y: 2, w: 3, h: 4 }] });
    useGameStore.getState().resetGame('assault');
    expect(useGameStore.getState().shieldGuardFx).toEqual([]);
    expect(useGameStore.getState().shieldBreakFx).toEqual([]);
  });
});

// research/SHIELD_BLOCK.md §8(盾の代償・社長 2026-10-18 訂正): ボス級の技を防ぐごとに耐久10 / 強個体・雑魚は削れない / 光線は毎秒10。
describe('盾の代償: 防いだ技の区分ごとに耐久が削れる', () => {
  const shieldHpNow = () => useGameStore.getState().projectiles.find(p => p.weaponType === 'shield')?.shieldHp;
  const blastBy = (type: EnemyType) => {
    const e = spawnEnemyAt(type, O + 3000, O + 3000, START_GT);
    e.id = 'atk';
    useGameStore.setState({
      enemies: [e],
      projectiles: [shieldAt(O, playerTop() - 20 - SHIELD_H / 2)],
      pumpkinBlasts: [{ x: O, y: O - 300, radius: 400, damage: 10, enemyId: 'atk' }],
    });
    resolveBlast();
  };
  it('ボス級(裏ボス・城ボス・賞金首・幻影・死神)の技は1回 10 削れる', () => {
    for (const t of ['thor', 'giantbat', 'bounty-melee', 'guardian-phantom', 'reaper'] as const) {
      useGameStore.setState({ shieldGuardFx: [], pumpkinBlasts: [] });
      blastBy(t);
      expect(hp(), t).toBe(100); // 防いだ
      expect(shieldHpNow(), t).toBe(20);
    }
  });
  it('強個体(パンプキン・削岩型・伐採人・ハンター)と雑魚は防いでも削れない(0)', () => {
    for (const t of ['pumpkin', 'driller', 'logger', 'lab-zombie-3', 'hunter', 'zombie'] as const) {
      blastBy(t);
      expect(hp(), t).toBe(100);
      expect(shieldHpNow(), t).toBe(30);
    }
  });
  it('耐久が尽きた盾は消え、倒れる演出が積まれる。次の技は壁なしで当たる(技は止めない)', () => {
    useGameStore.setState({ enemies: [], projectiles: [shieldAt(O, playerTop() - 20 - SHIELD_H / 2, { shieldHp: 10 })] });
    const e = spawnEnemyAt('thor', O + 3000, O + 3000, START_GT); e.id = 'atk';
    useGameStore.setState({ enemies: [e], pumpkinBlasts: [{ x: O, y: O - 300, radius: 400, damage: 10, enemyId: 'atk' }] });
    resolveBlast();
    expect(hp()).toBe(100); // この1回は防いだ
    expect(useGameStore.getState().projectiles.some(p => p.weaponType === 'shield')).toBe(false);
    expect(useGameStore.getState().shieldBreakFx).toHaveLength(1);
    useGameStore.setState({ pumpkinBlasts: [{ x: O, y: O - 300, radius: 400, damage: 10, enemyId: 'atk' }] });
    resolveBlast();
    expect(hp()).toBeLessThan(100); // 盾が無ければ当たる
  });
  it('防いだ時は耐久の赤い被弾フラッシュ(shieldHitAt)を書かず、押し戻しの印(shieldGuardAt/向き)を書く', () => {
    blastBy('thor');
    const sp = useGameStore.getState().projectiles.find(p => p.weaponType === 'shield')!;
    expect(sp.shieldHitAt).toBeUndefined();
    expect(sp.shieldGuardAt).toBeGreaterThan(0);
    expect(sp.shieldGuardDirY).toBeGreaterThan(0.9);
  });
  it('列が満杯でも耐久は必ず削れる', () => {
    useGameStore.setState({ projectiles: [shieldAt(O, O - 100)], shieldGuardFx: Array.from({ length: 12 }, () => ({ x: 0, y: 0, dx: 0, dy: 1, kind: 'hit' as const, cost: 0 })) });
    noteShieldGuard({ x: O - 29, y: O - 108, width: 58, height: 16 }, { attacker: 'thor' });
    expect(shieldHpNow()).toBe(20);
    expect(useGameStore.getState().shieldGuardFx).toHaveLength(12);
  });
});

describe('光線(壁)の代償: 当たっている間 毎秒10 / 割れた次のフレームから光線は当たる', () => {
  const tick = (gt: number, dt = 1 / 60) => {
    useGameStore.getState().setGameTime(gt);
    useGameStore.getState().updateEnemies(dt);
  };
  // 巨人 g-sweepbeam: 中心 (O,O)・現在角が +x を向く瞬間(st=0 で base-60° = 0 → base = 60°)。縦長の盾を +x 側に置く。
  const sweepSetup = (shieldPatch: Partial<Projectile> = {}) => {
    const g = { ...spawnEnemyAt('giantbat', 0, 0, START_GT) };
    g.x = O - g.width / 2; g.y = O - g.height / 2; g.id = 'g'; g.health = 99999; g.maxHealth = 99999;
    Object.assign(g, {
      aiPhase: 'g-sweepbeam-active', aiPhaseUntil: START_GT + 5000, aiStartedAt: START_GT, giantActiveHit: false,
      aiFromX: O, aiFromY: O, aiTargetX: O + Math.cos(Math.PI / 3) * 100, aiTargetY: O + Math.sin(Math.PI / 3) * 100,
    });
    useGameStore.setState(s => ({
      enemies: [g],
      player: { ...s.player, x: O + 300 - s.player.width / 2, y: O - s.player.height / 2 },
      // 縦長の盾(幅16×高さ108)が光線を横切る。影は盾の長さぶん(±54)で光線の幅(±30)より広い=丸ごと止まる。
      projectiles: [shieldAt(O + 200, O, { x: O + 200 - 8, y: O - 54, width: 16, height: 108, ...shieldPatch })],
    }));
  };
  const blastsOf = () => useGameStore.getState().pumpkinBlasts.filter(b => b.moveKey === 'g-sweepbeam');
  const shieldHpNow = () => useGameStore.getState().projectiles.find(p => p.weaponType === 'shield')?.shieldHp;

  it('誰も後ろに居なくても毎フレーム dt で削れ、割れたら次のフレームから光線が当たる', () => {
    sweepSetup({ shieldHp: 1 });
    useGameStore.setState(s => ({ player: { ...s.player, y: O + 2000 } })); // プレイヤーは光線の外(後ろに誰も居ない)
    tick(START_GT);
    const afterOne = shieldHpNow()!;
    expect(afterOne).toBeCloseTo(1 - 10 / 60, 3); // 1フレーム = 10 × (1/60)
    let frames = 1;
    while (shieldHpNow() !== undefined && frames < 60) { tick(START_GT); frames++; }
    expect(frames).toBeGreaterThanOrEqual(6); // 1 / (10/60) = 6フレーム(浮動小数の端で7になることもある)
    expect(frames).toBeLessThanOrEqual(7);
    expect(useGameStore.getState().projectiles.some(p => p.weaponType === 'shield')).toBe(false);
    expect(useGameStore.getState().shieldBreakFx.length).toBe(1);
    // 次のフレーム: 壁が無い=光線が伸びて、光線の上に居るプレイヤーに当たる。
    useGameStore.setState(s => ({ player: { ...s.player, y: O - s.player.height / 2 }, pumpkinBlasts: [] }));
    tick(START_GT);
    expect(blastsOf()).toHaveLength(1);
  });
  it('盾の後ろのプレイヤーには当たらず、光線が当たっている間 耐久が削れ続ける', () => {
    sweepSetup({ shieldHp: 30 });
    for (let i = 0; i < 30; i++) tick(START_GT);
    expect(blastsOf()).toHaveLength(0);
    expect(shieldHpNow()!).toBeCloseTo(30 - 30 * (10 / 60), 2); // 30フレーム = 0.5秒 = 5
  });
  it('光線が盾より太い(影の外の縁)と、縁にかかるプレイヤーには当たる', () => {
    // 盾を細く短く(高さ30=影 ±15)。プレイヤー(半径 ≥ 14)の中心を光線の縁(+22)へ寄せる=身体が影の外へはみ出す。
    sweepSetup({ shieldHp: 30, y: O - 15, height: 30 });
    useGameStore.setState(s => ({ player: { ...s.player, y: O + 22 - s.player.height / 2 } }));
    tick(START_GT);
    expect(blastsOf()).toHaveLength(1);
  });
  it('noteShieldBeam: 複数本は別々に削る(2本=2倍)', () => {
    useGameStore.setState({ projectiles: [shieldAt(O, O)] });
    const sh = { x: O - 8, y: O - 54, width: 16, height: 108 };
    const sp = splitBeamAtShield(O - 300, O, O + 300, O, 30, sh, true)!;
    noteShieldBeam(sh, sp, 1 / 60, 'mimir');
    noteShieldBeam(sh, sp, 1 / 60, 'mimir');
    expect(useGameStore.getState().projectiles[0].shieldHp).toBeCloseTo(30 - 2 * (10 / 60), 3);
  });
});

describe('継続技(g-nova)は1回の技で耐久を1度だけ削る', () => {
  it('同じ技が毎フレーム防がれても 10 だけ', () => {
    const g = { ...spawnEnemyAt('giantbat', 0, 0, START_GT) };
    g.x = O - g.width / 2; g.y = O - g.height / 2; g.id = 'g'; g.health = 99999; g.maxHealth = 99999;
    Object.assign(g, { aiPhase: 'g-nova-active', aiPhaseUntil: START_GT + 5000, aiStartedAt: START_GT, giantActiveHit: false });
    useGameStore.setState(s => ({
      enemies: [g],
      player: { ...s.player, y: O + GIANT_NOVA_RADIUS_START - s.player.height / 2 },
    }));
    const pTop = playerTop();
    useGameStore.setState({ projectiles: [shieldAt(O, pTop - 10 - SHIELD_H / 2)] });
    for (let i = 0; i < 5; i++) { useGameStore.getState().setGameTime(START_GT); useGameStore.getState().updateEnemies(1 / 60); }
    expect(useGameStore.getState().projectiles.find(p => p.weaponType === 'shield')!.shieldHp).toBe(20);
  });
});
