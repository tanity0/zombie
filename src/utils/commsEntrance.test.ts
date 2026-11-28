import { describe, expect, it } from 'vitest';
import {
  commsEntranceKind, commsEntranceOffsetPx, commsEntranceSideShiftPx, commsEntranceSound, commsEntranceTiming, commsRowsShift,
  commsSpeakerKey, shouldHideCompanionOnEntrance, shouldPlayCommsEntrance,
  COMMS_CONTINUE_WINDOW_MS, COMMS_ENTRANCE_MIN_TRAVEL, COMMS_FLY_SIDE_SHIFT_PX, COMMS_MOVE_MS, COMMS_SLOW_MOVE_MS,
} from './commsEntrance';

const EDGAR = commsSpeakerKey({ name: 'エドガー' });
const JOSEPH = commsSpeakerKey({ name: 'ジョセフ' });

describe('shouldPlayCommsEntrance', () => {
  it('消えている所から現れた時だけ入る', () => {
    expect(shouldPlayCommsEntrance(false, true)).toBe(true);
    expect(shouldPlayCommsEntrance(true, true)).toBe(false); // 出たまま次の行へ=文字だけ替える
    expect(shouldPlayCommsEntrance(true, false)).toBe(false);
    expect(shouldPlayCommsEntrance(false, false)).toBe(false);
  });
});

describe('commsSpeakerKey', () => {
  it('名前と立ち絵の上書きが両方同じなら同じ話者', () => {
    expect(commsSpeakerKey({ name: 'グレン' })).toBe(commsSpeakerKey({ name: 'グレン' }));
    expect(commsSpeakerKey({ name: 'グレン' })).not.toBe(commsSpeakerKey({ name: 'グレン', portrait: 'グレン(変異)' }));
    expect(EDGAR).not.toBe(JOSEPH);
  });
});

describe('commsEntranceKind', () => {
  it('会話の最初の1行: スマホは飛び込み、横長はせり上がり', () => {
    expect(commsEntranceKind(Infinity, null, EDGAR, false, false)).toBe('fly');
    expect(commsEntranceKind(Infinity, null, EDGAR, false, true)).toBe('rise');
    expect(commsEntranceKind(COMMS_CONTINUE_WINDOW_MS, EDGAR, EDGAR, false, false)).toBe('fly'); // ちょうど1500msは新しい会話
  });
  it('同じ話者が消えて1500ms以内に出たら続き(スマホ・横長とも)', () => {
    expect(commsEntranceKind(500, EDGAR, EDGAR, false, false)).toBe('continue'); // キューの行間(500ms)
    expect(commsEntranceKind(COMMS_CONTINUE_WINDOW_MS - 1, EDGAR, EDGAR, false, true)).toBe('continue');
  });
  it('話者が替わったら間隔が短くても最初の1行の扱い', () => {
    expect(commsEntranceKind(500, EDGAR, JOSEPH, false, false)).toBe('fly');
    expect(commsEntranceKind(500, EDGAR, JOSEPH, false, true)).toBe('rise');
    expect(commsEntranceKind(500, commsSpeakerKey({ name: 'グレン' }), commsSpeakerKey({ name: 'グレン', portrait: 'グレン(変異)' }), false, false)).toBe('fly');
  });
  it('ゆっくり話す行: 最初の1行は飛び込み/せり上がり、続きは移動なしのフェード', () => {
    expect(commsEntranceKind(Infinity, null, EDGAR, true, false)).toBe('fly');
    expect(commsEntranceKind(Infinity, null, EDGAR, true, true)).toBe('rise');
    expect(commsEntranceKind(200, EDGAR, EDGAR, true, true)).toBe('fade');
    expect(commsEntranceKind(200, JOSEPH, EDGAR, true, false)).toBe('fly');
  });
});

