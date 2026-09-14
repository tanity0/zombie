// §8 v2(寄り演目のVFX・社長承認2026-09-14)の不変条件。監査で(A)になった穴を機械で固定する。
import { describe, expect, it } from 'vitest';
import {
  cineFxVocab, cineFxBacklightTint, cineFxHasStreak, cineFxSetFor, cineFxTargetsSelf,
  cineFxPushFollow, cineFxShutterAt, cineFxWipeAt, cineFxDeathLight, cineFxRepeatMult,
  cineFxNearDust, cineFxMotes, cineFxDustStep,
  CINE_FX_SHUTTER_HOLD_MS, CINE_FX_SHUTTER_OUT_MS, CINE_FX_VIGNETTE_LAG_MS,
  CINE_FX_DEATH_FADE_FROM, CINE_FX_DEATH_FADE_MS, CINE_FX_REPEAT_MS, CINE_FX_REPEAT_MULT,
  CINE_FX_DUST_NEAR_SPEED, CINE_FX_DUST_FAR_SPEED, CINE_FX_DUST_DRIFT,
} from './cineFx';

describe('ステージ語彙(farBackdrop 7値を全部受ける・v1は3つしか書いていなかった)', () => {
  it('森/雪/城塞/星雲=forest、廃都=city、研究所=lab、訓練とエンディングは出さない', () => {
    expect(cineFxVocab('', '')).toBe('forest');
    expect(cineFxVocab('snow', '')).toBe('forest');
    expect(cineFxVocab('stage5', '')).toBe('forest');
    expect(cineFxVocab('stage7', '')).toBe('forest');
    expect(cineFxVocab('city', '')).toBe('city');
    expect(cineFxVocab('tutorial', '')).toBe('none');
    expect(cineFxVocab('ending', '')).toBe('none');
    expect(cineFxVocab('', 'unknown-theme')).toBe('forest');
  });
  it('研究所は遠景に関係なく lab(社長裁定: 語彙を差し替えて出す)。蛍光灯なので条を作らない', () => {
    expect(cineFxVocab('city', 'lab')).toBe('lab');
    expect(cineFxHasStreak('lab')).toBe(false);
    expect(cineFxHasStreak('forest')).toBe(true);
    expect(cineFxHasStreak('city')).toBe(true);
  });
  it('逆光の色は場面ごと。彩度が低い=予告の赤・カウンター不可の紫と読み違えようがない', () => {
    for (const v of ['forest', 'city', 'lab'] as const) {
      const t = cineFxBacklightTint(v);
      const c = [(t >> 16) & 0xff, (t >> 8) & 0xff, t & 0xff];
      // 彩度の物差し: 最小/最大。純赤(255,0,0)=0・紫(160,0,255)=0 に対し、淡い光は 0.55 以上。
      expect(Math.min(...c) / Math.max(...c), `${v} は淡い光`).toBeGreaterThanOrEqual(0.55);
      expect(Math.max(...c), `${v} は明るい側`).toBeGreaterThanOrEqual(0xd0);
    }
  });
});

describe('演目ごとに何を出すか', () => {
  it('処刑2種は全部出す。カウンターは鋭い物を1つ(ワイプだけ)。救援は出さない', () => {
    for (const k of ['kill', 'execute'] as const) {
      const s = cineFxSetFor(k);
      expect(s.shutter && s.wipe && s.backlight && s.rim && s.bokeh && s.dust && s.vignette).toBe(true);
      expect(s.dying).toBe(false);
    }
    const c = cineFxSetFor('counter');
    expect(c.wipe).toBe(true);
    expect(c.shutter || c.backlight || c.bokeh || c.dust || c.vignette).toBe(false);
    const r = cineFxSetFor('rescue');
    expect(Object.values(r).some(Boolean)).toBe(false);
  });
  it('死亡と幻影→自分の致命は同じ扱い=「減らす」ではなく「種類を変える」(dying)', () => {
    for (const k of ['death', 'fatal-on-player'] as const) {
      const s = cineFxSetFor(k);
      expect(s.dying).toBe(true);
      expect(s.backlight, '逆光は出す(出してから消すため)').toBe(true);
      expect(s.shutter || s.wipe || s.rim, '打撃の層は出さない=負けを祝祭にしない').toBe(false);
      expect(cineFxTargetsSelf(k), '相手が自分=「相手の背後」が定義できない').toBe(true);
    }
    expect(cineFxTargetsSelf('execute')).toBe(false);
  });
});

describe('押し込みの追従値(cam.pushNorm を直接読まない理由の機械化)', () => {
  it('1フレームで跳ばない(割り込みで 0→1 が来ても上限速度で追う)', () => {
    let p = 0;
    p = cineFxPushFollow(p, 1, 16.7);
    expect(p).toBeLessThan(0.2);
    expect(p).toBeGreaterThan(0);
  });
  it('カメラが止まった後も遅れて目標へ届く(lag ぶんで到達)', () => {
    let p = 0;
    for (let t = 0; t < CINE_FX_VIGNETTE_LAG_MS; t += 16.7) p = cineFxPushFollow(p, 1, 16.7);
    expect(p).toBeCloseTo(1, 2);
  });
  it('dt 基準=大きいフレーム落ちでも同じ時間で到達する(60fps前提の定数を書かない)', () => {
    const slow = cineFxPushFollow(0, 1, CINE_FX_VIGNETTE_LAG_MS);
    expect(slow).toBe(1);
  });
  it('下げる方向にも同じ速度で追う(kill→death の割り込みで 1→0 が来る)', () => {
    expect(cineFxPushFollow(1, 0, 16.7)).toBeGreaterThan(0.8);
  });
});

