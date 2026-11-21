import { describe, it, expect } from 'vitest';
import {
  initStage7Weather, stepStage7Weather, stage7WeatherLook, stage7WeatherOutdoor, stage7ClearingLook, hasGlenForm2,
  stepMixToward, buildWetGradeMatrixMix, mixMatrixFromIdentity, STAGE7_WEATHER_OFF,
  S7W_RAIN_STOP_MS, S7W_TOTAL_MS, S7W_CLEAR_DELAY_MS, S7W_RAIN_START, type Stage7WeatherCtx,
} from './stage7Weather';
import { buildWetGradeMatrix, makeRainSchedule, advanceRainSchedule, RAIN_INTENSITY_HOLD_MS_MIN, RAIN_INTENSITY_HIGH_MIN } from './weatherWet';

const S7: Stage7WeatherCtx = { stageId: 'stage-7', indoor: false, corridor: false, farKey: 'stage7', daylight: false };

/** 出撃から順に進める小さな運転台。 */
const run = (frames: { t: number; gameTime: number; glen2?: boolean; stageId?: string }[]) => {
  let st = initStage7Weather();
  for (const f of frames) st = stepStage7Weather(st, { stageId: f.stageId ?? 'stage-7', gameTime: f.gameTime, glenForm2: !!f.glen2, now: f.t });
  return st;
};

