// ボットの目的(ゴール)層(社長指示v0.25.2339)。
// **最重要の不変条件は「none = 従来と同じ=何も指示しない」**。これが崩れると既存のボットランが動く。
import { describe, it, expect } from 'vitest';
import {
  planObjective, parseBotObjective, steerTo, outwardPoint, nearestOfType, nearestUncapturedBase,
  ARRIVE_DIST, HIDDEN_BOSS_MIN_LEVEL, FARM_RADIUS,
  type ObjectiveWorld,
} from './botObjective';
import type { Enemy, EnemyType, BaseSite, Pickup } from '../types/game';

const enemy = (type: EnemyType, x: number, y: number, over: Partial<Enemy> = {}): Enemy =>
  ({ id: `${type}-${x}-${y}`, type, x, y, width: 30, height: 30, health: 100, ...over } as unknown as Enemy);
const pickup = (type: string, x: number, y: number): Pickup =>
  ({ id: `${type}-${x}`, type, x, y } as unknown as Pickup);
const base = (id: string, x: number, y: number, status = 'idle'): BaseSite =>
  ({ id, x, y, status } as unknown as BaseSite);

const world = (over: Partial<ObjectiveWorld> = {}): ObjectiveWorld => ({
  px: 0, py: 0, level: 1, enemies: [], pickups: [],
  returnCircle: null, castleEvent: null, finaleDefeated: false,
  hiddenBoss: null, hiddenBossLair: null, hiddenBossDefeated: false,
  baseSites: [], enemiesKilled: 0, gameWon: false,
  ...over,
});

describe('none(既定)', () => {
  it('何も指示しない=従来のボット挙動が丸ごと残る', () => {
    const p = planObjective({ kind: 'none' }, world({ enemies: [enemy('zombie', 100, 0)] }));
    expect(p.destination).toBeNull();
    expect(p.focus).toBeNull();
    expect(p.travel).toBe(false);
    expect(p.done).toBe(false);
  });

  it('未知/壊れたパラメータは none へ落ちる', () => {
    for (const v of [null, undefined, '', 'なにこれ', 'depth:0', 'depth:abc', 'kills:-3', 'hunt:'] as const) {
      expect(parseBotObjective(v as string | null | undefined).kind).toBe('none');
    }
  });
});

describe('clear(メインミッションをクリアする)', () => {
  it('帰還サークルが出ていたら最優先でそこへ向かう', () => {
    const p = planObjective({ kind: 'clear' }, world({ returnCircle: { x: 500, y: -200, radius: 95 } }));
    expect(p.destination).toEqual({ x: 500, y: -200 });
    expect(p.travel).toBe(true);
  });

  it('城ボスが出ていたらそれを狙う(帰還サークルより前の段階)', () => {
    const boss = enemy('giantbat', 300, 0);
    const p = planObjective({ kind: 'clear' }, world({ enemies: [boss, enemy('zombie', 40, 0)] }));
    expect(p.focus?.id).toBe(boss.id);
  });

  it('イベント産のgiantbatは城ボスとみなさない(任務の対象ではない)', () => {
    const p = planObjective({ kind: 'clear' }, world({
      enemies: [enemy('giantbat', 300, 0, { fromEvent: true })],
      castleEvent: { x: 1000, y: 0, bossSpawned: false },
    }));
    expect(p.focus).toBeNull();
    expect(p.destination).toEqual({ x: 1000, y: 0 }); // 城へ向かう方が選ばれる
  });

  it('城がまだ健在なら城へ向かう', () => {
    const p = planObjective({ kind: 'clear' }, world({ castleEvent: { x: 1200, y: 300, bossSpawned: false } }));
    expect(p.destination).toEqual({ x: 1200, y: 300 });
    expect(p.travel).toBe(true);
  });

  it('城が無い/撃破済みで帰還サークルも無ければ外へ探索する(止まらない)', () => {
    const p = planObjective({ kind: 'clear' }, world({ px: 1000, py: 0, finaleDefeated: true }));
    expect(p.destination).not.toBeNull();
    expect(Math.hypot(p.destination!.x, p.destination!.y)).toBeGreaterThan(1000);
  });

  it('勝利したら done', () => {
    expect(planObjective({ kind: 'clear' }, world({ gameWon: true })).done).toBe(true);
  });
});

describe('score(ハイスコアを狙う)', () => {
  it('トレジャーが最優先(1個5000点=最大の梃子)', () => {
    const p = planObjective({ kind: 'score' }, world({
      pickups: [pickup('treasure', 400, 0), pickup('experience', 30, 0)],
      enemies: [enemy('pumpkin', 100, 0)],
    }));
    expect(p.destination).toEqual({ x: 400, y: 0 });
    expect(p.travel).toBe(true);
  });

  it('トレジャーが無ければ強敵(エリート/ボス)を狙う', () => {
    const elite = enemy('pumpkin', 250, 0);
    const p = planObjective({ kind: 'score' }, world({ enemies: [enemy('zombie', 50, 0), elite] }));
    expect(p.focus?.id).toBe(elite.id);
  });

  it('何も無ければ深部へ(深いほどトレジャー/強敵が増える)', () => {
    const p = planObjective({ kind: 'score' }, world({ px: 2000, py: 0 }));
    expect(p.destination!.x).toBeGreaterThan(2000);
  });
});

