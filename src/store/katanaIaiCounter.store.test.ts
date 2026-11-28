// 刀の居合の構えのカウンター=居合一閃(research/KATANA_TSUBAME.md §5-4・5-5 の受け入れ条件)をストアを動かして固める。
// 入口(tryKatanaIaiCounter)の直呼びと、成立の合流点(突進の体当たり=applyContactDamage・着地の爆風=applyPumpkinBlastDamage)の配線を通す。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, KATANA_DASH_MS, KATANA_DASH_DISTANCE, INVULN_MS, katanaDashMsFor, MELEE_FINISH_SLOW_MS, COUNTER_ZOOM_MS, isInputLocked } from './gameStore';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, applyPumpkinBlastDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { KATANA_IAI_WARP_GAP_PX, KATANA_IAI_WARP_MAX_PX, KATANA_IAI_PASS_MARGIN_PX, iaiReleaseAt, iaiStanceWindowEnd } from '../utils/katanaIaiCounter';
import { KATANA_CUT_MAX } from '../utils/katanaTsubame';
import { KATANA_IAI_PASS_HOLD_MS } from '../utils/katanaDashHold'; // 居合一閃の通り道の途中の止め(一閃より一段長い)の分だけ着地が後ろへ
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

let now = 23_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const st = () => useGameStore.getState();
const pl = () => st().player;
const center = () => { const p = pl(); return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => st().enemies.find(e => e.id === id)!;
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms }));
  vi.advanceTimersByTime(ms);
  st().movePlayer(NO, ms / 1000);
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
/** 居合の構え=カウンターの窓を開ける(刀のタップと同じ欄・長さは今の窓)。 */
const stance = () => useGameStore.setState(s => ({ player: { ...s.player, counterWindowStart: now, counterWindowEnd: now + 300 } }));
/** 居合一閃の溜め=Counter! の吹き出しと寄りが消え切るまで構えたまま(成立から放つまでの長さ)。 */
const IAI_HOLD_MS = iaiReleaseAt(0, MELEE_FINISH_SLOW_MS, COUNTER_ZOOM_MS);
/** 溜めが明けるまで回す。最後の刻みは移動させない=放った瞬間(ワープした所)で止める。 */
const holdThrough = () => {
  run(IAI_HOLD_MS - 10);
  now += 10;
  useGameStore.setState(s => ({ gameTime: s.gameTime + 10 }));
  vi.advanceTimersByTime(10);
};

