// 賞金首4種のチューニングテーブル(bountyScript.ts)の不変条件。
//
// 目的は2つだけ:
//  ① **テーブル化で数字が1つも変わっていないこと**(BOSS_MAKER.md §2-4「既定値が現行値と1つも
//     変わらないこと」=リファクタとして無変更であることの機械化)。移設前の実装値をここに書き写して
//     突き合わせる。将来の**意図的な**バランス変更ではこのテストを一緒に更新する(=無言で変わらない)。
//  ② **輸入技の複製値が本家とズレていないこと**。テーブルは store を import しない葉なので、
//     werewolf/pumpkin の値は複製になっている。実体をここで import して機械検査する
//     (bossTelegraph.test.ts / bountyTriple.test.ts と同じ確立済みの作法)。
import { describe, it, expect } from 'vitest';
import {
  BOUNTY_RANGED_TUNING, BOUNTY_RANGED_TUNING_DEFAULTS,
  BOUNTY_MELEE_TUNING, BOUNTY_MELEE_TUNING_DEFAULTS,
  BOUNTY_BALANCE_TUNING, BOUNTY_BALANCE_TUNING_DEFAULTS,
  BOUNTY_MAIKO_TUNING, BOUNTY_MAIKO_TUNING_DEFAULTS,
} from './bountyScript';
import { BOSS_RECOVER_FLOOR_MS } from './bossTelegraph';
import {
  WEREWOLF_WINDUP_MS, WEREWOLF_CHARGE_MAX_MS, WEREWOLF_CHARGE_SPEED_MULT,
  PUMPKIN_CROUCH_MS,
} from '../store/gameStore';

describe('既定値=移設前の実装値(テーブル化で挙動が1つも変わっていない)', () => {
  it('バス停(bounty-ranged)', () => {
    const d = BOUNTY_RANGED_TUNING_DEFAULTS;
    expect(d.kite).toEqual({ min: 340, max: 560 });
    expect(d.push).toEqual({
      pickRange: 110, windup: 500, reach: 82, halfWidth: 34, damage: 8,
      recover: 900, kb: { distPx: 100, ms: 240 },
    });
    expect(d.shot).toEqual({ speed: 260, damage: 10, size: 10 });
    expect(d.laser).toEqual({ damage: 24, recover: 900, cdMs: 9000 });
    expect(d.escort).toEqual({ count: 2 });
    expect(d.triple).toEqual({ recover: 900 });
    expect(d.signTipPx).toBe(120);
  });

  it('馬乗り(bounty-melee)', () => {
    const d = BOUNTY_MELEE_TUNING_DEFAULTS;
    expect(d.meleeMax).toBe(130);
    expect(d.farMs).toBe(2000);
    expect(d.charge).toEqual({ windup: 600, maxMs: 2800, speedMult: 9, reach: 420, recover: 900 });
    expect(d.whip360).toEqual({ windup: 750, active: 420, radius: 170, damage: 12 });
    expect(d.combo).toEqual({
      range: 130, halfWidth: 28, windup: [480, 480, 900], damage: [14, 14, 20],
      stepRecover: 220, finishRecover: 1400, kb: { distPx: 70, ms: 220 },
    });
    expect(d.snipe).toEqual({ windup: 1100, active: 200, range: 900, halfWidth: 40, damage: 22, recover: 900 });
  });

  it('鋏(bounty-balance)', () => {
    const d = BOUNTY_BALANCE_TUNING_DEFAULTS;
    expect(d.nearMax).toBe(170);
    // sweep.range=250(v0.25.3579) / damage=25(v0.25.3582貼り戻し) / leap一式=v0.25.3576貼り戻し(社長確定)。
    expect(d.sweep).toEqual({ range: 250, halfWidth: 40, windup: 750, damage: 25, recover: 900 });
    // 3連発: windup[1000,350,500]+帯200(単発から分離)= v0.25.3582 貼り戻し+手書き追記(社長確定)。
    expect(d.sweepTriple).toEqual({
      chance: 0.5, halfWidth: 30, range: 200, windup: [1000, 350, 500], stepRecover: 150, damage: 18,
    });
    expect(d.leap).toEqual({ radius: 110, windup: 1000, airMs: 300, recover: 500, damage: 22 });
  });

  it('舞妓(bounty-maiko)', () => {
    const d = BOUNTY_MAIKO_TUNING_DEFAULTS;
    expect(d.nearMax).toBe(150);
    expect(d.farMin).toBe(380);
    expect(d.phaseHpFrac).toBe(0.5);
    expect(d.reposeMs).toBe(500);
    expect(d.naginata).toEqual({
      range: 140, halfWidth: 30, windup: [700, 1150], windup1: [550, 750], windup2: [900, 1300],
      damage: 16, recover: 900, stepRecover: 220,
    });
    expect(d.spin).toEqual({
      radius: 180, windup: [800, 1300], active: 500, lungePx: 220, damage: 14, recover: 900,
    });
    expect(d.suiu).toEqual({
      radius: 100, finalRadiusMult: 1.8, hopInterval: [850, 1050], travelMs: 260,
      damage: 16, offsetRange: 90, recover: 1500,
    });
    expect(d.boom).toEqual({
      range: 1000, hitRadius: 30, windup: 750, outMs: 420, backMs: 420, damage: 14, recover: 900,
    });
  });
});

