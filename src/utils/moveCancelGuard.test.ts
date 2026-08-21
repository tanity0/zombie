// ★社長裁定v0.25.3518「次の技は前の技をキャンセルしない」の規則そのものの単体テスト。
// 判定は純関数なので、まずここで「何を違反と呼ぶか」を厳密に固定する。
// (ボスを実際に回して食わせる側は bountyTick.test.ts / bossMoveCancel.test.ts。)
import { describe, it, expect } from 'vitest';
import {
  parseMovePhase, isNeutralMoveState, moveCancelViolation, createMoveCancelWatch, ALLOWED_MOVE_CHAINS,
} from './moveCancelGuard';

describe('parseMovePhase(状態名 → 技と段階)', () => {
  it('3系統の実際の状態名を割れる', () => {
    expect(parseMovePhase('br-triple-windup')).toEqual({ move: 'br-triple', phase: 'windup' });
    expect(parseMovePhase('g-sweep-active')).toEqual({ move: 'g-sweep', phase: 'active' });
    expect(parseMovePhase('idol-roll-recover')).toEqual({ move: 'idol-roll', phase: 'recover' });
    expect(parseMovePhase('g-jump-air')).toEqual({ move: 'g-jump-air', phase: 'active' }); // 接尾辞なし=実行中
  });
  it('中立はnull(技を出していない)', () => {
    for (const s of ['chase', 'return', 'idle', undefined, null, '']) {
      expect(isNeutralMoveState(s), String(s)).toBe(true);
      expect(parseMovePhase(s), String(s)).toBeNull();
    }
  });
});

describe('moveCancelViolation(違反の定義)', () => {
  it('★別の技のwindupが、前の技の溜め/実行の途中から始まったら違反', () => {
    expect(moveCancelViolation('br-push-windup', 'br-triple-windup')).toContain('前の技を出し切る前');
    expect(moveCancelViolation('g-sweep-active', 'g-stomp-windup')).toContain('前の技を出し切る前');
  });
  it('中立を挟んでいれば違反ではない(正しい入口)', () => {
    expect(moveCancelViolation('br-push-recover', 'chase')).toBeNull();
    expect(moveCancelViolation('chase', 'br-triple-windup')).toBeNull();
  });
  it('同じ技の中の段階遷移は違反ではない', () => {
    expect(moveCancelViolation('g-sweep-windup', 'g-sweep-active')).toBeNull();
    expect(moveCancelViolation('g-sweep-active', 'g-sweep-recover')).toBeNull();
  });
  it('硬直(recover)から次の技へは違反ではない(前の技は出し切っている=連携の正規形)', () => {
    expect(moveCancelViolation('g-sweep-recover', 'g-stomp-windup')).toBeNull();
  });
  it('★技→中立は違反ではない(カウンター/紫/気絶の中断は「次の技」ではない)', () => {
    expect(moveCancelViolation('br-triple-windup', 'chase')).toBeNull();
    // 中断専用の状態(laser-broken)も**windupではない**ので違反にならない。
    // ここを違反にすると「近接でレーザーを壊す」という設計どおりの挙動が毎回赤くなる。
    expect(moveCancelViolation('laser-windup', 'laser-broken')).toBeNull();
  });
  it('前の技のactiveから、別の技のactive/recoverへ飛んでも「windupの上書き」ではないので対象外', () => {
    // ここを違反にすると、同じ技の別名フェーズ(g-jump-air等)を全部登録しない限り誤検知が出る。
    expect(moveCancelViolation('g-sweep-active', 'g-stomp-active')).toBeNull();
  });
});

