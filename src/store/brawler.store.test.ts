// ★サブウェポン「格闘」(research/BRAWLER.md)をストアで実際に動かして固める。
// 5段のつながり・ヒットストップ・技ポイント・技(構え/大踏み潰し/気功/飛び蹴り)・近接専用モード・守護霊の疑似プレイヤー。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isMeleeOnlyMode, isBrawlerGuarding, subWeaponBlockedByKatana, isWhipMode, drainBrawlerSfx, BRAWLER_SFX_DEATH, INVULN_MS, kbStopBoost, KNOCKBACK_DURATION, KNOCKBACK_SPEED } from './gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { brawlerLiftBreaksTech, brawlerLockHitMs, brawlerLockAlive } from '../utils/brawlerCombo';
import type { Projectile } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { buildPseudoPlayer } from '../utils/playerBuild';
import { BRAWLER_GUARD_MS, brawlerPointCap, BRAWLER_SMALL_KB_MULT, BRAWLER_BOSS_SMALL_KB_MULT, brawlerStepAllowed, BRAWLER_STEP_BUFFER_MS, BRAWLER_SECRET_IGNITE_MS, BRAWLER_WORLD_STOP, BRAWLER_TECHS, BRAWLER_CANCEL_WINDOW_MS } from '../utils/brawler';
import { LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';
import { playerSuperArmorActive } from '../utils/superArmor';
import { treesInRegion, trunkRect } from '../world/trees';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
// ★テンポ係数(§9-68): この表の時刻は係数1.0(今までの値)で書いてある。係数1.3の挙動は brawlerTempo.store.test.ts で固める。
setBrawlerTempoAll(1.0); // 記述時(describe の中で時刻を組む所)より先に効かせる=モジュールの頭で呼ぶ

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
    // ★画面全体の止め(triggerHitstop・格闘の当たり): 実機のループと同じく、止まっている間は壁時計だけ進める(gameTime もシミュレーションも止まる)。
    if (now - 10 < useGameStore.getState().hitstopUntil) continue;
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
  it('格闘は近接専用モード=銃は止まる・他のサブは止まらない(社長指示2026-11-09)・鞭は動かない', () => {
    setup();
    const p = useGameStore.getState().player;
    expect(isMeleeOnlyMode(p)).toBe(true);
    expect(subWeaponBlockedByKatana(p, 'heavy-grenade')).toBe(false);
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
      advance(700 + BRAWLER_WORLD_STOP.weak); // 戻り・止めを抜ける(400msの受付の中で次を押す=間に合わない時はやり直し)。画面全体の止め(社長指示2026-11-12・BRAWLER_WORLD_STOP)の間は時計が止まるので、その分を足す
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
  it('当たりの止め(画面全体)の間は段の時計が止まる(1段目: 戻り140ms+画面全体の止め・社長指示2026-11-12)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    advance(60);
    expect(br().resolved).toBe(true);
    advance(BRAWLER_WORLD_STOP.weak + 130);
    expect(br().phase).toBe('attack'); // 画面全体の止め(社長指示2026-11-12・BRAWLER_WORLD_STOP)のぶん、まだ戻りの中
    advance(20);
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
  it('ポイント不足では技が出ない(数字が震える印)。ステップを出せる時はその向きへのステップになる(社長指示2026-11-12)', () => {
    // 待機=左フリックで左へステップ(技は出ない)。ステップを出せない時の拒否は構えの延長の「足りなければ拒否」で見る。
    setup();
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    expect(br().tech).toBeNull();
    expect(br().stepAt).toBe(now);
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: -1, y: 0 });
  });
  it('方向の無い入力は技を出さない', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(1, 0, true)).toBe(false);
    expect(br().points).toBe(5);
  });
  it('構え: 1秒間はあらゆる被害が0・ポイント3消費(社長指示2026-11-07)・紫の弾も弾き返す窓', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(250); // 初期化
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 6 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().points).toBe(3);
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
      advance(BRAWLER_TECHS.kick.windupMs + BRAWLER_WORLD_STOP.strong + 11); // 飛ぶ時間の直後(当たりの画面全体の止め(社長指示2026-11-12・BRAWLER_WORLD_STOP)の分を足す)
    }
    expect(ns).toEqual([1, 2, 3]);
    expect(br().points).toBe(0);
    expect(hpOf('z')).toBeLessThan(99999);
  });
});

describe('格闘: 指定打撃の分岐(§8-1 の止めるもの/残すもの)', () => {
  it('窓・CD・ナイフの絵(meleeSwingAt)・斬撃の絵は出さず、COMBO と打刻(押した時刻)は残す', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(45, 0, 'z')], player: { ...st.player, skills: [...(st.player.skills ?? []), 'slasher'] as never, skillLevels: { ...(st.player.skillLevels ?? {}), slasher: 1 } as never } }));
    const p0 = useGameStore.getState().player;
    const pressAt = now;
    useGameStore.getState().brawlerPress();
    advance(70);
    const s = useGameStore.getState();
    expect(hpOf('z')).toBeLessThan(99999);
    expect(s.player.counterWindowEnd).toBe(p0.counterWindowEnd);
    expect(s.player.counterCooldownEnd).toBe(p0.counterCooldownEnd);
    expect(s.player.meleeSwingAt).toBe(p0.meleeSwingAt);
    expect(s.player.slasherChainReadyAt).toBe(p0.slasherChainReadyAt); // スラッシャーは効かない
    expect(s.player.meleeSwingPressedAt).toBe(pressAt);
    expect(s.player.meleeSwingCommitAt).toBeGreaterThan(0);
    expect(s.meleeHitComboCount).toBeGreaterThan(0);
    expect(s.effects.some(e => e.kind === 'slash')).toBe(false);
  });
  // 社長指示2026-11-10「どの攻撃も押さない攻撃でも多少押そう。少しずつズレた方が楽しい」: 旧「1・2段目は押さない(速さ0)」を新仕様へ。
  it('1・2段目は小さく押す(3段目の普通の押しより弱い・免疫は張らない)・止めは段の表の ms(再発火ガードなし)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    advance(60);
    const z1 = useGameStore.getState().enemies.find(e => e.id === 'z')!;
    expect(Math.hypot(z1.knockbackVx ?? 0, z1.knockbackVy ?? 0)).toBeCloseTo(KNOCKBACK_SPEED * BRAWLER_SMALL_KB_MULT, 5);
    expect(BRAWLER_SMALL_KB_MULT).toBeLessThan(1);
    expect(z1.knockbackImmuneUntil ?? 0).toBeLessThanOrEqual(now);
    expect((z1.hitStunUntil ?? 0) - now).toBe(BRAWLER_WORLD_STOP.weak); // 弱の止め=敵の止め(壁時計)は画面全体の止め(社長指示2026-11-12・BRAWLER_WORLD_STOP)と同じ長さ
    useGameStore.getState().brawlerPress(); // 先行入力→2段目
    for (let k = 0; k < 40 && br().stage !== 2; k++) advance(10);
    for (let k = 0; k < 20 && !br().resolved; k++) advance(10);
    const z2 = useGameStore.getState().enemies.find(e => e.id === 'z')!;
    expect(z2.hitStunUntil ?? 0).toBeGreaterThan(now); // 2段目も止まる(ガードを外した)
  });
  it('被弾反撃は3段目の指定打撃で出す: 技ポイントに数えない・段は1段目へ', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(45, 0, 'z')], player: { ...st.player, brawler: { ...(st.player.brawler ?? ({} as never)), points: 2, nextStage: 3, chainUntil: 1e12 } as never } }));
    const r = useGameStore.getState().triggerCounter(undefined, { targetId: 'z', mult: 2 });
    expect(r.hits).toBe(1);
    expect(hpOf('z')).toBeLessThan(99999);
    expect(br().points).toBe(2);
    expect(br().nextStage).toBe(1);
  });
});

describe('格闘: 検収の(A)', () => {
  const guardNow = () => {
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5 } } }));
    useGameStore.getState().brawlerTech(0, -1);
    advance(20);
  };
  // ★社長指示2026-11-07「スローやカウンターの演出は入れて」(§9-41): 1巡目の検収 A-1 で止めた通常のカウンター成立の演出を戻した(格闘の受けにも重ねる)。
  const shootAt = (id: string) => {
    const c = center();
    const proj = {
      id, x: c.x - 5, y: c.y - 5, width: 10, height: 10, speed: 0, damage: 10, noCounter: true,
      direction: { x: -1, y: 0 }, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: now, critChance: 0,
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [proj] });
    applyEnemyProjectileHits(now, useGameStore.getState().player, false, 0, useGameStore.getState().gameTime, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
  };
  const hasCounterCallout = () => useGameStore.getState().effects.some(e => (e as { text?: string }).text === 'Counter!');
  it('構えの窓で弾を打ち返す: 打ち返しに加えて、青い「Counter!」・counter の音・スローが出る(格闘の白金の受けも出る)', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    guardNow();
    drainBrawlerSfx();
    const slow0 = useGameStore.getState().timeSlowUntil;
    const hp0 = useGameStore.getState().player.health;
    shootAt('ep');
    const pr = useGameStore.getState().projectiles.find(x => x.id === 'ep');
    expect(pr?.hostile).toBe(false); // 紫の弾も打ち返した
    expect(useGameStore.getState().player.health).toBe(hp0);
    expect(hasCounterCallout()).toBe(true);
    expect(drainBrawlerSfx().map(b => b.key)).toContain('counter');
    expect(useGameStore.getState().timeSlowUntil).toBeGreaterThan(slow0);
    expect(useGameStore.getState().player.brawler!.guardHitAt).toBe(now); // 白金の受けも出た
  });
  it('スローと停止は構え1回につき最初の1度だけ(2発目以降は Counter! と音だけ)・延長すると数え直す', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    guardNow();
    shootAt('e1');
    const slow1 = useGameStore.getState().timeSlowUntil;
    advance(200);
    useGameStore.setState({ effects: [] });
    shootAt('e2');
    expect(hasCounterCallout()).toBe(true);
    expect(useGameStore.getState().timeSlowUntil).toBe(slow1); // 重ねない
    // 延長(再入力)したら数え直す
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 3 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    advance(200);
    shootAt('e3');
    expect(useGameStore.getState().timeSlowUntil).toBeGreaterThan(slow1);
  });
  it('A-2 気功で倒した敵は経験値を落とし、断末魔を鳴らす', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(-200, 0, 'k', 1)], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 2 } } }));
    const pk0 = useGameStore.getState().pickups.length;
    drainBrawlerSfx();
    useGameStore.getState().brawlerTech(-1, 0);
    advance(500);
    expect(useGameStore.getState().enemies.find(e => e.id === 'k' && e.health > 0 && e.corpseUntil === undefined)).toBeUndefined();
    expect(useGameStore.getState().pickups.length).toBeGreaterThan(pk0);
    expect(drainBrawlerSfx().map(b => b.key)).toContain(BRAWLER_SFX_DEATH);
  });
  it('A-3 拳で倒したら断末魔を鳴らす', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z', 1)] });
    drainBrawlerSfx();
    useGameStore.getState().brawlerPress();
    advance(70);
    expect(drainBrawlerSfx().map(b => b.key)).toContain(BRAWLER_SFX_DEATH);
  });
  it('当たりの音は専用の素材(§22): 1段目が当たるとパンチの音・旧の2枚重ねは鳴らさない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    drainBrawlerSfx();
    useGameStore.getState().brawlerPress();
    advance(120);
    const keys = drainBrawlerSfx().map(b => b.key);
    expect(keys).toContain('brawler-punch');
    expect(keys).not.toContain('brawler-hit');
    expect(keys).not.toContain('whip-hit');
  });
  it('敵には当たらず小物(松明)だけを叩いた時も、当たりの音が鳴る(社長実機2026-11-11「格闘で物壊した時のSEが無い」)', () => {
    setup();
    const c = center();
    useGameStore.setState({ enemies: [], breakableProps: [{ id: 'torch-t', x: c.x + 20, y: c.y - 20, width: 20, height: 40, footX: c.x + 30, footY: c.y + 10, scale: 1, health: 1, maxHealth: 1, type: 'torch', lastHit: 0 }] });
    drainBrawlerSfx();
    useGameStore.getState().brawlerPress();
    advance(120);
    expect(useGameStore.getState().breakableProps.some(p => p.id === 'torch-t' && p.health > 0)).toBe(false); // 壊れた
    expect(drainBrawlerSfx().map(b => b.key)).toContain('brawler-punch');
  });
  it('A-5 武器庫の円の中: 押した瞬間は店を開く(段は出さない)/段の判定の時刻では店を開かない(ポイントを失わない)', () => {
    setup();
    const c = center();
    useGameStore.setState(st => ({ enemies: [zombieAt(45, 0, 'z')], baseSites: [{ ...st.baseSites[0], x: c.x, y: c.y, status: 'captured' }], shopReopenAt: 0 }));
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    expect(useGameStore.getState().showShopMenu).toBe(true);
    expect(useGameStore.getState().player.brawler?.phase ?? 'idle').toBe('idle');
    const site = useGameStore.getState().baseSites[0];
    useGameStore.setState({ showShopMenu: false, isPaused: false, baseSites: [] });
    useGameStore.getState().brawlerPress(); // 円の外で押す
    useGameStore.setState({ baseSites: [site] }); // 判定の時刻には円の中
    advance(70);
    expect(useGameStore.getState().showShopMenu).toBe(false);
    expect(br().points).toBe(1);
  });
  it('A-6 被弾反撃の飛び込みは格闘の詰めの形を持ち越さない', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, lungeShape: 'accel', lungeHoldUntil: now + 999 } }));
    useGameStore.setState({ enemies: [zombieAt(100, 0, 'z')] });
    useGameStore.setState(st => ({ player: { ...st.player, invulnerable: false } }));
    useGameStore.getState().damagePlayer(5, 'test', undefined, undefined, undefined, undefined, undefined, undefined, 'z');
    useGameStore.getState().tryHitRetaliation(1, 0);
    expect(useGameStore.getState().player.lungeShape).toBe('decel');
    expect(useGameStore.getState().player.lungeHoldUntil).toBe(0);
  });
});

