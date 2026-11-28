// ステージ7の天気(社長指示2026-11-21「ステージ7はスタート時は雨、第二形態で晴れの夜にして」)。
// - 出撃の最初から雨(ステージ1で作った雨の一式=雨粒・雨量の上下・水たまり・波紋・雫・濡れた夜の色。URLツマミ不要)
// - グレンの第二形態(glenForm===2 の個体)が場に出た時点で、雨が加減速しながら上がり、入れ替わりに晴れの夜
//   (ステージ1の晴れの夜の色調整・月明かりの筋・月の光だまり)へ移る。一度晴れたら、その出撃の間は戻らない。
// - 水たまりは雨上がり直後なので残す(雨の一式のうち、雨粒・濡れた夜の色だけが抜ける)。
// ★判定だけ(いつ・どれだけ)。描画は pixiScene が読む。
// RENDERER-AGNOSTIC: PixiJS を import しない。

import { easeInOutSine, WET_LIGHT_FADE_MS, buildWetGradeMatrix, WET_GRADE_SAT, WET_GRADE_GAIN, WET_GRADE_LIFT } from './weatherWet';

/** 天気を変えるステージ。 */
export const STAGE7_WEATHER_STAGE = 'stage-7';
/** ステージ7の遠景のキー(遠景の絵が付いてから効かせる=ステージ1の森の farKey==='forest' と同じ考え)。 */
export const STAGE7_WEATHER_FAR_KEY = 'stage7';

// ---- 雨が上がって晴れるまでの段取り(第二形態が出た時刻からの ms)。どれも加速して減速する(慣性) ----
/** 雨量が 1 → 0 になるまで(雨粒が数秒かけて減って止む)。 */
export const S7W_RAIN_STOP_MS = 8000;
/** 濡れた夜の色(藍の色調整・霧の色・暗さの緩め)が抜け始めるまでの遅れと、抜け切るまでの尺。 */
export const S7W_WET_FADE_DELAY_MS = 1500;
export const S7W_WET_FADE_MS = 8000;
/** 晴れの夜(色調整・月明かりの筋・月の光だまり)が入り始めるまでの遅れと、入り切るまでの尺。
 *  雨が弱まってから空が澄んでいく順=雨の止みより少し遅れて始まり、少し遅れて終わる。 */
export const S7W_CLEAR_DELAY_MS = 2500;
export const S7W_CLEAR_MS = 8500;
/** 出撃の最初の雨の強さ(雨の強さの時刻表の最初の区間=30〜60秒はこのまま本降り。その後はステージ1と同じ上下)。
 *  ステージ1の時刻表は小雨から乱数の目標へ寄せる=約半分で開始直後に止みかける。ステージ7は「スタート時は雨」なので降っている所から。 */
export const S7W_RAIN_START = 3.0;
/** 全部が移り終わる時刻。 */
export const S7W_TOTAL_MS = Math.max(S7W_RAIN_STOP_MS, S7W_WET_FADE_DELAY_MS + S7W_WET_FADE_MS, S7W_CLEAR_DELAY_MS + S7W_CLEAR_MS);

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** 天気の進み(出撃ごと)。clearAt=第二形態を最初に見た時刻(null=まだ雨)。 */
export interface Stage7WeatherState {
  stageId: string;
  clearAt: number | null;
  /** 前のフレームのゲーム時間(新しい出撃=ゲーム時間が巻き戻ったのを見分ける)。 */
  lastGameTime: number;
  /** 出撃の番号(新しい出撃のたびに1つ進む=雨の強さの時刻表を作り直す印)。 */
  run: number;
}
export const initStage7Weather = (): Stage7WeatherState => ({ stageId: '', clearAt: null, lastGameTime: 0, run: 0 });

/** ゲーム時間がこれ以上巻き戻ったら新しい出撃とみなす(1フレームの揺れでは戻さない)。 */
const RUN_RESET_BACK_MS = 500;

export interface Stage7WeatherInput {
  stageId: string;
  gameTime: number;
  /** glenForm===2 の個体が場に居るか(このフレーム)。 */
  glenForm2: boolean;
  now: number;
}

/** 1フレーム進める。ステージが変わった/新しい出撃なら雨へ戻す。第二形態を見たらその時刻を覚える(以後は戻らない)。 */
export const stepStage7Weather = (st: Stage7WeatherState, i: Stage7WeatherInput): Stage7WeatherState => {
  const newRun = i.stageId !== st.stageId || i.gameTime < st.lastGameTime - RUN_RESET_BACK_MS;
  let clearAt = newRun ? null : st.clearAt;
  if (clearAt === null && i.stageId === STAGE7_WEATHER_STAGE && i.glenForm2) clearAt = i.now;
  if (!newRun && clearAt === st.clearAt && i.gameTime === st.lastGameTime) return st;
  return { stageId: i.stageId, clearAt, lastGameTime: i.gameTime, run: newRun ? st.run + 1 : st.run };
};

