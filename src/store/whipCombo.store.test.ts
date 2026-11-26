// 鞭の3連撃と掴む条件(社長指示2026-11-26「タップで0.3秒間隔で3連撃…2-3とクリティカル率が上がる。1-2撃目は敵は吹き飛ばず、ストップ弱浮き。
// 気絶の敵を攻撃すると掴めて、爆撃と共にKILL。(ボスはさっきの叩きつけ)」)をストアを動かして固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { WHIP_COUNTER_COOLDOWN_MS } from './gameStore';
import type { Enemy, EnemyType, Projectile } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { WHIP_COMBO_INTERVAL_MS, WHIP_COMBO_RESET_MS, WHIP_COMBO_CRIT_BONUS, WHIP_COMBO_FINISH_RECOVERY_MS } from '../utils/whipCombo';

let now = 15_000_000;
let rnd = 0.99;
const NO = { up: false, down: false, left: false, right: false } as never;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => st().enemies.find(e => e.id === id);
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms, realGameTime: s.realGameTime + ms, hitstopUntil: 0 }));
  st().movePlayer(NO, ms / 1000);
  st().pumpWhipQueuedTap();
  // 前隙の解決(useGameLoop と同じ): 前隙が明けたら triggerCounter(押した時刻)。
  const pend = st().player.pendingSwingAt;
  if (pend > 0 && now - pend >= 250) { useGameStore.setState(s => ({ player: { ...s.player, pendingSwingAt: 0 } })); st().triggerCounter(pend); }
  st().updateEnemies(ms / 1000);
  if (st().whipSwing) st().tickWhipSwing();
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
/** 直呼びの1振り(PC)。 */
const tap = () => st().triggerCounter();
const resetZ = (extra: Partial<Enemy> = {}) => useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', extra)] });

beforeEach(() => {
  now = 15_000_000;
  rnd = 0.99;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockImplementation(() => rnd);
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true }, breakableProps: [],
    player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('3連撃: 段が進む・0.3秒の間隔・戻る', () => {
  it('タップごとに 1→2→3→1。間隔は0.3秒(早いタップは1つ予約して明けたら出す)。0.9秒タップが無ければ1段目へ', () => {
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(st().player.counterCooldownEnd - now).toBeLessThanOrEqual(WHIP_COMBO_INTERVAL_MS);
    // 間隔の前のタップ=振らずに予約
    run(100);
    expect(tap().swung).toBe(false);
    expect(st().player.whipComboStage).toBe(1);
    expect(st().player.whipQueuedAt).toBeGreaterThan(0);
    // 間隔が明けると予約が出る(タッチと同じ前隙の経路)=2段目
    run(WHIP_COMBO_INTERVAL_MS);
    expect(st().player.whipComboStage).toBe(2);
    run(WHIP_COMBO_INTERVAL_MS);
    tap();
    expect(st().player.whipComboStage).toBe(3);
    // 3段目の後は隙(0.6秒): 段の間隔が過ぎても振れず、予約もしない(捨てる)
    expect(st().player.counterCooldownEnd - now).toBe(WHIP_COMBO_FINISH_RECOVERY_MS);
    run(WHIP_COMBO_INTERVAL_MS);
    expect(tap().swung).toBe(false);
    expect(st().player.whipQueuedAt ?? 0).toBe(0);
    expect(st().player.whipComboStage).toBe(3);
    run(WHIP_COMBO_FINISH_RECOVERY_MS - WHIP_COMBO_INTERVAL_MS - 20);
    expect(st().player.whipComboStage).toBe(3); // 隙の間に捨てたタップは隙明けに出ない
    expect(tap().swung).toBe(false);
    run(20);
    tap();
    expect(st().player.whipComboStage).toBe(1);
    run(WHIP_COMBO_INTERVAL_MS);
    tap();
    expect(st().player.whipComboStage).toBe(2);
    run(WHIP_COMBO_RESET_MS + 50);
    tap();
    expect(st().player.whipComboStage).toBe(1);
  });
  it('タッチ(指を離す)も1段ずつ進む', () => {
    resetZ();
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.whipComboStage).toBe(1);
    run(WHIP_COMBO_INTERVAL_MS + 10);
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.whipComboStage).toBe(2);
  });
});

