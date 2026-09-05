import { describe, it, expect } from 'vitest';
import {
  evaluateBossStopDr, BOSS_STOP_DR_IMMUNE_MS, BOSS_STOP_DR_RESET_MS, BOSS_STOP_DR_STAGE_MULT,
  type BossStopDrFields,
} from './bossStopDr';

// PACING_PUZZLE.md「★ボスの「止める効果」の作り直し」①逓減(DR)の単体テスト。
// evaluateBossStopDr は enemy 側の型に依存しない純関数(BossStopDrFieldsのみ)なので
// Enemy全体を組み立てず、必要な3フィールドだけの素のオブジェクトでテストする。

describe('evaluateBossStopDr: 段の遷移(1回目=満額/2回目=半分/3回目=無効化)', () => {
  it('1回目は満額(durationMult=1)で通り、stage=1へ進む', () => {
    const r = evaluateBossStopDr({}, 1000);
    expect(r.allowed).toBe(true);
    expect(r.durationMult).toBe(BOSS_STOP_DR_STAGE_MULT[0]);
    expect(r.durationMult).toBe(1);
    expect(r.patch.bossStopDrStage).toBe(1);
    expect(r.patch.bossStopDrLastAt).toBe(1000);
  });

  it('2回目は半分(durationMult=0.5)で通り、stage=2へ進む', () => {
    const state: BossStopDrFields = { bossStopDrStage: 1, bossStopDrLastAt: 1000 };
    const r = evaluateBossStopDr(state, 1200); // 15秒未満=リセットしない
    expect(r.allowed).toBe(true);
    expect(r.durationMult).toBe(0.5);
    expect(r.patch.bossStopDrStage).toBe(2);
  });

  it('3回目は無効化され、完全耐性(BOSS_STOP_DR_IMMUNE_MS)を新規に立てる', () => {
    const state: BossStopDrFields = { bossStopDrStage: 2, bossStopDrLastAt: 1200 };
    const r = evaluateBossStopDr(state, 1400);
    expect(r.allowed).toBe(false);
    expect(r.durationMult).toBe(0);
    expect(r.patch.bossStopDrImmuneUntil).toBe(1400 + BOSS_STOP_DR_IMMUNE_MS);
    expect(r.patch.bossStopDrStage).toBe(2);
  });
});

describe('evaluateBossStopDr: 完全耐性中は一切通さない(揺れ等の演出は別経路=呼び出し元の責務)', () => {
  it('耐性の終了時刻より前は allowed=false・状態も変えない', () => {
    const state: BossStopDrFields = { bossStopDrImmuneUntil: 5000, bossStopDrStage: 2, bossStopDrLastAt: 2000 };
    const r = evaluateBossStopDr(state, 4999);
    expect(r.allowed).toBe(false);
    expect(r.durationMult).toBe(0);
    expect(r.patch).toEqual({}); // 耐性中は状態を一切動かさない(延長もしない=固定3000ms)
  });
});

describe('evaluateBossStopDr: 完全耐性が明けたら1段目(1回目扱い)から再開する', () => {
  it('耐性終了時刻ちょうど、またはそれ以降の初回呼び出しは満額(durationMult=1)で通る', () => {
    const state: BossStopDrFields = { bossStopDrImmuneUntil: 5000, bossStopDrStage: 2, bossStopDrLastAt: 2000 };
    const r = evaluateBossStopDr(state, 5000); // ちょうど明けた瞬間
    expect(r.allowed).toBe(true);
    expect(r.durationMult).toBe(1);
    expect(r.patch.bossStopDrStage).toBe(1);
    expect(r.patch.bossStopDrImmuneUntil).toBeUndefined(); // 古い耐性の終了時刻を持ち越さない
  });

  it('耐性明けのだいぶ後(15秒超)でも同じく1段目から(justExitedImmuneが優先)', () => {
    const state: BossStopDrFields = { bossStopDrImmuneUntil: 5000, bossStopDrStage: 2, bossStopDrLastAt: 2000 };
    const r = evaluateBossStopDr(state, 5000 + BOSS_STOP_DR_RESET_MS + 1000);
    expect(r.allowed).toBe(true);
    expect(r.durationMult).toBe(1);
  });
});

describe('evaluateBossStopDr: 1〜2回目止まりで沈黙が続くと15秒でリセットされる', () => {
  it('最後の適用からBOSS_STOP_DR_RESET_MS未満なら段を維持する(2回目=半分のまま)', () => {
    const state: BossStopDrFields = { bossStopDrStage: 1, bossStopDrLastAt: 1000 };
    const r = evaluateBossStopDr(state, 1000 + BOSS_STOP_DR_RESET_MS - 1);
    expect(r.allowed).toBe(true);
    expect(r.durationMult).toBe(0.5);
  });

  it('最後の適用からBOSS_STOP_DR_RESET_MSちょうど以上経つと1段目(満額)に戻る', () => {
    const state: BossStopDrFields = { bossStopDrStage: 1, bossStopDrLastAt: 1000 };
    const r = evaluateBossStopDr(state, 1000 + BOSS_STOP_DR_RESET_MS);
    expect(r.allowed).toBe(true);
    expect(r.durationMult).toBe(1);
    expect(r.patch.bossStopDrStage).toBe(1);
  });
});

describe('evaluateBossStopDr: 回帰テスト(社長裁定の骨格「連射で止め続けても3回目以降は止まらない」)', () => {
  it('★短い間隔で連射し続けても、3回目で無効化され、以後は耐性が明けるまでずっと止まらない', () => {
    let state: BossStopDrFields = {};
    let now = 0;
    const results: boolean[] = [];
    // 100msごとに30発(=3秒)連射: KNOCKBACK_DURATION(280ms)より短い間隔を想定した高頻度連射。
    for (let i = 0; i < 30; i++) {
      const r = evaluateBossStopDr(state, now);
      results.push(r.allowed);
      state = { ...state, ...r.patch };
      now += 100;
    }
    // 1発目=許可, 2発目=許可(半分), 3発目以降は耐性(3000ms)が明けるまでずっと拒否され続ける。
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(true);
    expect(results.slice(2)).not.toContain(true); // 3発目以降(index2〜)は連射している間ずっとfalse
    // 完全耐性(3000ms)が明けた後の1発は再び許可される(1段目からの再開=固定ロックではない)。
    const afterImmune = evaluateBossStopDr(state, now + BOSS_STOP_DR_IMMUNE_MS + 50);
    expect(afterImmune.allowed).toBe(true);
    expect(afterImmune.durationMult).toBe(1);
  });
});