describe('commsEntranceTiming / commsRowsShift', () => {
  it('ゆっくり話す行は長い尺', () => {
    expect(commsEntranceTiming(false).moveMs).toBe(COMMS_MOVE_MS);
    expect(commsEntranceTiming(true).moveMs).toBe(COMMS_SLOW_MOVE_MS);
    expect(commsEntranceTiming(true).fadeMs).toBeGreaterThan(commsEntranceTiming(false).fadeMs);
  });
  it('行の段は、板が入る時は板の移動と同じ尺、外れた時は 260ms の滑らかな詰め', () => {
    expect(commsRowsShift(true, false).ms).toBe(COMMS_MOVE_MS);
    expect(commsRowsShift(true, true).ms).toBe(COMMS_SLOW_MOVE_MS);
    expect(commsRowsShift(false, false)).toEqual({ ms: 260, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
  });
});

describe('shouldHideCompanionOnEntrance', () => {
  it('入りの時点で行が見えていれば伏せない。無い所からなら飛び込み・せり上がりの間だけ伏せる', () => {
    expect(shouldHideCompanionOnEntrance('fly', false)).toBe(true);
    expect(shouldHideCompanionOnEntrance('rise', false)).toBe(true);
    expect(shouldHideCompanionOnEntrance('fly', true)).toBe(false);
    expect(shouldHideCompanionOnEntrance('rise', true)).toBe(false);
    expect(shouldHideCompanionOnEntrance('continue', false)).toBe(false);
    expect(shouldHideCompanionOnEntrance('fade', false)).toBe(false);
  });
});

describe('commsEntranceSound', () => {
  it('最初の1行(飛び込み・せり上がり)だけ鳴る', () => {
    expect(commsEntranceSound('fly', false)).toBe(true);
    expect(commsEntranceSound('rise', false)).toBe(true);
    expect(commsEntranceSound('continue', false)).toBe(false);
    expect(commsEntranceSound('fade', false)).toBe(false);
  });
  it('立ち絵を差し替えた行は鳴らさない', () => {
    expect(commsEntranceSound('fly', true)).toBe(false);
    expect(commsEntranceSound('rise', true)).toBe(false);
  });
});

describe('commsEntranceOffsetPx', () => {
  it('スマホ(定位置が上): 中段から上へ。中段との差が最低移動量より大きければその差', () => {
    expect(commsEntranceOffsetPx(0, 932, 100)).toBeCloseTo(366);
    expect(commsEntranceOffsetPx(0, 932, 140)).toBeCloseTo(932 * COMMS_ENTRANCE_MIN_TRAVEL);
  });
  it('定位置が中段に近くても最低移動量は動く(下から)', () => {
    expect(commsEntranceOffsetPx(0, 667, 300)).toBeCloseTo(667 * COMMS_ENTRANCE_MIN_TRAVEL);
  });
  it('定位置が中段より下なら上から下へ', () => {
    expect(commsEntranceOffsetPx(0, 720, 630)).toBeCloseTo(360 - 630);
    expect(commsEntranceOffsetPx(0, 720, 400)).toBeCloseTo(-720 * COMMS_ENTRANCE_MIN_TRAVEL);
  });
  it('枠の上端がずれていても枠の中段を基準にする', () => {
    expect(commsEntranceOffsetPx(100, 600, 50)).toBeCloseTo(350);
  });
  it('枠の高さが取れない時は動かさない', () => {
    expect(commsEntranceOffsetPx(0, 0, 100)).toBe(0);
  });
});

describe('commsEntranceSideShiftPx', () => {
  it('画面の中心寄りへずらす', () => {
    expect(commsEntranceSideShiftPx(100, 187)).toBe(COMMS_FLY_SIDE_SHIFT_PX); // 左の板=右へ
    expect(commsEntranceSideShiftPx(300, 187)).toBe(-COMMS_FLY_SIDE_SHIFT_PX);
    expect(commsEntranceSideShiftPx(187, 187)).toBe(0);
  });
});
