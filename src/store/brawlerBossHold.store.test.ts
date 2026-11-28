// ★ボス級も雑魚と共通の止まり(research/BRAWLER.md §11-1・社長指示2026-11-08「ボスも、雑魚と共通の止まりにしよう 数値だけ今のまま」)。
// 実際の AI(updateEnemies と各ボスの制御)を回して、①止め+②食らいの固まりで止まり、明けたら続きから動くこと、
// 技の最中は止まらないこと、固まりの長さが雑魚と同じこと、止めた後の次の技の予告が溜めの始まりから出ることを固める。
// ★§19(2026-11-10): 固まりは「確定の固まり」(gameTime の欄 brLockUntil・当たりの瞬間から 止め+受付+余白)になった。
//   旧の「止め45+基本300(壁時計の brHoldUntil)・減衰・同じ技の罰」の数字は、新しい長さ(止め45+受付150+余白34=229ms・係数1.0)へ書き換えた。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { runAngelBossTick, createAngelBossState, NOOP_ANGEL_SFX } from '../utils/angelBossTick';
import { runBountyTick, createBountyTickState, NOOP_BOUNTY_SFX } from '../utils/bountyTick';
import { brawlerHeldNow, isBrawlerTechBusy } from '../utils/brawlerCombo';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
// ★テンポ係数(§9-68): この表の時刻は係数1.0(今までの値)で書いてある。係数1.3の挙動は brawlerTempo.store.test.ts で固める。
setBrawlerTempoAll(1.0); // 記述時(describe の中で時刻を組む所)より先に効かせる=モジュールの頭で呼ぶ

