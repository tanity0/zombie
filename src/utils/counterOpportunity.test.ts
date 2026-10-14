// v0.25.5043: 守護霊の記録の「機会」=カウンターが通る州(宣言表が正)。語尾の概算との食い違いを固定する。
import { describe, it, expect } from 'vitest';
import { isBossCounterOpportunity } from './counterOpportunity';
import type { Enemy } from '../types/game';

const e = (type: string, bossState?: string, aiPhase?: string) =>
  ({ type, bossState, aiPhase } as unknown as Pick<Enemy, 'type' | 'aiPhase' | 'bossState'>);

describe('counterOpportunity: 裏ボス4体/idol/賞金首は宣言表(COUNTER_REACH_DECL)で決める', () => {
  it('走り(thor-dash-move / dash)や休符(idol-rest)は語尾に載らないがカウンターが通る=機会', () => {
    expect(isBossCounterOpportunity(e('thor', 'thor-dash-move'))).toBe(true);
    expect(isBossCounterOpportunity(e('mimir', 'dash'))).toBe(true);
    expect(isBossCounterOpportunity(e('idol', 'idol-rest'))).toBe(true);
    expect(isBossCounterOpportunity(e('bounty-maiko', 'mk-spin'))).toBe(true);
  });
  it('紫(none)と、表に無い溜め(車輪の溜め等)は機会ではない。追跡(chase)も機会ではない', () => {
    expect(isBossCounterOpportunity(e('skadi', 'issen-nihil'))).toBe(false);
    expect(isBossCounterOpportunity(e('mimir', 'wheel-windup'))).toBe(false);
    expect(isBossCounterOpportunity(e('idol', 'idol-snipe-windup'))).toBe(false);
    expect(isBossCounterOpportunity(e('thor', 'chase'))).toBe(false);
  });
  it('表に載る溜めは機会。表を持つ系統の硬直(-recover)はカウンター憲法で接触成立が撤去済み=機会ではない(1技1機会)', () => {
    expect(isBossCounterOpportunity(e('skadi', 'issen-windup'))).toBe(true);
    expect(isBossCounterOpportunity(e('jormungand', 'coil-recover'))).toBe(false);
    expect(isBossCounterOpportunity(e('idol', 'idol-punch-recover'))).toBe(false);
  });
});

describe('counterOpportunity: 天使とフィルは語尾の概算+角のリスト', () => {
  it('語尾に載らないがカウンターできる州(ラフィの薙ぎ/アクラシエルの転移/ジブリールの灯・連射・転移抜け)', () => {
    expect(isBossCounterOpportunity(e('rafi', 'sweep'))).toBe(true);
    expect(isBossCounterOpportunity(e('acrasiel', 'warp-in'))).toBe(true);
    expect(isBossCounterOpportunity(e('jibril', 'lantern'))).toBe(true);
    expect(isBossCounterOpportunity(e('jibril', 'volley'))).toBe(true);
    expect(isBossCounterOpportunity(e('jibril', 'warp-out'))).toBe(true);
  });
  it('ジブリールの転移硬直(warp-recover)はカウンター分岐が無い=機会ではない。語尾の溜め/硬直は機会', () => {
    expect(isBossCounterOpportunity(e('jibril', 'warp-recover'))).toBe(false);
    expect(isBossCounterOpportunity(e('miguel', 'slam-windup'))).toBe(true);
    expect(isBossCounterOpportunity(e('phillboss', 'phill-wingcombo-windup'))).toBe(true);
    expect(isBossCounterOpportunity(e('phillboss', 'phill-wingcombo-recover'))).toBe(true); // 天使/フィルは硬直の分岐が生きている
    expect(isBossCounterOpportunity(e('miguel', 'tate-recover'))).toBe(true);
    expect(isBossCounterOpportunity(e('uri', 'chase'))).toBe(false);
  });
});

describe('counterOpportunity: 城ボス(giantbat)は溜め〜実行を1つの窓(硬直と紫は数えない)', () => {
  it('溜め・実行中・空中は機会、硬直と g-quad-* は機会ではない', () => {
    expect(isBossCounterOpportunity(e('giantbat', undefined, 'g-sweep-windup'))).toBe(true);
    expect(isBossCounterOpportunity(e('giantbat', undefined, 'g-sweep-active'))).toBe(true);
    expect(isBossCounterOpportunity(e('giantbat', undefined, 'g-jump-air'))).toBe(true);
    expect(isBossCounterOpportunity(e('giantbat', undefined, 'g-dash-charge'))).toBe(true);
    expect(isBossCounterOpportunity(e('giantbat', undefined, 'g-sweep-recover'))).toBe(false);
    expect(isBossCounterOpportunity(e('giantbat', undefined, 'g-quad-charge'))).toBe(false);
    expect(isBossCounterOpportunity(e('giantbat', undefined, undefined))).toBe(false);
  });
});
