// 憲法テスト(型B「ラン間で状態が持ち越される」の網)。v0.25.3084。
//
// 事故の再現(v0.25.3070): gameTimeは出撃ごとに0へ戻るのに、間引き用のモジュール変数だけが
// 持ち越され、2回目以降の出撃で演出が丸ごと消えた。まっさらから1ランしか回さない従来のテストでは
// 構造的に踏めない型なので、ここで**土台の性質**を機械化する。
import { describe, it, expect } from 'vitest';
import { runClocks, resetRunClocks, type RunClocks } from './runClocks';
import { shouldEmitThrottled } from './emitThrottle';

describe('憲法: ラン内の時計は出撃をまたいで持ち越さない', () => {
  it('★全フィールドが0に戻る(総当たり=将来フィールドが増えても自動で検査される)', () => {
    for (const k of Object.keys(runClocks) as (keyof RunClocks)[]) runClocks[k] = 480_000;
    resetRunClocks();
    for (const k of Object.keys(runClocks) as (keyof RunClocks)[]) {
      expect(runClocks[k], `${k} が出撃時にリセットされていない`).toBe(0);
    }
  });

  it('時計は1つも欠けていない(空オブジェクトを誤って置いた事故の検知)', () => {
    expect(Object.keys(runClocks).length).toBeGreaterThan(0);
  });

  it('★2ラン連続の再現: 1ラン目の終盤値が残っていても、2ラン目の頭から撒ける', () => {
    // 1ラン目: 8分走ったところで撒いた。
    runClocks.quadSparkle = 480_000;
    // 2ラン目(gameTimeは0から)。リセットが効いていれば、間隔ぶん経った時点で撒ける。
    resetRunClocks();
    expect(shouldEmitThrottled(60, runClocks.quadSparkle, 60)).toBe(true);
  });

  it('★二重の安全弁: 仮にリセットを忘れても、判定側が巻き戻りを見て撒く', () => {
    runClocks.quadSparkle = 480_000; // リセットし忘れた状態
    expect(shouldEmitThrottled(0, runClocks.quadSparkle, 60)).toBe(true);
    resetRunClocks();
  });
});
