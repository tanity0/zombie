// research/TELEGRAPH_FIXES.md の描画側の位相(E21・C04・N06・N12・E05b): ②出る=溜め開始(prog=0) ③消え切る=当たる(prog=1)。
import { describe, it, expect } from 'vitest';
import {
  windupProgFromRemain, windupProgFromElapsed, eggBlastProg, phantomTurretBlastProg, bossFireRimAlpha,
} from './telegraphFixes';
import { ANGEL_ACRASIEL_TUNING as AC_T } from './angelScript';
import { HIDDEN_MIMIR_TUNING as HB_MI } from './hiddenBossScript';
import { EGG_FUSE_MS, dueArmedEggs } from '../world/mines';
import { TURRET_EXPLOSION_RADIUS, phantomTurretBlastRadius, PHANTOM_TURRET_TELEGRAPH_MS } from './turretSpec';
import { SENSOR_MINE_FUSE_MS } from './sensorMine';

describe('E21 アクラシエルの凝視の線', () => {
  it('溜めの頭で0・撃つ瞬間(残り0)で1', () => {
    expect(windupProgFromRemain(AC_T.gaze.windup, AC_T.gaze.windup)).toBe(0);
    expect(windupProgFromRemain(0, AC_T.gaze.windup)).toBe(1);
    expect(windupProgFromRemain(AC_T.gaze.windup / 2, AC_T.gaze.windup)).toBeCloseTo(0.5, 9);
  });
});

describe('C04 ミーミルの車輪', () => {
  it('tW=0 で0・tW=W.windupMs で1', () => {
    const W = HB_MI.wheel;
    expect(windupProgFromElapsed(0, W.windupMs)).toBe(0);
    expect(windupProgFromElapsed(W.windupMs, W.windupMs)).toBe(1);
  });
});

describe('N06 緑卵の起爆の円', () => {
  it('アームで0・爆ぜる tick(dueArmedEggs が拾う時刻)で1・アーム前は描かない', () => {
    const armedAt = 4000;
    expect(eggBlastProg(armedAt, armedAt, EGG_FUSE_MS)).toBe(0);
    expect(eggBlastProg(undefined, armedAt, EGG_FUSE_MS)).toBeNull();
    const egg = { type: 'mine' as const, armedAt, id: 'e', footX: 0, footY: 0, height: 20 };
    const tBlast = armedAt + EGG_FUSE_MS;
    expect(dueArmedEggs([egg] as never[], tBlast - 1)).toHaveLength(0);
    expect(dueArmedEggs([egg] as never[], tBlast)).toHaveLength(1);
    expect(eggBlastProg(armedAt, tBlast, EGG_FUSE_MS)).toBe(1);
    expect(eggBlastProg(armedAt, tBlast - 1, EGG_FUSE_MS)!).toBeLessThan(1);
  });
});

describe('N12 幻影のタレットの消滅爆発', () => {
  const createdAt = 100000, duration = 12000;
  it('prog(createdAt+duration)=1・prog(createdAt+duration−T)=0・それより前は描かない', () => {
    const T = PHANTOM_TURRET_TELEGRAPH_MS;
    expect(T).toBe(SENSOR_MINE_FUSE_MS);
    expect(phantomTurretBlastProg(createdAt, duration, createdAt + duration, T)).toBe(1);
    expect(phantomTurretBlastProg(createdAt, duration, createdAt + duration - T, T)).toBe(0);
    expect(phantomTurretBlastProg(createdAt, duration, createdAt + duration - T - 1, T)).toBeNull();
  });
  it('半径=置いた幻影のビルド(倍率)・幻影を引けなければ倍率1(プレイヤーに戻さない)', () => {
    expect(phantomTurretBlastRadius(null)).toBe(TURRET_EXPLOSION_RADIUS);
    expect(phantomTurretBlastRadius(1.5)).toBe(TURRET_EXPLOSION_RADIUS * 1.5);
    // プレイヤー本人のエクスプローダーは引数に入らない=描く半径も判定の半径も変わらない(式の形で固定)。
    expect(phantomTurretBlastRadius.length).toBe(1);
  });
});

describe('E05b ジブリルのランタン火の起動後の紫の縁', () => {
  it('起動から在り、expireAt でちょうど0・起動前は0', () => {
    const a = 1000, x = 3000, fade = 200;
    expect(bossFireRimAlpha(a, x, a - 1, fade)).toBe(0);
    expect(bossFireRimAlpha(a, x, a, fade)).toBe(1);
    expect(bossFireRimAlpha(a, x, x - fade, fade)).toBe(1);
    expect(bossFireRimAlpha(a, x, x - fade / 2, fade)).toBeGreaterThan(0);
    expect(bossFireRimAlpha(a, x, x - 0.001, fade)).toBeLessThan(0.001);
    expect(bossFireRimAlpha(a, x, x, fade)).toBe(0);
  });
});
