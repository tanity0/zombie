// 風(社長要望v0.25.2646「たまに風で揺らめかせられる？」→ v0.25.2648「世界で揃えたい/花とかも揺らぎたい」)。
//
// ★**世界にただ1つの風**。炎も花も木も、全部**この同じ値**を読む。
// ★**常に吹いている**(社長指示v0.25.2652「止まる方が不自然。常に吹いてて大小の緩急がある感じ」)。
// 構造は「**常時のうねり(3波)** + **たまの突風**」。うねりが止まらないので風が消える瞬間が無い。
// 別々の揺れを作ると「炎は右へ、花は左へ」になって世界が嘘になるので、**風は1本しか作らない**。
//
// **時刻だけから決まる純関数**にしてある(状態を持たない)。理由:
//  ・描画は毎フレーム「いまの風」を1回引くだけでよく、**シミュレーション側に状態を増やさない**
//    (CLAUDE.md: PixiJSは描くだけ / storeに毎フレームの書き込みを増やさない)。
//  ・純関数なので**テストで性格を固定できる**(常時吹きっぱなしにならない、等)。

/** 決定的な擬似乱数(0..1)。整数の「何回目の突風か」を入れる。 */
const hash01 = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 突風の周期(ms)。この長さに1回、どこかで突風が起きる。
 * v0.25.2652(社長「もっと頻度高くていい。止まる方が不自然」): 5200 → **2800**。
 * 突風どうしがほぼ切れ目なく繋がり、「吹いていない時間」が無くなる。
 */
export const GUST_PERIOD_MS = 2800;
/** 突風1回の長さ(ms)。 */
export const GUST_MS = 1600;
/** 突風の強さの範囲。**上限を下げてある**——常時風が乗るので、突風まで強いと合計が振り切れる。 */
export const GUST_MIN = 0.28;
export const GUST_SPAN = 0.26;

/**
 * 常時吹いている風(うねり)。**周期の違う3つの波を重ねる**ことで
 * 「ずっと吹いていて、強くなったり弱くなったりする」を作る(社長指示v0.25.2652
 * 「常に吹いてて大小の緩急があるくらいな感じ」)。
 *
 * ★v0.25.2651まではここが `BREEZE_AMP=0.14` の**そよぎ**でしかなく、突風の合間は
 * **半分の時間が「止まって見える」**状態だった(実測49%)。3波へ増やして **16%** まで落としてある。
 * 周期は**互いに割り切れない値**にする(揃うと周期的な"呼吸"に見えてしまう)。
 */
export const WIND_SWELL: readonly { amp: number; periodMs: number; phase: number }[] = [
  { amp: 0.30, periodMs: 3400, phase: 0 },
  { amp: 0.17, periodMs: 1620, phase: 1.3 },
  { amp: 0.09, periodMs: 820, phase: 2.7 },
];
/** うねりの合計の振れ幅(=突風が無い時の上限)。 */
export const SWELL_AMP = WIND_SWELL.reduce((a, w) => a + w.amp, 0);
/**
 * 対象ごとにうねりの位相をどれだけずらすか。**0 = 世界で完全に揃う**(社長指示v0.25.2648)。
 * 上げると同じ場所の草木がバラバラに揺れる(=風には見えなくなる)ので、既定は0のまま。
 */
export const WIND_PHASE_SPREAD = 0;

// ---- 世界の風の強さ(ステージ/場面で変える) ------------------------------------------------------
// 「変数か何かで」(社長v0.25.2648)。**倍率1つ**で世界中の風がまとめて変わる。
let worldWindScale = 1;
/** 世界の風の強さを設定(0=無風・1=標準)。負や異常値は握り潰す。 */
export const setWorldWindScale = (n: number): void => {
  worldWindScale = Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 1;
};
export const getWorldWindScale = (): number => worldWindScale;

