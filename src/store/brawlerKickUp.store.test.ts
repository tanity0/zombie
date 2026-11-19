// ★蹴り上げ・空中投げ・密着の構え(社長指示2026-11-19・research/BRAWLER.md §34)をストアで実際に動かして固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { BRAWLER_GRAB_MS, BRAWLER_CONTACT_GRAB_MS, brawlerKickUpCost, BRAWLER_TECHS, BRAWLER_WORLD_STOP, BRAWLER_SUPLEX_RISE_MS } from '../utils/brawler';
import { setBrawlerTempoAll, brawlerAirborne } from '../utils/brawlerCombo';
import { playerSuperArmorActive } from '../utils/superArmor';

setBrawlerTempoAll(1.0);

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 9_000_000;
const setup = (skills: string[] = []) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, skills: skills as never, skillLevels: {},
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 2 }, lastDirection: { x: 1, y: 0 },
    },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (dx: number, dy: number, id: string, type: Parameters<typeof spawnEnemyAt>[0] = 'zombie', health = 99999) => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = health; e.maxHealth = health; e.id = id;
  return e;
};
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    if (now - 10 < useGameStore.getState().hitstopUntil) continue; // 画面全体の止め=壁時計だけ進む(実機のループと同じ)
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
const br = () => useGameStore.getState().player.brawler!;
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id);
const feed = () => useGameStore.getState().skillProcFeed.map(e => e.key);
const waitHit = () => { for (let k = 0; k < 120 && !(br().resolved && !(useGameStore.getState().gameTime < br().stopUntil)); k++) advance(10); };
/** 飛び蹴り1発目を当てた所まで(技ポイント points)。 */
const kick1 = (mk: () => ReturnType<typeof enemyAt>[], points = 10, skills: string[] = []) => {
  setup(skills);
  const enemies = mk(); // 位置は setup の後のプレイヤーから
  useGameStore.setState(st => ({ enemies, player: { ...st.player, brawler: undefined } }));
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points } }, skillProcFeed: [] }));
  expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); waitHit();
};

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§34-1 蹴り上げ(ストア)', () => {
  it('当たった1発目の後の上=蹴り上げ(2発目の位置・飛び蹴り+1の値段)。構えにならない。相手は上へ浮く', () => {
    kick1(() => [enemyAt(120, 0, 'z')]);
    const pts = br().points;
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().tech).toBe('kick');
    expect(br().kickUp).toBe(true);
    expect(br().kickN).toBe(2);
    expect(br().points).toBe(pts - brawlerKickUpCost());
    expect(isBrawlerGuarding(useGameStore.getState().player, useGameStore.getState().gameTime)).toBe(false);
    waitHit();
    expect(brawlerAirborne(en('z')!, now)).toBe(true);
    expect(feed()).toEqual(['tech:kick', 'tech:kickup']);
  });
  it('外れた蹴りの後の上は構え(今までどおり)', () => {
    kick1(() => []);
    for (let k = 0; k < 60 && br().phase !== 'idle'; k++) advance(10);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().tech).toBe('guard');
  });
  it('払えない時の上は構え(弱い構え)', () => {
    kick1(() => [enemyAt(120, 0, 'z')], 2);
    expect(br().points).toBeLessThan(brawlerKickUpCost());
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    for (let k = 0; k < 80 && br().tech !== 'guard'; k++) advance(10);
    expect(br().tech).toBe('guard');
    expect(br().kickUp).toBeFalsy();
  });
});

