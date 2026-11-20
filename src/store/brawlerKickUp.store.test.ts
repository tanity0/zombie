// ★蹴り上げ・空中投げ・密着の構え(社長指示2026-11-19・research/BRAWLER.md §34)をストアで実際に動かして固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { BRAWLER_GRAB_MS, BRAWLER_CONTACT_GRAB_MS, brawlerKickUpCost, BRAWLER_TECHS, BRAWLER_WORLD_STOP, BRAWLER_SUPLEX_RISE_MS, BRAWLER_CONTACT_FREEZE_MS, BRAWLER_SUPLEX_BLAST_RADIUS, brawlerTechCost, brawlerDistTo, brawlerPoseAt, BRAWLER_AIR_SUPLEX_RISE_MS } from '../utils/brawler';
import { brawlerTimeKeeperDiscount } from '../utils/brawlerSkills';
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
/** 飛び蹴りを n 発(既定=2発目=空中蹴りまで・§34-8)当てた所まで(技ポイント points)。 */
const kick1 = (mk: () => ReturnType<typeof enemyAt>[], points = 10, skills: string[] = [], n = 2) => {
  setup(skills);
  const enemies = mk(); // 位置は setup の後のプレイヤーから
  useGameStore.setState(st => ({ enemies, player: { ...st.player, brawler: undefined } }));
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points } }, skillProcFeed: [] }));
  for (let i = 0; i < n; i++) { expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); waitHit(); }
};

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§34-1 蹴り上げ(ストア)', () => {
  it('当たった2発目(空中蹴り)の後の上=蹴り上げ(3発目の位置・飛び蹴り+1の値段)。構えにならない。相手は上へ浮く', () => {
    kick1(() => [enemyAt(120, 0, 'z')]);
    const pts = br().points;
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().tech).toBe('kick');
    expect(br().kickUp).toBe(true);
    expect(br().kickN).toBe(3);
    expect(br().points).toBe(pts - brawlerKickUpCost());
    expect(isBrawlerGuarding(useGameStore.getState().player, useGameStore.getState().gameTime)).toBe(false);
    waitHit();
    expect(brawlerAirborne(en('z')!, now)).toBe(true);
    expect(feed()).toEqual(['tech:kick', 'tech:kick2', 'tech:kickup']);
  });
  it('★§34-8: 当たった1発目の後の上は構え(蹴り上げにならない)', () => {
    kick1(() => [enemyAt(120, 0, 'z')], 10, [], 1);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().kickUpBuffer).toBe(false);
    expect(br().techBuffer).toBe('guard'); // 判定の後に押した構え=蹴りが終わったら構え(§25)
    // 蹴りの後は相手に密着しているので、構えは密着の構え(§34-7)になる。どちらにしても蹴り上げではない。
    for (let k = 0; k < 80 && br().tech === 'kick' && !br().contactGrab; k++) advance(10);
    expect(br().kickUp).toBeFalsy();
    expect(br().tech === 'guard' || br().contactGrab !== undefined).toBe(true);
  });
  it('外れた蹴りの後の上は構え(今までどおり)', () => {
    kick1(() => []);
    for (let k = 0; k < 60 && br().phase !== 'idle'; k++) advance(10);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().tech).toBe('guard');
  });
  it('払えない時の上は構え(弱い構え)', () => {
    kick1(() => [enemyAt(120, 0, 'z')], 3); // 2発で2使う=残り1<蹴り上げの2
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
    // ★§34-11: 放した瞬間から一緒に少し上がり(BRAWLER_AIR_SUPLEX_RISE_MS)、頂点から反って、反りの頂点で叩きつける=叩きつけはその分遅れる。
    const rise0 = br().airSuplexRiseAt!;
    expect(rise0).toBeDefined();
    expect(br().suplexAt).toBe(rise0 + BRAWLER_AIR_SUPLEX_RISE_MS);
    const slamAt = rise0 + BRAWLER_AIR_SUPLEX_RISE_MS + BRAWLER_SUPLEX_RISE_MS;
    const pc0 = useGameStore.getState().player.x + useGameStore.getState().player.width / 2;
    const side0 = Math.sign(en('z')!.x + en('z')!.width / 2 - pc0);
    for (let k = 0; k < 100 && useGameStore.getState().gameTime < slamAt - 10; k++) advance(10);
    expect(en('z')!.health).toBe(hp);    // 上がって反っている間は当たらない
    expect(Math.sign(en('z')!.x + en('z')!.width / 2 - pc0)).toBe(side0); // 叩きつけるまでは元の位置
    advance(30);
    expect(en('z')!.health).toBeLessThan(hp); // 反りの頂点で叩きつけ
    const pc1 = useGameStore.getState().player.x + useGameStore.getState().player.width / 2;
    expect(Math.sign(en('z')!.x + en('z')!.width / 2 - pc1)).toBe(-side0); // §34-12: 叩きつけた所=背中側へ移る
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
  const guardNear = (type: Parameters<typeof spawnEnemyAt>[0], skills: string[] = [], points = 9) => {
    setup(skills);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    const p = useGameStore.getState().player;
    const e = enemyAt(0, 0, 'c', type);
    e.x = p.x + p.width + 4; // 体の縁どうし 4px
    useGameStore.setState(st => ({ enemies: [e], player: { ...st.player, brawler: { ...st.player.brawler!, points } }, skillProcFeed: [] }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  };
  // ★社長実機報告2026-11-19「スープレックス、雑魚をスープレックスできてない(案山子)」: 案山子(雑魚・体力が減らない練習の的)も、密着していればスープレックス。
  //   投げ越しの先(背中側)を覚え、相手の位置(判定)は動かない。★§34-10: 構えの値段を払えた時だけ(払えない時は弱い構え=掴まない)。
  for (const [type, pts] of [['scarecrow', 9], ['zombie', 3]] as const) {
    it(`${type}(技ポイント${pts})に密着して構え=スープレックスで投げ越して叩きつけ、もう一度浮く`, () => {
      guardNear(type, [], pts);
      expect(br().contactGrab?.mode).toBe('suplex');
      expect(br().points).toBe(pts - BRAWLER_TECHS.guard.cost);
      const sw = br().suplexSwing!;
      expect(sw.enemyId).toBe('c');
      const p = useGameStore.getState().player, e = en('c')!;
      expect(Math.sign(sw.mx)).toBe(-Math.sign(e.x + e.width / 2 - (p.x + p.width / 2))); // 背中側へ運ぶ
      const x0 = e.x, hp0 = e.health;
      advance(BRAWLER_CONTACT_FREEZE_MS + BRAWLER_CONTACT_GRAB_MS + 30);
      expect(feed()).toEqual(['tech:suplex']);
      expect(brawlerAirborne(en('c')!, now)).toBe(true);
      // ★§34-12: 叩きつけで相手の位置そのものが背中側(プレイヤーの反対側)へ移り、浮いて降りた後もそこに居る。
      const pc = useGameStore.getState().player.x + useGameStore.getState().player.width / 2;
      const side0 = Math.sign(x0 + en('c')!.width / 2 - pc);
      expect(Math.sign(en('c')!.x + en('c')!.width / 2 - pc)).toBe(-side0);
      const xAfter = en('c')!.x;
      advance(1200);
      expect(brawlerAirborne(en('c')!, now)).toBe(false);
      expect(en('c')!.x).toBeCloseTo(xAfter, 5);
      if (type === 'scarecrow') expect(en('c')!.health).toBe(hp0); // 案山子は体力が減らない(倒れない的)
    });
  }
  it('雑魚に密着して構え=掴み(構えの効果なし・スーパーアーマー)→ スープレックス・相手は動かず浮く・値段は構えと同じ', () => {
    guardNear('zombie');
    const s = br();
    expect(s.contactGrab?.mode).toBe('suplex');
    expect(s.points).toBe(9 - BRAWLER_TECHS.guard.cost);
    const st = useGameStore.getState();
    expect(isBrawlerGuarding(st.player, st.gameTime)).toBe(false);
    expect(playerSuperArmorActive(st.player, 999, now, st.gameTime, 300)).toBe(true);
    const x0 = en('c')!.x;
    expect(useGameStore.getState().hitstopUntil).toBe(now + BRAWLER_CONTACT_FREEZE_MS); // ★§34-10: 掴んだ一瞬は時間停止(ガッ)
    const gt0 = useGameStore.getState().gameTime;
    advance(BRAWLER_CONTACT_FREEZE_MS - 20);
    expect(useGameStore.getState().gameTime).toBe(gt0); // 止まっている間は技の時計も進まない
    expect(br().suplexAt).toBeGreaterThan(gt0);           // まだ反り始めていない
    advance(BRAWLER_CONTACT_GRAB_MS + 50);
    expect(br().suplexAt).toBeDefined();
    expect(brawlerAirborne(en('c')!, now)).toBe(true);
    expect(Math.sign(en('c')!.x - x0)).toBeLessThan(0); // §34-12: 相手は背中側(右に居た相手は左)へ移る
    expect(feed()).toEqual(['tech:suplex']);
  });
  it('ボス級に密着して構え=蹴りバク宙(相手から離れて下がる・着地で何でも出せる)', () => {
    guardNear('hunter');
    expect(br().contactGrab?.mode).toBe('flipkick');
    expect(useGameStore.getState().hitstopUntil).toBe(now + BRAWLER_CONTACT_FREEZE_MS); // ★§34-10: サマーソルトも掴んだ一瞬は時間停止
    const px0 = useGameStore.getState().player.x;
    for (let k = 0; k < 150 && br().phase !== 'idle'; k++) advance(10);
    expect(feed()).toEqual(['tech:flipkick']);
    // ★社長指示2026-11-20「サマーソルト離れすぎ、1/3くらいでいいかも」: 実測の下がる距離 約300px → 約80px。
    const back = px0 - useGameStore.getState().player.x;
    expect(back).toBeGreaterThan(70);
    expect(back).toBeLessThan(90);
    expect(br().phase).toBe('idle');
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    expect(br().tech).toBe('kiko');
  });
  // ★社長指示2026-11-20「掴むとき、両方、少し敵に食い込むように(掴んでる風)みせたい」: 掴む間の体の寄せ(絵だけ)は相手の縁を越える。位置は動かない。
  for (const type of ['zombie', 'hunter'] as const) {
    it(`${type}: 掴む間の体の寄せは相手の縁を体の幅の1/4ほど越える(絵だけ・位置は動かない)・サマーソルトは蹴る瞬間に寄せが0`, () => {
      guardNear(type, [], 9);
      const st = useGameStore.getState(), p = st.player, b = br();
      const gap = brawlerDistTo(p.x + p.width / 2, p.y + p.height / 2, en('c')!) - p.width / 2;
      expect(b.contactGrab!.gripPx!).toBeGreaterThan(gap + p.width * 0.2);
      const x0 = p.x;
      const pose = brawlerPoseAt(b, st.gameTime, now + 200)!; // 時間停止の中(壁時計で組み付き切った所)
      expect(pose.push).toBeCloseTo(b.contactGrab!.gripPx!, 6);
      advance(BRAWLER_CONTACT_FREEZE_MS);
      expect(useGameStore.getState().player.x).toBe(x0);
      if (type === 'hunter') {
        const s2 = br();
        const atKick = brawlerPoseAt(s2, s2.startAt + s2.windupMs - 0.5, now)!;
        expect(Math.abs(atKick.push)).toBeLessThan(0.5);
      }
    });
  }
  // ★§34-10: 密着の掴み(スープレックス・サマーソルト)の値段=構え(カウンター)の値段そのもの(同じ関数)。払えない時は弱い構え(掴まない)。
  for (const type of ['zombie', 'scarecrow', 'hunter'] as const) {
    it(`${type}: 構えの値段を払えない(技ポイント${BRAWLER_TECHS.guard.cost - 1})と、密着していても弱い構え(掴まない)`, () => {
      guardNear(type, [], BRAWLER_TECHS.guard.cost - 1);
      expect(br().tech).toBe('guard');
      expect(br().guardWeak).toBe(true);
      expect(br().contactGrab).toBeUndefined();
      expect(br().points).toBe(BRAWLER_TECHS.guard.cost - 1);
    });
  }
  it('タイムキーパーLv2: 掴みの値段も構えと同じだけ下がる(構えの値段ちょうどで掴む・1足りなければ弱い構え)', () => {
    const disc = brawlerTimeKeeperDiscount('guard', 2);
    const cost = brawlerTechCost('guard', false, disc);
    expect(cost).toBe(BRAWLER_TECHS.guard.cost - disc);
    const tk = (pts: number) => {
      setup(['time-keeper']);
      useGameStore.setState(st => ({ enemies: [], player: { ...st.player, skillLevels: { 'time-keeper': 2 } as never, brawler: undefined } }));
      useGameStore.getState().brawlerPress(); advance(400);
      const p = useGameStore.getState().player;
      const e = enemyAt(0, 0, 'c', 'zombie');
      e.x = p.x + p.width + 4;
      useGameStore.setState(st => ({ enemies: [e], player: { ...st.player, brawler: { ...st.player.brawler!, points: pts } }, skillProcFeed: [] }));
      expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    };
    tk(cost);
    expect(br().contactGrab?.mode).toBe('suplex');
    expect(br().points).toBe(0);
    tk(cost - 1);
    expect(br().contactGrab).toBeUndefined();
    expect(br().guardWeak).toBe(true);
  });
  // ★社長実機報告2026-11-20「スープレックス、最初はうまくいった気がするけど、2回目から後ろに行ってくれない」: 同じ相手へ続けて出しても、毎回新しく投げ越す
  //   (反りの始まりが新しい・着地点はその時のプレイヤーの背中側)。
  for (const type of ['scarecrow', 'zombie'] as const) {
    it(`${type}: 2回目・3回目のスープレックスも毎回新しく背中側へ投げ越す(着地を待って/続けて)`, () => {
      guardNear(type, [], 9);
      let prevAt = br().suplexAt!;
      for (const gap of [0, 400]) {
        advance(BRAWLER_CONTACT_FREEZE_MS + BRAWLER_CONTACT_GRAB_MS + 30);
        for (let k = 0; k < 300 && br().phase !== 'idle'; k++) advance(10);
        advance(gap);
        // §34-12: 前の叩きつけで相手は反対側へ移った=もう一度密着させる(移った側のまま、体の縁どうし 4px)。
        { const p0 = useGameStore.getState().player, c0 = en('c')!;
          const nx = c0.x + c0.width / 2 < p0.x + p0.width / 2 ? p0.x - c0.width - 4 : p0.x + p0.width + 4;
          useGameStore.setState(st => ({ enemies: st.enemies.map(x => (x.id === 'c' ? { ...x, x: nx, y: p0.y + p0.height / 2 - x.height / 2 } : x)) })); }
        useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 9 } }, skillProcFeed: [] }));
        expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
        const b = br();
        expect(b.contactGrab?.mode).toBe('suplex');
        expect(b.suplexAt!).toBeGreaterThan(prevAt);
        prevAt = b.suplexAt!;
        const p = useGameStore.getState().player, e = en('c')!;
        expect(b.suplexSwing?.enemyId).toBe('c');
        expect(Math.sign(b.suplexSwing!.mx)).toBe(-Math.sign(e.x + e.width / 2 - (p.x + p.width / 2)));
        advance(BRAWLER_CONTACT_FREEZE_MS + BRAWLER_CONTACT_GRAB_MS + 30);
        expect(feed()).toEqual(['tech:suplex']);
      }
    });
  }
  // ★§34-9: 叩きつけ=背中側の着地点を中心に小爆発。近くの敵(着地点から半径の内)にダメージと外向きの押し。叩きつけた相手は1回だけ当たる。
  it('§34-9 叩きつけの小爆発: 着地点の近くの敵はダメージ+押し・叩きつけた相手は1回だけ当たってもう一度浮く', () => {
    guardNear('zombie', [], 9);
    const sw = br().suplexSwing!;
    const c0 = en('c')!;
    const lx = c0.x + c0.width / 2 + sw.mx, ly = c0.y + c0.height / 2 + sw.my;
    const near = enemyAt(0, 0, 'n', 'zombie');
    near.x = lx - near.width / 2 - 30; near.y = ly - near.height / 2; // 着地点から 30px(背中側のさらに外)
    const far = enemyAt(0, 0, 'f', 'zombie');
    far.x = lx - far.width / 2 - BRAWLER_SUPLEX_BLAST_RADIUS - 120; far.y = ly - far.height / 2;
    useGameStore.setState(st => ({ enemies: [...st.enemies, near, far] }));
    const hpC = en('c')!.health, hpN = en('n')!.health, hpF = en('f')!.health;
    let hitsOnC = 0, last = en('c')!.health;
    for (let t = 0; t < BRAWLER_CONTACT_FREEZE_MS + BRAWLER_CONTACT_GRAB_MS + 200; t += 10) {
      advance(10);
      const h = en('c')!.health;
      if (h < last) hitsOnC++;
      last = h;
    }
    expect(hitsOnC).toBe(1);
    expect(en('c')!.health).toBeLessThan(hpC);
    expect(brawlerAirborne(en('c')!, now)).toBe(true);
    expect(en('n')!.health).toBeLessThan(hpN);
    expect((en('n')!.knockbackUntil ?? 0)).toBeGreaterThan(now);
    expect((en('n')!.knockbackVx ?? 0)).toBeLessThan(0); // 着地点から外向き(左)
    expect(en('f')!.health).toBe(hpF);
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
