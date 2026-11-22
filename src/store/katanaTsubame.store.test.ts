// ※一閃は噛みつき側の敵の足元の箱で止められる(今の挙動)ので、通り道の敵は少し下(足元が体の下)に置く。
// 刀の燕返し・一閃の浮き・切り傷・殺陣(research/KATANA_TSUBAME.md §3・§4 受け入れ条件)をストアを動かして固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, KATANA_DASH_MS, KATANA_DASH_DISTANCE } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { brawlerAirborne } from '../utils/brawlerCombo';
import { SATSUJIN_HITS, SATSUJIN_STRIKE_MS, KATANA_CUT_MAX, isTsubameCrouching, tsubameDashMs } from '../utils/katanaTsubame';

let now = 17_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(st => ({ gameTime: st.gameTime + ms }));
  vi.advanceTimersByTime(ms);
  useGameStore.getState().movePlayer(NO, ms / 1000);
  useGameStore.getState().updateEnemies(ms / 1000);
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
const st = () => useGameStore.getState();
/** 次の一閃を出せるように硬直・CDを明ける。 */
const ready = () => useGameStore.setState(s => ({ player: { ...s.player, katanaRecoveryUntil: 0, katanaDashCooldownEnd: 0, counterCooldownEnd: 0 } }));

beforeEach(() => {
  now = 17_000_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    enemies: [], breakableProps: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false },
    player: { ...s.player, x: -3000, y: 9000, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('一閃(今の挙動+浮き)', () => {
  it('一閃が当たった敵は浮く(押しは真上へ置き換え)・切り傷1本・燕返しの受付が開く・技の行「一閃」', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'z')] });
    const origin = center();
    expect(st().triggerKatanaDash(1, 0)).toBe(true);
    expect(st().skillProcFeed.some(r => r.key === 'tech:issen')).toBe(true);
    run(KATANA_DASH_MS + 10);
    const z = en('z');
    expect(z.health).toBeLessThan(99999);
    expect(brawlerAirborne(z, now)).toBe(true);
    expect(z.knockbackVx ?? 0).toBe(0);
    expect(z.katanaCuts).toBe(1);
    const w = st().tsubameWindow!;
    expect(w.originX).toBeCloseTo(origin.x);
    expect(w.hitIds).toEqual(['z']);
  });
  it('ボス級は重さどおり(浮くが雑魚より低い)', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'z'), place('hunter', 110, -50, 'h')] });
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS + 10);
    expect(en('h').health).toBeLessThan(99999);
    const hPeak = brawlerAirborne(en('h'), now) ? en('h').brLiftPeak ?? 0 : 0;
    expect(hPeak).toBeLessThan(en('z').brLiftPeak ?? 0);
  });
  it('当たっていない一閃では受付は開かない', () => {
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS + 10);
    expect(st().tsubameWindow).toBeNull();
    expect(st().tryTsubame(-1, 0)).toBe(false);
  });
});

