// ★スキル「縮地」(SKILL_BUILD_REDESIGN.md §32)の受け入れ条件をストアを実際に動かして固定する。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 5_000_000;

const setup = (level = 1) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true },
    player: { ...st.player, skills: ['shukuchi'], skillLevels: { shukuchi: level }, counterCooldownEnd: 0, pendingSwingAt: 0 },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const zombieAt = (dx: number, dy: number, health = 1, id?: string) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = health;
  if (id) e.id = id;
  return e;
};
const openWindow = (chain = 0) => useGameStore.setState(st => ({
  player: { ...st.player, shukuchiWindowUntil: st.gameTime + 2000, shukuchiChain: chain, counterCooldownEnd: 0, pendingSwingAt: 0 },
}));
const warpAndStrike = () => {
  expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
  useGameStore.getState().movePlayer(NO_INPUT, 0.016);
  return useGameStore.getState().resolveShukuchiStrike();
};

beforeEach(() => { now = 5_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); });
afterEach(() => { vi.restoreAllMocks(); });

describe('縮地: 窓を開く', () => {
  it('プレイヤー本人の近接で倒すと窓が開く(連鎖0)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(10, 0)] });
    useGameStore.getState().triggerCounter();
    const p = useGameStore.getState().player;
    expect(p.shukuchiWindowUntil ?? 0).toBeGreaterThan(useGameStore.getState().gameTime);
    expect(p.shukuchiChain).toBe(0);
  });
  it('スキルが無ければ開かない', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, skills: [] }, enemies: [zombieAt(10, 0)] }));
    useGameStore.getState().triggerCounter();
    expect(useGameStore.getState().player.shukuchiWindowUntil ?? 0).toBe(0);
  });
});

describe('縮地: 窓の中の振り', () => {
  it('射程内の最寄りの敵の手前へ瞬間移動して斬り、倒せば窓が開き直って連鎖+1', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(300, 0, 1, 'near'), zombieAt(380, 0, 1, 'far')] });
    openWindow();
    const before = center();
    const r = warpAndStrike();
    const after = center();
    expect(after.x - before.x).toBeGreaterThan(200); // 瞬間移動した
    expect(r?.swung).toBe(true);
    expect(r?.killed ?? 0).toBeGreaterThan(0);
    const p = useGameStore.getState().player;
    const near = useGameStore.getState().enemies.find(e => e.id === 'near');
    expect(!near || near.corpseUntil !== undefined).toBe(true); // 最寄りを斬った(倒れて死体になる)
    const far = useGameStore.getState().enemies.find(e => e.id === 'far');
    expect(far?.corpseUntil).toBeUndefined(); // 奥の敵は斬っていない
    expect(p.shukuchiChain).toBe(1);
    expect(p.shukuchiWindowUntil ?? 0).toBeGreaterThan(useGameStore.getState().gameTime);
    expect(p.invulnerable).toBe(true); // ワープ直後は無敵
  });
  it('2発目からダメージ+20%ずつ(連鎖2の状態で振る=3発目=×1.4)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(300, 0, 99999)] });
    openWindow(2);
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    expect(useGameStore.getState().player.shukuchiStrikeMult).toBeCloseTo(1.4);
  });
  it('倒せなければ窓が閉じ、連鎖は0', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(300, 0, 99999)] });
    openWindow(3);
    const r = warpAndStrike();
    expect(r?.killed).toBe(0);
    const p = useGameStore.getState().player;
    expect(p.shukuchiWindowUntil).toBe(0);
    expect(p.shukuchiChain).toBe(0);
  });
  it('射程外(Lv1=400px)の敵には飛ばず、通常の振り(前隙)になる。窓は残る', () => {
    setup(1);
    useGameStore.setState({ enemies: [zombieAt(600, 0)] });
    openWindow();
    const until = useGameStore.getState().player.shukuchiWindowUntil;
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.shukuchiWarpTo).toBeUndefined();
    expect(p.pendingSwingAt).toBeGreaterThan(0);
    expect(p.shukuchiWindowUntil).toBe(until);
  });
  it('Lv3は600pxまで飛ぶ', () => {
    setup(3);
    useGameStore.setState({ enemies: [zombieAt(560, 0)] });
    openWindow();
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    expect(useGameStore.getState().player.shukuchiWarpTo).toBeDefined();
  });
  it('窓が閉じていれば通常の振り', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(300, 0)] });
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    expect(useGameStore.getState().player.shukuchiWarpTo).toBeUndefined();
  });
});

describe('縮地: 台帳とガチャ', () => {
  it('超レアで、眠っておらず、ガチャの超レア枠から出る', async () => {
    const c = await import('../data/campaign');
    expect(c.SKILLS.shukuchi.rarity).toBe('super');
    expect(c.NEW_SLEEPING_SKILLS).not.toContain('shukuchi');
    expect(c.GACHA_EXCLUDED_SKILLS).not.toContain('shukuchi');
    expect(c.OBTAINABLE_SKILL_KEYS).toContain('shukuchi');
  });
});
