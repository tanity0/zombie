// research/AI_HUMANIZE.md B2 ★未決#14(社長裁定2026-09-02=(a))のユニットテスト。
// episodeShapeFor が live 16州(天使7+城ボス9)で期待どおりの図形を返し、それ以外(declared/body-only/
// 不明)ではnullを返すこと(=呼び出し側=habitEpisode.shapeForEpisodeReplayが別に解決する契約)を機械化する。
import { describe, it, expect } from 'vitest';
import {
  episodeShapeFor, episodeAxisFor, LIVE_EPISODE_KEYS,
  GIANT_STOMP_RADIUS, GIANT_SWEEP_HALF_WIDTH, GIANT_SLAM_HALF_WIDTH, GIANT_GLIDE_HALF_WIDTH,
  GIANT_DIVE_RADIUS, GIANT_WING_RADIUS, GIANT_TRISHOT_HALF_WIDTH, GLEN_REACH_HALF_WIDTH,
  GLEN_TAILSLAM_HALF_WIDTH,
} from './episodeShape';
import { EPISODE_KEYS } from './habitEpisode';
import type { Enemy } from '../types/game';

const mkEnemy = (overrides: Partial<Enemy> = {}): Enemy => ({
  id: 'e1', x: 0, y: 0, width: 40, height: 40, speed: 0,
  health: 100, maxHealth: 100, damage: 10, type: 'giantbat', experienceValue: 0,
  lastHit: 0, lastShot: 0,
  ...overrides,
} as Enemy);

describe('LIVE_EPISODE_KEYS ⊆ EPISODE_KEYS(34州のうち16州が対象)', () => {
  it('16件・全てEPISODE_KEYSに含まれる', () => {
    expect(LIVE_EPISODE_KEYS.length).toBe(16);
    for (const k of LIVE_EPISODE_KEYS) expect(EPISODE_KEYS).toContain(k);
  });
});