describe('hiddenBoss(裏ボスを倒しに行く)', () => {
  const lair = { x: 9000, y: 0 };

  it('レベルが足りないうちは狩り場でレベル上げ(社長指示「必要であればレベル上げも含めて」)', () => {
    const p = planObjective({ kind: 'hiddenBoss' }, world({ px: 100, py: 0, level: 3, hiddenBoss: 'mimir', hiddenBossLair: lair }));
    expect(p.note).toContain('Lv上げ');
    expect(Math.hypot(p.destination!.x, p.destination!.y)).toBeCloseTo(FARM_RADIUS, 3);
    expect(p.travel).toBe(false); // 道中で戦うのが目的なので travel はしない
  });

  it('レベルが足りたら巣へ向かう', () => {
    const p = planObjective({ kind: 'hiddenBoss' }, world({ level: HIDDEN_BOSS_MIN_LEVEL, hiddenBoss: 'mimir', hiddenBossLair: lair }));
    expect(p.destination).toEqual(lair);
    expect(p.travel).toBe(true);
  });

  it('minLevel を指定すれば閾値を変えられる', () => {
    const w = world({ level: 5, hiddenBoss: 'mimir', hiddenBossLair: lair });
    expect(planObjective({ kind: 'hiddenBoss', minLevel: 3 }, w).destination).toEqual(lair);
    expect(planObjective({ kind: 'hiddenBoss', minLevel: 20 }, w).note).toContain('Lv上げ');
  });

  it('出会っていれば交戦(レベル条件より優先)', () => {
    const boss = enemy('mimir', 400, 0);
    const p = planObjective({ kind: 'hiddenBoss' }, world({ level: 1, enemies: [boss], hiddenBoss: 'mimir', hiddenBossLair: lair }));
    expect(p.focus?.id).toBe(boss.id);
  });

  it('撃破済みなら done / 裏ボスが居ないステージでは何もしない', () => {
    expect(planObjective({ kind: 'hiddenBoss' }, world({ hiddenBossDefeated: true })).done).toBe(true);
    expect(planObjective({ kind: 'hiddenBoss' }, world({ hiddenBoss: null })).destination).toBeNull();
  });
});

describe('hunt(指定の敵を倒す)', () => {
  it('居れば狙う', () => {
    const reaper = enemy('reaper', 300, 0);
    const p = planObjective({ kind: 'hunt', enemyType: 'reaper' }, world({ enemies: [enemy('zombie', 20, 0), reaper] }));
    expect(p.focus?.id).toBe(reaper.id);
  });

  it('居なければ探索して出現を待つ(止まらない)', () => {
    const p = planObjective({ kind: 'hunt', enemyType: 'hunter' }, world({ px: 500, py: 0 }));
    expect(p.destination).not.toBeNull();
    expect(p.travel).toBe(true);
  });

  it('パラメータから作れる', () => {
    expect(parseBotObjective('hunt:reaper')).toEqual({ kind: 'hunt', enemyType: 'reaper' });
  });
});

describe('depth / kills / bases(サブクエ検証用)', () => {
  it('depth: 到達したら done、未到達なら外向きの目的地', () => {
    expect(planObjective({ kind: 'depth', dist: 5000 }, world({ px: 5100, py: 0 })).done).toBe(true);
    const p = planObjective({ kind: 'depth', dist: 5000 }, world({ px: 1000, py: 0 }));
    expect(p.done).toBe(false);
    expect(Math.hypot(p.destination!.x, p.destination!.y)).toBeCloseTo(5000, 3);
  });

  it('kills: 達成したら done / 敵が見えていれば移動指示は出さない(その場で戦う)', () => {
    expect(planObjective({ kind: 'kills', count: 50 }, world({ enemiesKilled: 50 })).done).toBe(true);
    const p = planObjective({ kind: 'kills', count: 50 }, world({ enemies: [enemy('zombie', 60, 0)] }));
    expect(p.destination).toBeNull();
    expect(p.travel).toBe(false);
  });

  it('bases: 未制圧の最寄りへ向かい、規定数に達したら done', () => {
    const sites = [base('base-0', 1000, 0, 'captured'), base('base-1', 0, 800), base('base-2', -3000, 0)];
    const p = planObjective({ kind: 'bases', count: 2 }, world({ baseSites: sites }));
    expect(p.destination).toEqual({ x: 0, y: 800 });
    expect(planObjective({ kind: 'bases', count: 1 }, world({ baseSites: sites })).done).toBe(true);
  });
});

describe('移動ヘルパ', () => {
  it('steerTo は単位ベクトル。到着圏内なら null(目的地で足踏みしない)', () => {
    const v = steerTo(0, 0, { x: 300, y: 0 })!;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
    expect(steerTo(0, 0, { x: ARRIVE_DIST - 1, y: 0 })).toBeNull();
    expect(steerTo(0, 0, null)).toBeNull();
  });

  it('outwardPoint は原点から見て今と同じ方角の、指定距離の点', () => {
    const p = outwardPoint(world({ px: 300, py: 400 }), 5000); // 3-4-5
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(5000, 6);
    expect(p.x / p.y).toBeCloseTo(300 / 400, 6);
  });

  it('原点ちょうどでも壊れない(向きが定まらないので東へ)', () => {
    expect(outwardPoint(world({ px: 0, py: 0 }), 1000)).toEqual({ x: 1000, y: 0 });
  });
});

describe('探索ヘルパ', () => {
  it('nearestOfType は種別一致の最寄り', () => {
    const w = world({ enemies: [enemy('zombie', 10, 0), enemy('reaper', 500, 0), enemy('reaper', 100, 0)] });
    expect(nearestOfType(w, 'reaper')?.x).toBe(100);
    expect(nearestOfType(w, 'hunter')).toBeNull();
  });

  it('nearestUncapturedBase は制圧済みを飛ばす', () => {
    const w = world({ baseSites: [base('a', 50, 0, 'captured'), base('b', 400, 0)] });
    expect(nearestUncapturedBase(w)?.id).toBe('b');
  });
});
