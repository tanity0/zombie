// PACING_PUZZLE.md §6.33-3: LASER-TRACKの不変条件+ゴール検証(シミュレーション)。
// 不変条件①〜⑥は基準系(bossTelegraph.ts)との整合を、ゴール検証は社長裁定=案F(v0.25.2941)の芯
// 「静止=当たる/走り続け=追いつかれて当たる/直前(発射550〜1100ms前)の反転だけが振り切れる/
// 早すぎる反転は再捕捉・ロック後は間に合わない」を機械検査する。
import { describe, expect, it } from 'vitest';
import {
  MIMIR_LASER_WINDUP_MS, MIMIR_LASER_TRACK_MAX_PX_S, MIMIR_LASER_TRACK_ACCEL,
  MIMIR_LASER_LOCK_MS, MIMIR_LASER_WEAK_MS, MIMIR_LASER_BROKEN_MS, MIMIR_LASER_INTERRUPTED_CD_MS,
  mimirLaserPhase, mimirLaserFill01, stepLaserAim, canInterruptMimirLaser, mimirLaserBreakOnMeleeHit,
  type MimirLaserAim,
} from './mimirLaserTrack';
import { PLAYER_WALK_PX_PER_SEC, PLAYER_ATTACK_CYCLE_MS, minWindupMs } from './bossTelegraph';
import { bossPostureMax } from './bossPosture';
import type { Enemy } from '../types/game';

// ビーム脱出に必要な線からの垂直距離 = 半太さ34 + 自機半径14(28×28の半分)。§6.33-2の導出と同値。
const ESCAPE_PX = 34 + 14;

