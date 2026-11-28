// M49(§6.25【改訂v0.25.2358】): 行動階層①交戦⇄②前進のヒステリシス state machine。
import { describe, it, expect } from 'vitest';
import {
  createEngagementTrackState, tickEngagementPhase, advanceOptionDetour,
  ENGAGEMENT_WINDOW_MS, ADVANCE_MIN_KILLS, ADVANCE_MAX_HITS, RETREAT_MIN_HITS, RETREAT_MIN_KILLS,
  ENGAGE_LEVEL_FLOOR, OPTION_DETOUR_DIST,
} from './botEngagement';

describe('★叩き台の値がPACING_PUZZLE.md §6.25改訂の表と一致する', () => {
  it('K=20 / H=1 / H2=3 / K2=8 / Lv5floor / window=60秒', () => {
    expect(ADVANCE_MIN_KILLS).toBe(20);
    expect(ADVANCE_MAX_HITS).toBe(1);
    expect(RETREAT_MIN_HITS).toBe(3);
    expect(RETREAT_MIN_KILLS).toBe(8);
    expect(ENGAGE_LEVEL_FLOOR).toBe(5);
    expect(ENGAGEMENT_WINDOW_MS).toBe(60_000);
  });

  it('戻る条件(H2/K2)は進む条件(H/K)より緩い(ヒステリシス)', () => {
    expect(RETREAT_MIN_HITS).toBeGreaterThan(ADVANCE_MAX_HITS);
    expect(RETREAT_MIN_KILLS).toBeLessThan(ADVANCE_MIN_KILLS);
  });
});

