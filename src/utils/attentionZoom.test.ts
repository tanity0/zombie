import { describe, expect, it } from 'vitest';
import {
  ATTENTION_SMALL_ZOOM_IN, ATTENTION_SMALL_TYPES,
  attentionZoomFor, attentionZoomEnvelope, findAttentionSubject,
} from './attentionZoom';
import { ENEMY_STATS, isBossType } from './enemyUtils';
import { isLargeForZoom } from './cameraZoom';
import type { EnemyType } from '../types/game';

const of = (type: EnemyType) => ({ type, width: ENEMY_STATS[type].width, height: ENEMY_STATS[type].height });

describe('attentionZoomFor(小さめの相手だけ少し寄る)', () => {
  it('幻影(guardian-phantom・孫悟空も同じ型)は寄る', () => {
    expect(attentionZoomFor(of('guardian-phantom'))).toBe(ATTENTION_SMALL_ZOOM_IN);
  });

  it('大型(isLargeForZoom)は1体も寄らない', () => {
    for (const t of Object.keys(ENEMY_STATS) as EnemyType[]) {
      if (isLargeForZoom(t)) expect(attentionZoomFor(of(t)), t).toBeUndefined();
    }
  });

  it('対象なし/ボス級でない/変異塊の代理は寄らない', () => {
    expect(attentionZoomFor(null)).toBeUndefined();
    expect(attentionZoomFor(undefined)).toBeUndefined();
    expect(attentionZoomFor(of('zombie'))).toBeUndefined();
    expect(attentionZoomFor(of('lab-crawler'))).toBeUndefined();
  });

  it('背の高い/絵の大きいボス(英雄・フィル・天使・アイドル・賞金首)は寄らない', () => {
    for (const t of ['mutant-hero', 'mutant-liberty', 'mutant-astro', 'mutant-wraith', 'phillboss', 'miguel', 'rafi', 'suriel', 'idol',
      'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
      expect(attentionZoomFor(of(t)), t).toBeUndefined();
    }
  });

  it('一覧はボス級だけ・大型を含まない', () => {
    for (const t of ATTENTION_SMALL_TYPES) {
      expect(isBossType(t), t).toBe(true);
      expect(isLargeForZoom(t), t).toBe(false);
    }
  });
});

describe('findAttentionSubject(出現の紹介の注目点にいるボス)', () => {
  const gp = { type: 'guardian-phantom' as EnemyType, x: 100, y: 100, width: 40, height: 56, health: 100 };
  const zombie = { type: 'zombie' as EnemyType, x: 100, y: 100, width: 40, height: 40, health: 100 };
  it('注目点の幻影を拾う', () => {
    expect(findAttentionSubject([zombie, gp], 120, 128)?.type).toBe('guardian-phantom');
  });
  it('遠い・死んでいる・ボス級でないは拾わない', () => {
    expect(findAttentionSubject([gp], 1000, 1000)).toBeNull();
    expect(findAttentionSubject([{ ...gp, health: 0 }], 120, 128)).toBeNull();
    expect(findAttentionSubject([zombie], 120, 120)).toBeNull();
  });
});

describe('attentionZoomEnvelope(パンと同じ smoothstep の包絡線)', () => {
  it('in で 0→1、保持、out で 1→0', () => {
    expect(attentionZoomEnvelope(0, 300, 1000, 300)).toBe(0);
    expect(attentionZoomEnvelope(150, 300, 1000, 300)).toBeCloseTo(0.5, 5);
    expect(attentionZoomEnvelope(300, 300, 1000, 300)).toBe(1);
    expect(attentionZoomEnvelope(800, 300, 1000, 300)).toBe(1);
    expect(attentionZoomEnvelope(1150, 300, 1000, 300)).toBeCloseTo(0.5, 5);
    expect(attentionZoomEnvelope(1300, 300, 1000, 300)).toBe(0);
  });
  it('出だしと終わりは速度0(慣性つき)', () => {
    expect(attentionZoomEnvelope(3, 300, 1000, 300)).toBeLessThan(0.001);
    expect(1 - attentionZoomEnvelope(1003, 300, 1000, 300)).toBeLessThan(0.001);
  });
});
