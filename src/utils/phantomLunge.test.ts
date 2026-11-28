import { describe, it, expect } from 'vitest';
import {
  phantomEscapeStyle, phantomEscapeStyleOf, lungeStyleForShare, phantomEscapeDir, closeInEtaMs, phantomBulletLungeDir,
  DEFAULT_PHANTOM_ESCAPE_STYLE, PHANTOM_ESCAPE_LEAD_MIN_MS, PHANTOM_ESCAPE_LEAD_MAX_MS,
  bulletEtaMs, bulletPlanRates, pickBulletPlan, DEFAULT_BULLET_PLAN_RATES,
} from './phantomLunge';
import type { HabitEpisode } from './habitEpisode';

const ep = (pressOfs: number | null, lg?: 0 | 1 | 2 | 3): HabitEpisode =>
  ({ posA: 50, posB: 0, sub: 0, pressOfs, ctxHp: 0, ctxHit: 0, seq: 1, ...(lg === undefined ? {} : { lg }) });

describe('幻影の踏み込み回避(LUNGE_DODGE §4)', () => {
  it('記録が無い/少ない人格は既定(抜ける50%・外・250ms)', () => {
    expect(phantomEscapeStyle(undefined)).toEqual(DEFAULT_PHANTOM_ESCAPE_STYLE);
    expect(phantomEscapeStyle({ 'a:b': [ep(-200, 1), ep(-200, 1)] })).toEqual(DEFAULT_PHANTOM_ESCAPE_STYLE);
    // 押していない・lg の無いコマは数えない
    expect(phantomEscapeStyle({ 'a:b': [ep(null), ep(-100), ep(-200, 1), ep(-150, 2)] })).toEqual(DEFAULT_PHANTOM_ESCAPE_STYLE);
  });
  it('記録を持つ人格は、その人の抜けの割合・横の割合・押下の中央値を写す', () => {
    const st = phantomEscapeStyle({
      'x:windup': [ep(-300, 1), ep(-200, 2), ep(-100, 3)],
      'y:windup': [ep(-250, 1), ep(-50, 0)],
    });
    expect(st.fromRecords).toBe(true);
    expect(st.chance).toBeCloseTo(3 / 5);
    expect(st.sideFrac).toBeCloseTo(1 / 3);
    expect(st.leadMs).toBe(250); // 300/200/250 の中央値
  });
  it('先読みは120〜400msに収める', () => {
    expect(phantomEscapeStyle({ k: [ep(-1000, 1), ep(-900, 1), ep(-800, 1)] }).leadMs).toBe(PHANTOM_ESCAPE_LEAD_MAX_MS);
    expect(phantomEscapeStyle({ k: [ep(100, 1), ep(50, 1), ep(0, 1)] }).leadMs).toBe(PHANTOM_ESCAPE_LEAD_MIN_MS);
  });
  it('抜ける向き: 外=プレイヤーから離れる / 横=その垂直', () => {
    const style = { ...DEFAULT_PHANTOM_ESCAPE_STYLE, sideFrac: 0.5 };
    expect(phantomEscapeDir(style, 0.9, 100, 0, 0, 0, 1)).toEqual({ x: 1, y: 0 });
    const side = phantomEscapeDir(style, 0.1, 100, 0, 0, 0, 1)!;
    expect(side.x).toBeCloseTo(0); expect(Math.abs(side.y)).toBeCloseTo(1);
    expect(phantomEscapeDir(style, 0.9, 0, 0, 0, 0, 1)).toBeNull();
  });
  it('届くまでの予測時間', () => {
    expect(closeInEtaMs(304, 200, 104)).toBe(1000);
    expect(closeInEtaMs(50, 200, 104)).toBe(0);
    expect(closeInEtaMs(300, 0, 104)).toBe(Infinity);
  });
  describe('弾', () => {
    // 右へ 800px/s で飛ぶ 8px の弾。幻影(半径24・歩き130px/s)は弾の線上 x=200。
    const bullet = (x: number, yOff: number) => ({ x: x - 4, y: yOff - 4, width: 8, height: 8, speed: 800, direction: { x: 1, y: 0 } });
    it('歩きで外れ切れない近さなら、線から外れる向きへ踏み込む', () => {
      const d = phantomBulletLungeDir(200, 0, 24, 130, 30, 90, bullet(100, 2))!; // 着弾0.125秒・弾は少し下(+y)を通る
      expect(d).not.toBeNull();
      expect(d.x).toBeCloseTo(0);
      expect(d.y).toBeLessThan(0); // 自分は弾の線より上(-y)にいる→上へ
    });
    it('遠い弾(歩きで外れ切れる)は踏み込まない', () => {
      expect(phantomBulletLungeDir(200, 0, 24, 130, 30, 90, bullet(-400, 0))).toBeNull();
    });
    it('もう間に合わない弾・当たらない弾・通り過ぎた弾は踏み込まない', () => {
      expect(phantomBulletLungeDir(200, 0, 24, 130, 30, 90, bullet(190, 0))).toBeNull();
      expect(phantomBulletLungeDir(200, 0, 24, 130, 30, 90, bullet(100, 60))).toBeNull();
      expect(phantomBulletLungeDir(200, 0, 24, 130, 30, 90, bullet(260, 0))).toBeNull();
    });
  });
  it('オンラインの人は共有の要約(lungeStyle)を、無ければコマを、どちらも無ければ既定を使う', () => {
    expect(phantomEscapeStyleOf({ lungeStyle: { chance: 0.8, sideFrac: 0.5, leadMs: 300, n: 5 } }))
      .toEqual({ chance: 0.8, sideFrac: 0.5, leadMs: 300, fromRecords: true, n: 5 });
    // 要約のコマ数が足りなければ使わない
    expect(phantomEscapeStyleOf({ lungeStyle: { chance: 0.8, sideFrac: 0.5, leadMs: 300, n: 2 } })).toEqual(DEFAULT_PHANTOM_ESCAPE_STYLE);
    expect(phantomEscapeStyleOf(undefined)).toEqual(DEFAULT_PHANTOM_ESCAPE_STYLE);
    // 送る側: 記録が足りなければ載せない / 足りれば要約だけ
    expect(lungeStyleForShare({ k: [ep(-200, 1)] })).toBeUndefined();
    expect(lungeStyleForShare({ k: [ep(-300, 1), ep(-200, 2), ep(-100, 3)] })).toEqual({ chance: 2 / 3, sideFrac: 0.5, leadMs: 250, n: 3 });
  });
});