describe('mimirLaserTrack: 不変条件(§6.33-3 ①〜⑥)', () => {
  it('① 照準の最高速は歩速の1.3倍(案F=走り続けるだけでは逃げ切れない)・加速は歩速×5', () => {
    expect(MIMIR_LASER_TRACK_MAX_PX_S).toBeCloseTo(PLAYER_WALK_PX_PER_SEC * 1.3, 6);
    expect(MIMIR_LASER_TRACK_ACCEL).toBeCloseTo(PLAYER_WALK_PX_PER_SEC * 5, 6);
  });
  it('② ロック段は脱出必要時間より短い(=フラッシュを見てからでは構造的に間に合わない)', () => {
    expect(MIMIR_LASER_LOCK_MS).toBeLessThan(minWindupMs(ESCAPE_PX));
  });
  it('③ 弱点窓は近接1サイクル以上(=窓内に必ず1振り入る)', () => {
    expect(MIMIR_LASER_WEAK_MS).toBeGreaterThanOrEqual(PLAYER_ATTACK_CYCLE_MS);
  });
  it('④ カラオケ塗りは発射の瞬間にちょうど1.0(塗り完了=発射)・単調増加', () => {
    const until = 10000 + MIMIR_LASER_WINDUP_MS;
    expect(mimirLaserFill01(10000, until)).toBe(0);
    expect(mimirLaserFill01(until, until)).toBe(1);
    expect(mimirLaserFill01(until - MIMIR_LASER_LOCK_MS, until)).toBeCloseTo(1 - MIMIR_LASER_LOCK_MS / MIMIR_LASER_WINDUP_MS, 6);
    let prev = -1;
    for (let t = 10000; t <= until; t += 100) {
      const f = mimirLaserFill01(t, until);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
  it('⑤ 照準の速度・加速度が上限を超えない(遠方へ飛ぶ対象を追わせて検査)', () => {
    let aim: MimirLaserAim = { x: 0, y: 0, vx: 0, vy: 0 };
    const dt = 0.016;
    for (let i = 0; i < 400; i++) {
      // 対象を遠方で激しく飛ばしても(テレポート相当)、上限は絶対に破らない
      const tx = (i % 2 === 0 ? 1 : -1) * 5000;
      const ty = (i % 3 === 0 ? 1 : -1) * 5000;
      const next = stepLaserAim(aim, tx, ty, dt);
      const speed = Math.hypot(next.vx, next.vy);
      const dv = Math.hypot(next.vx - aim.vx, next.vy - aim.vy);
      expect(speed).toBeLessThanOrEqual(MIMIR_LASER_TRACK_MAX_PX_S + 1e-6);
      expect(dv).toBeLessThanOrEqual(MIMIR_LASER_TRACK_ACCEL * dt + 1e-6);
      aim = next;
    }
  });
  it('⑥ フェーズ境界: 残り≤LOCKでロック・それ以前は追尾', () => {
    const until = 3000;
    expect(mimirLaserPhase(until - MIMIR_LASER_LOCK_MS - 1, until)).toBe('track');
    expect(mimirLaserPhase(until - MIMIR_LASER_LOCK_MS, until)).toBe('lock');
    expect(mimirLaserPhase(until, until)).toBe('lock');
    expect(mimirLaserPhase(0, undefined)).toBe('track');
  });
});

// ゴール検証: ボス(0,0)・プレイヤー初期位置(600,0)。追尾段は16ms刻みで照準を回し、
// ロックで固定した線(原点→照準方向・射程2600)と発射時(t=3000)のプレイヤー位置の垂直距離を測る。
const fireDistance = (playerAt: (tMs: number) => { x: number; y: number }): number => {
  const until = MIMIR_LASER_WINDUP_MS;
  const p0 = playerAt(0);
  let aim: MimirLaserAim = { x: p0.x, y: p0.y, vx: 0, vy: 0 };
  let lockX: number | null = null, lockY: number | null = null;
  for (let t = 0; t < until; t += 16) {
    if (mimirLaserPhase(t, until) === 'track') {
      const p = playerAt(t);
      aim = stepLaserAim(aim, p.x, p.y, 0.016);
    } else if (lockX === null) {
      lockX = aim.x; lockY = aim.y;
    }
  }
  const lx = lockX ?? aim.x, ly = lockY ?? aim.y;
  const al = Math.hypot(lx, ly) || 1;
  const ux = lx / al, uy = ly / al;
  const p = playerAt(until);
  const tproj = Math.max(0, Math.min(2600, p.x * ux + p.y * uy));
  return Math.hypot(p.x - ux * tproj, p.y - uy * tproj);
};
const WALK = PLAYER_WALK_PX_PER_SEC / 1000; // px/ms

// 「windup開始から+y方向へ走り続け、発射atMs前に反転(-y)する」プレイヤー(マタドール検証用)。
const runThenReverse = (atMsBeforeFire: number) => {
  const s = MIMIR_LASER_WINDUP_MS - atMsBeforeFire;
  return (t: number) => ({ x: 600, y: t <= s ? WALK * t : WALK * s - WALK * (t - s) });
};

describe('mimirLaserTrack: ゴール検証シミュレーション(§6.33-3・案F)', () => {
  it('(i) 静止プレイヤーは発射時にビーム内(=当たる)', () => {
    expect(fireDistance(() => ({ x: 600, y: 0 }))).toBeLessThan(ESCAPE_PX);
  });
  it('(ii) 横へ走り続けるだけのプレイヤーは追いつかれてビーム内(=案Fの芯・距離によらない)', () => {
    for (const x of [300, 600, 1000]) {
      expect(fireDistance(t => ({ x, y: WALK * t })), `distance=${x}`).toBeLessThan(ESCAPE_PX);
    }
  });
  it('(iii) ロックのフラッシュを見てから走り出したプレイヤーはビーム内(=見てからでは間に合わない)', () => {
    const start = MIMIR_LASER_WINDUP_MS - MIMIR_LASER_LOCK_MS;
    expect(fireDistance(t => ({ x: 600, y: t > start ? WALK * (t - start) : 0 }))).toBeLessThan(ESCAPE_PX);
  });
  it('(iv) 直前の反転(発射600〜1000ms前)は慣性で振り切れてビーム外(=マタドール成立)', () => {
    for (const pre of [600, 700, 800, 900, 1000]) {
      expect(fireDistance(runThenReverse(pre)), `reversal ${pre}ms pre-fire`).toBeGreaterThan(ESCAPE_PX);
    }
  });
  it('(v) 早すぎる反転(1500ms前〜)は再捕捉されてビーム内・遅すぎる反転(400ms前)も間に合わない', () => {
    expect(fireDistance(runThenReverse(1500)), 'too early').toBeLessThan(ESCAPE_PX);
    expect(fireDistance(runThenReverse(1800)), 'too early').toBeLessThan(ESCAPE_PX);
    expect(fireDistance(runThenReverse(400)), 'too late').toBeLessThan(ESCAPE_PX);
  });
  it('(vi) その場の微動(±20pxのうろつき)はビーム内(=「ちょっと動いたぐらいじゃ当たる」)', () => {
    expect(fireDistance(t => ({ x: 600, y: 20 * Math.sin((2 * Math.PI * t) / 2000) }))).toBeLessThan(ESCAPE_PX);
  });
});

describe('mimirLaserTrack: ゾーンごとの答えの実測(§6.33-1-2)', () => {
  it('密着(120px)では走っても線外に出られない=密着の答えは「中断」(意図の固定)', () => {
    // 至近距離のビームは幾何的に走って抜けられない。§6.32の距離帯役割どおり
    // 「密着=弱点窓で殴って止める(答え3)」が主答えであることをここで固定する。
    const near = (t: number) => ({ x: 120, y: WALK * t });
    expect(fireDistance(near)).toBeLessThan(ESCAPE_PX);
  });
});

// 監査指摘9(v0.25.2938): 「プレイヤーの近接3経路(ナイフ/刀/鞭)すべてに中断フックが対で付いている」
// をソース走査で機械化(bossFullStunCoverage.test.ts と同じ流儀=?raw)。4本目の近接経路が増えた時に
// 無言で漏れるのを防ぐ。プレイヤー直接の melee 体幹サイト数が増えたらこの期待値も見直すこと。
const SOURCES = import.meta.glob<string>(
  ['../store/gameStore.ts'],
  { query: '?raw', import: 'default', eager: true },
);
describe('mimirLaserTrack: 近接経路の網羅(ソース走査)', () => {
  it('gameStore の中断フックは3箇所(ナイフ/刀/鞭)で、体幹パッチ合成の作法で呼ばれている', () => {
    const key = Object.keys(SOURCES).find(k => k.endsWith('gameStore.ts'));
    expect(key).toBeTruthy();
    const src = SOURCES[key!];
    const hooks = src.match(/mimirLaserBreakOnMeleeHit\(\{ \.\.\.enemy, \.\.\.\(bossBump\?\.patch \?\? \{\}\) \}, gameTime\)/g) ?? [];
    expect(hooks.length).toBe(3);
  });
});

describe('mimirLaserTrack: 中断(弱点窓)', () => {
  const mkMimir = (overrides: Partial<Enemy> = {}): Enemy => ({
    id: 'm1', type: 'mimir', x: 0, y: 0, width: 60, height: 60, health: 500, maxHealth: 500,
    speed: 90, damage: 38, lastHit: 0,
    bossState: 'laser-windup', bossStateUntil: 10000,
    ...overrides,
  } as unknown as Enemy);

  it('窓の判定: laser-windupの発射前WEAK_MSのみtrue(窓前・発射後・他stateはfalse)', () => {
    expect(canInterruptMimirLaser('mimir', 'laser-windup', 10000 - MIMIR_LASER_WEAK_MS, 10000)).toBe(true);
    expect(canInterruptMimirLaser('mimir', 'laser-windup', 10000 - MIMIR_LASER_WEAK_MS - 1, 10000)).toBe(false);
    expect(canInterruptMimirLaser('mimir', 'laser-windup', 10000, 10000)).toBe(false);
    expect(canInterruptMimirLaser('mimir', 'laser-fire', 9500, 10000)).toBe(false);
    expect(canInterruptMimirLaser('jormungand', 'laser-windup', 9500, 10000)).toBe(false);
  });
  it('窓内の近接ヒットで必ず中断(laser-broken 1700ms・連携クリア・中断CD 8000ms)+体幹0.20', () => {
    const r = mimirLaserBreakOnMeleeHit(mkMimir({ bossScriptQueue: ['bite'] }), 9500);
    expect(r).not.toBeNull();
    expect(r!.patch.bossState).toBe('laser-broken');
    expect(r!.patch.bossStateUntil).toBe(9500 + MIMIR_LASER_BROKEN_MS);
    expect(r!.patch.bossScriptQueue).toEqual([]);
    expect(r!.patch.mimirLaserReadyAt).toBe(9500 + MIMIR_LASER_INTERRUPTED_CD_MS);
    expect(r!.patch.bossPosture).toBeCloseTo(bossPostureMax('mimir') * 0.8, 6);
  });
  it('窓外はnull(中断しない)', () => {
    expect(mimirLaserBreakOnMeleeHit(mkMimir(), 10000 - MIMIR_LASER_WEAK_MS - 1)).toBeNull();
  });
  it('体幹が加算できない状態(再ブレイクロック中)でも中断そのものは成立する', () => {
    const r = mimirLaserBreakOnMeleeHit(mkMimir({ bossPostureLockUntil: 99999 }), 9500);
    expect(r).not.toBeNull();
    expect(r!.patch.bossState).toBe('laser-broken');
    expect(r!.patch.bossPosture).toBeUndefined();
    expect(r!.postureTriggered).toBe(false);
  });
});
