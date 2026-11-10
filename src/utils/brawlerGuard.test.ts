// ★格闘の構えの成立の効果の決め(research/BRAWLER.md §12-3d・社長指示2026-11-10)の純関数。
//  雑魚→潰し / 強個体・ボス級→ノックバック / 撃ち主不明→ノックバック / 間引きの受け→何もしない / 光線の中断の対象。
import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import {
  brawlerGuardOutcome, brawlerGuardSourceClass, brawlerGuardKnockDir, isBrawlerBeamMove, isBrawlerBeamFiring, brawlerBeamCutTarget,
  brawlerBeamCutValid, slowLostMs, brawlerPushUntil, brawlerGuardSourceEnemy, BRAWLER_CUT_BEAMS, BRAWLER_BEAM_CUT_GRACE_MS, BRAWLER_GUARD_KNOCK_PX, BRAWLER_GUARD_KNOCK_MS,
} from './brawlerGuard';
import { BRAWLER_STEP_PX } from './brawler';

const e = (id: string, type: string, extra: Partial<Enemy> = {}): Enemy => ({ id, type, ...extra } as unknown as Enemy);

describe('構えの成立の効果(§12-3d)', () => {
  it('雑魚→潰し / 強個体・ボス級→ノックバック / 撃ち主不明→ノックバック', () => {
    expect(brawlerGuardOutcome({ throttled: false, classes: ['mob'] })).toBe('stomp');
    expect(brawlerGuardOutcome({ throttled: false, classes: ['mob', 'mob'] })).toBe('stomp');
    expect(brawlerGuardOutcome({ throttled: false, classes: ['strong'] })).toBe('knockback');
    expect(brawlerGuardOutcome({ throttled: false, classes: ['boss'] })).toBe('knockback');
    expect(brawlerGuardOutcome({ throttled: false, classes: [undefined] })).toBe('knockback'); // 相手が分からない
    expect(brawlerGuardOutcome({ throttled: false, classes: [] })).toBe('knockback');          // 相手が1件も無い
    expect(brawlerGuardOutcome({ throttled: false, classes: [null] })).toBe('knockback');      // 浮かない区分(終端の死神)
  });
  it('雑魚と雑魚より上を同じ回に返したら、ノックバック(ハメを残さない側)', () => {
    expect(brawlerGuardOutcome({ throttled: false, classes: ['mob', 'boss'] })).toBe('knockback');
    expect(brawlerGuardOutcome({ throttled: false, classes: ['mob', undefined] })).toBe('knockback');
  });
  it('間引きの受け(毎フレーム来る受けの2回目以降)・持続ダメージ→何もしない', () => {
    for (const classes of [['mob'], ['boss'], []] as const) {
      expect(brawlerGuardOutcome({ throttled: true, classes })).toBe('none');
      expect(brawlerGuardOutcome({ throttled: false, dot: true, classes })).toBe('none');
    }
  });
  it('区分は格闘の当たりと同じ物差し: 個体が居ればその個体(赤い個体=強個体・終端の死神=浮かない区分)、居なければ型、どちらも無ければ不明', () => {
    const enemies = [e('z', 'zombie'), e('r', 'zombie', { colorTier: 'red' } as Partial<Enemy>), e('p', 'pumpkin'), e('h', 'hunter')];
    expect(brawlerGuardSourceClass({ id: 'z' }, enemies)).toBe('mob');
    expect(brawlerGuardSourceClass({ id: 'r' }, enemies)).toBe('strong');
    expect(brawlerGuardSourceClass({ id: 'p' }, enemies)).toBe('strong');
    expect(brawlerGuardSourceClass({ id: 'h' }, enemies)).toBe('boss');
    expect(brawlerGuardSourceClass({ id: 'gone', type: 'zombie' as Enemy['type'] }, enemies)).toBe('mob'); // 撃ち主が倒れた後の弾=型で引く
    expect(brawlerGuardSourceClass({ id: 'gone' }, enemies)).toBeUndefined();
    expect(brawlerGuardSourceClass({}, enemies)).toBeUndefined();
  });
  it('押される向き: 相手から離れる → 相手が重なっていれば受けた点から離れる → どちらも取れなければ向いている方の逆', () => {
    const pc = { x: 100, y: 100 };
    expect(brawlerGuardKnockDir(pc, { x: 300, y: 100 }, { x: 100, y: 100 }, { x: 1, y: 0 })).toEqual({ x: -1, y: 0 });
    const d2 = brawlerGuardKnockDir(pc, { x: 102, y: 100 }, { x: 100, y: 140 }, { x: 1, y: 0 });
    expect(d2.x).toBeCloseTo(0, 6); expect(d2.y).toBeCloseTo(-1, 6);
    expect(brawlerGuardKnockDir(pc, null, { x: 101, y: 100 }, { x: 0, y: 1 })).toEqual({ x: -0, y: -1 });
    expect(brawlerGuardKnockDir(pc, null, pc, null)).toEqual({ x: -1, y: 0 });
  });
  it('押しの大きさ: ステップ(間合いの調整)より大きい・加速→減速の1山の長さは0より大きい', () => {
    expect(BRAWLER_GUARD_KNOCK_PX).toBeGreaterThan(BRAWLER_STEP_PX);
    expect(BRAWLER_GUARD_KNOCK_MS).toBeGreaterThan(0);
  });
  it('スローで進まなかった実時間: 等速は0・倍率0.2なら進んだ分の4倍', () => {
    expect(slowLostMs(0.01, 1)).toBe(0);
    expect(slowLostMs(0.002, 0.2)).toBeCloseTo(8, 6); // ゲーム内 2ms=実時間 10ms → 8ms ぶん進んでいない
    expect(slowLostMs(0.01, 0)).toBe(0);
  });
  it('押しの期限: スローの分だけ後ろへずれる。ただし「いまから器の長さ」を超えない(受けた回の刻みのずれで出だしが遅れない)', () => {
    expect(brawlerPushUntil(1280, 1010, 280, 0.002, 0.2)).toBeCloseTo(1288, 6);      // 実時間 10ms のうち 8ms ぶん後ろへ
    expect(brawlerPushUntil(1280, 1010, 280, 0.01, 1)).toBe(1280);                    // 等速=ずらさない
    // 受けた回: 刻みは等速(16.7ms)なのに倍率はもう 0.2=67ms ずらそうとする → いまから 280ms で頭を打つ。
    expect(brawlerPushUntil(1280, 1000, 280, 0.0167, 0.2)).toBe(1280);
    expect(brawlerPushUntil(1280, 1017, 280, 0.0167, 0.2)).toBe(1297);
  });
  it('押される向きの基準になる相手: 個体が分かればその個体・型だけなら同じ型で一番近い1体・どちらも無ければ無し', () => {
    const mk = (id: string, type: string, x: number, y: number) => ({ id, type, x, y, width: 0, height: 0 } as unknown as Enemy);
    const enemies = [mk('m1', 'mimir', 900, 0), mk('m2', 'mimir', 0, -200), mk('z', 'zombie', 50, 0)];
    const pc = { x: 0, y: 0 };
    expect(brawlerGuardSourceEnemy([{ id: 'm1' }], enemies, pc)?.id).toBe('m1');
    expect(brawlerGuardSourceEnemy([{ type: 'mimir' as Enemy['type'] }], enemies, pc)?.id).toBe('m2');
    expect(brawlerGuardSourceEnemy([{ id: 'gone', type: 'zombie' as Enemy['type'] }], enemies, pc)?.id).toBe('z');
    expect(brawlerGuardSourceEnemy([{ id: 'gone' }], enemies, pc)).toBeNull();
    expect(brawlerGuardSourceEnemy([], enemies, pc)).toBeNull();
  });
});