describe('格闘: 弾を拾っても技ポイントが増える(社長指示2026-11-07)', () => {
  const pickAmmo = (id: string) => {
    const c = center();
    useGameStore.setState({ pickups: [{ id, x: c.x, y: c.y, type: 'ammo-handgun', value: 0 }] });
    useGameStore.getState().collectPickup(id);
  };
  it('弾1つ=+1。弾の補充は今までどおり。HUD の合図の時刻が打たれる', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(250); // 初期化
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 0 } } }));
    useGameStore.setState(st => ({ player: { ...st.player, ammoHandgun: 0 } }));
    pickAmmo('a1');
    expect(br().points).toBe(1);
    expect(br().gainAt).toBe(now);
    expect(useGameStore.getState().player.ammoHandgun).toBeGreaterThan(0); // 補充は今までどおり
  });
  it('上限(Lv1=5)で止まる・止まった時は合図を打たない', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(250);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 5, gainAt: 0 } } }));
    pickAmmo('a2');
    expect(br().points).toBe(5);
    expect(br().gainAt ?? 0).toBe(0);
  });
  it('格闘を持っていなければ何も起きない', () => {
    setup();
    useGameStore.setState(st => ({ player: { ...st.player, subWeapons: [], brawler: undefined } }));
    pickAmmo('a3');
    expect(useGameStore.getState().player.brawler).toBeUndefined();
  });
});

describe('格闘: 5段目=一閃型の貫通突進(社長指示2026-11-07)', () => {
  const pressStage5 = () => {
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...(st.player.brawler ?? useGameStore.getState().player.brawler!), nextStage: 5, chainUntil: st.gameTime + 1000 } } }));
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    expect(br().stage).toBe(5);
  };
  const init = () => { useGameStore.getState().brawlerPress(); advance(250); };
  it('相手をすり抜けて向こう側へ出る(抜ける間は無敵)', () => {
    setup();
    init();
    useGameStore.setState({ enemies: [zombieAt(50, 0, 'z')] });
    const ez = useGameStore.getState().enemies[0];
    const ecx = ez.x + ez.width / 2;
    pressStage5();
    advance(150); // 溜め(100)+突き抜けの途中
    expect(useGameStore.getState().player.invulnerable).toBe(true);
    for (let k = 0; k < 40 && !br().resolved; k++) advance(10);
    expect(br().resolved).toBe(true);
    expect(center().x).toBeGreaterThan(ecx + ez.width / 2); // 相手の向こう側
    expect(hpOf('z')).toBeLessThan(99999);
  });
  it('軌跡の上の複数の敵に当たる', () => {
    setup();
    init();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'a'), zombieAt(110, 4, 'b'), zombieAt(150, -6, 'c'), zombieAt(80, 120, 'off')] });
    pressStage5();
    for (let k = 0; k < 60 && !br().resolved; k++) advance(10);
    expect(hpOf('a')).toBeLessThan(99999);
    expect(hpOf('b')).toBeLessThan(99999);
    expect(hpOf('c')).toBeLessThan(99999);
    expect(hpOf('off')).toBe(99999); // 帯の外
    expect(br().points).toBe(1); // 何体巻き込んでも1
  });
  it('行ける帯の外へは出ない(研究所の上下)', () => {
    setup();
    useGameStore.setState({ stageTheme: 'lab' });
    init();
    useGameStore.setState(st => ({ player: { ...st.player, y: -LAB_CORRIDOR_Y_LIMIT_PX + 30 - st.player.height / 2, lastDirection: { x: 0, y: -1 } } }));
    useGameStore.setState({ enemies: [zombieAt(0, -40, 'z')] });
    pressStage5();
    for (let k = 0; k < 60 && !br().resolved; k++) advance(10);
    advance(300);
    expect(center().y).toBeGreaterThanOrEqual(-LAB_CORRIDOR_Y_LIMIT_PX - 1e-6);
  });
});

describe('格闘: 5段目の突き抜けは木の幹を素通りしない(検収 A-1)・無敵を縮めない(A-3)', () => {
  const step = (ms: number, dt: number) => {
    const end = now + ms;
    while (now < end) {
      now += dt;
      useGameStore.setState(st => ({ gameTime: st.gameTime + dt }));
      useGameStore.getState().movePlayer(NO_INPUT, dt / 1000);
      useGameStore.getState().tickBrawler();
    }
  };
  const pressStage5 = () => {
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 5, chainUntil: st.gameTime + 1000 } } }));
    expect(useGameStore.getState().brawlerPress()).toBe(true);
  };
  const tree = () => treesInRegion(1000, 1000, 6000, 6000)[0];
  for (const dt of [17, 33]) {
    it(`幹の真上から下向き(${dt}ms 刻み)でも幹の手前で止まる`, () => {
      setup();
      useGameStore.getState().brawlerPress(); advance(400);
      const r = trunkRect(tree());
      useGameStore.setState(st => ({ enemies: [], player: { ...st.player, x: r.x + r.width / 2 - st.player.width / 2, y: r.y - 60 - st.player.height, lastDirection: { x: 0, y: 1 } } }));
      pressStage5();
      for (let k = 0; k < 100 && !br().resolved; k++) step(dt, dt);
      step(400, dt);
      const p = useGameStore.getState().player;
      expect(p.y + p.height).toBeLessThanOrEqual(r.y + 0.5);
    });
    it(`幹の横から(${dt}ms 刻み)でも幹の手前で止まる`, () => {
      setup();
      useGameStore.getState().brawlerPress(); advance(400);
      const r = trunkRect(tree());
      useGameStore.setState(st => ({ enemies: [], player: { ...st.player, x: r.x - 60 - st.player.width, y: r.y + r.height - st.player.height, lastDirection: { x: 1, y: 0 } } }));
      pressStage5();
      for (let k = 0; k < 100 && !br().resolved; k++) step(dt, dt);
      step(400, dt);
      const p = useGameStore.getState().player;
      expect(p.x + p.width).toBeLessThanOrEqual(r.x + 0.5);
    });
  }
  it('溜め中に被弾した無敵は、突き抜けを踏み出しても本来の長さまで続く', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState({ enemies: [zombieAt(50, 0, 'z')] });
    pressStage5();
    useGameStore.setState(st => ({ player: { ...st.player, invulnerable: true, invulnerableTime: Date.now() } }));
    const hurtAt = Date.now();
    advance(200); // 溜め(100)を越えて踏み出す
    const p = useGameStore.getState().player;
    expect(p.invulnerable).toBe(true);
    expect(p.invulnerableTime + INVULN_MS).toBeGreaterThanOrEqual(hurtAt + INVULN_MS);
  });
});

describe('格闘: 下の大踏み潰しの強制ノックバックは攻撃中の雑魚も実際に動かす(実測 kb-1)', () => {
  it('噛みつきを構えた雑魚を踏み潰すと、技を取り消してから押し出される(硬直に飲まれて0pxにならない)', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    const z = zombieAt(70, 0, 'z');
    const gt = useGameStore.getState().gameTime;
    Object.assign(z, { biteAt: gt + 5000 });
    useGameStore.setState(st => ({ enemies: [z], player: { ...st.player, invulnerable: true, invulnerableTime: Date.now() + 1e9, brawler: { ...st.player.brawler!, points: 5 } } }));
    const x0 = z.x;
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    for (let i = 0; i < 50; i++) {
      now += 16;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 16 }));
      useGameStore.getState().movePlayer(NO_INPUT, 0.016 * 1.2);
      useGameStore.getState().tickBrawler();
      useGameStore.getState().updateEnemies(0.016 * 1.2);
    }
    const e = useGameStore.getState().enemies.find(en => en.id === 'z')!;
    expect(e.biteAt ?? 0).toBe(0); // 技は取り消された
    expect(e.x - x0).toBeGreaterThan(40); // 実際に押し出された
  });
});

describe('格闘: 飛び蹴りの飛距離は伸びても木の幹を素通りしない', () => {
  it('幹の手前から横へ蹴り出しても(33ms 刻み)幹の手前で止まる', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    const r = trunkRect(treesInRegion(1000, 1000, 6000, 6000)[0]);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, x: r.x - 40 - st.player.width, y: r.y + r.height - st.player.height, lastDirection: { x: 1, y: 0 }, brawler: { ...st.player.brawler!, points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    const end = now + 500;
    while (now < end) {
      now += 33;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 33 }));
      useGameStore.getState().movePlayer(NO_INPUT, 0.033);
      useGameStore.getState().tickBrawler();
    }
    const p = useGameStore.getState().player;
    expect(p.x + p.width).toBeLessThanOrEqual(r.x + 0.5);
  });
});

describe('格闘: 5段目の飛距離は140(社長指示2026-11-07「飛距離少しだけ短く」)', () => {
  it('抜け切った時に140px進んでいて、当たりの帯も通った道筋(140)に揃う', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState({ enemies: [zombieAt(120, 0, 'near'), zombieAt(230, 0, 'far')] });
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 5, chainUntil: st.gameTime + 1000 } } }));
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && !br().resolved; k++) advance(10);
    const s = br();
    const travel = center().x - (s.palmFromX ?? 0);
    expect(travel).toBeGreaterThan(136);
    expect(travel).toBeLessThan(148); // 刻み(10ms)の端数ぶんの揺れ
    expect(hpOf('near')).toBeLessThan(99999);
    expect(hpOf('far')).toBe(99999);
  });
});

