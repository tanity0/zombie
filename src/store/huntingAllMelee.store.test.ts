// ★ハンティング(striker-hunting)をどの近接武器にも効かせる(社長指示2026-11-22「格闘や鞭、刀など、どの近接武器にも適用される様にしたい」
//  →裁定「全ての武器で一連の動き中は伸ばす」)。溜まった時の効果=近接の届く距離が HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[Lv] だけ伸びる。
//  どの武器でも「溜まった状態で始めた一連の動きの途中は伸びたまま、終わったら溜まりが消える」。
//  ナイフ=一連のつながりの仕組みが無い=振るたびに消える / 鞭=1撃目→引き寄せ→叩きつけ / 刀=オート斬撃→一閃→燕返し / 格闘=連撃(§16)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useGameStore, huntingReachBonus, huntingMeleeRadius, katanaRange, katanaReach, whipReach,
  WHIP_LENGTH_BY_LEVEL, MELEE_RADIUS, subWeaponBlockedByKatana, enemyMeleeDist,
  KATANA_DASH_MS, KATANA_DASH_DISTANCE, KATANA_DASH_RECOVERY_MS, katanaDashMsFor,
} from './gameStore';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL } from '../config/hunting';
import { pickKatanaSlashTarget } from '../utils/katanaAuto';
import { huntingSequenceAlive } from '../utils/huntingSequence';
import { WHIP_FOLLOWUP_WINDOW_MS, WHIP_PULL_MS } from '../utils/whipFollowup';
import { FLICK_FOLLOWUP_WINDOW_MS } from '../utils/flickFollowup';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import type { Enemy, Player, SubWeaponKey } from '../types/game';

setBrawlerTempoAll(1.0);
let now = 17_000_000;
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
const LV3 = HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[3];

const setup = (subs: SubWeaponKey[], subLv: Partial<Record<SubWeaponKey, number>>, charged: boolean) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false }, breakableProps: [], enemies: [],
    player: {
      ...st.player, x: -3000, y: 9000, health: 9999, maxHealth: 9999, invulnerable: false,
      subWeapons: subs, subWeaponLevels: subLv, skills: [], skillLevels: {},
      lastDirection: { x: 1, y: 0 }, counterCooldownEnd: 0, pendingSwingAt: 0,
      whipCharged: false, whipHitCount: 0,
      huntingCharged: charged, huntingChargeStartedAt: charged ? 1 : 0,
    },
  }));
};
const st = () => useGameStore.getState();
const pl = () => st().player;
const center = () => { const p = pl(); return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
/** 中心がプレイヤーの中心から (dx,dy) の所に置いたゾンビ。 */
const zombieAt = (dx: number, id: string, dy = 0): Enemy => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const zombieWidth = () => spawnEnemyAt('zombie', 0, 0, 0).width;
const hpOf = (id: string) => st().enemies.find(e => e.id === id)?.health ?? 0;
/** 時間を進める(ループと同じく、毎フレーム一連の動きの終わりを確かめる)。 */
const step = (ms = 10, brawler = false) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms }));
  vi.advanceTimersByTime(ms);
  st().tickHuntingSequence();
  st().movePlayer(NO_INPUT, ms / 1000);
  if (brawler) st().tickBrawler();
  else st().updateEnemies(ms / 1000);
};
const run = (ms: number, brawler = false) => { const end = now + ms; while (now < end) step(10, brawler); };