beforeEach(() => {
  now = 23_000_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  st().resetGame('warrior');
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.setState(s => ({
    enemies: [], breakableProps: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false },
    player: { ...s.player, x: -3000, y: 9000, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('入口(tryKatanaIaiCounter)', () => {
  it('窓で成立=主の手前(縁から24px)へ瞬時に移り、貫いて後ろへ一閃で抜ける。窓は閉じ、技の行「居合一閃」', () => {
    useGameStore.setState({ enemies: [place('zombie', 160, 0, 'z')] });
    stance();
    const c0 = center();
    const z0 = en('z');
    expect(st().tryKatanaIaiCounter('z')).toBe(true);
    holdThrough();
    const c1 = center();
    // ワープ=その tick で位置が変わる(移動の時間0)。自分→主の中心の線上、体の縁から24px手前。
    expect(c1.x).toBeCloseTo(z0.x - KATANA_IAI_WARP_GAP_PX, 0);
    expect(c1.y).toBeCloseTo(c0.y, 0);
    expect(pl().iaiWarpAt).toBe(now);
    expect(pl().iaiWarpFromX).toBeCloseTo(c0.x);
    expect(now <= pl().counterWindowEnd).toBe(false); // 窓は閉じた
    expect(pl().katanaDashUntil).toBeGreaterThan(now); // 一閃の走りが始まった
    expect(pl().katanaDashDirX).toBeCloseTo(1);
    expect(st().skillProcFeed.some(r => r.key === 'tech:iai')).toBe(true);
    // 走り切ると主の後ろへ抜けている。
    run(katanaDashMsFor(KATANA_DASH_DISTANCE) + KATANA_IAI_PASS_HOLD_MS + 20);
    const z = en('z');
    expect(center().x).toBeGreaterThan(z.x + z.width);
    expect(z.health).toBeLessThan(99999);
    expect(z.katanaCuts).toBe(1);
  });

  it('2回目は出ない(1回の構えで1回)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'a'), place('zombie', 120, 60, 'b')] });
    stance();
    expect(st().tryKatanaIaiCounter('a')).toBe(true);
    expect(st().tryKatanaIaiCounter('b')).toBe(false);
  });

  it('刀でない・窓が閉じている・主が居ない・遠すぎる・触れない主では出ない(今のカウンター)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z'), place('zombie', KATANA_IAI_WARP_MAX_PX + KATANA_IAI_WARP_GAP_PX + 80, 0, 'far'), place('zombie', 100, 0, 'air', { aiPhase: 'jump' })] });
    // 窓なし
    expect(st().tryKatanaIaiCounter('z')).toBe(false);
    stance();
    expect(st().tryKatanaIaiCounter(undefined)).toBe(false); // 主の居ない弾き
    expect(st().tryKatanaIaiCounter('far')).toBe(false); // 遠すぎる
    expect(st().tryKatanaIaiCounter('air')).toBe(false); // 空中=触れない
    // ナイフ(刀でない)
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [] } }));
    expect(st().tryKatanaIaiCounter('z')).toBe(false);
    expect(pl().katanaDashUntil).toBeLessThanOrEqual(now);
  });

  it('一閃のクールダウン中・硬直中でも出る。クールダウンは使わない(足さない)', () => {
    useGameStore.setState(s => ({ enemies: [place('zombie', 120, 0, 'z')], player: { ...s.player, katanaDashCooldownEnd: now + 5000, katanaRecoveryUntil: now + 150, counterCooldownEnd: now + 400 } }));
    stance();
    const t0 = now;
    expect(st().tryKatanaIaiCounter('z')).toBe(true);
    holdThrough();
    expect(pl().katanaDashUntil).toBeGreaterThan(now); // 溜めの後に出た
    expect(pl().katanaDashCooldownEnd).toBe(t0 + 5000);
    expect(pl().counterCooldownEnd).toBe(t0 + 400);
  });

  it('燕返しの「元の位置」はワープ先。燕返しが出る', () => {
    useGameStore.setState({ enemies: [place('zombie', 160, 0, 'z')] });
    stance();
    st().tryKatanaIaiCounter('z');
    holdThrough();
    const warp = center();
    run(katanaDashMsFor(KATANA_DASH_DISTANCE) + KATANA_IAI_PASS_HOLD_MS + 10);
    const w = st().tsubameWindow!;
    expect(w).not.toBeNull();
    expect(w.originX).toBeCloseTo(warp.x);
    expect(w.originY).toBeCloseTo(warp.y);
    expect(st().tryTsubame(-1, 0)).toBe(true);
  });

  it('主には必ず当たる(着地の時に通り道から外れていても)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    stance();
    st().tryKatanaIaiCounter('z');
    holdThrough();
    // 走っている間に主が通り道の外へ動いた(弾き返し・跳び退きの代わり)。
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z' ? { ...e, y: e.y + 400 } : e)) }));
    run(KATANA_DASH_MS + KATANA_IAI_PASS_HOLD_MS + 20);
    expect(en('z').health).toBeLessThan(99999);
  });

  it('威力は一閃 ×1.5', () => {
    useGameStore.setState({ enemies: [place('zombie', 90, 30, 'n')] }); // 一閃は噛みつき側の足元の箱で止まる(今の挙動)=少し下に置く
    st().triggerKatanaDash(1, 0);
    run(KATANA_DASH_MS + KATANA_IAI_PASS_HOLD_MS + 20);
    const issenDmg = 99999 - en('n').health;
    expect(issenDmg).toBeGreaterThan(0);
    useGameStore.setState(s => ({ enemies: [place('zombie', 120, 0, 'z')], player: { ...s.player, katanaRecoveryUntil: 0, katanaDashCooldownEnd: 0 } }));
    stance();
    st().tryKatanaIaiCounter('z');
    holdThrough();
    run(KATANA_DASH_MS + KATANA_IAI_PASS_HOLD_MS + 40);
    expect(99999 - en('z').health).toBeCloseTo(issenDmg * 1.5, 0);
  });

  it('大きいボスでも走る道が伸びる(抜ける道=max(一閃の距離, 体の幅+48))・主の中心を越えて当たる', () => {
    useGameStore.setState({ enemies: [place('zombie', 140, 0, 'big', { width: 220, height: 120 })] });
    stance();
    st().tryKatanaIaiCounter('big');
    holdThrough();
    // 走る時間=その道の長さぶん(一閃と同じ速さ)。
    expect(pl().katanaDashUntil - now).toBe(katanaDashMsFor(220 + KATANA_IAI_PASS_MARGIN_PX));
    const start = center().x;
    run(katanaDashMsFor(220 + KATANA_IAI_PASS_MARGIN_PX) + KATANA_IAI_PASS_HOLD_MS + 60);
    const b = en('big');
    expect(center().x - start).toBeGreaterThan(KATANA_DASH_DISTANCE + 50);
    expect(center().x).toBeGreaterThan(b.x + b.width / 2);
    expect(b.health).toBeLessThan(99999);
  });

  it('カウンターの演出のスローの間も、道の長さを走り切ってから着地の当たり', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    stance();
    st().tryKatanaIaiCounter('z');
    st().triggerTimeSlow(0.2, 700, 560); // 今のカウンターの演出のスロー
    const start = center().x;
    // ループと同じく、移動の刻みはスローの倍率を掛けたゲーム内の秒で渡す。
    const slowRun = (ms: number) => {
      const end = now + ms;
      while (now < end) {
        now += 10;
        vi.advanceTimersByTime(10);
        const s0 = st();
        const scale = s0.timeSlowUntil > now ? Math.min(1, s0.timeSlowScale + (1 - s0.timeSlowScale) * Math.max(0, (now - s0.timeSlowStart - s0.timeSlowHoldMs) / Math.max(1, s0.timeSlowUntil - s0.timeSlowStart - s0.timeSlowHoldMs))) : 1;
        useGameStore.setState(s2 => ({ gameTime: s2.gameTime + 10 * scale }));
        st().movePlayer(NO, 0.01 * scale * GAME_SPEED);
      }
    };
    slowRun(KATANA_DASH_MS + 40);
    expect(en('z').health).toBe(99999); // まだ走っている(スローで期限が後ろへずれた)
    slowRun(900);
    expect(center().x - start).toBeGreaterThan(KATANA_DASH_DISTANCE * 0.8);
    expect(en('z').health).toBeLessThan(99999);
  });

  it('切り傷4本の主に当たれば殺陣', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z', { katanaCuts: KATANA_CUT_MAX })] });
    stance();
    st().tryKatanaIaiCounter('z');
    holdThrough();
    run(KATANA_DASH_MS + KATANA_IAI_PASS_HOLD_MS + 20);
    expect(st().satsujin).not.toBeNull();
  });
});

