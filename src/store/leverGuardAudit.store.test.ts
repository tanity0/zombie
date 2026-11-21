// ★格闘のレバーガードの検収監査(2026-11-10)で詰めた所を固める(research/BRAWLER.md §12-1c「検収監査で詰めた所」・BRAWLER_PHANTOM.md §16-10)。
//  1. 拳鬼の秘奥義の締め(技キー brawler-secret-land)も半減だけ/秘奥義は1発ガードで受けたら残り(連撃と締め)も半減だけ
//  2. 拳鬼が爆発(爆心から離れる向き)と、守護霊・犬・軍人の当たり(相手の位置から離れる向き)をガードできる
//  3. プレイヤーがレバーガードで受けた拳鬼の攻撃は「当たっていない」扱い(台本は打ち切り・秘奥義は始まらない)
//  4. 床と置かれた火(グレンの血溜まり・ジブリルのランタン火)は対象外/1回で終わる爆発は今どおりガードできる
//  5. 拳鬼が下がっている間に来た弾を、何もせずには食らわない
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, leverGuardCount, type PumpkinBlast } from './gameStore';
import { applyGlenFloorDamage, applyPumpkinBlastDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { tickAngelBossFires } from '../utils/angelBossTick';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from '../utils/phantomTick';
import { setPhantomIdentity } from '../utils/phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { initialBrawlerState } from '../utils/brawler';
import { isDirectGunWeaponKey } from '../utils/weaponUtils';
import { BRAWLER_LEVER_GUARD_CARRY_MS, brawlerLeverGuardDamage } from '../utils/brawlerLeverGuard';
import { kenkiRetreatStart, kenkiRetreating } from '../utils/kenkiRetreat';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy, EnemyType } from '../types/game';
setBrawlerTempoAll(1.0);

let now = 6_000_000;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const pl = () => useGameStore.getState().player;
const stick = (x: number, y: number) => useGameStore.getState().setSwipeDirection({ x, y }, 1);
const release = () => useGameStore.getState().setSwipeDirection(null);

