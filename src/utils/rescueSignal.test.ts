import { describe, it, expect } from 'vitest';
import {
  rescueSignalProcChance,
  selectRescueSignalTarget,
  pickRescueSignalAllyClass,
  RESCUE_SIGNAL_ALLY_CLASSES,
  type RescueSignalTargetCandidate,
} from './rescueSignal';

describe('rescueSignalProcChance (救難信号: レベル別発動率)', () => {
  it('Lv1=10% / Lv2=15% / Lv3=20%', () => {
    expect(rescueSignalProcChance(1)).toBeCloseTo(0.10);
    expect(rescueSignalProcChance(2)).toBeCloseTo(0.15);
    expect(rescueSignalProcChance(3)).toBeCloseTo(0.20);
  });

  it('Lv0(未所持)は0%', () => {
    expect(rescueSignalProcChance(0)).toBe(0);
  });

  it('範囲外レベルは端にクランプする', () => {
    expect(rescueSignalProcChance(-1)).toBe(0);
    expect(rescueSignalProcChance(99)).toBeCloseTo(0.20);
  });

  it('小数のレベルは切り捨てる', () => {
    expect(rescueSignalProcChance(2.9)).toBeCloseTo(0.15);
  });
});

describe('selectRescueSignalTarget (救難信号: 対象選定)', () => {
  const mk = (id: string, x: number, y: number, health = 10): RescueSignalTargetCandidate =>
    ({ id, x, y, width: 20, height: 20, health });
  const FAR = 100000; // 射程を実質無制限にして「射程以外の挙動」を確認する用

  it('ヒットした敵が生存していればそれを対象にする', () => {
    const enemies = [mk('a', 0, 0), mk('b', 500, 500)];
    const result = selectRescueSignalTarget('a', enemies, 0, 0, FAR);
    expect(result?.id).toBe('a');
  });

  it('ヒットした敵が既に死亡(配列に無い)なら最寄りの生存敵にフォールバックする', () => {
    const enemies = [mk('near', 30, 0), mk('far', 300, 0)];
    // 'hit-and-dead' は配列に存在しない(このスイングで倒された想定)。
    const result = selectRescueSignalTarget('hit-and-dead', enemies, 0, 0, FAR);
    expect(result?.id).toBe('near');
  });

  it('ヒットした敵がhealth<=0で残っていても死亡扱いでフォールバックする', () => {
    const enemies = [mk('a', 0, 0, 0), mk('b', 40, 0, 10)];
    const result = selectRescueSignalTarget('a', enemies, 0, 0, FAR);
    expect(result?.id).toBe('b');
  });

  it('生存中の敵が誰もいなければnull(発動スキップ)', () => {
    const enemies = [mk('a', 0, 0, 0)];
    expect(selectRescueSignalTarget('a', enemies, 0, 0, FAR)).toBeNull();
    expect(selectRescueSignalTarget('gone', [], 0, 0, FAR)).toBeNull();
  });

  it('最寄り判定はプレイヤー座標(fromX/fromY)からのユークリッド距離', () => {
    const enemies = [mk('closer', 10, 0), mk('closer2', -5, 0), mk('farther', 100, 100)];
    const result = selectRescueSignalTarget('missing', enemies, 0, 0, FAR);
    expect(result?.id).toBe('closer2'); // 中心(20,10)=距離22.4 vs 中心(5,10)=距離11.2
  });

  // 社長指示v0.25.1615: 索敵はプレイヤーから maxRange(=ハンドガン射程)以内のみ。範囲内に敵がいなければ発動しない。
  it('maxRange外の敵は対象にしない(射程内だけで最寄りを選ぶ)', () => {
    const enemies = [mk('inRange', 40, 0), mk('outRange', 500, 0)]; // 中心(50,10)dist≈51 / (510,10)dist≈510
    expect(selectRescueSignalTarget('missing', enemies, 0, 0, 100)?.id).toBe('inRange');
  });

  it('ヒットした敵でもmaxRange外なら対象にせず、射程内の別の敵へフォールバックする', () => {
    const enemies = [mk('hitFar', 500, 0), mk('near', 50, 0)]; // hitFar dist≈510>100 / near dist≈61<100
    expect(selectRescueSignalTarget('hitFar', enemies, 0, 0, 100)?.id).toBe('near');
  });

  it('maxRange内に生存中の敵がいなければnull(=範囲内に敵がいなければ発動しない)', () => {
    expect(selectRescueSignalTarget('far', [mk('far', 500, 0)], 0, 0, 100)).toBeNull();
    expect(selectRescueSignalTarget('missing', [mk('far', 500, 0)], 0, 0, 100)).toBeNull();
  });
});

describe('pickRescueSignalAllyClass (救難信号: 援護クラス選択)', () => {
  it('プレイヤーの現在クラスは選ばれない(全パターン網羅)', () => {
    for (const current of RESCUE_SIGNAL_ALLY_CLASSES) {
      for (let i = 0; i < 20; i++) {
        const picked = pickRescueSignalAllyClass(current, () => i / 20);
        expect(picked).not.toBe(current);
        expect(RESCUE_SIGNAL_ALLY_CLASSES).toContain(picked);
      }
    }
  });

  it('rng=0は候補配列の先頭(自クラス除外後)を返す', () => {
    const picked = pickRescueSignalAllyClass('warrior', () => 0);
    expect(picked).toBe(RESCUE_SIGNAL_ALLY_CLASSES.filter(c => c !== 'warrior')[0]);
  });

  it('rngが1に近い場合でも配列外参照しない(端のクランプ)', () => {
    const picked = pickRescueSignalAllyClass('mage', () => 0.999999);
    const pool = RESCUE_SIGNAL_ALLY_CLASSES.filter(c => c !== 'mage');
    expect(picked).toBe(pool[pool.length - 1]);
  });
});
