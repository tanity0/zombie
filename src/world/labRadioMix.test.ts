// labRadioMixT(ステージ2の通常BGM→廊下BGM クロスフェード混合比)の境界条件。
import { describe, it, expect } from 'vitest';
import { labRadioMixT } from './labRadioMix';

describe('labRadioMixT(idol方向への進捗50%で切り替わり始め、90%で完全に切り替わる)', () => {
  it('idolが未配置(null)なら常に0', () => {
    expect(labRadioMixT(null, 5000)).toBe(0);
    expect(labRadioMixT(null, -5000)).toBe(0);
  });

  it('d=0(スタート地点)ではt=0', () => {
    expect(labRadioMixT(7000, 0)).toBe(0);
    expect(labRadioMixT(-7000, 0)).toBe(0);
  });

  it('資料の側(idolと反対方向)へ歩いた時はt=0のまま(dが負→0にクランプ)', () => {
    // idolがx>0(右)の時、資料は左側。左(負)へ歩く=idolと反対方向。
    expect(labRadioMixT(7000, -3000)).toBe(0);
    // idolがx<0(左)の時、資料は右側。右(正)へ歩く=idolと反対方向。
    expect(labRadioMixT(-7000, 3000)).toBe(0);
  });

  it('進捗ちょうど50%(d/L=0.5)でt=0(切り替わり始めの境界)', () => {
    expect(labRadioMixT(7000, 3500)).toBe(0);
    expect(labRadioMixT(-7000, -3500)).toBe(0);
  });

  it('進捗70%(d/L=0.7)でt=0.5', () => {
    expect(labRadioMixT(7000, 4900)).toBeCloseTo(0.5, 10);
    expect(labRadioMixT(-7000, -4900)).toBeCloseTo(0.5, 10);
  });

  it('進捗90%(d/L=0.9)でt=1(完全に切り替わる境界)', () => {
    expect(labRadioMixT(7000, 6300)).toBeCloseTo(1, 10);
  });

  it('進捗90%を超えてもt=1でクランプ(idolに到達/追い越しても1を超えない)', () => {
    expect(labRadioMixT(7000, 7000)).toBe(1);
    expect(labRadioMixT(7000, 9000)).toBe(1); // idolを追い越しても1のまま
  });

  it('L=0(idolが原点=退化ケース)は0除算せず常に0', () => {
    expect(labRadioMixT(0, 0)).toBe(0);
    expect(labRadioMixT(0, 5000)).toBe(0);
  });
});

import { labRadioIdolDownFade, LAB_RADIO_IDOL_DOWN_FADE_MS } from './labRadioMix';
describe('アイドルを倒したらアイドル方面のBGMを止める(社長 2026-10-24)', () => {
  it('倒す前は1、倒した瞬間から絞り、絞り切ったら0', () => {
    expect(labRadioIdolDownFade(0, 99999)).toBe(1);
    expect(labRadioIdolDownFade(1000, 1000)).toBe(1);
    const mid = labRadioIdolDownFade(1000, 1000 + LAB_RADIO_IDOL_DOWN_FADE_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(labRadioIdolDownFade(1000, 1000 + LAB_RADIO_IDOL_DOWN_FADE_MS)).toBe(0);
  });
});