beforeEach(() => {
  now = 6_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

// ---------------------------------------------------------------------------------------------
// プレイヤーの側(1・4)
// ---------------------------------------------------------------------------------------------
describe('プレイヤー: 拳鬼の秘奥義(1)と、床・置かれた火(4)', () => {
  const setup = () => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(st => ({
      m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
      enemies: [], projectiles: [], pumpkinBlasts: [], bossFires: [], swipeDirection: null,
      inputState: { up: false, down: false, left: false, right: false },
      player: { ...st.player, health: 1000, maxHealth: 1000, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: -1, y: 0 } },
    }));
  };
  const enemyAt = (type: EnemyType, dx: number, dy: number, id: string, patch: Partial<Enemy> = {}): Enemy => {
    const c = center();
    const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
    e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
    return Object.assign(e, patch);
  };
  /** 拳鬼の秘奥義の当たり(幻影の近接と同じ引数=被弾無敵を素通りする)。左の相手 id から。 */
  const secretHit = (id: string, move: 'brawler-secret' | 'brawler-secret-land', dmg = 40): number => {
    const e = useGameStore.getState().enemies.find(x => x.id === id)!;
    const h0 = pl().health;
    useGameStore.getState().damagePlayer(dmg, 'test', e.x + e.width / 2, e.y + e.height / 2, 'guardian-phantom', false, move, undefined, id);
    return h0 - pl().health;
  };
  const full = (move: 'brawler-secret' | 'brawler-secret-land'): number => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('guardian-phantom', -60, 0, 'k')] });
    return secretHit('k', move);
  };

  it('秘奥義の締め(brawler-secret-land)も半減だけ: ダメージは半分・大きな吹き飛ばしと怯みは今どおり(40px の押しに化けない)', () => {
    const f = full('brawler-secret-land');
    setup();
    useGameStore.setState({ enemies: [enemyAt('guardian-phantom', -60, 0, 'k')] });
    stick(1, 0);
    expect(secretHit('k', 'brawler-secret-land')).toBe(brawlerLeverGuardDamage(f));
    expect(pl().lastHurtAt).toBe(now);                    // 怯みは今どおり
    expect((pl().knockbackUntil ?? 0) > now).toBe(true);  // 元の吹き飛ばしは今どおり
    expect(pl().lungeShape).not.toBe('push');             // 小さい押しに置き換えない
  });
  it('1発目をガードで受けた秘奥義は、残りの連撃と締めも半減だけ(怯んでレバーが効かなくても)', () => {
    const f1 = full('brawler-secret'), f2 = full('brawler-secret-land');
    setup();
    useGameStore.setState({ enemies: [enemyAt('guardian-phantom', -60, 0, 'k')] });
    stick(1, 0);
    expect(secretHit('k', 'brawler-secret')).toBe(brawlerLeverGuardDamage(f1)); // 1発目: ガード(半減だけ)
    release();                                              // 以後はレバーなし+怯みの最中
    now += 200; useGameStore.setState(s => ({ gameTime: s.gameTime + 200 }));
    expect(secretHit('k', 'brawler-secret')).toBe(brawlerLeverGuardDamage(f1)); // 2発目も半減
    now += 200; useGameStore.setState(s => ({ gameTime: s.gameTime + 200 }));
    stick(-1, 0);                                           // 逆へ入れていても持ち越しは効く
    expect(secretHit('k', 'brawler-secret')).toBe(brawlerLeverGuardDamage(f1));
    now += 1500; useGameStore.setState(s => ({ gameTime: s.gameTime + 1500 }));
    expect(secretHit('k', 'brawler-secret-land')).toBe(brawlerLeverGuardDamage(f2)); // 締めも半減
    expect((pl().knockbackUntil ?? 0) > now).toBe(true);    // 締めの吹き飛ばしは今どおり
  });
  it('1発もガードしていない秘奥義は半減にならない・別の相手や、持ち越しの時間を過ぎた当たりにも効かない・秘奥義でない技には持ち越さない', () => {
    const f1 = full('brawler-secret');
    setup();
    useGameStore.setState({ enemies: [enemyAt('guardian-phantom', -60, 0, 'k')] });
    expect(secretHit('k', 'brawler-secret')).toBe(f1); // レバーなし=普通
    now += 200; useGameStore.setState(s => ({ gameTime: s.gameTime + 200 }));
    expect(secretHit('k', 'brawler-secret')).toBe(f1);

    setup();
    useGameStore.setState({ enemies: [enemyAt('guardian-phantom', -60, 0, 'k'), enemyAt('guardian-phantom', -80, 0, 'k2')] });
    stick(1, 0);
    secretHit('k', 'brawler-secret');
    release();
    now += 200; useGameStore.setState(s => ({ gameTime: s.gameTime + 200 }));
    expect(secretHit('k2', 'brawler-secret')).toBe(f1);  // 別の相手の秘奥義
    // 同じ相手の、秘奥義でない技(通常の段)には持ち越さない
    const e = useGameStore.getState().enemies.find(x => x.id === 'k')!;
    const h0 = pl().health;
    useGameStore.getState().damagePlayer(40, 'test', e.x + e.width / 2, e.y + e.height / 2, 'guardian-phantom', false, 'brawler-s1', undefined, 'k');
    expect(h0 - pl().health).toBe(f1);
    now += BRAWLER_LEVER_GUARD_CARRY_MS + 10; useGameStore.setState(s => ({ gameTime: s.gameTime + BRAWLER_LEVER_GUARD_CARRY_MS + 10 }));
    expect(secretHit('k', 'brawler-secret')).toBe(f1);   // 時間を過ぎた(次の秘奥義)
  });

  it('床(グレンの血溜まり)は、床の中心から離れる向きへ歩いていてもガードにならない', () => {
    setup();
    const gt = useGameStore.getState().gameTime;
    const c = center();
    const boss = enemyAt('giantbat', -300, 0, 'g', {
      damage: 30, giantDelayedHits: [{ x: c.x - 30, y: c.y, radius: 90, bornAt: gt - 500, fireAt: gt - 100, floorUntil: gt + 4000, moveKey: 'g-boon' }],
    } as unknown as Partial<Enemy>);
    useGameStore.setState({ enemies: [boss] });
    stick(1, 0); // 床の中心(左)から離れる向き
    applyGlenFloorDamage(NOOP_COMBAT_EFFECTS);
    expect(pl().health).toBeLessThan(1000);
    expect(leverGuardCount(pl())).toBe(0);
    expect(pl().lastHurtAt).toBe(now);          // 普通に食らう
    expect(pl().lungeShape).not.toBe('push');
  });
  it('置かれた火(ジブリルのランタン火)もガードにならない', () => {
    setup();
    const gt = useGameStore.getState().gameTime;
    const c = center();
    useGameStore.setState({ bossFires: [{ id: 'f1', x: c.x - 10, y: c.y, spawnAt: gt - 1000, activateAt: gt - 500, expireAt: gt + 5000 }] as never });
    stick(1, 0);
    tickAngelBossFires(gt, () => {});
    expect(pl().health).toBeLessThan(1000);
    expect(leverGuardCount(pl())).toBe(0);
    expect(pl().lastHurtAt).toBe(now);
  });
  it('1回で終わる爆発(爆風)は今どおり、爆心から離れる向きでガードできる', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 200, 200, 'z')] });
    stick(1, 0);
    const c = center();
    useGameStore.setState({ pumpkinBlasts: [{ enemyId: 'z', x: c.x - 50, y: c.y, radius: 120, damage: 30 } as PumpkinBlast] });
    applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });
    expect(leverGuardCount(pl())).toBe(1);
    expect(pl().lungeShape).toBe('push');
  });
});

