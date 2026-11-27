// ★スラッシャーの追い打ち(社長指示2026-11-26「どれも入力は増えないイメージ」)と、ナイフの3連撃(「ナイフは標準で3回振りにする。0.5秒」)をストアで固める。
// 判定の純関数は utils/slasherFollowup.test.ts・utils/knifeCombo.test.ts。ここは配線(種を積む・予約する・時刻が来たら当てる・入力は増えない)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, KATANA_DASH_MS, COUNTER_WINDOW, COUNTER_COOLDOWN } from './gameStore';
import { KATANA_DASH_HIT_HOLD_MS } from '../utils/katanaDashHold'; // 一閃の通り道の途中の止めの分だけ着地が後ろへ
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { SLASHER_FOLLOWUP_INTERVAL_MS, slasherFollowupMult } from '../utils/slasherFollowup';
import { KNIFE_COMBO_INTERVAL_MS, KNIFE_COMBO_FINISH_RECOVERY_MS } from '../utils/knifeCombo';

let now = 21_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const st = () => useGameStore.getState();
const withSlasher = (lv: number) => useGameStore.setState(s => ({
  player: { ...s.player, skills: [...s.player.skills.filter(k => k !== 'slasher'), 'slasher'], skillLevels: { ...s.player.skillLevels, slasher: lv } },
}));
/** 実時間を進めて追い打ちを出す(useGameLoop の毎フレームの呼び出しの代わり)。 */
const advanceReal = (ms: number) => {
  now += ms;
  useGameStore.setState(s => ({ realGameTime: s.realGameTime + ms, gameTime: s.gameTime + ms }));
  st().pumpSlasherFollowups();
};
/** ナイフの1振り(PC/ボットの直呼び=前隙なし)。CD は明けておく。 */
const swing = () => {
  useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  return st().triggerCounter();
};
const lastNumber = () => { const n = st().effects.filter(x => x.kind === 'damageNumber'); return n[n.length - 1]; };

beforeEach(() => {
  now = 21_000_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({
    enemies: [], breakableProps: [], realGameTime: 5000, m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false },
    player: { ...s.player, x: -3000, y: 9000, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999, counterCooldownEnd: 0, pendingSwingAt: 0 },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('スラッシャーの追い打ち: ナイフ', () => {
  for (const lv of [1, 2, 3]) {
    it(`Lv${lv}: 当たった敵へ追い打ちが ${lv} 回、0.1秒おきに予約される(入力なし)`, () => {
      useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
      withSlasher(lv);
      const t0 = st().realGameTime;
      expect(swing().hit).toBe(true);
      const q = st().slasherFollowups;
      expect(q.map(f => f.k)).toEqual(Array.from({ length: lv }, (_, i) => i + 1));
      expect(q.map(f => f.at - t0)).toEqual(Array.from({ length: lv }, (_, i) => SLASHER_FOLLOWUP_INTERVAL_MS * (i + 1)));
      expect(q.every(f => f.weapon === 'knife' && f.hits[0].id === 'z')).toBe(true);
    });
  }
  it('種=元の一撃の値・追い打ちごとに 2/3 ずつ減る・最後の一撃だけ吹き飛ばす(Lv3)', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    withSlasher(3);
    swing();
    const first = lastNumber().value;
    const seed = st().slasherFollowups[0].hits[0].seed;
    expect(seed).toBeCloseTo(first, 6); // 地上の1撃目=空中の倍率なし=種と同じ値
    for (let k = 1; k <= 3; k++) {
      const hp = en('z').health;
      // 前の当たりの押しを消しておく(最後の吹き飛ばしだけを見る)
      useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z' ? { ...e, knockbackUntil: 0, knockbackVx: 0, knockbackVy: 0 } : e)) }));
      advanceReal(SLASHER_FOLLOWUP_INTERVAL_MS - 1);
      expect(en('z').health).toBe(hp); // まだ出ない
      advanceReal(1);
      expect(en('z').health).toBeLessThan(hp);
      // 数字は追い打ちの値(空中の倍率は damageEnemy が掛け直す=数字にも同じ倍率・案A)
      expect(lastNumber().value).toBe(Math.max(1, Math.ceil(hp - en('z').health)));
      const kb = (en('z').knockbackUntil ?? 0) > now && Math.hypot(en('z').knockbackVx ?? 0, en('z').knockbackVy ?? 0) > 0;
      expect(kb).toBe(k === 3);
    }
    expect(st().slasherFollowups).toHaveLength(0);
    expect(slasherFollowupMult(1)).toBeCloseTo(2 / 3, 9);
  });
  it('入力は増えない: スラッシャーを持っていても、次の振りまでの間隔はナイフの段の間隔のまま', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    swing();
    const cdNo = st().player.counterCooldownEnd - now;
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true }, enemies: [place('zombie', 40, 0, 'z')], player: { ...s.player, lastDirection: { x: 1, y: 0 } } }));
    withSlasher(3);
    swing();
    expect(st().player.counterCooldownEnd - now).toBe(cdNo);
    expect(cdNo).toBe(KNIFE_COMBO_INTERVAL_MS);
  });
  it('空振りでは予約しない・スラッシャー無しでは予約しない', () => {
    withSlasher(3);
    swing();
    expect(st().slasherFollowups).toHaveLength(0);
    useGameStore.setState(s => ({ enemies: [place('zombie', 40, 0, 'z')], player: { ...s.player, skills: s.player.skills.filter(k => k !== 'slasher') } }));
    swing();
    expect(st().slasherFollowups).toHaveLength(0);
  });
  it('倒れた敵には追い打ちを入れない', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    withSlasher(3);
    swing();
    useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.id !== 'z') }));
    const nums = st().effects.filter(x => x.kind === 'damageNumber').length;
    advanceReal(SLASHER_FOLLOWUP_INTERVAL_MS * 3);
    expect(st().effects.filter(x => x.kind === 'damageNumber').length).toBe(nums);
  });
});