describe('押しの減衰の頭打ち(社長承認2026-11-07・§9-39): 攻撃中の敵と止まる敵で同じ距離', () => {
  const pushDist = (type: 'skeleton' | 'ghost') => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    const c = center();
    const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
    e.x = c.x + 40 - e.width / 2; e.y = c.y - e.height / 2; e.health = 9e6; e.maxHealth = 9e6; e.id = 'k';
    useGameStore.setState(st => ({ enemies: [e], player: { ...st.player, invulnerable: true, invulnerableTime: Date.now() + 1e9, brawler: { ...st.player.brawler!, nextStage: 3, chainUntil: st.gameTime + 999 } } }));
    useGameStore.getState().brawlerPress();
    let x0 = NaN, hitAtFrame = -1;
    const xs: number[] = [];
    for (let i = 0; i < 60; i++) {
      const before = useGameStore.getState().enemies.find(en => en.id === 'k')!;
      now += 16;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 16 }));
      useGameStore.getState().movePlayer(NO_INPUT, 0.016 * 1.2);
      useGameStore.getState().tickBrawler();
      useGameStore.getState().updateEnemies(0.016 * 1.2);
      const en = useGameStore.getState().enemies.find(x => x.id === 'k')!;
      xs.push(en.x);
      if (hitAtFrame < 0 && en.health < before.health) { hitAtFrame = i; x0 = before.x; }
    }
    return { moved: xs[Math.min(xs.length - 1, hitAtFrame + 26)] - x0 };
  };
  it('3段目: 攻撃中(skeleton)と止まる敵(ghost)の押しの距離の差が1割以内(旧: 止まる敵は約6割)', () => {
    const a = pushDist('skeleton').moved, b = pushDist('ghost').moved;
    expect(a).toBeGreaterThan(30);
    expect(Math.abs(a - b) / a).toBeLessThan(0.15);
  });
  it('止めの補正の式: 旧「止めの間も滑った」距離 v·T²/(2·280) に揃える倍率', () => {
    expect(kbStopBoost(0)).toBe(1);
    expect(kbStopBoost(KNOCKBACK_DURATION)).toBeCloseTo(4);
    expect(kbStopBoost(140)).toBeCloseTo(2.25);
  });
});

describe('気功の爆発に押し(社長承認2026-11-07・§9-40)', () => {
  it('攻撃していない敵は爆心から外向きに押される', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    const c = center();
    const e = spawnEnemyAt('ghost', 0, 0, useGameStore.getState().gameTime);
    e.x = c.x - 150 - e.width / 2; e.y = c.y - e.height / 2; e.health = 9e6; e.maxHealth = 9e6; e.id = 'g';
    useGameStore.setState(st => ({ enemies: [e], player: { ...st.player, invulnerable: true, invulnerableTime: Date.now() + 1e9, brawler: { ...st.player.brawler!, points: 5 } } }));
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    let pushed = false;
    for (let i = 0; i < 60 && !pushed; i++) {
      now += 16;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 16 }));
      useGameStore.getState().tickBrawler();
      const g = useGameStore.getState().enemies.find(x => x.id === 'g')!;
      if ((g.knockbackUntil ?? 0) > Date.now() && (g.knockbackVx ?? 0) < -10) pushed = true;
    }
    expect(pushed).toBe(true); // 爆心(敵の手前=プレイヤー側)から外向き=さらに左へ
  });
});

describe('格闘: 構えの延長(社長指示2026-11-07「カウンター中もカウンター入力を受け付ける(連続延長発動できる)」)', () => {
  const guard = () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, brawler: { ...st.player.brawler!, points: 9 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  };
  it('構えの最中の再入力で、終わる時刻が「再入力の時刻+1秒」に引き直される(積み上げない)・3ポイント払う', () => {
    guard();
    advance(600);
    const gt = useGameStore.getState().gameTime;
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().guardUntil).toBe(gt + BRAWLER_GUARD_MS);
    expect(br().points).toBe(3); // 9 - 3 - 3
    expect(br().phase).toBe('tech');
    expect(br().tech).toBe('guard');
  });
  it('足りなければ拒否(数字が沈む)・終わる時刻は変わらない', () => {
    guard();
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 2 } } }));
    advance(300);
    const until0 = br().guardUntil;
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(false);
    expect(br().guardUntil).toBe(until0);
    expect(br().denyAt).toBe(now);
  });
  // ★§19-1・§19-2 で書き換え: 構えからの道は構えの延長だけ=他の技は出ない・**覚えもしない**(旧: 先行入力として覚え、構えの後に出していた)。
  it('構えの間は他の技(下・左・右)は出ない・先行入力としても覚えない(道の表に無い=§19-2)', () => {
    guard();
    advance(200);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(false);
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(false);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(false);
    expect(br().tech).toBe('guard');
    expect(br().techBuffer).toBeUndefined();
    advance(BRAWLER_GUARD_MS); // 構えが終わっても、勝手に技は出ない
    expect(br().phase).toBe('idle');
  });
  it('延長すると、カウンター窓と被害の無効が切れ目なく延長後の終わりまで続く', () => {
    guard();
    advance(900);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    advance(500); // 最初の構えなら切れていた時刻を越える
    const st = useGameStore.getState();
    expect(isBrawlerGuarding(st.player, st.gameTime)).toBe(true);
    expect(st.player.counterWindowEnd).toBeGreaterThan(Date.now());
    const hp0 = st.player.health;
    expect(useGameStore.getState().damagePlayer(30, 'test')).toBe(false);
    expect(useGameStore.getState().player.health).toBe(hp0);
    advance(600); // 延長後の1秒を越えた
    expect(isBrawlerGuarding(useGameStore.getState().player, useGameStore.getState().gameTime)).toBe(false);
  });
});

describe('構えで受けた時もカウンター成立の記録を書く(社長承認2026-11-07「構えで受けた時もボムカウンターを出す」・§9-42)', () => {
  it('受けると lastCounterSuccessTime が書かれる=ループのエッジ検出が金の輪・ボムカウンターを出す。光線の毎フレームの受けは140msに1度', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, lastCounterSuccessTime: 0, brawler: { ...st.player.brawler!, points: 5 } } }));
    useGameStore.getState().brawlerTech(0, -1);
    advance(20);
    const c = center();
    useGameStore.getState().brawlerGuardReceive(c.x + 30, c.y);
    expect(useGameStore.getState().player.lastCounterSuccessTime).toBe(now);
    const t1 = now;
    advance(50);
    useGameStore.getState().brawlerGuardReceive(c.x + 30, c.y);
    expect(useGameStore.getState().player.lastCounterSuccessTime).toBe(t1); // 140ms の中は書かない
    advance(150);
    useGameStore.getState().brawlerGuardReceive(c.x + 30, c.y);
    expect(useGameStore.getState().player.lastCounterSuccessTime).toBe(now);
  });
});

// ★書き換え(社長指示2026-11-10・research/BRAWLER.md §12-3d): 旧「構えのカウンター成立で技ポイントを全回復(2026-11-08)」は撤去された。
// 新しい決め=構えで受けても技ポイントは増えない(HUD の跳ね=gainAt も出ない)。成立の効果は下の「構えの成立の作り直し」で固める。
describe('構えで受けても技ポイントは増えない(社長指示2026-11-10・全回復の撤去。ジャストの受けだけ例外=下)', () => {
  it('構え(3ポイント)で受けても、技ポイントは払った後のまま・gainAt も打たれない(相手が分からない受け/雑魚/ボス級のどれでも)', () => {
    for (const who of ['unknown', 'mob', 'boss'] as const) {
      setup();
      useGameStore.getState().brawlerPress(); advance(400);
      const foe = who === 'mob' ? [zombieAt(60, 0, 'z')] : who === 'boss' ? [{ ...zombieAt(120, 0, 'h'), type: 'hunter' as const }] : [];
      useGameStore.setState(st => ({ enemies: foe, player: { ...st.player, brawler: { ...st.player.brawler!, points: 3, gainAt: 0 } } }));
      expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
      expect(br().points, who).toBe(0);
      advance(200); // ジャストの窓(120ms)の外=普通の受け(ジャストの受けは +5=下の describe)
      const c = center();
      useGameStore.getState().brawlerGuardReceive(c.x + 30, c.y, foe[0]?.id);
      expect(br().points, who).toBe(0);
      expect(br().gainAt ?? 0, who).toBe(0);
      expect(br().points, who).toBeLessThan(brawlerPointCap(1));
    }
  });
});

describe('ジャスト構えの受けで技ポイントが +5(社長指示2026-11-12「ジャストカウンターになったら技ポイントが5溜まる」)', () => {
  const guardNow = (level: number, pointsAfter: number) => {
    setup(level);
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, brawler: { ...st.player.brawler!, points: 3, gainAt: 0 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: pointsAfter } } }));
  };
  const receive = () => { const c = center(); useGameStore.getState().brawlerGuardReceive(c.x + 30, c.y); };
  it('ジャストで受けると +5・HUD の跳ね(gainAt)が打たれる', () => {
    guardNow(3, 0);
    advance(20);
    receive();
    expect(br().justAt).toBe(now);
    expect(br().points).toBe(5);
    expect(br().gainAt).toBe(now);
  });
  it('上限で頭打ち(Lv1=5)', () => {
    guardNow(1, 2);
    advance(20);
    receive();
    expect(br().points).toBe(brawlerPointCap(1));
  });
  it('普通の受け(ジャストの窓の外)では増えない', () => {
    guardNow(3, 0);
    advance(200);
    receive();
    expect(br().justAt ?? 0).not.toBe(now);
    expect(br().points).toBe(0);
    expect(br().gainAt ?? 0).toBe(0);
  });
  it('構え1回の中で2度ジャストになっても +5 は1回・延長した構えでは数え直す', () => {
    guardNow(3, 0);
    advance(10);
    receive();
    expect(br().points).toBe(5);
    // 間引きを外して、同じ構えの窓の中でもう一度ジャストの受けを起こす
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, guardHitAt: 0 } } }));
    advance(10);
    receive();
    expect(br().justAt).toBe(now); // 2度目もジャスト
    expect(br().points).toBe(5);   // でも +5 は1回
    // 延長=新しい構え
    advance(300);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 10 } } }));
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    const before = br().points;
    advance(20);
    receive();
    expect(br().justAt).toBe(now);
    expect(br().points).toBe(Math.min(brawlerPointCap(3), before + 5));
  });
});

describe('血の覚醒中は技ポイントを無視して使い放題(社長指示2026-11-08)', () => {
  it('ポイント0でも技が出て、ポイントは減らない', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, bloodAwakenUntil: st.gameTime + 10000, brawler: { ...st.player.brawler!, points: 0 } } }));
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true); // 下=大踏み潰し(本来5ポイント)
    expect(useGameStore.getState().player.brawler!.points).toBe(0);
  });
  it('覚醒していなければ、ポイント0では出ない', () => {
    setup();
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, bloodAwakenUntil: 0, brawler: { ...st.player.brawler!, points: 0 } } }));
    // 技は出ない。待機なのでフリックの向きへのステップになる(社長指示2026-11-12)
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    expect(br().tech).toBeNull();
    expect(br().stepAt).toBe(now);
  });
});