describe('段の会心率と押し', () => {
  it('2段目・3段目は会心率が上がる(1段目は今のまま)', () => {
    // 近接の会心の基礎を0にして、乱数を上乗せ(2段目 +15%)の内側に置く: 1段目は会心にならず(気絶しない)、2段目・3段目は会心=気絶。
    useGameStore.setState(s => ({ player: { ...s.player, weapons: s.player.weapons.map(w => (w.isMelee ? { ...w, critChance: 0 } : w)) } }));
    rnd = WHIP_COMBO_CRIT_BONUS[1] * 0.5;
    const stunnedAfter = () => (en('z')?.stunUntil ?? 0) > st().gameTime;
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(stunnedAfter()).toBe(false);
    run(WHIP_COMBO_INTERVAL_MS);
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(2);
    expect(stunnedAfter()).toBe(true);
    run(WHIP_COMBO_INTERVAL_MS);
    rnd = (WHIP_COMBO_CRIT_BONUS[1] + WHIP_COMBO_CRIT_BONUS[2]) / 2; // 3段目(+30%)だけが会心になる乱数
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(3);
    expect(stunnedAfter()).toBe(true);
  });
  it('1・2段目は押さない(止めと弱い浮き)・3段目は押す', () => {
    resetZ();
    tap();
    expect(Math.hypot(en('z')!.knockbackVx ?? 0, en('z')!.knockbackVy ?? 0)).toBe(0);
    expect(en('z')!.liftUntil ?? 0).toBeGreaterThan(now);
    run(WHIP_COMBO_INTERVAL_MS);
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(2);
    expect(Math.hypot(en('z')!.knockbackVx ?? 0, en('z')!.knockbackVy ?? 0)).toBe(0);
    run(WHIP_COMBO_INTERVAL_MS);
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(3);
    expect(Math.hypot(en('z')!.knockbackVx ?? 0, en('z')!.knockbackVy ?? 0)).toBeGreaterThan(0);
  });
});

describe('掴む条件: 気絶している敵だけ', () => {
  it('普通の敵は掴まない', () => {
    resetZ();
    tap();
    expect(st().whipSwing).toBeNull();
    expect(en('z')!.whipHeld).toBeFalsy();
  });
  it('気絶した雑魚は掴んで振り回し、着弾の爆発で必ず死ぬ', () => {
    resetZ({ stunUntil: st().gameTime + 5000 });
    tap();
    expect(st().whipSwing?.enemyId).toBe('z');
    expect(st().whipSwing?.phase).toBe('swing');
    expect(en('z')!.health).toBe(99999); // 処刑の枝は通らない(掴みに置き換える)
    run(400);
    expect(st().tryFlickFollowup(0, 1)).toBe(true);
    for (let i = 0; i < 300 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    const z = en('z');
    expect(!z || z.health <= 0).toBe(true);
  });
  it('気絶した強個体も掴むが、着弾では必ず死なない(爆発のダメージを受けるだけ・足りなければ生き残る)', () => {
    useGameStore.setState({ enemies: [place('pumpkin', 100, 0, 'p', { stunUntil: st().gameTime + 5000 })] });
    tap();
    expect(st().whipSwing?.enemyId).toBe('p');
    expect(st().whipSwing?.phase).toBe('swing');
    run(1600);
    for (let i = 0; i < 300 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    const p = en('p')!;
    expect(p.health).toBeGreaterThan(0); // 体力が多い=生き残る
    expect(p.health).toBeLessThan(99999); // 爆発のダメージは受ける
  });
  it('気絶した強個体でも、着弾の爆発で体力が尽きれば死ぬ', () => {
    useGameStore.setState({ enemies: [place('pumpkin', 100, 0, 'p', { stunUntil: st().gameTime + 5000, health: 5, maxHealth: 99999 })] });
    tap();
    expect(st().whipSwing?.enemyId).toBe('p');
    run(1600);
    for (let i = 0; i < 300 && st().whipSwing; i++) step(10);
    const p = en('p');
    expect(!p || p.health <= 0).toBe(true);
  });
  it('タッチ: 3段目の後の隙の間のタップは捨てる(予約しない)', () => {
    resetZ();
    expect(st().beginMeleeSwing()).toBe(true);
    run(WHIP_COMBO_INTERVAL_MS + 10);
    expect(st().beginMeleeSwing()).toBe(true);
    run(WHIP_COMBO_INTERVAL_MS + 10);
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.whipComboStage).toBe(3);
    run(WHIP_COMBO_INTERVAL_MS + 10);
    expect(st().beginMeleeSwing()).toBe(false);
    expect(st().player.whipQueuedAt ?? 0).toBe(0);
    run(WHIP_COMBO_FINISH_RECOVERY_MS - WHIP_COMBO_INTERVAL_MS);
    expect(st().player.whipComboStage).toBe(3); // 隙明けに勝手に出ない
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.whipComboStage).toBe(1);
  });
  it('気絶したボスは叩きつけ(振り回さない)', () => {
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { stunUntil: st().gameTime + 5000 })] });
    tap();
    expect(st().whipSwing?.phase).toBe('overhead');
  });
});

