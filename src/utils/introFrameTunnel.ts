/**
 * ステージ開始のヘリ飛来(登場演出フェーズA)の間に出す「枠のトンネル」の時間割(社長指示2026-11-21
 * 「この枠を、この大きさから端寄せのままズームしてフェードアウトし、それを何個も高速で繰り返す」)。
 *
 * 作り直し(社長承認2026-11-21「チカチカしてるだけに見える」への対処): 1枚を長く・発生を間引き、常に2〜3枚が
 * 重なって**途切れず流れ続ける**形にした。暗い岩・枝の影絵が、遠くからゆっくり近づき、抜ける直前に一気に速くなる
 * (一定速度で近づく物体の見かけの大きさ ∝ 1/残り距離)。濃さはゆっくり入り、画面の外へほぼ抜けるまで保ち、最後だけ消す。
 *
 * - 見た目だけ(判定・カメラ・ズームに無関係)。renderer 非依存(PixiJS を import しない)。描画は pixi/stageFrameLayer.ts。
 * - 時刻は登場演出の頭からの経過 ms(フェーズAの尺=PLAYER_INTRO_HELI_MS に合わせて組む)。
 */

/** 発生の間隔(ms)。寿命との比で同時枚数が決まる(LIFE/INTERVAL=2.96 → 常に2〜3枚)。 */
export const INTRO_TUNNEL_INTERVAL_MS = 270;
/** 1枚の寿命(ms)。 */
export const INTRO_TUNNEL_LIFE_MS = 800;
/**
 * 演出の頭より前に発生させておく枚数(=頭の時点で既に流れが出来ている)。頭でパッと出さないよう、
 * 全体の濃さは INTRO_TUNNEL_MASTER_IN_MS かけてゆっくり上げる。
 */
const PRE_ROLL = 2;
/** 全体の入り(ms)。 */
export const INTRO_TUNNEL_MASTER_IN_MS = 350;
/** これ以降は新しい複製を出さない(ms)。最後の1枚はヘリの着地(2600)の頃に抜け切る。 */
export const INTRO_TUNNEL_SPAWN_END_MS = 2100;
/** 1枚の最終の拡大率(外側の端を基準)。上下の岩・つららが画面の外へ抜け切る大きさ。 */
export const INTRO_TUNNEL_MAX_SCALE = 5;
/** 1枚の最大の濃さ。普通の重ね方(光らせない)で暗い影絵として読ませる。 */
export const INTRO_TUNNEL_PEAK_ALPHA = 1;
/** 縦画面(スマホ)の濃さの倍率。縦は枠1枚が画面幅とほぼ同じで、濃さ1だと画面ほぼ全体が暗い岩で覆われヘリが沈むため薄くする。 */
export const INTRO_TUNNEL_PORTRAIT_ALPHA_MUL = 0.55;
/** 出の割合(寿命のこの割合をかけて 0→最大の濃さ。パッとは出さないが、すぐ濃くなる)。 */
const FADE_IN_FRAC = 0.12;
/**
 * 抜けの始まり。濃い時間を1枚の動きの前半に寄せ、ここから左右に開きながら最後まで薄れていく
 * (社長2026-11-21「開始から薄まる曲線が早いのでカーブ前半に寄せて」=1枚ごとの濃さ)。旧 0.84(抜けてから消す)。
 */
const FADE_OUT_FROM = 0.5;
/** 同時に生きている複製の上限(片側)。描画側のプールの大きさ。 */
export const INTRO_TUNNEL_MAX_COPIES = 4;

const smooth = (x: number): number => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };

interface Spawn { at: number; life: number }

/** 発生の時刻表(決定的・モジュール読み込み時に1回)。頭より前(負の時刻)から PRE_ROLL 枚ぶん流しておく。 */
export const INTRO_TUNNEL_SPAWNS: readonly Spawn[] = (() => {
  const out: Spawn[] = [];
  for (let at = -PRE_ROLL * INTRO_TUNNEL_INTERVAL_MS; at < INTRO_TUNNEL_SPAWN_END_MS; at += INTRO_TUNNEL_INTERVAL_MS) {
    out.push({ at, life: INTRO_TUNNEL_LIFE_MS });
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
  /**
   * 左右に開く量(0..1)。描く側は複製を外側へ「拡大後の幅 × open」だけずらす=内側の縁が画面の外へ引いていく。
   * 社長2026-11-21「ズームしつつ左右に開いていく方がいいかも」。smoothstep=動き始めと終わりに加減速(慣性)。
   */
  open: number;
}

/**
 * 遠近の拡大: 一定速度で近づく物体の見かけの大きさ ∝ 1/残り距離。s(u) = 1/(1 - k·u)、k = 1 - 1/maxScale。
 * 初めはゆっくり、抜ける直前に一気に速い(速さ ∝ s²)。
 */
export const introTunnelScale = (u: number, maxScale: number = INTRO_TUNNEL_MAX_SCALE): number => {
  const x = Math.max(0, Math.min(1, u));
  const k = 1 - 1 / Math.max(1, maxScale);
  return 1 / (1 - k * x);
};

/**
 * 1枚の姿(u=寿命の進み 0..1)。濃さは FADE_IN_FRAC ですぐ最大へ入り、FADE_OUT_FROM まで保ち、そこから開きながら最後まで薄れる。
 */
export const introTunnelPose = (u: number, maxScale: number = INTRO_TUNNEL_MAX_SCALE): TunnelCopyPose => {
  const x = Math.max(0, Math.min(1, u));
  const alpha = INTRO_TUNNEL_PEAK_ALPHA * smooth(x / FADE_IN_FRAC) * (1 - smooth((x - FADE_OUT_FROM) / (1 - FADE_OUT_FROM)));
  return { scale: introTunnelScale(x, maxScale), alpha, open: x * x * (3 - 2 * x) };
};

/**
 * 経過 ms の時点で生きている複製の姿。**新しい順**(新しい=小さい=奥)に返す=この順に重ねると古い(大きい=手前)が上に来る。
 * 上限 INTRO_TUNNEL_MAX_COPIES を超えたら古い方から捨てる(時刻表の上では超えない)。
 */
export const introTunnelCopies = (elapsedMs: number): TunnelCopyPose[] => {
  if (!(elapsedMs >= 0) || elapsedMs >= INTRO_TUNNEL_END_MS) return [];
  const master = smooth(elapsedMs / INTRO_TUNNEL_MASTER_IN_MS);
  const out: TunnelCopyPose[] = [];
  for (let i = INTRO_TUNNEL_SPAWNS.length - 1; i >= 0 && out.length < INTRO_TUNNEL_MAX_COPIES; i--) {
    const s = INTRO_TUNNEL_SPAWNS[i];
    if (s.at > elapsedMs) continue;
    const age = elapsedMs - s.at;
    if (age >= s.life) continue;
    const p = introTunnelPose(age / s.life);
    out.push({ scale: p.scale, alpha: p.alpha * master, open: p.open });
  }
  return out;
};