describe('秘奥義(research/BRAWLER.md §10・社長指示2026-11-08)', () => {
  const untilIdle = () => { for (let k = 0; k < 200 && (br().phase !== 'idle'); k++) advance(10); };
  const centerCam = () => useGameStore.setState(st => {
    const p = st.player;
    return { viewZoom: 1, camera: { x: p.x + p.width / 2 - st.gameBounds.width / 2, y: p.y + p.height / 2 - st.gameBounds.height / 2 } };
  });
  const fireSecret = () => {
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); untilIdle(); advance(100);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true); untilIdle(); advance(100);
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true); untilIdle(); advance(100);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  };
  const prep = (enemies: ReturnType<typeof zombieAt>[]) => {
    setup(3);
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ enemies, player: { ...st.player, health: 9999, maxHealth: 9999, brawler: { ...st.player.brawler!, points: 20 } } }));
    centerCam();
  };
  it('→↓←↑ が実際に出ると、↑で秘奥義に置き換わる(構えの窓は張らない)→ 9発 → 落下 → 着地 → 技ポイント0・段は1段目', () => {
    prep([zombieAt(120, 0, 'a'), zombieAt(-140, 60, 'b'), zombieAt(60, -110, 'c')]);
    fireSecret();
    expect(br().secret?.phase).toBe('ignite');
    expect(br().guardUntil).toBe(0);
    expect(isBrawlerGuarding(useGameStore.getState().player, useGameStore.getState().gameTime)).toBe(false);
    const hp0 = ['a', 'b', 'c'].map(hpOf);
    let maxHits = 0, sawFall = false, sawLand = false;
    for (let k = 0; k < 400 && br().secret; k++) {
      advance(10);
      const sec = br().secret;
      if (sec) { maxHits = Math.max(maxHits, sec.hits); sawFall ||= sec.phase === 'fall'; sawLand ||= sec.phase === 'land'; }
    }
    expect(maxHits).toBe(9);
    expect(sawFall && sawLand).toBe(true);
    expect(br().secret).toBeUndefined();
    expect(br().points).toBe(0);
    expect(br().nextStage).toBe(1);
    expect(['a', 'b', 'c'].map(hpOf).some((h, i) => h < hp0[i])).toBe(true);
  });
  it('画面内に当てられる敵が居なくなったら中断(フィニッシュなし)・技ポイントは0', () => {
    prep([zombieAt(120, 0, 'a')]);
    fireSecret();
    useGameStore.setState({ enemies: [] });
    advance(700);
    expect(br().secret).toBeUndefined();
    expect(br().points).toBe(0);
  });
  it('発動中はスーパーアーマー・入力は受け付けない(構えの取り消しだけ別)。無敵は出始め(起動の間)だけ(社長指示2026-11-11)', () => {
    prep([zombieAt(120, 0, 'a'), zombieAt(-140, 60, 'b')]);
    fireSecret();
    const p = useGameStore.getState().player;
    expect(playerSuperArmorActive(p, 999, Date.now(), useGameStore.getState().gameTime, 368)).toBe(true);
    expect(br().secret?.phase).toBe('ignite');
    expect(p.invulnerable).toBe(true);
    // 無敵が切れる時刻=起動の終わり(それより後は被弾する)。
    expect(p.invulnerableTime + INVULN_MS).toBe(Date.now() + BRAWLER_SECRET_IGNITE_MS);
    expect(useGameStore.getState().brawlerPress()).toBe(false);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(false);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(false);
    expect(br().secret).toBeDefined();
  });
  it('構え(↑)で取り消せる: 秘奥義が終わり(技ポイントは0)、そのまま構えに入る。落下に入ったら取り消せない', () => {
    prep([zombieAt(120, 0, 'a'), zombieAt(-140, 60, 'b')]);
    fireSecret();
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().secret).toBeUndefined();
    expect(br().tech).toBe('guard');
    expect(br().points).toBe(0);
    // 落下・着地の間は取り消せない
    prep([zombieAt(120, 0, 'a'), zombieAt(-140, 60, 'b')]);
    fireSecret();
    for (let k = 0; k < 800 && br().secret && br().secret?.phase !== 'fall'; k++) advance(10);
    if (br().secret?.phase === 'fall') {
      expect(useGameStore.getState().brawlerTech(0, -1)).toBe(false);
      expect(br().secret?.phase).toBe('fall');
    }
  });
  it('間が空いたら発動しない(普通の構えになる)', () => {
    prep([zombieAt(120, 0, 'a')]);
    useGameStore.getState().brawlerTech(1, 0); untilIdle(); advance(100);
    useGameStore.getState().brawlerTech(0, 1); untilIdle(); advance(600); // 400ms を越えた
    useGameStore.getState().brawlerTech(-1, 0); untilIdle(); advance(100);
    useGameStore.getState().brawlerTech(0, -1);
    expect(br().secret).toBeUndefined();
    expect(br().tech).toBe('guard');
  });
});