describe('GHOST_BOSS.md v10: 弾への対処(振って返す/避ける/食らう)を人格の記録の割合で決める', () => {
  it('A3: 弾の技の n 重み付き平均 → 無ければ表の全部 → それも無ければ叩き台', () => {
    const t = {
      'b1': { n: 10, counterRate: 0.5, hitRate: 0.1 },
      'b2': { n: 30, counterRate: 0.1, hitRate: 0.3 },
      'melee': { n: 100, counterRate: 0.9, hitRate: 0 },
    };
    const r = bulletPlanRates(t, ['b1', 'b2']);
    expect(r.counter).toBeCloseTo((0.5 * 10 + 0.1 * 30) / 40);
    expect(r.take).toBeCloseTo((0.1 * 10 + 0.3 * 30) / 40);
    expect(r.dodge).toBeCloseTo(1 - r.counter - r.take);
    // 弾の技が無い → 表の全部
    const all = bulletPlanRates(t, ['none']);
    expect(all.counter).toBeCloseTo((0.5 * 10 + 0.1 * 30 + 0.9 * 100) / 140);
    // 表が空 → 叩き台
    expect(bulletPlanRates({}, ['b1'])).toEqual(DEFAULT_BULLET_PLAN_RATES);
    expect(bulletPlanRates(undefined, ['b1'])).toEqual(DEFAULT_BULLET_PLAN_RATES);
    // counter+take>1 → dodge は0(負にしない)
    expect(bulletPlanRates({ x: { n: 1, counterRate: 0.8, hitRate: 0.5 } }, ['x']).dodge).toBe(0);
  });
  it('固定の先人(斬=打ち返し75%・食らう0%)は 打ち返し75/避け25', () => {
    const r = bulletPlanRates({ k: { n: 20, counterRate: 0.75, hitRate: 0 } }, ['k']);
    expect(r).toEqual({ counter: 0.75, take: 0, dodge: 0.25 });
  });
  it('引き順: counter → take → dodge', () => {
    const rates = { counter: 0.3, take: 0.2, dodge: 0.5 };
    expect(pickBulletPlan(rates, 0)).toBe('counter');
    expect(pickBulletPlan(rates, 0.29)).toBe('counter');
    expect(pickBulletPlan(rates, 0.3)).toBe('take');
    expect(pickBulletPlan(rates, 0.49)).toBe('take');
    expect(pickBulletPlan(rates, 0.5)).toBe('dodge');
    expect(pickBulletPlan({ counter: 0.8, take: 0.5, dodge: 0 }, 0.99)).toBe('take');
  });
  it('bulletEtaMs: このままだと当たる弾だけ着弾までの時間、外れる/通り過ぎた/速さ0は null', () => {
    const p = { x: -5, y: -5, width: 10, height: 10, speed: 500, direction: { x: 1, y: 0 } };
    expect(bulletEtaMs(250, 0, 20, p)).toBeCloseTo(500); // 250px ÷ 500px/s
    expect(bulletEtaMs(250, 100, 20, p)).toBeNull();     // 線から外れている
    expect(bulletEtaMs(-50, 0, 20, p)).toBeNull();       // 後ろ=通り過ぎた
    expect(bulletEtaMs(250, 0, 20, { ...p, speed: 0 })).toBeNull();
  });
});
