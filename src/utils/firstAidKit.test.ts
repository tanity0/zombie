import { describe, it, expect } from 'vitest';
import {
  computeFirstAidKitTick,
  createFirstAidKitState,
  isFirstAidKitEmpty,
  refillFirstAidKit,
  createGhostFirstAidKitState,
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
  const allAmmo = { ammoHandgunDispensed: true, ammoShotgunDispensed: true, ammoRifleDispensed: true, anyDispensed: true };

  it('何も払い出していない状態では空ではない', () => {
    expect(isFirstAidKitEmpty(createFirstAidKitState(), 1)).toBe(false);
  });

  it('弾を一部の銃種しか払い出していなければ空にならない(3種そろうまで投げない)', () => {
    const partial: FirstAidKitState = { ...createFirstAidKitState(), ammoHandgunDispensed: true, ammoShotgunDispensed: true, anyDispensed: true };
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

describe('refillFirstAidKit(投げた空鞄の爆発で補充・社長指示2026-11-25)', () => {
  const allAmmo = { ammoHandgunDispensed: true, ammoShotgunDispensed: true, ammoRifleDispensed: true, anyDispensed: true };
  const ammoInput = {
    ...baseInput, level: 3, ammoTypesUsed: ['handgun', 'shotgun', 'rifle'] as const,
    ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0, health: 10, maxHealth: 100, onScreenEnemyCount: 9,
  };

  it('飛んでいる間(thrown=true・未補充)は空のまま=何も払い出さない', () => {
    const flying: FirstAidKitState = { ...createFirstAidKitState(), ...allAmmo, healDispensed: true, bombDispensed: true, thrown: true };
    const r = computeFirstAidKitTick({ ...ammoInput, state: flying });
    expect(r.dispense).toBeNull();
    expect(r.nextState).toBe(flying);
    expect(isFirstAidKitEmpty(flying, 3)).toBe(true);
  });

  const notArmed = { armedHandgun: false, armedShotgun: false, armedRifle: false, armedHeal: false, armedBomb: false };

  it('爆発で補充すると払い出し済みとthrownが初期状態へ戻る(立ち上がり待ちだけが初期状態と違う)', () => {
    const refilled = refillFirstAidKit('player');
    expect(refilled).toEqual({ ...createFirstAidKitState(), ...notArmed });
    expect(isFirstAidKitEmpty(refilled, 3)).toBe(false);
  });

  it('守護霊の鞄は守護霊の初期在庫(回復のみ)へ戻る', () => {
    const refilled = refillFirstAidKit('ghost');
    expect(refilled).toEqual({ ...createGhostFirstAidKitState(), ...notArmed });
    expect(refilled.thrown).toBe(false);
  });
});

describe('補充後は「条件が新しく起きた時だけ」出す(社長裁定2026-11-25)', () => {
  const guns = ['handgun', 'shotgun', 'rifle'] as const;
  const input = {
    level: 3, ammoTypesUsed: guns, ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
    health: 100, maxHealth: 100, onScreenEnemyCount: 0,
  };

  it('①補充直後に弾0のままなら、何フレーム回しても弾を出さない', () => {
    let state = refillFirstAidKit('player');
    for (let i = 0; i < 300; i++) {
      const r = computeFirstAidKitTick({ ...input, state });
      expect(r.dispense).toBeNull();
      state = r.nextState;
    }
    expect(state.ammoHandgunDispensed || state.ammoShotgunDispensed || state.ammoRifleDispensed).toBe(false);
  });

  it('②弾が戻って(予備弾>0)からまた0になったら、その銃種だけ出す', () => {
    let state = refillFirstAidKit('player');
    state = computeFirstAidKitTick({ ...input, state }).nextState; // 0のまま=出さない
    const back = computeFirstAidKitTick({ ...input, ammoShotgun: 12, state }); // ショットガンの弾が戻る
    expect(back.dispense).toBeNull(); // 解けたフレームでは出さない
    expect(back.nextState.armedShotgun).toBe(true);
    expect(back.nextState.armedHandgun).toBe(false); // ほかの銃種は0のまま=まだ待ち
    const again = computeFirstAidKitTick({ ...input, ammoShotgun: 0, state: back.nextState });
    expect(again.dispense).toBe('ammo-shotgun');
    const later = computeFirstAidKitTick({ ...input, state: again.nextState });
    expect(later.dispense).toBeNull(); // ハンドガン/ライフルは0のまま一度も解けていない
  });

  it('回復・爆弾も同じ: 補充の瞬間に成り立っていれば一度解けるまで出さない', () => {
    let state = refillFirstAidKit('player');
    const full = { ...input, ammoHandgun: 9, ammoShotgun: 9, ammoRifle: 9 };
    let r = computeFirstAidKitTick({ ...full, health: 10, onScreenEnemyCount: 9, state });
    expect(r.dispense).toBeNull();
    state = r.nextState;
    r = computeFirstAidKitTick({ ...full, health: 80, onScreenEnemyCount: 9, state }); // HPが戻る
    expect(r.dispense).toBeNull();
    r = computeFirstAidKitTick({ ...full, health: 10, onScreenEnemyCount: 9, state: r.nextState });
    expect(r.dispense).toBe('health');
    r = computeFirstAidKitTick({ ...full, health: 10, onScreenEnemyCount: 9, state: r.nextState });
    expect(r.dispense).toBeNull(); // 爆弾は敵が多いまま=まだ待ち
    r = computeFirstAidKitTick({ ...full, health: 10, onScreenEnemyCount: 1, state: r.nextState });
    r = computeFirstAidKitTick({ ...full, health: 10, onScreenEnemyCount: 9, state: r.nextState });
    expect(r.dispense).toBe('bomb');
  });

  it('③補充後に何も出していない鞄は、払い出し済みが揃っていても投げない', () => {
    const state: FirstAidKitState = {
      ...refillFirstAidKit('player'),
      ammoHandgunDispensed: true, ammoShotgunDispensed: true, ammoRifleDispensed: true,
    };
    expect(isFirstAidKitEmpty(state, 1)).toBe(false);
    expect(isFirstAidKitEmpty({ ...state, anyDispensed: true }, 1)).toBe(true);
  });

  it('④Lv1の守護霊は中身が無い=出撃開始時も補充後も投げない', () => {
    for (const kit of [createGhostFirstAidKitState(), refillFirstAidKit('ghost')]) {
      let state = kit;
      for (let i = 0; i < 60; i++) {
        const r = computeFirstAidKitTick({
          level: 1, ammoTypesUsed: [], ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
          health: 10, maxHealth: 100, onScreenEnemyCount: 0, state,
        });
        expect(r.dispense).toBeNull();
        state = r.nextState;
        expect(isFirstAidKitEmpty(state, 1)).toBe(false);
      }
    }
  });

  it('守護霊のLv2: 補充後はHPが一度半分以上へ戻ってから、また切った時に回復を使う', () => {
    const g = { level: 2, ammoTypesUsed: [], ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0, maxHealth: 100, onScreenEnemyCount: 0 };
    let r = computeFirstAidKitTick({ ...g, health: 10, state: refillFirstAidKit('ghost') });
    expect(r.dispense).toBeNull();
    expect(isFirstAidKitEmpty(r.nextState, 2)).toBe(false);
    r = computeFirstAidKitTick({ ...g, health: 70, state: r.nextState });
    r = computeFirstAidKitTick({ ...g, health: 10, state: r.nextState });
    expect(r.dispense).toBe('health');
    expect(isFirstAidKitEmpty(r.nextState, 2)).toBe(true);
  });

  it('⑤出撃開始時(初期状態)は今どおり、条件が成り立っていれば即出す', () => {
    const r = computeFirstAidKitTick({ ...input, state: createFirstAidKitState() });
    expect(r.dispense).toBe('ammo-handgun');
    const h = computeFirstAidKitTick({ ...input, ammoHandgun: 9, ammoShotgun: 9, ammoRifle: 9, health: 10, state: createFirstAidKitState() });
    expect(h.dispense).toBe('health');
    // プレイヤーLv1: 弾を出し切れば空=投げる(今どおり)
    let state = createFirstAidKitState();
    for (let i = 0; i < 3; i++) state = computeFirstAidKitTick({ ...input, level: 1, state }).nextState;
    expect(isFirstAidKitEmpty(state, 1)).toBe(true);
  });
});