describe('成立の合流点の配線', () => {
  it('突進の体当たり(charge)を窓で受けた=居合一閃。主は弾き返されず・反撃のダメージ無し・1秒は無敵・抜けた後に当たる', () => {
    useGameStore.setState({ enemies: [place('zombie', 10, 0, 'c', { aiPhase: 'charge', aiPhaseUntil: st().gameTime + 1000, aiFromX: center().x - 200, aiFromY: center().y })] });
    stance();
    const before = en('c');
    applyContactDamage(st().gameTime, false, 0, NOOP_COMBAT_EFFECTS);
    const c = en('c');
    expect(c.x).toBe(before.x); // 弾き返しの位置の跳びが無い
    expect(c.knockbackVx ?? 0).toBe(0);
    expect(c.aiPhase).toBeUndefined(); // 技は中断
    expect(c.health).toBe(99999); // 反撃のダメージは出ない
    expect(pl().invulnerable).toBe(true);
    expect(pl().lastCounterSuccessTime).toBe(now);
    holdThrough();
    expect(pl().katanaDashUntil).toBeGreaterThan(now);
    run(KATANA_DASH_MS + KATANA_IAI_PASS_HOLD_MS + 30);
    expect(en('c').health).toBeLessThan(99999);
    // 抜けた後も守られる(カウンター成立の1秒)。
    expect(pl().invulnerable).toBe(true);
    expect(now - pl().invulnerableTime).toBeLessThan(INVULN_MS);
  });

  it('ナイフ(刀でない)の突進パリィは今のまま(反撃のダメージ・ワープしない)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [] } }));
    useGameStore.setState({ enemies: [place('zombie', 10, 0, 'c', { aiPhase: 'charge', aiPhaseUntil: st().gameTime + 1000 })] });
    stance();
    const c0 = center();
    applyContactDamage(st().gameTime, false, 0, NOOP_COMBAT_EFFECTS);
    expect(pl().lastCounterSuccessTime).toBe(now); // カウンターは成立
    expect(en('c').health).toBeLessThan(99999); // 反撃のダメージ(今のまま)
    expect(center().x).toBeCloseTo(c0.x); // ワープしない
    expect(pl().katanaDashUntil).toBeLessThanOrEqual(now);
  });

  it('着地の爆風のパリィ(主=爆風の持ち主)=居合一閃。主は弾き返されない', () => {
    useGameStore.setState({ enemies: [place('pumpkin', 110, 0, 'p')] });
    stance();
    const c0 = center();
    const before = en('p');
    useGameStore.setState({ pumpkinBlasts: [{ x: c0.x, y: c0.y, radius: 60, damage: 20, enemyId: 'p' }] });
    applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });
    expect(en('p').x).toBe(before.x);
    expect(en('p').health).toBe(99999);
    holdThrough();
    expect(center().x).toBeGreaterThan(c0.x + 10); // 主の手前へ移った
    run(KATANA_DASH_MS + KATANA_IAI_PASS_HOLD_MS + 30);
    expect(en('p').health).toBeLessThan(99999);
  });

  it('主の居ない弾き(矢の雨=parryLocal)・刃のパリィ(noDamage)は今のまま', () => {
    useGameStore.setState({ enemies: [place('pumpkin', 110, 0, 'p')] });
    stance();
    const c0 = center();
    useGameStore.setState({ pumpkinBlasts: [{ x: c0.x, y: c0.y, radius: 60, damage: 20, enemyId: 'p', parryNoDamage: true }] });
    applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, { thorOrbitDist: 300, thorCounterLeapMs: 500 });
    expect(pl().katanaDashUntil).toBeLessThanOrEqual(now);
    expect(center().x).toBeCloseTo(c0.x);
  });
});

