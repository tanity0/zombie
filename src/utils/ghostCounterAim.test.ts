// A-2(社長裁定v0.25.2600): 「ダメージが出る瞬間から逆算して振る」純関数の不変条件。
// 診断(v0.25.2599)で判明した構造——守護霊が**絶対に成立しない予告**で振って近接CDを捨て、
// 着弾を食らってから硬直で振り直していた——を、表とテストで固定する。
import { describe, it, expect } from 'vitest';
import {
  GIANT_IMPACT_AT_WINDUP_END, GIANT_WATCH_ACTIVE_PHASES,
  GHOST_COUNTER_AIM_LEAD_MS, GHOST_COUNTER_AIM_EARLY_SPREAD_MS,
  isGiantAimWindup, isGiantDeadWindup, isGiantWatchActivePhase,
  ghostAimSlowness01, ghostAimLeadMs, ghostAimSwingNow,
} from './ghostCounterAim';
import { GHOST_COUNTER_CLAIM_MAX_AGE_MS } from './ghostCounter';
import { GHOST_REACTION_MIN_MS, GHOST_REACTION_MAX_MS } from './ghostDriver';

describe('着弾予告/死に予告の切り分け(表の自己整合)', () => {
  it('着弾予告(その終わりにダメージが出る)は逆算の対象、それ以外のg-*予告は「死に予告」', () => {
    for (const p of GIANT_IMPACT_AT_WINDUP_END) {
      expect(isGiantAimWindup(p)).toBe(true);
      expect(isGiantDeadWindup(p)).toBe(false); // 両方には属さない(導出が二重管理でない証明)
    }
    // 代表的な死に予告: ダメージはその先(滞空/体当たり/実行)で出るのでここで振っても成立しない。
    for (const p of ['g-jump-windup', 'g-dash-windup', 'g-quad-windup', 'g-nova-windup', 'g-trijump-windup']) {
      expect(isGiantDeadWindup(p)).toBe(true);
      expect(isGiantAimWindup(p)).toBe(false);
    }
  });

  it('硬直・実行フェーズ・他ボスのフェーズは「死に予告」に巻き込まない', () => {
    for (const p of ['g-jump-recover', 'g-dash-charge', 'g-sweep-active', 'g-jump-air', undefined]) {
      expect(isGiantDeadWindup(p)).toBe(false);
    }
    // 他ファミリー(トール/天使/idol)の予告は giantbat 限定の表に触れさせない(接頭辞 g- で切っている)。
    for (const p of ['issen-windup', 'idol-aim-windup', 'volley-windup']) {
      expect(isGiantDeadWindup(p)).toBe(false);
      expect(isGiantAimWindup(p)).toBe(false);
    }
  });

  it('監視に加える実行フェーズは成立表にある2つだけ(判定を広げない)', () => {
    expect([...GIANT_WATCH_ACTIVE_PHASES]).toEqual(['g-dash-charge', 'g-sweep-active']);
    expect(isGiantWatchActivePhase('g-dash-charge')).toBe(true);
    expect(isGiantWatchActivePhase('g-jump-air')).toBe(false); // 近似(legacyHit)側が元から拾う=二重に足さない
    expect(isGiantWatchActivePhase(undefined)).toBe(false);
  });
});

describe('逆算: 速い霊は請求が生きているうちに当て、遅い霊は早く振って外す', () => {
  const leadOf = (reactionMs: number) =>
    ghostAimLeadMs(ghostAimSlowness01(reactionMs, GHOST_REACTION_MIN_MS, GHOST_REACTION_MAX_MS));

  it('最速の霊の先行時間は窓の内側(=着弾時にまだ請求が生きている)', () => {
    const lead = leadOf(GHOST_REACTION_MIN_MS);
    expect(lead).toBe(GHOST_COUNTER_AIM_LEAD_MS);
    expect(lead).toBeLessThan(GHOST_COUNTER_CLAIM_MAX_AGE_MS); // ここが崩れると速い霊でも成立しなくなる
    expect(lead).toBeGreaterThan(0);                           // 0以下=着弾後に振る=後出しになる
  });

  // ★判定時置換ミラー(2026-08-27・監査R4): 窓が[振り始め,+300]に伸びたため、旧個性「最遅の霊は
  // TTL150を超えて必ず失敗」は算術的に消えた(事実)。新しい不変条件=**最遅の霊でも lead は窓の内側**
  // (着弾ズレ・多段技で不利になる形の個性は残るが、逆算そのものは全霊で成立可能)。
  it('最遅の霊の先行時間も窓(振り始め+300ms)の内側に収まる', () => {
    const lead = leadOf(GHOST_REACTION_MAX_MS);
    expect(lead).toBe(GHOST_COUNTER_AIM_LEAD_MS + GHOST_COUNTER_AIM_EARLY_SPREAD_MS);
    expect(lead).toBeLessThan(GHOST_COUNTER_CLAIM_MAX_AGE_MS);
  });

  it('先行時間は反応の遅さに対して単調増加(速い人の霊ほど決まる)', () => {
    const samples = [100, 250, 400, 550, 700, 800].map(leadOf);
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  });

  it('欠損/異常な反応値は「遅い」側へ倒す(判定を甘くしない安全側)', () => {
    expect(ghostAimSlowness01(Number.NaN, GHOST_REACTION_MIN_MS, GHOST_REACTION_MAX_MS)).toBe(1);
    expect(ghostAimSlowness01(99999, GHOST_REACTION_MIN_MS, GHOST_REACTION_MAX_MS)).toBe(1);
    expect(ghostAimSlowness01(-5, GHOST_REACTION_MIN_MS, GHOST_REACTION_MAX_MS)).toBe(0);
  });

  it('残りが先行時間を切った瞬間だけ振る(それより前は待つ)', () => {
    const lead = leadOf(GHOST_REACTION_MIN_MS);
    expect(ghostAimSwingNow(lead + 1, lead)).toBe(false); // まだ先=待つ
    expect(ghostAimSwingNow(lead, lead)).toBe(true);      // 逆算した時刻に到達
    expect(ghostAimSwingNow(0, lead)).toBe(true);         // 着弾フレーム
  });
});