describe('スラッシャーの追い打ち: 格闘・鞭・刀', () => {
  it('格闘の段が当たると追い打ちが入る(旧: 格闘中は効かない)', () => {
    useGameStore.setState(s => ({ enemies: [place('zombie', 45, 0, 'z')], player: { ...s.player, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 } } }));
    withSlasher(2);
    st().brawlerPress();
    for (let i = 0; i < 30 && st().slasherFollowups.length === 0; i++) {
      now += 10;
      useGameStore.setState(s => ({ gameTime: s.gameTime + 10 }));
      st().tickBrawler();
    }
    expect(st().slasherFollowups.map(f => f.weapon)).toEqual(['brawler', 'brawler']);
    const hp = en('z').health;
    advanceReal(SLASHER_FOLLOWUP_INTERVAL_MS);
    expect(en('z').health).toBeLessThan(hp);
  });
  it('鞭の段が当たると追い打ちが入る・追い打ちは気絶した敵でも掴まない(打撃だけ)', () => {
    useGameStore.setState(s => ({ enemies: [place('zombie', 60, 0, 'z')], player: { ...s.player, subWeapons: ['whip'], subWeaponLevels: { whip: 1 } } }));
    withSlasher(1);
    swing();
    expect(st().slasherFollowups.map(f => f.weapon)).toEqual(['whip']);
    expect(st().whipSwing).toBeNull();
    // 追い打ちの前に気絶させる(打った時なら掴む状態)
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z' ? { ...e, stunUntil: s.gameTime + 5000 } : e)) }));
    const hp = en('z').health;
    advanceReal(SLASHER_FOLLOWUP_INTERVAL_MS);
    expect(en('z').health).toBeLessThan(hp);
    expect(st().whipSwing).toBeNull();
  });
  it('刀の一閃が当たると追い打ちが入る(守護霊・自動の斬りは積まない)', () => {
    useGameStore.setState(s => ({ enemies: [place('zombie', 90, 30, 'z')], player: { ...s.player, subWeapons: ['katana'], subWeaponLevels: { katana: 1 } } }));
    withSlasher(3);
    expect(st().triggerKatanaDash(1, 0)).toBe(true);
    const end = now + KATANA_DASH_MS + KATANA_DASH_HIT_HOLD_MS + 10;
    while (now < end && st().slasherFollowups.length === 0) {
      now += 10;
      useGameStore.setState(s => ({ gameTime: s.gameTime + 10 }));
      vi.advanceTimersByTime(10);
      st().movePlayer(NO, 0.01);
      st().updateEnemies(0.01);
    }
    expect(st().slasherFollowups.map(f => f.weapon)).toEqual(['katana', 'katana', 'katana']);
    const hp = en('z').health;
    advanceReal(SLASHER_FOLLOWUP_INTERVAL_MS);
    expect(en('z').health).toBeLessThan(hp);
  });
});

