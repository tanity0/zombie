import { describe, it, expect } from 'vitest';
import {
  computeFirstAidKitTick,
  createFirstAidKitState,
  isFirstAidKitEmpty,
  FirstAidKitState,
} from './firstAidKit';

const baseInput = {
  level: 1,
  ammoTypesUsed: ['handgun'] as const,
  ammoHandgun: 10,
  ammoShotgun: 0,
  ammoRifle: 0,
  health: 100,
  maxHealth: 100,
  onScreenEnemyCount: 0,
  state: createFirstAidKitState(),
};

describe('computeFirstAidKitTick', () => {
  it('Lv1: 所持している弾薬タイプのリザーブが0になると、その種類のammoを1回だけ払い出す', () => {
    const result = computeFirstAidKitTick({ ...baseInput, ammoHandgun: 0 });
    expect(result.dispense).toBe('ammo-handgun');
    expect(result.nextState.ammoHandgunDispensed).toBe(true);
  });

  it('リザーブが残っている間は払い出さない', () => {
    const result = computeFirstAidKitTick({ ...baseInput, ammoHandgun: 5 });
    expect(result.dispense).toBeNull();
    expect(result.nextState).toBe(baseInput.state); // 状態が変わらない時は同一参照(無駄な書き込み回避)
  });

  it('所持していない武器種のリザーブが0でも払い出さない(使っていない弾薬は対象外)', () => {
    const result = computeFirstAidKitTick({
      ...baseInput, ammoTypesUsed: ['handgun'], ammoHandgun: 10, ammoShotgun: 0,
    });
    expect(result.dispense).toBeNull();
  });

  it('既に払い出し済みの種類は、再びリザーブが0になっても再払い出ししない', () => {
    const state: FirstAidKitState = { ...createFirstAidKitState(), ammoHandgunDispensed: true };
    const result = computeFirstAidKitTick({ ...baseInput, ammoHandgun: 0, state });
    expect(result.dispense).toBeNull();
  });

  it('Lv1では回復条件(HP<50%)を満たしても払い出さない(回復はLv2から)', () => {
    const result = computeFirstAidKitTick({ ...baseInput, level: 1, health: 10, maxHealth: 100 });
    expect(result.dispense).toBeNull();
  });

  it('Lv2で回復条件(HP<50%)を満たすと1回だけ回復を払い出す', () => {
    const result = computeFirstAidKitTick({
      ...baseInput, level: 2, ammoHandgun: 10, health: 40, maxHealth: 100,
    });
    expect(result.dispense).toBe('health');
    expect(result.nextState.healDispensed).toBe(true);
  });

  it('Lv2でHPがちょうど50%(境界)なら回復条件を満たさない(< のみ)', () => {
    const result = computeFirstAidKitTick({
      ...baseInput, level: 2, ammoHandgun: 10, health: 50, maxHealth: 100,
    });
    expect(result.dispense).toBeNull();
  });

  it('Lv3未満では画面内敵5体以上でも爆弾を払い出さない', () => {
    const result = computeFirstAidKitTick({
      ...baseInput, level: 2, ammoHandgun: 10, onScreenEnemyCount: 10,
    });
    expect(result.dispense).toBeNull();
  });

  it('Lv3で画面内敵が5体以上になると1回だけ爆弾を払い出す', () => {
    const result = computeFirstAidKitTick({
      ...baseInput, level: 3, ammoHandgun: 10, health: 100, onScreenEnemyCount: 5,
    });
    expect(result.dispense).toBe('bomb');
    expect(result.nextState.bombDispensed).toBe(true);
  });

  it('複数条件が同時に成立していても、1フレームでは弾薬>回復>爆弾の優先順で1個だけ払い出す', () => {
    const result = computeFirstAidKitTick({
      level: 3,
      ammoTypesUsed: ['handgun', 'shotgun'],
      ammoHandgun: 0, // ammo-handgun条件も成立
      ammoShotgun: 10,
      ammoRifle: 0,
      health: 5, // heal条件も成立
      maxHealth: 100,
      onScreenEnemyCount: 20, // bomb条件も成立
      state: createFirstAidKitState(),
    });
    expect(result.dispense).toBe('ammo-handgun'); // 弾薬が最優先
  });

  it('鞄を投げ切った(thrown=true)後は、どんな条件が成立していても払い出さない', () => {
    const state: FirstAidKitState = { ...createFirstAidKitState(), thrown: true };
    const result = computeFirstAidKitTick({ ...baseInput, ammoHandgun: 0, state });
    expect(result.dispense).toBeNull();
    expect(result.nextState).toBe(state);
  });
});

describe('isFirstAidKitEmpty(社長決定v0.25.1657: 弾3種すべて+Lv回復/爆弾で空)', () => {
  const allAmmo = { ammoHandgunDispensed: true, ammoShotgunDispensed: true, ammoRifleDispensed: true };

  it('何も払い出していない状態では空ではない', () => {
    expect(isFirstAidKitEmpty(createFirstAidKitState(), 1)).toBe(false);
  });

  it('弾を一部の銃種しか払い出していなければ空にならない(3種そろうまで投げない)', () => {
    const partial: FirstAidKitState = { ...createFirstAidKitState(), ammoHandgunDispensed: true, ammoShotgunDispensed: true };
    expect(isFirstAidKitEmpty(partial, 1)).toBe(false); // rifle未払い出し=まだ空でない
  });

  it('Lv1: 弾3種すべてを払い出せば空になる(回復/爆弾は数えない)', () => {
    const state: FirstAidKitState = { ...createFirstAidKitState(), ...allAmmo };
    expect(isFirstAidKitEmpty(state, 1)).toBe(true);
  });

  it('Lv2: 弾3種を払い出しても回復が未払い出しなら空にならない', () => {
    const state: FirstAidKitState = { ...createFirstAidKitState(), ...allAmmo };
    expect(isFirstAidKitEmpty(state, 2)).toBe(false);
  });

  it('Lv2: 弾3種+回復を払い出せば空になる', () => {
    const state: FirstAidKitState = { ...createFirstAidKitState(), ...allAmmo, healDispensed: true };
    expect(isFirstAidKitEmpty(state, 2)).toBe(true);
  });

  it('Lv3: 弾3種+回復+爆弾を全て払い出して初めて空になる', () => {
    const partial: FirstAidKitState = { ...createFirstAidKitState(), ...allAmmo, healDispensed: true };
    expect(isFirstAidKitEmpty(partial, 3)).toBe(false);
    const full: FirstAidKitState = { ...partial, bombDispensed: true };
    expect(isFirstAidKitEmpty(full, 3)).toBe(true);
  });
});
