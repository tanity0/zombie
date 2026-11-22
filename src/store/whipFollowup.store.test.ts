// 鞭の追加攻撃(research/WHIP_FOLLOWUP.md §7・社長 2026-11-23)をストアを動かして固める。
//  1発目の当たり=地上の敵はその場で真上に浮く(押さない・ダメージは今の1撃目のまま)/浮いている敵に当たる=入力なしで叩きつけ(2倍+周りへの爆発=§6)/
//  ボス級は浮かない=叩きつけにもならない/強個体は雑魚と同じく浮く/フリックでは何も起きない(位置・向きも止めない)/
//  スラッシャー持ち=0.5秒ごとに段数ぶんの追加の振り(浮かせ続けて最後は必ず叩きつけ)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, WHIP_KNOCKBACK_SPEED } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { brawlerAirborne } from '../utils/brawlerCombo';
import { WHIP_CHAIN_INTERVAL_MS, WHIP_LIFT_RISE_MS, WHIP_SLAM_DAMAGE_MULT } from '../utils/whipFollowup';

let now = 13_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const RIGHT = { up: false, down: false, left: false, right: true } as never;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const step = (ms = 10, input = NO) => {
  now += ms;
  useGameStore.setState(st => ({ gameTime: st.gameTime + ms, realGameTime: st.realGameTime + ms }));
  if (useGameStore.getState().whipChain) useGameStore.getState().tickWhipChain(); // ループと同じく毎フレーム
  useGameStore.getState().movePlayer(input, ms / 1000);
  useGameStore.getState().updateEnemies(ms / 1000);
};
const run = (ms: number, input = NO) => { const end = now + ms; while (now < end) step(10, input); };
/** プレイヤーの鞭の振り(近接の待ち時間は毎回明けておく)。 */
const swing = () => {
  useGameStore.setState(st => ({ player: { ...st.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  return useGameStore.getState().triggerCounter();
};
/** 1発目の押し(振りに直交する大きな押し)を止める=次の振りの線の中に留める(手で振る2発目の当たりを見るための置き方)。 */
const stopPush = (...ids: string[]) => useGameStore.setState(st => ({
  enemies: st.enemies.map(e => (ids.includes(e.id) ? { ...e, knockbackVx: 0, knockbackVy: 0, knockbackUntil: now } : e)),
}));
const airborne = (id: string) => brawlerAirborne(en(id), now);
const withSlasher = (lv: number) => useGameStore.setState(st => ({ player: { ...st.player, skills: ['slasher'], skillLevels: { slasher: lv } } }));

beforeEach(() => {
  now = 13_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false }, breakableProps: [],
    player: { ...st.player, subWeapons: ['whip'], skills: [], skillLevels: {}, whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('1発目=その場で浮かせる', () => {
  it('当たった地上の雑魚はその場で真上に浮く(鞭の浮き)。押さない・引き寄せない・ダメージは今の1撃目のまま', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    const x0 = en('z').x, y0 = en('z').y;
    swing();
    const z = en('z');
    expect(z.health).toBeLessThan(99999);
    expect(z.knockbackVx ?? 0).toBe(0);
    expect(z.knockbackVy ?? 0).toBe(0);
    expect(z.brLiftShape).toBe('whip');
    expect(airborne('z')).toBe(true);
    run(WHIP_LIFT_RISE_MS);
    expect(airborne('z')).toBe(true); // 1秒かけて頂点へ=まだ浮いている
    expect(Math.abs(en('z').x - x0)).toBeLessThan(2); // その場(横へも縦へも飛ばない)
    expect(Math.abs(en('z').y - y0)).toBeLessThan(2);
  });
  it('強個体も雑魚と同じく浮く', () => {
    useGameStore.setState({ enemies: [place('pumpkin', 110, 0, 'p')] });
    swing();
    expect(en('p').brLiftShape).toBe('whip');
    expect(airborne('p')).toBe(true);
  });
  it('ボス級は浮かない(押しは今の鞭の押しのまま)', () => {
    useGameStore.setState({ enemies: [place('hunter', 110, 0, 'h')] });
    swing();
    expect(en('h').health).toBeLessThan(99999);
    expect(airborne('h')).toBe(false);
    expect(Math.hypot(en('h').knockbackVx ?? 0, en('h').knockbackVy ?? 0)).toBeCloseTo(WHIP_KNOCKBACK_SPEED);
  });
});

describe('浮いている敵に当てる=自動で叩きつけ', () => {
  it('浮いている間の次の振りは、入力なしで叩きつけ(1撃目の2倍・押しはしない・叩き落とし)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    const d1 = 99999 - en('z').health;
    run(400);
    expect(airborne('z')).toBe(true);
    const hp = en('z').health;
    swing();
    const z = en('z');
    expect(hp - z.health).toBeGreaterThanOrEqual(d1 * WHIP_SLAM_DAMAGE_MULT - 1e-6); // 空中の倍率も乗るので2倍以上
    expect(z.knockbackVx ?? 0).toBe(0);
    expect(z.knockbackVy ?? 0).toBe(0);
    expect(z.brLiftPeak).toBe(0); // 叩き落とし(押し上げ0=今の高さから地面へ)
  });
  it('同じ振りの中で、地上の敵は浮き、浮いている敵は叩きつけになる', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'a')] });
    swing();
    run(300);
    useGameStore.setState(st => ({ enemies: [...st.enemies, place('zombie', 60, 0, 'b')] }));
    expect(airborne('b')).toBe(false);
    swing();
    expect(en('a').brLiftPeak).toBe(0); // 叩きつけ
    expect(en('b').brLiftShape).toBe('whip'); // 浮いた
    expect(airborne('b')).toBe(true);
  });
  it('浮きが終わった(着地した)敵は、次の振りでまた浮く(叩きつけにならない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    run(3000);
    expect(airborne('z')).toBe(false);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, ...place('zombie', 100, 0, 'z'), health: e.health, brawlerLiftAt: e.brawlerLiftAt, brLiftUntil: e.brLiftUntil })) }));
    swing();
    expect(en('z').brLiftShape).toBe('whip');
    expect((en('z').brLiftPeak ?? 0)).toBeGreaterThan(0);
  });
  it('ボス級は叩きつけにならない(次の振りも普通の打撃=2倍にならない)', () => {
    useGameStore.setState({ enemies: [place('hunter', 110, 0, 'h')] });
    swing();
    stopPush('h');
    const d1 = 99999 - en('h').health;
    run(400);
    const hp = en('h').health;
    swing();
    expect(hp - en('h').health).toBeLessThan(d1 * 1.5);
    expect(airborne('h')).toBe(false);
  });
});

