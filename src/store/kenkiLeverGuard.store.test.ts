// ★拳鬼(格闘の幻影)のレバーガード(research/BRAWLER_PHANTOM.md §16-10・社長指示2026-11-10「幻影たちにも入れたいので拳鬼にも入れる。弾もガード可能」)
//  をストアと実際の制御(phantomTick)で動かして固める。
//  ・拳鬼の「レバー」(その tick に頭脳が決めた歩く向き)が、攻撃してきた相手(プレイヤー・弾の来た側)から離れる向き → ダメージ半減・浮かない・小さい押し
//  ・動作の最中(段・技)・歩いていない時・相手の方へ歩いている時 → 普通に食らう
//  ・構え(今ある受け)・被弾無敵が先、レバーガードは後
//  ・技ポイント+1(近接で食らった時だけ)は今の規則のまま
//  ・受けた後: 小さく押される・腕で受ける影・絵と音(プレイヤーのガードと同じ物を拳鬼の位置に)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from '../utils/phantomTick';
import { setPhantomIdentity } from '../utils/phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { kenkiRetreatStart, kenkiRetreating } from '../utils/kenkiRetreat';
import { brawlerStandAt, brawlerStartAttack, initialBrawlerState } from '../utils/brawler';
import { BRAWLER_LEVER_GUARD_PUSH_PX, brawlerLeverGuardDamage } from '../utils/brawlerLeverGuard';
import { isDirectGunWeaponKey } from '../utils/weaponUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';
setBrawlerTempoAll(1.0);

let now = 9_000_000;
const START_GT = 10_000_000;
const ORIGIN = 50_000;
const K = 'kenki';

/** 拳鬼を置く(プレイヤーは拳鬼の右 dx の所)。制御は回さない=書いた欄がそのまま残る。 */
const setup = (dx = 60, over: Partial<Enemy> = {}) => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  const k = uniquePhantomSpec('brawler');
  setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
  Object.assign(e, { id: K, phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, health: 100000, maxHealth: 100000, dormant: false, bossState: 'chase' }, over);
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true },
    enemies: [e], projectiles: [], pumpkinBlasts: [], gameTime: START_GT,
    player: {
      ...s.player, x: e.x + e.width / 2 + dx - s.player.width / 2, y: e.y + e.height / 2 - s.player.height / 2, health: 99999, maxHealth: 99999,
      invulnerable: false, invulnerableTime: 0, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: -1, y: 0 },
    },
  }));
};
const en = () => useGameStore.getState().enemies.find(e => e.id === K)!;
const lever = (x: number | undefined, y: number | undefined) =>
  useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === K ? { ...e, gpLeverX: x, gpLeverY: y } : e)) }));
type Mv = 's1' | 's3' | 's4';
/** プレイヤーの格闘の当たり(段の当たりと同じ道=triggerCounter の格闘の枝)。 */
const hit = (move: Mv) => useGameStore.getState().triggerCounter(undefined, {
  targetIds: [K], mult: 1, brawler: true, stunMs: move === 's1' ? 90 : 150, postureMult: 0.01, pressedAt: Date.now(),
  kb: move === 's3' ? { kind: 'normal' } : { kind: 'none' }, ...(move === 's4' ? { lift: true } : {}), combo: { move },
});
/** プレイヤーの銃弾(飛んできた向き dir)。 */
const shot = (dir: { x: number; y: number } | undefined, amount = 50) =>
  useGameStore.getState().damageEnemy(K, amount, false, false, false, 'gun', 'player', null, 1, 'bullet', undefined, dir ? { dir } : undefined);