describe('食らいの固まり・キャンセル(research/BRAWLER.md §11・社長指示2026-11-08。反撃=振り払いは 2026-11-11 に撤去)', () => {
  const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
  /** 格闘の指定打撃をそのまま1発(止め・押しは段の表どおり)。 */
  const hit = (id: string, move: 's1' | 's2' | 's3' | 's4', stage: 1 | 2 | 3 | 4 = 1) => {
    const spec = [null, { m: 0.35, st: 45, kb: 'none' }, { m: 0.35, st: 45, kb: 'none' }, { m: 0.8, st: 80, kb: 'normal' }, { m: 1, st: 90, kb: 'none' }][stage]!;
    return useGameStore.getState().triggerCounter(undefined, {
      targetIds: [id], mult: spec.m, brawler: true, stunMs: spec.st, kb: { kind: spec.kb as 'none' | 'normal' }, postureMult: spec.m, pressedAt: Date.now(),
      combo: { move },
    });
  };
  /** 移動・格闘・敵の更新を 10ms 刻みで進める(stepEnemies=敵も動かす)。 */
  const advanceAll = (ms: number, onStep?: () => void) => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      // ★画面全体の止め(triggerHitstop・格闘の当たり): 実機のループと同じく、止まっている間は壁時計だけ進める(gameTime もシミュレーションも止まる)。
      if (now - 10 < useGameStore.getState().hitstopUntil) continue;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
      useGameStore.getState().movePlayer(NO_INPUT, 0.01);
      useGameStore.getState().tickBrawler();
      useGameStore.getState().updateEnemies(0.01);
      onStep?.();
    }
  };

  it('雑魚は格闘の当たりで食らいの動作だけになる(動かない)。明けたら動き出す', () => {
    setup();
    const mk = (dx: number, id: string) => { const e = zombieAt(dx, 0, id); e.type = 'skeleton'; return e; };
    useGameStore.setState({ enemies: [mk(160, 'z'), mk(-160, 'c')] });
    hit('z', 's1');
    const e0 = en('z');
    // ★§20-4: 確定の固まり(gameTime の欄)=当たりの瞬間から「止め45 + 1段目の固まり300」(係数1.0)。
    expect(e0.brLockUntil).toBe(useGameStore.getState().gameTime + brawlerLockHitMs('s1', 45));
    expect(brawlerLockHitMs('s1', 45)).toBe(45 + 300);
    const x0 = e0.x, c0 = en('c').x;
    advanceAll(220);
    expect(en('z').x).toBeCloseTo(x0, 5);
    expect(Math.abs(en('c').x - c0)).toBeGreaterThan(0.5); // 当てていない方は動いている
    advanceAll(400);
    expect(Math.abs(en('z').x - x0)).toBeGreaterThan(0.5);
  });
  it('技を出している最中の敵は止めない(体勢値は削る)・★ボス級も追いかけの間は雑魚と同じ長さで固まる(社長指示2026-11-08)', () => {
    setup();
    const busy = zombieAt(90, 0, 'z');
    busy.aiPhase = 'z-red-pause'; busy.aiPhaseUntil = 999999;
    const thor = zombieAt(-90, 0, 't');
    thor.type = 'thor';
    const mob = zombieAt(0, 90, 'm');
    const thorBusy = zombieAt(0, -90, 'tb');
    thorBusy.type = 'thor'; thorBusy.bossState = 'thor-dash-windup'; thorBusy.bossStateUntil = 999999;
    useGameStore.setState({ enemies: [busy, thor, mob, thorBusy] });
    hit('z', 's1'); hit('t', 's1'); hit('m', 's1'); hit('tb', 's1');
    // ★§13-1(社長指示2026-11-09): 雑魚の溜め(z-red-pause)も固まる。§19-3: 移動の相の雑魚と同じ長さ(旧の「溜めは予算の分だけ」は撤去)。
    const gt0 = useGameStore.getState().gameTime;
    expect(en('z').brLockUntil).toBe(en('m').brLockUntil);
    expect(en('m').brLockUntil).toBe(gt0 + brawlerLockHitMs('s1', 45));
    expect(en('t').brLockUntil).toBe(en('m').brLockUntil); // 固まりの長さは雑魚と同じ(①は区分を見ない)
    expect(en('t').hitStunUntil).toBeUndefined();          // ボス級の止めは hitStunUntil(銃と同じ枠)には書かない
    expect(en('tb').brLockUntil).toBeUndefined();          // ボスの溜めは止めない(§9-72: 予告の時刻の一致を確かめ切れていない経路)
    expect(en('tb').brHoldUntil).toBeUndefined();
  });
  // ★§19-3 で書き換え: 旧「1〜4段目は次の段が届くまで固まり、5段目の後に続けて当てると減衰で4割近くまで落ちている」。
  //   新: 1〜4段目は次の段を出した瞬間に「その段が当たる時刻」まで延びる(確定)。5段目(締め)は固めず、それまでの固まりを止めの終わりまで切り詰める。
  it('5段のつなぎ: 1〜4段目の固まりは次の段が当たるまで切れない・5段目(締め)でそれまでの固まりが止めの終わりまで切り詰められる・★既定のテンポ係数1.3で測る', () => {
    setBrawlerTempoAll(1.3);
    try {
    setup(3);
    useGameStore.setState({ enemies: [zombieAt(50, 0, 'z')] });
    const hitsAt: number[] = [];      // 当たった時刻(gameTime)
    const lockBefore: number[] = [];  // その当たりの直前の、確定の固まりの終わり(gameTime)
    let lastHit = 0, lockPrev = 0;
    const watch = () => {
      const e = en('z');
      if (e.lastHit !== lastHit) { hitsAt.push(useGameStore.getState().gameTime); lockBefore.push(lockPrev); lastHit = e.lastHit; }
      lockPrev = e.brLockUntil ?? 0;
    };
    for (let i = 0; i < 5; i++) { useGameStore.getState().brawlerPress(); for (let k = 0; k < 60 && br().phase !== 'idle'; k++) { advance(10); watch(); } }
    expect(hitsAt.length).toBe(5);
    // 2〜5段目が当たる直前まで、前の段の固まり(延ばした分を含む)が生きている(=5段のつながりの中では敵は動けない)
    for (let i = 1; i < 5; i++) expect(lockBefore[i], `${i + 1}段目の直前`).toBeGreaterThanOrEqual(hitsAt[i]);
    // 5段目(締め)の後: 固まりは止め(220ms)の終わりより先には残っていない
    expect(en('z').brLockUntil ?? 0).toBeLessThanOrEqual(hitsAt[4] + 220);
    expect(en('z').brLockHits).toBe(4); // 固まりを書いた当たり=1〜4段目(締めの5段目は数えない)
    } finally { setBrawlerTempoAll(1.0); }
  });
  // ★§20-4 で書き換え: 旧「同じコンボで2回目の同じ技は固めない」→ 新「同じ技の2回目も当たりの瞬間に置き換えて固める(止めるのは減衰)」。
  it('1段目の連打も当たりごとに固まりが置き換わる(同じ技の罰は無い)・数えは固まりを書いた当たりの数', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(60, 0, 'a'), zombieAt(-60, 0, 'b')] });
    hit('a', 's1'); hit('b', 's1');
    const first = en('a').brLockUntil!;
    expect(en('b').brLockUntil).toBe(first);
    advance(100);
    hit('a', 's1'); hit('b', 's2', 2);
    expect(en('a').brLockUntil).toBe(first + 100);                           // 連打=当たりの瞬間から置き換え(同じ長さ・100ms後ろ)
    expect(en('a').brLockHits).toBe(2);
    expect(en('b').brLockUntil).toBe(first + 100);                           // 2段目=当たりの瞬間から
    expect(en('b').brLockHits).toBe(2);
    expect(en('a').health).toBeLessThan(en('b').maxHealth);                  // ダメージは入る
  });
  it('技→技のキャンセル: 当たった大踏み潰しの後隙を気功で取り消せる・空振りからは取り消せない(§25: 後隙で押した技は1つ覚え、後隙の終わりに待機から出る)', () => {
    setup(3);
    useGameStore.setState(st => ({ enemies: [zombieAt(60, 0, 'z')], player: { ...st.player, brawler: { ...(st.player.brawler ?? br()), points: 20 } } }));
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    for (let k = 0; k < 40 && !br().resolved; k++) advance(10);
    expect(br().connected).toBe(true);
    advance(BRAWLER_WORLD_STOP.closer + 10); // 止めが明けた(締めの画面全体の止め(社長指示2026-11-12・BRAWLER_WORLD_STOP))
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    expect(br().tech).toBe('kiko');
    expect(br().techChain).toEqual(['stomp', 'kiko']);
    // ★§19-1: 気功からの道は秘奥義の締めの構えだけ=大踏み潰しへは取り消せず、先行入力としても覚えない(旧: 覚えて気功の後に出していた)。
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(false);
    expect(br().tech).toBe('kiko');
    expect(br().techBuffer).toBeUndefined();
    // 空振りの大踏み潰しからは気功へ取り消せない(その場では出ない)。§25: 判定の後に押した技は、取り消しではなく1つ覚えて、後隙の終わりに待機から出る
    setup(3);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, brawler: { ...(st.player.brawler ?? br()), points: 20 } } }));
    useGameStore.getState().brawlerTech(0, 1);
    for (let k = 0; k < 40 && !br().resolved; k++) advance(10);
    advance(50);
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);           // 覚える(その場では出ない)
    expect(br().tech).toBe('stomp');
    expect(br().techBuffer).toBe('kiko');
    expect(br().lateHeld).toBe(true);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);           // 覚えられるのは1つだけ: 構えが気功を上書きする
    expect(br().tech).toBe('stomp');
    expect(br().techBuffer).toBe('guard');
    // 当たった大踏み潰しでも、受付(150ms)を過ぎたら後隙が終わるまで出ない。押した技は覚え、後隙の終わりに待機から出る
    setup(3);
    useGameStore.setState(st => ({ enemies: [zombieAt(60, 0, 'z')], player: { ...st.player, brawler: { ...(st.player.brawler ?? br()), points: 20 } } }));
    useGameStore.getState().brawlerTech(0, 1);
    for (let k = 0; k < 40 && !br().resolved; k++) advance(10);
    advance(BRAWLER_WORLD_STOP.closer + 160); // 締めの画面全体の止め(社長指示2026-11-12・BRAWLER_WORLD_STOP)+受付150の後
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    expect(br().tech).toBe('stomp');                                         // その場では出ない
    expect(br().techBuffer).toBe('kiko');
    let fired = false;
    for (let k = 0; k < 100 && !fired; k++) { advance(10); fired = br().tech === 'kiko' && br().phase === 'tech'; }
    expect(fired).toBe(true);                                                // 後隙が終わって待機へ戻った瞬間に出た
    expect(br().techBuffer).toBeUndefined();
  });
  it('キャンセルで繋いでも秘奥義が出る(→ 当てて ↓ 当てて ← 当てて ↑)・ヒット数が数えられる', () => {
    setup(3);
    useGameStore.setState(st => {
      const p = st.player;
      return {
        enemies: [zombieAt(70, 0, 'z')], viewZoom: 1,
        camera: { x: p.x + p.width / 2 - st.gameBounds.width / 2, y: p.y + p.height / 2 - st.gameBounds.height / 2 },
        player: { ...p, health: 9999, maxHealth: 9999, brawler: { ...(p.brawler ?? br()), points: 20 } },
      };
    });
    const waitHit = () => { for (let k = 0; k < 60 && !(br().resolved && br().connected && !(useGameStore.getState().gameTime < br().stopUntil)); k++) advance(10); };
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); waitHit();
    expect(br().connected).toBe(true);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true); waitHit();
    expect(br().tech).toBe('stomp');
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true); waitHit();
    expect(br().tech).toBe('kiko');
    expect(br().connected).toBe(true); // 気功の爆発が当たった
    expect(br().flowHits).toBe(3);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().secret?.phase).toBe('ignite');
  });
  it('ヒット数=つながっているコンボの数(§23): 1振りで2体に当たっても 1(敵ごとに数える)・同じ敵に続けて当てると伸びる', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(46, -8, 'a'), zombieAt(-46, 8, 'b')] });
    useGameStore.getState().brawlerPress(); advance(400); // 技ポイントの器を作る(当たるのは前の1体)
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 20 } } }));
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true); // 大踏み潰し=周りの2体に当たる
    advance(400);
    const counts = useGameStore.getState().enemies.map(e => e.brComboHits ?? 0);
    expect(counts.every(n => n >= 1)).toBe(true);                 // 2体とも当たっている
    expect(br().flowHits).toBe(Math.max(...counts));              // 出る数は合計ではなく、いちばん多い敵の数
    expect(br().flowHits).toBeLessThan(counts[0] + counts[1]);
  });
  it('ヒット数(§23): 倒した1発も数に入る(2発目で倒したら 2 が出て、その数のまま切れる)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerPress(); advance(250);
    expect(br().flowHits).toBe(1);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, health: 1 })) }));
    useGameStore.getState().brawlerPress(); advance(250);
    expect(useGameStore.getState().enemies.some(e => e.id === 'z' && e.health > 0 && e.corpseUntil === undefined)).toBe(false);
    expect(br().flowHits).toBe(2);
    expect(br().flowBrokenAt ?? 0).toBeGreaterThan(0);
  });
  it('ヒット数(§23): 古い数は、後で別の理由で止まってもよみがえらない(動けるようになった時に数え直す)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'z')] });
    useGameStore.getState().brawlerPress(); advance(250);
    useGameStore.getState().brawlerPress(); advance(250);
    expect(br().flowHits).toBe(2);
    advance(1500); // 敵は動けるようになった
    useGameStore.getState().updateEnemies(0.016); // 敵の更新が、動けるようになった敵の数えを消す(実機では毎フレーム)
    expect(useGameStore.getState().enemies[0].brComboHits).toBeUndefined();
    // 別の理由(他の武器の当たりの止め)で止まる
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, hitStunUntil: now + 5000 })) }));
    useGameStore.getState().brawlerPress(); advance(250);
    expect(br().flowHits).toBe(1); // 2 から伸びない
  });
  it('ヒット数: 流れが切れたら切れた時刻を打つ(表示は 0.8 秒で消える)', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(50, 0, 'z')] });
    useGameStore.getState().brawlerPress(); advance(250);
    useGameStore.getState().brawlerPress(); advance(250);
    expect(br().flowHits).toBe(2);
    expect(br().flowBrokenAt ?? 0).toBe(0);
    advance(600);
    expect(br().flowBrokenAt ?? 0).toBeGreaterThan(0);
    useGameStore.getState().brawlerPress(); advance(250);
    expect(br().flowHits).toBe(1);
  });
});

