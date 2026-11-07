// BOT_AND_GHOST.md §2.8 G2.6「CD正規化」: 合流点/手動実装が共有するCDスキル適用の検証。
// 従来実装(gameStore.setSubWeaponCooldown / sensor-mine / support-sniper)と1msも違わないこと。
import { describe, it, expect } from 'vitest';
import { applySubCooldownSkills } from './subCooldown';

describe('applySubCooldownSkills: オーバークロック(成立=CDを付けない)', () => {
  it('deltaMs>0 かつ rand<chance で成立(deltaMs=0)', () => {
    const r = applySubCooldownSkills(0.3, 0.7, 5000, () => 0.29);
    expect(r.overclockProc).toBe(true);
    expect(r.deltaMs).toBe(0);
  });

  it('rand>=chance なら不成立でタイムキーパー倍率が乗る', () => {
    const r = applySubCooldownSkills(0.3, 0.7, 5000, () => 0.3);
    expect(r.overclockProc).toBe(false);
    expect(r.deltaMs).toBeCloseTo(3500, 10);
  });

  it('deltaMs<=0 では乱数を消費しない(従来の合流点と同じ抽選条件)', () => {
    let rolls = 0;
    const r = applySubCooldownSkills(1, 0.7, 0, () => { rolls += 1; return 0; });
    expect(rolls).toBe(0);
    expect(r.overclockProc).toBe(false);
    expect(r.deltaMs).toBe(0); // Δ<=0 は素通し(倍率も掛けない=従来の分岐と同一)
  });
});

describe('applySubCooldownSkills: タイムキーパー', () => {
  it('mult===1 は値を素通しする(乗算の丸め誤差も入らない=従来の分岐と同一)', () => {
    const r = applySubCooldownSkills(0, 1, 5000, () => 1);
    expect(r.deltaMs).toBe(5000);
  });

  it('スキル無し(chance=0, mult=1)は完全に無変換', () => {
    const r = applySubCooldownSkills(0, 1, 1234.5, () => 0);
    expect(r).toEqual({ overclockProc: false, deltaMs: 1234.5 });
  });
});