describe('ナイフの3連撃(配線)', () => {
  it('タップごとに段が 1→2→3→1・間隔は 0.4秒・3段目の後は隙・カウンター窓は1段目だけ', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    const stages: number[] = [];
    const gaps: number[] = [];
    const windows: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const p0 = st().player;
      now = Math.max(now, p0.counterCooldownEnd);
      const r = st().triggerCounter();
      expect(r.swung).toBe(true);
      const p = st().player;
      stages.push(p.knifeComboStage ?? 0);
      gaps.push(p.counterCooldownEnd - now);
      windows.push(p.counterWindowStart === now);
    }
    expect(stages).toEqual([1, 2, 3, 1]);
    expect(gaps).toEqual([KNIFE_COMBO_INTERVAL_MS, KNIFE_COMBO_INTERVAL_MS, KNIFE_COMBO_FINISH_RECOVERY_MS, KNIFE_COMBO_INTERVAL_MS]);
    // 4回目の1段目: カウンターのクールダウンは連撃の終わり(3段目)から。3段目の後の隙(1.0秒)がナイフのクールダウン(COUNTER_WINDOW+COUNTER_COOLDOWN)より長いので、隙明けの1段目は開く。
    expect(KNIFE_COMBO_FINISH_RECOVERY_MS).toBeGreaterThanOrEqual(COUNTER_WINDOW + COUNTER_COOLDOWN);
    expect(windows).toEqual([true, false, false, true]);
    expect(st().player.knifeCounterReadyAt).toBeGreaterThan(0);
  });
  it('最後の振りから0.9秒タップが無ければ1段目へ戻る・カウンターのクールダウンは連撃の終わりから', () => {
    st().triggerCounter();
    const at1 = now;
    expect(st().player.knifeComboStage).toBe(1);
    expect(st().player.knifeCounterReadyAt).toBe(at1 + 900 + COUNTER_WINDOW + COUNTER_COOLDOWN);
    now += 1000;
    st().triggerCounter();
    expect(st().player.knifeComboStage).toBe(1);
  });
  it('前隙つき(タッチ): 間隔の前のタップは1つだけ予約し、明けたら出す・3段目の後の隙の間は捨てる', () => {
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.knifeComboStage).toBe(1);
    now += 100;
    expect(st().beginMeleeSwing()).toBe(false);
    expect(st().player.knifeQueuedAt).toBe(now);
    // 前隙の解決
    useGameStore.setState(s => ({ player: { ...s.player, pendingSwingAt: 0 } }));
    now += KNIFE_COMBO_INTERVAL_MS - 100; // 1段目から段の間隔
    st().pumpKnifeQueuedTap();
    expect(st().player.knifeComboStage).toBe(2);
    expect(st().player.knifeQueuedAt).toBe(0);
    useGameStore.setState(s => ({ player: { ...s.player, pendingSwingAt: 0 } }));
    now += KNIFE_COMBO_INTERVAL_MS;
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.knifeComboStage).toBe(3);
    useGameStore.setState(s => ({ player: { ...s.player, pendingSwingAt: 0 } }));
    now += 300; // 3段目の後の隙の中
    expect(st().beginMeleeSwing()).toBe(false);
    expect(st().player.knifeQueuedAt ?? 0).toBe(0); // 予約しない(捨てる)
  });
  it('前隙つき(タッチ): 立ち止まっていても段ごとに少し踏み込む(体ごと前へ)', () => {
    const p0 = st().player;
    st().beginMeleeSwing();
    const p = st().player;
    expect(p.lungeUntil).toBeGreaterThan(now);
    expect(Math.hypot(p.lungeVx ?? 0, p.lungeVy ?? 0)).toBeGreaterThan(0);
    expect((p.lungeVx ?? 0) * (p0.lastDirection?.x ?? 1)).toBeGreaterThan(0);
  });
});
