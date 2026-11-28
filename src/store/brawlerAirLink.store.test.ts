// ★「N HIT」は宙の敵がいる間は切れない(社長指示2026-11-27「空中にいる間はコンボカウントが切れない様にして」
//   「コンボの考え方って敵が動ける様になったかどうかでしょ？てことは空中は切れないよね」・research/BRAWLER.md §23)。
// 浮いている間は動けない=数を持つ敵が宙にいる限り切れない作り。穴は「格闘の当たりで浮かせたのに数を書かない経路」だった
// (スープレックスの叩きつけ・その小爆発・空中投げの爆撃)。実機と同じく敵の更新(updateEnemies)も毎フレーム回して確かめる。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { BRAWLER_CONTACT_FREEZE_MS, BRAWLER_CONTACT_GRAB_MS, BRAWLER_GRAB_MS } from '../utils/brawler';
import { setBrawlerTempoAll, brawlerAirborne } from '../utils/brawlerCombo';
import { brawlerAirborneWithoutLink } from '../utils/brawlerLinkLift';

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
const enemyAt = (dx: number, dy: number, id: string) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return e;
};
const br = () => useGameStore.getState().player.brawler!;
/** 宙の敵がいるのに「N HIT」が切れていたフレーム(と、宙なのに数を持っていない敵)を数える。 */
const watch = { brokenInAir: 0, airFrames: 0, missing: 0, airIds: new Set<string>() };
/** 実機のループ相当: 止めの間は壁時計だけ・それ以外は格闘の状態機械と敵の更新を毎フレーム回す。 */
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    if (now - 10 < useGameStore.getState().hitstopUntil) continue;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
    useGameStore.getState().updateEnemies(0.01);
    const st = useGameStore.getState();
    const air = st.enemies.filter(e => e.health > 0 && e.corpseUntil === undefined && brawlerAirborne(e, now));
    if (air.length === 0) continue;
    for (const e of air) watch.airIds.add(e.id);
    watch.airFrames++;
    const b = st.player.brawler;
    if ((b?.flowHits ?? 0) > 0 && (b?.flowBrokenAt ?? 0) > 0) watch.brokenInAir++;
    watch.missing += brawlerAirborneWithoutLink(st.enemies, now).length;
  }
};
const waitHit = () => { for (let k = 0; k < 120 && !(br().resolved && !(useGameStore.getState().gameTime < br().stopUntil)); k++) advance(10); };

beforeEach(() => {
  setKenkiLevelForTest(5);
  now = 9_000_000;
  watch.brokenInAir = 0; watch.airFrames = 0; watch.missing = 0; watch.airIds.clear();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('「N HIT」は宙の敵がいる間は切れない(§23)', () => {
  it('密着の構えのスープレックス: 叩きつけた相手と、小爆発で浮いた近くの敵が宙にいる間はずっと出ている・全員が着地して動けるようになったら切れる', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    const p = useGameStore.getState().player;
    const c = enemyAt(0, 0, 'c');
    c.x = p.x + p.width + 4; // 体の縁どうし 4px(密着)
    const d = enemyAt(-60, 30, 'd'); // 背中側(叩きつける側)の近く=小爆発に巻き込まれる
    useGameStore.setState(st => ({ enemies: [c, d], player: { ...st.player, brawler: { ...st.player.brawler!, points: 9, flowHits: 0, flowBrokenAt: 0 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().contactGrab?.mode).toBe('suplex');
    advance(BRAWLER_CONTACT_FREEZE_MS + BRAWLER_CONTACT_GRAB_MS + 60);
    const st = useGameStore.getState();
    expect(brawlerAirborne(st.enemies.find(e => e.id === 'c')!, now)).toBe(true);
    expect(br().flowHits ?? 0).toBeGreaterThan(0);
    advance(2000);
    expect(watch.airFrames).toBeGreaterThan(10);           // 宙の時間を実際に見た
    expect([...watch.airIds].sort()).toEqual(['c', 'd']);   // 叩きつけた相手も、小爆発で浮いた近くの敵も宙にいた
    expect(watch.missing).toBe(0);                          // 宙の敵は必ず数を持つ
    expect(watch.brokenInAir).toBe(0);                      // 宙の敵がいる間は切れない
    expect(br().flowBrokenAt ?? 0).toBeGreaterThan(0);     // 全員が着地して動けるようになったら今どおり切れる
  });
  it('空中投げの爆撃: ぶつけられて浮いた敵が宙にいる間はずっと出ている', () => {
    setup(['punisher']);
    useGameStore.setState(st => ({ enemies: [enemyAt(120, 0, 'z'), enemyAt(300, 40, 'y')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 10 } } }));
    for (let i = 0; i < 2; i++) { expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); waitHit(); }
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true); // 蹴り上げ→掴む→投げる
    for (let k = 0; k < 120 && !br().grab; k++) advance(10);
    expect(br().grab?.enemyId).toBe('z');
    advance(BRAWLER_GRAB_MS + 30);
    const yhp = useGameStore.getState().enemies.find(e => e.id === 'y')!.health;
    advance(2500);
    expect(useGameStore.getState().enemies.find(e => e.id === 'y')!.health).toBeLessThan(yhp); // 爆撃が当たった
    expect(watch.airIds.has('y')).toBe(true);              // ぶつけられた敵が爆撃で浮いた
    expect(watch.missing).toBe(0);
    expect(watch.brokenInAir).toBe(0);
  });
});
