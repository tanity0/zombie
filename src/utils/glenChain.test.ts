import { describe, it, expect } from 'vitest';
import {
  GLEN_CHAIN, GLEN_SLOT_COUNT, GLEN_TAIL_SLOT, GLEN_REMOVAL, GLEN_VISIBLE_BY_COUNT,
  glenPartCount, GLEN_P2_HP_FRAC,
  pushGlenTrail, sampleGlenTrail, glenChainDistances, GLEN_TRAIL_MAX,
  shouldGlenVolley, glenVolleyShots, GLEN_VOLLEY_SAFE_PX,
  type GlenTrailPoint,
} from './glenChain';
import type { Enemy } from '../types/game';

describe('glenChain — 台帳の不変条件', () => {
  it('除去順は全スロットを1度ずつ覆い、尾が最後', () => {
    expect([...GLEN_REMOVAL].sort((a, b) => a - b)).toEqual(GLEN_CHAIN.map((_, s) => s));
    expect(GLEN_REMOVAL[GLEN_REMOVAL.length - 1]).toBe(GLEN_TAIL_SLOT);
  });
  it('可視表: count個のスロットを返し、尾は最後まで残る', () => {
    for (let c = 0; c <= GLEN_SLOT_COUNT; c++) {
      expect(GLEN_VISIBLE_BY_COUNT[c]).toHaveLength(c);
      if (c >= 1) expect(GLEN_VISIBLE_BY_COUNT[c]).toContain(GLEN_TAIL_SLOT);
    }
  });
  it('glenPartCount: 第二形態しきい値で9、0で0', () => {
    expect(glenPartCount(GLEN_P2_HP_FRAC)).toBe(GLEN_SLOT_COUNT);
    expect(glenPartCount(0)).toBe(0);
  });
});