// ---------------------------------------------------------------------------------------------
// 拳鬼の側(2・3・5)
// ---------------------------------------------------------------------------------------------
const START_GT = 10_000_000;
const ORIGIN = 50_000;
const K = 'kenki';
/** 拳鬼を置く(プレイヤーは拳鬼の右 dx)。 */
const setupKenki = (dx: number, over: Partial<Enemy> = {}, playerBrawler = false) => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  const k = uniquePhantomSpec('brawler');
  setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
  Object.assign(e, { id: K, phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, health: 100000, maxHealth: 100000, dormant: false, bossState: 'chase' }, over);
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true },
    enemies: [e], projectiles: [], pumpkinBlasts: [], summons: [], gameTime: START_GT, swipeDirection: null,
    inputState: { up: false, down: false, left: false, right: false },
    player: {
      ...s.player, x: e.x + e.width / 2 + dx - s.player.width / 2, y: e.y + e.height / 2 - s.player.height / 2, health: 99999, maxHealth: 99999,
      invulnerable: false, invulnerableTime: 0, ...(playerBrawler ? { subWeapons: ['brawler' as const], subWeaponLevels: { brawler: 1 } } : {}),
    },
  }));
};
const en = () => useGameStore.getState().enemies.find(e => e.id === K)!;
const lever = (x: number | undefined, y: number | undefined) =>
  useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === K ? { ...e, gpLeverX: x, gpLeverY: y } : e)) }));
const lost = (f: () => void): number => { const h0 = en().health; f(); return h0 - en().health; };