/** 第二形態の個体が場に居るか。 */
export const hasGlenForm2 = (enemies: readonly { glenForm?: 1 | 2 }[]): boolean => {
  for (const e of enemies) if (e.glenForm === 2) return true;
  return false;
};

export interface Stage7WeatherCtx {
  stageId: string;
  indoor: boolean;
  corridor: boolean;
  farKey: string | null;
  daylight: boolean;
}

/** このフレームの見え方。 */
export interface Stage7WeatherLook {
  /** ステージ7の屋外の夜か(これが false なら下は全部 0=何も足さない)。 */
  outdoor: boolean;
  /** 雨の層(水たまり・雨粒・雫)を出すか。晴れた後も水たまりのために出したまま。 */
  wetLayer: boolean;
  /** 雨量に掛ける倍率(1=ステージ1と同じ雨・0=止んだ)。加減速つき。 */
  rainScale: number;
  /** 濡れた夜の色の効き具合の目標(0..1・線形。見た目の加減速は読む側の easeInOutSine)。 */
  wetMix: number;
  /** 晴れの夜の効き具合の目標(0..1・線形。見た目の加減速は読む側の easeInOutSine)。 */
  clearMix: number;
  /** 移り変わりの進み(0=雨のまま・1=晴れ切った)。 */
  progress: number;
}

export const STAGE7_WEATHER_OFF: Stage7WeatherLook = Object.freeze({
  outdoor: false, wetLayer: false, rainScale: 0, wetMix: 0, clearMix: 0, progress: 0,
});

/** ステージ7の屋外の夜か。屋内・回廊・他ステージ・遠景が付く前・昼は false。 */
export const stage7WeatherOutdoor = (c: Stage7WeatherCtx): boolean =>
  c.stageId === STAGE7_WEATHER_STAGE && !c.indoor && !c.corridor && c.farKey === STAGE7_WEATHER_FAR_KEY && !c.daylight;

/** 第二形態を見てから t ms の見え方(屋外の時)。 */
export const stage7ClearingLook = (t: number): Omit<Stage7WeatherLook, 'outdoor' | 'wetLayer'> => {
  const tt = Math.max(0, t);
  return {
    rainScale: 1 - easeInOutSine(tt / S7W_RAIN_STOP_MS),
    wetMix: 1 - clamp01((tt - S7W_WET_FADE_DELAY_MS) / S7W_WET_FADE_MS),
    clearMix: clamp01((tt - S7W_CLEAR_DELAY_MS) / S7W_CLEAR_MS),
    progress: clamp01(tt / S7W_TOTAL_MS),
  };
};

/** このフレームの見え方。 */
export const stage7WeatherLook = (st: Stage7WeatherState, c: Stage7WeatherCtx, now: number): Stage7WeatherLook => {
  if (!stage7WeatherOutdoor(c)) return STAGE7_WEATHER_OFF;
  if (st.clearAt === null) return { outdoor: true, wetLayer: true, rainScale: 1, wetMix: 1, clearMix: 0, progress: 0 };
  return { outdoor: true, wetLayer: true, ...stage7ClearingLook(now - st.clearAt) };
};

/** 効き具合 mix を目標 target へ一定の速さ(WET_LIGHT_FADE_MS で 0↔1)で寄せる。目標がゆっくり動く間は目標にそのまま付いていく。 */
export const stepMixToward = (mix: number, target: number, dtMs: number, fadeMs = WET_LIGHT_FADE_MS): number => {
  const step = Math.max(0, dtMs) / fadeMs;
  return mix < target ? Math.min(target, mix + step) : Math.max(target, mix - step);
};

/** 濡れた夜の世界の色行列を効き具合 mix(0..1・加減速つき)ぶんだけ掛けた行列。mix=1 は雨上がりの色行列そのもの・0 は無変化。 */
export const buildWetGradeMatrixMix = (mix: number): number[] => {
  if (mix >= 1) return buildWetGradeMatrix();
  const k = easeInOutSine(mix);
  const l = (a: number, b: number) => a + (b - a) * k;
  return buildWetGradeMatrix(l(1, WET_GRADE_SAT), WET_GRADE_GAIN.map(g => l(1, g)), WET_GRADE_LIFT.map(v => l(0, v)));
};

const IDENTITY_MATRIX: readonly number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
/** 色行列 m を無変化の行列へ寄せる(k=1 で m そのもの・0 で無変化)。 */
export const mixMatrixFromIdentity = (m: readonly number[], k: number): number[] => {
  const t = clamp01(k);
  return m.map((v, i) => IDENTITY_MATRIX[i] + (v - IDENTITY_MATRIX[i]) * t);
};