describe('シャッター(尺は1本・v1は本文の2箇所で 70 と 90 が食い違っていた)', () => {
  it('立ち上がりは1コマで最大、保持のあいだ最大、その後 ease-out で 0 へ', () => {
    expect(cineFxShutterAt(0)).toBe(1);
    expect(cineFxShutterAt(CINE_FX_SHUTTER_HOLD_MS)).toBe(1);
    const mid = cineFxShutterAt(CINE_FX_SHUTTER_HOLD_MS + CINE_FX_SHUTTER_OUT_MS / 2);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
    expect(cineFxShutterAt(CINE_FX_SHUTTER_HOLD_MS + CINE_FX_SHUTTER_OUT_MS)).toBe(0);
  });
  it('全体でヒットストップ(100ms)より長くならない=停止が明ける頃に色が戻る', () => {
    expect(CINE_FX_SHUTTER_HOLD_MS + CINE_FX_SHUTTER_OUT_MS).toBeLessThanOrEqual(125);
  });
});

describe('指向性ワイプ(集中線ではなく1本)', () => {
  it('出は速く(前半で半分以上進む)、消えは遅れる', () => {
    const half = cineFxWipeAt(60, 120);
    expect(half.frac).toBeGreaterThan(0.9); // easeOutExpo=刃の速さ
    expect(cineFxWipeAt(0, 120).alpha).toBe(0);
    expect(cineFxWipeAt(18, 120).alpha).toBeGreaterThan(0.9); // 立ち上がりは鋭い
    expect(cineFxWipeAt(120, 120).alpha).toBeCloseTo(0, 6);
  });
});

describe('死亡=光が失われる(効果を減らすのではなく種類を変える)', () => {
  it('押し込みが閾値を越えるまでは落ちない。越えたら加速して消える', () => {
    expect(cineFxDeathLight(CINE_FX_DEATH_FADE_FROM - 0.01, 999)).toBe(1);
    expect(cineFxDeathLight(1, 0)).toBe(1);
    const mid = cineFxDeathLight(1, CINE_FX_DEATH_FADE_MS / 2);
    expect(mid).toBeGreaterThan(0.5); // 落ちは加速する=前半はまだ明るい
    expect(cineFxDeathLight(1, CINE_FX_DEATH_FADE_MS)).toBe(0);
  });
});

describe('反復への減衰(打撃の層だけ弱める)', () => {
  it('直近に演目があれば弱め、時間が空けば戻る。初回は等倍', () => {
    expect(cineFxRepeatMult(0, 10_000)).toBe(1);
    expect(cineFxRepeatMult(10_000, 10_000 + CINE_FX_REPEAT_MS - 1)).toBe(CINE_FX_REPEAT_MULT);
    expect(cineFxRepeatMult(10_000, 10_000 + CINE_FX_REPEAT_MS)).toBe(1);
  });
});

describe('ばらし方(等確率乱数=均質の別名、にしない)', () => {
  it('手前の埃は1枚だけ突出して大きい(他の2倍以上)', () => {
    for (const seed of [1, 7, 42, 999]) {
      const ps = cineFxNearDust(seed);
      const sorted = [...ps].map(p => p.scale).sort((a, b) => b - a);
      expect(sorted[0] / sorted[1], `seed=${seed}`).toBeGreaterThanOrEqual(2.5);
    }
  });
  it('同じ種なら同じ配り(描画がフレームごとに暴れない)', () => {
    expect(cineFxNearDust(5)).toEqual(cineFxNearDust(5));
    expect(cineFxMotes(5)).toEqual(cineFxMotes(5));
  });
  it('ボケ量が1枚ずつ違う=隣り合う層で「1枚の板」に戻らない', () => {
    const blurs = new Set(cineFxNearDust(3).map(p => Math.round(p.blurPx)));
    expect(blurs.size).toBeGreaterThan(1);
  });
  it('火の粉は手前と奥が混ざる', () => {
    const ms = cineFxMotes(11);
    expect(ms.some(m => m.near)).toBe(true);
    expect(ms.some(m => !m.near)).toBe(true);
  });
});

describe('埃の速度(視差=手前ほど速く逆向き。v1は総移動が画面幅の1.7%しかなかった)', () => {
  it('手前は奥より十分速い(4倍以上)', () => {
    expect(CINE_FX_DUST_NEAR_SPEED / CINE_FX_DUST_FAR_SPEED).toBeGreaterThanOrEqual(4);
  });
  it('減速しても 0 に貼り付かず、終端速度へ落ち着く', () => {
    let v = CINE_FX_DUST_NEAR_SPEED;
    for (let i = 0; i < 400; i++) v = cineFxDustStep(v, CINE_FX_DUST_DRIFT, 16.7);
    expect(v).toBeCloseTo(CINE_FX_DUST_DRIFT, 4);
    expect(v).toBeGreaterThan(0);
  });
  it('保持の尺(560ms)で画面幅の10%以上動く=「小さくて見えない」にしない', () => {
    let v = CINE_FX_DUST_NEAR_SPEED, moved = 0;
    for (let t = 0; t < 560; t += 16.7) { moved += v * (16.7 / 1000); v = cineFxDustStep(v, CINE_FX_DUST_DRIFT, 16.7); }
    expect(moved).toBeGreaterThan(0.10);
  });
});
