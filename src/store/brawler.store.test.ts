// ★サブウェポン「格闘」(research/BRAWLER.md)をストアで実際に動かして固める。
// 5段のつながり・ヒットストップ・技ポイント・技(構え/大踏み潰し/気功/飛び蹴り)・近接専用モード・守護霊の疑似プレイヤー。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isMeleeOnlyMode, isBrawlerGuarding, subWeaponBlockedByKatana, isWhipMode } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { buildPseudoPlayer } from '../utils/playerBuild';
import { BRAWLER_GUARD_MS } from '../utils/brawler';

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;

const setup = (level = 1) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false,
      subWeapons: ['brawler'], subWeaponLevels: { brawler: level },
      lastDirection: { x: 1, y: 0 },
    },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const zombieAt = (dx: number, dy: number, id: string, health = 99999) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = health; e.maxHealth = health; e.id = id;
  return e;
};
/** ゲームループ相当: gameTime と実時間を同じだけ進め、移動と格闘の状態機械を解く。 */
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
const hpOf = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)?.health ?? 0;
const br = () => useGameStore.getState().player.brawler!;

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
});
afterEach(() => { vi.restoreAllMocks(); });

describe('格闘: 近接専用モード(§1)', () => {
  it('格闘は近接専用モード=他のサブは止まる・鞭は動かない', () => {
    setup();
    const p = useGameStore.getState().player;
    expect(isMeleeOnlyMode(p)).toBe(true);
    expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(true);
    expect(subWeaponBlockedByKatana(p, 'brawler')).toBe(false);
    expect(isWhipMode({ ...p, subWeapons: ['brawler', 'whip'] })).toBe(false);
  });
  it('守護霊・幻影の疑似プレイヤーには格闘を入れない(§8-2)', () => {
    setup();
    const live = useGameStore.getState().player;
    const pseudo = buildPseudoPlayer(undefined, live);
    expect(pseudo.subWeapons).not.toContain('brawler');
    expect(isMeleeOnlyMode(pseudo)).toBe(false);
  });
});

describe('格闘: 通常攻撃(§2)', () => {
  it('押す→前隙の後に当たる→次の段へ・ポイント+1。カウンター窓とCDは張らない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(50, 0, 'z')] });
    const cd0 = useGameStore.getState().player.counterCooldownEnd;
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    expect(br().phase).toBe('attack');
    expect(br().stage).toBe(1);
    expect(useGameStore.getState().player.counterCooldownEnd).toBe(cd0);
    advance(50);
    expect(hpOf('z')).toBe(99999); // まだ前隙
    advance(20);
    expect(hpOf('z')).toBeLessThan(99999);
    expect(br().points).toBe(1);
    expect(br().nextStage).toBe(2);
  });
  it('空振りは1段目から・ポイントは増えない', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    useGameStore.getState().brawlerPress();
    advance(250);
    expect(br().phase).toBe('idle');
    expect(br().nextStage).toBe(1);
    expect(br().points).toBe(0);
  });
  it('5段を当て切ると次は1段目・ポイントは段の数だけ(上限まで)', () => {
    setup(1);
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    const stages: number[] = [];
    for (let i = 0; i < 6; i++) {
      useGameStore.getState().brawlerPress();
      stages.push(br().stage);
      advance(700); // 戻り・止めを抜ける(400msの受付の中で次を押す=間に合わない時はやり直し)
      // 段が切れないように、押し直しを受付の中に入れるため advance を短くした版は別のテストで見る
    }
    // 700ms 待つと 400ms の受付を過ぎる=毎回1段目
    expect(stages.every(s => s === 1)).toBe(true);
    expect(br().points).toBe(5); // Lv1 の上限
  });
  it('先行入力で5段がつながる(1→2→3→4→5→1)', () => {
    setup(3);
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    const seen: number[] = [];
    useGameStore.getState().brawlerPress();
    seen.push(br().stage);
    for (let i = 0; i < 5; i++) {
      // 当たった後(止めの間を含む)に押して先行入力にする
      for (let k = 0; k < 80 && !br().resolved; k++) advance(10);
      useGameStore.getState().brawlerPress();
      expect(br().buffered).toBe(true);
      const st0 = br().stage;
      for (let k = 0; k < 120 && br().stage === st0 && br().phase === 'attack'; k++) advance(10);
      seen.push(br().stage);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 1]);
  });
  it('ヒットストップの間は段の時計が止まる(1段目: 戻り140ms+止め45ms)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    advance(60);
    expect(br().resolved).toBe(true);
    advance(140);
    expect(br().phase).toBe('attack'); // 止め45msぶんまだ戻りの中
    advance(50);
    expect(br().phase).toBe('idle');
  });
  it('段の間は動けない(移動の入力があっても位置が変わらない)', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    useGameStore.getState().brawlerPress();
    const x0 = useGameStore.getState().player.x;
    for (let i = 0; i < 10; i++) { now += 10; useGameStore.setState(st => ({ gameTime: st.gameTime + 10 })); useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: true } as never, 0.01); }
    expect(Math.abs(useGameStore.getState().player.x - x0)).toBeLessThan(1);
  });
  it('被弾したら段は1段目・先行入力を捨てる', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    advance(70);
    useGameStore.getState().brawlerPress();
    expect(br().buffered).toBe(true);
    useGameStore.getState().damagePlayer(5, 'test');
    expect(br().buffered).toBe(false);
    expect(br().nextStage).toBe(1);
  });
});