describe('§34-3 空中投げ(格闘+パニッシャー)', () => {
  it('雑魚に当たった蹴り上げで掴む(時間停止)→ 一番近い別の敵へ投げる → 爆撃でダメージと外向きの押し', () => {
    kick1(() => [enemyAt(120, 0, 'z'), enemyAt(300, 40, 'y')], 10, ['punisher']);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    for (let k = 0; k < 120 && !br().grab; k++) advance(10);
    expect(br().grab?.enemyId).toBe('z');
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThanOrEqual(now + BRAWLER_GRAB_MS - 20);
    const gt0 = useGameStore.getState().gameTime;
    const yx0 = en('y')!.x;
    advance(BRAWLER_GRAB_MS - 50);
    expect(useGameStore.getState().gameTime).toBe(gt0); // 止まっている間は他の敵も時計も動かない
    expect(en('y')!.x).toBe(yx0);
    advance(80);
    expect(br().grab).toBeUndefined();
    expect(en('z')!.brThrow).toBeDefined();
    expect(en('z')!.brThrown).toBe(true);
    expect(feed()).toContain('tech:airthrow');
    const yhp = en('y')!.health;
    for (let k = 0; k < 60 && en('z')?.brThrow; k++) advance(10);
    expect(en('z')!.brThrow).toBeUndefined();
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThan(now); // ぶつかった瞬間は締めの止め(画面全体)
    advance(BRAWLER_WORLD_STOP.closer + 20); // 爆撃は止めが明けてから広がる
    expect(en('y')!.health).toBeLessThan(yhp);
    expect((en('y')!.knockbackUntil ?? 0)).toBeGreaterThan(now);
  });
  it('投げ先が無ければスープレックス(相手はもう一度浮く)', () => {
    kick1(() => [enemyAt(120, 0, 'z')], 10, ['punisher']);
    useGameStore.getState().brawlerTech(0, -1);
    for (let k = 0; k < 120 && !br().grab; k++) advance(10);
    expect(br().grab).toBeDefined();
    const hp = en('z')!.health;
    advance(BRAWLER_GRAB_MS + 30);
    expect(br().suplexAt).toBeDefined(); // 放した瞬間から反り始める
    expect(en('z')!.health).toBe(hp);    // 叩きつけは反りの頂点
    advance(BRAWLER_SUPLEX_RISE_MS + 20);
    expect(en('z')!.health).toBeLessThan(hp);
    expect(en('z')!.brLiftDropMs).toBeGreaterThan(0);
    expect(feed()).toContain('tech:suplexchain'); // 蹴り上げからの自動の続き=向きの印なしの行
  });
  it('パニッシャーが無ければ普通の蹴り上げ(掴まない)', () => {
    kick1(() => [enemyAt(120, 0, 'z'), enemyAt(300, 40, 'y')]);
    useGameStore.getState().brawlerTech(0, -1);
    waitHit();
    expect(br().grab).toBeUndefined();
    expect(br().kickThrow).toBeFalsy();
  });
});

describe('§34-7 密着の構え', () => {
  const guardNear = (type: Parameters<typeof spawnEnemyAt>[0], skills: string[] = []) => {
    setup(skills);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    const p = useGameStore.getState().player;
    const e = enemyAt(0, 0, 'c', type);
    e.x = p.x + p.width + 4; // 体の縁どうし 4px
    useGameStore.setState(st => ({ enemies: [e], player: { ...st.player, brawler: { ...st.player.brawler!, points: 9 } }, skillProcFeed: [] }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  };
  it('雑魚に密着して構え=掴み(構えの効果なし・スーパーアーマー)→ スープレックス・相手は動かず浮く・値段は構えと同じ', () => {
    guardNear('zombie');
    const s = br();
    expect(s.contactGrab?.mode).toBe('suplex');
    expect(s.points).toBe(9 - BRAWLER_TECHS.guard.cost);
    const st = useGameStore.getState();
    expect(isBrawlerGuarding(st.player, st.gameTime)).toBe(false);
    expect(playerSuperArmorActive(st.player, 999, now, st.gameTime, 300)).toBe(true);
    const x0 = en('c')!.x;
    advance(BRAWLER_CONTACT_GRAB_MS + 30);
    expect(useGameStore.getState().hitstopUntil).toBeLessThanOrEqual(now); // 時間は止めない
    expect(br().suplexAt).toBeDefined();
    expect(brawlerAirborne(en('c')!, now)).toBe(true);
    expect(en('c')!.x).toBeCloseTo(x0, 5);
    expect(feed()).toEqual(['tech:suplex']);
  });
  it('ボス級に密着して構え=蹴りバク宙(相手から離れて下がる・着地で何でも出せる)', () => {
    guardNear('hunter');
    expect(br().contactGrab?.mode).toBe('flipkick');
    const px0 = useGameStore.getState().player.x;
    for (let k = 0; k < 150 && br().phase !== 'idle'; k++) advance(10);
    expect(feed()).toEqual(['tech:flipkick']);
    expect(useGameStore.getState().player.x).toBeLessThan(px0 - 60);
    expect(br().phase).toBe('idle');
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    expect(br().tech).toBe('kiko');
  });
  it('密着していなければ今までどおりの構え', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [enemyAt(140, 0, 'far')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 9 } } }));
    useGameStore.getState().brawlerTech(0, -1);
    expect(br().tech).toBe('guard');
    expect(br().contactGrab).toBeUndefined();
  });
});
