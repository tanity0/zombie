// research/THOR_ISSEN_REWORK.md §1(無の境地・必中一閃)と §8-4(ボット)の受け入れ条件を機械化する。
//
// ここで固めているのは「配線側の誤りだけがすり抜ける」を防ぐための不変条件:
//  ①紫円の半径が**1つの定数**から来ている(絵・引き金・ボットの3箇所で複製していない)
//  ②引き金は**近接スイング専用の打刻のエッジ**で見る(カウンター演出やショップでは立たない)
//  ③**時計を混ぜない**(絶対時刻の比較をしていない=打刻が進んだかどうかだけを見る)
//  ④必中フラグは**有無だけ**で判定する(時刻を比較しない=v0.25.3784の off-by-one の再発防止)
import { describe, it, expect } from 'vitest';
import {
  THOR_NIHIL_STATE, thorNihilRadius, stampMeleeSwingCommit, isInsideNihilCircle,
  meleeSwingCommitted, shouldTriggerGuaranteedIssen, isGuaranteedIssenNow, botHoldsMeleeForNihil,
} from './thorNihil';
import { HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';
import { botSkillProfile } from './botSkill';
import type { Enemy } from '../types/game';

const R = HB_TH.issen.nihilRadius;

// 判定に使う最小限だけを持つ「敵」。botHoldsMeleeForNihil は Pick で受けるのでこれで足りる。
const thorAt = (x: number, y: number, bossState: string) =>
  ({ type: 'thor', bossState, x: x - 20, y: y - 20, width: 40, height: 40 }) as unknown as Enemy;

describe('州名と半径の出どころ(§1-1 受け入れ条件3)', () => {
  it('州名は issen-nihil(接尾辞 -windup を付けない=語尾ルールで「カウンター可」と誤答させない)', () => {
    expect(THOR_NIHIL_STATE).toBe('issen-nihil');
    expect(THOR_NIHIL_STATE.endsWith('-windup')).toBe(false);
    expect(THOR_NIHIL_STATE.endsWith('-recover')).toBe(false);
  });
  it('★紫円の半径は台帳の1定数(issen.nihilRadius)から来る=片方だけ動く実装ではない', () => {
    expect(thorNihilRadius()).toBe(HB_TH.issen.nihilRadius);
  });
  it('ボスメーカーで半径を動かすと、引き金の域もボットの「振らない」域も同時に動く(複製していない証明)', () => {
    const orig = HB_TH.issen.nihilRadius;
    try {
      HB_TH.issen.nihilRadius = 40;
      // 引き金側: 半径40の外(50px)では立たない
      expect(shouldTriggerGuaranteedIssen({
        bossState: THOR_NIHIL_STATE, bcx: 0, bcy: 0, pcx: 50, pcy: 0,
        prevCommitAt: 100, curCommitAt: 200, alreadyFired: false,
      })).toBe(false);
      // ボット側: 同じ50pxで「振らない」も解除される
      expect(botHoldsMeleeForNihil(botSkillProfile('master'), 50, 0, [thorAt(0, 0, THOR_NIHIL_STATE)])).toBe(false);
      HB_TH.issen.nihilRadius = 400;
      expect(shouldTriggerGuaranteedIssen({
        bossState: THOR_NIHIL_STATE, bcx: 0, bcy: 0, pcx: 50, pcy: 0,
        prevCommitAt: 100, curCommitAt: 200, alreadyFired: false,
      })).toBe(true);
      expect(botHoldsMeleeForNihil(botSkillProfile('master'), 50, 0, [thorAt(0, 0, THOR_NIHIL_STATE)])).toBe(true);
    } finally {
      HB_TH.issen.nihilRadius = orig;
    }
  });
});

describe('打刻(stampMeleeSwingCommit)とエッジ(§1-3「時計を混ぜない」)', () => {
  it('打刻は meleeSwingCommitAt だけを書き換える(他のフィールドは触らない)', () => {
    const p = { meleeSwingCommitAt: 0, meleeSwingAt: 111, counterWindowEnd: 222 };
    const n = stampMeleeSwingCommit(p, 999);
    expect(n).toEqual({ meleeSwingCommitAt: 999, meleeSwingAt: 111, counterWindowEnd: 222 });
    expect(p.meleeSwingCommitAt).toBe(0); // 元は破壊しない
  });
  it('エッジ=前フレームから進んだ時だけ真(絶対時刻の比較をしない)', () => {
    expect(meleeSwingCommitted(1_700_000_000_000, 1_700_000_000_016)).toBe(true);
    expect(meleeSwingCommitted(1_700_000_000_016, 1_700_000_000_016)).toBe(false); // 同じ振りを2度読まない
    expect(meleeSwingCommitted(1_700_000_000_016, 1_700_000_000_000)).toBe(false);
  });
  it('未スイング(0)は打刻とみなさない', () => {
    expect(meleeSwingCommitted(0, 0)).toBe(false);
  });
});

describe('必中一閃の引き金(§1-3 受け入れ条件1/2/7)', () => {
  const base = {
    bossState: THOR_NIHIL_STATE, bcx: 0, bcy: 0, pcx: R - 10, pcy: 0,
    prevCommitAt: 1000, curCommitAt: 1016, alreadyFired: false,
  };
  it('紫円の内側で振った、その tick で立つ', () => {
    expect(shouldTriggerGuaranteedIssen(base)).toBe(true);
  });
  it('紫円の外側で振っても立たない(300ms満了後に通常の赤予告へ進む)', () => {
    expect(shouldTriggerGuaranteedIssen({ ...base, pcx: R + 10 })).toBe(false);
  });
  it('円の境界ちょうどは内側(プレイヤーの中心で見る=自機半径は足さない)', () => {
    expect(shouldTriggerGuaranteedIssen({ ...base, pcx: R })).toBe(true);
    expect(isInsideNihilCircle(0, 0, R, 0, R)).toBe(true);
    expect(isInsideNihilCircle(0, 0, R + 0.1, 0, R)).toBe(false);
  });
  it('★振っていなければ立たない=カウンター成立(markMeleeSwingFx)や武器庫サークルでは発動しない', () => {
    // カウンター成立/ショップは meleeSwingCommitAt を**書かない**ので、打刻は前フレームのまま進まない。
    expect(shouldTriggerGuaranteedIssen({ ...base, curCommitAt: base.prevCommitAt })).toBe(false);
  });
  it('紫の州でなければ立たない(赤予告中に振っても必中にはならない=裁定1の後半)', () => {
    for (const st of ['issen-windup', 'issen-dash', 'issen-recover', 'tsuki-windup', 'chase', undefined]) {
      expect(shouldTriggerGuaranteedIssen({ ...base, bossState: st }), String(st)).toBe(false);
    }
  });
  it('1つの無の境地から発動できるのは1回(2重発火の防止)', () => {
    expect(shouldTriggerGuaranteedIssen({ ...base, alreadyFired: true })).toBe(false);
  });
});

describe('必中の「カウンターされない」窓(§1-3 受け入れ条件5/9/10)', () => {
  it('フラグが立っている間は真(★時刻を比較しない)', () => {
    expect(isGuaranteedIssenNow(2000)).toBe(true);
    expect(isGuaranteedIssenNow(1)).toBe(true);
  });
  it('通常の一閃(フラグ未設定/0)では閉じない=従来どおりカウンターできる', () => {
    expect(isGuaranteedIssenNow(undefined)).toBe(false);
    expect(isGuaranteedIssenNow(0)).toBe(false);
  });
  // ★v0.25.3784(検収監査 重大3)の再発防止。旧実装は `gameTime < issenGuaranteedUntil` の排他で、
  // フラグの値が `bossStateUntil` と同値だったため、**州の最終フレーム**(帯判定がまだ走る最後の1回)
  // だけ必中が切れていた。COUNTER_WINDOW(400ms) > dashMs(280ms) なので引き金の振りが開けた窓は
  // まだ開いており、「必中で被弾したうえに Counter! も出る」になっていた。
  it('★州の最終フレーム(gameTime が issen-dash の終了時刻に達したフレーム)でもカウンターされない', () => {
    const dashStart = 10_000;
    const dashMs = HB_TH.issen.dashMs;
    const flag = dashStart + dashMs;          // 実装が入れる値(= bossStateUntil と同値)
    const lastFrameGameTime = dashStart + dashMs; // 「州が終わる」と判定されるフレームの時刻
    // 旧実装(gameTime < flag)ならここが false=カウンターが通ってしまっていた。
    expect(lastFrameGameTime < flag).toBe(false);
    expect(isGuaranteedIssenNow(flag)).toBe(true);
  });
  it('★フラグを落とすのは「州を抜ける所」だけ=落とせば通常どおりカウンターできる', () => {
    expect(isGuaranteedIssenNow(0)).toBe(false);
  });
});

describe('ボット(§8-4 受け入れ条件1/2/3/4)', () => {
  const nihilThor = [thorAt(0, 0, THOR_NIHIL_STATE)];
  it('master / skilled は紫円の内側で近接を振らない', () => {
    for (const s of ['master', 'skilled'] as const) {
      expect(botHoldsMeleeForNihil(botSkillProfile(s), R - 10, 0, nihilThor), s).toBe(true);
    }
  });
  it('novice / casual の挙動は1つも変わらない(常に振る=完全なno-op)', () => {
    for (const s of ['novice', 'casual'] as const) {
      expect(botHoldsMeleeForNihil(botSkillProfile(s), R - 10, 0, nihilThor), s).toBe(false);
    }
  });
  it('円の外へ出た/紫が明けた後は従来どおり振る', () => {
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R + 10, 0, nihilThor)).toBe(false);
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R - 10, 0, [thorAt(0, 0, 'issen-windup')])).toBe(false);
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R - 10, 0, [])).toBe(false);
  });
  it('トール以外のボスが同じ位置に居ても止めない(type でゲートしている)', () => {
    const notThor = [{ ...thorAt(0, 0, THOR_NIHIL_STATE), type: 'mimir' } as unknown as Enemy];
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R - 10, 0, notThor)).toBe(false);
  });
  it('ダイヤルの段の単調性(上位ほど≧)を壊していない', () => {
    const v = (s: 'novice' | 'casual' | 'skilled' | 'master') =>
      (botSkillProfile(s).respectsNihilCircle ? 1 : 0);
    expect(v('novice')).toBeLessThanOrEqual(v('casual'));
    expect(v('casual')).toBeLessThanOrEqual(v('skilled'));
    expect(v('skilled')).toBeLessThanOrEqual(v('master'));
  });
});