describe('格闘: 技(§3)', () => {
  it('ポイント不足では技が出ない(数字が震える印)', () => {
    setup();
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(false);
    expect(br().denyAt).toBe(now);
  });
  it('方向の無い入力は技を出さない', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(1, 0, true)).toBe(false);
    expect(br().points).toBe(5);
  });
  it('構え: 1秒間はあらゆる被害が0・ポイント5消費・紫の弾も弾き返す窓', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(250); // 初期化
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 6 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().points).toBe(1);
    expect(isBrawlerGuarding(useGameStore.getState().player, useGameStore.getState().gameTime)).toBe(true);
    const hp0 = useGameStore.getState().player.health;
    expect(useGameStore.getState().damagePlayer(30, 'test')).toBe(false);
    expect(useGameStore.getState().damagePlayer(5, 'dot', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { dot: true })).toBe(false);
    expect(useGameStore.getState().player.health).toBe(hp0);
    advance(BRAWLER_GUARD_MS + 20);
    expect(isBrawlerGuarding(useGameStore.getState().player, useGameStore.getState().gameTime)).toBe(false);
    useGameStore.setState(st => ({ player: { ...st.player, invulnerable: false } }));
    useGameStore.getState().damagePlayer(10, 'test');
    expect(useGameStore.getState().player.health).toBe(hp0 - 10);
  });
  it('構えで受けた直後の1発は前隙なし(社長決定 #7)', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(45, 0, 'z')], player: { ...st.player, brawler: { ...useGameStore.getState().player.brawler ?? ({} as never), points: 5 } } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5 } } }));
    useGameStore.getState().brawlerTech(0, -1);
    useGameStore.getState().damagePlayer(10, 'test');
    advance(BRAWLER_GUARD_MS + 20);
    useGameStore.getState().brawlerPress();
    expect(br().windupMs).toBe(0);
  });
  it('大踏み潰し: 半径150の敵へ2.0倍・強制ノックバック', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'a'), zombieAt(-30, 60, 'b'), zombieAt(260, 0, 'far')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(0.1, 1)).toBe(true);
    advance(210);
    expect(hpOf('a')).toBeLessThan(99999);
    expect(hpOf('b')).toBeLessThan(99999);
    expect(hpOf('far')).toBe(99999);
    const a = useGameStore.getState().enemies.find(e => e.id === 'a')!;
    expect((a.knockbackVx ?? 0)).toBeGreaterThan(0);
  });
  it('気功: 一番近い敵へ飛んで爆発・延焼(炎の床は出さない)', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(-300, 0, 'k')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 2 } } }));
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    advance(130);
    expect(useGameStore.getState().brawlerKiko.length).toBe(1);
    advance(400);
    expect(useGameStore.getState().brawlerKiko.length).toBe(0);
    const k = useGameStore.getState().enemies.find(e => e.id === 'k')!;
    expect(k.health).toBeLessThan(99999);
    expect((k.burnUntil ?? 0)).toBeGreaterThan(useGameStore.getState().gameTime);
  });
  it('飛び蹴り: 3回連発でき、1発ごとに1ポイント', () => {
    setup(2);
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 3 } } }));
    const ns: number[] = [];
    for (let i = 0; i < 3; i++) {
      expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
      ns.push(br().kickN);
      advance(130);
    }
    expect(ns).toEqual([1, 2, 3]);
    expect(br().points).toBe(0);
    expect(hpOf('z')).toBeLessThan(99999);
  });
});
