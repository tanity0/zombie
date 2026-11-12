// ★格闘のステップの出始めの無敵(社長指示2026-11-12「格闘のステップに無敵時間を入れる。出始めの0.2秒のみ」)。
// 踏み出した瞬間から BRAWLER_STEP_IFRAME_MS(壁時計・テンポ係数は掛けない。ステップより長ければステップの長さで打ち切る)の間、
// damagePlayer を通る攻撃を受けない。乗せる先は既存の被弾無敵(invulnerable/invulnerableTime・ループが INVULN_MS で外す)。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore, INVULN_MS, KATANA_DASH_MS } from './gameStore';
import { BRAWLER_STEP_IFRAME_MS, BRAWLER_STEP_MS, BRAWLER_TEMPO_DEFAULT, BRAWLER_WORLD_STOP } from '../utils/brawler';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';

setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); // 実機の既定(1.3)=ステップ 234ms > 無敵 200ms

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    enemies: [],
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false, invulnerableTime: 0,
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 },
      lastDirection: { x: 1, y: 0 },
    },
  }));
};
/** ゲームループ相当: 壁時計と gameTime を進め、移動・格闘を解き、被弾無敵を INVULN_MS で外す(useGameLoop と同じ式)。 */
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
    const p = useGameStore.getState().player;
    if (p.invulnerable && Date.now() - p.invulnerableTime > INVULN_MS) {
      useGameStore.setState(st => ({ player: { ...st.player, invulnerable: false } }));
    }
  }
};
/** 敵の近接(爆風経路の殴り=sourceId なし)を1発。減ったHPを返す。 */
const enemyMelee = (): number => {
  const p = useGameStore.getState().player;
  const hp = p.health;
  useGameStore.getState().damagePlayer(10, 'ゾンビの殴り', p.x + p.width / 2 + 30, p.y + p.height / 2, 'zombie', undefined, 'driller-thrust');
  return hp - useGameStore.getState().player.health;
};

/** 敵の噛みつき(sourceId 付き=被弾の無敵は敵ごとにしか見ない経路)を1発。減ったHPを返す。 */
const enemyBite = (id: string): number => {
  const p = useGameStore.getState().player;
  const hp = p.health;
  useGameStore.getState().damagePlayer(10, '噛みつき', p.x + p.width / 2 + 20, p.y + p.height / 2, undefined, undefined, undefined, id, id);
  return hp - useGameStore.getState().player.health;
};

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('格闘: ステップの出始めの無敵', () => {
  it('前提: 無敵は200ms・ステップ(係数1.3)はそれより長い', () => {
    expect(BRAWLER_STEP_IFRAME_MS).toBe(200);
    expect(BRAWLER_STEP_MS).toBeGreaterThan(BRAWLER_STEP_IFRAME_MS);
  });
  it('踏み出して100msの近接はダメージ0/250ms後には当たる', () => {
    setup();
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    advance(100);
    expect(enemyMelee()).toBe(0);
    setup();
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    advance(250);
    expect(useGameStore.getState().player.invulnerable).toBe(false);
    expect(enemyMelee()).toBeGreaterThan(0);
  });
  it('切れ目は踏み出しから200ms(190msは無敵・210msは当たる)', () => {
    setup();
    useGameStore.getState().brawlerStep(1, 0);
    advance(190);
    expect(enemyMelee()).toBe(0);
    setup();
    useGameStore.getState().brawlerStep(1, 0);
    advance(210);
    expect(enemyMelee()).toBeGreaterThan(0);
  });
  it('ステップを連続で踏むと、それぞれの出始め200msが無敵', () => {
    setup();
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    advance(100);
    expect(enemyMelee()).toBe(0);
    advance(BRAWLER_STEP_MS - 100 + 10); // 1歩目が終わった(無敵も切れている)
    expect(useGameStore.getState().player.invulnerable).toBe(false);
    expect(useGameStore.getState().brawlerStep(-1, 0)).toBe(true);
    expect(useGameStore.getState().player.brawler?.stepAt).toBe(now);
    advance(100);
    expect(enemyMelee()).toBe(0);
    advance(150); // 2歩目から250ms
    expect(enemyMelee()).toBeGreaterThan(0);
  });
  it('ステップより無敵が長い時はステップの長さで打ち切る(係数1.0=ステップ180ms)', () => {
    setBrawlerTempoAll(1.0);
    try {
      setup();
      useGameStore.getState().brawlerStep(1, 0);
      const p = useGameStore.getState().player;
      expect(p.invulnerableTime + INVULN_MS).toBe(now + BRAWLER_STEP_MS);
      expect(BRAWLER_STEP_MS).toBeLessThan(BRAWLER_STEP_IFRAME_MS);
    } finally { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); }
  });
  it('既に長い無敵(被弾の無敵)が残っていれば縮めない', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, invulnerable: true, invulnerableTime: now } }));
    const hurtAt = now;
    now += 100;
    useGameStore.getState().brawlerStep(1, 0);
    expect(useGameStore.getState().player.invulnerableTime).toBe(hurtAt);
  });
});