describe('tickEngagementPhase: ①⇄②のヒステリシス', () => {
  it('初期状態は①(engage)', () => {
    const s = createEngagementTrackState();
    expect(s.phase).toBe('engage');
  });

  it('絶対の床: Lv5未満は撃破/被弾の実績に関係なく必ず①', () => {
    const s = createEngagementTrackState();
    // 20キル・被弾0という理想的な実績でも、レベルが床未満なら①のまま。
    let kills = 0;
    let phase: ReturnType<typeof tickEngagementPhase> = 'engage';
    for (let i = 0; i < ADVANCE_MIN_KILLS; i++) {
      kills += 1;
      phase = tickEngagementPhase(s, i * 100, ENGAGE_LEVEL_FLOOR - 1, kills, 100);
    }
    expect(phase).toBe('engage');
  });

  it('直近60秒でK体撃破・被弾H以下なら①→②へ進む', () => {
    const s = createEngagementTrackState();
    let kills = 0;
    tickEngagementPhase(s, -1, 10, kills, 100); // 初回呼び出しはbaseline確立のみ(delta計測なし)
    let phase: ReturnType<typeof tickEngagementPhase> = 'engage';
    for (let i = 0; i < ADVANCE_MIN_KILLS; i++) {
      kills += 1;
      phase = tickEngagementPhase(s, i * 1000, 10, kills, 100); // レベル10=床の上
    }
    expect(phase).toBe('advance');
  });

  it('被弾がHを超えていれば撃破数を満たしていても①のまま', () => {
    const s = createEngagementTrackState();
    let kills = 0, health = 100;
    tickEngagementPhase(s, -1, 10, kills, health); // 初回呼び出しはbaseline確立のみ
    let phase: ReturnType<typeof tickEngagementPhase> = 'engage';
    for (let i = 0; i < ADVANCE_MIN_KILLS; i++) {
      kills += 1;
      if (i < ADVANCE_MAX_HITS + 1) health -= 1; // 被弾をH+1回発生させる
      phase = tickEngagementPhase(s, i * 1000, 10, kills, health);
    }
    expect(phase).toBe('engage');
  });

  it('②へ進んだ後、被弾がH2以上になると①へ戻る(ヒステリシス=H2>H)', () => {
    const s = createEngagementTrackState();
    let kills = 0, health = 100;
    let t = 0;
    tickEngagementPhase(s, t, 10, kills, health); // 初回呼び出しはbaseline確立のみ
    for (let i = 0; i < ADVANCE_MIN_KILLS; i++) {
      kills += 1; t += 1000;
      tickEngagementPhase(s, t, 10, kills, health);
    }
    expect(s.phase).toBe('advance');
    // 被弾をH2回発生させる(直近ウィンドウ内)。
    for (let i = 0; i < RETREAT_MIN_HITS; i++) {
      health -= 1; t += 100;
      tickEngagementPhase(s, t, 10, kills, health);
    }
    expect(s.phase).toBe('engage');
  });

  it('②へ進んだ後、撃破数がK2未満に落ちる(古いキルが60秒窓の外へ出る)と①へ戻る', () => {
    const s = createEngagementTrackState();
    let kills = 0;
    let t = 0;
    tickEngagementPhase(s, t, 10, kills, 100); // 初回呼び出しはbaseline確立のみ
    for (let i = 0; i < ADVANCE_MIN_KILLS; i++) {
      kills += 1; t += 100; // 20キルを2秒でこなす(60秒窓に全部残る)
      tickEngagementPhase(s, t, 10, kills, 100);
    }
    expect(s.phase).toBe('advance');
    // 撃破を止めたまま60秒以上経過させる → 直近のキルが窓から抜けてK2未満になる。
    t += ENGAGEMENT_WINDOW_MS + 1000;
    const phase = tickEngagementPhase(s, t, 10, kills, 100);
    expect(phase).toBe('engage');
    expect(RETREAT_MIN_KILLS).toBeGreaterThan(0); // 窓が空なら0<K2で必ず戻る
  });

  it('①→②のヒステリシス: K2以上・H2未満を保っている間は②のまま(往復しない)', () => {
    const s = createEngagementTrackState();
    let kills = 0;
    let t = 0;
    tickEngagementPhase(s, t, 10, kills, 100); // 初回呼び出しはbaseline確立のみ
    for (let i = 0; i < ADVANCE_MIN_KILLS; i++) {
      kills += 1; t += 100;
      tickEngagementPhase(s, t, 10, kills, 100);
    }
    expect(s.phase).toBe('advance');
    // 追加の被弾/撃破なしで数tick経過(境界上で往復しないことの確認)。
    for (let i = 0; i < 5; i++) {
      t += 100;
      tickEngagementPhase(s, t, 10, kills, 100);
    }
    expect(s.phase).toBe('advance');
  });
});

describe('advanceOptionDetour: ③オプション(独立した目的地にしない・従属実装)', () => {
  it('OPTION_DETOUR_DIST以内のピックアップへの単位ベクトルを返す', () => {
    const v = advanceOptionDetour(0, 0, [{ x: 100 - 8, y: 0 - 8 }])!; // 中心=(100,0)
    expect(v).toBeTruthy();
    expect(v.x).toBeCloseTo(1, 2);
    expect(v.y).toBeCloseTo(0, 2);
  });

  it('OPTION_DETOUR_DISTより遠いピックアップは無視する(null=呼び出し側は目的地へ進む)', () => {
    expect(advanceOptionDetour(0, 0, [{ x: OPTION_DETOUR_DIST + 100, y: 0 }])).toBeNull();
    expect(OPTION_DETOUR_DIST).toBe(240);
  });

  it('ピックアップが無ければnull', () => {
    expect(advanceOptionDetour(0, 0, [])).toBeNull();
  });

  it('複数あれば最寄り(方向が異なる2件で確認)を選ぶ', () => {
    const v = advanceOptionDetour(0, 0, [
      { x: 200 - 8, y: 0 - 8 },  // 遠い(距離約200・+x方向)
      { x: 0 - 8, y: -50 - 8 },  // 近い(距離約50・-y方向)
    ])!;
    expect(v.y).toBeLessThan(0); // 近い方(-y)が選ばれる
    expect(Math.abs(v.x)).toBeLessThan(0.5);
  });
});
