/**
 * ステージ開始のヘリ飛来(登場演出フェーズA)の間に出す「枠のトンネル」の時間割(社長指示2026-11-21
 * 「この枠を、この大きさから端寄せのままズームしてフェードアウトし、それを何個も高速で繰り返す」)。
 *
 * そのステージの枠(data/stageFrames.ts の左右の絵)の複製を、今の大きさ・端寄せのまま出し、外側の端を基準に
 * 拡大しながらフェードアウトさせる。これを高速で繰り返し、ヘリが着く頃に発生の間隔を広げて収束させる。
 *
 * - 見た目だけ(判定・カメラ・ズームに無関係)。renderer 非依存(PixiJS を import しない)。描画は pixi/stageFrameLayer.ts。
 * - 時刻は登場演出の頭からの経過 ms(フェーズAの尺=PLAYER_INTRO_HELI_MS に合わせて組む)。
 */

/** 序盤の発生間隔(ms)。 */
export const INTRO_TUNNEL_INTERVAL_MS = 100;
/** 収束の最後の発生間隔(ms)。 */
export const INTRO_TUNNEL_INTERVAL_LAST_MS = 380;
/** ここから発生の間隔を広げ始める(ms・ヘリが減速に入る頃)。 */
export const INTRO_TUNNEL_SETTLE_FROM_MS = 1500;
/** これ以降は新しい複製を出さない(ms・ヘリの着地=2600 の少し前)。 */
export const INTRO_TUNNEL_SPAWN_END_MS = 2450;
/** 1枚の寿命(ms): 序盤 → 収束の最後。 */
export const INTRO_TUNNEL_LIFE_MS = 480;
export const INTRO_TUNNEL_LIFE_LAST_MS = 700;
/** 1枚の最終の拡大率: 序盤 → 収束の最後(最後は緩く=減速して止まる)。 */
export const INTRO_TUNNEL_MAX_SCALE = 3.0;
export const INTRO_TUNNEL_MAX_SCALE_LAST = 1.7;
/** 出の割合(寿命のこの割合で 0→最大の濃さ。パッと出さない)。 */
const FADE_IN_FRAC = 0.08;
/** 抜けの始まり(寿命のこの割合まで濃いまま迫り、そこから拡大の加速とともに抜ける)。 */
const FADE_OUT_FROM = 0.35;
/** 同時に生きている複製の上限(片側)。描画側のプールの大きさ。 */
export const INTRO_TUNNEL_MAX_COPIES = 8;

const smooth = (x: number): number => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

interface Spawn { at: number; life: number; maxScale: number }

/** 収束の進み(0=序盤 → 1=最後)。発生時刻で決まる。 */
const settleK = (at: number): number =>
  smooth((at - INTRO_TUNNEL_SETTLE_FROM_MS) / (INTRO_TUNNEL_SPAWN_END_MS - INTRO_TUNNEL_SETTLE_FROM_MS));

/** 発生の時刻表(決定的・モジュール読み込み時に1回)。 */
export const INTRO_TUNNEL_SPAWNS: readonly Spawn[] = (() => {
  const out: Spawn[] = [];
  let at = 0;
  while (at < INTRO_TUNNEL_SPAWN_END_MS) {
    const k = settleK(at);
    out.push({ at, life: lerp(INTRO_TUNNEL_LIFE_MS, INTRO_TUNNEL_LIFE_LAST_MS, k), maxScale: lerp(INTRO_TUNNEL_MAX_SCALE, INTRO_TUNNEL_MAX_SCALE_LAST, k) });
    at += lerp(INTRO_TUNNEL_INTERVAL_MS, INTRO_TUNNEL_INTERVAL_LAST_MS, k);
  }
  return out;
})();

/** 最後の1枚が消え切る時刻(ms)。これ以降トンネルは何も出さない。 */
export const INTRO_TUNNEL_END_MS = INTRO_TUNNEL_SPAWNS.reduce((m, s) => Math.max(m, s.at + s.life), 0);

export interface TunnelCopyPose {
  /** 外側の端を基準にした拡大率(1=今の大きさ)。 */
  scale: number;
  /** 濃さ(0..1)。 */
  alpha: number;
}

/**
 * 1枚の姿(u=寿命の進み 0..1)。拡大は**加速**(ease-in)=手前へ迫って抜けていく。濃さは素早く出て、FADE_OUT_FROM まで濃いまま、拡大の加速とともに抜ける。
 */
export const introTunnelPose = (u: number, maxScale: number): TunnelCopyPose => {
  const x = Math.max(0, Math.min(1, u));
  const scale = 1 + (maxScale - 1) * x * x;
  const alpha = smooth(x / FADE_IN_FRAC) * (1 - smooth((x - FADE_OUT_FROM) / (1 - FADE_OUT_FROM)));
  return { scale, alpha };
};

/**
 * 経過 ms の時点で生きている複製の姿。**新しい順**(新しい=小さい=奥)に返す=この順に重ねると古い(大きい=手前)が上に来る。
 * 上限 INTRO_TUNNEL_MAX_COPIES を超えたら古い方から捨てる(時刻表の上では超えない)。
 */
export const introTunnelCopies = (elapsedMs: number): TunnelCopyPose[] => {
  if (!(elapsedMs >= 0) || elapsedMs >= INTRO_TUNNEL_END_MS) return [];
  const out: TunnelCopyPose[] = [];
  for (let i = INTRO_TUNNEL_SPAWNS.length - 1; i >= 0 && out.length < INTRO_TUNNEL_MAX_COPIES; i--) {
    const s = INTRO_TUNNEL_SPAWNS[i];
    if (s.at > elapsedMs) continue;
    const age = elapsedMs - s.at;
    if (age >= s.life) continue;
    out.push(introTunnelPose(age / s.life, s.maxScale));
  }
  return out;
};