/** 風の強さを決める文脈(描画側が毎フレーム渡す。純関数にして判断を1箇所へ集める)。 */
export interface WindCtx {
  /** 屋内(研究施設の中・洋館の通路など)。 */
  indoor: boolean;
  /** 遠景の種類。'snow'=雪原(吹雪)。 */
  farBackdrop?: string;
}

/**
 * 場面ごとの風の強さ。**屋内が0なのは好みではなく正しさ**——屋内で炎が風になびいたら嘘になる。
 * それ以外はステージの雰囲気付け(社長が実機で決める値)。
 *
 * | 場面 | 強さ | 由来 |
 * |---|---|---|
 * | 屋内 | 0 | 正しさ(屋内に風は吹かない) |
 * | **M3 廃都**(city) | **1.3** | 社長指示v0.25.2649「m3はもう少し風強く」 |
 * | **M4 封鎖地域**(snow) | **1.8** | 社長指示v0.25.2649「m4はもっと強く」 |
 * | **M7 逆探知地点**(stage7) | **2.3** | 社長指示v0.25.2650「m7もさらに強く」 |
 * | その他(森・チュートリアル等) | 1.0 | 標準 |
 *
 * ★**強さの序列が指示そのもの**(M7 > M4 > M3 > 標準 > 屋内0)。テストはこの順序を固定してある
 * ——数字の微調整でテストが落ちないように、縛るのは意図の方。
 */
export const worldWindScaleFor = (ctx: WindCtx): number => {
  if (ctx.indoor) return 0;                      // 屋内=無風(ここは好みではなく正しさ)
  if (ctx.farBackdrop === 'stage7') return 2.3;  // M7 逆探知地点=吹きさらし
  if (ctx.farBackdrop === 'snow') return 1.8;    // M4 封鎖地域=吹雪
  if (ctx.farBackdrop === 'city') return 1.3;    // M3 廃都=ビル風
  return 1;
};

// ---- 風そのもの ---------------------------------------------------------------------------------

/**
 * 突風だけ(**世界共通**・種に依らない)。全部の物が**同じ瞬間に同じ向き**へ倒れることで
 * 「風が吹いた」に見える。
 */
export const windGustAt = (nowMs: number): number => {
  const period = Math.floor(nowMs / GUST_PERIOD_MS);
  const start = hash01(period) * (GUST_PERIOD_MS - GUST_MS);
  const t = nowMs - period * GUST_PERIOD_MS - start;
  if (t < 0 || t >= GUST_MS) return 0;
  const u = t / GUST_MS;
  // 立ち上がりが速く、抜けが遅い(実際の突風の形)。sin の山を前へ寄せる。
  const shape = Math.sin(Math.PI * Math.pow(u, 0.72));
  const dir = hash01(period + 0.37) < 0.5 ? -1 : 1;
  const strength = GUST_MIN + GUST_SPAN * hash01(period + 0.71);
  return shape * shape * dir * strength;       // 二乗で「たまに強く」を作る(弱い突風は目立たない)
};

/** 常時のうねり。`WIND_PHASE_SPREAD=0` の間は種に依らない(=世界で揃う)。 */
export const windSwellAt = (nowMs: number, seed = 0): number => {
  const p = seed * WIND_PHASE_SPREAD;
  let sum = 0;
  for (const w of WIND_SWELL) sum += w.amp * Math.sin(nowMs / w.periodMs + w.phase + p);
  return sum;
};

/**
 * いまの風(-1..1 くらい)。負=左へ / 正=右へ。**世界の強さ倍率が掛かった値**。
 * 描画側は**毎フレーム1回だけ**これを引いて、全部の揺れ物で使い回すこと(1本の風を守る)。
 */
export const windAt = (nowMs: number, seed = 0): number =>
  (windGustAt(nowMs) + windSwellAt(nowMs, seed)) * worldWindScale;

/** 突風が起きている最中か(演出の追加トリガ用)。 */
export const isGusting = (nowMs: number): boolean => windGustAt(nowMs) !== 0;