describe('輸入技の複製値が本家とズレていない(このファイルはstoreを触らない葉なので複製になっている)', () => {
  it('突進=werewolf(gameStore)', () => {
    const c = BOUNTY_MELEE_TUNING_DEFAULTS.charge;
    expect(c.windup).toBe(WEREWOLF_WINDUP_MS);
    expect(c.maxMs).toBe(WEREWOLF_CHARGE_MAX_MS);
    // 社長指示v0.25.3473「三倍くらいでいいかも」=狼の突進倍率のさらに3倍。
    expect(c.speedMult).toBe(WEREWOLF_CHARGE_SPEED_MULT * 3);
  });

  it('跳びかかり=鋏専用の裁定値(v0.25.3576にpumpkin輸入から独立・ボスメーカー貼り戻し)', () => {
    // 旧: pumpkin(gameStore)との複製一致を検査していた。社長が実機チューニングで鋏専用の値に
    // 確定したため、以後は**裁定値そのもの**を固定する(黙って動いたら落ちる)。
    const l = BOUNTY_BALANCE_TUNING_DEFAULTS.leap;
    expect(l.windup).toBe(1000);
    expect(l.airMs).toBe(300);
    expect(l.recover).toBe(500);
    expect(l.radius).toBe(110);
    // pumpkin本家の値が変わってもこちらは動かない(独立の宣言)。
    expect(l.windup).not.toBe(PUMPKIN_CROUCH_MS);
  });
});

describe('硬直の下限(パニッシュ窓のfloor)が既定値に効いている', () => {
  it('floor未満で書いた硬直はfloorまで持ち上がっている(移設前と同じ扱い)', () => {
    // 移設前は withRecoverFloor(700) 等で包んでいた。テーブルには**包んだ後の値**を入れてある。
    expect(BOUNTY_RANGED_TUNING_DEFAULTS.push.recover).toBe(BOSS_RECOVER_FLOOR_MS);
    expect(BOUNTY_MELEE_TUNING_DEFAULTS.charge.recover).toBe(BOSS_RECOVER_FLOOR_MS);
    // floorより長い指定はそのまま。
    expect(BOUNTY_MELEE_TUNING_DEFAULTS.combo.finishRecover).toBeGreaterThan(BOSS_RECOVER_FLOOR_MS);
    expect(BOUNTY_MAIKO_TUNING_DEFAULTS.suiu.recover).toBeGreaterThan(BOSS_RECOVER_FLOOR_MS);
  });
});

describe('既定値はテーブルと別のオブジェクト(リセットが効く)', () => {
  it('入れ子まで参照を共有していない', () => {
    const pairs = [
      [BOUNTY_RANGED_TUNING.push, BOUNTY_RANGED_TUNING_DEFAULTS.push],
      [BOUNTY_MELEE_TUNING.combo, BOUNTY_MELEE_TUNING_DEFAULTS.combo],
      [BOUNTY_MELEE_TUNING.combo.windup, BOUNTY_MELEE_TUNING_DEFAULTS.combo.windup],
      [BOUNTY_BALANCE_TUNING.leap, BOUNTY_BALANCE_TUNING_DEFAULTS.leap],
      [BOUNTY_MAIKO_TUNING.suiu, BOUNTY_MAIKO_TUNING_DEFAULTS.suiu],
      [BOUNTY_MAIKO_TUNING.spin.windup, BOUNTY_MAIKO_TUNING_DEFAULTS.spin.windup],
    ] as const;
    for (const [live, def] of pairs) expect(live).not.toBe(def);
  });

  it('中身は一致している(起動直後は「既定から変更なし」)', () => {
    expect(BOUNTY_RANGED_TUNING).toEqual(BOUNTY_RANGED_TUNING_DEFAULTS);
    expect(BOUNTY_MELEE_TUNING).toEqual(BOUNTY_MELEE_TUNING_DEFAULTS);
    expect(BOUNTY_BALANCE_TUNING).toEqual(BOUNTY_BALANCE_TUNING_DEFAULTS);
    expect(BOUNTY_MAIKO_TUNING).toEqual(BOUNTY_MAIKO_TUNING_DEFAULTS);
  });
});
