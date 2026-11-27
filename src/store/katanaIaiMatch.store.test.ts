// 居合一閃(カウンターの一閃・research/KATANA_TSUBAME.md §5)の当たった敵の反応を、通常の一閃と揃えたことをストアを動かして固める
// (社長「カウンターの一閃、通常の一閃と同じ反応になって無い」→ 敵の浮き方・止め・震え)。
// あわせて、カウンターが決まった一撃として一段強くした止め・震え(社長「なんか素っ気ない」)と、カウンターのスローの間の走る距離。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, MELEE_FINISH_SLOW_MS, COUNTER_ZOOM_MS } from './gameStore';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { applyContactDamage, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { KATANA_DASH_HIT_HOLD_MS, KATANA_IAI_PASS_HOLD_MS, KATANA_IAI_PASS_SHAKE } from '../utils/katanaDashHold';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { iaiReleaseAt } from '../utils/katanaIaiCounter';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

let now = 31_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => st().enemies.find(e => e.id === id)!;
/** 1刻み。slow=true ならループと同じく、ゲーム内の秒=実時間×スローの倍率×ゲームスピードで渡す。 */
const step = (ms = 10, slow = false) => {
  now += ms;
  const s = st();
  const k = slow ? computeTimeSlowScale(now, s.timeSlowStart, s.timeSlowUntil, s.timeSlowScale, s.timeSlowHoldMs) : 1;
  useGameStore.setState(x => ({ gameTime: x.gameTime + ms * k }));
  vi.advanceTimersByTime(ms);
  st().movePlayer(NO, (ms / 1000) * (slow ? k * GAME_SPEED : 1));
  st().updateEnemies(ms / 1000);
};
const stance = () => useGameStore.setState(s => ({ player: { ...s.player, counterWindowStart: now, counterWindowEnd: now + 300 } }));
/** 居合一閃の溜め=Counter! の吹き出しと寄りが消え切るまで構えたまま(成立から放つまでの長さ)。 */
const IAI_HOLD_MS = iaiReleaseAt(0, MELEE_FINISH_SLOW_MS, COUNTER_ZOOM_MS);
/** 当たり(切り傷が刻まれる)まで回し、その瞬間の敵を返す。 */
const runToHit = (id: string, slow = false): { at: number; e: Enemy } => {
  for (let t = 0; t < 3000; t += 10) {
    step(10, slow);
    const e = en(id);
    if ((e.katanaCuts ?? 0) > 0) return { at: now, e };
  }
  throw new Error('当たらなかった');
};