let now = 9_000_000;
const DT_MS = 10;

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: 1, y: 0 } },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, health: 999999, maxHealth: 999999, id, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
/** 確定の固まりの終わりを壁時計に直した値(このテストは技の時計と壁時計を同じだけ進める)。 */
const holdEndOf = (id: string): number => now + (en(id).brLockUntil! - useGameStore.getState().gameTime);
/** 1段目(止め45ms)の確定の固まりの長さ(係数1.0): 止め45+受付150+余白34。 */
const S1_LOCK_MS = 45 + 300; // §20-4: 止め45 + 1段目の固まり300(係数1.0)
/** 1段目(止め45ms・押さない)を1発。 */
const hit = (id: string, move: 's1' | 's2' | 's3' | 'kiko' = 's1') => useGameStore.getState().triggerCounter(undefined, {
  targetIds: [id], mult: 0.01, brawler: true, stunMs: 45, kb: { kind: 'none' }, postureMult: 0.01, pressedAt: Date.now(), combo: { move },
});
/** useGameLoop と同じ順: gameTime を進め、敵の更新(行動の時計の凍結を含む)→ ボスの制御。 */
const step = (ms: number, ctrl?: (gt: number) => void, onStep?: () => void) => {
  const end = now + ms;
  while (now < end) {
    now += DT_MS;
    const gt = useGameStore.getState().gameTime + DT_MS;
    useGameStore.getState().setGameTime(gt);
    useGameStore.getState().updateEnemies(DT_MS / 1000);
    ctrl?.(gt);
    onStep?.();
  }
};

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('ボス級も雑魚と同じ固まり(§11-1)', () => {
  it('固まりの長さは雑魚と同じ(同じ技の2回目も置き換えて固める・気功はそれまでの固まりを切る、も同じ)・ボス級の止めは hitStunUntil(銃の止めと同じ枠)に書かない', () => {
    setup();
    useGameStore.setState({ enemies: [place('hunter', 80, 0, 'h'), place('zombie', -80, 0, 'z'), place('miguel', 0, 120, 'm', { bossState: 'chase' })] });
    const holds: Record<string, number[]> = { h: [], z: [], m: [] };
    const gt = () => useGameStore.getState().gameTime;
    for (const mv of ['s1', 's2', 's1', 'kiko'] as const) { // 3段目は浮かせる(§13-2)=浮きの長さが混ざるので比べない
      for (const id of ['h', 'z', 'm']) { hit(id, mv); holds[id].push((en(id).brLockUntil ?? 0) - gt()); }
      now += 50; useGameStore.setState(st => ({ gameTime: st.gameTime + 50 }));
    }
    expect(holds.h).toEqual(holds.z);
    expect(holds.m).toEqual(holds.z);
    // 1段目=345 / 2段目(50ms後)=345(置き換え) / 同じコンボで2回目の1段目も当たりの瞬間から345(置き換え・同じ技の罰は無い) / 気功=止めの終わり(45)まで切り詰め
    expect(holds.z).toEqual([S1_LOCK_MS, S1_LOCK_MS, S1_LOCK_MS, 45]);
    expect(en('h').hitStunUntil).toBeUndefined();
    expect(en('m').hitStunUntil).toBeUndefined();
  });

  it('ハンター(updateEnemies で動く): 殴ると止まり、明けたら続きから動く', () => {
    setup();
    useGameStore.setState({ enemies: [place('hunter', 260, 0, 'h')] });
    step(300); // 追いかけ始める
    const x0 = en('h').x;
    step(100);
    expect(Math.abs(en('h').x - x0)).toBeGreaterThan(1); // 動いている
    hit('h');
    const until = holdEndOf('h');
    expect(until - now).toBe(S1_LOCK_MS);
    const xs: number[] = [];
    step(until - now - 10, undefined, () => xs.push(en('h').x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.001); // 固まりの間は1pxも動かない
    step(200);
    expect(Math.abs(en('h').x - xs[xs.length - 1])).toBeGreaterThan(1); // 明けたら動く
  });

  it('天使(ミゲル・専用の制御): 追いかけの間に殴ると止まり、次の技の時計も止まる→明けたら続きから・次の技の予告は溜めの始まりから出る', () => {
    setup();
    const s = createAngelBossState();
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [place('miguel', 220, 0, 'm', { bossState: 'chase', bossNextActionAt: gt0 + 900 })] });
    const ctrl = (gt: number) => runAngelBossTick(s, gt, DT_MS / 1000, 1, NOOP_ANGEL_SFX, () => {});
    step(100, ctrl);
    expect(en('m').bossState).toBe('chase');
    const remain0 = en('m').bossNextActionAt! - useGameStore.getState().gameTime;
    hit('m');
    expect(brawlerHeldNow(en('m'), useGameStore.getState().gameTime, now)).toBe(true);
    const until = holdEndOf('m');
    const pos0 = { x: en('m').x, y: en('m').y };
    step(until - now - 10, ctrl);
    expect(en('m').x).toBeCloseTo(pos0.x, 6);
    expect(en('m').y).toBeCloseTo(pos0.y, 6);
    expect(en('m').bossState).toBe('chase'); // 止まっている間に技は始まらない
    // 次の技までの残りは、殴った時の残りのまま(据え置き=明けたら続きから)
    { // 据え置き(凍結は次のフレームの頭から効くので、ずれは最大1フレーム)
      const r = en('m').bossNextActionAt! - useGameStore.getState().gameTime;
      expect(r).toBeLessThanOrEqual(remain0 + 0.001);
      expect(r).toBeGreaterThanOrEqual(remain0 - DT_MS - 0.001);
    }
    // 明けた後、技に入ったフレームで「溜めの始まり」が今の時刻(=予告がその瞬間から出る)
    let entered: { gt: number; st?: string; ws?: number; until?: number } | null = null;
    step(3000, ctrl, () => {
      const e = en('m');
      if (!entered && e.bossState !== 'chase' && e.bossState !== undefined) {
        entered = { gt: useGameStore.getState().gameTime, st: e.bossState, ws: e.bossWindupStartAt, until: e.bossStateUntil };
      }
    });
    expect(entered).not.toBeNull();
    const ent = entered!;
    expect(ent.until!).toBeGreaterThan(ent.gt); // 溜めは丸ごと残っている(固まりの分だけ詰まっていない)
    if (ent.ws !== undefined) expect(ent.ws).toBe(ent.gt);
  });

  it('天使: 技の最中(溜め)は止まらない=固まりを書かず、溜めはそのまま進む', () => {
    setup();
    const s = createAngelBossState();
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [place('miguel', 220, 0, 'm', { bossState: 'chase', bossNextActionAt: gt0 + 20 })] });
    const ctrl = (gt: number) => runAngelBossTick(s, gt, DT_MS / 1000, 1, NOOP_ANGEL_SFX, () => {});
    for (let i = 0; i < 300 && (en('m').bossState ?? 'chase') === 'chase'; i++) step(10, ctrl);
    const st = en('m').bossState;
    expect(st).not.toBe('chase');
    const stUntil = en('m').bossStateUntil;
    hit('m');
    expect(en('m').brHoldUntil).toBeUndefined();
    expect(en('m').brLockUntil).toBeUndefined(); // 技の最中のボス級には確定の固まりも書かない
    expect(brawlerHeldNow(en('m'), useGameStore.getState().gameTime, now)).toBe(false);
    step(30, ctrl);
    // 溜めの期限は据え置かれていない(技は止まらない)
    if (en('m').bossState === st && stUntil !== undefined) expect(en('m').bossStateUntil).toBe(stUntil);
  });

  it('賞金首(専用の制御): 追いかけの間に殴ると止まり、明けたら続きから', () => {
    setup();
    const s = createBountyTickState();
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [place('bounty-melee', 240, 0, 'b', { bossState: 'chase', bossNextActionAt: gt0 + 5000 })] });
    s.activeId = 'b';
    const ctrl = (gt: number) => runBountyTick(en('b'), s, gt, DT_MS / 1000, 1, now, NOOP_BOUNTY_SFX);
    step(200, ctrl);
    const x1 = en('b').x;
    step(100, ctrl);
    expect(Math.abs(en('b').x - x1)).toBeGreaterThan(1); // 追いかけている
    const remain0 = en('b').bossNextActionAt! - useGameStore.getState().gameTime;
    hit('b');
    const until = holdEndOf('b');
    expect(until - now).toBe(S1_LOCK_MS);
    const xs: number[] = [];
    step(until - now - 10, ctrl, () => xs.push(en('b').x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.001);
    { // 据え置き(凍結は次のフレームの頭から効くので、ずれは最大1フレーム)
      const r = en('b').bossNextActionAt! - useGameStore.getState().gameTime;
      expect(r).toBeLessThanOrEqual(remain0 + 0.001);
      expect(r).toBeGreaterThanOrEqual(remain0 - DT_MS - 0.001);
    }
    step(200, ctrl);
    expect(Math.abs(en('b').x - xs[xs.length - 1])).toBeGreaterThan(1);
  });
});