describe('ステージ7の天気(雨→第二形態で晴れの夜)', () => {
  it('ステージ7の開始=雨(ツマミ無しで・降っている所から)', () => {
    const st = run([{ t: 1000, gameTime: 0 }, { t: 1016, gameTime: 16 }]);
    const look = stage7WeatherLook(st, S7, 1016);
    expect(look).toMatchObject({ outdoor: true, wetLayer: true, rainScale: 1, wetMix: 1, clearMix: 0, progress: 0 });
    expect(S7W_RAIN_START).toBeGreaterThanOrEqual(RAIN_INTENSITY_HIGH_MIN); // 本降りから
  });

  it('第二形態が出た時点から晴れへ移り始め、移り終わったら晴れの夜(雨量0・濡れた色0・晴れ1)', () => {
    const st = run([{ t: 0, gameTime: 0 }, { t: 5000, gameTime: 5000, glen2: true }]);
    expect(st.clearAt).toBe(5000);
    const start = stage7WeatherLook(st, S7, 5000);
    expect(start.rainScale).toBe(1);
    expect(start.clearMix).toBe(0);
    const end = stage7WeatherLook(st, S7, 5000 + S7W_TOTAL_MS);
    expect(end).toMatchObject({ rainScale: 0, wetMix: 0, clearMix: 1, progress: 1 });
    expect(end.wetLayer).toBe(true); // 水たまりは雨上がり直後なので残す
  });

  it('移り変わりは加減速つき(出だしと終わりは緩く・途中で1フレームに跳ばない)・尺は6〜12秒', () => {
    expect(S7W_RAIN_STOP_MS).toBeGreaterThanOrEqual(6000);
    expect(S7W_TOTAL_MS).toBeLessThanOrEqual(12000);
    const d0 = 1 - stage7ClearingLook(100).rainScale;
    const dMid = stage7ClearingLook(S7W_RAIN_STOP_MS / 2 - 50).rainScale - stage7ClearingLook(S7W_RAIN_STOP_MS / 2 + 50).rainScale;
    expect(d0).toBeLessThan(dMid / 5); // 止まった所から動き出す(加速)
    let prev = stage7ClearingLook(0);
    for (let t = 16; t <= S7W_TOTAL_MS + 100; t += 16) {
      const l = stage7ClearingLook(t);
      expect(l.rainScale).toBeLessThanOrEqual(prev.rainScale);
      expect(l.wetMix).toBeLessThanOrEqual(prev.wetMix);
      expect(l.clearMix).toBeGreaterThanOrEqual(prev.clearMix);
      expect(Math.abs(l.rainScale - prev.rainScale)).toBeLessThan(0.01);
      expect(Math.abs(l.clearMix - prev.clearMix)).toBeLessThan(0.01);
      prev = l;
    }
    // 晴れは雨が弱まってから入り始める(同時にパッと入れ替わらない)
    expect(stage7ClearingLook(S7W_CLEAR_DELAY_MS - 1).clearMix).toBe(0);
    expect(stage7ClearingLook(S7W_CLEAR_DELAY_MS - 1).rainScale).toBeLessThan(1);
  });

  it('一度晴れたら戻らない(第二形態が倒れて場から消えても晴れのまま)', () => {
    const st = run([
      { t: 0, gameTime: 0 }, { t: 1000, gameTime: 1000, glen2: true },
      { t: 30000, gameTime: 30000, glen2: false }, { t: 60000, gameTime: 60000, glen2: false },
    ]);
    expect(st.clearAt).toBe(1000);
    expect(stage7WeatherLook(st, S7, 60000).clearMix).toBe(1);
  });

  it('新しい出撃(ゲーム時間の巻き戻り・ステージの変更)では雨へ戻り、雨の時刻表の作り直しの印が進む', () => {
    let st = run([{ t: 0, gameTime: 0 }, { t: 1000, gameTime: 90000, glen2: true }]);
    const run1 = st.run;
    st = stepStage7Weather(st, { stageId: 'stage-7', gameTime: 0, glenForm2: false, now: 200000 });
    expect(st.clearAt).toBeNull();
    expect(st.run).toBe(run1 + 1);
    expect(stage7WeatherLook(st, S7, 200000).rainScale).toBe(1);
    st = stepStage7Weather(st, { stageId: 'stage-1', gameTime: 10, glenForm2: false, now: 200100 });
    expect(st.run).toBe(run1 + 2);
    // 1フレームの揺れ(わずかな巻き戻り)では戻さない
    let s2 = run([{ t: 0, gameTime: 0 }, { t: 100, gameTime: 5000, glen2: true }]);
    s2 = stepStage7Weather(s2, { stageId: 'stage-7', gameTime: 4900, glenForm2: true, now: 200 });
    expect(s2.clearAt).toBe(100);
  });

  it('第二形態の判定はステージ7だけ', () => {
    const st = run([{ t: 0, gameTime: 0, stageId: 'stage-1' }, { t: 10, gameTime: 10, stageId: 'stage-1', glen2: true }]);
    expect(st.clearAt).toBeNull();
  });

  it('ステージ1(ツマミ無し)・他ステージ・屋内・回廊・遠景が付く前・昼では何も出さない', () => {
    const st = run([{ t: 0, gameTime: 0 }]);
    expect(stage7WeatherLook(st, { ...S7, stageId: 'stage-1', farKey: 'forest' }, 0)).toBe(STAGE7_WEATHER_OFF);
    expect(stage7WeatherLook(st, { ...S7, stageId: 'stage-5' }, 0)).toBe(STAGE7_WEATHER_OFF);
    expect(stage7WeatherLook(st, { ...S7, indoor: true }, 0)).toBe(STAGE7_WEATHER_OFF);
    expect(stage7WeatherLook(st, { ...S7, corridor: true }, 0)).toBe(STAGE7_WEATHER_OFF);
    expect(stage7WeatherLook(st, { ...S7, farKey: 'forest' }, 0)).toBe(STAGE7_WEATHER_OFF);
    expect(stage7WeatherLook(st, { ...S7, daylight: true }, 0)).toBe(STAGE7_WEATHER_OFF);
    expect(stage7WeatherOutdoor(S7)).toBe(true);
    expect(STAGE7_WEATHER_OFF).toMatchObject({ wetLayer: false, rainScale: 0, wetMix: 0, clearMix: 0 });
  });

  it('hasGlenForm2: glenForm===2 の個体が居る時だけ', () => {
    expect(hasGlenForm2([])).toBe(false);
    expect(hasGlenForm2([{ glenForm: 1 }, {}])).toBe(false);
    expect(hasGlenForm2([{ glenForm: 1 }, { glenForm: 2 }])).toBe(true);
  });

  it('stepMixToward: 目標へ一定の速さで寄せ、行き過ぎない', () => {
    expect(stepMixToward(0, 1, 900)).toBeCloseTo(0.5);
    expect(stepMixToward(0.9, 1, 900)).toBe(1);
    expect(stepMixToward(1, 0.95, 900)).toBe(0.95);
    expect(stepMixToward(0.5, 0.5, 16)).toBe(0.5);
    expect(stepMixToward(0.5, 0, -10)).toBe(0.5);
  });

  it('色行列: 効き具合1=雨上がりの行列そのもの・0=無変化', () => {
    expect(buildWetGradeMatrixMix(1)).toEqual(buildWetGradeMatrix());
    const id = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    buildWetGradeMatrixMix(0).forEach((v, i) => expect(v).toBeCloseTo(id[i], 9));
    expect(mixMatrixFromIdentity(buildWetGradeMatrix(), 0)).toEqual(id);
    expect(mixMatrixFromIdentity(buildWetGradeMatrix(), 1)).toEqual(buildWetGradeMatrix());
  });
});

describe('雨の強さの時刻表: 降っている所から始める(ステージ7)', () => {
  it('最初の区間は指定の強さのまま保ち、その後は従来の乱数の区間へ', () => {
    const s = makeRainSchedule(123, 0, S7W_RAIN_START);
    expect(advanceRainSchedule(s, 0)).toBe(S7W_RAIN_START);
    expect(advanceRainSchedule(s, RAIN_INTENSITY_HOLD_MS_MIN - 1)).toBe(S7W_RAIN_START);
  });
  it('省略時は従来どおり(小雨1から始まる)=ステージ1は変わらない', () => {
    const a = makeRainSchedule(123, 0);
    expect(a).toEqual({ seed: 123, k: 0, start: 0, prev: 1 });
    const b = makeRainSchedule(123, 0);
    for (let t = 0; t < 400000; t += 7000) expect(advanceRainSchedule(a, t)).toBe(advanceRainSchedule(b, t));
    expect(advanceRainSchedule(makeRainSchedule(5, 0), 0)).toBe(1);
  });
});
