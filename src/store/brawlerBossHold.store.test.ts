// ★ボス級も雑魚と共通の止まり(research/BRAWLER.md §11-1・社長指示2026-11-08「ボスも、雑魚と共通の止まりにしよう 数値だけ今のまま」)。
// 実際の AI(updateEnemies と各ボスの制御)を回して、①止め+②食らいの固まりで止まり、明けたら続きから動くこと、
// 技の最中は止まらないこと、固まりの長さが雑魚と同じこと、止めた後の次の技の予告が溜めの始まりから出ることを固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { runAngelBossTick, createAngelBossState, NOOP_ANGEL_SFX } from '../utils/angelBossTick';
import { runBountyTick, createBountyTickState, NOOP_BOUNTY_SFX } from '../utils/bountyTick';
import { brawlerHeldNow } from '../utils/brawlerCombo';

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
/** 1段目(止め45ms・押さない)を1発。 */
const hit = (id: string, move: 's1' | 's2' | 's3' = 's1') => useGameStore.getState().triggerCounter(undefined, {
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
  it('固まりの長さ(止め+固まり)と減衰は雑魚と同じ・ボス級の止めは hitStunUntil(銃の止めと同じ枠)に書かない', () => {
    setup();
    useGameStore.setState({ enemies: [place('hunter', 80, 0, 'h'), place('zombie', -80, 0, 'z'), place('miguel', 0, 120, 'm', { bossState: 'chase' })] });
    const holds: Record<string, number[]> = { h: [], z: [], m: [] };
    for (const mv of ['s1', 's2', 's3', 's1'] as const) {
      for (const id of ['h', 'z', 'm']) { hit(id, mv); holds[id].push(en(id).brHoldUntil! - now); }
      now += 200;
    }
    expect(holds.h).toEqual(holds.z);
    expect(holds.m).toEqual(holds.z);
    expect(holds.z[3]).toBeLessThan(holds.z[0]); // 減衰+同じ技の罰
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
    const until = en('h').brHoldUntil!;
    expect(until - now).toBe(45 + 300);
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
    const until = en('m').brHoldUntil!;
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
    const until = en('b').brHoldUntil!;
    expect(until - now).toBe(45 + 300);
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