// ★技の後の硬直・休み・帰りも固める(社長指示2026-11-09「技を出し終えた隙に殴って固める=確定反撃」)。
describe('硬直・休み・帰りの相も固める(§11-1・§9-69)', () => {
  it('止める相/止めない相の表(雑魚の aiPhase・ボスの bossState)', () => {
    const gt = 1000;
    const busy = (o: Partial<Enemy>) => isBrawlerTechBusy(o as Enemy, gt);
    // 止める(技ではない)
    for (const ph of ['z-recover', 's-recover', 'recover', 'dash-recover', 'b-release', 'driller-thrust-recover', 'logger-sweep-recover', 'g-stomp-recover', 'g-jump-recover', 'g-tailslam-recover']) {
      expect(busy({ aiPhase: ph as Enemy['aiPhase'] }), ph).toBe(false);
    }
    for (const st of ['chase', 'return', 'idol-rest', 'hero-idle', 'volley-recover', 'jump-recover', 'thor-dash-recover', 'bm-combo1-recover', 'br-push-recover', 'idol-punch-recover', 'hero-recover', 'phill-dive-recover']) {
      expect(busy({ bossState: st as Enemy['bossState'] }), st).toBe(false);
    }
    // 止めない(予告の溜め・攻撃の最中)
    for (const ph of ['windup', 'charge', 'jump', 'g-stomp-windup', 'g-jump-air', 'z-red-pause', 'z-stagger', 's-arc']) {
      expect(busy({ aiPhase: ph as Enemy['aiPhase'] }), ph).toBe(true);
    }
    for (const st of ['volley-windup', 'volley', 'jump-windup', 'thor-dash-move', 'bm-combo1-windup', 'laser-fire', 'phill-wingcombo-gap', 'hero-windup', 'hero-flinch']) {
      expect(busy({ bossState: st as Enemy['bossState'] }), st).toBe(true);
    }
  });

  it('天使(ミゲル): 技の後の硬直に殴ると固まり、硬直の残りも止まる→明けたら残りの硬直→次の技の予告は溜めの始まりから', () => {
    setup();
    const s = createAngelBossState();
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [place('miguel', 160, 0, 'm', { bossState: 'volley-recover', bossStateUntil: gt0 + 300, bossNextActionAt: gt0 + 2000 })] });
    const ctrl = (gt: number) => runAngelBossTick(s, gt, DT_MS / 1000, 1, NOOP_ANGEL_SFX, () => {});
    step(50, ctrl);
    expect(en('m').bossState).toBe('volley-recover');
    const remain0 = en('m').bossStateUntil! - useGameStore.getState().gameTime; // 250
    hit('m');
    const until = holdEndOf('m');
    expect(until - now).toBe(S1_LOCK_MS);
    step(until - now - 10, ctrl);
    expect(en('m').bossState).toBe('volley-recover'); // 固まりの間は硬直が明けない
    const remainHeld = en('m').bossStateUntil! - useGameStore.getState().gameTime;
    expect(remainHeld).toBeLessThanOrEqual(remain0 + 0.001);
    expect(remainHeld).toBeGreaterThanOrEqual(remain0 - DT_MS - 0.001); // 残りは止まっている(最大1フレームのずれ)
    // 明けたら残りの硬直のぶんだけ硬直のまま(短くならない・伸びすぎない)
    let leftAt = -1;
    const gHoldEnd = useGameStore.getState().gameTime + 10;
    step(1500, ctrl, () => { if (leftAt < 0 && en('m').bossState !== 'volley-recover') leftAt = useGameStore.getState().gameTime; });
    expect(leftAt).toBeGreaterThan(0);
    expect(leftAt - gHoldEnd).toBeGreaterThanOrEqual(remainHeld - 2 * DT_MS);
    expect(leftAt - gHoldEnd).toBeLessThanOrEqual(remainHeld + 2 * DT_MS);
    // 次の技に入ったフレームで、溜めの始まりが今の時刻(=予告がその瞬間から出る)
    let entered: { gt: number; ws?: number; until?: number } | null = null;
    step(4000, ctrl, () => {
      const e = en('m');
      if (!entered && e.bossState !== 'chase' && e.bossState !== 'volley-recover' && e.bossState !== undefined) {
        entered = { gt: useGameStore.getState().gameTime, ws: e.bossWindupStartAt, until: e.bossStateUntil };
      }
    });
    expect(entered).not.toBeNull();
    const ent = entered!;
    expect(ent.until!).toBeGreaterThan(ent.gt);
    if (ent.ws !== undefined) expect(ent.ws).toBe(ent.gt);
  });

  it('雑魚(ゾンビ)の 2連の後の硬直(z-recover)も同じ: 固まりの間は硬直の残りが止まり、明けたら続きから', () => {
    setup();
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [place('zombie', 50, 0, 'z', { health: 99999, maxHealth: 99999, aiPhase: 'z-recover', aiPhaseUntil: gt0 + 400 })] });
    step(50);
    const remain0 = en('z').aiPhaseUntil! - useGameStore.getState().gameTime;
    hit('z');
    const until = holdEndOf('z');
    step(until - now - 10);
    expect(en('z').aiPhase).toBe('z-recover');
    const r = en('z').aiPhaseUntil! - useGameStore.getState().gameTime;
    expect(r).toBeLessThanOrEqual(remain0 + 0.001);
    expect(r).toBeGreaterThanOrEqual(remain0 - DT_MS - 0.001);
    let leftAt = -1;
    const gHoldEnd = useGameStore.getState().gameTime + 10;
    step(800, undefined, () => { if (leftAt < 0 && en('z').aiPhase !== 'z-recover') leftAt = useGameStore.getState().gameTime; });
    expect(leftAt - gHoldEnd).toBeGreaterThanOrEqual(r - 2 * DT_MS);
    expect(leftAt - gHoldEnd).toBeLessThanOrEqual(r + 2 * DT_MS);
  });
});