describe('拳鬼: 爆発と、守護霊・犬・軍人の当たりもガードできる(2)', () => {
  /** 拳鬼の中心から (dx,dy) の所で爆発(待ち行列へ積んでからダメージ=実際の爆発と同じ順)。 */
  const blast = (dx: number, dy: number, amount = 50) => {
    const e = en();
    const g = useGameStore.getState();
    g.queueBlastLift(e.x + e.width / 2 + dx, e.y + e.height / 2 + dy, 120);
    g.damageEnemy(K, amount, true);
  };
  it('爆発: 爆心から離れる向きへ歩こうとしていれば半減・爆心の方へ歩いていれば普通・爆心が分からない爆発はガードにならない', () => {
    setupKenki(400);
    const full = lost(() => blast(60, 0)); // 爆心は右
    expect(full).toBeGreaterThan(1);

    setupKenki(400);
    lever(-1, 0); // 左=爆心から離れる向き
    expect(lost(() => blast(60, 0))).toBe(brawlerLeverGuardDamage(full));
    expect(en().gpLeverGuardAt).toBe(START_GT);
    expect(en().gpLeverGuardDirX).toBeCloseTo(-1);

    // 向きはプレイヤーの位置ではなく爆心で見る: プレイヤーは右に居るが、爆心は左 → 右へ歩いていればガード
    setupKenki(400);
    lever(1, 0);
    expect(lost(() => blast(-60, 0))).toBe(brawlerLeverGuardDamage(full));

    setupKenki(400);
    lever(1, 0); // 爆心(右)の方へ歩いている
    expect(lost(() => blast(60, 0))).toBe(full);
    expect(en().gpLeverGuardAt).toBeUndefined();

    setupKenki(400);
    lever(-1, 0);
    expect(lost(() => useGameStore.getState().damageEnemy(K, 50, true))).toBe(full); // 待ち行列に爆心が無い
    expect(en().gpLeverGuardAt).toBeUndefined();
  });
  it('守護霊・犬・軍人の当たり: その仲間の位置から離れる向きでガード(プレイヤーの位置ではない)', () => {
    const ally = (kind: 'ghost-ally' | 'hero-dog', dx: number) => {
      const e = en();
      useGameStore.setState({ summons: [{ id: `s-${kind}`, kind, x: e.x + e.width / 2 + dx - 14, y: e.y + e.height / 2 - 14, width: 28, height: 28 }] as never });
    };
    setupKenki(400);
    const full = lost(() => useGameStore.getState().damageEnemy(K, 50, false, false, false, 'other', 'ghost'));
    expect(full).toBeGreaterThan(1);

    // 守護霊は左・プレイヤーは右: 右へ歩いていれば守護霊の当たりをガード
    setupKenki(400);
    ally('ghost-ally', -80);
    lever(1, 0);
    expect(lost(() => useGameStore.getState().damageEnemy(K, 50, false, false, false, 'other', 'ghost'))).toBe(brawlerLeverGuardDamage(full));
    expect(en().gpLeverGuardAt).toBe(START_GT);

    setupKenki(400);
    ally('ghost-ally', -80);
    lever(-1, 0); // 守護霊の方へ歩いている
    expect(lost(() => useGameStore.getState().damageEnemy(K, 50, false, false, false, 'other', 'ghost'))).toBe(full);

    // 犬
    setupKenki(400);
    ally('hero-dog', -80);
    lever(1, 0);
    useGameStore.getState().damageEnemy(K, 50, false, false, false, 'other', 'dog');
    expect(en().gpLeverGuardAt).toBe(START_GT);

    // 軍人
    setupKenki(400);
    { const e = en(); useGameStore.setState({ escorts: [{ id: 'e1', baseId: 'base-0', x: e.x + e.width / 2 - 80, y: e.y + e.height / 2, face: 1, soldierIndex: 0 }] as never }); }
    lever(1, 0);
    useGameStore.getState().damageEnemy(K, 50, false, false, false, null, 'escort:e1');
    expect(en().gpLeverGuardAt).toBe(START_GT);

    // 仲間が居ない(位置が取れない)・持続ダメージはガードにならない
    setupKenki(400);
    lever(1, 0);
    useGameStore.getState().damageEnemy(K, 50, false, false, false, 'other', 'ghost');
    expect(en().gpLeverGuardAt).toBeUndefined();
    setupKenki(400);
    ally('ghost-ally', -80);
    lever(1, 0);
    useGameStore.getState().damageEnemy(K, 50, false, false, false, 'dot', 'ghost');
    expect(en().gpLeverGuardAt).toBeUndefined();
  });
});