describe('格闘の当たりでは強個体を雑魚と同じに扱う(社長指示2026-11-08「強個体も雑魚と同じにして」・research/BRAWLER.md §9-57)', () => {
  const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
  const foeOf = (type: 'driller' | 'pumpkin' | 'logger' | 'hunter' | 'zombie', id: string, dx = 60) => {
    const e = zombieAt(dx, 0, id); const w = e.width, h = e.height;
    const s = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
    s.x = e.x + w / 2 - s.width / 2; s.y = e.y + h / 2 - s.height / 2; s.id = id; s.health = 99999; s.maxHealth = 99999;
    return s;
  };
  const strike = (id: string, kb: 'none' | 'small' | 'normal' | 'big', o: { lift?: boolean; forced?: boolean } = {}) =>
    useGameStore.getState().triggerCounter(undefined, {
      targetIds: [id], mult: 1, brawler: true, stunMs: 90, postureMult: 1, pressedAt: Date.now(),
      kb: kb === 'big' ? { kind: 'big', dirX: 1, dirY: 0, bossHalf: true, ...(o.forced ? { ignoreImmune: true } : {}) } : { kind: kb, dirX: 1, dirY: 0 },
      // 3段目は浮かせる(§13-2)=重さで固まりの始まりが変わるので、比べる当たりは1段目の名札で入れる(浮かせは lift で明示)。
      ...(o.lift ? { lift: true } : {}), combo: { move: o.lift ? 's4' : 's1' },
    });
  /** 強個体と雑魚に同じ当たりを入れて、止め・押し・浮かせ・固まりの欄を比べる。 */
  const pair = (kb: 'none' | 'normal' | 'big', o: { lift?: boolean; forced?: boolean } = {}) => {
    const out: Record<string, ReturnType<typeof en>> = {};
    for (const t of ['zombie', 'driller', 'pumpkin', 'logger'] as const) {
      setup();
      useGameStore.setState({ enemies: [foeOf(t, 'x')] });
      strike('x', kb, o);
      out[t] = en('x');
    }
    return out;
  };
  it('止め・固まりは雑魚と同じ長さ(浮きの高さ・時間は §12-1 の重さで強個体が少し重い=別のテスト)', () => {
    const r = pair('none');
    for (const t of ['driller', 'pumpkin', 'logger']) {
      expect(r[t].hitStunUntil, t).toBe(r.zombie.hitStunUntil);
      expect(r[t].knockbackUntil, t).toBe(r.zombie.knockbackUntil);
      expect(r[t].brHoldUntil, t).toBe(r.zombie.brHoldUntil);
    }
    expect(r.zombie.hitStunUntil).toBe(now + 90);
  });
  it('押し(normal / big)は雑魚と同じ速さ・同じ長さ(押し道具の旗で canShoveEnemy を通す)', () => {
    for (const kb of ['normal', 'big'] as const) {
      const r = pair(kb);
      for (const t of ['driller', 'pumpkin', 'logger']) {
        expect(r[t].knockbackVx, `${kb} ${t}`).toBeCloseTo(r.zombie.knockbackVx ?? 0, 5);
        expect(r[t].knockbackUntil, `${kb} ${t}`).toBe(r.zombie.knockbackUntil);
        expect(r[t].knockbackShoveUntil, `${kb} ${t}`).toBe(r[t].knockbackUntil);
        expect(r[t].bossStopDrStage, `${kb} ${t}`).toBeUndefined();
      }
      expect(Math.abs(r.zombie.knockbackVx ?? 0)).toBeGreaterThan(0);
    }
  });
  it('実際に動く距離も雑魚と同じ(大踏み潰しの強制・締めの吹き飛ばし)', () => {
    const dist = (t: 'zombie' | 'driller', kb: 'normal' | 'big') => {
      setup();
      useGameStore.setState({ enemies: [foeOf(t, 'x')] });
      // 技を出させない(雑魚と強個体で AI の違いが出ないように)。
      useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, aiReadyAt: 1e12, biteReadyAt: 1e12 })) }));
      const x0 = en('x').x;
      strike('x', kb);
      for (let i = 0; i < 60; i++) {
        now += 10;
        useGameStore.setState(st => ({ gameTime: st.gameTime + 10, enemies: st.enemies.map(e => ({ ...e, aiReadyAt: 1e12, biteReadyAt: 1e12 })) }));
        useGameStore.getState().updateEnemies(0.01);
        if (now > (en('x').knockbackUntil ?? 0)) break;
      }
      return en('x').x - x0;
    };
    for (const kb of ['normal', 'big'] as const) {
      const z = dist('zombie', kb), d = dist('driller', kb);
      expect(z, kb).toBeGreaterThan(5);
      expect(Math.abs(d - z), kb).toBeLessThan(Math.max(2, z * 0.05));
    }
  });
  it('大踏み潰しの強制ノックバックは攻撃中の強個体の技も取り消して押す(雑魚と同じ)', () => {
    setup();
    const s = foeOf('driller', 's');
    Object.assign(s, { aiPhase: 'driller-thrust-windup', aiPhaseUntil: useGameStore.getState().gameTime + 9999 });
    useGameStore.setState({ enemies: [s] });
    strike('s', 'big', { forced: true });
    const e = en('s');
    expect(e.aiPhase).toBeUndefined();
    expect(Math.abs(e.knockbackVx ?? 0)).toBeGreaterThan(0);
    expect(e.knockbackShoveUntil).toBe(e.knockbackUntil);
  });
  it('強個体の体勢値は格闘の当たりで今どおり削れる', () => {
    setup();
    useGameStore.setState({ enemies: [foeOf('driller', 's')] });
    const p0 = en('s').bossPosture;
    strike('s', 'none');
    const p1 = en('s').bossPosture;
    expect(p1).not.toEqual(p0);
  });
  // 社長指示2026-11-10「ボスも拳鬼も」: 旧「normal は押さない」を新仕様(ボス級も小さくずれる)へ。
  it('ボス級(ハンター): 止まらない・big は半分で押す・small/normal はごく小さく押す(減衰の段は進めない・免疫なし)(浮きは §12-1 で重く浮く=別のテスト)', () => {
    setup();
    useGameStore.setState({ enemies: [foeOf('hunter', 'h'), foeOf('zombie', 'z', -60)] });
    strike('h', 'none');
    expect(en('h').hitStunUntil).toBeUndefined();
    expect(en('h').knockbackShoveUntil ?? 0).toBeLessThan(now); // none は今どおり押さない
    for (const k of ['small', 'normal'] as const) {
      setup();
      useGameStore.setState({ enemies: [foeOf('hunter', 'h'), foeOf('zombie', 'z', -60)] });
      strike('h', k);
      expect(Math.abs(en('h').knockbackVx ?? 0)).toBeCloseTo(KNOCKBACK_SPEED * BRAWLER_SMALL_KB_MULT * BRAWLER_BOSS_SMALL_KB_MULT, 5);
      expect(en('h').knockbackShoveUntil).toBe(en('h').knockbackUntil);
      expect(en('h').bossStopDrStage ?? 0).toBe(0);
      expect(en('h').knockbackImmuneUntil ?? 0).toBeLessThanOrEqual(now);
    }
    setup();
    useGameStore.setState({ enemies: [foeOf('hunter', 'h'), foeOf('zombie', 'z', -60)] });
    strike('h', 'big'); strike('z', 'big');
    expect(Math.abs(en('h').knockbackVx ?? 0)).toBeCloseTo(Math.abs(en('z').knockbackVx ?? 0) / 2, 5);
    expect(en('h').knockbackShoveUntil).toBe(en('h').knockbackUntil);
  });
});

describe('移動・待ちの相の敵も格闘で固まる(社長実機報告2026-11-08「攻撃で敵が止まるのは一切入ってない」・research/BRAWLER.md §9-59)', () => {
  const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
  const s1 = (id: string) => useGameStore.getState().triggerCounter(undefined, {
    targetIds: [id], mult: 0.35, brawler: true, stunMs: 45, kb: { kind: 'none' }, postureMult: 0.35, pressedAt: Date.now(), combo: { move: 's1' },
  });
  /** 実際の AI を回す(移動・格闘・敵の更新)。 */
  const live = (ms: number, each?: () => void) => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
      useGameStore.getState().movePlayer(NO_INPUT, 0.01);
      useGameStore.getState().tickBrawler();
      useGameStore.getState().updateEnemies(0.012);
      each?.();
    }
  };
  /** 実際の AI でゾンビを寄らせ、指定の相に入った所で止める。 */
  const approachUntil = (phases: string[], dx = 120) => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(dx, 0, 'z')], player: { ...st.player, health: 9999, maxHealth: 9999 } }));
    for (let i = 0; i < 600 && !phases.includes(en('z').aiPhase ?? 'none'); i++) live(10);
    return en('z').aiPhase;
  };
  it('普通に寄ってきたゾンビ(zpause / zrush)を1段目で殴ると、固まって動かない(相の時計も止まり、明けたら続きから)', () => {
    const ph = approachUntil(['zrush', 'zpause']);
    expect(['zrush', 'zpause']).toContain(ph);
    const until0 = en('z').aiPhaseUntil ?? 0;
    s1('z');
    const e0 = en('z');
    // ★§20-4: 確定の固まり(gameTime の欄)=止め45+1段目の固まり300=345ms(係数1.0)。旧: 壁時計で 止め45+基本300。
    expect(e0.brLockUntil).toBe(useGameStore.getState().gameTime + 345);
    const x0 = e0.x, y0 = e0.y;
    live(220);
    expect(en('z').x).toBeCloseTo(x0, 5);
    expect(en('z').y).toBeCloseTo(y0, 5);
    expect(en('z').aiPhase).toBe(ph);                         // 相はそのまま
    expect((en('z').aiPhaseUntil ?? 0) - until0).toBeGreaterThanOrEqual(200); // 相の時計が止まった分だけ後ろへ
    expect(en('z').biteAt ?? 0).toBe(0);                      // 固まっている間は噛みを構えない
  });
  it('★§13-1 予告の溜め(z-red-pause)に入ったゾンビも固まる(§20-4: 移動の相と同じ長さ・旧の予算は撤去)・体勢値・ダメージは入る', () => {
    setup();
    const z = zombieAt(80, 0, 'z');
    Object.assign(z, { aiPhase: 'z-red-pause', aiPhaseUntil: useGameStore.getState().gameTime + 5000 });
    useGameStore.setState({ enemies: [z] });
    s1('z');
    expect(en('z').brLockUntil).toBe(useGameStore.getState().gameTime + 345);
    expect(brawlerLockAlive(en('z'), useGameStore.getState().gameTime)).toBe(true);
    expect(en('z').health).toBeLessThan(en('z').maxHealth);
  });
  it('★§13-1 噛みつきを構えている敵(biteAt>0)も固まる(§19-3: 移動の相と同じ長さ)', () => {
    setup();
    const z = zombieAt(80, 0, 'z');
    Object.assign(z, { aiPhase: 'zrush', aiPhaseUntil: useGameStore.getState().gameTime + 2000, biteAt: useGameStore.getState().gameTime + 1 });
    useGameStore.setState({ enemies: [z] });
    s1('z');
    expect(en('z').brLockUntil).toBe(useGameStore.getState().gameTime + 345);
  });
});