describe('createMoveCancelWatch(複数体の見張り)', () => {
  it('体ごとに独立して追う(別の敵の状態と混ざらない)', () => {
    const w = createMoveCancelWatch();
    w.observe('a', 'chase');
    w.observe('b', 'chase');
    w.observe('a', 'br-push-windup');
    w.observe('b', 'br-triple-windup');
    expect(w.violations()).toEqual([]); // どちらも中立から入っている
    w.observe('a', 'br-triple-windup'); // ★aだけ違反(押しのけの溜め中に三段突きが割り込んだ)
    expect(w.violations()).toHaveLength(1);
    expect(w.violations()[0]).toContain('br-push');
  });
  it('同じ違反は畳んで1件にする(複数体・毎tickで出ても報告が埋まらない)', () => {
    const w = createMoveCancelWatch();
    for (const id of ['a', 'b', 'c']) {
      w.observe(id, 'chase');
      w.observe(id, 'br-push-windup');
      w.observe(id, 'br-triple-windup'); // 3体とも同じ違反
    }
    expect(w.violations()).toHaveLength(1);
  });

  it('違反の向きが違えば別件として数える(どちらが割り込んだか分かる)', () => {
    const w = createMoveCancelWatch();
    w.observe('a', 'br-push-windup');
    w.observe('a', 'br-triple-windup'); // 押しのけ→三段突き
    w.observe('a', 'br-push-windup');   // 三段突き→押しのけ(逆向き)
    expect(w.violations()).toHaveLength(2);
  });
});

// 申告表(ALLOWED_MOVE_CHAINS)。連携は「前の技を切っていない」と言える根拠つきで明示申告する。
describe('ALLOWED_MOVE_CHAINS(設計された連携の申告)', () => {
  it('申告された連携は違反にならない', () => {
    expect(moveCancelViolation('bm-charge', 'bm-whip360-windup')).toBeNull();
  });
  // 実戦の状態へ常時接続する前に足した2件(ボス・ガントレット)。**状態名のまま**食わせて確かめる
  // =申告のキー(技名)と実際に流れてくる状態名の対応がズレていたらここで落ちる。
  it('城ボスの四連突進→氷結の吐息は申告済み(状態名 g-quad-charge → g-quad-breath-windup)', () => {
    expect(moveCancelViolation('g-quad-charge', 'g-quad-breath-windup')).toBeNull();
  });
  it('ミゲルの払い→縦払いは申告済み(状態名 harai → tate-windup)', () => {
    expect(moveCancelViolation('harai', 'tate-windup')).toBeNull();
  });
  // ★v0.25.3780(research/THOR_ISSEN_REWORK.md §5-7): 一閃の2段化。
  it('トールの無の境地→一閃は申告済み(状態名 issen-nihil → issen-windup)', () => {
    expect(moveCancelViolation('issen-nihil', 'issen-windup')).toBeNull();
  });
  it('★必中一閃(issen-nihil → issen-dash)は申告不要=そもそも違反にならない', () => {
    // issen-dash は '-windup' で終わらない=次の技の**溜め**ではないので、規則の対象外。
    expect(moveCancelViolation('issen-nihil', 'issen-dash')).toBeNull();
  });
  it('トールの突進は通常の連携(硬直→次の技)なので申告が要らない', () => {
    expect(moveCancelViolation('thor-dash-recover', 'tsuki-windup')).toBeNull();
    expect(moveCancelViolation('thor-dash-windup', 'thor-dash-move')).toBeNull();
    expect(moveCancelViolation('thor-dash-move', 'thor-dash-recover')).toBeNull();
  });
  it('申告されていない同型の遷移は違反のまま(申告が効きすぎないこと)', () => {
    expect(moveCancelViolation('bm-charge', 'bm-combo1-windup')).not.toBeNull();
  });
  it('全ての申告に「なぜ切っていないと言えるか」の理由が書いてある(空文字で黙らせない)', () => {
    for (const [k, why] of Object.entries(ALLOWED_MOVE_CHAINS)) {
      expect(why.length, k).toBeGreaterThan(30);
    }
  });
  it('キーの書式は `前の技 -> 次の技`(揺れると静かに効かなくなる)', () => {
    for (const k of Object.keys(ALLOWED_MOVE_CHAINS)) expect(k).toMatch(/^[a-z0-9-]+ -> [a-z0-9-]+$/);
  });
});