describe('溜め(Counter! の演出が終わるまで構えたまま一拍溜めてから放つ)', () => {
  const RIGHT = { up: false, down: false, left: false, right: true } as never;
  it('溜めの長さ=Counter! の吹き出し(スローの長さ)と寄りの長い方', () => {
    expect(IAI_HOLD_MS).toBe(Math.max(MELEE_FINISH_SLOW_MS, COUNTER_ZOOM_MS));
  });

  it('成立→溜めの間は位置不変・無敵・スロー継続・入力を受けない→演出明けの時刻に走る→今どおり貫く', () => {
    useGameStore.setState({ enemies: [place('zombie', 160, 0, 'z')] });
    stance();
    const t0 = now;
    const c0 = center();
    expect(st().tryKatanaIaiCounter('z')).toBe(true);
    st().triggerHitImpact(0, 100, 0, 1); // 呼び手(カウンターの成立の所)と同じ演出=スローと寄り
    expect(pl().iaiHoldUntil).toBe(t0 + IAI_HOLD_MS);
    expect(now <= pl().counterWindowEnd).toBe(false); // 窓は成立の瞬間に閉じる(1回の構えで1回)
    expect(st().tryKatanaIaiCounter('z')).toBe(false);
    // 入力して動こうとしても動かない(スティック・キーとも)。
    useGameStore.setState({ swipeDirection: { x: 1, y: 0 } } as never);
    const hp0 = pl().health;
    while (now < t0 + IAI_HOLD_MS - 10) {
      now += 10;
      useGameStore.setState(s => ({ gameTime: s.gameTime + 10 }));
      vi.advanceTimersByTime(10);
      st().movePlayer(RIGHT, 0.01);
      expect(center().x).toBe(c0.x);
      expect(center().y).toBe(c0.y);
      expect(pl().invulnerable).toBe(true);
      expect(isInputLocked()).toBe(true); // 移動・他の入力は受けない
      expect(st().timeSlowUntil).toBeGreaterThan(now); // カウンターのスローは続く
      expect(pl().katanaDashUntil).toBeLessThanOrEqual(now); // まだ走らない
      expect(iaiStanceWindowEnd(pl().counterWindowStart, pl().counterWindowEnd, pl().iaiHoldUntil)).toBeGreaterThan(now); // 構えの絵のまま
    }
    // 溜めの間の被弾は当たらない。一閃のフリックも出ない(覚えもしない)。
    st().damagePlayer(50, 'test', c0.x + 30, c0.y);
    expect(pl().health).toBe(hp0);
    expect(st().triggerKatanaDash(-1, 0)).toBe(false);
    // 演出が明けた時刻に放つ(ワープ→居合一閃)。
    now += 10; useGameStore.setState(s => ({ gameTime: s.gameTime + 10 })); vi.advanceTimersByTime(10);
    expect(now).toBe(t0 + IAI_HOLD_MS);
    expect(pl().iaiWarpAt).toBe(now);
    expect(pl().katanaDashUntil).toBeGreaterThan(now);
    expect(isInputLocked()).toBe(false);
    expect(center().x).toBeCloseTo(en('z').x - KATANA_IAI_WARP_GAP_PX, 0);
    useGameStore.setState({ swipeDirection: null } as never);
    run(katanaDashMsFor(KATANA_DASH_DISTANCE) + KATANA_IAI_PASS_HOLD_MS + 20);
    const z = en('z');
    expect(center().x).toBeGreaterThan(z.x + z.width);
    expect(z.health).toBeLessThan(99999);
    expect(z.katanaCuts).toBe(1);
    expect(st().tsubameWindow).not.toBeNull(); // 燕返しの受付も今どおり(時刻が溜めの分だけ後ろへ)
    expect(pl().invulnerable).toBe(true); // 抜けた後もカウンターの守り(溜めの分だけ後ろへずれた1秒)
  });

  it('溜めの間に主が倒れた=居合一閃は出ない(入口の「主が居ない時」と同じ)。構えは解け、入力も戻る', () => {
    useGameStore.setState({ enemies: [place('zombie', 160, 0, 'z')] });
    stance();
    const c0 = center();
    expect(st().tryKatanaIaiCounter('z')).toBe(true);
    useGameStore.setState({ enemies: [] }); // 消えた
    run(IAI_HOLD_MS + 20);
    expect(pl().katanaDashUntil).toBeLessThanOrEqual(now);
    expect(pl().iaiWarpAt).toBeUndefined();
    expect(center().x).toBeCloseTo(c0.x);
    expect(isInputLocked()).toBe(false);
    expect(iaiStanceWindowEnd(pl().counterWindowStart, pl().counterWindowEnd, pl().iaiHoldUntil)).toBeLessThanOrEqual(now);
  });

  it('溜めの間に止まった(一時停止)なら、明けるまで待ってから放つ', () => {
    useGameStore.setState({ enemies: [place('zombie', 160, 0, 'z')] });
    stance();
    expect(st().tryKatanaIaiCounter('z')).toBe(true);
    useGameStore.setState({ isPaused: true });
    now += IAI_HOLD_MS + 200; vi.advanceTimersByTime(IAI_HOLD_MS + 200);
    expect(pl().katanaDashUntil).toBeLessThanOrEqual(now);
    expect(pl().iaiHoldUntil).toBeGreaterThan(now); // まだ溜めている
    useGameStore.setState({ isPaused: false });
    run(30);
    expect(pl().iaiWarpAt).toBeDefined();
    expect(pl().katanaDashUntil).toBeGreaterThan(now);
  });
});