describe('カウンターは1段目だけ・クールダウンは連撃の終わりから', () => {
  const opened = (at: number) => st().player.counterWindowStart === at && st().player.counterWindowEnd > at;
  it('1段目で窓が開き、2・3段目では開かない。3段目の後はクールダウン明けまで次の1段目でも開かない', () => {
    resetZ();
    const t1 = now; tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(opened(t1)).toBe(true);
    run(WHIP_COMBO_INTERVAL_MS);
    const t2 = now; tap();
    expect(st().player.whipComboStage).toBe(2);
    expect(opened(t2)).toBe(false);
    run(WHIP_COMBO_INTERVAL_MS);
    const t3 = now; tap();
    expect(st().player.whipComboStage).toBe(3);
    expect(opened(t3)).toBe(false);
    expect(st().player.whipCounterReadyAt).toBe(t3 + WHIP_COUNTER_COOLDOWN_MS);
    // 振りそのものは隙が明ければ出る(次の1段目)が、窓はクールダウン中なので開かない
    run(WHIP_COMBO_FINISH_RECOVERY_MS);
    const t4 = now; expect(tap().swung).toBe(true);
    expect(st().player.whipComboStage).toBe(1);
    expect(opened(t4)).toBe(false);
    // 連撃を止めてクールダウンが明けたら、次の1段目で開く
    run(WHIP_COUNTER_COOLDOWN_MS + WHIP_COMBO_RESET_MS);
    const t5 = now; tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(opened(t5)).toBe(true);
  });
  it('途中で止めた時は、1段目へ戻った時点からクールダウン', () => {
    resetZ();
    tap();
    run(WHIP_COMBO_INTERVAL_MS);
    const t2 = now; tap();
    expect(st().player.whipComboStage).toBe(2);
    expect(st().player.whipCounterReadyAt).toBe(t2 + WHIP_COMBO_RESET_MS + WHIP_COUNTER_COOLDOWN_MS);
    // 戻った直後(クールダウン中)は開かない
    run(WHIP_COMBO_RESET_MS + 50);
    const t3 = now; tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(opened(t3)).toBe(false);
    // 戻った時点+クールダウンを過ぎてから(連撃を止めて)振ると開く
    run(t2 + WHIP_COMBO_RESET_MS + WHIP_COUNTER_COOLDOWN_MS - now + WHIP_COMBO_RESET_MS);
    const t4 = now; tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(opened(t4)).toBe(true);
  });
  it('タッチ(前隙つき)も1段目だけ開く', () => {
    resetZ();
    const t1 = now;
    expect(st().beginMeleeSwing()).toBe(true);
    expect(opened(t1)).toBe(true);
    run(WHIP_COMBO_INTERVAL_MS + 10);
    const t2 = now;
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.whipComboStage).toBe(2);
    run(300); // 前隙の解決(triggerCounter)を通っても開かない
    expect(st().player.counterWindowStart).not.toBe(t2);
    expect(st().player.counterWindowStart).toBe(t1);
  });
});

