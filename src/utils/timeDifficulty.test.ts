// 社長指示v0.25.3328「時間でも距離の強さ軸に合わせにいく(8:00ピーク・レア率はエリア固定)」の不変条件。
import { describe, it, expect } from 'vitest';
import { TIME_DIFFICULTY_PEAK_MS, timeVirtualArea, effectiveDifficultyArea, lerpAreaTable } from './timeDifficulty';
import { spawnEnemyAt, createEnemyProjectile } from './enemyUtils';
import type { Player } from '../types/game';

const player = { x: 100, y: 0, width: 24, height: 24 } as Player;

describe('timeVirtualArea / effectiveDifficultyArea', () => {
  it('0:00=0 / 4:00=2(中間) / 8:00以降=4(ピーク)', () => {
    expect(timeVirtualArea(0)).toBe(0);
    expect(timeVirtualArea(TIME_DIFFICULTY_PEAK_MS / 2)).toBeCloseTo(2, 5);
    expect(timeVirtualArea(TIME_DIFFICULTY_PEAK_MS)).toBe(4);
    expect(timeVirtualArea(TIME_DIFFICULTY_PEAK_MS * 2)).toBe(4); // ピーク後は頭打ち
    expect(timeVirtualArea(-1000)).toBe(0); // 負時刻ガード
  });
  it('実効エリア=max(実エリア, 仮想エリア)=深く行けば自ら早められる', () => {
    // 3:00 時点の仮想エリアは 1.5。エリア3に居ればエリア3が勝つ。
    expect(effectiveDifficultyArea(0, 180000)).toBeCloseTo(1.5, 5);
    expect(effectiveDifficultyArea(3, 180000)).toBe(3);
  });
});

describe('lerpAreaTable', () => {
  it('整数点はテーブル値そのまま・中間は線形補間', () => {
    const t = [1.0, 1.2, 1.45, 1.75, 2.1];
    expect(lerpAreaTable(t, 0)).toBe(1.0);
    expect(lerpAreaTable(t, 4)).toBe(2.1);
    expect(lerpAreaTable(t, 2.5)).toBeCloseTo((1.45 + 1.75) / 2, 5);
    expect(lerpAreaTable(t, 5)).toBe(2.1); // 範囲外クランプ
  });
});

describe('敵ステータスへの時間軸(spawn時に焼き込み)', () => {
  it('t=0 は従来と完全一致(初期地=基礎値)', () => {
    const e = spawnEnemyAt('zombie', 0, 0, 0);
    const deep = spawnEnemyAt('zombie', 8000, 0, 0);
    expect(deep.speed).toBeCloseTo(e.speed * 2.0, 5);
  });
  it('8:00の初期地個体は最深部個体と同じ強さ(速度×2.0・倍率2.1)・ランクもdanger', () => {
    const early = spawnEnemyAt('zombie', 0, 0, 0);
    const late = spawnEnemyAt('zombie', 0, 0, TIME_DIFFICULTY_PEAK_MS);
    expect(late.speed).toBeCloseTo(early.speed * 2.0, 5);
    // 色付き抽選のHP倍率が乗る個体を避けられないため、無色前提の比較は倍率フィールドで見る。
    expect(late.difficultyMultiplier).toBeCloseTo(2.1 * (late.colorTier ? { blue: 1.5, purple: 2, red: 3 }[late.colorTier] : 1), 5);
    expect(late.difficultyRank).toBe('danger');
    expect(early.difficultyRank).toBe('normal');
  });
  it('4:00の初期地個体は中間(エリア2相当=×1.45/速度×1.2)へ迫っている', () => {
    const mid = spawnEnemyAt('zombie', 0, 0, TIME_DIFFICULTY_PEAK_MS / 2);
    const base = spawnEnemyAt('zombie', 0, 0, 0);
    expect(mid.speed).toBeCloseTo(base.speed * 1.2, 5);
    expect(mid.difficultyRank).toBe('elite');
  });
  it('固定強度タイプ(城ボス等)は時間でも不変', () => {
    const early = spawnEnemyAt('giantbat', 0, 0, 0);
    const late = spawnEnemyAt('giantbat', 0, 0, TIME_DIFFICULTY_PEAK_MS);
    expect(late.speed).toBeCloseTo(early.speed, 5);
    expect(late.maxHealth).toBe(early.maxHealth);
  });
  it('敵弾の弾速も個体の湧き時刻で迫る(spawnedAt基準)', () => {
    const early = spawnEnemyAt('plant', 0, 0, 0);
    const late = spawnEnemyAt('plant', 0, 0, TIME_DIFFICULTY_PEAK_MS);
    expect(createEnemyProjectile(late, player).speed)
      .toBeCloseTo(createEnemyProjectile(early, player).speed * 2.0, 5);
  });
});
