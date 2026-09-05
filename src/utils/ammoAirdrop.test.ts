import { describe, it, expect } from 'vitest';
import {
  shouldSpawnAirdrop,
  AIRDROP_MAX_WORLD_DROPS,
  type AirdropTickInput,
} from './ammoAirdrop';

// 決定的rng: キューの値を順に返す。呼び出し超過は即エラー(想定外のMath.random呼び出しを検知)。
const queueRng = (values: number[]): (() => number) => {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error(`queueRng exhausted (call #${i + 1})`);
    return values[i++];
  };
};

const baseInput = (overrides: Partial<AirdropTickInput> = {}): AirdropTickInput => ({
  tutorialStage: false,
  knifeMaster: false,
  gameTime: 100000,
  worldAmmoCount: 0,
  lastAmmoDropAt: 0,
  nextAmmoDropDelayMs: 50000, // 初期化済み扱い(初回ロールを経ずテストする時のデフォルト)
  playerX: 100, playerY: 200, playerWidth: 20, playerHeight: 20,
  boundsWidth: 800, boundsHeight: 600,
  ownedAmmoTypes: ['handgun', 'rifle'],
  equippedAmmo: 'handgun',
  rng: queueRng([]),
  ...overrides,
});

describe('shouldSpawnAirdrop (useGameLoop.ts空輸弾薬の挙動保存切り出し・v0.25.2172)', () => {
  it('初回(nextAmmoDropDelayMs=0)は50-60sの範囲でロールし、経過不足ならspawnしない', () => {
    const r = shouldSpawnAirdrop(baseInput({
      nextAmmoDropDelayMs: 0,
      gameTime: 100000, lastAmmoDropAt: 100000, // 経過0
      rng: queueRng([0]), // delay init only
    }));
    expect(r.nextAmmoDropDelayMs).toBe(50000); // 50000 + 0*10000
    expect(r.spawn).toBeNull();

    const r2 = shouldSpawnAirdrop(baseInput({
      nextAmmoDropDelayMs: 0,
      gameTime: 100000, lastAmmoDropAt: 100000,
      rng: queueRng([0.999999]),
    }));
    expect(r2.nextAmmoDropDelayMs).toBeCloseTo(59999.99, 1); // 50000 + 0.999999*10000 ≈ 60000弱
    expect(r2.spawn).toBeNull();
  });

  it('未経過(gameTime - lastAmmoDropAt <= delay)ならspawnしない・rng追加消費なし', () => {
    const r = shouldSpawnAirdrop(baseInput({
      nextAmmoDropDelayMs: 50000, lastAmmoDropAt: 100000, gameTime: 150000, // diff=50000, ==delay(超過なし)
      rng: queueRng([]), // これ以上rngが呼ばれたら例外=検知漏れの保険
    }));
    expect(r.spawn).toBeNull();
    expect(r.nextAmmoDropDelayMs).toBe(50000); // 変化なし
  });

  it('同時最大1個キャップ: worldAmmoCount >= AIRDROP_MAX_WORLD_DROPS ならspawnしない', () => {
    expect(AIRDROP_MAX_WORLD_DROPS).toBe(1);
    const r = shouldSpawnAirdrop(baseInput({
      worldAmmoCount: 1,
      lastAmmoDropAt: 0, gameTime: 999999, // 経過は十分
      rng: queueRng([]),
    }));
    expect(r.spawn).toBeNull();
  });

  it('チュートリアル中はspawnしない', () => {
    const r = shouldSpawnAirdrop(baseInput({
      tutorialStage: true,
      lastAmmoDropAt: 0, gameTime: 999999,
      rng: queueRng([]),
    }));
    expect(r.spawn).toBeNull();
  });

  it('ナイフマスター所持中はspawnしない', () => {
    const r = shouldSpawnAirdrop(baseInput({
      knifeMaster: true,
      lastAmmoDropAt: 0, gameTime: 999999,
      rng: queueRng([]),
    }));
    expect(r.spawn).toBeNull();
  });

  it('発生時: 配置は1.1-1.6画面(半対角×係数)・方位はrng由来の角度どおり', () => {
    // angle=0.25*2π=π/2(cos=0,sin=1) / dist係数=0.5→1.1+0.5*0.5=1.35
    const r = shouldSpawnAirdrop(baseInput({
      lastAmmoDropAt: 0, gameTime: 999999,
      playerX: 100, playerY: 200, playerWidth: 20, playerHeight: 20,
      boundsWidth: 800, boundsHeight: 600, // halfMax=400
      equippedAmmo: 'handgun',
      rng: queueRng([0.25, 0.5, 0.5, 0.5]), // angle, distMult, 構え70%判定(<0.7→採用), nextDelay
    }));
    expect(r.spawn).not.toBeNull();
    // px = playerCenterX(110) + cos(π/2)*540 ≈ 110
    expect(r.spawn!.x).toBeCloseTo(110, 5);
    // dist = 400*1.35 = 540 / py = playerCenterY(210) + sin(π/2)*540 = 750
    expect(r.spawn!.y).toBeCloseTo(750, 5);
    expect(r.spawn!.ammoType).toBe('handgun');
    expect(r.nextAmmoDropDelayMs).toBe(90000); // 75000 + 0.5*30000
  });

  it('弾種: 構え銃70%成功時はequippedAmmoを採用(所持ランダムのrngは消費しない)', () => {
    const r = shouldSpawnAirdrop(baseInput({
      lastAmmoDropAt: 0, gameTime: 999999,
      equippedAmmo: 'rifle',
      ownedAmmoTypes: ['handgun', 'rifle', 'shotgun'],
      // angle, dist, 70%判定(0.69<0.7→採用・indexは呼ばれない), nextDelay の4回のみ
      rng: queueRng([0, 0, 0.69, 0]),
    }));
    expect(r.spawn!.ammoType).toBe('rifle');
  });

  it('弾種: 70%判定が外れたら所持からランダム(rng*length切り捨てのインデックス)', () => {
    const r = shouldSpawnAirdrop(baseInput({
      lastAmmoDropAt: 0, gameTime: 999999,
      equippedAmmo: 'handgun',
      ownedAmmoTypes: ['handgun', 'rifle', 'shotgun'],
      // angle, dist, 70%判定(0.8≥0.7→外れ), index(0.5→floor(0.5*3)=1→'rifle'), nextDelay
      rng: queueRng([0, 0, 0.8, 0.5, 0]),
    }));
    expect(r.spawn!.ammoType).toBe('rifle');
  });

  it('弾種: 未構え(equippedAmmo未指定)なら70%判定を経ずランダム(&&の短絡でrng消費なし)', () => {
    const r = shouldSpawnAirdrop(baseInput({
      lastAmmoDropAt: 0, gameTime: 999999,
      equippedAmmo: undefined,
      ownedAmmoTypes: ['shotgun', 'rifle'],
      // angle, dist, index(0.9→floor(0.9*2)=1→'rifle'), nextDelay の4回のみ(70%判定は無い)
      rng: queueRng([0, 0, 0.9, 0]),
    }));
    expect(r.spawn!.ammoType).toBe('rifle');
  });

  it('間隔: 発生後の次回delayは75-105sの範囲', () => {
    const rMin = shouldSpawnAirdrop(baseInput({
      lastAmmoDropAt: 0, gameTime: 999999, rng: queueRng([0, 0, 0.69, 0]),
    }));
    expect(rMin.nextAmmoDropDelayMs).toBe(75000);
    const rMax = shouldSpawnAirdrop(baseInput({
      lastAmmoDropAt: 0, gameTime: 999999, rng: queueRng([0, 0, 0.69, 0.999999]),
    }));
    expect(rMax.nextAmmoDropDelayMs).toBeCloseTo(104999.97, 1);
  });

  it('境界: gameTime - lastAmmoDropAt が delay をちょうど超えた瞬間にspawnする', () => {
    const notYet = shouldSpawnAirdrop(baseInput({
      nextAmmoDropDelayMs: 50000, lastAmmoDropAt: 0, gameTime: 50000, rng: queueRng([]),
    }));
    expect(notYet.spawn).toBeNull();
    const justPast = shouldSpawnAirdrop(baseInput({
      nextAmmoDropDelayMs: 50000, lastAmmoDropAt: 0, gameTime: 50001,
      rng: queueRng([0, 0, 0.69, 0]),
    }));
    expect(justPast.spawn).not.toBeNull();
  });
});