describe('振り回している敵を盾に敵の弾をかき消す', () => {
  const shotAt = (id: string, cx: number, cy: number, extra: Partial<Projectile> = {}): Projectile => ({
    id, x: cx - 4, y: cy - 4, width: 8, height: 8, speed: 0, damage: 37, direction: { x: -1, y: 0 }, weaponType: 'enemy_bolt',
    duration: 60_000, createdAt: now, passthrough: false, hitEnemies: [], hostile: true, ...extra,
  } as Projectile);
  it('振り回し中は体に触れた敵の弾が消える。紫の弾・離れた弾は消えない。消した弾のダメージは盾の敵がその場で受ける', () => {
    resetZ({ stunUntil: st().gameTime + 5000 });
    tap();
    expect(st().whipSwing?.phase).toBe('swing');
    step(10);
    const sw = st().whipSwing!;
    const hp0 = en('z')!.health;
    useGameStore.setState({ projectiles: [shotAt('b1', sw.cx, sw.cy), shotAt('purple', sw.cx, sw.cy, { noCounter: true }), shotAt('far', sw.cx + 400, sw.cy)] });
    step(10);
    const ids = st().projectiles.map(p => p.id);
    expect(ids).not.toContain('b1');
    expect(ids).toContain('purple');
    expect(ids).toContain('far');
    expect(en('z')!.health).toBe(hp0 - 37); // 消した1発ぶん(弾の damage)
    // 普通の当たり(銃など)は今まで通り素通り
    st().damageEnemy('z', 50, false, false, false, 'gun');
    expect(en('z')!.health).toBe(hp0 - 37);
  });
  it('強個体も同じ経路で盾のダメージを受ける', () => {
    useGameStore.setState({ enemies: [place('pumpkin', 100, 0, 'p', { stunUntil: st().gameTime + 5000 })] });
    tap();
    expect(st().whipSwing?.phase).toBe('swing');
    step(10);
    const sw = st().whipSwing!;
    const hp0 = en('p')!.health;
    useGameStore.setState({ projectiles: [shotAt('b1', sw.cx, sw.cy)] });
    step(10);
    expect(en('p')!.health).toBe(hp0 - 37);
  });
  it('盾の雑魚が盾のダメージで死んだら、次のフレームでその場で着弾(爆発)する', () => {
    resetZ({ stunUntil: st().gameTime + 5000, health: 30 });
    tap();
    expect(st().whipSwing?.phase).toBe('swing');
    step(10);
    const sw = st().whipSwing!;
    useGameStore.setState(s => ({ projectiles: [shotAt('b1', sw.cx, sw.cy)], enemies: [...s.enemies, place('zombie', sw.cx - center().x + 20, sw.cy - center().y, 'n')] }));
    const hpN = en('n')!.health;
    step(10);
    step(10);
    expect(st().whipSwing).toBeNull();
    const z = en('z');
    expect(!z || z.health <= 0).toBe(true);
    expect(en('n')!.health).toBeLessThan(hpN); // その場の爆発
  });
  it('ボスは叩きつけの弧の途中、盾のダメージでは死なない(体力1で止まる)', () => {
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { stunUntil: st().gameTime + 5000, health: 20 })] });
    const c = center();
    useGameStore.setState(s => ({ camera: { x: c.x - s.gameBounds.width / 2, y: c.y - s.gameBounds.height / 2 }, viewZoom: 1 }));
    tap();
    expect(st().whipSwing?.phase).toBe('overhead');
    step(10);
    const sw = st().whipSwing!;
    useGameStore.setState({ projectiles: [shotAt('b1', sw.cx, sw.cy), shotAt('b2', sw.cx + 1, sw.cy)] });
    step(10);
    expect(st().projectiles.map(p => p.id)).not.toContain('b1');
    expect(en('h')!.health).toBe(1);
    expect(st().whipSwing?.phase).toBe('overhead'); // 弧は続く
  });
});