// ★社長承認2026-11-09「硬直中に浮かせても硬直の続きを残す」: 格闘の浮きも固まりと同じ「止めるだけ」。
describe('格闘の浮きも止めるだけ(§12-1・§9-71)', () => {
  it('天使(ミゲル)の技の後の硬直に4段目で浮かせる→浮き+固まりの間は硬直の残りが止まる→着地後に残りの硬直→次の技は溜めの始まりから', () => {
    setup();
    const s = createAngelBossState();
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [place('miguel', 160, 0, 'm', { bossState: 'volley-recover', bossStateUntil: gt0 + 300, bossNextActionAt: gt0 + 2000 })] });
    const ctrl = (gt: number) => runAngelBossTick(s, gt, DT_MS / 1000, 1, NOOP_ANGEL_SFX, () => {});
    step(50, ctrl);
    const remain0 = en('m').bossStateUntil! - useGameStore.getState().gameTime;
    useGameStore.getState().triggerCounter(undefined, {
      targetIds: ['m'], mult: 0.01, brawler: true, stunMs: 45, kb: { kind: 'none' }, postureMult: 0.01, pressedAt: Date.now(), lift: true, combo: { move: 's4' },
    });
    const liftUntil = en('m').liftUntil!;
    expect(liftUntil).toBeGreaterThan(now);
    expect(en('m').brLiftUntil).toBe(liftUntil);
    const pos0 = { x: en('m').x, y: en('m').y };
    step(liftUntil - now - 10, ctrl);
    expect(en('m').bossState).toBe('volley-recover'); // 浮いている間に硬直が飛ばない(崩さない)
    expect(en('m').x).toBeCloseTo(pos0.x, 6);
    const rLift = en('m').bossStateUntil! - useGameStore.getState().gameTime;
    expect(rLift).toBeLessThanOrEqual(remain0 + 0.001);
    expect(rLift).toBeGreaterThanOrEqual(remain0 - DT_MS - 0.001);
    // 浮きの後は固まり(4段目の固まりは浮きの終わりから数える)→ 明けたら残りの硬直
    // 固まりの欄は brLockUntil(浮きの終わりより後ろへ延びる。ボス級は強個体と同じ重さ0.7で浮きが短いぶん、固まりが浮きの終わりを越える)。
    step(20, ctrl); // 着地(固まりの欄は着地で決まる)
    step(Math.max(0, (en('m').brLockUntil ?? 0) - useGameStore.getState().gameTime - 10), ctrl); // brLockUntil はゲーム時計(liftUntil は now 軸)
    expect(en('m').bossState).toBe('volley-recover');
    const rHold = en('m').bossStateUntil! - useGameStore.getState().gameTime;
    expect(rHold).toBeGreaterThanOrEqual(remain0 - 2 * DT_MS - 0.001);
    let leftAt = -1;
    const gEnd = useGameStore.getState().gameTime + 10;
    step(1500, ctrl, () => { if (leftAt < 0 && en('m').bossState !== 'volley-recover') leftAt = useGameStore.getState().gameTime; });
    expect(leftAt - gEnd).toBeGreaterThanOrEqual(rHold - 2 * DT_MS);
    expect(leftAt - gEnd).toBeLessThanOrEqual(rHold + 2 * DT_MS);
    let entered: { gt: number; ws?: number; until?: number } | null = null;
    step(4000, ctrl, () => {
      const e = en('m');
      if (!entered && e.bossState !== 'chase' && e.bossState !== 'volley-recover' && e.bossState !== undefined) {
        entered = { gt: useGameStore.getState().gameTime, ws: e.bossWindupStartAt, until: e.bossStateUntil };
      }
    });
    expect(entered).not.toBeNull();
    const ent = entered!;
    expect(ent.until!).toBeGreaterThan(ent.gt);
    if (ent.ws !== undefined) expect(ent.ws).toBe(ent.gt);
  });

  it('雑魚(ゾンビ)の z-recover に4段目: 浮きの間も硬直の残りが止まる(旧: 浮きの間に硬直が進んで短くなっていた)', () => {
    setup();
    const gt0 = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [place('zombie', 50, 0, 'z', { health: 99999, maxHealth: 99999, aiPhase: 'z-recover', aiPhaseUntil: gt0 + 400 })] });
    step(50);
    const remain0 = en('z').aiPhaseUntil! - useGameStore.getState().gameTime;
    useGameStore.getState().triggerCounter(undefined, {
      targetIds: ['z'], mult: 0.01, brawler: true, stunMs: 45, kb: { kind: 'none' }, postureMult: 0.01, pressedAt: Date.now(), lift: true, combo: { move: 's4' },
    });
    const liftUntil = en('z').liftUntil!;
    step(liftUntil - now - 10);
    expect(en('z').aiPhase).toBe('z-recover');
    const r = en('z').aiPhaseUntil! - useGameStore.getState().gameTime;
    expect(r).toBeGreaterThanOrEqual(remain0 - DT_MS - 0.001);
  });
});