describe('技の無敵は sourceId 付きの攻撃(噛みつき・掴み)も受けない', () => {
  it('ステップの出始め100msの噛みつきは0ダメージ/250ms後は当たる', () => {
    setup();
    useGameStore.getState().brawlerStep(1, 0);
    advance(100);
    expect(enemyBite('z1')).toBe(0);
    setup();
    useGameStore.getState().brawlerStep(1, 0);
    advance(250);
    expect(enemyBite('z1')).toBeGreaterThan(0);
  });
  it('被弾の後の無敵は今どおり敵ごと: 別の敵の sourceId 付きの攻撃は当たる・同じ敵は弾く', () => {
    setup();
    expect(enemyBite('z1')).toBeGreaterThan(0);
    expect(useGameStore.getState().player.invulnerable).toBe(true);
    now += 100;
    expect(enemyBite('z1')).toBe(0);
    expect(enemyBite('z2')).toBeGreaterThan(0);
  });
  it('刀の一閃の間も sourceId 付きで0ダメージ・抜けた後は当たる', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, subWeapons: ['katana'], subWeaponLevels: { katana: 1 } } }));
    expect(useGameStore.getState().triggerKatanaDash(1, 0)).toBe(true);
    now += Math.floor(KATANA_DASH_MS / 2);
    expect(enemyBite('z1')).toBe(0);
    now += KATANA_DASH_MS;
    expect(enemyBite('z1')).toBeGreaterThan(0);
  });
});

describe('技ポイントが足りないフリックは、その向きへのステップ(社長指示2026-11-12)', () => {
  const br = () => useGameStore.getState().player.brawler!;
  const setPoints = (n: number) => useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...(st.player.brawler ?? ({} as never)), points: n } } }));
  const zombieAt = (dx: number, id: string) => {
    const p = useGameStore.getState().player;
    const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
    e.x = p.x + p.width / 2 + dx - e.width / 2; e.y = p.y + p.height / 2 - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
    return e;
  };
  it('ポイント0で右フリック → 右へステップ(位置が動く・出始めの無敵)', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(1500); // 格闘の状態を作って待機へ戻す(敵なし=空振り)
    expect(br().phase).toBe('idle');
    setPoints(0);
    const x0 = useGameStore.getState().player.x;
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    expect(br().stepAt).toBe(now);
    expect(br().phase).toBe('idle');
    expect(useGameStore.getState().player.invulnerable).toBe(true);
    expect(useGameStore.getState().player.abilityInvulnUntil).toBe(now + BRAWLER_STEP_IFRAME_MS);
    advance(100);
    expect(enemyMelee()).toBe(0);
    advance(300);
    expect(useGameStore.getState().player.x - x0).toBeGreaterThan(90);
  });
  it('ポイントが足りれば今どおり技が出る', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(1500);
    setPoints(5);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    expect(br().phase).toBe('tech');
    expect(br().tech).toBe('kick');
    expect(br().stepAt).toBeUndefined();
  });
  it('行動の最中: 出だし(判定の前)のフリックは今どおり技として覚える(ステップにしない)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(50, 'z')] });
    useGameStore.getState().brawlerPress();
    setPoints(0);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    expect(br().techBuffer).toBe('kick');
    expect(br().stepAt).toBeUndefined();
  });
  it('行動の最中: 当たった段の取り消しの受付の内なら、後隙を取り消してステップ', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(50, 'z')] });
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && !br().resolved; k++) advance(10);
    advance(BRAWLER_WORLD_STOP.weak + 10);
    expect(br().phase).toBe('attack');
    setPoints(0);
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    expect(br().phase).toBe('idle');
    expect(br().stepAt).toBe(now);
  });
});