describe('技の先行入力と秘奥義の1手目(社長指示2026-11-08「技の先行入力だけ採用ただし、1発目は敵に当たっていること」・§9-60)', () => {
  const prep = (enemies: ReturnType<typeof zombieAt>[]) => {
    setup(3);
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => {
      const p = st.player;
      return {
        enemies, viewZoom: 1, camera: { x: p.x + p.width / 2 - st.gameBounds.width / 2, y: p.y + p.height / 2 - st.gameBounds.height / 2 },
        player: { ...p, health: 9999, maxHealth: 9999, brawler: { ...p.brawler!, points: 20, nextStage: 1, chainUntil: 0, secretProgress: 0, secretLastEndAt: 0 } },
      };
    });
  };
  /** →↓←↑ を一定の間隔で入れて、秘奥義が出たか。 */
  const flickAll = (gap: number) => {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) { useGameStore.getState().brawlerTech(dx, dy); advance(gap); }
    let secret = !!br().secret;
    for (let i = 0; i < 150 && !secret; i++) { advance(10); secret = !!br().secret; }
    return secret;
  };
  // ★§19-2 で書き換え: 旧「技の最中に入れた次の技を覚え、前の技が終わった瞬間に出す」→ 新「道の上の技だけ覚え、取り消しの受付が開いた瞬間
  //   (当たりの止めが明けた瞬間)に出す。当たらなかったら捨てる=後隙の終わりに勝手に出さない」。
  it('技の最中に入れた道の上の技を覚え、当たりの止めが明けた瞬間に出す(値段は出す瞬間に払う)', () => {
    prep([zombieAt(60, 0, 'z')]);
    useGameStore.getState().brawlerTech(0, 1);          // 大踏み潰し
    advance(50);
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true); // 気功=道の上(大踏み潰し→気功)
    expect(br().tech).toBe('stomp');
    expect(br().techBuffer).toBe('kiko');
    const pts = br().points;
    for (let i = 0; i < 40 && !br().resolved; i++) advance(10);
    expect(br().connected).toBe(true);
    const stopUntil = br().stopUntil;
    for (let i = 0; i < 100 && br().tech !== 'kiko'; i++) advance(10);
    expect(br().tech).toBe('kiko');
    // 止めが明けた最初のフレームに出た(画面全体の止めの間は gameTime が進まない=止めの明けの最初の 10ms 刻み)
    expect(br().startAt).toBeGreaterThanOrEqual(stopUntil);
    expect(br().startAt).toBeLessThan(stopUntil + 10);
    expect(br().points).toBe(pts - 2);                    // 値段は出す瞬間に払う
    expect(br().techBuffer).toBeUndefined();
  });
  it('当たらなかった技では、覚えた技を捨てる(後隙の終わりに勝手に出さない)', () => {
    prep([]);
    useGameStore.getState().brawlerTech(0, 1);          // 大踏み潰し(空振り)
    advance(50);
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    expect(br().techBuffer).toBe('kiko');
    const pts = br().points;
    for (let i = 0; i < 40 && !br().resolved; i++) advance(10);
    advance(10);
    expect(br().techBuffer).toBeUndefined();              // 空振りと分かった時点で捨てる
    for (let i = 0; i < 100 && br().phase !== 'idle'; i++) advance(10);
    advance(50);
    expect(br().phase).toBe('idle');
    expect(br().points).toBe(pts);                        // 気功は出ていない(払ってもいない)
  });
  it('覚えている間の通常攻撃は捨てる(技を優先)・新しい技の入力で上書き・道に無い技は覚えない', () => {
    prep([]);
    useGameStore.getState().brawlerTech(1, 0); advance(30);                  // 飛び蹴りの出だし
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);            // 大踏み潰し=取り消せる(飛び蹴り→大踏み潰し)
    expect(br().techBuffer).toBe('stomp');
    expect(useGameStore.getState().brawlerPress()).toBe(false);
    expect(br().buffered).toBe(false);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);            // 次の蹴り(連続)で上書き
    expect(br().techBuffer).toBe('kick');
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(false);         // 構え=道に無い(覚えない・上書きもしない)
    expect(br().techBuffer).toBe('kick');
  });
  it('出す瞬間に技ポイントが足りなければ出さない(拒否の音と数字が沈む表示)', () => {
    prep([zombieAt(60, 0, 'z')]);
    useGameStore.getState().brawlerTech(0, 1); advance(50);
    useGameStore.getState().brawlerTech(-1, 0);
    expect(br().techBuffer).toBe('kiko');
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 1 } } }));
    for (let i = 0; i < 100 && br().phase !== 'idle'; i++) advance(10);
    advance(20);
    expect(br().tech).not.toBe('kiko');
    expect(br().techBuffer).toBeUndefined();
    expect(br().denyAt).toBeGreaterThan(0);
  });
  it('被弾で先行入力は捨てる', () => {
    prep([]);
    useGameStore.getState().brawlerTech(0, 1); advance(50);
    useGameStore.getState().brawlerTech(-1, 0);
    expect(br().techBuffer).toBe('kiko');
    useGameStore.setState(st => ({ player: { ...st.player, invulnerable: false } }));
    useGameStore.getState().damagePlayer(5, 'test');
    expect(br().techBuffer).toBeUndefined();
    for (let i = 0; i < 100 && br().phase !== 'idle'; i++) advance(10);
    advance(50);
    expect(br().tech).not.toBe('kiko');
  });
  it('→↓←↑ を先行入力で素早く入れると秘奥義が成立する(各フリックの間 265ms・すぐ下の 260ms は不成立)', () => {
    prep([zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')]);
    // 2026-11-11 に 230→240(飛び蹴りを ×1.1)、2026-11-12 に 240→265: 画面全体の止め(110/180/260)の間もプレイヤーの時間は流れるため、壁時計の間隔が延びた(技の時計の上では同じ)。
    expect(flickAll(265)).toBe(true);
    prep([zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')]);
    expect(flickAll(260)).toBe(false); // 境目の記録(止めの長さを動かしたら、ここで気づく)
  });
  // ★§19-2: 取り消しの受付(係数1.0で150ms)を過ぎた入力は、後隙が終わるまで出ない。ただし秘奥義の順番どおりの次の技は覚えておき、
  //   後隙が終わって待機へ戻った瞬間に出す(brawlerSecretCarry)=今までどおり 250〜500ms のどの間隔でも成立する
  //   (350ms は4手目の構えが「気功の受付の後・後隙の終わりの前」に落ちる=持ち越しが無いと出ない)。
  it('間をもっと空けても成立する(265〜500ms)', () => {
    for (const gap of [265, 350, 500]) { // 2026-11-12 に 250→265(画面全体の止め(110/180/260)の間もプレイヤーの時間は流れるため、壁時計の間隔が延びた(技の時計の上では同じ))
      prep([zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')]);
      expect(flickAll(gap), `${gap}ms`).toBe(true);
    }
  });
  it('秘奥義の順番どおりの次の技は、受付の外で入れても覚えて、後隙の終わりに待機から出る(気功の後の構え)。それまでは何も出ない', () => {
    prep([zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')]);
    // 画面全体の止め(社長指示2026-11-12)の分だけ気功の当たりが壁時計で後ろへずれるので、「受付の外で押す」を保つため、
    //   気功が判定を解いてから受付(BRAWLER_CANCEL_WINDOW_MS)を過ぎた所で押す(後隙の中)。
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) { useGameStore.getState().brawlerTech(dx, dy); advance(350); }
    useGameStore.getState().brawlerTech(-1, 0);
    for (let i = 0; i < 100 && !(br().tech === 'kiko' && br().resolved); i++) advance(10);
    advance(BRAWLER_CANCEL_WINDOW_MS + 20);
    expect(br().tech).toBe('kiko');
    expect(br().secretProgress).toBe(3);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);   // 受付の後=出ないが、覚える
    expect(br().tech).toBe('kiko');
    expect(br().techBuffer).toBe('guard');
    expect(br().secret).toBeUndefined();
    let endAt = -1;
    for (let i = 0; i < 100 && !br().secret; i++) { const wasKiko = br().phase === 'tech' && br().tech === 'kiko'; advance(10); if (wasKiko && br().secret) endAt = useGameStore.getState().gameTime; }
    expect(br().secret?.phase).toBe('ignite');
    expect(endAt).toBeGreaterThan(0);                                   // 気功の後隙が終わった瞬間に出た
    // §25: 順番の外の技(気功の後の飛び蹴り)も、判定の後に押したなら1つ覚える。ただし秘奥義の順番ではないので秘奥義は出ず、後隙の終わりに通常の飛び蹴りとして出る
    prep([zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')]);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0]] as const) { useGameStore.getState().brawlerTech(dx, dy); advance(350); }
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    expect(br().tech).toBe('kiko');
    expect(br().techBuffer).toBe('kick');
    for (let i = 0; i < 100 && br().tech === 'kiko'; i++) advance(10);
    expect(br().secret).toBeUndefined();
  });
  it('各フリックの間 150ms では成立しない(大踏み潰しが当たって取り消せるようになる前に←と↑が届き、1つだけの先行入力が↑で上書きされ、構えが先に出る)', () => {
    prep([zombieAt(120, 0, 'a'), zombieAt(-90, 30, 'b')]);
    expect(flickAll(150)).toBe(false);
  });
  it('1手目の飛び蹴りが外れると成立しない', () => {
    prep([zombieAt(-320, 0, 'far')]); // 蹴りの届く距離(220)の外=蹴りは空振り
    expect(flickAll(400)).toBe(false);
    expect(br().secret).toBeUndefined();
  });
});

describe('浮かせ追撃・ジャスト構え・ステップ(research/BRAWLER.md §12・社長指示2026-11-08)', () => {
  const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
  const hitMove = (id: string, move: 's1' | 's3' | 's4' | 's5', o: { lift?: boolean; big?: boolean } = {}) => useGameStore.getState().triggerCounter(undefined, {
    targetIds: [id], mult: 0.3, brawler: true, stunMs: 45, postureMult: 0.3, pressedAt: Date.now(),
    kb: o.big ? { kind: 'big', dirX: 1, dirY: 0, bossHalf: true } : { kind: 'none' }, ...(o.lift ? { lift: true } : {}), combo: { move },
  });
  const foeOf = (type: 'zombie' | 'driller' | 'hunter', id: string, dx = 60) => {
    const z = zombieAt(dx, 0, id); const s = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
    s.x = z.x + z.width / 2 - s.width / 2; s.y = z.y + z.height / 2 - s.height / 2; s.id = id; s.health = 99999; s.maxHealth = 99999;
    return s;
  };
  const live = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
      useGameStore.getState().movePlayer(NO_INPUT, 0.01);
      useGameStore.getState().tickBrawler();
      useGameStore.getState().updateEnemies(0.012);
    }
  };
  it('浮いている間は動けない(実際の AI を回す・寄ってくる zrush のゾンビ)・相の時計も止まる', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z')], player: { ...st.player, health: 9999, maxHealth: 9999 } }));
    for (let i = 0; i < 600 && !['zpause', 'zrush'].includes(en('z').aiPhase ?? ''); i++) live(10);
    const until0 = en('z').aiPhaseUntil ?? 0;
    hitMove('z', 's4', { lift: true });
    const e = en('z');
    expect(e.liftUntil).toBe(now + 585); // §12-1: 1回の浮きの基本 585ms(社長承認2026-11-08・旧450)
    const x0 = e.x, y0 = e.y;
    live(430);
    expect(en('z').x).toBeCloseTo(x0, 5);
    expect(en('z').y).toBeCloseTo(y0, 5);
    expect((en('z').aiPhaseUntil ?? 0) - until0).toBeGreaterThanOrEqual(400);
  });
  it('浮いている敵を殴ると浮きが続く(§13-2: 長さは押し上げ量×重さ・回数は予算)・地上の1段目では浮かない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(60, 0, 'z')] });
    hitMove('z', 's1');
    expect(en('z').brLiftUntil).toBeUndefined();
    hitMove('z', 's4', { lift: true });
    advance(200);
    hitMove('z', 's1');
    const e1 = en('z');
    expect(e1.brLiftN).toBe(1);
    expect(e1.brLiftUntil).toBe(now + Math.max(140, Math.round(585 * 0.5)));
    expect(e1.brLiftBudget).toBe(5); // 雑魚6 − 1段目1
    advance(100);
    hitMove('z', 's3');
    expect(en('z').brLiftN).toBe(2);
    expect(en('z').brLiftMs!).toBe(Math.round(585 * 0.75));
    expect(en('z').brLiftBudget).toBe(3); // − 3段目2
  });
  // §25(社長裁定2026-11-11): ボス級の重さは強個体と同じ 0.7。気絶・紫の間に地上から浮かせた時だけ軽い(1.0・brLiftLight)。
  it('重さ: 強個体とボス級は低く短く浮く(0.7)・気絶中に浮かせたボス級だけ雑魚と同じ高さと長さで浮く', () => {
    setup();
    useGameStore.setState({ enemies: [foeOf('zombie', 'm'), foeOf('driller', 's', -60), foeOf('hunter', 'b', 0)] });
    for (const id of ['m', 's', 'b']) hitMove(id, 's4', { lift: true });
    expect([en('m').brLiftPeak, en('s').brLiftPeak, en('b').brLiftPeak]).toEqual([1, 0.7, 0.7]);
    expect(en('b').liftUntil).toBe(en('s').liftUntil);
    expect(en('b').brLiftLight).toBe(false);
    // 気絶・紫の間のボス級を地上から浮かせる=軽い(雑魚と同じ)
    setup();
    useGameStore.setState(st => ({ enemies: [foeOf('zombie', 'm'), { ...foeOf('hunter', 'b', 0), bossFullStunUntil: st.gameTime + 5000 }] }));
    for (const id of ['m', 'b']) hitMove(id, 's4', { lift: true });
    expect([en('m').brLiftPeak, en('b').brLiftPeak]).toEqual([1, 1]);
    expect(en('b').brLiftLight).toBe(true);
    expect(en('b').liftUntil).toBe(en('m').liftUntil);
  });
  // 社長承認2026-11-10「技の最中浮く は はい」: 旧「技の最中の敵(予告の溜め)は浮かない」を新仕様へ。
  it('技の最中の雑魚・強個体も、浮く当たりで技を取り消されて浮く(予告も消える)。浮かない当たり(1段目)では技は続く', () => {
    setup();
    const mk = (id: string) => { const z = zombieAt(60, 0, id); Object.assign(z, { aiPhase: 'z-red-pause', aiPhaseUntil: useGameStore.getState().gameTime + 5000 }); return z; };
    useGameStore.setState({ enemies: [mk('z')] });
    hitMove('z', 's4', { lift: true });
    expect(en('z').brLiftUntil ?? 0).toBeGreaterThan(now);
    expect(en('z').liftUntil ?? 0).toBeGreaterThan(now);
    expect(en('z').aiPhase).toBeUndefined(); // 技は取り消し(予告の相が消える)
    setup();
    useGameStore.setState({ enemies: [mk('y')] });
    hitMove('y', 's1');
    expect(en('y').brLiftUntil).toBeUndefined();
    expect(en('y').aiPhase).toBe('z-red-pause'); // 浮かない当たりでは取り消さない
  });
  it('ボス級は技の最中に取り消して浮かせる対象ではない(雑魚・強個体は対象)', () => {
    expect(brawlerLiftBreaksTech({ aiPhase: 'g-stomp-windup' }, 'boss')).toBe(false);
    expect(brawlerLiftBreaksTech({ aiPhase: 'z-red-pause' }, 'mob')).toBe(true);
    expect(brawlerLiftBreaksTech({ aiPhase: 'z-red-pause' }, 'strong')).toBe(true);
  });
  it('空中で5段目(吹き飛ばす技)を当てると浮きを終えて吹き飛ぶ', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(60, 0, 'z')] });
    hitMove('z', 's4', { lift: true }); advance(150);
    hitMove('z', 's5', { big: true });
    const e = en('z');
    expect(e.liftUntil).toBe(now + 200); // §13-2: 締めの叩き落とし=ダウン(着地まで動けない)
    expect(e.brLiftDown).toBe(true);
    expect(Math.abs(e.knockbackVx ?? 0)).toBeGreaterThan(0);
  });
  it('ジャスト構え: 構えてから120ms以内の受けは JUST・相手の気絶2倍。121ms は普通の受け', () => {
    for (const [dt, just] of [[120, true], [130, false]] as const) {
      setup(2);
      useGameStore.setState(st => ({ enemies: [zombieAt(40, 0, 'z')], player: { ...st.player, brawler: { ...(st.player.brawler ?? br()), points: 5 } } }));
      expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
      advance(dt);
      const pl = useGameStore.getState().player;
      useGameStore.getState().brawlerGuardReceive(pl.x + pl.width / 2 + 30, pl.y + pl.height / 2, 'z');
      const gt = useGameStore.getState().gameTime;
      expect((br().justAt ?? 0) === now, `${dt}ms`).toBe(just);
      expect(en('z').stunUntil! - gt, `${dt}ms`).toBeCloseTo(5000 * (pl.stunDurationMult ?? 1) * (just ? 2 : 1), 0);
    }
  });
  it('ステップ: 向きへ100px(加速→減速)・後隙を取り消せる・木の幹で止まる', () => {
    setup();
    useGameStore.setState({ enemies: [] });
    const x0 = useGameStore.getState().player.x;
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    advance(250);
    const moved = useGameStore.getState().player.x - x0;
    expect(moved).toBeGreaterThan(90);
    expect(moved).toBeLessThan(110); // 10ms 刻みの積分の誤差の分だけ
    // 後隙の取り消し: 1段目が当たった後隙から
    setup();
    useGameStore.setState({ enemies: [zombieAt(50, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    advance(60 + BRAWLER_WORLD_STOP.weak + 10); // 弱の画面全体の止め(社長指示2026-11-12・BRAWLER_WORLD_STOP)が明けた後隙
    expect(br().phase).toBe('attack');
    expect(useGameStore.getState().brawlerStep(-1, 0)).toBe(true);
    expect(br().phase).toBe('idle');
    // 構えの最中は出せない(覚えはするが、構えは200msより長いので期限が切れて出ない・§12-3b)
    setup(2);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...(st.player.brawler ?? br()), points: 5 } } }));
    useGameStore.getState().brawlerTech(0, -1);
    {
      const gx = useGameStore.getState().player.x;
      useGameStore.getState().brawlerStep(1, 0);
      expect(br().tech).toBe('guard');
      advance(1200);
      expect(br().stepBuffer).toBeUndefined();
      expect(br().stepAt).toBeUndefined();
      expect(Math.abs(useGameStore.getState().player.x - gx)).toBeLessThan(1);
    }
    // 木の幹の手前で止まる
    setup();
    const r = trunkRect(treesInRegion(1000, 1000, 6000, 6000)[0]);
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, x: r.x - 30 - st.player.width, y: r.y + r.height - st.player.height } }));
    expect(useGameStore.getState().brawlerStep(1, 0)).toBe(true);
    const end = now + 300;
    while (now < end) { now += 33; useGameStore.setState(st => ({ gameTime: st.gameTime + 33 })); useGameStore.getState().movePlayer(NO_INPUT, 0.033); useGameStore.getState().tickBrawler(); }
    const p = useGameStore.getState().player;
    expect(p.x + p.width).toBeLessThanOrEqual(r.x + 0.5);
  });
  it('ステップの先行の覚え(§12-3b): 当たりの止めの最中に入れたステップは、止めが明けた瞬間に出る。200msを過ぎたら出ない', () => {
    setup();
    useGameStore.setState({ enemies: [zombieAt(50, 0, 'z')] });
    useGameStore.getState().brawlerPress();
    // 1段目の判定(前隙の終わり)まで進める → 止めの最中に入れる
    for (let k = 0; k < 40 && !br().resolved; k++) advance(10);
    expect(br().resolved).toBe(true);
    const t0 = useGameStore.getState().gameTime;
    expect(brawlerStepAllowed(br(), t0)).toBe(false); // 止めの最中
    expect(useGameStore.getState().brawlerStep(-1, 0)).toBe(true);
    expect(br().stepBuffer).toBeDefined();
    expect(br().stepAt).toBeUndefined();
    let firedAt = -1;
    for (let k = 0; k < 30 && firedAt < 0; k++) { advance(10); if (br().stepAt !== undefined) firedAt = useGameStore.getState().gameTime; }
    expect(firedAt).toBeGreaterThan(t0);
    expect(firedAt - t0).toBeLessThanOrEqual(BRAWLER_STEP_BUFFER_MS);
    expect(br().phase).toBe('idle'); // 後隙を取り消した
    expect(br().stepBuffer).toBeUndefined();
    // 期限切れ: 覚えてから200msより後は出さずに捨てる
    setup();
    useGameStore.setState(st => ({ enemies: [], player: { ...st.player, brawler: { ...(st.player.brawler ?? br()), stepBuffer: { x: 1, y: 0, at: st.gameTime - BRAWLER_STEP_BUFFER_MS - 1 } } } }));
    const x0 = useGameStore.getState().player.x;
    advance(20);
    expect(br().stepBuffer).toBeUndefined();
    expect(br().stepAt).toBeUndefined();
    expect(Math.abs(useGameStore.getState().player.x - x0)).toBeLessThan(1);
  });
});