describe('光線の中断(社長指示2026-11-10「光線防いだら中断させたい」)', () => {
  it('どの受けが光線か: 被弾の技キーが撃ち続ける光線のもの', () => {
    for (const k of ['mimir-laser', 'mimir-wheel', 'br-laser', 'bm-snipe', 'idol-snipe', 'suriel-ring', 'g-sweepbeam']) expect(isBrawlerBeamMove(k), k).toBe(true);
    for (const k of [undefined, 'g-trishot', 'mimir-bite', 'idol-punch']) expect(isBrawlerBeamMove(k), String(k)).toBe(false);
  });
  it('中断してよい状態: 撃っている最中だけ(溜め・休み・気絶の間は中断しない)', () => {
    expect(isBrawlerBeamFiring({ bossState: 'laser-fire' } as Enemy)).toBe(true);
    expect(isBrawlerBeamFiring({ bossState: 'wheel-fire' } as Enemy)).toBe(true);
    expect(isBrawlerBeamFiring({ aiPhase: 'g-sweepbeam-active' } as Enemy)).toBe(true);
    for (const st of ['laser-windup', 'laser-recover', 'laser-broken', 'wheel-windup', 'chase', 'idol-snipe-windup']) {
      expect(isBrawlerBeamFiring({ bossState: st } as unknown as Enemy), st).toBe(false);
    }
    expect(isBrawlerBeamFiring({ aiPhase: 'g-sweepbeam-windup' } as Enemy)).toBe(false);
  });
  it('中断する相手: 光線の受けで、持ち主が撃っている最中の時だけ。個体が分からなければ同じ型で撃っている1体', () => {
    const enemies = [
      e('m', 'mimir', { bossState: 'laser-fire' } as Partial<Enemy>), e('b', 'bounty-ranged', { bossState: 'laser-windup' } as Partial<Enemy>),
      e('z', 'zombie'),
    ];
    expect(brawlerBeamCutTarget(true, [{ id: 'm' }], enemies)).toBe('m');
    expect(brawlerBeamCutTarget(true, [{ type: 'mimir' as Enemy['type'] }], enemies)).toBe('m'); // ミーミルのレーザーの被弾は型だけが届く
    expect(brawlerBeamCutTarget(false, [{ id: 'm' }], enemies)).toBeNull();                       // 光線の受けではない
    expect(brawlerBeamCutTarget(true, [{ id: 'b' }], enemies)).toBeNull();                        // 溜めの最中=中断しない
    expect(brawlerBeamCutTarget(true, [{ id: 'z' }], enemies)).toBeNull();
    expect(brawlerBeamCutTarget(true, [], enemies)).toBeNull();
  });
  it('中断の合図は短い間だけ生きる(別の理由で先に終わった光線の合図が、次の光線を切らない)', () => {
    expect(brawlerBeamCutValid(1000, 1000)).toBe(true);
    expect(brawlerBeamCutValid(1000, 1016)).toBe(true);
    expect(brawlerBeamCutValid(1000, 1000 + BRAWLER_BEAM_CUT_GRACE_MS + 1)).toBe(false);
  });
});