beforeEach(() => {
  now = 17_000_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('伸びる量はどの近接武器でも同じ(huntingReachBonus)', () => {
  const base = { subWeaponLevels: { 'striker-hunting': 3 }, huntingCharged: false, skills: [], skillLevels: {} } as unknown as Player;
  const charged = { ...base, huntingCharged: true } as Player;
  it('溜まっていなければ0、溜まっていればLvの量。ナイフ・刀・鞭・一閃の距離に同じ量が乗る', () => {
    expect(huntingReachBonus(base)).toBe(0);
    expect(huntingReachBonus(charged)).toBe(LV3);
    expect(huntingMeleeRadius(base)).toBe(MELEE_RADIUS);
    expect(huntingMeleeRadius(charged)).toBe(MELEE_RADIUS + LV3);
    const k = { ...base, subWeapons: ['katana', 'striker-hunting'], subWeaponLevels: { katana: 2, 'striker-hunting': 3 } } as unknown as Player;
    expect(katanaReach(k)).toBe(katanaRange(k));
    expect(katanaReach({ ...k, huntingCharged: true })).toBe(katanaRange(k) + LV3);
    const w = { ...base, subWeapons: ['whip', 'striker-hunting'], subWeaponLevels: { whip: 1, 'striker-hunting': 3 } } as unknown as Player;
    expect(whipReach(w)).toBe(WHIP_LENGTH_BY_LEVEL[1]);
    expect(whipReach({ ...w, huntingCharged: true })).toBe(WHIP_LENGTH_BY_LEVEL[1] + LV3);
    // 一閃の走る時間: 伸びていない距離では今の値のまま(同じ速さで、伸びたぶんだけ長く走る)
    expect(katanaDashMsFor(KATANA_DASH_DISTANCE)).toBe(KATANA_DASH_MS);
    expect(katanaDashMsFor(KATANA_DASH_DISTANCE + LV3)).toBe(Math.round(KATANA_DASH_MS * (KATANA_DASH_DISTANCE + LV3) / KATANA_DASH_DISTANCE));
  });
  it('一連が続いているかの判定(純関数)', () => {
    const v = { gameTime: 100, now: 1000, katanaRecoveryUntil: 0, tsubameOpen: false, whipFollowupActive: false };
    expect(huntingSequenceAlive('whip', v)).toBe(false);
    expect(huntingSequenceAlive('whip', { ...v, whipFollowupActive: true })).toBe(true);
    expect(huntingSequenceAlive('katana', v)).toBe(false);
    expect(huntingSequenceAlive('katana', { ...v, seqUntil: 101 })).toBe(true); // オート斬撃の後、次のオート斬撃まで
    expect(huntingSequenceAlive('katana', { ...v, seqUntil: 100 })).toBe(false);
    expect(huntingSequenceAlive('katana', { ...v, katanaRecoveryUntil: 1001 })).toBe(true); // 一閃の走り〜硬直
    expect(huntingSequenceAlive('katana', { ...v, tsubameOpen: true })).toBe(true); // 燕返しの受付
  });
});

describe('ナイフ: 一連のつながりが無い=振るたびに消える', () => {
  it('溜まった状態で振ると、その振りで届く距離が伸び、振った時点で溜まりは消える', () => {
    setup(['striker-hunting'], { 'striker-hunting': 3 }, true);
    useGameStore.setState({ enemies: [zombieAt(MELEE_RADIUS + zombieWidth() / 2 + LV3 / 2, 'z')] });
    st().triggerCounter();
    run(400);
    expect(hpOf('z')).toBeLessThan(99999);
    expect(pl().huntingCharged).toBe(false);
  });
});

describe('鞭: 1撃目→引き寄せ→叩きつけの間は伸びたまま、追加攻撃の受付が終わったら消える', () => {
  // 鞭の長さ(150)の外・伸び(+34)の内側に中心がある敵
  const farDx = () => WHIP_LENGTH_BY_LEVEL[1] + zombieWidth() / 2 + LV3 / 2;
  const swingAt = (charged: boolean) => {
    setup(['whip', 'striker-hunting'], { whip: 1, 'striker-hunting': 3 }, charged);
    useGameStore.setState({ enemies: [zombieAt(farDx(), 'z')] });
    st().triggerCounter();
  };
  it('溜まっていなければ届かない', () => {
    swingAt(false);
    expect(hpOf('z')).toBe(99999);
  });
  it('当たった振り: 受付の間は伸びたまま(輪も同じ大きさ)、受付が過ぎたら消える', () => {
    swingAt(true);
    expect(hpOf('z')).toBeLessThan(99999);
    expect(pl().huntingCharged).toBe(true);
    expect(pl().huntingSequence).toBe('whip');
    expect(whipReach(pl())).toBe(WHIP_LENGTH_BY_LEVEL[1] + LV3);
    run(WHIP_FOLLOWUP_WINDOW_MS - 50);
    expect(pl().huntingCharged).toBe(true);
    run(100);
    expect(pl().huntingCharged).toBe(false);
    expect(pl().huntingSequence).toBeUndefined();
  });
  it('引き寄せ→叩きつけの間も伸びたまま、叩きつけの後に消える', () => {
    swingAt(true);
    run(100);
    expect(st().tryWhipFollowup(-1, 0)).toBe(true); // 引き寄せ
    run(WHIP_PULL_MS);
    expect(pl().huntingCharged).toBe(true); // 引き寄せ〜叩きつけの受付の間
    // 叩きつけの受付が開くまで待って進行方向へ
    let slammed = false;
    for (let i = 0; i < 80 && !slammed; i++) { slammed = st().tryWhipFollowup(1, 0); if (!slammed) step(10); }
    expect(slammed).toBe(true);
    expect(pl().huntingCharged).toBe(true); // 叩きつけの止めの間
    run(400);
    expect(pl().huntingCharged).toBe(false);
  });
  it('空振りは追加攻撃が無い=その振りで消える', () => {
    setup(['whip', 'striker-hunting'], { whip: 1, 'striker-hunting': 3 }, true);
    st().triggerCounter();
    expect(pl().huntingCharged).toBe(false);
  });
});

describe('刀: オート斬撃→一閃→燕返しの間は伸びたまま、一連が終わったら消える', () => {
  for (const sword of ['katana', 'murasame'] as const) {
    it(`${sword}: 刀を持っていてもハンティングは止まらない。間合いの少し外の敵は溜まっている時だけオート斬撃の狙いになる`, () => {
      const pick = (charged: boolean) => {
        setup([sword, 'striker-hunting'], { [sword]: 3, 'striker-hunting': 3 }, charged);
        expect(subWeaponBlockedByKatana(pl(), 'striker-hunting')).toBe(false);
        expect(subWeaponBlockedByKatana(pl(), 'turret')).toBe(true); // 途中で手に入れたほかのサブは今までどおり止まる(手榴弾=戦士の出撃時のサブは止まらない)
        const c = center();
        const z = zombieAt(katanaRange(pl()) + LV3 / 2 + zombieWidth() / 2, 'z');
        return pickKatanaSlashTarget(c.x, c.y, katanaReach(pl()), [z], st().gameTime, enemyMeleeDist);
      };
      expect(pick(false)).toBeNull();
      expect(pick(true)).toBe('z');
    });
  }
  it('オート斬撃だけ(一閃しない): 次のオート斬撃の時刻までは伸びたまま、過ぎたら消える', () => {
    setup(['katana', 'striker-hunting'], { katana: 1, 'striker-hunting': 3 }, true);
    st().noteKatanaAutoSlashHunting(st().gameTime + 300);
    expect(pl().huntingSequence).toBe('katana');
    run(280);
    expect(pl().huntingCharged).toBe(true);
    expect(katanaReach(pl())).toBe(katanaRange(pl()) + LV3);
    run(40);
    expect(pl().huntingCharged).toBe(false);
  });
  it('一閃の走る距離が伸び、燕返しの受付が終わるまで伸びたまま、終わったら消える', () => {
    const issenRun = (charged: boolean) => {
      setup(['katana', 'striker-hunting'], { katana: 1, 'striker-hunting': 3 }, charged);
      useGameStore.setState({ enemies: [zombieAt(90, 'z', 30)] });
      const x0 = center().x;
      expect(st().triggerKatanaDash(1, 0)).toBe(true);
      const ms = pl().katanaDashUntil - now;
      run(ms + 10);
      return { ms, dx: center().x - x0 };
    };
    const plain = issenRun(false);
    expect(plain.ms).toBe(KATANA_DASH_MS);
    const hunt = issenRun(true);
    expect(hunt.ms).toBe(katanaDashMsFor(KATANA_DASH_DISTANCE + LV3));
    expect(hunt.dx).toBeGreaterThan(plain.dx + LV3 * 0.5); // 伸びたぶん遠くまで走る
    // 着地: 当たったので燕返しの受付が開いている=まだ伸びたまま
    expect(st().tsubameWindow).not.toBeNull();
    expect(pl().huntingCharged).toBe(true);
    run(KATANA_DASH_RECOVERY_MS + FLICK_FOLLOWUP_WINDOW_MS + 50);
    expect(pl().huntingCharged).toBe(false);
  });
  it('燕返しは伸びた一閃の通り道を戻り、その後に消える', () => {
    setup(['katana', 'striker-hunting'], { katana: 1, 'striker-hunting': 3 }, true);
    useGameStore.setState({ enemies: [zombieAt(90, 'z', 30)] });
    st().triggerKatanaDash(1, 0);
    run(pl().katanaDashUntil - now + 10);
    const w = st().tsubameWindow!;
    // 元の位置から「伸びていない一閃の最大距離」より遠い所に立たせる(伸びた距離の内側)
    run(100);
    useGameStore.setState(s => ({ player: { ...s.player, x: s.player.x + (w.originX + KATANA_DASH_DISTANCE + LV3 - 4 - center().x), y: s.player.y + (w.originY - center().y) } }));
    const back = Math.hypot(center().x - w.originX, center().y - w.originY);
    expect(back).toBeGreaterThan(KATANA_DASH_DISTANCE);
    expect(back).toBeLessThan(KATANA_DASH_DISTANCE + LV3);
    expect(st().tryTsubame(-1, 0)).toBe(true);
    // 燕返しの走る時間=戻る距離(伸びた距離まで)を同じ速さで
    expect(pl().katanaDashUntil - now).toBe(katanaDashMsFor(back)); // 伸びていなければ KATANA_DASH_DISTANCE で切られる
    expect(pl().huntingCharged).toBe(true);
    run(800);
    expect(pl().huntingCharged).toBe(false);
  });
  it('空振りの一閃は着地の硬直が明けたら消える', () => {
    setup(['katana', 'striker-hunting'], { katana: 1, 'striker-hunting': 3 }, true);
    st().triggerKatanaDash(1, 0);
    run(pl().katanaDashUntil - now + 10);
    expect(pl().huntingCharged).toBe(true);
    run(KATANA_DASH_RECOVERY_MS + 20);
    expect(pl().huntingCharged).toBe(false);
  });
});

describe('格闘: 連撃の間は伸びたまま、途切れたら消える(research/BRAWLER.md §16 の今の作り)', () => {
  it('溜まっていなければ届かず、溜まっていれば届き、コンボが途切れたら消える', () => {
    const press = (charged: boolean) => {
      setup(['brawler', 'striker-hunting'], { brawler: 3, 'striker-hunting': 3 }, charged);
      useGameStore.setState({ enemies: [zombieAt(MELEE_RADIUS + zombieWidth() / 2 + LV3 / 2, 'z')] });
      st().brawlerPress();
      run(200, true);
    };
    press(false);
    expect(hpOf('z')).toBe(99999);
    press(true);
    expect(hpOf('z')).toBeLessThan(99999);
    expect(pl().huntingCharged).toBe(true);
    run(1500, true);
    expect(pl().huntingCharged).toBe(false);
  });
});