const lost = (f: () => void): number => { const h0 = en().health; f(); return h0 - en().health; };

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('拳鬼がレバーガードで受ける(関所と当たり)', () => {
  it('近接: プレイヤーから離れる向きへ歩こうとしている時に食らう → ダメージ半分・受けた打刻が付く・技ポイントの打刻(近接で食らった)は今どおり', () => {
    setup(60);
    const full = lost(() => hit('s1'));
    expect(full).toBeGreaterThan(0);
    expect(en().gpLeverGuardAt).toBeUndefined();

    setup(60);
    lever(-1, 0); // プレイヤーは右=離れる向きは左
    const half = lost(() => hit('s1'));
    expect(half).toBeCloseTo(full / 2, 5);
    expect(en().gpLeverGuardAt).toBe(START_GT);
    expect(en().gpLeverGuardDirX).toBeCloseTo(-1); // 攻撃の進む向き=押される向き(プレイヤーから離れる向き)
    expect(en().gpMeleeHurtAt).toBe(START_GT);     // 食らった時の技ポイント+1・台本の打ち切りは今の規則のまま
  });
  it('浮かない: 3段目・4段目(浮かせの段)を食らっても浮かない・押されない・固まらない(レバーなしなら浮く)', () => {
    for (const mv of ['s3', 's4'] as const) {
      setup(60);
      hit(mv);
      expect((en().brLiftUntil ?? 0) > now, `${mv} 普通`).toBe(true); // 普通は浮く(ボス級も浮く=重い)

      setup(60);
      lever(-1, 0);
      const d = lost(() => hit(mv));
      expect(d).toBeGreaterThan(0);
      expect(en().brLiftUntil ?? 0, `${mv} ガード`).toBeLessThanOrEqual(now);
      expect(en().liftUntil ?? 0).toBeLessThanOrEqual(now);
      expect(en().brHoldUntil ?? 0).toBeLessThanOrEqual(now);       // 食らいの固まりも付かない
      expect((en().knockbackUntil ?? 0) > now).toBe(false);          // 元の押しも付かない(小さい押しは制御が出す)
      expect(en().gpLeverGuardAt).toBe(START_GT);
    }
  });
  it('成立しない: 歩いていない/動作の最中(レバーが下りている)・プレイヤーの方へ歩いている・横へ歩いている', () => {
    setup(60);
    const full = lost(() => hit('s1'));
    for (const [x, y] of [[undefined, undefined], [1, 0], [0, 1], [0, -1]] as const) {
      setup(60);
      lever(x, y);
      expect(lost(() => hit('s1')), `lever ${x},${y}`).toBeCloseTo(full, 5);
      expect(en().gpLeverGuardAt).toBeUndefined();
    }
    // 斜め後ろ(左右60°まで)は成立
    setup(60);
    lever(-Math.cos(Math.PI / 4), Math.sin(Math.PI / 4));
    expect(lost(() => hit('s1'))).toBeCloseTo(full / 2, 5);
  });
  it('弾もガードできる: 弾の飛んできた向き(撃ち主の側から離れる向き)へ歩こうとしていれば半減・逆なら普通', () => {
    setup(300);
    const full = lost(() => shot({ x: -1, y: 0 })); // 右のプレイヤーから左の拳鬼へ飛ぶ弾
    expect(full).toBeGreaterThan(1);

    setup(300);
    lever(-1, 0);
    expect(lost(() => shot({ x: -1, y: 0 }))).toBe(brawlerLeverGuardDamage(full));
    expect(en().gpLeverGuardAt).toBe(START_GT);
    expect(en().gpMeleeHurtAt).toBeUndefined(); // 弾では技ポイントは貯まらない(§16-8 のまま)

    setup(300);
    lever(1, 0); // 弾へ向かって歩いている
    expect(lost(() => shot({ x: -1, y: 0 }))).toBe(full);

    // 向きは弾の飛んできた向きで見る(撃ち主の今の位置ではない): 上から来た弾は、下へ歩いていればガード
    setup(300);
    lever(0, 1);
    expect(lost(() => shot({ x: 0, y: 1 }))).toBe(brawlerLeverGuardDamage(full));
  });
  it('出どころが分からない当たり(爆発の広がり・持続ダメージ・仲間の当たり)はガードにならない', () => {
    setup(300);
    lever(-1, 0);
    const g = useGameStore.getState();
    const full = lost(() => g.damageEnemy(K, 50, true)); // 爆発
    expect(en().gpLeverGuardAt).toBeUndefined();
    expect(full).toBeGreaterThan(0);

    setup(300);
    lever(-1, 0);
    useGameStore.getState().damageEnemy(K, 50, false, false, false, 'dot'); // 持続ダメージ
    expect(en().gpLeverGuardAt).toBeUndefined();

    setup(300);
    lever(-1, 0);
    useGameStore.getState().damageEnemy(K, 50, false, false, false, 'other', 'dog'); // 犬
    expect(en().gpLeverGuardAt).toBeUndefined();
  });
  it('今ある受けが先: 構えの窓の中の近接はカウンター(ダメージ0・ガードには数えない)/被弾無敵の中の弾は弾く(ガードには数えない)', () => {
    setup(60, { gpGuardUntil: START_GT + 1000 });
    lever(-1, 0);
    expect(lost(() => hit('s1'))).toBe(0);
    expect(en().gpParriedAt).toBe(START_GT);
    expect(en().gpLeverGuardAt).toBeUndefined();

    setup(300, { gpHitAt: START_GT - 100 }); // 直前に被弾=被弾無敵の中
    lever(-1, 0);
    expect(lost(() => shot({ x: -1, y: 0 }))).toBe(0);
    expect(en().gpLeverGuardAt).toBeUndefined();
  });
});