describe('glenChain — 軌跡(蛇式)', () => {
  it('pushGlenTrail: 2px未満の移動は追加しない・上限で先頭から捨てる', () => {
    const t: GlenTrailPoint[] = [];
    pushGlenTrail(t, 0, 0);
    pushGlenTrail(t, 1, 0); // 2px未満
    expect(t).toHaveLength(1);
    for (let i = 0; i < GLEN_TRAIL_MAX + 50; i++) pushGlenTrail(t, i * 2 + 10, 0);
    expect(t.length).toBe(GLEN_TRAIL_MAX);
  });
  it('sampleGlenTrail: 直線軌跡なら距離ぶんきっかり遡る', () => {
    const t: GlenTrailPoint[] = [];
    for (let x = 0; x <= 100; x += 2) pushGlenTrail(t, x, 0);
    const p = sampleGlenTrail(t, 100, 0, 30);
    expect(p.x).toBeCloseTo(70, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });
  it('sampleGlenTrail: 軌跡が足りない分は最古の向きへ直線延長(無ければ右=+x)', () => {
    const short: GlenTrailPoint[] = [];
    const p = sampleGlenTrail(short, 10, 5, 40);
    expect(p.x).toBeCloseTo(50, 6); // 既定方向(1,0)へ延長
    expect(p.y).toBeCloseTo(5, 6);
  });
});

describe('glenChain — 間隔式(ゴールデン値=v0.25.3025時点のsyncGlenParts実装から手計算)', () => {
  it('現行式と同値: 初項 bodyHalfW*0.15 + w*0.5*0.4、以降 prevHalfW + w/2 − min(prevHalfW*2, w)*0.4', () => {
    // bodyHalfW=60, 幅列 [28.6, 24.4](砲身/箱を交互)の先頭3つ:
    //   d0 = 9 + 28.6*0.2 = 14.72
    //   d1 = d0 + (14.3 + 12.2 − min(28.6, 24.4)*0.4) = 14.72 + 16.74 = 31.46
    //   d2 = d1 + (12.2 + 14.3 − min(24.4, 28.6)*0.4) = 31.46 + 16.74 = 48.20
    const widths = [28.6, 24.4, 28.6];
    const d = glenChainDistances(60, [0, 1, 2], (s) => widths[s]);
    expect(d[0]).toBeCloseTo(14.72, 2);
    expect(d[1]).toBeCloseTo(31.46, 2);
    expect(d[2]).toBeCloseTo(48.2, 2);
  });
  it('中央のスロットが欠けると残りは詰まる(現行挙動)', () => {
    const widthOf = () => 20;
    const full = glenChainDistances(60, [0, 1, 2], widthOf);
    const gapped = glenChainDistances(60, [0, 2], widthOf);
    expect(gapped[1]).toBeLessThan(full[2]); // slot2 の距離が「slot1 欠け」で縮む
  });
});

const mkGlen = (over: Partial<Enemy> = {}): Enemy => ({
  id: 'glen', type: 'giantbat', x: 0, y: 0, width: 120, height: 120,
  health: 30, maxHealth: 100, speed: 70, damage: 19, experienceValue: 0,
  isStoryBoss: true, storyBossVariant: 'stage-7',
  ...over,
} as Enemy);

describe('glenChain — 胴体弾(社長裁定 1a/安全半径/技中は撃たない)', () => {
  const straightTrail = (): GlenTrailPoint[] => {
    // 東(+x)へ歩いてきた軌跡。終端=本体の足元(60,120)に一致させる(=mkGlenのfootと同じ)。
    const t: GlenTrailPoint[] = [];
    for (let x = -600; x <= 60; x += 2) pushGlenTrail(t, x, 120);
    return t;
  };

  it('shouldGlenVolley: 第二形態・技なし・CD満了のときだけ真。種付け前(lastAt無し)は偽', () => {
    expect(shouldGlenVolley(true, undefined, 1000, 5000, 3000)).toBe(true);
    expect(shouldGlenVolley(false, undefined, 1000, 5000, 3000)).toBe(false); // 第一形態
    expect(shouldGlenVolley(true, 'g-stomp-windup', 1000, 5000, 3000)).toBe(false); // 技の予告中(裁定3)
    expect(shouldGlenVolley(true, undefined, 3000, 5000, 3000)).toBe(false); // CD未了
    expect(shouldGlenVolley(true, undefined, undefined, 5000, 3000)).toBe(false); // 種付け前
  });

  it('可視の胴体パーツ×2発。尾からは撃たない', () => {
    const boss = mkGlen({ health: 60 }); // hpFrac=0.6 → 9スロット全可視(胴体8+尾)
    const shots = glenVolleyShots(boss, straightTrail(), 100000, 100000);
    expect(shots).toHaveLength(8 * 2);
  });

  it('HPが減るとパーツと同じだけ弾も減り、尾だけの区間は0発', () => {
    const boss1 = mkGlen({ health: 19 }); // hpFrac 0.19 → count=3 → 胴体2+尾(hp20はfloat丸めでcount4になる)
    expect(glenVolleyShots(boss1, straightTrail(), 100000, 100000)).toHaveLength(2 * 2);
    const boss2 = mkGlen({ health: 5 }); // hpFrac 0.05 → count=1 → 尾のみ
    expect(glenVolleyShots(boss2, straightTrail(), 100000, 100000)).toHaveLength(0);
  });

  it('プレイヤーに近すぎるパーツ(80px未満)は撃たない(背後湧き対策)', () => {
    const boss = mkGlen({ health: 60 });
    const trail = straightTrail();
    const far = glenVolleyShots(boss, trail, 100000, 100000);
    // 列の直上(本体の少し後ろ)にプレイヤーを置くと、その近傍のパーツぶんだけ減る。
    const near = glenVolleyShots(boss, trail, 60 - 40, 120);
    expect(near.length).toBeLessThan(far.length);
    for (const s of near) {
      expect(Math.hypot(s.ox - (60 - 40), s.oy - 120)).toBeGreaterThanOrEqual(GLEN_VOLLEY_SAFE_PX);
    }
  });

  it('弾の方向は有限値(NaN無し)で、進行方向に対して左右対称のV字', () => {
    const boss = mkGlen({ health: 60 });
    const shots = glenVolleyShots(boss, straightTrail(), 100000, 100000);
    for (const s of shots) {
      expect(Number.isFinite(s.tx)).toBe(true);
      expect(Number.isFinite(s.ty)).toBe(true);
      const dx = s.tx - s.ox, dy = s.ty - s.oy;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(1);
      // 東進の列 → 前方=+x。±45°なので dx>0 かつ |dx|≈|dy|。
      expect(dx).toBeGreaterThan(0);
      expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(1e-6);
    }
    // 左右1発ずつ=+yと−yが同数。
    const up = shots.filter(s => s.ty < s.oy).length;
    expect(up).toBe(shots.length / 2);
  });

  it('軌跡が空でも発射できる(直線延長フォールバック・NaN無し)', () => {
    const boss = mkGlen({ health: 60 });
    const shots = glenVolleyShots(boss, [], 100000, 100000);
    expect(shots.length).toBeGreaterThan(0);
    for (const s of shots) {
      expect(Number.isFinite(s.tx) && Number.isFinite(s.ty)).toBe(true);
    }
  });
});