// ★踵落とし(社長指示2026-11-11「3段目派生:踵落とし」「2発目の後に下」・research/BRAWLER.md §29)。
describe('格闘: 踵落とし(飛び蹴りの2発目の続きで下)', () => {
  const feed = () => useGameStore.getState().skillProcFeed.map(e => e.key);
  const waitHit = () => { for (let k = 0; k < 120 && !(br().resolved && !(useGameStore.getState().gameTime < br().stopUntil)); k++) advance(10); };
  const start = (points: number) => {
    setup(2);
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points } }, skillProcFeed: [] }));
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); waitHit();
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true); waitHit();
    expect(br().kickN).toBe(2);
  };
  it('2発目の後の下=踵落とし(3発目・2ポイント)。行の名前は 飛び蹴り→空中蹴り→踵落とし', () => {
    start(4);
    expect(br().points).toBe(2);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    expect(br().tech).toBe('kick');
    expect(br().kickN).toBe(3);
    expect(br().kickHeel).toBe(true);
    expect(br().points).toBe(0);
    expect(feed()).toEqual(['tech:kick', 'tech:kick2', 'tech:heel']);
  });
  it('2発目の後の右=蹴り飛ばし(今までどおり1ポイント)', () => {
    start(4);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    expect(br().kickHeel).toBe(false);
    expect(br().points).toBe(1);
    expect(feed()).toEqual(['tech:kick', 'tech:kick2', 'tech:kick3']);
  });
  it('技ポイントが1しか無いと踵落としは出ない(蹴り飛ばしは出る)', () => {
    start(3);
    expect(br().points).toBe(1);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(false);
    expect(br().kickN).toBe(2);
    expect(br().points).toBe(1);
    expect(useGameStore.getState().brawlerTech(1, 0)).toBe(true);
    expect(br().kickN).toBe(3);
  });
  it('当たった相手は押されない(その場に叩きつける)。蹴り飛ばしは押される', () => {
    start(4);
    useGameStore.getState().brawlerTech(0, 1); waitHit();
    expect(br().connected).toBe(true);
    const z = useGameStore.getState().enemies.find(e => e.id === 'z')!;
    expect(Math.hypot(z.knockbackVx ?? 0, z.knockbackVy ?? 0)).toBeLessThan(1);
    start(4);
    useGameStore.getState().brawlerTech(1, 0); waitHit();
    const z2 = useGameStore.getState().enemies.find(e => e.id === 'z')!;
    expect(Math.hypot(z2.knockbackVx ?? 0, z2.knockbackVy ?? 0)).toBeGreaterThan(1);
  });
  it('当たった踵落としは大踏み潰しで取り消せる(着地の隙を待たない)', () => {
    start(9);
    useGameStore.getState().brawlerTech(0, 1); waitHit();
    expect(br().kickHeel).toBe(true);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    expect(br().tech).toBe('stomp');
    expect(br().kickHeel).toBe(false);
  });
  it('2発目が当たる前に入れた下は覚えて、当たった後に踵落としで出る', () => {
    setup(2);
    useGameStore.setState(st => ({ enemies: [zombieAt(120, 0, 'z')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 4 } } }));
    useGameStore.getState().brawlerTech(1, 0); waitHit();
    useGameStore.getState().brawlerTech(1, 0); advance(20);
    expect(br().kickN).toBe(2);
    expect(br().resolved).toBe(false);
    expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
    expect(br().techBuffer).toBe('kick');
    expect(br().heelBuffer).toBe(true);
    for (let k = 0; k < 120 && !br().kickHeel; k++) advance(10);
    expect(br().kickHeel).toBe(true);
    expect(br().kickN).toBe(3);
  });
});

describe('格闘: コンボ中は最初に当てた敵を狙い続ける(社長指示2026-11-12)', () => {
  /** 判定を解いて段が終わるまで(待機・つながりの受付の中)進める。 */
  const finishStage = () => {
    for (let k = 0; k < 80 && !br().resolved; k++) advance(10);
    expect(br().connected).toBe(true);
    for (let k = 0; k < 80 && br().phase !== 'idle'; k++) advance(10);
  };
  /** 敵 id を、プレイヤーの左 dx の所へ置き直す(いちばん近くへ寄せる)。 */
  const putLeft = (id: string, dx: number) => {
    const c = center();
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => (e.id === id ? { ...e, x: c.x - dx - e.width / 2, y: c.y - e.height / 2 } : e)) }));
  };
  it('2体が並んでいる時、別の敵の方が近くなっても2段目以降は最初に当てた敵へ向かう', () => {
    setup(3);
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'a'), zombieAt(-70, 0, 'b')] });
    useGameStore.getState().brawlerPress();
    expect(br().targetId).toBe('a');
    for (const want of [2, 3]) {
      finishStage();
      expect(br().comboTargetId).toBe('a');
      putLeft('b', 20); // 狙いの固定が無ければ b を選ぶ近さ
      expect(useGameStore.getState().brawlerPress()).toBe(true);
      expect(br().stage).toBe(want);
      expect(br().targetId, `stage ${want}`).toBe('a');
      expect(br().dirX).toBeGreaterThan(0); // a の方(右)を向いている
    }
  });
  it('狙いの敵が倒れたら、今までどおりいちばん近い敵へ・次に当てた敵を新しい狙いにする', () => {
    setup(3);
    useGameStore.setState({ enemies: [zombieAt(45, 0, 'a'), zombieAt(-70, 0, 'b')] });
    useGameStore.getState().brawlerPress();
    finishStage();
    expect(br().comboTargetId).toBe('a');
    useGameStore.setState(st => ({ enemies: st.enemies.filter(e => e.id !== 'a') }));
    putLeft('b', 40);
    expect(useGameStore.getState().brawlerPress()).toBe(true);
    expect(br().targetId).toBe('b');
    for (let k = 0; k < 80 && !br().resolved; k++) advance(10);
    expect(br().comboTargetId).toBe('b');
  });
});