describe('拳鬼の制御(phantomTick): レバーを書く・受けた後の動きと絵', () => {
  /** 制御を回す(拳鬼=左・プレイヤー=右 dx)。ランダムは 0.999=構え・下がりを自分からは選ばない。 */
  const run = (dx: number) => {
    setup(dx);
    let gt = START_GT;
    const st = createPhantomTickState();
    const step = (ms = 16): void => {
      gt += ms; now += ms;
      useGameStore.setState({ gameTime: gt });
      runPhantomTick(en(), st, gt, ms / 1000, 1, now, NOOP_PHANTOM_SFX, () => 0.999);
    };
    return { step, st, gt: () => gt };
  };
  it('下がっている間: プレイヤーから離れる向きへ歩き、その向きがレバーになる・下がり終わるとレバーは詰める向きへ戻る', () => {
    const h = run(300);
    h.step();
    const mind = h.st.brawler!.mind;
    kenkiRetreatStart(mind, h.gt(), 400, null);
    const x0 = en().x;
    for (let i = 0; i < 12; i++) h.step();
    expect(en().x).toBeLessThan(x0 - 3);            // 左(プレイヤーから離れる向き)へ歩いた
    expect(en().gpLeverX).toBeCloseTo(-1, 3);
    expect(en().gpLeverY).toBeCloseTo(0, 3);
    for (let i = 0; i < 30; i++) h.step();          // 400ms を過ぎる
    expect(kenkiRetreating(mind, h.gt())).toBe(false);
    expect((en().gpLeverX ?? 1)).toBeGreaterThan(0); // 詰める向き(プレイヤーの方)へ戻るか、動作に入って下りている
  });
  it('動作の最中(段)はレバーが下りている=ガードは張れない', () => {
    const h = run(40);
    let sawBusyNoLever = false;
    for (let i = 0; i < 120; i++) {
      h.step();
      const b = en().phantomBrawler;
      if (b && b.phase === 'attack') { expect(en().gpLeverX).toBeUndefined(); sawBusyNoLever = true; }
    }
    expect(sawBusyNoLever).toBe(true);
  });
  it('弾が来る時の3つ目の手: 下がってガードの手を引いた弾には、着弾が近づくと弾の飛んできた向きへ下がる(反応の下限の後)', () => {
    setup(400);
    let gt = START_GT;
    const st = createPhantomTickState();
    // 乱数: 弾の対処の割合は何でもよい → 「下がってガード」を引く(0)。以後は 0.999。
    let seq: number[] = [];
    const rand = () => (seq.length > 0 ? seq.shift()! : 0.999);
    const step = (ms = 16) => { gt += ms; now += ms; useGameStore.setState({ gameTime: gt }); runPhantomTick(en(), st, gt, ms / 1000, 1, now, NOOP_PHANTOM_SFX, rand); };
    step();
    const e0 = en();
    const gunKey = useGameStore.getState().player.weapons.find(w => isDirectGunWeaponKey(w.key))?.key ?? useGameStore.getState().player.weapons[0]?.key;
    expect(isDirectGunWeaponKey(gunKey)).toBe(true);
    seq = [0.5, 0]; // 弾の対処の割合(何でもよい)→「下がってガード」を引く
    // 右のプレイヤーの側から左の拳鬼へ飛ぶ弾(着弾まで約300ms)。撃ってから反応の下限(250ms)より古い。
    useGameStore.setState({ projectiles: [{
      id: 'pb', x: e0.x + e0.width / 2 + 150 - 4, y: e0.y + e0.height / 2 - 4, width: 8, height: 8, speed: 500, damage: 10,
      direction: { x: -1, y: 0 }, weaponType: 'handgun', weaponKey: gunKey, hostile: false, reflected: false, passthrough: false, hitEnemies: [],
      duration: 5000, createdAt: now - 400, critChance: 0,
    } as never] });
    step();
    const mind = st.brawler!.mind;
    expect(kenkiRetreating(mind, gt)).toBe(true);
    expect(mind.retreatDir).toEqual({ x: -1, y: 0 }); // 弾の飛んできた向き
    step(); step();
    expect(en().gpLeverX).toBeCloseTo(-1, 3);
  });
  it('受けた後: 小さく押され(約40px・押される向き=攻撃の進む向き)、腕で受ける影が出て、絵(火花・輪・砂埃)が拳鬼の位置に出る', () => {
    const h = run(300);
    h.step();
    kenkiRetreatStart(h.st.brawler!.mind, h.gt(), 400, null);
    for (let i = 0; i < 6; i++) h.step();
    expect(en().gpLeverX).toBeCloseTo(-1, 3);
    const hp0 = en().health;
    useGameStore.setState({ effects: [] });
    shot({ x: -1, y: 0 });
    expect(en().gpLeverGuardAt).toBe(h.gt());
    expect(hp0 - en().health).toBe(brawlerLeverGuardDamage(50 * 0.2)); // 対人倍率の後を半減(切り上げ)
    const x0 = en().x;
    h.step();
    // 影(構えの腕ガードの影を短く)・絵と音の印
    const b = en().phantomBrawler!;
    expect(b.leverGuardAt).toBe(h.gt());
    expect(b.leverGuardDirX).toBeCloseTo(1); // 相手(右)の方を向く
    expect(brawlerStandAt(b, h.gt() + 40)?.lever).toBe(true);
    const fx = useGameStore.getState().effects.map(e => JSON.stringify(e)).join('|');
    expect(fx).toContain('vfx/spark_04');
    expect(fx).toContain('fx/dust-puff');
    expect(fx).not.toContain('Counter!');
    // 押されている間はレバーが下りている(続けては張れない)・下がりはここで打ち切り
    expect(en().gpLeverX).toBeUndefined();
    expect(kenkiRetreating(h.st.brawler!.mind, h.gt())).toBe(false);
    for (let i = 0; i < 12; i++) h.step(); // 160ms+
    const moved = x0 - en().x;
    expect(moved).toBeGreaterThan(BRAWLER_LEVER_GUARD_PUSH_PX * 0.85);
    expect(moved).toBeLessThan(BRAWLER_LEVER_GUARD_PUSH_PX * 1.25);
  });
  it('固まっている間(格闘の食らいの固まり)はレバーが下りる', () => {
    const h = run(300);
    h.step();
    kenkiRetreatStart(h.st.brawler!.mind, h.gt(), 400, null);
    for (let i = 0; i < 4; i++) h.step();
    expect(en().gpLeverX).toBeCloseTo(-1, 3);
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === K ? { ...e, brHoldUntil: now + 300 } : e)) }));
    h.step();
    expect(en().gpLeverX).toBeUndefined();
  });
  it('動作の最中の拳鬼に書いた古いレバーは使われない(段を始めた tick にレバーを下ろす)', () => {
    // 段の最中の状態を直接置いて制御を回す=レバーは下りる。
    const h = run(40);
    h.step();
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === K
      ? { ...e, gpLeverX: -1, gpLeverY: 0, phantomBrawler: { ...brawlerStartAttack(e.phantomBrawler ?? initialBrawlerState(), 1, h.gt(), false), dirX: 1, dirY: 0 } } : e)) }));
    h.step();
    expect(en().gpLeverX).toBeUndefined();
  });
});