describe('拳鬼: プレイヤーにレバーガードで受けられた攻撃は「当たっていない」(3)', () => {
  /** 制御を回す。guard=true ならプレイヤーは毎 tick、拳鬼から離れる向きへレバーを入れ続ける。 */
  const run = (dx: number, over: Partial<Enemy>, guard: boolean, steps: number) => {
    setupKenki(dx, over, true);
    let gt = START_GT;
    const st = createPhantomTickState();
    let maxStage = 0, sawSecret = false, sawLeap = false, kicks = 0;
    for (let i = 0; i < steps; i++) {
      gt += 16; now += 16;
      useGameStore.setState({ gameTime: gt });
      {
        // 跳びかかりはプレイヤーの真上に着地する(この器は体の押し合いを回さない)=重なったら、プレイヤーが右へ離れたことにする(どちらの回も同じ)。
        const e = en(), p = pl();
        if (Math.hypot(p.x + p.width / 2 - (e.x + e.width / 2), p.y + p.height / 2 - (e.y + e.height / 2)) < 20 && e.aiPhase !== 'jump') {
          useGameStore.setState(s => ({ player: { ...s.player, x: s.player.x + 60 } }));
        }
      }
      if (guard) {
        const e = en(), p = pl();
        const vx = p.x + p.width / 2 - (e.x + e.width / 2), vy = p.y + p.height / 2 - (e.y + e.height / 2);
        const l = Math.hypot(vx, vy) || 1;
        useGameStore.setState({ swipeDirection: { x: vx / l, y: vy / l }, swipeStrength: 1 });
      }
      const b0 = en().phantomBrawler;
      runPhantomTick(en(), st, gt, 0.016, 1, now, NOOP_PHANTOM_SFX, () => 0.999);
      const b = en().phantomBrawler;
      maxStage = Math.max(maxStage, b?.stage ?? 0);
      if (b?.secret) sawSecret = true;
      if (en().aiPhase === 'jump') sawLeap = true;
      if (b0 && b && b.phase === 'tech' && b.tech === 'kick' && b.resolved && !b0.resolved) kicks++;
    }
    return { maxStage, sawSecret, sawLeap, kicks, guards: leverGuardCount(pl()), hp: pl().health };
  };
  it('台本が続かない: 普通に食らえば通常の段は2段目以降へつながる / ガードで受けられたら1段目で打ち切り(毎回1段目からやり直す)', () => {
    const plain = run(40, {}, false, 260);
    expect(plain.maxStage).toBeGreaterThanOrEqual(2);
    expect(plain.guards).toBe(0);

    const guarded = run(40, {}, true, 260);
    expect(guarded.guards).toBeGreaterThan(1);   // 何度もガードで受けた
    expect(guarded.maxStage).toBe(1);            // 2段目へつながらない
    expect(guarded.hp).toBeLessThan(99999);      // 体力は(半分)減っている
    expect(guarded.hp).toBeGreaterThan(plain.hp);
  });
  it('秘奥義が始まらない: 普通に食らえば跳びかかりの後の蹴りから秘奥義が出る / 1手目の蹴りをガードで受けられたら秘奥義は出ない', () => {
    const k = uniquePhantomSpec('brawler');
    const over = { phantomBrawler: { ...initialBrawlerState(), points: 20 }, phantomBuild: k.profile.snapshot, health: 65, maxHealth: 130 };
    const plain = run(110, over, false, 900);
    expect(plain.sawLeap).toBe(true);
    expect(plain.sawSecret).toBe(true);

    const guarded = run(110, over, true, 900);
    expect(guarded.sawLeap).toBe(true);
    expect(guarded.kicks).toBeGreaterThan(0);    // 1手目の蹴りは出た
    expect(guarded.guards).toBeGreaterThan(0);   // それをガードで受けた
    expect(guarded.sawSecret).toBe(false);       // 秘奥義は始まらない
  });
});

