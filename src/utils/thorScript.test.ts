import { describe, it, expect } from 'vitest';
import { pickThorMove, thorPhaseForHealth, pickThorPool, THOR_HARAI_MAX_DIST, THOR_MOVE_WEIGHTS } from './thorScript';

describe('thorPhaseForHealth — 3相(60%/40%・40%は既存THOR_LOWHP_FRAC流用)', () => {
  it('phase1 above 60%', () => {
    expect(thorPhaseForHealth(1)).toBe(1);
    expect(thorPhaseForHealth(0.61)).toBe(1);
  });
  it('phase2 between 40% and 60%', () => {
    expect(thorPhaseForHealth(0.6)).toBe(2);
    expect(thorPhaseForHealth(0.41)).toBe(2);
  });
  it('phase3 at or below 40%', () => {
    expect(thorPhaseForHealth(0.4)).toBe(3);
    expect(thorPhaseForHealth(0)).toBe(3);
  });
});

// ★v0.25.3780(research/THOR_ISSEN_REWORK.md §4): `pickThorCombo` / `thorComboChance` /
// `THOR_COMBO_NEAR_MAX` とそのテストは**削除**した。連携の正本は `bossChoreography.ts` の
// `SCRIPTS.thor` 1箇所で、この3つは**どこからも呼ばれていない死にコード**だった
// (import していたのは pickThorMove と thorPhaseForHealth だけ=実在確認済み)。
// 「払いの間合いゲート」として生きていた 250 だけを `THOR_HARAI_MAX_DIST` へ改名して残してある。

describe('pickThorMove — 距離で刀の役割を変える', () => {
  it('密着では払い、遠距離では一閃が候補になりやすい', () => {
    const melee = Array.from({ length: 100 }, (_, i) => pickThorMove(60, 1, () => i / 100));
    const far = Array.from({ length: 100 }, (_, i) => pickThorMove(900, 1, () => i / 100));
    expect(melee).toContain('harai');
    expect(far).not.toContain('harai');
    expect(far.filter(m => m === 'issen').length).toBeGreaterThan(far.filter(m => m === 'tsuki').length);
  });
});

describe('pickThorPool — 既存の技選択プール(値は不変・純関数化のみ)', () => {
  it('払いが不可な間合いではissen/tsukiのみ', () => {
    expect(pickThorPool(false)).toEqual(['issen', 'tsuki']);
  });
  it('払いが可能な間合いでは払いも候補に入る', () => {
    expect(pickThorPool(true)).toEqual(['issen', 'tsuki', 'harai']);
  });
});

// ★research/THOR_ISSEN_REWORK.md §4(新技「突進」)。受け入れ条件1「単発でも台本でも出る」の単発側。
describe('pickThorMove — 突進(dash)が抽選に加わる', () => {
  it('中〜遠の間合いでは突進も候補に出る', () => {
    const mid = Array.from({ length: 100 }, (_, i) => pickThorMove(400, 1, () => i / 100));
    const far = Array.from({ length: 100 }, (_, i) => pickThorMove(900, 1, () => i / 100));
    expect(mid).toContain('dash');
    expect(far).toContain('dash');
  });
  it('密着/近距離では出ない(重み0=一閃・突き・払いの読み合いを壊さない)', () => {
    const melee = Array.from({ length: 100 }, (_, i) => pickThorMove(60, 1, () => i / 100));
    expect(melee).not.toContain('dash');
    expect(THOR_MOVE_WEIGHTS.dash.melee).toBe(0);
    expect(THOR_MOVE_WEIGHTS.dash.near).toBe(0);
  });
  it('CD中(dashReady=false)は1つも出ない=専用CDのゲートが効いている', () => {
    const far = Array.from({ length: 100 }, (_, i) => pickThorMove(900, 1, () => i / 100, false));
    expect(far).not.toContain('dash');
  });
  it('既定はdashReady=true(引数を足しても既存の呼び出しは同じ挙動)', () => {
    expect(pickThorMove(900, 1, () => 0.99)).toBe(pickThorMove(900, 1, () => 0.99, true));
  });
  it('払いの間合いゲートは従来と同じ250px(定数の改名だけ=値は不変)', () => {
    expect(THOR_HARAI_MAX_DIST).toBe(250);
  });
});
