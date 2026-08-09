// ボットの目的(ゴール)層(社長指示v0.25.2339)。
// **最重要の不変条件は「none = 従来と同じ=何も指示しない」**。これが崩れると既存のボットランが動く。
import { describe, it, expect } from 'vitest';
import {
  planObjective, parseBotObjective, steerTo, outwardPoint, nearestOfType, nearestUncapturedBase,
  ARRIVE_DIST, HIDDEN_BOSS_MIN_LEVEL, FARM_RADIUS, arenaPlan, nearestEventEnemy,
  nearestUnopenedPoi, CAMPAIGN_MIN_LEVEL, CAMPAIGN_BOSS_ENGAGE_PX, HOLD_INPUT, campaignTargetBase,
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
  baseSites: [], enemiesKilled: 0, gameWon: false, activeEvent: null,
  ...over,
});

// v0.25.3052 campaign: 通し(拠点→POI→城ボス)。
// ★この目的の肝は **hold**(サークル内に留まる)。これが無いと steerTo が到着圏内で null を返して
//   通常の徘徊入力へ落ち、拠点(10秒)/POI(3秒)の滞在が永久に貯まらない(依頼#6で実測した実バグ)。
describe('campaign(通し)', () => {
  const poi = (kind: 'armory' | 'hospital' | 'police', x: number, y: number, over: Record<string, unknown> = {}) =>
    ({ kind, x, y, taken: false, radius: 95, ...over }) as NonNullable<ObjectiveWorld['pois']>[number];

  it('未制圧の拠点があれば、城より先に拠点へ向かう', () => {
    const p = planObjective({ kind: 'campaign' }, world({
      baseSites: [base('a', 800, 0)],
      castleEvent: { x: 5000, y: 0 } as unknown as ObjectiveWorld['castleEvent'],
      baseCaptureRadius: 130,
    }));
    expect(p.destination).toEqual({ x: 800, y: 0 });
    expect(p.hold).toBeFalsy();          // まだ遠い=歩く
    expect(p.note).toContain('拠点');
  });

  // ★v0.25.3059 実走で判明: 拠点を制圧するのは護衛NPC(escort)であってプレイヤーではない。
  //   しかも escort は画面外では前進しない。よって正解は「拠点中心に留まる」ではなく「escortに随伴」。
  //   (旧実装は拠点中心で hold していたため、44pxまで寄って19秒静止しても滞在0msのままだった)
  it('★担当の護衛NPCが居れば、拠点中心ではなく escort へ随伴する(hold しない)', () => {
    const p = planObjective({ kind: 'campaign' }, world({
      baseSites: [base('a', 3000, 0)], baseCaptureRadius: 130,
      escorts: [{ baseId: 'a', x: 500, y: 0 }, { baseId: 'other', x: 10, y: 0 }],
    }));
    expect(p.destination).toEqual({ x: 500, y: 0 });   // escortの位置(担当違いは無視)
    expect(p.hold).toBeFalsy();                        // 付いて行きながら普段どおり戦う
    expect(p.note).toContain('護衛');
  });

  it('★拠点の円内に居ても hold は出さない(プレイヤーが立っても制圧されないため)', () => {
    const p = planObjective({ kind: 'campaign' }, world({
      px: 50, py: 0, baseSites: [base('a', 0, 0)], baseCaptureRadius: 130,
    }));
    expect(p.hold).toBeFalsy();
  });

  // ★v0.25.3083 実走で判明した実バグ: 「最寄りの未制圧拠点」だとプレイヤーが動くたびに目標が変わり、
  //   4体の護衛の間を行き来して15分で拠点0個だった。「護衛が自分の拠点に最も近い拠点」を選べば
  //   捕獲されるまで目標が変わらない(状態を持たずに安定する)。
  it('★狙う拠点は「最寄り」ではなく「護衛が完成に一番近い拠点」(目標が揺れない)', () => {
    const w = world({
      px: 0, py: 0,
      baseSites: [base('near', 500, 0), base('far', 5000, 0)],
      escorts: [
        { baseId: 'near', x: 0, y: 0 },      // 担当拠点まで 500px
        { baseId: 'far', x: 4900, y: 0 },    // 担当拠点まで 100px ← こちらが完成に近い
      ],
      baseCaptureRadius: 130,
    });
    expect(campaignTargetBase(w)?.id).toBe('far');
    // プレイヤーが動いても目標は変わらない(ここが「揺れない」の肝)
    expect(campaignTargetBase({ ...w, px: 4000, py: 0 })?.id).toBe('far');
    expect(campaignTargetBase({ ...w, px: -3000, py: 0 })?.id).toBe('far');
  });

  it('制圧済みの拠点は狙わない / 全部済んだら null', () => {
    const w = world({
      baseSites: [base('a', 500, 0, 'captured'), base('b', 900, 0)],
      escorts: [{ baseId: 'a', x: 500, y: 0 }, { baseId: 'b', x: 800, y: 0 }],
    });
    expect(campaignTargetBase(w)?.id).toBe('b');
    expect(campaignTargetBase(world({ baseSites: [base('a', 5, 0, 'captured')] }))).toBeNull();
  });

  it('escort が未提供なら「最寄り」へフォールバックする', () => {
    const w = world({ px: 0, py: 0, baseSites: [base('near', 500, 0), base('far', 5000, 0)] });
    expect(campaignTargetBase(w)?.id).toBe('near');
  });

  it('escort が未提供/不在なら従来どおり拠点そのものを目的地にする', () => {
    const p = planObjective({ kind: 'campaign' }, world({
      baseSites: [base('a', 800, 0)], baseCaptureRadius: 130, escorts: [],
    }));
    expect(p.destination).toEqual({ x: 800, y: 0 });
  });

  it('拠点を全部取ったらPOIへ。POIの円内でも hold=true', () => {
    const w = world({
      baseSites: [base('a', 0, 0, 'captured')],
      pois: [poi('hospital', 600, 0)], baseCaptureRadius: 130,
    });
    expect(planObjective({ kind: 'campaign' }, w).destination).toEqual({ x: 600, y: 0 });
    const inside = planObjective({ kind: 'campaign' }, { ...w, px: 620, py: 0 });
    expect(inside.hold).toBe(true);
  });

  it('警察署は「留まる」ではなく戦う=hold を出さない(囲いイベントが起きるため)', () => {
    const p = planObjective({ kind: 'campaign' }, world({
      px: 10, py: 0, pois: [poi('police', 0, 0, { radius: 240 })], baseCaptureRadius: 130,
    }));
    expect(p.hold).toBeFalsy();
  });

  it('武器庫はスクラップが足りない間スキップする(足りたら向かう)', () => {
    const w = world({ pois: [poi('armory', 500, 0, { cost: 100 })], scrap: 30, baseCaptureRadius: 130 });
    expect(nearestUnopenedPoi(w)).toBeNull();
    expect(nearestUnopenedPoi({ ...w, scrap: 150 })?.kind).toBe('armory');
  });

  it('取得済みPOIは対象にしない', () => {
    const w = world({ pois: [poi('hospital', 500, 0, { taken: true })] });
    expect(nearestUnopenedPoi(w)).toBeNull();
  });

  it('拠点もPOIも片付いたら、レベルが足りなければLv上げ→足りれば城へ', () => {
    const w = world({ castleEvent: { x: 5000, y: 0 } as unknown as ObjectiveWorld['castleEvent'] });
    expect(planObjective({ kind: 'campaign' }, { ...w, level: 1 }).note).toContain('Lv上げ');
    expect(planObjective({ kind: 'campaign' }, { ...w, level: CAMPAIGN_MIN_LEVEL }).destination).toEqual({ x: 5000, y: 0 });
  });

  it('★城ボスが至近なら、拠点が残っていても先に戦う(逃げ続けると詰むため)', () => {
    const boss = enemy('giantbat', 100, 0);
    const w = world({ enemies: [boss], baseSites: [base('a', 800, 0)], baseCaptureRadius: 130 });
    expect(planObjective({ kind: 'campaign' }, w).focus).toBe(boss);
    // 遠い城ボスは無視して拠点を優先する
    const far = world({
      enemies: [enemy('giantbat', CAMPAIGN_BOSS_ENGAGE_PX + 500, 0)],
      baseSites: [base('a', 800, 0)], baseCaptureRadius: 130,
    });
    expect(planObjective({ kind: 'campaign' }, far).note).toContain('拠点');
  });

  it('帰還サークルが出たら最優先。勝利したら done', () => {
    expect(planObjective({ kind: 'campaign' }, world({
      returnCircle: { x: 9, y: 9, radius: 100 }, baseSites: [base('a', 800, 0)],
    })).destination).toEqual({ x: 9, y: 9 });
    expect(planObjective({ kind: 'campaign' }, world({ gameWon: true })).done).toBe(true);
  });

  it('囲いイベントは campaign より優先される(既存の掟を壊さない)', () => {
    const p = planObjective({ kind: 'campaign' }, world({
      activeEvent: { kind: 'horde', x: 300, y: 0, radius: 200 },
      baseSites: [base('a', 800, 0)], baseCaptureRadius: 130,
    }));
    expect(p.pressAttack).toBe(true);
    expect(p.note).toContain('囲い');
  });

  it('パラメータを解釈する(campaign / campaign:LV)', () => {
    expect(parseBotObjective('campaign')).toEqual({ kind: 'campaign' });
    expect(parseBotObjective('campaign:15')).toEqual({ kind: 'campaign', minLevel: 15 });
  });

  it('POI/半径を渡さない既存の呼び出しでも壊れない(後方互換)', () => {
    const p = planObjective({ kind: 'campaign' }, world({ baseSites: [base('a', 800, 0)] }));
    expect(p.hold).toBeFalsy();     // baseCaptureRadius 未指定 = hold を出さない
    expect(p.destination).toEqual({ x: 800, y: 0 });
  });

  it('HOLD_INPUT は「どこにも動かない」', () => {
    expect(HOLD_INPUT).toEqual({ up: false, down: false, left: false, right: false });
  });
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

describe('囲いイベント突破(関所ゲート1/2)— v0.25.2340', () => {
  const arena = { kind: 'horde' as const, x: 5000, y: 0, radius: 400 };
  const script = (x: number, y: number) => enemy('zombie', x, y, { fromEvent: true });

  it('倒すべきは台本敵(fromEvent)だけ。通常の雑魚を選ばない', () => {
    // 雑魚の方が近くても、囲いを終わらせるのは台本敵だけ。
    const w = world({ px: 5000, py: 0, activeEvent: arena, enemies: [enemy('zombie', 20, 0), script(300, 0)] });
    expect(nearestEventEnemy(w)?.fromEvent).toBe(true);
    expect(arenaPlan(w)!.focus?.fromEvent).toBe(true);
  });

  it('**どの目的よりも優先される**(囲いを倒さないと前へ進めないため)', () => {
    const w = world({ px: 5000, py: 0, activeEvent: arena, enemies: [script(5200, 0)] });
    for (const obj of [
      { kind: 'clear' } as const,
      { kind: 'score' } as const,
      { kind: 'depth', dist: 9000 } as const,
      { kind: 'hiddenBoss' } as const,
    ]) {
      const p = planObjective(obj, w);
      expect(p.note).toContain('囲い突破');
      expect(p.focus?.fromEvent).toBe(true);
    }
  });

  it('帰還サークルが出ていても囲いが先(閉じ込められているので行けない)', () => {
    const w = world({ px: 5000, py: 0, activeEvent: arena, enemies: [script(5200, 0)],
                      returnCircle: { x: 0, y: 0, radius: 95 } });
    expect(planObjective({ kind: 'clear' }, w).note).toContain('囲い突破');
  });

  it('台本敵がまだ湧いていなければ円の中心で待つ(離れない)', () => {
    const p = arenaPlan(world({ px: 5600, py: 0, activeEvent: arena, enemies: [enemy('zombie', 5610, 0)] }))!;
    expect(p.destination).toEqual({ x: 5000, y: 0 });
    expect(p.travel).toBe(true);
  });

  it('救助(rescue)は倒すのではなく円内に留まるのが条件', () => {
    const p = arenaPlan(world({ px: 5600, py: 0, activeEvent: { ...arena, kind: 'rescue' } }))!;
    expect(p.destination).toEqual({ x: 5000, y: 0 });
    expect(p.focus).toBeNull();
    expect(p.note).toContain('救助');
  });

  it('囲い中は退避せず攻めきる(pressAttack)。逃げても囲いは終わらないため', () => {
    const w = world({ px: 5000, py: 0, activeEvent: arena, enemies: [script(5200, 0)] });
    expect(planObjective({ kind: 'depth', dist: 9000 }, w).pressAttack).toBe(true);
    // 囲いの外では従来どおり退避してよい。
    expect(planObjective({ kind: 'depth', dist: 9000 }, world({ px: 100, py: 0 })).pressAttack).toBe(false);
  });

  it('囲いが終われば通常の目的へ戻る', () => {
    const w = world({ px: 5000, py: 0, activeEvent: null });
    expect(planObjective({ kind: 'depth', dist: 9000 }, w).note).toContain('深部へ');
  });

  it('**目的なし(none)には割り込まない**(既存ボットランの挙動を1バイトも変えない)', () => {
    const w = world({ px: 5000, py: 0, activeEvent: arena, enemies: [script(5200, 0)] });
    const p = planObjective({ kind: 'none' }, w);
    expect(p.destination).toBeNull();
    expect(p.focus).toBeNull();
    expect(p.travel).toBe(false);
  });
});