describe('フリックの技は無い', () => {
  it('当てた直後の反対・進行方向のフリックで何も起きない(受付も開かない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    swing();
    run(100);
    const z0 = en('z');
    expect(useGameStore.getState().flickFollowupOpen()).toBe(false);
    expect(useGameStore.getState().tryFlickFollowup(-1, 0)).toBe(false);
    expect(useGameStore.getState().tryFlickFollowup(1, 0)).toBe(false);
    expect(en('z').health).toBe(z0.health);
  });
  it('当てた後もプレイヤーは動ける・向きも変わる(位置と向きの固定は無い)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    swing();
    run(500); // 振りの間の止まりが明けるまで
    const x0 = useGameStore.getState().player.x;
    run(200, RIGHT);
    expect(useGameStore.getState().player.x).toBeGreaterThan(x0 + 5);
    useGameStore.getState().setLastDirection({ x: 0, y: 1 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 0, y: 1 });
  });
});

describe('スラッシャー=0.5秒ごとに追加の振り(浮かせ続け、最後は必ず叩きつけ)', () => {
  it('Lv3: 追加3つ。最後の前まで落ちずに浮き続け、最後の1発で叩きつけ', () => {
    withSlasher(3);
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    expect(useGameStore.getState().whipChain?.extras).toBe(3);
    const hps: number[] = [en('z').health];
    for (let k = 1; k <= 3; k++) {
      run(WHIP_CHAIN_INTERVAL_MS);
      hps.push(en('z').health);
      if (k < 3) {
        expect(airborne('z')).toBe(true);
        expect(en('z').brLiftShape).toBe('whip'); // 浮かせ続けている
        expect((en('z').brLiftPeak ?? 0)).toBeGreaterThan(0);
      }
    }
    expect(hps[1]).toBeLessThan(hps[0]);
    expect(hps[2]).toBeLessThan(hps[1]);
    expect(hps[3]).toBeLessThan(hps[2]);
    expect(en('z').brLiftPeak).toBe(0); // 最後=叩きつけ
    expect(useGameStore.getState().whipChain).toBeNull();
  });
  it('元の鞭の長さで最後の叩きつけまで届く(鞭の先の近くで浮かせた敵・2体並び・斜め)', () => {
    withSlasher(3);
    for (const [dx, dy] of [[140, 0], [100, 50], [70, -60]] as const) {
      useGameStore.setState(st => ({ whipChain: null, enemies: [place('zombie', dx, dy, 'z'), place('zombie', dx - 40, dy + 20, 'y')], player: { ...st.player, lastDirection: { x: dx, y: dy } } }));
      swing();
      expect(useGameStore.getState().whipChain?.extras).toBe(3);
      const hits: number[] = [];
      for (let k = 1; k <= 3; k++) {
        const h0 = en('z').health + en('y').health;
        run(WHIP_CHAIN_INTERVAL_MS);
        hits.push(h0 - (en('z').health + en('y').health));
      }
      expect(hits.every(d => d > 0)).toBe(true);
      expect(en('z').brLiftPeak).toBe(0);
      expect(en('y').brLiftPeak).toBe(0);
      run(2000);
    }
  });
  it('Lv1: 追加1つ=それが最後なので叩きつけ。Lv2: 追加2つ', () => {
    withSlasher(1);
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    expect(useGameStore.getState().whipChain?.extras).toBe(1);
    run(WHIP_CHAIN_INTERVAL_MS);
    expect(en('z').brLiftPeak).toBe(0);
    expect(useGameStore.getState().whipChain).toBeNull();
    withSlasher(2);
    // 追加の振りは狙った敵へ向き直す(プレイヤーの向きも変わる)ので、向きを戻してから振る
    useGameStore.setState(st => ({ enemies: [place('zombie', 100, 0, 'y')], player: { ...st.player, lastDirection: { x: 1, y: 0 } } }));
    swing();
    expect(useGameStore.getState().whipChain?.extras).toBe(2);
  });
  it('追加の振りは1発目で浮いた敵を狙う(振りの向きの外へずれても向き直して当てる)', () => {
    withSlasher(2);
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    // 1発目の線の外(下)へずらす
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => (e.id === 'z' ? { ...e, ...place('zombie', 40, 110, 'z'), health: e.health, brawlerLiftAt: e.brawlerLiftAt, brLiftMs: e.brLiftMs, brLiftPeak: e.brLiftPeak, brLiftUntil: e.brLiftUntil, liftUntil: e.liftUntil, brLiftShape: e.brLiftShape, brLiftArc: e.brLiftArc, knockbackVx: 0, knockbackVy: 0 } : e)) }));
    const hp = en('z').health;
    run(WHIP_CHAIN_INTERVAL_MS);
    expect(en('z').health).toBeLessThan(hp);
  });
  it('空振りは連続を始めない。連続の途中のプレイヤーの振りは新しい連続を始めない(走っている連続の最後の叩きつけを守る)', () => {
    withSlasher(3);
    swing();
    expect(useGameStore.getState().whipChain).toBeNull();
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    const c0 = useGameStore.getState().whipChain!;
    run(WHIP_CHAIN_INTERVAL_MS + 20); // 1つ目が出た
    useGameStore.setState(st => ({ enemies: [...st.enemies, place('zombie', 60, -30, 'w')] }));
    swing();
    const c1 = useGameStore.getState().whipChain!;
    expect(c1.extras).toBe(c0.extras);
    expect(c1.done).toBe(1); // 同じ連続のまま
  });
  it('ボス級だけに当たった振りは連続を始めない(浮かせた敵が居ない=浮かせ続ける技にならない)', () => {
    withSlasher(3);
    useGameStore.setState({ enemies: [place('hunter', 110, 0, 'h')] });
    swing();
    expect(en('h').health).toBeLessThan(99999);
    expect(useGameStore.getState().whipChain).toBeNull();
  });
  it('止まっていた後(ポーズ・レベルアップ相当で時計が飛ぶ)は残りの段を一斉に出さない。着地した敵は叩きつけにならず浮かせ直す', () => {
    withSlasher(3);
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    run(WHIP_CHAIN_INTERVAL_MS); // 1つ目
    expect(useGameStore.getState().whipChain?.done).toBe(1);
    now += 60_000; // 壁時計だけ進む(ループは回っていない)
    expect(airborne('z')).toBe(false); // 浮きも壁時計=もう着地している
    const hp0 = en('z').health;
    const swingFx0 = useGameStore.getState().whipSwingFxAt;
    // 明けた直後の数フレーム: 段は出ない(後ろへずらすだけ)
    for (let i = 0; i < 5; i++) {
      const done = useGameStore.getState().whipChain?.done;
      step(10);
      expect((useGameStore.getState().whipChain?.done ?? 99) - (done ?? 0)).toBeLessThanOrEqual(0);
    }
    expect(useGameStore.getState().whipChain?.done).toBe(1);
    expect(en('z').health).toBe(hp0);
    expect(useGameStore.getState().whipSwingFxAt).toBe(swingFx0);
    // 1間隔後に1つだけ(keep)=地上から浮かせ直す
    run(WHIP_CHAIN_INTERVAL_MS - 30); // 置き直した時刻(明けた最初のフレーム)から1間隔
    expect(useGameStore.getState().whipChain?.done).toBe(2);
    expect(en('z').brLiftShape).toBe('whip');
    expect((en('z').brLiftPeak ?? 0)).toBeGreaterThan(0);
    // もう一度止まって、最後(final)を着地した敵へ出す=叩きつけではなく浮かせる(一瞬で叩きつけにしない)
    now += 60_000;
    expect(airborne('z')).toBe(false);
    run(WHIP_CHAIN_INTERVAL_MS + 50);
    expect(useGameStore.getState().whipChain).toBeNull();
    expect((en('z').brLiftPeak ?? 0)).toBeGreaterThan(0);
    expect(airborne('z')).toBe(true);
  });
  it('スラッシャーが無ければ追加の振りは無い', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    expect(useGameStore.getState().whipChain).toBeNull();
    const hp = en('z').health;
    run(1600);
    expect(en('z').health).toBe(hp);
  });
});