// ★漏れ止め: 光線を撃ち続ける型を足した時に、中断の配線を忘れない(bossFullStunCoverage.test.ts と同じ流儀=ソース走査)。
//  盾へ「光線が当たっている」と記録する所(noteShieldBeam を呼ぶファイル)は、必ず中断の合図(takeBrawlerBeamCut)も読んでいること。
//  表(BRAWLER_CUT_BEAMS)の状態名は、その更新のソースに実在すること。
// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない)。
const SOURCES = import.meta.glob<string>(
  ['../store/gameStore.ts', '../hooks/useGameLoop.ts', './*Tick.ts', '../world/*.ts'],
  { query: '?raw', import: 'default', eager: true },
);
describe('光線の中断の配線の漏れ止め', () => {
  const entries = Object.entries(SOURCES);
  it('noteShieldBeam を呼ぶファイルは全て takeBrawlerBeamCut を読む', () => {
    const callers = entries.filter(([, src]) => /noteShieldBeam\(/.test(src));
    // useGameLoop(ミーミルのレーザー・光輪)・gameStore(城ボスの掃射)・angelBossTick(スリエル)・bountyTick(バス停・懲罰狙撃)・idolTick(狙撃)
    expect(callers.map(([k]) => k.split('/').pop()).sort()).toEqual(['angelBossTick.ts', 'bountyTick.ts', 'gameStore.ts', 'idolTick.ts', 'useGameLoop.ts']);
    for (const [k, src] of callers) expect(/takeBrawlerBeamCut\(/.test(src), k).toBe(true);
  });
  it('noteShieldBeam の呼び出しの数=撃ち続ける光線の数(増えたら表と中断の配線を足す)', () => {
    const calls = entries.reduce((n, [, src]) => n + (src.match(/noteShieldBeam\(/g)?.length ?? 0), 0);
    // 表は6行。'laser-fire' はミーミルとバス停の2つの更新が持つ(+1)・スリエルは2本目の環の分(+1)。
    expect(calls).toBe(BRAWLER_CUT_BEAMS.length + 1 + 1);
    const takes = entries.reduce((n, [, src]) => n + (src.match(/takeBrawlerBeamCut\(/g)?.length ?? 0), 0);
    // 中断を読む所=光線の種類ごとに1か所(スリエルは2本で1か所)。
    expect(takes).toBe(BRAWLER_CUT_BEAMS.length + 1);
  });
  it('表の状態名は、撃っている最中の州としてソースに実在する', () => {
    const all = entries.map(([, src]) => src).join('\n');
    for (const b of BRAWLER_CUT_BEAMS) expect(all.includes(`'${b.state}'`), b.state).toBe(true);
  });
});