describe('episodeShapeFor: live 16州で期待どおりの図形を返す', () => {
  it('miguel:harai-windup / tate-windup = 帯(aiFrom→aiTarget)', () => {
    const e = mkEnemy({ type: 'miguel', x: 0, y: 0, width: 40, height: 40, aiFromX: 100, aiFromY: 0, aiTargetX: 300, aiTargetY: 0 });
    const s = episodeShapeFor('miguel', 'harai-windup', e);
    expect(s?.kind).toBe('band');
    if (s?.kind === 'band') {
      expect(s.bands[0]).toMatchObject({ fx: 100, fy: 0, tx: 300, ty: 0 });
    }
    expect(episodeShapeFor('miguel', 'tate-windup', e)?.kind).toBe('band');
  });

  it('uri:sweep-windup / downslash-windup = 帯', () => {
    const e = mkEnemy({ type: 'uri', aiFromX: 0, aiFromY: 0, aiTargetX: 200, aiTargetY: 0 });
    expect(episodeShapeFor('uri', 'sweep-windup', e)?.kind).toBe('band');
    expect(episodeShapeFor('uri', 'downslash-windup', e)?.kind).toBe('band');
  });

  it('suriel:sweep-windup = 帯 / ring-spin-windup = 自分中心円 / ring-beam-windup = 帯(ring2で2本)', () => {
    const e = mkEnemy({ type: 'suriel', x: 0, y: 0, width: 40, height: 40, aiFromX: 20, aiFromY: 20, aiTargetX: 220, aiTargetY: 20 });
    expect(episodeShapeFor('suriel', 'sweep-windup', e)?.kind).toBe('band');
    const spin = episodeShapeFor('suriel', 'ring-spin-windup', e);
    expect(spin).toEqual({ kind: 'circle', cx: 20, cy: 20, radius: expect.any(Number) });
    const beam1 = episodeShapeFor('suriel', 'ring-beam-windup', e);
    expect(beam1?.kind).toBe('band');
    if (beam1?.kind === 'band') expect(beam1.bands.length).toBe(1);
    const beam2 = episodeShapeFor('suriel', 'ring-beam-windup', { ...e, ring2X: 400, ring2Y: 20 });
    expect(beam2?.kind).toBe('band');
    if (beam2?.kind === 'band') expect(beam2.bands.length).toBe(2); // 検収是正・中1: Phase2は2本
  });

  it('giantbat:g-stomp-windup = 自分中心円(gStompRadius優先、無ければフォールバック定数)', () => {
    const e = mkEnemy({ x: 0, y: 0, width: 40, height: 40 });
    const noRadius = episodeShapeFor('giantbat', 'g-stomp-windup', e);
    expect(noRadius).toEqual({ kind: 'circle', cx: 20, cy: 20, radius: GIANT_STOMP_RADIUS });
    const withRadius = episodeShapeFor('giantbat', 'g-stomp-windup', { ...e, gStompRadius: 999 });
    expect(withRadius).toEqual({ kind: 'circle', cx: 20, cy: 20, radius: 999 });
  });

  it('giantbat:g-sweep/g-slam/g-tailslam-windup = 帯(半幅は各定数)', () => {
    const e = mkEnemy({ x: 0, y: 0, width: 40, height: 40, aiFromX: 20, aiFromY: 20, aiTargetX: 220, aiTargetY: 20 });
    const sweep = episodeShapeFor('giantbat', 'g-sweep-windup', e);
    expect(sweep?.kind).toBe('band');
    if (sweep?.kind === 'band') expect(sweep.bands[0].halfWidth).toBe(GIANT_SWEEP_HALF_WIDTH);
    const slam = episodeShapeFor('giantbat', 'g-slam-windup', e);
    if (slam?.kind === 'band') expect(slam.bands[0].halfWidth).toBe(GIANT_SLAM_HALF_WIDTH);
    const tail = episodeShapeFor('giantbat', 'g-tailslam-windup', e);
    if (tail?.kind === 'band') expect(tail.bands[0].halfWidth).toBe(GLEN_TAILSLAM_HALF_WIDTH);
  });

  it('giantbat:g-glide-windup = 帯(半幅40・enemy.x/yフォールバック+width/2ぶんのオフセット)', () => {
    const e = mkEnemy({ x: 100, y: 100, width: 40, height: 40 }); // aiFromX/Y未設定→enemy.x/yへフォールバック
    const glide = episodeShapeFor('giantbat', 'g-glide-windup', e);
    expect(glide?.kind).toBe('band');
    if (glide?.kind === 'band') {
      expect(glide.bands[0]).toMatchObject({ fx: 120, fy: 120, halfWidth: GIANT_GLIDE_HALF_WIDTH });
    }
  });

  it('giantbat:g-dive-windup = 円(aiTarget+width/2, radius=GIANT_DIVE_RADIUS)', () => {
    const e = mkEnemy({ x: 0, y: 0, width: 40, height: 40, aiTargetX: 300, aiTargetY: 300 });
    const dive = episodeShapeFor('giantbat', 'g-dive-windup', e);
    expect(dive).toEqual({ kind: 'circle', cx: 320, cy: 320, radius: GIANT_DIVE_RADIUS });
  });

  it('giantbat:g-wing-windup = 自分中心円(aiFromX/Y優先)', () => {
    const e = mkEnemy({ x: 0, y: 0, width: 40, height: 40, aiFromX: 55, aiFromY: 66 });
    const wing = episodeShapeFor('giantbat', 'g-wing-windup', e);
    expect(wing).toEqual({ kind: 'circle', cx: 55, cy: 66, radius: GIANT_WING_RADIUS });
  });

  it('giantbat:g-trishot-windup = 帯2本(左右に開いた角度・半幅GIANT_TRISHOT_HALF_WIDTH)', () => {
    const e = mkEnemy({ x: 0, y: 0, width: 40, height: 40, aiFromX: 20, aiFromY: 20, aiTargetX: 220, aiTargetY: 20 });
    const s = episodeShapeFor('giantbat', 'g-trishot-windup', e);
    expect(s?.kind).toBe('band');
    if (s?.kind === 'band') {
      expect(s.bands.length).toBe(2);
      expect(s.bands[0].halfWidth).toBe(GIANT_TRISHOT_HALF_WIDTH);
      expect(s.bands[1].halfWidth).toBe(GIANT_TRISHOT_HALF_WIDTH);
      // 中央(元の狙い線)には乗らない=左右に開いている
      expect(s.bands[0].ty).not.toBeCloseTo(20, 3);
    }
  });

  it('giantbat:g-reach-windup = gReachShotsの発射済み本を全て列挙(数値複製なし)', () => {
    const e = mkEnemy({
      x: 0, y: 0, width: 40, height: 40, aiTargetX: 200, aiTargetY: 0,
      gReachShots: [
        { t0: 0, ax: 0, ay: 0, avx: 0, avy: 0, idx: 0, fired: true, fx: 20, fy: 20, tx: 220, ty: 20 },
        { t0: 100, ax: 0, ay: 0, avx: 0, avy: 0, idx: 1, fired: false }, // 未発射=対象外
      ],
    });
    const s = episodeShapeFor('giantbat', 'g-reach-windup', e);
    expect(s?.kind).toBe('band');
    if (s?.kind === 'band') {
      expect(s.bands.length).toBe(1);
      expect(s.bands[0]).toMatchObject({ fx: 20, fy: 20, tx: 220, ty: 20, halfWidth: GLEN_REACH_HALF_WIDTH });
    }
    // 1本も発射していない(空配列)= aiTarget基準の1本へフォールバック
    const empty = episodeShapeFor('giantbat', 'g-reach-windup', { ...e, gReachShots: [] });
    expect(empty?.kind).toBe('band');
    if (empty?.kind === 'band') expect(empty.bands.length).toBe(1);
  });
});

