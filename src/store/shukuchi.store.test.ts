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

describe('縮地: 入口と不成立(検収監査の是正)', () => {
  it('PC/ボットの直呼び(triggerCounter())でもワープして斬る', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(300, 0)] });
    openWindow();
    const before = center();
    const r0 = useGameStore.getState().triggerCounter();
    expect(r0.swung).toBe(false); // 予約のみ(斬撃は解決で出る)
    expect(useGameStore.getState().player.shukuchiWarpTo).toBeDefined();
    useGameStore.getState().movePlayer(NO_INPUT, 0.016);
    const r = useGameStore.getState().resolveShukuchiStrike();
    expect(center().x - before.x).toBeGreaterThan(200);
    expect(r?.killed ?? 0).toBeGreaterThan(0);
    expect(useGameStore.getState().player.shukuchiChain).toBe(1);
  });
  it('着地が押し出されて刃が届かなければ、窓と連鎖は残る', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(300, 0, 99999)] });
    openWindow(2);
    const until = useGameStore.getState().player.shukuchiWindowUntil;
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    useGameStore.getState().movePlayer(NO_INPUT, 0.016);
    // 押し出された体で解決する(相手から遠ざける)。
    useGameStore.setState(st => ({ player: { ...st.player, x: st.player.x - 200 } }));
    const r = useGameStore.getState().resolveShukuchiStrike();
    expect(r?.killed).toBe(0);
    const p = useGameStore.getState().player;
    expect(p.shukuchiWindowUntil).toBe(until);
    expect(p.shukuchiChain).toBe(2);
  });
  it('鞭でも連鎖の上乗せが乗る(3発目=×1.4)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // クリティカルを出さない
    const dealt = (chain: number) => {
      setup();
      useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['whip'], whipCharged: false, whipHitCount: 0 } }));
      useGameStore.setState({ enemies: [zombieAt(300, 0, 99999, 'z')] });
      openWindow(chain);
      warpAndStrike();
      const z = useGameStore.getState().enemies.find(e => e.id === 'z');
      return 99999 - (z?.health ?? 99999);
    };
    const base = dealt(0);
    expect(base).toBeGreaterThan(0);
    expect(dealt(2) / base).toBeCloseTo(1.4, 1);
  });
});

describe('縮地: 上乗せはワープ斬撃の打撃だけ', () => {
  it('同じ振りで投げるドローンブーメランには上乗せが乗らない', () => {
    const boomDamage = (chain: number) => {
      setup();
      useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['drone-boomerang'], subWeaponCooldowns: {} } }));
      useGameStore.setState({ enemies: [zombieAt(300, 0, 99999)] });
      openWindow(chain);
      warpAndStrike();
      return useGameStore.getState().projectiles.find(pr => pr.weaponType === 'drone-boomerang-projectile')?.damage;
    };
    const base = boomDamage(0);
    expect(base).toBeGreaterThan(0);
    expect(boomDamage(4)).toBe(base);
  });
});

describe('縮地: 行けない場所へは出ない', () => {
  it('囲いの円の外の敵へ飛んでも、体は円の内側に留まる(着地は通常の移動と同じクランプを通る)', () => {
    setup();
    const c = center();
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState({
      activeEvent: { kind: 'horde', x: c.x, y: c.y, radius: 150, startedAt: gt, endsAt: gt + 60000, holdMs: 0 } as never,
      enemies: [zombieAt(300, 0, 99999)],
    });
    openWindow();
    warpAndStrike();
    const after = center();
    expect(after.x - c.x).toBeGreaterThan(100); // 飛んではいる(円の縁まで)
    expect(Math.hypot(after.x - c.x, after.y - c.y)).toBeLessThanOrEqual(150);
  });
});

describe('縮地: 刀は一閃に限る / 窓が開いている間の連鎖(社長裁定2026-10-01)', () => {
  const katana = () => useGameStore.setState(st => ({ player: { ...st.player, subWeapons: [...st.player.subWeapons, 'katana'] } }));
  it('刀のワープ斬撃は一閃(気絶中の敵を処刑できる)', () => {
    setup(); katana();
    const gt = useGameStore.getState().gameTime;
    const z = zombieAt(300, 0, 99999, 'z');
    useGameStore.setState({ enemies: [{ ...z, stunUntil: gt + 5000 }] });
    openWindow();
    const r = warpAndStrike();
    expect(r?.finish).toBe(true);
  });
  it('刀のワープ一閃にも連鎖の上乗せが乗る(3発目=×1.4)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // クリティカルを出さない
    const dealt = (chain: number) => {
      setup(); katana();
      useGameStore.setState({ enemies: [zombieAt(300, 0, 999999, 'z')] });
      openWindow(chain);
      warpAndStrike();
      return 999999 - (useGameStore.getState().enemies.find(e => e.id === 'z')?.health ?? 999999);
    };
    const base = dealt(0);
    expect(base).toBeGreaterThan(0);
    expect(dealt(2) / base).toBeCloseTo(1.4, 1);
  });
  it('刀のオート斬撃で倒しても窓は開かない。一閃で倒すと開く', () => {
    setup(); katana();
    useGameStore.setState({ enemies: [zombieAt(20, 0, 1, 'a')] });
    useGameStore.getState().performKatanaStrike(['a'], 1, false);
    expect(useGameStore.getState().player.shukuchiWindowUntil ?? 0).toBe(0);
    useGameStore.setState({ enemies: [zombieAt(20, 0, 1, 'b')] });
    useGameStore.getState().performKatanaStrike(['b'], 3, true);
    expect(useGameStore.getState().player.shukuchiWindowUntil ?? 0).toBeGreaterThan(useGameStore.getState().gameTime);
  });
  it('窓が開いている間のワープ以外の撃破は、窓を延ばして連鎖は残す', () => {
    setup();
    openWindow(3);
    useGameStore.setState({ enemies: [zombieAt(10, 0)] });
    useGameStore.getState().triggerCounter(Date.now()); // 前隙の解決=通常の振り(ワープの予約に入らない)
    const p = useGameStore.getState().player;
    expect(p.shukuchiChain).toBe(3);
    expect(p.shukuchiWindowUntil ?? 0).toBeGreaterThan(useGameStore.getState().gameTime);
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