describe('拳鬼: 下がっている間に来た弾を、何もせずには食らわない(5)', () => {
  /** 制御を回す器。rand は列を使い切ったら 0.999。 */
  const rig = (dx: number) => {
    setupKenki(dx);
    let gt = START_GT;
    const st = createPhantomTickState();
    let seq: number[] = [];
    const rand = () => (seq.length > 0 ? seq.shift()! : 0.999);
    const step = (ms = 16) => { gt += ms; now += ms; useGameStore.setState({ gameTime: gt }); runPhantomTick(en(), st, gt, ms / 1000, 1, now, NOOP_PHANTOM_SFX, rand); };
    const gunKey = () => useGameStore.getState().player.weapons.find(w => isDirectGunWeaponKey(w.key))!.key;
    /** 拳鬼の中心から (ox,oy) の所に、向き dir の弾を置く(撃ってから反応の下限より古い)。 */
    const bullet = (id: string, ox: number, oy: number, dir: { x: number; y: number }, speed = 500) => {
      const e = en();
      useGameStore.setState(s => ({ projectiles: [...s.projectiles, {
        id, x: e.x + e.width / 2 + ox - 4, y: e.y + e.height / 2 + oy - 4, width: 8, height: 8, speed, damage: 10,
        direction: dir, weaponType: 'handgun', weaponKey: gunKey(), hostile: false, reflected: false, passthrough: false, hitEnemies: [],
        duration: 5000, createdAt: now - 400, critChance: 0,
      } as never] }));
    };
    return { step, st, gt: () => gt, setSeq: (v: number[]) => { seq = v; }, bullet };
  };
  it('向きが合う弾: 下がりを続けて(着弾の後まで延ばして)レバーガードで受ける', () => {
    const h = rig(400);
    h.step();
    const mind = h.st.brawler!.mind;
    kenkiRetreatStart(mind, h.gt(), 300, null); // プレイヤー(右)から離れる向き=左へ下がる
    for (let i = 0; i < 12; i++) h.step();      // 下がりの残りは約100ms
    const until0 = mind.retreatUntil;
    h.setSeq([0.99]);                            // 弾の対処=ステップで避ける を引いていても
    h.bullet('b1', 150, 0, { x: -1, y: 0 });     // 右から左へ飛ぶ弾(着弾まで約300ms)=下がりの向きと合う
    h.step();
    expect(kenkiRetreating(mind, h.gt())).toBe(true);
    expect(mind.retreatUntil).toBeGreaterThan(until0);            // 着弾の後まで延びた
    expect(en().phantomBrawler?.phase ?? 'idle').toBe('idle');    // ステップも構えも出していない(歩いたまま受ける)
    for (let i = 0; i < 18; i++) h.step();                        // 着弾の時刻(約300ms 後)
    expect(kenkiRetreating(mind, h.gt())).toBe(true);
    expect(en().gpLeverX).toBeCloseTo(-1, 3);
    // 着弾: 弾の飛んできた向きで関所を通す=半減
    const hp0 = en().health;
    useGameStore.getState().damageEnemy(K, 50, false, false, false, 'gun', 'player', null, 1, 'bullet', undefined, { dir: { x: -1, y: 0 } });
    expect(hp0 - en().health).toBe(brawlerLeverGuardDamage(50 * 0.2));
    expect(en().gpLeverGuardAt).toBe(h.gt());
  });
  it('向きが合わない弾: 下がりをやめて、構えで返す(下がったまま食らわない)', () => {
    const h = rig(400);
    h.step();
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === K ? { ...e, phantomBrawler: { ...(e.phantomBrawler ?? initialBrawlerState()), points: 9 } } : e)) }));
    const mind = h.st.brawler!.mind;
    kenkiRetreatStart(mind, h.gt(), 400, null); // 左へ下がる
    for (let i = 0; i < 4; i++) h.step();
    h.setSeq([0]);                               // 弾の対処=構えで返す
    h.bullet('b2', -150, 0, { x: 1, y: 0 });     // 左から右へ飛ぶ弾=下がりの向きと逆(レバーガードでは受けられない)
    h.step();
    expect(kenkiRetreating(mind, h.gt())).toBe(false);           // 下がりをやめた
    expect(en().phantomBrawler?.tech).toBe('guard');             // 構えを出した
    expect((en().gpGuardUntil ?? 0) > h.gt()).toBe(true);
  });
  it('「下がってガード」を選んだ弾の着弾の時に下がれない(間隔の中)なら、他の手を引き直す(食らうは引かない)', () => {
    const h = rig(400);
    h.step();
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === K ? { ...e, phantomBrawler: { ...(e.phantomBrawler ?? initialBrawlerState()), points: 9 } } : e)) }));
    const mind = h.st.brawler!.mind;
    // 弾が遠いうちに「下がってガード」を引く(対処の割合=何でも → 下がりを引く 0)
    h.setSeq([0.99, 0]);
    h.bullet('b3', 600, 0, { x: -1, y: 0 }, 500); // 着弾まで約1.2秒
    h.step();
    expect(h.st.brawler!.bulletPlans.get('b3')).toBe('retreat');
    // その後、別の理由で下がりを使い切った(間隔の中=いまは下がれない)
    mind.retreatUntil = 0; mind.retreatReadyAt = h.gt() + 5000;
    // 着弾が近づくまで進める → 引き直し(0=構えで返す)
    h.setSeq([]);
    let plan: unknown = 'retreat';
    for (let i = 0; i < 80 && plan === 'retreat'; i++) {
      h.setSeq([0]);
      // 弾を進める(制御は弾を動かさない)
      useGameStore.setState(s => ({ projectiles: s.projectiles.map(p => (p.id === 'b3' ? { ...p, x: p.x - 8 } : p)) }));
      h.step();
      plan = h.st.brawler!.bulletPlans.get('b3');
    }
    expect(plan).not.toBe('retreat');
    expect(plan).not.toBe('take');
    expect(kenkiRetreating(mind, h.gt())).toBe(false);
    expect(en().phantomBrawler?.tech).toBe('guard'); // 引き直した手(構えで返す)を出した
  });
});