describe('episodeShapeFor: 対象外(declared/body-only/不明)はnull', () => {
  it('declared州(bounty/thor)はnull(counterReachShapeForが別に解決する)', () => {
    expect(episodeShapeFor('thor', 'issen-windup', mkEnemy({ type: 'thor' }))).toBeNull();
    expect(episodeShapeFor('bounty-melee', 'bm-whip360-windup', mkEnemy({ type: 'bounty-melee' }))).toBeNull();
  });
  it('body-only州(giantbat:g-bolt-windup)はnull', () => {
    expect(episodeShapeFor('giantbat', 'g-bolt-windup', mkEnemy())).toBeNull();
  });
  it('未知の州はnull', () => {
    expect(episodeShapeFor('giantbat', 'not-a-real-state', mkEnemy())).toBeNull();
  });
});

describe('episodeAxisFor: 軸退化(自分中心)は§1-2の一般規則どおり全from=to', () => {
  it('g-stomp/g-wing/suriel:ring-spinは軸が退化(from===to)', () => {
    const e = mkEnemy({ x: 0, y: 0, width: 40, height: 40 });
    const stomp = episodeAxisFor('giantbat', 'g-stomp-windup', e);
    expect(stomp.fromX).toBe(stomp.toX);
    expect(stomp.fromY).toBe(stomp.toY);
    const wing = episodeAxisFor('giantbat', 'g-wing-windup', e);
    expect(wing.fromX).toBe(wing.toX);
  });
  it('g-diveは自分中心ではない=軸が退化しないことがある(着地点は本体と別)', () => {
    const e = mkEnemy({ x: 0, y: 0, width: 40, height: 40, aiFromX: 999, aiFromY: 999, aiTargetX: 300, aiTargetY: 300 });
    const dive = episodeAxisFor('giantbat', 'g-dive-windup', e);
    expect(dive).toEqual({ fromX: 999, fromY: 999, toX: 300, toY: 300 });
  });
});