describe('叩きつけ=爆発(社長「鞭の叩きつけは爆発ダメージにして」「爆発は叩きつけられた敵を中心にです」)', () => {
  /** 1発目で浮かせ、浮いている所まで進める。 */
  const liftAndWait = () => {
    swing();
    run(400);
    expect(airborne('z')).toBe(true);
  };
  /** 叩きつける敵(z)の横 dx に、振りに当たらない敵を置く(鞭の先より奥)。 */
  const addBeside = (id: string, dx: number) => {
    const z = en('z');
    useGameStore.setState(st => ({ enemies: [...st.enemies, { ...place('zombie', 0, 0, id), x: z.x + dx, y: z.y }] }));
  };
  it('叩きつけた敵を中心に爆発し、その周りの敵(振りに当たっていない敵)にもダメージが入る。遠くの敵とプレイヤーには入らない', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    liftAndWait();
    addBeside('b', 55); // 爆発の半径の内・鞭の先より奥(振りには当たらない)
    addBeside('f', 600); // 半径の外
    const php0 = useGameStore.getState().player.health;
    const hpZ = en('z').health;
    swing();
    expect(en('b').health).toBeLessThan(99999);
    expect(en('f').health).toBe(99999);
    expect(useGameStore.getState().player.health).toBe(php0);
    // 周りの敵は距離で減る(爆心の本体より小さい)。
    expect(99999 - en('b').health).toBeLessThan(hpZ - en('z').health);
  });
  it('叩きつけた本体には鞭の打撃が1回だけ(爆発のダメージは入らない=二重にしない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    liftAndWait();
    const calls: { id: string; blast: boolean | undefined }[] = [];
    const orig = useGameStore.getState().damageEnemy;
    const origStrike = useGameStore.getState().performWhipStrike;
    let strikes = 0;
    const spyDamage: typeof orig = (id, amount, blast, ...rest) => { calls.push({ id, blast }); return orig(id, amount, blast, ...rest); };
    const spyStrike: typeof origStrike = (ids, opts) => { strikes++; return origStrike(ids, opts); };
    useGameStore.setState({ damageEnemy: spyDamage, performWhipStrike: spyStrike });
    const hp0 = en('z').health;
    swing();
    useGameStore.setState({ damageEnemy: orig, performWhipStrike: origStrike });
    expect(strikes).toBe(1);
    expect(calls.filter(c => c.id === 'z')).toEqual([]); // 爆発(damageEnemy の blast)は本体に入らない
    expect(en('z').health).toBeLessThan(hp0); // 打撃は入る
  });
  it('熟練度の貯まり先は鞭(打撃も爆発の与ダメも鞭に貯まる)', async () => {
    const { getPendingMastery, isMasteryRunIgnored } = await import('../utils/masteryRun');
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    liftAndWait();
    addBeside('b', 55);
    const orig = useGameStore.getState().damageEnemy;
    let blastOnB = 0, blastWhipGain = 0;
    const spyDamage: typeof orig = (id, amount, blast, ...rest) => {
      if (!(id === 'b' && blast)) return orig(id, amount, blast, ...rest);
      blastOnB++;
      const w0 = getPendingMastery().whip ?? 0;
      const r = orig(id, amount, blast, ...rest);
      blastWhipGain += (getPendingMastery().whip ?? 0) - w0;
      return r;
    };
    useGameStore.setState({ damageEnemy: spyDamage });
    const before = getPendingMastery();
    swing();
    const after = getPendingMastery();
    useGameStore.setState({ damageEnemy: orig });
    expect(blastOnB).toBe(1);
    expect(blastWhipGain).toBeGreaterThan(0); // 爆発の与ダメが鞭に貯まる
    expect(isMasteryRunIgnored()).toBe(false);
    expect(after.whip ?? 0).toBeGreaterThan(before.whip ?? 0);
    for (const k of Object.keys(after) as (keyof typeof after)[]) {
      if (k === 'whip') continue;
      expect(after[k] ?? 0).toBe(before[k] ?? 0);
    }
  });
});