beforeEach(() => {
  now = 31_000_000;
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

describe('居合一閃の当たった敵の反応=通常の一閃と同じ', () => {
  it('カウンターが成立した瞬間には主を浮かせない。浮きは当たりの瞬間から、通常の一閃と同じ長さ', () => {
    // 通常の一閃の浮き(当たりの瞬間からの長さ)。
    useGameStore.setState({ enemies: [place('zombie', 70, 30, 'n')] });
    expect(st().triggerKatanaDash(1, 0)).toBe(true);
    const n = runToHit('n');
    const normalLift = (n.e.brLiftUntil ?? 0) - n.at;
    expect(normalLift).toBeGreaterThan(0);

    // 居合一閃=突進の体当たりを窓で受ける(実際の成立の合流点)。
    st().resetGame('warrior');
    useGameStore.setState(s => ({
      enemies: [], breakableProps: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false },
      player: { ...s.player, x: -3000, y: 9000, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999 },
    }));
    useGameStore.setState({ enemies: [place('zombie', 10, 0, 'c', { aiPhase: 'charge', aiPhaseUntil: st().gameTime + 1000, aiFromX: center().x + 300, aiFromY: center().y })] });
    stance();
    applyContactDamage(st().gameTime, false, 0, NOOP_COMBAT_EFFECTS);
    expect(st().player.iaiHoldTargetId).toBe('c'); // 溜め(構えたまま)の主
    for (let t = 0; t < IAI_HOLD_MS; t += 10) { step(10); expect((en('c').brLiftUntil ?? 0) > now).toBe(false); } // 溜めの間も浮かない
    expect(st().player.iaiWarpTargetId).toBe('c');
    // 成立の瞬間は浮いていない(旧: 赤カウンターの浮きが先に乗り、走って行く間に浮き始めていた)。
    expect((en('c').brLiftUntil ?? 0) > now).toBe(false);
    // 気絶中の主は一閃で処刑される(今の規則)ので、浮きの比較のために気絶だけ外す。
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => ({ ...e, stunUntil: undefined })) }));
    for (let t = 0; t < 60; t += 10) { step(10); expect((en('c').brLiftUntil ?? 0) > now).toBe(false); } // 走っている間も浮かない
    const c = runToHit('c');
    expect(Math.abs(((c.e.brLiftUntil ?? 0) - c.at) - normalLift)).toBeLessThanOrEqual(20);
  });

  it('貫いた敵での止めは一閃より一段長く、敵は長く・大きく震える(カウンターが決まった一撃)', () => {
    useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
    stance();
    expect(st().tryKatanaIaiCounter('z')).toBe(true);
    for (let t = 0; t < IAI_HOLD_MS; t += 10) step(10); // 溜め
    let firedAt = -1;
    for (let t = 0; t < 400 && firedAt < 0; t += 10) { step(10); if (st().player.katanaDashHold?.at !== undefined) firedAt = now; }
    const h = st().player.katanaDashHold!;
    expect(h.enemyId).toBe('z');
    expect(h.ms).toBe(KATANA_IAI_PASS_HOLD_MS);
    expect(KATANA_IAI_PASS_HOLD_MS).toBeGreaterThan(KATANA_DASH_HIT_HOLD_MS);
    const z = en('z');
    expect(z.meleeShakeAmp).toBeCloseTo(KATANA_IAI_PASS_SHAKE.ampMul);
    expect((z.brawlerShakeUntil ?? 0)).toBeGreaterThan(z.hitStunUntil ?? 0); // 止めより長く震える
    // 決めの絵(白い閃光・輪・大きい斬撃)が出る。
    expect(st().effects.some(fx => fx.kind === 'ring' && fx.createdAt === h.at)).toBe(true);
  });

  it('カウンターのスローの間も、走る距離はスロー無しと同じ(止めの間は期限を二重に延ばさない)', () => {
    const go = (slow: boolean): number => {
      st().resetGame('warrior');
      useGameStore.setState(s => ({
        enemies: [], breakableProps: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false },
        player: { ...s.player, x: -3000, y: 9000, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999 },
      }));
      useGameStore.setState({ enemies: [place('zombie', 120, 0, 'z')] });
      stance();
      expect(st().tryKatanaIaiCounter('z')).toBe(true);
      if (slow) st().triggerTimeSlow(0.2, 700, 560); // カウンターの演出のスロー(triggerHitImpact と同じ値)
      // 溜め(構えたまま)を待つ。主は動かさない(放つ時の主との間合いを溜めの無かった時と同じにする)。走る距離は放った所から測る。
      for (let t = 0; t < IAI_HOLD_MS; t += 10) { now += 10; vi.advanceTimersByTime(10); if (t + 10 < IAI_HOLD_MS) st().movePlayer(NO, 0.01); } // 最後の刻み=放った瞬間で止める
      const x0 = center().x;
      // スローは溜めの間に明ける=走りはスローに掛からない(溜めの後に別のスローが重なった時の走りの距離は、放った時から掛け直して見る)。
      if (slow) st().triggerTimeSlow(0.2, 700, 560);
      for (let t = 0; t < 2500; t += 10) step(10, slow);
      expect(st().player.katanaDashHold?.at).toBeDefined(); // 止めがスローの間に掛かった
      return center().x - x0;
    };
    const plain = go(false);
    const slowed = go(true);
    // 旧(止めの間も期限をずらしていた)は +180px 長く走っていた。残りの差(スローの戻りの刻みの近似・数フレーム分)は 30px 未満。
    expect(Math.abs(slowed - plain)).toBeLessThan(30);
  });
});