describe('燕返し', () => {
  it('300ms以内の反対フリックで、元の位置へ戻るように走ったと仮定した通り道の敵に当たる(体は動かない)。浮かせず、止めの後に走った向きへ吹き飛ぶ。1回まで', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'z')] });
    const origin = center();
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS + 10);
    const landed = center();
    expect(landed.x - origin.x).toBeGreaterThan(KATANA_DASH_DISTANCE * 0.6);
    // 帰り道に別の敵(地上)を置く。
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', -70, 30, 'r')] }));
    run(100);
    expect(st().tryTsubame(-1, 0.1)).toBe(true);
    expect(st().skillProcFeed.some(r => r.key === 'tech:tsubame')).toBe(true);
    expect(st().tryTsubame(-1, 0)).toBe(false); // 1回まで
    const rx0 = en('r').x;
    const atTsubame = center();
    let hitAtMs = -1;
    for (let t = 0; t < KATANA_DASH_MS + 40; t += 10) {
      step(10);
      if (hitAtMs < 0 && en('r').health < 99999) hitAtMs = now;
      // ★燕返しの間、体は一閃で着いた位置から動かない(社長指示2026-11-22)。
      expect(center().x).toBeCloseTo(atTsubame.x, 6);
      expect(center().y).toBeCloseTo(atTsubame.y, 6);
    }
    expect(hitAtMs).toBeGreaterThan(0);
    const r = en('r');
    expect(brawlerAirborne(r, now)).toBe(false); // 燕返しは浮かせない
    expect(r.katanaCuts).toBe(1);
    expect(r.knockbackVx ?? 0).toBeLessThan(0); // 走った向き(左)へ
    // 止めの間は動かない → 明けてから吹き飛ぶ。
    const stopEnd = r.hitStunUntil ?? now;
    expect(stopEnd).toBeGreaterThan(now);
    const xDuring = r.x;
    while (now < stopEnd - 10) step(10);
    expect(en('r').x).toBeCloseTo(xDuring, 5);
    expect(xDuring).toBeCloseTo(rx0, 5);
    run(300);
    expect(en('r').x).toBeLessThan(xDuring - 10);
    // 燕返しの後に受付は開かない(連鎖しない)。
    expect(st().tsubameWindow).toBeNull();
  });
  it('燕返しの間はしゃがんで止まり(走っていた時間と同じだけ)、無敵ではない=ふつうに被弾する', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'z')] });
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS + 10);
    // 一閃の無敵はループ側が INVULN_MS で外す(このテストはループを回さないので、明けた状態を手で作る)。
    useGameStore.setState(s => ({ player: { ...s.player, invulnerable: false, abilityInvulnUntil: 0 } }));
    run(50);
    const p0 = center();
    const dist = Math.min(KATANA_DASH_DISTANCE, Math.hypot(p0.x - st().tsubameWindow!.originX, p0.y - st().tsubameWindow!.originY));
    const t0 = now;
    expect(st().tryTsubame(-1, 0)).toBe(true);
    const p = st().player;
    expect(p.invulnerable).toBe(false);
    expect(isTsubameCrouching(p, now)).toBe(true);
    expect(p.tsubameCrouchUntil).toBe(t0 + tsubameDashMs(dist, KATANA_DASH_DISTANCE, KATANA_DASH_MS));
    run(20);
    const hp = st().player.health;
    st().damagePlayer(10, 'test');
    expect(st().player.health).toBeLessThan(hp);
    // しゃがみが明ければ解ける。
    run(KATANA_DASH_MS + 20);
    expect(isTsubameCrouching(st().player, now)).toBe(false);
  });
  it('300msを過ぎた・反対でない向きでは出ない', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'z')] });
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS + 10);
    expect(st().tryTsubame(1, 0)).toBe(false);  // 進行方向
    expect(st().tryTsubame(0, 1)).toBe(false);  // 横
    run(320);
    expect(st().tryTsubame(-1, 0)).toBe(false); // 300ms過ぎ
  });
});

describe('切り傷と殺陣', () => {
  it('同じ敵に一閃4回→5回目で殺陣(5発・無敵・傷0に戻る・燕返しは出ない・技の行「殺陣」)', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'z'), place('zombie', 90, 200, 'other', { katanaCuts: 3 })] });
    for (let i = 0; i < KATANA_CUT_MAX; i++) {
      ready();
      // 毎回プレイヤーの右90pxへ敵を置き直す(浮き・押しを消して地上へ)。
      const c = center();
      useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z' ? { ...e, x: c.x + 90 - e.width / 2, y: c.y + 30 - e.height / 2, brLiftUntil: undefined, brawlerLiftAt: undefined, liftUntil: undefined, knockbackVx: 0, knockbackVy: 0, brBlastNoLiftUntil: undefined } : e)) }));
      expect(st().triggerKatanaDash(1, 0)).toBe(true);
      run(KATANA_DASH_MS + 10);
      expect(en('z').katanaCuts).toBe(i + 1);
      expect(st().satsujin).toBeNull();
      run(600);
      useGameStore.setState(s => ({ player: { ...s.player, x: s.player.x - KATANA_DASH_DISTANCE } }));
    }
    expect(en('other').katanaCuts).toBe(3); // 別の敵の傷は数えない
    ready();
    const c = center();
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z' ? { ...e, x: c.x + 90 - e.width / 2, y: c.y + 30 - e.height / 2, brLiftUntil: undefined, liftUntil: undefined, knockbackVx: 0, knockbackVy: 0 } : e)) }));
    const hp0 = en('z').health;
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS); // 着地
    run(10);
    const sat = st().satsujin!;
    expect(sat).not.toBeNull();
    expect(sat.targetId).toBe('z');
    expect(st().skillProcFeed.some(r => r.key === 'tech:satsujin')).toBe(true);
    expect(en('z').katanaCuts).toBe(0);
    expect(st().tsubameWindow).toBeNull();
    expect(st().tryTsubame(-1, 0)).toBe(false);
    // 殺陣の間ずっと無敵。
    for (let t = 0; t < (SATSUJIN_HITS - 1) * SATSUJIN_STRIKE_MS + 20; t += 10) {
      step(10);
      const p = st().player;
      expect(p.invulnerable).toBe(true);
    }
    expect(st().satsujin?.strikes.length).toBe(SATSUJIN_HITS);
    expect(en('z').health).toBeLessThan(hp0);
    expect(en('z').katanaCuts).toBe(0); // 殺陣の各発は数えない
    run(600);
    expect(st().satsujin).toBeNull();
  });
  it('4本未満では殺陣にならない', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'z', { katanaCuts: 3 })] });
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS + 20);
    expect(st().satsujin).toBeNull();
    expect(en('z').katanaCuts).toBe(4);
  });
});
